import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StyleSheet } from 'react-native';
import { COLORS, S } from '../theme';
import TopBar from '../components/TopBar';
import { fetchAllProfiles, fetchMeetings, fetchMessages } from '../lib/api';

export default function HomeScreen({ profile, onOpenAdmin, onGoToAgenda }) {
  const [totalUsers, setTotalUsers] = useState(0);
  const [directCount, setDirectCount] = useState(0);
  const [meetings, setMeetings] = useState([]);
  const [messages, setMessages] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [profiles, mts, msgs] = await Promise.all([fetchAllProfiles(), fetchMeetings(), fetchMessages()]);
    setTotalUsers(profiles.length);
    setDirectCount(profiles.filter((p) => p.referrer_id === profile.id).length);
    setMeetings(mts);
    setMessages(msgs.slice(0, 2));
  }, [profile.id]);

  useEffect(() => { load(); }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const isStaff = profile.role === 'admin' || profile.role === 'coord';

  // Estatísticas transparentes
  const completedM = meetings.filter((m) => m.status === 'realizada');
  const totalHours = completedM.reduce((acc, m) => acc + (m.duration_minutes || 0) / 60, 0);
  const totalAttendees = completedM.reduce((acc, m) => acc + (m.attendees_count || 0), 0);

  return (
    <ScrollView style={S.screen} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.teal} />}>
      <TopBar totalUsers={totalUsers} />

      <View style={S.card}>
        <View style={S.rowBetween}>
          <View>
            <Text style={S.cardTitle}>Olá</Text>
            <Text style={{ color: COLORS.ink1, fontSize: 18, fontWeight: '700' }}>{profile.name.split(' ')[0]} 👋</Text>
            <Text style={S.muted}>ID <Text style={S.idBadge}>#{profile.id}</Text> · {directCount} indicados diretos</Text>
          </View>
        </View>
      </View>

      {isStaff && (
        <TouchableOpacity style={[S.card, styles.adminCard]} onPress={onOpenAdmin}>
          <View style={S.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.ink1, fontWeight: '700', fontSize: 13.5 }}>⚙️ Painel {profile.role === 'admin' ? 'Admin' : 'Coordenador'}</Text>
              <Text style={S.muted}>Cadastros, reuniões, mensagens{profile.role === 'admin' ? ' e o Dr. Candido' : ''}</Text>
            </View>
            <View style={[S.btn, S.btnViolet, { marginBottom: 0, paddingHorizontal: 16 }]}>
              <Text style={S.btnTextLight}>Abrir</Text>
            </View>
          </View>
        </TouchableOpacity>
      )}

      {/* Estatísticas da Rede */}
      <View style={styles.statsRow}>
        <View style={[S.card, styles.statBox]}>
          <Text style={S.cardTitle}>Rede direta</Text>
          <Text style={[styles.statNum, { color: COLORS.teal }]}>{directCount}</Text>
        </View>
        <View style={[S.card, styles.statBox]}>
          <Text style={S.cardTitle}>Total sistema</Text>
          <Text style={[styles.statNum, { color: COLORS.violet }]}>{totalUsers}</Text>
        </View>
      </View>

      {/* Estatísticas de Reuniões Realizadas */}
      <View style={styles.statsRow}>
        <View style={[S.card, styles.statBox]}>
          <Text style={S.cardTitle}>Reuniões Realizadas</Text>
          <Text style={[styles.statNum, { color: COLORS.gold }]}>{completedM.length}</Text>
          <Text style={{ color: COLORS.ink2, fontSize: 11, marginTop: 4 }}>⏱️ {totalHours.toFixed(1)}h acumuladas</Text>
        </View>
        <View style={[S.card, styles.statBox]}>
          <Text style={S.cardTitle}>Pessoas Presentes</Text>
          <Text style={[styles.statNum, { color: COLORS.teal }]}>{totalAttendees}</Text>
          <Text style={{ color: COLORS.ink2, fontSize: 11, marginTop: 4 }}>👥 presentes no total</Text>
        </View>
      </View>

      {messages.length > 0 && <Text style={S.cardTitle}>Mensagens da coordenação</Text>}
      {messages.map((m) => (
        <View key={m.id} style={[S.card, styles.msgBubble]}>
          <Text style={{ color: COLORS.ink1, fontSize: 13, lineHeight: 19 }}>{m.text}</Text>
          <Text style={styles.msgMeta}>📣 {m.profiles?.name || 'Coordenação'} · {new Date(m.created_at).toLocaleDateString('pt-BR')}</Text>
        </View>
      ))}

      <View style={S.rowBetween}>
        <Text style={S.cardTitle}>Próximas reuniões</Text>
        <TouchableOpacity onPress={onGoToAgenda}><Text style={{ color: COLORS.violet, fontSize: 11 }}>ver tudo</Text></TouchableOpacity>
      </View>
      {meetings.filter(m => m.status !== 'realizada').length === 0 && <Text style={[S.muted, { textAlign: 'center', padding: 20 }]}>Nenhuma reunião próxima.</Text>}
      {meetings.filter(m => m.status !== 'realizada').slice(0, 2).map((m) => (
        <View key={m.id} style={[S.card, styles.meetCard]}>
          <View style={S.rowBetween}>
            <View>
              <Text style={{ color: COLORS.ink1, fontWeight: '600', fontSize: 13.5 }}>{m.title}</Text>
              <Text style={S.muted}>📍 {m.location}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: COLORS.teal, fontFamily: 'monospace', fontSize: 11 }}>{new Date(m.date).toLocaleDateString('pt-BR')}</Text>
              <Text style={S.muted}>{m.time}</Text>
            </View>
          </View>
        </View>
      ))}
      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  adminCard: { backgroundColor: COLORS.violetDim, borderColor: COLORS.violet },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  statBox: { flex: 1 },
  statNum: { fontSize: 24, fontWeight: '700' },
  msgBubble: { borderLeftWidth: 3, borderLeftColor: COLORS.violet },
  msgMeta: { fontSize: 10.5, color: COLORS.ink3, marginTop: 6 },
  meetCard: { borderLeftWidth: 3, borderLeftColor: COLORS.violet },
});
