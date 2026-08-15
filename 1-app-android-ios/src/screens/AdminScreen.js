import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Image, ActivityIndicator, StyleSheet, RefreshControl, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { COLORS, S, roleLabel, roleStyle } from '../theme';
import { supabase, MAX_PHOTO_BYTES } from '../lib/supabase';
import {
  fetchAllProfiles, updateProfile, deleteProfile, promoteToCoordinator, demoteToUser,
  fetchMeetings, createMeeting, deleteMeeting,
  fetchMessages, createMessage, deleteMessage,
  fetchOwnerProfile, updateOwnerProfile,
  fetchAppSettings, updateAppDomain,
  adminResetPassword, changeOwnPassword,
} from '../lib/api';

function initials(name) { return (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase(); }
function fmtDate(d) {
  if (!d) return '';
  try {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', weekday: 'short' });
  } catch (e) {
    return d;
  }
}

export default function AdminScreen({ profile, onBack, initialTab }) {
  const isAdmin = profile.role === 'admin';
  const [tab, setTab] = useState(initialTab || 'users');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [users, setUsers] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [messages, setMessages] = useState([]);
  const [owner, setOwner] = useState(null);
  const [settings, setSettings] = useState(null);

  const load = useCallback(async () => {
    const [u, m, msg, o, s] = await Promise.all([
      fetchAllProfiles(), fetchMeetings(), fetchMessages(), fetchOwnerProfile(), fetchAppSettings(),
    ]);
    setUsers(u); setMeetings(m); setMessages(msg); setOwner(o); setSettings(s);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false); }

  const tabs = [
    ['users', '👥 Cadastros'],
    ['messages', '📣 Mensagens'],
    ...(isAdmin ? [['owner', '👨‍⚕️ Dr. Candido'], ['stats', '📊 Stats'], ['settings', '⚙️ Conta']] : []),
  ];

  return (
    <View style={S.screen}>
      <View style={[S.rowBetween, { marginBottom: 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.teal }} />
          <Text style={{ fontWeight: '700', fontSize: 17, color: COLORS.ink1 }}>Painel {isAdmin ? 'Admin' : 'Coordenador'}</Text>
        </View>
        <Text style={[S.roleBadge, roleStyle(profile.role)]}>{roleLabel(profile.role)}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, flexGrow: 0 }}>
        {tabs.map(([key, label]) => (
          <TouchableOpacity key={key} onPress={() => setTab(key)} style={[styles.tabChip, tab === key && styles.tabChipOn]}>
            <Text style={[styles.tabChipText, tab === key && styles.tabChipTextOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity style={[S.btn, S.btnGhost, { marginTop: 8, marginBottom: 8 }]} onPress={onBack}>
        <Text style={S.btnTextGhost}>← Voltar ao aplicativo</Text>
      </TouchableOpacity>

      {loading && (
        <ActivityIndicator color={COLORS.teal} size="small" style={{ marginVertical: 8 }} />
      )}

      <ScrollView style={{ flex: 1 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.teal} />}>
        {tab === 'users' && <UsersTab users={users} isAdmin={isAdmin} reload={load} />}
        {tab === 'messages' && <MessagesTab messages={messages} profile={profile} reload={load} />}
        {tab === 'owner' && isAdmin && owner ? <OwnerTab owner={owner} reload={load} /> : null}
        {tab === 'stats' && isAdmin && <StatsTab users={users} meetings={meetings} messages={messages} />}
        {tab === 'settings' && isAdmin && settings ? <SettingsTab settings={settings} profile={profile} reload={load} /> : null}
        <View style={{ height: 10 }} />
      </ScrollView>
    </View>
  );
}

/* ====== CADASTROS ====== */
function UsersTab({ users, isAdmin, reload }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);

  const filtered = users.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    String(u.id).includes(search) ||
    (u.email || '').toLowerCase().includes(search.toLowerCase())
  );

  if (editing) return <EditUserForm user={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); setSelected(null); reload(); }} />;
  if (selected) {
    const sponsor = users.find((u) => u.id === selected.referrer_id);
    const coord = users.find((u) => u.id === selected.coord_id);
    const placementParent = users.find((u) => u.id === selected.parent_id);
    const childrenCount = users.filter((u) => u.referrer_id === selected.id).length;
    return (
      <UserDetail
        user={{ ...selected, children_count: childrenCount }} sponsor={sponsor} coord={coord} placementParent={placementParent} isAdmin={isAdmin}
        onBack={() => setSelected(null)}
        onEdit={() => setEditing(selected)}
        onChanged={() => { setSelected(null); reload(); }}
      />
    );
  }

  return (
    <View>
      <Text style={S.cardTitle}>Todos os cadastros ({users.length})</Text>
      <TextInput style={S.input} placeholder="Buscar nome, e-mail ou ID..." placeholderTextColor={COLORS.ink3} value={search} onChangeText={setSearch} />
      {filtered.map((p) => (
        <TouchableOpacity key={p.id} style={styles.dataRow} onPress={() => setSelected(p)}>
          <Avatar person={p} size={36} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontWeight: '700', color: COLORS.ink1, fontSize: 13 }} numberOfLines={1}>{p.name}</Text>
            <Text style={{ color: COLORS.ink2, fontSize: 11 }} numberOfLines={1}>{p.email}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Text style={S.idBadge}>#{p.id}</Text>
            <Text style={[S.roleBadge, roleStyle(p.role)]}>{roleLabel(p.role)}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function Avatar({ person, size = 36 }) {
  const st = { width: size, height: size, borderRadius: size / 2, backgroundColor: COLORS.violetDim, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' };
  return (
    <View style={st}>
      {person.photo_url ? <Image source={{ uri: person.photo_url }} style={{ width: '100%', height: '100%' }} /> : <Text style={{ color: COLORS.violet, fontWeight: '700', fontSize: size * 0.34 }}>{initials(person.name)}</Text>}
    </View>
  );
}

function UserDetail({ user, sponsor, coord, placementParent, isAdmin, onBack, onEdit, onChanged }) {
  const rows = [
    ['E-mail', user.email], ['Telefone', user.phone || '-'], ['Nascimento', user.birth || '-'],
    ['Instagram', user.instagram || '-'], ['Facebook', user.facebook || '-'], ['TikTok', user.tiktok || '-'], ['WhatsApp', user.whatsapp || '-'],
    ['Coordenador', coord ? `${coord.name} (#${coord.id})` : '-'],
    ['Indicado por', sponsor ? `${sponsor.name} (#${sponsor.id})` : '-'],
    ['Posicionado abaixo de', placementParent ? `${placementParent.name} (#${placementParent.id})` : '-'],
  ];

  async function promote() {
    try { await promoteToCoordinator(user.id); onChanged(); } catch (e) { Alert.alert('Erro', e.message); }
  }
  async function demote() {
    try { await demoteToUser(user.id); onChanged(); } catch (e) { Alert.alert('Erro', e.message); }
  }
  function confirmDelete() {
    Alert.alert('Excluir cadastro', `Tem certeza que deseja excluir ${user.name}? Essa acao nao pode ser desfeita.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => { try { await deleteProfile(user.id); onChanged(); } catch (e) { Alert.alert('Erro', e.message); } } },
    ]);
  }

  return (
    <View style={S.card}>
      <View style={{ alignItems: 'center', marginBottom: 10 }}>
        <Avatar person={user} size={80} />
        <Text style={{ color: COLORS.ink1, fontSize: 17, fontWeight: '700', marginTop: 10 }}>{user.name}</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 5 }}>
          <Text style={S.idBadge}>#{user.id}</Text>
          <Text style={[S.roleBadge, roleStyle(user.role)]}>{roleLabel(user.role)}</Text>
        </View>
      </View>
      <View style={styles.sep} />
      {rows.map(([label, value]) => (
        <View key={label} style={[S.rowBetween, styles.detailRow]}>
          <Text style={{ fontSize: 11, color: COLORS.ink2 }}>{label}</Text>
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: COLORS.ink1 }}>{value}</Text>
        </View>
      ))}
      <View style={[S.rowBetween, styles.detailRow]}>
        <Text style={{ fontSize: 11, color: COLORS.ink2 }}>Indicados diretos</Text>
        <Text style={{ fontSize: 12.5, fontWeight: '700', color: COLORS.teal }}>{user.children_count}</Text>
      </View>

      {isAdmin && (
        <>
          <TouchableOpacity style={[S.btn, S.btnTeal, { marginTop: 12 }]} onPress={onEdit}>
            <Text style={S.btnTextDark}>Editar dados e senha</Text>
          </TouchableOpacity>
          {user.role !== 'admin' && (
            <>
              <View style={styles.sep} />
              {user.role === 'user' ? (
                <TouchableOpacity style={[S.btn, S.btnViolet]} onPress={promote}><Text style={S.btnTextLight}>Promover a Coordenador</Text></TouchableOpacity>
              ) : (
                <TouchableOpacity style={[S.btn, S.btnGhost]} onPress={demote}><Text style={S.btnTextGhost}>Rebaixar a Membro</Text></TouchableOpacity>
              )}
            </>
          )}
        </>
      )}
      <TouchableOpacity style={[S.btn, S.btnGhost]} onPress={onBack}><Text style={S.btnTextGhost}>Voltar</Text></TouchableOpacity>
    </View>
  );
}

function EditUserForm({ user, onCancel, onSaved }) {
  const [name, setName] = useState(user.name || '');
  const [email, setEmail] = useState(user.email || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [birth, setBirth] = useState(user.birth || '');
  const [instagram, setInstagram] = useState(user.instagram || '');
  const [facebook, setFacebook] = useState(user.facebook || '');
  const [tiktok, setTiktok] = useState(user.tiktok || '');
  const [whatsapp, setWhatsapp] = useState(user.whatsapp || '');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const birthVal = birth && birth.trim() ? birth.trim() : null;
      await updateProfile(user.id, { name, email, phone, birth: birthVal, instagram, facebook, tiktok, whatsapp });
      if (newPassword.trim()) {
        if (newPassword.length < 6) { Alert.alert('Senha muito curta', 'Use ao menos 6 caracteres.'); setSaving(false); return; }
        if (user.role === 'admin') {
          await changeOwnPassword(newPassword);
        } else {
          await adminResetPassword(user.auth_id, newPassword);
        }
      }
      Alert.alert('Pronto', 'Cadastro atualizado.');
      onSaved();
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={S.card}>
      <Text style={{ color: COLORS.ink1, fontWeight: '700', fontSize: 15, marginBottom: 12 }}>Editar cadastro #{user.id}</Text>
      <Text style={S.label}>Nome</Text><TextInput style={S.input} value={name} onChangeText={setName} />
      <Text style={S.label}>E-mail</Text><TextInput style={S.input} value={email} onChangeText={setEmail} autoCapitalize="none" />
      <Text style={S.label}>Telefone</Text><TextInput style={S.input} value={phone} onChangeText={setPhone} />
      <Text style={S.label}>Nascimento (AAAA-MM-DD)</Text><TextInput style={S.input} value={birth} onChangeText={setBirth} placeholder="1998-04-12" placeholderTextColor={COLORS.ink3} />
      <Text style={S.label}>Instagram</Text><TextInput style={S.input} value={instagram} onChangeText={setInstagram} />
      <Text style={S.label}>Facebook</Text><TextInput style={S.input} value={facebook} onChangeText={setFacebook} />
      <Text style={S.label}>TikTok</Text><TextInput style={S.input} value={tiktok} onChangeText={setTiktok} />
      <Text style={S.label}>WhatsApp</Text><TextInput style={S.input} value={whatsapp} onChangeText={setWhatsapp} />

      <View style={styles.sep} />
      <Text style={S.label}>Nova senha (deixe em branco para nao alterar)</Text>
      <TextInput style={S.input} value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholder="Nova senha" placeholderTextColor={COLORS.ink3} />
      <TouchableOpacity style={[S.btn, S.btnTeal]} onPress={save} disabled={saving}>
        <Text style={S.btnTextDark}>{saving ? 'Salvando...' : 'Salvar alteracoes'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[S.btn, S.btnGhost]} onPress={onCancel}><Text style={S.btnTextGhost}>Cancelar</Text></TouchableOpacity>
    </View>
  );
}

/* ====== REUNIOES ====== */
function mapsUrl(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}



/* ====== MENSAGENS ====== */
function MessagesTab({ messages, profile, reload }) {
  const [text, setText] = useState('');

  async function send() {
    const t = text.trim();
    if (!t) { Alert.alert('Digite a mensagem'); return; }
    if (t.length > 5000) { Alert.alert('Maximo 5000 caracteres'); return; }
    try {
      await createMessage(profile.id, t);
      await Notifications.scheduleNotificationAsync({ content: { title: 'Nova mensagem da coordenacao!', body: t.slice(0, 100) }, trigger: null });
      setText('');
      reload();
    } catch (e) { Alert.alert('Erro', e.message); }
  }
  function remove(id) {
    Alert.alert('Excluir mensagem', 'Tem certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => { try { await deleteMessage(id); reload(); } catch (e) { Alert.alert('Erro', e.message); } } },
    ]);
  }

  return (
    <View>
      <Text style={S.cardTitle}>Nova mensagem para toda a rede (max. 5000 caracteres)</Text>
      <TextInput style={[S.input, { minHeight: 110, textAlignVertical: 'top' }]} value={text} onChangeText={setText} multiline maxLength={5000} placeholder="Digite aqui sua mensagem..." placeholderTextColor={COLORS.ink3} />
      <Text style={[S.muted, { textAlign: 'right', marginTop: -6, marginBottom: 10 }]}>{text.length} / 5000 caracteres</Text>
      <TouchableOpacity style={[S.btn, S.btnViolet]} onPress={send}><Text style={S.btnTextLight}>Enviar para toda a rede</Text></TouchableOpacity>
      <View style={styles.sep} />
      <Text style={S.cardTitle}>Historico ({messages.length})</Text>
      {messages.length === 0 && <Text style={[S.muted, { textAlign: 'center', padding: 20 }]}>Nenhuma mensagem enviada.</Text>}
      {messages.map((m) => (
        <View key={m.id} style={styles.msgBubble}>
          <Text style={{ color: COLORS.ink1, fontSize: 12.5, lineHeight: 19 }}>{m.text}</Text>
          <View style={[S.rowBetween, { marginTop: 6 }]}>
            <Text style={{ fontSize: 10.5, color: COLORS.ink3 }}>{m.profiles?.name || 'Coordenacao'} - {fmtDate(m.created_at ? m.created_at.slice(0, 10) : null)}</Text>
            <TouchableOpacity onPress={() => remove(m.id)}><Text style={{ fontSize: 10.5, color: COLORS.warn }}>Excluir</Text></TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}

/* ====== DR. CANDIDO ====== */
function OwnerTab({ owner, reload }) {
  const [name, setName] = useState(owner?.name || '');
  const [bio, setBio] = useState(owner?.bio || '');
  const [instagram, setInstagram] = useState(owner?.instagram || '');
  const [facebook, setFacebook] = useState(owner?.facebook || '');
  const [tiktok, setTiktok] = useState(owner?.tiktok || '');
  const [whatsapp, setWhatsapp] = useState(owner?.whatsapp || '');
  const [youtube, setYoutube] = useState(owner?.youtube || '');
  const [photoUrl, setPhotoUrl] = useState(owner?.photo_url || null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permissao necessaria', 'Autorize o acesso a galeria.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > MAX_PHOTO_BYTES) {
      Alert.alert('Imagem muito grande', `Essa foto tem ${(asset.fileSize / 1024).toFixed(0)} KB. O limite e 200 KB.`);
      return;
    }
    setUploading(true);
    try {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      if (blob.size > MAX_PHOTO_BYTES) {
        Alert.alert('Imagem muito grande', `Essa foto tem ${(blob.size / 1024).toFixed(0)} KB. O limite e 200 KB.`);
        setUploading(false);
        return;
      }
      const ext = asset.uri.split('.').pop().toLowerCase();
      const path = `owner/photo.${ext}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
      if (uploadError) {
        const isSizeErr = uploadError.message.toLowerCase().includes('exceed');
        Alert.alert(isSizeErr ? 'Imagem muito grande' : 'Erro ao enviar foto', isSizeErr ? 'O servidor recusou o arquivo: limite de 200 KB.' : uploadError.message);
        setUploading(false);
        return;
      }
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      setPhotoUrl(pub.publicUrl + `?t=${Date.now()}`);
    } catch (e) {
      Alert.alert('Erro inesperado', String(e.message || e));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await updateOwnerProfile({ name, photo_url: photoUrl, bio, instagram, facebook, tiktok, whatsapp, youtube });
      Alert.alert('Pronto', 'Perfil de Dr. Candido salvo.');
      reload();
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View>
      <Text style={S.cardTitle}>Estatísticas de Tráfego</Text>
      <View style={[styles.statGrid, { marginBottom: 16 }]}>
        <View style={styles.statBox}>
          <Text style={S.cardTitle}>Visitas ao Perfil</Text>
          <Text style={[styles.statNum, { color: COLORS.teal }]}>{owner?.profile_redirects ?? 0}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={S.cardTitle}>Cliques Instagram</Text>
          <Text style={[styles.statNum, { color: COLORS.violet }]}>{owner?.instagram_redirects ?? 0}</Text>
        </View>
      </View>

      <Text style={S.cardTitle}>Perfil de Dr. Candido (visivel para todos)</Text>
      <View style={{ alignItems: 'center', marginBottom: 12 }}>
        <TouchableOpacity onPress={pickPhoto} style={styles.ownerPhotoRing} disabled={uploading}>
          {uploading ? <ActivityIndicator color={COLORS.teal} /> : photoUrl ? <Image source={{ uri: photoUrl }} style={{ width: '100%', height: '100%' }} /> : <Text style={{ fontSize: 30 }}>👩‍💼</Text>}
        </TouchableOpacity>
        <Text style={[S.muted, { marginTop: 6 }]}>Toque para trocar a foto (galeria, max. 200 KB)</Text>
      </View>
      <Text style={S.label}>Nome</Text><TextInput style={S.input} value={name} onChangeText={setName} />
      <Text style={S.label}>Bio / Descricao</Text>
      <TextInput style={[S.input, { minHeight: 90, textAlignVertical: 'top' }]} value={bio} onChangeText={setBio} multiline maxLength={1000} />
      <Text style={S.label}>Instagram</Text><TextInput style={S.input} value={instagram} onChangeText={setInstagram} placeholder="@usuario" placeholderTextColor={COLORS.ink3} />
      <Text style={S.label}>Facebook</Text><TextInput style={S.input} value={facebook} onChangeText={setFacebook} />
      <Text style={S.label}>TikTok</Text><TextInput style={S.input} value={tiktok} onChangeText={setTiktok} placeholder="@usuario" placeholderTextColor={COLORS.ink3} />
      <Text style={S.label}>WhatsApp</Text><TextInput style={S.input} value={whatsapp} onChangeText={setWhatsapp} placeholder="5561999999999" placeholderTextColor={COLORS.ink3} />
      <Text style={S.label}>YouTube (URL)</Text><TextInput style={S.input} value={youtube} onChangeText={setYoutube} placeholder="https://youtube.com/..." placeholderTextColor={COLORS.ink3} />
      <TouchableOpacity style={[S.btn, S.btnTeal]} onPress={save} disabled={saving}>
        <Text style={S.btnTextDark}>{saving ? 'Salvando...' : 'Salvar perfil de Dr. Candido'}</Text>
      </TouchableOpacity>
    </View>
  );
}

/* ====== ESTATISTICAS ====== */
function StatsTab({ users, meetings, messages }) {
  const coords = users.filter((u) => u.role === 'coord').length;
  const members = users.filter((u) => u.role === 'user').length;
  const stats = [
    ['Total cadastros', users.length, COLORS.teal],
    ['Coordenadores', coords, COLORS.violet],
    ['Membros', members, COLORS.ink1],
    ['Reunioes', meetings.length, COLORS.gold],
  ];
  return (
    <View>
      <View style={styles.statGrid}>
        {stats.map(([label, num, color]) => (
          <View key={label} style={styles.statBox}>
            <Text style={S.cardTitle}>{label}</Text>
            <Text style={[styles.statNum, { color }]}>{num}</Text>
          </View>
        ))}
      </View>
      <Text style={S.cardTitle}>Mensagens enviadas</Text>
      <View style={styles.statBox}><Text style={[styles.statNum, { color: COLORS.ink1 }]}>{messages.length}</Text></View>
    </View>
  );
}

/* ====== CONFIGURACOES ====== */
function SettingsTab({ settings, profile, reload }) {
  const [domain, setDomain] = useState(settings?.app_domain || 'orbita.app');
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [newPassword, setNewPassword] = useState('');

  async function saveDomain() {
    const clean = domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!clean) { Alert.alert('Digite um dominio valido'); return; }
    try { await updateAppDomain(clean); Alert.alert('Pronto', 'Dominio atualizado.'); reload(); } catch (e) { Alert.alert('Erro', e.message); }
  }
  async function saveAccount() {
    try { await updateProfile(profile.id, { name, email }); Alert.alert('Pronto', 'Dados da conta atualizados.'); reload(); } catch (e) { Alert.alert('Erro', e.message); }
  }
  async function savePassword() {
    if (newPassword.length < 6) { Alert.alert('Senha muito curta', 'Use ao menos 6 caracteres.'); return; }
    try { await changeOwnPassword(newPassword); setNewPassword(''); Alert.alert('Pronto', 'Senha alterada.'); } catch (e) { Alert.alert('Erro', e.message); }
  }

  return (
    <View>
      <Text style={S.cardTitle}>Dominio do app (link de indicacao)</Text>
      <View style={S.card}>
        <Text style={S.label}>Dominio</Text>
        <TextInput style={S.input} value={domain} onChangeText={setDomain} placeholder="orbita.app" placeholderTextColor={COLORS.ink3} autoCapitalize="none" />
        <Text style={[S.muted, { marginBottom: 10 }]}>Enquanto voce nao tiver um dominio proprio publicado, os membros devem usar o codigo numerico de indicacao (funciona sempre).</Text>
        <TouchableOpacity style={[S.btn, S.btnTeal]} onPress={saveDomain}><Text style={S.btnTextDark}>Salvar dominio</Text></TouchableOpacity>
      </View>

      <Text style={S.cardTitle}>Dados da conta</Text>
      <View style={S.card}>
        <Text style={S.label}>Nome</Text><TextInput style={S.input} value={name} onChangeText={setName} />
        <Text style={S.label}>E-mail</Text><TextInput style={S.input} value={email} onChangeText={setEmail} autoCapitalize="none" />
        <TouchableOpacity style={[S.btn, S.btnTeal]} onPress={saveAccount}><Text style={S.btnTextDark}>Salvar dados</Text></TouchableOpacity>
      </View>

      <Text style={S.cardTitle}>Alterar senha</Text>
      <View style={S.card}>
        <Text style={S.label}>Nova senha</Text>
        <TextInput style={S.input} value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholder="Minimo 6 caracteres" placeholderTextColor={COLORS.ink3} />
        <TouchableOpacity style={[S.btn, S.btnViolet]} onPress={savePassword}><Text style={S.btnTextLight}>Alterar senha</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  coordBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.panel2, borderWidth: 1, borderColor: COLORS.teal, borderRadius: 12, padding: 11, marginBottom: 8 },
  tabChip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: COLORS.line, marginRight: 6 },
  tabChipOn: { backgroundColor: COLORS.violet, borderColor: COLORS.violet },
  tabChipText: { color: COLORS.ink2, fontSize: 12, fontWeight: '600' },
  tabChipTextOn: { color: '#fff' },
  dataRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: COLORS.panel, borderRadius: 12, marginBottom: 8 },
  sep: { height: 1, backgroundColor: COLORS.line, marginVertical: 14 },
  detailRow: { paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  meetCard: { borderLeftWidth: 3, borderLeftColor: COLORS.violet },
  msgBubble: { backgroundColor: COLORS.panel, borderWidth: 1, borderColor: COLORS.line, borderLeftWidth: 3, borderLeftColor: COLORS.violet, borderRadius: 12, padding: 12, marginBottom: 10 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  statBox: { backgroundColor: COLORS.panel, borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, padding: 14, width: '47%' },
  statNum: { fontSize: 26, fontWeight: '700' },
  ownerPhotoRing: { width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: COLORS.teal, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: COLORS.panel2 },
});
