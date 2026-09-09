const https = require('https');
const SERVER_URL = 'https://evolution-api-production-2522.up.railway.app';
const API_KEY = '6a76cbf204380d04e7ce897ac00e4f204cafea39bc9b7f74fd830a0fe74b8dec';
const INSTANCE = 'dr_candido';

function req(endpoint, method = 'POST', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(SERVER_URL + endpoint);
    const options = { method, headers: { apikey: API_KEY, 'Content-Type': 'application/json' } };
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function check() {
  const state = await req('/instance/connectionState/' + INSTANCE, 'GET');
  console.log('Connection state:', state);

  const chats = await req('/chat/findChats/' + INSTANCE, 'POST', {});
  console.log('\nTotal chats in DB:', Array.isArray(chats) ? chats.length : 0);
  if (Array.isArray(chats)) {
    chats.slice(0, 20).forEach(c => {
      console.log('Chat:', c.remoteJid || c.id, '| name:', c.pushName || c.name, '| unread:', c.unreadCount);
    });
  }

  const msgs = await req('/chat/findMessages/' + INSTANCE, 'POST', { limit: 50, page: 1 });
  const records = msgs.messages?.records || [];
  console.log('\nTotal messages in DB:', records.length);
  records.slice(0, 25).forEach((m, idx) => {
    const text = m.message?.conversation || m.message?.extendedTextMessage?.text || m.message?.imageMessage?.caption || m.body || m.text || '';
    const dateStr = m.messageTimestamp ? new Date(m.messageTimestamp * 1000).toLocaleTimeString('pt-BR') : '';
    console.log(`[${idx}] ${dateStr} | remoteJid: ${m.key?.remoteJid} | fromMe: ${m.key?.fromMe} | broadcast: ${m.broadcast || m.key?.remoteJid?.includes('broadcast')} | text: "${text.substring(0, 50)}"`);
  });
}

check().catch(console.error);
