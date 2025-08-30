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
const methodTabs = document.querySelectorAll('.method-tab');
const methodContents = document.querySelectorAll('.method-content');

// Estado
let isConnecting = false;
let statusCheckInterval: NodeJS.Timeout | null = null;
let currentMethod = 'qr';

// Interface para respostas da API
interface ApiResponse {
    message: string;
    online: boolean;
    qr?: string;
    pairingCode?: string;
    type?: string;
}

// Função para adicionar logs
function addLog(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    
    const icons = {
        info: 'ℹ️',
        success: '✅',
        error: '❌',
        warning: '⚠️'
    };
    
    logEntry.textContent = `[${timestamp}] ${icons[type]} ${message}`;
    logsContainer.appendChild(logEntry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

// Função para limpar logs
function clearLogs() {
    const entries = logsContainer.querySelectorAll('.log-entry');
    entries.forEach((entry, index) => {
        setTimeout(() => {
            entry.remove();
        }, index * 50);
    });
    
    setTimeout(() => {
        addLog('Logs limpos', 'info');
    }, entries.length * 50 + 100);
}

// Função para atualizar status visual
function updateStatus(online: boolean, message: string) {
    if (online) {
        statusIndicator.classList.add('online');
        statusText.textContent = 'Conectado ✅';
        btnConnectQR.disabled = true;
        btnConnectPairing.disabled = true;
        btnDisconnect.disabled = false;
        isConnecting = false;
    } else {
        statusIndicator.classList.remove('online');
        statusText.textContent = message || 'Desconectado';
        btnConnectQR.disabled = false;
        btnConnectPairing.disabled = false;
        btnDisconnect.disabled = true;
    }
}

// Função para gerar QR code visual
function generateQRCode(qrData: string) {
    qrDisplay.innerHTML = '';
    
    try {
        new (window as any).QRCode(qrDisplay, {
            text: qrData,
            width: 256,
            height: 256,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: (window as any).QRCode.CorrectLevel.M,
        });
        
        addLog('QR code gerado com sucesso! Escaneie no WhatsApp', 'success');
    } catch (error) {
        console.error('Erro ao gerar QR code:', error);
        qrDisplay.innerHTML = `
            <div style="text-align: center;">
                <p>QR Code (texto):</p>
                <textarea readonly style="width: 100%; height: 100px; font-family: monospace; margin-top: 10px;">${qrData}</textarea>
            </div>
        `;
        addLog('QR code gerado (modo texto)', 'warning');
    }
}

// Função para exibir código de pareamento
function displayPairingCode(code: string) {
    pairingDisplay.textContent = code;
    pairingDisplay.classList.remove('hidden');
    addLog(`Código de pareamento gerado: ${code}`, 'success');
}

// Função para conectar via QR code
async function connectWithQR() {
    if (isConnecting) return;
    
    isConnecting = true;
    btnConnectQR.disabled = true;
    btnConnectQR.innerHTML = '<span class="loading"></span> Gerando QR...';
    
    qrDisplay.innerHTML = '<p>📡 Gerando QR code...</p>';
    addLog('Iniciando conexão via QR code...', 'info');
    
    try {
        const response = await fetch('/api/start-qr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data: ApiResponse = await response.json();
        addLog(data.message, response.ok ? 'success' : 'error');
        
        if (response.ok) {
            startStatusChecking();
        } else {
            throw new Error(data.message);
        }
    } catch (error: any) {
        addLog(`Erro: ${error.message}`, 'error');
        isConnecting = false;
        btnConnectQR.disabled = false;
        btnConnectQR.innerHTML = '📱 Gerar QR Code';
        qrDisplay.innerHTML = '<p>Erro ao gerar QR code. Tente novamente.</p>';
    }
}

// Função para conectar via código de pareamento
async function connectWithPairing() {
    const phoneNumber = phoneInput.value.trim();
    
    if (!phoneNumber) {
        addLog('Digite um número de telefone válido', 'error');
        phoneInput.focus();
        return;
    }
    
    if (isConnecting) return;
    
    isConnecting = true;
    btnConnectPairing.disabled = true;
    btnConnectPairing.innerHTML = '<span class="loading"></span> Gerando Código...';
    
    pairingDisplay.classList.add('hidden');
    addLog(`Iniciando conexão via código para ${phoneNumber}...`, 'info');
    
    try {
        const response = await fetch('/api/start-pairing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber })
        });
        
        const data: ApiResponse = await response.json();
        addLog(data.message, response.ok ? 'success' : 'error');
        
        if (response.ok) {
            startStatusChecking();
        } else {
            throw new Error(data.message);
        }
    } catch (error: any) {
        addLog(`Erro: ${error.message}`, 'error');
        isConnecting = false;
        btnConnectPairing.disabled = false;
        btnConnectPairing.innerHTML = '🔢 Gerar Código';
    }
}

// Função para desconectar
async function disconnect() {
    btnDisconnect.disabled = true;
    btnDisconnect.innerHTML = '<span class="loading"></span> Desconectando...';
    
    addLog('Desconectando...', 'info');
    
    try {
        const response = await fetch('/api/disconnect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data: ApiResponse = await response.json();
        addLog(data.message, response.ok ? 'success' : 'error');
        
        updateStatus(false, 'Desconectado');
        qrDisplay.innerHTML = '<p>Clique em "Gerar QR Code" para começar</p>';
        pairingDisplay.classList.add('hidden');
        
        if (statusCheckInterval) {
            clearInterval(statusCheckInterval);
            statusCheckInterval = null;
        }
    } catch (error: any) {
        addLog(`Erro ao desconectar: ${error.message}`, 'error');
    } finally {
        btnDisconnect.innerHTML = '🔌 Desconectar';
    }
}

// Função para verificar status periodicamente
function startStatusChecking() {
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
    }
    
    statusCheckInterval = setInterval(async () => {
        try {
            const response = await fetch('/api/status');
            const status: ApiResponse = await response.json();
            
            updateStatus(status.online, status.message);
            
            if (status.qr && currentMethod === 'qr') {
                generateQRCode(status.qr);
            }
            
            if (status.pairingCode && currentMethod === 'pairing') {
                displayPairingCode(status.pairingCode);
            }
            
            if (status.online) {
                isConnecting = false;
                btnConnectQR.innerHTML = '📱 Gerar QR Code';
                btnConnectPairing.innerHTML = '🔢 Gerar Código';
                
                if (statusCheckInterval) {
                    clearInterval(statusCheckInterval);
                    statusCheckInterval = null;
                }
            }
        } catch (error) {
            console.error('Erro ao verificar status:', error);
        }
    }, 2000);
}

// Event listeners
btnConnectQR.addEventListener('click', connectWithQR);
btnConnectPairing.addEventListener('click', connectWithPairing);
btnDisconnect.addEventListener('click', disconnect);
btnClearLogs.addEventListener('click', clearLogs);

// Event listeners para tabs
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

// Formatação do input de telefone
phoneInput.addEventListener('input', (e) => {
    let value = (e.target as HTMLInputElement).value.replace(/\D/g, '');
    if (value.length > 15) value = value.substring(0, 15);
    (e.target as HTMLInputElement).value = value;
});

// Inicialização
addLog('Sistema iniciado', 'success');
addLog('Escolha um método de conexão: QR Code ou Código de pareamento', 'info');
updateStatus(false, 'Desconectado');