import { useEffect, useState, useCallback, useRef } from 'react';
import TopBar from '../components/TopBar';
import { supabase } from '../lib/supabase';
import { 
  fetchAllProfiles, fetchMeetings, createMeeting, deleteMeeting, 
  updateMeeting, createLiveComment, fetchLiveComments, fetchProfileById 
} from '../lib/api';

function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', weekday: 'short' }); }
  catch { return d; }
}

function notifyBrowser(title, body) {
  if (typeof Notification === 'undefined') { alert(`${title}\n${body || ''}`); return; }
  if (Notification.permission === 'granted') new Notification(title, { body });
  else alert(`${title}\n${body || ''}`);
}

function mapsUrl(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export default function AgendaScreen({ profile }) {
  const [totalUsers, setTotalUsers] = useState(0);
  const [meetings, setMeetings] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);

  // Form de criação
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [coords, setCoords] = useState(null);
  const [capturing, setCapturing] = useState(false);

  // Controle de Live
  const [activeLive, setActiveLive] = useState(null);
  const [liveMode, setLiveMode] = useState(null); // 'host' | 'viewer'
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
  const [presentMembers, setPresentMembers] = useState([]); // perfis marcados
  
  // Arquivos selecionados no browser
  const [presencePhotoFile, setPresencePhotoFile] = useState(null); 
  const [meetingPhotoFiles, setMeetingPhotoFiles] = useState([]); 
  const [savingCompletion, setSavingCompletion] = useState(false);
  const [completionLocation, setCompletionLocation] = useState('');

  // Modal de Detalhes da Reunião Realizada
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedMeetingDetails, setSelectedMeetingDetails] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const commentScrollRef = useRef(null);
  const commentCache = useRef({});
  const timerIntervalRef = useRef(null);
  const printIntervalRef = useRef(null);
  const viewerIntervalRef = useRef(null);
  const localStreamRef = useRef(null);
  const activeLiveChannelRef = useRef(null);

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

  useEffect(() => {
    load();
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  }, [load]);

  // GPS no navegador
  function captureLocation() {
    if (!navigator.geolocation) { alert('Seu navegador não suporta localização.'); return; }
    setCapturing(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setCapturing(false);
        alert('Localização capturada! O ponto exato foi salvo.');
      },
      (err) => { setCapturing(false); alert('Erro ao obter localização: ' + err.message); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!title.trim() || !date.trim()) { alert('Preencha título e data'); return; }
    try {
      await createMeeting({
        title: title.trim(), date, time: time || '—', location: location || 'A definir',
        lat: coords?.lat ?? null, lng: coords?.lng ?? null,
        created_by: profile.id, status: 'agendada'
      });
      setModalOpen(false);
      setTitle(''); setDate(''); setTime(''); setLocation(''); setCoords(null);
      await load();
      notifyBrowser('Nova reunião agendada!', title);
    } catch (err) { alert('Erro ao agendar: ' + err.message); }
  }

  async function handleDelete(id) {
    if (!confirm('Excluir esta reunião?')) return;
    try { await deleteMeeting(id); await load(); } catch (err) { alert('Erro: ' + err.message); }
  }

  // --- CONTROLE DE LIVE WEB ---

  async function startLive(m) {
    if (!hasLivePermission) {
      alert('Você foi penalizado e a função de Live está desativada. Entre em contato com o administrador.');
      return;
    }

    try {
      await updateMeeting(m.id, { status: 'em_andamento', live_started_at: new Date().toISOString() });
      const updatedM = { ...m, status: 'em_andamento', live_started_at: new Date().toISOString() };

      setActiveLive(updatedM);
      setLiveMode('host');
      setLiveElapsed(0);
      setLiveTimer('00:00');
      setViewerCount(Math.floor(Math.random() * 5) + 12);
      
      const comments = await fetchLiveComments(m.id);
      setLiveComments(comments || []);

      // Inicia stream de vídeo no browser
      setTimeout(async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: true });
          localStreamRef.current = stream;
          if (videoRef.current) videoRef.current.srcObject = stream;
        } catch (camErr) {
          console.log('Erro ao abrir câmera web:', camErr);
          alert('Câmera não disponível no seu navegador/aparelho.');
        }
      }, 500);

      startLiveIntervals(m.id, 'host');
    } catch (e) {
      alert('Erro ao iniciar Live: ' + e.message);
    }
  }

  function joinLive(m) {
    setActiveLive(m);
    setLiveMode('viewer');
    setLiveElapsed(0);
    setLiveTimer('00:00');
    setViewerCount(Math.floor(Math.random() * 10) + 15);

    const loadComments = async () => {
      const comments = await fetchLiveComments(m.id);
      setLiveComments(comments || []);
    };
    loadComments();

    startLiveIntervals(m.id, 'viewer');
  }

  function startLiveIntervals(meetingId, mode) {
    let elapsed = 0;
    timerIntervalRef.current = setInterval(() => {
      elapsed += 1;
      setLiveElapsed(elapsed);
      const min = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const sec = String(elapsed % 60).padStart(2, '0');
      setLiveTimer(`${min}:${sec}`);
    }, 1000);

    viewerIntervalRef.current = setInterval(() => {
      setViewerCount(prev => {
        const delta = Math.floor(Math.random() * 3) - 1;
        return Math.max(1, prev + delta);
      });
    }, 5000);

    if (mode === 'host') {
      printIntervalRef.current = setInterval(() => {
        triggerWebPrint(meetingId);
      }, 600000); // 10 min
    }

    const channel = supabase.channel(`live-comments-web-${meetingId}`)
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
        if (commentScrollRef.current) {
          commentScrollRef.current.scrollTop = commentScrollRef.current.scrollHeight;
        }
      })
      .subscribe();

    activeLiveChannelRef.current = channel;
  }

  function stopLiveIntervals() {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (printIntervalRef.current) clearInterval(printIntervalRef.current);
    if (viewerIntervalRef.current) clearInterval(viewerIntervalRef.current);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (activeLiveChannelRef.current) {
      supabase.removeChannel(activeLiveChannelRef.current);
    }
  }

  async function triggerWebPrint(meetingId) {
    if (!videoRef.current || !canvasRef.current) return;
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const path = `meeting_${meetingId}/auto_print_${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage.from('meetings').upload(path, blob, { contentType: 'image/jpeg' });
        if (uploadError) throw uploadError;

        const { data: pub } = supabase.storage.from('meetings').getPublicUrl(path);
        const url = pub.publicUrl;

        const { data: m } = await supabase.from('meetings').select('photos').eq('id', meetingId).single();
        const currentPhotos = m?.photos || [];
        if (currentPhotos.length < 3) {
          const updatedPhotos = [...currentPhotos, url];
          await supabase.from('meetings').update({ photos: updatedPhotos }).eq('id', meetingId);
        }
      }, 'image/jpeg', 0.7);
    } catch (e) {
      console.log('Erro ao capturar print no navegador:', e);
    }
  }

  async function sendComment() {
    if (!commentText.trim() || !activeLive) return;
    try {
      await createLiveComment(activeLive.id, profile.id, commentText.trim());
      setCommentText('');
    } catch (e) {
      alert('Erro ao enviar: ' + e.message);
    }
  }

  function leaveLive() {
    stopLiveIntervals();
    setActiveLive(null);
    setLiveMode(null);
    load();
  }

  function closeLiveAsHost() {
    const meetId = activeLive.id;
    stopLiveIntervals();
    setActiveLive(null);
    setLiveMode(null);

    const m = meetings.find(x => x.id === meetId) || activeLive;
    setCompletingMeeting(m);
    setDurationHours('2');
    setAttendeesCount('15');
    setCompletionLocation(m.location || '');
    setPresentMembers([]);
    setPresencePhotoFile(null);
    setMeetingPhotoFiles([]);
    setCompletionModalOpen(true);
  }

  // --- FINALIZAÇÃO MANUAL E ARQUIVOS WEB ---

  function openManualCompletion(m) {
    setCompletingMeeting(m);
    setDurationHours('2');
    setAttendeesCount('15');
    setCompletionLocation(m.location || '');
    setPresentMembers([]);
    setPresencePhotoFile(null);
    setMeetingPhotoFiles([]);
    setCompletionModalOpen(true);
  }

  async function saveCompletion(e) {
    e.preventDefault();
    if (!durationHours.trim() || !attendeesCount.trim()) { alert('Preencha os campos obrigatórios'); return; }
    setSavingCompletion(true);

    try {
      const meetId = completingMeeting.id;
      let finalPresencePhotoUrl = completingMeeting.presence_photo_url || null;
      let finalPhotos = completingMeeting.photos || [];

      // 1. Upload lista física
      if (presencePhotoFile) {
        const ext = presencePhotoFile.name.split('.').pop().toLowerCase();
        const filename = `meeting_${meetId}/presence_list.${ext}`;
        const { error: uploadError } = await supabase.storage.from('meetings').upload(filename, presencePhotoFile, { upsert: true, contentType: presencePhotoFile.type });
        if (uploadError) throw uploadError;
        const { data: pub } = supabase.storage.from('meetings').getPublicUrl(filename);
        finalPresencePhotoUrl = pub.publicUrl;
      }

      // 2. Upload fotos adicionais
      for (const file of meetingPhotoFiles) {
        if (finalPhotos.length >= 3) break;
        const ext = file.name.split('.').pop().toLowerCase();
        const filename = `meeting_${meetId}/photo_${Date.now()}_${Math.floor(Math.random()*1000)}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('meetings').upload(filename, file, { upsert: true, contentType: file.type });
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
      alert('Reunião finalizada e salva com sucesso!');
      setCompletionModalOpen(false);
      setCompletingMeeting(null);
      await load();
    } catch (err) {
      alert('Erro ao salvar finalização: ' + err.message);
    } finally {
      setSavingCompletion(false);
    }
  }

  // Estatísticas transparentes
  const completedMeetings = meetings.filter(m => m.status === 'realizada');
  const totalHours = completedMeetings.reduce((acc, m) => acc + (m.duration_minutes || 0) / 60, 0);
  const totalAttendees = completedMeetings.reduce((acc, m) => acc + (m.attendees_count || 0), 0);

  return (
    <div className="screen">
      <TopBar totalUsers={totalUsers} />

      {/* Histórico Transparente de Eventos */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="card-title" style={{ color: 'var(--teal)' }}>📊 Histórico de Eventos</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{completedMeetings.length}</div>
            <div style={{ fontSize: 9, color: 'var(--ink2)', textTransform: 'uppercase', marginTop: 2 }}>Realizados</div>
          </div>
          <div style={{ textAlign: 'center', flex: 1, borderLeft: '1px solid var(--line)', borderRight: '1px solid var(--line)' }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{totalHours.toFixed(1)}h</div>
            <div style={{ fontSize: 9, color: 'var(--ink2)', textTransform: 'uppercase', marginTop: 2 }}>Duração</div>
          </div>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{totalAttendees}</div>
            <div style={{ fontSize: 9, color: 'var(--ink2)', textTransform: 'uppercase', marginTop: 2 }}>Presenças</div>
          </div>
        </div>
      </div>

      <div className="row-bw">
        <h2 style={{ fontSize: 17 }}>Eventos</h2>
        {canAdd && <button className="btn btn-violet btn-sm" onClick={() => setModalOpen(true)}>+ Novo Evento</button>}
      </div>

      {!canAdd && (
        <div className="card" style={{ background: 'var(--teal-dim)', borderColor: 'var(--teal)' }}>
          <div style={{ fontSize: 12, color: '#9AFAE0' }}>Apenas admin e coordenadores podem agendar eventos.</div>
        </div>
      )}

      {meetings.length === 0 && <div className="empty">Nenhum evento marcado.</div>}
      {meetings.map((m) => {
        const isOwnerHost = m.created_by === profile.id || profile.role === 'admin';
        return (
          <div key={m.id} className={`card meet-card ${m.status === 'em_andamento' ? 'meet-card-live' : ''}`} style={{ borderLeftColor: m.status === 'em_andamento' ? 'var(--warn)' : m.status === 'realizada' ? 'var(--teal)' : 'var(--violet)' }}>
            <div className="row-bw">
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {m.title}
                  {m.status === 'em_andamento' && <span style={{ background: 'rgba(240,107,76,0.18)', color: 'var(--warn)', fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>● AO VIVO</span>}
                  {m.status === 'realizada' && <span style={{ background: 'var(--teal-dim)', color: 'var(--teal)', fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>✓ CONCLUÍDA</span>}
                </div>
                <div className="muted">📍 {m.location}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="meet-date">{fmtDate(m.date)}</div>
                <div className="muted">{m.time}</div>
              </div>
            </div>

            {/* Ações com base no status */}
            {m.status === 'agendada' && (
              <div className="btn-row" style={{ marginTop: 10 }}>
                {isOwnerHost && <button className="btn btn-teal btn-sm" style={{ flex: 1 }} onClick={() => startLive(m)}>📹 Iniciar Live</button>}
                {isOwnerHost && <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => openManualCompletion(m)}>✓ Fechar sem Live</button>}
              </div>
            )}

            {m.status === 'em_andamento' && (
              <button className="btn btn-warn" style={{ marginTop: 10, marginBottom: 0 }} onClick={() => joinLive(m)}>📺 Entrar na Live</button>
            )}

            {m.status === 'realizada' && (
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 10, width: '100%' }} onClick={() => { setSelectedMeetingDetails(m); setDetailsModalOpen(true); }}>📊 Ver Detalhes e Lista</button>
            )}

            {m.lat != null && m.lng != null && m.status !== 'realizada' && (
              <a className="btn btn-teal btn-sm" style={{ marginTop: 10, width: '100%' }} href={mapsUrl(m.lat, m.lng)} target="_blank" rel="noreferrer">
                📍 Abrir no Google Maps
              </a>
            )}

            <div className="btn-row" style={{ marginTop: 10 }}>
              {canAdd && m.status !== 'realizada' && <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => notifyBrowser(m.title, `${fmtDate(m.date)} às ${m.time} — ${m.location}`)}>🔔 Notificar</button>}
              {canAdd && <button className="btn btn-warn btn-sm" onClick={() => handleDelete(m.id)}>Excluir</button>}
            </div>
          </div>
        );
      })}
      <div style={{ height: 20 }} />

      {/* MODAL DE CRIAÇÃO DE EVENTO */}
      {modalOpen && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal">
            <div className="mhandle" />
            <h2 style={{ fontSize: 16, marginBottom: 14 }}>Novo Evento</h2>
            <form onSubmit={handleSave}>
              <label className="lbl">Título</label>
              <input placeholder="Ex: Grande encontro" value={title} onChange={(e) => setTitle(e.target.value)} />
              <label className="lbl">Data</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <label className="lbl">Horário</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              <label className="lbl">Local (endereço em texto)</label>
              <input placeholder="Endereço ou link online" value={location} onChange={(e) => setLocation(e.target.value)} />

              <label className="lbl">Localização exata (opcional)</label>
              {coords ? (
                <div className="lbox" style={{ borderColor: 'var(--teal)' }}>
                  <span style={{ color: 'var(--teal)' }}>📍 Localização capturada ✅</span>
                  <a href={mapsUrl(coords.lat, coords.lng)} target="_blank" rel="noreferrer" style={{ color: 'var(--violet)', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>Ver no mapa</a>
                  <button type="button" onClick={() => setCoords(null)} style={{ background: 'none', border: 'none', color: 'var(--warn)', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>Remover</button>
                </div>
              ) : (
                <button type="button" className="btn btn-ghost" onClick={captureLocation} disabled={capturing}>
                  {capturing ? 'Obtendo localização...' : '📍 Usar minha localização atual'}
                </button>
              )}

              <button className="btn btn-violet" type="submit">Agendar e notificar rede</button>
            </form>
          </div>
        </div>
      )}

      {/* OVERLAY DE REUNIÃO AO VIVO (WEB PLAYER + CHAT REALTIME) */}
      {activeLive && (
        <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 1000, display: 'flex', flexDirection: 'column', color: '#fff' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 12px', borderBottom: '1px solid var(--line)' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{activeLive.title}</div>
              <div style={{ color: 'var(--teal)', fontSize: 11, marginTop: 2 }}>⏱️ {liveTimer} • 👥 {viewerCount} visualizando</div>
            </div>
            <button className="btn btn-warn btn-sm" style={{ width: 'auto', marginBottom: 0 }} onClick={liveMode === 'host' ? closeLiveAsHost : leaveLive}>
              {liveMode === 'host' ? 'Encerrar Reunião' : 'Sair da Live'}
            </button>
          </div>

          {/* Web Camera ou Placeholder */}
          <div style={{ flex: 1, position: 'relative', background: '#090D16', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {liveMode === 'host' ? (
              <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <span style={{ position: 'absolute', top: 12, left: 12, background: 'var(--warn)', color: '#fff', fontSize: 9, padding: '3px 8px', borderRadius: 4, fontWeight: 800 }}>● AO VIVO</span>
                
                {/* Botão de teste rápido de Print automático no browser */}
                <button 
                  type="button" 
                  style={{ position: 'absolute', bottom: 12, left: 12, background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 6, color: '#fff', padding: '5px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => triggerWebPrint(activeLive.id).then(() => alert('Print efetuado!'))}
                >
                  📸 Tirar Print (Testar)
                </button>
                <canvas ref={canvasRef} style={{ display: 'none' }} />
              </div>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--violet-dim)', border: '2px solid var(--violet)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', animation: 'pulse 2s infinite' }}>📺</div>
                <div style={{ fontWeight: 700 }}>Você está assistindo à Live</div>
                <div style={{ color: 'var(--ink3)', fontSize: 12, marginTop: 4 }}>Transmissão não gravada no servidor</div>
              </div>
            )}
          </div>

          {/* Chat Panel */}
          <div style={{ height: '40%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', padding: 12, borderTopLeftRadius: 18, borderTopRightRadius: 18 }}>
            <div style={{ fontSize: 10, color: 'var(--ink2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Comentários</div>
            <div ref={commentScrollRef} style={{ flex: 1, overflowY: 'auto', marginBottom: 8 }}>
              {liveComments.length === 0 && <div style={{ color: 'var(--ink3)', textAlign: 'center', padding: 20 }}>Nenhum comentário enviado.</div>}
              {liveComments.map((c) => (
                <div key={c.id} style={{ background: 'var(--panel)', padding: 8, borderRadius: 10, marginBottom: 8, maxWidth: '85%', alignSelf: 'flex-start' }}>
                  <div style={{ color: 'var(--teal)', fontWeight: 700, fontSize: 11 }}>{c.profiles?.name || 'Membro'}</div>
                  <div style={{ color: 'var(--ink1)', fontSize: 12.5, marginTop: 2 }}>{c.text}</div>
                </div>
              ))}
            </div>

            {/* Input chat */}
            <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
              <input style={{ marginBottom: 0 }} placeholder="Comentar..." value={commentText} onChange={(e) => setCommentText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendComment()} />
              <button className="btn btn-violet" style={{ width: 'auto', padding: '10px 18px', marginBottom: 0 }} onClick={sendComment}>Enviar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE FINALIZAÇÃO E UPLOADS WEB */}
      {completionModalOpen && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setCompletionModalOpen(false)}>
          <div className="modal" style={{ maxHeight: '90vh' }}>
            <div className="mhandle" />
            <h2 style={{ fontSize: 16, marginBottom: 6 }}>Finalizar Evento</h2>
            <div style={{ color: 'var(--teal)', fontSize: 12, marginBottom: 14 }}>{completingMeeting?.title}</div>

            <form onSubmit={saveCompletion}>
              <label className="lbl">Onde foi feita a reunião (Local)</label>
              <input placeholder="Ex: Chácara São José - DF" value={completionLocation} onChange={(e) => setCompletionLocation(e.target.value)} required style={{ marginBottom: 12 }} />

              <label className="lbl">Duração (Horas)</label>
              <input type="number" required min="1" value={durationHours} onChange={(e) => setDurationHours(e.target.value)} />

              <label className="lbl">Quantidade de Pessoas Presentes</label>
              <input type="number" required min="1" value={attendeesCount} onChange={(e) => setAttendeesCount(e.target.value)} />

              {/* Anexar Fotos */}
              <label className="lbl">Fotos do Evento (Anexar 2 fotos)</label>
              <input type="file" accept="image/*" multiple onChange={(e) => setMeetingPhotoFiles(Array.from(e.target.files))} style={{ marginBottom: 12 }} />

              {/* Lista física */}
              <label className="lbl">Foto da Lista de Presentes (Nome e Telefone)</label>
              <input type="file" accept="image/*" onChange={(e) => setPresencePhotoFile(e.target.files[0])} style={{ marginBottom: 12 }} />

              {/* Lista digital de presentes */}
              <label className="lbl">Marcar Perfis Presentes (Lista Digital)</label>
              <input placeholder="Filtrar membros..." value={searchMember} onChange={(e) => setSearchMember(e.target.value)} style={{ marginBottom: 8 }} />
              
              <div style={{ maxHeight: 110, overflowY: 'auto', background: 'var(--panel2)', borderRadius: 12, padding: '6px 10px', marginBottom: 12 }}>
                {profiles
                  .filter(p => p.name.toLowerCase().includes(searchMember.toLowerCase()))
                  .slice(0, 5)
                  .map(p => {
                    const isChecked = presentMembers.some(x => x.id === p.id);
                    return (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                        <input type="checkbox" checked={isChecked} style={{ width: 'auto', marginBottom: 0 }} onChange={() => {
                          if (isChecked) {
                            setPresentMembers(prev => prev.filter(x => x.id !== p.id));
                          } else {
                            setPresentMembers(prev => [...prev, p]);
                          }
                        }} />
                        <span style={{ fontSize: 12.5 }}>{p.name}</span>
                      </div>
                    );
                  })
                }
              </div>

              <div className="muted" style={{ marginBottom: 14 }}>Selecionados: {presentMembers.length} membros.</div>

              <button className="btn btn-violet" type="submit" disabled={savingCompletion}>
                {savingCompletion ? 'Registrando...' : 'Registrar e Publicar Evento'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE DETALHES DE EVENTO CONCLUÍDO */}
      {detailsModalOpen && selectedMeetingDetails && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && {}}>
          <div className="modal">
            <div className="mhandle" />
            <h2 style={{ fontSize: 16, marginBottom: 4 }}>Resumo do Evento</h2>
            <div style={{ color: 'var(--teal)', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{selectedMeetingDetails.title}</div>

            <div className="stat-grid" style={{ marginBottom: 14 }}>
              <div className="stat-box" style={{ padding: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--ink2)', textTransform: 'uppercase' }}>⏱️ Duração</div>
                <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{((selectedMeetingDetails.duration_minutes || 0) / 60).toFixed(1)}h</div>
              </div>
              <div className="stat-box" style={{ padding: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--ink2)', textTransform: 'uppercase' }}>👥 Presentes</div>
                <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{selectedMeetingDetails.attendees_count || 0}</div>
              </div>
            </div>

            {/* Fotos registradas */}
            {selectedMeetingDetails.photos && selectedMeetingDetails.photos.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <label className="lbl">Fotos do Evento ({selectedMeetingDetails.photos.length})</label>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 4 }}>
                  {selectedMeetingDetails.photos.map((p, idx) => (
                    <a key={idx} href={p} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>
                      <img src={p} alt="" style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover' }} />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Lista digital */}
            <label className="lbl">Presenças Marcadas Digitalmente</label>
            <div style={{ background: 'var(--panel2)', borderRadius: 12, padding: '10px 12px', maxHeight: 110, overflowY: 'auto', marginBottom: 14 }}>
              {(!selectedMeetingDetails.presence_list || selectedMeetingDetails.presence_list.length === 0) ? (
                <div className="muted" style={{ fontStyle: 'italic', fontSize: 12 }}>Nenhum membro marcado digitalmente.</div>
              ) : (
                selectedMeetingDetails.presence_list.map((m, idx) => (
                  <div key={idx} style={{ fontSize: 12.5, padding: '2px 0' }}>• {m.name}</div>
                ))
              )}
            </div>

            {/* Foto da lista física (Admins/Coords) */}
            {(profile.role === 'admin' || profile.role === 'coord') && selectedMeetingDetails.presence_photo_url && (
              <div style={{ marginBottom: 14 }}>
                <label className="lbl">Foto da Lista de Presentes</label>
                <a href={selectedMeetingDetails.presence_photo_url} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ fontSize: 12, gap: 8, padding: 8 }}>
                  <img src={selectedMeetingDetails.presence_photo_url} alt="" style={{ width: 28, height: 28, borderRadius: 4 }} />
                  Ver Foto da Lista de Presentes (Assinada)
                </a>
              </div>
            )}

            <button className="btn btn-ghost" onClick={() => { setDetailsModalOpen(false); setSelectedMeetingDetails(null); }}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}
