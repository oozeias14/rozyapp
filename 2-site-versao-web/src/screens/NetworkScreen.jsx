import { useEffect, useState, useCallback } from 'react';
import TopBar from '../components/TopBar';
import PersonModal from '../components/PersonModal';
import { fetchTotalUsersCount, fetchDirectReferrals, fetchMatrixChildren, fetchProfileById, fetchAllProfiles } from '../lib/api';

const ORBIT_SIZE = 250, R = 100, CX = ORBIT_SIZE / 2, CY = ORBIT_SIZE / 2;
function initials(name) { return (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase(); }

function Avatar({ person, size }) {
  return (
    <div className="av" style={{ width: size, height: size, fontSize: size * 0.32 }}>
      {person.photo_url ? <img src={person.photo_url} alt="" /> : initials(person.name)}
    </div>
  );
}

export default function NetworkScreen({ profile }) {
  const [totalUsers, setTotalUsers] = useState(0);
  const [sponsor, setSponsor] = useState(null);
  const [coord, setCoord] = useState(null);
  const [direct, setDirect] = useState([]);
  const [matrixChildren, setMatrixChildren] = useState([]);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [selectedSponsor, setSelectedSponsor] = useState(null);
  const [showAllList, setShowAllList] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    const [totalCount, directs, matrix, sps, crd, all] = await Promise.all([
      fetchTotalUsersCount(),
      fetchDirectReferrals(profile.id),
      fetchMatrixChildren(profile.id),
      profile.referrer_id ? fetchProfileById(profile.referrer_id) : null,
      profile.coord_id ? fetchProfileById(profile.coord_id) : null,
      fetchAllProfiles()
    ]);
    setTotalUsers(totalCount);
    setDirect(directs);
    setMatrixChildren(matrix);
    setSponsor(sps);
    setCoord(crd);
    setAllUsers(all || []);
  }, [profile.id, profile.referrer_id, profile.coord_id]);

  useEffect(() => { load(); }, [load]);

  function getReferralNetworkCount(userId) {
    if (!allUsers || allUsers.length === 0) return 0;
    let count = 0;
    let currentLevel = allUsers.filter((u) => u.referrer_id === userId);
    let depth = 1;
    while (currentLevel.length > 0 && depth <= 20) {
      count += currentLevel.length;
      const nextLevelIds = currentLevel.map((u) => u.id);
      currentLevel = allUsers.filter((u) => nextLevelIds.includes(u.referrer_id));
      depth++;
    }
    return count;
  }

  async function openPerson(p) {
    setSelectedPerson(p);
    setSelectedSponsor(p.referrer_id ? await fetchProfileById(p.referrer_id) : null);
  }

  const activeDirectsCount = direct.filter((c) => getReferralNetworkCount(c.id) > 0).length;
  const inactiveDirectsCount = direct.filter((c) => getReferralNetworkCount(c.id) === 0).length;

  const filteredDirects = 
    filter === 'active' ? direct.filter((c) => getReferralNetworkCount(c.id) > 0) : 
    filter === 'inactive' ? direct.filter((c) => getReferralNetworkCount(c.id) === 0) : 
    direct;

  const sortedFilteredDirects = [...filteredDirects].sort((a, b) => {
    return getReferralNetworkCount(b.id) - getReferralNetworkCount(a.id);
  });

  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(sortedFilteredDirects.length / ITEMS_PER_PAGE) || 1;
  const paginatedDirects = sortedFilteredDirects.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const slots = Array.from({ length: 10 }, (_, i) => matrixChildren[i] || null);

  return (
    <div className="screen">
      <TopBar totalUsers={totalUsers} />

      <div className="card" style={{ 
        background: 'linear-gradient(135deg, rgba(123, 108, 244, 0.12), rgba(0, 242, 254, 0.03))', 
        borderColor: 'rgba(123, 108, 244, 0.3)',
        padding: '14px 18px',
        borderRadius: 16,
        marginBottom: 16,
        textAlign: 'center'
      }}>
        <div style={{ fontSize: 11, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Sua Rede de Indicações (Até 20ª Geração)</div>
        <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--violet)', marginTop: 4 }}>{getReferralNetworkCount(profile.id)}</div>
        <div className="muted" style={{ fontSize: 9.5, marginTop: 4 }}>Membros ativos acumulados através de seus diretos</div>
      </div>

      {coord && (
        <div className="card" style={{ 
          background: 'linear-gradient(135deg, rgba(22, 28, 44, 0.95), rgba(13, 17, 28, 0.98))',
          border: '1.5px solid rgba(138, 43, 226, 0.25)',
          boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37), 0 0 15px rgba(138, 43, 226, 0.05)',
          backdropFilter: 'blur(8px)',
          transition: 'all 0.3s ease',
          padding: '16px 20px'
        }}>
          <div className="card-title" style={{ color: 'var(--ink2)', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: 10, fontWeight: 700, marginBottom: 12 }}>Seu Coordenador / Patrocinador</div>
          <div className="prow" style={{ borderBottom: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }} onClick={() => openPerson(coord)}>
            <Avatar person={coord} size={42} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink1)' }}>{coord.name}</div>
              <div className="role-badge" style={{ 
                display: 'inline-block',
                marginTop: 4,
                padding: '2px 8px',
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 700,
                background: coord.role === 'admin' ? 'rgba(138, 43, 226, 0.15)' : 'rgba(0, 242, 254, 0.1)',
                color: coord.role === 'admin' ? 'var(--violet)' : 'var(--teal)',
                border: coord.role === 'admin' ? '1px solid rgba(138, 43, 226, 0.3)' : '1px solid rgba(0, 242, 254, 0.3)'
              }}>
                {coord.role === 'admin' ? 'Administrador' : 'Coordenador'}
              </div>
            </div>
            <div style={{ color: 'var(--teal)', fontSize: 12, fontWeight: 600 }}>Ver Perfil ➡️</div>
          </div>
        </div>
      )}

      <div className="card-title" style={{ marginTop: 20 }}>Seus 10 slots diretos</div>
      <div className="orbit-wrap">
        <div className="orbit">
          <div className="orbit-ring-outer" />
          <div className="orbit-ring" />
          <div className="orbit-ring-inner" />
          {slots.map((s, i) => {
            const ang = (Math.PI * 2 / 10) * i - Math.PI / 2;
            const x = CX + R * Math.cos(ang), y = CY + R * Math.sin(ang);
            return s ? (
              <div key={i} className="orbit-slot slot-f" style={{ left: x, top: y, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => openPerson(s)}>
                {s.photo_url ? (
                  <img src={s.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  initials(s.name)
                )}
              </div>
            ) : (
              <div key={i} className="orbit-slot slot-e" style={{ left: x, top: y }}>{i + 1}</div>
            );
          })}
          <div className="orbit-center mono">#{profile.id}</div>
        </div>
        <div className="muted" style={{ marginTop: 12, fontWeight: 500, color: 'var(--ink2)' }}>{Math.min(matrixChildren.length, 10)}/10 slots preenchidos</div>
      </div>

      <div style={{ marginTop: 16, marginBottom: 12 }}>
        <button 
          className="btn btn-teal" 
          style={{ width: '100%' }} 
          onClick={() => {
            setShowAllList(!showAllList);
            setPage(1);
            setFilter('all');
          }}
        >
          {showAllList ? 'Ocultar lista de indicados' : `Ver todos os indicados diretos (${direct.length})`}
        </button>
      </div>

      {showAllList && (
        <div className="card">
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
            <button 
              className="btn" 
              style={{ 
                flex: 1, 
                fontSize: 10, 
                padding: '6px 4px', 
                borderRadius: 8, 
                background: filter === 'all' ? 'var(--violet)' : 'rgba(255,255,255,0.03)', 
                color: filter === 'all' ? '#fff' : 'var(--ink2)',
                border: '1px solid ' + (filter === 'all' ? 'var(--violet)' : 'var(--line)')
              }}
              onClick={() => { setFilter('all'); setPage(1); }}
            >
              Todos ({direct.length})
            </button>
            <button 
              className="btn" 
              style={{ 
                flex: 1, 
                fontSize: 10, 
                padding: '6px 4px', 
                borderRadius: 8, 
                background: filter === 'active' ? 'var(--violet)' : 'rgba(255,255,255,0.03)', 
                color: filter === 'active' ? '#fff' : 'var(--ink2)',
                border: '1px solid ' + (filter === 'active' ? 'var(--violet)' : 'var(--line)')
              }}
              onClick={() => { setFilter('active'); setPage(1); }}
            >
              Ativos ({activeDirectsCount})
            </button>
            <button 
              className="btn" 
              style={{ 
                flex: 1, 
                fontSize: 10, 
                padding: '6px 4px', 
                borderRadius: 8, 
                background: filter === 'inactive' ? 'var(--violet)' : 'rgba(255,255,255,0.03)', 
                color: filter === 'inactive' ? '#fff' : 'var(--ink2)',
                border: '1px solid ' + (filter === 'inactive' ? 'var(--violet)' : 'var(--line)')
              }}
              onClick={() => { setFilter('inactive'); setPage(1); }}
            >
              Sem Rede ({inactiveDirectsCount})
            </button>
          </div>

          {paginatedDirects.length === 0 && <div className="empty">Nenhum indicado nesta categoria.</div>}
          {paginatedDirects.map((c, index) => (
            <div key={c.id} className="prow" onClick={() => openPerson(c)}>
              <Avatar person={c} size={36} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  {c.name} {direct.indexOf(c) < 10 ? <span style={{ color: 'var(--teal)', fontSize: 11, fontWeight: 500 }}>(Slot {direct.indexOf(c) + 1})</span> : <span style={{ color: 'var(--violet)', fontSize: 11, fontWeight: 500 }}>(Excedente)</span>}
                </div>
                <div className="muted" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                  <span>🕸️ Rede: <strong style={{ color: 'var(--violet)' }}>{getReferralNetworkCount(c.id)}</strong></span>
                  <span>·</span>
                  {getReferralNetworkCount(c.id) > 0 ? (
                    <span style={{ color: 'var(--teal)', fontSize: 9, fontWeight: 700, border: '1px solid rgba(0, 242, 254, 0.2)', padding: '1px 5px', borderRadius: 4, background: 'rgba(0, 242, 254, 0.05)' }}>
                      📈 DANDO CONTINUIDADE
                    </span>
                  ) : (
                    <span style={{ color: 'var(--gold)', fontSize: 9, fontWeight: 700, border: '1px solid rgba(255, 215, 0, 0.2)', padding: '1px 5px', borderRadius: 4, background: 'rgba(255, 215, 0, 0.05)' }}>
                      ⚠️ PRECISA DE AJUDA
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="id-badge">#{c.id}</span>
                {(c.whatsapp || c.phone) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(`https://wa.me/${(c.whatsapp || c.phone).replace(/[^0-9]/g, '')}`, '_blank');
                    }}
                    style={{
                      background: 'rgba(37, 211, 102, 0.1)',
                      border: '1px solid rgba(37, 211, 102, 0.3)',
                      borderRadius: '50%',
                      width: 28,
                      height: 28,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: '#25D366',
                      flexShrink: 0,
                      padding: 0
                    }}
                    title="Conversar no WhatsApp"
                  >
                    <svg viewBox="0 0 448 512" width="14" height="14" fill="#25D366">
                      <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-117zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
              <button 
                className="btn" 
                style={{ 
                  padding: '6px 12px', 
                  fontSize: 12, 
                  borderRadius: 8, 
                  background: 'rgba(255, 255, 255, 0.05)', 
                  color: page === 1 ? 'var(--ink3)' : '#fff',
                  border: '1px solid var(--line)',
                  cursor: page === 1 ? 'not-allowed' : 'pointer',
                  opacity: page === 1 ? 0.5 : 1
                }}
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(p - 1, 1))}
              >
                ⬅️ Anterior
              </button>
              <span style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 600 }}>
                Página {page} de {totalPages}
              </span>
              <button 
                className="btn" 
                style={{ 
                  padding: '6px 12px', 
                  fontSize: 12, 
                  borderRadius: 8, 
                  background: 'rgba(255, 255, 255, 0.05)', 
                  color: page === totalPages ? 'var(--ink3)' : '#fff',
                  border: '1px solid var(--line)',
                  cursor: page === totalPages ? 'not-allowed' : 'pointer',
                  opacity: page === totalPages ? 0.5 : 1
                }}
                disabled={page === totalPages}
                onClick={() => setPage(p => Math.min(p + 1, totalPages))}
              >
                Próxima ➡️
              </button>
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ 
        background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.08), rgba(0, 242, 254, 0.03))', 
        borderColor: 'rgba(138, 43, 226, 0.3)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '16px',
        marginBottom: 10
      }}>
        <div style={{ fontSize: 20, flexShrink: 0 }}>💡</div>
        <div style={{ fontSize: 12.5, color: '#D5CFFE', lineHeight: 1.5, fontWeight: 500 }}>
          O <strong>11º indicado em diante</strong> entra automaticamente na primeira vaga livre da rede (spillover automático).
        </div>
      </div>
      <div style={{ height: 20 }} />

      {selectedPerson && (
        <PersonModal person={selectedPerson} sponsor={selectedSponsor} networkCount={getReferralNetworkCount(selectedPerson.id)} onClose={() => setSelectedPerson(null)} />
      )}
    </div>
  );
}
