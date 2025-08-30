import { WhatsAppBot } from '../src/index';

let bot: WhatsAppBot | null = null;
let botStatus: 'online' | 'offline' = 'offline';
let currentQR: string = '';

export default async function handler(req: any, res: any) {
  console.log(`[SERVER] Recebida requisição: ${req.method} ${req.url}`);
  console.log(`[SERVER] Headers: ${JSON.stringify(req.headers)}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    console.log('[SERVER] Respondendo a requisição OPTIONS');
    return res.status(200).end();
  }

  if (req.method === 'POST' && req.url.includes('/start-bot')) {
    const { action } = req.body || {};

    if (action === 'disconnect') {
      try {
        console.log('[SERVER] Solicitação para desconectar bot...');
        if (bot) {
          await bot.deleteAuthInfo();
          bot = null;
          botStatus = 'offline';
          currentQR = '';
          console.log('[SERVER] Bot desconectado e pasta /tmp/info apagada');
          return res.status(200).json({
            message: 'Bot desconectado com sucesso',
            online: false,
            qr: '',
            timestamp: Date.now(),
          });
        } else {
          console.log('[SERVER] Bot não está rodando');
          return res.status(200).json({
            message: 'Bot não está rodando',
            online: false,
            qr: '',
            timestamp: Date.now(),
          });
        }
      } catch (error: any) {
        console.error('[SERVER] Erro ao desconectar bot:', error.stack || error.message);
        return res.status(500).json({ error: `Falha ao desconectar bot: ${error.message}` });
      }
    }

    if (bot) {
      console.log('[SERVER] Bot já está rodando, retornando status atual');
      return res.status(200).json({
        message: 'Bot já está rodando',
        online: botStatus === 'online',
        qr: bot.getCurrentQR(),
        timestamp: Date.now(),
      });
    }

    try {
      console.log('[SERVER] Iniciando bot via /start-bot...');
      bot = new WhatsAppBot();

      // Aguardar a inicialização do bot
      await bot.start();

      // Aguardar até 5 segundos para garantir que o QR code seja gerado
      await new Promise(resolve => setTimeout(resolve, 5000));
      currentQR = bot.getCurrentQR();

      console.log('[SERVER] Bot iniciado com sucesso no servidor');
      return res.status(200).json({
        message: 'Bot iniciado com sucesso',
        online: botStatus === 'online',
        qr: currentQR,
        timestamp: Date.now(),
      });
    } catch (error: any) {
      console.error('[SERVER] Erro ao iniciar bot:', error.stack || error.message);
      bot = null;
      botStatus = 'offline';
      currentQR = '';
      return res.status(500).json({ error: `Failed to start bot: ${error.message}` });
    }
  }

  if (req.method === 'GET' && req.url.includes('/test')) {
    console.log('[SERVER] Test endpoint hit');
    return res.status(200).json({ message: 'Test endpoint working' });
  }

  console.log('[SERVER] Rota não encontrada:', req.url);
  return res.status(404).json({ error: 'Not found' });
}