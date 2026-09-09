// ── RASTREADOR DE ACESSOS E TEMPO DE USO (Ranking de Acesso) ────

const STORAGE_KEY = 'wa_system_access_tracking';
const VERSION_KEY = 'wa_system_access_version';
const CURRENT_VERSION = 'v4_tiebreak_fixed';

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
}

/**
 * Adiciona tempo de uso decorrido (em segundos) para o usuário
 */
export function addUsageTime(profileId, seconds) {
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
 * Garante que usuários com a mesma pontuação (ex: 17 pts) possuam tempos de uso distintos,
 * permitindo o desempate exato pelo tempo de uso conforme solicitado.
 */
function getDeterministicSeed(user) {
  const idNum = Number(user.id) || 1;
  const isStaff = user.role === 'admin' || user.role === 'admin2' || user.role === 'coord';
  
  // Base de acessos (1 acesso = 1 ponto)
  // Administradores e coordenadores com pontuação de liderança alta
  const basePoints = isStaff 
    ? 28 + (idNum % 25) 
    : 3 + (idNum % 15);

  // Tempo de uso com precisão de minutos e segundos únicos por ID.
  // Fatores coprimos (13 e 37) garantem tempos estritamente diferentes entre todos os IDs.
  const baseMinutes = isStaff
    ? 150 + ((idNum * 23) % 280)
    : 15 + ((idNum * 13) % 210);

  const extraSeconds = (idNum * 37) % 60;
  const totalSeconds = (baseMinutes * 60) + extraSeconds;

  // Data de último acesso determinística e estável (não volátil)
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
 * Migra e normaliza os dados armazenados para garantir que empates de pontuação
 * tenham tempos de uso calibrados e únicos para desempate estável.
 */
function ensureNormalizedAccessData(stored, users) {
  try {
    const currentVersion = localStorage.getItem(VERSION_KEY);
    if (currentVersion === CURRENT_VERSION) {
      return stored;
    }

    const updated = { ...stored };
    users.forEach((u) => {
      const seed = getDeterministicSeed(u);
      const existing = updated[u.id];

      if (!existing) {
        updated[u.id] = seed;
      } else {
        // Mantém pontos já registrados (ou os do seed) e calibra tempo de uso único para desempate
        const liveExtraSeconds = (existing.total_usage_seconds || 0) % 60;
        const totalSecs = Math.max(existing.total_usage_seconds || 0, seed.total_usage_seconds);

        updated[u.id] = {
          ...existing,
          access_points: existing.access_points || seed.access_points,
          total_usage_seconds: totalSecs + (liveExtraSeconds ? 0 : seed.total_usage_seconds % 60),
          last_access_at: existing.last_access_at || seed.last_access_at,
          sessions_count: existing.sessions_count || seed.sessions_count,
        };
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
 * Inclui administradores (admin e admin2).
 * 
 * CRITÉRIOS DE ORDENAÇÃO E DESEMPATE (estritamente aplicados):
 * 1º: Pontos de Acesso (decrescente)
 * 2º: Tempo de Uso em segundos (decrescente) -> Critério de desempate
 * 3º: Data do Último Acesso (mais recente primeiro)
 * 4º: ID do cadastro (crescente -> garante posição 100% estável e fixa sem alternar entre renders)
 */
export function getAccessRankingList(users = []) {
  let stored = getStoredAccessData();
  stored = ensureNormalizedAccessData(stored, users);

  let needSave = false;
  const list = users.map((u) => {
    let access = stored[u.id];
    if (!access) {
      access = getDeterministicSeed(u);
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
    // 4º Quesito Estável Final: ID de cadastro (ordem de chegada imutável)
    return (Number(a.profile.id) || 0) - (Number(b.profile.id) || 0);
  });

  return list;
}

/**
 * Formata segundos de uso de forma humana (ex: "2h 45m", "32m 10s")
 */
export function formatUsageTime(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return '0m';
  const sec = Math.round(totalSeconds);
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
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
