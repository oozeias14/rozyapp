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
  const endpoints = [
    { ep: `/chat/findMessages/${INSTANCE}`, method: 'POST', body: { where: { key: { remoteJid: '1788673682@broadcast' } } } },
    { ep: `/chat/findStatusMessage/${INSTANCE}`, method: 'POST', body: {} },
    { ep: `/chat/findStatusMessage/${INSTANCE}`, method: 'GET', body: null },
    { ep: `/chat/findChat/${INSTANCE}/1788673682@broadcast`, method: 'GET', body: null },
    { ep: `/chat/findChat/${INSTANCE}`, method: 'POST', body: { remoteJid: '1788673682@broadcast' } },
    { ep: `/message/findMessageReceipts/${INSTANCE}`, method: 'POST', body: { messageId: 'ACC9DD5627EC2AA5A9D54F7CEBE5945B' } },
    { ep: `/chat/findMessageReceipts/${INSTANCE}`, method: 'POST', body: { messageId: 'ACC9DD5627EC2AA5A9D54F7CEBE5945B' } },
    { ep: `/group/findGroupInfos/${INSTANCE}?groupJid=1788673682@broadcast`, method: 'GET', body: null }
  ];

  for (const item of endpoints) {
    const res = await req(item.ep, item.method, item.body);
    console.log(`Endpoint: [${item.method}] ${item.ep} => Status: ${res.status}`);
    console.log(JSON.stringify(res.data || res.raw || res.error, null, 2).substring(0, 300));
    console.log('---');
  }
}

run().catch(console.error);
