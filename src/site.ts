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
let socket: any = null;

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

// Função para gerar QR code visual MELHORADA
function showQRCode(qrData: string, qrImage?: string) {
    const qrSection = document.querySelector('.method-content.active');
    if (!qrSection) return;
    
    if (qrImage) {
        // Usar imagem do servidor (melhor qualidade)
        qrDisplay.innerHTML = `
            <div style="background: white; padding: 20px; border-radius: 15px; text-align: center;">
                <h2 style="color: #333; margin-top: 0;">📱 Escaneie com WhatsApp</h2>
                <img src="${qrImage}" alt="QR Code WhatsApp" style="max-width: 250px; border: 2px solid #ddd; border-radius: 8px;" />
                
                <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin-top: 15px;">
                    <h4 style="color: #155724; margin: 0 0 10px 0;">📋 Como conectar:</h4>
                    <div style="color: #155724; font-size: 14px; text-align: left;">
                        <p style="margin: 5px 0;"><strong>1.</strong> Abra WhatsApp no celular</p>
                        <p style="margin: 5px 0;"><strong>2.</strong> Toque nos 3 pontos > <strong>Aparelhos conectados</strong></p>
                        <p style="margin: 5px 0;"><strong>3.</strong> Toque em <strong>Conectar um aparelho</strong></p>
                        <p style="margin: 5px 0;"><strong>4.</strong> <strong>Escaneie este QR Code</strong></p>
                    </div>
                </div>
                
                <div style="background: #fff3cd; padding: 10px; border-radius: 8px; margin-top: 10px; font-size: 12px; color: #856404;">
                    ⏱️ QR Code expira em 1 minuto. Escaneie rápido!
                </div>
            </div>
        `;
        addLog('QR code visual exibido - Escaneie no WhatsApp', 'success');
    } else {
        // Fallback para biblioteca cliente
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
            addLog('QR code gerado - Escaneie no WhatsApp', 'success');
        } catch (error) {
            qrDisplay.innerHTML = `<textarea readonly style="width:100%;height:100px;font-family:monospace">${qrData}</textarea>`;
            addLog('QR code gerado (modo texto)', 'info');
        }
    }
}

// Função para mostrar código de pareamento
function showPairingCode(code: string) {
    pairingDisplay.textContent = code;
    pairingDisplay.classList.remove('hidden');
    addLog(`Código de pareamento: ${code}`, 'success');
}

// WebSocket MELHORADO
function initWebSocket() {
    try {
        // @ts-ignore
        socket = io({
            timeout: 20000,
            forceNew: true,
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 2000
        });
        
        socket.on('connect', () => {
            addLog('🔗 Conectado ao servidor WebSocket', 'success');
            // Solicitar status atual após conexão
            socket.emit('request-status');
        });
        
        socket.on('disconnect', (reason: string) => {
            addLog(`❌ WebSocket desconectado: ${reason}`, 'error');
        });
        
        socket.on('connect_error', (error: any) => {
            addLog(`❌ Erro de conexão WebSocket: ${error.message}`, 'error');
        });
        
        socket.on('reconnect', (attempt: number) => {
            addLog(`🔄 WebSocket reconectado após ${attempt} tentativas`, 'success');
            // Solicitar status após reconexão
            socket.emit('request-status');
        });
        
        // Eventos do bot
        socket.on('qr-code', (data: any) => {
            console.log('QR Code recebido via WebSocket');
            addLog('📱 QR Code gerado via WebSocket!', 'success');
            showQRCode(data.qr, data.qrImage);
        });
        
        socket.on('status-update', (data: any) => {
            console.log('Status update:', data);
            const isConnected = data.status === 'connected';
            const isConnecting = data.status === 'connecting' || data.connecting;
            
            updateStatus(isConnected, data.message);
            
            if (data.message) {
                const logType = isConnected ? 'success' : (isConnecting ? 'info' : 'error');
                addLog(data.message, logType);
            }
            
            // Debug logs
            if (data.connecting && !isConnected) {
                addLog('🔄 Bot conectando - aguarde...', 'info');
            }
        });
        
        socket.on('heartbeat', (data: any) => {
            // Heartbeat silencioso - apenas atualizar se mudou status
            if (data.status !== statusText.textContent?.toLowerCase()) {
                console.log('Heartbeat status change:', data.status);
                const isConnected = data.status === 'connected';
                updateStatus(isConnected, data.status);
            }
        });
        
    } catch (error) {
        addLog(`❌ Erro ao inicializar WebSocket: ${error}`, 'error');
        // Fallback para polling HTTP
        startStatusCheck();
    }
}

// Conectar com QR (mantém compatibilidade)
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
            
            // Se não temos WebSocket, usar polling
            if (!socket || !socket.connected) {
                startStatusCheck();
            }
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
            
            // Se não temos WebSocket, usar polling
            if (!socket || !socket.connected) {
                startStatusCheck();
            }
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

// Verificar status (fallback para HTTP polling)
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

// Inicialização MELHORADA
document.addEventListener('DOMContentLoaded', () => {
    addLog('🚀 Sistema iniciado com WebSocket!', 'success');
    addLog('Escolha um método: QR Code ou Código de pareamento', 'info');
    updateStatus(false, 'Desconectado');
    
    // Inicializar WebSocket
    initWebSocket();
    
    // Heartbeat para WebSocket
    setInterval(() => {
        if (socket && socket.connected) {
            socket.emit('ping');
        }
    }, 30000);
});

// Cleanup
window.addEventListener('beforeunload', () => {
    if (socket) {
        socket.disconnect();
    }
});