const https = require('https');
const SERVER_URL = 'https://evolution-api-production-2522.up.railway.app';
const API_KEY = '6a76cbf204380d04e7ce897ac00e4f204cafea39bc9b7f74fd830a0fe74b8dec';
const INSTANCE = 'dr_candido';

function fetchApi(endpoint, method = 'POST', body = {}) {
  return new Promise((resolve) => {
    const url = new URL(endpoint, SERVER_URL);
    const req = https.request(url, {
      method,
      headers: { 'apikey': API_KEY, 'Content-Type': 'application/json' }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch { resolve(d); }
      });
    });
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  const msgIds = ['AC63F7058FE4657C468803AB7AD662DF', 'ACF10BF3FA459C8AA76FEEBA9B645EB2', 'AC874C4882EEE72DCECC41F0CB37A892', 'AC7E6F10726ACF4DBEF6A842205BFD9D'];
  
  for (const mid of msgIds) {
    console.log(`\n=== Buscando statusMessage para keyId / messageId: ${mid} ===`);
    const resKey = await fetchApi('/chat/findStatusMessage/' + INSTANCE, 'POST', {
      where: { keyId: mid }
    });
    console.log('Result where keyId:', JSON.stringify(resKey, null, 2));

    const resMsg = await fetchApi('/chat/findStatusMessage/' + INSTANCE, 'POST', {
      where: { messageId: mid }
    });
    console.log('Result where messageId:', JSON.stringify(resMsg, null, 2));
  }

  console.log('\n=== Buscando statusMessage where remoteJid: 1788673682@broadcast ===');
  const resBcast = await fetchApi('/chat/findStatusMessage/' + INSTANCE, 'POST', {
    where: { remoteJid: '1788673682@broadcast' }
  });
  console.log('Result broadcast:', JSON.stringify(resBcast, null, 2));
}

run();
