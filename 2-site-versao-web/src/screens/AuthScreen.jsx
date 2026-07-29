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
  if (lower.includes('invalid login credentials')) {
    return 'E-mail, nome de usuário ou senha incorretos.';
  }
  if (lower.includes('user already registered') || lower.includes('email already exists') || lower.includes('profiles_email_key')) {
    return 'Este e-mail já está cadastrado por outro usuário.';
  }
  if (lower.includes('profiles_username_key')) {
    return 'Nome de usuário já cadastrado. Tente outro.';
  }
  if (lower.includes('password should be at least')) {
    return 'A senha deve conter pelo menos 6 caracteres.';
  }
  if (lower.includes('invalid email')) {
    return 'Por favor, insira um e-mail válido.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Este e-mail ainda não foi verificado. Por favor, confirme-o na sua caixa de entrada.';
  }
  if (lower.includes('rate limit exceeded') || lower.includes('too many requests')) {
    return 'Muitas solicitações de cadastro em pouco tempo. Por favor, aguarde alguns minutos antes de tentar novamente.';
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

  useEffect(() => {
    const path = window.location.pathname;
    if (path && path.length > 1) {
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
    
    let loginEmail = email.trim();
    if (loginEmail && !loginEmail.includes('@')) {
      // É um nome de usuário! Busca o e-mail correspondente
      const { data: foundProfile } = await supabase
        .from('profiles')
        .select('email')
        .eq('username', loginEmail.toLowerCase())
        .maybeSingle();
      if (foundProfile) {
        loginEmail = foundProfile.email;
      } else {
        setLoading(false);
        alert('Cadastro não encontrado para este nome de usuário.');
        return;
      }
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
    setLoading(false);
    if (error) { alert('Erro no login: ' + translateError(error)); return; }
    onLoggedIn(data.user);
  }

  async function handleCadastro(e) {
    e.preventDefault();
    if (!username.trim()) { alert('Escolha um nome de usuário para o seu perfil.'); return; }
    if (username.includes(' ')) { alert('O nome de usuário não pode conter espaços.'); return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) { alert('Use apenas letras, números, sublinhas (_) ou traços (-) no nome de usuário.'); return; }

    setLoading(true);

    // Verifica se é o primeiríssimo usuário
    const { data: allProfiles } = await supabase.from('profiles').select('id').limit(1);
    const isFirstUser = !allProfiles || allProfiles.length === 0;

    let refUserId = null;
    let refUser = null;

    if (!isFirstUser) {
      let parsedRef = refCode.trim();
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

      // Verifica se o seu próprio username já existe
      const { data: dupUser } = await supabase.from('profiles').select('id').eq('username', username.trim().toLowerCase()).maybeSingle();
      if (dupUser) {
        setLoading(false);
        alert('Este nome de usuário já está em uso. Escolha outro.');
        return;
      }

      const { data: fetchedRefUser, error: refErr } = await supabase
        .from('profiles').select('id, role, coord_id').eq('id', refUserId).maybeSingle();

      if (refErr || !fetchedRefUser) {
        setLoading(false);
        alert('Indicação inválida: não encontramos nenhum cadastro ativo para este código.');
        return;
      }
      refUser = fetchedRefUser;
    }

    const { data: authData, error: authErr } = await supabase.auth.signUp({ email, password });
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
      email, 
      phone, 
      role: userRole, 
      coord_id: coordId, 
      parent_id: slotId, 
      username: username.trim().toLowerCase(),
    });

    setLoading(false);
    if (profErr) { alert('Erro ao salvar cadastro: ' + translateError(profErr)); return; }

    if (isFirstUser) {
      alert('Parabéns! Você cadastrou a primeira conta e entrou como o Administrador Raiz!');
    } else {
      alert(slotId !== refUser.id
        ? `Cadastro feito! Você entrou na rede via indicação (vaga automática #${slotId}).`
        : 'Cadastro feito com sucesso!');
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
    <div className="screen" style={{ paddingTop: 50 }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <img src="/logo.png" alt="Amigos da Rozy Costa" style={{ width: 170, height: 170, objectFit: 'contain', margin: '0 auto', display: 'block' }} />
      </div>

      <div className="tabs">
        <div className={`tab${mode === 'login' ? ' on' : ''}`} onClick={() => setMode('login')}>Entrar</div>
        <div className={`tab${mode === 'cadastro' ? ' on' : ''}`} onClick={() => setMode('cadastro')}>Cadastrar</div>
      </div>

      <form onSubmit={mode === 'login' ? handleLogin : handleCadastro}>
        {mode === 'cadastro' && (
          <>
            <label className="lbl">Indicação ( Nome de Usuário ) - Opcional</label>
            <input placeholder="Ex: roberto" value={refCode} onChange={(e) => setRefCode(e.target.value)} />
            <label className="lbl">Nome completo</label>
            <input placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)} />
            <label className="lbl">Nome de usuário (sem espaços, para seu link e login)</label>
            <input placeholder="Ex: joaosilva" value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, '').toLowerCase())} autoCapitalize="none" />
            <label className="lbl">Telefone</label>
            <input placeholder="(61) 9 9999-9999" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </>
        )}
        <label className="lbl">{mode === 'login' ? 'E-mail ou Nome de usuário' : 'E-mail'}</label>
        <input type="text" placeholder={mode === 'login' ? 'voce@email.com ou seu_usuario' : 'voce@email.com'} value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="none" />
        <label className="lbl">Senha</label>
        <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />

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
