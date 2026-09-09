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
  console.log("=== 1. Finding all chats ===");
  const chats = await post("/chat/findChats/dr_candido", {});
  const chatList = Array.isArray(chats) ? chats : (chats.records || []);
  const bChats = chatList.filter(c => (c.id || c.remoteJid || "").includes("broadcast"));
  console.log(`Found ${chatList.length} total chats, ${bChats.length} broadcast chats.`);
  bChats.forEach(c => console.log(" - Broadcast chat:", c.id || c.remoteJid, c.name || c.pushName));

  console.log("\n=== 2. Finding all contacts ===");
  const contacts = await post("/chat/findContacts/dr_candido", {});
  const contactList = Array.isArray(contacts) ? contacts : (contacts.records || []);
  console.log(`Found ${contactList.length} contacts.`);
  
  // Look for Kauan and Kamilla
  const targetPhones = ["6192419984", "6194409686", "61992623060", "6183716917", "61998265034"];
  contactList.forEach(ct => {
    const jid = ct.id || ct.remoteJid || "";
    const phone = jid.replace(/\D/g, "");
    if (targetPhones.some(p => phone.includes(p.slice(-8)))) {
      console.log("Contact Match:", jid, ct.pushName || ct.name, JSON.stringify(ct));
    }
  });

  console.log("\n=== 3. Messages across all broadcast chats ===");
  for (const bc of bChats) {
    const jid = bc.id || bc.remoteJid;
    const msgs = await post("/chat/findMessages/dr_candido", {
      where: { remoteJid: jid },
      limit: 50
    });
    const records = msgs.records || (Array.isArray(msgs) ? msgs : []);
    console.log(`\nChat [${jid}] has ${records.length} messages:`);
    records.forEach(m => {
      const text = m.message?.conversation || m.message?.extendedTextMessage?.text || JSON.stringify(m.message || {}).substring(0, 60);
      const ts = m.messageTimestamp ? new Date(m.messageTimestamp * 1000).toLocaleTimeString() : "no-ts";
      console.log(`  Msg ID: ${m.key?.id} | TS: ${ts} | Text: "${text}"`);
    });

    console.log(`\nStatus for Chat [${jid}]:`);
    const statuses = await post("/chat/findStatusMessage/dr_candido", {
      where: { remoteJid: jid }
    });
    const sRecords = statuses.records || (Array.isArray(statuses) ? statuses : []);
    console.log(`  Status records count: ${sRecords.length}`);
    sRecords.forEach(s => {
      console.log(`  [Status] keyId: ${s.keyId} | participant: ${s.participant} | status: ${s.status} | updatedAt: ${s.updatedAt}`);
    });
  }

  console.log("\n=== 4. Checking 1:1 messages for target contacts ===");
  for (const phone of targetPhones) {
    // Check both standard jid and lid if any
    const remoteJids = [`55${phone}@s.whatsapp.net`];
    for (const rj of remoteJids) {
      const msgs = await post("/chat/findMessages/dr_candido", {
        where: { remoteJid: rj },
        limit: 10
      });
      const records = msgs.records || (Array.isArray(msgs) ? msgs : []);
      if (records.length > 0) {
        console.log(`\nDirect messages for ${phone} (${rj}) [count: ${records.length}]:`);
        records.forEach(m => {
          const text = m.message?.conversation || m.message?.extendedTextMessage?.text || JSON.stringify(m.message || {}).substring(0, 60);
          const ts = m.messageTimestamp ? new Date(m.messageTimestamp * 1000).toLocaleTimeString() : "no-ts";
          const fromMe = m.key?.fromMe;
          const status = m.status;
          console.log(`  Msg ID: ${m.key?.id} | fromMe: ${fromMe} | status: ${status} | TS: ${ts} | Text: "${text}"`);
        });
      } else {
        console.log(`No direct messages in Evolution DB for ${phone} (${rj})`);
      }
    }
  }

})();
