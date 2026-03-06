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

// Serve HTML from /public
app.use(express.static(path.join(__dirname, 'public')));

// SellerCloud config
const SC_BASE     = 'https://blny.api.sellercloud.com/rest/api';
const SC_BASE_PNL = 'https://blny.api.sellercloud.com/api';   // P&L uses different base path
const SC_USER     = process.env.SC_USERNAME || 'henry@goldlabelny.com';
const SC_PASS     = process.env.SC_PASSWORD || 'Corishabt1987!!';

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

    const url = `${SC_BASE}/Companies?model.pageSize=${pageSize}&model.pageNumber=${pageNumber}`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`SC Companies: ${response.status} - ${err}`);
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Companies error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders?companyId=&from=&to=&status=&page=&pageSize=
// Fetches one page of orders — frontend loops pages itself so it can show progress
app.get('/api/orders', async (req, res) => {
  try {
    const token      = await getToken();
    const companyId  = req.query.companyId;
    const from       = req.query.from;
    const to         = req.query.to;
    const status     = req.query.status     || '';
    const page       = req.query.page       || 1;
    const pageSize   = req.query.pageSize   || 50;

    if (!companyId) return res.status(400).json({ error: 'companyId is required' });
    if (!from || !to) return res.status(400).json({ error: 'from and to dates are required' });

    let url = `${SC_BASE}/Orders?pageNumber=${page}&pageSize=${pageSize}`;
    url += `&model.companyID=${companyId}`;
    url += `&model.createdOnFrom=${from}&model.createdOnTo=${to}`;
    if (status) url += `&model.orderStatus=${status}`;

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`SC Orders: ${response.status} - ${err}`);
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Orders error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/pnl
// Body: { "orderIds": [123, 456, ...] }
// Calls SC's P&L endpoint and returns the results
app.post('/api/orders/pnl', async (req, res) => {
  try {
    const token    = await getToken();
    const orderIds = req.body.orderIds;

    if (!orderIds || !orderIds.length) {
      return res.status(400).json({ error: 'orderIds array is required' });
    }

    const url = `${SC_BASE_PNL}/Orders/ProfitAndLoss`;
    const response = await fetch(url, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json'
      },
      body: JSON.stringify({ Orders: orderIds })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`SC P&L: ${response.status} - ${err}`);
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('P&L error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`SC Reports Gateway running on port ${PORT}`);
});
