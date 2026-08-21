const ICONS = {
  home: <svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>,
  network: <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2.2"/><circle cx="5" cy="19" r="2.2"/><circle cx="19" cy="19" r="2.2"/><path d="M12 7.2v6M12 13.2L6.4 17M12 13.2L17.6 17"/></svg>,
  agenda: <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>,
  profile: <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c1.6-3.5 4.5-5.3 7.5-5.3s5.9 1.8 7.5 5.3"/></svg>,
  owner: <svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>,
  mass_signup: (
    <svg viewBox="0 0 24 24">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  ),
  qrcode: (
    <svg viewBox="0 0 24 24">
      <path d="M3 3h8v8H3zm2 2v4h4V5z" />
      <path d="M13 3h8v8h-8zm2 2v4h4V5z" />
      <path d="M3 13h8v8H3zm2 2v4h4v-4z" />
      <path d="M13 13h3v3h-3zm5 0h3v3h-3zm0 5h3v3h-3zm-5 0h3v3h-3z" />
      <path d="M16 16h2v2h-2zm2 2h2v2h-2z" />
    </svg>
  ),
};

export default function BottomNav({ active, onChange, profile, hasNewMuralMessage }) {
  const isStaff = profile?.role === 'admin' || profile?.role === 'coord';

  const tabs = [
    { key: 'owner', label: 'Dr. Candido' },
    { key: 'home', label: 'Mural' },
    { key: 'network', label: 'Rede' },
    { key: 'agenda', label: 'Eventos' },
    isStaff && { key: 'mass_signup', label: 'Cadastro' },
    { key: 'qrcode', label: 'QR Code' },
    { key: 'profile', label: 'Perfil' },
  ].filter(Boolean);

  return (
    <div className="bnav" style={{ flexDirection: 'column', padding: 0 }}>
      {/* Texto de Campanha fixado acima dos botões */}
      <div style={{
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '10px 0',
        background: 'rgba(9, 13, 22, 0.95)',
        borderBottom: '1px solid var(--line)',
        userSelect: 'none'
      }}>
        <span style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: '17.5px',
          fontWeight: 900,
          letterSpacing: '3.8px',
          background: 'linear-gradient(90deg, #FFF9D2, var(--gold), #FFB703)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          textShadow: '0 0 12px rgba(232, 197, 71, 0.15)'
        }}>
          VOTE DR. CANDIDO 15.678
        </span>
      </div>

      {/* Botões de Navegação */}
      <div style={{ display: 'flex', width: '100%', padding: '8px 4px calc(10px + env(safe-area-inset-bottom))' }}>
        {tabs.map((t) => (
          <button key={t.key} className={`ni${active === t.key ? ' on' : ''}`} onClick={() => onChange(t.key)} style={{ position: 'relative' }}>
            {ICONS[t.key]}
            {t.key === 'home' && hasNewMuralMessage && (
              <span style={{
                position: 'absolute',
                top: '6px',
                right: '32%',
                width: '8px',
                height: '8px',
                backgroundColor: '#FF3B30',
                borderRadius: '50%',
                border: '1.5px solid #090c12'
              }} />
            )}
            <span>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
