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
  const now = Math.floor(Date.now() / 1000);
  console.log(`Current timestamp: ${now} (${new Date().toLocaleTimeString('pt-BR')})`);

  // Let's get the latest 50 messages
  const res = await req('/chat/findMessages/' + INSTANCE, 'POST', { limit: 50, page: 1 });
  const recs = res.messages?.records || [];
  console.log(`Found ${recs.length} messages on page 1`);
  
  recs.forEach((m, i) => {
    let ts = m.messageTimestamp || m.createdAt;
    if (typeof ts === 'object' && ts?.low) ts = ts.low;
    if (typeof ts === 'string') ts = parseInt(ts, 10);
    if (ts > 10000000000) ts = Math.floor(ts / 1000);
    const minAgo = ((now - ts) / 60).toFixed(1);

    console.log(`\n--- [${i+1}] ${minAgo} min ago ---`);
    console.log(`ID: ${m.id} | msgId: ${m.key?.id} | fromMe: ${m.key?.fromMe}`);
    console.log(`remoteJid: ${m.key?.remoteJid} | alt: ${m.key?.remoteJidAlt} | part: ${m.key?.participant}`);
    console.log(`type: ${m.messageType}`);
    console.log(`text:`, m.message?.conversation || m.message?.extendedTextMessage?.text || m.body || m.messageType);
    if (m.message?.reactionMessage) console.log(`reaction:`, m.message.reactionMessage);
    if (m.userReceipt) console.log(`userReceipt:`, m.userReceipt);
    if (m.MessageUpdate) console.log(`MessageUpdate:`, m.MessageUpdate);
  });
}

run().catch(console.error);
