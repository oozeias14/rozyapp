import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

function translateError(err) {
  if (!err) return '';
  let msg = '';
  if (typeof err === 'string') {
    msg = err;
  } else {
    msg = err.message || err.error_description || err.error || String(err);
    if (msg === '[object Object]' || msg === '{}') {
      try {
        const keys = Object.keys(err);
        if (keys.length > 0) {
          msg = keys.map(k => `${k}: ${err[k]}`).join(', ');
        } else {
          msg = 'Erro interno do servidor (Verifique se as configurações de SMTP/Porta do Resend no seu Supabase estão corretas).';
        }
      } catch(e) {
        msg = String(err);
      }
    }
  }
  const lower = msg.toLowerCase();
  
  if (lower.includes('failed to fetch')) {
    return 'Não foi possível conectar ao servidor do Supabase. Verifique sua conexão com a internet ou se o seu projeto está pausado/desativado no painel da Supabase (se for plano gratuito, reative-o lá).';
  }
  if (lower.includes('authretryablefetcherror')) {
    return 'Erro de conexão no servidor de autenticação. Por favor, verifique se a Porta do SMTP nas configurações do Supabase está como 587 (STARTTLS) e se a senha do Resend está correta.';
  }
  if (lower.includes('invalid login credentials')) {
    return 'E-mail, nome de usuário ou senha incorretos.';
  }
  if (lower.includes('user already registered') || lower.includes('email already exists') || lower.includes('profiles_email_key')) {
    return 'Este e-mail já está cadastrado por outro usuário.';
  }
  if (lower.includes('profiles_username_key')) {
    return 'Nome de usuário já cadastrado. Tente outro.';
  }
  if (lower.includes('password should be at least') || lower.includes('signup requires a valid password')) {
    return 'A senha deve conter pelo menos 6 caracteres.';
  }
  if (lower.includes('invalid email') || lower.includes('signup requires a valid email')) {
    return 'Por favor, insira um e-mail válido.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Este e-mail ainda não foi verificado. Por favor, confirme-o na sua caixa de entrada.';
  }
  if (lower.includes('rate limit exceeded') || lower.includes('too many requests')) {
    return 'Muitas solicitações de cadastro em pouco tempo. Por favor, aguarde alguns minutos antes de tentar novamente.';
  }
  if (lower.includes('network request failed')) {
    return 'Falha na conexão de rede. Verifique se está conectado à internet.';
  }
  return msg;
}

