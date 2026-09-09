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

async function inspectBroadcasts() {
  console.log('=== BUSCANDO MENSAGENS RECENTES DE TRANSMISSÃO ===');
  
  // 1. Fetch findChats
  const chatsRes = await req(`/chat/findChats/${INSTANCE}`, 'POST', {});
  const chats = Array.isArray(chatsRes.body) ? chatsRes.body : [];
  console.log(`Total chats: ${chats.length}`);

  chats.forEach((c, idx) => {
    const rawR = (c.remoteJid || c.id || '');
    if (rawR.includes('@broadcast') || c.isBroadcast) {
      console.log(`\n📢 Broadcast Chat #${idx+1}:`, JSON.stringify(c, null, 2));
    }
  });

  // 2. Fetch findMessages (last 100 messages)
  const msgsRes = await req(`/chat/findMessages/${INSTANCE}`, 'POST', { limit: 100, page: 1 });
  const records = msgsRes.body?.messages?.records || (Array.isArray(msgsRes.body) ? msgsRes.body : []);
  console.log(`\nTotal mensagens na página 1: ${records.length}`);

  records.forEach((m, idx) => {
    const rawR = (m.key?.remoteJid || m.remoteJid || '');
    const isBroadcast = rawR.includes('@broadcast') || m.broadcast || m.isBroadcast || m.key?.remoteJid?.includes('@broadcast');
    
    // Se for mensagem enviada por mim nos últimos minutos
    if (m.key?.fromMe) {
      console.log(`\n------------------------------------------------`);
      console.log(`[Msg #${idx+1}] fromMe=${m.key?.fromMe}, remoteJid=${m.key?.remoteJid}, remoteJidAlt=${m.key?.remoteJidAlt}, broadcast=${m.broadcast}`);
      console.log(`Full Key:`, JSON.stringify(m.key));
      console.log(`Message type:`, m.messageType);
      console.log(`Message text:`, m.message?.conversation || m.message?.extendedTextMessage?.text || m.body || Object.keys(m.message || {}));
      console.log(`Message contextInfo:`, JSON.stringify(m.contextInfo || m.message?.extendedTextMessage?.contextInfo || m.message?.conversation?.contextInfo));
      console.log(`MessageUpdate:`, JSON.stringify(m.MessageUpdate));
      console.log(`userReceipt:`, JSON.stringify(m.userReceipt));
      console.log(`Full message object:`, JSON.stringify(m, null, 2).slice(0, 1500));
    }
  });
}

inspectBroadcasts().catch(console.error);
