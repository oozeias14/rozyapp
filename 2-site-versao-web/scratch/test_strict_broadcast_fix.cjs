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

function extractCleanPhone(p) {
  if (!p) return '';
  let str = typeof p === 'string' ? p : String(p || '');
  if (str.includes('@g.us') || str.includes('broadcast')) return '';
  if (str.includes('@')) str = str.split('@')[0];
  if (str.includes(':')) str = str.split(':')[0];
  return str.replace(/\D/g, '');
}

function getPhoneSignatures(p) {
  let clean = extractCleanPhone(p);
  if (!clean) return [];
  const sigs = new Set();
  sigs.add(clean);
  if (clean.startsWith('0')) sigs.add(clean.substring(1));
  if (clean.startsWith('55') && clean.length >= 12) sigs.add(clean.substring(2));

  let num = clean;
  if (num.startsWith('55') && num.length >= 12) num = num.substring(2);
  if (num.length === 8 || num.length === 9) num = '61' + num;

  if (num.length === 11) {
    const ddd = num.substring(0, 2);
    const rest8 = num.substring(3);
    const rest9 = num.substring(2);
    sigs.add('55' + num);
    sigs.add(num);
    sigs.add('55' + ddd + rest8);
    sigs.add(ddd + rest8);
    sigs.add(rest8);
    sigs.add(rest9);
  } else if (num.length === 10) {
    const ddd = num.substring(0, 2);
    const rest8 = num.substring(2);
    sigs.add('55' + num);
    sigs.add(num);
    sigs.add('55' + ddd + '9' + rest8);
    sigs.add(ddd + '9' + rest8);
    sigs.add(rest8);
    sigs.add('9' + rest8);
  }

  if (clean.length >= 8) sigs.add(clean.slice(-8));
  if (clean.length >= 9) sigs.add(clean.slice(-9));

  return Array.from(sigs);
}

function isMessageWithinHours(msg, maxHours = 0.25) {
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
  return diffHours >= -0.1 && diffHours <= (maxHours || 0.25);
}

function buildLidPhoneMapping(chats = [], messages = [], contacts = []) {
  const lidToPhone = new Map();
  function register(lidStr, phoneStr) {
    if (!lidStr || !phoneStr) return;
    const cleanLid = extractCleanPhone(lidStr);
    const cleanPhone = extractCleanPhone(phoneStr);
    if (cleanLid && cleanPhone && cleanLid !== cleanPhone && cleanPhone.length >= 8) {
      lidToPhone.set(cleanLid, cleanPhone);
    }
  }

  (contacts || []).forEach(ct => {
    const id = ct.id || ct.remoteJid || '';
    const alt = ct.remoteJidAlt || ct.phoneNumber || ct.number || '';
    if (id.includes('@lid') && alt) register(id, alt);
    if (alt.includes('@lid') && id) register(alt, id);
  });

  (chats || []).forEach(c => {
    const rawR = c.remoteJid || c.id || '';
    const altR = c.remoteJidAlt || c.lastMessage?.key?.remoteJidAlt || c.lastMessage?.key?.participantAlt || '';
    if (rawR.includes('@lid') && altR) register(rawR, altR);
    if (altR.includes('@lid') && rawR) register(altR, rawR);
  });

  (messages || []).forEach(m => {
    const rJid = m.key?.remoteJid || m.remoteJid || '';
    const rAlt = m.key?.remoteJidAlt || m.remoteJidAlt || '';
    const part = m.key?.participant || m.participant || '';
    const partAlt = m.key?.participantAlt || m.participantAlt || '';

    if (rJid.includes('@lid') && rAlt) register(rJid, rAlt);
    if (part.includes('@lid') && partAlt) register(part, partAlt);
  });

  return lidToPhone;
}

