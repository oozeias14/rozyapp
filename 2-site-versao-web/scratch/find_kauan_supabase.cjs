const https = require("https");
const supabaseUrl = "https://sewwoxhttmhjayufrqfu.supabase.co";
const supabaseAnon = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNld3dveGh0dG1oamF5dWZycWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyMDUyNjMsImV4cCI6MjEwMDc4MTI2M30.xXcEz_5gtKllyJTlhSWGBNkXAaxc2ceVXEdF5hdQaqQ";

function getSupabase(path) {
  return new Promise((resolve) => {
    const url = new URL(supabaseUrl + path);
    const req = https.request(url, {
      method: "GET",
      headers: {
        "apikey": supabaseAnon,
        "Authorization": `Bearer ${supabaseAnon}`
      }
    }, (res) => {
      let b = "";
      res.on("data", c => b += c);
      res.on("end", () => {
        try { resolve(JSON.parse(b)); } catch(e) { resolve(b); }
      });
    });
    req.on("error", e => resolve({error: e.message}));
    req.write("");
    req.end();
  });
}

(async () => {
  const kauan = await getSupabase("/rest/v1/profiles?name=ilike.*kauan*&select=id,name,phone,whatsapp");
  console.log("Kauan by name:", kauan);

  const kamilla = await getSupabase("/rest/v1/profiles?name=ilike.*kamilla*&select=id,name,phone,whatsapp");
  console.log("Kamilla by name:", kamilla);

  const phone9241 = await getSupabase("/rest/v1/profiles?phone=ilike.*9241*&select=id,name,phone,whatsapp");
  console.log("Phone 9241:", phone9241);
})();
