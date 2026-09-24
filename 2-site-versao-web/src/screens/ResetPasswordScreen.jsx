import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function ResetPasswordScreen({ onDone }) {
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
        <div style={{ position: 'relative', width: '100%', marginBottom: '12px' }}>
          <input 
            type={showPassword ? 'text' : 'password'} 
            placeholder="Mínimo 6 caracteres" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            style={{ marginBottom: 0, paddingRight: '42px' }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              padding: '4px',
              cursor: 'pointer',
              color: showPassword ? 'var(--teal)' : 'var(--ink2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none'
            }}
            title={showPassword ? "Ocultar senha" : "Mostrar senha"}
          >
            {showPassword ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
          </button>
        </div>
        <label className="lbl">Confirmar nova senha</label>
        <div style={{ position: 'relative', width: '100%', marginBottom: '12px' }}>
          <input 
            type={showPassword ? 'text' : 'password'} 
            placeholder="Repita a senha" 
            value={password2} 
            onChange={(e) => setPassword2(e.target.value)} 
            style={{ marginBottom: 0, paddingRight: '42px' }}
          />
        </div>
        <button className="btn btn-teal" type="submit" disabled={loading}>
          {loading ? 'Salvando...' : 'Salvar nova senha'}
        </button>
      </form>
    </div>
  );
}
