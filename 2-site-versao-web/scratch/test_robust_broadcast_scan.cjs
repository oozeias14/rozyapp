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

function doesMessageContainPhrase(m, targetPhrase) {
  if (!m || !targetPhrase) return false;
  const cleanTarget = normalizeText(targetPhrase).replace(/^["']|["']$/g, '');
  if (!cleanTarget) return false;
  const rawText = extractActualMessageText(m);
  if (!rawText) return false;
  const text = normalizeText(rawText);
  if (!text) return false;

  if (text.includes(cleanTarget)) return true;

  const compactedText = text.replace(/[\s\-_.,!?:;]+/g, '');
  const compactedTarget = cleanTarget.replace(/[\s\-_.,!?:;]+/g, '');
  if (compactedTarget.length >= 2 && compactedText.includes(compactedTarget)) return true;

  const words = cleanTarget.split(/[\s\-_.,!?:;]+/).filter((w) => w.length >= 1);
  if (words.length > 0 && words.every((w) => text.includes(w) || compactedText.includes(w))) {
    return true;
  }

  return false;
}

function isMessageWithinHours(msg, maxHours = 2) {
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
  return diffHours >= -1.0 && diffHours <= (maxHours || 2);
}

function buildLidPhoneMapping(chats = [], messages = []) {
  const lidToPhone = new Map();
  function register(lidStr, phoneStr) {
    if (!lidStr || !phoneStr) return;
    const cleanLid = extractCleanPhone(lidStr);
    const cleanPhone = extractCleanPhone(phoneStr);
    if (cleanLid && cleanPhone && cleanLid !== cleanPhone) {
      lidToPhone.set(cleanLid, cleanPhone);
    }
  }

  chats.forEach(c => {
    const rawR = c.remoteJid || c.id || '';
    const altR = c.lastMessage?.key?.remoteJidAlt || c.lastMessage?.key?.participantAlt || '';
    if (rawR.includes('@lid') && altR) register(rawR, altR);
    if (altR.includes('@lid') && rawR) register(altR, rawR);
  });

  messages.forEach(m => {
    const rJid = m.key?.remoteJid || m.remoteJid || '';
    const rAlt = m.key?.remoteJidAlt || m.remoteJidAlt || '';
    const part = m.key?.participant || m.participant || '';
    const partAlt = m.key?.participantAlt || m.participantAlt || '';
    if (rJid.includes('@lid') && rAlt) register(rJid, rAlt);
    if (part.includes('@lid') && partAlt) register(part, partAlt);
    if (m.message?.reactionMessage?.key) {
      const rk = m.message.reactionMessage.key;
      if (rk.participant && rAlt) register(rk.participant, rAlt);
      if (rk.participant && rk.remoteJidAlt) register(rk.participant, rk.remoteJidAlt);
    }
  });

  return lidToPhone;
}

async function testScan(phrase) {
  console.log(`\n==============================================`);
  console.log(`🔍 RUNNING ROBUST SCAN FOR PHRASE: "${phrase}"`);
  console.log(`==============================================`);

  // 1. Fetch chats
  const chatsRes = await req('/chat/findChats/' + INSTANCE, 'POST', {});
  const chats = Array.isArray(chatsRes.data) ? chatsRes.data : [];

  // 2. Fetch messages
  const allMsgsList = [];
  for (let p = 1; p <= 4; p++) {
    const msgsP = await req(`/chat/findMessages/${INSTANCE}`, 'POST', { limit: 100, page: p });
    const recs = msgsP.data?.messages?.records || (Array.isArray(msgsP.data) ? msgsP.data : []);
    if (Array.isArray(recs) && recs.length > 0) allMsgsList.push(...recs);
  }

  // 3. Fetch broadcast chats messages
  const broadcastChats = (chats || []).filter(c => (c.remoteJid || c.id || '').includes('@broadcast'));
  for (const bc of broadcastChats) {
    const bjId = bc.remoteJid || bc.id;
    const bMsgsRes = await req(`/chat/findMessages/${INSTANCE}`, 'POST', { where: { key: { remoteJid: bjId } }, limit: 50 });
    const bRecords = bMsgsRes.data?.messages?.records || (Array.isArray(bMsgsRes.data) ? bMsgsRes.data : []);
    if (Array.isArray(bRecords) && bRecords.length > 0) allMsgsList.push(...bRecords);
  }

  const msgMap = new Map();
  allMsgsList.forEach((m) => m?.id && msgMap.set(m.id, m));
  const allMsgs = Array.from(msgMap.values());

  const lidToPhone = buildLidPhoneMapping(chats, allMsgs);

  // 4. Find all matching message IDs
  const matchingMessageIds = new Set();
  allMsgs.forEach((m) => {
    if (doesMessageContainPhrase(m, phrase) && isMessageWithinHours(m, 2)) {
      if (m.key?.id) matchingMessageIds.add(m.key.id);
      if (m.id) matchingMessageIds.add(m.id);
    }
  });

  (chats || []).forEach((c) => {
    const isRecent = isMessageWithinHours(c.lastMessage, 2) || isMessageWithinHours(c, 2);
    if (isRecent && (doesMessageContainPhrase(c, phrase) || doesMessageContainPhrase(c.lastMessage, phrase))) {
      if (c.lastMessage?.key?.id) matchingMessageIds.add(c.lastMessage.key.id);
      if (c.lastMessage?.id) matchingMessageIds.add(c.lastMessage.id);
    }
  });

  console.log(`Matching message IDs:`, Array.from(matchingMessageIds));

  // 5. Query status receipts for each broadcast chat and for matching message IDs
  const statusRecords = [];
  for (const bc of broadcastChats) {
    const bjId = bc.remoteJid || bc.id;
    const sRes = await req(`/chat/findStatusMessage/${INSTANCE}`, 'POST', { where: { remoteJid: bjId } });
    if (Array.isArray(sRes.data)) statusRecords.push(...sRes.data);
  }

  console.log(`Found ${statusRecords.length} status records for broadcast chats.`);

  const matchedSigs = new Set();

  // A) Match from direct/individual messages in allMsgs
  allMsgs.forEach((m) => {
    const hasPhrase = doesMessageContainPhrase(m, phrase);
    const matchesId = m.key?.id && matchingMessageIds.has(m.key.id);
    if ((hasPhrase || matchesId) && isMessageWithinHours(m, 2)) {
      const rawJid = m.key?.remoteJid || m.remoteJid;
      const altJid = m.key?.remoteJidAlt || m.remoteJidAlt;
      const part = m.key?.participant || m.participant;
      [rawJid, altJid, part].forEach((j) => {
        if (!j || j.includes('@broadcast') || j.includes('@g.us')) return;
        let clean = extractCleanPhone(j);
        if (lidToPhone.has(clean)) clean = lidToPhone.get(clean);
        if (clean && clean.length >= 8) getPhoneSignatures(clean).forEach(s => matchedSigs.add(s));
      });
    }
  });

  // B) Match from status records of broadcast chats
  statusRecords.forEach((sr) => {
    const matchesKey = sr.keyId && matchingMessageIds.has(sr.keyId);
    const matchesMsg = sr.messageId && matchingMessageIds.has(sr.messageId);
    if (matchesKey || matchesMsg) {
      console.log(`  -> Status match: participant=${sr.participant}, remoteJid=${sr.remoteJid}, status=${sr.status}`);
      const jids = [sr.participant, sr.remoteJid].filter(Boolean);
      jids.forEach((j) => {
        if (j.includes('@broadcast') || j.includes('@g.us')) return;
        let clean = extractCleanPhone(j);
        if (lidToPhone.has(clean)) clean = lidToPhone.get(clean);
        if (clean && clean.length >= 8) getPhoneSignatures(clean).forEach(s => matchedSigs.add(s));
      });
    }
  });

  // C) Match from active chats
  chats.forEach((c) => {
    const hasPhrase = doesMessageContainPhrase(c, phrase) || doesMessageContainPhrase(c.lastMessage, phrase);
    const matchesId = c.lastMessage?.key?.id && matchingMessageIds.has(c.lastMessage.key.id);
    const isRecent = isMessageWithinHours(c.lastMessage, 2) || isMessageWithinHours(c, 2);
    if ((hasPhrase || matchesId) && isRecent) {
      const rawJid = c.remoteJid || c.id;
      const altJid = c.lastMessage?.key?.remoteJidAlt || c.lastMessage?.key?.participantAlt;
      [rawJid, altJid].forEach((j) => {
        if (!j || j.includes('@broadcast') || j.includes('@g.us')) return;
        let clean = extractCleanPhone(j);
        if (lidToPhone.has(clean)) clean = lidToPhone.get(clean);
        if (clean && clean.length >= 8) getPhoneSignatures(clean).forEach(s => matchedSigs.add(s));
      });
    }
  });

  const contactsToTest = [
    { id: 1, name: 'Kauan', phone: '6192419984' },
    { id: 2, name: 'Kamilla Silva', phone: '6194409686' },
    { id: 3, name: 'Rozy Costa', phone: '61992623060' }
  ];

  console.log('\n--- VERIFICATION RESULTS ---');
  contactsToTest.forEach(u => {
    const sigs = getPhoneSignatures(u.phone);
    const hasMatch = sigs.some(s => matchedSigs.has(s));
    console.log(`  ${hasMatch ? '✅' : '❌'} ${u.name} (${u.phone}): ${hasMatch ? '✓✓ 2 TRAÇOS (SALVO NA AGENDA)' : '✓ 1 TRAÇO (PENDENTE)'}`);
  });
}

async function main() {
  await testScan('Verdes');
}

main().catch(console.error);
