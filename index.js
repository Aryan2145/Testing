const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');

const app = express();
const port = process.env.PORT || 3000;

// Serve index.html with PUBLIC_TEST_VAR injected
app.get('/', (req, res) => {
  let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  html = html.replace('__PUBLIC_TEST_VAR__', process.env.PUBLIC_TEST_VAR || '(not set)');
  res.send(html);
});

app.get('/api/hello', (req, res) => {
  res.json({
    message: 'Hello from Backend',
    secret: process.env.SECRET_TEST_VAR || '(not set)',
  });
});

// Test Supabase connection — uses built-in https (works on all Node versions)
function supabasePing(supabaseUrl, key) {
  return new Promise((resolve, reject) => {
    const target = new URL('/rest/v1/', supabaseUrl);
    const options = {
      hostname: target.hostname,
      path: target.pathname,
      method: 'GET',
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    };
    const req = https.request(options, (r) => {
      resolve({ ok: r.statusCode >= 200 && r.statusCode < 300, status: r.statusCode });
      r.resume(); // drain response
    });
    req.on('error', reject);
    req.end();
  });
}

app.get('/api/db', async (req, res) => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return res.json({ connected: false, error: 'SUPABASE_URL or SUPABASE_ANON_KEY not set' });
  }

  try {
    const r = await supabasePing(url, key);
    res.json({ connected: r.ok, status: r.status, project: url });
  } catch (err) {
    console.error('[/api/db error]', err);
    res.json({ connected: false, error: err.message || err.code || String(err) || 'unknown error' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
