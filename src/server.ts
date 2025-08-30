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
    proto,
} from '@whiskeysockets/baileys';
import P from 'pino';
import { rmSync } from 'fs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Servir o index.html na rota principal
app.get('/', (req, res) => {
    res.sendFile(join(__dirname, '..', 'index.html'));
});

// Estado do bot WhatsApp
let currentQR = '';
let botOnline = false;
let sock: WASocket | null = null;
let isConnecting = false;

// Logger silencioso
const logger = P({ level: 'silent' });

// Função para inicializar o bot WhatsApp
async function startWhatsAppBot(): Promise<{ qr?: string; online: boolean }> {
    if (isConnecting) {
        return { online: botOnline, qr: currentQR };
    }

    isConnecting = true;
    
    try {
        // Limpar sessão anterior
        try {
            rmSync('./auth_info_baileys', { recursive: true, force: true });
        } catch (e) {}

        const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
        
        sock = makeWASocket({
            auth: state,
            logger,
            printQRInTerminal: false
        });

        return new Promise((resolve) => {
            if (!sock) {
                isConnecting = false;
                resolve({ online: false });
                return;
            }

            let resolved = false;

            sock.ev.on('connection.update', (update: Partial<ConnectionState>) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr && !resolved) {
                    currentQR = qr;
                    botOnline = false;
                    resolved = true;
                    isConnecting = false;
                    resolve({ qr, online: false });
                }

                if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                    botOnline = false;
                    currentQR = '';
                    
                    if (!resolved) {
                        resolved = true;
                        isConnecting = false;
                        resolve({ online: false });
                    }
                } else if (connection === 'open') {
                    botOnline = true;
                    currentQR = '';
                    
                    if (!resolved) {
                        resolved = true;
                        isConnecting = false;
                        resolve({ online: true });
                    }
                }
            });

            sock.ev.on('creds.update', saveCreds);

            // Timeout de segurança
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    isConnecting = false;
                    resolve({ online: botOnline, qr: currentQR });
                }
            }, 30000);
        });
    } catch (error) {
        console.error('Erro ao iniciar bot:', error);
        isConnecting = false;
        return { online: false };
    }
}

// Função para desconectar o bot
async function disconnectWhatsAppBot(): Promise<void> {
    if (sock) {
        try {
            await sock.logout();
        } catch (e) {}
        sock = null;
    }
    
    try {
        rmSync('./auth_info_baileys', { recursive: true, force: true });
    } catch (e) {}
    
    botOnline = false;
    currentQR = '';
    isConnecting = false;
}

app.post('/api/start-bot', async (req, res) => {
    const { action } = req.body;
    
    try {
        if (action === 'start') {
            const result = await startWhatsAppBot();
            
            res.json({
                message: result.online ? 'Bot conectado com sucesso!' : 'QR code gerado - Escaneie para conectar',
                online: result.online,
                qr: result.qr
            });
        } else if (action === 'disconnect') {
            await disconnectWhatsAppBot();
            
            res.json({
                message: 'Bot desconectado com sucesso',
                online: false
            });
        } else {
            res.status(400).json({
                message: 'Ação inválida'
            });
        }
    } catch (error) {
        console.error('Erro na API:', error);
        res.status(500).json({
            message: 'Erro interno do servidor',
            online: false
        });
    }
});

app.get('/api/status', (req, res) => {
    res.json({
        message: botOnline ? 'Bot está online' : 'Bot está offline',
        online: botOnline,
        qr: currentQR
    });
});

// Servir arquivos TypeScript compilados
app.get('/src/site.js', (req, res) => {
    res.sendFile(join(__dirname, 'site.js'));
});

app.listen(PORT, () => {
    console.log(`🌐 Servidor web rodando em http://localhost:${PORT}`);
    console.log(`🚀 Interface do bot disponível na URL acima`);
});