import { useEffect, useState, useRef } from 'react';
import { supabase, MAX_PHOTO_BYTES, compressImageWeb } from '../lib/supabase';
import TopBar from '../components/TopBar';
import { updateProfile, changeOwnPassword, fetchAppSettings, fetchTotalUsersCount } from '../lib/api';

export default function ProfileScreen({ profile, onProfileUpdated, onOpenAdmin, onLogout }) {
  const [uploading, setUploading] = useState(false);
  const [instagram, setInstagram] = useState(profile.instagram || '');
  const [facebook, setFacebook] = useState(profile.facebook || '');
  const [tiktok, setTiktok] = useState(profile.tiktok || '');
  const [whatsapp, setWhatsapp] = useState(profile.whatsapp || profile.phone || '');
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

      <div className="card" style={{ textAlign: 'center', background: 'linear-gradient(135deg, rgba(22, 28, 44, 0.95), rgba(13, 17, 28, 0.98))', border: '1.5px solid rgba(138, 43, 226, 0.15)', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)', borderRadius: 16 }}>
        <div className="photo-ring" onClick={() => fileInputRef.current?.click()} style={{ margin: '0 auto 10px', transition: 'all 0.3s ease', cursor: 'pointer' }}>
          {uploading ? '...' : profile.photo_url ? <img src={profile.photo_url} alt="" /> : '📷'}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
        <div className="muted" style={{ fontSize: 10, marginBottom: 12 }}>Toque para escolher uma foto (máx. 200 KB)</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 2, color: 'var(--ink1)' }}>{profile.name}</h2>
        <div style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 700, marginBottom: 6 }}>@{profile.username || 'sem_usuario'}</div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 6 }}>
          <span className="id-badge">#{profile.id}</span>
          <span className={`role-badge ${profile.role === 'admin' ? 'role-admin' : profile.role === 'coord' ? 'role-coord' : 'role-user'}`}>
            {profile.role === 'admin' ? 'Admin' : profile.role === 'coord' ? 'Coord' : 'Membro'}
          </span>
        </div>
        <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>{profile.email}</div>
      </div>

      <div className="card-title" style={{ marginTop: 20 }}>Editar redes sociais</div>
      <div className="card" style={{ background: 'linear-gradient(135deg, rgba(22, 28, 44, 0.95), rgba(13, 17, 28, 0.98))', border: '1.5px solid rgba(0, 242, 254, 0.12)', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)', borderRadius: 16 }}>
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

      <div className="card-title" style={{ marginTop: 20 }}>Link de indicação</div>
      <div className="card" style={{ padding: '16px', background: 'linear-gradient(135deg, rgba(22, 28, 44, 0.95), rgba(13, 17, 28, 0.98))', border: '1.5px solid rgba(0, 242, 254, 0.12)', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)', borderRadius: 16 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          background: 'rgba(0, 242, 254, 0.03)',
          border: '1.5px solid rgba(0, 242, 254, 0.25)',
          borderRadius: '12px',
          padding: '12px 16px',
          width: '100%',
          transition: 'all 0.3s ease'
        }}>
          <span style={{
            flex: 1,
            color: 'var(--teal)',
            fontFamily: 'var(--mono)',
            fontSize: '13px',
            wordBreak: 'break-all',
            marginRight: '12px',
            textAlign: 'left',
            cursor: 'pointer'
          }} onClick={async () => { await navigator.clipboard.writeText(referralLink); alert('Link de indicação copiado!'); }}>
            {referralLink}
          </span>
          <a 
            href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Venha fazer parte do Amigos Dr. Cândido! Cadastre-se pelo meu link de indicação: ${referralLink}`)}`}
            target="_blank" 
            rel="noreferrer"
            style={{
              marginRight: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              textDecoration: 'none'
            }}
          >
            <svg viewBox="0 0 448 512" width="20" height="20" fill="#25D366" style={{ cursor: 'pointer', filter: 'drop-shadow(0 0 2px rgba(37, 211, 102, 0.2))' }}>
              <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-117zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
            </svg>
          </a>
          <span style={{
            fontSize: '18px',
            color: 'var(--ink2)',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
            cursor: 'pointer'
          }} onClick={async () => { await navigator.clipboard.writeText(referralLink); alert('Link de indicação copiado!'); }}>
            📋
          </span>
        </div>
        <div className="muted" style={{ marginTop: '10px' }}>Toque no link acima para copiar o seu endereço de indicação direta.</div>
      </div>

      <div className="card-title" style={{ marginTop: 20 }}>Alterar minha senha</div>
      <div className="card" style={{ background: 'linear-gradient(135deg, rgba(22, 28, 44, 0.95), rgba(13, 17, 28, 0.98))', border: '1.5px solid rgba(138, 43, 226, 0.12)', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)', borderRadius: 16 }}>
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
