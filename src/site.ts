const statusIndicator = document.getElementById('status-indicator') as HTMLDivElement;
const statusText = document.getElementById('status-text') as HTMLSpanElement;
const btnStartBot = document.getElementById('btn-start-bot') as HTMLButtonElement;
const btnDisconnectBot = document.getElementById('btn-disconnect-bot') as HTMLButtonElement;
const btnClearLogs = document.getElementById('btn-clear-logs') as HTMLButtonElement;
const logsContainer = document.getElementById('logs') as HTMLDivElement;

let botStatus: 'online' | 'offline' = 'offline';
let isBotRunning: boolean = false;
let lastLoggedStatus: 'online' | 'offline' | null = null;

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

function updateStatus(status: 'online' | 'offline') {
  if (status === botStatus) return;

  botStatus = status;

  if (status === 'online') {
    statusIndicator.className = 'status-indicator status-online';
    statusText.textContent = 'Conectado';
    if (lastLoggedStatus !== 'online') {
      addLog('✅ Bot está online e conectado ao WhatsApp');
      lastLoggedStatus = 'online';
    }
  } else {
    statusIndicator.className = 'status-indicator status-offline';
    statusText.textContent = 'Desconectado';
    if (lastLoggedStatus !== 'offline') {
      addLog('❌ Bot está offline');
      lastLoggedStatus = 'offline';
    }
  }
}


async function executeBot() {
  if (isBotRunning) {
    addLog('🤖 Bot já está em execução...');
    return;
  }

  addLog('🚀 Iniciando bot...');
  addLog('📱 QR code será exibido nos logs do servidor');
  isBotRunning = true;

  try {
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
      isBotRunning = false;
    } else {
      updateStatus('offline');
      addLog('📱 Verifique os logs do servidor para ver o QR code');
      // Verifica status periodicamente
      checkStatusPeriodically();
    }
  } catch (error: any) {
    addLog(`❌ Erro ao executar bot: ${error.message}`);
    isBotRunning = false;
  }
}

async function disconnectBot() {
  addLog('🔌 Desconectando bot...');
  isBotRunning = false;

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
  } catch (error: any) {
    addLog(`❌ Erro ao desconectar bot: ${error.message}`);
    updateStatus('offline');
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
addLog('💡 Clique em "Iniciar Bot" para conectar ao WhatsApp');

updateStatus('offline');