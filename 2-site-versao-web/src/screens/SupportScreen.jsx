import { useState } from 'react';

export default function SupportScreen() {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!message.trim()) {
      alert('Por favor, digite a sua mensagem.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('https://formsubmit.co/ajax/oozeias2024@gmail.com', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          Nome: name || 'Não informado',
          Contato: contact || 'Não informado',
          Mensagem: message
        })
      });
      const data = await response.json();
      if (data.success) {
        setSent(true);
      } else {
        alert('Ocorreu um erro ao enviar. Tente novamente.');
      }
    } catch (err) {
      alert('Erro de conexão ao enviar mensagem: ' + err.message);
    }
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="app-shell" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div className="card" style={{ maxWidth: 400, width: '100%', textAlign: 'center', padding: '30px 20px', borderRadius: 16, background: 'linear-gradient(135deg, rgba(22, 28, 44, 0.95), rgba(13, 17, 28, 0.98))', border: '1.5px solid rgba(138, 43, 226, 0.12)', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)' }}>
          <div style={{ fontSize: 50, marginBottom: 15 }}>✉️</div>
          <h2 style={{ fontSize: 20, color: 'var(--teal)', fontWeight: 700, marginBottom: 10 }}>Mensagem Enviada!</h2>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 20 }}>
            Sua mensagem foi enviada ao administrador. Se você informou o seu contato, responderemos em breve.
          </p>
          <button className="btn btn-teal" onClick={() => { setSent(false); setName(''); setContact(''); setMessage(''); }} style={{ width: '100%' }}>
            Enviar outra mensagem
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="card" style={{ maxWidth: 450, width: '100%', padding: '24px 20px', borderRadius: 16, background: 'linear-gradient(135deg, rgba(22, 28, 44, 0.95), rgba(13, 17, 28, 0.98))', border: '1.5px solid rgba(138, 43, 226, 0.12)', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>💬</div>
          <h2 style={{ fontSize: 19, fontWeight: 700 }}>Suporte ao Usuário</h2>
          <p className="muted" style={{ fontSize: 12, marginTop: 5 }}>Envie uma mensagem diretamente para o administrador do sistema.</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="lbl">Seu Nome (opcional)</label>
            <input 
              type="text" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              placeholder="Digite seu nome" 
            />
          </div>

          <div>
            <label className="lbl">Seu E-mail ou Telefone (opcional)</label>
            <input 
              type="text" 
              value={contact} 
              onChange={(e) => setContact(e.target.value)} 
              placeholder="Ex: seuemail@gmail.com ou (11) 99999-9999" 
            />
          </div>

          <div>
            <label className="lbl">Sua Mensagem *</label>
            <textarea 
              value={message} 
              onChange={(e) => setMessage(e.target.value)} 
              placeholder="Como podemos te ajudar?" 
              required
              style={{ 
                width: '100%', 
                height: 120, 
                padding: 10, 
                borderRadius: 8, 
                background: 'rgba(255,255,255,0.03)', 
                border: '1px solid var(--line)', 
                color: '#fff', 
                fontSize: 13,
                resize: 'none',
                fontFamily: 'inherit'
              }}
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-violet" 
            disabled={loading} 
            style={{ width: '100%', marginTop: 8 }}
          >
            {loading ? 'Enviando...' : 'Enviar Mensagem'}
          </button>
        </form>
      </div>
    </div>
  );
}
