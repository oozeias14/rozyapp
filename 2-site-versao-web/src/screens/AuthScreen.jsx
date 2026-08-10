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

  const [isUsernameManual, setIsUsernameManual] = useState(false);

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

    const isFirstUser = finalUsername === 'rozycosta';

    let refUserId = null;
    let refUser = null;

    if (!isFirstUser) {
      let parsedRef = cleanedRefCode;
      if (!parsedRef) {
        parsedRef = 'rozycosta';
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
          .eq('username', 'rozycosta')
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
    } else {
      if (waPhone) {
        alert(`Cadastro feito com sucesso!\nSeu nome de usuário é: ${finalUsername}\nSua senha padrão é: 123456.\n\nClique em OK para mandar uma mensagem no WhatsApp do Administrador.`);
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isMobile) {
          window.location.href = `whatsapp://send?phone=${waPhone}&text=${encodeURIComponent(messageText)}`;
        } else {
          window.location.href = `https://web.whatsapp.com/send?phone=${waPhone}&text=${encodeURIComponent(messageText)}`;
        }
      } else {
        alert(`Cadastro feito com sucesso!\nSeu nome de usuário é: ${finalUsername}\nSua senha padrão é: 123456.`);
      }
    }
    onLoggedIn(authData.user);
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
    </div>
  );
}
