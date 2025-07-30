const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const AdmZip = require('adm-zip');
const { spawn } = require('child_process');
const { AnthropicClient } = require('@anthropic-ai/sdk');
const { createServer } = require('@modelcontextprotocol/server');

// === CONFIG ===
const isDev = !app.isPackaged;
require('dotenv').config({ path: isDev ? path.join(__dirname, '.env') : path.join(process.resourcesPath, '.env') });

// === GLOBALS ===
const GUMROAD_PRODUCT_PERMALINK = "otterf";
const PROJECTS_ROOT = path.join(app.getPath('userData'), 'user-projects');
if (!fs.existsSync(PROJECTS_ROOT)) fs.mkdirSync(PROJECTS_ROOT);

let claudeKey = null;

// === MCP SERVER ===
function startMCPServer() {
  const server = createServer();

  // ✅ Filesystem tools
  server.tool('fs.write', async ({ path: relPath, content }) => {
    const absPath = relPath.startsWith(PROJECTS_ROOT)
      ? relPath
      : path.join(PROJECTS_ROOT, relPath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, 'utf8');
    return { success: true, message: `File written: ${absPath}` };
  });

  server.tool('fs.read', async ({ path: relPath }) => {
    const absPath = relPath.startsWith(PROJECTS_ROOT)
      ? relPath
      : path.join(PROJECTS_ROOT, relPath);
    if (!fs.existsSync(absPath)) return { success: false, message: 'File not found' };
    return { success: true, content: fs.readFileSync(absPath, 'utf8') };
  });

  // ✅ Shell tool
  server.tool('run.command', async ({ command }) => {
    return new Promise((resolve) => {
      const proc = spawn(command, { shell: true });
      let out = '';
      proc.stdout.on('data', d => out += d);
      proc.stderr.on('data', d => out += d);
      proc.on('close', code => resolve({ success: code === 0, output: out }));
    });
  });

  // ✅ Deploy tools connected to real functions
  server.tool('deploy.netlify', async ({ sessionId }) => {
    const dir = path.join(PROJECTS_ROOT, sessionId);
    return await deployNetlify(dir);
  });

  server.tool('deploy.vercel', async ({ sessionId }) => {
    const dir = path.join(PROJECTS_ROOT, sessionId);
    return await deployVercel(dir);
  });

  server.tool('deploy.render', async ({ sessionId }) => {
    const dir = path.join(PROJECTS_ROOT, sessionId);
    return await deployRender(dir);
  });

  // 🚨 Heroku removed entirely

  server.listen(3001);
  console.log('🚀 MCP server running on http://localhost:3001');
}

// === ELECTRON WINDOW ===
function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 800,
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  win.loadFile('index.html');
}

// === LICENSE CHECK ===
ipcMain.handle('verify-license', async (_, key) => {
  try {
    const { data } = await axios.post('https://api.gumroad.com/v2/licenses/verify', null, {
      params: { product_permalink: GUMROAD_PRODUCT_PERMALINK, license_key: key }
    });
    if (!data.success) return { success: false, message: "❌ Invalid key" };
    const p = data.purchase;
    if (p.refunded || p.chargebacked) return { success: false, message: "❌ Refunded" };
    return p.subscription_ended_at === null
      ? { success: true, message: "✅ Active subscription" }
      : { success: false, message: `❌ Expired on ${p.subscription_ended_at}` };
  } catch (e) { return { success: false, message: "❌ Gumroad API error" }; }
});

// === CLAUDE API KEY ===
ipcMain.handle('saveClaudeKey', (_, key) => {
  claudeKey = key.trim();
  return { success: !!claudeKey, message: claudeKey ? '✅ Claude key saved' : '❌ Empty key' };
});

// === CLAUDE WITH MCP TOOLS ===
ipcMain.handle('askClaude', async (_, prompt) => {
  if (!claudeKey) return '❌ Please save Claude API key first.';
  const client = new AnthropicClient({ apiKey: claudeKey });

  const resp = await client.messages.create({
    model: 'claude-3-opus-20240229',
    messages: [{ role: "user", content: prompt }],
    tools: [
      { name: "fs.write", description: "Write a file", input_schema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } },
      { name: "run.command", description: "Run a shell command", input_schema: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } },
      { name: "deploy.netlify", description: "Deploy project to Netlify", input_schema: { type: "object", properties: { sessionId: { type: "string" } } } },
      { name: "deploy.vercel", description: "Deploy project to Vercel", input_schema: { type: "object", properties: { sessionId: { type: "string" } } } },
      { name: "deploy.render", description: "Deploy project to Render", input_schema: { type: "object", properties: { sessionId: { type: "string" } } } }
      // 🚨 Heroku tool removed
    ]
  });

  return resp;
});

