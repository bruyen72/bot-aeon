// Elementos DOM
const statusIndicator = document.getElementById('status-indicator') as HTMLElement;
const statusText = document.getElementById('status-text') as HTMLElement;
const btnConnectQR = document.getElementById('btn-connect-qr') as HTMLButtonElement;
const btnConnectPairing = document.getElementById('btn-connect-pairing') as HTMLButtonElement;
const btnDisconnect = document.getElementById('btn-disconnect') as HTMLButtonElement;
const btnClearLogs = document.getElementById('btn-clear-logs') as HTMLButtonElement;
const qrDisplay = document.getElementById('qr-display') as HTMLElement;
const pairingDisplay = document.getElementById('pairing-display') as HTMLElement;
const phoneInput = document.getElementById('phone-input') as HTMLInputElement;
const logsContainer = document.getElementById('logs-container') as HTMLElement;

// Tabs
const methodTabs = document.querySelectorAll('.method-tab') as NodeListOf<HTMLElement>;
const methodContents = document.querySelectorAll('.method-content') as NodeListOf<HTMLElement>;

// Estado
let currentMethod = 'qr';
let statusInterval: number | null = null;

// Função para logs
function addLog(message: string, type: 'info' | 'success' | 'error' = 'info') {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    
    const icons = { info: 'ℹ️', success: '✅', error: '❌' };
    logEntry.textContent = `[${timestamp}] ${icons[type]} ${message}`;
    
    logsContainer.appendChild(logEntry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
    
    // Limitar logs
    const logs = logsContainer.children;
    if (logs.length > 100) {
        logsContainer.removeChild(logs[0]);
    }
}

// Função para limpar logs
function clearLogs() {
    logsContainer.innerHTML = '';
    addLog('Logs limpos', 'info');
}

// Função para atualizar status
function updateStatus(online: boolean, message: string) {
    if (online) {
        statusIndicator.classList.add('online');
        statusText.textContent = 'Conectado ✅';
        btnConnectQR.disabled = true;
        btnConnectPairing.disabled = true;
        btnDisconnect.disabled = false;
    } else {
        statusIndicator.classList.remove('online');
        statusText.textContent = message || 'Desconectado';
        btnConnectQR.disabled = false;
        btnConnectPairing.disabled = false;
        btnDisconnect.disabled = true;
    }
}

// Função para gerar QR code visual
function showQRCode(qrData: string) {
    qrDisplay.innerHTML = '';
    
    try {
        // @ts-ignore
        new QRCode(qrDisplay, {
            text: qrData,
            width: 256,
            height: 256,
            colorDark: '#000000',
            colorLight: '#ffffff',
            // @ts-ignore
            correctLevel: QRCode.CorrectLevel.M,
        });
        addLog('QR code exibido - Escaneie no WhatsApp', 'success');
    } catch (error) {
        qrDisplay.innerHTML = `<textarea readonly style="width:100%;height:100px;font-family:monospace">${qrData}</textarea>`;
        addLog('QR code gerado (modo texto)', 'info');
    }
}

// Função para mostrar código de pareamento
function showPairingCode(code: string) {
    pairingDisplay.textContent = code;
    pairingDisplay.classList.remove('hidden');
    addLog(`Código de pareamento: ${code}`, 'success');
}

// Conectar com QR
async function connectQR() {
    btnConnectQR.disabled = true;
    btnConnectQR.innerHTML = '⏳ Gerando QR...';
    qrDisplay.innerHTML = '<p>📡 Gerando QR code...</p>';
    
    addLog('Iniciando conexão via QR...', 'info');
    
    try {
        const response = await fetch('/api/connect-qr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();
        
        if (result.success) {
            if (result.qr) {
                showQRCode(result.qr);
            }
            addLog(result.message, 'success');
            startStatusCheck();
        } else {
            addLog(result.message, 'error');
            qrDisplay.innerHTML = '<p>❌ Erro ao gerar QR code</p>';
        }
    } catch (error) {
        addLog(`Erro: ${error}`, 'error');
        qrDisplay.innerHTML = '<p>❌ Erro de conexão</p>';
    } finally {
        btnConnectQR.disabled = false;
        btnConnectQR.innerHTML = '📱 Gerar QR Code';
    }
}

// Conectar com código
async function connectPairing() {
    const phoneNumber = phoneInput.value.trim();
    
    if (!phoneNumber) {
        addLog('Digite um número de telefone', 'error');
        phoneInput.focus();
        return;
    }
    
    btnConnectPairing.disabled = true;
    btnConnectPairing.innerHTML = '⏳ Gerando código...';
    pairingDisplay.classList.add('hidden');
    
    addLog(`Iniciando conexão para ${phoneNumber}...`, 'info');
    
    try {
        const response = await fetch('/api/connect-pairing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber })
        });
        
        const result = await response.json();
        
        if (result.success) {
            if (result.pairingCode) {
                showPairingCode(result.pairingCode);
            }
            addLog(result.message, 'success');
            startStatusCheck();
        } else {
            addLog(result.message, 'error');
        }
    } catch (error) {
        addLog(`Erro: ${error}`, 'error');
    } finally {
        btnConnectPairing.disabled = false;
        btnConnectPairing.innerHTML = '🔢 Gerar Código';
    }
}

// Desconectar
async function disconnectBot() {
    btnDisconnect.disabled = true;
    btnDisconnect.innerHTML = '⏳ Desconectando...';
    
    addLog('Desconectando...', 'info');
    
    try {
        const response = await fetch('/api/disconnect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();
        addLog(result.message, result.success ? 'success' : 'error');
        
        if (result.success) {
            updateStatus(false, 'Desconectado');
            qrDisplay.innerHTML = '<p>Clique em "Gerar QR Code" para começar</p>';
            pairingDisplay.classList.add('hidden');
            stopStatusCheck();
        }
    } catch (error) {
        addLog(`Erro: ${error}`, 'error');
    } finally {
        btnDisconnect.disabled = false;
        btnDisconnect.innerHTML = '🔌 Desconectar';
    }
}

// Verificar status
function startStatusCheck() {
    if (statusInterval) clearInterval(statusInterval);
    
    statusInterval = window.setInterval(async () => {
        try {
            const response = await fetch('/api/status');
            const status = await response.json();
            
            updateStatus(status.online, status.message);
            
            if (status.online) {
                stopStatusCheck();
            } else {
                // Atualizar QR/código se disponível
                if (status.qr && currentMethod === 'qr') {
                    showQRCode(status.qr);
                }
                if (status.pairingCode && currentMethod === 'pairing') {
                    showPairingCode(status.pairingCode);
                }
            }
        } catch (error) {
            console.error('Erro ao verificar status:', error);
        }
    }, 3000);
}

function stopStatusCheck() {
    if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
    }
}

// Event listeners
btnConnectQR?.addEventListener('click', connectQR);
btnConnectPairing?.addEventListener('click', connectPairing);
btnDisconnect?.addEventListener('click', disconnectBot);
btnClearLogs?.addEventListener('click', clearLogs);

// Tabs
methodTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const method = tab.getAttribute('data-method');
        if (!method) return;
        
        currentMethod = method;
        
        // Atualizar tabs
        methodTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Atualizar conteúdo
        methodContents.forEach(content => {
            content.classList.remove('active');
            if (content.id === `${method}-method`) {
                content.classList.add('active');
            }
        });
        
        // Limpar displays
        qrDisplay.innerHTML = '<p>Clique em "Gerar QR Code" para começar</p>';
        pairingDisplay.classList.add('hidden');
    });
});

// Formatação do telefone
phoneInput?.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    let value = target.value.replace(/\D/g, '');
    if (value.length > 15) value = value.substring(0, 15);
    target.value = value;
});

// Inicialização
addLog('Sistema iniciado', 'success');
addLog('Escolha um método: QR Code ou Código de pareamento', 'info');
updateStatus(false, 'Desconectado');