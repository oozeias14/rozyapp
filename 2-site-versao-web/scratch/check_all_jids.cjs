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
  const sRes = await fetchApi('/chat/findStatusMessage/' + INSTANCE, 'POST', { limit: 100 });
  const records = Array.isArray(sRes) ? sRes : (sRes?.records || []);
  
  const allJids = new Set();
  records.forEach(r => {
    if (r.participant) allJids.add(r.participant);
    if (r.remoteJid) allJids.add(r.remoteJid);
  });
  
  console.log('All unique JIDs in statusMessage:', Array.from(allJids));
}
run();
