import { supabase } from './supabase';

// Local storage keys for configuration
const STORAGE_KEY_URL = 'evolution_api_url';
const STORAGE_KEY_KEY = 'evolution_api_key';
const STORAGE_KEY_INSTANCE = 'evolution_api_instance';

export const DEFAULT_SERVER_URL = 'https://evolution-api-production-2522.up.railway.app';
export const DEFAULT_API_KEY = '6a76cbf204380d04e7ce897ac00e4f204cafea39bc9b';
export const DEFAULT_INSTANCE_NAME = 'dr_candido';

export function getEvolutionConfig() {
  return {
    serverUrl: (localStorage.getItem(STORAGE_KEY_URL) || DEFAULT_SERVER_URL).replace(/\/+$/, ''),
    apiKey: localStorage.getItem(STORAGE_KEY_KEY) || DEFAULT_API_KEY,
    instanceName: localStorage.getItem(STORAGE_KEY_INSTANCE) || DEFAULT_INSTANCE_NAME,
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
      const apiKey = data.evolution_api_key || local.apiKey;
      const instanceName = data.evolution_api_instance || local.instanceName;

      if (serverUrl) {
        setEvolutionConfig({ serverUrl, apiKey, instanceName });
        return {
          serverUrl: (serverUrl || '').replace(/\/+$/, ''),
          apiKey: apiKey || '',
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
  const { serverUrl, apiKey } = getEvolutionConfig();
  if (!serverUrl || !apiKey) {
    throw new Error('Evolution API não configurada. Insira a URL e a Chave de API no painel.');
  }

  const url = `${serverUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  const headers = {
    'apikey': apiKey,
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
  
  // Tenta conectar ou gerar QR code
  try {
    const connectData = await evolutionFetch(`/instance/connect/${instanceName}`);
    return connectData;
  } catch (err) {
    // Se a instância não existir, cria a instância primeiro
    const createData = await evolutionFetch(`/instance/create`, {
      method: 'POST',
      body: JSON.stringify({
        instanceName,
        token: '',
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      }),
    });
    return createData;
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
  let cleanNumber = (number || '').replace(/\D/g, '');
  if (cleanNumber.length === 10 || cleanNumber.length === 11) {
    cleanNumber = '55' + cleanNumber;
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
