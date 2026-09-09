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
  console.log('=== SEARCHING ALL DB FOR USER RECEIPT & UPDATES ===');
  for (let p = 1; p <= 10; p++) {
    const res = await req('/chat/findMessages/' + INSTANCE, 'POST', { limit: 100, page: p });
    const recs = res.messages?.records || [];
    recs.forEach((m) => {
      const hasReceipt = (Array.isArray(m.userReceipt) && m.userReceipt.length > 0) || (Array.isArray(m.MessageUpdate) && m.MessageUpdate.length > 0);
      const isBroadcast = (m.key?.remoteJid || '').includes('broadcast') || m.broadcast;
      if (hasReceipt || isBroadcast) {
        console.log(`\nMsg ID=${m.id}, msgId=${m.key?.id}, remoteJid=${m.key?.remoteJid}`);
        console.log(`  fromMe=${m.key?.fromMe}, type=${m.messageType}`);
        console.log(`  text:`, m.message?.conversation || m.message?.extendedTextMessage?.text || m.body || m.messageType);
        console.log(`  MessageUpdate:`, JSON.stringify(m.MessageUpdate));
        console.log(`  userReceipt:`, JSON.stringify(m.userReceipt));
      }
    });
  }
}

run().catch(console.error);
