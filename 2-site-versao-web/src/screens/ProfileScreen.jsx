import { useEffect, useState, useRef } from 'react';
import { supabase, MAX_PHOTO_BYTES, compressImageWeb } from '../lib/supabase';
import TopBar from '../components/TopBar';
import { updateProfile, changeOwnPassword, fetchAppSettings, fetchTotalUsersCount } from '../lib/api';

export default function ProfileScreen({ profile, onProfileUpdated, onOpenAdmin, onLogout }) {
  const [uploading, setUploading] = useState(false);
  const [instagram, setInstagram] = useState(profile.instagram || '');
  const [facebook, setFacebook] = useState(profile.facebook || '');
  const [tiktok, setTiktok] = useState(profile.tiktok || '');
  const [whatsapp, setWhatsapp] = useState(profile.whatsapp || '');
  const [newPassword, setNewPassword] = useState('');
  const [appDomain, setAppDomain] = useState('amigosdrcandido.com.br');
  const [totalUsers, setTotalUsers] = useState(0);
  const fileInputRef = useRef(null);

  const referralLink = `https://${appDomain}/${profile.username || profile.id}`;
  const isStaff = profile.role === 'admin' || profile.role === 'coord';

  useEffect(() => {
    (async () => {
      const [settings, count] = await Promise.all([fetchAppSettings(), fetchTotalUsersCount()]);
      if (settings) setAppDomain(settings.app_domain);
      setTotalUsers(count);
    })();
  }, []);

  useEffect(() => {
    function handleMessage(event) {
      if (event.origin !== window.location.origin) return;
      if (event.data && event.data.provider) {
        const { provider, username } = event.data;
        if (provider === 'instagram') setInstagram(username);
        else if (provider === 'facebook') setFacebook(username);
        else if (provider === 'tiktok') setTiktok(username);
        else if (provider === 'whatsapp') setWhatsapp(username);
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  function openLinkPopup(provider) {
    const w = 450;
    const h = 600;
    const left = window.screen.width / 2 - w / 2;
    const top = window.screen.height / 2 - h / 2;
    
    // Normalize and clean up accents from profile name to create a fallback handle
    const defaultUser = profile.username || profile.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '');
    const defaultPhone = profile.whatsapp || '5561999999999';

    let mockVal = defaultUser;
    if (provider === 'facebook') mockVal = profile.name;
    if (provider === 'whatsapp') mockVal = defaultPhone;

    // Real API configurations if defined in env
    const clientId = import.meta.env.VITE_INSTAGRAM_CLIENT_ID || '';
    const redirectUri = window.location.origin + '/vincular.html';
    const supabaseUrl = supabase.supabaseUrl || '';
    const supabaseKey = supabase.supabaseKey || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

    let url = `/vincular.html?provider=${provider}&val=${encodeURIComponent(mockVal)}`;

    // If using Instagram and have clientId configured, append real OAuth parameters
    if (provider === 'instagram' && clientId) {
      url += `&clientId=${encodeURIComponent(clientId)}&redirectUri=${encodeURIComponent(redirectUri)}&supabaseUrl=${encodeURIComponent(supabaseUrl)}&supabaseKey=${encodeURIComponent(supabaseKey)}`;
    }

    window.open(
      url,
      'vincular',
      `width=${w},height=${h},top=${top},left=${left},resizable=yes,scrollbars=yes`
    );
  }

  async function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    setUploading(true);
    try {
      const compressed = await compressImageWeb(file);
      const ext = compressed.name.split('.').pop().toLowerCase();
      const path = `${profile.auth_id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, compressed, { upsert: true, contentType: compressed.type || 'image/jpeg' });
      if (uploadError) {
        const isSizeErr = uploadError.message.toLowerCase().includes('exceed');
        alert(isSizeErr ? 'Imagem muito grande: o servidor recusou o arquivo (limite de 200 KB).' : 'Erro ao enviar foto: ' + uploadError.message);
        setUploading(false);
        return;
      }
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const photoUrl = pub.publicUrl + `?t=${Date.now()}`;
      await updateProfile(profile.id, { photo_url: photoUrl });
      onProfileUpdated({ ...profile, photo_url: photoUrl });
    } catch (err) {
      alert('Erro inesperado: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  async function saveSocials() {
    try {
      await updateProfile(profile.id, { instagram, facebook, tiktok, whatsapp });
      onProfileUpdated({ ...profile, instagram, facebook, tiktok, whatsapp });
      alert('Redes sociais atualizadas.');
    } catch (err) { alert('Erro: ' + err.message); }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    if (newPassword.length < 6) { alert('Use ao menos 6 caracteres.'); return; }
    try { await changeOwnPassword(newPassword); setNewPassword(''); alert('Senha alterada.'); }
    catch (err) { alert('Erro: ' + err.message); }
  }

  return (
    <div className="screen">
      <TopBar totalUsers={totalUsers} />

      <div className="card" style={{ textAlign: 'center' }}>
        <div className="photo-ring" onClick={() => fileInputRef.current?.click()}>
          {uploading ? '...' : profile.photo_url ? <img src={profile.photo_url} alt="" /> : '📷'}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
        <div className="muted" style={{ fontSize: 10, marginBottom: 8 }}>Toque para escolher uma foto (máx. 200 KB)</div>
        <h2 style={{ fontSize: 17, marginBottom: 2 }}>{profile.name}</h2>
        <div style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, marginBottom: 4 }}>@{profile.username || 'sem_usuario'}</div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 5 }}>
          <span className="id-badge">#{profile.id}</span>
          <span className={`role-badge ${profile.role === 'admin' ? 'role-admin' : profile.role === 'coord' ? 'role-coord' : 'role-user'}`}>
            {profile.role === 'admin' ? 'Admin' : profile.role === 'coord' ? 'Coord' : 'Membro'}
          </span>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>{profile.email}</div>
      </div>

      <div className="card-title">Editar redes sociais</div>
      <div className="card">
        <label className="lbl">Instagram</label>
        <div className="social-input-wrapper">
          <input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@usuario" style={{ paddingRight: '12px' }} />
        </div>
        <label className="lbl">Facebook</label>
        <div className="social-input-wrapper">
          <input value={facebook} onChange={(e) => setFacebook(e.target.value)} placeholder="Seu nome no Facebook" style={{ paddingRight: '12px' }} />
        </div>
        <label className="lbl">TikTok</label>
        <div className="social-input-wrapper">
          <input value={tiktok} onChange={(e) => setTiktok(e.target.value)} placeholder="@usuario" style={{ paddingRight: '12px' }} />
        </div>
        <label className="lbl">WhatsApp</label>
        <div className="social-input-wrapper">
          <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="5561999999999" style={{ paddingRight: '12px' }} />
        </div>
        <button className="btn btn-teal" onClick={saveSocials}>Salvar redes sociais</button>
      </div>

      <div className="card-title">Link de indicação</div>
      <div className="card" style={{ padding: '16px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          background: 'var(--panel2)',
          border: '1px solid var(--line)',
          borderRadius: '12px',
          padding: '12px 16px',
          cursor: 'pointer',
          width: '100%'
        }} onClick={async () => { await navigator.clipboard.writeText(referralLink); alert('Link de indicação copiado!'); }}>
          <span style={{
            flex: 1,
            color: 'var(--teal)',
            fontFamily: 'var(--mono)',
            fontSize: '13px',
            wordBreak: 'break-all',
            marginRight: '12px',
            textAlign: 'left'
          }}>
            {referralLink}
          </span>
          <span style={{
            fontSize: '18px',
            color: 'var(--ink2)',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0
          }}>
            📋
          </span>
        </div>
        <div className="muted" style={{ marginTop: '10px' }}>Toque no link acima para copiar o seu endereço de indicação direta.</div>
      </div>

      <div className="card-title">Alterar minha senha</div>
      <div className="card">
        <form onSubmit={handleChangePassword}>
          <label className="lbl">Nova senha</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
          <button className="btn btn-violet" type="submit">Alterar senha</button>
        </form>
      </div>

      {isStaff && <button className="btn btn-violet" onClick={onOpenAdmin}>⚙️ Abrir painel {profile.role === 'admin' ? 'Admin' : 'Coordenador'}</button>}
      <button className="btn btn-ghost" onClick={onLogout}>Sair da conta</button>
      <div style={{ height: 20 }} />
    </div>
  );
}
