import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { supabase } from './src/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    if (!profile) {
      setTimeLeft(null);
      return;
    }
    const isStaff = profile.role === 'admin' || profile.role === 'coord';
    const limitSeconds = isStaff ? 30 * 60 : 10 * 60;

    let active = true;

    async function initTimer() {
      try {
        let startTime = await AsyncStorage.getItem('session_start_time');
        if (!startTime) {
          startTime = Date.now().toString();
          await AsyncStorage.setItem('session_start_time', startTime);
        }
        const elapsedSeconds = Math.floor((Date.now() - parseInt(startTime, 10)) / 1000);
        const remainingSeconds = limitSeconds - elapsedSeconds;

        if (remainingSeconds <= 0) {
          if (active) handleLogout();
          return;
        }

        if (active) setTimeLeft(remainingSeconds);
      } catch (e) {
        if (active) setTimeLeft(limitSeconds);
      }
    }

    initTimer();

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

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [profile]);

  function formatTime(seconds) {
    if (seconds === null) return '';
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

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
    setTab('owner');
    setLoading(false);
  }

  async function handleLogout() {
    await AsyncStorage.removeItem('session_start_time');
    try {
      await supabase.removeAllChannels();
    } catch (e) {
      console.log('Error removing channels:', e);
    }
    await supabase.auth.signOut();
    setProfile(null);
    setTab('owner');
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

      {timeLeft !== null && (
        <View style={styles.timerContainer}>
          <View style={styles.timerBadge}>
            <View style={styles.timerDot} />
            <Text style={styles.timerText}>Sessão: {formatTime(timeLeft)}</Text>
          </View>
        </View>
      )}

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
  timerContainer: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(18, 24, 38, 0.85)',
    borderColor: 'rgba(61, 217, 179, 0.3)',
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  timerDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: COLORS.teal,
    marginRight: 6,
  },
  timerText: {
    color: '#F0F4FA',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
