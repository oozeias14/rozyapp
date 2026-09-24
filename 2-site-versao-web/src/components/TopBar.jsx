import { useEffect, useState } from 'react';

export default function TopBar({ totalUsers }) {
  const [theme, setThemeState] = useState(() => {
    return localStorage.getItem('app_theme') || 'dark';
  });
  const [sessionTimeStr, setSessionTimeStr] = useState('');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const updateTime = () => {
      const startTime = localStorage.getItem('session_start_time');
      if (!startTime) {
        setSessionTimeStr('');
        return;
      }
      const elapsedSeconds = Math.floor((Date.now() - parseInt(startTime, 10)) / 1000);
      const isStaff = localStorage.getItem('is_staff_user') === 'true';
      const limitSeconds = isStaff ? 30 * 60 : 10 * 60;
      const remainingSeconds = Math.max(0, limitSeconds - elapsedSeconds);
      
      const m = Math.floor(remainingSeconds / 60).toString().padStart(2, '0');
      const s = (remainingSeconds % 60).toString().padStart(2, '0');
      setSessionTimeStr(`${m}:${s}`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  function toggleTheme() {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setThemeState(nextTheme);
    localStorage.setItem('app_theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  }

  return (
    <div className="topbar" style={{ alignItems: 'flex-start' }}>
      <div className="brand" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <div className="dot" />
          <span style={{ fontSize: 13, fontWeight: 700 }}>Amigos Dr Candido</span>
        </div>
        {sessionTimeStr && (
          <div 
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 7px',
              background: 'var(--panel2)',
              border: '1px solid var(--line)',
              borderRadius: '12px',
              fontSize: '9.5px',
              fontWeight: '600',
              color: 'var(--ink2)',
              marginLeft: '16px',
              letterSpacing: '0.02em',
              userSelect: 'none'
            }}
          >
            <div style={{
              width: '4px',
              height: '4px',
              borderRadius: '50%',
              backgroundColor: 'var(--teal)',
              boxShadow: '0 0 5px var(--teal)',
              animation: 'timerPulse 1.5s infinite'
            }} />
            <span>Sessão: {sessionTimeStr}</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          type="button"
          onClick={toggleTheme}
          style={{
            background: 'var(--panel2)',
            border: '1px solid var(--line)',
            borderRadius: '999px',
            padding: '5px 11px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--ink1)',
            fontSize: '11.5px',
            fontWeight: '600',
            transition: 'all 0.25s ease',
            outline: 'none',
            boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
          }}
          title={theme === 'dark' ? 'Mudar para Modo Claro (White)' : 'Mudar para Modo Escuro (Dark)'}
        >
          {theme === 'dark' ? (
            <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#E8C547' }}>
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
              <span style={{ color: 'var(--ink2)', fontSize: '11px' }}>Claro</span>
            </>
          ) : (
            <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#F59E0B' }}>
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="1" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
              <span style={{ color: 'var(--ink2)', fontSize: '11px' }}>Escuro</span>
            </>
          )}
        </button>
        {totalUsers !== undefined && (
          <div className="pill">🌐 <b>{totalUsers}</b></div>
        )}
      </div>
    </div>
  );
}

