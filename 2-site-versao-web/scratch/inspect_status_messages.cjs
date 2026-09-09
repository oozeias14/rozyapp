const https = require('https');
const SERVER_URL = 'https://evolution-api-production-2522.up.railway.app';
const API_KEY = '6a76cbf204380d04e7ce897ac00e4f204cafea39bc9b7f74fd830a0fe74b8dec';
const INSTANCE = 'dr_candido';

function req(endpoint, method = 'POST', body = null) {
  return new Promise((resolve) => {
    const url = new URL(SERVER_URL + endpoint);
    const options = { method, headers: { apikey: API_KEY, 'Content-Type': 'application/json' } };
    const r = https.request(url, options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    r.on('error', e => resolve({ error: e.message }));
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function run() {
  const statusRes = await req('/chat/findStatusMessage/' + INSTANCE, 'POST', {});
  console.log('Total status records:', Array.isArray(statusRes.data) ? statusRes.data.length : statusRes.data);
  if (Array.isArray(statusRes.data)) {
    statusRes.data.forEach((s, idx) => {
      console.log(`[${idx}] keyId: ${s.keyId} | remoteJid: ${s.remoteJid} | participant: ${s.participant} | status: ${s.status} | updatedAt: ${s.updatedAt || s.createdAt}`);
    });
  }
}

run().catch(console.error);