async function run() {
  const [contacts, chats] = await Promise.all([
    fetchApi('/chat/findContacts/' + INSTANCE, 'POST', {}),
    fetchApi('/chat/findChats/' + INSTANCE, 'POST', {})
  ]);

  const allMsgsList = [];
  for (let p = 1; p <= 4; p++) {
    const res = await fetchApi('/chat/findMessages/' + INSTANCE, 'POST', { limit: 100, page: p });
    const recs = res?.messages?.records || [];
    allMsgsList.push(...recs);
  }

  const broadcastJids = new Set(['1788673682@broadcast']);
  (chats || []).forEach(c => {
    const rj = c.remoteJid || c.id || '';
    if (rj.includes('@broadcast')) broadcastJids.add(rj);
  });

  for (const bjId of broadcastJids) {
    const bRes = await fetchApi('/chat/findMessages/' + INSTANCE, 'POST', {
      where: { key: { remoteJid: bjId } },
      limit: 100
    });
    const bRecs = bRes?.messages?.records || [];
    allMsgsList.push(...bRecs);
  }

  const lidToPhone = buildLidPhoneMapping(chats, allMsgsList, contacts);

  // Status records for broadcast lists ONLY
  const statusRecords = [];
  for (const bjId of broadcastJids) {
    const sRes = await fetchApi('/chat/findStatusMessage/' + INSTANCE, 'POST', {
      where: { remoteJid: bjId },
      limit: 500
    });
    const sList = Array.isArray(sRes) ? sRes : (sRes?.records || []);
    statusRecords.push(...sList);
  }

  const maxHours = 0.25; // 15 min
  const matchedSigs = new Set();

  // 1. Process broadcast delivery receipts
  statusRecords.forEach((sr) => {
    const isDelivered = sr.status === 'DELIVERY_ACK' || sr.status === 'READ' || sr.status === 'PLAYED';
    if (!isDelivered) return;

    const jids = [sr.participant, sr.participantAlt].filter(Boolean);
    jids.forEach((j) => {
      if (j.includes('@g.us') || j.includes('@broadcast')) return;
      let clean = extractCleanPhone(j);
      if (lidToPhone.has(clean)) clean = lidToPhone.get(clean);
      if (clean && clean.length >= 8) {
        getPhoneSignatures(clean).forEach(sig => matchedSigs.add(sig));
      }
    });
  });

  // 2. Process direct 1:1 messages ONLY (IGNORE GROUPS @g.us) within 15 min
  allMsgsList.forEach((m) => {
    const remoteJid = m.key?.remoteJid || m.remoteJid || '';
    if (remoteJid.includes('@g.us') || remoteJid.includes('@broadcast')) return; // IGNORA GRUPOS E BROADCAST

    if (isMessageWithinHours(m, maxHours)) {
      const jids = [m.key?.remoteJid, m.key?.remoteJidAlt].filter(Boolean);
      jids.forEach((j) => {
        let clean = extractCleanPhone(j);
        if (lidToPhone.has(clean)) clean = lidToPhone.get(clean);
        if (clean && clean.length >= 8) {
          getPhoneSignatures(clean).forEach(sig => matchedSigs.add(sig));
        }
      });
    }
  });

  // 3. Process direct 1:1 chats ONLY (IGNORE GROUPS @g.us) within 15 min
  (chats || []).forEach((c) => {
    const rJid = c.remoteJid || c.id || '';
    if (rJid.includes('@g.us') || rJid.includes('@broadcast')) return; // IGNORA GRUPOS E BROADCAST

    if (isMessageWithinHours(c.lastMessage, maxHours) || isMessageWithinHours(c, maxHours)) {
      const jids = [rJid, c.remoteJidAlt, c.lastMessage?.key?.remoteJidAlt].filter(Boolean);
      jids.forEach((j) => {
        let clean = extractCleanPhone(j);
        if (lidToPhone.has(clean)) clean = lidToPhone.get(clean);
        if (clean && clean.length >= 8) {
          getPhoneSignatures(clean).forEach(sig => matchedSigs.add(sig));
        }
      });
    }
  });

  console.log('Total matched signatures strictly (no groups, strictly 15 min):', matchedSigs.size);

  const testContacts = [
    { name: 'Kauan', phone: '61992419984' },
    { name: 'Kamilla', phone: '61994409686' },
    { name: 'Thúlio Cunha Moraes', phone: '61993654070' }
  ];

  testContacts.forEach(tc => {
    const sigs = getPhoneSignatures(tc.phone);
    const is2Checks = sigs.some(s => matchedSigs.has(s));
    console.log(`Contato: ${tc.name} (${tc.phone}) -> ${is2Checks ? '✅ 2 TRAÇOS (SALVO)' : '❌ 1 TRAÇO (NÃO SALVO / PENDENTE)'}`);
  });
}

run();
