import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase, MAX_PHOTO_BYTES, compressImageWeb } from '../lib/supabase';
import {
  fetchAllProfiles, updateProfile, deleteProfile, promoteToCoordinator, demoteToUser,
  fetchMeetings, createMeeting, deleteMeeting,
  fetchMessages, createMessage, deleteMessage,
  fetchOwnerProfile, updateOwnerProfile,
  fetchAppSettings, updateAppDomain,
  adminResetPassword, changeOwnPassword,
} from '../lib/api';

function initials(name) { return (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase(); }
function roleLabel(role) { return role === 'admin' ? 'Admin' : role === 'coord' ? 'Coord' : 'Membro'; }
function roleClass(role) { return role === 'admin' ? 'role-admin' : role === 'coord' ? 'role-coord' : 'role-user'; }
function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', weekday: 'short' }); }
  catch { return d; }
}
function notifyBrowser(title, body) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'granted') new Notification(title, { body });
}

export default function AdminScreen({ profile, onBack, initialTab }) {
  const isAdmin = profile.role === 'admin';
  const [tab, setTab] = useState(initialTab || 'users');
  const [loading, setLoading] = useState(true);
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

  const tabs = [
    ['users', '👥 Cadastros'], ['meetings', '📅 Reuniões'], ['messages', '📣 Mensagens'],
    ...(isAdmin ? [['owner', '👨‍⚕️ Dr. Candido'], ['stats', '📊 Stats'], ['settings', '⚙️ Conta']] : []),
  ];

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="row-bw" style={{ marginBottom: 12 }}>
        <div className="brand"><div className="dot" /><span>Painel {isAdmin ? 'Admin' : 'Coordenador'}</span></div>
        <span className={`role-badge ${roleClass(profile.role)}`}>{roleLabel(profile.role)}</span>
      </div>

      <div className="adm-tabs">
        {tabs.map(([key, label]) => (
          <button key={key} className={`adm-tab${tab === key ? ' on' : ''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      <div style={{ flex: 1 }}>
        {loading && <div style={{ fontSize: 12, color: 'var(--teal)', textAlign: 'center', margin: '8px 0' }}>⏳ Carregando dados...</div>}
        {tab === 'users' && <UsersTab users={users} isAdmin={isAdmin} reload={load} />}
        {tab === 'meetings' && <MeetingsTab meetings={meetings} reload={load} />}
        {tab === 'messages' && <MessagesTab messages={messages} profile={profile} reload={load} />}
        {tab === 'owner' && isAdmin && owner && <OwnerTab owner={owner} reload={load} />}
        {tab === 'stats' && isAdmin && <StatsTab users={users} meetings={meetings} messages={messages} />}
        {tab === 'settings' && isAdmin && settings && <SettingsTab settings={settings} profile={profile} reload={load} />}
      </div>

      <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={onBack}>← Voltar ao aplicativo</button>
    </div>
  );
}

function Avatar({ person, size = 36 }) {
  return (
    <div className="av" style={{ width: size, height: size, fontSize: size * 0.34 }}>
      {person.photo_url ? <img src={person.photo_url} alt="" /> : initials(person.name)}
    </div>
  );
}

/* ===== CADASTROS ===== */
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
      <UserDetail user={{ ...selected, children_count: childrenCount }} sponsor={sponsor} coord={coord} placementParent={placementParent} isAdmin={isAdmin}
        onBack={() => setSelected(null)} onEdit={() => setEditing(selected)} onChanged={() => { setSelected(null); reload(); }} />
    );
  }

  return (
    <div>
      <div className="card-title">Todos os cadastros ({users.length})</div>
      <input placeholder="Buscar nome, e-mail ou ID..." value={search} onChange={(e) => setSearch(e.target.value)} />
      {filtered.map((p) => (
        <div key={p.id} className="data-row" onClick={() => setSelected(p)}>
          <Avatar person={p} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
            <div className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <span className="id-badge">#{p.id}</span>
            <span className={`role-badge ${roleClass(p.role)}`}>{roleLabel(p.role)}</span>
          </div>
        </div>
      ))}
    </div>
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

  async function promote() { try { await promoteToCoordinator(user.id); onChanged(); } catch (e) { alert('Erro: ' + e.message); } }
  async function demote() { try { await demoteToUser(user.id); onChanged(); } catch (e) { alert('Erro: ' + e.message); } }
  async function confirmDelete() {
    if (!confirm(`Tem certeza que deseja excluir ${user.name}? Essa ação não pode ser desfeita.`)) return;
    try { await deleteProfile(user.id); onChanged(); } catch (e) { alert('Erro: ' + e.message); }
  }

  return (
    <div className="card">
      <div style={{ textAlign: 'center', marginBottom: 10 }}>
        <Avatar person={user} size={80} />
        <h2 style={{ fontSize: 17, marginTop: 10 }}>{user.name}</h2>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 5 }}>
          <span className="id-badge">#{user.id}</span>
          <span className={`role-badge ${roleClass(user.role)}`}>{roleLabel(user.role)}</span>
        </div>
      </div>
      <div className="sep" />
      {rows.map(([label, value]) => (
        <div key={label} className="row-bw" style={{ padding: '5px 0', borderBottom: '1px solid var(--line)' }}>
          <span style={{ fontSize: 11, color: 'var(--ink2)' }}>{label}</span>
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>{value}</span>
        </div>
      ))}
      <div className="row-bw" style={{ padding: '5px 0' }}>
        <span style={{ fontSize: 11, color: 'var(--ink2)' }}>Indicados diretos</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--teal)' }}>{user.children_count}</span>
      </div>

      {isAdmin && (
        <>
          <button className="btn btn-teal" style={{ marginTop: 12 }} onClick={onEdit}>Editar dados e senha</button>
          {user.role !== 'admin' && (
            <>
              <div className="sep" />
              {user.role === 'user'
                ? <button className="btn btn-violet" onClick={promote}>Promover a Coordenador</button>
                : <button className="btn btn-ghost" onClick={demote}>Rebaixar a Membro</button>}
              <button className="btn btn-warn" onClick={confirmDelete}>Excluir cadastro</button>
            </>
          )}
        </>
      )}
      <button className="btn btn-ghost" onClick={onBack}>Voltar</button>
    </div>
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
      await updateProfile(user.id, { name, email, phone, birth, instagram, facebook, tiktok, whatsapp });
      if (newPassword.trim()) {
        if (newPassword.length < 6) { alert('Senha muito curta (mínimo 6 caracteres)'); setSaving(false); return; }
        if (user.role === 'admin') await changeOwnPassword(newPassword);
        else await adminResetPassword(user.auth_id, newPassword);
      }
      alert('Cadastro atualizado.');
      onSaved();
    } catch (e) { alert('Erro: ' + e.message); } finally { setSaving(false); }
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 15, marginBottom: 12 }}>Editar cadastro #{user.id}</h3>
      <label className="lbl">Nome</label><input value={name} onChange={(e) => setName(e.target.value)} />
      <label className="lbl">E-mail</label><input value={email} onChange={(e) => setEmail(e.target.value)} />
      <label className="lbl">Telefone</label><input value={phone} onChange={(e) => setPhone(e.target.value)} />
      <label className="lbl">Nascimento (AAAA-MM-DD)</label><input value={birth} onChange={(e) => setBirth(e.target.value)} placeholder="1998-04-12" />
      <label className="lbl">Instagram</label><input value={instagram} onChange={(e) => setInstagram(e.target.value)} />
      <label className="lbl">Facebook</label><input value={facebook} onChange={(e) => setFacebook(e.target.value)} />
      <label className="lbl">TikTok</label><input value={tiktok} onChange={(e) => setTiktok(e.target.value)} />
      <label className="lbl">WhatsApp</label><input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />

      <div className="sep" />
      <label className="lbl">Nova senha (deixe em branco para não alterar)</label>
      <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Nova senha" />
      <button className="btn btn-teal" onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar alterações'}</button>
      <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
    </div>
  );
}

/* ===== REUNIÕES ===== */
function mapsUrl(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function MeetingsTab({ meetings, reload }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState(''); const [date, setDate] = useState(''); const [time, setTime] = useState(''); const [location, setLocation] = useState('');
  const [coords, setCoords] = useState(null);
  const [capturing, setCapturing] = useState(false);

  function captureLocation() {
    if (!navigator.geolocation) { alert('Seu navegador não suporta localização.'); return; }
    setCapturing(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setCapturing(false); alert('Localização capturada!'); },
      (err) => { setCapturing(false); alert('Erro: ' + err.message); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  async function save() {
    if (!title.trim() || !date.trim()) { alert('Preencha título e data'); return; }
    try {
      await createMeeting({ title, date, time: time || '-', location: location || 'A definir', lat: coords?.lat ?? null, lng: coords?.lng ?? null });
      notifyBrowser('Nova reunião!', title);
      setAdding(false); setTitle(''); setDate(''); setTime(''); setLocation(''); setCoords(null);
      reload();
    } catch (e) { alert('Erro: ' + e.message); }
  }
  async function remove(id) {
    if (!confirm('Excluir esta reunião?')) return;
    try { await deleteMeeting(id); reload(); } catch (e) { alert('Erro: ' + e.message); }
  }

  if (adding) {
    return (
      <div className="card">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Agendar reunião</h3>
        <label className="lbl">Título</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Reunião mensal" />
        <label className="lbl">Data</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <label className="lbl">Horário</label><input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        <label className="lbl">Local (endereço em texto)</label><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Endereço ou link" />

        <label className="lbl">Localização exata (opcional)</label>
        {coords ? (
          <div className="lbox" style={{ borderColor: 'var(--teal)' }}>
            <span style={{ color: 'var(--teal)' }}>📍 Capturada ✅</span>
            <a href={mapsUrl(coords.lat, coords.lng)} target="_blank" rel="noreferrer" style={{ color: 'var(--violet)', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>Ver no mapa</a>
            <button type="button" onClick={() => setCoords(null)} style={{ background: 'none', border: 'none', color: 'var(--warn)', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>Remover</button>
          </div>
        ) : (
          <button className="btn btn-ghost" onClick={captureLocation} disabled={capturing}>{capturing ? 'Obtendo localização...' : '📍 Usar minha localização atual'}</button>
        )}

        <button className="btn btn-violet" onClick={save}>Agendar e notificar rede</button>
        <button className="btn btn-ghost" onClick={() => setAdding(false)}>Cancelar</button>
      </div>
    );
  }

  return (
    <div>
      <div className="row-bw" style={{ marginBottom: 10 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>Reuniões ({meetings.length})</div>
        <button className="btn btn-violet btn-sm" onClick={() => setAdding(true)}>+ Agendar</button>
      </div>
      {meetings.length === 0 && <div className="empty">Nenhuma reunião agendada.</div>}
      {meetings.map((m) => (
        <div key={m.id} className="card meet-card">
          <div className="row-bw">
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{m.title}</div>
              <div className="muted">{m.location}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="meet-date">{fmtDate(m.date)}</div>
              <div className="muted">{m.time}</div>
            </div>
          </div>
          {m.lat != null && m.lng != null && (
            <a className="btn btn-teal" style={{ marginTop: 10, marginBottom: 0 }} href={mapsUrl(m.lat, m.lng)} target="_blank" rel="noreferrer">📍 Abrir no Google Maps</a>
          )}
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => notifyBrowser(m.title, `${fmtDate(m.date)} às ${m.time} - ${m.location}`)}>Notificar todos</button>
            <button className="btn btn-warn btn-sm" onClick={() => remove(m.id)}>Excluir</button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ===== MENSAGENS ===== */
function MessagesTab({ messages, profile, reload }) {
  const [text, setText] = useState('');
  async function send() {
    const t = text.trim();
    if (!t) { alert('Digite a mensagem'); return; }
    if (t.length > 5000) { alert('Máximo 5000 caracteres'); return; }
    try {
      await createMessage(profile.id, t);
      notifyBrowser('Nova mensagem da coordenação!', t.slice(0, 100));
      setText(''); reload();
    } catch (e) { alert('Erro: ' + e.message); }
  }
  async function remove(id) {
    if (!confirm('Excluir esta mensagem?')) return;
    try { await deleteMessage(id); reload(); } catch (e) { alert('Erro: ' + e.message); }
  }

  return (
    <div>
      <div className="card-title">Nova mensagem para toda a rede (máx. 5000 caracteres)</div>
      <textarea style={{ minHeight: 110 }} value={text} onChange={(e) => setText(e.target.value)} maxLength={5000} placeholder="Digite aqui sua mensagem..." />
      <div className="muted" style={{ textAlign: 'right', marginTop: -6, marginBottom: 10 }}>{text.length} / 5000 caracteres</div>
      <button className="btn btn-violet" onClick={send}>Enviar para toda a rede</button>
      <div className="sep" />
      <div className="card-title">Histórico ({messages.length})</div>
      {messages.length === 0 && <div className="empty">Nenhuma mensagem enviada.</div>}
      {messages.map((m) => (
        <div key={m.id} className="msg-bubble">
          <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>{m.text}</div>
          <div className="row-bw" style={{ marginTop: 6 }}>
            <span style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{m.profiles?.name || 'Coordenação'} · {fmtDate(m.created_at ? m.created_at.slice(0, 10) : null)}</span>
            <span style={{ fontSize: 10.5, color: 'var(--warn)', cursor: 'pointer' }} onClick={() => remove(m.id)}>Excluir</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ===== DR. CANDIDO ===== */
function OwnerTab({ owner, reload }) {
  const [name, setName] = useState(owner?.name || '');
  const [bio, setBio] = useState(owner?.bio || '');
  const [instagram, setInstagram] = useState(owner?.instagram || '');
  const [facebook, setFacebook] = useState(owner?.facebook || '');
  const [tiktok, setTiktok] = useState(owner?.tiktok || '');
  const [whatsapp, setWhatsapp] = useState(owner?.whatsapp || '');
  const [youtube, setYoutube] = useState(owner?.youtube || '');
  const [photoUrl, setPhotoUrl] = useState(owner?.photo_url || null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const compressed = await compressImageWeb(file);
      const ext = compressed.name.split('.').pop().toLowerCase();
      const path = `owner/photo.${ext}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, compressed, { upsert: true, contentType: compressed.type || 'image/jpeg' });
      if (uploadError) { alert(uploadError.message.toLowerCase().includes('exceed') ? 'Servidor recusou: limite de 200 KB.' : 'Erro: ' + uploadError.message); return; }
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      setPhotoUrl(pub.publicUrl + `?t=${Date.now()}`);
    } catch (err) { alert('Erro inesperado: ' + err.message); }
  }

  async function save() {
    setSaving(true);
    try {
      await updateOwnerProfile({ name, photo_url: photoUrl, bio, instagram, facebook, tiktok, whatsapp, youtube });
      alert('Perfil de Dr. Candido salvo.');
      reload();
    } catch (e) { alert('Erro: ' + e.message); } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="card-title">Estatísticas de Tráfego</div>
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-box">
          <div className="card-title">Visitas ao Perfil</div>
          <div className="stat-num" style={{ color: 'var(--teal)' }}>{owner?.profile_redirects ?? 0}</div>
        </div>
        <div className="stat-box">
          <div className="card-title">Cliques Instagram</div>
          <div className="stat-num" style={{ color: 'var(--violet)' }}>{owner?.instagram_redirects ?? 0}</div>
        </div>
      </div>

      <div className="card-title">Perfil de Dr. Candido (visível para todos)</div>
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div className="photo-ring" style={{ width: 100, height: 100 }} onClick={() => fileRef.current?.click()}>
          {photoUrl ? <img src={photoUrl} alt="" /> : '👩‍💼'}
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
        <div className="muted" style={{ marginTop: 6 }}>Toque para trocar a foto (máx. 200 KB)</div>
      </div>
      <label className="lbl">Nome</label><input value={name} onChange={(e) => setName(e.target.value)} />
      <label className="lbl">Bio / Descrição</label>
      <textarea style={{ minHeight: 90 }} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={1000} />
      <label className="lbl">Instagram</label><input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@usuario" />
      <label className="lbl">Facebook</label><input value={facebook} onChange={(e) => setFacebook(e.target.value)} />
      <label className="lbl">TikTok</label><input value={tiktok} onChange={(e) => setTiktok(e.target.value)} placeholder="@usuario" />
      <label className="lbl">WhatsApp</label><input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="5561999999999" />
      <label className="lbl">YouTube (URL)</label><input value={youtube} onChange={(e) => setYoutube(e.target.value)} placeholder="https://youtube.com/..." />
      <button className="btn btn-teal" onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar perfil de Dr. Candido'}</button>
    </div>
  );
}

/* ===== ESTATISTICAS ===== */
function StatsTab({ users, meetings, messages }) {
  const coords = users.filter((u) => u.role === 'coord').length;
  const members = users.filter((u) => u.role === 'user').length;
  const stats = [['Total cadastros', users.length, 'var(--teal)'], ['Coordenadores', coords, 'var(--violet)'], ['Membros', members, 'var(--ink1)'], ['Reuniões', meetings.length, 'var(--gold)']];
  return (
    <div>
      <div className="stat-grid">
        {stats.map(([label, num, color]) => (
          <div key={label} className="stat-box">
            <div className="card-title">{label}</div>
            <div className="stat-num" style={{ color }}>{num}</div>
          </div>
        ))}
      </div>
      <div className="card-title">Mensagens enviadas</div>
      <div className="stat-box"><div className="stat-num">{messages.length}</div></div>
    </div>
  );
}

/* ===== CONFIGURACOES ===== */
function SettingsTab({ settings, profile, reload }) {
  const [domain, setDomain] = useState(settings?.app_domain || 'orbita.app');
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [newPassword, setNewPassword] = useState('');

  async function saveDomain() {
    const clean = domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!clean) { alert('Digite um domínio válido'); return; }
    try { await updateAppDomain(clean); alert('Domínio atualizado.'); reload(); } catch (e) { alert('Erro: ' + e.message); }
  }
  async function saveAccount() {
    try { await updateProfile(profile.id, { name, email }); alert('Dados atualizados.'); reload(); } catch (e) { alert('Erro: ' + e.message); }
  }
  async function savePassword() {
    if (newPassword.length < 6) { alert('Use ao menos 6 caracteres.'); return; }
    try { await changeOwnPassword(newPassword); setNewPassword(''); alert('Senha alterada.'); } catch (e) { alert('Erro: ' + e.message); }
  }

  return (
    <div>
      <div className="card-title">Domínio do app (link de indicação)</div>
      <div className="card">
        <label className="lbl">Domínio</label>
        <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="orbita.app" />
        <div className="muted" style={{ marginBottom: 10 }}>Enquanto você não tiver um domínio próprio publicado, os membros devem usar o código numérico de indicação.</div>
        <button className="btn btn-teal" onClick={saveDomain}>Salvar domínio</button>
      </div>

      <div className="card-title">Dados da conta</div>
      <div className="card">
        <label className="lbl">Nome</label><input value={name} onChange={(e) => setName(e.target.value)} />
        <label className="lbl">E-mail</label><input value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn btn-teal" onClick={saveAccount}>Salvar dados</button>
      </div>

      <div className="card-title">Alterar senha</div>
      <div className="card">
        <label className="lbl">Nova senha</label>
        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
        <button className="btn btn-violet" onClick={savePassword}>Alterar senha</button>
      </div>
    </div>
  );
}