export default function AuthScreen({ onLoggedIn }) {
  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [refCode, setRefCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [successData, setSuccessData] = useState(null);

  const [isUsernameManual, setIsUsernameManual] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    const savedEmail = localStorage.getItem('remembered_email') || '';
    const savedPassword = localStorage.getItem('remembered_password') || '';
    if (savedEmail) {
      setEmail(savedEmail);
      setPassword(savedPassword);
      setRememberMe(true);
    }
  }, []);

  useEffect(() => {
    function handleBeforeInstallPrompt(e) {
      e.preventDefault();
      setDeferredPrompt(e);
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  async function installPwa() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      setShowInstallModal(true);
    }
  }

  function generateBaseUsername(fullName) {
    const parts = fullName.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    const normalize = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]/g, "");
    if (parts.length === 1) {
      return normalize(parts[0]);
    }
    return normalize(parts[0]) + normalize(parts[1]);
  }

  function handleNameChange(val) {
    setName(val);
    if (!isUsernameManual) {
      setUsername(generateBaseUsername(val));
    }
  }

  function handleUsernameChange(val) {
    const cleaned = val.replace(/\s/g, '').toLowerCase();
    setUsername(cleaned);
    if (!cleaned) {
      setIsUsernameManual(false);
    } else {
      setIsUsernameManual(true);
    }
  }

  useEffect(() => {
    let path = window.location.pathname;
    if (path && path.length > 1) {
      if (path.endsWith('/')) {
        path = path.slice(0, -1);
      }
      let refVal = path.substring(1);
      if (refVal.startsWith('r/')) {
        refVal = refVal.substring(2);
      }
      if (refVal && refVal !== 'index.html' && refVal !== 'sw.js' && !refVal.includes('.')) {
        setRefCode(refVal);
        setMode('cadastro');
      }
    }
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    if (!email.trim() || !password) { alert('Preencha todos os campos.'); return; }
    setLoading(true);
    
    try {
      let loginEmail = email.trim();
      if (loginEmail && !loginEmail.includes('@')) {
        // É um nome de usuário! Busca o e-mail correspondente
        const { data: foundProfile, error: profileError } = await supabase
          .from('profiles')
          .select('email')
          .eq('username', loginEmail.toLowerCase())
          .maybeSingle();
        
        if (profileError) {
          setLoading(false);
          alert('Erro ao buscar usuário: ' + translateError(profileError));
          return;
        }

        if (foundProfile) {
          loginEmail = foundProfile.email;
        } else {
          setLoading(false);
          alert('Este nome de usuário não existe.');
          return;
        }
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
      setLoading(false);
      if (error) { 
        alert('Erro no login: ' + translateError(error)); 
        return; 
      }
      if (rememberMe) {
        localStorage.setItem('remembered_email', email.trim());
        localStorage.setItem('remembered_password', password);
      } else {
        localStorage.removeItem('remembered_email');
        localStorage.removeItem('remembered_password');
      }

      onLoggedIn(data.user);
    } catch (err) {
      setLoading(false);
      alert('Erro inesperado no login: ' + err.message);
    }
  }

  async function handleCadastro(e) {
    e.preventDefault();
    
    // Clean and sanitize spaces from inputs
    const cleanedUsername = username.trim().toLowerCase().replace(/\s/g, '');
    const cleanedRefCode = refCode.trim().replace(/\s/g, '');
    const cleanedPhone = phone.trim().replace(/\s/g, '');
    const cleanedEmail = email.trim().toLowerCase();

    if (!name.trim()) { alert('Preencha o seu nome completo.'); return; }
    if (!cleanedUsername) { alert('Escolha um nome de usuário para o seu perfil.'); return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(cleanedUsername)) { alert('Use apenas letras, números, sublinhas (_) ou traços (-) no nome de usuário.'); return; }

    if (!cleanedPhone) { alert('Preencha o campo de WhatsApp.'); return; }

    if (!cleanedEmail) { alert('Preencha o campo de e-mail.'); return; }
    if (email.includes(' ')) {
      alert('O e-mail não pode conter espaços.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanedEmail)) {
      alert('E-mail inválido. Verifique o formato digitado (ex: nome@email.com).');
      return;
    }

    // 0) Verifica se o número de WhatsApp já está cadastrado
    const { data: dupPhone } = await supabase
      .from('profiles')
      .select('id')
      .eq('whatsapp', cleanedPhone)
      .maybeSingle();

    if (dupPhone) {
      alert('Este número de WhatsApp já está sendo usado por outra conta.');
      return;
    }

    setLoading(true);

    // 1) Encontra uma versão sequencial do username livre no banco
    let finalUsername = cleanedUsername;
    let suffix = 1;
    let usernameTaken = true;

    while (usernameTaken) {
      const { data: dupUser } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', finalUsername)
        .maybeSingle();

      if (dupUser) {
        finalUsername = `${cleanedUsername}${suffix}`;
        suffix++;
      } else {
        usernameTaken = false;
      }
    }

    // O primeiro usuário cadastrado no sistema é o Administrador Raiz
    let isFirstUser = false;
    try {
      const { data: existingProfiles } = await supabase
        .from('profiles')
        .select('id')
        .limit(1);
      if (!existingProfiles || existingProfiles.length === 0) {
        isFirstUser = true;
      }
    } catch (err) {
      console.log('Erro ao verificar perfis existentes:', err);
    }

    let refUserId = null;
    let refUser = null;

    if (!isFirstUser) {
      let parsedRef = cleanedRefCode;
      if (!parsedRef) {
        try {
          const { data: adminProfile } = await supabase
            .from('profiles')
            .select('username')
            .eq('role', 'admin')
            .limit(1)
            .maybeSingle();
          parsedRef = adminProfile?.username || 'admin';
        } catch (e) {
          parsedRef = 'admin';
        }
      }

      if (/^\d+$/.test(parsedRef)) {
        refUserId = parseInt(parsedRef, 10);
      } else {
        const { data: found } = await supabase.from('profiles').select('id').eq('username', parsedRef.toLowerCase()).maybeSingle();
        if (found) {
          refUserId = found.id;
        } else {
          setLoading(false);
          alert('Não encontramos nenhuma indicação ativa com este nome de usuário.');
          return;
        }
      }

      const { data: fetchedRefUser, error: refErr } = await supabase
        .from('profiles').select('id, role, coord_id, phone').eq('id', refUserId).maybeSingle();

      if (refErr || !fetchedRefUser) {
        setLoading(false);
        alert('Indicação inválida: não encontramos nenhum cadastro ativo para este código.');
        return;
      }
      refUser = fetchedRefUser;
    }

    const { data: authData, error: authErr } = await supabase.auth.signUp({ email: cleanedEmail, password: '123456' });
    if (authErr) { setLoading(false); alert('Erro ao criar conta: ' + translateError(authErr)); return; }

    let slotId = null;
    let coordId = null;
    let userRole = 'user';

    if (isFirstUser) {
      userRole = 'admin';
    } else {
      const { data: foundSlot } = await supabase.rpc('find_slot', { ref_id: refUser.id });
      slotId = foundSlot;
      coordId = (refUser.role === 'coord' || refUser.role === 'admin') ? refUser.id : refUser.coord_id;
    }

    const { error: profErr } = await supabase.from('profiles').insert({
      auth_id: authData.user.id, 
      name, 
      email: cleanedEmail, 
      phone: cleanedPhone, 
      whatsapp: cleanedPhone,
      role: userRole, 
      coord_id: coordId, 
      parent_id: slotId, 
      referrer_id: isFirstUser ? null : refUser.id,
      username: finalUsername,
    });

    setLoading(false);
    if (profErr) { alert('Erro ao salvar cadastro: ' + translateError(profErr)); return; }

    // Fetch the admin's phone number dynamically from owner_profile with fallback to admin profile
    let adminPhone = '';
    try {
      const { data: ownerProfile } = await supabase
        .from('owner_profile')
        .select('whatsapp')
        .eq('id', 1)
        .maybeSingle();

      if (ownerProfile && ownerProfile.whatsapp) {
        adminPhone = ownerProfile.whatsapp;
      }
    } catch (e) {
      console.log('Error fetching owner_profile:', e);
    }

    if (!adminPhone) {
      try {
        const { data: adminProfile } = await supabase
          .from('profiles')
          .select('phone')
          .eq('role', 'admin')
          .limit(1)
          .maybeSingle();
        if (adminProfile && adminProfile.phone) {
          adminPhone = adminProfile.phone;
        }
      } catch (e) {
        console.log('Error fetching admin profile:', e);
      }
    }

    const messageText = `Olá! Acabei de fazer meu cadastro no Amigos Dr Candido. *Meu usuário:* ${finalUsername}`;

    let waPhone = (adminPhone || '').replace(/\D/g, '');
    if (waPhone.length === 10 || waPhone.length === 11) {
      waPhone = '55' + waPhone;
    }

    if (isFirstUser) {
      await supabase.from('owner_profile').update({ whatsapp: cleanedPhone }).eq('id', 1);
      alert('Parabéns! Você cadastrou a primeira conta e entrou como o Administrador Raiz!');
      onLoggedIn(authData.user);
    } else {
      if (waPhone) {
        setSuccessData({
          username: finalUsername,
          waPhone: waPhone,
          messageText: messageText,
          user: authData.user
        });
      } else {
        alert(`Cadastro feito com sucesso!\nSeu nome de usuário é: ${finalUsername}\nSua senha padrão é: 123456.`);
        onLoggedIn(authData.user);
      }
    }
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    if (!forgotEmail.trim()) { alert('Digite seu e-mail'); return; }
    setForgotLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
      redirectTo: window.location.origin,
    });
    setForgotLoading(false);
    if (error) { alert('Erro ao enviar: ' + translateError(error)); return; }
    alert('E-mail enviado! Verifique sua caixa de entrada (e o spam) e clique no link para criar uma nova senha.');
    setForgotOpen(false);
    setForgotEmail('');
  }

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const showButton = isIOS || !!deferredPrompt;

  return (
    <div className="screen" style={{ paddingTop: 0 }}>
      <div style={{ textAlign: 'center', marginTop: -45, marginBottom: -55 }}>
        <img src="/logo.png" alt="Amigos Dr Candido" style={{ width: 350, height: 350, objectFit: 'contain', margin: '0 auto', display: 'block' }} />
      </div>

      <div className="tabs">
        <div className={`tab${mode === 'login' ? ' on' : ''}`} onClick={() => setMode('login')}>Entrar</div>
        <div className={`tab${mode === 'cadastro' ? ' on' : ''}`} onClick={() => setMode('cadastro')}>Cadastrar</div>
      </div>

      <form onSubmit={mode === 'login' ? handleLogin : handleCadastro}>
        {mode === 'cadastro' && (
          <>
            <label className="lbl">Indicação</label>
            <input placeholder="Ex: roberto" value={refCode} disabled />
            <label className="lbl">Nome completo</label>
            <input placeholder="Seu nome" value={name} onChange={(e) => handleNameChange(e.target.value)} />

            <label className="lbl">WhatsApp</label>
            <input placeholder="(61) 9 9999-9999" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </>
        )}
        <label className="lbl">{mode === 'login' ? 'E-mail ou Nome de usuário' : 'E-mail'}</label>
        <input type="text" placeholder={mode === 'login' ? 'voce@email.com ou seu_usuario' : 'voce@email.com'} value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="none" />
        {mode === 'login' && (
          <>
            <label className="lbl">Senha</label>
            <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
          </>
        )}

        {mode === 'login' && (
          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            marginTop: '12px', 
            marginBottom: '16px',
            textAlign: 'left',
            cursor: 'pointer',
            userSelect: 'none',
            width: 'fit-content'
          }}>
            <input 
              type="checkbox" 
              checked={rememberMe} 
              onChange={(e) => setRememberMe(e.target.checked)} 
              style={{ 
                width: '16px', 
                height: '16px', 
                accentColor: 'var(--teal)',
                cursor: 'pointer',
                margin: 0
              }} 
            />
            <span style={{ fontSize: '13px', color: 'var(--ink2)', fontWeight: 500 }}>
              Manter conectado (Salvar dados)
            </span>
          </label>
        )}

        <button className="btn btn-teal" type="submit" disabled={loading}>
          {loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar minha conta'}
        </button>
      </form>

      {mode === 'login' && !forgotOpen && (
        <div style={{ textAlign: 'center', marginTop: 4 }}>
          <span className="muted" style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={() => setForgotOpen(true)}>
            Esqueceu a senha?
          </span>
        </div>
      )}

      {mode === 'login' && !forgotOpen && showButton && (
        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button 
            type="button" 
            className="btn btn-ghost btn-sm" 
            style={{ 
              margin: '0 auto', 
              fontSize: '12.5px', 
              padding: '8px 14px', 
              width: 'auto', 
              background: 'rgba(123, 108, 244, 0.06)', 
              borderColor: 'rgba(123, 108, 244, 0.25)', 
              color: 'var(--violet)',
              gap: '9px',
              borderRadius: '8px'
            }}
            onClick={installPwa}
          >
            <img src="/icons/icon-192.png" alt="" style={{ width: '18px', height: '18px', borderRadius: '4px' }} />
            Salvar na Tela do Celular (Web App)
          </button>
        </div>
      )}

      {mode === 'login' && forgotOpen && (
        <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
          <form onSubmit={handleForgotPassword}>
            <label className="lbl">Digite seu e-mail para receber uma nova senha</label>
            <input type="email" placeholder="voce@email.com" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} autoCapitalize="none" />
            <button className="btn btn-violet" type="submit" disabled={forgotLoading}>
              {forgotLoading ? 'Enviando...' : 'Enviar link de recuperação'}
            </button>
          </form>
          <div style={{ textAlign: 'center' }}>
            <span className="muted" style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={() => setForgotOpen(false)}>Cancelar</span>
          </div>
        </div>
      )}

      {/* MODAL DE SUCESSO DE CADASTRO - REDIRECIONAMENTO DIRETO */}
      {successData && (
        <div className="modal-bg" style={{ zIndex: 4000 }}>
          <div className="modal" style={{ maxWidth: 400, padding: 24, textAlign: 'center', backgroundColor: '#090d16', borderColor: 'var(--line)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
            <h2 style={{ fontSize: 18, color: '#fff', marginBottom: 10 }}>Cadastro Realizado!</h2>
            
            <p style={{ color: 'var(--ink2)', fontSize: 13, marginBottom: 18, lineHeight: 1.5 }}>
              Seu cadastro foi concluído com sucesso. Anote seus dados de acesso:
            </p>

            <div style={{ background: 'var(--panel2)', borderRadius: 12, padding: 14, marginBottom: 20, textAlign: 'left' }}>
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Usuário:</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--teal)', marginBottom: 8 }}>{successData.username}</div>
              
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Senha Padrão:</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>123456</div>
            </div>

            <a 
              href={
                /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
                  ? `whatsapp://send?phone=${successData.waPhone}&text=${encodeURIComponent(successData.messageText)}`
                  : `https://web.whatsapp.com/send?phone=${successData.waPhone}&text=${encodeURIComponent(successData.messageText)}`
              }
              className="btn"
              style={{ 
                backgroundColor: '#25D366', 
                color: '#fff', 
                fontWeight: 700, 
                textDecoration: 'none', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: 8,
                padding: '12px',
                borderRadius: 10,
                marginBottom: 10
              }}
              onClick={() => {
                setTimeout(() => {
                  onLoggedIn(successData.user);
                  setSuccessData(null);
                }, 1000);
              }}
            >
              <svg viewBox="0 0 448 512" width="18" height="18" fill="#fff" style={{ flexShrink: 0 }}>
                <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-117zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
              </svg>
              <span>Fale com Dr. Candido no WhatsApp</span>
            </a>

            <button 
              type="button" 
              className="btn btn-ghost" 
              style={{ margin: 0, color: 'var(--ink3)' }}
              onClick={() => {
                onLoggedIn(successData.user);
                setSuccessData(null);
              }}
            >
              Acessar Aplicativo Direto
            </button>
          </div>
        </div>
      )}
      {showInstallModal && (
        <div className="modal-bg" style={{ zIndex: 10000 }}>
          <div className="modal" style={{ maxWidth: 380, textAlign: 'center', padding: '24px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📱</div>
            <h3 style={{ fontSize: '16.5px', color: 'var(--teal)', marginBottom: '16px', fontWeight: '700' }}>
              Salvar na Tela do Celular
            </h3>

            {isIOS ? (
              <div style={{ textAlign: 'left', color: 'var(--ink2)', fontSize: '13px', lineHeight: '1.6' }}>
                <p style={{ marginBottom: '12px' }}>Siga os passos abaixo no **Safari**:</p>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'center' }}>
                  <div style={{ background: 'var(--panel2)', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', color: 'var(--teal)', flexShrink: 0 }}>1</div>
                  <div style={{ flex: 1 }}>Toque no botão de **Compartilhar** <span style={{ fontSize: '16px' }}>📤</span> (na barra de menu do Safari).</div>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <div style={{ background: 'var(--panel2)', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', color: 'var(--teal)', flexShrink: 0 }}>2</div>
                  <div style={{ flex: 1 }}>Role para baixo e toque em **"Adicionar à Tela de Início"** <span style={{ fontSize: '16px' }}>➕</span>.</div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'left', color: 'var(--ink2)', fontSize: '13px', lineHeight: '1.6' }}>
                <p style={{ marginBottom: '12px' }}>Siga os passos abaixo no seu navegador:</p>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'center' }}>
                  <div style={{ background: 'var(--panel2)', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', color: 'var(--teal)', flexShrink: 0 }}>1</div>
                  <div style={{ flex: 1 }}>Toque no **menu de 3 pontinhos** <span style={{ fontSize: '16px' }}>⋮</span> (no canto superior direito do seu navegador).</div>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <div style={{ background: 'var(--panel2)', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', color: 'var(--teal)', flexShrink: 0 }}>2</div>
                  <div style={{ flex: 1 }}>Selecione a opção **"Instalar aplicativo"** ou **"Adicionar à tela inicial"**.</div>
                </div>
              </div>
            )}

            <button 
              type="button"
              className="btn btn-teal" 
              style={{ width: '100%', marginTop: '24px', marginBottom: '0' }} 
              onClick={() => setShowInstallModal(false)}
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
