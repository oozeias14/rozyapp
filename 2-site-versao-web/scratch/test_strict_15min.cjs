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

function extractTimestamp(m) {
  if (!m) return 0;
  let ts = m.messageTimestamp || m.timestamp || m.createdAt || m.updatedAt;
  if (!ts && m.lastMessage) ts = m.lastMessage.messageTimestamp || m.lastMessage.createdAt;
  if (!ts) return 0;
  if (typeof ts === 'object' && ts !== null && ts.low) ts = ts.low;
  if (typeof ts === 'string') {
    if (ts.includes('-') || ts.includes('T')) {
      const dt = new Date(ts);
      if (!isNaN(dt.getTime())) ts = Math.floor(dt.getTime() / 1000);
    } else {
      ts = parseInt(ts, 10);
    }
  }
  if (ts > 10000000000) ts = Math.floor(ts / 1000);
  return ts;
}

function isWithin15Minutes(m, maxMinutes = 15) {
  const ts = extractTimestamp(m);
  if (!ts) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  const diffSec = nowSec - ts;
  const diffMin = diffSec / 60;
  console.log(`Msg TS: ${new Date(ts*1000).toLocaleTimeString()} | Now: ${new Date(nowSec*1000).toLocaleTimeString()} | diff: ${diffMin.toFixed(2)} min | valid: ${diffMin >= -1 && diffMin <= maxMinutes}`);
  return diffMin >= -1 && diffMin <= maxMinutes;
}

async function run() {
  console.log('--- TESTANDO MENSAGENS EM BROADCAST COM FILTRO ESTRITO DE 15 MIN ---');
  const msgsRes = await fetchApi('/chat/findMessages/' + INSTANCE, 'POST', {
    where: { key: { remoteJid: '1788673682@broadcast' } },
    limit: 10
  });
  const msgs = msgsRes?.messages?.records || [];
  
  const matchingMsgIds = new Set();
  msgs.forEach(m => {
    const isOk = isWithin15Minutes(m, 15);
    if (isOk && m.key?.id) matchingMsgIds.add(m.key.id);
  });

  console.log('\nMatching Msg IDs nos últimos 15 min:', Array.from(matchingMsgIds));
}
run();
