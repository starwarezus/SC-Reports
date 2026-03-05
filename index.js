const express = require('express');
const fetch   = require('node-fetch');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// CORS - must be first
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

app.use(express.json());

// Serve HTML files from the /public folder
// e.g. /public/index.html   -> https://your-url.railway.app/
// e.g. /public/reports.html -> https://your-url.railway.app/reports.html
app.use(express.static(path.join(__dirname, 'public')));

// SellerCloud config
const SC_BASE = 'https://blny.api.sellercloud.com/rest/api';
const SC_USER = process.env.SC_USERNAME || 'henry@goldlabelny.com';
const SC_PASS = process.env.SC_PASSWORD || 'Corishabt1987!!';

// Token cache
let cachedToken = null;
let tokenExpiry = null;

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
    throw new Error(`Token failed: ${response.status} - ${err}`);
  }

  const data = await response.json();
  if (!data.access_token) throw new Error('No access_token in response');

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + 55 * 60 * 1000;
  console.log('New SC token cached');
  return cachedToken;
}

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'SC Reports Gateway', time: new Date().toISOString() });
});

// POST /api/token
app.post('/api/token', async (req, res) => {
  try {
    const token = await getToken();
    res.json({ access_token: token });
  } catch (err) {
    console.error('Token error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/companies
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
      throw new Error(`SC Companies API: ${response.status} - ${err}`);
    }

    const data = await response.json();
    res.json(data);

  } catch (err) {
    console.error('Companies error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`SC Reports Gateway running on port ${PORT}`);
});
