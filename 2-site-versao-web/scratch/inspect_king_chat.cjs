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
  const chatsRes = await fetchApi('/chat/findChats/' + INSTANCE, 'POST', {});
  const kingChat = (chatsRes || []).find(c => (c.pushName || c.name || '').includes('King') || c.id === 'cmts4ix650nlvti4ltcu80v3i');
  console.log('King Chat:', JSON.stringify(kingChat, null, 2));

  const msgs = await fetchApi('/chat/findMessages/' + INSTANCE, 'POST', {
    where: { key: { remoteJid: kingChat.remoteJid || kingChat.id } },
    limit: 5
  });
  console.log('King msgs:', JSON.stringify(msgs, null, 2));
}
run();
