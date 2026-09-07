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
  console.log('--- Searching database for messages containing "teste" ---');
  let page = 1;
  let found = 0;

  while (page <= 10) {
    const res = await req(`/chat/findMessages/${INSTANCE}`, 'POST', {
      limit: 100,
      page: page
    });

    const records = res.body?.messages?.records || [];
    if (!records.length) break;

    records.forEach((m) => {
      const json = JSON.stringify(m).toLowerCase();
      if (json.includes('teste')) {
        found++;
        console.log(`\nFound #${found} (page ${page}):`);
        console.log('  remoteJid:', m.key?.remoteJid || m.remoteJid);
        console.log('  fromMe:', m.key?.fromMe);
        console.log('  pushName:', m.pushName);
        console.log('  userReceipt:', JSON.stringify(m.userReceipt));
        console.log('  message:', JSON.stringify(m.message));
      }
    });

    page++;
  }

  console.log(`\nTotal messages containing "teste" found across ${page-1} pages: ${found}`);
}

main().catch(console.error);
