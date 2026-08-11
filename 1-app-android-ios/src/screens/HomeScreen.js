import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StyleSheet } from 'react-native';
import { COLORS, S } from '../theme';
import TopBar from '../components/TopBar';
import { fetchTotalUsersCount, fetchDirectReferrals, fetchMeetings, fetchMessages } from '../lib/api';

export default function HomeScreen({ profile, onOpenAdmin, onGoToAgenda }) {
  const [totalUsers, setTotalUsers] = useState(0);
  const [directCount, setDirectCount] = useState(0);
  const [meetings, setMeetings] = useState([]);
  const [messages, setMessages] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [totalCount, directs, mts, msgs] = await Promise.all([
      fetchTotalUsersCount(),
      fetchDirectReferrals(profile.id),
      fetchMeetings(),
      fetchMessages()
    ]);
    setTotalUsers(totalCount);
    setDirectCount(directs.length);
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
              <Text style={S.muted}>Cadastros, eventos, mensagens{profile.role === 'admin' ? ' e o Dr. Candido' : ''}</Text>
            </View>
            <View style={[S.btn, S.btnViolet, { marginBottom: 0, paddingHorizontal: 16 }]}>
              <Text style={S.btnTextLight}>Abrir</Text>
            </View>
          </View>
        </TouchableOpacity>
      )}

      {/* Estatísticas da Rede */}
      <View style={styles.statsRow}>
        <View style={[S.card, styles.statBox, { borderColor: 'rgba(61, 217, 179, 0.15)' }]}>
          <Text style={styles.statLabel}>👥 Rede direta</Text>
          <Text style={[styles.statNum, { color: COLORS.teal }]}>{directCount}</Text>
          <Text style={styles.statSubText}>Indicados por você</Text>
        </View>
        <View style={[S.card, styles.statBox, { borderColor: 'rgba(123, 108, 244, 0.15)' }]}>
          <Text style={styles.statLabel}>🌐 Total sistema</Text>
          <Text style={[styles.statNum, { color: COLORS.violet }]}>{totalUsers}</Text>
          <Text style={styles.statSubText}>Usuários ativos</Text>
        </View>
      </View>

      {/* Estatísticas de Eventos Realizados */}
      <View style={styles.statsRow}>
        <View style={[S.card, styles.statBox, { borderColor: 'rgba(235, 94, 40, 0.15)' }]}>
          <Text style={styles.statLabel}>🏆 Eventos Realizados</Text>
          <Text style={[styles.statNum, { color: COLORS.gold }]}>{completedM.length}</Text>
          <Text style={styles.statSubText}>⏱️ {totalHours.toFixed(1)}h acumuladas</Text>
        </View>
        <View style={[S.card, styles.statBox, { borderColor: 'rgba(61, 217, 179, 0.15)' }]}>
          <Text style={styles.statLabel}>👥 Pessoas Presentes</Text>
          <Text style={[styles.statNum, { color: COLORS.teal }]}>{totalAttendees}</Text>
          <Text style={styles.statSubText}>Presenças confirmadas</Text>
        </View>
      </View>

      {messages.length > 0 && <Text style={[S.cardTitle, { marginTop: 16 }]}>Mensagens da Coordenação</Text>}
      {messages.map((m) => (
        <View key={m.id} style={[S.card, styles.msgBubble]}>
          <Text style={{ color: COLORS.ink1, fontSize: 13.5, lineHeight: 20 }}>{m.text}</Text>
          <Text style={styles.msgMeta}>📣 {m.profiles?.name || 'Coordenação'} · {new Date(m.created_at).toLocaleDateString('pt-BR')}</Text>
        </View>
      ))}

      <View style={[S.rowBetween, { marginTop: 16 }]}>
        <Text style={S.cardTitle}>Próximos Eventos</Text>
        <TouchableOpacity onPress={onGoToAgenda}><Text style={{ color: COLORS.violet, fontSize: 12, fontWeight: '700' }}>ver tudo</Text></TouchableOpacity>
      </View>
      {meetings.filter(m => m.status !== 'realizada').length === 0 && <Text style={[S.muted, { textAlign: 'center', padding: 20 }]}>Nenhum evento próximo.</Text>}
      {meetings.filter(m => m.status !== 'realizada').slice(0, 2).map((m) => (
        <View key={m.id} style={[S.card, styles.meetCard]}>
          <View style={S.rowBetween}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ color: COLORS.ink1, fontWeight: '700', fontSize: 13.5 }}>{m.title}</Text>
              <Text style={[S.muted, { fontSize: 11, marginTop: 2 }]}>📍 {m.location}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: COLORS.teal, fontFamily: 'monospace', fontSize: 11, fontWeight: '700' }}>{new Date(m.date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</Text>
              <Text style={[S.muted, { fontSize: 11, marginTop: 2 }]}>{m.time}</Text>
            </View>
          </View>
        </View>
      ))}
      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  adminCard: { backgroundColor: COLORS.violetDim, borderColor: COLORS.violet, borderRadius: 16 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statBox: { flex: 1, padding: 14, borderRadius: 16, backgroundColor: COLORS.panel2 },
  statLabel: { fontSize: 9.5, color: COLORS.ink2, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontWeight: '700' },
  statNum: { fontSize: 26, fontWeight: '800', marginVertical: 2 },
  statSubText: { fontSize: 9, color: COLORS.ink3, marginTop: 2 },
  msgBubble: { borderLeftWidth: 4, borderLeftColor: COLORS.violet, borderRadius: 16, padding: 14, backgroundColor: COLORS.panel2, marginBottom: 8 },
  msgMeta: { fontSize: 10, color: COLORS.ink3, marginTop: 6 },
  meetCard: { borderLeftWidth: 4, borderLeftColor: COLORS.teal, borderRadius: 16, padding: 14, backgroundColor: COLORS.panel2, marginBottom: 8 },
});
