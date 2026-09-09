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
  console.log('=== CHECKING KAUAN & CAMILA CHATS ===');
  
  // 1. Let's find Kauan in contacts or chats
  const chats = await req('/chat/findChats/' + INSTANCE, 'POST', {});
  const kauanChats = chats.filter(c => {
    const s = JSON.stringify(c).toLowerCase();
    return s.includes('kauan') || s.includes('92419984') || s.includes('92419884') || s.includes('144856882094274');
  });
  console.log('Kauan chats in findChats:', JSON.stringify(kauanChats, null, 2));

  // 2. Let's find Camila in chats
  const camilaChats = chats.filter(c => {
    const s = JSON.stringify(c).toLowerCase();
    return s.includes('kamilla') || s.includes('camila') || s.includes('94409686') || s.includes('188072490696905');
  });
  console.log('Camila chats in findChats:', JSON.stringify(camilaChats, null, 2));

  // 3. Let's query findMessages for Kauan and Camila JIDs
  const jids = [
    '144856882094274@lid',
    '556192419984@s.whatsapp.net',
    '556192419884@s.whatsapp.net',
    '188072490696905@lid',
    '556194409686@s.whatsapp.net'
  ];

  for (const jid of jids) {
    const res = await req('/chat/findMessages/' + INSTANCE, 'POST', {
      where: {
        key: {
          remoteJid: jid
        }
      }
    });
    const records = res.messages?.records || [];
    console.log(`\nMessages for ${jid}: ${records.length} records`);
    records.slice(0, 5).forEach((m, idx) => {
      console.log(`  [#${idx+1}] ID=${m.id}, fromMe=${m.key?.fromMe}, time=${m.messageTimestamp} (${new Date(m.messageTimestamp*1000).toLocaleTimeString('pt-BR')})`);
      console.log(`      text="${m.message?.conversation || m.message?.extendedTextMessage?.text || m.body || m.messageType}"`);
      console.log(`      status=${m.status}, MessageUpdate=${JSON.stringify(m.MessageUpdate)}`);
    });
  }
}

run().catch(console.error);
