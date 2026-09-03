import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import PersonModal from '../components/PersonModal';
import { EvolutionBotTab } from './EvolutionBotTab';
import { supabase, MAX_PHOTO_BYTES, compressImageWeb, CITIES } from '../lib/supabase';
import {
  fetchAllProfiles, updateProfile, deleteProfile, promoteToCoordinator, demoteToUser,
  fetchMeetings, createMeeting, deleteMeeting,
  fetchMessages, createMessage, deleteMessage,
  fetchOwnerProfile, updateOwnerProfile,
  fetchAppSettings, updateAppDomain,
  adminResetPassword, changeOwnPassword,
  promoteToAdmin2
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
    ...(isAdmin ? [['messages', '📣 Mensagens']] : []),
    ...(isAdmin ? [['evolution', '🤖 Robô WhatsApp']] : []),
    ...(isAdmin ? [['owner', '👨‍⚕️ Dr. Candido']] : []),
    ['stats', '📊 Estatísticas'],
    ...(isAdmin ? [['settings', '⚙️ Conta']] : []),
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

      <div className="adm-tabs">
        {tabs.map(([key, label]) => (
          <button key={key} className={`adm-tab${tab === key ? ' on' : ''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      <button className="btn btn-ghost" style={{ marginTop: 10, marginBottom: 10, width: '100%' }} onClick={onBack}>← Voltar ao aplicativo</button>

      <div style={{ flex: 1 }}>
        {loading && <div style={{ fontSize: 12, color: 'var(--teal)', textAlign: 'center', margin: '8px 0' }}>⏳ Carregando dados...</div>}
        {tab === 'users' && <UsersTab users={users} onSelect={(u) => setSelected(u)} reload={load} />}
        {tab === 'ranking' && <RankingTab users={users} meetings={meetings} onSelect={(u) => setModalPerson(u)} />}
        {tab === 'messages' && <MessagesTab messages={messages} profile={profile} reload={load} />}
        {tab === 'evolution' && isAdmin && <EvolutionBotTab users={users} reload={load} />}
        {tab === 'owner' && isAdmin && owner && <OwnerTab owner={owner} reload={load} />}
        {tab === 'stats' && <StatsTab users={users} meetings={meetings} messages={messages} />}
        {tab === 'settings' && isAdmin && settings && <SettingsTab settings={settings} profile={profile} reload={load} users={users} />}
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
function UsersTab({ users, onSelect, reload }) {
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [show100Modal, setShow100Modal] = useState(false);

  const filtered = users.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    String(u.id).includes(search) ||
    (u.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE) || 1;
  const paginatedUsers = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const validExportUsers = users.filter(u => u.role !== 'admin' && u.role !== 'admin2');
  const unexportedCount = validExportUsers.filter(u => !u.vcf_exported).length;
  const exportedCount = validExportUsers.filter(u => u.vcf_exported).length;

  const BATCH_SIZE_100 = 100;
  const totalBatches100 = Math.ceil(validExportUsers.length / BATCH_SIZE_100) || 1;
  const batches100 = [];
  for (let i = 0; i < totalBatches100; i++) {
    const chunk = validExportUsers.slice(i * BATCH_SIZE_100, (i + 1) * BATCH_SIZE_100);
    const startNum = i * BATCH_SIZE_100 + 1;
    const endNum = i * BATCH_SIZE_100 + chunk.length;
    batches100.push({
      batchNum: i + 1,
      id: `T${i + 1}`,
      name: `Lote ${i + 1} (#${startNum} ao #${endNum})`,
      count: chunk.length,
      users: chunk,
      startNum,
      endNum
    });
  }

  function generateVcfFromUsers(userList, prefixWithBatch = true, customFileName = null) {
    const cards = userList.map((u, index) => {
      const listIndex = Math.floor(index / 100) + 1;
      const cleanName = (u.name || 'Sem Nome').trim();
      const fullName = prefixWithBatch ? `T${listIndex} ${cleanName}` : cleanName;
      const tel = (u.phone || u.whatsapp || '').replace(/\D/g, '');
      let intlTel = tel;
      if (!intlTel.startsWith('55') && (intlTel.length === 10 || intlTel.length === 11)) {
        intlTel = '55' + intlTel;
      }
      if (intlTel && !intlTel.startsWith('+')) {
        intlTel = '+' + intlTel;
      }
      
      return [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `N:;${fullName};;;`,
        `FN:${fullName}`,
        ...(intlTel ? [`TEL;TYPE=CELL;TYPE=PREF:${intlTel}`, `TEL;TYPE=CELL,VOICE:${intlTel}`] : []),
        'END:VCARD'
      ].join('\r\n');
    });

    const vcfContent = cards.join('\r\n');
    const blob = new Blob([vcfContent], { type: 'text/vcard;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', customFileName || `contatos_transmissao_T_${Date.now()}.vcf`);
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 200);
  }

  async function updateVcfStatusInChunks(ids, exportedValue) {
    const CHUNK_SIZE = 100;
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase.from('profiles').update({ vcf_exported: exportedValue }).in('id', chunk);
      if (error) console.warn('Chunk update error:', error);
    }
  }

  async function handleExportSingle100Batch(batch) {
    try {
      generateVcfFromUsers(batch.users, true, `contatos_lote_${batch.batchNum}_(${batch.startNum}_a_${batch.endNum}).vcf`);
      const batchIds = batch.users.map(u => u.id);
      await updateVcfStatusInChunks(batchIds, true);
      if (reload) await reload();
    } catch (err) {
      alert('Erro ao baixar lote: ' + err.message);
    }
  }

  async function handleExportAllVCF() {
    if (validExportUsers.length === 0) {
      alert('Nenhum contato encontrado para exportar.');
      return;
    }

    setExporting(true);
    try {
      generateVcfFromUsers(validExportUsers, true);

      const allIds = validExportUsers.map(u => u.id);
      await updateVcfStatusInChunks(allIds, true);
      if (reload) await reload();
    } catch (err) {
      alert('Erro ao exportar contatos: ' + err.message);
    } finally {
      setExporting(false);
    }
  }

  async function handleExportNewVCF() {
    const toExport = validExportUsers.filter(u => !u.vcf_exported);
    if (toExport.length === 0) {
      if (window.confirm('Todos os contatos já foram marcados como exportados. Deseja baixar TODOS os contatos novamente?')) {
        return handleExportAllVCF();
      }
      return;
    }

    setExporting(true);
    try {
      generateVcfFromUsers(toExport, true);

      const exportedIds = toExport.map(u => u.id);
      await updateVcfStatusInChunks(exportedIds, true);
      if (reload) await reload();
    } catch (err) {
      alert('Erro ao exportar: ' + err.message);
    } finally {
      setExporting(false);
    }
  }

  async function handleResetExportStatus() {
    if (!window.confirm('Deseja marcar todos os contatos como PENDENTES de exportação novamente?')) return;
    setExporting(true);
    try {
      const allIds = validExportUsers.map(u => u.id);
      await updateVcfStatusInChunks(allIds, false);
      alert('Contador resetado com sucesso! Todos os contatos agora constam como pendentes.');
      if (reload) await reload();
    } catch (err) {
      alert('Erro ao resetar: ' + err.message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <div className="card-title">Todos os cadastros ({users.length})</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px', background: 'var(--panel2)', padding: '14px 16px', borderRadius: '16px', border: '1.5px solid var(--violet)', boxShadow: '0 4px 20px rgba(123, 108, 244, 0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--teal)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: 0.5 }}>
              📥 Exportação de Agenda (.VCF)
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--ink2)', marginTop: '2px' }}>
              Pendentes: <strong style={{ color: 'var(--teal)' }}>{unexportedCount}</strong> · Exportados: <strong style={{ color: '#fff' }}>{exportedCount}</strong>
            </div>
          </div>
          
          <button 
            className="btn btn-ghost" 
            onClick={handleResetExportStatus}
            disabled={exporting}
            style={{ margin: 0, padding: '4px 10px', fontSize: '11px', width: 'auto', color: 'var(--ink3)' }}
            title="Resetar contador de exportados"
          >
            🔄 Resetar Contador
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button 
            className="btn btn-teal" 
            onClick={() => setShow100Modal(true)}
            style={{ flex: '1 1 200px', margin: 0, padding: '10px 14px', fontSize: '12.5px', fontWeight: 800 }}
            title="Abre a lista com os lotes de 100 contatos cada para baixar sem erro no celular"
          >
            📱 Baixar em Lotes de 100 (Celular)
          </button>

          <button 
            className="btn btn-ghost" 
            onClick={handleExportAllVCF}
            disabled={exporting}
            style={{ flex: '1 1 140px', margin: 0, padding: '10px 12px', fontSize: '12px' }}
            title="Baixar arquivo único completo com todos os contatos (Google Contatos / PC)"
          >
            {exporting ? '⏳ Baixando...' : '📥 Baixar Tudo (.vcf)'}
          </button>

          <button 
            className="btn btn-ghost" 
            onClick={handleExportNewVCF}
            disabled={exporting}
            style={{ flex: '1 1 140px', margin: 0, padding: '10px 12px', fontSize: '12px' }}
            title="Baixar apenas contatos novos que ainda não foram exportados"
          >
            📥 Apenas Novos ({unexportedCount})
          </button>
        </div>
      </div>

      {show100Modal && (
        <div className="modal-bg" style={{ zIndex: 12000 }}>
          <div className="modal" style={{ maxWidth: 460, padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 16, color: '#fff', margin: 0, fontWeight: 800 }}>
                📱 Lotes de 100 Contatos (Celular)
              </h3>
              <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12, margin: 0 }} onClick={() => setShow100Modal(false)}>
                ✕ Fechar
              </button>
            </div>

            <p style={{ fontSize: 12, color: 'var(--ink2)', marginBottom: 16, lineHeight: 1.4 }}>
              Baixe os lotes abaixo individualmente. Como cada arquivo tem no máximo <strong>100 contatos</strong>, seu celular vai salvar na hora sem apresentar limite!
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '55vh', overflowY: 'auto', paddingRight: 4 }}>
              {batches100.map((b) => (
                <div 
                  key={b.id} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    background: 'var(--panel2)', 
                    padding: '10px 14px', 
                    borderRadius: 12, 
                    border: '1px solid var(--line)',
                    gap: 10
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 13, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ background: 'var(--teal-dim)', color: 'var(--teal)', padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>
                        {b.id}
                      </span>
                      <span>{b.name}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>
                      👥 {b.count} contatos
                    </div>
                  </div>

                  <button 
                    className="btn btn-teal"
                    style={{ margin: 0, padding: '6px 12px', fontSize: 11.5, width: 'auto', whiteSpace: 'nowrap' }}
                    onClick={() => handleExportSingle100Batch(b)}
                  >
                    📥 Baixar .vcf
                  </button>
                </div>
              ))}
            </div>

            <button className="btn btn-ghost" style={{ width: '100%', marginTop: 14, margin: 0 }} onClick={() => setShow100Modal(false)}>
              Concluir
            </button>
          </div>
        </div>
      )}

      <input 
        placeholder="Buscar nome, e-mail ou ID..." 
        value={search} 
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }} 
      />

      {paginatedUsers.map((p) => (
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

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
          <button 
            className="btn" 
            style={{ 
              width: 'auto',
              flexShrink: 0,
              margin: 0,
              padding: '8px 16px', 
              fontSize: 13, 
              fontWeight: 600,
              borderRadius: 10, 
              background: 'rgba(255, 255, 255, 0.04)', 
              color: page === 1 ? 'var(--ink3)' : '#fff',
              border: '1px solid ' + (page === 1 ? 'rgba(255, 255, 255, 0.05)' : 'var(--line)'),
              cursor: page === 1 ? 'not-allowed' : 'pointer',
              opacity: page === 1 ? 0.4 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
            disabled={page === 1}
            onClick={() => setPage(p => Math.max(p - 1, 1))}
          >
            <span>←</span> Anterior
          </button>
          <span style={{ fontSize: 13, color: 'var(--ink2)', fontWeight: 600, whiteSpace: 'nowrap', minWidth: '100px', textAlign: 'center' }}>
            Página {page} de {totalPages}
          </span>
          <button 
            className="btn" 
            style={{ 
              width: 'auto',
              flexShrink: 0,
              margin: 0,
              padding: '8px 16px', 
              fontSize: 13, 
              fontWeight: 600,
              borderRadius: 10, 
              background: 'rgba(255, 255, 255, 0.04)', 
              color: page === totalPages ? 'var(--ink3)' : '#fff',
              border: '1px solid ' + (page === totalPages ? 'rgba(255, 255, 255, 0.05)' : 'var(--line)'),
              cursor: page === totalPages ? 'not-allowed' : 'pointer',
              opacity: page === totalPages ? 0.4 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
            disabled={page === totalPages}
            onClick={() => setPage(p => Math.min(p + 1, totalPages))}
          >
            Próxima <span>→</span>
          </button>
        </div>
      )}
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
    ['E-mail', user.email], ['Telefone', user.phone || '-'], ['Cidade / Região', user.city || '-'], ['Nascimento', user.birth || '-'],
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
                </div>
              )}
              {isTrueAdmin && user.role === 'coord' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                  <button className="btn btn-ghost" onClick={demote}>Rebaixar a Membro</button>
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
  const [city, setCity] = useState(user.city || '');
  const [citySearch, setCitySearch] = useState('');
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const birthVal = birth && birth.trim() ? birth.trim() : null;
      await updateProfile(user.id, { name, email, phone, birth: birthVal, instagram, facebook, tiktok, whatsapp, city });
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

      <label className="lbl">Selecione sua cidade ou a mais próxima</label>
      <div style={{ position: 'relative', marginBottom: '16px' }}>
        <div 
          onClick={() => setCityDropdownOpen(true)}
          style={{
            padding: '12px 14px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1.5px solid rgba(0, 242, 254, 0.25)',
            borderRadius: '12px',
            color: city ? '#fff' : 'var(--ink3)',
            fontSize: '14px',
            textAlign: 'left',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>{city || "Clique para selecionar..."}</span>
          <span style={{ fontSize: '10px', color: 'var(--ink3)' }}>▼</span>
        </div>
        
        {cityDropdownOpen && (
          <>
            <div 
              style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, background: 'transparent' }} 
              onClick={() => setCityDropdownOpen(false)} 
            />
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              background: '#090d16',
              border: '1px solid var(--line)',
              borderRadius: '12px',
              maxHeight: '200px',
              overflowY: 'auto',
              zIndex: 1001,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              marginTop: '4px'
            }}>
              <div style={{ padding: '8px', borderBottom: '1px solid var(--line)', display: 'flex', gap: '6px', background: '#05070d', position: 'sticky', top: 0, zIndex: 2 }}>
                <input
                  type="text"
                  placeholder="Buscar cidade (min. 3 letras)..."
                  value={citySearch}
                  onChange={(e) => setCitySearch(e.target.value)}
                  style={{ padding: '6px 10px', fontSize: '12px', margin: 0, width: '100%', background: 'rgba(255,255,255,0.02)', color: '#fff' }}
                  autoFocus
                />
                {citySearch && (
                  <button 
                    type="button" 
                    className="btn btn-ghost" 
                    style={{ padding: '0 8px', fontSize: '11px', margin: 0, width: 'auto' }}
                    onClick={() => setCitySearch('')}
                  >
                    Limpar
                  </button>
                )}
              </div>
              
              {(() => {
                const searchVal = citySearch.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const filteredCities = searchVal.length >= 3
                  ? CITIES.filter(c => c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(searchVal))
                  : CITIES;

                if (filteredCities.length === 0) {
                  return <div style={{ padding: '12px', fontSize: '12px', color: 'var(--ink3)', textAlign: 'center' }}>Nenhuma cidade encontrada</div>;
                }

                return filteredCities.map((c) => (
                  <div
                    key={c}
                    onClick={() => {
                      setCity(c);
                      setCitySearch('');
                      setCityDropdownOpen(false);
                    }}
                    style={{
                      padding: '10px 14px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      color: city === c ? 'var(--teal)' : '#fff',
                      background: city === c ? 'rgba(0, 242, 254, 0.05)' : 'transparent',
                      borderBottom: '1px solid rgba(255,255,255,0.02)',
                      textAlign: 'left'
                    }}
                  >
                    {c}
                  </div>
                ));
              })()}
            </div>
          </>
        )}
      </div>

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
  const admins = users.filter((u) => u.role === 'admin' || u.role === 'admin2').length;
  const total = users.length || 1;

  const coordPct = ((coords / total) * 100).toFixed(1);
  const memberPct = ((members / total) * 100).toFixed(1);
  const adminPct = ((admins / total) * 100).toFixed(1);

  // Distribuição por Cidade/Região (Top Localidades)
  const cityCounts = {};
  users.forEach((u) => {
    const c = u.city || 'Não informado';
    cityCounts[c] = (cityCounts[c] || 0) + 1;
  });

  const cityList = Object.entries(cityCounts)
    .map(([name, count]) => ({
      name,
      count,
      pct: ((count / total) * 100).toFixed(1)
    }))
    .sort((a, b) => b.count - a.count);

  const last10Users = [...users]
    .sort((a, b) => {
      if (a.created_at && b.created_at) {
        return new Date(b.created_at) - new Date(a.created_at);
      }
      return b.id - a.id;
    })
    .slice(0, 10);

  const fmtDateTime = (isoStr) => {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${day}/${month}/${year} às ${hours}:${minutes}`;
    } catch {
      return isoStr;
    }
  };

  // Cálculos dos períodos (Atual vs Anterior)
  const now = new Date();
  const ms24h = 24 * 60 * 60 * 1000;
  const ms48h = 48 * 60 * 60 * 1000;
  const ms7d = 7 * 24 * 60 * 60 * 1000;
  const ms14d = 14 * 24 * 60 * 60 * 1000;
  const ms30d = 30 * 24 * 60 * 60 * 1000;
  const ms60d = 60 * 24 * 60 * 60 * 1000;

  // 24 Horas
  const count24h = users.filter(u => {
    if (!u.created_at) return false;
    const diff = now - new Date(u.created_at);
    return diff <= ms24h;
  }).length;

  const countPrev24h = users.filter(u => {
    if (!u.created_at) return false;
    const diff = now - new Date(u.created_at);
    return diff > ms24h && diff <= ms48h;
  }).length;

  // 7 Dias
  const count7d = users.filter(u => {
    if (!u.created_at) return false;
    const diff = now - new Date(u.created_at);
    return diff <= ms7d;
  }).length;

  const countPrev7d = users.filter(u => {
    if (!u.created_at) return false;
    const diff = now - new Date(u.created_at);
    return diff > ms7d && diff <= ms14d;
  }).length;

  // 30 Dias
  const count30d = users.filter(u => {
    if (!u.created_at) return false;
    const diff = now - new Date(u.created_at);
    return diff <= ms30d;
  }).length;

  const countPrev30d = users.filter(u => {
    if (!u.created_at) return false;
    const diff = now - new Date(u.created_at);
    return diff > ms30d && diff <= ms60d;
  }).length;

  // Helper para renderizar crachá de crescimento/queda
  const renderGrowthBadge = (current, previous) => {
    if (previous === 0) {
      if (current > 0) {
        return <span style={{ color: '#25D366', fontWeight: 700, fontSize: '11px', background: 'rgba(37, 211, 102, 0.1)', padding: '2px 6px', borderRadius: '6px' }}>+{current} novos 🗠</span>;
      }
      return <span style={{ color: 'var(--ink3)', fontSize: '11px', background: 'rgba(255,255,255,0.03)', padding: '2px 6px', borderRadius: '6px' }}>0%</span>;
    }
    const growth = ((current - previous) / previous) * 100;
    if (growth > 0) {
      const fmtGrowth = growth > 999 ? growth.toFixed(0) : growth.toFixed(1);
      return <span style={{ color: '#25D366', fontWeight: 700, fontSize: '11px', background: 'rgba(37, 211, 102, 0.1)', padding: '2px 6px', borderRadius: '6px' }}>+{fmtGrowth}% 🗠</span>;
    } else if (growth < 0) {
      const fmtGrowth = Math.abs(growth) > 999 ? growth.toFixed(0) : growth.toFixed(1);
      return <span style={{ color: '#FF3B30', fontWeight: 700, fontSize: '11px', background: 'rgba(255, 59, 48, 0.1)', padding: '2px 6px', borderRadius: '6px' }}>{fmtGrowth}% 🗦</span>;
    }
    return <span style={{ color: 'var(--ink2)', fontSize: '11px', background: 'rgba(255,255,255,0.03)', padding: '2px 6px', borderRadius: '6px' }}>0%</span>;
  };

  // Cálculo dos últimos 7 dias de cadastro para o gráfico diário
  const getDaysArray = () => {
    const days = [];
    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      days.push({
        dateStr: d.toISOString().split('T')[0],
        label: weekdays[d.getDay()],
        dayOfMonth: d.getDate()
      });
    }
    return days;
  };

  const last7Days = getDaysArray();
  const chartData = last7Days.map(day => {
    const count = users.filter(u => {
      if (!u.created_at) return false;
      const uDate = u.created_at.split('T')[0];
      return uDate === day.dateStr;
    }).length;
    return {
      ...day,
      count
    };
  });

  const maxDayCount = Math.max(...chartData.map(d => d.count), 1);

  // Geração de coordenadas para o Gráfico de Linha SVG
  const chartWidth = 500;
  const chartHeight = 160;
  const paddingX = 35;
  const paddingY = 20;

  const points = chartData.map((d, index) => {
    const x = paddingX + (index * (chartWidth - 2 * paddingX)) / 6;
    const y = chartHeight - paddingY - (d.count / maxDayCount) * (chartHeight - 2 * paddingY);
    return {
      x,
      y,
      count: d.count,
      label: d.label,
      dayOfMonth: d.dayOfMonth
    };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${chartHeight - paddingY} L ${points[0].x.toFixed(1)} ${chartHeight - paddingY} Z`
    : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '30px' }}>
      
      {/* Cards de Métricas Principais */}
      <div className="stat-grid">
        <div className="stat-box" style={{ borderLeft: '4px solid var(--teal)' }}>
          <div className="card-title">Total de Cadastros</div>
          <div className="stat-num" style={{ color: 'var(--teal)' }}>{users.length}</div>
          <div style={{ fontSize: '11px', color: 'var(--ink2)', marginTop: '4px' }}>Usuários ativos no banco</div>
        </div>

        <div className="stat-box" style={{ borderLeft: '4px solid var(--violet)' }}>
          <div className="card-title">Coordenadores</div>
          <div className="stat-num" style={{ color: 'var(--violet)' }}>{coords}</div>
          <div style={{ fontSize: '11px', color: 'var(--ink2)', marginTop: '4px' }}>{coordPct}% da base de membros</div>
        </div>

        <div className="stat-box" style={{ borderLeft: '4px solid var(--gold)' }}>
          <div className="card-title">Reuniões / Eventos</div>
          <div className="stat-num" style={{ color: 'var(--gold)' }}>{meetings.length}</div>
          <div style={{ fontSize: '11px', color: 'var(--ink2)', marginTop: '4px' }}>Criadas pela rede</div>
        </div>
      </div>

      {/* Seção de Evolução Recente */}
      <div className="card" style={{ padding: '20px 16px', background: 'var(--panel2)', borderRadius: 16, border: '1px solid var(--line)' }}>
        <h3 style={{ fontSize: '14px', color: '#fff', fontWeight: 700, margin: '0 0 16px 0', textAlign: 'left' }}>📈 Crescimento Recente</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          
          <div style={{ background: '#090d16', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--ink2)', fontWeight: 600, marginBottom: '6px' }}>Últimas 24h</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--teal)' }}>{count24h}</div>
            <div style={{ fontSize: '9px', color: 'var(--ink3)', marginTop: '6px', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
              {renderGrowthBadge(count24h, countPrev24h)}
              <span>vs 24h ant.</span>
            </div>
          </div>

          <div style={{ background: '#090d16', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--ink2)', fontWeight: 600, marginBottom: '6px' }}>Últimos 7 dias</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--violet)' }}>{count7d}</div>
            <div style={{ fontSize: '9px', color: 'var(--ink3)', marginTop: '6px', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
              {renderGrowthBadge(count7d, countPrev7d)}
              <span>vs 7d ant.</span>
            </div>
          </div>

          <div style={{ background: '#090d16', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: 'var(--ink2)', fontWeight: 600, marginBottom: '6px' }}>Últimos 30 dias</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--gold)' }}>{count30d}</div>
            <div style={{ fontSize: '9px', color: 'var(--ink3)', marginTop: '6px', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
              {renderGrowthBadge(count30d, countPrev30d)}
              <span>vs 30d ant.</span>
            </div>
          </div>

        </div>
      </div>

      {/* Gráfico de Linha SVG Premium (Últimos 7 Dias) */}
      <div className="card" style={{ padding: '20px 16px', background: 'var(--panel2)', borderRadius: 16, border: '1px solid var(--line)' }}>
        <div className="row-bw" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: '14px', color: '#fff', fontWeight: 700, margin: 0 }}>📊 Gráfico de Cadastro (Últimos 7 Dias)</h3>
          <span style={{ fontSize: '11px', color: 'var(--ink3)' }}>Evolução Diária</span>
        </div>

        <div style={{ background: '#05070d', border: '1px solid var(--line)', borderRadius: 16, padding: '16px 8px 12px 8px' }}>
          
          {/* Container Responsivo do SVG */}
          <div style={{ position: 'relative', width: '100%' }}>
            <svg 
              viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
              style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
            >
              <defs>
                {/* Gradiente sob a linha */}
                <linearGradient id="chart-line-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--teal)" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="var(--teal)" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Linha horizontal central de referência */}
              <line 
                x1={paddingX} 
                y1={chartHeight / 2} 
                x2={chartWidth - paddingX} 
                y2={chartHeight / 2} 
                stroke="rgba(255, 255, 255, 0.04)" 
                strokeDasharray="4 4" 
              />
              
              {/* Linha base do rodapé */}
              <line 
                x1={paddingX} 
                y1={chartHeight - paddingY} 
                x2={chartWidth - paddingX} 
                y2={chartHeight - paddingY} 
                stroke="rgba(255, 255, 255, 0.1)" 
              />

              {/* 1) Preenchimento de Área sob a linha */}
              {areaPath && (
                <path d={areaPath} fill="url(#chart-line-gradient)" />
              )}

              {/* 2) A própria Linha do Gráfico */}
              {linePath && (
                <path 
                  d={linePath} 
                  fill="none" 
                  stroke="var(--teal)" 
                  strokeWidth="3.5" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                />
              )}

              {/* 3) Nós circulares e rótulos de valores em cada ponto do gráfico */}
              {points.map((p, index) => (
                <g key={index}>
                  {/* Círculo do ponto */}
                  <circle 
                    cx={p.x} 
                    cy={p.y} 
                    r="5" 
                    fill="#05070d" 
                    stroke="var(--teal)" 
                    strokeWidth="3" 
                  />
                  {/* Rótulo numérico acima do ponto */}
                  <text 
                    x={p.x} 
                    y={p.y - 10} 
                    textAnchor="middle" 
                    fontSize="10" 
                    fontWeight="800"
                    fill={p.count > 0 ? '#fff' : 'var(--ink3)'}
                  >
                    {p.count}
                  </text>
                </g>
              ))}
            </svg>
          </div>

          {/* Legenda de Dias perfeitamente alinhados */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: `0 ${paddingX - 10}px`, marginTop: 6 }}>
            {points.map((p, index) => (
              <div key={index} style={{ width: '12%', textAlign: 'center', fontSize: '10px', fontWeight: 700, color: 'var(--ink2)' }}>
                <div>{p.label}</div>
                <div style={{ fontSize: '8.5px', color: 'var(--ink3)', marginTop: 2 }}>{p.dayOfMonth}</div>
              </div>
            ))}
          </div>

        </div>
      </div>



      {/* Distribuição por Região (Cidade/Bairro) */}
      <div className="card" style={{ padding: '20px 16px', background: 'var(--panel2)', borderRadius: 16, border: '1px solid var(--line)', textAlign: 'left' }}>
        <h3 style={{ fontSize: '14px', color: '#fff', fontWeight: 700, margin: '0 0 14px 0' }}>🗺️ Distribuição por Região</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {cityList.slice(0, 8).map((item, index) => (
            <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div className="row-bw" style={{ fontSize: '12px' }}>
                <span style={{ color: 'var(--ink1)', fontWeight: 600 }}>{item.name}</span>
                <span style={{ fontWeight: 700, color: 'var(--ink2)' }}>{item.count} ({item.pct}%)</span>
              </div>
              <div style={{ height: '6px', borderRadius: '3px', background: 'var(--line)', overflow: 'hidden' }}>
                <div style={{ width: `${item.pct}%`, height: '100%', background: 'linear-gradient(to right, rgba(0, 242, 254, 0.6), var(--teal))', borderRadius: '3px' }} />
              </div>
            </div>
          ))}
          {cityList.length > 8 && (
            <div style={{ fontSize: '11px', color: 'var(--ink3)', textAlign: 'center', marginTop: 4 }}>
              e mais {cityList.length - 8} regiões com cadastros
            </div>
          )}
        </div>
      </div>

      {/* Últimos 10 Cadastros */}
      <div className="card" style={{ padding: '20px 16px', background: 'var(--panel2)', borderRadius: 16, border: '1px solid var(--line)', textAlign: 'left' }}>
        <h3 style={{ fontSize: '14px', color: '#fff', fontWeight: 700, margin: '0 0 14px 0' }}>🆕 Últimos 10 Cadastros</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {last10Users.map((u) => {
            const sponsor = users.find((p) => p.id === u.referrer_id);
            return (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#090d16', border: '1px solid var(--line)', borderRadius: 12, gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                <Avatar person={u} size={30} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--ink3)' }}>ID: #{u.id} · @{u.username} · Indicador: {sponsor ? <span style={{ color: '#ffa500', fontWeight: 600 }}>{`${sponsor.name} (#${sponsor.id})`}</span> : '-'}</div>
                </div>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--teal)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {fmtDateTime(u.created_at)}
              </div>
            </div>
            );
          })}
          {last10Users.length === 0 && <div className="empty" style={{ fontSize: '12px' }}>Nenhum usuário cadastrado.</div>}
        </div>
      </div>

      <div className="card-title" style={{ textAlign: 'left', marginTop: 10 }}>Mensagens enviadas</div>
      <div className="stat-box" style={{ textAlign: 'left' }}><div className="stat-num">{messages.length}</div></div>

    </div>
  );
}

