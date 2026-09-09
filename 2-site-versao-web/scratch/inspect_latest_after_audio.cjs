const https = require('https');
const SERVER_URL = 'https://evolution-api-production-2522.up.railway.app';
const API_KEY = '6a76cbf204380d04e7ce897ac00e4f204cafea39bc9b7f74fd830a0fe74b8dec';
const INSTANCE = 'dr_candido';

function req(endpoint, method = 'POST', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(SERVER_URL + endpoint);
    const options = { method, headers: { apikey: API_KEY, 'Content-Type': 'application/json' } };
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function inspectLatest() {
  console.log('=== CHECKING LATEST MESSAGES AND CHATS IN EVOLUTION API ===');
  
  // 1. Check chats
  const chats = await req('/chat/findChats/' + INSTANCE, 'POST', {});
  console.log(`Total chats: ${Array.isArray(chats) ? chats.length : 0}`);
  
  // Look for any broadcast chats or recently updated chats
  const sortedChats = (Array.isArray(chats) ? chats : []).sort((a, b) => {
    const tsA = a.lastMessage?.messageTimestamp || 0;
    const tsB = b.lastMessage?.messageTimestamp || 0;
    return tsB - tsA;
  });

  console.log('\n--- TOP 10 RECENT CHATS ---');
  sortedChats.slice(0, 10).forEach((c, idx) => {
    const ts = c.lastMessage?.messageTimestamp ? new Date(c.lastMessage.messageTimestamp * 1000).toLocaleTimeString('pt-BR') : 'no-ts';
    const text = c.lastMessage?.message?.conversation || c.lastMessage?.message?.extendedTextMessage?.text || c.lastMessage?.body || '';
    console.log(`[${idx}] ${c.remoteJid || c.id} | ${ts} | fromMe: ${c.lastMessage?.key?.fromMe} | "${text.substring(0, 40)}"`);
  });

  // 2. Check latest messages
  const msgsRes = await req('/chat/findMessages/' + INSTANCE, 'POST', { limit: 50, page: 1 });
  const records = msgsRes.messages?.records || [];
  console.log(`\n--- TOP 20 LATEST MESSAGES ---`);
  records.slice(0, 20).forEach((m, idx) => {
    const ts = m.messageTimestamp ? new Date(m.messageTimestamp * 1000).toLocaleTimeString('pt-BR') : 'no-ts';
    const text = m.message?.conversation || m.message?.extendedTextMessage?.text || m.body || m.text || '';
    const rJid = m.key?.remoteJid || m.remoteJid;
    console.log(`[${idx}] ${ts} | JID: ${rJid} | ID: ${m.key?.id} | fromMe: ${m.key?.fromMe} | "${text.substring(0, 50)}"`);
  });

  // 3. Check status messages
  const statusRes = await req('/chat/findStatusMessage/' + INSTANCE, 'POST', {});
  console.log(`\nStatus messages count: ${Array.isArray(statusRes) ? statusRes.length : 0}`);
  if (Array.isArray(statusRes) && statusRes.length > 0) {
    statusRes.slice(0, 10).forEach((s, idx) => {
      console.log(`[${idx}] keyId: ${s.keyId} | remoteJid: ${s.remoteJid} | status: ${s.status}`);
    });
  }
}

inspectLatest().catch(console.error);
