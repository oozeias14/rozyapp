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
  console.log("=== Testing findStatusMessage ===");
  const queries = [
    { name: "where: { remoteJid: '1788673682@broadcast' }", body: { where: { remoteJid: "1788673682@broadcast" } } },
    { name: "where: { remoteJid: { contains: 'broadcast' } }", body: { where: { remoteJid: { contains: "broadcast" } } } },
    { name: "where: { keyId: 'AC87020826AB5FCF67DF434FF9EADBB1' }", body: { where: { keyId: "AC87020826AB5FCF67DF434FF9EADBB1" } } },
    { name: "where: { keyId: 'AC7E6F10726ACF4DBEF6A842205BFD9D' }", body: { where: { keyId: "AC7E6F10726ACF4DBEF6A842205BFD9D" } } },
    { name: "where: { keyId: 'AC23D0B7D534F66B5B78981DB47EAD1E' }", body: { where: { keyId: "AC23D0B7D534F66B5B78981DB47EAD1E" } } },
    { name: "limit: 200", body: { limit: 200 } }
  ];

  for (const q of queries) {
    const res = await post("/chat/findStatusMessage/dr_candido", q.body);
    const count = Array.isArray(res) ? res.length : (res?.records?.length || 0);
    console.log(`Status query ${q.name} -> returned ${count} records.`);
    if (count > 0) {
      const items = Array.isArray(res) ? res : res.records;
      items.forEach(it => console.log(`   keyId: ${it.keyId} | remoteJid: ${it.remoteJid} | part: ${it.participant} | status: ${it.status}`));
    }
  }
})();
