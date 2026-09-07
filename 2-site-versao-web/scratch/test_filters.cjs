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

async function main() {
  console.log('--- TEST 1: findMessages with key.remoteJid ---');
  const t1 = await req(`/chat/findMessages/${INSTANCE}`, 'POST', {
    where: {
      key: {
        remoteJid: '5561992623060@s.whatsapp.net'
      }
    }
  });
  console.log('T1 (key.remoteJid exact) records:', t1.body?.messages?.records?.length || 0, 'total:', t1.body?.messages?.total);
  if (t1.body?.messages?.records?.length > 0) {
    console.log('T1 sample:', JSON.stringify(t1.body.messages.records[0]).slice(0, 300));
  }

  console.log('\n--- TEST 2: findMessages with remoteJid string ---');
  const t2 = await req(`/chat/findMessages/${INSTANCE}`, 'POST', {
    where: {
      remoteJid: '5561992623060@s.whatsapp.net'
    }
  });
  console.log('T2 (remoteJid string) records:', t2.body?.messages?.records?.length || 0, 'total:', t2.body?.messages?.total);

  console.log('\n--- TEST 3: findMessages searching text/conversation ---');
  const t3 = await req(`/chat/findMessages/${INSTANCE}`, 'POST', {
    where: {
      message: {
        conversation: {
          contains: 'teste'
        }
      }
    }
  });
  console.log('T3 (message.conversation contains teste) records:', t3.body?.messages?.records?.length || 0, 'total:', t3.body?.messages?.total);

  console.log('\n--- TEST 4: findChats inspecting chats for Rose/Camila/Kauan ---');
  const chats = await req(`/chat/findChats/${INSTANCE}`, 'POST', {});
  const list = Array.isArray(chats.body) ? chats.body : [];
  console.log('Total chats returned:', list.length);
  const roseChats = list.filter(c => JSON.stringify(c).includes('992623060') || JSON.stringify(c).includes('92623060') || JSON.stringify(c).toLowerCase().includes('rose'));
  console.log('Rose chats found in findChats:', roseChats.length, JSON.stringify(roseChats, null, 2).slice(0, 1000));
}

main().catch(console.error);
