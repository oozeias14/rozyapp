import { supabase } from './supabase';

// Local storage keys for configuration
const STORAGE_KEY_URL = 'evolution_api_url';
const STORAGE_KEY_KEY = 'evolution_api_key';
const STORAGE_KEY_INSTANCE = 'evolution_api_instance';

export const DEFAULT_SERVER_URL = 'https://evolution-api-production-2522.up.railway.app';
export const DEFAULT_API_KEY = '6a76cbf204380d04e7ce897ac00e4f204cafea39bc9b7f74fd830a0fe74b8dec';
export const DEFAULT_INSTANCE_NAME = 'dr_candido';

export function getEvolutionConfig() {
  const storedKey = localStorage.getItem(STORAGE_KEY_KEY);
  let activeKey = DEFAULT_API_KEY;
  if (storedKey && storedKey.trim().length >= 60) {
    activeKey = storedKey.trim();
  } else {
    localStorage.setItem(STORAGE_KEY_KEY, DEFAULT_API_KEY);
  }

  const storedUrl = localStorage.getItem(STORAGE_KEY_URL);
  let activeUrl = (storedUrl || DEFAULT_SERVER_URL).trim().replace(/\/+$/, '');
  localStorage.setItem(STORAGE_KEY_URL, activeUrl);

  const storedInstance = localStorage.getItem(STORAGE_KEY_INSTANCE);
  let activeInstance = (storedInstance || DEFAULT_INSTANCE_NAME).trim();
  localStorage.setItem(STORAGE_KEY_INSTANCE, activeInstance);

  return {
    serverUrl: activeUrl,
    apiKey: activeKey,
    instanceName: activeInstance,
  };
}

export function setEvolutionConfig({ serverUrl, apiKey, instanceName }) {
  if (serverUrl !== undefined) {
    let cleanUrl = serverUrl.trim().replace(/\/+$/, '');
    if (cleanUrl && !cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }
    localStorage.setItem(STORAGE_KEY_URL, cleanUrl);
  }
  if (apiKey !== undefined) localStorage.setItem(STORAGE_KEY_KEY, apiKey.trim());
  if (instanceName !== undefined) localStorage.setItem(STORAGE_KEY_INSTANCE, (instanceName || DEFAULT_INSTANCE_NAME).trim());
}

// Carrega a configuração do Supabase para funcionar em todos os celulares/computadores
export async function loadEvolutionConfig() {
  const local = getEvolutionConfig();
  try {
    const { data } = await supabase.from('app_settings').select('*').eq('id', 1).maybeSingle();
    if (data) {
      const serverUrl = data.evolution_api_url || local.serverUrl;
      let apiKey = data.evolution_api_key;
      // Se a chave no banco for a antiga truncada ou vazia, atualiza para a completa
      if (!apiKey || apiKey.trim().length < 60) {
        apiKey = DEFAULT_API_KEY;
        await supabase.from('app_settings').update({ evolution_api_key: DEFAULT_API_KEY }).eq('id', 1);
      }
      const instanceName = data.evolution_api_instance || local.instanceName;

      if (serverUrl) {
        setEvolutionConfig({ serverUrl, apiKey, instanceName });
        return {
          serverUrl: (serverUrl || '').replace(/\/+$/, ''),
          apiKey: apiKey || DEFAULT_API_KEY,
          instanceName: instanceName || DEFAULT_INSTANCE_NAME,
        };
      }
    }
  } catch (err) {
    console.log('Sync evolution config from Supabase:', err);
  }
  return local;
}

// Salva a configuração localmente e no Supabase
export async function saveEvolutionConfig({ serverUrl, apiKey, instanceName }) {
  setEvolutionConfig({ serverUrl, apiKey, instanceName });
  
  let cleanUrl = (serverUrl || '').trim().replace(/\/+$/, '');
  if (cleanUrl && !cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = 'https://' + cleanUrl;
  }

  try {
    await supabase.from('app_settings').update({
      evolution_api_url: cleanUrl,
      evolution_api_key: (apiKey || '').trim(),
      evolution_api_instance: (instanceName || DEFAULT_INSTANCE_NAME).trim(),
    }).eq('id', 1);
  } catch (err) {
    console.log('Error updating app_settings for evolution:', err);
  }
}

