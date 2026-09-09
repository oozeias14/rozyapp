const https = require('https');
const SERVER_URL = 'https://evolution-api-production-2522.up.railway.app';
const API_KEY = '6a76cbf204380d04e7ce897ac00e4f204cafea39bc9b7f74fd830a0fe74b8dec';
const INSTANCE = 'dr_candido';

function fetchApi(endpoint, method = 'POST', body = {}) {
  return new Promise((resolve) => {
    const url = new URL(endpoint, SERVER_URL);
    const req = https.request(url, {
      method,
      headers: { 'apikey': API_KEY, 'Content-Type': 'application/json' }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch { resolve(d); }
      });
    });
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  const res = await fetchApi('/chat/findMessages/' + INSTANCE, 'POST', {
    where: { key: { remoteJid: '1788673682@broadcast' } },
    limit: 20
  });
  const records = res?.messages?.records || res || [];
  console.log('Count:', records.length);
  for (const r of records) {
    console.log('--- MSG ---');
    console.log('key:', r.key);
    console.log('TS:', r.messageTimestamp, 'Date:', new Date(r.messageTimestamp * 1000).toISOString());
    console.log('broadcast:', r.broadcast);
    console.log('message keys:', Object.keys(r.message || {}));
    console.log('participant:', r.participant);
    console.log('status:', r.status);
    console.log('full text:', JSON.stringify(r.message));
  }
}
run();
