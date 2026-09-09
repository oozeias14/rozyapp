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
  if (!ts) return false; // Se não houver timestamp, NÃO considerar recente

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

function extractActualMessageText(m) {
  if (!m) return '';
  const textParts = [];

  function add(t) {
    if (typeof t === 'string' && t.trim()) {
      textParts.push(t.trim().toLowerCase());
    }
  }

  // Conversa direta
  add(m.message?.conversation);
  add(m.message?.extendedTextMessage?.text);
  add(m.message?.ephemeralMessage?.message?.conversation);
  add(m.message?.ephemeralMessage?.message?.extendedTextMessage?.text);

  // Mídias
  add(m.message?.imageMessage?.caption);
  add(m.message?.videoMessage?.caption);
  add(m.message?.documentMessage?.caption);
  add(m.message?.documentMessage?.fileName);
  add(m.message?.documentMessage?.title);

  // Botões e reações
  add(m.message?.templateButtonReplyMessage?.selectedDisplayText);
  add(m.message?.buttonsResponseMessage?.selectedDisplayText);
  add(m.message?.listResponseMessage?.title);
  add(m.message?.reactionMessage?.text);

  // Campos diretos
  if (typeof m.body === 'string') add(m.body);
  if (typeof m.text === 'string') add(m.text);
  if (typeof m.content === 'string') add(m.content);

  // Se for chat, extrai de lastMessage
  if (m.lastMessage) {
    textParts.push(extractActualMessageText(m.lastMessage));
  }

  return textParts.filter(Boolean).join(' ');
}