// Generic Evolution API request fetcher
async function evolutionFetch(endpoint, options = {}) {
  const cfg = getEvolutionConfig();
  const serverUrl = (cfg.serverUrl || DEFAULT_SERVER_URL).trim().replace(/\/+$/, '');
  
  // Garante a chave oficial validada de 64 caracteres
  let cleanKey = (cfg.apiKey || '').trim().replace(/^["']|["']$/g, '');
  if (!cleanKey || cleanKey.length < 60) {
    cleanKey = DEFAULT_API_KEY;
  }

  const url = `${serverUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  
  const headers = {
    'apikey': cleanKey,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    let errMsg = `Erro ${res.status}: ${res.statusText}`;
    try {
      const json = await res.json();
      errMsg = json?.response?.message || json?.message || json?.error || errMsg;
      if (Array.isArray(errMsg)) errMsg = errMsg.join(', ');
    } catch (_) {}

    if (res.status === 401 || res.status === 403) {
      errMsg = `Chave de API não autorizada (401 Unauthorized). Verifique a chave no Railway.`;
    }

    throw new Error(errMsg);
  }

  return await res.json();
}

// ── INSTÂNCIAS E CONEXÃO ───────────────────────────────────────────

export async function fetchInstanceStatus() {
  const { instanceName } = getEvolutionConfig();
  try {
    const data = await evolutionFetch(`/instance/connectionState/${instanceName}`);
    return {
      connected: data?.instance?.state === 'open',
      state: data?.instance?.state || 'close',
      data,
    };
  } catch (err) {
    return {
      connected: false,
      state: 'disconnected',
      error: err.message,
    };
  }
}

export async function createOrConnectInstance() {
  const { instanceName } = getEvolutionConfig();
  
  // Tenta conectar na instância existente
  try {
    const connectData = await evolutionFetch(`/instance/connect/${instanceName}`);
    return connectData;
  } catch (err) {
    // Se a instância não existir ou der erro, tenta criar
    try {
      const createData = await evolutionFetch(`/instance/create`, {
        method: 'POST',
        body: JSON.stringify({
          instanceName,
          token: '',
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
          reject_call: false,
          sync_full_history: false,
        }),
      });
      return createData;
    } catch (createErr) {
      // Se já existir ("already in use"), chama o connect
      return await evolutionFetch(`/instance/connect/${instanceName}`);
    }
  }
}

export async function resetAndRecreateInstance() {
  const { instanceName } = getEvolutionConfig();
  
  // 1. Tenta logout da sessão travada
  try {
    await evolutionFetch(`/instance/logout/${instanceName}`, {
      method: 'DELETE',
    });
  } catch (e) {
    console.warn('Logout antes do reset ignorado:', e);
  }

  // 2. Tenta reiniciar o socket da instância
  try {
    await evolutionFetch(`/instance/restart/${instanceName}`, {
      method: 'POST',
    });
  } catch (e) {
    console.warn('Restart antes do reset ignorado:', e);
  }

  // 3. Tenta conectar novamente para obter QR Code ou estado limpo
  try {
    const connectData = await evolutionFetch(`/instance/connect/${instanceName}`);
    return connectData;
  } catch (err) {
    // Se a instância não existir, cria uma nova
    try {
      const createData = await evolutionFetch(`/instance/create`, {
        method: 'POST',
        body: JSON.stringify({
          instanceName,
          token: '',
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
          reject_call: false,
          sync_full_history: false,
        }),
      });
      return createData;
    } catch (createErr) {
      // Se retornar que já existe, conecta diretamente
      return await evolutionFetch(`/instance/connect/${instanceName}`);
    }
  }
}

export async function getPairingCode(phone) {
  const { instanceName } = getEvolutionConfig();
  let cleanPhone = (phone || '').replace(/\D/g, '');
  if (cleanPhone.length === 10 || cleanPhone.length === 11) {
    cleanPhone = '55' + cleanPhone;
  }

  // Tentativa 1: GET /instance/connect/{instance}?number={phone}
  try {
    const res = await evolutionFetch(`/instance/connect/${instanceName}?number=${cleanPhone}`);
    if (res?.code || res?.pairingCode || res?.pairing_code) return res;
  } catch (e) {
    console.warn('Tentativa 1 de pairing falhou:', e);
  }

  // Tentativa 2: POST /instance/connect/{instance} { number }
  try {
    const resPost = await evolutionFetch(`/instance/connect/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({ number: cleanPhone }),
    });
    return resPost;
  } catch (e) {
    console.warn('Tentativa 2 de pairing falhou:', e);
    // Tentativa 3: Se der erro, tenta restart e connect com o número
    await evolutionFetch(`/instance/restart/${instanceName}`, { method: 'POST' }).catch(() => {});
    return await evolutionFetch(`/instance/connect/${instanceName}?number=${cleanPhone}`);
  }
}

export async function disconnectInstance() {
  const { instanceName } = getEvolutionConfig();
  return await evolutionFetch(`/instance/logout/${instanceName}`, {
    method: 'DELETE',
  });
}

// ── ENVIO DE MENSAGENS ─────────────────────────────────────────────

