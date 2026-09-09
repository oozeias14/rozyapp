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

async function run() {
  console.log('=== CHECKING ALL MESSAGES IN BROADCAST 1788673682@broadcast ===');
  const bMsgs = await req('/chat/findMessages/' + INSTANCE, 'POST', {
    where: { key: { remoteJid: '1788673682@broadcast' } },
    limit: 50
  });
  const records = bMsgs.messages?.records || [];
  console.log('Total records in 1788673682@broadcast:', records.length);
  records.forEach((m, idx) => {
    console.log(`[${idx}] key:`, JSON.stringify(m.key), '| participant:', m.participant, '| text:', JSON.stringify(m.message), '| ts:', m.messageTimestamp);
  });

  console.log('\n=== CHECKING CHAT 176033647087799@lid ===');
  const lidChat = await req('/chat/findMessages/' + INSTANCE, 'POST', {
    where: { key: { remoteJid: '176033647087799@lid' } },
    limit: 10
  });
  console.log('176033647087799@lid messages:', JSON.stringify(lidChat, null, 2));

  // Check all chats in findChats to see if 176033647087799@lid or King's Son has a phone or remoteJidAlt
  const chats = await req('/chat/findChats/' + INSTANCE, 'POST', {});
  const matchingChats = (Array.isArray(chats) ? chats : []).filter(c => {
    const s = JSON.stringify(c);
    return s.includes('176033647087799') || s.includes('King');
  });
  console.log('\nMatching chats in findChats:', JSON.stringify(matchingChats, null, 2));
}

run().catch(console.error);
