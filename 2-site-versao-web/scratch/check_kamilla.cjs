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
  console.log("=== Checking all status messages with remoteJid = 188072490696905@lid ===");
  const kamillaStatus = await post("/chat/findStatusMessage/dr_candido", {
    where: { remoteJid: "188072490696905@lid" }
  });
  console.log("Kamilla status count:", Array.isArray(kamillaStatus) ? kamillaStatus.length : kamillaStatus?.records?.length);
  const kRecords = Array.isArray(kamillaStatus) ? kamillaStatus : (kamillaStatus?.records || []);
  kRecords.forEach(s => {
    console.log(`KeyId: ${s.keyId} | status: ${s.status} | participant: ${s.participant} | messageId: ${s.messageId}`);
  });

  console.log("=== Checking all status messages with participant = 188072490696905@lid ===");
  const kamillaPartStatus = await post("/chat/findStatusMessage/dr_candido", {
    where: { participant: "188072490696905@lid" }
  });
  console.log("Kamilla participant status:", kamillaPartStatus);

  console.log("=== Checking all chats in findChats ===");
  const chats = await post("/chat/findChats/dr_candido", {});
  const cList = Array.isArray(chats) ? chats : (chats?.records || []);
  const kChat = cList.find(c => (c.remoteJid || c.id || "").includes("188072490696905") || (c.remoteJid || c.id || "").includes("94409686"));
  console.log("Kamilla chat in findChats:", kChat);

})();
