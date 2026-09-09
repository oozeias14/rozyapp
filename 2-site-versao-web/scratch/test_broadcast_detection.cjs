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

function extractCleanPhone(p) {
  if (!p) return '';
  let str = p.toString().trim();
  if (str.includes('phone=')) {
    const match = str.match(/phone=([0-9+]+)/i);
    if (match && match[1]) str = match[1];
  } else if (str.includes('wa.me/')) {
    const match = str.match(/wa\.me\/([0-9+]+)/i);
    if (match && match[1]) str = match[1];
  } else if (str.includes('http://') || str.includes('https://')) {
    str = str.split('?')[0];
  }
  let clean = str.replace(/\D/g, '');
  if (clean.length === 12 && !clean.startsWith('55') && clean.endsWith('0')) {
    clean = clean.substring(0, 11);
  }
  return clean;
}

function getPhoneSignatures(p) {
  let clean = extractCleanPhone(p);
  if (!clean) return [];
  if (clean.startsWith('0')) clean = clean.substring(1);
  if (clean.startsWith('55') && clean.length >= 12) clean = clean.substring(2);
  if (clean.length === 8 || clean.length === 9) clean = '61' + clean;

  const sigs = new Set();
  sigs.add(clean);
  sigs.add('55' + clean);

  if (clean.length === 11) {
    const ddd = clean.substring(0, 2);
    const nineDigits = clean.substring(2);
    const eightDigits = clean.substring(3);
    sigs.add('55' + clean);
    sigs.add(clean);
    sigs.add('55' + ddd + eightDigits);
    sigs.add(ddd + eightDigits);
    sigs.add(nineDigits);
    sigs.add(eightDigits);
  } else if (clean.length === 10) {
    const ddd = clean.substring(0, 2);
    const eightDigits = clean.substring(2);
    sigs.add('55' + clean);
    sigs.add(clean);
    sigs.add('55' + ddd + '9' + eightDigits);
    sigs.add(ddd + '9' + eightDigits);
    sigs.add('9' + eightDigits);
    sigs.add(eightDigits);
  }

  return Array.from(sigs);
}

function isMessageWithinHours(msg, maxHours = 1) {
  if (!msg) return false;
  let ts = msg.messageTimestamp || msg.createdAt || msg.updatedAt;
  if (!ts && msg.lastMessage) ts = msg.lastMessage.messageTimestamp || msg.lastMessage.createdAt || msg.lastMessage.updatedAt;
  if (!ts) return true;

  if (typeof ts === 'object' && ts !== null && ts.low) ts = ts.low;
  if (typeof ts === 'string') {
    if (ts.includes('-') || ts.includes('T')) {
      const dt = new Date(ts);
      if (!isNaN(dt.getTime())) ts = Math.floor(dt.getTime() / 1000);
    } else {
      ts = parseInt(ts, 10);
    }
  }
  if (ts > 10000000000) ts = Math.floor(ts / 1000);

  const nowSec = Math.floor(Date.now() / 1000);
  const diffHours = (nowSec - ts) / 3600;
  return diffHours >= -0.5 && diffHours <= (maxHours || 1);
}

