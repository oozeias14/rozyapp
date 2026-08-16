import { useEffect, useState, useCallback, useRef } from 'react';
import PersonModal from '../components/PersonModal';
import { supabase, MAX_PHOTO_BYTES, compressImageWeb } from '../lib/supabase';
import {
  fetchAllProfiles, updateProfile, deleteProfile, promoteToCoordinator, demoteToUser,
  fetchMeetings, createMeeting, deleteMeeting,
  fetchMessages, createMessage, deleteMessage,
  fetchOwnerProfile, updateOwnerProfile,
  fetchAppSettings, updateAppDomain,
  adminResetPassword, changeOwnPassword,
  fetchAdminRequests, approveAdminRequest, rejectAdminRequest, promoteToAdmin2
} from '../lib/api';

function initials(name) { return (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase(); }
function roleLabel(role) {
  if (role === 'admin') return 'Admin';
  if (role === 'admin2') return 'Admin 2';
  if (role === 'coord') return 'Coord';
  return 'Membro';
}
function roleClass(role) {
  if (role === 'admin') return 'role-admin';
  if (role === 'admin2') return 'role-admin2';
  if (role === 'coord') return 'role-coord';
  return 'role-user';
}
function fmtDate(d) {
  if (!d) return '';
  try {
    if (d.includes('T') || d.includes('Z')) {
      return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', weekday: 'short' });
    }
    return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', weekday: 'short' });
  } catch {
    return d;
  }
}
function notifyBrowser(title, body) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'granted') new Notification(title, { body });
}

