import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function AuthScreen({ onLoggedIn }) {
  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [refCode, setRefCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { alert('Erro no login: ' + error.message); return; }
    onLoggedIn(data.user);
  }

  async function handleCadastro(e) {
    e.preventDefault();
    if (!refCode.trim()) { alert('Digite o código de indicação de quem te chamou.'); return; }
    setLoading(true);

    const { data: refUser, error: refErr } = await supabase
      .from('profiles').select('id, role, coord_id').eq('id', parseInt(refCode, 10)).maybeSingle();

    if (refErr || !refUser) {
      setLoading(false);
      alert('Código inválido: não encontramos nenhum cadastro com esse código de indicação.');
      return;
    }

    const { data: authData, error: authErr } = await supabase.auth.signUp({ email, password });
    if (authErr) { setLoading(false); alert('Erro ao criar conta: ' + authErr.message); return; }

    const { data: slotId } = await supabase.rpc('find_slot', { ref_id: refUser.id });
    const coordId = (refUser.role === 'coord' || refUser.role === 'admin') ? refUser.id : refUser.coord_id;

    const { error: profErr } = await supabase.from('profiles').insert({
      auth_id: authData.user.id, name, email, phone, role: 'user', coord_id: coordId, parent_id: slotId,
    });

    setLoading(false);
    if (profErr) { alert('Erro ao salvar cadastro: ' + profErr.message); return; }

    alert(slotId !== refUser.id
      ? `Cadastro feito! Você entrou na rede via indicação (vaga automática #${slotId}).`
      : 'Cadastro feito com sucesso!');
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
    if (error) { alert('Erro ao enviar: ' + error.message); return; }
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
            <label className="lbl"><span className="req">★</span> Código de indicação (obrigatório)</label>
            <input placeholder="Ex: 2" inputMode="numeric" value={refCode} onChange={(e) => setRefCode(e.target.value)} />
            <label className="lbl">Nome completo</label>
            <input placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)} />
            <label className="lbl">Telefone</label>
            <input placeholder="(61) 9 9999-9999" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </>
        )}
        <label className="lbl">E-mail</label>
        <input type="email" placeholder="voce@email.com" value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="none" />
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
