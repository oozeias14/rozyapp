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

function extractCleanPhone(p) {
  if (!p) return '';
  let str = typeof p === 'string' ? p : String(p || '');
  if (str.includes('@')) str = str.split('@')[0];
  if (str.includes(':')) str = str.split(':')[0];
  return str.replace(/\D/g, '');
}

async function run() {
  const targetPhone = '61993654070';
  console.log(`=== INVESTIGANDO THÚLIO CUNHA MORAES (${targetPhone}) ===`);

  const [contacts, chats] = await Promise.all([
    fetchApi('/chat/findContacts/' + INSTANCE, 'POST', {}),
    fetchApi('/chat/findChats/' + INSTANCE, 'POST', {})
  ]);

  console.log('\n--- 1. BUSCA EM CONTATOS ---');
  contacts.forEach(c => {
    const str = JSON.stringify(c);
    if (str.includes('93654070') || str.includes('thulio') || str.includes('Thúlio') || str.includes('Thulio')) {
      console.log('Found in contact:', JSON.stringify(c, null, 2));
    }
  });

  console.log('\n--- 2. BUSCA EM CHATS ---');
  chats.forEach(c => {
    const str = JSON.stringify(c);
    if (str.includes('93654070') || str.includes('thulio') || str.includes('Thúlio') || str.includes('Thulio') || str.includes('74710989680712')) {
      console.log('Found in chat:', JSON.stringify(c, null, 2));
    }
  });

  console.log('\n--- 3. BUSCA EM MENSAGENS RECENTES ---');
  const msgsRes = await fetchApi('/chat/findMessages/' + INSTANCE, 'POST', { limit: 100 });
  const msgs = msgsRes?.messages?.records || [];
  msgs.forEach(m => {
    const str = JSON.stringify(m);
    if (str.includes('93654070') || str.includes('74710989680712')) {
      console.log('Found in message:', JSON.stringify(m, null, 2));
    }
  });

  console.log('\n--- 4. BUSCA EM STATUS MESSAGE ---');
  const sRes = await fetchApi('/chat/findStatusMessage/' + INSTANCE, 'POST', { limit: 100 });
  const sList = Array.isArray(sRes) ? sRes : (sRes?.records || []);
  sList.forEach(s => {
    const str = JSON.stringify(s);
    if (str.includes('93654070') || str.includes('74710989680712')) {
      console.log('Found in statusMessage:', JSON.stringify(s, null, 2));
    }
  });
}

run();
