import { useEffect, useState, useCallback } from 'react';
import TopBar from '../components/TopBar';
import { fetchAllProfiles, fetchMeetings, fetchMessages } from '../lib/api';

function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', weekday: 'short' }); }
  catch { return d; }
}

export default function HomeScreen({ profile, onOpenAdmin, onGoToAgenda }) {
  const [totalUsers, setTotalUsers] = useState(0);
  const [directCount, setDirectCount] = useState(0);
  const [meetings, setMeetings] = useState([]);
  const [messages, setMessages] = useState([]);

  const load = useCallback(async () => {
    const [profiles, mts, msgs] = await Promise.all([fetchAllProfiles(), fetchMeetings(), fetchMessages()]);
    setTotalUsers(profiles.length);
    setDirectCount(profiles.filter((p) => p.referrer_id === profile.id).length);
    setMeetings(mts);
    setMessages(msgs.slice(0, 2));
  }, [profile.id]);

  useEffect(() => { load(); }, [load]);

  const isStaff = profile.role === 'admin' || profile.role === 'coord';

  // Estatísticas transparentes
  const completedM = meetings.filter((m) => m.status === 'realizada');
  const totalHours = completedM.reduce((acc, m) => acc + (m.duration_minutes || 0) / 60, 0);
  const totalAttendees = completedM.reduce((acc, m) => acc + (m.attendees_count || 0), 0);

  return (
    <div className="screen">
      <TopBar totalUsers={totalUsers} />

      <div className="card">
        <div className="card-title">Olá</div>
        <h2 style={{ fontSize: 18, marginBottom: 3 }}>{profile.name.split(' ')[0]} 👋</h2>
        <div className="muted">ID <span className="id-badge">#{profile.id}</span> · {directCount} indicados diretos</div>
      </div>

      {isStaff && (
        <div className="card" style={{ background: 'var(--violet-dim)', borderColor: 'var(--violet)', cursor: 'pointer' }} onClick={onOpenAdmin}>
          <div className="row-bw">
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>⚙️ Painel {profile.role === 'admin' ? 'Admin' : 'Coordenador'}</div>
              <div className="muted">Cadastros, reuniões, mensagens{profile.role === 'admin' ? ' e o Dr. Candido' : ''}</div>
            </div>
            <button className="btn btn-violet btn-sm">Abrir</button>
          </div>
        </div>
      )}

      {/* Estatísticas da Rede */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div className="card" style={{ margin: 0 }}>
          <div className="card-title">Rede direta</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--teal)' }}>{directCount}</div>
        </div>
        <div className="card" style={{ margin: 0 }}>
          <div className="card-title">Total sistema</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--violet)' }}>{totalUsers}</div>
        </div>
      </div>

      {/* Estatísticas de Reuniões Realizadas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div className="card" style={{ margin: 0 }}>
          <div className="card-title">Reuniões Realizadas</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--gold)' }}>{completedM.length}</div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>⏱️ {totalHours.toFixed(1)}h acumuladas</div>
        </div>
        <div className="card" style={{ margin: 0 }}>
          <div className="card-title">Pessoas Presentes</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--teal)' }}>{totalAttendees}</div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>👥 presentes no total</div>
        </div>
      </div>

      {messages.length > 0 && <div className="card-title">Mensagens da coordenação</div>}
      {messages.map((m) => (
        <div key={m.id} className="msg-bubble">
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>{m.text}</div>
          <div className="msg-meta">📣 {m.profiles?.name || 'Coordenação'} · {new Date(m.created_at).toLocaleDateString('pt-BR')}</div>
        </div>
      ))}

      <div className="row-bw">
        <div className="card-title">Próximas reuniões</div>
        <span style={{ color: 'var(--violet)', fontSize: 11, cursor: 'pointer' }} onClick={onGoToAgenda}>ver tudo</span>
      </div>
      {meetings.filter(m => m.status !== 'realizada').length === 0 && <div className="empty">Nenhuma reunião próxima.</div>}
      {meetings.filter(m => m.status !== 'realizada').slice(0, 2).map((m) => (
        <div key={m.id} className="card meet-card">
          <div className="row-bw">
            <div>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{m.title}</div>
              <div className="muted">📍 {m.location}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="meet-date">{fmtDate(m.date)}</div>
              <div className="muted">{m.time}</div>
            </div>
          </div>
        </div>
      ))}
      <div style={{ height: 20 }} />
    </div>
  );
}
