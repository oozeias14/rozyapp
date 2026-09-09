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
  console.log("=== Testing findMessages ordering and pagination ===");
  const queries = [
    { name: "default", body: { limit: 10 } },
    { name: "where: { broadcast: true }", body: { where: { broadcast: true }, limit: 10 } },
    { name: "orderBy: { messageTimestamp: 'desc' }", body: { orderBy: { messageTimestamp: "desc" }, limit: 10 } },
    { name: "orderBy: { createdAt: 'desc' }", body: { orderBy: { createdAt: "desc" }, limit: 10 } },
    { name: "where: { key: { remoteJid: '1788673682@broadcast' } }", body: { where: { key: { remoteJid: "1788673682@broadcast" } }, limit: 10 } }
  ];

  for (const q of queries) {
    const res = await post("/chat/findMessages/dr_candido", q.body);
    const recs = res?.messages?.records || (Array.isArray(res) ? res : []);
    console.log(`\nQuery [${q.name}] returned ${recs.length} records. Total count: ${res?.messages?.total}`);
    recs.slice(0, 5).forEach(m => {
      const text = m.message?.conversation || m.message?.extendedTextMessage?.text || JSON.stringify(m.message || {}).substring(0, 30);
      const ts = m.messageTimestamp ? new Date(m.messageTimestamp * 1000).toLocaleString() : "no-ts";
      console.log(`   ID: ${m.key?.id} | TS: ${ts} | JID: ${m.key?.remoteJid} | text: "${text}"`);
    });
  }

  console.log("\n=== Testing findStatusMessage ordering ===");
  const sQueries = [
    { name: "status default", body: { limit: 10 } },
    { name: "status where 1788673682@broadcast", body: { where: { remoteJid: "1788673682@broadcast" } } },
    { name: "status orderBy: { updatedAt: 'desc' }", body: { orderBy: { updatedAt: "desc" }, limit: 10 } }
  ];

  for (const q of sQueries) {
    const res = await post("/chat/findStatusMessage/dr_candido", q.body);
    const recs = Array.isArray(res) ? res : (res?.records || []);
    console.log(`\nStatus [${q.name}] returned ${recs.length} records.`);
    recs.slice(0, 5).forEach(s => {
      console.log(`   keyId: ${s.keyId} | remoteJid: ${s.remoteJid} | part: ${s.participant} | status: ${s.status}`);
    });
  }
})();
