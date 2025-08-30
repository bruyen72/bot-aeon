import express from 'express';
import cors from 'cors';
import { join } from 'path';
import * as dotenv from 'dotenv';
import { WhatsAppService, WhatsAppEvent } from './whatsapp-service';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// WhatsApp Service
const whatsappService = new WhatsAppService();

// Estado atual
let currentStatus = {
    online: false,
    qr: '',
    pairingCode: '',
    message: 'Bot desconectado'
};

// Event handlers para o WhatsApp
whatsappService.onEvent((event: WhatsAppEvent) => {
    switch (event.type) {
        case 'qr':
            currentStatus.qr = event.data;
            currentStatus.pairingCode = '';
            currentStatus.message = 'QR code gerado - Escaneie para conectar';
            console.log('🔄 QR Code atualizado');
            break;
            
        case 'pairing_code':
            currentStatus.pairingCode = event.data;
            currentStatus.qr = '';
            currentStatus.message = `Código de pareamento: ${event.data}`;
            console.log(`🔐 Código de pareamento gerado: ${event.data}`);
            break;
            
        case 'connected':
            currentStatus.online = true;
            currentStatus.qr = '';
            currentStatus.pairingCode = '';
            currentStatus.message = 'Bot conectado com sucesso!';
            console.log('✅ WhatsApp conectado');
            break;
            
        case 'disconnected':
            currentStatus.online = false;
            currentStatus.qr = '';
            currentStatus.pairingCode = '';
            currentStatus.message = 'Bot desconectado';
            console.log('❌ WhatsApp desconectado');
            break;
            
        case 'error':
            currentStatus.message = `Erro: ${event.data.message || 'Erro desconhecido'}`;
            console.error('❌ Erro no WhatsApp:', event.data);
            break;
    }
});

// Servir o index.html na rota principal
app.get('/', (req, res) => {
    res.sendFile(join(__dirname, '..', 'index.html'));
});

// API endpoint para iniciar bot com QR code
app.post('/api/start-qr', async (req, res) => {
    try {
        console.log('🔄 Iniciando bot com QR code...');
        await whatsappService.connectWithQR();
        
        res.json({
            message: 'Iniciando conexão com QR code...',
            online: false,
            type: 'qr'
        });
    } catch (error: any) {
        console.error('❌ Erro ao iniciar com QR:', error);
        res.status(500).json({
            message: 'Erro ao iniciar bot',
            online: false,
            error: error.message
        });
    }
});

// API endpoint para iniciar bot com pairing code
app.post('/api/start-pairing', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        
        if (!phoneNumber) {
            return res.status(400).json({
                message: 'Número de telefone é obrigatório',
                online: false
            });
        }
        
        console.log(`🔄 Iniciando bot com código de pareamento para ${phoneNumber}...`);
        await whatsappService.connectWithPairingCode(phoneNumber);
        
        res.json({
            message: 'Gerando código de pareamento...',
            online: false,
            type: 'pairing'
        });
    } catch (error: any) {
        console.error('❌ Erro ao iniciar com pairing code:', error);
        res.status(500).json({
            message: 'Erro ao iniciar bot',
            online: false,
            error: error.message
        });
    }
});

// API endpoint para desconectar bot
app.post('/api/disconnect', async (req, res) => {
    try {
        console.log('🔌 Desconectando bot...');
        await whatsappService.disconnect();
        
        res.json({
            message: 'Bot desconectado com sucesso',
            online: false
        });
    } catch (error: any) {
        console.error('❌ Erro ao desconectar:', error);
        res.status(500).json({
            message: 'Erro ao desconectar bot',
            online: false,
            error: error.message
        });
    }
});

// API endpoint para obter status atual
app.get('/api/status', (req, res) => {
    const status = {
        ...currentStatus,
        online: whatsappService.isOnline,
        qr: whatsappService.currentQR,
        pairingCode: whatsappService.currentPairingCode
    };
    
    res.json(status);
});

// Servir arquivos compilados
app.get('/src/site.js', (req, res) => {
    res.sendFile(join(__dirname, 'site.js'));
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        whatsapp: whatsappService.isOnline ? 'connected' : 'disconnected'
    });
});

app.listen(PORT, () => {
    console.log(`🌐 Servidor rodando em http://localhost:${PORT}`);
    console.log(`📱 Interface do bot disponível na URL acima`);
    console.log(`✨ Recursos disponíveis:`);
    console.log(`   - QR Code (escaneie no WhatsApp)`);
    console.log(`   - Código de pareamento (digite no WhatsApp)`);
    console.log(`   - Reconexão automática`);
});