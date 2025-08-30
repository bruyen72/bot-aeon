import makeWASocket, {
    ConnectionState,
    DisconnectReason,
    useMultiFileAuthState,
    WASocket,
    proto,
    Browsers,
    fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import P from 'pino';
import { rmSync } from 'fs';
import * as qrcode from 'qrcode-terminal';

export interface WhatsAppEvent {
    type: 'qr' | 'pairing_code' | 'connected' | 'disconnected' | 'error';
    data: any;
}

export class WhatsAppService {
    private sock: WASocket | null = null;
    private eventHandlers: ((event: WhatsAppEvent) => void)[] = [];
    private isConnecting = false;
    private logger = P({ level: 'silent' });
    
    public isOnline = false;
    public currentQR = '';
    public currentPairingCode = '';

    constructor() {
        this.cleanup();
    }

    private cleanup() {
        try {
            rmSync('./auth_info_baileys', { recursive: true, force: true });
        } catch (e) {
            // Ignore cleanup errors
        }
    }

    public onEvent(handler: (event: WhatsAppEvent) => void) {
        this.eventHandlers.push(handler);
    }

    private emit(event: WhatsAppEvent) {
        this.eventHandlers.forEach(handler => handler(event));
    }

    public async connectWithQR(): Promise<void> {
        if (this.isConnecting) return;
        
        this.isConnecting = true;
        this.cleanup();
        
        try {
            console.log('🚀 Iniciando conexão com QR Code...');
            
            const { version, isLatest } = await fetchLatestBaileysVersion();
            console.log(`📱 Usando Baileys v${version}, latest: ${isLatest}`);
            
            const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
            
            this.sock = makeWASocket({
                version,
                auth: state,
                logger: this.logger,
                printQRInTerminal: false, // Vamos controlar manualmente
                browser: ['Aeon Bot', 'Chrome', '120.0.0'],
                generateHighQualityLinkPreview: true,
                defaultQueryTimeoutMs: 60 * 1000
            });

            this.sock.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect, qr } = update;
                
                if (qr) {
                    console.log('📱 QR Code gerado:');
                    qrcode.generate(qr, { small: true });
                    this.currentQR = qr;
                    this.emit({ type: 'qr', data: qr });
                }

                if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                    console.log('❌ Conexão fechada:', lastDisconnect?.error);
                    
                    this.isOnline = false;
                    this.isConnecting = false;
                    this.currentQR = '';
                    this.emit({ type: 'disconnected', data: lastDisconnect });

                    if (shouldReconnect) {
                        console.log('🔄 Reconectando...');
                        setTimeout(() => this.connectWithQR(), 3000);
                    }
                } else if (connection === 'open') {
                    console.log('✅ Conectado ao WhatsApp com sucesso!');
                    this.isOnline = true;
                    this.isConnecting = false;
                    this.currentQR = '';
                    this.emit({ type: 'connected', data: null });
                }
            });

            this.sock.ev.on('creds.update', saveCreds);

        } catch (error) {
            console.error('❌ Erro ao conectar:', error);
            this.isConnecting = false;
            this.emit({ type: 'error', data: error });
        }
    }

    public async connectWithPairingCode(phoneNumber: string): Promise<void> {
        if (this.isConnecting) return;
        
        this.isConnecting = true;
        this.cleanup();
        
        try {
            console.log(`🚀 Iniciando conexão com código de pareamento para ${phoneNumber}...`);
            
            const { version, isLatest } = await fetchLatestBaileysVersion();
            console.log(`📱 Usando Baileys v${version}, latest: ${isLatest}`);
            
            const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
            
            this.sock = makeWASocket({
                version,
                auth: state,
                logger: this.logger,
                printQRInTerminal: false,
                browser: ['Aeon Bot', 'Chrome', '120.0.0'],
                generateHighQualityLinkPreview: true,
                defaultQueryTimeoutMs: 60 * 1000
            });

            if (!this.sock.authState.creds.registered) {
                const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
                console.log(`📞 Solicitando código de pareamento para: ${cleanPhone}`);
                
                const code = await this.sock.requestPairingCode(cleanPhone);
                console.log(`🔐 Código de pareamento: ${code}`);
                this.currentPairingCode = code;
                this.emit({ type: 'pairing_code', data: code });
            }

            this.sock.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                    console.log('❌ Conexão fechada:', lastDisconnect?.error);
                    
                    this.isOnline = false;
                    this.isConnecting = false;
                    this.currentPairingCode = '';
                    this.emit({ type: 'disconnected', data: lastDisconnect });

                    if (shouldReconnect) {
                        console.log('🔄 Reconectando...');
                        setTimeout(() => this.connectWithPairingCode(phoneNumber), 3000);
                    }
                } else if (connection === 'open') {
                    console.log('✅ Conectado ao WhatsApp com código de pareamento!');
                    this.isOnline = true;
                    this.isConnecting = false;
                    this.currentPairingCode = '';
                    this.emit({ type: 'connected', data: null });
                }
            });

            this.sock.ev.on('creds.update', saveCreds);

        } catch (error) {
            console.error('❌ Erro ao conectar:', error);
            this.isConnecting = false;
            this.emit({ type: 'error', data: error });
        }
    }

    public async disconnect(): Promise<void> {
        if (this.sock) {
            try {
                await this.sock.logout();
            } catch (e) {
                console.log('⚠️ Erro ao fazer logout:', e);
            }
            this.sock = null;
        }
        
        this.cleanup();
        this.isOnline = false;
        this.isConnecting = false;
        this.currentQR = '';
        this.currentPairingCode = '';
        
        console.log('🔌 Desconectado do WhatsApp');
        this.emit({ type: 'disconnected', data: null });
    }

    public getSocket(): WASocket | null {
        return this.sock;
    }
}