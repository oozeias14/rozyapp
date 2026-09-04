import React, { useState, useEffect } from 'react';
import { 
  getEvolutionConfig, 
  loadEvolutionConfig,
  saveEvolutionConfig,
  fetchInstanceStatus, 
  createOrConnectInstance,
  resetAndRecreateInstance,
  getPairingCode, 
  disconnectInstance, 
  sendWhatsAppMessage, 
  checkWhatsAppNumbers,
  fetchWhatsAppContacts,
  generateTransmissionBatches,
  DEFAULT_INSTANCE_NAME 
} from '../lib/evolutionApi';
import { supabase } from '../lib/supabase';

function initials(name) {
  return (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

export function EvolutionBotTab({ users, reload }) {
  const [config, setConfig] = useState(getEvolutionConfig());
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectTab, setConnectTab] = useState('qr'); // 'qr' | 'pairing'
  const [pairingPhone, setPairingPhone] = useState('');
  const [pairingCodeResult, setPairingCodeResult] = useState(null);
  const [generatingPairing, setGeneratingPairing] = useState(false);
  const [resettingInstance, setResettingInstance] = useState(false);
  const [status, setStatus] = useState({ connected: false, state: 'checking' });
  const [qrCodeData, setQrCodeData] = useState(null);
  const [loading, setLoading] = useState(false);
  const batchSize = 100;
  const [batchPage, setBatchPage] = useState(1);
  const BATCH_PAGE_SIZE = 5;

  // Estado de contatos que têm o número adicionado (sincronizados da API ou confirmados)
  const [savedPhones, setSavedPhones] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('wa_saved_phones') || '[]');
    } catch {
      return [];
    }
  });
  const [syncingContacts, setSyncingContacts] = useState(false);
  const [resettingAnalysis, setResettingAnalysis] = useState(false);
  const [contactFilterModal, setContactFilterModal] = useState(null); // 'with_number' | 'without_number' | null
  const [showGoogleSyncModal, setShowGoogleSyncModal] = useState(false);
  const [showLegacyBatches, setShowLegacyBatches] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [modalPage, setModalPage] = useState(1);

  function getPhoneSignatures(p) {
    let clean = (p || '').replace(/\D/g, '');
    if (!clean) return [];
    if (clean.startsWith('0')) clean = clean.substring(1);
    if (clean.startsWith('55') && clean.length >= 12) clean = clean.substring(2);
    if (clean.length === 11) {
      const ddd = clean.substring(0, 2);
      const rest = clean.substring(3);
      const digit9 = clean.substring(2, 3);
      return [
        '55' + clean,
        clean,
        '55' + ddd + rest,
        ddd + rest,
        clean.slice(-8),
        ddd + clean.slice(-8)
      ];
    } else if (clean.length === 10) {
      const ddd = clean.substring(0, 2);
      const rest = clean.substring(2);
      return [
        '55' + clean,
        clean,
        '55' + ddd + '9' + rest,
        ddd + '9' + rest,
        clean.slice(-8),
        ddd + clean.slice(-8)
      ];
    }
    return [clean, '55' + clean, clean.slice(-8)];
  }

  // Set reativo para checagem O(1) ultra-rápida de contatos
  // Combina telefones salvos localmente com o status salvo no banco Supabase
  const savedPhonesSet = new Set();
  savedPhones.forEach((p) => {
    getPhoneSignatures(p).forEach((sig) => savedPhonesSet.add(sig));
  });

  // Também adiciona ao set os telefones dos usuários que já estão marcados no banco de dados Supabase
  users.forEach((u) => {
    if (u.vcf_exported) {
      const raw = u.whatsapp || u.phone;
      if (raw) {
        getPhoneSignatures(raw).forEach((sig) => savedPhonesSet.add(sig));
      }
    }
  });

  function isUserInSaved(u) {
    if (u.vcf_exported) return true;
    const raw = u.whatsapp || u.phone;
    if (!raw) return false;
    const sigs = getPhoneSignatures(raw);
    return sigs.some((sig) => savedPhonesSet.has(sig));
  }

  function normalizePhone(p) {
    let clean = (p || '').replace(/\D/g, '');
    if (!clean) return '';
    if (clean.length === 10 || clean.length === 11) clean = '55' + clean;
    return clean;
  }

  // Filtragem de membros válidos
  const validUsers = users.filter((u) => u.role !== 'admin' && u.role !== 'admin2');
  const withNumberUsers = validUsers.filter((u) => isUserInSaved(u));
  const withoutNumberUsers = validUsers.filter((u) => !isUserInSaved(u));
  const coveragePercent = validUsers.length > 0 
    ? ((withNumberUsers.length / validUsers.length) * 100).toFixed(1) 
    : '0.0';

  // Gera os lotes de transmissão (T1, T2, T3... padrão fixo 100 por lote para compatibilidade com celular)
  const batches = generateTransmissionBatches(users, batchSize);
  const totalBatchPages = Math.ceil(batches.length / BATCH_PAGE_SIZE) || 1;
  const pagedBatches = batches.slice((batchPage - 1) * BATCH_PAGE_SIZE, batchPage * BATCH_PAGE_SIZE);

  // Carrega e sincroniza configuração do Supabase ao abrir
  useEffect(() => {
    async function init() {
      const syncedConfig = await loadEvolutionConfig();
      setConfig(syncedConfig);
      if (!syncedConfig.serverUrl || !syncedConfig.apiKey) {
        setShowConfigModal(true);
      }
      await checkStatus(syncedConfig);
    }
    init();
  }, []);

  // Polling automático enquanto o modal de conexão estiver aberto
  useEffect(() => {
    if (!showConnectModal) return;
    const interval = setInterval(async () => {
      const res = await fetchInstanceStatus();
      if (res?.connected) {
        setStatus(res);
        setShowConnectModal(false);
        setQrCodeData(null);
        setPairingCodeResult(null);
        alert('🎉 WhatsApp conectado com sucesso!');
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [showConnectModal]);

  async function checkStatus(cfg = config) {
    if (!cfg.serverUrl || !cfg.apiKey) {
      setStatus({ connected: false, state: 'unconfigured' });
      return;
    }
    setLoading(true);
    const res = await fetchInstanceStatus();
    setStatus(res);
    setLoading(false);
  }

  async function handleSaveConfig(e) {
    e.preventDefault();
    setLoading(true);
    await saveEvolutionConfig(config);
    setShowConfigModal(false);
    await checkStatus(config);
    setLoading(false);
  }

  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState(null);

  async function handleOpenConnectModal() {
    setShowConnectModal(true);
    await handleFetchQrCode();
  }

  async function handleFetchQrCode(forceRestart = false) {
    setQrLoading(true);
    setQrError(null);
    setQrCodeData(null);
    try {
      if (forceRestart) {
        await resetAndRecreateInstance();
      }
      const res = await createOrConnectInstance();
      const b64 = res?.qrcode?.base64 || res?.base64 || res?.qrcode;
      if (typeof b64 === 'string' && b64.length > 50) {
        setQrCodeData(b64);
      } else if (res?.instance?.state === 'open' || res?.state === 'open') {
        setStatus({ connected: true, state: 'open' });
        setShowConnectModal(false);
        alert('🎉 WhatsApp já está conectado!');
      } else if (res?.pairingCode || res?.code) {
        setPairingCodeResult(res.pairingCode || res.code);
        setConnectTab('pairing');
      } else {
        // Se a instância estiver no limite de tentativas de QR, tenta restart
        const retryRes = await resetAndRecreateInstance();
        const retryB64 = retryRes?.qrcode?.base64 || retryRes?.base64;
        if (retryB64 && typeof retryB64 === 'string') {
          setQrCodeData(retryB64);
        } else {
          setQrError('O WhatsApp atingiu o limite de tentativas de QR Code. Use a aba "Código (8 Dígitos)" para conectar!');
        }
      }
    } catch (err) {
      setQrError(err.message || 'Erro ao carregar QR Code');
    } finally {
      setQrLoading(false);
    }
  }

  async function handleGeneratePairingCode(e) {
    if (e) e.preventDefault();
    const clean = (pairingPhone || '').replace(/\D/g, '');
    if (clean.length < 10) {
      alert('Por favor, informe o DDD + Número do WhatsApp (ex: 61999999999)');
      return;
    }
    setGeneratingPairing(true);
    setPairingCodeResult(null);
    try {
      const res = await getPairingCode(clean);
      const code = res?.code || res?.pairingCode || res?.pairing_code || res?.instance?.pairingCode;
      if (code) {
        setPairingCodeResult(code);
      } else if (res?.qrcode?.base64 || res?.base64) {
        setQrCodeData(res.qrcode?.base64 || res.base64);
        alert('Código de pareamento não retornado diretamente. O QR Code foi gerado como alternativa.');
      } else {
        alert('Resposta da API: ' + JSON.stringify(res));
      }
    } catch (err) {
      alert('Erro ao gerar código de pareamento: ' + err.message);
    } finally {
      setGeneratingPairing(false);
    }
  }

  async function handleResetAndReconnect() {
    if (!window.confirm('Isso vai reiniciar a sessão no Railway para limpar travamentos anteriores. Deseja continuar?')) return;
    setResettingInstance(true);
    setQrCodeData(null);
    setPairingCodeResult(null);
    try {
      const res = await resetAndRecreateInstance();
      alert('Sessão reiniciada com sucesso! Gerando novas credenciais...');
      if (res?.qrcode?.base64) {
        setQrCodeData(res.qrcode.base64);
      } else if (res?.base64) {
        setQrCodeData(res.base64);
      } else if (connectTab === 'qr') {
        await handleFetchQrCode();
      } else if (pairingPhone) {
        await handleGeneratePairingCode();
      }
    } catch (err) {
      alert('Erro ao reiniciar sessão: ' + err.message);
      await handleFetchQrCode();
    } finally {
      setResettingInstance(false);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm('Deseja realmente desconectar o WhatsApp do robô?')) return;
    setLoading(true);
    try {
      await disconnectInstance();
      alert('WhatsApp desconectado!');
      setQrCodeData(null);
      setPairingCodeResult(null);
      await checkStatus();
    } catch (err) {
      alert('Erro ao desconectar: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  // Sincronizar contatos salvos da instância conectada
  async function handleSyncWhatsAppContacts() {
    if (!status.connected) {
      alert('O WhatsApp precisa estar conectado pelo QR Code antes de sincronizar contatos!');
      return;
    }
    setSyncingContacts(true);
    try {
      const contacts = await fetchWhatsAppContacts();
      const currentSavedSet = new Set();

      contacts.forEach((c) => {
        const rawJid = c.remoteJid || c.jid || (c.id && c.id.includes('@') ? c.id : '') || c.number || '';
        const phone = rawJid.split('@')[0].replace(/\D/g, '');
        if (phone && phone.length >= 10 && phone.length <= 13) {
          getPhoneSignatures(phone).forEach((sig) => {
            currentSavedSet.add(sig);
          });
        }
      });

      // Identifica membros correspondentes nos cadastros
      const matchedUserIds = [];
      const unmatchedUserIds = [];

      validUsers.forEach((u) => {
        const sigs = getPhoneSignatures(u.whatsapp || u.phone);
        const isMatch = sigs.some((s) => currentSavedSet.has(s));
        if (isMatch) {
          matchedUserIds.push(u.id);
        } else {
          unmatchedUserIds.push(u.id);
        }
      });

      // Atualiza estado e cache local
      const updatedArr = Array.from(currentSavedSet);
      setSavedPhones(updatedArr);
      localStorage.setItem('wa_saved_phones', JSON.stringify(updatedArr));

      // Sincroniza status no Supabase em lotes para persistir no banco central (sincronia Celular e Computador)
      const CHUNK_SIZE = 100;
      if (matchedUserIds.length > 0) {
        for (let i = 0; i < matchedUserIds.length; i += CHUNK_SIZE) {
          const chunk = matchedUserIds.slice(i, i + CHUNK_SIZE);
          await supabase.from('profiles').update({ vcf_exported: true }).in('id', chunk);
        }
      }
      if (unmatchedUserIds.length > 0) {
        for (let i = 0; i < unmatchedUserIds.length; i += CHUNK_SIZE) {
          const chunk = unmatchedUserIds.slice(i, i + CHUNK_SIZE);
          await supabase.from('profiles').update({ vcf_exported: false }).in('id', chunk);
        }
      }

      // Recarrega todos os dados no app
      if (reload) {
        await reload();
      }

      alert(`✅ Sincronização concluída com sucesso!\n\n📱 Contatos identificados no WhatsApp: ${contacts.length}\n🟢 Membros dos seus cadastros com número salvo: ${matchedUserIds.length} de ${validUsers.length}\n\n☁️ Os dados foram salvos na nuvem e sincronizados no Computador e no Celular!`);
    } catch (err) {
      alert('Erro ao sincronizar contatos do WhatsApp: ' + err.message);
    } finally {
      setSyncingContacts(false);
    }
  }

  // Limpar e Resetar todos os dados analisados
  async function handleResetAnalyzedData() {
    const confirmMsg = `⚠️ Deseja realmente limpar e resetar todos os dados analisados?\n\nIsso vai:\n• Zerar os contatos salvos da análise\n• Marcar todos os ${validUsers.length} membros como Pendentes\n• Permitir testar novamente com outro WhatsApp do zero.\n\nDeseja continuar?`;
    if (!window.confirm(confirmMsg)) return;

    setResettingAnalysis(true);
    try {
      // 1. Limpa cache local
      localStorage.removeItem('wa_saved_phones');
      setSavedPhones([]);

      // 2. Reseta status de todos os perfis no Supabase em lotes
      const allIds = validUsers.map((u) => u.id);
      const CHUNK_SIZE = 100;
      for (let i = 0; i < allIds.length; i += CHUNK_SIZE) {
        const chunk = allIds.slice(i, i + CHUNK_SIZE);
        await supabase.from('profiles').update({ vcf_exported: false }).in('id', chunk);
      }

      // 3. Recarrega dados no app
      if (reload) {
        await reload();
      }

      alert('✅ Análise limpa com sucesso!\n\nTodos os membros voltaram para a lista de Pendentes (0 salvos). Agora você pode conectar outro número ou refazer os testes.');
    } catch (err) {
      alert('Erro ao resetar análise: ' + err.message);
    } finally {
      setResettingAnalysis(false);
    }
  }

  // Alternar manualmente se o usuário tem ou não o número
  async function toggleUserSavedStatus(user) {
    const p = normalizePhone(user.whatsapp || user.phone);
    const currentlySaved = isUserInSaved(user);
    const newStatus = !currentlySaved;

    let next;
    if (newStatus && p) {
      next = [...savedPhones.filter((item) => item !== p), p];
    } else {
      next = savedPhones.filter((item) => item !== p);
    }
    setSavedPhones(next);
    localStorage.setItem('wa_saved_phones', JSON.stringify(next));

    try {
      await supabase.from('profiles').update({ vcf_exported: newStatus }).eq('id', user.id);
      if (reload) await reload();
    } catch (err) {
      console.warn('Erro ao atualizar contato no Supabase:', err);
    }
  }

  // Filtragem e Paginação do Modal de Contatos
  const activeModalUsers = contactFilterModal === 'with_number' ? withNumberUsers : withoutNumberUsers;
  const filteredModalUsers = activeModalUsers.filter((u) => {
    const q = modalSearch.toLowerCase();
    return (
      (u.name || '').toLowerCase().includes(q) ||
      (u.whatsapp || u.phone || '').includes(q) ||
      (u.city || '').toLowerCase().includes(q)
    );
  });
  const MODAL_PAGE_SIZE = 10;
  const totalModalPages = Math.ceil(filteredModalUsers.length / MODAL_PAGE_SIZE) || 1;
  const paginatedModalUsers = filteredModalUsers.slice((modalPage - 1) * MODAL_PAGE_SIZE, modalPage * MODAL_PAGE_SIZE);

  // Exportar vCard filtrado do modal (Com ou Sem Número)
  function handleExportModalUsers() {
    if (filteredModalUsers.length === 0) return;
    try {
      const isWith = contactFilterModal === 'with_number';
      const title = isWith ? 'com_numero_adicionado' : 'sem_numero_adicionado';
      const prefix = isWith ? 'CONFIRMADO' : 'PENDENTE';
      const cards = filteredModalUsers.map((u) => {
        const cleanName = (u.name || 'Sem Nome').trim();
        const fullName = `${prefix} ${cleanName}`;
        let intlTel = normalizePhone(u.phone || u.whatsapp);
        if (intlTel && !intlTel.startsWith('+')) intlTel = '+' + intlTel;
        return [
          'BEGIN:VCARD',
          'VERSION:3.0',
          `N:;${fullName};;;`,
          `FN:${fullName}`,
          ...(intlTel ? [`TEL;TYPE=CELL;TYPE=PREF:${intlTel}`, `TEL;TYPE=CELL,VOICE:${intlTel}`] : []),
          'END:VCARD'
        ].join('\r\n');
      });

      const vcfContent = cards.join('\r\n');
      const blob = new Blob([vcfContent], { type: 'text/vcard;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `contatos_${title}_${Date.now()}.vcf`);
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 200);
    } catch (err) {
      alert('Erro ao exportar lista: ' + err.message);
    }
  }

  // Exportar formato oficial CSV para Google Contatos (sem limites de importação)
  function handleExportGoogleContactsCsv() {
    try {
      const headers = [
        'Name',
        'Given Name',
        'Family Name',
        'Group Membership',
        'Phone 1 - Type',
        'Phone 1 - Value',
        'Address 1 - City',
        'Notes'
      ];

      const rows = validUsers.map((u, i) => {
        const batchNum = Math.floor(i / 100) + 1;
        const batchPrefix = `T${batchNum}`;
        const cleanName = (u.name || 'Sem Nome').trim();
        const fullName = `${batchPrefix} ${cleanName}`;
        let phone = normalizePhone(u.whatsapp || u.phone);
        if (phone && !phone.startsWith('+')) phone = '+' + phone;
        const group = `* myContacts ::: Candido lista ${batchPrefix}`;
        const city = (u.city || '').replace(/,/g, ' ');
        const notes = `Cadastrado Amigos Dr. Cândido (ID #${u.id})`;

        return [
          `"${fullName.replace(/"/g, '""')}"`,
          `"${cleanName.replace(/"/g, '""')}"`,
          `""`,
          `"${group.replace(/"/g, '""')}"`,
          `"Mobile"`,
          `"${phone}"`,
          `"${city.replace(/"/g, '""')}"`,
          `"${notes.replace(/"/g, '""')}"`
        ].join(',');
      });

      const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `google_contatos_dr_candido_todos_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 200);
    } catch (err) {
      alert('Erro ao exportar CSV do Google Contatos: ' + err.message);
    }
  }

  // Exportar vCard da Lista T1, T2, etc. com prefixo no nome
  function handleExportBatchVcf(batch) {
    try {
      const cards = batch.users.map((u) => {
        const cleanName = (u.name || 'Sem Nome').trim();
        const fullName = `${batch.id} ${cleanName}`;
        const tel = (u.phone || u.whatsapp || '').replace(/\D/g, '');
        let intlTel = tel;
        if (!intlTel.startsWith('55') && (intlTel.length === 10 || intlTel.length === 11)) {
          intlTel = '55' + intlTel;
        }
        if (intlTel && !intlTel.startsWith('+')) {
          intlTel = '+' + intlTel;
        }
        return [
          'BEGIN:VCARD',
          'VERSION:3.0',
          `N:;${fullName};;;`,
          `FN:${fullName}`,
          ...(intlTel ? [`TEL;TYPE=CELL;TYPE=PREF:${intlTel}`, `TEL;TYPE=CELL,VOICE:${intlTel}`] : []),
          'END:VCARD'
        ].join('\r\n');
      });

      const vcfContent = cards.join('\r\n');
      const blob = new Blob([vcfContent], { type: 'text/vcard;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${batch.name.toLowerCase().replace(/\s+/g, '_')}.vcf`);
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 200);
    } catch (err) {
      alert('Erro ao exportar lote: ' + err.message);
    }
  }

  // Exportar todos os lotes combinados (T1, T2, T3...) em formato vCard (.vcf) compatível com iOS e Android
  async function handleExportAllBatches() {
    try {
      const allCards = [];
      batches.forEach((b) => {
        b.users.forEach((u) => {
          const cleanName = (u.name || 'Sem Nome').trim();
          const fullName = `${b.id} ${cleanName}`;
          const tel = (u.phone || u.whatsapp || '').replace(/\D/g, '');
          let intlTel = tel;
          if (!intlTel.startsWith('55') && (intlTel.length === 10 || intlTel.length === 11)) {
            intlTel = '55' + intlTel;
          }
          if (intlTel && !intlTel.startsWith('+')) {
            intlTel = '+' + intlTel;
          }
          allCards.push([
            'BEGIN:VCARD',
            'VERSION:3.0',
            `N:;${fullName};;;`,
            `FN:${fullName}`,
            ...(intlTel ? [`TEL;TYPE=CELL;TYPE=PREF:${intlTel}`, `TEL;TYPE=CELL,VOICE:${intlTel}`] : []),
            'END:VCARD'
          ].join('\r\n'));
        });
      });

      const vcfContent = allCards.join('\r\n');
      const fileName = `contatos_todos_lotes_${Date.now()}.vcf`;
      const blob = new Blob([vcfContent], { type: 'text/vcard;charset=utf-8;' });

      // Tenta Web Share API nativa no celular (iOS / Android abre app de Contatos direto)
      try {
        const file = new File([blob], fileName, { type: 'text/vcard' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Contatos Transmissão Dr. Cândido',
            text: 'Salvar todos os contatos na agenda do celular'
          });
          return;
        }
      } catch (shareErr) {
        if (shareErr.name === 'AbortError') return;
        console.log('Web share ignorado ou não suportado, usando download padrão:', shareErr);
      }

      // Fallback padrão: Download do arquivo .vcf
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 200);
    } catch (err) {
      alert('Erro ao exportar todos os lotes: ' + err.message);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header do Robô */}
      <div style={{ background: 'linear-gradient(135deg, rgba(61, 217, 179, 0.15), rgba(15, 23, 42, 0.8))', padding: '16px 18px', borderRadius: 16, border: '1px solid rgba(61, 217, 179, 0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 32 }}>🤖</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>Robô de Transmissão (Evolution API)</div>
              <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2 }}>
                Conectado ao Railway para automação de listas T1, T2 e verificação de contatos
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button 
              type="button" 
              className="btn btn-ghost" 
              style={{ fontSize: 12, padding: '6px 12px', margin: 0 }}
              onClick={() => setShowConfigModal(true)}
            >
              ⚙️ Configurar API
            </button>

            <button 
              type="button" 
              className="btn" 
              style={{ 
                fontSize: 12, 
                padding: '6px 12px', 
                margin: 0,
                background: status.connected ? 'rgba(37, 211, 102, 0.2)' : 'rgba(240, 107, 76, 0.2)',
                color: status.connected ? '#25D366' : '#FF8A65',
                border: '1px solid ' + (status.connected ? '#25D366' : '#F06B4C')
              }}
              onClick={checkStatus}
            >
              {loading ? '⏳ Checando...' : status.connected ? '🟢 Conectado' : '🔴 Desconectado'}
            </button>
          </div>
        </div>

        {/* Informações de Conexão */}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--ink2)' }}>
            Instância: <strong style={{ color: 'var(--teal)' }}>{config.instanceName}</strong> · 
            Servidor: <strong style={{ color: '#fff' }}>{config.serverUrl || 'Não configurado'}</strong>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {!status.connected ? (
              <button 
                type="button" 
                className="btn btn-teal" 
                style={{ fontSize: 12, padding: '7px 14px', margin: 0 }}
                onClick={handleOpenConnectModal}
                disabled={loading || !config.serverUrl}
              >
                📲 Conectar WhatsApp (QR Code ou Código)
              </button>
            ) : (
              <button 
                type="button" 
                className="btn btn-ghost" 
                style={{ fontSize: 12, padding: '7px 14px', margin: 0, color: '#FF8A65', borderColor: 'rgba(240, 107, 76, 0.4)' }}
                onClick={handleDisconnect}
                disabled={loading}
              >
                🔌 Desconectar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal Completo de Conexão WhatsApp (QR Code + Código de Pareamento de 8 Dígitos) */}
      {showConnectModal && (
        <div className="modal-bg" style={{ zIndex: 12000 }}>
          <div className="modal" style={{ maxWidth: 420, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 16, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>📱</span> Conectar WhatsApp Oficial
              </h3>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => { setShowConnectModal(false); setQrCodeData(null); setPairingCodeResult(null); }}
                style={{ width: 28, height: 28, borderRadius: 8, padding: 0, margin: 0, border: '1px solid var(--line)', color: 'var(--ink2)', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Abas de Método de Conexão */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, background: 'rgba(255,255,255,0.04)', padding: 4, borderRadius: 10 }}>
              <button
                type="button"
                className="btn"
                style={{
                  margin: 0,
                  padding: '7px 10px',
                  fontSize: 12,
                  fontWeight: 800,
                  borderRadius: 8,
                  background: connectTab === 'qr' ? 'var(--teal)' : 'transparent',
                  color: connectTab === 'qr' ? '#081018' : 'var(--ink2)',
                  border: 'none',
                  boxShadow: connectTab === 'qr' ? '0 2px 8px rgba(0,229,155,0.2)' : 'none'
                }}
                onClick={() => { setConnectTab('qr'); if (!qrCodeData) handleFetchQrCode(); }}
              >
                📷 QR Code
              </button>

              <button
                type="button"
                className="btn"
                style={{
                  margin: 0,
                  padding: '7px 10px',
                  fontSize: 12,
                  fontWeight: 800,
                  borderRadius: 8,
                  background: connectTab === 'pairing' ? 'var(--teal)' : 'transparent',
                  color: connectTab === 'pairing' ? '#081018' : 'var(--ink2)',
                  border: 'none',
                  boxShadow: connectTab === 'pairing' ? '0 2px 8px rgba(0,229,155,0.2)' : 'none'
                }}
                onClick={() => setConnectTab('pairing')}
              >
                🔢 Código (8 Dígitos)
              </button>
            </div>

            {/* ABA 1: QR CODE */}
            {connectTab === 'qr' && (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <p style={{ fontSize: 12, color: 'var(--ink2)', margin: 0, lineHeight: 1.4 }}>
                  No WhatsApp do Dr. Cândido: <strong>Aparelhos Conectados</strong> ➔ <strong>Conectar Aparelho</strong> e aponte para o QR Code:
                </p>

                {qrLoading ? (
                  <div style={{ width: 210, height: 210, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px dashed var(--teal)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--teal)', fontSize: 12 }}>
                    <div style={{ fontSize: 24 }}>⏳</div>
                    <div>Gerando QR Code...</div>
                  </div>
                ) : qrCodeData ? (
                  <div style={{ background: '#fff', padding: 10, borderRadius: 12, display: 'inline-block', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
                    <img 
                      src={qrCodeData.startsWith('data:') ? qrCodeData : `data:image/png;base64,${qrCodeData}`} 
                      alt="QR Code WhatsApp" 
                      style={{ width: 210, height: 210, display: 'block' }} 
                    />
                  </div>
                ) : (
                  <div style={{ width: 210, height: 210, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px dashed var(--line)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', fontSize: 12, padding: 12, textAlign: 'center' }}>
                    {qrError ? (
                      <div style={{ color: '#FF8A65', fontSize: 11.5, lineHeight: 1.4 }}>
                        ⚠️ {qrError}
                      </div>
                    ) : (
                      <div>Clique abaixo para gerar o QR Code</div>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                  <button 
                    type="button" 
                    className="btn btn-ghost" 
                    style={{ flex: 1, fontSize: 12, padding: '8px', margin: 0 }}
                    onClick={() => handleFetchQrCode(true)}
                    disabled={qrLoading}
                  >
                    {qrLoading ? '⏳ Atualizando...' : '🔄 Atualizar QR Code'}
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-teal" 
                    style={{ flex: 1, fontSize: 12, padding: '8px', margin: 0 }}
                    onClick={checkStatus}
                  >
                    ✅ Já Escaneei
                  </button>
                </div>
              </div>
            )}

            {/* ABA 2: CÓDIGO DE PAREAMENTO DE 8 DÍGITOS (SEM CÂMERA) */}
            {connectTab === 'pairing' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ fontSize: 12, color: 'var(--ink2)', margin: 0, lineHeight: 1.5 }}>
                  Conecte <strong>sem usar a câmera</strong>. Digite o número do WhatsApp do Dr. Cândido com DDD para receber o código de 8 dígitos:
                </p>

                <form onSubmit={handleGeneratePairingCode} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>
                      Número do WhatsApp (com DDD)
                    </label>
                    <input 
                      type="text"
                      placeholder="Ex: 61999998888 ou 6188889999"
                      value={pairingPhone}
                      onChange={(e) => setPairingPhone(e.target.value)}
                      style={{ marginTop: 4, width: '100%', fontSize: 14, fontWeight: 700, letterSpacing: '0.5px' }}
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn btn-teal"
                    style={{ width: '100%', padding: '9px', fontSize: 12.5, fontWeight: 800, margin: 0 }}
                    disabled={generatingPairing}
                  >
                    {generatingPairing ? '⏳ Gerando Código...' : '🔑 Gerar Código de Pareamento'}
                  </button>
                </form>

                {pairingCodeResult && (
                  <div style={{ 
                    background: 'linear-gradient(135deg, rgba(0, 229, 155, 0.15), rgba(15, 23, 42, 0.8))', 
                    border: '1px solid var(--teal)', 
                    borderRadius: 12, 
                    padding: 14, 
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 800, textTransform: 'uppercase' }}>
                      Seu Código de Pareamento
                    </div>
                    <div style={{ 
                      fontSize: 26, 
                      fontWeight: 900, 
                      letterSpacing: '4px', 
                      color: '#fff',
                      background: 'rgba(0,0,0,0.3)',
                      padding: '8px 12px',
                      borderRadius: 8
                    }}>
                      {pairingCodeResult}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink2)', lineHeight: 1.4 }}>
                      1. No WhatsApp do celular, toque em <strong>Aparelhos Conectados</strong> ➔ <strong>Conectar Aparelho</strong>.<br />
                      2. Toque no link inferior <strong style={{ color: '#fff' }}>"Conectar com número de telefone"</strong> e digite o código acima!
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Opção de Reset de Emergência para Sessões Travadas */}
            <div style={{ marginTop: 6, paddingTop: 10, borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                className="btn"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#FF8A65',
                  fontSize: 11.5,
                  padding: 0,
                  margin: 0,
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
                onClick={handleResetAndReconnect}
                disabled={resettingInstance}
              >
                {resettingInstance ? '⏳ Reiniciando...' : '⚠️ Deu erro ao conectar? Clique para Limpar Sessão'}
              </button>

              <button
                type="button"
                className="btn btn-ghost"
                style={{ width: 'auto', padding: '5px 14px', fontSize: 12, margin: 0 }}
                onClick={() => { setShowConnectModal(false); setQrCodeData(null); setPairingCodeResult(null); }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Configuração Railway */}
      {showConfigModal && (
        <div className="modal-bg" style={{ zIndex: 12000 }}>
          <div className="modal" style={{ maxWidth: 440, padding: 24 }}>
            <h3 style={{ fontSize: 16, color: '#fff', marginBottom: 6 }}>⚙️ Configuração da Evolution API (Railway)</h3>
            <p style={{ fontSize: 12, color: 'var(--ink2)', marginBottom: 16 }}>
              Insira a URL gerada no seu Railway.app e a Chave de Autenticação (API Key):
            </p>

            <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>
                  URL do Servidor Railway
                </label>
                <input 
                  type="text"
                  placeholder="https://sua-evolution-api.up.railway.app"
                  value={config.serverUrl}
                  onChange={(e) => setConfig({ ...config, serverUrl: e.target.value })}
                  required
                  style={{ marginTop: 4, width: '100%' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>
                  Chave Global da API (AUTHENTICATION_API_KEY)
                </label>
                <input 
                  type="text"
                  placeholder="Sua chave secreta configurada no Railway"
                  value={config.apiKey}
                  onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                  required
                  style={{ marginTop: 4, width: '100%' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>
                  Nome da Instância
                </label>
                <input 
                  type="text"
                  placeholder="dr_candido"
                  value={config.instanceName}
                  onChange={(e) => setConfig({ ...config, instanceName: e.target.value })}
                  style={{ marginTop: 4, width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="submit" className="btn btn-teal" style={{ flex: 1, margin: 0 }}>
                  💾 Salvar Configurações
                </button>
                <button type="button" className="btn btn-ghost" style={{ flex: 1, margin: 0 }} onClick={() => setShowConfigModal(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Lista Filtrada (Com Número / Sem Número) */}
      {contactFilterModal && (
        <div className="modal-bg" style={{ zIndex: 12000 }}>
          <div className="modal" style={{ maxWidth: 480, maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: 22 }}>
            {/* Cabeçalho do Modal */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: contactFilterModal === 'with_number' ? 'rgba(37, 211, 102, 0.15)' : 'rgba(240, 107, 76, 0.15)',
                  border: '1px solid ' + (contactFilterModal === 'with_number' ? 'rgba(37, 211, 102, 0.4)' : 'rgba(240, 107, 76, 0.4)'),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  flexShrink: 0
                }}>
                  {contactFilterModal === 'with_number' ? '🟢' : '🔴'}
                </div>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 900, color: '#fff', margin: 0, lineHeight: 1.2 }}>
                    {contactFilterModal === 'with_number' ? 'Usuários com Número Adicionado' : 'Usuários SEM Número Adicionado'}
                  </h3>
                  <div style={{ fontSize: 11.5, color: 'var(--ink2)', marginTop: 3 }}>
                    Total: <strong>{activeModalUsers.length}</strong> contatos neste grupo
                  </div>
                </div>
              </div>

              <button 
                type="button" 
                onClick={() => setContactFilterModal(null)}
                style={{
                  width: 32,
                  height: 32,
                  minWidth: 32,
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: 'var(--ink2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: 13,
                  padding: 0,
                  margin: 0,
                  transition: 'all 0.2s'
                }}
                title="Fechar"
              >
                ✕
              </button>
            </div>

            {/* Barra de Busca */}
            <div style={{ position: 'relative', width: '100%', marginBottom: 10 }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, opacity: 0.5, pointerEvents: 'none' }}>🔍</span>
              <input
                type="text"
                placeholder="Buscar por nome, telefone ou cidade..."
                value={modalSearch}
                onChange={(e) => { setModalSearch(e.target.value); setModalPage(1); }}
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 34px',
                  fontSize: 12.5,
                  borderRadius: 10,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--line)',
                  color: '#fff',
                  margin: 0,
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Sub-header de contagem e botão de exportar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
              <span style={{ fontSize: 11.5, color: 'var(--ink2)' }}>
                Exibindo <strong>{filteredModalUsers.length}</strong> resultado(s)
              </span>
              <button
                type="button"
                className="btn btn-teal"
                style={{
                  width: 'auto',
                  padding: '6px 12px',
                  fontSize: 11.5,
                  fontWeight: 700,
                  margin: 0,
                  borderRadius: 8,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5
                }}
                onClick={handleExportModalUsers}
                title="Baixar lista filtrada em arquivo .vcf"
              >
                📥 Baixar Lista (.vcf)
              </button>
            </div>

            {/* Lista de Contatos com Rolagem */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 2, minHeight: 180, maxHeight: '46vh' }}>
              {paginatedModalUsers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--ink3)', fontSize: 12.5 }}>
                  Nenhum usuário encontrado.
                </div>
              ) : (
                paginatedModalUsers.map((u) => {
                  const phone = u.whatsapp || u.phone || '';
                  const norm = normalizePhone(phone);
                  const isSaved = isUserInSaved(u);
                  return (
                    <div 
                      key={u.id}
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: 10,
                        padding: '10px 12px',
                        border: '1px solid ' + (isSaved ? 'rgba(37,211,102,0.2)' : 'rgba(240,107,76,0.2)'),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                        <div className="av" style={{ width: 34, height: 34, fontSize: 12, flexShrink: 0 }}>
                          {u.photo_url ? <img src={u.photo_url} alt="" /> : initials(u.name)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {u.name || 'Sem Nome'}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span>📱 {phone || 'Sem telefone'}</span>
                            {u.city && <span>• 📍 {u.city}</span>}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {phone && (
                          <a 
                            href={`https://wa.me/${norm}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{
                              padding: '5px 9px',
                              fontSize: 11,
                              fontWeight: 600,
                              margin: 0,
                              textDecoration: 'none',
                              color: '#25D366',
                              background: 'rgba(37,211,102,0.1)',
                              border: '1px solid rgba(37,211,102,0.3)',
                              borderRadius: 8,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                            title="Conversar no WhatsApp"
                          >
                            💬 Conversar
                          </a>
                        )}
                        <button
                          type="button"
                          style={{
                            padding: '5px 9px',
                            fontSize: 11,
                            fontWeight: 600,
                            margin: 0,
                            cursor: 'pointer',
                            borderRadius: 8,
                            background: isSaved ? 'rgba(240,107,76,0.12)' : 'rgba(37,211,102,0.12)',
                            color: isSaved ? '#FF8A65' : '#25D366',
                            border: '1px solid ' + (isSaved ? 'rgba(240,107,76,0.3)' : 'rgba(37,211,102,0.3)')
                          }}
                          onClick={() => toggleUserSavedStatus(u)}
                          title={isSaved ? 'Remover dos confirmados' : 'Marcar como número adicionado'}
                        >
                          {isSaved ? 'Remover' : 'Confirmar'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Paginação do Modal */}
            {totalModalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
                <button 
                  className="btn" 
                  style={{ 
                    width: 'auto',
                    margin: 0,
                    padding: '5px 12px', 
                    fontSize: 12, 
                    borderRadius: 8, 
                    background: 'rgba(255, 255, 255, 0.04)', 
                    color: modalPage === 1 ? 'var(--ink3)' : '#fff',
                    border: '1px solid ' + (modalPage === 1 ? 'rgba(255, 255, 255, 0.05)' : 'var(--line)'),
                    cursor: modalPage === 1 ? 'not-allowed' : 'pointer'
                  }}
                  disabled={modalPage === 1}
                  onClick={() => setModalPage(p => Math.max(p - 1, 1))}
                >
                  ←
                </button>
                <span style={{ fontSize: 11.5, color: 'var(--ink2)', fontWeight: 600 }}>
                  Página {modalPage} de {totalModalPages}
                </span>
                <button 
                  className="btn" 
                  style={{ 
                    width: 'auto',
                    margin: 0,
                    padding: '5px 12px', 
                    fontSize: 12, 
                    borderRadius: 8, 
                    background: 'rgba(255, 255, 255, 0.04)', 
                    color: modalPage === totalModalPages ? 'var(--ink3)' : '#fff',
                    border: '1px solid ' + (modalPage === totalModalPages ? 'rgba(255, 255, 255, 0.05)' : 'var(--line)'),
                    cursor: modalPage === totalModalPages ? 'not-allowed' : 'pointer'
                  }}
                  disabled={modalPage === totalModalPages}
                  onClick={() => setModalPage(p => Math.min(p + 1, totalModalPages))}
                >
                  →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Google Contatos (Android & iPhone) */}
      {showGoogleSyncModal && (
        <div className="modal-bg" style={{ zIndex: 12000 }}>
          <div className="modal" style={{ maxWidth: 520, maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: 'rgba(66, 133, 244, 0.15)',
                  border: '1px solid rgba(66, 133, 244, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  flexShrink: 0
                }}>
                  ☁️
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 900, color: '#fff', margin: 0, lineHeight: 1.2 }}>
                    Sincronização Google Contatos (iPhone & Android)
                  </h3>
                  <div style={{ fontSize: 11.5, color: 'var(--ink2)', marginTop: 3 }}>
                    Importe todos os {validUsers.length} contatos de uma vez na nuvem
                  </div>
                </div>
              </div>

              <button 
                type="button" 
                onClick={() => setShowGoogleSyncModal(false)}
                style={{
                  width: 32,
                  height: 32,
                  minWidth: 32,
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: 'var(--ink2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: 13,
                  padding: 0,
                  margin: 0
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, paddingRight: 2 }}>
              <p style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.5, margin: 0 }}>
                Escolha a forma mais fácil para adicionar todos os <strong>{validUsers.length} contatos</strong> no celular do Dr. Cândido:
              </p>

              {/* OPÇÃO 1: DIRETO NO CELULAR (IPHONE / ANDROID COM 1 TOQUE) */}
              <div style={{ 
                background: 'linear-gradient(135deg, rgba(0, 229, 155, 0.12), rgba(15, 23, 42, 0.6))', 
                padding: '16px', 
                borderRadius: 14, 
                border: '1px solid rgba(0, 229, 155, 0.35)', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: 10 
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>📲</span> Opção 1: Salvar Direto no Celular (Recomendado)
                  </div>
                  <span style={{ fontSize: 10, background: 'var(--teal)', color: '#081018', padding: '2px 8px', borderRadius: 20, fontWeight: 900 }}>
                    1 TOQUE
                  </span>
                </div>

                <div style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.5 }}>
                  Gera o arquivo oficial de agenda (.vcf). Ao clicar abaixo no seu celular, ele abre <strong>direto o app de Contatos do iPhone ou Android</strong> perguntando se deseja salvar todos os contatos.
                </div>

                <button
                  type="button"
                  className="btn btn-teal"
                  style={{ width: '100%', padding: '11px 16px', fontSize: 13, fontWeight: 900, margin: 0, borderRadius: 10, boxShadow: '0 4px 14px rgba(0, 229, 155, 0.25)' }}
                  onClick={handleExportAllBatches}
                >
                  📥 Salvar Todos no Celular (.vcf - 1 Toque)
                </button>
              </div>

              {/* OPÇÃO 2: GOOGLE CONTATOS (NUVEM) */}
              <div style={{ 
                background: 'rgba(255, 255, 255, 0.03)', 
                padding: '16px', 
                borderRadius: 14, 
                border: '1px solid rgba(255, 255, 255, 0.08)', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: 10 
              }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>☁️</span> Opção 2: Importar pela Nuvem Google (contacts.google.com)
                </div>

                <div style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.5 }}>
                  <strong style={{ color: '#FF8A65' }}>Atenção:</strong> Arquivos <strong style={{ color: '#fff' }}>.csv</strong> só funcionam quando importados <strong>dentro do site do Google Contatos</strong> no computador ou navegador. O celular não abre arquivos .csv diretamente.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginTop: 2 }}>
                  <button
                    type="button"
                    className="btn"
                    style={{
                      padding: '9px 12px',
                      fontSize: 12,
                      fontWeight: 800,
                      margin: 0,
                      borderRadius: 10,
                      background: 'rgba(255,255,255,0.06)',
                      color: '#fff',
                      border: '1px solid var(--line)'
                    }}
                    onClick={handleExportGoogleContactsCsv}
                  >
                    📥 Baixar Planilha (.csv)
                  </button>

                  <a
                    href="https://contacts.google.com/?hl=pt-BR"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn"
                    style={{
                      padding: '9px 12px',
                      fontSize: 12,
                      fontWeight: 800,
                      margin: 0,
                      borderRadius: 10,
                      textDecoration: 'none',
                      background: '#4285F4',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    🌐 Abrir Google Contatos ➔
                  </a>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)', textAlign: 'right' }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ width: 'auto', padding: '7px 18px', fontSize: 12, margin: 0, borderRadius: 8 }}
                onClick={() => setShowGoogleSyncModal(false)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard Moderno de Estatísticas da Transmissão */}
      <div style={{
        background: 'linear-gradient(180deg, var(--panel2) 0%, rgba(15, 23, 42, 0.95) 100%)',
        padding: '20px 22px',
        borderRadius: 20,
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.24)',
        display: 'flex',
        flexDirection: 'column',
        gap: 16
      }}>
        {/* Cabeçalho com Título e Ações Rápidas */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(0, 229, 155, 0.2), rgba(123, 108, 244, 0.2))',
              border: '1px solid rgba(0, 229, 155, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              flexShrink: 0
            }}>
              📊
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', letterSpacing: '-0.2px' }}>
                Painel de Alcance da Transmissão
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2 }}>
                Monitore os contatos aptos a receber mensagens oficiais no WhatsApp do Dr. Cândido
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-teal"
              style={{
                fontSize: 12.5,
                fontWeight: 800,
                padding: '9px 16px',
                margin: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                borderRadius: 10,
                boxShadow: '0 4px 14px rgba(0, 229, 155, 0.25)'
              }}
              onClick={() => setShowGoogleSyncModal(true)}
            >
              <span>☁️</span> Sincronizar Google / iPhone
            </button>

            <button
              type="button"
              className="btn"
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                padding: '9px 16px',
                margin: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                borderRadius: 10,
                background: 'rgba(255, 255, 255, 0.05)',
                color: '#fff',
                border: '1px solid var(--line)',
                cursor: (syncingContacts || !status.connected) ? 'not-allowed' : 'pointer',
                opacity: (syncingContacts || !status.connected) ? 0.5 : 1
              }}
              onClick={handleSyncWhatsAppContacts}
              disabled={syncingContacts || !status.connected}
              title={!status.connected ? 'Conecte o WhatsApp pelo QR Code acima primeiro' : 'Verificar contatos sincronizados no WhatsApp'}
            >
              <span>🔄</span> {syncingContacts ? 'Verificando...' : 'Checar no WhatsApp'}
            </button>

            <button
              type="button"
              className="btn"
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                padding: '9px 14px',
                margin: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                borderRadius: 10,
                background: 'rgba(240, 107, 76, 0.1)',
                color: '#FF8A65',
                border: '1px solid rgba(240, 107, 76, 0.3)',
                cursor: resettingAnalysis ? 'not-allowed' : 'pointer',
                opacity: resettingAnalysis ? 0.6 : 1,
                transition: 'all 0.2s ease'
              }}
              onClick={handleResetAnalyzedData}
              disabled={resettingAnalysis || syncingContacts}
              title="Limpar todos os dados analisados e resetar contatos para Pendentes"
            >
              <span>🧹</span> {resettingAnalysis ? 'Limpando...' : 'Limpar Análise'}
            </button>
          </div>
        </div>

        {/* Grid de Métricas Principais */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          {/* Card: Total */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            padding: '14px 16px',
            borderRadius: 14,
            border: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Total Membros
              </span>
              <span style={{ fontSize: 13 }}>👥</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#fff', marginTop: 6 }}>
              {validUsers.length.toLocaleString('pt-BR')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>
              Base ativa cadastrada
            </div>
          </div>

          {/* Card: Salvos */}
          <div 
            style={{
              background: 'linear-gradient(145deg, rgba(37, 211, 102, 0.1), rgba(37, 211, 102, 0.03))',
              padding: '14px 16px',
              borderRadius: 14,
              border: '1px solid rgba(37, 211, 102, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'transform 0.15s ease, border-color 0.15s ease'
            }}
            onClick={() => { setContactFilterModal('with_number'); setModalSearch(''); setModalPage(1); }}
            title="Clique para ver a lista de contatos confirmados"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: '#25D366', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Salvos na Agenda
              </span>
              <span style={{ fontSize: 10, background: 'rgba(37, 211, 102, 0.2)', color: '#25D366', padding: '2px 6px', borderRadius: 6, fontWeight: 800 }}>
                Prontos
              </span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#25D366', marginTop: 6 }}>
              {withNumberUsers.length.toLocaleString('pt-BR')}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(37, 211, 102, 0.8)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>✓</span> Aptos para transmissão
            </div>
          </div>

          {/* Card: Pendentes */}
          <div 
            style={{
              background: 'linear-gradient(145deg, rgba(240, 107, 76, 0.1), rgba(240, 107, 76, 0.03))',
              padding: '14px 16px',
              borderRadius: 14,
              border: '1px solid rgba(240, 107, 76, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'transform 0.15s ease, border-color 0.15s ease'
            }}
            onClick={() => { setContactFilterModal('without_number'); setModalSearch(''); setModalPage(1); }}
            title="Clique para ver a lista de contatos pendentes"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: '#FF8A65', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Pendentes
              </span>
              <span style={{ fontSize: 10, background: 'rgba(240, 107, 76, 0.2)', color: '#FF8A65', padding: '2px 6px', borderRadius: 6, fontWeight: 800 }}>
                Aguardando
              </span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#FF8A65', marginTop: 6 }}>
              {withoutNumberUsers.length.toLocaleString('pt-BR')}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(240, 107, 76, 0.8)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>⏱</span> Sem o número salvo
            </div>
          </div>

          {/* Card: Cobertura com Barra de Progresso */}
          <div style={{
            background: 'rgba(123, 108, 244, 0.06)',
            padding: '14px 16px',
            borderRadius: 14,
            border: '1px solid rgba(123, 108, 244, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Taxa de Alcance
              </span>
              <span style={{ fontSize: 13 }}>📈</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--teal)', marginTop: 6 }}>
              {coveragePercent}%
            </div>
            <div style={{ marginTop: 6, width: '100%', height: 5, background: 'rgba(255, 255, 255, 0.08)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(parseFloat(coveragePercent) || 0, 100)}%`, height: '100%', background: 'linear-gradient(90deg, #25D366, var(--teal))', borderRadius: 3, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        </div>

        {/* Cartões Interativos de Ação e Filtragem */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {/* Ação 1: Contatos Confirmados */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(37, 211, 102, 0.12) 0%, rgba(15, 23, 42, 0.6) 100%)',
              border: '1px solid rgba(37, 211, 102, 0.35)',
              borderRadius: 14,
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 12,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 4px 16px rgba(37, 211, 102, 0.05)'
            }}
            onClick={() => { setContactFilterModal('with_number'); setModalSearch(''); setModalPage(1); }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 14,
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    background: 'rgba(37, 211, 102, 0.2)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#25D366'
                  }}>
                    ✓
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>
                    Contatos Prontos para Transmissão
                  </span>
                </div>
                <span style={{
                  fontSize: 12,
                  fontWeight: 900,
                  color: '#25D366',
                  background: 'rgba(37, 211, 102, 0.15)',
                  padding: '3px 9px',
                  borderRadius: 20,
                  border: '1px solid rgba(37, 211, 102, 0.3)'
                }}>
                  {withNumberUsers.length} contatos
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.5 }}>
                Membros com número do Dr. Cândido salvo na agenda. A entrega no WhatsApp é 100% garantida e segura.
              </div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              fontSize: 12.5,
              fontWeight: 800,
              color: '#25D366',
              gap: 6
            }}>
              <span>Visualizar Lista Completa</span>
              <span>→</span>
            </div>
          </div>

          {/* Ação 2: Contatos Pendentes */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(240, 107, 76, 0.12) 0%, rgba(15, 23, 42, 0.6) 100%)',
              border: '1px solid rgba(240, 107, 76, 0.35)',
              borderRadius: 14,
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 12,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 4px 16px rgba(240, 107, 76, 0.05)'
            }}
            onClick={() => { setContactFilterModal('without_number'); setModalSearch(''); setModalPage(1); }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 14,
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    background: 'rgba(240, 107, 76, 0.2)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#FF8A65'
                  }}>
                    ⏱
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>
                    Contatos Pendentes de Adição
                  </span>
                </div>
                <span style={{
                  fontSize: 12,
                  fontWeight: 900,
                  color: '#FF8A65',
                  background: 'rgba(240, 107, 76, 0.15)',
                  padding: '3px 9px',
                  borderRadius: 20,
                  border: '1px solid rgba(240, 107, 76, 0.3)'
                }}>
                  {withoutNumberUsers.length} contatos
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.5 }}>
                Membros que ainda não salvaram o contato. Sincronize a agenda Google para habilitá-los na transmissão.
              </div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              fontSize: 12.5,
              fontWeight: 800,
              color: '#FF8A65',
              gap: 6
            }}>
              <span>Visualizar Lista de Pendentes</span>
              <span>→</span>
            </div>
          </div>
        </div>
      </div>

      {/* Botão sutil para alternar opções manuais de lote vCard (oculto por padrão) */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6, marginBottom: 6 }}>
        <button
          type="button"
          className="btn"
          style={{
            background: 'transparent',
            border: '1px dashed var(--line)',
            color: 'var(--ink3)',
            fontSize: 12,
            padding: '7px 16px',
            borderRadius: 10,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6
          }}
          onClick={() => setShowLegacyBatches(!showLegacyBatches)}
        >
          {showLegacyBatches ? '▲ Ocultar Opções Manuais de Lotes vCard (.vcf)' : '⚙️ Exibir Lotes Manuais vCard (.vcf) [Opcional]'}
        </button>
      </div>

      {showLegacyBatches && (
        <>
          {/* Guia de Transmissão Oficial */}
          <div style={{ 
            background: 'linear-gradient(135deg, rgba(37, 211, 102, 0.08), rgba(15, 23, 42, 0.6))', 
            padding: '14px 16px', 
            borderRadius: 14, 
            border: '1px solid rgba(37, 211, 102, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>🛡️</span>
              <span style={{ fontWeight: 800, fontSize: 13, color: '#fff' }}>
                Guia da Lista de Transmissão Oficial (Risco ZERO de Bloqueio)
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.6 }}>
              1. Clique em <strong style={{ color: '#fff' }}>📥 Baixar vCard</strong> no lote desejado (ex: <em>Lote T1</em>) e importe no celular do Dr. Cândido.<br />
              2. No WhatsApp, vá em <strong style={{ color: '#fff' }}>Nova Transmissão</strong>, pesquise por <strong style={{ color: 'var(--teal)' }}>T1</strong> e selecione todos os contatos.<br />
              3. Envie sua mensagem: o próprio WhatsApp entrega <strong>apenas para quem tem o número do Dr. Cândido salvo na agenda</strong>, garantindo total segurança e entrega sem denúncias de spam.
            </div>
          </div>

          {/* Visualização dos Lotes T1, T2, T3... */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#fff' }}>
                  📋 Listas de Transmissão Oficiais ({batches.length} Lotes de 100 contatos)
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2 }}>
                  Total: {users.length} membros cadastrados · Padrão seguro para celular (100 por lote)
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button 
                  type="button"
                  className="btn btn-teal"
                  style={{ fontSize: 12, padding: '7px 14px', margin: 0 }}
                  onClick={handleExportAllBatches}
                  title="Baixar arquivo único .vcf com todos os contatos já prefixados (T1, T2, T3...)"
                >
                  📥 Baixar Todos (.vcf)
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              {pagedBatches.map((b) => (
                <div 
                  key={b.id}
                  style={{
                    background: 'var(--panel2)',
                    borderRadius: 14,
                    padding: '14px 16px',
                    border: '1px solid var(--line)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ 
                        fontSize: 12, 
                        fontWeight: 900, 
                        background: 'var(--teal-dim)', 
                        color: 'var(--teal)', 
                        padding: '2px 8px', 
                        borderRadius: 6,
                        border: '1px solid var(--teal)'
                      }}>
                        {b.id}
                      </span>
                      <span style={{ fontWeight: 800, fontSize: 14, color: '#fff' }}>
                        {b.name}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 700 }}>
                      👥 {b.count} contatos
                    </span>
                  </div>

                  <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                    Contatos do número #{b.startNumber} ao #{b.endNumber}
                  </div>

                  <div style={{ marginTop: 4 }}>
                    <button 
                      type="button"
                      className="btn btn-teal"
                      style={{ width: '100%', fontSize: 12, padding: '9px', margin: 0, borderRadius: 10 }}
                      onClick={() => handleExportBatchVcf(b)}
                      title="Baixar lista em arquivo .vcf para importar nos contatos do celular"
                    >
                      📥 Baixar vCard ({b.id})
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Paginação idêntica à aba Cadastros */}
            {totalBatchPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
                <button 
                  className="btn" 
                  style={{ 
                    width: 'auto',
                    flexShrink: 0,
                    margin: 0,
                    padding: '8px 16px', 
                    fontSize: 13, 
                    fontWeight: 600,
                    borderRadius: 10, 
                    background: 'rgba(255, 255, 255, 0.04)', 
                    color: batchPage === 1 ? 'var(--ink3)' : '#fff',
                    border: '1px solid ' + (batchPage === 1 ? 'rgba(255, 255, 255, 0.05)' : 'var(--line)'),
                    cursor: batchPage === 1 ? 'not-allowed' : 'pointer',
                    opacity: batchPage === 1 ? 0.4 : 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                  disabled={batchPage === 1}
                  onClick={() => setBatchPage(p => Math.max(p - 1, 1))}
                >
                  <span>←</span> Anterior
                </button>
                <span style={{ fontSize: 13, color: 'var(--ink2)', fontWeight: 600, whiteSpace: 'nowrap', minWidth: '100px', textAlign: 'center' }}>
                  Página {batchPage} de {totalBatchPages}
                </span>
                <button 
                  className="btn" 
                  style={{ 
                    width: 'auto',
                    flexShrink: 0,
                    margin: 0,
                    padding: '8px 16px', 
                    fontSize: 13, 
                    fontWeight: 600,
                    borderRadius: 10, 
                    background: 'rgba(255, 255, 255, 0.04)', 
                    color: batchPage === totalBatchPages ? 'var(--ink3)' : '#fff',
                    border: '1px solid ' + (batchPage === totalBatchPages ? 'rgba(255, 255, 255, 0.05)' : 'var(--line)'),
                    cursor: batchPage === totalBatchPages ? 'not-allowed' : 'pointer',
                    opacity: batchPage === totalBatchPages ? 0.4 : 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                  disabled={batchPage === totalBatchPages}
                  onClick={() => setBatchPage(p => Math.min(p + 1, totalBatchPages))}
                >
                  Próxima <span>→</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
