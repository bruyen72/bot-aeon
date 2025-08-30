const statusIndicator = document.getElementById('status-indicator') as HTMLDivElement;
const statusText = document.getElementById('status-text') as HTMLSpanElement;
const btnCheckStatus = document.getElementById('btn-check-status') as HTMLButtonElement;
const btnStartBot = document.getElementById('btn-start-bot') as HTMLButtonElement;
const btnDisconnectBot = document.getElementById('btn-disconnect-bot') as HTMLButtonElement;
const btnClearLogs = document.getElementById('btn-clear-logs') as HTMLButtonElement;
const qrDisplay = document.getElementById('qr-display') as HTMLDivElement;
const qrCard = document.getElementById('qr-card') as HTMLDivElement;
const logsContainer = document.getElementById('logs') as HTMLDivElement;

let botStatus: 'online' | 'offline' = 'offline';
let currentQR: string = '';
let isBotRunning: boolean = false;
let lastLoggedStatus: 'online' | 'offline' | null = null;
let qrTimeout: NodeJS.Timeout | null = null;

function addLog(message: string) {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = document.createElement('div');
  logEntry.textContent = `[${timestamp}] ${message}`;
  logsContainer.appendChild(logEntry);
  logsContainer.scrollTop = logsContainer.scrollHeight;
}

function clearLogs() {
  logsContainer.innerHTML = '';
  addLog('Limpando os logs');
}

function updateStatus(status: 'online' | 'offline', hasQR: boolean = false) {
  if (status === botStatus && !hasQR) return;

  botStatus = status;

  if (status === 'online') {
    statusIndicator.className = 'status-indicator status-online';
    statusText.textContent = 'Conectado';
    qrCard.classList.add('hidden');
    if (lastLoggedStatus !== 'online') {
      addLog('✅ Bot está online e conectado ao WhatsApp');
      lastLoggedStatus = 'online';
    }
    if (qrTimeout) {
      clearTimeout(qrTimeout);
      qrTimeout = null;
    }
  } else {
    statusIndicator.className = 'status-indicator status-offline';
    statusText.textContent = 'Desconectado';
    qrCard.classList.remove('hidden');
    if (hasQR) {
      if (lastLoggedStatus !== 'offline') {
        addLog('📱 QR code disponível - Escaneie em até 20 segundos');
        lastLoggedStatus = 'offline';
      }
      // Configura timeout para alertar sobre expiração do QR code
      if (qrTimeout) clearTimeout(qrTimeout);
      qrTimeout = setTimeout(() => {
        if (botStatus !== 'online') {
          addLog('⚠️ QR code expirou - Clique em "Iniciar Bot" para gerar um novo');
          qrDisplay.innerHTML = '<p>QR code expirou - Tente novamente</p>';
        }
      }, 20000);
    } else {
      qrDisplay.innerHTML = '<p>Aguardando inicialização do bot...</p>';
      if (lastLoggedStatus !== 'offline') {
        addLog('❌ Bot está offline - Clique em "Iniciar Bot" para gerar um novo QR code');
        lastLoggedStatus = 'offline';
      }
    }
  }
}

async function generateQRCodeImage(qrData: string): Promise<void> {
  return new Promise((resolve, reject) => {
    qrDisplay.innerHTML = '';
    const qrContainer = document.createElement('div');
    qrDisplay.appendChild(qrContainer);

    new QRCode(qrContainer, {
      text: qrData,
      width: 200,
      height: 200,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.L,
    });

    setTimeout(() => {
      const canvas = qrContainer.querySelector('canvas');
      if (canvas) {
        canvas.alt = 'QR Code do WhatsApp';
        resolve();
      } else {
        reject(new Error('Failed to generate QR code image'));
      }
    }, 100);
  });
}

async function executeBot() {
  if (isBotRunning) {
    addLog('🤖 Bot já está executando...');
    return;
  }

  addLog('🚀 Iniciando bot e gerando novo QR code');
  isBotRunning = true;
  qrDisplay.innerHTML = '<p>Carregando QR code...</p>';

  try {
    addLog('📱 Iniciando o bot...');

    const response = await fetch('/api/start-bot', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'start' }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Falha ao iniciar bot: ${response.status} - ${text.slice(0, 100)}...`);
    }

    const data = await response.json();
    addLog(`✅ ${data.message}`);

    if (data.online) {
      updateStatus('online');
      qrDisplay.innerHTML = '<p>Bot conectado - Nenhum QR code necessário</p>';
    } else if (data.qr && data.qr !== currentQR) {
      currentQR = data.qr;
      try {
        await generateQRCodeImage(data.qr);
        updateStatus('offline', true);
      } catch (error) {
        addLog('❌ Erro ao gerar imagem do QR code');
        qrDisplay.innerHTML = `<p>QR code disponível</p><textarea readonly style="width: 100%; height: 100px; font-family: monospace;">${data.qr}</textarea>`;
        updateStatus('offline', true);
      }
    } else {
      updateStatus('offline');
      qrDisplay.innerHTML = '<p>Nenhum QR code disponível - Tente novamente</p>';
      addLog('❌ Nenhum QR code gerado - Tente novamente');
    }
  } catch (error: any) {
    addLog(`❌ Erro ao executar bot: ${error.message}`);
    isBotRunning = false;
    qrDisplay.innerHTML = '<p>Nenhum QR code disponível - Tente novamente</p>';
  }
}

async function disconnectBot() {
  addLog('🔌 Desconectando bot...');
  isBotRunning = false;
  currentQR = '';

  try {
    const response = await fetch('/api/start-bot', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'disconnect' }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Falha ao desconectar bot: ${response.status} - ${text.slice(0, 100)}...`);
    }

    const data = await response.json();
    addLog(`✅ ${data.message}`);
    updateStatus('offline');
    qrDisplay.innerHTML = '<p>Nenhum QR code disponível</p>';
    if (qrTimeout) {
      clearTimeout(qrTimeout);
      qrTimeout = null;
    }
  } catch (error: any) {
    addLog(`❌ Erro ao desconectar bot: ${error.message}`);
    qrDisplay.innerHTML = '<p>Nenhum QR code disponível</p>';
  }
}

btnCheckStatus?.addEventListener('click', async () => {
  addLog('🔍 Verificando status do bot...');
  await executeBot();
});

btnStartBot?.addEventListener('click', () => {
  void executeBot();
});

btnDisconnectBot?.addEventListener('click', () => {
  void disconnectBot();
});

btnClearLogs?.addEventListener('click', () => {
  clearLogs();
});

addLog('🚀 Sistema iniciado');
addLog('💡 Clique em "Iniciar Bot" para gerar um novo QR code');

updateStatus('offline');
void executeBot();