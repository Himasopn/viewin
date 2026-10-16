// Viewin Frontend - script.js
// API URLs are lightly obfuscated for public repo

// ---- Obfuscation helpers ----
function _d(s) {
    return atob(s);
}

// Encoded: https://raw.githubusercontent.com/tanuqna/cb-server/main/TUNNEL_URL
const _SRC = 'aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3RhbnVxbmEvY2Itc2VydmVyL21haW4vVFVOTkVMX1VSTA==';

// API endpoints (encoded)
const _EP = {
    health: 'L2FwaS9oZWFsdGg=',     // /api/health
    send: 'L2FwaS9zZW5k',           // /api/send
    status: 'L2FwaS9zdGF0dXMv',     // /api/status/
};

let serverUrl = '';
let currentTaskId = null;
let pollInterval = null;

// ---- Server URL Discovery ----
async function discoverServer() {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.getElementById('statusText');
    statusDot.className = 'status-dot checking';
    statusText.textContent = 'Discovering server...';

    try {
        // Fetch current tunnel URL from GitHub
        const srcUrl = _d(_SRC);
        const res = await fetch(srcUrl + '?t=' + Date.now());
        if (!res.ok) throw new Error('Source unavailable');
        
        serverUrl = (await res.text()).trim();
        if (!serverUrl || serverUrl.includes('placeholder')) {
            throw new Error('Server not running');
        }

        // Verify server is alive
        const healthUrl = serverUrl + _d(_EP.health);
        const healthRes = await fetch(healthUrl, { signal: AbortSignal.timeout(10000) });
        if (!healthRes.ok) throw new Error('Server not responding');

        const health = await healthRes.json();
        statusDot.className = 'status-dot online';
        statusText.textContent = `Server online • ${health.active_tasks || 0} active tasks`;
        addLog('Server connected successfully', 'success');
        return true;
    } catch (err) {
        statusDot.className = 'status-dot offline';
        statusText.textContent = 'Server offline - ' + err.message;
        addLog('Server connection failed: ' + err.message, 'error');
        return false;
    }
}

// ---- UI Helpers ----
function addLog(text, type = 'info') {
    const container = document.getElementById('logContainer');
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    const time = new Date().toLocaleTimeString();
    entry.textContent = `[${time}] ${text}`;
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
}

function clearLog() {
    document.getElementById('logContainer').innerHTML = '';
    addLog('Log cleared', 'info');
}

function changeQty(delta) {
    const input = document.getElementById('quantity');
    let val = parseInt(input.value) + delta;
    val = Math.max(1, Math.min(20, val));
    input.value = val;
}

function updateCharCount() {
    const msg = document.getElementById('message').value;
    document.getElementById('charCount').textContent = msg.length;
}

function setLoading(loading) {
    const btn = document.getElementById('sendBtn');
    const btnText = btn.querySelector('.btn-text');
    const btnLoading = btn.querySelector('.btn-loading');
    btn.disabled = loading;
    btnText.style.display = loading ? 'none' : '';
    btnLoading.style.display = loading ? 'flex' : 'none';
}

function showProgress(show) {
    document.getElementById('progressCard').style.display = show ? 'block' : 'none';
}

function updateProgress(sent, failed, total, quantity) {
    document.getElementById('statSent').textContent = sent;
    document.getElementById('statFailed').textContent = failed;
    document.getElementById('statTotal').textContent = total;
    
    const pct = quantity > 0 ? Math.min(100, (total / quantity) * 100) : 0;
    document.getElementById('progressFill').style.width = pct + '%';
}

// ---- Main Send Function ----
async function sendMessages(formData) {
    if (!serverUrl) {
        const found = await discoverServer();
        if (!found) {
            addLog('Cannot send: server is offline', 'error');
            return;
        }
    }

    setLoading(true);
    showProgress(true);
    updateProgress(0, 0, 0, formData.quantity);
    addLog(`Sending "${formData.message}" to ${formData.quantity} users...`, 'info');

    try {
        const sendUrl = serverUrl + _d(_EP.send);
        const res = await fetch(sendUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': 'viewin_public_2024'
            },
            body: JSON.stringify(formData)
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Send failed');
        }

        const data = await res.json();
        currentTaskId = data.task_id;
        addLog(`Task started: ${data.task_id}`, 'success');

        // Start polling for status
        startPolling(data.task_id, formData.quantity);
    } catch (err) {
        addLog('Error: ' + err.message, 'error');
        setLoading(false);
    }
}

function startPolling(taskId, quantity) {
    if (pollInterval) clearInterval(pollInterval);
    
    let lastLogCount = 0;
    
    pollInterval = setInterval(async () => {
        try {
            const statusUrl = serverUrl + _d(_EP.status) + taskId;
            const res = await fetch(statusUrl);
            if (!res.ok) throw new Error('Status check failed');
            
            const data = await res.json();
            
            // Show new logs
            if (data.logs && data.logs.length > lastLogCount) {
                for (let i = lastLogCount; i < data.logs.length; i++) {
                    const log = data.logs[i];
                    let type = 'info';
                    if (log.includes('Sent') || log.includes('success')) type = 'success';
                    else if (log.includes('Error') || log.includes('Failed') || log.includes('failed')) type = 'error';
                    else if (log.includes('Warning') || log.includes('⚠')) type = 'warn';
                    addLog(log, type);
                }
                lastLogCount = data.logs.length;
            }
            
            // Update progress
            if (data.results) {
                updateProgress(
                    data.results.sent || 0,
                    data.results.failed || 0,
                    data.results.total || 0,
                    quantity
                );
            }
            
            // Check if done
            if (['completed', 'error', 'no_users_found'].includes(data.status)) {
                clearInterval(pollInterval);
                pollInterval = null;
                setLoading(false);
                
                if (data.status === 'completed') {
                    addLog('✅ All messages processed!', 'success');
                } else if (data.status === 'error') {
                    addLog('❌ Task ended with error', 'error');
                } else {
                    addLog('⚠️ No users found on the platform', 'warn');
                }
            }
        } catch (err) {
            // Don't stop polling on transient errors
            addLog('Status check error: ' + err.message, 'warn');
        }
    }, 2000);
}

// ---- Country → State visibility ----
const COUNTRIES_WITH_STATES = [
    'United States', 'India', 'Canada', 'Australia', 'Brazil',
    'Mexico', 'Germany', 'Russia', 'Italy', 'France', 'United Kingdom'
];

function onCountryChange() {
    const country = document.getElementById('country').value;
    const sg = document.getElementById('stateGroup');
    if (sg) sg.style.display = COUNTRIES_WITH_STATES.includes(country) ? 'block' : 'none';
}

// ---- Event Listeners ----
document.getElementById('mainForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = {
        username: document.getElementById('username').value.trim(),
        age: document.getElementById('age').value,
        gender: document.getElementById('gender').value,
        country: document.getElementById('country').value,
        state: (document.getElementById('state') || {value:''}).value.trim(),
        message: document.getElementById('message').value.trim(),
        quantity: parseInt(document.getElementById('quantity').value)
    };

    if (!formData.username) { addLog('Please enter a username', 'error'); return; }
    if (!formData.message)  { addLog('Please enter a message',  'error'); return; }

    await sendMessages(formData);
});

document.getElementById('message').addEventListener('input', updateCharCount);

// ---- Init ----
window.addEventListener('load', () => {
    discoverServer();
    setInterval(discoverServer, 60000);
    onCountryChange();
});
