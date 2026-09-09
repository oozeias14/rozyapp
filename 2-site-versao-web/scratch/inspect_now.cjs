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
  console.log("=== 1. Fetching recent messages (page 1 & 2) ===");
  const p1 = await post("/chat/findMessages/dr_candido", { limit: 50, page: 1 });
  const p2 = await post("/chat/findMessages/dr_candido", { limit: 50, page: 2 });
  const allMsgs = [...(p1?.messages?.records || []), ...(p2?.messages?.records || [])];
  console.log(`Total messages returned: ${allMsgs.length}`);
  
  allMsgs.slice(0, 15).forEach((m, idx) => {
    const text = m.message?.conversation || m.message?.extendedTextMessage?.text || JSON.stringify(m.message || {}).substring(0, 40);
    const ts = m.messageTimestamp ? new Date(m.messageTimestamp * 1000).toLocaleTimeString() : "no-ts";
    console.log(`[${idx}] ID: ${m.key?.id} | remoteJid: ${m.key?.remoteJid} | fromMe: ${m.key?.fromMe} | TS: ${ts} | text: "${text}"`);
  });

  console.log("\n=== 2. Fetching broadcast messages ===");
  const bMsgs = await post("/chat/findMessages/dr_candido", { where: { broadcast: true }, limit: 20 });
  const bRecs = bMsgs?.messages?.records || [];
  console.log(`Broadcast messages count: ${bRecs.length}`);
  bRecs.forEach((m, idx) => {
    const text = m.message?.conversation || m.message?.extendedTextMessage?.text || JSON.stringify(m.message || {}).substring(0, 40);
    const ts = m.messageTimestamp ? new Date(m.messageTimestamp * 1000).toLocaleTimeString() : "no-ts";
    console.log(`[b${idx}] ID: ${m.key?.id} | remoteJid: ${m.key?.remoteJid} | TS: ${ts} | text: "${text}"`);
  });

  console.log("\n=== 3. Fetching latest status records ===");
  const statuses = await post("/chat/findStatusMessage/dr_candido", { limit: 30 });
  const sRecs = statuses?.records || (Array.isArray(statuses) ? statuses : []);
  console.log(`Status count: ${sRecs.length}`);
  sRecs.slice(0, 15).forEach(s => {
    console.log(`Status -> keyId: ${s.keyId} | remoteJid: ${s.remoteJid} | participant: ${s.participant} | status: ${s.status}`);
  });
})();
