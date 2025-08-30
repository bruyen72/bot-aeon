import { defineConfig } from 'vite';
import { spawn } from 'child_process';

// Estado global do bot
let botProcess: any = null;
let botStatus: 'online' | 'offline' = 'offline';
let currentQR = '';
let lastStdoutBuffer = '';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist-site',
    emptyOutDir: true,
    rollupOptions: {
      input: 'index.html',
    },
  },
  define: {
    'process.env': {}
  },
  plugins: [
    {
      name: 'api-server',
      configureServer(server) {
        // API para iniciar o bot
        server.middlewares.use('/api/start-bot', (req, res, next) => {
          if (req.method === 'POST') {
            try {
              if (botProcess && !botProcess.killed) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'Bot já está rodando' }));
                return;
              }

              // Executar o bot com streams
              botProcess = spawn('npm', ['run', 'dev'], { 
                cwd: process.cwd(), 
                env: process.env 
              });

              botProcess.stdout.on('data', (chunk: Buffer) => {
                const text = chunk.toString();

                // Processa imediatamente sem acumular buffer
                const lines = text.split('\n');
                for (const line of lines) {
                  const trimmedLine = line.trim();
                  if (!trimmedLine) continue;

                  // Parse structured signals - mais rápido
                  if (trimmedLine.startsWith('QR_CODE:')) {
                    currentQR = trimmedLine.replace('QR_CODE:', '').trim();
                  }
                  if (trimmedLine.includes('BOT_STATUS: online') || trimmedLine.includes('WhatsApp conectado')) {
                    botStatus = 'online';
                  }
                  if (trimmedLine.includes('BOT_STATUS: offline')) {
                    botStatus = 'offline';
                  }
                }
              });

              botProcess.stderr.on('data', (chunk: Buffer) => {
                // Bot error
              });

              botProcess.on('close', (code: number) => {
                botProcess = null;
                botStatus = 'offline';
                currentQR = '';
              });

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ message: 'Bot iniciado com sucesso' }));
            } catch (error: any) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: error.message }));
            }
          } else {
            next();
          }
        });

        // API para status do bot
        server.middlewares.use('/api/bot-status', (req, res, next) => {
          if (req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              online: botStatus === 'online',
              qr: currentQR,
              timestamp: Date.now()
            }));
          } else {
            next();
          }
        });

        // API para health check
        server.middlewares.use('/api/health', (req, res, next) => {
          if (req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              online: botStatus === 'online',
              processRunning: !!botProcess && !botProcess.killed,
              pid: botProcess?.pid ?? null,
              timestamp: Date.now()
            }));
          } else {
            next();
          }
        });
      }
    }
  ]
});


