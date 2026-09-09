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
  console.log('=== REAL-TIME DIAGNOSTIC OF EVOLUTION API INSTANCE dr_candido ===');

  // 1. Connection State
  const state = await req('/instance/connectionState/' + INSTANCE, 'GET');
  console.log('Connection state:', JSON.stringify(state));

  // 2. Chats (sorted by last message timestamp)
  const chats = await req('/chat/findChats/' + INSTANCE, 'POST', {});
  console.log(`Total chats: ${Array.isArray(chats) ? chats.length : 0}`);
  const sortedChats = (Array.isArray(chats) ? chats : []).sort((a, b) => {
    const tsA = a.lastMessage?.messageTimestamp || 0;
    const tsB = b.lastMessage?.messageTimestamp || 0;
    return tsB - tsA;
  });

  console.log('\n--- TOP 10 RECENT CHATS ---');
  sortedChats.slice(0, 10).forEach((c, idx) => {
    const ts = c.lastMessage?.messageTimestamp ? new Date(c.lastMessage.messageTimestamp * 1000).toLocaleTimeString('pt-BR') : 'no-ts';
    const text = c.lastMessage?.message?.conversation || c.lastMessage?.message?.extendedTextMessage?.text || c.lastMessage?.body || '';
    console.log(`[${idx}] ${c.remoteJid || c.id} | ${ts} | pushName: ${c.pushName} | fromMe: ${c.lastMessage?.key?.fromMe} | "${text.substring(0, 50)}"`);
  });

  // 3. All broadcast chats and their messages
  const bChats = (Array.isArray(chats) ? chats : []).filter(c => (c.remoteJid || c.id || '').includes('@broadcast'));
  console.log(`\n--- ALL BROADCAST CHATS (${bChats.length}) ---`);
  for (const bc of bChats) {
    const bjId = bc.remoteJid || bc.id;
    console.log(`Broadcast chat: ${bjId}`);
    const bMsgs = await req('/chat/findMessages/' + INSTANCE, 'POST', { where: { key: { remoteJid: bjId } }, limit: 20 });
    const bRecords = bMsgs.messages?.records || [];
    console.log(`  Total msgs in ${bjId}: ${bRecords.length}`);
    bRecords.forEach((m, i) => {
      const text = m.message?.conversation || m.message?.extendedTextMessage?.text || m.body || m.text || '';
      const ts = m.messageTimestamp ? new Date(m.messageTimestamp * 1000).toLocaleTimeString('pt-BR') : 'no-ts';
      console.log(`  [${i}] ${ts} | ID: ${m.key?.id} | fromMe: ${m.key?.fromMe} | participant: ${m.key?.participant} | text: "${text}"`);
    });

    const bStatus = await req('/chat/findStatusMessage/' + INSTANCE, 'POST', { where: { remoteJid: bjId } });
    const sRecords = Array.isArray(bStatus) ? bStatus : [];
    console.log(`  Total status records in ${bjId}: ${sRecords.length}`);
    sRecords.forEach((s, i) => {
      console.log(`  [status ${i}] keyId: ${s.keyId} | participant: ${s.participant} | status: ${s.status}`);
    });
  }

  // 4. Latest 50 messages across ALL chats
  const msgsRes = await req('/chat/findMessages/' + INSTANCE, 'POST', { limit: 50, page: 1 });
  const records = msgsRes.messages?.records || [];
  console.log(`\n--- LATEST 20 GLOBAL MESSAGES ---`);
  records.slice(0, 20).forEach((m, idx) => {
    const text = m.message?.conversation || m.message?.extendedTextMessage?.text || m.body || m.text || '';
    const ts = m.messageTimestamp ? new Date(m.messageTimestamp * 1000).toLocaleTimeString('pt-BR') : 'no-ts';
    console.log(`[${idx}] ${ts} | JID: ${m.key?.remoteJid} | ID: ${m.key?.id} | fromMe: ${m.key?.fromMe} | "${text}"`);
  });
}

run().catch(console.error);
