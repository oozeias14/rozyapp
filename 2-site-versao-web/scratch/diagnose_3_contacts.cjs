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
  console.log('=== 1. ÚLTIMAS MENSAGENS EM BROADCASTS ===');
  const chats = await fetchApi('/chat/findChats/' + INSTANCE, 'POST', {});
  const bChats = (chats || []).filter(c => (c.remoteJid || c.id || '').includes('@broadcast'));
  for (const bc of bChats) {
    const jid = bc.remoteJid || bc.id;
    const msgsRes = await fetchApi('/chat/findMessages/' + INSTANCE, 'POST', {
      where: { key: { remoteJid: jid } },
      limit: 5
    });
    const msgs = msgsRes?.messages?.records || [];
    console.log(`\nChat Broadcast ${jid} (${bc.pushName || bc.name}) -> Total msgs: ${msgs.length}`);
    msgs.forEach(m => {
      const ts = m.messageTimestamp || m.timestamp;
      console.log(' - Msg ID:', m.key?.id, 'TS:', new Date(ts * 1000).toISOString(), 'Local:', new Date(ts * 1000).toLocaleTimeString(), 'text:', JSON.stringify(m.message));
    });
  }

  console.log('\n=== 2. ÚLTIMOS STATUS MESSAGES (RECIBOS) ===');
  const sRes = await fetchApi('/chat/findStatusMessage/' + INSTANCE, 'POST', { limit: 100 });
  const sList = Array.isArray(sRes) ? sRes : (sRes?.records || []);
  console.log('Total status records:', sList.length);
  sList.slice(0, 30).forEach(s => {
    console.log('Status -> keyId:', s.keyId, 'remoteJid:', s.remoteJid, 'participant:', s.participant, 'status:', s.status, 'createdAt/updatedAt:', s.updatedAt || s.createdAt);
  });

  console.log('\n=== 3. ÚLTIMOS CHATS INDIVIDUAIS COM MENSAGENS RECENTES ===');
  (chats || []).slice(0, 20).forEach(c => {
    const ts = c.lastMessage?.messageTimestamp;
    console.log('Chat:', c.remoteJid || c.id, 'name:', c.pushName || c.name, 'TS:', ts ? new Date(ts * 1000).toLocaleTimeString() : 'none', 'lastMsg:', JSON.stringify(c.lastMessage?.message).slice(0, 50));
  });
}

run();
