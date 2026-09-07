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

// ── CHECAGEM PRÉVIA DE NÚMEROS NO WHATSAPP ─────────────────────────

export async function checkWhatsAppNumbers(numbersArray) {
  const { instanceName } = getEvolutionConfig();
  const cleanNumbers = numbersArray.map(n => {
    let clean = (n || '').replace(/\D/g, '');
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
    const phone = (u.whatsapp || u.phone || '').replace(/\D/g, '');
    return phone.length >= 10;
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

  // Filtra conversas que sejam listas de transmissão ou que tenham @broadcast no JID
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

export async function fetchBroadcastLastMessage(broadcastJid) {
  const { instanceName } = getEvolutionConfig();
  if (!broadcastJid) return null;

  try {
    // 1. Tenta buscar mensagens filtradas pelo JID da lista
    const data = await evolutionFetch(`/chat/findMessages/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        where: {
          key: {
            remoteJid: broadcastJid
          }
        },
        limit: 5,
      }),
    });
    const records = data?.messages?.records || (Array.isArray(data) ? data : []);
    if (records.length > 0) {
      return records[records.length - 1] || records[0];
    }
  } catch (err) {
    console.warn('Erro na busca de mensagens específicas do broadcast:', err);
  }

  // Fallback: Busca geral nas mensagens mais recentes
  try {
    const allMsgs = await fetchWhatsAppMessages({ limit: 50 });
    const match = allMsgs.find(m => {
      const rJid = (m?.key?.remoteJid || '').toLowerCase();
      const bJid = broadcastJid.toLowerCase();
      return rJid === bJid || (m?.broadcast && rJid.includes('@broadcast'));
    });
    return match || null;
  } catch (e) {
    return null;
  }
}

// Extrai quem recebeu (✓✓) e quem não recebeu (✓) da mensagem da transmissão
export function auditBroadcastDeliveryReceipts(broadcastMessage, targetUsers = []) {
  if (!broadcastMessage) {
    return {
      messageText: '',
      messageTimestamp: null,
      evaluatedUsers: targetUsers.map(u => ({
        id: u.id,
        user: u,
        name: u.name || 'Sem nome',
        phone: u.whatsapp || u.phone || '',
        city: u.city || '',
        checks: 1,
        status: 'SERVER_ACK',
        label: '1 Traço (Pendente)',
        isSaved: false,
      })),
      savedCount: 0,
      notSavedCount: targetUsers.length
    };
  }

  const msgText = broadcastMessage?.message?.conversation ||
                  broadcastMessage?.message?.extendedTextMessage?.text ||
                  broadcastMessage?.text ||
                  'Mensagem da Lista de Transmissão';

  const msgTimestamp = broadcastMessage?.messageTimestamp || broadcastMessage?.createdAt;

  // Mapa de status dos destinatários na mensagem do WhatsApp
  const receiptsMap = new Map(); // phoneSignature -> { checks: 1 | 2, status, isSaved }

  // 1. Analisa MessageUpdate (recibos individuais de entrega/leitura de Baileys)
  const updates = Array.isArray(broadcastMessage.MessageUpdate) ? broadcastMessage.MessageUpdate : [];
  updates.forEach(u => {
    const participantJid = u.participant || u.fromMeJid || u.key?.participant || '';
    const cleanNum = participantJid.replace(/\D/g, '');
    const st = (u.status || '').toUpperCase();
    const is2Checks = st === 'DELIVERY_ACK' || st === 'READ' || st === 'PLAYED' || st === '2' || st === '3' || st === '4';

    if (cleanNum) {
      receiptsMap.set(cleanNum, {
        checks: is2Checks ? 2 : 1,
        status: st || (is2Checks ? 'DELIVERY_ACK' : 'SERVER_ACK'),
        isSaved: is2Checks
      });
    }
  });

  // 2. Analisa campo userReceipt ou status se presente
  const userReceipts = Array.isArray(broadcastMessage.userReceipt) ? broadcastMessage.userReceipt : [];
  userReceipts.forEach(ur => {
    const userJid = ur.userJid || ur.jid || '';
    const cleanNum = userJid.replace(/\D/g, '');
    const is2Checks = ur.receiptTimestamp || ur.readTimestamp || ur.playedTimestamp;
    if (cleanNum) {
      receiptsMap.set(cleanNum, {
        checks: is2Checks ? 2 : 1,
        status: is2Checks ? 'DELIVERY_ACK' : 'SERVER_ACK',
        isSaved: Boolean(is2Checks)
      });
    }
  });

  let savedCount = 0;
  let notSavedCount = 0;

  const evaluatedUsers = targetUsers.map(u => {
    const rawPhone = u.whatsapp || u.phone || '';
    const clean = rawPhone.replace(/\D/g, '');
    
    // Busca combinações possíveis com e sem 55, com e sem nono dígito
    let matchReceipt = null;
    if (clean) {
      matchReceipt = receiptsMap.get(clean) ||
                     receiptsMap.get('55' + clean) ||
                     receiptsMap.get(clean.startsWith('55') ? clean.substring(2) : clean);
    }

    const is2Checks = matchReceipt?.checks === 2;
    if (is2Checks) {
      savedCount++;
    } else {
      notSavedCount++;
    }

    return {
      id: u.id,
      user: u,
      name: u.name || 'Sem nome',
      phone: rawPhone,
      city: u.city || '',
      checks: is2Checks ? 2 : 1,
      status: is2Checks ? 'DELIVERY_ACK' : 'SERVER_ACK',
      label: is2Checks ? '✓✓ 2 Traços (Salvo na Agenda)' : '✓ 1 Traço (Não Salvo / Pendente)',
      isSaved: is2Checks,
    };
  });

  return {
    messageText: msgText,
    messageTimestamp: msgTimestamp,
    evaluatedUsers,
    savedCount,
    notSavedCount
  };
}


