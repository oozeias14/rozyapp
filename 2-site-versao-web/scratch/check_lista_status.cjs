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
  const bFetch = await post("/chat/findMessages/dr_candido", { where: { key: { remoteJid: "1788673682@broadcast" } }, limit: 10 });
  const msgs = bFetch?.messages?.records || [];
  const listaMsg = msgs.find(m => (m.message?.conversation || "").includes("Lista"));
  console.log("Lista msg:", JSON.stringify(listaMsg, null, 2));

  const st = await post("/chat/findStatusMessage/dr_candido", { where: { keyId: listaMsg?.key?.id } });
  console.log("Status for Lista keyId:", st);

  const allSt = await post("/chat/findStatusMessage/dr_candido", { where: { remoteJid: "1788673682@broadcast" } });
  console.log("All Status for 1788673682@broadcast:", allSt);
})();
