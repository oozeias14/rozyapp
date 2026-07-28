import { useEffect, useState, useCallback } from 'react';
import TopBar from '../components/TopBar';
import { fetchAllProfiles, fetchOwnerProfile, incrementInstagramRedirects, incrementProfileRedirects } from '../lib/api';

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

  async function shareBusinessCard() {
    if (!owner) return;
    const shareMessage = `⚖️ *Dr. Candido Teles — Cartão de Visita Digital*\n\n${owner.bio}\n\n📸 Siga no Instagram: https://instagram.com/${owner.instagram?.replace('@', '') || 'drcandidoteles'}\n\nFaça parte do aplicativo Órbita e conecte-se conosco!`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Dr. Candido Teles',
          text: shareMessage,
        });
      } catch (e) {
        console.log('Erro no compartilhamento web:', e);
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareMessage);
        alert('Copiado! O cartão de visita digital foi copiado para sua área de transferência.');
      } catch (e) {
        console.log('Erro ao copiar para clipboard:', e);
      }
    }
  }

  if (!owner) return null;

  const socials = [
    owner.instagram && { key: 'instagram', label: 'Instagram', value: owner.instagram, icon: '📸', url: `https://instagram.com/${owner.instagram.replace('@', '')}` },
    owner.facebook && { key: 'facebook', label: 'Facebook', value: owner.facebook, icon: '📘', url: `https://facebook.com/${encodeURIComponent(owner.facebook)}` },
    owner.tiktok && { key: 'tiktok', label: 'TikTok', value: owner.tiktok, icon: '🎵', url: `https://tiktok.com/${owner.tiktok}` },
    owner.whatsapp && { key: 'whatsapp', label: 'WhatsApp', value: `Falar com ${owner.name}`, icon: '💬', url: `https://wa.me/${owner.whatsapp}` },
    owner.youtube && { key: 'youtube', label: 'YouTube', value: 'Canal oficial', icon: '▶️', url: owner.youtube },
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
        
        <div className="card-badge" style={{ color: 'var(--teal)', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>⚖️ ADVOCACIA</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 2px', color: 'var(--ink1)' }}>{owner.name}</h2>
        <div style={{ fontSize: 12, color: 'var(--ink2)', marginBottom: 12 }}>Especialista Fundiário</div>

        <div className="card-divider" style={{ width: '100%', height: 1, background: 'var(--line)', margin: '8px 0 16px' }} />

        <div className="bio-text" style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink1)', marginBottom: 20, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
          {owner.bio.split('\n').map((line, idx) => (
            <div key={idx}>{line}</div>
          ))}
        </div>

        <button className="btn btn-violet" style={{ width: '100%', marginBottom: 0 }} onClick={shareBusinessCard}>
          🔗 Compartilhar Cartão de Visita
        </button>
      </div>

      <div className="card-title">Siga nas redes sociais</div>
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

