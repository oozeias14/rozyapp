import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { supabase } from './src/lib/supabase';
import { COLORS } from './src/theme';
import AuthScreen from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';
import NetworkScreen from './src/screens/NetworkScreen';
import AgendaScreen from './src/screens/AgendaScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import OwnerScreen from './src/screens/OwnerScreen';
import AdminScreen from './src/screens/AdminScreen';
import BottomNav from './src/components/BottomNav';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('owner');
  const [mode, setMode] = useState('app'); // 'app' | 'admin'
  const [adminInitialTab, setAdminInitialTab] = useState('users');

  useEffect(() => {
    Notifications.requestPermissionsAsync().catch(() => {});

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadProfile(session.user.id);
      else setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
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
    setProfile(null);
    setTab('home');
    setMode('app');
  }

  function openAdmin(initialTab) {
    setAdminInitialTab(initialTab || 'users');
    setMode('admin');
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.teal} size="large" />
      </View>
    );
  }

  if (!session || !profile) {
    return (
      <>
        <StatusBar style="light" />
        <AuthScreen onLoggedIn={(user) => loadProfile(user.id)} />
      </>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {mode === 'admin' ? (
        <AdminScreen profile={profile} initialTab={adminInitialTab} onBack={() => setMode('app')} />
      ) : (
        <>
          {tab === 'home' && <HomeScreen profile={profile} onOpenAdmin={() => openAdmin('users')} onGoToAgenda={() => setTab('agenda')} />}
          {tab === 'network' && <NetworkScreen profile={profile} />}
          {tab === 'agenda' && <AgendaScreen profile={profile} />}
          {tab === 'profile' && (
            <ProfileScreen
              profile={profile}
              onProfileUpdated={(p) => setProfile(p)}
              onOpenAdmin={() => openAdmin('users')}
              onLogout={handleLogout}
            />
          )}
          {tab === 'owner' && <OwnerScreen profile={profile} onOpenAdminOwner={() => openAdmin('owner')} />}
          <BottomNav active={tab} onChange={setTab} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
});
