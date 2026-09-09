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
  const users = await getSupabase("/rest/v1/profiles?select=id,name,phone,whatsapp&limit=100");
  console.log(`Fetched ${Array.isArray(users) ? users.length : 0} profiles from Supabase.`);
  const kauan = (users || []).find(u => (u.name || "").toLowerCase().includes("kauan"));
  console.log("Kauan in Supabase:", kauan);

  const kamilla = (users || []).find(u => (u.name || "").toLowerCase().includes("kamilla"));
  console.log("Kamilla in Supabase:", kamilla);
})();
