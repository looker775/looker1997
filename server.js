const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const { AnthropicClient } = require('@anthropic-ai/sdk');

dotenv.config();
const app = express();
app.use(bodyParser.json());

// ✅ Claude API Key (from .env)
const claudeKey = process.env.CLAUDE_API_KEY;
const gumroadPermalink = process.env.GUMROAD_PRODUCT_PERMALINK || 'otterf';

// === 🔑 VERIFY LICENSE (Gumroad) ===
app.post('/verify-license', async (req, res) => {
  const { licenseKey } = req.body;
  try {
    const { data } = await axios.post(
      'https://api.gumroad.com/v2/licenses/verify',
      null,
      {
        params: {
          product_permalink: gumroadPermalink,
          license_key: licenseKey
        }
      }
    );

    if (!data.success) return res.json({ success: false, message: '❌ Invalid key' });
    const p = data.purchase;
    if (p.refunded || p.chargebacked) return res.json({ success: false, message: '❌ Refunded' });

    return res.json({
      success: p.subscription_ended_at === null,
      message: p.subscription_ended_at === null ? '✅ Active subscription' : `❌ Expired on ${p.subscription_ended_at}`
    });
  } catch (e) {
    return res.json({ success: false, message: '❌ Gumroad API error' });
  }
});

// === 🧠 ASK CLAUDE ===
app.post('/ask-claude', async (req, res) => {
  const { prompt } = req.body;
  if (!claudeKey) return res.json({ success: false, message: '❌ Claude API key missing' });

  try {
    const client = new AnthropicClient({ apiKey: claudeKey });

    const response = await client.messages.create({
      model: 'claude-3-opus-20240229',
      messages: [{ role: 'user', content: prompt }]
    });

    res.json({ success: true, data: response });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// ✅ Basic home route to test server
app.get('/', (req, res) => {
  res.send('✅ Vibely Coder API is running on Render!');
});

// ✅ Deploy placeholder routes
app.post('/deploy/:platform', (req, res) => {
  const platform = req.params.platform;
  res.json({ success: true, message: `Deploying to ${platform}...` });
});

// === START SERVER ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
