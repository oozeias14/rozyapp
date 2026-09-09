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

const targetNumbers = [
  { name: 'Rozy Costa', phone: '61992623060', digits: ['61992623060', '6192623060', '5561992623060', '556192623060'] },
  { name: 'Kamilla Silva', phone: '6194409686', digits: ['6194409686', '61994409686', '556194409686', '5561994409686'] },
  { name: 'Rayanne Pereira', phone: '61998265034', digits: ['61998265034', '6198265034', '5561998265034', '556198265034'] },
  { name: 'Marcelo Henrique', phone: '61983716917', digits: ['61983716917', '619983716917', '5561983716917', '55619983716917'] },
];

async function main() {
  console.log('=== 1. BUSCANDO CHATS DA INSTÂNCIA ===');
  const chatsRes = await req(`/chat/findChats/${INSTANCE}`, 'POST', {});
  const chats = Array.isArray(chatsRes.body) ? chatsRes.body : [];
  console.log(`Total chats no WhatsApp: ${chats.length}`);

  for (const t of targetNumbers) {
    console.log(`\n-----------------------------------------`);
    console.log(`🔍 Analisando contato: ${t.name} (${t.phone})`);
    
    // Busca no chats list
    const matchedChats = chats.filter(c => {
      const str = JSON.stringify(c);
      return t.digits.some(d => str.includes(d));
    });
    console.log(`  Chats correspondentes no findChats: ${matchedChats.length}`);
    matchedChats.forEach(c => {
      console.log(`    Chat ID: ${c.id || c.remoteJid}, remoteJid: ${c.remoteJid}`);
      console.log(`    lastMessage:`, JSON.stringify(c.lastMessage, null, 2));
    });
  }

  console.log('\n=== 2. BUSCANDO TODAS AS MENSAGENS RECENTES (findMessages limit 500) ===');
  const msgsRes = await req(`/chat/findMessages/${INSTANCE}`, 'POST', { limit: 500 });
  const records = msgsRes.body?.messages?.records || (Array.isArray(msgsRes.body) ? msgsRes.body : []);
  console.log(`Total mensagens recentes retornadas: ${records.length}`);

  const nowSec = Math.floor(Date.now() / 1000);

  for (const t of targetNumbers) {
    console.log(`\n-----------------------------------------`);
    console.log(`📨 Mensagens encontradas para: ${t.name} (${t.phone})`);

    const matchedMsgs = records.filter(m => {
      const str = JSON.stringify(m);
      return t.digits.some(d => str.includes(d));
    });

    console.log(`  Total mensagens encontradas nos últimos 500: ${matchedMsgs.length}`);
    matchedMsgs.forEach((m, i) => {
      let ts = m.messageTimestamp || m.createdAt;
      if (typeof ts === 'object' && ts?.low) ts = ts.low;
      if (typeof ts === 'string') ts = parseInt(ts, 10);
      if (ts > 10000000000) ts = Math.floor(ts / 1000);
      const diffHours = ts ? ((nowSec - ts) / 3600).toFixed(2) : 'N/A';

      const text = m.message?.conversation || m.message?.extendedTextMessage?.text || m.body || JSON.stringify(m.message);
      console.log(`    [#${i+1}] ${diffHours}h atrás | fromMe: ${m.key?.fromMe} | Status: ${m.status} | updates: ${JSON.stringify(m.MessageUpdate)}`);
      console.log(`       remoteJid: ${m.key?.remoteJid} | remoteJidAlt: ${m.key?.remoteJidAlt}`);
      console.log(`       Texto: "${(text || '').slice(0, 100)}"`);
    });
  }
}

main().catch(console.error);
