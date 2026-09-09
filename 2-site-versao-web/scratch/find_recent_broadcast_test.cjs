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
  const nowSec = Math.floor(Date.now() / 1000);
  console.log(`Current time: ${nowSec} (${new Date().toLocaleTimeString('pt-BR')})`);

  console.log('=== BUSCANDO TODAS AS MENSAGENS DOS ÚLTIMOS 90 MINUTOS ===');
  
  for (let page = 1; page <= 5; page++) {
    const res = await req(`/chat/findMessages/${INSTANCE}`, 'POST', { limit: 100, page });
    const records = res.body?.messages?.records || (Array.isArray(res.body) ? res.body : []);
    
    records.forEach((m, idx) => {
      let ts = m.messageTimestamp || m.createdAt;
      if (typeof ts === 'object' && ts?.low) ts = ts.low;
      if (typeof ts === 'string') ts = parseInt(ts, 10);
      if (ts > 10000000000) ts = Math.floor(ts / 1000);
      const diffMin = ts ? ((nowSec - ts) / 60).toFixed(1) : 'N/A';

      if (ts && (nowSec - ts) <= 5400) { // últimos 90 minutos
        const text = m.message?.conversation || m.message?.extendedTextMessage?.text || m.body || m.messageType;
        const rawR = m.key?.remoteJid || m.remoteJid;
        const altR = m.key?.remoteJidAlt || m.key?.participantAlt;
        const part = m.key?.participant || m.participant;
        console.log(`\n[${diffMin} min atrás] ID=${m.id}, fromMe=${m.key?.fromMe}`);
        console.log(`   remoteJid=${rawR}, alt=${altR}, participant=${part}`);
        console.log(`   type=${m.messageType}, text="${text}"`);
        console.log(`   MessageUpdate=${JSON.stringify(m.MessageUpdate)}`);
        console.log(`   userReceipt=${JSON.stringify(m.userReceipt)}`);
        console.log(`   raw key=${JSON.stringify(m.key)}`);
      }
    });
  }
}

main().catch(console.error);