export default function AdminScreen({ profile, onBack, initialTab }) {
  const isAdmin = profile.role === 'admin' || profile.role === 'admin2';
  const isTrueAdmin = profile.role === 'admin';
  const [tab, setTab] = useState(initialTab || 'users');
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [messages, setMessages] = useState([]);
  const [owner, setOwner] = useState(null);
  const [settings, setSettings] = useState(null);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [modalPerson, setModalPerson] = useState(null);
  const tabsRef = useRef(null);

  const load = useCallback(async () => {
    const [u, m, msg, o, s] = await Promise.all([
      fetchAllProfiles(), fetchMeetings(), fetchMessages(), fetchOwnerProfile(), fetchAppSettings(),
    ]);
    setUsers(u); setMeetings(m); setMessages(msg); setOwner(o); setSettings(s);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const tabs = [
    ['users', '👥 Cadastros'],
    ['ranking', '🏆 Ranking'],
    ['messages', '📣 Mensagens'],
    ...(isAdmin ? [['owner', '👨‍⚕️ Dr. Candido'], ['stats', '📊 Stats'], ['settings', '⚙️ Conta']] : []),
    ...(isTrueAdmin ? [['requests', '📥 Solicitações Admin']] : []),
  ];

  if (editing) {
    return (
      <div className="screen" style={{ display: 'flex', flexDirection: 'column' }}>
        <EditUserForm user={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); setSelected(null); load(); }} />
      </div>
    );
  }

  if (selected) {
    const sponsor = users.find((u) => u.id === selected.referrer_id);
    const coord = users.find((u) => u.id === selected.coord_id);
    const placementParent = users.find((u) => u.id === selected.parent_id);
    const childrenCount = users.filter((u) => u.referrer_id === selected.id).length;
    return (
      <div className="screen" style={{ display: 'flex', flexDirection: 'column' }}>
        <UserDetail user={{ ...selected, children_count: childrenCount }} sponsor={sponsor} coord={coord} placementParent={placementParent} isAdmin={isAdmin} isTrueAdmin={isTrueAdmin}
          onBack={() => setSelected(null)} onEdit={() => setEditing(selected)} onChanged={() => { setSelected(null); load(); }} />
      </div>
    );
  }

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="row-bw" style={{ marginBottom: 12 }}>
        <div className="brand"><div className="dot" /><span>Painel {profile.role === 'admin' ? 'Admin' : profile.role === 'admin2' ? 'Admin 2' : 'Coordenador'}</span></div>
        <span className={`role-badge ${roleClass(profile.role)}`}>{roleLabel(profile.role)}</span>
      </div>

      <div className="adm-tabs" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {tabs.map(([key, label]) => (
          <button key={key} className={`adm-tab${tab === key ? ' on' : ''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      <button className="btn btn-ghost" style={{ marginTop: 10, marginBottom: 10, width: '100%' }} onClick={onBack}>← Voltar ao aplicativo</button>

      <div style={{ flex: 1 }}>
        {loading && <div style={{ fontSize: 12, color: 'var(--teal)', textAlign: 'center', margin: '8px 0' }}>⏳ Carregando dados...</div>}
        {tab === 'users' && <UsersTab users={users} onSelect={(u) => setSelected(u)} />}
        {tab === 'ranking' && <RankingTab users={users} meetings={meetings} onSelect={(u) => setModalPerson(u)} />}
        {tab === 'messages' && <MessagesTab messages={messages} profile={profile} reload={load} />}
        {tab === 'owner' && isAdmin && owner && <OwnerTab owner={owner} reload={load} />}
        {tab === 'stats' && isAdmin && <StatsTab users={users} meetings={meetings} messages={messages} />}
        {tab === 'settings' && isAdmin && settings && <SettingsTab settings={settings} profile={profile} reload={load} />}
        {tab === 'requests' && isTrueAdmin && <RequestsTab reload={load} />}
      </div>

      {modalPerson && (
        <PersonModal 
          person={modalPerson} 
          sponsor={users.find((u) => u.id === modalPerson.referrer_id)} 
          onClose={() => setModalPerson(null)} 
        />
      )}
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
function UsersTab({ users, onSelect }) {
  const [search, setSearch] = useState('');

  const filtered = users.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    String(u.id).includes(search) ||
    (u.email || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="card-title">Todos os cadastros ({users.length})</div>
      <input placeholder="Buscar nome, e-mail ou ID..." value={search} onChange={(e) => setSearch(e.target.value)} />
      {filtered.map((p) => (
        <div key={p.id} className="data-row" onClick={() => onSelect(p)}>
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

/* ===== RANKING (TOP 100) ===== */
function RankingTab({ users, meetings, onSelect }) {
  // Helper para calcular tamanho da rede pela árvore de indicações (até a 20ª geração)
  function getReferralNetworkCount(userId) {
    let count = 0;
    let currentLevel = users.filter((u) => u.referrer_id === userId);
    let depth = 1;
    while (currentLevel.length > 0 && depth <= 20) {
      count += currentLevel.length;
      const nextLevelIds = currentLevel.map((u) => u.id);
      currentLevel = users.filter((u) => nextLevelIds.includes(u.referrer_id));
      depth++;
    }
    return count;
  }

  // Filtrar para excluir os administradores do ranking
  const nonAdminUsers = users.filter((u) => u.role !== 'admin');

  // Calcular indicações, volume da rede e reuniões de cada usuário
  const rankingData = nonAdminUsers.map((u) => {
    const referralNetworkCount = getReferralNetworkCount(u.id);
    const referralsCount = users.filter((ref) => ref.referrer_id === u.id).length;
    const eventsCount = meetings.filter((meet) => meet.created_by === u.id).length;
    return {
      profile: u,
      referralNetworkCount,
      referralsCount,
      eventsCount,
    };
  });

  // Ordenar por volume de rede de indicações (primário), indicações diretas (secundário) e eventos (terciário)
  rankingData.sort((a, b) => {
    if (b.referralNetworkCount !== a.referralNetworkCount) {
      return b.referralNetworkCount - a.referralNetworkCount;
    }
    if (b.referralsCount !== a.referralsCount) {
      return b.referralsCount - a.referralsCount;
    }
    return b.eventsCount - a.eventsCount;
  });

  const top100 = rankingData.slice(0, 100);

  function getRankBadgeStyle(rank) {
    if (rank === 1) {
      return {
        background: 'linear-gradient(135deg, #FFE259, #FFA751)',
        color: '#000',
        fontWeight: 'bold',
        textShadow: '0 1px 1px rgba(255,255,255,0.4)',
      };
    }
    if (rank === 2) {
      return {
        background: 'linear-gradient(135deg, #E2E8F0, #94A3B8)',
        color: '#000',
        fontWeight: 'bold',
      };
    }
    if (rank === 3) {
      return {
        background: 'linear-gradient(135deg, #F39C12, #D35400)',
        color: '#fff',
        fontWeight: 'bold',
      };
    }
    return {
      background: 'rgba(255, 255, 255, 0.08)',
      color: 'var(--ink2)',
    };
  }

  return (
    <div>
      <div className="card-title">Ranking Geral MMN (Top 100)</div>
      {top100.length === 0 && <div className="empty">Nenhum cadastro encontrado.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {top100.map((item, idx) => {
          const rank = idx + 1;
          const p = item.profile;
          const badgeStyle = getRankBadgeStyle(rank);
          
          const borderStyle =
            rank === 1 ? '1px solid #FFA751' :
            rank === 2 ? '1px solid #94A3B8' :
            rank === 3 ? '1px solid #D35400' :
            '1px solid rgba(255, 255, 255, 0.04)';

          const shadowStyle =
            rank === 1 ? '0 0 10px rgba(255, 167, 81, 0.12)' :
            rank === 2 ? '0 0 10px rgba(148, 163, 184, 0.08)' :
            rank === 3 ? '0 0 10px rgba(211, 84, 0, 0.08)' :
            'none';
          
          return (
            <div 
              key={p.id} 
              className="data-row" 
              onClick={() => onSelect(p)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                cursor: 'pointer',
                padding: '10px 14px',
                borderRadius: 12,
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                border: borderStyle,
                boxShadow: shadowStyle,
                transition: 'background 0.2s',
              }}
            >
              <div 
                style={{ 
                  width: 28, 
                  height: 28, 
                  borderRadius: '50%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontSize: 12,
                  ...badgeStyle
                }}
              >
                {rank}
              </div>
              <Avatar person={p} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  <span className={`role-badge ${roleClass(p.role)}`} style={{ fontSize: 9, padding: '1px 5px' }}>{roleLabel(p.role)}</span>
                </div>
                <div className="muted" style={{ fontSize: 11, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 8px', marginTop: 4 }}>
                  <span>🕸️ Rede: <strong style={{ color: 'var(--violet)', fontSize: 12 }}>{item.referralNetworkCount}</strong></span>
                  <span>·</span>
                  <span>🤝 Indicações: <strong style={{ color: 'var(--teal)' }}>{item.referralsCount}</strong></span>
                  <span>·</span>
                  <span>📅 Eventos: <strong style={{ color: 'var(--gold)' }}>{item.eventsCount}</strong></span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UserDetail({ user, sponsor, coord, placementParent, isAdmin, isTrueAdmin, onBack, onEdit, onChanged }) {
  const rows = [
    ['E-mail', user.email], ['Telefone', user.phone || '-'], ['Nascimento', user.birth || '-'],
    ['Instagram', user.instagram || '-'], ['Facebook', user.facebook || '-'], ['TikTok', user.tiktok || '-'], ['WhatsApp', user.whatsapp || '-'],
    ['Coordenador', coord ? `${coord.name} (#${coord.id})` : '-'],
    ['Indicado por', sponsor ? `${sponsor.name} (#${sponsor.id})` : '-'],
    ['Posicionado abaixo de', placementParent ? `${placementParent.name} (#${placementParent.id})` : '-'],
  ];

  async function promote() { try { await promoteToCoordinator(user.id); onChanged(); } catch (e) { alert('Erro: ' + e.message); } }
  async function demote() { try { await demoteToUser(user.id); onChanged(); } catch (e) { alert('Erro: ' + e.message); } }
  async function promoteToA2() {
    try {
      await promoteToAdmin2(user.id);
      onChanged();
    } catch (e) {
      alert('Erro: ' + e.message);
    }
  }
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
              {isTrueAdmin && user.role === 'user' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                  <button className="btn btn-violet" onClick={promote}>Promover a Coordenador</button>
                  <button className="btn btn-gold" onClick={promoteToA2}>Promover a Admin 2</button>
                </div>
              )}
              {isTrueAdmin && user.role === 'coord' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                  <button className="btn btn-ghost" onClick={demote}>Rebaixar a Membro</button>
                  <button className="btn btn-gold" onClick={promoteToA2}>Promover a Admin 2</button>
                </div>
              )}
              {isTrueAdmin && user.role === 'admin2' && (
                <button className="btn btn-ghost" style={{ width: '100%' }} onClick={demote}>Rebaixar a Membro</button>
              )}
            </>
          )}
        </>
      )}
      <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={onBack}>Voltar</button>
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
      const birthVal = birth && birth.trim() ? birth.trim() : null;
      await updateProfile(user.id, { name, email, phone, birth: birthVal, instagram, facebook, tiktok, whatsapp });
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
            <span style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{m.profiles?.name || 'Coordenação'} · {fmtDate(m.created_at)}</span>
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
  const [tiktok, setTiktok] = useState(owner?.tiktok || '');
  const [whatsapp, setWhatsapp] = useState(owner?.whatsapp || '');
  const [videoUrl, setVideoUrl] = useState(owner?.video_url || '');
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
      await updateOwnerProfile({ name, photo_url: photoUrl, bio, instagram, tiktok, whatsapp, video_url: videoUrl });
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
      <label className="lbl">TikTok</label><input value={tiktok} onChange={(e) => setTiktok(e.target.value)} placeholder="@usuario" />
      <label className="lbl">WhatsApp</label><input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="5561999999999" />
      <label className="lbl">Cole Link Youtube ou Reels Instagram</label>
      <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." />
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

