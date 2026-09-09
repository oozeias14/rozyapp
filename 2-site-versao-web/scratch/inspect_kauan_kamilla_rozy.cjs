const https = require('https');
const SERVER_URL = 'https://evolution-api-production-2522.up.railway.app';
const API_KEY = '6a76cbf204380d04e7ce897ac00e4f204cafea39bc9b7f74fd830a0fe74b8dec';
const INSTANCE = 'dr_candido';

function req(endpoint, method = 'POST', body = null) {
  return new Promise((resolve) => {
    const url = new URL(SERVER_URL + endpoint);
    const options = { method, headers: { apikey: API_KEY, 'Content-Type': 'application/json' } };
    const r = https.request(url, options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    r.on('error', e => resolve({ error: e.message }));
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function run() {
  console.log('=== INSPECTING KAUAN, KAMILLA, ROZY CHATS & MESSAGES ===');
  
  const jids = [
    '144856882094274@lid',
    '556192419984@s.whatsapp.net',
    '188072490696905@lid',
    '556194409686@s.whatsapp.net',
    '184584893399198@lid',
    '5561992623060@s.whatsapp.net',
    '1788673682@broadcast'
  ];

  for (const jid of jids) {
    const res = await req(`/chat/findMessages/${INSTANCE}`, 'POST', {
      where: { key: { remoteJid: jid } },
      limit: 10
    });
    const msgs = res.data?.messages?.records || (Array.isArray(res.data) ? res.data : []);
    console.log(`\n--- JID: ${jid} (Total: ${msgs.length}) ---`);
    msgs.forEach(m => {
      const text = m.message?.conversation || m.message?.extendedTextMessage?.text || m.body || m.text || '';
      const ts = m.messageTimestamp ? new Date(m.messageTimestamp * 1000).toLocaleString('pt-BR') : '';
      console.log(`  ID: ${m.key?.id} | fromMe: ${m.key?.fromMe} | status: ${m.status || m.lastMessage?.status} | ts: ${ts} | text: "${text}"`);
    });
  }
}

run().catch(console.error);
