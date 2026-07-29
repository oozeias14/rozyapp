import { useEffect, useState, useCallback } from 'react';
import TopBar from '../components/TopBar';
import PersonModal from '../components/PersonModal';
import { fetchAllProfiles, fetchProfileById } from '../lib/api';

const ORBIT_SIZE = 230, R = 95, CX = ORBIT_SIZE / 2, CY = ORBIT_SIZE / 2;
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

  const load = useCallback(async () => {
    const all = await fetchAllProfiles();
    setTotalUsers(all.length);
    setDirect(all.filter((p) => p.referrer_id === profile.id));
    setMatrixChildren(all.filter((p) => p.parent_id === profile.id));
    setSponsor(profile.referrer_id ? all.find((p) => p.id === profile.referrer_id) : null);
    setCoord(profile.coord_id ? all.find((p) => p.id === profile.coord_id) : null);
  }, [profile.id, profile.referrer_id, profile.coord_id]);

  useEffect(() => { load(); }, [load]);

  async function openPerson(p) {
    setSelectedPerson(p);
    setSelectedSponsor(p.referrer_id ? await fetchProfileById(p.referrer_id) : null);
  }

  const slots = Array.from({ length: 10 }, (_, i) => matrixChildren[i] || null);

  return (
    <div className="screen">
      <TopBar totalUsers={totalUsers} />

      {coord && (
        <div className="card">
          <div className="card-title">Seu Coordenador / Patrocinador</div>
          <div className="prow" style={{ borderBottom: 'none', cursor: 'pointer' }} onClick={() => openPerson(coord)}>
            <Avatar person={coord} size={36} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{coord.name}</div>
              <div className="muted">{coord.role === 'admin' ? 'Admin' : 'Coordenador'}</div>
            </div>
          </div>
        </div>
      )}

      <div className="card-title">Seus 10 slots diretos</div>
      <div className="orbit-wrap">
        <div className="orbit">
          <div className="orbit-ring" />
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
        <div className="muted" style={{ marginTop: 6 }}>{Math.min(matrixChildren.length, 10)}/10 slots preenchidos</div>
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
                <div className="muted">{c.instagram || c.email}</div>
              </div>
              <span className="id-badge">#{c.id}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ background: 'var(--violet-dim)', borderColor: 'var(--violet)' }}>
        <div style={{ fontSize: 12, color: '#CFC9FA' }}>11º indicado em diante entra automaticamente na primeira vaga livre da rede (spillover automático).</div>
      </div>
      <div style={{ height: 20 }} />

      {selectedPerson && (
        <PersonModal person={selectedPerson} sponsor={selectedSponsor} onClose={() => setSelectedPerson(null)} />
      )}
    </div>
  );
}
