import { useState, useEffect, useRef } from 'react';
import { supabase, CITIES } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import TopBar from '../components/TopBar';
import { fetchAppSettings, fetchTotalUsersCount } from '../lib/api';
import { 
  getGeminiApiKey, 
  setGeminiApiKey, 
  prepareImageForOCR, 
  extractContactsFromAttendanceSheet 
} from '../lib/gemini';

export default function MassSignupScreen({ profile }) {
  const isAdmin = profile?.role === 'admin' || profile?.role === 'admin2';
  const fileInputRef = useRef(null);

  const [totalUsers, setTotalUsers] = useState(0);
  const [loading, setLoading] = useState(false);
  const [successData, setSuccessData] = useState(null);

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [citySearch, setCitySearch] = useState('');
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);

  // Indicator search states (Formulário manual)
  const [refSearch, setRefSearch] = useState('');
  const [selectedRef, setSelectedRef] = useState(null);
  const [foundIndicators, setFoundIndicators] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);

  // --- Estados da Leitura de Folha com IA (OCR) ---
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState('');
  const [scannedContacts, setScannedContacts] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [pendingScanFile, setPendingScanFile] = useState(null);
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(getGeminiApiKey());

  // Estados do Modal de Conferência da IA
  const [batchIndicatorSearch, setBatchIndicatorSearch] = useState('');
  const [batchSelectedIndicator, setBatchSelectedIndicator] = useState(null);
  const [batchFoundIndicators, setBatchFoundIndicators] = useState([]);
  const [batchShowDropdown, setBatchShowDropdown] = useState(false);
  const [batchDefaultCity, setBatchDefaultCity] = useState('Brasília');
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, currentName: '' });
  const [batchResult, setBatchResult] = useState(null);

  useEffect(() => {
    (async () => {
      const count = await fetchTotalUsersCount();
      setTotalUsers(count);
    })();
  }, []);

  // Busca de indicador no formulário principal
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

  // Busca de indicador no modal de lote da IA
  useEffect(() => {
    if (batchSelectedIndicator) {
      setBatchFoundIndicators([]);
      setBatchShowDropdown(false);
      return;
    }
    if (batchIndicatorSearch.trim().length < 3) {
      setBatchFoundIndicators([]);
      setBatchShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const query = batchIndicatorSearch.trim();
        const { data, error } = await supabase
          .from('profiles')
          .select('id, name, username, role, coord_id')
          .or(`username.ilike.%${query}%,name.ilike.%${query}%`)
          .limit(6);

        if (!error && data) {
          setBatchFoundIndicators(data);
          setBatchShowDropdown(true);
        }
      } catch (err) {
        console.error('Error searching batch indicators:', err);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [batchIndicatorSearch, batchSelectedIndicator]);

  function formatPhoneDisplay(val) {
    let cleaned = (val || '').replace(/\D/g, '');
    if (cleaned.length > 11) cleaned = cleaned.slice(0, 11);
    if (cleaned.length > 10) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
    } else if (cleaned.length > 6) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
    } else if (cleaned.length > 2) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2)}`;
    }
    return cleaned;
  }

  function handlePhoneChange(val) {
    setPhone(formatPhoneDisplay(val));
  }

  function generateBaseUsername(fullName) {
    const parts = fullName.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const normalize = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    if (parts.length === 0) return '';
    if (parts.length === 1) return normalize(parts[0]);
    return normalize(parts[0]) + normalize(parts[1]);
  }

  // --- Disparo do OCR / Leitura com IA ---
  async function processAttendanceSheet(file) {
    const key = getGeminiApiKey();
    if (!key) {
      setPendingScanFile(file);
      setApiKeyModalOpen(true);
      return;
    }

    setScanning(true);
    setScanProgress('📸 Otimizando imagem para leitura de alta precisão...');
    try {
      const optimizedBlob = await prepareImageForOCR(file);
      const previewUrl = URL.createObjectURL(optimizedBlob);
      setPreviewImage(previewUrl);

      setScanProgress('🤖 O Gemini 1.5 Flash está analisando os nomes e telefones...');
      const contacts = await extractContactsFromAttendanceSheet(optimizedBlob, key);

      if (contacts.length === 0) {
        alert('Nenhum contato foi identificado na foto. Verifique se a folha está nítida e bem iluminada.');
        setScanning(false);
        return;
      }

      setScannedContacts(contacts);
      // Se já houver indicador selecionado no form, traz como padrão no modal
      if (selectedRef) {
        setBatchSelectedIndicator(selectedRef);
        setBatchIndicatorSearch(`@${selectedRef.username} - ${selectedRef.name}`);
      }
      if (city) {
        setBatchDefaultCity(city);
      }
    } catch (err) {
      if (err.message && err.message.toLowerCase().includes('chave')) {
        setPendingScanFile(file);
        setApiKeyModalOpen(true);
      }
      alert(err.message || 'Erro ao processar imagem da folha de presença.');
    } finally {
      setScanning(false);
      setScanProgress('');
    }
  }

  function handleAttendanceSheetCapture(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    processAttendanceSheet(file);
  }

  function saveApiKeyAndProceed() {
    const cleanKey = apiKeyInput.trim();
    if (!cleanKey) {
      alert('Por favor, informe uma chave de API válida.');
      return;
    }
    setGeminiApiKey(cleanKey);
    setApiKeyModalOpen(false);
    alert('Chave salva com sucesso!');
    if (pendingScanFile) {
      const fileToProcess = pendingScanFile;
      setPendingScanFile(null);
      processAttendanceSheet(fileToProcess);
    }
  }

  // --- Manipulação dos Contatos Escaneados no Modal ---
  function updateScannedContact(id, field, value) {
    setScannedContacts(prev => prev.map(c => {
      if (c.id === id) {
        const updated = { ...c, [field]: value };
        if (field === 'phone') {
          const digits = value.replace(/\D/g, '');
          updated.needs_review = digits.length < 10;
        }
        return updated;
      }
      return c;
    }));
  }

  function removeScannedContact(id) {
    setScannedContacts(prev => prev.filter(c => c.id !== id));
  }

  function addEmptyScannedContact() {
    setScannedContacts(prev => [
      ...prev,
      {
        id: Date.now(),
        name: '',
        phone: '',
        city: batchDefaultCity,
        needs_review: true,
        notes: 'Adicionado manualmente'
      }
    ]);
  }

  // --- Exportar vCard direto da Folha Lida ---
  function handleExportScannedVCF() {
    const valid = (scannedContacts || []).filter(c => c.name.trim() && c.phone.replace(/\D/g, ''));
    if (valid.length === 0) {
      alert('Nenhum contato válido para exportar.');
      return;
    }

    const cards = valid.map((u, index) => {
      const listIndex = Math.floor(index / 250) + 1;
      const fullName = `T${listIndex} ${u.name.trim()}`;
      let tel = (u.phone || '').replace(/\D/g, '');
      const cleanTel = tel.length === 10 || tel.length === 11 ? '55' + tel : tel;
      
      return [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${fullName}`,
        `TEL;TYPE=CELL:${cleanTel}`,
        'END:VCARD'
      ].join('\n');
    });

    const vcfContent = cards.join('\n');
    const blob = new Blob([vcfContent], { type: 'text/vcard;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.download = `folha_presenca_transmissao_${Date.now()}.vcf`;
    link.href = url;
    link.click();

    alert(`Arquivo vCard gerado com ${valid.length} contatos! Você já pode abri-lo no celular para criar a Lista de Transmissão.`);
  }

  // --- Cadastro em Massa no Banco de Dados ---
  async function handleBatchRegister() {
    const valid = (scannedContacts || []).filter(c => c.name.trim() && c.phone.replace(/\D/g, ''));
    if (valid.length === 0) {
      alert('Não há contatos preenchidos na lista para cadastrar.');
      return;
    }

    if (!batchSelectedIndicator) {
      alert('Por favor, selecione quem será o Indicador / Patrocinador padrão destes novos membros.');
      return;
    }

    const confirmed = window.confirm(`Deseja cadastrar ${valid.length} pessoas na rede sob o indicador ${batchSelectedIndicator.name} (@${batchSelectedIndicator.username})?`);
    if (!confirmed) return;

    setBatchLoading(true);
    let successCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;

    const tempSupabase = createClient(supabase.supabaseUrl, supabase.supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });

    for (let i = 0; i < valid.length; i++) {
      const item = valid[i];
      setBatchProgress({
        current: i + 1,
        total: valid.length,
        currentName: item.name
      });

      const cleanedPhone = item.phone.replace(/\D/g, '');
      const itemCity = item.city || batchDefaultCity || 'Brasília';

      try {
        // 1) Checa duplicidade de WhatsApp
        const { data: dupPhone } = await supabase
          .from('profiles')
          .select('id')
          .eq('whatsapp', cleanedPhone)
          .maybeSingle();

        if (dupPhone) {
          duplicateCount++;
          continue;
        }

        // 2) Gera username único
        const baseUsername = generateBaseUsername(item.name);
        let finalUsername = baseUsername || `membro${Date.now().toString().slice(-4)}`;
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

        const cleanedEmail = `${finalUsername}@amigosdrcandido.com.br`;

        // 3) Cria Auth User
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
          console.error(`Erro auth para ${item.name}:`, authErr);
          errorCount++;
          continue;
        }

        // 4) Encontra slot na árvore binária / spillover
        const { data: foundSlot, error: slotErr } = await supabase.rpc('find_slot', { ref_id: batchSelectedIndicator.id });
        if (slotErr) {
          console.error(`Erro slot para ${item.name}:`, slotErr);
          errorCount++;
          continue;
        }

        const coordId = (batchSelectedIndicator.role === 'coord' || batchSelectedIndicator.role === 'admin') 
          ? batchSelectedIndicator.id 
          : batchSelectedIndicator.coord_id;

        // 5) Insere Profile
        const { error: profErr } = await supabase.from('profiles').insert({
          auth_id: authData.user.id,
          name: item.name.trim(),
          email: cleanedEmail,
          phone: cleanedPhone,
          whatsapp: cleanedPhone,
          role: 'user',
          coord_id: coordId,
          parent_id: foundSlot,
          referrer_id: batchSelectedIndicator.id,
          username: finalUsername,
          city: itemCity || null
        });

        if (profErr) {
          console.error(`Erro perfil para ${item.name}:`, profErr);
          errorCount++;
          continue;
        }

        successCount++;
      } catch (err) {
        console.error(`Erro inesperado para ${item.name}:`, err);
        errorCount++;
      }
    }

    setBatchLoading(false);
    setBatchResult({
      successCount,
      duplicateCount,
      errorCount,
      total: valid.length
    });

    const newCount = await fetchTotalUsersCount();
    setTotalUsers(newCount);
  }

  // --- Cadastro Manual Individual ---
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
    if (!city) {
      alert('Por favor, selecione sua cidade ou a mais próxima.');
      return;
    }

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

      const cleanedEmail = `${finalUsername}@amigosdrcandido.com.br`;

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
        username: finalUsername,
        city: city || null
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
        phone: cleanedPhone,
        city: city
      });

      // Clear fields for next signup, keep the indicator selected
      setName('');
      setPhone('');
      setEmail('');
      setCity('');
      setCitySearch('');
      
      const newCount = await fetchTotalUsersCount();
      setTotalUsers(newCount);

    } catch (err) {
      alert('Erro inesperado: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  let memberWaUrl = '';
  if (successData) {
    const messageText = `Olá, ${successData.name}! Aqui estão seus dados de acesso ao Amigos Dr. Cândido:\n\n*Usuário:* ${successData.username}\n*Senha padrão:* ${successData.password}${successData.city ? `\n*Cidade:* ${successData.city}` : ''}\n\nLink de acesso: ${window.location.origin}`;
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

      {/* --- BANNER DE DIGITALIZAÇÃO COM IA (EXCLUSIVO ADMIN) --- */}
      {isAdmin && (
        <div style={{
          marginBottom: 18,
          padding: '16px 18px',
          background: 'linear-gradient(135deg, rgba(232, 197, 71, 0.14), rgba(61, 217, 179, 0.08))',
          border: '1.5px solid rgba(232, 197, 71, 0.4)',
          borderRadius: 16,
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>📸 Digitalização Inteligente (OCR)</span>
              <span style={{ fontSize: 10, background: 'rgba(232, 197, 71, 0.25)', color: 'var(--gold)', padding: '2px 8px', borderRadius: 6, fontWeight: 800 }}>ADMIN</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 4, lineHeight: 1.45 }}>
              Tire uma foto da folha de presença física e a IA identificará todos os nomes e telefones automaticamente.
            </div>
          </div>

          <button
            type="button"
            className="btn btn-teal"
            onClick={() => fileInputRef.current?.click()}
            disabled={scanning}
            style={{
              margin: 0,
              padding: '15px 20px',
              fontSize: 15,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              background: 'linear-gradient(135deg, #3DD9B3, #25D366)',
              color: '#051A14',
              border: 'none',
              borderRadius: 12,
              boxShadow: '0 6px 20px rgba(61, 217, 179, 0.35)',
              cursor: 'pointer',
              width: '100%'
            }}
          >
            <span style={{ fontSize: 20 }}>📸</span>
            <span>{scanning ? '⏳ Analisando Folha de Presença...' : 'Ler Folha de Presença'}</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleAttendanceSheetCapture}
          />
        </div>
      )}

      {/* --- OVERLAY DE PROCESSAMENTO DA IA --- */}
      {scanning && (
        <div className="modal-bg" style={{ zIndex: 10000, backgroundColor: 'rgba(5, 7, 11, 0.88)' }}>
          <div className="modal" style={{ textAlign: 'center', maxWidth: 360, padding: '24px 20px' }}>
            <div style={{ fontSize: 40, marginBottom: 14, animation: 'pulse 1.5s infinite' }}>🤖</div>
            <h3 style={{ fontSize: 16, color: 'var(--teal)', fontWeight: 800, margin: '0 0 8px 0' }}>Analisando Lista de Presença</h3>
            <p style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.5, margin: 0 }}>
              {scanProgress || 'Aguarde um momento enquanto a IA transcreve os contatos da foto...'}
            </p>
          </div>
        </div>
      )}

      {/* --- FORMULÁRIO PADRÃO DE CADASTRO EM MASSA (INDIVIDUAL) --- */}
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

          <label className="lbl">Selecione sua cidade ou a mais próxima <span className="req">*</span></label>
          <div style={{ position: 'relative', marginBottom: '16px' }}>
            <div 
              onClick={() => setCityDropdownOpen(true)}
              style={{
                padding: '12px 14px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1.5px solid rgba(123, 108, 244, 0.25)',
                borderRadius: '12px',
                color: city ? '#fff' : 'var(--ink3)',
                fontSize: '14px',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span>{city || "Clique para selecionar..."}</span>
              <span style={{ fontSize: '10px', color: 'var(--ink3)' }}>▼</span>
            </div>
            
            {cityDropdownOpen && (
              <>
                <div 
                  style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, background: 'transparent' }} 
                  onClick={() => setCityDropdownOpen(false)} 
                />
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: '#090d16',
                  border: '1px solid var(--line)',
                  borderRadius: '12px',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  zIndex: 1001,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                  marginTop: '4px'
                }}>
                  <div style={{ padding: '8px', borderBottom: '1px solid var(--line)', display: 'flex', gap: '6px', background: '#05070d', position: 'sticky', top: 0, zIndex: 2 }}>
                    <input
                      type="text"
                      placeholder="Buscar cidade (min. 3 letras)..."
                      value={citySearch}
                      onChange={(e) => setCitySearch(e.target.value)}
                      style={{ padding: '6px 10px', fontSize: '12px', margin: 0, width: '100%', background: 'rgba(255,255,255,0.02)', color: '#fff' }}
                      autoFocus
                    />
                    {citySearch && (
                      <button 
                        type="button" 
                        className="btn btn-ghost" 
                        style={{ padding: '0 8px', fontSize: '11px', margin: 0, width: 'auto' }}
                        onClick={() => setCitySearch('')}
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  
                  {(() => {
                    const searchVal = citySearch.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    const filteredCities = searchVal.length >= 3
                      ? CITIES.filter(c => c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(searchVal))
                      : CITIES;

                    if (filteredCities.length === 0) {
                      return <div style={{ padding: '12px', fontSize: '12px', color: 'var(--ink3)', textAlign: 'center' }}>Nenhuma cidade encontrada</div>;
                    }

                    return filteredCities.map((c) => (
                      <div
                        key={c}
                        onClick={() => {
                          setCity(c);
                          setCitySearch('');
                          setCityDropdownOpen(false);
                        }}
                        style={{
                          padding: '10px 14px',
                          fontSize: '13px',
                          cursor: 'pointer',
                          color: city === c ? 'var(--teal)' : '#fff',
                          background: city === c ? 'rgba(0, 242, 254, 0.05)' : 'transparent',
                          borderBottom: '1px solid rgba(255,255,255,0.02)',
                          textAlign: 'left'
                        }}
                      >
                        {c}
                      </div>
                    ));
                  })()}
                </div>
              </>
            )}
          </div>

          <button className="btn btn-teal" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? 'Cadastrando...' : 'Cadastrar Membro'}
          </button>
        </form>
      </div>

      {/* --- MODAL DE CONFERÊNCIA E IMPORTAÇÃO DOS CONTATOS ESCONEADOS COM IA --- */}
      {scannedContacts && (
        <div className="modal-bg" style={{ zIndex: 10000 }}>
          <div className="modal" style={{ maxWidth: 650, width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '18px 16px' }}>
            
            {/* Cabeçalho */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: 12, marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>📋 Contatos da Folha</span>
                  <span style={{ fontSize: 11, background: 'var(--teal-dim)', color: 'var(--teal)', padding: '2px 8px', borderRadius: 999 }}>
                    {scannedContacts.length} identificados
                  </span>
                </h3>
                <div style={{ fontSize: 11.5, color: 'var(--ink2)', marginTop: 2 }}>
                  Revise ou corrija qualquer nome ou número antes de salvar.
                </div>
              </div>
              <button 
                type="button" 
                className="btn btn-ghost" 
                style={{ width: 'auto', padding: '4px 8px', margin: 0, fontSize: 12 }} 
                onClick={() => setScannedContacts(null)}
              >
                ✕
              </button>
            </div>

            {/* Configurações em Lote (Indicador e Cidade) */}
            <div style={{ background: 'var(--panel2)', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--line)', marginBottom: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="lbl" style={{ fontSize: 10 }}>Indicador / Patrocinador Padrão <span className="req">*</span></label>
                <div style={{ position: 'relative' }}>
                  <input
                    placeholder="Buscar indicador (mín. 3 letras)..."
                    value={batchIndicatorSearch}
                    onChange={(e) => {
                      setBatchIndicatorSearch(e.target.value);
                      if (batchSelectedIndicator) setBatchSelectedIndicator(null);
                    }}
                    style={{ fontSize: 12, padding: '7px 9px', margin: 0 }}
                  />
                  {batchSelectedIndicator && (
                    <div style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'var(--teal-dim)', color: 'var(--teal)', fontSize: 10.5, fontWeight: '700', padding: '2px 6px', borderRadius: 6 }}>
                      ✓ {batchSelectedIndicator.name.split(' ')[0]}
                    </div>
                  )}

                  {batchShowDropdown && batchFoundIndicators.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#090d16', border: '1px solid var(--line)', borderRadius: 8, zIndex: 1000, maxHeight: 140, overflowY: 'auto', marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
                      {batchFoundIndicators.map(ind => (
                        <div
                          key={ind.id}
                          onClick={() => {
                            setBatchSelectedIndicator(ind);
                            setBatchIndicatorSearch(`@${ind.username} - ${ind.name}`);
                            setBatchShowDropdown(false);
                          }}
                          style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid var(--line)', color: 'var(--ink1)', fontSize: 12 }}
                        >
                          <strong>@{ind.username}</strong> - {ind.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="lbl" style={{ fontSize: 10 }}>Cidade Padrão</label>
                <select
                  value={batchDefaultCity}
                  onChange={(e) => setBatchDefaultCity(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 9px',
                    fontSize: 12,
                    background: 'rgba(255, 255, 255, 0.04)',
                    color: '#fff',
                    border: '1px solid var(--line)',
                    borderRadius: 8
                  }}
                >
                  {CITIES.map(c => (
                    <option key={c} value={c} style={{ background: '#090d16', color: '#fff' }}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tabela de Contatos Editáveis */}
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: '38vh', border: '1px solid var(--line)', borderRadius: 10, background: '#05070d', padding: 8 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {scannedContacts.map((contact, index) => (
                  <div 
                    key={contact.id} 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 6, 
                      padding: '6px 8px', 
                      background: contact.needs_review ? 'rgba(240, 107, 76, 0.08)' : 'var(--panel2)', 
                      border: contact.needs_review ? '1px solid rgba(240, 107, 76, 0.3)' : '1px solid var(--line)', 
                      borderRadius: 8 
                    }}
                  >
                    <span style={{ fontSize: 11, color: 'var(--ink3)', width: 22, textAlign: 'center', fontWeight: 700 }}>
                      {index + 1}
                    </span>

                    <input
                      type="text"
                      placeholder="Nome Completo"
                      value={contact.name}
                      onChange={(e) => updateScannedContact(contact.id, 'name', e.target.value)}
                      style={{ flex: 1.2, margin: 0, padding: '6px 8px', fontSize: 12, background: 'rgba(255,255,255,0.03)', color: '#fff' }}
                    />

                    <input
                      type="text"
                      placeholder="WhatsApp (ex: 61999998888)"
                      value={contact.phone}
                      onChange={(e) => updateScannedContact(contact.id, 'phone', e.target.value)}
                      style={{ flex: 1, margin: 0, padding: '6px 8px', fontSize: 12, background: 'rgba(255,255,255,0.03)', color: contact.needs_review ? 'var(--warn)' : 'var(--teal)', fontWeight: 600 }}
                    />

                    {contact.needs_review && (
                      <span title="Número ou nome requer atenção" style={{ fontSize: 12, cursor: 'help' }}>⚠️</span>
                    )}

                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => removeScannedContact(contact.id)}
                      style={{ width: 'auto', margin: 0, padding: '5px 8px', color: 'var(--warn)', fontSize: 11 }}
                      title="Excluir contato"
                    >
                      🗑️
                    </button>
                  </div>
                ))}

                {scannedContacts.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 20, color: 'var(--ink3)', fontSize: 12 }}>
                    Nenhum contato na lista.
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={addEmptyScannedContact}
                style={{ width: 'auto', margin: 0, padding: '6px 12px', fontSize: 11.5, color: 'var(--teal)' }}
              >
                + Adicionar Outro Contato
              </button>
              <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                Dica: Verifique se todos os números contêm DDD.
              </div>
            </div>

            {/* Ações / Botões Finais */}
            <div style={{ display: 'flex', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleExportScannedVCF}
                disabled={batchLoading}
                style={{ flex: 1, margin: 0, padding: '10px 12px', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: '1px solid var(--teal)', color: 'var(--teal)' }}
              >
                <span>📥 Baixar Lista vCard (.VCF)</span>
              </button>

              <button
                type="button"
                className="btn btn-teal"
                onClick={handleBatchRegister}
                disabled={batchLoading || !batchSelectedIndicator}
                style={{ flex: 1.3, margin: 0, padding: '10px 12px', fontSize: 12.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <span>⚡ Cadastrar Todos na Rede</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* --- PROGRESSO DO CADASTRO EM LOTE --- */}
      {batchLoading && (
        <div className="modal-bg" style={{ zIndex: 10001, backgroundColor: 'rgba(5, 7, 11, 0.92)' }}>
          <div className="modal" style={{ textAlign: 'center', maxWidth: 360, padding: '24px 20px' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>
            <h3 style={{ fontSize: 16, color: 'var(--teal)', fontWeight: 800, margin: '0 0 8px 0' }}>Cadastrando Membros na Rede</h3>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
              {batchProgress.current} de {batchProgress.total}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink2)', marginBottom: 16 }}>
              Processando: <strong>{batchProgress.currentName}</strong>
            </div>
            <div style={{ width: '100%', height: 6, background: 'var(--line)', borderRadius: 3, overflow: 'hidden' }}>
              <div 
                style={{ 
                  width: `${(batchProgress.current / (batchProgress.total || 1)) * 100}%`, 
                  height: '100%', 
                  background: 'linear-gradient(to right, var(--teal), #25D366)',
                  transition: 'width 0.2s'
                }} 
              />
            </div>
          </div>
        </div>
      )}

      {/* --- RELATÓRIO DO CADASTRO EM LOTE --- */}
      {batchResult && (
        <div className="modal-bg" style={{ zIndex: 10002 }}>
          <div className="modal" style={{ textAlign: 'center', maxWidth: 380, padding: '24px 20px' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🎉</div>
            <h2 style={{ fontSize: 17, color: 'var(--teal)', fontWeight: 800, marginBottom: 10 }}>Importação Concluída!</h2>
            
            <div style={{ textAlign: 'left', background: 'var(--panel2)', borderRadius: 12, padding: 14, marginBottom: 16, border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12.5, color: '#fff' }}>
                ✅ Cadastrados com sucesso: <strong style={{ color: 'var(--teal)' }}>{batchResult.successCount}</strong>
              </div>
              {batchResult.duplicateCount > 0 && (
                <div style={{ fontSize: 12, color: 'var(--ink2)' }}>
                  ⚠️ Ignorados por WhatsApp já existente: <strong style={{ color: 'var(--warn)' }}>{batchResult.duplicateCount}</strong>
                </div>
              )}
              {batchResult.errorCount > 0 && (
                <div style={{ fontSize: 12, color: 'var(--ink2)' }}>
                  ❌ Falhas de registro: <strong style={{ color: 'var(--warn)' }}>{batchResult.errorCount}</strong>
                </div>
              )}
            </div>

            <p style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.5, marginBottom: 16 }}>
              Todos os novos membros foram integrados à árvore de indicações e podem acessar o sistema com a senha padrão <strong>123456</strong>.
            </p>

            <button
              type="button"
              className="btn btn-teal"
              style={{ width: '100%', margin: 0 }}
              onClick={() => {
                setBatchResult(null);
                setScannedContacts(null);
              }}
            >
              Concluir e Voltar
            </button>
          </div>
        </div>
      )}


      {/* --- MODAL DE SUCESSO DO CADASTRO MANUAL INDIVIDUAL --- */}
      {successData && (
        <div className="modal-bg" style={{ zIndex: 10000 }}>
          <div className="modal" style={{ textAlign: 'center', maxWidth: 380 }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🎉</div>
            <h2 style={{ fontSize: 17, color: 'var(--teal)', marginBottom: 10 }}>Cadastro Realizado com Sucesso!</h2>
            
            <div style={{ textAlign: 'left', background: 'var(--panel2)', borderRadius: 12, padding: 14, marginBottom: 16, border: '1px solid var(--line)' }}>
              <div style={{ fontSize: 12, color: 'var(--ink2)', marginBottom: 4 }}>Nome: <strong style={{ color: 'var(--ink1)' }}>{successData.name}</strong></div>
              <div style={{ fontSize: 12, color: 'var(--ink2)', marginBottom: 4 }}>Usuário: <strong style={{ color: 'var(--teal)' }}>{successData.username}</strong></div>
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
