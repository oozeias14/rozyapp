import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, RefreshControl, StyleSheet, Dimensions } from 'react-native';
import { COLORS, S, roleLabel, roleStyle } from '../theme';
import TopBar from '../components/TopBar';
import PersonModal from '../components/PersonModal';
import { fetchAllProfiles, fetchProfileById, fetchDirectChildren } from '../lib/api';

const ORBIT_SIZE = 230;
const R = 95;
const CX = ORBIT_SIZE / 2;
const CY = ORBIT_SIZE / 2;

export default function NetworkScreen({ profile }) {
  const [totalUsers, setTotalUsers] = useState(0);
  const [sponsor, setSponsor] = useState(null);
  const [coord, setCoord] = useState(null);
  const [direct, setDirect] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [selectedSponsor, setSelectedSponsor] = useState(null);

  const load = useCallback(async () => {
    const all = await fetchAllProfiles();
    setTotalUsers(all.length);
    setDirect(all.filter((p) => p.parent_id === profile.id));
    setSponsor(profile.parent_id ? all.find((p) => p.id === profile.parent_id) : null);
    setCoord(profile.coord_id ? all.find((p) => p.id === profile.coord_id) : null);
  }, [profile.id, profile.parent_id, profile.coord_id]);

  useEffect(() => { load(); }, [load]);

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false); }

  async function openPerson(p) {
    setSelectedPerson(p);
    setSelectedSponsor(p.parent_id ? await fetchProfileById(p.parent_id) : null);
  }

  const slots = Array.from({ length: 10 }, (_, i) => direct[i] || null);

  return (
    <View style={S.screen}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.teal} />}>
        <TopBar totalUsers={totalUsers} />

        {coord && (
          <View style={S.card}>
            <Text style={S.cardTitle}>Seu Coordenador / Patrocinador</Text>
            <View style={S.rowBetween}>
              <TouchableOpacity style={styles.personRow} onPress={() => openPerson(coord)}>
                <Avatar person={coord} size={36} />
                <View>
                  <Text style={{ color: COLORS.ink1, fontWeight: '600', fontSize: 13.5 }}>{coord.name}</Text>
                  <Text style={S.muted}>{coord.role === 'admin' ? 'Admin' : 'Coordenador'}</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <Text style={S.cardTitle}>Seus 10 slots diretos</Text>
        <View style={styles.orbitWrap}>
          <View style={styles.orbit}>
            <View style={styles.orbitRing} />
            {slots.map((s, i) => {
              const ang = (Math.PI * 2 / 10) * i - Math.PI / 2;
              const x = CX + R * Math.cos(ang);
              const y = CY + R * Math.sin(ang);
              return s ? (
                <TouchableOpacity key={i} style={[styles.slot, styles.slotFilled, { left: x - 16, top: y - 16 }]} onPress={() => openPerson(s)}>
                  <Text style={{ color: COLORS.teal, fontSize: 10, fontWeight: '700' }}>{initials(s.name)}</Text>
                </TouchableOpacity>
              ) : (
                <View key={i} style={[styles.slot, styles.slotEmpty, { left: x - 16, top: y - 16 }]}>
                  <Text style={{ color: COLORS.ink3, fontSize: 10.5, fontWeight: '700' }}>{i + 1}</Text>
                </View>
              );
            })}
            <View style={styles.orbitCenter}>
              <Text style={{ color: '#fff', fontFamily: 'monospace', fontWeight: '700' }}>#{profile.id}</Text>
            </View>
          </View>
          <Text style={[S.muted, { marginTop: 6 }]}>{Math.min(direct.length, 10)}/10 slots preenchidos</Text>
        </View>

        <Text style={S.cardTitle}>Todos os seus indicados diretos ({direct.length})</Text>
        <View style={S.card}>
          {direct.length === 0 && <Text style={[S.muted, { textAlign: 'center', padding: 10 }]}>Nenhum indicado ainda.{'\n'}Compartilhe seu código em Perfil.</Text>}
          {direct.map((c) => (
            <TouchableOpacity key={c.id} style={styles.personRowFull} onPress={() => openPerson(c)}>
              <Avatar person={c} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.ink1, fontWeight: '600', fontSize: 13 }}>{c.name}</Text>
                <Text style={S.muted}>{c.instagram || c.email}</Text>
              </View>
              <Text style={S.idBadge}>#{c.id}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.banner]}>
          <Text style={{ color: '#CFC9FA', fontSize: 12 }}>11º indicado em diante entra automaticamente na primeira vaga livre da rede (spillover automático).</Text>
        </View>
        <View style={{ height: 20 }} />
      </ScrollView>

      <PersonModal
        visible={!!selectedPerson}
        person={selectedPerson}
        sponsor={selectedSponsor}
        onClose={() => setSelectedPerson(null)}
      />
    </View>
  );
}

function initials(name) { return (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase(); }

function Avatar({ person, size }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: COLORS.violetDim, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {person.photo_url ? (
        <Image source={{ uri: person.photo_url }} style={{ width: '100%', height: '100%' }} />
      ) : (
        <Text style={{ color: COLORS.violet, fontWeight: '700', fontSize: size * 0.32 }}>{initials(person.name)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  personRowFull: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  orbitWrap: { alignItems: 'center', paddingVertical: 8 },
  orbit: { width: ORBIT_SIZE, height: ORBIT_SIZE },
  orbitRing: { position: 'absolute', width: ORBIT_SIZE, height: ORBIT_SIZE, borderRadius: ORBIT_SIZE / 2, borderWidth: 1.5, borderColor: COLORS.line, borderStyle: 'dashed' },
  orbitCenter: { position: 'absolute', left: CX - 29, top: CY - 29, width: 58, height: 58, borderRadius: 29, backgroundColor: COLORS.violet, alignItems: 'center', justifyContent: 'center' },
  slot: { position: 'absolute', width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  slotFilled: { backgroundColor: COLORS.tealDim, borderWidth: 1.5, borderColor: COLORS.teal },
  slotEmpty: { borderWidth: 1.5, borderColor: COLORS.ink3, borderStyle: 'dashed' },
  banner: { backgroundColor: COLORS.violetDim, borderWidth: 1, borderColor: COLORS.violet, borderRadius: 12, padding: 12, marginTop: 4 },
});
