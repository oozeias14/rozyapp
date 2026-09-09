const https = require("https");
const base = "https://evolution-api-production-2522.up.railway.app";
const key = "6a76cbf204380d04e7ce897ac00e4f204cafea39bc9b7f74fd830a0fe74b8dec";

function post(path, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body || {});
    const url = new URL(base + path);
    const req = https.request(url, {
      method: "POST",
      headers: {
        "apikey": key,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      }
    }, (res) => {
      let b = "";
      res.on("data", c => b += c);
      res.on("end", () => {
        try { resolve(JSON.parse(b)); } catch(e) { resolve(b); }
      });
    });
    req.on("error", e => resolve({error: e.message}));
    req.write(data);
    req.end();
  });
}

function normalize(str) {
  if (!str) return "";
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function cleanPhone(raw) {
  if (!raw) return "";
  return String(raw).replace(/\D/g, "");
}

function getPhoneSignatures(phone) {
  const c = cleanPhone(phone);
  if (!c) return [];
  const sigs = new Set();
  sigs.add(c);
  if (c.startsWith("0")) sigs.add(c.substring(1));
  if (c.startsWith("55") && c.length >= 12) sigs.add(c.substring(2));
  
  let num = c;
  if (num.startsWith("55") && num.length >= 12) num = num.substring(2);
  if (num.length === 8 || num.length === 9) num = "61" + num;

  if (num.length === 11) {
    const ddd = num.substring(0, 2);
    const rest = num.substring(3);
    sigs.add("55" + num);
    sigs.add(num);
    sigs.add("55" + ddd + rest);
    sigs.add(ddd + rest);
    sigs.add(rest);
    sigs.add(num.substring(2));
  } else if (num.length === 10) {
    const ddd = num.substring(0, 2);
    const rest = num.substring(2);
    sigs.add("55" + num);
    sigs.add(num);
    sigs.add("55" + ddd + "9" + rest);
    sigs.add(ddd + "9" + rest);
    sigs.add(rest);
    sigs.add("9" + rest);
  }

  if (c.length >= 8) sigs.add(c.slice(-8));
  if (c.length >= 9) sigs.add(c.slice(-9));
  return Array.from(sigs);
}

function doesMatchPhrase(text, targetPhrase) {
  if (!text || !targetPhrase) return false;
  const t = normalize(text);
  const p = normalize(targetPhrase);
  if (t.includes(p)) return true;
  const tComp = t.replace(/[\s\-_.,!?:;]+/g, "");
  const pComp = p.replace(/[\s\-_.,!?:;]+/g, "");
  if (pComp.length >= 2 && tComp.includes(pComp)) return true;
  const words = p.split(/[\s\-_.,!?:;]+/).filter(w => w.length > 0);
  if (words.length > 0 && words.every(w => t.includes(w) || tComp.includes(w))) return true;
  return false;
}

function extractActualText(m) {
  if (!m) return "";
  if (typeof m === "string") return m;
  const textParts = [];
  function add(t) { if (typeof t === "string" && t.trim()) textParts.push(t.trim()); }
  add(m.message?.conversation);
  add(m.message?.extendedTextMessage?.text);
  add(m.message?.ephemeralMessage?.message?.conversation);
  add(m.message?.ephemeralMessage?.message?.extendedTextMessage?.text);
  add(m.message?.imageMessage?.caption);
  add(m.message?.videoMessage?.caption);
  add(m.message?.documentMessage?.caption);
  add(m.message?.documentMessage?.fileName);
  add(m.message?.documentMessage?.title);
  add(m.message?.templateButtonReplyMessage?.selectedDisplayText);
  add(m.message?.buttonsResponseMessage?.selectedDisplayText);
  add(m.message?.reactionMessage?.text);
  if (typeof m.body === "string") add(m.body);
  if (typeof m.text === "string") add(m.text);
  if (m.lastMessage) {
    const sub = extractActualText(m.lastMessage);
    if (sub) textParts.push(sub);
  }
  return textParts.join(" ");
}

function isRecent(msg, maxHours = 2) {
  if (!msg) return false;
  let ts = msg.messageTimestamp || msg.createdAt || msg.updatedAt;
  if (!ts && msg.lastMessage) ts = msg.lastMessage.messageTimestamp || msg.lastMessage.createdAt || msg.lastMessage.updatedAt;
  if (!ts) return false;
  if (typeof ts === "object" && ts !== null && ts.low) ts = ts.low;
  if (typeof ts === "string") {
    if (ts.includes("-") || ts.includes("T")) {
      const dt = new Date(ts);
      if (!isNaN(dt.getTime())) ts = Math.floor(dt.getTime() / 1000);
    } else {
      ts = parseInt(ts, 10);
    }
  }
  if (ts > 10000000000) ts = Math.floor(ts / 1000);
  const nowSec = Math.floor(Date.now() / 1000);
  const diffHours = (nowSec - ts) / 3600;
  return diffHours >= -1.0 && diffHours <= maxHours;
}

async function runTest() {
  console.log("=== Fetching all data from Evolution API ===");
  const contactsRes = await post("/chat/findContacts/dr_candido", {});
  const contacts = Array.isArray(contactsRes) ? contactsRes : (contactsRes?.records || []);

  const chatsRes = await post("/chat/findChats/dr_candido", {});
  const chats = Array.isArray(chatsRes) ? chatsRes : (chatsRes?.records || []);

  const allMsgsList = [];
  // Broadcast messages
  const bMsgsRes = await post("/chat/findMessages/dr_candido", { where: { broadcast: true }, limit: 100 });
  const bMsgs = bMsgsRes?.messages?.records || (Array.isArray(bMsgsRes) ? bMsgsRes : []);
  allMsgsList.push(...bMsgs);

  // General messages
  for (let p = 1; p <= 3; p++) {
    const gMsgsRes = await post("/chat/findMessages/dr_candido", { limit: 100, page: p });
    const recs = gMsgsRes?.messages?.records || (Array.isArray(gMsgsRes) ? gMsgsRes : []);
    if (recs.length > 0) allMsgsList.push(...recs);
  }

  // Broadcast JIDs
  const broadcastJids = new Set(["1788673682@broadcast"]);
  chats.forEach(c => {
    const rj = c.remoteJid || c.id || "";
    if (rj.includes("@broadcast")) broadcastJids.add(rj);
  });
  allMsgsList.forEach(m => {
    const rj = m.key?.remoteJid || m.remoteJid || "";
    if (rj.includes("@broadcast")) broadcastJids.add(rj);
  });

  for (const bjId of broadcastJids) {
    const bFetch = await post("/chat/findMessages/dr_candido", { where: { key: { remoteJid: bjId } }, limit: 50 });
    const recs = bFetch?.messages?.records || (Array.isArray(bFetch) ? bFetch : []);
    allMsgsList.push(...recs);
  }

  // Status records
  const statusRecords = [];
  for (const bjId of broadcastJids) {
    const sRes = await post("/chat/findStatusMessage/dr_candido", { where: { remoteJid: bjId } });
    const sList = Array.isArray(sRes) ? sRes : (sRes?.records || []);
    statusRecords.push(...sList);
  }
  const sResAll = await post("/chat/findStatusMessage/dr_candido", { limit: 100 });
  const sAllList = Array.isArray(sResAll) ? sResAll : (sResAll?.records || []);
  statusRecords.push(...sAllList);

  // Deduplicate messages
  const msgMap = new Map();
  allMsgsList.forEach(m => {
    const id = m.key?.id || m.id;
    if (id) msgMap.set(id, m);
  });
  const allMsgs = Array.from(msgMap.values());

  // Build LID Mapping
  const lidToPhone = new Map();
  function registerLid(lidStr, phoneStr) {
    if (!lidStr || !phoneStr) return;
    const cLid = cleanPhone(lidStr);
    const cPhone = cleanPhone(phoneStr);
    if (cLid && cPhone && cLid !== cPhone && cPhone.length >= 8) {
      lidToPhone.set(cLid, cPhone);
    }
  }

  contacts.forEach(ct => {
    const id = ct.id || ct.remoteJid || "";
    const alt = ct.remoteJidAlt || ct.phoneNumber || "";
    if (id.includes("@lid") && alt) registerLid(id, alt);
  });
  chats.forEach(c => {
    const rj = c.remoteJid || c.id || "";
    const alt = c.remoteJidAlt || c.lastMessage?.key?.remoteJidAlt || c.lastMessage?.key?.participantAlt || "";
    if (rj.includes("@lid") && alt) registerLid(rj, alt);
    if (alt.includes("@lid") && rj) registerLid(alt, rj);
  });
  allMsgs.forEach(m => {
    const rj = m.key?.remoteJid || m.remoteJid || "";
    const rjAlt = m.key?.remoteJidAlt || m.remoteJidAlt || "";
    const part = m.key?.participant || m.participant || "";
    const partAlt = m.key?.participantAlt || m.participantAlt || "";
    if (rj.includes("@lid") && rjAlt) registerLid(rj, rjAlt);
    if (part.includes("@lid") && partAlt) registerLid(part, partAlt);
    if (m.message?.reactionMessage?.key) {
      const rk = m.message.reactionMessage.key;
      if (rk.participant && rjAlt) registerLid(rk.participant, rjAlt);
    }
  });

  console.log(`Ready! Total unique messages: ${allMsgs.length}, Total status records: ${statusRecords.length}, LID map size: ${lidToPhone.size}`);

  const testPhrases = ["Lista", "Z15s", "Verdes", "Furia 2", "Casa verdess", "teste 1234"];
  for (const phrase of testPhrases) {
    const matchedSigs = new Set();
    const matchingMessageIds = new Set();

    allMsgs.forEach(m => {
      if (doesMatchPhrase(extractActualText(m), phrase) && isRecent(m, 2)) {
        if (m.key?.id) matchingMessageIds.add(m.key.id);
        if (m.id) matchingMessageIds.add(m.id);
      }
    });

    chats.forEach(c => {
      if (isRecent(c, 2) && (doesMatchPhrase(extractActualText(c), phrase) || doesMatchPhrase(extractActualText(c.lastMessage), phrase))) {
        if (c.lastMessage?.key?.id) matchingMessageIds.add(c.lastMessage.key.id);
        if (c.lastMessage?.id) matchingMessageIds.add(c.lastMessage.id);
      }
    });

    // 1. Process messages
    allMsgs.forEach(m => {
      const text = extractActualText(m);
      const hasPhrase = doesMatchPhrase(text, phrase);
      const matchesId = (m.key?.id && matchingMessageIds.has(m.key.id)) || (m.id && matchingMessageIds.has(m.id));
      const reactionParentId = m.message?.reactionMessage?.key?.id;
      const refBroadcast = reactionParentId && matchingMessageIds.has(reactionParentId);

      if ((hasPhrase || matchesId || refBroadcast) && isRecent(m, 2)) {
        [m.key?.remoteJid, m.remoteJid, m.key?.remoteJidAlt, m.remoteJidAlt, m.key?.participant, m.participant].forEach(j => {
          if (!j || j.includes("@g.us") || j.includes("@broadcast")) return;
          let clean = cleanPhone(j);
          if (lidToPhone.has(clean)) clean = lidToPhone.get(clean);
          if (clean && clean.length >= 8) {
            getPhoneSignatures(clean).forEach(sig => matchedSigs.add(sig));
          }
        });
      }
    });

    // 2. Process status records
    statusRecords.forEach(sr => {
      const matchesKey = sr.keyId && matchingMessageIds.has(sr.keyId);
      const matchesMsg = sr.messageId && matchingMessageIds.has(sr.messageId);
      if (matchesKey || matchesMsg) {
        [sr.participant, sr.remoteJid, sr.fromMeJid, sr.participantAlt, sr.remoteJidAlt].forEach(j => {
          if (!j || j.includes("@g.us") || j.includes("@broadcast")) return;
          let clean = cleanPhone(j);
          if (lidToPhone.has(clean)) clean = lidToPhone.get(clean);
          if (clean && clean.length >= 8) {
            getPhoneSignatures(clean).forEach(sig => matchedSigs.add(sig));
          }
        });
      }
    });

    // 3. Process chats
    chats.forEach(c => {
      const text = extractActualText(c.lastMessage) || extractActualText(c);
      const hasPhrase = doesMatchPhrase(text, phrase);
      const matchesId = (c.lastMessage?.key?.id && matchingMessageIds.has(c.lastMessage.key.id)) || (c.lastMessage?.id && matchingMessageIds.has(c.lastMessage.id));
      if ((hasPhrase || matchesId) && isRecent(c, 2)) {
        [c.remoteJid, c.id, c.lastMessage?.key?.remoteJidAlt, c.lastMessage?.key?.participantAlt].forEach(j => {
          if (!j || j.includes("@g.us") || j.includes("@broadcast")) return;
          let clean = cleanPhone(j);
          if (lidToPhone.has(clean)) clean = lidToPhone.get(clean);
          if (clean && clean.length >= 8) {
            getPhoneSignatures(clean).forEach(sig => matchedSigs.add(sig));
          }
        });
      }
    });

    // Check Kauan and Kamilla
    const kauanSigs = getPhoneSignatures("6192419984");
    const kamillaSigs = getPhoneSignatures("6194409686");
    const isKauanMatched = kauanSigs.some(s => matchedSigs.has(s));
    const isKamillaMatched = kamillaSigs.some(s => matchedSigs.has(s));

    console.log(`Phrase: "${phrase.padEnd(12)}" -> Kauan Matched: ${isKauanMatched ? "✅ YES" : "❌ NO"} | Kamilla Matched: ${isKamillaMatched ? "✅ YES" : "❌ NO"} | Total matched sigs: ${matchedSigs.size}`);
  }
}

runTest();
