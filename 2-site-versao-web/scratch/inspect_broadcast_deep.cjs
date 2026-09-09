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

async function run() {
  console.log('=== INSPECTING BROADCAST CHAT 1788673682@broadcast ===');
  const bMsgs = await req('/chat/findMessages/' + INSTANCE, 'POST', {
    where: {
      key: {
        remoteJid: '1788673682@broadcast'
      }
    }
  });
  console.log('findMessages for 1788673682@broadcast:', JSON.stringify(bMsgs, null, 2));

  // Let's also search without where clause but limit 100
  const allMsgs = await req('/chat/findMessages/' + INSTANCE, 'POST', { limit: 100, page: 1 });
  const records = allMsgs.messages?.records || [];
  console.log('Total records in findMessages limit 100:', records.length);
  const broadcastRecords = records.filter(m => {
    const rJid = m.key?.remoteJid || m.remoteJid || '';
    return rJid.includes('broadcast') || m.broadcast;
  });
  console.log('Broadcast records found in latest 100:', JSON.stringify(broadcastRecords, null, 2));

  // Check if there are other broadcast chats
  const chats = await req('/chat/findChats/' + INSTANCE, 'POST', {});
  const bChats = (Array.isArray(chats) ? chats : []).filter(c => (c.remoteJid || c.id || '').includes('broadcast'));
  console.log('Broadcast chats:', JSON.stringify(bChats, null, 2));
}

run().catch(console.error);
