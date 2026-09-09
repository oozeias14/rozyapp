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
    if (jid.includes('@g.us')) return;
    let raw = jid.includes('@') ? jid.split('@')[0] : jid;
    if (raw.includes(':')) raw = raw.split(':')[0];
    const clean = extractCleanPhone(raw);
    if (clean && clean.length >= 8 && clean.length <= 15 && !clean.startsWith('234432') && !clean.startsWith('184584') && !clean.startsWith('188072')) {
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

const targetUsers = [
  { id: '1', name: 'Rozy Costa', phone: '61992623060' },
  { id: '2', name: 'kamilla silva costa ramalho', phone: '6194409686' },
  { id: '3', name: 'Rayanne Pereira Costa de Souza', phone: '61998265034' },
  { id: '4', name: 'Marcelo Henrique Teixeira costa', phone: '61983716917' }
];

async function simulate() {
  console.log('=== SIMULAÇÃO DE VARREDURA DE RECIBOS E CHATS ===');
  
  // 1. Fetch findMessages (page 1)
  const msgsPost = await req(`/chat/findMessages/${INSTANCE}`, 'POST', { limit: 500, page: 1 });
  const allMsgs = msgsPost.body?.messages?.records || [];
  console.log(`Mensagens em findMessages: ${allMsgs.length}`);

  // 2. Fetch findChats
  const chatsPost = await req(`/chat/findChats/${INSTANCE}`, 'POST', {});
  const chats = Array.isArray(chatsPost.body) ? chatsPost.body : [];
  console.log(`Chats em findChats: ${chats.length}`);

  const receiptsMap = new Map();

  // Processa chats ativos
  chats.forEach((c) => {
    const rawR = c.remoteJid || c.id || '';
    const altR = c.lastMessage?.key?.remoteJidAlt || c.lastMessage?.key?.participantAlt || '';
    const jids = [rawR, altR].filter(Boolean);

    jids.forEach((j) => {
      if (j.includes('@g.us')) return; // ignora grupos
      const clean = extractCleanPhone(j);
      if (clean && clean.length >= 8 && clean.length <= 15) {
        // Se houver conversa individual recente
        const isFromMe = c.lastMessage?.key?.fromMe ?? false;
        const status = (c.lastMessage?.status || '').toUpperCase();
        const hasIncoming = !isFromMe;
        const is2Checks = hasIncoming || status === 'DELIVERY_ACK' || status === 'READ' || status === 'PLAYED';

        getPhoneSignatures(clean).forEach((sig) => {
          receiptsMap.set(sig, {
            checks: is2Checks ? 2 : 1,
            is2Checks,
            status: is2Checks ? 'DELIVERY_ACK' : 'SERVER_ACK',
            label: is2Checks ? '✓✓ 2 Traços (Conversa Recente no WhatsApp)' : '✓ 1 Traço (Apenas 1 Traço no WhatsApp)',
            source: 'chat_active',
            phone: clean
          });
        });
      }
    });
  });

  // Processa mensagens
  allMsgs.forEach((msg) => {
    const fromMe = msg?.key?.fromMe ?? true;
    const directStatus = (msg?.status || '').toUpperCase();
    const updates = Array.isArray(msg?.MessageUpdate) ? msg.MessageUpdate : [];
    const isRead = updates.some(u => (u.status || '').toUpperCase() === 'READ' || (u.status || '').toUpperCase() === 'PLAYED') || directStatus === 'READ';
    const isDelivered = isRead || updates.some(u => (u.status || '').toUpperCase() === 'DELIVERY_ACK') || directStatus === 'DELIVERY_ACK';
    const hasIncoming = !fromMe;
    const is2Checks = hasIncoming || isDelivered;

    const phones = extractPhonesFromMessage(msg);
    phones.forEach((cleanPhone) => {
      getPhoneSignatures(cleanPhone).forEach((sig) => {
        const existing = receiptsMap.get(sig);
        if (!existing || (!existing.is2Checks && is2Checks)) {
          receiptsMap.set(sig, {
            checks: is2Checks ? 2 : 1,
            is2Checks,
            status: is2Checks ? 'DELIVERY_ACK' : 'SERVER_ACK',
            label: is2Checks ? '✓✓ 2 Traços (Entregue no WhatsApp)' : '✓ 1 Traço (Pendente)',
            source: 'message',
            phone: cleanPhone
          });
        }
      });
    });
  });

  console.log('\n--- RESULTADO DA AVALIAÇÃO DOS 4 CONTATOS ---');
  targetUsers.forEach((u) => {
    const sigs = getPhoneSignatures(u.phone);
    let match = null;
    for (const sig of sigs) {
      if (receiptsMap.has(sig)) {
        match = receiptsMap.get(sig);
        break;
      }
    }
    console.log(`Contato: ${u.name} (${u.phone})`);
    console.log(`  Assinaturas:`, sigs);
    console.log(`  Match encontrado:`, match ? `${match.label} [is2Checks=${match.is2Checks}]` : 'NENHUM MATCH');
  });
}

simulate().catch(console.error);
