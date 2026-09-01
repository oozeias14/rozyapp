import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function FirstAccessModal({ profile, onClose }) {
  const [timeLeft, setTimeLeft] = useState(60);
  const [adminPhone, setAdminPhone] = useState('');
  const [loadingPhone, setLoadingPhone] = useState(true);

  // Fetch admin WhatsApp
  useEffect(() => {
    async function loadAdminPhone() {
      try {
        const { data: owner } = await supabase
          .from('owner_profile')
          .select('whatsapp')
          .eq('id', 1)
          .maybeSingle();

        if (owner && owner.whatsapp) {
          setAdminPhone(owner.whatsapp);
        } else {
          // Fallback to admin profile
          const { data: admin } = await supabase
            .from('profiles')
            .select('phone')
            .eq('role', 'admin')
            .limit(1)
            .maybeSingle();
          if (admin && admin.phone) {
            setAdminPhone(admin.phone);
          }
        }
      } catch (err) {
        console.error('Error fetching admin phone:', err);
      } finally {
        setLoadingPhone(false);
      }
    }
    loadAdminPhone();
  }, []);

  // Timer countdown
  useEffect(() => {
    if (timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  // Clean phone number and build message
  let waPhone = (adminPhone || '').replace(/\D/g, '');
  if (waPhone.length === 10 || waPhone.length === 11) {
    waPhone = '55' + waPhone;
  }

  const userLogin = profile.whatsapp || profile.phone || profile.username;
  const messageText = `Olá Dr. Cândido! Acabei de fazer meu primeiro acesso no Amigos Dr Cândido. *Nome:* ${profile.name} | *Login:* ${userLogin}`;
  const waUrl = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    ? `whatsapp://send?phone=${waPhone}&text=${encodeURIComponent(messageText)}`
    : `https://web.whatsapp.com/send?phone=${waPhone}&text=${encodeURIComponent(messageText)}`;

  function handleSendWhatsapp() {
    window.open(waUrl, '_blank');
    localStorage.setItem(`first_access_popup_dismissed_${profile.id}`, 'true');
    onClose();
  }

  function handleDirectClose() {
    localStorage.setItem(`first_access_popup_dismissed_${profile.id}`, 'true');
    onClose();
  }

  const formatSeconds = (sec) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="modal-bg" style={{ zIndex: 11000 }}>
      <div className="modal" style={{ maxWidth: 400, padding: 24, textAlign: 'center', backgroundColor: '#090d16', borderColor: 'var(--line)' }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>📲</div>
        <h2 style={{ fontSize: 18, color: '#fff', marginBottom: 10 }}>Seja Bem-vindo ao Amigos Dr. Cândido!</h2>
        
        <p style={{ color: 'var(--ink2)', fontSize: 13, marginBottom: 18, lineHeight: 1.5 }}>
          Olá, <strong style={{ color: 'var(--ink1)' }}>{profile.name}</strong>! Para ativar e liberar o seu acesso completo no sistema, envie uma mensagem para o WhatsApp do Dr. Cândido.
        </p>

        <div style={{ background: 'var(--panel2)', borderRadius: 12, padding: 14, marginBottom: 20, textAlign: 'left', border: '1px solid var(--line)' }}>
          <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Seu Login:</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--teal)', marginBottom: 8 }}>{userLogin}</div>
          
          <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Dr. Cândido WhatsApp:</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
            {loadingPhone ? 'Carregando...' : adminPhone || 'Não configurado'}
          </div>
        </div>

        {timeLeft > 0 ? (
          <div style={{ fontSize: 12, color: 'var(--warn)', marginBottom: 16, fontWeight: '700' }}>
            ⏱️ Aguarde {formatSeconds(timeLeft)} para fechar...
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--teal)', marginBottom: 16, fontWeight: '700' }}>
            ✅ Tempo finalizado. Você já pode fechar.
          </div>
        )}

        <p style={{ color: 'var(--ink3)', fontSize: 11, marginBottom: 16, fontStyle: 'italic' }}>
          * Aviso: Para fechar, envie mensagem ao WhatsApp do Dr. Cândido.
        </p>

        <button 
          onClick={handleSendWhatsapp}
          className="btn"
          style={{ 
            backgroundColor: '#25D366', 
            color: '#fff', 
            fontWeight: 700, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            gap: 8,
            padding: '12px',
            borderRadius: 10,
            marginBottom: 10,
            border: 'none',
            cursor: 'pointer',
            width: '100%'
          }}
        >
          <svg viewBox="0 0 448 512" width="18" height="18" fill="#fff" style={{ flexShrink: 0 }}>
            <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-117zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
          </svg>
          <span>Enviar Mensagem no WhatsApp</span>
        </button>

        <button 
          onClick={handleDirectClose}
          disabled={timeLeft > 0}
          className="btn btn-ghost"
          style={{ width: '100%', margin: 0, opacity: timeLeft > 0 ? 0.4 : 1, cursor: timeLeft > 0 ? 'not-allowed' : 'pointer' }}
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
