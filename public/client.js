const outputDiv = document.getElementById('output-log');
const inputField = document.getElementById('command-input');
const batteryVal = document.getElementById('battery-val');
const batteryBar = document.getElementById('battery-bar');
const statusInd = document.getElementById('status-indicator');

// 暫時寫死 (之後做登入功能)
const PLAYER_ID = "player1";

// 狀態管理
function updateHUD(metrics, player) {
    if (metrics && metrics.remaining_ticks !== undefined) {
        const ticks = metrics.remaining_ticks;
        batteryVal.textContent = ticks;
        
        // 更新進度條
        const pct = Math.max(0, Math.min(100, ticks / 10)); // 假設滿電 1000
        batteryBar.style.width = `${pct}%`;
        
        // 顏色變化
        if (pct < 20) batteryBar.style.backgroundColor = '#ff0000';
        else if (pct < 50) batteryBar.style.backgroundColor = '#ffcc00';
        else batteryBar.style.backgroundColor = '#00ff41';
    }
}

inputField.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
        const cmd = inputField.value.trim();
        if (!cmd) return;

        appendLog(`user@babel:~$ ${cmd}`, 'user-msg');
        inputField.value = '';
        inputField.disabled = true; // 發送時鎖定輸入
        statusInd.textContent = "TRANSMITTING...";
        statusInd.className = "status-warn";

        await sendCommand(cmd);
        
        inputField.disabled = false;
        inputField.focus();
        statusInd.textContent = "ONLINE";
        statusInd.className = "status-ok";
    }
});

const API_URL = "https://project-babel.ddns.net:3000";

async function sendCommand(action) {
    const startTime = Date.now();
    try {
        // 修改 fetch 的網址，加上 API_URL
        const response = await fetch(`${API_URL}/game/action`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                playerId: PLAYER_ID,
                action: action
            })
        });

        // 檢查 413 (Payload Too Large) 或 429 (Rate Limit)
        if (!response.ok) {
            const errText = await response.text();
            try {
                const errJson = JSON.parse(errText);
                appendLog(`[連線錯誤] ${errJson.error || response.statusText}`, 'error-msg');
            } catch {
                appendLog(`[連線中斷] HTTP ${response.status}`, 'error-msg');
            }
            return;
        }

        const data = await response.json();
        const netTime = Date.now() - startTime;

        // 1. 顯示消耗數據 (物理法則反饋)
        if (data.metrics) {
            const cost = data.metrics.cost_ticks;
            const ram = data.metrics.memory ? ` | MEM: ${Math.round(data.metrics.memory/1024)}KB` : '';
            appendLog(`[SYSTEM] CPU: -${cost} Ticks | NET: ${netTime}ms${ram}`, 'cost-msg');
            
            // 更新 HUD
            updateHUD(data.metrics);
        }

        // 2. 處理錯誤或訊息
        if (data.error) {
            appendLog(`[ERROR] ${data.error}: ${data.details || ''}`, 'error-msg');
        } else {
            appendLog(data.message, 'server-msg');
        }

    } catch (err) {
        appendLog(`[FATAL] 訊號丟失: ${err.message}`, 'error-msg');
        statusInd.textContent = "OFFLINE";
        statusInd.className = "status-err";
    }
}

function appendLog(text, className) {
    const div = document.createElement('div');
    div.className = className;
    div.textContent = text;
    outputDiv.appendChild(div);
    outputDiv.scrollTop = outputDiv.scrollHeight;
}

// 初始連線
window.onload = () => {
    document.getElementById('player-id').textContent = PLAYER_ID.toUpperCase();
    sendCommand('look');
};