function RequestsTab({ reload }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending'); // 'pending' or 'history'
  const [tableMissing, setTableMissing] = useState(false);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminRequests();
      setRequests(data || []);
      setTableMissing(false);
    } catch (e) {
      if (e.message && (e.message.includes('admin_requests') || e.message.includes('schema cache') || e.message.includes('relation'))) {
        setTableMissing(true);
      } else {
        alert('Erro ao carregar solicitações: ' + e.message);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  if (tableMissing) {
    const sqlCode = `-- Executar no SQL Editor do Supabase:\n\nCREATE TABLE IF NOT EXISTS admin_requests (\n  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,\n  created_at timestamptz DEFAULT now(),\n  created_by uuid REFERENCES profiles(id) ON DELETE CASCADE,\n  action_type text NOT NULL,\n  target_id text,\n  payload jsonb NOT NULL,\n  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),\n  approved_by uuid REFERENCES profiles(id),\n  approved_at timestamptz\n);\n\nALTER TABLE admin_requests ENABLE ROW LEVEL SECURITY;\n\n-- Drop existing policies if any to avoid errors\nDROP POLICY IF EXISTS "Permitir leitura geral para usuários autenticados" ON admin_requests;\nDROP POLICY IF EXISTS "Permitir inserção para usuários autenticados" ON admin_requests;\nDROP POLICY IF EXISTS "Permitir update para usuários autenticados" ON admin_requests;\n\nCREATE POLICY "Permitir leitura geral para usuários autenticados" ON admin_requests FOR SELECT TO authenticated USING (true);\nCREATE POLICY "Permitir inserção para usuários autenticados" ON admin_requests FOR INSERT TO authenticated WITH CHECK (true);\nCREATE POLICY "Permitir update para usuários autenticados" ON admin_requests FOR UPDATE TO authenticated USING (true);`;

    return (
      <div className="card" style={{ padding: 16, border: '1.5px solid rgba(255, 165, 0, 0.3)', background: 'rgba(255, 165, 0, 0.05)' }}>
        <h3 style={{ color: '#FF7847', fontSize: 14, fontWeight: 700, marginBottom: 8 }}>⚠️ Configuração do Banco de Dados Pendente</h3>
        <p style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
          Para que o sistema de <strong>Admin 2</strong> funcione online, você precisa criar a tabela correspondente no seu painel da Supabase.
        </p>
        <p style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 10 }}>
          <strong>Como fazer:</strong><br />
          1. Acesse o painel do seu **Supabase**.<br />
          2. Clique em **SQL Editor** no menu lateral esquerdo.<br />
          3. Clique em **New query** (Nova consulta).<br />
          4. Cole o código SQL abaixo e clique em **Run** (Executar).
        </p>
        
        <textarea 
          readOnly 
          value={sqlCode} 
          style={{ 
            width: '100%', 
            height: 120, 
            fontSize: 10.5, 
            fontFamily: 'monospace', 
            background: '#0d111c', 
            color: '#a9b2c3', 
            padding: 8, 
            borderRadius: 6, 
            border: '1px solid var(--line)',
            resize: 'none',
            marginBottom: 10
          }} 
        />
        
        <button 
          className="btn btn-teal" 
          onClick={() => {
            navigator.clipboard.writeText(sqlCode);
            alert('Código SQL copiado com sucesso!');
          }}
          style={{ width: '100%' }}
        >
          Copiar Código SQL
        </button>
      </div>
    );
  }

  async function handleApprove(reqId) {
    if (!confirm('Deseja realmente aprovar e executar esta alteração?')) return;
    try {
      await approveAdminRequest(reqId);
      alert('Solicitação aprovada e executada com sucesso!');
      loadRequests();
      reload();
    } catch (e) {
      alert('Erro ao aprovar solicitação: ' + e.message);
    }
  }

  async function handleReject(reqId) {
    if (!confirm('Deseja realmente rejeitar esta solicitação?')) return;
    try {
      await rejectAdminRequest(reqId);
      alert('Solicitação rejeitada com sucesso!');
      loadRequests();
    } catch (e) {
      alert('Erro ao rejeitar solicitação: ' + e.message);
    }
  }

  const filtered = requests.filter(r => filter === 'pending' ? r.status === 'pending' : r.status !== 'pending');

  function translateAction(type) {
    const m = {
      'update_profile': 'Editar Perfil',
      'delete_profile': 'Excluir Cadastro',
      'promote_coordinator': 'Promover a Coordenador',
      'promote_admin2': 'Promover a Admin 2',
      'demote_user': 'Rebaixar a Membro',
      'create_meeting': 'Agendar Reunião',
      'delete_meeting': 'Excluir Reunião',
      'update_meeting': 'Editar Reunião',
      'create_message': 'Enviar Mensagem no Mural',
      'delete_message': 'Excluir Mensagem',
      'update_owner_profile': 'Atualizar Dr. Candido',
      'update_settings': 'Atualizar Domínio',
      'admin_reset_password': 'Redefinir Senha'
    };
    return m[type] || type;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <button 
          className="btn" 
          style={{ 
            flex: 1, 
            fontSize: 11, 
            padding: '8px 4px', 
            borderRadius: 8, 
            background: filter === 'pending' ? 'var(--violet)' : 'rgba(255,255,255,0.03)', 
            color: filter === 'pending' ? '#fff' : 'var(--ink2)',
            border: '1px solid ' + (filter === 'pending' ? 'var(--violet)' : 'var(--line)')
          }}
          onClick={() => setFilter('pending')}
        >
          Pendentes ({requests.filter(r => r.status === 'pending').length})
        </button>
        <button 
          className="btn" 
          style={{ 
            flex: 1, 
            fontSize: 11, 
            padding: '8px 4px', 
            borderRadius: 8, 
            background: filter === 'history' ? 'var(--violet)' : 'rgba(255,255,255,0.03)', 
            color: filter === 'history' ? '#fff' : 'var(--ink2)',
            border: '1px solid ' + (filter === 'history' ? 'var(--violet)' : 'var(--line)')
          }}
          onClick={() => setFilter('history')}
        >
          Histórico ({requests.filter(r => r.status !== 'pending').length})
        </button>
      </div>

      {loading && <div style={{ textAlign: 'center', color: 'var(--teal)', fontSize: 12 }}>⏳ Carregando solicitações...</div>}
      {!loading && filtered.length === 0 && <div className="empty">Nenhuma solicitação nesta categoria.</div>}

      {filtered.map(r => (
        <div key={r.id} className="card" style={{ padding: 14, marginBottom: 8, border: '1.5px solid rgba(255,255,255,0.05)' }}>
          <div className="row-bw" style={{ marginBottom: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--gold)' }}>{translateAction(r.action_type)}</span>
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, 
              background: r.status === 'pending' ? 'rgba(255, 165, 0, 0.15)' : r.status === 'approved' ? 'rgba(0, 242, 254, 0.15)' : 'rgba(255, 0, 0, 0.15)',
              color: r.status === 'pending' ? 'orange' : r.status === 'approved' ? 'var(--teal)' : 'red'
            }}>
              {r.status === 'pending' ? 'Pendente' : r.status === 'approved' ? 'Aprovada' : 'Rejeitada'}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink2)', marginBottom: 8 }}>
            Solicitado por: <strong>{r.profiles?.name || 'Admin 2'}</strong> em {new Date(r.created_at).toLocaleString('pt-BR')}
          </div>
          
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: 10, borderRadius: 8, fontSize: 11.5, fontFamily: 'monospace', whiteSpace: 'pre-wrap', marginBottom: 12, border: '1px solid var(--line)', color: 'var(--ink1)' }}>
            {r.target_id && <div>Alvo ID: {r.target_id}</div>}
            {Object.keys(r.payload || {}).length > 0 && (
              <div>Dados: {JSON.stringify(r.payload, null, 2)}</div>
            )}
          </div>

          {r.status === 'pending' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-teal" style={{ flex: 1, padding: '6px 12px', fontSize: 12 }} onClick={() => handleApprove(r.id)}>Aprovar</button>
              <button className="btn btn-ghost" style={{ flex: 1, padding: '6px 12px', fontSize: 12, color: 'red', borderColor: 'rgba(255,0,0,0.3)' }} onClick={() => handleReject(r.id)}>Rejeitar</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
