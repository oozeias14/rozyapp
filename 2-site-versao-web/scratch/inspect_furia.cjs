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

async function inspectFuria() {
  console.log('=== 1. BUSCANDO MENSAGENS COM "Furia" OU "2" ===');
  
  for (let p = 1; p <= 5; p++) {
    const res = await req('/chat/findMessages/' + INSTANCE, 'POST', { limit: 100, page: p });
    const recs = res.messages?.records || [];
    console.log(`Page ${p} has ${recs.length} records`);

    recs.forEach((m, idx) => {
      const text = (m.message?.conversation || m.message?.extendedTextMessage?.text || m.body || m.text || JSON.stringify(m.message || {})).toLowerCase();
      const rawR = (m.key?.remoteJid || m.remoteJid || '');
      
      if (text.includes('furia') || text.includes('fúria') || rawR.includes('broadcast') || m.broadcast) {
        console.log(`\n[P${p} Msg #${idx+1}] ID=${m.id}, msgId=${m.key?.id}, fromMe=${m.key?.fromMe}`);
        console.log(`  remoteJid=${rawR}, remoteJidAlt=${m.key?.remoteJidAlt}, participant=${m.key?.participant}`);
        console.log(`  time=${m.messageTimestamp} (${new Date(m.messageTimestamp * 1000).toLocaleTimeString('pt-BR')})`);
        console.log(`  messageType=${m.messageType}`);
        console.log(`  text="${m.message?.conversation || m.message?.extendedTextMessage?.text || m.body || ''}"`);
        console.log(`  Full Message Obj:`, JSON.stringify(m, null, 2).slice(0, 1000));
      }
    });
  }

  console.log('\n=== 2. BUSCANDO CHATS (findChats) ===');
  const chats = await req('/chat/findChats/' + INSTANCE, 'POST', {});
  console.log(`Total chats: ${chats.length}`);
  chats.forEach((c, idx) => {
    const rawR = (c.remoteJid || c.id || '');
    const text = (c.lastMessage?.message?.conversation || c.lastMessage?.message?.extendedTextMessage?.text || c.lastMessage?.body || '').toLowerCase();
    if (text.includes('furia') || text.includes('fúria') || rawR.includes('broadcast') || c.isBroadcast || (c.name || '').toLowerCase().includes('kauan') || (c.name || '').toLowerCase().includes('kamilla')) {
      console.log(`\n[Chat #${idx+1}] id=${rawR}, name="${c.name || c.pushName || ''}"`);
      console.log(`  lastMessage text: "${c.lastMessage?.message?.conversation || c.lastMessage?.message?.extendedTextMessage?.text || c.lastMessage?.body || ''}"`);
      console.log(`  lastMessage key:`, JSON.stringify(c.lastMessage?.key));
      console.log(`  lastMessage time:`, c.lastMessage?.messageTimestamp);
      console.log(`  Full chat:`, JSON.stringify(c, null, 2).slice(0, 1000));
    }
  });
}

inspectFuria().catch(console.error);
