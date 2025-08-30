import express from 'express';
import cors from 'cors';
import { join } from 'path';
import * as dotenv from 'dotenv';
import { Boom } from '@hapi/boom';
import makeWASocket, {
    ConnectionState,
    DisconnectReason,
    useMultiFileAuthState,
    WASocket,
    fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import P from 'pino';
import { rmSync } from 'fs';
import * as qrcode from 'qrcode-terminal';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Estado do WhatsApp
let sock: WASocket | null = null;
let isConnecting = false;
let currentQR = '';
let currentPairingCode = '';
let isOnline = false;

const logger = P({ level: 'silent' });

// Função para limpar sessão
function cleanup() {
    try {
        rmSync('./auth_info_baileys', { recursive: true, force: true });
        console.log('🧹 Sessão limpa');
    } catch (e) {
        // Ignore
    }
}

// Função para conectar com QR
async function connectWithQR(): Promise<{ success: boolean; message: string; qr?: string }> {
    if (isConnecting) {
        console.log('⚠️ Conexão já em andamento, aguarde...');
        return { success: false, message: 'Já está conectando...' };
    }

    if (isOnline) {
        console.log('✅ Bot já está conectado!');
        return { success: true, message: 'Bot já está conectado!' };
    }

    isConnecting = true;
    console.log('🧹 Limpando sessão anterior...');
    cleanup();

    try {
        console.log('🚀 Iniciando conexão com QR...');
        console.log('📦 Carregando versão mais recente do Baileys...');
        
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`📱 Baileys v${version} ${isLatest ? '(latest)' : '(not latest)'}`);
        
        console.log('🔐 Carregando estado de autenticação...');
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
        
        console.log('🌐 Criando socket WhatsApp...');
        sock = makeWASocket({
            version,
            auth: state,
            logger,
            printQRInTerminal: false,
            browser: ['Aeon Bot', 'Chrome', '120.0.0'],
            connectTimeoutMs: 60_000,
            defaultQueryTimeoutMs: 20_000,
            keepAliveIntervalMs: 10_000,
            retryRequestDelayMs: 250,
            maxMsgRetryCount: 3,
            generateHighQualityLinkPreview: false
        });

        console.log('👂 Configurando listeners de conexão...');

        return new Promise((resolve) => {
            let resolved = false;
            let connectionAttempts = 0;

            sock!.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect, qr, isNewLogin } = update;
                connectionAttempts++;

                console.log(`🔄 Update de conexão #${connectionAttempts}:`, {
                    connection,
                    isNewLogin,
                    hasQR: !!qr,
                    lastDisconnect: lastDisconnect?.error?.message
                });

                if (qr && !resolved) {
                    console.log('📱 QR Code gerado e exibindo no terminal:');
                    console.log('🔗 Abra WhatsApp → Menu → Dispositivos conectados → Conectar dispositivo');
                    qrcode.generate(qr, { small: true });
                    
                    currentQR = qr;
                    resolved = true;
                    isConnecting = false;
                    resolve({ success: true, message: 'QR code gerado - Escaneie rapidamente!', qr });
                }

                if (connection === 'connecting') {
                    console.log('⏳ Estabelecendo conexão com WhatsApp...');
                }

                if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                    console.log('❌ Conexão fechada. Motivo:', lastDisconnect?.error?.message);
                    console.log('🔄 Deve reconectar?', shouldReconnect);
                    
                    isOnline = false;
                    isConnecting = false;
                    currentQR = '';
                    
                    if (!resolved) {
                        resolved = true;
                        resolve({ success: false, message: `Conexão fechada: ${lastDisconnect?.error?.message}` });
                    }
                } else if (connection === 'open') {
                    console.log('🎉 CONECTADO COM SUCESSO AO WHATSAPP!');
                    console.log('📱 Bot está online e pronto para uso');
                    isOnline = true;
                    isConnecting = false;
                    currentQR = '';
                    
                    if (!resolved) {
                        resolved = true;
                        resolve({ success: true, message: 'Conectado com sucesso!' });
                    }
                }
            });

            sock!.ev.on('creds.update', () => {
                console.log('🔑 Credenciais atualizadas e salvas');
                saveCreds();
            });

            // Timeout reduzido para ser mais rápido
            setTimeout(() => {
                if (!resolved) {
                    console.log('⏰ Timeout atingido na conexão');
                    resolved = true;
                    isConnecting = false;
                    resolve({ success: false, message: 'Timeout - Tente novamente' });
                }
            }, 45000);
        });

    } catch (error: any) {
        console.error('❌ Erro crítico na conexão:', error);
        isConnecting = false;
        return { success: false, message: `Erro: ${error.message}` };
    }
}

