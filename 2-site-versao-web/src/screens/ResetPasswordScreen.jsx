import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function ResetPasswordScreen({ onDone }) {
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < 6) { alert('Use ao menos 6 caracteres.'); return; }
    if (password !== password2) { alert('As senhas não coincidem.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { alert('Erro: ' + error.message); return; }
    alert('Senha alterada com sucesso! Você já pode usar sua nova senha.');
    onDone();
  }

  return (
    <div className="screen" style={{ paddingTop: 60 }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22 }}>🔑 Criar nova senha</h1>
        <div className="muted" style={{ marginTop: 6 }}>Você veio pelo link enviado por e-mail. Defina sua nova senha abaixo.</div>
      </div>
      <form onSubmit={handleSubmit}>
        <label className="lbl">Nova senha</label>
        <input type="password" placeholder="Mínimo 6 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} />
        <label className="lbl">Confirmar nova senha</label>
        <input type="password" placeholder="Repita a senha" value={password2} onChange={(e) => setPassword2(e.target.value)} />
        <button className="btn btn-teal" type="submit" disabled={loading}>
          {loading ? 'Salvando...' : 'Salvar nova senha'}
        </button>
      </form>
    </div>
  );
}
