const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 🔑 Save Claude API key
  saveClaudeKey: (key) => ipcRenderer.invoke('saveClaudeKey', key),

  // 🧠 Ask Claude something
  askClaude: (prompt) => ipcRenderer.invoke('askClaude', prompt),

  // 📄 Write file
  writeFile: (sessionId, relPath, content) =>
    ipcRenderer.invoke('writeFile', sessionId, relPath, content),

  // 💻 Run shell command
  runCommand: (sessionId, command, args) =>
    ipcRenderer.invoke('runCommand', sessionId, command, args),

  // 🚀 Deploy project
  deployTo: (platform, sessionId) =>
    ipcRenderer.invoke('deployTo', platform, sessionId),

  // 🔑 Verify Gumroad license
  verifyLicense: (key) => ipcRenderer.invoke('verify-license', key),
});
