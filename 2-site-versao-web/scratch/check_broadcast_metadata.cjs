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
  const bJid = '1788673682@broadcast';
  console.log('=== CHECKING BROADCAST METADATA ===');
  
  // Try groupMetadata / chat find / etc.
  const meta = await req(`/group/findGroupInfos/${INSTANCE}?groupJid=${bJid}`, 'GET');
  console.log('findGroupInfos:', JSON.stringify(meta, null, 2));

  // Check findMessages for Kauan and Kamilla
  const kauanMsgs = await req(`/chat/findMessages/${INSTANCE}`, 'POST', {
    where: {
      key: {
        remoteJid: '556192419984@s.whatsapp.net'
      }
    }
  });
  console.log('\nKauan s.whatsapp.net msgs:', JSON.stringify(kauanMsgs, null, 2));

  const kauanLidMsgs = await req(`/chat/findMessages/${INSTANCE}`, 'POST', {
    where: {
      key: {
        remoteJid: '144856882094274@lid'
      }
    }
  });
  console.log('\nKauan lid msgs:', JSON.stringify(kauanLidMsgs, null, 2));

  const kamillaLidMsgs = await req(`/chat/findMessages/${INSTANCE}`, 'POST', {
    where: {
      key: {
        remoteJid: '188072490696905@lid'
      }
    }
  });
  console.log('\nKamilla lid msgs:', JSON.stringify(kamillaLidMsgs, null, 2));

  const kamillaNetMsgs = await req(`/chat/findMessages/${INSTANCE}`, 'POST', {
    where: {
      key: {
        remoteJid: '556194409686@s.whatsapp.net'
      }
    }
  });
  console.log('\nKamilla s.whatsapp.net msgs:', JSON.stringify(kamillaNetMsgs, null, 2));
}

run().catch(console.error);
