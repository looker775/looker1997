#!/usr/bin/env node

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

let mainWindow;
let cliProcess;

// 📂 Создаём папку для данных программы
const userDataPath = path.join(process.env.APPDATA || __dirname, 'VibelyCoder');
if (!fs.existsSync(userDataPath)) {
  fs.mkdirSync(userDataPath, { recursive: true });
}

const keysFile = path.join(userDataPath, 'keys.json');
const activatedFile = path.join(userDataPath, 'activated.json');

// ✅ Если keys.json ещё не скопирован → копируем из exe
const originalKeysPath = path.join(__dirname, 'keys.json');
if (!fs.existsSync(keysFile) && fs.existsSync(originalKeysPath)) {
  fs.copyFileSync(originalKeysPath, keysFile);
}

// ✅ Читаем ключи
let validKeys = [];
if (fs.existsSync(keysFile)) {
  validKeys = JSON.parse(fs.readFileSync(keysFile, 'utf-8'));
} else {
  console.log('❌ keys.json не найден! Создай файл с ключами.');
  process.exit(1);
}

// ✅ Проверяем активацию
if (fs.existsSync(activatedFile)) {
  console.log('✅ Приложение уже активировано.');
  app.whenReady().then(createWindow);
} else {
  askLicense();
}

// === 🔑 Лицензия ===
function askLicense() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('🔑 Enter your VibelyCoder License Key: ', function (key) {
    if (validKeys.includes(key)) {
      console.log('✅ License activated! Welcome to VibelyCoder.');

      validKeys = validKeys.filter(k => k !== key);
      fs.writeFileSync(keysFile, JSON.stringify(validKeys, null, 2));

      fs.writeFileSync(activatedFile, JSON.stringify({ key, date: new Date() }, null, 2));

      rl.close();
      app.whenReady().then(createWindow);
    } else {
      console.log('❌ Invalid license. Please restart and try again.');
      rl.close();
    }
  });
}

// === 🪟 Создаём окно ===
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile('index.html');
}

// === 🎯 CLI Integration ===
ipcMain.handle('open-cli', async () => {
  if (cliProcess) {
    return { success: false, message: 'CLI already running' };
  }

  const cliPath = path.join(process.resourcesPath, 'cli', 'cli.exe');
  cliProcess = spawn(cliPath, [], { shell: true });

  let output = '';
  cliProcess.stdout.on('data', (data) => {
    output += data.toString();
    mainWindow.webContents.send('cli-output', data.toString());
  });

  cliProcess.stderr.on('data', (data) => {
    output += data.toString();
    mainWindow.webContents.send('cli-output', data.toString());
  });

  cliProcess.on('close', (code) => {
    mainWindow.webContents.send('cli-output', `\nCLI exited with code ${code}`);
    cliProcess = null;
  });

  return { success: true, message: 'CLI started' };
});

ipcMain.handle('send-cli-command', (_, command) => {
  if (cliProcess) {
    cliProcess.stdin.write(command + '\n');
    return { success: true };
  }
  return { success: false, message: 'CLI is not running' };
});

