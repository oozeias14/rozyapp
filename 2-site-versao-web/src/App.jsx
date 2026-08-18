import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import AuthScreen from './screens/AuthScreen';
import ResetPasswordScreen from './screens/ResetPasswordScreen';
import HomeScreen from './screens/HomeScreen';
import NetworkScreen from './screens/NetworkScreen';
import AgendaScreen from './screens/AgendaScreen';
import ProfileScreen from './screens/ProfileScreen';
import OwnerScreen from './screens/OwnerScreen';
import AdminScreen from './screens/AdminScreen';
import MassSignupScreen from './screens/MassSignupScreen';
import SupportScreen from './screens/SupportScreen';
import QrCodeScreen from './screens/QrCodeScreen';
import BottomNav from './components/BottomNav';
import FirstAccessModal from './components/FirstAccessModal';

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('owner');
  const [mode, setMode] = useState('app');
  const [adminInitialTab, setAdminInitialTab] = useState('users');
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);
  const [hasNewMuralMessage, setHasNewMuralMessage] = useState(false);
  const [showFirstAccessModal, setShowFirstAccessModal] = useState(false);

  useEffect(() => {
    if (!profile) {
      setTimeLeft(null);
      return;
    }
    const isStaff = profile.role === 'admin' || profile.role === 'admin2' || profile.role === 'coord';
    const limitSeconds = isStaff ? 30 * 60 : 10 * 60;

    let startTime = localStorage.getItem('session_start_time');
    if (!startTime) {
      startTime = Date.now().toString();
      localStorage.setItem('session_start_time', startTime);
    }

    const elapsedSeconds = Math.floor((Date.now() - parseInt(startTime, 10)) / 1000);
    const remainingSeconds = limitSeconds - elapsedSeconds;

    if (remainingSeconds <= 0) {
      handleLogout();
      return;
    }

    setTimeLeft(remainingSeconds);

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(interval);
          handleLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [profile]);

  function formatTime(seconds) {
    if (seconds === null) return '';
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  const timerStyle = {
    position: 'fixed',
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    background: 'rgba(18, 24, 38, 0.85)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(61, 217, 179, 0.25)',
    borderRadius: '16px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: '11px',
    fontWeight: '600',
    color: '#F0F4FA',
    pointerEvents: 'none',
    letterSpacing: '0.03em',
  };

  const dotStyle = {
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    backgroundColor: '#3DD9B3',
    boxShadow: '0 0 6px #3DD9B3',
    animation: 'timerPulse 1.5s infinite',
  };

  useEffect(() => {
    // Detect password recovery in URL hash or search params (fallback)
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    if (hash.includes('type=recovery') || search.includes('type=recovery') || hash.includes('error_code=')) {
      setPasswordRecovery(true);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadProfile(session.user.id);
      else setLoading(false);
    });
    // Quando a pessoa clica no link de "esqueci minha senha" recebido por
    // e-mail, o Supabase abre o site de volta e dispara este evento —
    // aqui a gente mostra a tela de "criar nova senha" em vez do app normal.
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') { setPasswordRecovery(true); setLoading(false); return; }
      setSession(session);
      if (session) loadProfile(session.user.id);
      else { setProfile(null); setLoading(false); }
    });

    function handleMessagesRead() {
      setHasNewMuralMessage(false);
    }
    window.addEventListener('mural_messages_read', handleMessagesRead);

    return () => {
      listener.subscription.unsubscribe();
      window.removeEventListener('mural_messages_read', handleMessagesRead);
    };
  }, []);

  useEffect(() => {
    if (profile && session?.user?.user_metadata?.via_mass_signup) {
      const isDismissed = localStorage.getItem(`first_access_popup_dismissed_${profile.id}`);
      if (!isDismissed) {
        setShowFirstAccessModal(true);
      }
    }
  }, [profile, session]);

  async function checkForNewMessages(profileId) {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('id')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (!error && data) {
        const lastRead = localStorage.getItem('last_read_message_id_' + profileId);
        if (!lastRead || parseInt(lastRead, 10) < data.id) {
          setHasNewMuralMessage(true);
        }
      }
    } catch (e) {
      console.log('Error checking messages:', e);
    }
  }

  async function loadProfile(authId) {
    const { data } = await supabase.from('profiles').select('*').eq('auth_id', authId).maybeSingle();
    setProfile((prev) => {
      if (!prev) setTab('owner');
      return data;
    });
    setLoading(false);
    if (data) {
      checkForNewMessages(data.id);
    }
  }

  async function handleLogout() {
    localStorage.removeItem('session_start_time');
    await supabase.auth.signOut();
    window.location.reload();
  }

  function openAdmin(initialTab) {
    setAdminInitialTab(initialTab || 'users');
    setMode('admin');
  }

  if (loading) {
    return <div className="app-shell"><div className="screen" style={{ textAlign: 'center', paddingTop: 100 }}>Carregando...</div></div>;
  }

  const isPrivacyPage = window.location.pathname === '/privacidade' || window.location.pathname === '/privacy';
  const isSupportPage = window.location.pathname === '/suporte';

  if (isSupportPage) {
    return <SupportScreen />;
  }

  if (isPrivacyPage) {
    return (
      <div className="app-shell">
        <div className="screen" style={{ overflowY: 'auto', padding: '24px 20px', color: 'var(--ink1)', lineHeight: 1.6 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16, color: 'var(--teal)' }}>Política de Privacidade</h1>
          <p style={{ fontSize: 13, marginBottom: 12, color: 'var(--ink2)' }}>Última atualização: 15 de agosto de 2026</p>
          
          <p style={{ fontSize: 13, marginBottom: 12 }}>
            Esta Política de Privacidade descreve como o aplicativo <strong>Amigos Dr. Candido</strong> coleta, usa e compartilha suas informações pessoais ao utilizar nossos serviços.
          </p>

          <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 20, marginBottom: 8, color: 'var(--violet)' }}>1. Informações que Coletamos</h2>
          <p style={{ fontSize: 13, marginBottom: 12 }}>
            Para utilizar o aplicativo, coletamos informações básicas fornecidas diretamente por você no momento do cadastro, tais como nome completo, endereço de e-mail e número de telefone/WhatsApp.
          </p>

          <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 20, marginBottom: 8, color: 'var(--violet)' }}>2. Como Usamos as Informações</h2>
          <p style={{ fontSize: 13, marginBottom: 12 }}>
            Utilizamos os dados coletados exclusivamente para gerenciar sua conta de acesso, permitir a visualização de sua rede de indicações, possibilitar o contato entre patrocinadores e indicados via WhatsApp e viabilizar o recebimento de novidades no mural.
          </p>

          <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 20, marginBottom: 8, color: 'var(--violet)' }}>3. Compartilhamento de Dados</h2>
          <p style={{ fontSize: 13, marginBottom: 12 }}>
            Seus dados de contato (nome e WhatsApp) ficam visíveis apenas para o seu patrocinador direto na aba de acompanhamento da rede, a fim de possibilitar ajuda mútua. Não compartilhamos, vendemos ou alugamos seus dados para terceiros.
          </p>

          <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 20, marginBottom: 8, color: 'var(--violet)' }}>4. Seus Direitos</h2>
          <p style={{ fontSize: 13, marginBottom: 12 }}>
            Você pode solicitar a alteração ou exclusão definitiva dos seus dados a qualquer momento entrando em contato com o suporte ou solicitando a exclusão de conta através das configurações do aplicativo.
          </p>

          <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 20, marginBottom: 8, color: 'var(--violet)' }}>5. Contato</h2>
          <p style={{ fontSize: 13, marginBottom: 12 }}>
            Se você tiver alguma dúvida sobre esta Política de Privacidade, entre em contato através do e-mail oficial do desenvolvedor.
          </p>
          
          <div style={{ marginTop: 30, borderTop: '1px solid var(--line)', paddingTop: 16, textAlign: 'center' }}>
            <button className="btn btn-ghost" onClick={() => window.location.href = '/'}>Voltar ao Início</button>
          </div>
        </div>
      </div>
    );
  }

  if (passwordRecovery) {
    return (
      <div className="app-shell">
        <ResetPasswordScreen onDone={async () => {
          setPasswordRecovery(false);
          await supabase.auth.signOut();
        }} />
      </div>
    );
  }

  if (!session || !profile) {
    return <div className="app-shell"><AuthScreen onLoggedIn={(user) => loadProfile(user.id)} /></div>;
  }

  return (
    <div className="app-shell">
      {showFirstAccessModal && (
        <FirstAccessModal 
          profile={profile} 
          onClose={() => setShowFirstAccessModal(false)} 
        />
      )}
      {timeLeft !== null && (
        <div style={timerStyle}>
          <style>{`
            @keyframes timerPulse {
              0% { opacity: 0.4; }
              50% { opacity: 1; }
              100% { opacity: 0.4; }
            }
          `}</style>
          <div style={dotStyle} />
          <span>Sessão: {formatTime(timeLeft)}</span>
        </div>
      )}
      {mode === 'admin' ? (
        <AdminScreen profile={profile} initialTab={adminInitialTab} onBack={() => setMode('app')} />
      ) : (
        <>
          {tab === 'home' && <HomeScreen profile={profile} onOpenAdmin={() => openAdmin('users')} onGoToAgenda={() => setTab('agenda')} />}
          {tab === 'network' && <NetworkScreen profile={profile} />}
          {tab === 'agenda' && <AgendaScreen profile={profile} />}
          {tab === 'qrcode' && <QrCodeScreen profile={profile} />}
          {tab === 'profile' && (
            <ProfileScreen profile={profile} onProfileUpdated={setProfile} onOpenAdmin={() => openAdmin('users')} onLogout={handleLogout} />
          )}
          {tab === 'mass_signup' && <MassSignupScreen profile={profile} />}
          {tab === 'owner' && <OwnerScreen profile={profile} onOpenAdminOwner={() => openAdmin('owner')} />}
          <BottomNav active={tab} onChange={setTab} profile={profile} hasNewMuralMessage={hasNewMuralMessage} />
        </>
      )}
    </div>
  );
}
