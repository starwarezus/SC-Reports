const express = require('express');
const fetch   = require('node-fetch');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── CORS ──────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

app.use(express.json());

// ── SELLERCLOUD CONFIG ────────────────────────────────────────
const SC_BASE = 'https://blny.api.sellercloud.com/rest/api';
const SC_USER = process.env.SC_USERNAME || 'henry@goldlabelny.com';
const SC_PASS = process.env.SC_PASSWORD || 'Corishabt1987!!';

// ── TOKEN CACHE ───────────────────────────────────────────────
let cachedToken  = null;
let tokenExpiry  = null;

async function getToken() {
  if (cachedToken && tokenExpiry && (tokenExpiry - Date.now()) > 5 * 60 * 1000) {
    return cachedToken;
  }

  const response = await fetch(`${SC_BASE}/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body:    JSON.stringify({ Username: SC_USER, Password: SC_PASS })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Token failed: ${response.status} — ${err}`);
  }

  const data = await response.json();
  if (!data.access_token) throw new Error('No access_token in response');

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + 55 * 60 * 1000; // 55 min
  console.log('New token cached');
  return cachedToken;
}

// ── HEALTH CHECK ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'SC Reports Gateway', time: new Date().toISOString() });
});

// ── TOKEN ENDPOINT ────────────────────────────────────────────
// Returns a fresh (or cached) SC token to the frontend
app.post('/api/token', async (req, res) => {
  try {
    const token = await getToken();
    res.json({ access_token: token });
  } catch (err) {
    console.error('Token error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── COMPANIES ─────────────────────────────────────────────────
// GET /api/companies
// Query params: pageSize (default 200), pageNumber (default 1), keyword
app.get('/api/companies', async (req, res) => {
  try {
    const token      = await getToken();
    const pageSize   = req.query.pageSize   || 200;
    const pageNumber = req.query.pageNumber || 1;
    const keyword    = req.query.keyword    || '';

    let url = `${SC_BASE}/Companies?model.pageSize=${pageSize}&model.pageNumber=${pageNumber}`;
    if (keyword) url += `&model.keyword=${encodeURIComponent(keyword)}`;

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`SC Companies API: ${response.status} — ${err}`);
    }

    const data = await response.json();
    res.json(data);

  } catch (err) {
    console.error('Companies error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── START ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`SC Reports Gateway running on port ${PORT}`);
});
