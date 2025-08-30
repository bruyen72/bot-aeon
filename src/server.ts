import express from 'express';
import cors from 'cors';
import { join } from 'path';
import * as dotenv from 'dotenv';

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

// API endpoints para o bot
let currentQR = '';
let botOnline = false;

app.post('/api/start-bot', (req, res) => {
    const { action } = req.body;
    
    if (action === 'start') {
        // Simular QR code para teste
        currentQR = 'QR_CODE_EXAMPLE_12345';
        botOnline = false;
        
        res.json({
            message: 'Bot iniciado com sucesso',
            online: botOnline,
            qr: currentQR
        });
    } else if (action === 'disconnect') {
        currentQR = '';
        botOnline = false;
        
        res.json({
            message: 'Bot desconectado com sucesso',
            online: botOnline
        });
    } else {
        res.status(400).json({
            message: 'Ação inválida'
        });
    }
});

app.get('/api/status', (req, res) => {
    res.json({
        message: 'Status atual do bot',
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