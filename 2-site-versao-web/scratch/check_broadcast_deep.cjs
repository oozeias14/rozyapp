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
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  console.log('=== CHECKING ALL BROADCAST CHATS & MESSAGES ===');
  
  // 1. findChats
  const chats = await req('/chat/findChats/' + INSTANCE, 'POST', {});
  console.log('Total chats:', chats.length);
  const broadcastChats = chats.filter(c => (c.id || c.remoteJid || '').includes('broadcast') || c.isBroadcast);
  console.log('Broadcast chats in findChats:', JSON.stringify(broadcastChats, null, 2));

  // 2. findStatus (WhatsApp status / stories / broadcasts)
  const statusRes = await req('/chat/findStatus/' + INSTANCE, 'POST', {}).catch(e => ({ error: e.message }));
  console.log('findStatus res:', JSON.stringify(statusRes).slice(0, 500));

  // 3. Let's check all messages across 10 pages
  let allBroadcastMsgs = [];
  for (let p=1; p<=10; p++) {
    const r = await req('/chat/findMessages/' + INSTANCE, 'POST', { limit: 100, page: p });
    const recs = r.messages?.records || [];
    recs.forEach(m => {
      const s = JSON.stringify(m);
      if (s.includes('broadcast') || m.broadcast || m.isBroadcast) {
        allBroadcastMsgs.push(m);
      }
    });
  }
  console.log('Total messages mentioning broadcast in 10 pages:', allBroadcastMsgs.length);
  allBroadcastMsgs.forEach((m, idx) => {
    console.log(`\n[Broadcast Msg #${idx+1}] ID=${m.id}`);
    console.log(`  key=`, JSON.stringify(m.key));
    console.log(`  text=`, m.message?.conversation || m.message?.extendedTextMessage?.text || m.body || m.messageType);
    console.log(`  userReceipt=`, JSON.stringify(m.userReceipt));
    console.log(`  MessageUpdate=`, JSON.stringify(m.MessageUpdate));
    console.log(`  full=`, JSON.stringify(m).slice(0, 500));
  });
}

run().catch(console.error);