function doesMessageContainPhrase(m, targetPhrase) {
  if (!m || !targetPhrase) return false;
  const cleanTarget = targetPhrase.toLowerCase().trim().replace(/^["']|["']$/g, '');
  if (!cleanTarget) return false;

  const text = extractActualMessageText(m);
  if (!text) return false;

  // 1. Match exato
  if (text.includes(cleanTarget)) return true;

  // 2. Match por todas as palavras chaves significativas
  const words = cleanTarget.split(/\s+/).filter(w => w.length >= 2);
  if (words.length > 1 && words.every(w => text.includes(w))) {
    return true;
  }

  return false;
}

function buildLidPhoneMapping(chats, messages) {
  const lidToPhone = new Map();

  function register(lidStr, phoneStr) {
    if (!lidStr || !phoneStr) return;
    const cleanLid = extractCleanPhone(lidStr);
    const cleanPhone = extractCleanPhone(phoneStr);
    if (cleanLid && cleanPhone && cleanLid !== cleanPhone) {
      lidToPhone.set(cleanLid, cleanPhone);
    }
  }

  (chats || []).forEach(c => {
    const rawR = c.remoteJid || c.id || '';
    const altR = c.lastMessage?.key?.remoteJidAlt || c.lastMessage?.key?.participantAlt || '';
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

    if (m.message?.reactionMessage?.key) {
      const rk = m.message.reactionMessage.key;
      if (rk.participant && rAlt) register(rk.participant, rAlt);
    }
  });

  return lidToPhone;
}

function extractPhonesFromMessage(m, lidToPhone = new Map()) {
  const phones = new Set();
  if (!m) return phones;

  function addJid(jid) {
    if (!jid || typeof jid !== 'string') return;
    if (jid.includes('@g.us') || jid.includes('@broadcast')) return;
    let raw = jid.includes('@') ? jid.split('@')[0] : jid;
    if (raw.includes(':')) raw = raw.split(':')[0];
    let clean = extractCleanPhone(raw);
    if (lidToPhone.has(clean)) {
      phones.add(lidToPhone.get(clean));
    }
    if (clean && clean.length >= 8 && clean.length <= 15) {
      phones.add(clean);
    }
  }

  addJid(m.key?.remoteJid || m.remoteJid);
  addJid(m.key?.remoteJidAlt || m.remoteJidAlt);
  addJid(m.key?.participant || m.participant);
  addJid(m.key?.participantAlt || m.participantAlt);

  if (Array.isArray(m.userReceipt)) {
    m.userReceipt.forEach((ur) => {
      addJid(ur.userJid || ur.jid || ur.user);
      addJid(ur.userJidAlt || ur.jidAlt);
    });
  }

  if (Array.isArray(m.MessageUpdate)) {
    m.MessageUpdate.forEach((mu) => {
      addJid(mu.participant || mu.fromMeJid || mu.key?.participant || mu.key?.remoteJidAlt || mu.key?.participantAlt);
    });
  }

  return phones;
}

async function scanAllChatsForPhrase(phraseText, maxHours = 1) {
  const targetPhrase = (phraseText || '').toLowerCase().trim().replace(/^["']|["']$/g, '');
  const matchedSigs = new Set();
  if (!targetPhrase) return matchedSigs;

  const chats = await req('/chat/findChats/' + INSTANCE, 'POST', {}).catch(() => []);
  const msgsP1 = await req('/chat/findMessages/' + INSTANCE, 'POST', { limit: 100, page: 1 }).catch(() => null);
  const msgsP2 = await req('/chat/findMessages/' + INSTANCE, 'POST', { limit: 100, page: 2 }).catch(() => null);

  const list1 = msgsP1?.messages?.records || (Array.isArray(msgsP1) ? msgsP1 : []);
  const list2 = msgsP2?.messages?.records || (Array.isArray(msgsP2) ? msgsP2 : []);
  const msgMap = new Map();
  list1.forEach(m => m?.id && msgMap.set(m.id, m));
  list2.forEach(m => m?.id && msgMap.set(m.id, m));
  const allMsgs = Array.from(msgMap.values());

  const lidToPhone = buildLidPhoneMapping(chats, allMsgs);

  // 1. Mapeia mensagens de listas de transmissão (@broadcast) que contenham a frase
  const broadcastMsgIdsWithPhrase = new Set();
  allMsgs.forEach(m => {
    const rJid = (m.key?.remoteJid || m.remoteJid || '').toLowerCase();
    if (rJid.includes('@broadcast') || m.broadcast || m.isBroadcast) {
      if (doesMessageContainPhrase(m, targetPhrase) && isMessageWithinHours(m, maxHours)) {
        if (m.key?.id) broadcastMsgIdsWithPhrase.add(m.key.id);
      }
    }
  });

  (chats || []).forEach(c => {
    const rJid = (c.remoteJid || c.id || '').toLowerCase();
    if (rJid.includes('@broadcast') || c.isBroadcast) {
      if (doesMessageContainPhrase(c, targetPhrase) &&
          (isMessageWithinHours(c.lastMessage, maxHours) || isMessageWithinHours(c, maxHours))) {
        if (c.lastMessage?.key?.id) broadcastMsgIdsWithPhrase.add(c.lastMessage.key.id);
      }
    }
  });

  // 2. Filtra mensagens que contêm a frase E foram enviadas/recebidas nas últimas maxHours
  allMsgs.forEach(m => {
    const hasPhrase = doesMessageContainPhrase(m, targetPhrase);
    // Somente se a mensagem referencia ESPECIFICAMENTE o ID de uma mensagem de transmissão que continha a frase
    const reactionParentId = m.message?.reactionMessage?.key?.id;
    const referencesBroadcastWithPhrase = reactionParentId && broadcastMsgIdsWithPhrase.has(reactionParentId);

    if ((hasPhrase || referencesBroadcastWithPhrase) && isMessageWithinHours(m, maxHours)) {
      const foundPhones = extractPhonesFromMessage(m, lidToPhone);
      foundPhones.forEach(p => {
        getPhoneSignatures(p).forEach(sig => matchedSigs.add(sig));
      });
    }
  });

  // 3. Filtra conversas ativas no WhatsApp
  (chats || []).forEach(c => {
    const hasPhrase = doesMessageContainPhrase(c, targetPhrase) || doesMessageContainPhrase(c.lastMessage, targetPhrase);
    const reactionParentId = c.lastMessage?.message?.reactionMessage?.key?.id;
    const referencesBroadcastWithPhrase = reactionParentId && broadcastMsgIdsWithPhrase.has(reactionParentId);
    const isRecent = isMessageWithinHours(c.lastMessage, maxHours) || isMessageWithinHours(c, maxHours);

    if ((hasPhrase || referencesBroadcastWithPhrase) && isRecent) {
      const rJid = c.remoteJid || c.id || '';
      const rJidAlt = c.lastMessage?.key?.remoteJidAlt || c.lastMessage?.key?.participantAlt || '';
      const rJidKey = c.lastMessage?.key?.remoteJid || '';

      [rJid, rJidAlt, rJidKey].forEach(j => {
        let cleanP = extractCleanPhone(j);
        if (lidToPhone.has(cleanP)) cleanP = lidToPhone.get(cleanP);
        if (cleanP && cleanP.length >= 8) {
          getPhoneSignatures(cleanP).forEach(sig => matchedSigs.add(sig));
        }
      });
    }
  });

  return matchedSigs;
}

async function run() {
  const targetUsers = [
    { id: 1, name: 'Rozy Costa', phone: '61992623060' },
    { id: 2, name: 'Kamilla Silva', phone: '6194409686' },
    { id: 3, name: 'Rayanne Pereira', phone: '61998265034' },
    { id: 4, name: 'Marcelo Henrique', phone: '61983716917' }
  ];

  console.log('=== TEST 1: FRASE INEXISTENTE ("palavra_aleatoria_12345") ===');
  const sigsInexistente = await scanAllChatsForPhrase('palavra_aleatoria_12345', 1);
  console.log('Total matched sigs:', sigsInexistente.size);
  targetUsers.forEach(u => {
    const s = getPhoneSignatures(u.phone);
    const match = s.some(x => sigsInexistente.has(x));
    console.log(`  ${u.name} (${u.phone}): ${match ? '❌ ERRO: MARCOU SALVO' : '✅ CORRETO: 1 TRAÇO (PENDENTE)'}`);
  });

  console.log('\n=== TEST 2: FRASE INEXISTENTE ("abacaxi azul") ===');
  const sigsAbacaxi = await scanAllChatsForPhrase('abacaxi azul', 1);
  console.log('Total matched sigs:', sigsAbacaxi.size);
  targetUsers.forEach(u => {
    const s = getPhoneSignatures(u.phone);
    const match = s.some(x => sigsAbacaxi.has(x));
    console.log(`  ${u.name} (${u.phone}): ${match ? '❌ ERRO: MARCOU SALVO' : '✅ CORRETO: 1 TRAÇO (PENDENTE)'}`);
  });

  console.log('\n=== TEST 3: FRASE REAL DA KAMILLA ("Casa verdess") ===');
  const sigsKamilla = await scanAllChatsForPhrase('Casa verdess', 1);
  targetUsers.forEach(u => {
    const s = getPhoneSignatures(u.phone);
    const match = s.some(x => sigsKamilla.has(x));
    console.log(`  ${u.name} (${u.phone}): ${match ? '✓✓ 2 TRAÇOS (SALVO)' : '✓ 1 TRAÇO (PENDENTE)'}`);
  });
}

run().catch(console.error);
