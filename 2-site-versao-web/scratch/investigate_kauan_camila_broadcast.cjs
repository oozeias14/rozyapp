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
  console.log('=== INVESTIGATING LATEST BROADCAST FOR KAUAN & CAMILA ===');

  // Check findChats
  const chats = await req('/chat/findChats/' + INSTANCE, 'POST', {});
  console.log(`Total chats: ${Array.isArray(chats) ? chats.length : 0}`);

  // Find Kauan and Camila chats
  const kauanChats = (Array.isArray(chats) ? chats : []).filter(c => {
    const str = JSON.stringify(c);
    return str.includes('92419984') || str.includes('144856882094274') || str.includes('Kauan') || str.includes('kauan');
  });
  console.log('\nKauan chats in findChats:', JSON.stringify(kauanChats, null, 2));

  const camilaChats = (Array.isArray(chats) ? chats : []).filter(c => {
    const str = JSON.stringify(c);
    return str.includes('94409686') || str.includes('188072490696905') || str.includes('Kamilla') || str.includes('kamilla');
  });
  console.log('\nCamila chats in findChats:', JSON.stringify(camilaChats, null, 2));

  // Check latest 30 messages in findMessages
  const msgsRes = await req('/chat/findMessages/' + INSTANCE, 'POST', { limit: 30, page: 1 });
  const records = msgsRes.messages?.records || [];
  console.log('\n--- LATEST 30 MESSAGES ---');
  records.forEach((m, idx) => {
    const text = m.message?.conversation || m.message?.extendedTextMessage?.text || m.body || m.text || '';
    const ts = m.messageTimestamp ? new Date(m.messageTimestamp * 1000).toLocaleTimeString('pt-BR') : 'no-ts';
    console.log(`[${idx}] ${ts} | JID: ${m.key?.remoteJid} | ID: ${m.key?.id} | fromMe: ${m.key?.fromMe} | "${text}"`);
  });

  // Query specifically for Kauan JIDs
  const kauanNet = await req('/chat/findMessages/' + INSTANCE, 'POST', {
    where: { key: { remoteJid: '556192419984@s.whatsapp.net' } },
    limit: 5
  });
  console.log('\nKauan s.whatsapp.net msgs:', JSON.stringify(kauanNet, null, 2));

  const kauanLid = await req('/chat/findMessages/' + INSTANCE, 'POST', {
    where: { key: { remoteJid: '144856882094274@lid' } },
    limit: 5
  });
  console.log('\nKauan lid msgs:', JSON.stringify(kauanLid, null, 2));

  // Check broadcast chats
  const bChats = (Array.isArray(chats) ? chats : []).filter(c => (c.remoteJid || c.id || '').includes('broadcast'));
  console.log('\nBroadcast chats:', JSON.stringify(bChats, null, 2));
}

run().catch(console.error);
