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

function getPhoneSignatures(clean) {
  if (!clean) return [];
  const sigs = new Set();
  sigs.add(clean);
  if (clean.length === 11) {
    const ddd = clean.substring(0, 2);
    const rest = clean.substring(3);
    sigs.add('55' + clean);
    sigs.add(clean);
    sigs.add('55' + ddd + rest);
    sigs.add(ddd + rest);
  }
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
  console.log(`Msg TS: ${ts} (${new Date(ts*1000).toLocaleTimeString()}) | Now: ${nowSec} | diffMin: ${(diffHours * 60).toFixed(1)} min | within: ${diffHours >= -0.1 && diffHours <= maxHours}`);
  return diffHours >= -0.1 && diffHours <= (maxHours || 0.25);
}

async function run() {
  console.log('--- TESTANDO SCAN COMPLETO DE BROADCAST ---');
  const msgsRes = await fetchApi('/chat/findMessages/' + INSTANCE, 'POST', {
    where: { key: { remoteJid: '1788673682@broadcast' } }
  });
  const msgs = msgsRes?.messages?.records || [];

  const matchedMessageIds = new Set();
  msgs.forEach(m => {
    console.log('Evaluating broadcast msg:', m.key?.id);
    if (isMessageWithinHours(m, 0.25)) {
      matchedMessageIds.add(m.key?.id);
    }
  });

  console.log('Matched message IDs:', Array.from(matchedMessageIds));

  // Status records
  const statusRes = await fetchApi('/chat/findStatusMessage/' + INSTANCE, 'POST', {
    where: { remoteJid: '1788673682@broadcast' }
  });
  const statusList = Array.isArray(statusRes) ? statusRes : (statusRes?.records || []);
  console.log('Total status for 1788673682@broadcast:', statusList.length);

  statusList.forEach(s => {
    console.log('Status record -> keyId:', s.keyId, 'status:', s.status, 'participant:', s.participant, 'match:', matchedMessageIds.has(s.keyId));
  });
}
run();
