const https = require('https');

const SERVER_URL = 'https://evolution-api-production-2522.up.railway.app';
const API_KEY = '6a76cbf204380d04e7ce897ac00e4f204cafea39bc9b7f74fd830a0fe74b8dec';
const INSTANCE = 'dr_candido';

async function req(endpoint, method = 'POST', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SERVER_URL}${endpoint}`);
    const options = {
      method,
      headers: {
        'apikey': API_KEY,
        'Content-Type': 'application/json',
      }
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
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
  let str = String(p).trim();
  if (str.includes('@')) str = str.split('@')[0];
  if (str.includes(':')) str = str.split(':')[0];
  return str.replace(/\D/g, '');
}

function getPhoneSignatures(p) {
  let clean = extractCleanPhone(p);
  if (!clean) return [];
  if (clean.startsWith('0')) clean = clean.substring(1);
  if (clean.startsWith('55') && clean.length >= 12) clean = clean.substring(2);

  if (clean.length === 8 || clean.length === 9) {
    clean = '61' + clean;
  }

  const sigs = new Set();
  sigs.add(clean);
  sigs.add('55' + clean);

  if (clean.length === 11 && clean[2] === '9') {
    const without9 = clean.substring(0, 2) + clean.substring(3);
    sigs.add(without9);
    sigs.add('55' + without9);
  } else if (clean.length === 10) {
    const with9 = clean.substring(0, 2) + '9' + clean.substring(2);
    sigs.add(with9);
    sigs.add('55' + with9);
  }

  return Array.from(sigs);
}

function extractPhonesFromMessage(m) {
  const phones = new Set();
  if (!m) return phones;

  function addJid(jid) {
    if (!jid || typeof jid !== 'string') return;
    if (jid.includes('@g.us')) return; // ignora grupos
    let raw = jid.includes('@') ? jid.split('@')[0] : jid;
    if (raw.includes(':')) raw = raw.split(':')[0];
    const clean = extractCleanPhone(raw);
    // Ignora IDs que são apenas LIDs puros (ex: 15 dígitos que não começam com 55 ou 61)
    if (clean && clean.length >= 8 && clean.length <= 13) {
      phones.add(clean);
    }
  }

  // Prioriza remoteJidAlt e participantAlt para números LID
  if (m.key?.remoteJidAlt) addJid(m.key.remoteJidAlt);
  if (m.remoteJidAlt) addJid(m.remoteJidAlt);
  if (m.key?.participantAlt) addJid(m.key.participantAlt);
  if (m.participantAlt) addJid(m.participantAlt);

  addJid(m.key?.remoteJid || m.remoteJid);
  addJid(m.key?.participant || m.participant);

  if (Array.isArray(m.userReceipt)) {
    m.userReceipt.forEach((ur) => {
      if (ur.userJidAlt) addJid(ur.userJidAlt);
      if (ur.jidAlt) addJid(ur.jidAlt);
      addJid(ur.userJid || ur.jid || ur.user);
    });
  }

  if (Array.isArray(m.MessageUpdate)) {
    m.MessageUpdate.forEach((mu) => {
      if (mu.key?.remoteJidAlt) addJid(mu.key.remoteJidAlt);
      if (mu.key?.participantAlt) addJid(mu.key.participantAlt);
      addJid(mu.participant || mu.fromMeJid || mu.key?.participant);
    });
  }

  return phones;
}

function isMessageWithinHours(msg, maxHours = 12) {
  if (!msg) return false;
  
  let ts = msg.messageTimestamp || msg.createdAt || msg.updatedAt;
  if (!ts && msg.lastMessage) ts = msg.lastMessage.messageTimestamp || msg.lastMessage.createdAt || msg.lastMessage.updatedAt;
  if (!ts) return true;

  if (typeof ts === 'object' && ts !== null && ts.low) {
    ts = ts.low;
  }
  if (typeof ts === 'string') {
    if (ts.includes('-') || ts.includes('T')) {
      const dt = new Date(ts);
      if (!isNaN(dt.getTime())) {
        ts = Math.floor(dt.getTime() / 1000);
      }
    } else {
      ts = parseInt(ts, 10);
    }
  }

  if (ts > 10000000000) {
    ts = Math.floor(ts / 1000);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const diffHours = (nowSec - ts) / 3600;

  return diffHours >= -0.5 && diffHours <= (maxHours || 12);
}

async function fetchAllWhatsAppTransmissionReceipts(maxHours = 12) {
  const receiptsMap = new Map();

  // 1. Busca conversas ativas no WhatsApp (findChats)
  const chatsRes = await req(`/chat/findChats/${INSTANCE}`, 'POST', {}).catch(() => ({ body: [] }));
  const chats = Array.isArray(chatsRes.body) ? chatsRes.body : [];

  chats.forEach((c) => {
    // Ignora grupos
    const rawR = (c.remoteJid || c.id || '').toLowerCase();
    if (rawR.includes('@g.us')) return;

    const altR = c.lastMessage?.key?.remoteJidAlt || c.lastMessage?.key?.participantAlt || '';
    const targetJids = [altR, rawR].filter(Boolean);

    // Verifica se a conversa teve atividade recente dentro da janela de horas
    const isRecent = isMessageWithinHours(c.lastMessage, maxHours) || isMessageWithinHours(c, maxHours);
    if (!isRecent) return;

    targetJids.forEach((j) => {
      if (j.includes('@g.us') || j.includes('@broadcast')) return;
      const clean = extractCleanPhone(j);
      if (clean && clean.length >= 8 && clean.length <= 13) {
        const fromMe = c.lastMessage?.key?.fromMe ?? false;
        const status = (c.lastMessage?.status || '').toUpperCase();
        // Se recebeu mensagem do contato ou foi entregue/lida
        const is2Checks = !fromMe || status === 'DELIVERY_ACK' || status === 'READ' || status === 'PLAYED';

        getPhoneSignatures(clean).forEach((sig) => {
          const existing = receiptsMap.get(sig);
          if (!existing || (!existing.is2Checks && is2Checks)) {
            receiptsMap.set(sig, {
              checks: is2Checks ? 2 : 1,
              is2Checks,
              status: is2Checks ? (status || 'DELIVERY_ACK') : 'SERVER_ACK',
              label: is2Checks ? '✓✓ 2 Traços (Entregue no WhatsApp)' : '✓ 1 Traço (Apenas Servidor)',
              source: 'chat_direct',
              phone: clean
            });
          }
        });
      }
    });
  });

  // 2. Busca múltiplas páginas de mensagens recentes (findMessages)
  for (let page = 1; page <= 4; page++) {
    const msgsRes = await req(`/chat/findMessages/${INSTANCE}`, 'POST', { limit: 100, page }).catch(() => null);
    const records = msgsRes?.body?.messages?.records || (Array.isArray(msgsRes?.body) ? msgsRes.body : []);

    records.forEach((msg) => {
      const rawRemoteJid = (msg?.key?.remoteJid || msg?.remoteJid || '').toLowerCase();
      if (rawRemoteJid.includes('@g.us')) return; // ignora mensagens de grupos

      const isRecent = isMessageWithinHours(msg, maxHours);
      if (!isRecent) return;

      const fromMe = msg?.key?.fromMe ?? true;
      const directStatus = (msg?.status || '').toUpperCase();
      const updates = Array.isArray(msg?.MessageUpdate) ? msg.MessageUpdate : [];
      const isRead = updates.some(u => (u.status || '').toUpperCase() === 'READ' || (u.status || '').toUpperCase() === 'PLAYED') || directStatus === 'READ';
      const isDelivered = isRead || updates.some(u => (u.status || '').toUpperCase() === 'DELIVERY_ACK') || directStatus === 'DELIVERY_ACK';
      const is2Checks = !fromMe || isDelivered;

      const phones = extractPhonesFromMessage(msg);
      phones.forEach((cleanPhone) => {
        getPhoneSignatures(cleanPhone).forEach((sig) => {
          const existing = receiptsMap.get(sig);
          if (!existing || (!existing.is2Checks && is2Checks)) {
            receiptsMap.set(sig, {
              checks: is2Checks ? 2 : 1,
              is2Checks,
              status: is2Checks ? (directStatus || 'DELIVERY_ACK') : 'SERVER_ACK',
              label: is2Checks ? '✓✓ 2 Traços (Entregue no WhatsApp)' : '✓ 1 Traço (Pendente)',
              source: 'message_page',
              phone: cleanPhone
            });
          }
        });
      });
    });
  }

  return receiptsMap;
}

const targetUsers = [
  { id: '1', name: 'Rozy Costa', phone: '61992623060' },
  { id: '2', name: 'kamilla silva costa ramalho', phone: '6194409686' },
  { id: '3', name: 'Rayanne Pereira Costa de Souza', phone: '61998265034' },
  { id: '4', name: 'Marcelo Henrique Teixeira costa', phone: '61983716917' }
];

async function runTest() {
  console.log('Executando auditoria completa com janela de 12 horas...');
  const receiptsMap = await fetchAllWhatsAppTransmissionReceipts(12);

  console.log('\n--- RESULTADO FINAL DO AUDIT ---');
  let savedCount = 0;
  let notSavedCount = 0;

  targetUsers.forEach((u) => {
    const sigs = getPhoneSignatures(u.phone);
    let match = null;
    for (const sig of sigs) {
      if (receiptsMap.has(sig)) {
        match = receiptsMap.get(sig);
        break;
      }
    }

    const is2Checks = Boolean(match?.is2Checks);
    if (is2Checks) savedCount++;
    else notSavedCount++;

    console.log(`\n${is2Checks ? '✅ SALVO (✓✓ 2 Traços)' : '❌ NÃO SALVO (✓ 1 Traço)'}: ${u.name} (${u.phone})`);
    console.log(`   Detalhe: ${match ? match.label : 'Sem conversa individual recente nas últimas 12h'}`);
  });

  console.log(`\n========================================`);
  console.log(`📊 TOTAL: ${savedCount} SALVOS (✓✓) | ${notSavedCount} NÃO SALVOS (✓)`);
  console.log(`========================================`);
}

runTest().catch(console.error);