export async function sendWhatsAppMessage(number, text) {
  const { instanceName } = getEvolutionConfig();
  let cleanNumber = (number || '').toString().trim();
  
  // Se não for um JID com @ (ex: broadcast ou grupo), formata como número internacional brasileiro
  if (!cleanNumber.includes('@')) {
    let digits = cleanNumber.replace(/\D/g, '');
    if (digits.length === 10 || digits.length === 11) {
      digits = '55' + digits;
    }
    cleanNumber = digits;
  }

  // Delay de digitação humano (1.5s a 3.0s)
  const typingDelay = Math.floor(Math.random() * (3000 - 1500 + 1)) + 1500;

  return await evolutionFetch(`/message/sendText/${instanceName}`, {
    method: 'POST',
    body: JSON.stringify({
      number: cleanNumber,
      text: text,
      options: {
        delay: typingDelay,
        presence: 'composing',
      }
    }),
  });
}

// ── CONSULTA E STATUS DE MENSAGENS (1 TRAÇO VS 2 TRAÇOS) ───────────

export async function fetchWhatsAppMessages(params = {}) {
  const { instanceName } = getEvolutionConfig();
  try {
    const data = await evolutionFetch(`/chat/findMessages/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        where: params.where || {},
        limit: params.limit || 100,
      }),
    });
    const records = data?.messages?.records || (Array.isArray(data) ? data : []);
    return records;
  } catch (err) {
    console.warn('Erro ao buscar mensagens do WhatsApp:', err);
    return [];
  }
}

// Avalia se uma mensagem individual tem 2 traços (entregue/lida) ou 1 traço (apenas servidor)
export function evaluateMessageDelivery(msg) {
  if (!msg) return { has2Checks: false, status: 'NOT_FOUND', label: 'Não enviada' };

  const updates = Array.isArray(msg.MessageUpdate) ? msg.MessageUpdate : [];
  const directStatus = (msg.status || '').toUpperCase();

  // Verifica se há recibo de entrega (DELIVERY_ACK) ou leitura (READ / PLAYED)
  const isRead = updates.some(u => (u.status || '').toUpperCase() === 'READ' || (u.status || '').toUpperCase() === 'PLAYED') ||
                 directStatus === 'READ' || directStatus === 'PLAYED';

  const isDelivered = isRead || updates.some(u => (u.status || '').toUpperCase() === 'DELIVERY_ACK') ||
                      directStatus === 'DELIVERY_ACK';

  const isServerAck = updates.some(u => (u.status || '').toUpperCase() === 'SERVER_ACK') ||
                      directStatus === 'SERVER_ACK';

  if (isRead) {
    return { has2Checks: true, isRead: true, status: 'READ', label: '2 Traços Azuis (Lido)', checks: 2 };
  }
  if (isDelivered) {
    return { has2Checks: true, isRead: false, status: 'DELIVERY_ACK', label: '2 Traços Cinzas (Entregue / Salvo)', checks: 2 };
  }
  if (isServerAck) {
    return { has2Checks: false, isRead: false, status: 'SERVER_ACK', label: '1 Traço (Apenas Servidor / Não Salvo)', checks: 1 };
  }

  return { has2Checks: false, isRead: false, status: directStatus || 'PENDING', label: '1 Traço (Pendente)', checks: 1 };
}

// Consulta direta e determinística do status de entrega na conversa individual do contato
export async function getContactDeliveryStatusDirect(phone) {
  const clean = extractCleanPhone(phone);
  if (!clean) return { has2Checks: false, checks: 1, label: '✓ 1 Traço (Sem número)', status: 'PENDING' };

  const sigs = getPhoneSignatures(clean);
  const jids = sigs.map((s) => `${s}@s.whatsapp.net`);

  for (const jid of jids) {
    try {
      const msgs = await fetchWhatsAppMessages({
        where: {
          key: {
            remoteJid: jid
          }
        },
        limit: 15
      });

      if (Array.isArray(msgs) && msgs.length > 0) {
        // Se houver qualquer mensagem recebida do contato (fromMe: false), confirma 2 traços
        const hasIncoming = msgs.some((m) => m?.key?.fromMe === false || m?.fromMe === false);
        if (hasIncoming) {
          return { has2Checks: true, checks: 2, label: '✓✓ 2 Traços (Mensagem Recebida / Interagiu)', status: 'READ' };
        }

        // Verifica mensagens enviadas
        for (const m of msgs) {
          const evalResult = evaluateMessageDelivery(m);
          if (evalResult.has2Checks) {
            return evalResult;
          }
        }

        // Tem conversa enviada, mas ficou em 1 traço (não entregue)
        return { has2Checks: false, checks: 1, label: '✓ 1 Traço (Não Entregue / Não Salvo)', status: 'SERVER_ACK' };
      }
    } catch (e) {
      // continua tentando
    }
  }

  return { has2Checks: false, checks: 1, label: '✓ 1 Traço (Pendente / Sem Mensagem Entregue)', status: 'NOT_FOUND' };
}

// Helper para verificar se uma mensagem contém a frase buscada (inclui busca profunda no JSON)
export function doesMessageContainPhrase(m, targetPhrase) {
  if (!m || !targetPhrase) return false;
  const cleanTarget = targetPhrase.toLowerCase().trim().replace(/^["']|["']$/g, '');
  if (!cleanTarget) return false;

  const directText = (
    m.message?.conversation ||
    m.message?.extendedTextMessage?.text ||
    m.message?.ephemeralMessage?.message?.conversation ||
    m.message?.ephemeralMessage?.message?.extendedTextMessage?.text ||
    m.message?.imageMessage?.caption ||
    m.message?.videoMessage?.caption ||
    m.body ||
    m.text ||
    m.content ||
    ''
  ).toLowerCase();

  // 1. Match exato no texto direto
  if (directText.includes(cleanTarget)) return true;

  // 2. Match por todas as palavras chaves significativas
  const words = cleanTarget.split(/\s+/).filter(w => w.length >= 2);
  if (words.length > 1 && words.every(w => directText.includes(w))) {
    return true;
  }

  // 3. Busca profunda no JSON completo da mensagem
  try {
    const jsonStr = JSON.stringify(m).toLowerCase();
    if (jsonStr.includes(cleanTarget)) return true;
    if (words.length > 1 && words.every(w => jsonStr.includes(w))) {
      return true;
    }
  } catch (e) {
    // ignore JSON stringify errors
  }

  return false;
}

// Helper para extrair todos os telefones envolvidos numa mensagem (inclui destinatários de transmissão userReceipt e MessageUpdate)
export function extractPhonesFromMessage(m) {
  const phones = new Set();
  if (!m) return phones;

  function addJid(jid) {
    if (!jid || typeof jid !== 'string') return;
    if (jid.includes('@g.us')) return; // ignora grupos
    let raw = jid.includes('@') ? jid.split('@')[0] : jid;
    if (raw.includes(':')) raw = raw.split(':')[0];
    const clean = extractCleanPhone(raw);
    if (clean && clean.length >= 8 && clean.length <= 15) {
      phones.add(clean);
    }
  }

  addJid(m.key?.remoteJid || m.remoteJid);
  addJid(m.key?.participant || m.participant);

  if (Array.isArray(m.userReceipt)) {
    m.userReceipt.forEach((ur) => addJid(ur.userJid || ur.jid || ur.user));
  }

  if (Array.isArray(m.MessageUpdate)) {
    m.MessageUpdate.forEach((mu) => addJid(mu.participant || mu.fromMeJid || mu.key?.participant));
  }

  return phones;
}

// Helper para verificar se a mensagem foi enviada/recebida dentro da janela de horas especificada (ex: 12h)
export function isMessageWithinHours(msg, maxHours = 12) {
  if (!msg) return false;
  
  let ts = msg.messageTimestamp || msg.createdAt || msg.updatedAt;
  if (!ts && msg.lastMessage) ts = msg.lastMessage.messageTimestamp || msg.lastMessage.createdAt || msg.lastMessage.updatedAt;
  if (!ts) return true; // se não houver timestamp disponível, permite por fallback

  if (typeof ts === 'object' && ts !== null && ts.low) {
    ts = ts.low;
  }
  if (typeof ts === 'string') {
    if (ts.includes('-') || ts.includes('T')) {
      const dt = new Date(ts);
      if (!isNaN(dt.getTime())) {
        ts = Math.floor(dt.getTime() / 1000);
      }
    } else {
      ts = parseInt(ts, 10);
    }
  }

  if (ts > 10000000000) {
    ts = Math.floor(ts / 1000);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const diffHours = (nowSec - ts) / 3600;

  return diffHours >= -0.5 && diffHours <= (maxHours || 12);
}

// ── RASTREADOR DE CONVERSAS POR FRASE DA TRANSMISSÃO ────

export async function scanAllChatsForPhrase(phraseText, maxHours = 12) {
  const targetPhrase = (phraseText || '').toLowerCase().trim().replace(/^["']|["']$/g, '');
  const matchedSigs = new Set();
  if (!targetPhrase) return matchedSigs;

  try {
    const { instanceName } = getEvolutionConfig();

    // 1. Busca mensagens recentes do banco de dados (múltiplas páginas para cobrir o histórico recente)
    const msgsP1 = await evolutionFetch(`/chat/findMessages/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({ limit: 500, page: 1 }),
    }).catch(() => null);

    const msgsP2 = await evolutionFetch(`/chat/findMessages/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({ limit: 500, page: 2 }),
    }).catch(() => null);

    const list1 = msgsP1?.messages?.records || (Array.isArray(msgsP1) ? msgsP1 : []);
    const list2 = msgsP2?.messages?.records || (Array.isArray(msgsP2) ? msgsP2 : []);

    const msgMap = new Map();
    list1.forEach((m) => m?.id && msgMap.set(m.id, m));
    list2.forEach((m) => m?.id && msgMap.set(m.id, m));
    const allMsgs = Array.from(msgMap.values());

    // Filtra mensagens que contêm a frase E foram enviadas/recebidas dentro da janela de tempo (ex: 12h)
    allMsgs.forEach((m) => {
      if (doesMessageContainPhrase(m, targetPhrase) && isMessageWithinHours(m, maxHours)) {
        const foundPhones = extractPhonesFromMessage(m);
        foundPhones.forEach((p) => {
          getPhoneSignatures(p).forEach((sig) => matchedSigs.add(sig));
        });
      }
    });

    // 2. Busca conversas ativas no WhatsApp que contenham a frase no histórico recente
    const chats = await fetchWhatsAppChats().catch(() => []);
    (chats || []).forEach((c) => {
      const hasPhrase = doesMessageContainPhrase(c, targetPhrase) || doesMessageContainPhrase(c.lastMessage, targetPhrase);
      const isRecent = isMessageWithinHours(c.lastMessage, maxHours) || isMessageWithinHours(c, maxHours);

      if (hasPhrase && isRecent) {
        const rJid = c.remoteJid || c.id || '';
        const rJidAlt = c.lastMessage?.key?.remoteJidAlt || c.lastMessage?.key?.participantAlt || '';
        const rJidKey = c.lastMessage?.key?.remoteJid || '';

        [rJid, rJidAlt, rJidKey].forEach((j) => {
          const cleanP = extractCleanPhone(j);
          if (cleanP && cleanP.length >= 8) {
            getPhoneSignatures(cleanP).forEach((sig) => matchedSigs.add(sig));
          }
        });
      }
    });

  } catch (e) {
    console.warn('Erro ao escanear conversas por frase:', e);
  }

  return matchedSigs;
}

export async function checkContactHasBroadcastPhrase(phone, phraseText, preScannedSigs = null, maxHours = 12) {
  const cleanPhone = extractCleanPhone(phone);
  const targetPhrase = (phraseText || '').toLowerCase().trim().replace(/^["']|["']$/g, '');

  if (!cleanPhone || !targetPhrase) {
    return { has2Checks: false, checks: 1, label: '✓ 1 Traço (Sem frase de teste)', status: 'PENDING' };
  }

  const sigs = getPhoneSignatures(cleanPhone);

  // 1. Checa se o número foi pré-confirmado com a frase nas últimas X horas
  if (preScannedSigs && preScannedSigs instanceof Set) {
    const hasMatch = sigs.some((sig) => preScannedSigs.has(sig));
    if (hasMatch) {
      return {
        has2Checks: true,
        checks: 2,
        status: 'DELIVERY_ACK',
        label: `✓✓ 2 Traços (Frase "${phraseText}" entregue nas últimas ${maxHours}h!)`
      };
    }
  }

  // 2. Checa diretamente nas conversas do contato por mensagens contendo a frase nas últimas X horas
  for (const sig of sigs) {
    try {
      const jid = sig.includes('@') ? sig : `${sig}@s.whatsapp.net`;
      const msgsJid = await fetchWhatsAppMessages({
        where: {
          key: {
            remoteJid: jid
          }
        },
        limit: 50
      }).catch(() => null);

      if (Array.isArray(msgsJid) && msgsJid.length > 0) {
        for (const m of msgsJid) {
          if (doesMessageContainPhrase(m, targetPhrase) && isMessageWithinHours(m, maxHours)) {
            return {
              has2Checks: true,
              checks: 2,
              status: 'DELIVERY_ACK',
              label: `✓✓ 2 Traços (Frase "${phraseText}" entregue nas últimas ${maxHours}h!)`
            };
          }
        }
      }
    } catch (e) {
      // continua tentando outras assinaturas
    }
  }

  return {
    has2Checks: false,
    checks: 1,
    status: 'NOT_FOUND',
    label: `✓ 1 Traço (Frase "${phraseText}" não encontrada nas últimas ${maxHours}h)`
  };
}

// ── CHECAGEM PRÉVIA DE NÚMEROS NO WHATSAPP ─────────────────────────

export async function checkWhatsAppNumbers(numbersArray) {
  const { instanceName } = getEvolutionConfig();
  const cleanNumbers = numbersArray.map(n => {
    let clean = extractCleanPhone(n);
    if (clean.length === 10 || clean.length === 11) clean = '55' + clean;
    return clean;
  }).filter(Boolean);

  if (!cleanNumbers.length) return [];

  try {
    const data = await evolutionFetch(`/chat/whatsappNumbers/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({ numbers: cleanNumbers }),
    });
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Erro ao checar números no WhatsApp:', err);
    return null;
  }
}

