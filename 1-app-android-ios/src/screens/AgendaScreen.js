import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, RefreshControl, StyleSheet, Alert, Linking, Image, ActivityIndicator } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'expo-camera';
import { COLORS, S } from '../theme';
import TopBar from '../components/TopBar';
import { supabase } from '../lib/supabase';
import { 
  fetchAllProfiles, fetchMeetings, createMeeting, deleteMeeting, 
  updateMeeting, createLiveComment, fetchLiveComments, fetchProfileById 
} from '../lib/api';

function mapsUrl(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export default function AgendaScreen({ profile }) {
  const [totalUsers, setTotalUsers] = useState(0);
  const [meetings, setMeetings] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // Form de criação de reunião
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [coords, setCoords] = useState(null); 
  const [capturing, setCapturing] = useState(false);
  const [durationHours, setDurationHours] = useState('2');
  const [attendeesCount, setAttendeesCount] = useState('15');
  const [searchMember, setSearchMember] = useState('');
  const [presentMembers, setPresentMembers] = useState([]); // Array de perfis selecionados
  const [presencePhoto, setPresencePhoto] = useState(null); // uri local da foto da lista fisica
  const [meetingPhotos, setMeetingPhotos] = useState([]); // uris locais das fotos da reuniao
  const [savingCompletion, setSavingCompletion] = useState(false);

  // Controle de Visualização de Detalhes
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedMeetingDetails, setSelectedMeetingDetails] = useState(null);

  const canAdd = true; // Qualquer usuário logado pode registrar eventos

  const load = useCallback(async () => {
    try {
      const [profs, mts] = await Promise.all([fetchAllProfiles(), fetchMeetings()]);
      setProfiles(profs);
      setTotalUsers(profs.length);
      setMeetings(mts);
    } catch (e) {
      console.log('Erro ao carregar dados:', e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false); }

  async function captureLocation() {
    setCapturing(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão necessária', 'Autorize o acesso à localização.');
        setCapturing(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      Alert.alert('Localização capturada ✅', 'O ponto exato foi salvo.');
    } catch (e) {
      Alert.alert('Erro ao obter localização', e.message);
    } finally {
      setCapturing(false);
    }
  }

  async function handleSave() {
    if (!title.trim() || !date.trim() || !location.trim()) { 
      Alert.alert('Preencha os campos obrigatórios', 'Por favor, preencha o título, a data e o local do evento.'); 
      return; 
    }
    setSavingCompletion(true);
    try {
      // 1. Criar o evento no banco de dados com status 'realizada'
      const newMeet = await createMeeting({
        title: title.trim(),
        date,
        time: time || '—',
        location: location.trim(),
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        created_by: profile.id,
        status: 'realizada',
        duration_minutes: parseInt(durationHours) * 60,
        attendees_count: parseInt(attendeesCount),
        presence_list: presentMembers.map(m => ({ id: m.id, name: m.name }))
      });

      const meetId = newMeet.id;
      let finalPresencePhotoUrl = null;
      let finalPhotos = [];

      // 2. Upload de foto da lista física
      if (presencePhoto) {
        const response = await fetch(presencePhoto);
        const blob = await response.blob();
        const filename = `meeting_${meetId}/presence_list.jpg`;
        const { error: uploadError } = await supabase.storage.from('meetings').upload(filename, blob, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: pub } = supabase.storage.from('meetings').getPublicUrl(filename);
        finalPresencePhotoUrl = pub.publicUrl;
      }

      // 3. Upload de fotos da reunião
      for (const uri of meetingPhotos) {
        if (finalPhotos.length >= 3) break;
        const response = await fetch(uri);
        const blob = await response.blob();
        const filename = `meeting_${meetId}/photo_${Date.now()}_${Math.floor(Math.random()*1000)}.jpg`;
        const { error: uploadError } = await supabase.storage.from('meetings').upload(filename, blob, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: pub } = supabase.storage.from('meetings').getPublicUrl(filename);
        finalPhotos.push(pub.publicUrl);
      }

      // 4. Salvar as URLs no registro do evento
      if (finalPresencePhotoUrl || finalPhotos.length > 0) {
        await updateMeeting(meetId, {
          presence_photo_url: finalPresencePhotoUrl,
          photos: finalPhotos
        });
      }

      Alert.alert('Sucesso ✅', 'Evento registrado e publicado com sucesso!');
      setModalOpen(false);

      // Limpar formulário
      setTitle(''); setDate(''); setTime(''); setLocation(''); setCoords(null);
      setDurationHours('2'); setAttendeesCount('15');
      setPresentMembers([]); setPresencePhoto(null); setMeetingPhotos([]);
      await load();
    } catch (e) {
      Alert.alert('Erro ao cadastrar evento', e.message);
    } finally {
      setSavingCompletion(false);
    }
  }

  async function handleDelete(id) {
    Alert.alert('Excluir evento', 'Deseja excluir este evento permanentemente?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => {
          try { await deleteMeeting(id); await load(); } catch (e) { Alert.alert('Erro', e.message); }
      }}
    ]);
  }

  async function handlePickPresencePhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Acesso negado', 'Precisamos de acesso para fotos.'); return; }
    
    Alert.alert('Anexar Lista Física', 'Como deseja anexar a foto?', [
      { text: 'Tirar Foto', onPress: async () => {
          const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
          if (!res.canceled) setPresencePhoto(res.assets[0].uri);
      }},
      { text: 'Escolher da Galeria', onPress: async () => {
          const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
          if (!res.canceled) setPresencePhoto(res.assets[0].uri);
      }},
      { text: 'Cancelar', style: 'cancel' }
    ]);
  }

  async function handleAddMeetingPhoto() {
    if (meetingPhotos.length >= 3) {
      Alert.alert('Limite máximo', 'Você pode anexar no máximo 3 fotos por evento.');
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Acesso negado', 'Precisamos de acesso.'); return; }
    
    Alert.alert('Foto do Evento', 'Selecione a fonte da foto:', [
      { text: 'Tirar Foto', onPress: async () => {
          const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
          if (!res.canceled) setMeetingPhotos(prev => [...prev, res.assets[0].uri]);
      }},
      { text: 'Escolher da Galeria', onPress: async () => {
          const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
          if (!res.canceled) setMeetingPhotos(prev => [...prev, res.assets[0].uri]);
      }},
      { text: 'Cancelar', style: 'cancel' }
    ]);
  }

  // Estatísticas de eventos realizados
  const completedMeetings = meetings.filter(m => m.status === 'realizada');
  const totalHours = completedMeetings.reduce((acc, m) => acc + (m.duration_minutes || 0) / 60, 0);
  const totalAttendees = completedMeetings.reduce((acc, m) => acc + (m.attendees_count || 0), 0);

  return (
    <View style={S.screen}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.teal} />}>
        <TopBar totalUsers={totalUsers} />
        
        {/* Painel de Histórico e Estatísticas Transparentes */}
        <View style={styles.statsPanel}>
          <Text style={styles.statsPanelTitle}>📊 Histórico de Eventos</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
            <View style={styles.statMiniBox}>
              <Text style={styles.statMiniNum}>{completedMeetings.length}</Text>
              <Text style={styles.statMiniLabel}>Realizados</Text>
            </View>
            <View style={styles.statMiniBox}>
              <Text style={styles.statMiniNum}>{totalHours.toFixed(1)}h</Text>
              <Text style={styles.statMiniLabel}>Duração</Text>
            </View>
            <View style={styles.statMiniBox}>
              <Text style={styles.statMiniNum}>{totalAttendees}</Text>
              <Text style={styles.statMiniLabel}>Presentes</Text>
            </View>
          </View>
        </View>

        <View style={[S.rowBetween, { marginBottom: 10 }]}>
          <Text style={{ color: COLORS.ink1, fontSize: 17, fontWeight: '700', marginVertical: 8 }}>Eventos</Text>
          <TouchableOpacity style={[S.btn, S.btnViolet, { width: 'auto', marginBottom: 0, paddingVertical: 8, paddingHorizontal: 16 }]} onPress={() => setModalOpen(true)}>
            <Text style={S.btnTextLight}>+ Novo Evento</Text>
          </TouchableOpacity>
        </View>

        {meetings.length === 0 && <Text style={[S.muted, { textAlign: 'center', padding: 20 }]}>Nenhum evento registrado.</Text>}
        {meetings.map((m) => {
          const isOwnerHost = m.created_by === profile.id || profile.role === 'admin' || profile.role === 'coord';
          return (
            <View key={m.id} style={[S.card, styles.meetCard, { borderLeftColor: COLORS.teal, borderLeftWidth: 3, paddingVertical: 14 }]}>
              <View style={S.rowBetween}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Text style={{ color: COLORS.ink1, fontWeight: '600', fontSize: 13.5 }}>{m.title}</Text>
                    <View style={styles.doneBadge}><Text style={styles.doneBadgeText}>✓ CONCLUÍDO</Text></View>
                  </View>
                  <Text style={S.muted}>📍 {m.location}</Text>
                  <Text style={[S.muted, { fontSize: 10.5, marginTop: 3 }]}>👤 Criado por: {m.profiles?.name || 'Membro'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: COLORS.teal, fontFamily: 'monospace', fontSize: 11 }}>{new Date(m.date).toLocaleDateString('pt-BR')}</Text>
                  <Text style={S.muted}>{m.time}</Text>
                </View>
              </View>

              <TouchableOpacity style={[S.btn, S.btnGhost, { marginTop: 12, marginBottom: 0, paddingVertical: 8 }]} onPress={() => { setSelectedMeetingDetails(m); setDetailsModalOpen(true); }}>
                <Text style={S.btnTextGhost}>📊 Ver Detalhes e Lista</Text>
              </TouchableOpacity>

              {isOwnerHost && (
                <TouchableOpacity style={[S.btn, S.btnWarn, { marginTop: 8, marginBottom: 0, paddingVertical: 8 }]} onPress={() => handleDelete(m.id)}>
                  <Text style={S.btnTextWarn}>Excluir</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* MODAL DE CRIAÇÃO E REGISTRO DIRETO DE EVENTO */}
      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setModalOpen(false)} />
          <View style={[styles.sheet, { maxHeight: '90%' }]}>
            <View style={styles.handle} />
            <Text style={{ color: COLORS.ink1, fontSize: 16, fontWeight: '700', marginBottom: 14 }}>Cadastrar Evento</Text>
            
            <ScrollView showsVerticalScrollIndicator={false} style={{ width: '100%' }}>
              <Text style={S.label}>Título</Text>
              <TextInput style={S.input} placeholder="Ex: Grande reunião" placeholderTextColor={COLORS.ink3} value={title} onChangeText={setTitle} />
              
              <Text style={S.label}>Data (AAAA-MM-DD)</Text>
              <TextInput style={S.input} placeholder="2026-08-01" placeholderTextColor={COLORS.ink3} value={date} onChangeText={setDate} />
              
              <Text style={S.label}>Horário</Text>
              <TextInput style={S.input} placeholder="19:00" placeholderTextColor={COLORS.ink3} value={time} onChangeText={setTime} />
              
              <Text style={S.label}>Onde foi feita a reunião (Local)</Text>
              <TextInput style={S.input} placeholder="Ex: Chácara São José - DF" placeholderTextColor={COLORS.ink3} value={location} onChangeText={setLocation} />

              <Text style={S.label}>Localização exata (opcional)</Text>
              {coords ? (
                <View style={styles.coordBox}>
                  <Text style={{ color: COLORS.teal, fontSize: 12.5, flex: 1 }}>📍 Localização capturada ✅</Text>
                  <TouchableOpacity onPress={() => Linking.openURL(mapsUrl(coords.lat, coords.lng))}>
                    <Text style={{ color: COLORS.violet, fontSize: 12, fontWeight: '700' }}>Ver no mapa</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setCoords(null)} style={{ marginLeft: 12 }}>
                    <Text style={{ color: COLORS.warn, fontSize: 12, fontWeight: '700' }}>Remover</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={[S.btn, S.btnGhost]} onPress={captureLocation} disabled={capturing}>
                  <Text style={S.btnTextGhost}>{capturing ? 'Obtendo localização...' : '📍 Usar minha localização atual'}</Text>
                </TouchableOpacity>
              )}

              <Text style={S.label}>Duração (Horas)</Text>
              <TextInput style={S.input} placeholder="2" keyboardType="numeric" placeholderTextColor={COLORS.ink3} value={durationHours} onChangeText={setDurationHours} />

              <Text style={S.label}>Quantidade de Pessoas Presentes</Text>
              <TextInput style={S.input} placeholder="15" keyboardType="numeric" placeholderTextColor={COLORS.ink3} value={attendeesCount} onChangeText={setAttendeesCount} />

              {/* Fotos do Evento */}
              <Text style={S.label}>Fotos do Evento (Anexar até 3 fotos)</Text>
              <TouchableOpacity style={[S.btn, S.btnGhost, { marginBottom: 12 }]} onPress={handleAddMeetingPhoto}>
                <Text style={S.btnTextGhost}>📸 Anexar Foto ({meetingPhotos.length}/3)</Text>
              </TouchableOpacity>
              
              {meetingPhotos.length > 0 && (
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  {meetingPhotos.map((uri, idx) => (
                    <View key={idx} style={{ position: 'relative' }}>
                      <Image source={{ uri }} style={{ width: 60, height: 60, borderRadius: 8 }} />
                      <TouchableOpacity style={{ position: 'absolute', top: -4, right: -4, backgroundColor: COLORS.warn, borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center' }} onPress={() => setMeetingPhotos(prev => prev.filter((_, i) => i !== idx))}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>X</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* Foto da Lista Física */}
              <Text style={S.label}>Foto da Lista de Presentes (Nome e Telefone)</Text>
              <TouchableOpacity style={[S.btn, S.btnGhost, { marginBottom: 12 }]} onPress={handlePickPresencePhoto}>
                <Text style={S.btnTextGhost}>{presencePhoto ? '✅ Foto Anexada (Clique para Alterar)' : '📸 Anexar Foto da Lista'}</Text>
              </TouchableOpacity>
              
              {presencePhoto && (
                <View style={{ position: 'relative', alignSelf: 'flex-start', marginBottom: 12 }}>
                  <Image source={{ uri: presencePhoto }} style={{ width: 100, height: 100, borderRadius: 8 }} />
                  <TouchableOpacity style={{ position: 'absolute', top: -4, right: -4, backgroundColor: COLORS.warn, borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center' }} onPress={() => setPresencePhoto(null)}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>X</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Lista Digital */}
              <Text style={S.label}>Marcar Perfis Presentes (Lista Digital)</Text>
              <TextInput style={S.input} placeholder="Filtrar membros..." placeholderTextColor={COLORS.ink3} value={searchMember} onChangeText={setSearchMember} />
              
              <View style={{ maxHeight: 110, backgroundColor: COLORS.panel2, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 12 }}>
                <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
                  {profiles
                    .filter(p => p.name.toLowerCase().includes(searchMember.toLowerCase()))
                    .slice(0, 5)
                    .map(p => {
                      const isChecked = presentMembers.some(x => x.id === p.id);
                      return (
                        <TouchableOpacity key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.line }} onPress={() => {
                          if (isChecked) {
                            setPresentMembers(prev => prev.filter(x => x.id !== p.id));
                          } else {
                            setPresentMembers(prev => [...prev, p]);
                          }
                        }}>
                          <View style={{ width: 16, height: 16, borderRadius: 4, borderWidth: 1, borderColor: COLORS.teal, backgroundColor: isChecked ? COLORS.teal : 'transparent', justifyContent: 'center', alignItems: 'center' }}>
                            {isChecked && <Text style={{ color: COLORS.bg, fontSize: 10, fontWeight: '900' }}>✓</Text>}
                          </View>
                          <Text style={{ color: COLORS.ink1, fontSize: 12.5 }}>{p.name}</Text>
                        </TouchableOpacity>
                      );
                    })
                  }
                </ScrollView>
              </View>

              <Text style={[S.muted, { marginBottom: 14 }]}>Selecionados: {presentMembers.length} membros.</Text>

              <TouchableOpacity style={[S.btn, S.btnViolet, { marginBottom: 20 }]} onPress={handleSave} disabled={savingCompletion}>
                {savingCompletion ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={S.btnTextLight}>Registrar Evento</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL DE VISUALIZAÇÃO DE DETALHES DE EVENTO CONCLUÍDO */}
      <Modal visible={detailsModalOpen} animationType="slide" transparent onRequestClose={() => setDetailsModalOpen(false)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setDetailsModalOpen(false)} />
          <View style={[styles.sheet, { maxHeight: '90%' }]}>
            <View style={styles.handle} />
            <Text style={{ color: COLORS.ink1, fontSize: 16, fontWeight: '700', marginBottom: 6 }}>Resumo do Evento</Text>
            <Text style={{ color: COLORS.teal, fontSize: 13, fontWeight: '600', marginBottom: 4 }}>{selectedMeetingDetails?.title}</Text>
            <Text style={[S.muted, { marginBottom: 14, fontSize: 12 }]}>👤 Criado por: {selectedMeetingDetails?.profiles?.name || 'Membro'}</Text>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
              <View style={styles.statsRow}>
                <View style={styles.statCell}>
                  <Text style={styles.statLabel}>⏱️ Horas</Text>
                  <Text style={styles.statValue}>{((selectedMeetingDetails?.duration_minutes || 0) / 60).toFixed(1)}h</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statLabel}>👥 Presentes</Text>
                  <Text style={styles.statValue}>{selectedMeetingDetails?.attendees_count || 0}</Text>
                </View>
              </View>

              {/* Lista de fotos anexadas */}
              {selectedMeetingDetails?.photos && selectedMeetingDetails.photos.length > 0 && (
                <View style={{ marginVertical: 12 }}>
                  <Text style={S.label}>Fotos do Evento ({selectedMeetingDetails.photos.length})</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                    {selectedMeetingDetails.photos.map((p, idx) => (
                      <TouchableOpacity key={idx} onPress={() => Linking.openURL(p)}>
                        <Image source={{ uri: p }} style={{ width: 110, height: 110, borderRadius: 12, marginRight: 8 }} />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Lista digital de presentes */}
              <Text style={[S.label, { marginTop: 10 }]}>Presentes Digitalizados ({selectedMeetingDetails?.presence_list?.length || 0})</Text>
              <View style={styles.presenceListContainer}>
                {(!selectedMeetingDetails?.presence_list || selectedMeetingDetails.presence_list.length === 0) ? (
                  <Text style={{ color: COLORS.ink3, fontStyle: 'italic', fontSize: 12 }}>Nenhum membro marcado digitalmente.</Text>
                ) : (
                  selectedMeetingDetails.presence_list.map((m, idx) => (
                    <Text key={idx} style={{ color: COLORS.ink1, fontSize: 12.5, marginVertical: 2 }}>• {m.name}</Text>
                  ))
                )}
              </View>

              {/* Foto da lista física de assinaturas (Apenas para admin/coord) */}
              {(profile.role === 'admin' || profile.role === 'coord') && selectedMeetingDetails?.presence_photo_url && (
                <View style={{ marginTop: 14 }}>
                  <Text style={S.label}>Foto da Lista de Presentes</Text>
                  <TouchableOpacity 
                    style={[S.btn, S.btnGhost, { marginTop: 6, flexDirection: 'row', gap: 8 }]} 
                    onPress={() => Linking.openURL(selectedMeetingDetails.presence_photo_url)}
                  >
                    <Image source={{ uri: selectedMeetingDetails.presence_photo_url }} style={{ width: 30, height: 30, borderRadius: 6 }} />
                    <Text style={S.btnTextGhost}>Ver Foto da Lista de Presentes (Assinada)</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>

            <TouchableOpacity style={[S.btn, S.btnGhost, { marginTop: 14 }]} onPress={() => { setDetailsModalOpen(false); setSelectedMeetingDetails(null); }}>
              <Text style={S.btnTextGhost}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  statsPanel: { backgroundColor: COLORS.panel, borderWidth: 1, borderColor: COLORS.line, borderRadius: 18, padding: 14, marginBottom: 12 },
  statsPanelTitle: { fontSize: 11, color: COLORS.teal, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700' },
  statMiniBox: { flex: 1, alignItems: 'center', backgroundColor: COLORS.panel2, borderRadius: 12, paddingVertical: 8, marginHorizontal: 3 },
  statMiniNum: { color: COLORS.ink1, fontSize: 16, fontWeight: '700' },
  statMiniLabel: { color: COLORS.ink2, fontSize: 9, marginTop: 2, textTransform: 'uppercase' },

  meetCard: { borderLeftWidth: 3, borderLeftColor: COLORS.violet },
  meetCardLive: { borderLeftColor: COLORS.warn, borderColor: COLORS.warn },
  
  liveBadge: { backgroundColor: 'rgba(240,107,76,0.18)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  liveBadgeText: { color: COLORS.warn, fontSize: 9, fontWeight: '700' },
  
  doneBadge: { backgroundColor: COLORS.tealDim, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  doneBadgeText: { color: COLORS.teal, fontSize: 9, fontWeight: '700' },

  infoBanner: { backgroundColor: COLORS.tealDim, borderWidth: 1, borderColor: COLORS.teal, borderRadius: 12, padding: 10, marginVertical: 12 },
  coordBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.panel2, borderWidth: 1, borderColor: COLORS.teal, borderRadius: 12, padding: 11, marginBottom: 8 },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(3,5,10,0.77)' },
  sheet: { backgroundColor: COLORS.panel, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  handle: { width: 36, height: 4, backgroundColor: COLORS.line, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },

  // Estilos da Live
  liveContainer: { flex: 1, backgroundColor: '#000', paddingTop: 40 },
  liveHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  liveTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  liveTimerText: { color: COLORS.teal, fontSize: 11, marginTop: 2 },
  liveLeaveBtn: { backgroundColor: COLORS.warn, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  liveLeaveBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  
  livePlayerContainer: { height: '35%', backgroundColor: '#090D16', justifyContent: 'center', position: 'relative' },
  liveCamera: { flex: 1, justifyContent: 'flex-end', padding: 12 },
  liveBadgeFloat: { position: 'absolute', top: 12, left: 12, backgroundColor: COLORS.warn, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  liveBadgeFloatText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  btnTestPrint: { alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.6)', padding: 6, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', marginTop: 8 },

  liveViewerPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  liveAuraPulse: { width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(123,108,244,0.15)', borderWidth: 2, borderColor: COLORS.violet, alignItems: 'center', justifyContent: 'center' },
  livePlaceholderText: { color: '#fff', fontSize: 14, fontWeight: '700', marginTop: 14 },
  
  liveChatContainer: { flex: 1, backgroundColor: COLORS.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 12 },
  liveChatTitle: { color: COLORS.ink2, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  liveCommentBubble: { backgroundColor: COLORS.panel, borderRadius: 10, padding: 8, marginBottom: 8, alignSelf: 'flex-start', maxWidth: '85%' },
  liveCommentAuthor: { color: COLORS.teal, fontWeight: '700', fontSize: 11 },
  liveCommentText: { color: COLORS.ink1, fontSize: 12.5, marginTop: 2 },
  
  liveChatInputBar: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: COLORS.line, paddingTop: 10 },
  liveChatInput: { flex: 1, backgroundColor: COLORS.panel2, borderRadius: 10, color: COLORS.ink1, padding: 10, fontSize: 13 },
  liveChatSendBtn: { marginLeft: 10, backgroundColor: COLORS.violet, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  liveChatSendText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Estilos da Finalização
  previewThumbContainer: { position: 'relative', width: 60, height: 60, marginRight: 8 },
  previewThumb: { width: '100%', height: '100%', borderRadius: 8 },
  thumbRemove: { position: 'absolute', top: -4, right: -4, backgroundColor: COLORS.warn, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  btnAddPhotoBox: { width: 60, height: 60, borderRadius: 8, borderOpacity: 0.5, borderStyle: 'dashed', borderWidth: 1, borderColor: COLORS.teal, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.panel2 },
  
  profilesChecklist: { maxHeight: 150, backgroundColor: COLORS.panel2, borderRadius: 12, padding: 8, marginBottom: 12 },
  profileCheckRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  profileCheckRowOn: { backgroundColor: COLORS.tealDim },

  // Detalhes da Reunião Concluída
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statCell: { flex: 1, backgroundColor: COLORS.panel2, borderRadius: 12, padding: 12, alignItems: 'center' },
  statLabel: { color: COLORS.ink2, fontSize: 10, textTransform: 'uppercase' },
  statValue: { color: COLORS.ink1, fontSize: 18, fontWeight: '700', marginTop: 4 },
  presenceListContainer: { backgroundColor: COLORS.panel2, borderRadius: 12, padding: 10, maxHeight: 120 },
});
