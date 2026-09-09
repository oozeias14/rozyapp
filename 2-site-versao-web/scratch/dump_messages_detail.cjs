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
  console.log("=== Fetching all 50 latest messages ===");
  const res = await post("/chat/findMessages/dr_candido", { limit: 100 });
  const records = res?.messages?.records || [];
  console.log(`Fetched ${records.length} messages.`);
  
  records.forEach((m, idx) => {
    const text = m.message?.conversation || m.message?.extendedTextMessage?.text || JSON.stringify(m.message || {}).substring(0, 50);
    const ts = m.messageTimestamp ? new Date(m.messageTimestamp * 1000).toLocaleTimeString() : "no-ts";
    console.log(`[${idx}] ID: ${m.key?.id} | JID: ${m.key?.remoteJid} | part: ${m.key?.participant} | alt: ${m.key?.remoteJidAlt} | fromMe: ${m.key?.fromMe} | TS: ${ts} | text: "${text}"`);
  });

  console.log("\n=== Fetching all statusMessage for 1788673682@broadcast ===");
  const sRes = await post("/chat/findStatusMessage/dr_candido", {
    where: { remoteJid: "1788673682@broadcast" }
  });
  console.log("Status response:", JSON.stringify(sRes, null, 2));

})();
