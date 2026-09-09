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
  const jids = [
    '184584893399198@lid',
    '188072490696905@lid'
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
    console.log('\n========================================');
    console.log(`JID: ${jid} -> Total msgs: ${records.length}`);
    records.slice(0, 10).forEach((m, idx) => {
      const text = m.message?.conversation || m.message?.extendedTextMessage?.text || m.body || m.messageType;
      console.log(`  [#${idx+1}] ID=${m.key?.id}, fromMe=${m.key?.fromMe}, status=${m.status}, time=${m.messageTimestamp}`);
      console.log(`       text="${text}"`);
      if (m.message?.reactionMessage) {
        console.log(`       reaction:`, JSON.stringify(m.message.reactionMessage));
      }
      console.log(`       MessageUpdate:`, JSON.stringify(m.MessageUpdate));
      console.log(`       userReceipt:`, JSON.stringify(m.userReceipt));
      console.log(`       remoteJidAlt:`, m.key?.remoteJidAlt, m.remoteJidAlt);
    });
  }
}

run().catch(console.error);
