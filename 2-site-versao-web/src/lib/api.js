import { supabase } from './supabase';

// Helper local para verificar se o usuário atual é o Admin 2 (Acesso de Leitura para Play Store)
async function isCurrentUserAdmin2() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;
  const { data: profile } = await supabase.from('profiles').select('role').eq('auth_id', session.user.id).maybeSingle();
  return profile?.role === 'admin2';
}

// Bloqueia ações de edição/exclusão/criação para contas teste da Play Store
function handleAdmin2Block() {
  alert('Operação não permitida. Esta conta possui acesso de apenas visualização para testes (Play Store).');
  throw new Error('Apenas visualização');
}

// ── PERFIS ────────────────────────────────────────────────
export async function fetchAllProfiles() {
  let allData = [];
  let from = 0;
  const limit = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + limit - 1);
      
    if (error) throw error;
    if (!data || data.length === 0) break;
    
    allData = allData.concat(data);
    if (data.length < limit) break;
    from += limit;
  }
  
  return allData;
}

export async function fetchTotalUsersCount() {
  const { count, error } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
}

export async function fetchDirectReferrals(referrerId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('referrer_id', referrerId).order('id');
  if (error) throw error;
  return data;
}

export async function fetchMatrixChildren(parentId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('parent_id', parentId).order('id');
  if (error) throw error;
  return data;
}

export async function fetchProfileById(id) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchDirectChildren(parentId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('parent_id', parentId).order('id');
  if (error) throw error;
  return data;
}

export async function updateProfile(id, patch) {
  if (await isCurrentUserAdmin2()) {
    handleAdmin2Block();
  }
  const { error } = await supabase.from('profiles').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteProfile(id) {
  if (await isCurrentUserAdmin2()) {
    handleAdmin2Block();
  }
  const { error } = await supabase.from('profiles').delete().eq('id', id);
  if (error) throw error;
}

export async function findSlot(refId) {
  const { data, error } = await supabase.rpc('find_slot', { ref_id: refId });
  if (error) throw error;
  return data;
}

// ── REUNIOES ──────────────────────────────────────────────
export async function fetchMeetings() {
  const { data, error } = await supabase
    .from('meetings')
    .select('*, profiles(name)')
    .order('date', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createMeeting(meeting) {
  if (await isCurrentUserAdmin2()) {
    handleAdmin2Block();
  }
  const { data, error } = await supabase.from('meetings').insert(meeting).select('*');
  if (error) throw error;
  return data?.[0] || data;
}

export async function deleteMeeting(id) {
  if (await isCurrentUserAdmin2()) {
    handleAdmin2Block();
  }
  const { error } = await supabase.from('meetings').delete().eq('id', id);
  if (error) throw error;
}

export async function updateMeeting(id, patch) {
  if (await isCurrentUserAdmin2()) {
    handleAdmin2Block();
  }
  const { error } = await supabase.from('meetings').update(patch).eq('id', id);
  if (error) throw error;
}

// ── MENSAGENS ─────────────────────────────────────────────
export async function fetchMessages() {
  const { data, error } = await supabase
    .from('messages')
    .select('*, profiles!messages_from_id_fkey(name), message_likes(profile_id)')
    .order('id', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createMessage(fromId, text) {
  if (await isCurrentUserAdmin2()) {
    handleAdmin2Block();
  }
  const { error } = await supabase.from('messages').insert({ from_id: fromId, text });
  if (error) throw error;
}

export async function deleteMessage(id) {
  if (await isCurrentUserAdmin2()) {
    handleAdmin2Block();
  }
  const { error } = await supabase.from('messages').delete().eq('id', id);
  if (error) throw error;
}

export async function likeMessage(messageId, profileId) {
  const { error } = await supabase.from('message_likes').insert({ message_id: messageId, profile_id: profileId });
  if (error) throw error;
}

export async function unlikeMessage(messageId, profileId) {
  const { error } = await supabase.from('message_likes').delete().eq('message_id', messageId).eq('profile_id', profileId);
  if (error) throw error;
}

// ── DR. CANDIDO (owner_profile) ──────────────────────────
export async function fetchOwnerProfile() {
  const { data, error } = await supabase.from('owner_profile').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateOwnerProfile(patch) {
  if (await isCurrentUserAdmin2()) {
    handleAdmin2Block();
  }
  const { error } = await supabase.from('owner_profile').update(patch).eq('id', 1);
  if (error) throw error;
}

// ── CONFIGURACOES ─────────────────────────────────────────
export async function fetchAppSettings() {
  const { data, error } = await supabase.from('app_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateAppDomain(domain) {
  if (await isCurrentUserAdmin2()) {
    handleAdmin2Block();
  }
  const { error } = await supabase.from('app_settings').update({ app_domain: domain }).eq('id', 1);
  if (error) throw error;
}

export async function updateAppSettings(settings) {
  if (await isCurrentUserAdmin2()) {
    handleAdmin2Block();
  }
  const { error } = await supabase.from('app_settings').update(settings).eq('id', 1);
  if (error) throw error;
}

// ── SENHA / CONTA (via Supabase Auth) ────────────────────
export async function changeOwnPassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// Admin resetando a senha de QUALQUER outro cadastro.
export async function adminResetPassword(targetAuthId, newPassword) {
  if (await isCurrentUserAdmin2()) {
    handleAdmin2Block();
  }
  const { data, error } = await supabase.rpc('admin_reset_password_rpc', {
    target_auth_id: targetAuthId,
    new_password: newPassword
  });
  if (error) throw error;
  return data;
}

// ── AÇÕES DE ADMIN SOBRE CADASTROS ───────────────────────
export async function promoteToCoordinator(id) {
  if (await isCurrentUserAdmin2()) {
    handleAdmin2Block();
  }
  await updateProfile(id, { role: 'coord' });
}

export async function demoteToUser(id) {
  if (await isCurrentUserAdmin2()) {
    handleAdmin2Block();
  }
  await updateProfile(id, { role: 'user' });
}

export async function promoteToAdmin2(id) {
  if (await isCurrentUserAdmin2()) {
    handleAdmin2Block();
  }
  const { data: existingAdmin2 } = await supabase.from('profiles').select('id, name').eq('role', 'admin2').maybeSingle();
  if (existingAdmin2) {
    throw new Error(`Já existe outro usuário promovido como Admin 2 (${existingAdmin2.name}). Rebaixe-o primeiro.`);
  }
  await updateProfile(id, { role: 'admin2' });
}

export async function incrementInstagramRedirects() {
  const { error } = await supabase.rpc('increment_instagram_redirects');
  if (error) throw error;
}

export async function incrementProfileRedirects() {
  const { error } = await supabase.rpc('increment_profile_redirects');
  if (error) throw error;
}
