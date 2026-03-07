const express      = require('express');
const fetch        = require('node-fetch');
const path         = require('path');
const fs           = require('fs');
const crypto       = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── CONFIG ────────────────────────────────────────────────────
const SC_BASE        = 'https://blny.api.sellercloud.com/rest/api';
const MASTER_USER    = process.env.MASTER_USER;
const MASTER_PASS    = process.env.MASTER_PASS;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// ── SESSION STORE (in-memory) ─────────────────────────────────
const sessions   = {};
const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 hours

function createSession(username) {
  const id = crypto.randomBytes(32).toString('hex');
  sessions[id] = { createdAt: Date.now(), username };
  return id;
}

function isValidSession(id) {
  const s = sessions[id];
  if (!s) return false;
  if (Date.now() - s.createdAt > SESSION_TTL) { delete sessions[id]; return false; }
  return true;
}

function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) rc.split(';').forEach(c => {
    const parts = c.split('=');
    list[parts[0].trim()] = decodeURIComponent(parts.slice(1).join('=').trim());
  });
  return list;
}

// ── MIDDLEWARE ────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  req.cookies = parseCookies(req);
  next();
});

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// ── AUTH MIDDLEWARE ───────────────────────────────────────────
function requireAuth(req, res, next) {
  const sid = req.cookies && req.cookies.sid;
  if (!sid || !isValidSession(sid)) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
    return res.redirect('/login');
  }
  next();
}

function setSessionCookie(res, sid) {
  res.setHeader('Set-Cookie',
    `sid=${sid}; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL / 1000}; Path=/`
  );
}

// ── LOGIN PAGE ────────────────────────────────────────────────
app.get('/login', (req, res) => {
  const err = req.query.error;
  const errorHtml = err
    ? `<div class="error">${err === 'invalid' ? 'Invalid username or password. Please try again.' : 'An error occurred. Please try again.'}</div>`
    : '';
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SC Reports — Sign In</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Cabinet+Grotesk:wght@500;700;800&display=swap" rel="stylesheet">
<style>
:root{--bg:#07080f;--s1:#0e0f1a;--s2:#141525;--border:#252740;--accent:#5b6af0;--green:#3ecf8e;--pink:#e05c8a;--text:#dde1f5;--muted:#5a5e80}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--text);font-family:'Cabinet Grotesk',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:var(--s1);border:1px solid var(--border);border-radius:20px;padding:44px 40px;width:100%;max-width:400px}
.logo{display:flex;align-items:center;gap:10px;margin-bottom:36px}
.logo-hex{width:34px;height:34px;background:var(--accent);clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);display:grid;place-items:center;font-size:12px;font-weight:900;color:#fff;flex-shrink:0}
.logo-text{font-size:17px;font-weight:800;letter-spacing:-.4px}
h1{font-size:23px;font-weight:800;margin-bottom:6px}
.sub{font-family:'DM Mono',monospace;font-size:12px;color:var(--muted);margin-bottom:28px;line-height:1.6}
label{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:6px}
input{width:100%;background:var(--s2);border:1px solid var(--border);color:var(--text);padding:12px 14px;border-radius:10px;font-family:'Cabinet Grotesk',sans-serif;font-size:14px;outline:none;transition:border-color .2s;margin-bottom:18px}
input:focus{border-color:var(--accent)}
button{width:100%;padding:13px;border-radius:10px;border:none;background:var(--accent);color:#fff;font-family:'Cabinet Grotesk',sans-serif;font-weight:800;font-size:15px;cursor:pointer;transition:all .18s;margin-top:4px}
button:hover{background:#6b7af5;transform:translateY(-1px);box-shadow:0 4px 20px rgba(91,106,240,.35)}
.error{background:rgba(224,92,138,.1);border:1px solid rgba(224,92,138,.3);color:var(--pink);padding:11px 14px;border-radius:8px;font-size:13px;margin-bottom:20px;font-family:'DM Mono',monospace;line-height:1.5}
.hint{font-family:'DM Mono',monospace;font-size:11px;color:var(--muted);text-align:center;margin-top:20px;line-height:1.7;border-top:1px solid var(--border);padding-top:18px}
</style>
</head>
<body>
<div class="card">
  <div class="logo"><div class="logo-hex">SC</div><div class="logo-text">SC Reports</div></div>
  <h1>Welcome back</h1>
  <p class="sub">Sign in with your SellerCloud credentials to access your reports.</p>
  ${errorHtml}
  <form method="POST" action="/login">
    <label>Username</label>
    <input type="text" name="username" autofocus autocomplete="username" required placeholder="your@email.com">
    <label>Password</label>
    <input type="password" name="password" autocomplete="current-password" required placeholder="••••••••••••">
    <button type="submit">Sign In →</button>
  </form>
  <div class="hint">Use your SellerCloud login credentials.<br>Having trouble? Use your master key instead.</div>
</div>
</body>
</html>`);
});

// POST /login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.redirect('/login?error=invalid');

  // 1. Try SellerCloud authentication
  try {
    const scRes = await fetch(`${SC_BASE}/token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body:    JSON.stringify({ Username: username, Password: password })
    });
    if (scRes.ok) {
      const data = await scRes.json();
      if (data.access_token) {
        const sid = createSession(username);
        setSessionCookie(res, sid);
        console.log(`Login: ${username} authenticated via SellerCloud`);
        return res.redirect('/');
      }
    }
  } catch (e) {
    console.log('SC auth failed, trying master key:', e.message);
  }

  // 2. Fallback to master key
  if (MASTER_USER && MASTER_PASS && username === MASTER_USER && password === MASTER_PASS) {
    const sid = createSession(username);
    setSessionCookie(res, sid);
    console.log(`Login: ${username} authenticated via master key`);
    return res.redirect('/');
  }

  // 3. Both failed
  console.log(`Login failed for: ${username}`);
  res.redirect('/login?error=invalid');
});