/* ===== CONFIGURACOES ===== */
function SettingsTab({ settings, profile, reload, users }) {
  const [domain, setDomain] = useState(settings?.app_domain || 'amigosdrcandido.com.br');
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [newPassword, setNewPassword] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState('');

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

  function handleBackup() {
    try {
      const dataStr = JSON.stringify(users, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      const exportFileDefaultName = `backup_usuarios_${new Date().toISOString().split('T')[0]}_${Date.now()}.json`;
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
    } catch (err) {
      alert('Erro ao gerar backup: ' + err.message);
    }
  }

  async function handleRestore(e) {
    const file = e.target.files[0];
    if (!file) return;

    const confirmRestore = window.confirm('ATENÇÃO: Este processo irá recriar todos os usuários do arquivo de backup que não estiverem no banco atual. Deseja prosseguir?');
    if (!confirmRestore) {
      e.target.value = '';
      return;
    }

    setRestoring(true);
    setRestoreProgress('Lendo arquivo de backup...');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const backupUsers = JSON.parse(event.target.result);
        if (!Array.isArray(backupUsers)) {
          throw new Error('Formato de arquivo inválido. Deve ser uma lista de usuários.');
        }

        setRestoreProgress(`Verificando banco... 0/${backupUsers.length}`);

        const tempSupabase = createClient(supabase.supabaseUrl, supabase.supabaseKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          }
        });

        let successCount = 0;
        let skipCount = 0;
        let errorCount = 0;

        for (let i = 0; i < backupUsers.length; i++) {
          const u = backupUsers[i];
          setRestoreProgress(`Restaurando ${i + 1}/${backupUsers.length}: ${u.name}...`);

          // 1) Check if already exists in profiles
          const { data: existingUser } = await supabase
            .from('profiles')
            .select('id')
            .eq('username', u.username)
            .maybeSingle();

          if (existingUser) {
            skipCount++;
            continue;
          }

          // 2) Sign up in auth using email and default password
          const userEmail = u.email || `${u.username}@amigosdrcandido.com.br`;
          const { data: authData, error: authErr } = await tempSupabase.auth.signUp({
            email: userEmail,
            password: '123456'
          });

          if (authErr) {
            console.error(`Erro ao criar autenticação para ${u.name}:`, authErr);
            errorCount++;
            continue;
          }

          // 3) Insert profile with original id and new auth_id
          const { error: insertErr } = await supabase
            .from('profiles')
            .insert({
              id: u.id,
              auth_id: authData.user.id,
              name: u.name,
              email: userEmail,
              phone: u.phone || u.whatsapp,
              whatsapp: u.whatsapp || u.phone,
              role: u.role || 'user',
              coord_id: u.coord_id,
              parent_id: u.parent_id,
              referrer_id: u.referrer_id,
              username: u.username,
              city: u.city || null,
              created_at: u.created_at,
              vcf_exported: u.vcf_exported || false,
              live_enabled: u.live_enabled !== undefined ? u.live_enabled : true
            });

          if (insertErr) {
            console.error(`Erro ao inserir perfil de ${u.name}:`, insertErr);
            errorCount++;
          } else {
            successCount++;
          }
        }

        alert(`Restauração concluída!\nContas recriadas: ${successCount}\nContas já existentes (puladas): ${skipCount}\nErros: ${errorCount}`);
        if (reload) await reload();
      } catch (err) {
        alert('Erro ao processar arquivo: ' + err.message);
      } finally {
        setRestoring(false);
        setRestoreProgress('');
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  }

  return (
    <div>
      <div className="card-title">Cópia de Segurança (Backup & Restauração)</div>
      <div className="card">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>Exportar Cadastros</div>
            <div style={{ fontSize: '11.5px', color: 'var(--ink3)', marginBottom: '8px' }}>Baixe um arquivo contendo todos os cadastros atuais do sistema para segurança.</div>
            <button className="btn btn-teal" onClick={handleBackup} style={{ margin: 0, width: 'auto', padding: '8px 16px' }}>
              📥 Baixar Backup (.JSON)
            </button>
          </div>
          <div style={{ borderTop: '1px solid var(--line)', marginTop: '8px', paddingTop: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>Importar / Restaurar Cadastros</div>
            <div style={{ fontSize: '11.5px', color: 'var(--ink3)', marginBottom: '8px' }}>Selecione um arquivo de backup (.JSON) baixado anteriormente para recriar as contas perdidas no banco de dados.</div>
            
            {restoring ? (
              <div style={{ fontSize: '13px', color: 'var(--teal)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⏳</span> {restoreProgress}
              </div>
            ) : (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <button className="btn btn-violet" style={{ margin: 0, width: 'auto', padding: '8px 16px', pointerEvents: 'none' }}>
                  📤 Carregar & Restaurar (.JSON)
                </button>
                <input 
                  type="file" 
                  accept=".json" 
                  onChange={handleRestore}
                  style={{ 
                    position: 'absolute', 
                    top: 0, 
                    left: 0, 
                    width: '100%', 
                    height: '100%', 
                    opacity: 0, 
                    cursor: 'pointer' 
                  }} 
                />
              </div>
            )}
          </div>
        </div>
      </div>

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
