import { useEffect, useState, useCallback, useRef } from 'react';
import TopBar from '../components/TopBar';
import { supabase, compressImageWeb } from '../lib/supabase';
import { 
  fetchAllProfiles, fetchMeetings, createMeeting, deleteMeeting, 
  updateMeeting, fetchProfileById 
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

  // Form de criação de Evento Direto
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [coords, setCoords] = useState(null);
  const [capturing, setCapturing] = useState(false);

  const [durationHours, setDurationHours] = useState('2');
  const [attendeesCount, setAttendeesCount] = useState('15');
  const [searchMember, setSearchMember] = useState('');
  const [presentMembers, setPresentMembers] = useState([]); // perfis marcados
  
  // Arquivos selecionados no browser
  const [presencePhotoFile, setPresencePhotoFile] = useState(null); 
  const [meetingPhotoFiles, setMeetingPhotoFiles] = useState([]); 
  const [savingCompletion, setSavingCompletion] = useState(false);

  // Modal de Detalhes do Evento Concluído
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedMeetingDetails, setSelectedMeetingDetails] = useState(null);

  const canAdd = true; // Qualquer usuário logado pode registrar eventos
  const fileInputEventCamera = useRef(null);
  const fileInputEventGallery = useRef(null);
  const fileInputPresenceCamera = useRef(null);
  const fileInputPresenceGallery = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraTarget, setCameraTarget] = useState(null); // 'event' | 'presence'
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [onBehalfOfProfile, setOnBehalfOfProfile] = useState(null);
  const [behalfSearchText, setBehalfSearchText] = useState('');
  const [participantSearchText, setParticipantSearchText] = useState('');
  const [editPresencePhotoFile, setEditPresencePhotoFile] = useState(null);
  const [editMeetingPhotoFiles, setEditMeetingPhotoFiles] = useState([]);
  const [savingEditPhotos, setSavingEditPhotos] = useState(false);
  const editFileInputEventGallery = useRef(null);
  const editFileInputPresenceGallery = useRef(null);

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
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [load]);

  // WebRTC inline camera para navegadores celulares (previne reload por falta de RAM)
  async function startWebCamera(target) {
    setCameraTarget(target);
    setCameraActive(true);
    setTimeout(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        alert('Não foi possível acessar a câmera: ' + err.message);
        setCameraActive(false);
      }
    }, 100);
  }

  function stopWebCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setCameraTarget(null);
  }

  function captureWebPhoto() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `${cameraTarget}_photo.jpg`, { type: 'image/jpeg' });
        if (cameraTarget === 'event') {
          setMeetingPhotoFiles([file]);
        } else if (cameraTarget === 'presence') {
          setPresencePhotoFile(file);
        } else if (cameraTarget === 'edit_event') {
          setEditMeetingPhotoFiles([file]);
        } else if (cameraTarget === 'edit_presence') {
          setEditPresencePhotoFile(file);
        }
      }
      stopWebCamera();
    }, 'image/jpeg', 0.85);
  }

  // Enviar novas fotos de evento/lista salvando na edição
  async function handleSaveEditPhotos() {
    setSavingEditPhotos(true);
    try {
      const meetId = selectedMeetingDetails.id;
      let finalPresencePhotoUrl = selectedMeetingDetails.presence_photo_url;
      let finalPhotos = selectedMeetingDetails.photos || [];

      // 1. Upload de foto da lista física
      if (editPresencePhotoFile) {
        const filename = `meeting_${meetId}/presence_list.jpg`;
        const { error: uploadError } = await supabase.storage.from('meetings').upload(filename, editPresencePhotoFile, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: pub } = supabase.storage.from('meetings').getPublicUrl(filename);
        finalPresencePhotoUrl = pub.publicUrl;
      }

      // 2. Upload de foto do evento
      if (editMeetingPhotoFiles.length > 0) {
        const file = editMeetingPhotoFiles[0];
        const filename = `meeting_${meetId}/photo_${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage.from('meetings').upload(filename, file, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: pub } = supabase.storage.from('meetings').getPublicUrl(filename);
        finalPhotos = [pub.publicUrl];
      }

      // 3. Atualizar no banco de dados
      await updateMeeting(meetId, {
        presence_photo_url: finalPresencePhotoUrl,
        photos: finalPhotos
      });

      alert('Fotos salvas com sucesso! ✅');

      // Atualizar o modal com os novos dados de fotos
      setSelectedMeetingDetails(prev => ({
        ...prev,
        presence_photo_url: finalPresencePhotoUrl,
        photos: finalPhotos
      }));
      setEditPresencePhotoFile(null);
      setEditMeetingPhotoFiles([]);
      await load();
    } catch (err) {
      alert('Erro ao salvar novas fotos: ' + err.message);
    } finally {
      setSavingEditPhotos(false);
    }
  }

  // Cadastro direto de evento concluído
  async function handleSave(e) {
    e.preventDefault();
    const todayStr = new Date().toISOString().split('T')[0];
    const isAdmin = profile.role === 'admin';
    if (date < todayStr && !isAdmin) {
      alert('Apenas o administrador pode cadastrar eventos com datas passadas.');
      return;
    }
    setSavingCompletion(true);

    try {
      // 1. Criar o evento no banco de dados com status 'realizada'
      const newMeet = await createMeeting({
        title: title.trim(),
        date,
        time: '—', // Removido campo horário
        location: location.trim(),
        lat: null,
        lng: null,
        created_by: onBehalfOfProfile ? onBehalfOfProfile.id : profile.id,
        status: 'realizada',
        duration_minutes: parseInt(durationHours) * 60,
        attendees_count: parseInt(attendeesCount),
        presence_list: []
      });

      const meetId = newMeet.id;
      let finalPresencePhotoUrl = null;
      let finalPhotos = [];

      // 2. Comprimir e Upload da foto da lista de presentes
      if (presencePhotoFile) {
        // Comprime para 600px max e qualidade 0.7 para economizar espaço
        const compressedPresence = await compressImageWeb(presencePhotoFile, 600, 0.7);
        const ext = compressedPresence.name.split('.').pop().toLowerCase();
        const filename = `meeting_${meetId}/presence_list.${ext}`;
        const { error: uploadError } = await supabase.storage.from('meetings').upload(filename, compressedPresence, { upsert: true, contentType: compressedPresence.type });
        if (uploadError) throw uploadError;
        const { data: pub } = supabase.storage.from('meetings').getPublicUrl(filename);
        finalPresencePhotoUrl = pub.publicUrl;
      }

      // 3. Comprimir e Upload da foto do evento
      if (meetingPhotoFiles && meetingPhotoFiles.length > 0) {
        const file = meetingPhotoFiles[0]; // Limite de 1 foto do evento
        const compressedPhoto = await compressImageWeb(file, 600, 0.7);
        const ext = compressedPhoto.name.split('.').pop().toLowerCase();
        const filename = `meeting_${meetId}/photo_${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('meetings').upload(filename, compressedPhoto, { upsert: true, contentType: compressedPhoto.type });
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

      alert('Evento registrado e publicado com sucesso!');
      setModalOpen(false);
      
      // Limpar formulário
      setTitle(''); setDate(new Date().toISOString().split('T')[0]); setLocation(''); setCoords(null);
      setDurationHours('2'); setAttendeesCount('15');
      setPresencePhotoFile(null); setMeetingPhotoFiles([]);
      setOnBehalfOfProfile(null); setBehalfSearchText('');
      await load();
    } catch (err) {
      alert('Erro ao registrar evento: ' + err.message);
    } finally {
      setSavingCompletion(false);
    }
  }

  async function handleDelete(id) {
    if (profile.role !== 'admin') {
      alert('Apenas administradores podem excluir eventos.');
      return;
    }
    if (!confirm('Excluir este evento permanentemente?')) return;
    try { 
      await deleteMeeting(id); 
      await load(); 
    } catch (err) { 
      alert('Erro ao excluir: ' + err.message); 
    }
  }

  // Estatísticas de eventos realizados
  const completedMeetings = meetings.filter(m => m.status === 'realizada');
  const totalHours = completedMeetings.reduce((acc, m) => acc + (m.duration_minutes || 0) / 60, 0);
  const totalAttendees = completedMeetings.reduce((acc, m) => acc + (m.attendees_count || 0), 0);

  const todayStr = new Date().toISOString().split('T')[0];
  const visibleMeetings = profile.role === 'admin'
    ? meetings
    : meetings.filter(m => m.date >= todayStr);

  return (
    <div className="screen">
      <TopBar totalUsers={totalUsers} />

      {/* Histórico Transparente de Eventos - Apenas para Admin */}
      {profile.role === 'admin' && (
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
      )}

      <div className="row-bw" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 17, margin: 0 }}>Eventos</h2>
        <button className="btn btn-violet btn-sm" style={{ width: 'auto', marginBottom: 0 }} onClick={() => setModalOpen(true)}>+ Novo Evento</button>
      </div>

      {visibleMeetings.length === 0 && <div className="empty">Nenhum evento registrado.</div>}
      {visibleMeetings.map((m) => {
        return (
          <div key={m.id} className="card meet-card" style={{ borderLeftColor: 'var(--teal)', borderLeftWidth: 3 }}>
            <div className="row-bw">
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {m.title}
                  <span style={{ background: 'var(--teal-dim)', color: 'var(--teal)', fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>✓ CONCLUÍDO</span>
                </div>
                <div className="muted">📍 {m.location}</div>
                <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>👤 Criado por: {m.profiles?.name || 'Membro'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="meet-date">{fmtDate(m.date)}</div>
              </div>
            </div>

            <button className="btn btn-ghost btn-sm" style={{ marginTop: 10, width: '100%', marginBottom: 0 }} onClick={() => { setSelectedMeetingDetails(m); setDetailsModalOpen(true); }}>📊 Ver Detalhes e Lista</button>

            {profile.role === 'admin' && (
              <button className="btn btn-warn btn-sm" style={{ marginTop: 8, width: '100%', marginBottom: 0 }} onClick={() => handleDelete(m.id)}>Excluir</button>
            )}
          </div>
        );
      })}
      <div style={{ height: 20 }} />

      {/* MODAL DE CRIAÇÃO E REGISTRO DIRETO DE EVENTO */}
      {modalOpen && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal" style={{ maxHeight: '90vh' }}>
            <div className="mhandle" />
            <h2 style={{ fontSize: 16, marginBottom: 14 }}>Cadastrar Evento</h2>
             <form onSubmit={handleSave}>
              <label className="lbl">Cadastrar em nome de outro membro (Opcional)</label>
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <input 
                  placeholder="Pesquisar por usuário (digite 3 letras)..." 
                  value={behalfSearchText} 
                  onChange={(e) => {
                    const val = e.target.value;
                    setBehalfSearchText(val);
                    if (onBehalfOfProfile) {
                      setOnBehalfOfProfile(null);
                    }
                  }} 
                />
                {onBehalfOfProfile && (
                  <button 
                    type="button" 
                    onClick={() => { setOnBehalfOfProfile(null); setBehalfSearchText(''); }}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--warn)', fontWeight: '700', cursor: 'pointer', outline: 'none' }}
                  >
                    Limpar
                  </button>
                )}
                {behalfSearchText.trim().length >= 3 && !onBehalfOfProfile && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, zIndex: 1000, maxHeight: 150, overflowY: 'auto', marginTop: 4 }}>
                    {profiles
                      .filter(p => p.username?.toLowerCase().includes(behalfSearchText.toLowerCase()) || p.name?.toLowerCase().includes(behalfSearchText.toLowerCase()))
                      .slice(0, 5)
                      .map(p => (
                        <div 
                          key={p.id} 
                          onClick={() => {
                            setOnBehalfOfProfile(p);
                            setBehalfSearchText(`@${p.username} - ${p.name}`);
                          }}
                          style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--line)', color: 'var(--ink1)', fontSize: 13 }}
                          onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--panel2)'}
                          onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                        >
                          <strong>@{p.username}</strong> - {p.name}
                        </div>
                      ))
                    }
                    {profiles.filter(p => p.username?.toLowerCase().includes(behalfSearchText.toLowerCase()) || p.name?.toLowerCase().includes(behalfSearchText.toLowerCase())).length === 0 && (
                      <div style={{ padding: '8px 12px', color: 'var(--ink3)', fontSize: 12.5 }}>Nenhum membro encontrado.</div>
                    )}
                  </div>
                )}
              </div>

              <label className="lbl">Título</label>
              <input placeholder="Ex: Grande reunião" value={title} onChange={(e) => setTitle(e.target.value)} required />
              
              <label className="lbl">Data</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required min={profile.role === 'admin' ? undefined : new Date().toISOString().split('T')[0]} />
              
              <label className="lbl">Onde foi feita a reunião (Local)</label>
              <input placeholder="Ex: Chácara São José - DF" value={location} onChange={(e) => setLocation(e.target.value)} required />


              <label className="lbl">Duração (Horas)</label>
              <input type="number" required min="1" value={durationHours} onChange={(e) => setDurationHours(e.target.value)} />

              <label className="lbl">Quantidade de Pessoas Presentes</label>
              <input type="number" required min="1" value={attendeesCount} onChange={(e) => setAttendeesCount(e.target.value)} />

              {/* Anexar Fotos */}
              <label className="lbl">Foto do Evento (Anexar 1 foto)</label>
              {meetingPhotoFiles.length > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--panel2)', padding: 8, borderRadius: 10, marginBottom: 12 }}>
                  <img src={URL.createObjectURL(meetingPhotoFiles[0])} alt="Preview" style={{ width: 50, height: 50, borderRadius: 6, objectFit: 'cover' }} />
                  <span style={{ fontSize: 12, color: 'var(--ink1)', flex: 1 }}>Foto do Evento Selecionada</span>
                  <button type="button" className="btn btn-warn btn-sm" style={{ width: 'auto', margin: 0, padding: '4px 10px' }} onClick={() => setMeetingPhotoFiles([])}>Remover</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ flex: 1, margin: 0, padding: '8px 10px', fontSize: 12 }} onClick={() => startWebCamera('event')}>📸 Tirar Foto</button>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ flex: 1, margin: 0, padding: '8px 10px', fontSize: 12 }} onClick={() => fileInputEventGallery.current?.click()}>🖼️ Escolher Galeria</button>
                  <input ref={fileInputEventGallery} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => setMeetingPhotoFiles(e.target.files ? [e.target.files[0]] : [])} />
                </div>
              )}

              {/* Lista física */}
              <label className="lbl">Foto da Lista de Presentes (Nome e Telefone)</label>
              {presencePhotoFile ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--panel2)', padding: 8, borderRadius: 10, marginBottom: 12 }}>
                  <img src={URL.createObjectURL(presencePhotoFile)} alt="Preview" style={{ width: 50, height: 50, borderRadius: 6, objectFit: 'cover' }} />
                  <span style={{ fontSize: 12, color: 'var(--ink1)', flex: 1 }}>Foto da Lista Selecionada</span>
                  <button type="button" className="btn btn-warn btn-sm" style={{ width: 'auto', margin: 0, padding: '4px 10px' }} onClick={() => setPresencePhotoFile(null)}>Remover</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ flex: 1, margin: 0, padding: '8px 10px', fontSize: 12 }} onClick={() => startWebCamera('presence')}>📸 Tirar Foto da Lista</button>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ flex: 1, margin: 0, padding: '8px 10px', fontSize: 12 }} onClick={() => fileInputPresenceGallery.current?.click()}>🖼️ Escolher Galeria</button>
                  <input ref={fileInputPresenceGallery} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => setPresencePhotoFile(e.target.files ? e.target.files[0] : null)} />
                </div>
              )}



              <button className="btn btn-violet" type="submit" disabled={savingCompletion}>
                {savingCompletion ? 'Registrando...' : 'Registrar Evento'}
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
            <div style={{ color: 'var(--teal)', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{selectedMeetingDetails.title}</div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>👤 Criado por: {selectedMeetingDetails.profiles?.name || 'Membro'}</div>

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

            {/* Participantes do Evento */}
            <div style={{ marginBottom: 14, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
              <label className="lbl">Membros Participantes</label>
              
              {/* Se a lista estiver vazia */}
              {(!selectedMeetingDetails.presence_list || selectedMeetingDetails.presence_list.length === 0) ? (
                <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 8 }}>Nenhum membro marcado neste evento.</div>
              ) : (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {(selectedMeetingDetails.presence_list || []).map((userObj) => (
                    <span 
                      key={userObj.id} 
                      style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: 6, 
                        background: 'var(--panel2)', 
                        border: '1px solid var(--line)', 
                        borderRadius: 20, 
                        padding: '4px 10px', 
                        fontSize: 12, 
                        color: 'var(--ink1)' 
                      }}
                    >
                      @{userObj.username}
                      
                      {/* Se o usuário for o criador do evento ou admin, ele pode remover participantes */}
                      {(profile.role === 'admin' || selectedMeetingDetails.created_by === profile.id) && (
                        <span 
                          onClick={async () => {
                            const updated = (selectedMeetingDetails.presence_list || []).filter(u => u.id !== userObj.id);
                            try {
                              await updateMeeting(selectedMeetingDetails.id, { presence_list: updated });
                              setSelectedMeetingDetails(prev => ({ ...prev, presence_list: updated }));
                              await load();
                            } catch (err) {
                              alert('Erro ao remover participante: ' + err.message);
                            }
                          }}
                          style={{ color: 'var(--warn)', fontWeight: 'bold', cursor: 'pointer', marginLeft: 4 }}
                          title="Remover"
                        >
                          ✕
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              )}

              {/* Se o usuário for o criador do evento ou admin, ele pode adicionar novos participantes */}
              {(profile.role === 'admin' || selectedMeetingDetails.created_by === profile.id) && (
                <div style={{ position: 'relative', marginTop: 8 }}>
                  <input 
                    placeholder="Pesquisar participante por usuário..." 
                    value={participantSearchText} 
                    onChange={(e) => setParticipantSearchText(e.target.value)} 
                    style={{ fontSize: 12, padding: '6px 10px' }}
                  />
                  {participantSearchText.trim().length >= 3 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, zIndex: 1000, maxHeight: 120, overflowY: 'auto', marginTop: 4 }}>
                      {profiles
                        .filter(p => p.username?.toLowerCase().includes(participantSearchText.toLowerCase()) || p.name?.toLowerCase().includes(participantSearchText.toLowerCase()))
                        // Não mostrar usuários que já estão na lista
                        .filter(p => !(selectedMeetingDetails.presence_list || []).some(existing => existing.id === p.id))
                        .slice(0, 5)
                        .map(p => (
                          <div 
                            key={p.id} 
                            onClick={async () => {
                              const updated = [...(selectedMeetingDetails.presence_list || []), { id: p.id, username: p.username, name: p.name }];
                              try {
                                await updateMeeting(selectedMeetingDetails.id, { presence_list: updated });
                                setSelectedMeetingDetails(prev => ({ ...prev, presence_list: updated }));
                                setParticipantSearchText('');
                                await load();
                              } catch (err) {
                                alert('Erro ao adicionar participante: ' + err.message);
                              }
                            }}
                            style={{ padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid var(--line)', color: 'var(--ink1)', fontSize: 12.5 }}
                            onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--panel2)'}
                            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                          >
                            <strong>@{p.username}</strong> - {p.name}
                          </div>
                        ))
                      }
                      {profiles
                        .filter(p => p.username?.toLowerCase().includes(participantSearchText.toLowerCase()) || p.name?.toLowerCase().includes(participantSearchText.toLowerCase()))
                        .filter(p => !(selectedMeetingDetails.presence_list || []).some(existing => existing.id === p.id))
                        .length === 0 && (
                          <div style={{ padding: '6px 10px', color: 'var(--ink3)', fontSize: 12 }}>Nenhum membro disponível.</div>
                        )}
                    </div>
                  )}
                </div>
              )}
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



            {/* Foto da lista física */}
            {selectedMeetingDetails.presence_photo_url && (
              <div style={{ marginBottom: 14 }}>
                <label className="lbl">Foto da Lista de Presentes</label>
                <a href={selectedMeetingDetails.presence_photo_url} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ fontSize: 12, gap: 8, padding: 8 }}>
                  <img src={selectedMeetingDetails.presence_photo_url} alt="" style={{ width: 28, height: 28, borderRadius: 4 }} />
                  Ver Foto da Lista de Presentes (Assinada)
                </a>
              </div>
            )}

            {/* Se o evento já aconteceu (hoje ou no passado) e o usuário pode editar (é criador ou admin) */}
            {selectedMeetingDetails.date <= new Date().toISOString().split('T')[0] && 
             (profile.role === 'admin' || selectedMeetingDetails.created_by === profile.id) && (
              <div style={{ marginBottom: 14, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
                <label className="lbl" style={{ color: 'var(--teal)' }}>📷 Anexar ou Alterar Fotos do Evento</label>
                
                {/* Upload Foto do Evento */}
                <div style={{ marginBottom: 10 }}>
                  <span style={{ fontSize: 11, color: 'var(--ink2)' }}>Foto do Evento:</span>
                  {editMeetingPhotoFiles.length > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--panel2)', padding: 6, borderRadius: 8, marginTop: 4 }}>
                      <img src={URL.createObjectURL(editMeetingPhotoFiles[0])} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }} />
                      <span style={{ fontSize: 11, color: 'var(--ink1)', flex: 1 }}>Nova foto selecionada</span>
                      <button type="button" className="btn btn-warn btn-sm" style={{ width: 'auto', margin: 0, padding: '2px 8px', fontSize: 11 }} onClick={() => setEditMeetingPhotoFiles([])}>Remover</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button type="button" className="btn btn-ghost btn-sm" style={{ flex: 1, margin: 0, padding: '6px 8px', fontSize: 11 }} onClick={() => startWebCamera('edit_event')}>📸 Tirar</button>
                      <button type="button" className="btn btn-ghost btn-sm" style={{ flex: 1, margin: 0, padding: '6px 8px', fontSize: 11 }} onClick={() => editFileInputEventGallery.current?.click()}>🖼️ Galeria</button>
                      <input ref={editFileInputEventGallery} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => setEditMeetingPhotoFiles(e.target.files ? [e.target.files[0]] : [])} />
                    </div>
                  )}
                </div>

                {/* Upload Foto da Lista */}
                <div style={{ marginBottom: 14 }}>
                  <span style={{ fontSize: 11, color: 'var(--ink2)' }}>Foto da Lista de Presentes:</span>
                  {editPresencePhotoFile ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--panel2)', padding: 6, borderRadius: 8, marginTop: 4 }}>
                      <img src={URL.createObjectURL(editPresencePhotoFile)} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }} />
                      <span style={{ fontSize: 11, color: 'var(--ink1)', flex: 1 }}>Nova lista selecionada</span>
                      <button type="button" className="btn btn-warn btn-sm" style={{ width: 'auto', margin: 0, padding: '2px 8px', fontSize: 11 }} onClick={() => setEditPresencePhotoFile(null)}>Remover</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button type="button" className="btn btn-ghost btn-sm" style={{ flex: 1, margin: 0, padding: '6px 8px', fontSize: 11 }} onClick={() => startWebCamera('edit_presence')}>📸 Tirar</button>
                      <button type="button" className="btn btn-ghost btn-sm" style={{ flex: 1, margin: 0, padding: '6px 8px', fontSize: 11 }} onClick={() => editFileInputPresenceGallery.current?.click()}>🖼️ Galeria</button>
                      <input ref={editFileInputPresenceGallery} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => setEditPresencePhotoFile(e.target.files ? e.target.files[0] : null)} />
                    </div>
                  )}
                </div>

                {/* Botão de Salvar */}
                {(editMeetingPhotoFiles.length > 0 || editPresencePhotoFile) && (
                  <button 
                    type="button" 
                    className="btn btn-violet" 
                    disabled={savingEditPhotos}
                    onClick={handleSaveEditPhotos}
                    style={{ padding: '10px', fontSize: 13, width: '100%', marginBottom: 10 }}
                  >
                    {savingEditPhotos ? 'Salvando Fotos...' : '💾 Salvar Novas Fotos'}
                  </button>
                )}
              </div>
            )}

            {/* Aviso para datas futuras */}
            {selectedMeetingDetails.date > new Date().toISOString().split('T')[0] && (
              <div style={{ backgroundColor: 'rgba(235, 94, 40, 0.1)', border: '1px dashed var(--warn)', borderRadius: 10, padding: 12, marginBottom: 14, textAlign: 'center' }}>
                <span style={{ color: 'var(--warn)', fontSize: 12.5, fontWeight: 600 }}>
                  ⚠️ Anexe as fotos na data do evento
                </span>
              </div>
            )}

            <button className="btn btn-ghost" onClick={() => { setDetailsModalOpen(false); setSelectedMeetingDetails(null); setEditMeetingPhotoFiles([]); setEditPresencePhotoFile(null); }}>Fechar</button>
          </div>
        </div>
      )}
      {/* MODAL CÂMERA WEB REALTIME */}
      {cameraActive && (
        <div className="modal-bg" style={{ zIndex: 3000 }}>
          <div className="modal" style={{ maxWidth: 440, padding: 16, backgroundColor: '#090d16', borderColor: 'var(--line)' }}>
            <h3 style={{ color: '#fff', fontSize: 15, marginBottom: 12, textAlign: 'center' }}>
              {cameraTarget === 'event' ? 'Tirar Foto do Evento' : 'Tirar Foto da Lista de Presentes'}
            </h3>
            
            <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', backgroundColor: '#000', height: 350 }}>
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 16 }}>
              <button 
                type="button" 
                className="btn btn-violet" 
                onClick={captureWebPhoto}
                style={{ borderRadius: '50%', width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, padding: 0 }}
              >
                📸
              </button>
              
              <button 
                type="button" 
                className="btn btn-ghost" 
                onClick={stopWebCamera}
                style={{ width: '100%', color: 'var(--ink3)' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
