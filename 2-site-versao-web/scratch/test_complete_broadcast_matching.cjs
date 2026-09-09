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
  console.log('=== TESTE DE CRUZAMENTO DIRETO DA TRANSMISSAO ===');
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

  // Broadcast lists
  const broadcastJids = new Set(['1788673682@broadcast']);
  (chats || []).forEach(c => {
    const rj = c.remoteJid || c.id || '';
    if (rj.includes('@broadcast')) broadcastJids.add(rj);
  });

  for (const bjId of broadcastJids) {
    const bRes = await fetchApi('/chat/findMessages/' + INSTANCE, 'POST', {
      where: { key: { remoteJid: bjId } },
      limit: 50
    });
    const bRecs = bRes?.messages?.records || [];
    allMsgsList.push(...bRecs);
  }

  const lidToPhone = buildLidPhoneMapping(chats, allMsgsList, contacts);
  console.log('LID mappings:', lidToPhone.size);

  const statusRecords = [];
  for (const bjId of broadcastJids) {
    const sRes = await fetchApi('/chat/findStatusMessage/' + INSTANCE, 'POST', {
      where: { remoteJid: bjId },
      limit: 500
    });
    const sList = Array.isArray(sRes) ? sRes : (sRes?.records || []);
    statusRecords.push(...sList);
  }

  const sGeneral = await fetchApi('/chat/findStatusMessage/' + INSTANCE, 'POST', { limit: 500 });
  const sGenList = Array.isArray(sGeneral) ? sGeneral : (sGeneral?.records || []);
  statusRecords.push(...sGenList);

  console.log('Total status records:', statusRecords.length);

  // Test contacts: Kauan (61992419984), Kamilla (61994409686), Rozy (61992623060), Marcelo (61983716917)
  const testPhones = [
    { name: 'Kauan', phone: '61992419984' },
    { name: 'Kamilla', phone: '61994409686' },
    { name: 'Rozy', phone: '61992623060' },
    { name: 'Marcelo', phone: '61983716917' }
  ];

  for (const tp of testPhones) {
    const sigs = getPhoneSignatures(tp.phone);
    console.log(`\n--- Checando ${tp.name} (${tp.phone}) ---`);
    
    // Status delivery matches
    let foundDelivery = false;
    for (const sr of statusRecords) {
      if (sr.status === 'DELIVERY_ACK' || sr.status === 'READ' || sr.status === 'PLAYED') {
        const jids = [sr.participant, sr.remoteJid, sr.participantAlt, sr.remoteJidAlt].filter(Boolean);
        for (const j of jids) {
          if (j.includes('@g.us') || j.includes('@broadcast')) continue;
          let clean = extractCleanPhone(j);
          if (lidToPhone.has(clean)) clean = lidToPhone.get(clean);
          if (clean && sigs.includes(clean)) {
            console.log(`✅ ENCONTRADO EM statusMessage! keyId: ${sr.keyId}, status: ${sr.status}, LID: ${j} -> Phone: ${clean}`);
            foundDelivery = true;
            break;
          }
        }
      }
      if (foundDelivery) break;
    }

    // Direct chats matches
    if (!foundDelivery) {
      for (const c of chats) {
        const jids = [c.remoteJid, c.id, c.remoteJidAlt, c.lastMessage?.key?.remoteJidAlt, c.lastMessage?.key?.participantAlt].filter(Boolean);
        for (const j of jids) {
          if (j.includes('@g.us') || j.includes('@broadcast')) continue;
          let clean = extractCleanPhone(j);
          if (lidToPhone.has(clean)) clean = lidToPhone.get(clean);
          if (clean && sigs.includes(clean)) {
            console.log(`✅ ENCONTRADO EM CHAT! chat ID: ${c.id}, LID: ${j} -> Phone: ${clean}`);
            foundDelivery = true;
            break;
          }
        }
        if (foundDelivery) break;
      }
    }

    if (!foundDelivery) {
      console.log(`❌ NÃO ENCONTRADO (Pendente)`);
    }
  }
}
run();
