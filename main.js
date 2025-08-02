const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const fetch = require('node-fetch'); // ✅ Needed for Claude API

let mainWindow;
let cliWindow;

// 🚀 CREATE MAIN APP WINDOW
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('license.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 🚀 CREATE CLI POPUP WINDOW (triggered by “Terminal” button)
function createCLIWindow() {
  if (cliWindow) {
    cliWindow.focus();
    return;
  }

  cliWindow = new BrowserWindow({
    width: 800,
    height: 500,
    title: "VibelyCoder CLI",
    parent: mainWindow,
    modal: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  cliWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
    <html>
    <head>
      <title>VibelyCoder CLI</title>
      <style>
        body { font-family: monospace; margin: 0; padding: 0; background: #111; color: #0f0; }
        #cli-output { white-space: pre-wrap; padding: 10px; height: 85%; overflow-y: auto; }
        #cli-input { width: 100%; padding: 8px; border: none; outline: none; font-family: monospace; font-size: 14px; }
      </style>
    </head>
    <body>
      <div id="cli-output">💻 VibelyCoder CLI started...\n</div>
      <input id="cli-input" placeholder="Type a command and press Enter">
      <script>
        const { exec } = require('child_process');
        const outputDiv = document.getElementById('cli-output');
        const input = document.getElementById('cli-input');

        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            const cmd = input.value;
            input.value = '';
            outputDiv.innerHTML += "> " + cmd + "\\n";
            exec(cmd, (err, stdout, stderr) => {
              if (stdout) outputDiv.innerHTML += stdout + "\\n";
              if (stderr) outputDiv.innerHTML += stderr + "\\n";
              if (err) outputDiv.innerHTML += "❌ Error: " + err.message + "\\n";
              outputDiv.scrollTop = outputDiv.scrollHeight;
            });
          }
        });
      </script>
    </body>
    </html>
  `));

  cliWindow.on('closed', () => {
    cliWindow = null;
  });
}

// ✅ APP EVENTS
app.on('ready', createMainWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (mainWindow === null) createMainWindow();
});


// =======================
// 📌 IPC HANDLERS
// =======================

// 🔑 LICENSE CHECK
ipcMain.handle('verify-license', async (event, key) => {
  const validKeys = ['TEST-1234', 'VIP-KEY-5678'];
  return validKeys.includes(key)
    ? { success: true }
    : { success: false, message: '❌ Invalid license key' };
});

// 🔑 LICENSE SUCCESS → load main GUI
ipcMain.on('license-success', () => {
  if (mainWindow) mainWindow.loadFile('index.html');
});

// 🤖 CLAUDE INTEGRATION
ipcMain.handle('saveClaudeKey', async (event, key) => {
  const keyPath = path.join(app.getPath('userData'), 'claude_key.json');
  fs.writeFileSync(keyPath, JSON.stringify({ key }, null, 2));
  return { success: true };
});

ipcMain.handle('askClaude', async (event, prompt) => {
  try {
    const keyPath = path.join(app.getPath('userData'), 'claude_key.json');
    if (!fs.existsSync(keyPath)) return "❌ No Claude API key saved.";
    const { key } = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-opus-20240229",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await response.json();
    return data?.content?.[0]?.text || "❌ Claude returned no text.";
  } catch (err) {
    console.error("Claude API Error:", err);
    return "❌ Error: " + err.message;
  }
});

// 📂 WRITE FILE
ipcMain.handle('writeFile', async (event, sessionId, relPath, content) => {
  const targetPath = path.join(process.cwd(), relPath);
  fs.writeFileSync(targetPath, content);
  return { success: true, path: targetPath };
});

// ⚙️ RUN COMMAND
ipcMain.handle('runCommand', async (event, sessionId, command, args) => {
  return new Promise((resolve) => {
    const proc = spawn(command, args, { shell: true });
    let output = '';
    proc.stdout.on('data', data => output += data.toString());
    proc.stderr.on('data', data => output += data.toString());
    proc.on('close', code => resolve({ success: code === 0, output }));
  });
});

// 🌍 DEPLOYMENT (stub)
ipcMain.handle('deployTo', async (event, platform, sessionId) => {
  return { success: true, url: `https://${platform}.example.com/your-app` };
});

// 🎨 EXPORT LAYOUT
ipcMain.handle('export-layout', async (event, layout) => {
  const exportDir = path.join(process.cwd(), 'exported-ui');
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir);
  const filePath = path.join(exportDir, 'index.html');
  fs.writeFileSync(filePath, layout);
  return { success: true, path: filePath };
});

// 🖥️ OPEN IN VS CODE
ipcMain.handle('open-vscode', async () => {
  return new Promise((resolve) => {
    const proc = spawn('code', [process.cwd()], { shell: true });
    proc.on('close', () => resolve({ success: true }));
  });
});

// 📦 BUILD INSTALLER (stub)
ipcMain.handle('build-installer', async () => {
  return { success: true, message: 'Installer build started' };
});

// 🖥️ TERMINAL BUTTON HANDLER
ipcMain.on('open-cli', () => {
  createCLIWindow();
});
