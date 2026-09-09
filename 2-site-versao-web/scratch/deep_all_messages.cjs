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

(async () => {
  console.log("=== 1. Find all messages (limit 100) ===");
  const msgs = await post("/chat/findMessages/dr_candido", { limit: 100 });
  const records = msgs.records || (Array.isArray(msgs) ? msgs : []);
  console.log(`Total messages in DB: ${records.length}`);
  
  const jids = new Set();
  records.forEach(m => {
    const rj = m.key?.remoteJid || m.remoteJid;
    jids.add(rj);
    const text = m.message?.conversation || m.message?.extendedTextMessage?.text || JSON.stringify(m.message || {}).substring(0, 50);
    const ts = m.messageTimestamp ? new Date(m.messageTimestamp * 1000).toLocaleString() : "no-ts";
    console.log(`[${ts}] JID: ${rj} | fromMe: ${m.key?.fromMe} | Text: "${text}" | ID: ${m.key?.id} | status: ${m.status}`);
  });

  console.log("\n=== Distinct Remote JIDs with messages ===");
  console.log(Array.from(jids));

  console.log("\n=== 2. Find all Status Messages (limit 100) ===");
  const statuses = await post("/chat/findStatusMessage/dr_candido", { limit: 100 });
  const sRecords = statuses.records || (Array.isArray(statuses) ? statuses : []);
  console.log(`Total status records in DB: ${sRecords.length}`);
  sRecords.forEach(s => {
    console.log(`Status -> remoteJid: ${s.remoteJid || s.msgRemoteJid} | keyId: ${s.keyId} | participant: ${s.participant} | status: ${s.status} | updatedAt: ${s.updatedAt}`);
  });
})();
