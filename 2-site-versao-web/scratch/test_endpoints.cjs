const https = require('https');

const SERVER_URL = 'https://evolution-api-production-2522.up.railway.app';
const API_KEY = '6a76cbf204380d04e7ce897ac00e4f204cafea39bc9b7f74fd830a0fe74b8dec';
const INSTANCE = 'dr_candido';

function req(endpoint, method = 'GET', body = null) {
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
    r.on('error', (err) => resolve({ error: err.message }));
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function testEndpoints() {
  const endpoints = [
    { ep: `/group/fetchAllGroups/${INSTANCE}?getParticipants=true`, method: 'GET' },
    { ep: `/chat/findContacts/${INSTANCE}`, method: 'POST', body: {} },
    { ep: `/chat/findStatus/${INSTANCE}`, method: 'POST', body: {} },
    { ep: `/chat/findMessages/${INSTANCE}`, method: 'POST', body: { where: { key: { remoteJid: { contains: 'broadcast' } } } } },
    { ep: `/chat/findMessages/${INSTANCE}`, method: 'POST', body: { where: { broadcast: true } } },
  ];

  for (const { ep, method, body } of endpoints) {
    const res = await req(ep, method, body);
    console.log(`\n=== Testing ${method} ${ep} ===`);
    console.log(`Status: ${res.status}`);
    const str = JSON.stringify(res.data || res.raw || res.error || '').slice(0, 500);
    console.log(`Result: ${str}`);
  }
}

testEndpoints();
