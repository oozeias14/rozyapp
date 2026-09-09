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
  console.log('--- BUSCANDO TODAS AS MENSAGENS DAS ULTIMAS 2 HORAS ---');
  const msgsRes = await fetchApi('/chat/findMessages/' + INSTANCE, 'POST', { limit: 100 });
  const msgs = msgsRes?.messages?.records || [];

  const chatsRes = await fetchApi('/chat/findChats/' + INSTANCE, 'POST', {});
  console.log('Total chats:', chatsRes.length);

  for (const c of chatsRes) {
    const rJid = c.remoteJid || c.id || '';
    if (rJid.includes('@g.us') || rJid.includes('@broadcast')) continue;
    const ts = c.lastMessage?.messageTimestamp;
    const dateStr = ts ? new Date(ts * 1000).toLocaleTimeString() : 'N/A';
    console.log(`Chat 1:1 -> ${rJid} (${c.pushName || c.name || 'Sem nome'}) | lastMsg: ${dateStr} | text: ${JSON.stringify(c.lastMessage?.message).slice(0, 60)}`);
  }
}
run();
