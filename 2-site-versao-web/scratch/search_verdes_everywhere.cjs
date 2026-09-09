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
  const targetId = 'AC7E6F10726ACF4DBEF6A842205BFD9D';
  console.log(`=== SEARCHING FOR MESSAGE ID ${targetId} AND PHRASE "Verdes" ===`);

  // Search across multiple pages
  for (let p = 1; p <= 5; p++) {
    const res = await req('/chat/findMessages/' + INSTANCE, 'POST', { limit: 100, page: p });
    const records = res.messages?.records || [];
    records.forEach(m => {
      const text = JSON.stringify(m.message || '');
      const id = m.key?.id;
      const rJid = m.key?.remoteJid || m.remoteJid;
      if (id === targetId || text.toLowerCase().includes('verdes')) {
        console.log(`[Page ${p}] Found msg in JID: ${rJid} | ID: ${id} | fromMe: ${m.key?.fromMe} | Text: ${text}`);
      }
    });
  }

  // Check findStatusMessage
  const statusRes = await req('/chat/findStatusMessage/' + INSTANCE, 'POST', {});
  const sList = Array.isArray(statusRes) ? statusRes : [];
  console.log(`\nTotal status records: ${sList.length}`);
  sList.forEach(s => {
    if (s.keyId === targetId || s.messageId === targetId) {
      console.log(`Found in status: keyId: ${s.keyId} | remoteJid: ${s.remoteJid} | status: ${s.status}`);
    }
  });

  // Check all chats in findChats
  const chats = await req('/chat/findChats/' + INSTANCE, 'POST', {});
  console.log(`\nTotal chats: ${Array.isArray(chats) ? chats.length : 0}`);
  (Array.isArray(chats) ? chats : []).forEach(c => {
    const lastM = c.lastMessage;
    const text = JSON.stringify(lastM?.message || '');
    if (lastM?.key?.id === targetId || text.toLowerCase().includes('verdes')) {
      console.log(`Found in chat ${c.remoteJid || c.id} (name: ${c.pushName || c.name}) | ID: ${lastM?.key?.id} | text: ${text}`);
    }
  });
}

run().catch(console.error);
