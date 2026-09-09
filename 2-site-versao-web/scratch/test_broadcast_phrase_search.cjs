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
  console.log('=== SEARCHING MESSAGES WITH BROADCAST OR FRASE ===');
  
  // Let's test findMessages with page 1, 2, 3
  const res = await req('/chat/findMessages/' + INSTANCE, 'POST', { limit: 100, page: 1 });
  const records = res.messages?.records || [];
  console.log(`Page 1 returned ${records.length} records`);

  records.slice(0, 20).forEach((m, idx) => {
    console.log(`\n[#${idx+1}] ID=${m.id}, msgId=${m.key?.id}, fromMe=${m.key?.fromMe}`);
    console.log(`  remoteJid=${m.key?.remoteJid}, alt=${m.key?.remoteJidAlt}, part=${m.key?.participant}`);
    console.log(`  type=${m.messageType}`);
    console.log(`  text:`, m.message?.conversation || m.message?.extendedTextMessage?.text || m.body || m.messageType);
    if (m.message?.reactionMessage) {
      console.log(`  reactionKey:`, JSON.stringify(m.message.reactionMessage.key));
    }
  });
}

run().catch(console.error);
