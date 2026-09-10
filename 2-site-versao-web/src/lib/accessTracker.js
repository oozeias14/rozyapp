// ── RASTREADOR DE ACESSOS E TEMPO DE USO (Ranking de Acesso) ────
import { supabase } from './supabase.js';

const STORAGE_KEY = 'wa_system_access_tracking';
const VERSION_KEY = 'wa_system_access_version';
const CURRENT_VERSION = 'v7_sync_tulio_198_40h';

let cloudSyncTimer = null;

/**
 * Lê o mapa de acessos do localStorage
 * Retorna { [userId]: { access_points, total_usage_seconds, last_access_at, sessions_count } }
 */
export function getStoredAccessData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn('Erro ao ler access tracking:', e);
    return {};
  }
}

/**
 * Salva o mapa de acessos no localStorage
 */
export function saveStoredAccessData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Erro ao salvar access tracking:', e);
  }
}

/**
 * Carrega os dados consolidados da nuvem (Supabase) e mescla com os locais
 * para garantir sincronização entre Computador e Celular.
 */
export async function loadCloudAccessData() {
  try {
    const { data } = await supabase.from('owner_profile').select('youtube').eq('id', 1).maybeSingle();
    if (!data || !data.youtube) return;

    let payload = null;
    try {
      payload = JSON.parse(data.youtube);
    } catch {
      return;
    }

    if (!payload || !payload.admin_id) return;

    const stored = getStoredAccessData();
    const current = stored[payload.admin_id] || {
      access_points: 198,
      total_usage_seconds: 40 * 3600,
      last_access_at: Date.now(),
      sessions_count: 198
    };

    const newPoints = Math.max(current.access_points || 0, payload.access_points || 0, 198);
    const newSeconds = Math.max(current.total_usage_seconds || 0, payload.total_usage_seconds || 0, 40 * 3600);

    stored[payload.admin_id] = {
      ...current,
      access_points: newPoints,
      total_usage_seconds: newSeconds,
      last_access_at: Math.max(current.last_access_at || 0, payload.last_access_at || 0, Date.now()),
      sessions_count: Math.max(current.sessions_count || 0, newPoints),
    };

    saveStoredAccessData(stored);
  } catch (e) {
    console.warn('Erro ao sincronizar ranking com a nuvem:', e);
  }
}

/**
 * Salva imediatamente o estado do administrador na nuvem (Supabase)
 */
export async function syncCloudAccessImmediately(profile) {
  if (!profile || (profile.role !== 'admin' && profile.role !== 'admin2')) return;
  try {
    const stored = getStoredAccessData();
    const adminData = stored[profile.id];
    if (!adminData) return;

    const payload = {
      admin_id: profile.id,
      access_points: Math.max(adminData.access_points || 0, 198),
      total_usage_seconds: Math.max(adminData.total_usage_seconds || 0, 40 * 3600),
      last_access_at: adminData.last_access_at || Date.now(),
      updated_at: Date.now()
    };

    await supabase.from('owner_profile').update({ youtube: JSON.stringify(payload) }).eq('id', 1);
  } catch (e) {
    console.warn('Erro ao salvar sincronização de acesso na nuvem:', e);
  }
}

/**
 * Agenda salvamento dos dados na nuvem a cada 30 segundos (evita sobrecarga de rede)
 */
export function queueCloudSync(profile) {
  if (!profile || (profile.role !== 'admin' && profile.role !== 'admin2')) return;
  if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(() => {
    syncCloudAccessImmediately(profile);
  }, 30000);
}

/**
 * Registra um novo acesso para o usuário logado (+1 ponto de acesso)
 * Usa sessionStorage para garantir que só conte 1 ponto por sessão de navegador aberta
 */
export function recordUserAccess(profile) {
  if (!profile || !profile.id) return;

  const sessionKey = `user_access_recorded_${profile.id}`;
  const alreadyCountedInSession = sessionStorage.getItem(sessionKey);

  const stored = getStoredAccessData();
  const current = stored[profile.id] || {
    access_points: 0,
    total_usage_seconds: 0,
    last_access_at: Date.now(),
    sessions_count: 0
  };

  if (!alreadyCountedInSession) {
    current.access_points = (current.access_points || 0) + 1;
    current.sessions_count = (current.sessions_count || 0) + 1;
    sessionStorage.setItem(sessionKey, 'true');
  }

  current.last_access_at = Date.now();
  stored[profile.id] = current;
  saveStoredAccessData(stored);

  if (profile.role === 'admin' || profile.role === 'admin2') {
    syncCloudAccessImmediately(profile);
  }
}

/**
 * Adiciona tempo de uso decorrido (em segundos) para o usuário
 */
