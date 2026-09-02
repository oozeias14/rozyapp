import { useState, useEffect, useRef } from 'react';
import { supabase, CITIES } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import TopBar from '../components/TopBar';
import { fetchTotalUsersCount } from '../lib/api';
import { 
  getGeminiApiKey, 
  setGeminiApiKey, 
  prepareImageForOCR, 
  extractContactsFromAttendanceSheet 
} from '../lib/gemini';

export default function MassSignupScreen({ profile }) {
  const fileInputRef = useRef(null);

  const [totalUsers, setTotalUsers] = useState(0);
  const [step, setStep] = useState(1); // 1: Foto, 2: Detalhes, 3: Confirmar, 4: Concluído

  // Estados da Leitura de Folha com IA
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState('');
  const [scannedContacts, setScannedContacts] = useState([]);
  const [previewImage, setPreviewImage] = useState(null);
  const [pendingScanFile, setPendingScanFile] = useState(null);
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(getGeminiApiKey());

  // Estados dos Detalhes da Reunião
  const [broadcastListName, setBroadcastListName] = useState('');
  const [batchDefaultCity, setBatchDefaultCity] = useState(profile?.city || 'Brasília');
  const [showEditContactsList, setShowEditContactsList] = useState(false);

  // Estados de Execução e Sucesso
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, currentName: '' });
  const [batchResult, setBatchResult] = useState(null);
  const [copiedMessage, setCopiedMessage] = useState(false);

  const BROADCAST_WELCOME_MESSAGE = `Olá! Seja muito bem-vindo(a) ao projeto Amigos Dr. Cândido! 🎉

Seu cadastro foi realizado com sucesso em nosso sistema.

🔗 Link de Acesso: https://amigosdrcandido.com.br
📱 Login: Seu número de WhatsApp
🔑 Senha inicial: 123456

Acesse agora para acompanhar seus dados e indicações!`;

  useEffect(() => {
    (async () => {
      const count = await fetchTotalUsersCount();
      setTotalUsers(count);
    })();
  }, []);

  function normalizePhoneWithDDD61(raw) {
    let digits = (raw || '').replace(/\D/g, '');
    if (digits.length === 8) {
      digits = '619' + digits;
    } else if (digits.length === 9) {
      digits = '61' + digits;
    } else if (digits.length === 10 && digits.startsWith('61')) {
      digits = '619' + digits.slice(2);
    }
    return digits;
  }

  function generateBaseUsername(fullName) {
    const parts = fullName.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const normalize = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    if (parts.length === 0) return '';
    if (parts.length === 1) return normalize(parts[0]);
    return normalize(parts[0]) + normalize(parts[1]);
  }

  // --- Processamento da Imagem pela IA ---
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

      setScanProgress('🤖 O Gemini 1.5 Flash está identificando nomes e telefones...');
      const contacts = await extractContactsFromAttendanceSheet(optimizedBlob, key);

      if (contacts.length === 0) {
        alert('Nenhum contato foi identificado na foto. Verifique se a folha está nítida e bem iluminada.');
        setScanning(false);
        return;
      }

      setScannedContacts(contacts);
      
      // Sugestão automática amigável para o nome da lista
      const citySuggestion = batchDefaultCity && batchDefaultCity !== 'Brasília' ? batchDefaultCity : 'Geral';
      if (!broadcastListName) {
        setBroadcastListName(`Reunião ${citySuggestion}`);
      }

      // Avança suavemente para a Etapa 2
      setStep(2);
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

  // --- Manipulação dos Contatos Escaneados ---
  function updateScannedContact(id, field, value) {
    setScannedContacts(prev => prev.map(c => {
      if (c.id === id) {
        const updated = { ...c, [field]: value };
        if (field === 'phone') {
          const digits = normalizePhoneWithDDD61(value);
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
        phone: '61',
        city: batchDefaultCity,
        needs_review: true,
        notes: 'Adicionado manualmente'
      }
    ]);
  }

  function handleCopyBroadcastMessage() {
    navigator.clipboard.writeText(BROADCAST_WELCOME_MESSAGE);
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 3000);
  }

  // --- Gerar e Baixar vCard (.vcf) ou Compartilhar direto no Celular ---
  async function downloadVCardFile(validList, listTag) {
    if (!validList || validList.length === 0) return;
    
    const tag = listTag || 'Reunião';
    const cards = validList.map((u) => {
      const cleanName = u.name.trim();
      const fullName = `${cleanName} ${tag}`.trim();
      let tel = normalizePhoneWithDDD61(u.phone);
      
      let intlTel = tel;
      if (!intlTel.startsWith('55') && (intlTel.length === 10 || intlTel.length === 11)) {
        intlTel = '55' + intlTel;
      }
      if (!intlTel.startsWith('+')) {
        intlTel = '+' + intlTel;
      }
      
      return [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `N:;${fullName};;;`,
        `FN:${fullName}`,
        `TEL;TYPE=CELL;TYPE=PREF:${intlTel}`,
        `TEL;TYPE=CELL,VOICE:${intlTel}`,
        'END:VCARD'
      ].join('\n');
    });

    const vcfContent = cards.join('\n');
    const safeTag = tag.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, '_');
    const fileName = `contatos_${safeTag}_${Date.now()}.vcf`;

    const blob = new Blob([vcfContent], { type: 'text/vcard;charset=utf-8;' });
    
    // Tenta Web Share API nativa no Android / iPhone
    try {
      const file = new File([blob], fileName, { type: 'text/vcard' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Contatos ${tag}`,
          text: `Salvar contatos da ${tag}`
        });
        return;
      }
    } catch (e) {
      console.log('Web share skipped or not supported:', e);
    }

    // Fallback padrão: Download do arquivo .vcf
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 1000);
  }

  async function handleManualDownloadContacts() {
    const listTag = batchResult?.listTag || broadcastListName.trim() || 'Reunião';
    const valid = (scannedContacts || []).filter(c => c.name.trim() && c.phone.replace(/\D/g, ''));
    if (valid.length === 0) {
      alert('Nenhum contato encontrado para salvar.');
      return;
    }
    await downloadVCardFile(valid, listTag);
  }

  // --- BOTÃO MÁGICO: CADASTRAR NA REDE E SALVAR NO WHATSAPP DE UMA VEZ ---
  async function handleCadastrarESalvarWhatsApp() {
    const listTag = broadcastListName.trim();
    if (!listTag) {
      alert('⚠️ Por favor, digite o Nome da Reunião (ex: Casa da Camilla) para identificar os contatos no WhatsApp.');
      setStep(2);
      return;
    }

    const valid = (scannedContacts || []).filter(c => c.name.trim() && c.phone.replace(/\D/g, ''));
    if (valid.length === 0) {
      alert('Não há contatos preenchidos na lista para cadastrar.');
      return;
    }

    const targetIndicator = profile;
    if (!targetIndicator?.id) {
      alert('Erro: Usuário autenticado não encontrado.');
      return;
    }

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

      const cleanedPhone = normalizePhoneWithDDD61(item.phone);
      const itemCity = batchDefaultCity || 'Brasília';

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
        const { data: foundSlot, error: slotErr } = await supabase.rpc('find_slot', { ref_id: targetIndicator.id });
        if (slotErr) {
          console.error(`Erro slot para ${item.name}:`, slotErr);
          errorCount++;
          continue;
        }

        const coordId = (targetIndicator.role === 'coord' || targetIndicator.role === 'admin' || targetIndicator.role === 'admin2') 
          ? targetIndicator.id 
          : targetIndicator.coord_id;

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
          referrer_id: targetIndicator.id,
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
      total: valid.length,
      listTag
    });

    // 1) Baixa o arquivo para a agenda do celular
    downloadVCardFile(valid, listTag);

    // 2) Copia automaticamente a mensagem de boas-vindas
    navigator.clipboard.writeText(BROADCAST_WELCOME_MESSAGE);
    setCopiedMessage(true);

    // 3) Atualiza contadores globais e avança para a tela comemorativa
    const newCount = await fetchTotalUsersCount();
    setTotalUsers(newCount);
    setStep(4);
  }

  function resetFlow() {
    setStep(1);
    setScannedContacts([]);
    setPreviewImage(null);
    setBroadcastListName('');
    setShowEditContactsList(false);
    setBatchResult(null);
  }

  const validContactsCount = (scannedContacts || []).filter(c => c.name.trim() && c.phone.replace(/\D/g, '')).length;

  return (
    <div className="screen" style={{ paddingBottom: '110px' }}>
      <TopBar totalUsers={totalUsers} />

      {/* --- BARRA DE PASSOS (STEPPER GUIADO) --- */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        margin: '14px 0 20px 0',
        padding: '12px 16px',
        background: 'rgba(13, 17, 28, 0.95)',
        borderRadius: 16,
        border: '1px solid var(--line)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.35)'
      }}>
        {/* Passo 1 */}
        <div 
          onClick={() => step > 1 && setStep(1)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            cursor: step > 1 ? 'pointer' : 'default',
            opacity: step === 1 ? 1 : 0.6
          }}
        >
          <div style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: step === 1 ? 'linear-gradient(135deg, #3DD9B3, #25D366)' : step > 1 ? 'var(--teal)' : 'var(--panel2)',
            color: step === 1 || step > 1 ? '#051A14' : 'var(--ink3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 900
          }}>
            {step > 1 ? '✓' : '1'}
          </div>
          <span style={{ fontSize: 11.5, fontWeight: step === 1 ? 800 : 600, color: step === 1 ? '#fff' : 'var(--ink2)' }}>
            Foto
          </span>
        </div>

        {/* Linha 1-2 */}
        <div style={{ flex: 1, height: 2, background: step > 1 ? 'var(--teal)' : 'var(--line)', margin: '0 8px', transition: 'background 0.3s' }} />

        {/* Passo 2 */}
        <div 
          onClick={() => step > 2 && setStep(2)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            cursor: step > 2 ? 'pointer' : 'default',
            opacity: step === 2 ? 1 : 0.6
          }}
        >
          <div style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: step === 2 ? 'linear-gradient(135deg, #FFA000, #FFD54F)' : step > 2 ? 'var(--teal)' : 'var(--panel2)',
            color: step === 2 ? '#051A14' : step > 2 ? '#051A14' : 'var(--ink3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 900
          }}>
            {step > 2 ? '✓' : '2'}
          </div>
          <span style={{ fontSize: 11.5, fontWeight: step === 2 ? 800 : 600, color: step === 2 ? '#fff' : 'var(--ink2)' }}>
            Reunião
          </span>
        </div>

        {/* Linha 2-3 */}
        <div style={{ flex: 1, height: 2, background: step >= 3 ? 'var(--teal)' : 'var(--line)', margin: '0 8px', transition: 'background 0.3s' }} />

        {/* Passo 3 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: step >= 3 ? 1 : 0.6 }}>
          <div style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: step >= 3 ? 'linear-gradient(135deg, #3DD9B3, #25D366)' : 'var(--panel2)',
            color: step >= 3 ? '#051A14' : 'var(--ink3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 900
          }}>
            {step === 4 ? '✓' : '3'}
          </div>
          <span style={{ fontSize: 11.5, fontWeight: step >= 3 ? 800 : 600, color: step >= 3 ? '#fff' : 'var(--ink2)' }}>
            Salvar
          </span>
        </div>
      </div>


      {/* ========================================================= */}
      {/* 🟢 ETAPA 1: A FOTO (SEM DISTRAÇÕES) */}
      {/* ========================================================= */}
      {step === 1 && (
        <div style={{
          padding: '24px 20px',
          background: 'linear-gradient(135deg, rgba(232, 197, 71, 0.12), rgba(61, 217, 179, 0.08))',
          border: '1.5px solid rgba(232, 197, 71, 0.35)',
          borderRadius: 20,
          boxShadow: '0 10px 32px rgba(0, 0, 0, 0.35)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 18
        }}>
          <div>
            <div style={{
              width: 58,
              height: 58,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(61, 217, 179, 0.2), rgba(37, 211, 102, 0.15))',
              border: '2px solid var(--teal)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              margin: '0 auto 12px auto'
            }}>
              📸
            </div>
            <h2 style={{
              fontSize: 17,
              fontWeight: 900,
              letterSpacing: '0.8px',
              color: '#fff',
              textTransform: 'uppercase',
              margin: '0 0 6px 0'
            }}>
              DIGITALIZAÇÃO INTELIGENTE
            </h2>
            <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5, maxWidth: 380, margin: '0 auto' }}>
              Tire uma foto da folha de presença física e o sistema identificará todos os nomes e números de WhatsApp automaticamente.
            </div>
          </div>

          {/* Botão Gigante de Foto */}
          <button
            type="button"
            className="btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={scanning}
            style={{
              margin: 0,
              padding: '18px 24px',
              fontSize: 16,
              fontWeight: 900,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              background: 'linear-gradient(135deg, #3DD9B3, #25D366)',
              color: '#051A14',
              border: 'none',
              borderRadius: 16,
              boxShadow: '0 8px 28px rgba(61, 217, 179, 0.45)',
              cursor: 'pointer',
              width: '100%',
              maxWidth: 380
            }}
          >
            <span style={{ fontSize: 24 }}>📸</span>
            <span>{scanning ? '⏳ Lendo Folha de Presença...' : 'Tirar Foto da Folha de Presença'}</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleAttendanceSheetCapture}
          />

          {/* Dicas Rápidas */}
          <div style={{
            width: '100%',
            maxWidth: 380,
            background: 'rgba(5, 7, 13, 0.7)',
            borderRadius: 14,
            padding: '12px 16px',
            border: '1px solid var(--line)',
            textAlign: 'left'
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--gold)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>💡 DICAS PARA UMA LEITURA PERFEITA:</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11.5, color: 'var(--ink2)', lineHeight: 1.6 }}>
              <li>Procure um local claro e bem iluminado.</li>
              <li>Enquadre a folha inteira na tela do celular.</li>
              <li>Funciona para folhas manuscritas ou impressas!</li>
            </ul>
          </div>
        </div>
      )}


      {/* ========================================================= */}
      {/* 🟡 ETAPA 2: ONDE FOI A REUNIÃO? (SIMPLES E RÁPIDO) */}
      {/* ========================================================= */}
      {step === 2 && (
        <div style={{
          padding: '22px 18px',
          background: 'linear-gradient(135deg, rgba(22, 28, 44, 0.95), rgba(13, 17, 28, 0.98))',
          border: '1.5px solid rgba(123, 108, 244, 0.25)',
          borderRadius: 20,
          boxShadow: '0 10px 32px rgba(0, 0, 0, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16
        }}>
          {/* Badge de Contatos Encontrados */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(61, 217, 179, 0.15), rgba(37, 211, 102, 0.1))',
            border: '1.5px solid var(--teal)',
            borderRadius: 14,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 24 }}>📋</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#fff' }}>
                  {validContactsCount} Contatos Identificados!
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--teal)' }}>
                  Sob a sua indicação: <strong>@{profile?.username || 'você'}</strong>
                </div>
              </div>
            </div>
            <span style={{ fontSize: 11, background: 'var(--teal-dim)', color: 'var(--teal)', padding: '4px 8px', borderRadius: 999, fontWeight: 800 }}>
              Prontos
            </span>
          </div>

          {/* Campo 1: Nome da Reunião */}
          <div>
            <label className="lbl" style={{ fontSize: 11.5, color: 'var(--gold)', fontWeight: 800, marginBottom: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>🏷️ NOME DA REUNIÃO / EVENTO:</span>
              <span style={{ color: '#FFA000', fontSize: 10, background: 'rgba(255, 160, 0, 0.15)', padding: '2px 6px', borderRadius: 4, fontWeight: 800 }}>OBRIGATÓRIO</span>
            </label>
            <input
              type="text"
              placeholder="Ex: Reunião Casa Camilla, Evento Taguatinga..."
              value={broadcastListName}
              onChange={(e) => setBroadcastListName(e.target.value)}
              style={{
                width: '100%',
                margin: 0,
                padding: '12px 14px',
                fontSize: 14,
                fontWeight: 700,
                background: 'rgba(255, 255, 255, 0.05)',
                border: broadcastListName.trim() ? '1.5px solid var(--teal)' : '1.5px solid rgba(232, 197, 71, 0.5)',
                borderRadius: 10,
                color: '#fff'
              }}
            />
            <div style={{ fontSize: 11, color: 'var(--ink2)', marginTop: 5 }}>
              💡 Esse nome será salvo junto a cada contato para você achar fácil no WhatsApp.
            </div>
          </div>

          {/* Campo 2: Cidade / RA da Reunião */}
          <div>
            <label className="lbl" style={{ fontSize: 11.5, color: 'var(--ink1)', fontWeight: 800, marginBottom: 5 }}>
              📍 CIDADE / REGIÃO ADMINISTRATIVA:
            </label>
            <select
              value={batchDefaultCity}
              onChange={(e) => setBatchDefaultCity(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 14px',
                fontSize: 13.5,
                fontWeight: 700,
                background: 'rgba(255, 255, 255, 0.05)',
                color: '#fff',
                border: '1.5px solid rgba(123, 108, 244, 0.3)',
                borderRadius: 10,
                cursor: 'pointer'
              }}
            >
              {CITIES.map(c => (
                <option key={c} value={c} style={{ background: '#090d16', color: '#fff' }}>{c}</option>
              ))}
            </select>
          </div>

          {/* Gaveta Expansível: Ver ou Corrigir Nomes */}
          <div style={{ border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', background: '#05070d' }}>
            <button
              type="button"
              onClick={() => setShowEditContactsList(prev => !prev)}
              style={{
                width: '100%',
                padding: '12px 14px',
                background: 'var(--panel2)',
                border: 'none',
                color: 'var(--ink1)',
                fontSize: 12.5,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer'
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>👁️</span>
                <span>Ver ou Corrigir Nomes ({scannedContacts.length})</span>
              </span>
              <span style={{ fontSize: 11, color: 'var(--teal)' }}>
                {showEditContactsList ? 'Ocultar ▲' : 'Expandir ▼'}
              </span>
            </button>

            {showEditContactsList && (
              <div style={{ padding: 10, maxHeight: '35vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {scannedContacts.map((contact, index) => (
                  <div 
                    key={contact.id} 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 6, 
                      padding: '6px 8px', 
                      background: contact.needs_review ? 'rgba(240, 107, 76, 0.1)' : 'rgba(255,255,255,0.02)', 
                      border: contact.needs_review ? '1px solid rgba(240, 107, 76, 0.4)' : '1px solid var(--line)', 
                      borderRadius: 8 
                    }}
                  >
                    <span style={{ fontSize: 11, color: 'var(--ink3)', width: 20, textAlign: 'center', fontWeight: 700 }}>
                      {index + 1}
                    </span>

                    <input
                      type="text"
                      placeholder="Nome"
                      value={contact.name}
                      onChange={(e) => updateScannedContact(contact.id, 'name', e.target.value)}
                      style={{ flex: 1.2, margin: 0, padding: '6px 8px', fontSize: 12, background: 'rgba(255,255,255,0.03)', color: '#fff' }}
                    />

                    <input
                      type="text"
                      placeholder="Telefone"
                      value={contact.phone}
                      onChange={(e) => updateScannedContact(contact.id, 'phone', e.target.value)}
                      style={{ flex: 1, margin: 0, padding: '6px 8px', fontSize: 12, background: 'rgba(255,255,255,0.03)', color: 'var(--teal)', fontWeight: 600 }}
                    />

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

                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={addEmptyScannedContact}
                  style={{ width: '100%', margin: '6px 0 0 0', padding: '8px', fontSize: 11.5, color: 'var(--teal)' }}
                >
                  + Adicionar Outro Contato
                </button>
              </div>
            )}
          </div>

          {/* Botões de Ação da Etapa 2 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            <button
              type="button"
              className="btn btn-teal"
              onClick={() => {
                if (!broadcastListName.trim()) {
                  alert('⚠️ Por favor, digite o Nome da Reunião (ex: Casa da Camilla) para continuar.');
                  return;
                }
                setStep(3);
              }}
              style={{
                margin: 0,
                padding: '15px',
                fontSize: 15,
                fontWeight: 900,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}
            >
              <span>Continuar para Salvar</span>
              <span>➡️</span>
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={resetFlow}
              style={{ width: '100%', margin: 0, padding: '10px', fontSize: 12, color: 'var(--ink3)' }}
            >
              ← Tirar Outra Foto
            </button>
          </div>
        </div>
      )}


      {/* ========================================================= */}
      {/* 🔵 ETAPA 3: O BOTÃO MÁGICO (CONFIRMAÇÃO) */}
      {/* ========================================================= */}
      {step === 3 && (
        <div style={{
          padding: '24px 20px',
          background: 'linear-gradient(135deg, rgba(232, 197, 71, 0.14), rgba(61, 217, 179, 0.08))',
          border: '1.5px solid rgba(232, 197, 71, 0.4)',
          borderRadius: 20,
          boxShadow: '0 10px 32px rgba(0, 0, 0, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 18
        }}>
          <div>
            <div style={{ fontSize: 44, marginBottom: 8 }}>✨</div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: '#fff', margin: '0 0 6px 0' }}>
              Tudo Pronto para Salvar!
            </h2>
            <div style={{ fontSize: 12.5, color: 'var(--ink2)' }}>
              Confira os dados da sua reunião abaixo antes de finalizar.
            </div>
          </div>

          {/* Resumo em Card */}
          <div style={{
            width: '100%',
            background: 'var(--panel2)',
            borderRadius: 14,
            padding: '14px 16px',
            border: '1px solid var(--line)',
            textAlign: 'left',
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--ink3)' }}>👤 Indicador Responsável:</span>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--teal)' }}>@{profile?.username || 'você'} (VOCÊ)</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--ink3)' }}>🏷️ Nome no WhatsApp:</span>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: '#fff' }}>"{broadcastListName}"</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--ink3)' }}>📍 Região Administrativa:</span>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: '#fff' }}>{batchDefaultCity}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 2 }}>
              <span style={{ fontSize: 12, color: 'var(--ink3)' }}>👥 Novos Membros:</span>
              <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--teal)' }}>{validContactsCount} cadastros</span>
            </div>
          </div>

          {/* BOTÃO MÁGICO PRINCIPAL */}
          <button
            type="button"
            className="btn"
            onClick={handleCadastrarESalvarWhatsApp}
            disabled={batchLoading}
            style={{
              margin: 0,
              padding: '18px 22px',
              fontSize: 15.5,
              fontWeight: 900,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              background: 'linear-gradient(135deg, #3DD9B3, #25D366)',
              color: '#051A14',
              border: 'none',
              borderRadius: 16,
              boxShadow: '0 8px 30px rgba(61, 217, 179, 0.45)',
              cursor: 'pointer',
              width: '100%'
            }}
          >
            <span style={{ fontSize: 24 }}>🚀</span>
            <span>CADASTRAR E SALVAR NO MEU WHATSAPP</span>
          </button>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setStep(2)}
            disabled={batchLoading}
            style={{ width: '100%', margin: 0, padding: '10px', fontSize: 12, color: 'var(--ink3)' }}
          >
            ← Voltar e Editar Detalhes
          </button>
        </div>
      )}


      {/* ========================================================= */}
      {/* 🎉 ETAPA 4: TELA COMEMORATIVA (PRONTO!) */}
      {/* ========================================================= */}
      {step === 4 && batchResult && (
        <div style={{
          padding: '24px 20px',
          background: 'linear-gradient(135deg, rgba(61, 217, 179, 0.15), rgba(37, 211, 102, 0.1))',
          border: '1.5px solid var(--teal)',
          borderRadius: 20,
          boxShadow: '0 10px 36px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 18
        }}>
          <div>
            <div style={{ fontSize: 50, marginBottom: 8 }}>🎉</div>
            <h2 style={{ fontSize: 19, fontWeight: 900, color: 'var(--teal)', margin: '0 0 6px 0' }}>
              Parabéns! Cadastro Concluído!
            </h2>
            <div style={{ fontSize: 13, color: '#fff' }}>
              <strong>{batchResult.successCount} novos membros</strong> foram cadastrados na sua rede com sucesso!
            </div>
            {batchResult.duplicateCount > 0 && (
              <div style={{ fontSize: 11.5, color: 'var(--warn)', marginTop: 4 }}>
                ({batchResult.duplicateCount} números já estavam cadastrados no sistema).
              </div>
            )}
          </div>

          {/* Passos do que fazer agora */}
          <div style={{
            width: '100%',
            background: '#05070d',
            borderRadius: 14,
            padding: '14px 16px',
            border: '1px solid var(--line)',
            textAlign: 'left',
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--gold)', marginBottom: 2 }}>
              📲 O QUE FAZER NO SEU CELULAR AGORA:
            </div>

            <div style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--ink1)', lineHeight: 1.45 }}>
              <span style={{ fontWeight: 900, color: 'var(--teal)' }}>1.</span>
              <span>Abra o arquivo <strong>contatos baixado</strong> para salvar todos na sua agenda.</span>
            </div>

            <div style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--ink1)', lineHeight: 1.45 }}>
              <span style={{ fontWeight: 900, color: 'var(--teal)' }}>2.</span>
              <span>No WhatsApp, crie uma <strong>Lista de Transmissão</strong> e busque por <strong>"{batchResult.listTag}"</strong>.</span>
            </div>

            <div style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--ink1)', lineHeight: 1.45 }}>
              <span style={{ fontWeight: 900, color: 'var(--teal)' }}>3.</span>
              <span>A mensagem de boas-vindas já foi copiada! Basta <strong>colar e enviar</strong> para todos.</span>
            </div>
          </div>

          {/* Mensagem de Boas-Vindas */}
          <div style={{ width: '100%', background: 'var(--panel2)', borderRadius: 12, padding: '12px 14px', textAlign: 'left', border: '1px solid var(--line)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--gold)', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>MENSAGEM DE BOAS-VINDAS:</span>
              {copiedMessage && <span style={{ color: 'var(--teal)', fontSize: 10 }}>✓ Copiado!</span>}
            </div>
            <pre style={{ margin: 0, fontSize: 11.5, color: 'var(--ink1)', whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.45 }}>
              {BROADCAST_WELCOME_MESSAGE}
            </pre>
          </div>

          {/* Botões Finais */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
            <button
              type="button"
              className="btn btn-teal"
              onClick={handleManualDownloadContacts}
              style={{
                width: '100%',
                margin: 0,
                padding: '16px',
                fontSize: 15,
                fontWeight: 900,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                background: 'linear-gradient(135deg, #3DD9B3, #25D366)',
                color: '#051A14',
                borderRadius: 14,
                boxShadow: '0 6px 22px rgba(61, 217, 179, 0.4)'
              }}
            >
              <span style={{ fontSize: 22 }}>📲</span>
              <span>SALVAR CONTATOS NO MEU CELULAR</span>
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleCopyBroadcastMessage}
              style={{
                width: '100%',
                margin: 0,
                padding: '12px',
                fontSize: 13,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                border: '1px solid var(--teal)',
                color: 'var(--teal)'
              }}
            >
              <span>{copiedMessage ? '✅ Mensagem Copiada!' : '📋 Copiar Mensagem de Boas-Vindas'}</span>
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={resetFlow}
              style={{ width: '100%', margin: 0, padding: '11px', fontSize: 12.5, fontWeight: 700, color: 'var(--ink2)' }}
            >
              ✨ Cadastrar Outra Folha de Presença
            </button>
          </div>
        </div>
      )}


      {/* --- OVERLAY DE LEITURA DA IA --- */}
      {scanning && (
        <div className="modal-bg" style={{ zIndex: 10000, backgroundColor: 'rgba(5, 7, 11, 0.92)' }}>
          <div className="modal" style={{ textAlign: 'center', maxWidth: 360, padding: '28px 22px' }}>
            <div style={{ fontSize: 44, marginBottom: 14, animation: 'pulse 1.5s infinite' }}>🤖</div>
            <h3 style={{ fontSize: 17, color: 'var(--teal)', fontWeight: 900, margin: '0 0 8px 0' }}>
              Analisando Folha de Presença
            </h3>
            <p style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5, margin: 0 }}>
              {scanProgress || 'Aguarde um momento enquanto a IA transcreve os contatos da foto...'}
            </p>
          </div>
        </div>
      )}

      {/* --- OVERLAY DE PROGRESSO DO CADASTRO EM LOTE --- */}
      {batchLoading && (
        <div className="modal-bg" style={{ zIndex: 10001, backgroundColor: 'rgba(5, 7, 11, 0.94)' }}>
          <div className="modal" style={{ textAlign: 'center', maxWidth: 360, padding: '28px 22px' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>⚡</div>
            <h3 style={{ fontSize: 17, color: 'var(--teal)', fontWeight: 900, margin: '0 0 8px 0' }}>
              Cadastrando Membros na Rede
            </h3>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 6 }}>
              {batchProgress.current} de {batchProgress.total}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginBottom: 18 }}>
              Processando: <strong>{batchProgress.currentName}</strong>
            </div>
            <div style={{ width: '100%', height: 8, background: 'var(--line)', borderRadius: 4, overflow: 'hidden' }}>
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

      {/* --- MODAL PARA CONFIGURAR CHAVE DA IA (SE NECESSÁRIO) --- */}
      {apiKeyModalOpen && (
        <div className="modal-bg" style={{ zIndex: 10005 }}>
          <div className="modal" style={{ maxWidth: 400, padding: 22, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🔑</div>
            <h3 style={{ fontSize: 16, color: '#fff', fontWeight: 800, marginBottom: 8 }}>Chave Google Gemini</h3>
            <p style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.4, marginBottom: 14 }}>
              Informe a chave da API do Google AI Studio para ativar o reconhecimento de imagem.
            </p>
            <input
              type="text"
              placeholder="Cole sua chave AIzaSy..."
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              style={{ width: '100%', marginBottom: 14, fontSize: 12.5 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" style={{ flex: 1, margin: 0 }} onClick={() => setApiKeyModalOpen(false)}>
                Cancelar
              </button>
              <button className="btn btn-teal" style={{ flex: 1.5, margin: 0 }} onClick={saveApiKeyAndProceed}>
                Salvar Chave
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
