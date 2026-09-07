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
  console.log('--- 1. Querying messages for 556192623060@s.whatsapp.net ---');
  const res1 = await req(`/chat/findMessages/${INSTANCE}`, 'POST', {
    where: {
      key: {
        remoteJid: '556192623060@s.whatsapp.net'
      }
    },
    limit: 50
  });

  const records = res1.body?.messages?.records || (Array.isArray(res1.body) ? res1.body : []);
  console.log('Records count:', records.length);

  records.forEach((m, i) => {
    const text = m.message?.conversation || m.message?.extendedTextMessage?.text || m.body || JSON.stringify(m.message);
    console.log(`Msg #${i+1}: fromMe=${m.key?.fromMe}, text="${text.slice(0, 100)}"`);
  });
}

main().catch(console.error);
