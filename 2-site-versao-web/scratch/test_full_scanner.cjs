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
  if (c.startsWith("55") && c.length > 10) sigs.add(c.slice(2));
  if (c.length >= 8) sigs.add(c.slice(-8));
  if (c.length >= 9) sigs.add(c.slice(-9));
  if (c.length >= 10) sigs.add(c.slice(-10));
  if (c.length >= 11) sigs.add(c.slice(-11));
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
  if (m.text) return m.text;
  if (m.body) return m.body;
  if (m.conversation) return m.conversation;
  const msg = m.message || m;
  if (typeof msg === "string") return msg;
  if (msg.conversation) return msg.conversation;
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
  if (msg.imageMessage?.caption) return msg.imageMessage.caption;
  if (msg.videoMessage?.caption) return msg.videoMessage.caption;
  if (msg.templateButtonReplyMessage?.selectedId) return msg.templateButtonReplyMessage.selectedId;
  if (msg.buttonsResponseMessage?.selectedButtonId) return msg.buttonsResponseMessage.selectedButtonId;
  if (msg.reactionMessage?.text) return msg.reactionMessage.text;
  return "";
}

(async () => {
  console.log("=== Building LID mapping from all sources ===");
  const lidToPhone = new Map();

  function registerLid(lid, phone) {
    const cLid = cleanPhone(lid);
    const cPhone = cleanPhone(phone);
    if (cLid && cPhone && cPhone.length >= 8 && cLid !== cPhone) {
      lidToPhone.set(cLid, cPhone);
    }
  }

  // Source A: Contacts
  const contactsRes = await post("/chat/findContacts/dr_candido", {});
  const contacts = Array.isArray(contactsRes) ? contactsRes : (contactsRes?.records || []);
  contacts.forEach(ct => {
    const id = ct.id || ct.remoteJid || "";
    const alt = ct.remoteJidAlt || ct.phoneNumber || "";
    if (id.includes("@lid") && alt) registerLid(id, alt);
  });

  // Source B: Chats
  const chatsRes = await post("/chat/findChats/dr_candido", {});
  const chats = Array.isArray(chatsRes) ? chatsRes : (chatsRes?.records || []);
  chats.forEach(c => {
    const rj = c.remoteJid || c.id || "";
    const alt = c.remoteJidAlt || c.lastMessage?.key?.remoteJidAlt || c.lastMessage?.key?.participantAlt || "";
    if (rj.includes("@lid") && alt) registerLid(rj, alt);
  });

  // Source C: Messages (broadcast & general)
  const bMsgsRes = await post("/chat/findMessages/dr_candido", { where: { broadcast: true }, limit: 100 });
  const bMsgs = bMsgsRes?.messages?.records || (Array.isArray(bMsgsRes) ? bMsgsRes : []);
  
  const gMsgsRes = await post("/chat/findMessages/dr_candido", { limit: 100 });
  const gMsgs = gMsgsRes?.messages?.records || (Array.isArray(gMsgsRes) ? gMsgsRes : []);

  const allMsgs = [...bMsgs, ...gMsgs];
  allMsgs.forEach(m => {
    const rj = m.key?.remoteJid || m.remoteJid || "";
    const rjAlt = m.key?.remoteJidAlt || m.remoteJidAlt || "";
    const part = m.key?.participant || m.participant || "";
    const partAlt = m.key?.participantAlt || m.participantAlt || "";

    if (rj.includes("@lid") && rjAlt) registerLid(rj, rjAlt);
    if (part.includes("@lid") && partAlt) registerLid(part, partAlt);
  });

  console.log(`LID Map contains ${lidToPhone.size} entries:`);
  for (const [k, v] of lidToPhone.entries()) {
    console.log(`  LID ${k} -> Phone ${v}`);
  }

  // Find all broadcast JIDs
  const broadcastJids = new Set(["1788673682@broadcast"]);
  bMsgs.forEach(m => {
    const rj = m.key?.remoteJid || m.remoteJid || "";
    if (rj.includes("@broadcast")) broadcastJids.add(rj);
  });

  // Fetch all status messages for each broadcast JID
  const allStatusRecords = [];
  for (const bjId of broadcastJids) {
    const sRes = await post("/chat/findStatusMessage/dr_candido", { where: { remoteJid: bjId } });
    const sList = Array.isArray(sRes) ? sRes : (sRes?.records || []);
    allStatusRecords.push(...sList);
  }
  console.log(`Total status records fetched across ${broadcastJids.size} broadcast chats: ${allStatusRecords.length}`);

  // Test test phrases
  const testPhrases = ["Lista", "Z15s", "Verdes", "Furia 2", "Casa verdess"];

  for (const phrase of testPhrases) {
    console.log(`\n========================================`);
    console.log(`TESTING PHRASE: "${phrase}"`);
    console.log(`========================================`);

    // Step 1: Matching message IDs
    const matchedMsgIds = new Set();
    allMsgs.forEach(m => {
      const text = extractActualText(m);
      if (doesMatchPhrase(text, phrase)) {
        if (m.key?.id) matchedMsgIds.add(m.key.id);
        if (m.id) matchedMsgIds.add(m.id);
      }
    });
    console.log(`Matched Message IDs for "${phrase}":`, Array.from(matchedMsgIds));

    // Step 2: Extract phones from messages & status records
    const detectedPhones = new Set();

    // From direct/broadcast messages:
    allMsgs.forEach(m => {
      const text = extractActualText(m);
      const isMatch = doesMatchPhrase(text, phrase) || (m.key?.id && matchedMsgIds.has(m.key.id));
      if (isMatch) {
        // extract phones
        [m.key?.remoteJid, m.remoteJid, m.key?.remoteJidAlt, m.remoteJidAlt, m.key?.participant, m.participant].forEach(j => {
          if (!j || j.includes("@g.us") || j.includes("@broadcast")) return;
          let clean = cleanPhone(j);
          if (lidToPhone.has(clean)) clean = lidToPhone.get(clean);
          if (clean && clean.length >= 8) detectedPhones.add(clean);
        });
      }
    });

    // From broadcast status records:
    allStatusRecords.forEach(sr => {
      if (sr.keyId && matchedMsgIds.has(sr.keyId)) {
        [sr.participant, sr.remoteJid, sr.fromMeJid, sr.participantAlt].forEach(j => {
          if (!j || j.includes("@g.us") || j.includes("@broadcast")) return;
          let clean = cleanPhone(j);
          if (lidToPhone.has(clean)) clean = lidToPhone.get(clean);
          if (clean && clean.length >= 8) detectedPhones.add(clean);
        });
      }
    });

    // From chats:
    chats.forEach(c => {
      const text = extractActualText(c.lastMessage) || extractActualText(c);
      const isMatch = doesMatchPhrase(text, phrase) || (c.lastMessage?.key?.id && matchedMsgIds.has(c.lastMessage.key.id));
      if (isMatch) {
        [c.remoteJid, c.id, c.lastMessage?.key?.remoteJidAlt, c.lastMessage?.key?.participantAlt].forEach(j => {
          if (!j || j.includes("@g.us") || j.includes("@broadcast")) return;
          let clean = cleanPhone(j);
          if (lidToPhone.has(clean)) clean = lidToPhone.get(clean);
          if (clean && clean.length >= 8) detectedPhones.add(clean);
        });
      }
    });

    console.log(`Detected Phones for "${phrase}":`, Array.from(detectedPhones));
  }
})();
