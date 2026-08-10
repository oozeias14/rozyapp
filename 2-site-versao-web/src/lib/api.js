import { supabase } from './supabase';

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
  const { data, error } = await supabase.from('profiles').select('id, name, email, instagram, photo_url, referrer_id, parent_id, role').eq('referrer_id', referrerId).order('id');
  if (error) throw error;
  return data;
}
export async function fetchMatrixChildren(parentId) {
  const { data, error } = await supabase.from('profiles').select('id, name, email, instagram, photo_url, referrer_id, parent_id, role').eq('parent_id', parentId).order('id');
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
  const { error } = await supabase.from('profiles').update(patch).eq('id', id);
  if (error) throw error;
}
export async function deleteProfile(id) {
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
  const { data, error } = await supabase.from('meetings').select('*, profiles(name)').order('date', { ascending: true });
  if (error) throw error;
  return data;
}
export async function createMeeting(meeting) {
  const { data, error } = await supabase.from('meetings').insert(meeting).select('*');
  if (error) throw error;
  return data?.[0] || data;
}
export async function deleteMeeting(id) {
  const { error } = await supabase.from('meetings').delete().eq('id', id);
  if (error) throw error;
}

// ── MENSAGENS ─────────────────────────────────────────────
export async function fetchMessages() {
  const { data, error } = await supabase
    .from('messages')
    .select('*, profiles!messages_from_id_fkey(name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
export async function createMessage(fromId, text) {
  const { error } = await supabase.from('messages').insert({ from_id: fromId, text });
  if (error) throw error;
}
export async function deleteMessage(id) {
  const { error } = await supabase.from('messages').delete().eq('id', id);
  if (error) throw error;
}

// ── DR. CANDIDO (owner_profile) ──────────────────────────
export async function fetchOwnerProfile() {
  const { data, error } = await supabase.from('owner_profile').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data;
}
export async function updateOwnerProfile(patch) {
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
  const { error } = await supabase.from('app_settings').update({ app_domain: domain }).eq('id', 1);
  if (error) throw error;
}

// ── SENHA / CONTA (via Supabase Auth) ────────────────────
export async function changeOwnPassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// Admin resetando a senha de QUALQUER outro cadastro.
// Isso NÃO pode ser feito direto do celular com a chave anon (por segurança) —
// por isso chama a Edge Function 'admin-reset-password', que roda no servidor
// do Supabase com a service_role key e confere se quem está pedindo é admin.
// Veja: supabase/functions/admin-reset-password/index.ts
export async function adminResetPassword(targetAuthId, newPassword) {
  const { data, error } = await supabase.functions.invoke('admin-reset-password', {
    body: { targetAuthId, newPassword },
  });
  if (error) throw error;
  if (data && data.error) throw new Error(data.error);
  return data;
}

// ── AÇÕES DE ADMIN SOBRE CADASTROS ───────────────────────
export async function promoteToCoordinator(id) {
  await updateProfile(id, { role: 'coord' });
}
export async function demoteToUser(id) {
  await updateProfile(id, { role: 'user' });
}

export async function updateMeeting(id, patch) {
  const { error } = await supabase.from('meetings').update(patch).eq('id', id);
  if (error) throw error;
}

export async function incrementInstagramRedirects() {
  const { error } = await supabase.rpc('increment_instagram_redirects');
  if (error) throw error;
}

export async function incrementProfileRedirects() {
  const { error } = await supabase.rpc('increment_profile_redirects');
  if (error) throw error;
}

export async function createLiveComment(meetingId, profileId, text) {
  const { data, error } = await supabase.from('live_comments').insert({ meeting_id: meetingId, profile_id: profileId, text }).select('*');
  if (error) throw error;
  return data?.[0] || null;
}

export async function fetchLiveComments(meetingId) {
  const { data, error } = await supabase
    .from('live_comments')
    .select('*, profiles(name)')
    .eq('meeting_id', meetingId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

