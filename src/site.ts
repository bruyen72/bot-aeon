const statusIndicator = document.getElementById('status-indicator') as HTMLDivElement;
const statusText = document.getElementById('status-text') as HTMLSpanElement;
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
  const timestamp = new Date().toLocaleTimeString('pt-BR', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
  const logEntry = document.createElement('div');
  logEntry.style.opacity = '0';
  logEntry.style.transform = 'translateY(10px)';
  logEntry.style.transition = 'all 0.3s ease';
  logEntry.textContent = `[${timestamp}] ${message}`;
  logsContainer.appendChild(logEntry);
  
  // Animação de entrada
  setTimeout(() => {
    logEntry.style.opacity = '1';
    logEntry.style.transform = 'translateY(0)';
  }, 10);
  
  logsContainer.scrollTop = logsContainer.scrollHeight;
}

function clearLogs() {
  const logEntries = logsContainer.querySelectorAll('div');
  logEntries.forEach((entry, index) => {
    setTimeout(() => {
      entry.style.opacity = '0';
      entry.style.transform = 'translateY(-10px)';
    }, index * 50);
  });
  
  setTimeout(() => {
    logsContainer.innerHTML = '';
    addLog('🧹 Logs limpos com sucesso');
  }, logEntries.length * 50 + 300);
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
        addLog('📱 QR code disponível - Escaneie em até 60 segundos');
        lastLoggedStatus = 'offline';
      }
      // Configura timeout para alertar sobre expiração do QR code
      if (qrTimeout) clearTimeout(qrTimeout);
      qrTimeout = setTimeout(() => {
        if (botStatus !== 'online') {
          addLog('⚠️ QR code expirou - Clique em "Iniciar Bot" para gerar um novo');
          qrDisplay.innerHTML = '<p>⚠️ QR code expirou - Tente novamente</p>';
        }
      }, 60000);
    } else {
      qrDisplay.innerHTML = '<p>🔄 Clique em "Iniciar Bot" para gerar QR code</p>';
      if (lastLoggedStatus !== 'offline') {
        addLog('❌ Bot está offline');
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
      width: 320,
      height: 320,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M,
    });

    setTimeout(() => {
      const canvas = qrContainer.querySelector('canvas');
      if (canvas) {
        canvas.title = 'QR Code do WhatsApp';
        resolve();
      } else {
        reject(new Error('Failed to generate QR code image'));
      }
    }, 100);
  });
}

async function executeBot() {
  addLog('🚀 Iniciando bot e gerando novo QR code');
  isBotRunning = true;
  qrDisplay.innerHTML = '<p>📡 Gerando QR code...</p>';

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

    const data: BotApiResponse = await response.json();
    addLog(`✅ ${data.message}`);

    if (data.online) {
      updateStatus('online');
      qrDisplay.innerHTML = '<p>✅ Bot conectado - Nenhum QR code necessário</p>';
      isBotRunning = false;
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
      // Verifica status periodicamente
      checkStatusPeriodically();
    } else {
      updateStatus('offline');
      qrDisplay.innerHTML = '<p>Nenhum QR code disponível - Tente novamente</p>';
      addLog('❌ Nenhum QR code gerado - Tente novamente');
      isBotRunning = false;
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

    const data: BotApiResponse = await response.json();
    addLog(`✅ ${data.message}`);
    updateStatus('offline');
    qrDisplay.innerHTML = '<p>🔄 Clique em "Iniciar Bot" para gerar QR code</p>';
    if (qrTimeout) {
      clearTimeout(qrTimeout);
      qrTimeout = null;
    }
  } catch (error: any) {
    addLog(`❌ Erro ao desconectar bot: ${error.message}`);
    updateStatus('offline');
    qrDisplay.innerHTML = '<p>🔄 Clique em "Iniciar Bot" para gerar QR code</p>';
  }
}


btnStartBot?.addEventListener('click', () => {
  void executeBot();
});

btnDisconnectBot?.addEventListener('click', () => {
  void disconnectBot();
});

btnClearLogs?.addEventListener('click', () => {
  clearLogs();
});

// Função para verificar status periodicamente
let statusInterval: NodeJS.Timeout | null = null;

function checkStatusPeriodically() {
  if (statusInterval) {
    clearInterval(statusInterval);
  }
  
  statusInterval = setInterval(async () => {
    try {
      const response = await fetch('/api/status');
      if (response.ok) {
        const data: BotApiResponse = await response.json();
        if (data.online && botStatus !== 'online') {
          updateStatus('online');
          isBotRunning = false;
          if (statusInterval) {
            clearInterval(statusInterval);
            statusInterval = null;
          }
        }
      }
    } catch (error) {
      // Ignore errors
    }
  }, 3000);
}

addLog('🚀 Sistema iniciado');
addLog('💡 Clique em "Iniciar Bot" para gerar um novo QR code');

updateStatus('offline');