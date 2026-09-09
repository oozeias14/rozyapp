const https = require('https');
const SERVER_URL = 'https://evolution-api-production-2522.up.railway.app';
const API_KEY = '6a76cbf204380d04e7ce897ac00e4f204cafea39bc9b7f74fd830a0fe74b8dec';
const INSTANCE = 'dr_candido';

function req(endpoint, method = 'POST', body = null) {
  return new Promise((resolve) => {
    const url = new URL(SERVER_URL + endpoint);
    const options = { method, headers: { apikey: API_KEY, 'Content-Type': 'application/json' } };
    const r = https.request(url, options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    r.on('error', e => resolve({ error: e.message }));
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function run() {
  const statusRes = await req('/chat/findStatusMessage/' + INSTANCE, 'POST', {});
  console.log('statusRes status:', statusRes.status);
  console.log('Is array:', Array.isArray(statusRes.data));
  console.log('Length:', statusRes.data?.length);
  console.log('First 3 items:', JSON.stringify(statusRes.data?.slice(0, 3), null, 2));

  // Check if AC7E6F10726ACF4DBEF6A842205BFD9D is in statusRes
  const found = statusRes.data?.filter(s => s.keyId === 'AC7E6F10726ACF4DBEF6A842205BFD9D' || s.participant?.includes('144856882094274') || s.participant?.includes('188072490696905'));
  console.log('Found in statusRes:', JSON.stringify(found, null, 2));
}

run().catch(console.error);