// === FILE HELPERS ===
ipcMain.handle('writeFile', async (_, sessionId, relPath, content) => {
  const dir = path.join(PROJECTS_ROOT, sessionId, path.dirname(relPath));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(PROJECTS_ROOT, sessionId, relPath), content, 'utf8');
  return { success: true };
});

ipcMain.handle('runCommand', (_, sessionId, command, args = []) => {
  return new Promise(resolve => {
    const cwd = path.join(PROJECTS_ROOT, sessionId);
    const pr = spawn(command, args, { cwd, shell: true });
    let out = '';
    pr.stdout.on('data', d => out += d);
    pr.stderr.on('data', d => out += d);
    pr.on('close', code => resolve({ code, output: out }));
  });
});

// === DEPLOYMENT HELPERS ===
async function zipFolder(dir) {
  const zip = new AdmZip();
  zip.addLocalFolder(dir);
  const zipPath = path.join(path.dirname(dir), 'deploy.zip');
  zip.writeZip(zipPath);
  return zipPath;
}

// === REAL DEPLOYMENT FUNCTIONS ===

// 🌐 Netlify Deploy
async function deployNetlify(dir) {
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (!token) throw new Error('NETLIFY_AUTH_TOKEN missing in .env');

  const zip = await zipFolder(dir);

  // 1️⃣ Create new site
  const { data: site } = await axios.post(
    'https://api.netlify.com/api/v1/sites',
    {},
    { headers: { Authorization: `Bearer ${token}` } }
  );

  // 2️⃣ Upload deploy ZIP
  await axios.post(
    `https://api.netlify.com/api/v1/sites/${site.site_id}/deploys`,
    fs.createReadStream(zip),
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/zip' } }
  );

  return { success: true, url: site.ssl_url };
}

// 🌐 Vercel Deploy
async function deployVercel(dir) {
  const token = process.env.VERCEL_AUTH_TOKEN;
  if (!token) throw new Error('VERCEL_AUTH_TOKEN missing in .env');

  const zip = await zipFolder(dir);

  // 1️⃣ Create deployment
  const { data: deployment } = await axios.post(
    'https://api.vercel.com/v13/deployments',
    { target: 'production' },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  // 2️⃣ Upload files (Vercel expects PATCH upload of files)
  await axios.patch(
    `https://api.vercel.com/v13/deployments/${deployment.id}/files`,
    fs.createReadStream(zip),
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/zip' } }
  );

  return { success: true, url: `https://${deployment.url}` };
}

// 🌐 Render Deploy
async function deployRender(dir) {
  const token = process.env.RENDER_AUTH_TOKEN;
  const serviceId = process.env.RENDER_SERVICE_ID;
  if (!token) throw new Error('RENDER_AUTH_TOKEN missing in .env');
  if (!serviceId) throw new Error('RENDER_SERVICE_ID missing in .env');

  const zip = await zipFolder(dir);

  // 1️⃣ Request artifact upload URL
  const { data: artifact } = await axios.post(
    'https://api.render.com/v1/artifacts',
    { serviceId },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  // 2️⃣ Upload zip to signed URL
  await axios.put(artifact.uploadUrl, fs.createReadStream(zip), {
    headers: { 'Content-Type': 'application/zip' }
  });

  // 3️⃣ Trigger deploy
  await axios.post(
    `https://api.render.com/v1/services/${serviceId}/deploys`,
    {},
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return { success: true, url: artifact.serviceUrl };
}

// 🚨 Heroku Deploy removed completely

// === DEPLOY HANDLER ===
ipcMain.handle('deployTo', async (_, plat) => {
  try {
    const handlers = { netlify: deployNetlify, vercel: deployVercel, render: deployRender };
    return await handlers[plat](path.join(PROJECTS_ROOT, arguments[1] || ""));
  } catch (e) {
    return { success: false, message: e.toString() };
  }
});

// === STARTUP ===
app.whenReady().then(() => {
  startMCPServer();
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
