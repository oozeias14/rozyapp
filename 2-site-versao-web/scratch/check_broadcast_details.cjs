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
  // Let's get all messages from the 4 broadcast messages in 1788673682@broadcast
  const bMsgs = await post("/chat/findMessages/dr_candido", {
    where: { key: { remoteJid: "1788673682@broadcast" } },
    limit: 50
  });
  const records = bMsgs?.messages?.records || [];
  console.log(`Found ${records.length} messages in broadcast chat:`);
  for (const m of records) {
    const text = m.message?.conversation || m.message?.extendedTextMessage?.text || JSON.stringify(m.message || {});
    console.log(`\nMsg ID: ${m.key?.id} | TS: ${m.messageTimestamp} (${new Date(m.messageTimestamp * 1000).toLocaleString()}) | Text: "${text}"`);
    console.log("key:", m.key);
    console.log("userReceipt:", m.userReceipt);
    console.log("MessageUpdate:", m.MessageUpdate);
  }
})();
