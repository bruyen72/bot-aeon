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
    console.log('Iniciando bot WhatsApp...');
    
    // Se já conectado, retorna status
    if (botOnline && sock) {
        console.log('Bot já está conectado');
        return { online: true };
    }

    // Se já está conectando, aguarda
    if (isConnecting) {
        console.log('Bot já está conectando...');
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (!isConnecting) {
                    clearInterval(checkInterval);
                    resolve({ online: botOnline, qr: currentQR });
                }
            }, 1000);
        });
    }

    isConnecting = true;
    
    try {
        // Limpar sessão anterior para forçar novo QR
        try {
            rmSync('./auth_info_baileys', { recursive: true, force: true });
            console.log('Sessão anterior limpa');
        } catch (e) {
            console.log('Nenhuma sessão anterior para limpar');
        }

        const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
        console.log('Estado de autenticação carregado');
        
        sock = makeWASocket({
            auth: state,
            logger,
            printQRInTerminal: true,
            browser: ['Aeon Bot', 'Chrome', '110.0.0']
        });

        console.log('Socket WhatsApp criado');

        return new Promise((resolve) => {
            if (!sock) {
                console.log('Erro: Socket não foi criado');
                isConnecting = false;
                resolve({ online: false });
                return;
            }

            let resolved = false;

            sock.ev.on('connection.update', (update: Partial<ConnectionState>) => {
                console.log('Update de conexão:', update);
                const { connection, lastDisconnect, qr } = update;

                if (qr && !resolved) {
                    console.log('QR code recebido:', qr.substring(0, 50) + '...');
                    currentQR = qr;
                    botOnline = false;
                    resolved = true;
                    isConnecting = false;
                    resolve({ qr, online: false });
                }

                if (connection === 'close') {
                    console.log('Conexão fechada:', lastDisconnect);
                    botOnline = false;
                    currentQR = '';
                    
                    if (!resolved) {
                        resolved = true;
                        isConnecting = false;
                        resolve({ online: false });
                    }
                } else if (connection === 'open') {
                    console.log('Conexão estabelecida com sucesso!');
                    botOnline = true;
                    currentQR = '';
                    
                    if (!resolved) {
                        resolved = true;
                        isConnecting = false;
                        resolve({ online: true });
                    }
                }
            });

            sock.ev.on('creds.update', (creds) => {
                console.log('Credenciais atualizadas');
                saveCreds();
            });

            // Timeout de segurança aumentado
            setTimeout(() => {
                if (!resolved) {
                    console.log('Timeout atingido, resolvendo com estado atual');
                    resolved = true;
                    isConnecting = false;
                    resolve({ online: botOnline, qr: currentQR });
                }
            }, 45000);
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