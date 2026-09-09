const https = require('https');

const SERVER_URL = 'https://evolution-api-production-2522.up.railway.app';
const API_KEY = '6a76cbf204380d04e7ce897ac00e4f204cafea39bc9b7f74fd830a0fe74b8dec';
const INSTANCE = 'dr_candido';

function apiFetch(endpoint, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, SERVER_URL);
    const options = {
      method,
      headers: {
        'apikey': API_KEY,
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('=== 1. CHATS COM @broadcast ===');
  const chats = await apiFetch('/chat/findChats/' + INSTANCE, 'POST', {});
  const bChats = (chats || []).filter(c => (c.remoteJid || c.id || '').includes('@broadcast'));
  console.log('Broadcast chats count:', bChats.length);
  for (const bc of bChats) {
    console.log('Broadcast chat:', bc.remoteJid || bc.id, 'name:', bc.pushName || bc.name);
  }

  console.log('\n=== 2. MENSAGENS EM LISTAS DE TRANSMISSÃO ===');
  for (const bc of bChats) {
    const jid = bc.remoteJid || bc.id;
    const msgs = await apiFetch('/chat/findMessages/' + INSTANCE, 'POST', {
      where: { key: { remoteJid: jid } },
      limit: 10
    });
    const recs = msgs?.messages?.records || (Array.isArray(msgs) ? msgs : []);
    console.log('Mensagens em ' + jid + ':', recs.length);
    recs.forEach(m => {
      const ts = m.messageTimestamp || m.timestamp;
      console.log(' -> ID:', m.key?.id, 'TS:', new Date(ts * 1000).toLocaleTimeString(), 'Broadcast:', m.broadcast, 'message:', JSON.stringify(m.message).slice(0, 80));
    });
  }

  console.log('\n=== 3. MENSAGENS DIRETAS DOS CONTATOS QUE RECEBERAM A TRANSMISSAO ===');
  const allMsgsRes = await apiFetch('/chat/findMessages/' + INSTANCE, 'POST', { limit: 50 });
  const allRecs = allMsgsRes?.messages?.records || (Array.isArray(allMsgsRes) ? allMsgsRes : []);
  console.log('Total mensagens recentes:', allRecs.length);
  allRecs.slice(0, 20).forEach(m => {
    const ts = m.messageTimestamp || m.timestamp;
    console.log('Msg -> remoteJid:', m.key?.remoteJid, 'fromMe:', m.key?.fromMe, 'broadcast:', m.broadcast, 'TS:', new Date(ts * 1000).toLocaleTimeString(), 'text:', JSON.stringify(m.message).slice(0, 60));
  });

  console.log('\n=== 4. STATUS MESSAGE (RECIBOS DE ENTREGA) ===');
  const statusRes = await apiFetch('/chat/findStatusMessage/' + INSTANCE, 'POST', { limit: 50 });
  const sList = Array.isArray(statusRes) ? statusRes : (statusRes?.records || []);
  console.log('Total status records:', sList.length);
  sList.slice(0, 25).forEach(s => {
    console.log('Status -> remoteJid:', s.remoteJid, 'participant:', s.participant, 'status:', s.status, 'keyId:', s.keyId, 'time:', s.updatedAt || s.createdAt);
  });
}

main().catch(console.error);
