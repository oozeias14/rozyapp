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
import BottomNav from './components/BottomNav';

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('owner');
  const [mode, setMode] = useState('app');
  const [adminInitialTab, setAdminInitialTab] = useState('users');
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
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
    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadProfile(authId) {
    const { data } = await supabase.from('profiles').select('*').eq('auth_id', authId).maybeSingle();
    setProfile(data);
    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setProfile(null); setTab('home'); setMode('app');
  }

  function openAdmin(initialTab) {
    setAdminInitialTab(initialTab || 'users');
    setMode('admin');
  }

  if (loading) {
    return <div className="app-shell"><div className="screen" style={{ textAlign: 'center', paddingTop: 100 }}>Carregando...</div></div>;
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
      {mode === 'admin' ? (
        <AdminScreen profile={profile} initialTab={adminInitialTab} onBack={() => setMode('app')} />
      ) : (
        <>
          {tab === 'home' && <HomeScreen profile={profile} onOpenAdmin={() => openAdmin('users')} onGoToAgenda={() => setTab('agenda')} />}
          {tab === 'network' && <NetworkScreen profile={profile} />}
          {tab === 'agenda' && <AgendaScreen profile={profile} />}
          {tab === 'profile' && (
            <ProfileScreen profile={profile} onProfileUpdated={setProfile} onOpenAdmin={() => openAdmin('users')} onLogout={handleLogout} />
          )}
          {tab === 'owner' && <OwnerScreen profile={profile} onOpenAdminOwner={() => openAdmin('owner')} />}
          <BottomNav active={tab} onChange={setTab} />
        </>
      )}
    </div>
  );
}
