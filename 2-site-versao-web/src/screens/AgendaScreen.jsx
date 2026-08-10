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

  // Form de criação de Evento Direto
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
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

  // Cadastro direto de evento concluído
  async function handleSave(e) {
    e.preventDefault();
    if (!title.trim() || !date.trim() || !location.trim()) { 
      alert('Por favor, preencha o título, a data e o local do evento.'); 
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

      // 2. Upload da foto da lista de presentes
      if (presencePhotoFile) {
        const ext = presencePhotoFile.name.split('.').pop().toLowerCase();
        const filename = `meeting_${meetId}/presence_list.${ext}`;
        const { error: uploadError } = await supabase.storage.from('meetings').upload(filename, presencePhotoFile, { upsert: true, contentType: presencePhotoFile.type });
        if (uploadError) throw uploadError;
        const { data: pub } = supabase.storage.from('meetings').getPublicUrl(filename);
        finalPresencePhotoUrl = pub.publicUrl;
      }

      // 3. Upload das fotos do evento
      for (const file of meetingPhotoFiles) {
        if (finalPhotos.length >= 3) break;
        const ext = file.name.split('.').pop().toLowerCase();
        const filename = `meeting_${meetId}/photo_${Date.now()}_${Math.floor(Math.random()*1000)}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('meetings').upload(filename, file, { upsert: true, contentType: file.type });
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
      setTitle(''); setDate(''); setTime(''); setLocation(''); setCoords(null);
      setDurationHours('2'); setAttendeesCount('15');
      setPresentMembers([]); setPresencePhotoFile(null); setMeetingPhotoFiles([]);
      await load();
    } catch (err) {
      alert('Erro ao registrar evento: ' + err.message);
    } finally {
      setSavingCompletion(false);
    }
  }

  async function handleDelete(id) {
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

      <div className="row-bw" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 17, margin: 0 }}>Eventos</h2>
        <button className="btn btn-violet btn-sm" style={{ width: 'auto', marginBottom: 0 }} onClick={() => setModalOpen(true)}>+ Novo Evento</button>
      </div>

      {meetings.length === 0 && <div className="empty">Nenhum evento registrado.</div>}
      {meetings.map((m) => {
        const isOwnerHost = m.created_by === profile.id || profile.role === 'admin' || profile.role === 'coord';
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
                <div className="muted">{m.time}</div>
              </div>
            </div>

            <button className="btn btn-ghost btn-sm" style={{ marginTop: 10, width: '100%', marginBottom: 0 }} onClick={() => { setSelectedMeetingDetails(m); setDetailsModalOpen(true); }}>📊 Ver Detalhes e Lista</button>

            {isOwnerHost && (
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
              <label className="lbl">Título</label>
              <input placeholder="Ex: Grande reunião" value={title} onChange={(e) => setTitle(e.target.value)} required />
              
              <label className="lbl">Data</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              
              <label className="lbl">Horário</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              
              <label className="lbl">Onde foi feita a reunião (Local)</label>
              <input placeholder="Ex: Chácara São José - DF" value={location} onChange={(e) => setLocation(e.target.value)} required />

              <label className="lbl">Localização exata (opcional)</label>
              {coords ? (
                <div className="lbox" style={{ borderColor: 'var(--teal)' }}>
                  <span style={{ color: 'var(--teal)' }}>📍 Localização capturada ✅</span>
                  <a href={mapsUrl(coords.lat, coords.lng)} target="_blank" rel="noreferrer" style={{ color: 'var(--violet)', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>Ver no mapa</a>
                  <button type="button" onClick={() => setCoords(null)} style={{ background: 'none', border: 'none', color: 'var(--warn)', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>Remover</button>
                </div>
              ) : (
                <button type="button" className="btn btn-ghost" onClick={captureLocation} disabled={capturing} style={{ marginBottom: 14 }}>
                  {capturing ? 'Obtendo localização...' : '📍 Usar minha localização atual'}
                </button>
              )}
              <label className="lbl">Duração (Horas)</label>
              <input type="number" required min="1" value={durationHours} onChange={(e) => setDurationHours(e.target.value)} />

              <label className="lbl">Quantidade de Pessoas Presentes</label>
              <input type="number" required min="1" value={attendeesCount} onChange={(e) => setAttendeesCount(e.target.value)} />

              {/* Anexar Fotos */}
              <label className="lbl">Fotos do Evento (Anexar até 3 fotos)</label>
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
