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
  const bjId = "1788673682@broadcast";
  console.log("=== Testing queries for broadcast messages ===");

  const queries = [
    { name: "where: { remoteJid: bjId }", body: { where: { remoteJid: bjId } } },
    { name: "where: { key: { remoteJid: bjId } }", body: { where: { key: { remoteJid: bjId } } } },
    { name: "where: { keyRemoteJid: bjId }", body: { where: { keyRemoteJid: bjId } } },
    { name: "where: { broadcast: true }", body: { where: { broadcast: true } } },
    { name: "where: { key: { fromMe: true } }", body: { where: { key: { fromMe: true } }, limit: 10 } },
    { name: "where: { fromMe: true }", body: { where: { fromMe: true }, limit: 10 } },
    { name: "empty body {}", body: {} },
    { name: "page 1 limit 50", body: { page: 1, limit: 50 } }
  ];

  for (const q of queries) {
    const res = await post("/chat/findMessages/dr_candido", q.body);
    const count = res?.messages?.records?.length || (Array.isArray(res) ? res.length : (res?.records?.length || 0));
    console.log(`Query: ${q.name} -> returned ${count} items. Type:`, typeof res, "Keys:", res ? Object.keys(res) : null);
    if (count > 0) {
      const records = res?.messages?.records || (Array.isArray(res) ? res : res.records);
      console.log("Sample:", JSON.stringify(records[0]).substring(0, 150));
    }
  }
})();
