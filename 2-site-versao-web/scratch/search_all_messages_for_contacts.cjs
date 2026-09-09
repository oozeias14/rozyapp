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

async function searchPages() {
  console.log('Fetching pages of messages from /chat/findMessages...');
  
  for (let page = 1; page <= 5; page++) {
    const res = await req(`/chat/findMessages/${INSTANCE}`, 'POST', { limit: 100, page });
    const records = res.body?.messages?.records || (Array.isArray(res.body) ? res.body : []);
    console.log(`Page ${page}: fetched ${records.length} records.`);

    records.forEach((m, idx) => {
      const str = JSON.stringify(m);
      if (str.includes('92623060') || str.includes('94409686') || str.includes('98265034') || str.includes('983716917') || str.includes('broadcast') || str.includes('184584893399198') || str.includes('188072490696905')) {
        const text = m.message?.conversation || m.message?.extendedTextMessage?.text || m.body || m.messageType;
        const rJid = m.key?.remoteJid;
        const rAlt = m.key?.remoteJidAlt || m.key?.participantAlt;
        console.log(`  [P${page} #${idx+1}] fromMe=${m.key?.fromMe}, rJid=${rJid}, rAlt=${rAlt}, type=${m.messageType}, text="${(text || '').slice(0, 60)}"`);
      }
    });
  }
}

searchPages().catch(console.error);
