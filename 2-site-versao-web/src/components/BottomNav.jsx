const ICONS = {
  home: <svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>,
  network: <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2.2"/><circle cx="5" cy="19" r="2.2"/><circle cx="19" cy="19" r="2.2"/><path d="M12 7.2v6M12 13.2L6.4 17M12 13.2L17.6 17"/></svg>,
  agenda: <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>,
  profile: <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c1.6-3.5 4.5-5.3 7.5-5.3s5.9 1.8 7.5 5.3"/></svg>,
  owner: <svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>,
};

const TABS = [
  { key: 'owner', label: 'Dr. Candido' },
  { key: 'home', label: 'Mural' },
  { key: 'network', label: 'Rede' },
  { key: 'agenda', label: 'Agenda' },
  { key: 'profile', label: 'Perfil' },
];

export default function BottomNav({ active, onChange }) {
  return (
    <div className="bnav">
      {TABS.map((t) => (
        <button key={t.key} className={`ni${active === t.key ? ' on' : ''}`} onClick={() => onChange(t.key)}>
          {ICONS[t.key]}
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}
