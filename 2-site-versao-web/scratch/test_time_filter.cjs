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
  console.log('--- Fetching recent messages with timestamp check ---');
  const res = await req(`/chat/findMessages/${INSTANCE}`, 'POST', { limit: 100 });
  const records = res.body?.messages?.records || [];

  const nowSec = Math.floor(Date.now() / 1000);
  const twelveHoursSec = 12 * 3600;

  console.log('Current Unix time (sec):', nowSec);
  console.log('Messages total returned:', records.length);

  records.forEach((m, i) => {
    let ts = m.messageTimestamp;
    if (typeof ts === 'object' && ts !== null && ts.low) ts = ts.low;
    if (typeof ts === 'string') ts = parseInt(ts, 10);
    
    // If milliseconds
    if (ts > 10000000000) ts = Math.floor(ts / 1000);

    const ageHours = ts ? ((nowSec - ts) / 3600).toFixed(2) : 'N/A';
    const remoteJid = m.key?.remoteJid || m.remoteJid;
    const text = (m.message?.conversation || m.message?.extendedTextMessage?.text || '').slice(0, 60);

    if (i < 10) {
      console.log(`Msg #${i+1}: remoteJid=${remoteJid}, ageHours=${ageHours}h, text="${text}"`);
    }
  });
}

main().catch(console.error);