// POST /logout
app.post('/logout', (req, res) => {
  const sid = req.cookies && req.cookies.sid;
  if (sid) delete sessions[sid];
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/');
  res.redirect('/login');
});

// ── PROTECTED MAIN PAGE ───────────────────────────────────────
app.get('/', requireAuth, (req, res) => {
  const htmlPath = path.join(__dirname, 'public', 'index.html');
  res.sendFile(htmlPath);
});

// ── SC TOKEN CACHE ────────────────────────────────────────────
// Used internally by the server for API calls — credentials never leave the server
const scTokenCache = {};

async function getTokenForUser(username, password) {
  const key = username;
  const cached = scTokenCache[key];
  if (cached && (cached.expiry - Date.now()) > 5 * 60 * 1000) return cached.token;

  const response = await fetch(`${SC_BASE}/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body:    JSON.stringify({ Username: username, Password: password })
  });
  if (!response.ok) { const e = await response.text(); throw new Error(`Token failed: ${response.status} - ${e}`); }
  const data = await response.json();
  if (!data.access_token) throw new Error('No access_token');
  scTokenCache[key] = { token: data.access_token, expiry: Date.now() + 55 * 60 * 1000 };
  return data.access_token;
}

// For master key users — use env vars SC credentials
async function getToken() {
  return getTokenForUser(process.env.SC_USERNAME, process.env.SC_PASSWORD);
}

// ── API ROUTES (all protected) ────────────────────────────────

// GET /api/health (public)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'SC Reports Gateway', time: new Date().toISOString() });
});

// GET /api/companies
app.get('/api/companies', requireAuth, async (req, res) => {
  try {
    const token = await getToken();
    const url   = `${SC_BASE}/Companies?model.pageSize=${req.query.pageSize||200}&model.pageNumber=1`;
    const r     = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } });
    if (!r.ok) { const e = await r.text(); throw new Error(`SC Companies: ${r.status} - ${e}`); }
    res.json(await r.json());
  } catch (err) { console.error(err.message); res.status(500).json({ error: err.message }); }
});

// GET /api/orders
app.get('/api/orders', requireAuth, async (req, res) => {
  try {
    const token = await getToken();
    const { companyId, from, to, status, page, pageSize } = req.query;
    if (!companyId)   return res.status(400).json({ error: 'companyId required' });
    if (!from || !to) return res.status(400).json({ error: 'from and to required' });
    let url = `${SC_BASE}/Orders?pageNumber=${page||1}&pageSize=${pageSize||50}`;
    url += `&model.companyID=${companyId}&model.createdOnFrom=${from}&model.createdOnTo=${to}`;
    if (status) url += `&model.orderStatus=${status}`;
    const r = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } });
    if (!r.ok) { const e = await r.text(); throw new Error(`SC Orders: ${r.status} - ${e}`); }
    res.json(await r.json());
  } catch (err) { console.error(err.message); res.status(500).json({ error: err.message }); }
});

// POST /api/orders/pnl
app.post('/api/orders/pnl', requireAuth, async (req, res) => {
  try {
    const token    = await getToken();
    const orderIds = req.body.orderIds;
    if (!orderIds || !orderIds.length) return res.status(400).json({ error: 'orderIds required' });
    const r = await fetch(`${SC_BASE}/Orders/ProfitAndLoss`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body:    JSON.stringify({ Orders: orderIds })
    });
    if (!r.ok) { const e = await r.text(); throw new Error(`SC P&L: ${r.status} - ${e}`); }
    res.json(await r.json());
  } catch (err) { console.error(err.message); res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => console.log(`SC Reports Gateway running on port ${PORT}`));