function doesMessageContainPhrase(m, targetPhrase) {
  if (!m || !targetPhrase) return false;
  const cleanTarget = targetPhrase.toLowerCase().trim().replace(/^["']|["']$/g, '');
  if (!cleanTarget) return false;

  const directText = (
    m.message?.conversation ||
    m.message?.extendedTextMessage?.text ||
    m.message?.ephemeralMessage?.message?.conversation ||
    m.message?.ephemeralMessage?.message?.extendedTextMessage?.text ||
    m.message?.imageMessage?.caption ||
    m.message?.videoMessage?.caption ||
    m.body ||
    m.text ||
    m.content ||
    ''
  ).toLowerCase();

  if (directText.includes(cleanTarget)) return true;

  const words = cleanTarget.split(/\s+/).filter(w => w.length >= 2);
  if (words.length > 1 && words.every(w => directText.includes(w))) return true;

  try {
    const jsonStr = JSON.stringify(m).toLowerCase();
    if (jsonStr.includes(cleanTarget)) return true;
    if (words.length > 1 && words.every(w => jsonStr.includes(w))) return true;
  } catch (e) {}

  return false;
}

async function run() {
  const targetUsers = [
    { id: 1, name: 'Rozy Costa', phone: '61992623060' },
    { id: 2, name: 'Kamilla Silva', phone: '6194409686' },
    { id: 3, name: 'Rayanne Pereira', phone: '61998265034' },
    { id: 4, name: 'Marcelo Henrique', phone: '61983716917' }
  ];

  console.log('=== TEST AUDIT FOR 4 USERS ===');

  // Fetch chats and messages
  const chats = await req('/chat/findChats/' + INSTANCE, 'POST', {});
  const msgsRes = await req('/chat/findMessages/' + INSTANCE, 'POST', { limit: 100, page: 1 });
  const allMsgs = msgsRes.messages?.records || [];

  // Build LID <-> Phone map
  const lidToPhone = new Map();
  chats.forEach(c => {
    const rawR = c.remoteJid || c.id || '';
    const altR = c.lastMessage?.key?.remoteJidAlt || c.lastMessage?.key?.participantAlt || '';
    if (rawR.includes('@lid') && altR) {
      lidToPhone.set(extractCleanPhone(rawR), extractCleanPhone(altR));
    }
    if (altR.includes('@lid') && rawR) {
      lidToPhone.set(extractCleanPhone(altR), extractCleanPhone(rawR));
    }
  });

  allMsgs.forEach(m => {
    const rJid = m.key?.remoteJid || m.remoteJid || '';
    const rAlt = m.key?.remoteJidAlt || m.remoteJidAlt || '';
    const part = m.key?.participant || m.participant || '';
    const partAlt = m.key?.participantAlt || m.participantAlt || '';
    if (rJid.includes('@lid') && rAlt) lidToPhone.set(extractCleanPhone(rJid), extractCleanPhone(rAlt));
    if (part.includes('@lid') && partAlt) lidToPhone.set(extractCleanPhone(part), extractCleanPhone(partAlt));
    if (m.message?.reactionMessage?.key) {
      const rk = m.message.reactionMessage.key;
      if (rk.participant && rAlt) lidToPhone.set(extractCleanPhone(rk.participant), extractCleanPhone(rAlt));
    }
  });

  console.log('LID to Phone map entries:', Array.from(lidToPhone.entries()));

  // Test scan for phrase "Casa verdess"
  console.log('\n--- SCANNING FOR FRASE "Casa verdess" ---');
  const matchedSigs1 = new Set();
  const phrase1 = 'Casa verdess';
  allMsgs.forEach(m => {
    if (doesMessageContainPhrase(m, phrase1) && isMessageWithinHours(m, 1)) {
      // Extract phones resolving LID
      const rawJid = m.key?.remoteJid || m.remoteJid;
      const altJid = m.key?.remoteJidAlt || m.remoteJidAlt;
      [rawJid, altJid].forEach(j => {
        if (!j) return;
        let clean = extractCleanPhone(j);
        if (lidToPhone.has(clean)) clean = lidToPhone.get(clean);
        if (clean && clean.length >= 8) {
          getPhoneSignatures(clean).forEach(s => matchedSigs1.add(s));
        }
      });
    }
  });
  console.log('Matched sigs for "Casa verdess":', Array.from(matchedSigs1));

  targetUsers.forEach(u => {
    const sigs = getPhoneSignatures(u.phone);
    const hasMatch = sigs.some(s => matchedSigs1.has(s));
    console.log(`  ${u.name} (${u.phone}): ${hasMatch ? '✓✓ 2 TRAÇOS (SALVO)' : '✓ 1 TRAÇO (PENDENTE)'}`);
  });

  // Test scan for phrase "Teste" or broadcast reactions
  console.log('\n--- SCANNING FOR BROADCAST / REACTION ---');
  const matchedSigs2 = new Set();
  allMsgs.forEach(m => {
    if (isMessageWithinHours(m, 1)) {
      const isBroadcastReaction = m.message?.reactionMessage?.key?.remoteJid?.includes('@broadcast');
      if (isBroadcastReaction) {
        const rawJid = m.key?.remoteJid || m.remoteJid;
        const altJid = m.key?.remoteJidAlt || m.remoteJidAlt;
        const part = m.message.reactionMessage.key.participant;
        [rawJid, altJid, part].forEach(j => {
          if (!j) return;
          let clean = extractCleanPhone(j);
          if (lidToPhone.has(clean)) clean = lidToPhone.get(clean);
          if (clean && clean.length >= 8) {
            getPhoneSignatures(clean).forEach(s => matchedSigs2.add(s));
          }
        });
      }
    }
  });
  console.log('Matched sigs for Broadcast Reaction:', Array.from(matchedSigs2));

  targetUsers.forEach(u => {
    const sigs = getPhoneSignatures(u.phone);
    const hasMatch = sigs.some(s => matchedSigs2.has(s));
    console.log(`  ${u.name} (${u.phone}): ${hasMatch ? '✓✓ 2 TRAÇOS (SALVO)' : '✓ 1 TRAÇO (PENDENTE)'}`);
  });
}

run().catch(console.error);
