import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import TopBar from '../components/TopBar';
import { fetchAppSettings, fetchTotalUsersCount } from '../lib/api';

export default function MassSignupScreen({ profile }) {
  const [totalUsers, setTotalUsers] = useState(0);
  const [loading, setLoading] = useState(false);
  const [successData, setSuccessData] = useState(null);

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // Indicator search states
  const [refSearch, setRefSearch] = useState('');
  const [selectedRef, setSelectedRef] = useState(null);
  const [foundIndicators, setFoundIndicators] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    (async () => {
      const count = await fetchTotalUsersCount();
      setTotalUsers(count);
    })();
  }, []);

  // Search indicators
  useEffect(() => {
    if (selectedRef) {
      setFoundIndicators([]);
      setShowDropdown(false);
      return;
    }
    if (refSearch.trim().length < 3) {
      setFoundIndicators([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const query = refSearch.trim();
        const { data, error } = await supabase
          .from('profiles')
          .select('id, name, username, role, coord_id')
          .or(`username.ilike.%${query}%,name.ilike.%${query}%`)
          .limit(6);

        if (!error && data) {
          setFoundIndicators(data);
          setShowDropdown(true);
        }
      } catch (err) {
        console.error('Error searching indicators:', err);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [refSearch, selectedRef]);

  function handlePhoneChange(val) {
    // Basic phone masking
    let cleaned = val.replace(/\D/g, '');
    if (cleaned.length > 11) cleaned = cleaned.slice(0, 11);
    
    if (cleaned.length > 10) {
      setPhone(`(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`);
    } else if (cleaned.length > 6) {
      setPhone(`(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`);
    } else if (cleaned.length > 2) {
      setPhone(`(${cleaned.slice(0, 2)}) ${cleaned.slice(2)}`);
    } else {
      setPhone(cleaned);
    }
  }

  function generateBaseUsername(fullName) {
    const parts = fullName.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const normalize = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    if (parts.length === 0) return '';
    if (parts.length === 1) return normalize(parts[0]);
    return normalize(parts[0]) + normalize(parts[1]);
  }

  async function handleCadastro(e) {
    e.preventDefault();

    if (!selectedRef) {
      alert('Por favor, busque e selecione um indicador.');
      return;
    }
    if (!name.trim()) {
      alert('Preencha o nome completo.');
      return;
    }
    const cleanedPhone = phone.trim().replace(/\D/g, '');
    if (!cleanedPhone) {
      alert('Preencha o WhatsApp.');
      return;
    }
    // Email is auto-generated below after username generation

    setLoading(true);

    try {
      // 1) Verify WhatsApp uniqueness
      const { data: dupPhone } = await supabase
        .from('profiles')
        .select('id')
        .eq('whatsapp', cleanedPhone)
        .maybeSingle();

      if (dupPhone) {
        alert('Este número de WhatsApp já está sendo usado por outra conta.');
        setLoading(false);
        return;
      }

      // 2) Generate username
      const baseUsername = generateBaseUsername(name);
      let finalUsername = baseUsername;
      let suffix = 1;
      let usernameTaken = true;

      while (usernameTaken) {
        const { data: dupUser } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', finalUsername)
          .maybeSingle();

        if (dupUser) {
          finalUsername = `${baseUsername}${suffix}`;
          suffix++;
        } else {
          usernameTaken = false;
        }
      }

      // Generate email automatically from finalUsername
      const cleanedEmail = `${finalUsername}@amigosdrcandido.com.br`;

      // 3) Supabase Signup using a temporary client with session persistence disabled
      const tempSupabase = createClient(supabase.supabaseUrl, supabase.supabaseKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      });

      const { data: authData, error: authErr } = await tempSupabase.auth.signUp({
        email: cleanedEmail,
        password: '123456',
        options: {
          data: {
            via_mass_signup: true
          }
        }
      });

      if (authErr) {
        alert('Erro ao criar conta de autenticação: ' + authErr.message);
        setLoading(false);
        return;
      }

      // 4) Find slot in tree
      const { data: foundSlot, error: slotErr } = await supabase.rpc('find_slot', { ref_id: selectedRef.id });
      if (slotErr) {
        alert('Erro ao encontrar posição na árvore: ' + slotErr.message);
        setLoading(false);
        return;
      }

      const coordId = (selectedRef.role === 'coord' || selectedRef.role === 'admin') ? selectedRef.id : selectedRef.coord_id;

      // 5) Insert Profile
      const { error: profErr } = await supabase.from('profiles').insert({
        auth_id: authData.user.id,
        name: name.trim(),
        email: cleanedEmail,
        phone: cleanedPhone,
        whatsapp: cleanedPhone,
        role: 'user',
        coord_id: coordId,
        parent_id: foundSlot,
        referrer_id: selectedRef.id,
        username: finalUsername
      });

      if (profErr) {
        alert('Erro ao salvar perfil no banco: ' + profErr.message);
        setLoading(false);
        return;
      }

      // Success callback
      setSuccessData({
        name: name.trim(),
        username: finalUsername,
        password: '123456',
        phone: cleanedPhone
      });

      // Clear fields for next signup, keep the indicator selected
      setName('');
      setPhone('');
      setEmail('');
      
      // Update total counter
      const newCount = await fetchTotalUsersCount();
      setTotalUsers(newCount);

    } catch (err) {
      alert('Erro inesperado: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  // Get WhatsApp redirect URL for newly registered member
  let memberWaUrl = '';
  if (successData) {
    const messageText = `Olá, ${successData.name}! Aqui estão seus dados de acesso ao Amigos Dr. Cândido:\n\n*Usuário:* @${successData.username}\n*Senha padrão:* ${successData.password}\n\nLink de acesso: ${window.location.origin}`;
    let waPhone = (successData.phone || '').replace(/\D/g, '');
    if (waPhone.length === 10 || waPhone.length === 11) {
      waPhone = '55' + waPhone;
    }
    memberWaUrl = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      ? `whatsapp://send?phone=${waPhone}&text=${encodeURIComponent(messageText)}`
      : `https://web.whatsapp.com/send?phone=${waPhone}&text=${encodeURIComponent(messageText)}`;
  }

  return (
    <div className="screen">
      <TopBar totalUsers={totalUsers} />

      <div className="card" style={{ background: 'linear-gradient(135deg, rgba(22, 28, 44, 0.95), rgba(13, 17, 28, 0.98))', border: '1.5px solid rgba(123, 108, 244, 0.18)', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)', borderRadius: 16 }}>
        <div className="card-title" style={{ color: 'var(--violet)' }}>⚡ Cadastro em Massa de Membros</div>
        
        <form onSubmit={handleCadastro}>
          {/* Indicator search */}
          <label className="lbl">Buscar Indicador <span className="req">*</span></label>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <input 
              placeholder="Digite ao menos 3 letras do nome ou username..." 
              value={refSearch}
              onChange={(e) => {
                setRefSearch(e.target.value);
                if (selectedRef) setSelectedRef(null);
              }}
              required={!selectedRef}
            />
            {selectedRef && (
              <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'var(--teal-dim)', color: 'var(--teal)', fontSize: 11, fontWeight: '700', padding: '3px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                ✓ {selectedRef.name} (@{selectedRef.username})
                <span style={{ color: 'var(--warn)', cursor: 'pointer', marginLeft: 4 }} onClick={() => { setSelectedRef(null); setRefSearch(''); }}>✕</span>
              </div>
            )}

            {showDropdown && foundIndicators.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, zIndex: 1000, maxHeight: 180, overflowY: 'auto', marginTop: 4, boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                {foundIndicators.map(ind => (
                  <div
                    key={ind.id}
                    onClick={() => {
                      setSelectedRef(ind);
                      setRefSearch(`@${ind.username} - ${ind.name}`);
                      setShowDropdown(false);
                    }}
                    style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--line)', color: 'var(--ink1)', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--panel2)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <span><strong>@{ind.username}</strong> - {ind.name}</span>
                    <span className="id-badge">#{ind.id}</span>
                  </div>
                ))}
              </div>
            )}
            {showDropdown && foundIndicators.length === 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, zIndex: 1000, padding: '10px 12px', color: 'var(--ink3)', fontSize: 12.5 }}>
                Nenhum indicador encontrado.
              </div>
            )}
          </div>

          <label className="lbl">Nome Completo do Novo Membro <span className="req">*</span></label>
          <input 
            placeholder="Nome Completo" 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            required 
          />

          <label className="lbl">WhatsApp <span className="req">*</span></label>
          <input 
            placeholder="(61) 99999-9999" 
            value={phone} 
            onChange={(e) => handlePhoneChange(e.target.value)} 
            required 
          />

          {/* Email input removed - auto-generated from username */}

          <button className="btn btn-teal" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? 'Cadastrando...' : 'Cadastrar Membro'}
          </button>
        </form>
      </div>

      {/* Success Notification Modal */}
      {successData && (
        <div className="modal-bg" style={{ zIndex: 10000 }}>
          <div className="modal" style={{ textAlign: 'center', maxWidth: 380 }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🎉</div>
            <h2 style={{ fontSize: 17, color: 'var(--teal)', marginBottom: 10 }}>Cadastro Realizado com Sucesso!</h2>
            
            <div style={{ textAlign: 'left', background: 'var(--panel2)', borderRadius: 12, padding: 14, marginBottom: 16, border: '1px solid var(--line)' }}>
              <div style={{ fontSize: 12, color: 'var(--ink2)', marginBottom: 4 }}>Nome: <strong style={{ color: 'var(--ink1)' }}>{successData.name}</strong></div>
              <div style={{ fontSize: 12, color: 'var(--ink2)', marginBottom: 4 }}>Usuário: <strong style={{ color: 'var(--teal)' }}>@{successData.username}</strong></div>
              <div style={{ fontSize: 12, color: 'var(--ink2)' }}>Senha padrão: <strong style={{ color: 'var(--ink1)' }}>{successData.password}</strong></div>
            </div>

            <p style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.5, marginBottom: 16 }}>
              O membro foi cadastrado com a senha padrão <strong>123456</strong> e está posicionado na rede.
            </p>

            <a 
              href={memberWaUrl}
              target="_blank"
              rel="noopener noreferrer"
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
            >
              <svg viewBox="0 0 448 512" width="18" height="18" fill="#fff" style={{ flexShrink: 0 }}>
                <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-117zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
              </svg>
              <span>Enviar Dados por WhatsApp</span>
            </a>

            <button className="btn btn-ghost" style={{ width: '100%', marginBottom: 0 }} onClick={() => setSuccessData(null)}>
              Fechar e Próximo Cadastro
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
