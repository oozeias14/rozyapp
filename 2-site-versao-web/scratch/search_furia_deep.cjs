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

async function searchFuria() {
  console.log('=== SEARCHING FOR FURIA IN ALL RECENT MESSAGES ===');
  for (let p = 1; p <= 15; p++) {
    const res = await req('/chat/findMessages/' + INSTANCE, 'POST', { limit: 100, page: p });
    const recs = res.messages?.records || [];
    recs.forEach(m => {
      const str = JSON.stringify(m).toLowerCase();
      if (str.includes('furia') || str.includes('fúria') || str.includes('2')) {
        const text = m.message?.conversation || m.message?.extendedTextMessage?.text || m.body || '';
        if (text.toLowerCase().includes('furia') || text.toLowerCase().includes('fúria')) {
          console.log(`FOUND MSG: page=${p}, id=${m.id}, fromMe=${m.key?.fromMe}, time=${m.messageTimestamp}`);
          console.log(`  remoteJid=${m.key?.remoteJid}, alt=${m.key?.remoteJidAlt}`);
          console.log(`  text="${text}"`);
        }
      }
    });
  }
}

searchFuria().catch(console.error);
