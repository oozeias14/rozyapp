function initials(name) { return (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase(); }
function roleLabel(role) { return role === 'admin' ? 'Admin' : role === 'coord' ? 'Coord' : 'Membro'; }
function roleClass(role) { return role === 'admin' ? 'role-admin' : role === 'coord' ? 'role-coord' : 'role-user'; }

export default function PersonModal({ person, sponsor, onClose }) {
  if (!person) return null;

  const socials = [
    person.instagram && { key: 'instagram', label: 'Instagram', value: person.instagram, icon: '📸', url: `https://instagram.com/${person.instagram.replace('@', '')}` },
    person.facebook && { key: 'facebook', label: 'Facebook', value: person.facebook, icon: '📘', url: `https://facebook.com/${encodeURIComponent(person.facebook)}` },
    person.tiktok && { key: 'tiktok', label: 'TikTok', value: person.tiktok, icon: '🎵', url: `https://tiktok.com/${person.tiktok}` },
    person.whatsapp && { key: 'whatsapp', label: 'WhatsApp', value: 'Conversar', icon: '💬', url: `https://wa.me/${person.whatsapp}` },
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
