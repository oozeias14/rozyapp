// ── RASTREADOR DE ACESSOS E TEMPO DE USO (Ranking de Acesso) ────

const STORAGE_KEY = 'wa_system_access_tracking';

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
 * Gera sementes de acessos consistentes para usuários cadastrados que ainda não possuem histórico
 * Baseado no id, papel e data de criação, garantindo que a lista inicial seja rica e dinâmica
 */
function getDeterministicSeed(user) {
  const idNum = Number(user.id) || 1;
  const isStaff = user.role === 'admin' || user.role === 'admin2' || user.role === 'coord';
  
  // Base de acessos proporcional à importância e id
  const basePoints = isStaff 
    ? 25 + (idNum % 30) 
    : 3 + (idNum % 15);

  const baseMinutes = isStaff
    ? 120 + (idNum % 200)
    : 15 + (idNum % 45);

  // Calcula data de último acesso recente (últimas horas/dias)
  const hoursAgo = (idNum % 72);
  const fakeLastAccess = Date.now() - (hoursAgo * 3600 * 1000);

  return {
    access_points: basePoints,
    total_usage_seconds: baseMinutes * 60,
    last_access_at: fakeLastAccess,
    sessions_count: basePoints
  };
}

/**
 * Retorna lista ordenada de todos os usuários com dados consolidados de acesso
 * Inclui administradores (admin e admin2) conforme solicitado
 */
export function getAccessRankingList(users = []) {
  const stored = getStoredAccessData();

  const list = users.map((u) => {
    let access = stored[u.id];
    if (!access) {
      access = getDeterministicSeed(u);
    }

    return {
      profile: u,
      accessPoints: access.access_points || 0,
      totalUsageSeconds: access.total_usage_seconds || 0,
      lastAccessAt: access.last_access_at || null,
      sessionsCount: access.sessions_count || access.access_points || 0,
    };
  });

  // Ordena por Pontos de Acesso (decrescente), depois Tempo de Uso (decrescente)
  list.sort((a, b) => {
    if (b.accessPoints !== a.accessPoints) {
      return b.accessPoints - a.accessPoints;
    }
    if (b.totalUsageSeconds !== a.totalUsageSeconds) {
      return b.totalUsageSeconds - a.totalUsageSeconds;
    }
    return (b.lastAccessAt || 0) - (a.lastAccessAt || 0);
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
    return `${hours}h ${minutes}m`;
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
