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

function normalizeText(str) {
  if (!str || typeof str !== 'string') return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function extractActualMessageText(m) {
  if (!m) return '';
  const textParts = [];
  function add(t) {
    if (typeof t === 'string' && t.trim()) textParts.push(t.trim().toLowerCase());
  }
  add(m.message?.conversation);
  add(m.message?.extendedTextMessage?.text);
  add(m.message?.ephemeralMessage?.message?.conversation);
  add(m.message?.ephemeralMessage?.message?.extendedTextMessage?.text);
  add(m.message?.imageMessage?.caption);
  add(m.message?.videoMessage?.caption);
  add(m.body);
  add(m.text);
  add(m.content);
  if (m.lastMessage) {
    const sub = extractActualMessageText(m.lastMessage);
    if (sub) textParts.push(sub);
  }
  return textParts.filter(Boolean).join(' ');
}

// Improved phrase matcher with robust space-independent, word-independent, and punctuation-independent matching
function doesMessageContainPhrase(m, targetPhrase) {
  if (!m || !targetPhrase) return false;
  const cleanTarget = normalizeText(targetPhrase).replace(/^["']|["']$/g, '');
  if (!cleanTarget) return false;
  const rawText = extractActualMessageText(m);
  if (!rawText) return false;
  const text = normalizeText(rawText);
  if (!text) return false;

  // 1. Direct contains
  if (text.includes(cleanTarget)) return true;

  // 2. Compacted (space-insensitive: "furia 2" matches "furia2")
  const compactedText = text.replace(/[\s\-_.,!?:;]+/g, '');
  const compactedTarget = cleanTarget.replace(/[\s\-_.,!?:;]+/g, '');
  if (compactedTarget.length >= 2 && compactedText.includes(compactedTarget)) return true;

  // 3. All words match
  const words = cleanTarget.split(/[\s\-_.,!?:;]+/).filter(w => w.length >= 1);
  if (words.length > 0 && words.every(w => text.includes(w) || compactedText.includes(w))) return true;

  return false;
}

function isMessageWithinHours(msg, maxHours = 1) {
  if (!msg) return false;
  let ts = msg.messageTimestamp || msg.createdAt || msg.updatedAt;
  if (!ts && msg.lastMessage) ts = msg.lastMessage.messageTimestamp || msg.lastMessage.createdAt || msg.lastMessage.updatedAt;
  if (!ts) return false;

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

async function testPhrase(searchPhrase) {
  console.log(`\n======================================================`);
  console.log(`🔎 TESTING PHRASE: "${searchPhrase}"`);
  console.log(`======================================================`);

  const contactsToTest = [
    { id: 1, name: 'Kauan', phone: '6192419984' },
    { id: 2, name: 'Kamilla Silva', phone: '6194409686' },
    { id: 3, name: 'Rozy Costa', phone: '61992623060' },
    { id: 4, name: 'Rayanne Pereira', phone: '61998265034' },
    { id: 5, name: 'Marcelo Henrique', phone: '61983716917' }
  ];

  // 1. Fetch chats
  const chatsRes = await req('/chat/findChats/' + INSTANCE, 'POST', {});
  const chats = Array.isArray(chatsRes.data) ? chatsRes.data : [];

  // 2. Fetch messages
  const msgsRes = await req('/chat/findMessages/' + INSTANCE, 'POST', { limit: 100, page: 1 });
  const allMsgs = msgsRes.data?.messages?.records || [];

  // 3. Build LID mapping
  const lidToPhone = new Map();
  chats.forEach(c => {
    const rawR = c.remoteJid || c.id || '';
    const altR = c.lastMessage?.key?.remoteJidAlt || c.lastMessage?.key?.participantAlt || '';
    if (rawR.includes('@lid') && altR) lidToPhone.set(extractCleanPhone(rawR), extractCleanPhone(altR));
    if (altR.includes('@lid') && rawR) lidToPhone.set(extractCleanPhone(altR), extractCleanPhone(rawR));
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

  // 4. Scan
  const matchedSigs = new Set();
  allMsgs.forEach(m => {
    if (doesMessageContainPhrase(m, searchPhrase) && isMessageWithinHours(m, 1)) {
      const rawJid = m.key?.remoteJid || m.remoteJid;
      const altJid = m.key?.remoteJidAlt || m.remoteJidAlt;
      const part = m.key?.participant || m.participant;
      [rawJid, altJid, part].forEach(j => {
        if (!j || j.includes('@broadcast') || j.includes('@g.us')) return;
        let clean = extractCleanPhone(j);
        if (lidToPhone.has(clean)) clean = lidToPhone.get(clean);
        if (clean && clean.length >= 8) {
          getPhoneSignatures(clean).forEach(s => matchedSigs.add(s));
        }
      });
    }
  });

  chats.forEach(c => {
    if (c.remoteJid?.includes('@g.us') || c.remoteJid?.includes('@broadcast')) return;
    if (doesMessageContainPhrase(c, searchPhrase) && isMessageWithinHours(c.lastMessage, 1)) {
      const rawJid = c.remoteJid || c.id;
      const altJid = c.lastMessage?.key?.remoteJidAlt || c.lastMessage?.key?.participantAlt;
      [rawJid, altJid].forEach(j => {
        if (!j) return;
        let clean = extractCleanPhone(j);
        if (lidToPhone.has(clean)) clean = lidToPhone.get(clean);
        if (clean && clean.length >= 8) {
          getPhoneSignatures(clean).forEach(s => matchedSigs.add(s));
        }
      });
    }
  });

  contactsToTest.forEach(u => {
    const sigs = getPhoneSignatures(u.phone);
    const hasMatch = sigs.some(s => matchedSigs.has(s));
    console.log(`  ${hasMatch ? '✅' : '❌'} ${u.name} (${u.phone}): ${hasMatch ? '✓✓ 2 TRAÇOS (SALVO)' : '✓ 1 TRAÇO (PENDENTE)'}`);
  });
}

async function main() {
  await testPhrase('Furia 2');
  await testPhrase('furia2');
  await testPhrase('furia');
}

main().catch(console.error);