export async function fetchWhatsAppContacts() {
  const { instanceName } = getEvolutionConfig();
  try {
    const data = await evolutionFetch(`/chat/findContacts/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    return Array.isArray(data) ? data : [];
  } catch (err) {
    try {
      const dataGet = await evolutionFetch(`/chat/findContacts/${instanceName}`);
      return Array.isArray(dataGet) ? dataGet : [];
    } catch (e) {
      console.warn('Erro ao buscar contatos do WhatsApp:', e);
      return [];
    }
  }
}

// ── ORGANIZAÇÃO DAS LISTAS DE TRANSMISSÃO T1, T2, T3... ────────────

export function generateTransmissionBatches(users, maxPerBatch = 250) {
  // Filtra apenas membros com telefone válido
  const validUsers = users.filter((u) => {
    const phone = extractCleanPhone(u.whatsapp || u.phone);
    return phone.length >= 8;
  });

  const batches = [];
  const totalBatches = Math.ceil(validUsers.length / maxPerBatch) || 1;

  for (let i = 0; i < totalBatches; i++) {
    const chunk = validUsers.slice(i * maxPerBatch, (i + 1) * maxPerBatch);
    const listIndex = i + 1;
    batches.push({
      id: `T${listIndex}`,
      name: `Candido lista T${listIndex}`,
      count: chunk.length,
      users: chunk,
      startNumber: i * maxPerBatch + 1,
      endNumber: i * maxPerBatch + chunk.length,
    });
  }

  return batches;
}

// ── AUDITORIA DE LISTAS DE TRANSMISSÃO (@broadcast) NO WHATSAPP ────

// Extrai telefone limpo de URLs do WhatsApp (ex: https://api.whatsapp.com/send/?phone=61992623060&text&type=phone_number&app_absent=0) ou texto bruto
export function extractCleanPhone(p) {
  if (!p) return '';
  let str = p.toString().trim();

  // Se for uma URL do WhatsApp com query string phone=
  if (str.includes('phone=')) {
    const match = str.match(/phone=([0-9+]+)/i);
    if (match && match[1]) {
      str = match[1];
    }
  } else if (str.includes('wa.me/')) {
    const match = str.match(/wa\.me\/([0-9+]+)/i);
    if (match && match[1]) {
      str = match[1];
    }
  } else if (str.includes('http://') || str.includes('https://')) {
    str = str.split('?')[0];
  }

  let clean = str.replace(/\D/g, '');

  // Se o número tiver 12 dígitos e NÃO começar com 55 (ex: 619926230600 originado de app_absent=0)
  if (clean.length === 12 && !clean.startsWith('55') && clean.endsWith('0')) {
    clean = clean.substring(0, 11);
  }

  return clean;
}

// ── GERADOR DE ASSINATURAS DE TELEFONE (DDD + 8/9 DÍGITOS) ─────────

export function getPhoneSignatures(p) {
  let clean = extractCleanPhone(p);
  if (!clean) return [];
  if (clean.startsWith('0')) clean = clean.substring(1);
  if (clean.startsWith('55') && clean.length >= 12) clean = clean.substring(2);

  // Se o número estiver sem DDD (8 ou 9 dígitos), aplica o DDD padrão 61 (DF)
  if (clean.length === 8 || clean.length === 9) {
    clean = '61' + clean;
  }

  const sigs = new Set();
  sigs.add(clean);
  sigs.add('55' + clean);

  if (clean.length === 11) {
    const ddd = clean.substring(0, 2);
    const nineDigits = clean.substring(2); // ex: 992623060
    const eightDigits = clean.substring(3); // ex: 92623060
    sigs.add('55' + clean);
    sigs.add(clean);
    sigs.add('55' + ddd + eightDigits);
    sigs.add(ddd + eightDigits);
    sigs.add(nineDigits);
    sigs.add(eightDigits);
  } else if (clean.length === 10) {
    const ddd = clean.substring(0, 2);
    const eightDigits = clean.substring(2); // ex: 92623060
    sigs.add('55' + clean);
    sigs.add(clean);
    sigs.add('55' + ddd + '9' + eightDigits);
    sigs.add(ddd + '9' + eightDigits);
    sigs.add('9' + eightDigits);
    sigs.add(eightDigits);
  }

  return Array.from(sigs);
}

// ── AUDITORIA DE TODAS AS LISTAS DE TRANSMISSÃO E MENSAGENS ────────

export async function fetchWhatsAppChats() {
  const { instanceName } = getEvolutionConfig();
  try {
    const data = await evolutionFetch(`/chat/findChats/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    return Array.isArray(data) ? data : (data?.chats || []);
  } catch (err) {
    try {
      const dataGet = await evolutionFetch(`/chat/findChats/${instanceName}`);
      return Array.isArray(dataGet) ? dataGet : (dataGet?.chats || []);
    } catch (e) {
      console.warn('Erro ao buscar chats do WhatsApp:', e);
      return [];
    }
  }
}

export async function searchBroadcastLists(tag = '') {
  const chats = await fetchWhatsAppChats();
  const cleanTag = (tag || '').toLowerCase().trim();

  const broadcastChats = (chats || []).filter((c) => {
    const id = (c.id || c.jid || '').toLowerCase();
    const name = (c.name || c.subject || c.pushName || '').toLowerCase();
    const isBroadcast = c.isBroadcast || id.includes('@broadcast');
    
    if (cleanTag) {
      const matchesTag = name.includes(cleanTag) || id.includes(cleanTag);
      return isBroadcast || matchesTag;
    }
    return isBroadcast;
  });

  return broadcastChats;
}

// 📡 Varredura Geral de TODAS as Transmissões e Recibos de Mensagens do WhatsApp
export async function fetchAllWhatsAppTransmissionReceipts() {
  const { instanceName } = getEvolutionConfig();
  const receiptsMap = new Map(); // signature -> { checks: 1 | 2, status, label, source, timestamp }
  let totalMessagesAnalyzed = 0;
  let contactsWith2ChecksCount = 0;

  try {
    // 1. Consulta mensagens enviadas pela instância (fromMe: true)
    const msgsPost = await evolutionFetch(`/chat/findMessages/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        where: {
          key: {
            fromMe: true
          }
        },
        limit: 500,
      }),
    }).catch(() => null);

    const msgsList = msgsPost?.messages?.records || (Array.isArray(msgsPost) ? msgsPost : []);
    
    // 2. Consulta mensagens gerais recentes para capturar respostas e recibos
    const msgsGeneral = await evolutionFetch(`/chat/findMessages/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        limit: 500,
      }),
    }).catch(() => null);

    const msgsGeneralList = msgsGeneral?.messages?.records || (Array.isArray(msgsGeneral) ? msgsGeneral : []);

    // Unifica mensagens únicas por ID
    const msgMap = new Map();
    msgsList.forEach((m) => m?.id && msgMap.set(m.id, m));
    msgsGeneralList.forEach((m) => m?.id && msgMap.set(m.id, m));
    const allMsgs = Array.from(msgMap.values());

    totalMessagesAnalyzed = allMsgs.length;

    // 3. Mapeia os IDs das mensagens enviadas para listas de transmissão (@broadcast)
    const broadcastKeyIds = new Set();
    allMsgs.forEach((m) => {
      const rJid = (m.key?.remoteJid || m.remoteJid || '').toLowerCase();
      if (rJid.includes('@broadcast') || m.broadcast || m.isBroadcast) {
        if (m.key?.id) broadcastKeyIds.add(m.key.id);
      }
    });

    allMsgs.forEach((msg) => {
      const remoteJid = msg?.key?.remoteJid || msg?.remoteJid || '';
      const keyId = msg?.key?.id;
      const fromMe = msg?.key?.fromMe ?? true;
      const directStatus = (msg?.status || '').toUpperCase();
      const updates = Array.isArray(msg?.MessageUpdate) ? msg.MessageUpdate : [];
      const userReceipts = Array.isArray(msg?.userReceipt) ? msg.userReceipt : [];
      const isBroadcastLinked = broadcastKeyIds.has(keyId) || remoteJid.includes('@broadcast');

      // A) Se for mensagem recebida (fromMe: false), o contato certamente recebeu/interagiu
      if (!fromMe && remoteJid && !remoteJid.includes('@g.us')) {
        let raw = remoteJid.includes('@') ? remoteJid.split('@')[0] : remoteJid;
        const cleanPhone = raw.replace(/\D/g, '');
        if (cleanPhone) {
          getPhoneSignatures(cleanPhone).forEach((sig) => {
            receiptsMap.set(sig, {
              checks: 2,
              is2Checks: true,
              status: 'READ',
              label: '✓✓ 2 Traços (Mensagem Recebida / Interagiu)',
              source: 'incoming_message',
              phone: cleanPhone
            });
          });
        }
      }

      // B) Mensagens vinculadas a transmissões ou mensagens diretas enviadas
      if (fromMe && remoteJid && !remoteJid.includes('@g.us') && !remoteJid.includes('@broadcast')) {
        let raw = remoteJid.includes('@') ? remoteJid.split('@')[0] : remoteJid;
        const cleanPhone = raw.replace(/\D/g, '');
        const isRead = updates.some(u => (u.status || '').toUpperCase() === 'READ' || (u.status || '').toUpperCase() === 'PLAYED') ||
                       directStatus === 'READ' || directStatus === 'PLAYED';
        const isDelivered = isRead || updates.some(u => (u.status || '').toUpperCase() === 'DELIVERY_ACK') ||
                            directStatus === 'DELIVERY_ACK';

        if (cleanPhone) {
          getPhoneSignatures(cleanPhone).forEach((sig) => {
            const existing = receiptsMap.get(sig);
            if (!existing || (!existing.is2Checks && isDelivered)) {
              receiptsMap.set(sig, {
                checks: isDelivered ? 2 : 1,
                is2Checks: isDelivered,
                status: isRead ? 'READ' : isDelivered ? 'DELIVERY_ACK' : 'SERVER_ACK',
                label: isRead ? '✓✓ 2 Traços Azuis (Lido na Transmissão)' : isDelivered ? '✓✓ 2 Traços (Entregue na Transmissão)' : '✓ 1 Traço (Pendente)',
                source: isBroadcastLinked ? 'broadcast_message' : 'chat_message',
                phone: cleanPhone
              });
            }
          });
        }
      }

      // C) Se houver MessageUpdate com participantes (mensagens de broadcast)
      updates.forEach((u) => {
        const pJid = u.participant || u.fromMeJid || u.key?.participant || '';
        if (pJid) {
          let raw = pJid.includes('@') ? pJid.split('@')[0] : pJid;
          const cleanNum = raw.replace(/\D/g, '');
          const st = (u.status || '').toUpperCase();
          const is2Checks = st === 'DELIVERY_ACK' || st === 'READ' || st === 'PLAYED' || st === '2' || st === '3' || st === '4';

          if (cleanNum) {
            getPhoneSignatures(cleanNum).forEach((sig) => {
              const existing = receiptsMap.get(sig);
              if (!existing || (!existing.is2Checks && is2Checks)) {
                receiptsMap.set(sig, {
                  checks: is2Checks ? 2 : 1,
                  is2Checks,
                  status: st,
                  label: is2Checks ? '✓✓ 2 Traços (Entregue na Transmissão)' : '✓ 1 Traço (Pendente)',
                  source: 'broadcast_update',
                  phone: cleanNum
                });
              }
            });
          }
        }
      });

      // D) Se houver userReceipt
      userReceipts.forEach((ur) => {
        const uJid = ur.userJid || ur.jid || '';
        if (uJid) {
          let raw = uJid.includes('@') ? uJid.split('@')[0] : uJid;
          const cleanNum = raw.replace(/\D/g, '');
          const is2Checks = Boolean(ur.receiptTimestamp || ur.readTimestamp || ur.playedTimestamp);

          if (cleanNum) {
            getPhoneSignatures(cleanNum).forEach((sig) => {
              const existing = receiptsMap.get(sig);
              if (!existing || (!existing.is2Checks && is2Checks)) {
                receiptsMap.set(sig, {
                  checks: is2Checks ? 2 : 1,
                  is2Checks,
                  status: is2Checks ? 'DELIVERY_ACK' : 'SERVER_ACK',
                  label: is2Checks ? '✓✓ 2 Traços (Recibo Confirmado)' : '✓ 1 Traço (Pendente)',
                  source: 'user_receipt',
                  phone: cleanNum
                });
              }
            });
          }
        }
      });
    });
  } catch (err) {
    console.warn('Erro ao consultar mensagens para auditoria:', err);
  }

  // Conta total com 2 traços reais confirmados por entrega de mensagem
  const seenPhones = new Set();
  receiptsMap.forEach((val) => {
    if (val.is2Checks && val.phone && !seenPhones.has(val.phone)) {
      seenPhones.add(val.phone);
      contactsWith2ChecksCount++;
    }
  });

  return {
    receiptsMap,
    totalMessagesAnalyzed,
    contactsWith2ChecksCount,
  };
}

