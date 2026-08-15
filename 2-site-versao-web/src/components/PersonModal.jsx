function initials(name) { return (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase(); }
function roleLabel(role) { return role === 'admin' ? 'Admin' : role === 'coord' ? 'Coord' : 'Membro'; }
function roleClass(role) { return role === 'admin' ? 'role-admin' : role === 'coord' ? 'role-coord' : 'role-user'; }

export default function PersonModal({ person, sponsor, networkCount, onClose }) {
  if (!person) return null;

  const socials = [
    person.instagram && { key: 'instagram', label: 'Instagram', value: person.instagram, icon: '📸', url: `https://instagram.com/${person.instagram.replace('@', '')}` },
    person.facebook && { key: 'facebook', label: 'Facebook', value: person.facebook, icon: '📘', url: `https://facebook.com/${encodeURIComponent(person.facebook)}` },
    person.tiktok && { key: 'tiktok', label: 'TikTok', value: person.tiktok, icon: '🎵', url: `https://tiktok.com/${person.tiktok}` },
    (person.whatsapp || person.phone) && {
      key: 'whatsapp',
      label: 'WhatsApp',
      value: 'Conversar',
      icon: (
        <svg viewBox="0 0 448 512" width="18" height="18" fill="#25D366">
          <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-117zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
        </svg>
      ),
      url: `https://wa.me/${(person.whatsapp || person.phone).replace(/[^0-9]/g, '')}`
    },
  ].filter(Boolean);

  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="mhandle" />
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <div style={{ width: 90, height: 90, borderRadius: '50%', padding: 3, background: 'var(--teal)', margin: '0 auto' }}>
            <div className="av av-lg">
              {person.photo_url ? <img src={person.photo_url} alt="" /> : initials(person.name)}
            </div>
          </div>
          <h2 style={{ fontSize: 17, marginTop: 10 }}>{person.name}</h2>
          <div style={{ display: 'flex', gap: 6, marginTop: 5, justifyContent: 'center', alignItems: 'center' }}>
            <span className="id-badge">#{person.id}</span>
            <span className={`role-badge ${roleClass(person.role)}`}>{roleLabel(person.role)}</span>
          </div>
          {sponsor && <div className="muted" style={{ marginTop: 6 }}>Indicado por <b>{sponsor.name}</b> (#{sponsor.id})</div>}
          {typeof networkCount === 'number' && (
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--violet)', marginTop: 8 }}>
              🕸️ Rede acumulada: {networkCount} {networkCount === 1 ? 'membro' : 'membros'}
            </div>
          )}
        </div>

        <div className="card-title">Redes sociais — seguir</div>
        {socials.length === 0 && <div className="muted">Este membro ainda não cadastrou redes sociais.</div>}
        {socials.map((s) => (
          <a key={s.key} className="sc" href={s.url} target="_blank" rel="noreferrer">
            <div className="ic" style={{ background: 'var(--panel)' }}>{s.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: 'var(--ink2)' }}>{s.label}</div>
              <div style={{ fontWeight: 700 }}>{s.value}</div>
            </div>
            <div style={{ color: 'var(--teal)', fontSize: 11, fontWeight: 700 }}>Abrir</div>
          </a>
        ))}

        <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}
