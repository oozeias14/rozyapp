const https = require("https");
const base = "https://evolution-api-production-2522.up.railway.app";
const key = "6a76cbf204380d04e7ce897ac00e4f204cafea39bc9b7f74fd830a0fe74b8dec";

function get(path) {
  return new Promise((resolve) => {
    const url = new URL(base + path);
    const req = https.request(url, {
      method: "GET",
      headers: { "apikey": key }
    }, (res) => {
      let b = "";
      res.on("data", c => b += c);
      res.on("end", () => {
        try { resolve(JSON.parse(b)); } catch(e) { resolve(b); }
      });
    });
    req.on("error", e => resolve({error: e.message}));
    req.end();
  });
}

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
  console.log("=== Instance Connection State ===");
  const conn = await get("/instance/connectionState/dr_candido");
  console.log("connectionState:", conn);

  console.log("\n=== Instance Settings ===");
  const settings = await get("/settings/find/dr_candido");
  console.log("settings:", settings);

  console.log("\n=== Checking all instances ===");
  const instances = await get("/instance/fetchInstances");
  console.log("fetchInstances:", instances);
})();
