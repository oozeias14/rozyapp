import { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import { supabase, MAX_PHOTO_BYTES, compressImageWeb } from '../lib/supabase';
import TopBar from '../components/TopBar';
import { updateProfile, changeOwnPassword, fetchAppSettings, fetchAllProfiles } from '../lib/api';

export default function ProfileScreen({ profile, onProfileUpdated, onOpenAdmin, onLogout }) {
  const [uploading, setUploading] = useState(false);
  const [instagram, setInstagram] = useState(profile.instagram || '');
  const [facebook, setFacebook] = useState(profile.facebook || '');
  const [tiktok, setTiktok] = useState(profile.tiktok || '');
  const [whatsapp, setWhatsapp] = useState(profile.whatsapp || '');
  const [newPassword, setNewPassword] = useState('');
  const [appDomain, setAppDomain] = useState('orbita.app');
  const [totalUsers, setTotalUsers] = useState(0);
  const fileInputRef = useRef(null);
  const qrRef = useRef(null);

  const referralLink = `https://${appDomain}/r/${profile.id}`;
  const isStaff = profile.role === 'admin' || profile.role === 'coord';

  useEffect(() => {
    (async () => {
      const [settings, all] = await Promise.all([fetchAppSettings(), fetchAllProfiles()]);
      if (settings) setAppDomain(settings.app_domain);
      setTotalUsers(all.length);
    })();
  }, []);

  useEffect(() => {
    if (qrRef.current) QRCode.toCanvas(qrRef.current, referralLink, { width: 150, color: { dark: '#090C12', light: '#F0F4FA' } });
  }, [referralLink]);

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
        alert(isSizeErr ? 'Imagem muito grande: o servidor recusou o arquivo (limite de 1 MB).' : 'Erro ao enviar foto: ' + uploadError.message);
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

  async function copyCode() {
    await navigator.clipboard.writeText(String(profile.id));
    alert('Código copiado!');
  }

  function shareWhatsApp() {
    const text = `Entre no Amigos da Rozy Costa! Use meu código de indicação: ${profile.id} (digite esse número no cadastro do app)`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }

  async function shareGeneric() {
    const text = `Entre no Amigos da Rozy Costa! Meu código de indicação: ${profile.id}`;
    if (navigator.share) { try { await navigator.share({ text }); } catch {} }
    else { await navigator.clipboard.writeText(text); alert('Copiado — cole no Instagram'); }
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
        <div className="muted" style={{ fontSize: 10, marginBottom: 8 }}>Toque para escolher uma foto (máx. 1 MB)</div>
        <h2 style={{ fontSize: 17 }}>{profile.name}</h2>
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
        <input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@usuario" />
        <label className="lbl">Facebook</label>
        <input value={facebook} onChange={(e) => setFacebook(e.target.value)} placeholder="Seu nome no Facebook" />
        <label className="lbl">TikTok</label>
        <input value={tiktok} onChange={(e) => setTiktok(e.target.value)} placeholder="@usuario" />
        <label className="lbl">WhatsApp</label>
        <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="5561999999999" />
        <button className="btn btn-teal" onClick={saveSocials}>Salvar redes sociais</button>
      </div>

      <div className="card-title">Seu código de indicação</div>
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="mono" style={{ fontSize: 34, fontWeight: 700, color: 'var(--teal)', letterSpacing: 1 }}>#{profile.id}</div>
        <div className="muted" style={{ marginTop: 4 }}>Peça para a pessoa digitar este número no campo "Código de indicação" na tela de Cadastro.</div>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={copyCode}>Copiar código</button>
      </div>

      <div className="btn-row" style={{ marginBottom: 12 }}>
        <button className="btn btn-teal" style={{ flex: 1, marginBottom: 0 }} onClick={shareWhatsApp}>🟢 WhatsApp</button>
        <button className="btn btn-violet" style={{ flex: 1, marginBottom: 0 }} onClick={shareGeneric}>📸 Instagram</button>
      </div>

      <div className="card-title">Link e QR Code (opcional)</div>
      <div className="card">
        <div className="lbox"><span>{referralLink}</span></div>
        <div className="muted" style={{ marginBottom: 10 }}>O link só vai abrir de verdade quando o app tiver um domínio próprio publicado — enquanto isso, use o código acima.</div>
        <div style={{ textAlign: 'center' }}><canvas ref={qrRef} /></div>
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
