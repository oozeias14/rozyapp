import { supabase } from './supabase';

// Helper local para verificar se o usuário atual é o Admin 2
async function isCurrentUserAdmin2() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;
  const { data: profile } = await supabase.from('profiles').select('role').eq('auth_id', session.user.id).maybeSingle();
  return profile?.role === 'admin2';
}

// Helper para interceptar e salvar uma solicitação pendente do Admin 2
async function handleAdmin2Mutation(actionType, targetId, payload) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sessão expirada.');
  
  const { data: profile } = await supabase.from('profiles').select('id').eq('auth_id', session.user.id).maybeSingle();
  if (!profile) throw new Error('Perfil não encontrado.');

  const { error } = await supabase.from('admin_requests').insert({
    created_by: profile.id,
    action_type: actionType,
    target_id: targetId ? String(targetId) : null,
    payload: payload,
    status: 'pending'
  });

  if (error) throw error;
  
  alert('Ação registrada com sucesso! Como você é Admin 2, as alterações ficam pendentes de aprovação pelo Administrador Principal.');
  return { isRequest: true };
}

// ── SOLICITAÇÕES ADMIN (Apenas para o Admin Principal) ─────
export async function fetchAdminRequests() {
  const { data, error } = await supabase
    .from('admin_requests')
    .select('*, profiles!admin_requests_created_by_fkey(name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function approveAdminRequest(requestId) {
  // 1. Buscar a solicitação correspondente
  const { data: request, error: fetchErr } = await supabase.from('admin_requests').select('*').eq('id', requestId).maybeSingle();
  if (fetchErr || !request) throw new Error('Solicitação não encontrada.');

  const { action_type, target_id, payload } = request;

  // 2. Executar a ação solicitada
  if (action_type === 'update_profile') {
    const { error } = await supabase.from('profiles').update(payload).eq('id', Number(target_id));
    if (error) throw error;
  } else if (action_type === 'delete_profile') {
    const { error } = await supabase.from('profiles').delete().eq('id', Number(target_id));
    if (error) throw error;
  } else if (action_type === 'promote_coordinator') {
    const { error } = await supabase.from('profiles').update({ role: 'coord' }).eq('id', Number(target_id));
    if (error) throw error;
  } else if (action_type === 'promote_admin2') {
    const { data: existingAdmin2 } = await supabase.from('profiles').select('id').eq('role', 'admin2').maybeSingle();
    if (existingAdmin2) throw new Error('Já existe outro usuário promovido como Admin 2.');
    const { error } = await supabase.from('profiles').update({ role: 'admin2' }).eq('id', Number(target_id));
    if (error) throw error;
  } else if (action_type === 'demote_user') {
    const { error } = await supabase.from('profiles').update({ role: 'user' }).eq('id', Number(target_id));
    if (error) throw error;
  } else if (action_type === 'create_meeting') {
    const { error } = await supabase.from('meetings').insert(payload);
    if (error) throw error;
  } else if (action_type === 'delete_meeting') {
    const { error } = await supabase.from('meetings').delete().eq('id', Number(target_id));
    if (error) throw error;
  } else if (action_type === 'update_meeting') {
    const { error } = await supabase.from('meetings').update(payload).eq('id', Number(target_id));
    if (error) throw error;
  } else if (action_type === 'create_message') {
    const { error } = await supabase.from('messages').insert(payload);
    if (error) throw error;
  } else if (action_type === 'delete_message') {
    const { error } = await supabase.from('messages').delete().eq('id', Number(target_id));
    if (error) throw error;
  } else if (action_type === 'update_owner_profile') {
    const { error } = await supabase.from('owner_profile').update(payload).eq('id', 1);
    if (error) throw error;
  } else if (action_type === 'update_settings') {
    const { error } = await supabase.from('app_settings').update(payload).eq('id', 1);
    if (error) throw error;
  } else if (action_type === 'admin_reset_password') {
    const { error } = await supabase.rpc('admin_reset_password_rpc', {
      target_auth_id: target_id,
      new_password: payload.new_password
    });
    if (error) throw error;
  }

  // 3. Atualizar o status da solicitação para aprovada
  const { data: { session } } = await supabase.auth.getSession();
  const { data: adminProfile } = await supabase.from('profiles').select('id').eq('auth_id', session.user.id).maybeSingle();

  const { error: updateErr } = await supabase.from('admin_requests').update({
    status: 'approved',
    approved_by: adminProfile?.id,
    approved_at: new Date().toISOString()
  }).eq('id', requestId);

  if (updateErr) throw updateErr;
}

export async function rejectAdminRequest(requestId) {
  const { data: { session } } = await supabase.auth.getSession();
  const { data: adminProfile } = await supabase.from('profiles').select('id').eq('auth_id', session.user.id).maybeSingle();

  const { error } = await supabase.from('admin_requests').update({
    status: 'rejected',
    approved_by: adminProfile?.id,
    approved_at: new Date().toISOString()
  }).eq('id', requestId);

  if (error) throw error;
}

// ── PERFIS ────────────────────────────────────────────────
export async function fetchAllProfiles() {
  const { data, error } = await supabase.from('profiles').select('*').order('id', { ascending: true });
  if (error) throw error;
  return data;
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
    return handleAdmin2Mutation('update_profile', id, patch);
  }
  const { error } = await supabase.from('profiles').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteProfile(id) {
  if (await isCurrentUserAdmin2()) {
    return handleAdmin2Mutation('delete_profile', id, {});
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
    return handleAdmin2Mutation('create_meeting', null, meeting);
  }
  const { data, error } = await supabase.from('meetings').insert(meeting).select('*');
  if (error) throw error;
  return data?.[0] || data;
}

export async function deleteMeeting(id) {
  if (await isCurrentUserAdmin2()) {
    return handleAdmin2Mutation('delete_meeting', id, {});
  }
  const { error } = await supabase.from('meetings').delete().eq('id', id);
  if (error) throw error;
}

export async function updateMeeting(id, patch) {
  if (await isCurrentUserAdmin2()) {
    return handleAdmin2Mutation('update_meeting', id, patch);
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
    return handleAdmin2Mutation('create_message', null, { from_id: fromId, text });
  }
  const { error } = await supabase.from('messages').insert({ from_id: fromId, text });
  if (error) throw error;
}

export async function deleteMessage(id) {
  if (await isCurrentUserAdmin2()) {
    return handleAdmin2Mutation('delete_message', id, {});
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
    return handleAdmin2Mutation('update_owner_profile', null, patch);
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
    return handleAdmin2Mutation('update_settings', null, { app_domain: domain });
  }
  const { error } = await supabase.from('app_settings').update({ app_domain: domain }).eq('id', 1);
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
    return handleAdmin2Mutation('admin_reset_password', targetAuthId, { new_password: newPassword });
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
    return handleAdmin2Mutation('promote_coordinator', id, {});
  }
  await updateProfile(id, { role: 'coord' });
}

export async function demoteToUser(id) {
  if (await isCurrentUserAdmin2()) {
    return handleAdmin2Mutation('demote_user', id, {});
  }
  await updateProfile(id, { role: 'user' });
}

export async function promoteToAdmin2(id) {
  if (await isCurrentUserAdmin2()) {
    throw new Error('Operação não permitida para Admin 2.');
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