// Função para conectar with código de pareamento
async function connectWithPairing(phoneNumber: string): Promise<{ success: boolean; message: string; pairingCode?: string }> {
    if (isConnecting) {
        console.log('⚠️ Conexão já em andamento, aguarde...');
        return { success: false, message: 'Já está conectando...' };
    }

    if (isOnline) {
        console.log('✅ Bot já está conectado!');
        return { success: true, message: 'Bot já está conectado!' };
    }

    isConnecting = true;
    console.log('🧹 Limpando sessão anterior...');
    cleanup();

    try {
        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
        console.log(`🚀 Iniciando conexão com código de pareamento...`);
        console.log(`📞 Número: ${cleanPhone}`);
        console.log('📦 Carregando versão mais recente do Baileys...');
        
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`📱 Baileys v${version} ${isLatest ? '(latest)' : '(not latest)'}`);
        
        console.log('🔐 Carregando estado de autenticação...');
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
        
        console.log('🌐 Criando socket WhatsApp otimizado...');
        sock = makeWASocket({
            version,
            auth: state,
            logger,
            printQRInTerminal: false,
            browser: ['Aeon Bot', 'Chrome', '120.0.0'],
            connectTimeoutMs: 60_000,
            defaultQueryTimeoutMs: 15_000,
            keepAliveIntervalMs: 10_000,
            retryRequestDelayMs: 250,
            maxMsgRetryCount: 2,
            generateHighQualityLinkPreview: false
        });

        console.log('🔢 Verificando se precisa de código de pareamento...');
        if (!sock.authState.creds.registered) {
            console.log('📲 Solicitando código de pareamento...');
            const code = await sock.requestPairingCode(cleanPhone);
            console.log(`🔐 CÓDIGO GERADO: ${code}`);
            console.log('📱 Abra WhatsApp → Menu → Dispositivos conectados → Digite o código');
            currentPairingCode = code;
        }

        console.log('👂 Configurando listeners de conexão...');

        return new Promise((resolve) => {
            let resolved = false;
            let connectionAttempts = 0;

            sock!.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect, isNewLogin } = update;
                connectionAttempts++;

                console.log(`🔄 Update conexão pairing #${connectionAttempts}:`, {
                    connection,
                    isNewLogin,
                    lastDisconnect: lastDisconnect?.error?.message
                });

                if (connection === 'connecting') {
                    console.log('⏳ Estabelecendo conexão via código de pareamento...');
                }

                if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                    console.log('❌ Conexão fechada. Motivo:', lastDisconnect?.error?.message);
                    console.log('🔄 Deve reconectar?', shouldReconnect);
                    
                    isOnline = false;
                    isConnecting = false;
                    currentPairingCode = '';
                    
                    if (!resolved) {
                        resolved = true;
                        resolve({ success: false, message: `Conexão fechada: ${lastDisconnect?.error?.message}` });
                    }
                } else if (connection === 'open') {
                    console.log('🎉 CONECTADO COM SUCESSO VIA CÓDIGO!');
                    console.log('📱 Bot está online e pronto para uso');
                    isOnline = true;
                    isConnecting = false;
                    currentPairingCode = '';
                    
                    if (!resolved) {
                        resolved = true;
                        resolve({ success: true, message: 'Conectado com sucesso!' });
                    }
                }
            });

            sock!.ev.on('creds.update', () => {
                console.log('🔑 Credenciais atualizadas e salvas');
                saveCreds();
            });

            // Retorna o código imediatamente se gerado
            if (currentPairingCode && !resolved) {
                console.log('✅ Retornando código de pareamento para interface');
                resolved = true;
                isConnecting = false;
                resolve({ success: true, message: 'Código gerado - Digite no WhatsApp!', pairingCode: currentPairingCode });
            }

            // Timeout reduzido
            setTimeout(() => {
                if (!resolved) {
                    console.log('⏰ Timeout atingido no pareamento');
                    resolved = true;
                    isConnecting = false;
                    resolve({ success: false, message: 'Timeout - Tente novamente' });
                }
            }, 30000);
        });

    } catch (error: any) {
        console.error('❌ Erro crítico no pareamento:', error);
        isConnecting = false;
        return { success: false, message: `Erro: ${error.message}` };
    }
}

// Função para desconectar
async function disconnect(): Promise<{ success: boolean; message: string }> {
    try {
        if (sock) {
            await sock.logout();
            sock = null;
        }
        cleanup();
        isOnline = false;
        isConnecting = false;
        currentQR = '';
        currentPairingCode = '';
        console.log('🔌 Desconectado');
        return { success: true, message: 'Desconectado com sucesso' };
    } catch (error) {
        console.error('❌ Erro ao desconectar:', error);
        return { success: false, message: 'Erro ao desconectar' };
    }
}

// Rotas
app.get('/', (req, res) => {
    res.sendFile(join(__dirname, '..', 'index.html'));
});

app.post('/api/connect-qr', async (req, res) => {
    try {
        const result = await connectWithQR();
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/connect-pairing', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) {
            return res.status(400).json({ success: false, message: 'Número obrigatório' });
        }
        
        const result = await connectWithPairing(phoneNumber);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/disconnect', async (req, res) => {
    try {
        const result = await disconnect();
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/status', (req, res) => {
    res.json({
        online: isOnline,
        connecting: isConnecting,
        qr: currentQR,
        pairingCode: currentPairingCode,
        message: isOnline ? 'Conectado' : 'Desconectado'
    });
});

app.get('/src/site.js', (req, res) => {
    res.sendFile(join(__dirname, 'site.js'));
});

app.listen(PORT, () => {
    console.log(`🌐 Servidor rodando em http://localhost:${PORT}`);
    console.log(`📱 Interface disponível na URL acima`);
});