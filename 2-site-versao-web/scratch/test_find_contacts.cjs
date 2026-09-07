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
  console.log('--- Fetching all contacts from Evolution API ---');
  const res = await req(`/chat/findContacts/${INSTANCE}`, 'POST', {});
  const contacts = Array.isArray(res.body) ? res.body : [];
  console.log('Total contacts in findContacts:', contacts.length);

  const targets = ['rose', 'camila', 'kauan', '92623060', '992623060', '61992623060'];
  targets.forEach(t => {
    const found = contacts.filter(c => JSON.stringify(c).toLowerCase().includes(t));
    console.log(`\nMatching "${t}": ${found.length} items`);
    found.forEach(item => {
      console.log('  ', JSON.stringify(item).slice(0, 200));
    });
  });
}

main().catch(console.error);
