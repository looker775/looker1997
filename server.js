const fs = require('fs');
const path = require('path');
const axios = require('axios');
const AdmZip = require('adm-zip');
const { spawn } = require('child_process');
const dotenv = require('dotenv');
const { AnthropicClient } = require('@anthropic-ai/sdk');

dotenv.config();

// === CONFIG ===
const PROJECTS_ROOT = path.join(process.cwd(), 'user-projects');
if (!fs.existsSync(PROJECTS_ROOT)) fs.mkdirSync(PROJECTS_ROOT);

const GUMROAD_PRODUCT_PERMALINK = process.env.GUMROAD_PRODUCT_PERMALINK || "otterf";
let claudeKey = process.env.CLAUDE_API_KEY || null;

// === CORE FUNCTIONS ===

// 🧠 Claude
async function askClaude(prompt) {
  if (!claudeKey) return '❌ Please set a Claude API key first (.env or via UI).';

  try {
    const client = new AnthropicClient({ apiKey: claudeKey });
    const resp = await client.messages.create({
      model: 'claude-3-opus-20240229',
      messages: [{ role: "user", content: prompt }]
    });
    return resp;
  } catch (err) {
    return `❌ Claude error: ${err.message}`;
  }
}

// 🔑 Save Claude API Key
function saveClaudeKey(key) {
  claudeKey = key.trim();
  return { success: !!claudeKey, message: claudeKey ? '✅ Claude key saved' : '❌ Empty key' };
}

// 🔑 Verify Gumroad License
async function verifyLicense(key) {
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
  } catch (e) {
    return { success: false, message: "❌ Gumroad API error" };
  }
}

// 📄 File Write
function writeFile(sessionId, relPath, content) {
  const dir = path.join(PROJECTS_ROOT, sessionId, path.dirname(relPath));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(PROJECTS_ROOT, sessionId, relPath), content, 'utf8');
  return { success: true };
}