export function addUsageTime(profileId, seconds, profile = null) {
  if (!profileId || !seconds || seconds <= 0) return;
  const stored = getStoredAccessData();
  const current = stored[profileId] || {
    access_points: 1,
    total_usage_seconds: 0,
    last_access_at: Date.now(),
    sessions_count: 1
  };

  current.total_usage_seconds = (current.total_usage_seconds || 0) + Math.round(seconds);
  current.last_access_at = Date.now();
  stored[profileId] = current;
  saveStoredAccessData(stored);

  if (profile && (profile.role === 'admin' || profile.role === 'admin2')) {
    queueCloudSync(profile);
  }
}

/**
 * Simula ou incrementa acessos manualmente para testes imediatos
 */
export function simulateAccessForUser(profileId, pointsToAdd = 1, secondsToAdd = 60) {
  if (!profileId) return;
  const stored = getStoredAccessData();
  const current = stored[profileId] || {
    access_points: 0,
    total_usage_seconds: 0,
    last_access_at: Date.now(),
    sessions_count: 0
  };

  current.access_points = (current.access_points || 0) + pointsToAdd;
  current.sessions_count = (current.sessions_count || 0) + pointsToAdd;
  current.total_usage_seconds = (current.total_usage_seconds || 0) + secondsToAdd;
  current.last_access_at = Date.now();

  stored[profileId] = current;
  saveStoredAccessData(stored);
}

/**
 * Gera sementes de acessos consistentes e estritamente determinísticas por ID.
 * O Administrador (Túlio - Programador / Desenvolvedor do Sistema) recebe
 * pontuação de topo (1º lugar absoluto com 198 acessos e 40h de uso) sincronizado em qualquer dispositivo.
 */
export function getDeterministicSeed(user, forceAdmin = false) {
  const idNum = Number(user?.id) || 1;
  const isAdmin = forceAdmin || user?.role === 'admin';
  const isAdmin2 = user?.role === 'admin2';
  const isCoord = user?.role === 'coord';

  if (isAdmin) {
    // Administrador Principal (Túlio - Programador / Desenvolvedor do Sistema) -> 1º Lugar Absoluto
    const points = 197 + (idNum % 10); // Para id 1: exatamente 198 acessos
    const seconds = (40 * 3600) + (14 * 60) + ((idNum * 19) % 60); // 40 horas e 14 minutos
    return {
      access_points: points,
      total_usage_seconds: seconds,
      last_access_at: Date.now(),
      sessions_count: points
    };
  }

  if (isAdmin2) {
    // Admin 2
    const points = 92 + (idNum % 10);
    const seconds = (16 * 3600) + (18 * 60) + ((idNum * 23) % 60);
    return {
      access_points: points,
      total_usage_seconds: seconds,
      last_access_at: Date.now() - (2 * 3600 * 1000),
      sessions_count: points
    };
  }

  if (isCoord) {
    // Coordenadores
    const points = 24 + (idNum % 12);
    const seconds = (4 * 3600) + ((idNum * 19) % 3600);
    return {
      access_points: points,
      total_usage_seconds: seconds,
      last_access_at: Date.now() - ((idNum % 24) * 3600 * 1000),
      sessions_count: points
    };
  }

  // Usuários regulares (membros)
  const basePoints = 3 + (idNum % 15); // Pode ter 17 pontos
  const baseMinutes = 15 + ((idNum * 13) % 180);
  const extraSeconds = (idNum * 37) % 60;
  const totalSeconds = (baseMinutes * 60) + extraSeconds;

  const baseline = 1757400000000;
  const offsetHours = (idNum * 7) % 72;
  const fixedLastAccess = baseline - (offsetHours * 3600 * 1000) - (extraSeconds * 1000);

  return {
    access_points: basePoints,
    total_usage_seconds: totalSeconds,
    last_access_at: fixedLastAccess,
    sessions_count: basePoints
  };
}

/**
 * Migra e normaliza os dados armazenados para garantir que o administrador
 * esteja presente no ranking de acesso como líder (1º lugar com no mínimo 198 acessos e 40h)
 * e os empates sejam desempatados por tempo.
 */
function ensureNormalizedAccessData(stored, users, currentProfile) {
  try {
    const currentVersion = localStorage.getItem(VERSION_KEY);
    if (currentVersion === CURRENT_VERSION) {
      return stored;
    }

    const all = [...users];
    if (currentProfile && currentProfile.id && !all.some(u => String(u.id) === String(currentProfile.id))) {
      all.unshift(currentProfile);
    }

    const updated = { ...stored };
    all.forEach((u) => {
      const isCurrentAdmin = currentProfile && String(u.id) === String(currentProfile.id) && (currentProfile.role === 'admin' || currentProfile.role === 'admin2');
      const isAdmin = isCurrentAdmin || u.role === 'admin';
      const seed = getDeterministicSeed(u, isAdmin);
      const existing = updated[u.id];

      if (!existing) {
        updated[u.id] = seed;
      } else {
        if (isAdmin) {
          // Garante que o administrador tenha no mínimo 198 acessos e 40h de uso
          const minPoints = Math.max(seed.access_points, 198);
          const minSeconds = Math.max(seed.total_usage_seconds, 40 * 3600);
          updated[u.id] = {
            ...existing,
            access_points: Math.max(existing.access_points || 0, minPoints),
            total_usage_seconds: Math.max(existing.total_usage_seconds || 0, minSeconds),
            last_access_at: Date.now(),
            sessions_count: Math.max(existing.sessions_count || 0, minPoints),
          };
        } else {
          const totalSecs = Math.max(existing.total_usage_seconds || 0, seed.total_usage_seconds);
          updated[u.id] = {
            ...existing,
            access_points: existing.access_points || seed.access_points,
            total_usage_seconds: totalSecs,
            last_access_at: existing.last_access_at || seed.last_access_at,
            sessions_count: existing.sessions_count || seed.sessions_count,
          };
        }
      }
    });

    saveStoredAccessData(updated);
    localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
    return updated;
  } catch (e) {
    console.warn('Erro ao normalizar dados de acesso:', e);
    return stored;
  }
}

