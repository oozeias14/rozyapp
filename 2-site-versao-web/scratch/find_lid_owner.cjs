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
  console.log('--- 1. BUSCANDO PROFILE / CONTACT PARA 176033647087799 ---');
  const cRes = await fetchApi('/chat/findContacts/' + INSTANCE, 'POST', {
    where: { id: { contains: '176033647087799' } }
  });
  console.log('Contact search:', JSON.stringify(cRes, null, 2));

  const chatsRes = await fetchApi('/chat/findChats/' + INSTANCE, 'POST', {});
  const matchingChat = (chatsRes || []).filter(c => JSON.stringify(c).includes('176033647087799'));
  console.log('Matching chats:', JSON.stringify(matchingChat, null, 2));

  console.log('\n--- 2. ALL CHATS RECENTLY UPDATED ---');
  (chatsRes || []).slice(0, 15).forEach(c => {
    console.log('Chat -> id:', c.id || c.remoteJid, 'name:', c.pushName || c.name, 'lastMsg TS:', c.lastMessage?.messageTimestamp);
  });
}
run();
