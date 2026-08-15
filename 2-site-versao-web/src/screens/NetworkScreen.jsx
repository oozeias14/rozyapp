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
          onClick={() => setShowAllList(!showAllList)}
        >
          {showAllList ? 'Ocultar lista de indicados' : `Ver todos os indicados diretos (${direct.length})`}
        </button>
      </div>

      {showAllList && (
        <div className="card">
          {direct.length === 0 && <div className="empty">Nenhum indicado ainda.<br />Compartilhe seu código em Perfil.</div>}
          {direct.map((c, index) => (
            <div key={c.id} className="prow" onClick={() => openPerson(c)}>
              <Avatar person={c} size={36} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  {c.name} {index < 10 ? <span style={{ color: 'var(--teal)', fontSize: 11, fontWeight: 500 }}>(Slot {index + 1})</span> : <span style={{ color: 'var(--violet)', fontSize: 11, fontWeight: 500 }}>(Excedente)</span>}
                </div>
                <div className="muted" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <span>🕸️ Rede: <strong style={{ color: 'var(--violet)' }}>{getReferralNetworkCount(c.id)}</strong></span>
                  <span>·</span>
                  <span>{c.instagram || c.email}</span>
                </div>
              </div>
              <span className="id-badge">#{c.id}</span>
            </div>
          ))}
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
