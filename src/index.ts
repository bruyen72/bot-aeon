import { Boom } from '@hapi/boom';
import makeWASocket, {
    ConnectionState,
    DisconnectReason,
    useMultiFileAuthState,
    WASocket,
    proto,
} from '@whiskeysockets/baileys';
import * as qrcode from 'qrcode-terminal';
import P from 'pino';
import { readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { handleInfoCommand } from './cmd/info';
import { handleInstagramCommand } from './cmd/ig';
import { handleTikTokCommand } from './cmd/tt';
import { handleStickerCommand } from './cmd/s';
import * as dotenv from 'dotenv';
dotenv.config();

interface StickerMessage {
    url?: string;
    fileSha256?: Uint8Array;
    fileEncSha256?: Uint8Array;
    mediaKey?: Uint8Array;
    mimetype?: string;
    height?: number;
    width?: number;
    directPath?: string;
    fileLength?: number;
    mediaKeyTimestamp?: number;
    isAnimated?: boolean;
}

interface ImageMessage {
    url?: string;
    mimetype?: string;
    fileSha256?: Uint8Array;
    fileLength?: number;
    height?: number;
    width?: number;
    mediaKey?: Uint8Array;
    fileEncSha256?: Uint8Array;
    directPath?: string;
    mediaKeyTimestamp?: number;
}

interface VideoMessage {
    url?: string;
    mimetype?: string;
    fileSha256?: Uint8Array;
    fileLength?: number;
    seconds?: number;
    mediaKey?: Uint8Array;
    fileEncSha256?: Uint8Array;
    directPath?: string;
    mediaKeyTimestamp?: number;
    gifPlayback?: boolean;
    height?: number;
    width?: number;
}

interface ViewOnceMessage {
    message?: {
        imageMessage?: ImageMessage;
        videoMessage?: VideoMessage;
        stickerMessage?: StickerMessage;
        messageContextInfo?: any;
    };
}

interface ExtendedTextMessage {
    text: string;
    contextInfo?: {
        quotedMessage?: {
            imageMessage?: ImageMessage;
            videoMessage?: VideoMessage;
            stickerMessage?: StickerMessage;
            viewOnceMessage?: ViewOnceMessage;
            viewOnceMessageV2?: ViewOnceMessage;
            viewOnceMessageV2Extension?: ViewOnceMessage;
        };
    };
}

export interface ExtendedWebMessageInfo {
    key: {
        remoteJid: string;
        fromMe: boolean;
        id: string;
    };
    message?: {
        conversation?: string;
        extendedTextMessage?: ExtendedTextMessage;
        imageMessage?: ImageMessage;
        videoMessage?: VideoMessage;
        stickerMessage?: StickerMessage;
    };
    messageTimestamp?: number;
}

const logger = P({
    timestamp: () => `,"time":"${new Date().toJSON()}"`,
    level: 'silent',
}).child({});

logger.level = 'silent';

export class WhatsAppBot {
    private sock: WASocket | null = null;
    private processedMessages = new Set<string>();
    private messageCleanupInterval: NodeJS.Timeout | null = null;
    private myNumber: string = '';
    private aeonImage: Buffer | null = null;
    private currentQR: string = '';
    private notifiedConnected: boolean = false;
    private qrTimeout: NodeJS.Timeout | null = null;

    constructor() {
        this.loadAeonImage();
    }

    private loadAeonImage(): void {
        try {
            const imagePath = join(__dirname, 'img', 'aeon.jpeg');
            this.aeonImage = readFileSync(imagePath);
        } catch (error) {
            this.aeonImage = null;
            console.error('Erro ao carregar imagem aeon.jpeg:', error);
        }
    }

    getCurrentQR(): string {
        return this.currentQR;
    }

    async start(): Promise<void> {
        try {
            console.log('Iniciando WhatsAppBot...');
            await this.deleteAuthInfo();
            const { state, saveCreds } = await useMultiFileAuthState('/tmp/info');

            this.sock = makeWASocket({
                auth: state,
                printQRInTerminal: true,
                logger,
                browser: ['Aeon', 'Chrome', '1.0.0'],
                defaultQueryTimeoutMs: 60000,
                syncFullHistory: false, // Evita sincronização pesada para conexões mais rápidas
                connectTimeoutMs: 30000, // Timeout de conexão de 30 segundos
                keepAliveIntervalMs: 10000, // Mantém conexão ativa
            });

            this.setupEventListeners(saveCreds);
        } catch (error: any) {
            console.error('Erro ao iniciar bot:', error);
            setTimeout(() => this.start(), 5000);
        }
    }

    async deleteAuthInfo(): Promise<void> {
        try {
            console.log('Apagando pasta de autenticação /tmp/info...');
            rmSync('/tmp/info', { recursive: true, force: true });
            console.log('Pasta /tmp/info apagada com sucesso');
            this.sock = null;
            this.currentQR = '';
            this.notifiedConnected = false;
            if (this.qrTimeout) {
                clearTimeout(this.qrTimeout);
                this.qrTimeout = null;
            }
        } catch (error: any) {
            console.error('Erro ao apagar pasta /tmp/info:', error);
            throw error;
        }
    }

    private setupEventListeners(saveCreds: () => Promise<void>): void {
        if (!this.sock) return;

        this.sock.ev.on('connection.update', (update: Partial<ConnectionState>) => {
            this.handleConnectionUpdate(update);
        });

        this.sock.ev.on('creds.update', saveCreds);

        this.sock.ev.on('messages.upsert', async (m: { messages: proto.IWebMessageInfo[]; type: 'append' | 'notify' }) => {
            await this.handleMessages(m);
        });
    }

    private handleConnectionUpdate(update: Partial<ConnectionState>): void {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            this.currentQR = qr;
            console.log(`QR_CODE:${qr}`);
            this.displayQR(qr);
            // Configura timeout para QR code expirar após 20 segundos
            if (this.qrTimeout) clearTimeout(this.qrTimeout);
            this.qrTimeout = setTimeout(() => {
                if (this.currentQR === qr && !this.notifiedConnected) {
                    console.log('QR_CODE_EXPIRED: O QR code expirou, gerando novo...');
                    this.start();
                }
            }, 20000);
        }

        if (connection === 'close') {
            this.handleDisconnection(lastDisconnect);
            this.notifiedConnected = false;
            console.log('BOT_STATUS: offline');
        } else if (connection === 'open') {
            this.handleSuccessfulConnection();
            if (!this.notifiedConnected) {
                this.notifiedConnected = true;
            }
            console.log('BOT_STATUS: online');
            if (this.qrTimeout) {
                clearTimeout(this.qrTimeout);
                this.qrTimeout = null;
            }
        }
    }

    private handleDisconnection(lastDisconnect?: { error?: Boom | Error }): void {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
            setTimeout(() => this.start(), 3000);
        } else {
            this.start();
        }
    }

    private handleSuccessfulConnection(): void {
        if (this.sock?.user?.id) {
            this.myNumber = this.sock.user.id.split(':')[0] + '@s.whatsapp.net';
        }

        this.startMessageCleanup();
    }

    private displayQR(qr: string): void {
        qrcode.generate(qr, { small: true }, (qrString: string) => {
            console.log(qrString);
            console.log('🔗 Abra o WhatsApp e escaneie o código QR');
            console.log('⏱️ QR code válido por 20 segundos...');
        });
    }

    private startMessageCleanup(): void {
        if (this.messageCleanupInterval) {
            clearInterval(this.messageCleanupInterval);
        }

        this.messageCleanupInterval = setInterval(() => {
            const size = this.processedMessages.size;
            if (size > 1000) {
                this.processedMessages.clear();
            }
        }, 300000);
    }

    private async handleMessages(m: { messages: proto.IWebMessageInfo[]; type: 'append' | 'notify' }): Promise<void> {
        try {
            if (!m.messages || m.messages.length === 0) return;

            const msg = m.messages[0];
            if (!this.isValidMessage(msg)) return;

            const messageId = this.generateMessageId(msg);
            if (this.processedMessages.has(messageId)) return;

            this.processedMessages.add(messageId);

            const messageText = this.extractMessageText(msg);
            if (!messageText.trim()) return;

            await this.processCommand(msg, messageText);
        } catch (error: any) {
            console.error('Erro ao processar mensagem:', error);
        }
    }

    private isValidMessage(msg: proto.IWebMessageInfo): boolean {
        return !!msg.message && msg.key.remoteJid !== 'status@broadcast';
    }

    private generateMessageId(msg: proto.IWebMessageInfo): string {
        return `${msg.key.remoteJid}_${msg.key.id}_${msg.messageTimestamp}`;
    }

    private extractMessageText(msg: proto.IWebMessageInfo): string {
        return msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    }

    private async processCommand(msg: proto.IWebMessageInfo, messageText: string): Promise<void> {
        const extendedMsg = msg as ExtendedWebMessageInfo;

        const commands: { [key: string]: () => Promise<void> } = {
            '/start': () => {
                return this.showWelcome(msg.key.remoteJid!, msg.pushName || 'usuário');
            },
            '/info': () => {
                return handleInfoCommand(this.sock!, msg, this.sendMessage.bind(this));
            },
            '/ig ': () => {
                return handleInstagramCommand(this.sock!, msg, this.sendMessage.bind(this));
            },
            '/tt ': () => {
                return handleTikTokCommand(this.sock!, msg, this.sendMessage.bind(this));
            },
            '/s': () => {
                return handleStickerCommand(this.sock!, extendedMsg, this.sendMessage.bind(this));
            },
        };

        for (const [prefix, handler] of Object.entries(commands)) {
            if (messageText.startsWith(prefix) || messageText === prefix.trim()) {
                await handler();
                break;
            }
        }
    }

    private async showWelcome(chatId: string, userName: string): Promise<void> {
        const welcomeText =
            `*SEJA BEM-VINDO(A)*\n\n` +
            `ツ *Olá, ${userName}!*\n\n` +
            `📋 *Sobre o Aeon:*\n` +
            `╰┈➤ _Poderoso e flexível, projetado para automação e gerenciamento aprimorado de grupos._\n\n` +
            `🛠️ *Comando disponível*\n` +
            `╰┈➤ Digite */info* para ver os comandos`;

        if (this.aeonImage) {
            try {
                await this.sendImage(chatId, this.aeonImage, 'aeon.jpeg', welcomeText);
                return;
            } catch (error: any) {
                console.error('Erro ao enviar imagem:', error);
            }
        }

        await this.sendMessage(chatId, welcomeText);
    }

    private async sendMessage(chatId: string, text: string): Promise<void> {
        try {
            if (!this.sock) {
                throw new Error('Socket não conectado');
            }

            await this.sock.sendMessage(chatId, { text });
        } catch (error: any) {
            console.error('Erro ao enviar mensagem:', error);
        }
    }

    private async sendImage(chatId: string, imageBuffer: Buffer, filename: string, caption: string): Promise<void> {
        try {
            if (!this.sock) {
                throw new Error('Socket não conectado');
            }

            await this.sock.sendMessage(chatId, {
                image: imageBuffer,
                caption: caption,
                fileName: filename,
                mimetype: 'image/jpeg',
            });
        } catch (error: any) {
            console.error('Erro ao enviar imagem:', error);
        }
    }

    async sendCommandToSelf(command: string): Promise<void> {
        if (this.myNumber) {
            await this.sendMessage(this.myNumber, command);
        } else {
            console.error('Número do bot não disponível');
        }
    }
}

const bot = new WhatsAppBot();

process.on('uncaughtException', (error: Error) => {
    console.error('Exceção não capturada:', error);
    setTimeout(() => bot.start(), 3000);
});

process.on('unhandledRejection', (error: Error) => {
    console.error('Rejeição não tratada:', error);
});

bot.start().catch((error: Error) => {
    console.error('Erro ao iniciar bot:', error);
});