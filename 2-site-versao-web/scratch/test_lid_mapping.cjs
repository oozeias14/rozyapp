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

function extractCleanPhone(p) {
  if (!p) return '';
  let str = String(p).trim();
  if (str.includes('@')) str = str.split('@')[0];
  if (str.includes(':')) str = str.split(':')[0];
  return str.replace(/\D/g, '');
}

async function buildLidMap() {
  const lidMap = new Map(); // lidDigits -> phoneDigits

  // 1. From findChats
  const chatsRes = await req(`/chat/findChats/${INSTANCE}`, 'POST', {});
  const chats = Array.isArray(chatsRes.body) ? chatsRes.body : [];

  chats.forEach((c) => {
    const rawR = c.remoteJid || c.id || '';
    const altR = c.lastMessage?.key?.remoteJidAlt || c.lastMessage?.key?.participantAlt || '';
    
    if (rawR.includes('@lid') && altR) {
      const lidClean = extractCleanPhone(rawR);
      const phoneClean = extractCleanPhone(altR);
      if (lidClean && phoneClean) {
        lidMap.set(lidClean, phoneClean);
      }
    }
  });

  // 2. From findMessages
  const msgsRes = await req(`/chat/findMessages/${INSTANCE}`, 'POST', { limit: 100 });
  const msgs = msgsRes.body?.messages?.records || [];

  msgs.forEach((m) => {
    const rawR = m.key?.remoteJid || m.remoteJid || '';
    const altR = m.key?.remoteJidAlt || m.remoteJidAlt || m.key?.participantAlt || m.participantAlt || '';

    if (rawR.includes('@lid') && altR) {
      const lidClean = extractCleanPhone(rawR);
      const phoneClean = extractCleanPhone(altR);
      if (lidClean && phoneClean) {
        lidMap.set(lidClean, phoneClean);
      }
    }
  });

  console.log(`LID Map construído com ${lidMap.size} mapeamentos:`);
  lidMap.forEach((phone, lid) => {
    console.log(`  LID ${lid} -> Telefone Real: ${phone}`);
  });

  return lidMap;
}

buildLidMap().catch(console.error);
