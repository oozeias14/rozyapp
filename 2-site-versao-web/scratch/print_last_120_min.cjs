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
  console.log(`Current time: ${now} (${new Date().toLocaleTimeString('pt-BR')})`);

  // Let's check 5 pages of findMessages
  for (let p = 1; p <= 5; p++) {
    const res = await req('/chat/findMessages/' + INSTANCE, 'POST', { limit: 100, page: p });
    const recs = res.messages?.records || [];
    recs.forEach((m, idx) => {
      let ts = m.messageTimestamp;
      if (typeof ts === 'object' && ts?.low) ts = ts.low;
      if (typeof ts === 'string') ts = parseInt(ts, 10);
      if (ts > 10000000000) ts = Math.floor(ts / 1000);

      const diffMin = ((now - ts) / 60).toFixed(1);
      // If within last 120 minutes
      if (ts && (now - ts) <= 7200) {
        const text = m.message?.conversation || m.message?.extendedTextMessage?.text || m.body || m.messageType;
        console.log(`\n[P${p} #${idx+1}] ${diffMin} min ago | fromMe=${m.key?.fromMe} | rJid=${m.key?.remoteJid} | alt=${m.key?.remoteJidAlt}`);
        console.log(`  type: ${m.messageType}`);
        console.log(`  text: "${text}"`);
        console.log(`  key:`, JSON.stringify(m.key));
        if (m.message?.reactionMessage) console.log(`  reaction:`, JSON.stringify(m.message.reactionMessage));
      }
    });
  }
}

run().catch(console.error);
