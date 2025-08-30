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
        return { success: false, message: 'Já está conectando...' };
    }

    isConnecting = true;
    cleanup();

    try {
        console.log('🚀 Iniciando conexão com QR...');
        
        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
        
        sock = makeWASocket({
            version,
            auth: state,
            logger,
            printQRInTerminal: false,
            browser: ['Aeon Bot', 'Chrome', '120.0.0']
        });

        return new Promise((resolve) => {
            let resolved = false;

            sock!.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr && !resolved) {
                    console.log('📱 QR Code gerado:');
                    qrcode.generate(qr, { small: true });
                    
                    currentQR = qr;
                    resolved = true;
                    isConnecting = false;
                    resolve({ success: true, message: 'QR code gerado com sucesso', qr });
                }

                if (connection === 'close') {
                    console.log('❌ Conexão fechada');
                    isOnline = false;
                    isConnecting = false;
                    currentQR = '';
                    
                    if (!resolved) {
                        resolved = true;
                        resolve({ success: false, message: 'Falha na conexão' });
                    }
                } else if (connection === 'open') {
                    console.log('✅ Conectado ao WhatsApp!');
                    isOnline = true;
                    isConnecting = false;
                    currentQR = '';
                    
                    if (!resolved) {
                        resolved = true;
                        resolve({ success: true, message: 'Conectado com sucesso!' });
                    }
                }
            });

            sock!.ev.on('creds.update', saveCreds);

            // Timeout
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    isConnecting = false;
                    resolve({ success: false, message: 'Timeout na conexão' });
                }
            }, 30000);
        });

    } catch (error) {
        console.error('❌ Erro:', error);
        isConnecting = false;
        return { success: false, message: `Erro: ${error}` };
    }
}

// Função para conectar com código de pareamento
async function connectWithPairing(phoneNumber: string): Promise<{ success: boolean; message: string; pairingCode?: string }> {
    if (isConnecting) {
        return { success: false, message: 'Já está conectando...' };
    }

    isConnecting = true;
    cleanup();

    try {
        console.log(`🚀 Iniciando conexão com código para ${phoneNumber}...`);
        
        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
        
        sock = makeWASocket({
            version,
            auth: state,
            logger,
            printQRInTerminal: false,
            browser: ['Aeon Bot', 'Chrome', '120.0.0']
        });

        if (!sock.authState.creds.registered) {
            const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
            const code = await sock.requestPairingCode(cleanPhone);
            console.log(`🔐 Código de pareamento: ${code}`);
            currentPairingCode = code;
        }

        return new Promise((resolve) => {
            let resolved = false;

            sock!.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'close') {
                    console.log('❌ Conexão fechada');
                    isOnline = false;
                    isConnecting = false;
                    currentPairingCode = '';
                    
                    if (!resolved) {
                        resolved = true;
                        resolve({ success: false, message: 'Falha na conexão' });
                    }
                } else if (connection === 'open') {
                    console.log('✅ Conectado ao WhatsApp!');
                    isOnline = true;
                    isConnecting = false;
                    currentPairingCode = '';
                    
                    if (!resolved) {
                        resolved = true;
                        resolve({ success: true, message: 'Conectado com sucesso!' });
                    }
                }
            });

            sock!.ev.on('creds.update', saveCreds);

            // Retorna o código imediatamente se gerado
            if (currentPairingCode && !resolved) {
                resolved = true;
                isConnecting = false;
                resolve({ success: true, message: 'Código de pareamento gerado', pairingCode: currentPairingCode });
            }

            // Timeout
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    isConnecting = false;
                    resolve({ success: false, message: 'Timeout na conexão' });
                }
            }, 30000);
        });

    } catch (error) {
        console.error('❌ Erro:', error);
        isConnecting = false;
        return { success: false, message: `Erro: ${error}` };
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