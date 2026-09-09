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
  console.log('=== CHECKING KAMILLA CHATS AND MESSAGES ===');
  
  const kamillaLid = await req(`/chat/findMessages/${INSTANCE}`, 'POST', {
    where: { key: { remoteJid: '188072490696905@lid' } },
    limit: 20
  });
  console.log('Kamilla LID msgs count:', kamillaLid.data?.messages?.records?.length || 0);
  (kamillaLid.data?.messages?.records || []).slice(0, 10).forEach((m, idx) => {
    const ts = m.messageTimestamp ? new Date(m.messageTimestamp * 1000).toLocaleTimeString('pt-BR') : '';
    const text = m.message?.conversation || m.message?.extendedTextMessage?.text || m.body || '';
    console.log(`[LID ${idx}] ${ts} | ID: ${m.key?.id} | fromMe: ${m.key?.fromMe} | "${text}"`);
  });

  const kamillaNet = await req(`/chat/findMessages/${INSTANCE}`, 'POST', {
    where: { key: { remoteJid: '556194409686@s.whatsapp.net' } },
    limit: 20
  });
  console.log('\nKamilla NET msgs count:', kamillaNet.data?.messages?.records?.length || 0);
  (kamillaNet.data?.messages?.records || []).slice(0, 10).forEach((m, idx) => {
    const ts = m.messageTimestamp ? new Date(m.messageTimestamp * 1000).toLocaleTimeString('pt-BR') : '';
    const text = m.message?.conversation || m.message?.extendedTextMessage?.text || m.body || '';
    console.log(`[NET ${idx}] ${ts} | ID: ${m.key?.id} | fromMe: ${m.key?.fromMe} | "${text}"`);
  });

  // Check all status messages in Evolution API with no limit
  const allStatus = await req(`/chat/findStatusMessage/${INSTANCE}`, 'POST', {});
  console.log('\nTotal allStatus in DB:', Array.isArray(allStatus.data) ? allStatus.data.length : 0);
  (Array.isArray(allStatus.data) ? allStatus.data : []).forEach(s => {
    if (s.participant?.includes('188072490696905') || s.remoteJid?.includes('188072490696905') || s.remoteJid?.includes('556194409686')) {
      console.log('Found Kamilla status:', s);
    }
  });
}

run().catch(console.error);
