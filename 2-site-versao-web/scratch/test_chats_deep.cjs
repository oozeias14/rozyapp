const https = require('https');

const SERVER_URL = 'https://evolution-api-production-2522.up.railway.app';
const API_KEY = '6a76cbf204380d04e7ce897ac00e4f204cafea39bc9b7f74fd830a0fe74b8dec';
const INSTANCE = 'dr_candido';

function req(endpoint, method = 'POST', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(SERVER_URL + endpoint);
    const options = {
      method,
      headers: {
        'apikey': API_KEY,
        'Content-Type': 'application/json',
      }
    };
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

async function run() {
  const chats = await req('/chat/findChats/' + INSTANCE, 'POST', {});
  console.log('Total chats in WhatsApp:', chats.length);
  chats.forEach((c, i) => {
    const id = c.id || c.remoteJid;
    const name = c.name || c.pushName || c.subject || '';
    console.log(`\n[Chat ${i+1}] ID=${id} | Name="${name}"`);
    if (c.lastMessage) {
      const lm = c.lastMessage;
      const text = lm.message?.conversation || lm.message?.extendedTextMessage?.text || lm.body || lm.messageType;
      console.log(`   lastMsg: id=${lm.key?.id}, fromMe=${lm.key?.fromMe}, status=${lm.status}, text="${text}"`);
      console.log(`   key:`, JSON.stringify(lm.key));
      if (lm.message?.reactionMessage) {
        console.log(`   reactionMessage:`, JSON.stringify(lm.message.reactionMessage));
      }
    }
  });
}

run().catch(console.error);
