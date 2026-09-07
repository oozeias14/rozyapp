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
  const chatsRes = await req(`/chat/findChats/${INSTANCE}`, 'POST', {});
  const chats = Array.isArray(chatsRes.body) ? chatsRes.body : [];

  console.log('Total chats in account:', chats.length);

  chats.forEach((c, idx) => {
    const json = JSON.stringify(c);
    console.log(`\nChat #${idx+1}: id=${c.id}, remoteJid=${c.remoteJid}, pushName=${c.pushName}`);
    if (c.lastMessage) {
      console.log('  lastMessage key:', JSON.stringify(c.lastMessage.key));
      console.log('  lastMessage message:', JSON.stringify(c.lastMessage.message).slice(0, 150));
    }
  });
}

main().catch(console.error);
