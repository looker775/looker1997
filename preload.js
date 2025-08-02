// ✅ preload.js – FINAL version for VibelyCoder (Claude + GUI + CLI support)

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vibelyAPI', {
  // 🔑 --- LICENSE HANDLING ---
  verifyLicense: (key) => ipcRenderer.invoke('verify-license', key),
  licenseSuccess: () => ipcRenderer.send('license-success'),

  // 🤖 --- CLAUDE AI FUNCTIONS ---
  saveClaudeKey: (key) => ipcRenderer.invoke('saveClaudeKey', key),
  askClaude: (prompt) => ipcRenderer.invoke('askClaude', prompt),

  // 📂 --- FILE & COMMAND ACTIONS ---
  writeFile: (sessionId, relPath, content) =>
    ipcRenderer.invoke('writeFile', sessionId, relPath, content),
  runCommand: (sessionId, command, args) =>
    ipcRenderer.invoke('runCommand', sessionId, command, args),

  // 🌍 --- DEPLOYMENT ---
  deployTo: (platform, sessionId) =>
    ipcRenderer.invoke('deployTo', platform, sessionId),

  // 🎨 --- GUI / UI BUILDER FEATURES ---
  exportLayout: (layout) => ipcRenderer.invoke('export-layout', layout),
  openInVSCode: () => ipcRenderer.invoke('open-vscode'),
  buildInstaller: () => ipcRenderer.invoke('build-installer'),

  // 🖥️ --- CLI INTEGRATION ---
  openCLI: () => ipcRenderer.send('open-cli'),
  sendCLICommand: (cmd) => ipcRenderer.send('cli-command', cmd),
  onCLIOutput: (callback) => ipcRenderer.on('cli-output', (event, data) => callback(data))
});