// Extrai quem recebeu (✓✓) e quem não recebeu (✓) da transmissão para os contatos selecionados
export function auditBroadcastDeliveryReceipts(receiptsData, targetUsers = []) {
  const receiptsMap = receiptsData?.receiptsMap || (receiptsData instanceof Map ? receiptsData : new Map());

  let savedCount = 0;
  let notSavedCount = 0;

  const evaluatedUsers = targetUsers.map((u) => {
    const rawPhone = u.whatsapp || u.phone || '';
    const fullName = (u.name || 'Sem nome').trim();
    const sigs = getPhoneSignatures(rawPhone);

    let matchReceipt = null;

    // Correspondência estrita por assinatura telefônica (DDD + 8/9 dígitos)
    for (const sig of sigs) {
      if (receiptsMap.has(sig)) {
        matchReceipt = receiptsMap.get(sig);
        break;
      }
    }

    const is2Checks = Boolean(matchReceipt?.is2Checks || matchReceipt?.checks === 2);

    if (is2Checks) {
      savedCount++;
    } else {
      notSavedCount++;
    }

    return {
      id: u.id,
      user: u,
      name: fullName,
      phone: rawPhone,
      city: u.city || '',
      checks: is2Checks ? 2 : 1,
      status: is2Checks ? 'DELIVERY_ACK' : 'SERVER_ACK',
      label: is2Checks ? (matchReceipt?.label || '✓✓ 2 Traços (Entregue na Transmissão)') : '✓ 1 Traço (Não Entregue / Pendente)',
      isSaved: is2Checks,
    };
  });

  return {
    evaluatedUsers,
    savedCount,
    notSavedCount,
  };
}



