const https = require('https');

const SERVER_URL = 'https://evolution-api-production-2522.up.railway.app';
const API_KEY = '6a76cbf204380d04e7ce897ac00e4f204cafea39bc9b7f74fd830a0fe74b8dec';
const INSTANCE = 'dr_candido';

async function req(endpoint, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SERVER_URL}${endpoint}`);
    const options = {
      method,
      headers: {
        'apikey': API_KEY,
        'Content-Type': 'application/json',
      }
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('--- 1. Connection State ---');
  const state = await req(`/instance/connectionState/${INSTANCE}`);
  console.log('State:', JSON.stringify(state, null, 2));

  console.log('\n--- 2. Find Chats (POST) ---');
  const chatsPost = await req(`/chat/findChats/${INSTANCE}`, 'POST', {});
  console.log('Chats POST status:', chatsPost.status);
  console.log('Chats count:', Array.isArray(chatsPost.body) ? chatsPost.body.length : JSON.stringify(chatsPost.body).slice(0, 300));

  console.log('\n--- 3. Find Messages (POST limit 20) ---');
  const msgsPost = await req(`/chat/findMessages/${INSTANCE}`, 'POST', { limit: 20 });
  console.log('Msgs status:', msgsPost.status);
  console.log('Msgs records count:', msgsPost.body?.messages?.records?.length || (Array.isArray(msgsPost.body) ? msgsPost.body.length : 0));
  console.log('Msgs sample:', JSON.stringify(msgsPost.body).slice(0, 500));

  console.log('\n--- 4. Find Messages (POST with empty body) ---');
  const msgsEmpty = await req(`/chat/findMessages/${INSTANCE}`, 'POST', {});
  console.log('Msgs empty status:', msgsEmpty.status);
  console.log('Msgs empty sample:', JSON.stringify(msgsEmpty.body).slice(0, 500));
}

main().catch(console.error);
