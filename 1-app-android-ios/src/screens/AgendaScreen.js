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

  // Controle de Live
  const [activeLive, setActiveLive] = useState(null); // reunião ativa
  const [liveMode, setLiveMode] = useState(null); // 'host' | 'viewer'
  const [cameraPermission, setCameraPermission] = useState(null);
  const [liveComments, setLiveComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [viewerCount, setViewerCount] = useState(12);
  const [liveTimer, setLiveTimer] = useState('00:00');
  const [liveElapsed, setLiveElapsed] = useState(0);
  
  // Controle de Encerramento/Registro Manual
  const [completionModalOpen, setCompletionModalOpen] = useState(false);
  const [completingMeeting, setCompletingMeeting] = useState(null);
  const [durationHours, setDurationHours] = useState('2');
  const [attendeesCount, setAttendeesCount] = useState('15');
  const [searchMember, setSearchMember] = useState('');
  const [presentMembers, setPresentMembers] = useState([]); // Array de perfis selecionados
  const [presencePhoto, setPresencePhoto] = useState(null); // uri local da foto da lista fisica
  const [meetingPhotos, setMeetingPhotos] = useState([]); // uuris locais das fotos da reuniao
  const [savingCompletion, setSavingCompletion] = useState(false);
  const [completionLocation, setCompletionLocation] = useState('');

  // Controle de Visualização de Detalhes
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedMeetingDetails, setSelectedMeetingDetails] = useState(null);

  const cameraRef = useRef(null);
  const commentScrollRef = useRef(null);
  const commentCache = useRef({});
  const timerIntervalRef = useRef(null);
  const printIntervalRef = useRef(null);
  const viewerIntervalRef = useRef(null);

  const canAdd = profile.role === 'admin' || profile.role === 'coord';
  const hasLivePermission = profile.live_enabled !== false;

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

  async function notify(m) {
    await Notifications.scheduleNotificationAsync({
      content: { title: m.title, body: `${new Date(m.date).toLocaleDateString('pt-BR')} às ${m.time} — ${m.location}` },
      trigger: null,
    });
  }

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
    if (!title.trim() || !date.trim()) { Alert.alert('Preencha título e data'); return; }
    try {
      await createMeeting({
        title: title.trim(), date, time: time || '—', location: location || 'A definir',
        lat: coords?.lat ?? null, lng: coords?.lng ?? null,
        created_by: profile.id, status: 'agendada'
      });
      setModalOpen(false);
      setTitle(''); setDate(''); setTime(''); setLocation(''); setCoords(null);
      await load();
      await Notifications.scheduleNotificationAsync({ content: { title: 'Nova reunião agendada!', body: title }, trigger: null });
    } catch (e) {
      Alert.alert('Erro ao agendar', e.message);
    }
  }

  async function handleDelete(id) {
    Alert.alert('Excluir reunião', 'Deseja excluir esta reunião?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => {
          try { await deleteMeeting(id); await load(); } catch (e) { Alert.alert('Erro', e.message); }
      }}
    ]);
  }

  // --- CONTROLE DE REUNIÕES AO VIVO (LIVE) ---

  async function requestCamera() {
    const { status } = await Camera.requestCameraPermissionsAsync();
    setCameraPermission(status === 'granted');
    return status === 'granted';
  }

  async function startLive(m) {
    if (!hasLivePermission) {
      Alert.alert('Permissão negada 🚨', 'Você foi penalizado e a função de Live está desativada. Entre em contato com o administrador.');
      return;
    }
    const hasCam = await requestCamera();
    if (!hasCam) {
      Alert.alert('Câmera necessária', 'Precisamos de acesso à câmera para transmitir.');
      return;
    }

    try {
      // Atualiza banco para live
      await updateMeeting(m.id, { status: 'em_andamento', live_started_at: new Date().toISOString() });
      const updatedM = { ...m, status: 'em_andamento', live_started_at: new Date().toISOString() };
      
      setActiveLive(updatedM);
      setLiveMode('host');
      setLiveElapsed(0);
      setLiveTimer('00:00');
      setViewerCount(Math.floor(Math.random() * 5) + 12);
      
      // Carrega comentários iniciais
      const comments = await fetchLiveComments(m.id);
      setLiveComments(comments || []);

      // Inicia loops de tempo, visualizadores e print automático
      startLiveIntervals(m.id);
    } catch (e) {
      Alert.alert('Erro ao iniciar Live', e.message);
    }
  }

  async function joinLive(m) {
    setActiveLive(m);
    setLiveMode('viewer');
    setLiveElapsed(0);
    setLiveTimer('00:00');
    setViewerCount(Math.floor(Math.random() * 10) + 15);
    
    // Carrega comentários iniciais
    const comments = await fetchLiveComments(m.id);
    setLiveComments(comments || []);

    startLiveIntervals(m.id);
  }

  function startLiveIntervals(meetingId) {
    // Timer
    let elapsed = 0;
    timerIntervalRef.current = setInterval(() => {
      elapsed += 1;
      setLiveElapsed(elapsed);
      const min = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const sec = String(elapsed % 60).padStart(2, '0');
      setLiveTimer(`${min}:${sec}`);
    }, 1000);

    // Espectadores dinâmicos
    viewerIntervalRef.current = setInterval(() => {
      setViewerCount(prev => {
        const delta = Math.floor(Math.random() * 3) - 1; // -1, 0, 1
        return Math.max(1, prev + delta);
      });
    }, 5000);

    // Prints automáticos (a cada 10 min = 600000ms)
    if (liveMode === 'host' || profile.role === 'admin' || profile.role === 'coord') {
      printIntervalRef.current = setInterval(() => {
        triggerAutoPrint(meetingId);
      }, 600000);
    }

    // Inscrição Realtime no Supabase
    const channel = supabase.channel(`live-comments-${meetingId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_comments', filter: `meeting_id=eq.${meetingId}` }, async (payload) => {
        const profileId = payload.new.profile_id;
        let senderName = commentCache.current[profileId];
        if (!senderName) {
          const sender = await fetchProfileById(profileId);
          senderName = sender?.name || 'Membro';
          commentCache.current[profileId] = senderName;
        }
        const comment = { ...payload.new, profiles: { name: senderName } };
        setLiveComments(prev => [...prev, comment]);
        setTimeout(() => commentScrollRef.current?.scrollToEnd({ animated: true }), 100);
      })
      .subscribe();

    activeLiveChannelRef.current = channel;
  }

  const activeLiveChannelRef = useRef(null);

  function stopLiveIntervals() {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (printIntervalRef.current) clearInterval(printIntervalRef.current);
    if (viewerIntervalRef.current) clearInterval(viewerIntervalRef.current);
    if (activeLiveChannelRef.current) {
      supabase.removeChannel(activeLiveChannelRef.current);
    }
  }

  async function triggerAutoPrint(meetingId) {
    if (!cameraRef.current) return;
    try {
      const pic = await cameraRef.current.takePictureAsync({ quality: 0.6 });
      if (!pic) return;

      const response = await fetch(pic.uri);
      const blob = await response.blob();
      const path = `meeting_${meetingId}/auto_print_${Date.now()}.jpg`;

      // Upload no storage meetings
      const { error: uploadError } = await supabase.storage.from('meetings').upload(path, blob, { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;

      const { data: pub } = supabase.storage.from('meetings').getPublicUrl(path);
      const url = pub.publicUrl;

      // Adiciona nos arrays de fotos do meeting
      const { data: m } = await supabase.from('meetings').select('photos').eq('id', meetingId).single();
      const currentPhotos = m?.photos || [];
      if (currentPhotos.length < 3) {
        const updatedPhotos = [...currentPhotos, url];
        await supabase.from('meetings').update({ photos: updatedPhotos }).eq('id', meetingId);
      }
    } catch (e) {
      console.log('Erro no auto print:', e);
    }
  }

  async function sendComment() {
    if (!commentText.trim() || !activeLive) return;
    try {
      await createLiveComment(activeLive.id, profile.id, commentText.trim());
      setCommentText('');
    } catch (e) {
      Alert.alert('Erro ao enviar', e.message);
    }
  }

  function leaveLive() {
    stopLiveIntervals();
    setActiveLive(null);
    setLiveMode(null);
    load();
  }

  async function closeLiveAsHost() {
    const meetId = activeLive.id;
    stopLiveIntervals();
    setActiveLive(null);
    setLiveMode(null);
    
    // Abre tela de finalização para registrar dados de fechamento
    setCompletingMeeting(meetings.find(m => m.id === meetId) || activeLive);
    setDurationHours('2');
    setAttendeesCount('15');
    setPresentMembers([]);
    setPresencePhoto(null);
    setMeetingPhotos([]);
    setCompletionLocation(m.location || '');
    setCompletionModalOpen(true);
  }

  // --- FINALIZAÇÃO E REGISTRO MANUAL DE REUNIÕES ---

  function openManualCompletion(m) {
    setCompletingMeeting(m);
    setDurationHours('2');
    setAttendeesCount('15');
    setCompletionLocation(m.location || '');
    setPresentMembers([]);
    setPresencePhoto(null);
    setMeetingPhotos([]);
    setCompletionModalOpen(true);
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
      Alert.alert('Limite máximo', 'Você pode anexar no máximo 3 fotos por reunião.');
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Acesso negado', 'Precisamos de acesso.'); return; }
    
    Alert.alert('Foto da Reunião', 'Selecione a fonte da foto:', [
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

  async function saveCompletion() {
    if (!durationHours.trim() || !attendeesCount.trim()) {
      Alert.alert('Preencha os campos obrigatórios');
      return;
    }
    setSavingCompletion(true);
    try {
      const meetId = completingMeeting.id;
      let finalPresencePhotoUrl = completingMeeting.presence_photo_url || null;
      let finalPhotos = completingMeeting.photos || [];

      // 1. Upload de foto da lista física
      if (presencePhoto) {
        const response = await fetch(presencePhoto);
        const blob = await response.blob();
        const filename = `meeting_${meetId}/presence_list.jpg`;
        const { error: uploadError } = await supabase.storage.from('meetings').upload(filename, blob, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: pub } = supabase.storage.from('meetings').getPublicUrl(filename);
        finalPresencePhotoUrl = pub.publicUrl;
      }

      // 2. Upload de fotos da reunião
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

      // 3. Salva no banco de dados
      const payload = {
        status: 'realizada',
        location: completionLocation.trim() || completingMeeting.location || 'A definir',
        duration_minutes: parseInt(durationHours) * 60,
        attendees_count: parseInt(attendeesCount),
        presence_list: presentMembers.map(m => ({ id: m.id, name: m.name })),
        presence_photo_url: finalPresencePhotoUrl,
        photos: finalPhotos
      };

      await updateMeeting(meetId, payload);
      Alert.alert('Sucesso ✅', 'Reunião concluída e registrada de forma transparente.');
      setCompletionModalOpen(false);
      setCompletingMeeting(null);
      await load();
    } catch (e) {
      Alert.alert('Erro ao finalizar', e.message);
    } finally {
      setSavingCompletion(false);
    }
  }

  // Estatísticas de reuniões realizadas
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

        <View style={S.rowBetween}>
          <Text style={{ color: COLORS.ink1, fontSize: 17, fontWeight: '700', marginVertical: 8 }}>Eventos</Text>
          {canAdd && (
            <TouchableOpacity style={[S.btn, S.btnViolet, { marginBottom: 0, paddingHorizontal: 14 }]} onPress={() => setModalOpen(true)}>
              <Text style={S.btnTextLight}>+ Novo Evento</Text>
            </TouchableOpacity>
          )}
        </View>

        {!canAdd && (
          <View style={styles.infoBanner}>
            <Text style={{ color: '#9AFAE0', fontSize: 12 }}>Apenas admin e coordenadores podem agendar eventos.</Text>
          </View>
        )}

        {meetings.length === 0 && <Text style={[S.muted, { textAlign: 'center', padding: 20 }]}>Nenhum evento marcado.</Text>}
        {meetings.map((m) => {
          const isOwnerHost = m.created_by === profile.id || profile.role === 'admin';
          return (
            <View key={m.id} style={[S.card, styles.meetCard, m.status === 'em_andamento' && styles.meetCardLive]}>
              <View style={S.rowBetween}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Text style={{ color: COLORS.ink1, fontWeight: '600', fontSize: 13.5 }}>{m.title}</Text>
                    {m.status === 'em_andamento' && (
                      <View style={styles.liveBadge}><Text style={styles.liveBadgeText}>● AO VIVO</Text></View>
                    )}
                    {m.status === 'realizada' && (
                      <View style={styles.doneBadge}><Text style={styles.doneBadgeText}>✓ CONCLUÍDA</Text></View>
                    )}
                  </View>
                  <Text style={S.muted}>📍 {m.location}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: COLORS.teal, fontFamily: 'monospace', fontSize: 11 }}>{new Date(m.date).toLocaleDateString('pt-BR')}</Text>
                  <Text style={S.muted}>{m.time}</Text>
                </View>
              </View>

              {/* Botões do Host ou Membro com base no status da reunião */}
              {m.status === 'agendada' && (
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
                  {isOwnerHost && (
                    <TouchableOpacity style={[S.btn, S.btnTeal, { flex: 1, marginBottom: 0, paddingVertical: 8 }]} onPress={() => startLive(m)}>
                      <Text style={S.btnTextDark}>📹 Iniciar Live</Text>
                    </TouchableOpacity>
                  )}
                  {isOwnerHost && (
                    <TouchableOpacity style={[S.btn, S.btnGhost, { flex: 1, marginBottom: 0, paddingVertical: 8 }]} onPress={() => openManualCompletion(m)}>
                      <Text style={S.btnTextGhost}>✓ Fechar sem Live</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {m.status === 'em_andamento' && (
                <TouchableOpacity style={[S.btn, S.btnWarn, { marginTop: 10, marginBottom: 0, paddingVertical: 9 }]} onPress={() => isOwnerHost ? joinLive(m) : joinLive(m)}>
                  <Text style={S.btnTextWarn}>📺 Entrar na Live</Text>
                </TouchableOpacity>
              )}

              {m.status === 'realizada' && (
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
                  <TouchableOpacity style={[S.btn, S.btnGhost, { flex: 1, marginBottom: 0, paddingVertical: 8 }]} onPress={() => { setSelectedMeetingDetails(m); setDetailsModalOpen(true); }}>
                    <Text style={S.btnTextGhost}>📊 Ver Detalhes e Lista</Text>
                  </TouchableOpacity>
                </View>
              )}

              {m.lat != null && m.lng != null && m.status !== 'realizada' && (
                <TouchableOpacity
                  style={[S.btn, S.btnGhost, { marginTop: 10, marginBottom: 0, paddingVertical: 7 }]}
                  onPress={() => Linking.openURL(mapsUrl(m.lat, m.lng))}
                >
                  <Text style={[S.btnTextGhost, { fontSize: 11 }]}>📍 Abrir no Google Maps</Text>
                </TouchableOpacity>
              )}

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                {canAdd && m.status !== 'realizada' && (
                  <TouchableOpacity style={[S.btn, S.btnGhost, { flex: 1, marginBottom: 0, paddingVertical: 6 }]} onPress={() => notify(m)}>
                    <Text style={[S.btnTextGhost, { fontSize: 11 }]}>🔔 Notificar</Text>
                  </TouchableOpacity>
                )}
                {canAdd && (
                  <TouchableOpacity style={[S.btn, S.btnWarn, { marginBottom: 0, paddingVertical: 6, paddingHorizontal: 12 }]} onPress={() => handleDelete(m.id)}>
                    <Text style={[S.btnTextWarn, { fontSize: 11 }]}>Excluir</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* MODAL DE CRIAÇÃO DE EVENTO */}
      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setModalOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={{ color: COLORS.ink1, fontSize: 16, fontWeight: '700', marginBottom: 14 }}>Novo Evento</Text>
            <Text style={S.label}>Título</Text>
            <TextInput style={S.input} placeholder="Ex: Grande encontro" placeholderTextColor={COLORS.ink3} value={title} onChangeText={setTitle} />
            <Text style={S.label}>Data (AAAA-MM-DD)</Text>
            <TextInput style={S.input} placeholder="2026-08-01" placeholderTextColor={COLORS.ink3} value={date} onChangeText={setDate} />
            <Text style={S.label}>Horário</Text>
            <TextInput style={S.input} placeholder="19:00" placeholderTextColor={COLORS.ink3} value={time} onChangeText={setTime} />
            <Text style={S.label}>Local (endereço em texto)</Text>
            <TextInput style={S.input} placeholder="Endereço ou link online" placeholderTextColor={COLORS.ink3} value={location} onChangeText={setLocation} />

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
            
            <TouchableOpacity style={[S.btn, S.btnViolet]} onPress={handleSave}>
              <Text style={S.btnTextLight}>Agendar e notificar rede</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* INTERFACE DE REUNIÃO AO VIVO (FULL-SCREEN MODAL) */}
      <Modal visible={!!activeLive} animationType="fade" transparent={false} onRequestClose={leaveLive}>
        <View style={styles.liveContainer}>
          {/* Header */}
          <View style={styles.liveHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.liveTitle} numberOfLines={1}>{activeLive?.title}</Text>
              <Text style={styles.liveTimerText}>⏱️ {liveTimer} • 👥 {viewerCount} visualizando</Text>
            </View>
            <TouchableOpacity style={styles.liveLeaveBtn} onPress={liveMode === 'host' ? closeLiveAsHost : leaveLive}>
              <Text style={styles.liveLeaveBtnText}>{liveMode === 'host' ? 'Encerrar' : 'Sair'}</Text>
            </TouchableOpacity>
          </View>

          {/* Player de Video / Camera Preview */}
          <View style={styles.livePlayerContainer}>
            {liveMode === 'host' && cameraPermission ? (
              <Camera style={styles.liveCamera} type="front" ref={cameraRef}>
                <View style={styles.liveBadgeFloat}>
                  <Text style={styles.liveBadgeFloatText}>● AO VIVO</Text>
                </View>
                {/* Botão de teste rápido de Print automático */}
                <TouchableOpacity style={styles.btnTestPrint} onPress={() => triggerAutoPrint(activeLive.id).then(() => Alert.alert('Print teste efetuado!'))}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>📸 Tirar Print (Testar)</Text>
                </TouchableOpacity>
              </Camera>
            ) : (
              <View style={styles.liveViewerPlaceholder}>
                <View style={styles.liveAuraPulse}>
                  <Text style={{ fontSize: 50 }}>📺</Text>
                </View>
                <Text style={styles.livePlaceholderText}>Você está assistindo à Live</Text>
                <Text style={{ color: COLORS.ink3, fontSize: 12, marginTop: 4 }}>Transmissão não gravada no servidor</Text>
              </View>
            )}
          </View>

          {/* Chat de Comentários */}
          <View style={styles.liveChatContainer}>
            <Text style={styles.liveChatTitle}>Comentários da reunião</Text>
            <ScrollView 
              ref={commentScrollRef} 
              style={{ flex: 1, paddingVertical: 10 }}
              onContentSizeChange={() => commentScrollRef.current?.scrollToEnd({ animated: true })}
            >
              {liveComments.length === 0 && (
                <Text style={{ color: COLORS.ink3, textAlign: 'center', marginVertical: 20 }}>Nenhum comentário enviado ainda.</Text>
              )}
              {liveComments.map((c) => (
                <View key={c.id} style={styles.liveCommentBubble}>
                  <Text style={styles.liveCommentAuthor}>{c.profiles?.name || 'Membro'}</Text>
                  <Text style={styles.liveCommentText}>{c.text}</Text>
                </View>
              ))}
            </ScrollView>

            {/* Input de Chat */}
            <View style={styles.liveChatInputBar}>
              <TextInput 
                style={styles.liveChatInput} 
                placeholder="Escreva um comentário..." 
                placeholderTextColor={COLORS.ink3} 
                value={commentText} 
                onChangeText={setCommentText} 
              />
              <TouchableOpacity style={styles.liveChatSendBtn} onPress={sendComment}>
                <Text style={styles.liveChatSendText}>Enviar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL DE ENCERRAMENTO DE LIVE / REGISTRO MANUAL */}
      <Modal visible={completionModalOpen} animationType="slide" transparent onRequestClose={() => setCompletionModalOpen(false)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setCompletionModalOpen(false)} />
          <View style={[styles.sheet, { maxHeight: '90%' }]}>
            <View style={styles.handle} />
            <Text style={{ color: COLORS.ink1, fontSize: 16, fontWeight: '700', marginBottom: 12 }}>Finalizar Evento</Text>
            <Text style={{ color: COLORS.teal, fontSize: 12, marginBottom: 14 }}>{completingMeeting?.title}</Text>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
              <Text style={S.label}>Onde foi feita a reunião (Local)</Text>
              <TextInput style={S.input} placeholder="Ex: Chácara São José - DF" value={completionLocation} onChangeText={setCompletionLocation} placeholderTextColor={COLORS.ink3} />

              <Text style={S.label}>Duração (Horas)</Text>
              <TextInput style={S.input} keyboardType="numeric" value={durationHours} onChangeText={setDurationHours} />

              <Text style={S.label}>Quantidade de Pessoas Presentes</Text>
              <TextInput style={S.input} keyboardType="numeric" value={attendeesCount} onChangeText={setAttendeesCount} />

              {/* Anexar Fotos da Reunião */}
              <Text style={S.label}>Fotos do Evento (Anexar 2 fotos)</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                {meetingPhotos.map((p, i) => (
                  <View key={i} style={styles.previewThumbContainer}>
                    <Image source={{ uri: p }} style={styles.previewThumb} />
                    <TouchableOpacity style={styles.thumbRemove} onPress={() => setMeetingPhotos(prev => prev.filter((_, idx) => idx !== i))}>
                      <Text style={{ color: '#fff', fontSize: 10 }}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                {meetingPhotos.length < 3 && (
                  <TouchableOpacity style={styles.btnAddPhotoBox} onPress={handleAddMeetingPhoto}>
                    <Text style={{ color: COLORS.teal, fontSize: 20 }}>+</Text>
                    <Text style={{ color: COLORS.teal, fontSize: 9 }}>Tirar Foto</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Anexar Lista de Presentes Física */}
              <Text style={S.label}>Foto da Lista de Presentes (Nome e Telefone)</Text>
              {presencePhoto ? (
                <View style={[styles.coordBox, { marginBottom: 12 }]}>
                  <Image source={{ uri: presencePhoto }} style={{ width: 40, height: 40, borderRadius: 6, marginRight: 10 }} />
                  <Text style={{ color: COLORS.teal, fontSize: 12, flex: 1 }}>Lista física anexada ✓</Text>
                  <TouchableOpacity onPress={() => setPresencePhoto(null)}>
                    <Text style={{ color: COLORS.warn, fontSize: 12, fontWeight: '700' }}>Remover</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={[S.btn, S.btnGhost, { marginBottom: 12 }]} onPress={handlePickPresencePhoto}>
                  <Text style={S.btnTextGhost}>📷 Bater Foto da Lista Física</Text>
                </TouchableOpacity>
              )}

              {/* Criar Lista Digital de Presentes */}
              <Text style={S.label}>Lista de Presentes Digital (Adicionar Membros)</Text>
              <TextInput 
                style={S.input} 
                placeholder="Pesquisar por nome..." 
                placeholderTextColor={COLORS.ink3} 
                value={searchMember} 
                onChangeText={setSearchMember} 
              />
              
              <View style={styles.profilesChecklist}>
                {profiles
                  .filter(p => p.name.toLowerCase().includes(searchMember.toLowerCase()))
                  .slice(0, 5)
                  .map(p => {
                    const isChecked = presentMembers.some(x => x.id === p.id);
                    return (
                      <TouchableOpacity 
                        key={p.id} 
                        style={[styles.profileCheckRow, isChecked && styles.profileCheckRowOn]}
                        onPress={() => {
                          if (isChecked) {
                            setPresentMembers(prev => prev.filter(x => x.id !== p.id));
                          } else {
                            setPresentMembers(prev => [...prev, p]);
                          }
                        }}
                      >
                        <Text style={{ color: isChecked ? '#000' : COLORS.ink1, fontSize: 12.5 }}>{p.name}</Text>
                        <Text style={{ color: isChecked ? '#000' : COLORS.teal, fontSize: 11 }}>{isChecked ? 'Selecionado ✓' : '+ Adicionar'}</Text>
                      </TouchableOpacity>
                    );
                  })
                }
              </View>

              <Text style={[S.muted, { marginVertical: 10 }]}>
                Selecionados: {presentMembers.length} membros.
              </Text>
            </ScrollView>

            <TouchableOpacity style={[S.btn, S.btnViolet, { marginTop: 12 }]} onPress={saveCompletion} disabled={savingCompletion}>
              {savingCompletion ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={S.btnTextLight}>Registrar Reunião</Text>
              )}
            </TouchableOpacity>
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
            <Text style={{ color: COLORS.teal, fontSize: 13, fontWeight: '600', marginBottom: 14 }}>{selectedMeetingDetails?.title}</Text>

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
