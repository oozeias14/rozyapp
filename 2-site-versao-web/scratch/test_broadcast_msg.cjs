const https = require('https');

const SERVER_URL = 'https://evolution-api-production-2522.up.railway.app';
const API_KEY = '6a76cbf204380d04e7ce897ac00e4f204cafea39bc9b7f74fd830a0fe74b8dec';
const INSTANCE = 'dr_candido';

async function req(endpoint, method = 'POST', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SERVER_URL}${endpoint}`);
    const options = {
      method,
      headers: {
        'apikey': API_KEY,
        'Content-Type': 'application/json',
      }
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('--- Fetching messages for remoteJid: 1788673682@broadcast ---');
  const res1 = await req(`/chat/findMessages/${INSTANCE}`, 'POST', {
    where: {
      key: {
        remoteJid: '1788673682@broadcast'
      }
    },
    limit: 50
  });

  console.log('Broadcast msgs count:', res1.body?.messages?.records?.length || 0);
  if (res1.body?.messages?.records) {
    res1.body.messages.records.forEach((m, i) => {
      console.log(`\nBroadcast Msg #${i+1}:`);
      console.log('  id:', m.id);
      console.log('  key:', JSON.stringify(m.key));
      console.log('  userReceipt:', JSON.stringify(m.userReceipt));
      console.log('  MessageUpdate:', JSON.stringify(m.MessageUpdate));
      console.log('  message:', JSON.stringify(m.message));
    });
  }

  console.log('\n--- Fetching ALL messages with @broadcast in remoteJid ---');
  const chatsRes = await req(`/chat/findChats/${INSTANCE}`, 'POST', {});
  const chats = Array.isArray(chatsRes.body) ? chatsRes.body : [];
  const broadcastChats = chats.filter(c => (c.remoteJid || c.id || '').includes('@broadcast') || c.isBroadcast);
  console.log('Total broadcast chats in findChats:', broadcastChats.length);
  broadcastChats.forEach(bc => {
    console.log('  Broadcast Chat:', bc.id, bc.remoteJid, bc.name, bc.pushName);
  });
}

main().catch(console.error);
