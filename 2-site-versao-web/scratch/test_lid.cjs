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

function extractPhonesFromMessage(m) {
  const phones = new Set();
  if (!m) return phones;

  function addJid(jid) {
    if (!jid || typeof jid !== 'string') return;
    if (jid.includes('@g.us')) return;
    let raw = jid.includes('@') ? jid.split('@')[0] : jid;
    if (raw.includes(':')) raw = raw.split(':')[0];
    const clean = extractCleanPhone(raw);
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
      addJid(ur.userJid || ur.jid || ur.user || ur.userJidAlt);
    });
  }

  if (Array.isArray(m.MessageUpdate)) {
    m.MessageUpdate.forEach((mu) => {
      addJid(mu.participant || mu.fromMeJid || mu.key?.participant || mu.key?.remoteJidAlt || mu.key?.participantAlt);
    });
  }

  return phones;
}

async function testScan() {
  console.log('Fetching recent 500 messages...');
  const res = await req(`/chat/findMessages/${INSTANCE}`, 'POST', { limit: 500 });
  const msgs = res.body?.messages?.records || [];
  console.log(`Fetched ${msgs.length} messages.`);

  msgs.forEach((m, idx) => {
    const phones = Array.from(extractPhonesFromMessage(m));
    const remoteJid = m.key?.remoteJid || m.remoteJid;
    const remoteJidAlt = m.key?.remoteJidAlt;
    if (remoteJidAlt || remoteJid?.includes('@lid')) {
      console.log(`Msg #${idx+1} LID detected! remoteJid=${remoteJid}, remoteJidAlt=${remoteJidAlt} => Extracted phones:`, phones);
    }
  });
}

testScan().catch(console.error);
