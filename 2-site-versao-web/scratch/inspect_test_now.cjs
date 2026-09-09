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
  const msgsRes = await fetchApi('/chat/findMessages/' + INSTANCE, 'POST', {
    where: { key: { remoteJid: '1788673682@broadcast' } },
    limit: 5
  });
  const msgs = msgsRes?.messages?.records || [];
  console.log('--- 1. BROADCAST MSGS RECENTES ---');
  msgs.forEach(m => {
    console.log('ID:', m.key?.id, 'TS:', m.messageTimestamp, 'Date:', new Date(m.messageTimestamp * 1000).toLocaleTimeString(), 'text:', JSON.stringify(m.message));
  });

  const latestId = msgs[0]?.key?.id;
  console.log('\n--- 2. STATUS FOR LATEST MSG: ' + latestId + ' ---');
  const sRes = await fetchApi('/chat/findStatusMessage/' + INSTANCE, 'POST', {
    where: { keyId: latestId }
  });
  console.log('Status for ' + latestId + ':', JSON.stringify(sRes, null, 2));

  const allStatus = await fetchApi('/chat/findStatusMessage/' + INSTANCE, 'POST', {
    where: { remoteJid: '1788673682@broadcast' },
    limit: 50
  });
  const records = Array.isArray(allStatus) ? allStatus : (allStatus?.records || []);
  console.log('\n--- 3. ALL STATUS FOR 1788673682@broadcast: ' + records.length + ' ---');
  records.slice(0, 15).forEach(r => {
    console.log('Key:', r.keyId, 'status:', r.status, 'participant:', r.participant, 'updatedAt:', r.updatedAt);
  });
}
run();
