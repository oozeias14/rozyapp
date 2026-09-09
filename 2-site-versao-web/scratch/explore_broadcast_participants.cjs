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
  const bJid = '1788673682@broadcast';
  console.log('=== EXPLORING BROADCAST PARTICIPANTS IN EVOLUTION API ===');

  const tests = [
    { name: 'findChat', ep: `/chat/findChat/${INSTANCE}`, m: 'POST', b: { remoteJid: bJid } },
    { name: 'fetchProfile', ep: `/chat/fetchProfile/${INSTANCE}`, m: 'POST', b: { number: bJid } },
    { name: 'findStatusMessage', ep: `/chat/findStatusMessage/${INSTANCE}`, m: 'POST', b: { where: { remoteJid: bJid } } },
    { name: 'findContacts', ep: `/chat/findContacts/${INSTANCE}`, m: 'POST', b: { where: { remoteJid: bJid } } },
    { name: 'fetchAllGroups', ep: `/group/fetchAllGroups/${INSTANCE}?getParticipants=true`, m: 'GET', b: null }
  ];

  for (const t of tests) {
    console.log(`\n--- Test: ${t.name} (${t.m} ${t.ep}) ---`);
    const res = await req(t.ep, t.m, t.b);
    console.log(`Status: ${res.status}`);
    console.log(JSON.stringify(res.data || res.raw || res.error, null, 2).substring(0, 500));
  }
}

run().catch(console.error);
