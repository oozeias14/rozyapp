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

async function inspectBroadcastTarget() {
  console.log('=== BUSCANDO MENSAGENS COM ID AC478B4294785B078D71874B91DFEE05 OU 1788673682@broadcast ===');
  
  for (let page = 1; page <= 20; page++) {
    const res = await req(`/chat/findMessages/${INSTANCE}`, 'POST', { limit: 100, page });
    const records = res.body?.messages?.records || (Array.isArray(res.body) ? res.body : []);
    
    records.forEach((m, idx) => {
      const str = JSON.stringify(m);
      if (str.includes('AC478B4294785B078D71874B91DFEE05') || str.includes('1788673682@broadcast')) {
        console.log(`\n[P${page} #${idx+1}] ID=${m.id}, remoteJid=${m.key?.remoteJid}`);
        console.log(`Key:`, JSON.stringify(m.key));
        console.log(`Full Object:`, JSON.stringify(m, null, 2));
      }
    });
  }
}

inspectBroadcastTarget().catch(console.error);
