const https = require('https');
const SERVER_URL = 'https://evolution-api-production-2522.up.railway.app';
const API_KEY = '6a76cbf204380d04e7ce897ac00e4f204cafea39bc9b7f74fd830a0fe74b8dec';
const INSTANCE = 'dr_candido';

function fetchApi(endpoint, method = 'POST', body = {}) {
  return new Promise((resolve) => {
    const url = new URL(endpoint, SERVER_URL);
    const req = https.request(url, {
      method,
      headers: { 'apikey': API_KEY, 'Content-Type': 'application/json' }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch { resolve(d); }
      });
    });
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  const pRes = await fetchApi('/chat/fetchProfile/' + INSTANCE, 'POST', {
    number: '176033647087799@lid'
  });
  console.log('Profile for 176033647087799@lid:', JSON.stringify(pRes, null, 2));

  const msgs = await fetchApi('/chat/findMessages/' + INSTANCE, 'POST', { limit: 300 });
  const records = msgs?.messages?.records || [];
  for (const m of records) {
    const str = JSON.stringify(m);
    if (str.includes('176033647087799')) {
      console.log('Found in msg:', m.key?.remoteJid, 'remoteJidAlt:', m.key?.remoteJidAlt, 'participant:', m.key?.participant, 'participantAlt:', m.key?.participantAlt, 'pushName:', m.pushName);
    }
  }
}
run();
