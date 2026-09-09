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

async function run() {
  const contacts = await fetchApi('/chat/findContacts/' + INSTANCE, 'POST', {});
  const chats = await fetchApi('/chat/findChats/' + INSTANCE, 'POST', {});
  const msgsRes = await fetchApi('/chat/findMessages/' + INSTANCE, 'POST', { limit: 100 });
  const msgs = msgsRes?.messages?.records || [];

  const lidToPhone = new Map();
  function register(l, p) {
    const cl = extractCleanPhone(l);
    const cp = extractCleanPhone(p);
    if (cl && cp && cl !== cp && cp.length >= 8) {
      lidToPhone.set(cl, cp);
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

  (msgs || []).forEach(m => {
    const rJid = m.key?.remoteJid || m.remoteJid || '';
    const rAlt = m.key?.remoteJidAlt || m.remoteJidAlt || '';
    const part = m.key?.participant || m.participant || '';
    const partAlt = m.key?.participantAlt || m.participantAlt || '';
    if (rJid.includes('@lid') && rAlt) register(rJid, rAlt);
    if (part.includes('@lid') && partAlt) register(part, partAlt);
  });

  console.log('Total mappings in lidToPhone:', lidToPhone.size);
  for (const [k, v] of lidToPhone.entries()) {
    console.log(`LID ${k} => Phone ${v}`);
  }
}

run();
