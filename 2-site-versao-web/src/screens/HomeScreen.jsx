import { useEffect, useState, useCallback } from 'react';
import TopBar from '../components/TopBar';
import { fetchTotalUsersCount, fetchDirectReferrals, fetchMeetings, fetchMessages } from '../lib/api';

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
    const [totalCount, directs, mts, msgs] = await Promise.all([
      fetchTotalUsersCount(),
      fetchDirectReferrals(profile.id),
      fetchMeetings(),
      fetchMessages()
    ]);
    setTotalUsers(totalCount);
    setDirectCount(directs.length);
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
        <div className="card" style={{ background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.15), rgba(138, 43, 226, 0.05))', borderColor: 'var(--violet)', cursor: 'pointer' }} onClick={onOpenAdmin}>
          <div className="row-bw">
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>⚙️ Painel {profile.role === 'admin' ? 'Admin' : 'Coordenador'}</div>
              <div className="muted">Cadastros, eventos, mensagens{profile.role === 'admin' ? ' e o Dr. Candido' : ''}</div>
            </div>
            <button className="btn btn-violet btn-sm">Abrir</button>
          </div>
        </div>
      )}

      {/* Estatísticas da Rede e Eventos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div className="card stat-card-premium" style={{ margin: 0, background: 'linear-gradient(135deg, rgba(22, 28, 44, 0.95), rgba(13, 17, 28, 0.98))', border: '1.5px solid rgba(0, 242, 254, 0.15)', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)', borderRadius: 16 }}>
          <div className="card-title" style={{ fontSize: 10, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>👥 Rede Direta</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--teal)', marginTop: 4 }}>{directCount}</div>
          <div className="muted" style={{ fontSize: 9.5, marginTop: 4 }}>Indicados por você</div>
        </div>
        <div className="card stat-card-premium" style={{ margin: 0, background: 'linear-gradient(135deg, rgba(22, 28, 44, 0.95), rgba(13, 17, 28, 0.98))', border: '1.5px solid rgba(138, 43, 226, 0.15)', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)', borderRadius: 16 }}>
          <div className="card-title" style={{ fontSize: 10, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>🌐 Total Sistema</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--violet)', marginTop: 4 }}>{totalUsers}</div>
          <div className="muted" style={{ fontSize: 9.5, marginTop: 4 }}>Usuários ativos</div>
        </div>
        <div className="card stat-card-premium" style={{ margin: 0, background: 'linear-gradient(135deg, rgba(22, 28, 44, 0.95), rgba(13, 17, 28, 0.98))', border: '1.5px solid rgba(255, 215, 0, 0.15)', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)', borderRadius: 16 }}>
          <div className="card-title" style={{ fontSize: 10, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>🏆 Eventos Realizados</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--gold)', marginTop: 4 }}>{completedM.length}</div>
          <div className="muted" style={{ fontSize: 9.5, marginTop: 4 }}>⏱️ {totalHours.toFixed(1)}h acumuladas</div>
        </div>
        <div className="card stat-card-premium" style={{ margin: 0, background: 'linear-gradient(135deg, rgba(22, 28, 44, 0.95), rgba(13, 17, 28, 0.98))', border: '1.5px solid rgba(0, 242, 254, 0.15)', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)', borderRadius: 16 }}>
          <div className="card-title" style={{ fontSize: 10, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>👥 Pessoas Presentes</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--teal)', marginTop: 4 }}>{totalAttendees}</div>
          <div className="muted" style={{ fontSize: 9.5, marginTop: 4 }}>Presenças confirmadas</div>
        </div>
      </div>

      {messages.length > 0 && <div className="card-title" style={{ marginTop: 20 }}>Mensagens da Coordenação</div>}
      {messages.map((m) => (
        <div key={m.id} className="msg-bubble-premium">
          <div style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink1)' }}>{m.text}</div>
          <div className="msg-meta" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 10.5, color: 'var(--ink3)' }}>
            <span>📣 {m.profiles?.name || 'Coordenação'}</span>
            <span>·</span>
            <span>{new Date(m.created_at).toLocaleDateString('pt-BR')}</span>
          </div>
        </div>
      ))}

      <div className="row-bw" style={{ marginTop: 20, marginBottom: 8 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>Próximos Eventos</div>
        <span style={{ color: 'var(--violet)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }} onClick={onGoToAgenda}>ver tudo</span>
      </div>
      {meetings.filter(m => m.status !== 'realizada').length === 0 && <div className="empty">Nenhum evento próximo.</div>}
      {meetings.filter(m => m.status !== 'realizada').slice(0, 2).map((m) => (
        <div key={m.id} className="card meet-card-premium" style={{ marginBottom: 8, padding: 14 }}>
          <div className="row-bw">
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink1)' }}>{m.title}</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>📍 {m.location}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="meet-date" style={{ fontWeight: 700 }}>{fmtDate(m.date)}</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{m.time}</div>
            </div>
          </div>
        </div>
      ))}
      <div style={{ height: 20 }} />
    </div>
  );
}
