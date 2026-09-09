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
  console.log("=== Finding ALL status messages without filter ===");
  const allStatus = await post("/chat/findStatusMessage/dr_candido", {});
  const sList = Array.isArray(allStatus) ? allStatus : (allStatus?.records || []);
  console.log(`Total status messages in DB: ${sList.length}`);
  const broadcastJids = new Set();
  sList.forEach(s => {
    if (s.remoteJid && s.remoteJid.includes("@broadcast")) {
      broadcastJids.add(s.remoteJid);
    }
  });
  console.log("Broadcast JIDs found in statusMessage table:", Array.from(broadcastJids));

  console.log("\n=== Finding messages where remoteJid ends with @broadcast or broadcast is true ===");
  // Test various where clauses for broadcast messages
  const queries = [
    { name: "where: { key: { remoteJid: { contains: 'broadcast' } } }", body: { where: { key: { remoteJid: { contains: "broadcast" } } } } },
    { name: "where: { remoteJid: { contains: 'broadcast' } }", body: { where: { remoteJid: { contains: "broadcast" } } } },
    { name: "where: { broadcast: true }", body: { where: { broadcast: true } } },
    { name: "where: { key: { remoteJid: '1788673682@broadcast' } }", body: { where: { key: { remoteJid: "1788673682@broadcast" } } } }
  ];

  for (const q of queries) {
    const res = await post("/chat/findMessages/dr_candido", q.body);
    const count = res?.messages?.records?.length || (Array.isArray(res) ? res.length : (res?.records?.length || 0));
    console.log(`Query ${q.name} -> returned ${count} records`);
    if (count > 0) {
      const records = res?.messages?.records || (Array.isArray(res) ? res : res.records);
      records.forEach(r => console.log(`   ID: ${r.key?.id} | text: "${r.message?.conversation || r.message?.extendedTextMessage?.text || ''}" | JID: ${r.key?.remoteJid}`));
    }
  }
})();
