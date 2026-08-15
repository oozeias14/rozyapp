import { useEffect, useState, useCallback } from 'react';
import TopBar from '../components/TopBar';
import { fetchAllProfiles, fetchOwnerProfile, incrementInstagramRedirects, incrementProfileRedirects } from '../lib/api';

function getYoutubeId(url) {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

export default function OwnerScreen({ profile, onOpenAdminOwner }) {
  const [owner, setOwner] = useState(null);
  const [totalUsers, setTotalUsers] = useState(0);
  const isAdmin = profile.role === 'admin';

  const load = useCallback(async () => {
    const [o, all] = await Promise.all([fetchOwnerProfile(), fetchAllProfiles()]);
    setOwner(o);
    setTotalUsers(all.length);
  }, []);

  useEffect(() => {
    load();
    incrementProfileRedirects().catch(err => console.log('Erro ao registrar visita:', err));
  }, [load]);

  async function handleSocialPress(social) {
    if (social.key === 'instagram') {
      incrementInstagramRedirects().catch(err => console.log('Erro ao registrar redirecionamento Instagram:', err));
    }
  }

  if (!owner) return null;

  const socials = [
    owner.instagram && {
      key: 'instagram',
      label: 'Instagram',
      value: owner.instagram,
      icon: (
        <svg viewBox="0 0 448 512" width="18" height="18" fill="url(#instagram-gradient)">
          <defs>
            <radialGradient id="instagram-gradient" cx="30%" cy="107%" r="130%" fx="30%" fy="107%">
              <stop offset="0%" stopColor="#fdf497" />
              <stop offset="5%" stopColor="#fdf497" />
              <stop offset="45%" stopColor="#fd5949" />
              <stop offset="60%" stopColor="#d6249f" />
              <stop offset="90%" stopColor="#285AEB" />
            </radialGradient>
          </defs>
          <path d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z" />
        </svg>
      ),
      url: `https://instagram.com/${owner.instagram.replace('@', '')}`
    },
    owner.tiktok && { key: 'tiktok', label: 'TikTok', value: owner.tiktok, icon: '🎵', url: `https://tiktok.com/${owner.tiktok}` },
    owner.whatsapp && {
      key: 'whatsapp',
      label: 'WhatsApp',
      value: `Falar com ${owner.name}`,
      icon: (
        <svg viewBox="0 0 448 512" width="18" height="18" fill="#25D366">
          <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-117zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
        </svg>
      ),
      url: `https://wa.me/${owner.whatsapp}`
    },
  ].filter(Boolean);

  return (
    <div className="screen">
      <TopBar totalUsers={totalUsers} />

      {isAdmin && <button className="btn btn-violet" style={{ marginBottom: 12 }} onClick={onOpenAdminOwner}>✏️ Editar esta página (Admin)</button>}

      {/* Cartão de Visita Digital Premium */}
      <div className="card-gradient" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '24px 20px' }}>
        <div className="av av-lg" style={{ width: 100, height: 100, borderRadius: '50%', overflow: 'hidden', margin: '0 auto 12px', border: '3px solid var(--teal)', flexShrink: 0 }}>
          <img src={owner.photo_url || '/candido.jpg'} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        
        <div className="card-badge" style={{ color: 'var(--teal)', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>⚖️ ADVOGADO</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 2px', color: 'var(--ink1)' }}>{owner.name}</h2>
        <div style={{ fontSize: 12, color: 'var(--ink2)', marginBottom: 12 }}>Especialista Fundiário</div>

        <div className="card-divider" style={{ width: '100%', height: 1, background: 'var(--line)', margin: '8px 0 16px' }} />

        <div className="bio-text" style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink1)', marginBottom: 0, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
          {owner.bio.split('\n').map((line, idx) => (
            <div key={idx}>{line}</div>
          ))}
        </div>
      </div>

      {/* Seção de Vídeo Diário */}
      {owner.video_url && (
        <div className="card" style={{ marginTop: 16, padding: '16px 20px' }}>
          <div className="card-title" style={{ color: 'var(--ink2)', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: 10, fontWeight: 700, marginBottom: 12 }}>🎥 Vídeo de Hoje</div>
          
          {getYoutubeId(owner.video_url) ? (
            <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', height: 0, borderRadius: 12, overflow: 'hidden', background: '#000', marginBottom: 12 }}>
              <iframe
                src={`https://www.youtube.com/embed/${getYoutubeId(owner.video_url)}`}
                title="Vídeo de Hoje"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
              />
            </div>
          ) : (
            <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px dashed rgba(255,255,255,0.1)', marginBottom: 12, textAlign: 'center' }}>
              <a href={owner.video_url} target="_blank" rel="noreferrer" style={{ color: 'var(--teal)', fontSize: 13, textDecoration: 'underline', wordBreak: 'break-all' }}>
                🔗 Assistir Vídeo Externo
              </a>
            </div>
          )}
          
          <a
            href={`https://api.whatsapp.com/send?text=${encodeURIComponent('Olha esse vídeo do Dr. Candido: ' + owner.video_url)}`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-teal"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: 13,
              width: '100%',
              padding: '10px 16px',
            }}
          >
            <svg viewBox="0 0 448 512" width="16" height="16" fill="currentColor">
              <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-117zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
            </svg>
            Compartilhar no WhatsApp
          </a>
        </div>
      )}

      <div className="card-title" style={{ marginTop: 20 }}>Siga nas redes sociais</div>
      {socials.length === 0 && <div className="empty">Redes sociais serão configuradas pelo Admin.</div>}
      {socials.map((s) => (
        <a key={s.key} className="sc" href={s.url} target="_blank" rel="noreferrer" onClick={() => handleSocialPress(s)}>
          <div className="ic" style={{ background: 'var(--panel)' }}>{s.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: 'var(--ink2)' }}>{s.label}</div>
            <div style={{ fontWeight: 700 }}>{s.value}</div>
          </div>
          <div style={{ color: 'var(--teal)', fontSize: 11, fontWeight: 700 }}>{s.key === 'whatsapp' ? 'Abrir' : 'Seguir'}</div>
        </a>
      ))}
      <div style={{ height: 20 }} />
    </div>
  );
}