/**
 * Retorna lista ordenada de todos os usuários com dados consolidados de acesso.
 * Garante que o Administrador (especialmente o logado) esteja sempre presente.
 * 
 * CRITÉRIOS DE ORDENAÇÃO E DESEMPATE:
 * 1º: Pontos de Acesso (decrescente) -> Administrador em 1º Lugar com maior número de acessos
 * 2º: Tempo de Uso em segundos (decrescente) -> Critério estrito de desempate
 * 3º: Data do Último Acesso (mais recente primeiro)
 * 4º: ID do cadastro (ordem estável fixa definitiva)
 */
export function getAccessRankingList(users = [], currentProfile = null) {
  let stored = getStoredAccessData();
  stored = ensureNormalizedAccessData(stored, users, currentProfile);

  const allUsers = [...users];
  if (currentProfile && currentProfile.id && !allUsers.some(u => String(u.id) === String(currentProfile.id))) {
    allUsers.unshift(currentProfile);
  }

  let needSave = false;
  const list = allUsers.map((u) => {
    let access = stored[u.id];
    const isCurrentAdmin = currentProfile && String(u.id) === String(currentProfile.id) && (currentProfile.role === 'admin' || currentProfile.role === 'admin2');
    const isAdmin = isCurrentAdmin || u.role === 'admin';

    if (!access) {
      access = getDeterministicSeed(u, isAdmin);
      stored[u.id] = access;
      needSave = true;
    } else if (isAdmin && (access.access_points < 198 || access.total_usage_seconds < 40 * 3600)) {
      const seed = getDeterministicSeed(u, true);
      access.access_points = Math.max(access.access_points, seed.access_points, 198);
      access.total_usage_seconds = Math.max(access.total_usage_seconds, seed.total_usage_seconds, 40 * 3600);
      stored[u.id] = access;
      needSave = true;
    }

    return {
      profile: u,
      accessPoints: access.access_points || 0,
      totalUsageSeconds: access.total_usage_seconds || 0,
      lastAccessAt: access.last_access_at || null,
      sessionsCount: access.sessions_count || access.access_points || 0,
    };
  });

  if (needSave) {
    saveStoredAccessData(stored);
  }

  // Ordenação com os quesitos estritos de desempate:
  list.sort((a, b) => {
    // 1º Quesito: Pontos de Acesso
    if (b.accessPoints !== a.accessPoints) {
      return b.accessPoints - a.accessPoints;
    }
    // 2º Quesito de Desempate: Tempo de Uso (em segundos)
    if (b.totalUsageSeconds !== a.totalUsageSeconds) {
      return b.totalUsageSeconds - a.totalUsageSeconds;
    }
    // 3º Quesito de Desempate: Último Acesso mais recente
    const timeA = a.lastAccessAt ? new Date(a.lastAccessAt).getTime() : 0;
    const timeB = b.lastAccessAt ? new Date(b.lastAccessAt).getTime() : 0;
    if (timeB !== timeA) {
      return timeB - timeA;
    }
    // 4º Quesito Estável Final: ID de cadastro
    return (Number(a.profile.id) || 0) - (Number(b.profile.id) || 0);
  });

  return list;
}

/**
 * Formata segundos de uso de forma detalhada e humana:
 * Exibe horas, minutos e segundos (ex: "40h 14m 12s", "15m 30s") para que o tempo de tela
 * e o desempate fiquem 100% visíveis em tempo real.
 */
export function formatUsageTime(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return '0s';
  const sec = Math.round(totalSeconds);
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}

/**
 * Formata data do último acesso amigavelmente
 */
export function formatLastAccess(timestamp) {
  if (!timestamp) return 'Sem registro';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return 'Sem registro';

  const now = new Date();
  const isToday = now.toDateString() === date.toDateString();

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = yesterday.toDateString() === date.toDateString();

  const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  if (isToday) {
    return `Hoje às ${timeStr}`;
  }
  if (isYesterday) {
    return `Ontem às ${timeStr}`;
  }

  const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${dateStr} às ${timeStr}`;
}
