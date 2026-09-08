import React, { useState, useEffect, useRef } from 'react';
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
  fetchWhatsAppMessages,
  evaluateMessageDelivery,
  checkWhatsAppNumbers,
  fetchWhatsAppContacts,
  fetchWhatsAppChats,
  searchBroadcastLists,
  fetchAllWhatsAppTransmissionReceipts,
  auditBroadcastDeliveryReceipts,
  getContactDeliveryStatusDirect,
  scanAllChatsForPhrase,
  checkContactHasBroadcastPhrase,
  generateTransmissionBatches,
  getPhoneSignatures,
  extractCleanPhone,
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
  const [showLegacyBatches, setShowLegacyBatches] = useState(true); // Exibe ETAPA 1 (Lotes de Transmissão) por padrão
  const [modalSearch, setModalSearch] = useState('');
  const [modalPage, setModalPage] = useState(1);

  // Estados do Sistema de Verificação de Transmissão (1 Traço vs 2 Traços)
  const [showBroadcastTestModal, setShowBroadcastTestModal] = useState(false);
  const [testTargetType, setTestTargetType] = useState('custom'); // 'custom' | 'batch' | 'all_pending' | 'all'
  const [customSelectedUserIds, setCustomSelectedUserIds] = useState([]);
  const [customContactSearch, setCustomContactSearch] = useState('');
  const [selectedTestBatch, setSelectedTestBatch] = useState('T1');
  const [verificationMethod, setVerificationMethod] = useState('phrase_track'); // 'phrase_track' | 'auto_broadcast' | 'send_and_verify' | 'paste'
  const [broadcastPhraseText, setBroadcastPhraseText] = useState('teste 1234');
  const [phraseTimeHours, setPhraseTimeHours] = useState(12);
  const [detectedBroadcastLists, setDetectedBroadcastLists] = useState([]);
  const [selectedBroadcastJid, setSelectedBroadcastJid] = useState('');
  const [foundBroadcastMessage, setFoundBroadcastMessage] = useState(null);
  const [testResults, setTestResults] = useState([]); // array de { id, user, name, phone, city, checks: 1 | 2, status, label, isSaved }
  const [activeResultTab, setActiveResultTab] = useState('all'); // 'all' | 'saved' | 'not_saved'
  const [resultSearch, setResultSearch] = useState('');
  const [pastedMessageData, setPastedMessageData] = useState('');
  const [isApplyingResults, setIsApplyingResults] = useState(false);
  const [testMessageText, setTestMessageText] = useState(
    'Olá {primeiro_nome}, tudo bem? Aqui é da equipe oficial do Dr. Cândido Teles! 🤝\n\nEstamos confirmando nossa lista de transmissão no WhatsApp para envio de comunicados e novidades importantes.\n\nPor favor, salve nosso contato na sua agenda para não perder nada! Se você já salvou, responda com um "OK". 🙏'
  );
  const [isTestingRunning, setIsTestingRunning] = useState(false);
  const [isTestingPaused, setIsTestingPaused] = useState(false);
  const [testProgress, setTestProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });
  const [testLogs, setTestLogs] = useState([]);
  const testAbortRef = useRef(false);
  const testPauseRef = useRef(false);
  const logContainerRef = useRef(null);

  function addLog(msg, type = 'info') {
    const time = new Date().toLocaleTimeString('pt-BR');
    setTestLogs(prev => [...prev.slice(-150), { time, msg, type }]);
  }

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [testLogs]);

  function getPhoneSignatures(p) {
    let clean = extractCleanPhone(p);
    if (!clean) return [];
    if (clean.startsWith('0')) clean = clean.substring(1);
    if (clean.startsWith('55') && clean.length >= 12) clean = clean.substring(2);

    // Se o número estiver sem DDD (8 ou 9 dígitos), aplica o DDD padrão 61 (DF)
    if (clean.length === 8 || clean.length === 9) {
      clean = '61' + clean;
    }

    if (clean.length === 11) {
      const ddd = clean.substring(0, 2);
      const rest = clean.substring(3); // 8 dígitos finais
      return [
        '55' + clean,
        clean,
        '55' + ddd + rest,
        ddd + rest,
        '55' + ddd + '9' + rest,
        ddd + '9' + rest
      ];
    } else if (clean.length === 10) {
      const ddd = clean.substring(0, 2);
      const rest = clean.substring(2); // 8 dígitos finais
      return [
        '55' + clean,
        clean,
        '55' + ddd + '9' + rest,
        ddd + '9' + rest,
        '55' + ddd + rest,
        ddd + rest
      ];
    }
    return [clean, '55' + clean];
  }

  function extractPhoneFromContact(c) {
    if (!c) return '';
    if (c.isGroup) return '';
    let raw = '';
    if (typeof c === 'string') {
      raw = c;
    } else {
      raw = c.remoteJid || c.jid || c.number || c.phone || '';
      if (!raw && typeof c.id === 'string' && (c.id.includes('@') || /^\d{8,15}$/.test(c.id))) {
        raw = c.id;
      }
    }
    if (typeof raw !== 'string') raw = String(raw || '');
    if (raw.includes('@g.us') || raw.includes('broadcast')) return '';
    if (raw.includes('@')) raw = raw.split('@')[0];
    if (raw.includes(':')) raw = raw.split(':')[0];
    const digits = extractCleanPhone(raw);
    if (digits.length >= 8 && digits.length <= 15) {
      return digits;
    }
    return '';
  }

  // Set reativo para checagem O(1) ultra-rápida de contatos confirmados no WhatsApp
  const savedPhonesSet = new Set();
  savedPhones.forEach((p) => {
    getPhoneSignatures(p).forEach((sig) => savedPhonesSet.add(sig));
  });

  function isUserInSaved(u) {
    const raw = u.whatsapp || u.phone;
    if (!raw) return false;
    const sigs = getPhoneSignatures(raw);
    return sigs.some((sig) => savedPhonesSet.has(sig));
  }

  function normalizePhone(p) {
    let clean = extractCleanPhone(p);
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
      alert('O WhatsApp precisa estar conectado pelo QR Code antes de verificar!');
      return;
    }
    // Abre o Verificador Oficial de Transmissão para selecionar e auditar sem falsos positivos
    setShowBroadcastTestModal(true);
  }

  // Limpar e Resetar todos os dados analisados
  async function handleResetAnalyzedData() {
    const confirmMsg = `⚠️ Deseja realmente limpar e resetar todos os contatos analisados?\n\nIsso vai:\n• Zerar a lista de números salvos\n• Marcar todos os ${validUsers.length} membros como Pendentes no painel\n• Permitir recomeçar os testes e análises do zero.\n\nDeseja continuar?`;
    if (!window.confirm(confirmMsg)) return;

    setResettingAnalysis(true);
    try {
      localStorage.removeItem('wa_saved_phones');
      setSavedPhones([]);
      setTestResults([]);
      alert('✅ Análise limpa com sucesso!\n\nTodos os membros voltaram para a lista de Pendentes (0 salvos).');
    } catch (err) {
      alert('Erro ao resetar análise: ' + err.message);
    } finally {
      setResettingAnalysis(false);
    }
  }

  // Alternar manualmente se o usuário tem ou não o número
  function toggleUserSavedStatus(user) {
    const p = normalizePhone(user.whatsapp || user.phone);
    if (!p) return;
    const currentlySaved = isUserInSaved(user);
    const sigs = getPhoneSignatures(user.whatsapp || user.phone);

    let next;
    if (currentlySaved) {
      next = savedPhones.filter((item) => !sigs.includes(item));
    } else {
      next = [...savedPhones.filter((item) => !sigs.includes(item)), p];
    }
    setSavedPhones(next);
    localStorage.setItem('wa_saved_phones', JSON.stringify(next));
  }

  // ── SISTEMA DE VERIFICAÇÃO DE TRANSMISSÃO (1 TRAÇO VS 2 TRAÇOS) ──

  function getSelectedTargetUsers() {
    if (testTargetType === 'custom') {
      return validUsers.filter((u) => customSelectedUserIds.includes(u.id));
    } else if (testTargetType === 'batch') {
      const b = batches.find((item) => item.id === selectedTestBatch);
      return b ? b.users : [];
    } else if (testTargetType === 'all_pending') {
      return withoutNumberUsers;
    } else {
      return validUsers;
    }
  }

  // 📡 AÇÃO 0 (PRINCIPAL): Auditoria Completa de Todas as Transmissões do WhatsApp
  async function handleAutoAuditBroadcastLive() {
    if (!status.connected) {
      alert('Conecte o WhatsApp pelo QR Code ou Código antes de auditar!');
      return;
    }

    const targetUsers = getSelectedTargetUsers();
    if (targetUsers.length === 0) {
      if (testTargetType === 'custom') {
        alert('⚠️ Por favor, pesquise e marque pelo menos 1 contato na lista de contatos específicos para auditar!');
      } else {
        alert('Nenhum contato encontrado para o grupo selecionado!');
      }
      return;
    }

    setIsTestingRunning(true);
    setIsTestingPaused(false);
    testAbortRef.current = false;
    setTestLogs([]);
    setTestProgress({ current: 0, total: targetUsers.length, success: 0, failed: 0 });

    addLog(`📡 Iniciando auditoria completa de todas as transmissões e mensagens do WhatsApp conectado...`, 'info');

    try {
      addLog(`🔍 Varrendo recibos e histórico de conversas no WhatsApp conectado...`, 'info');
      const receiptsData = await fetchAllWhatsAppTransmissionReceipts(phraseTimeHours);

      addLog(`📥 ${receiptsData.totalMessagesAnalyzed} mensagens e conversas analisadas com sucesso.`, 'info');
      addLog(`📊 Auditando detalhadamente ${targetUsers.length} contatos selecionados...`, 'info');

      // Audita os usuários selecionados
      const auditResult = auditBroadcastDeliveryReceipts(receiptsData, targetUsers);
      
      let savedCount = 0;
      let notSavedCount = 0;
      const evaluated = [];

      for (let i = 0; i < auditResult.evaluatedUsers.length; i++) {
        if (testAbortRef.current) {
          addLog('⏹️ Auditoria interrompida pelo usuário.', 'delay');
          break;
        }

        let item = auditResult.evaluatedUsers[i];
        const u = targetUsers[i];

        // Se ainda não tiver 2 traços confirmados, consulta diretamente a conversa individual do contato para máxima precisão
        if (item.checks !== 2 && (u.whatsapp || u.phone)) {
          const directCheck = await getContactDeliveryStatusDirect(u.whatsapp || u.phone, phraseTimeHours);
          if (directCheck.has2Checks) {
            item = {
              ...item,
              checks: 2,
              status: directCheck.status || 'DELIVERY_ACK',
              label: directCheck.label || '✓✓ 2 Traços (Entregue no WhatsApp)',
              isSaved: true
            };
          }
        }

        if (item.checks === 2) {
          savedCount++;
          addLog(`✓✓ [${i + 1}/${targetUsers.length}] ${item.name} (${item.phone}): 2 TRAÇOS ➔ SALVO NA AGENDA!`, 'success');
        } else {
          notSavedCount++;
          addLog(`✓ [${i + 1}/${targetUsers.length}] ${item.name} (${item.phone}): 1 TRAÇO ➔ PENDENTE`, 'error');
        }

        evaluated.push(item);

        setTestProgress({
          current: i + 1,
          total: targetUsers.length,
          success: savedCount,
          failed: notSavedCount,
        });

        await new Promise(r => setTimeout(r, 40));
      }

      setTestResults(evaluated);
      addLog(`🏁 Auditoria finalizada! 2 Traços (Salvos): ${savedCount} | 1 Traço (Pendentes): ${notSavedCount}`, 'info');

      // Auto-atualização dos salvos encontrados na auditoria (2 traços confirmados)
      const confirmedSavedPhones = evaluated
        .filter((item) => item.checks === 2)
        .map((item) => normalizePhone(item.phone))
        .filter(Boolean);

      if (confirmedSavedPhones.length > 0) {
        setSavedPhones((prev) => {
          const next = Array.from(new Set([...prev, ...confirmedSavedPhones]));
          localStorage.setItem('wa_saved_phones', JSON.stringify(next));
          return next;
        });
      }

    } catch (err) {
      addLog(`❌ Erro durante a auditoria da transmissão: ${err.message}`, 'error');
      alert('Erro na auditoria: ' + err.message);
    } finally {
      setIsTestingRunning(false);
      setIsTestingPaused(false);
    }
  }

  // 📝 RASTREADOR DE CONVERSAS POR FRASE DA TRANSMISSÃO (Ideia Brilhante do Usuário)
  async function handleAuditByPhraseLive() {
    if (!status.connected) {
      alert('Conecte o WhatsApp pelo QR Code ou Código antes de rastrear!');
      return;
    }

    const cleanPhrase = (broadcastPhraseText || '').trim();
    if (!cleanPhrase) {
      alert('⚠️ Por favor, digite a palavra ou frase única que você enviou na Lista de Transmissão (ex: teste 1234)!');
      return;
    }

    const targetUsers = getSelectedTargetUsers();
    if (targetUsers.length === 0) {
      if (testTargetType === 'custom') {
        alert('⚠️ Por favor, pesquise e marque pelo menos 1 contato na lista de contatos específicos para rastrear!');
      } else {
        alert('Nenhum contato encontrado para o grupo selecionado!');
      }
      return;
    }

    setIsTestingRunning(true);
    setIsTestingPaused(false);
    testAbortRef.current = false;
    setTestLogs([]);
    setTestProgress({ current: 0, total: targetUsers.length, success: 0, failed: 0 });

    addLog(`📝 Iniciando rastreamento da frase "${cleanPhrase}" enviado nas últimas ${phraseTimeHours}h...`, 'info');

    try {
      addLog(`⚡ Escaneando mensagens enviadas nas últimas ${phraseTimeHours}h contendo "${cleanPhrase}"...`, 'info');
      const preScannedSigs = await scanAllChatsForPhrase(cleanPhrase, phraseTimeHours);

      addLog(`📊 Auditando ${targetUsers.length} contatos selecionados...`, 'info');

      let savedCount = 0;
      let notSavedCount = 0;
      const evaluated = [];

      for (let i = 0; i < targetUsers.length; i++) {
        if (testAbortRef.current) {
          addLog('⏹️ Rastreamento interrompido pelo usuário.', 'delay');
          break;
        }

        const u = targetUsers[i];
        const rawPhone = u.whatsapp || u.phone || '';
        const fullName = (u.name || 'Sem nome').trim();

        const phraseCheck = await checkContactHasBroadcastPhrase(rawPhone, cleanPhrase, preScannedSigs, phraseTimeHours);
        const is2Checks = phraseCheck.has2Checks;

        if (is2Checks) {
          savedCount++;
          addLog(`✓✓ [${i + 1}/${targetUsers.length}] ${fullName} (${rawPhone}): FRASE "${cleanPhrase}" ENCONTRADA NAS ÚLTIMAS ${phraseTimeHours}H ➔ SALVO! (2 Traços)`, 'success');
        } else {
          notSavedCount++;
          addLog(`✓ [${i + 1}/${targetUsers.length}] ${fullName} (${rawPhone}): FRASE NÃO ENCONTRADA NAS ÚLTIMAS ${phraseTimeHours}H ➔ PENDENTE (1 Traço)`, 'error');
        }

        evaluated.push({
          id: u.id,
          user: u,
          name: fullName,
          phone: rawPhone,
          city: u.city || '',
          checks: is2Checks ? 2 : 1,
          status: is2Checks ? 'DELIVERY_ACK' : 'SERVER_ACK',
          label: is2Checks ? `✓✓ 2 Traços (Frase "${cleanPhrase}" nas últimas ${phraseTimeHours}h)` : `✓ 1 Traço (Sem frase "${cleanPhrase}" nas últimas ${phraseTimeHours}h)`,
          isSaved: is2Checks,
        });

        setTestProgress({
          current: i + 1,
          total: targetUsers.length,
          success: savedCount,
          failed: notSavedCount,
        });

        await new Promise(r => setTimeout(r, 30));
      }

      setTestResults(evaluated);
      addLog(`🏁 Rastreamento por frase finalizado! Frase encontrada nas últimas ${phraseTimeHours}h (Salvos): ${savedCount} | Não encontrada (Pendentes): ${notSavedCount}`, 'info');

      // Auto-atualização dos salvos encontrados na auditoria (2 traços confirmados)
      const confirmedSavedPhones = evaluated
        .filter((item) => item.isSaved)
        .map((item) => normalizePhone(item.phone))
        .filter(Boolean);

      if (confirmedSavedPhones.length > 0) {
        setSavedPhones((prev) => {
          const next = Array.from(new Set([...prev, ...confirmedSavedPhones]));
          localStorage.setItem('wa_saved_phones', JSON.stringify(next));
          return next;
        });
      }

    } catch (err) {
      addLog(`❌ Erro no rastreamento por frase: ${err.message}`, 'error');
      alert('Erro no rastreamento: ' + err.message);
    } finally {
      setIsTestingRunning(false);
      setIsTestingPaused(false);
    }
  }

  // AÇÃO 1: Abre a lista para conferência rápida / colagem de dados de transmissão
  function handleOpenTransmissionChecklist() {
    const targetUsers = getSelectedTargetUsers();
    if (targetUsers.length === 0) {
      alert('Nenhum contato encontrado para o grupo selecionado!');
      return;
    }

    const text = (pastedMessageData || '').toLowerCase();
    const evaluated = [];

    targetUsers.forEach((u) => {
      const rawPhone = u.whatsapp || u.phone || '';
      const name = (u.name || '').toLowerCase().trim();
      const sigs = getPhoneSignatures(rawPhone);

      let isDelivered = false;
      if (text.trim()) {
        const matchByPhone = sigs.some((sig) => text.includes(sig));
        const matchByName = name.length >= 4 && text.includes(name);
        isDelivered = matchByPhone || matchByName;
      } else {
        isDelivered = isUserInSaved(u);
      }

      evaluated.push({
        id: u.id,
        user: u,
        name: u.name || 'Sem nome',
        phone: rawPhone,
        city: u.city || '',
        checks: isDelivered ? 2 : 1,
        status: isDelivered ? 'DELIVERY_ACK' : 'SERVER_ACK',
        label: isDelivered ? '2 Traços (Salvo na Agenda)' : '1 Traço (Pendente)',
        isSaved: isDelivered,
      });
    });

    setTestResults(evaluated);
  }

  // AÇÃO 2: Sincronizar e Cruzar com a Agenda do WhatsApp Conectado
  async function handleCheckBroadcastStatusLive() {
    if (!status.connected) {
      alert('Conecte o WhatsApp pelo QR Code ou Código antes de checar!');
      return;
    }

    const targetUsers = getSelectedTargetUsers();
    if (targetUsers.length === 0) {
      alert('Nenhum contato encontrado para o grupo selecionado!');
      return;
    }

    setIsTestingRunning(true);
    setIsTestingPaused(false);
    testAbortRef.current = false;
    setTestLogs([]);
    setTestProgress({ current: 0, total: targetUsers.length, success: 0, failed: 0 });

    addLog(`🔍 Consultando contatos salvos no WhatsApp conectado para ${targetUsers.length} membros...`, 'info');

    try {
      const contacts = await fetchWhatsAppContacts();
      const currentSavedSet = new Set();

      (contacts || []).forEach((c) => {
        const phone = extractPhoneFromContact(c);
        if (phone && phone.length >= 8 && phone.length <= 15) {
          getPhoneSignatures(phone).forEach((sig) => {
            currentSavedSet.add(sig);
          });
        }
      });

      addLog(`📥 ${(contacts || []).length} contatos encontrados na instância do WhatsApp.`, 'info');

      let savedCount = 0;
      let notSavedCount = 0;
      const evaluated = [];

      for (let i = 0; i < targetUsers.length; i++) {
        if (testAbortRef.current) {
          addLog('⏹️ Checagem interrompida pelo usuário.', 'delay');
          break;
        }

        const u = targetUsers[i];
        const rawPhone = u.whatsapp || u.phone || '';
        const fullName = (u.name || 'Sem nome').trim();
        const sigs = getPhoneSignatures(rawPhone);

        const hasMatch = sigs.some((s) => currentSavedSet.has(s));

        if (hasMatch) {
          savedCount++;
          addLog(`✅ [${i + 1}/${targetUsers.length}] ${fullName} (${rawPhone}): ENCONTRADO NO WHATSAPP ➔ SALVO!`, 'success');
        } else {
          notSavedCount++;
          addLog(`❌ [${i + 1}/${targetUsers.length}] ${fullName} (${rawPhone}): NÃO ENCONTRADO NO WHATSAPP ➔ PENDENTE`, 'error');
        }

        evaluated.push({
          id: u.id,
          user: u,
          name: fullName,
          phone: rawPhone,
          city: u.city || '',
          checks: hasMatch ? 2 : 1,
          status: hasMatch ? 'SAVED' : 'NOT_SAVED',
          label: hasMatch ? '✓✓ Salvo no WhatsApp' : '✓ Não Encontrado',
          isSaved: hasMatch,
        });

        setTestProgress({
          current: i + 1,
          total: targetUsers.length,
          success: savedCount,
          failed: notSavedCount
        });

        await new Promise((r) => setTimeout(r, 20));
      }

      setTestResults(evaluated);
      addLog(`🏁 Checagem finalizada! Salvos: ${savedCount} | Não Salvos: ${notSavedCount}`, 'info');

      // Auto-atualização dos salvos encontrados
      const confirmedSavedPhones = evaluated
        .filter((item) => item.checks === 2)
        .map((item) => normalizePhone(item.phone))
        .filter(Boolean);

      if (confirmedSavedPhones.length > 0) {
        setSavedPhones((prev) => {
          const next = Array.from(new Set([...prev, ...confirmedSavedPhones]));
          localStorage.setItem('wa_saved_phones', JSON.stringify(next));
          return next;
        });
      }
    } catch (err) {
      addLog(`❌ Erro ao checar status no WhatsApp: ${err.message}`, 'error');
      alert('Erro ao checar status: ' + err.message);
    } finally {
      setIsTestingRunning(false);
      setIsTestingPaused(false);
    }
  }

  // AÇÃO 3: Disparo de Mensagem com Monitoramento dos Traços
  async function handleSendAndVerifyBroadcast() {
    if (!status.connected) {
      alert('Conecte o WhatsApp pelo QR Code ou Código antes de disparar o teste!');
      return;
    }

    const targetUsers = getSelectedTargetUsers();
    if (targetUsers.length === 0) {
      alert('Nenhum contato encontrado para o grupo selecionado!');
      return;
    }

    const confirmText = `💬 Disparar mensagem de verificação na transmissão para ${targetUsers.length} contatos?\n\n• O robô enviará com delay humano anti-ban (3s a 6s).\n• O sistema registrará os envios em tempo real.\n\nDeseja continuar?`;
    if (!window.confirm(confirmText)) return;

    setIsTestingRunning(true);
    setIsTestingPaused(false);
    testAbortRef.current = false;
    testPauseRef.current = false;
    setTestLogs([]);
    setTestProgress({ current: 0, total: targetUsers.length, success: 0, failed: 0 });

    addLog(`🚀 Iniciando disparo de mensagens para ${targetUsers.length} contatos...`, 'info');

    let savedCount = 0;
    let notSavedCount = 0;
    const evaluated = [];

    for (let i = 0; i < targetUsers.length; i++) {
      if (testAbortRef.current) {
        addLog('⏹️ Disparo interrompido pelo usuário.', 'delay');
        break;
      }

      while (testPauseRef.current) {
        await new Promise((r) => setTimeout(r, 500));
        if (testAbortRef.current) break;
      }
      if (testAbortRef.current) break;

      const u = targetUsers[i];
      const rawPhone = u.whatsapp || u.phone || '';
      const cleanPhone = normalizePhone(rawPhone);
      const firstName = (u.name || '').trim().split(' ')[0] || 'Amigo(a)';
      const fullName = (u.name || 'Amigo(a)').trim();
      const city = u.city || 'DF';

      if (!cleanPhone || cleanPhone.length < 10) {
        notSavedCount++;
        addLog(`❌ [${i + 1}/${targetUsers.length}] ${fullName}: Número inválido (${rawPhone})`, 'error');
        evaluated.push({
          id: u.id,
          user: u,
          name: fullName,
          phone: rawPhone,
          city,
          checks: 1,
          status: 'INVALID',
          label: '1 Traço (Número Inválido)',
          isSaved: false,
        });
        setTestProgress((p) => ({ ...p, current: i + 1, failed: notSavedCount }));
        continue;
      }

      const msg = testMessageText
        .replace(/{primeiro_nome}/gi, firstName)
        .replace(/{nome}/gi, fullName)
        .replace(/{cidade}/gi, city);

      addLog(`📤 [${i + 1}/${targetUsers.length}] Enviando para ${fullName} (${rawPhone})...`, 'sending');

      try {
        await sendWhatsAppMessage(cleanPhone, msg);
        savedCount++;
        addLog(`✅ [${i + 1}/${targetUsers.length}] ${fullName}: Mensagem enviada com sucesso!`, 'success');

        evaluated.push({
          id: u.id,
          user: u,
          name: fullName,
          phone: rawPhone,
          city,
          checks: 2,
          status: 'SENT',
          label: '2 Traços (Enviado)',
          isSaved: true,
        });

        setTestProgress({
          current: i + 1,
          total: targetUsers.length,
          success: savedCount,
          failed: notSavedCount
        });
        setTestResults([...evaluated]);
      } catch (err) {
        notSavedCount++;
        addLog(`❌ [${i + 1}/${targetUsers.length}] ${fullName}: Falha no envio (${err.message})`, 'error');
        evaluated.push({
          id: u.id,
          user: u,
          name: fullName,
          phone: rawPhone,
          city,
          checks: 1,
          status: 'ERROR',
          label: '1 Traço (Erro no envio)',
          isSaved: false,
        });
        setTestProgress((p) => ({ ...p, current: i + 1, failed: notSavedCount }));
      }

      // Intervalo anti-ban entre disparos (3 a 6 segundos)
      if (i < targetUsers.length - 1 && !testAbortRef.current) {
        const delaySec = Math.floor(Math.random() * (6 - 3 + 1)) + 3;
        addLog(`⏳ Aguardando ${delaySec}s (intervalo anti-ban)...`, 'delay');
        await new Promise((r) => setTimeout(r, delaySec * 1000));
      }
    }

    setTestResults(evaluated);
    addLog(`🏁 Disparo concluído! Enviados: ${savedCount} | Falhas: ${notSavedCount}`, 'info');
    setIsTestingRunning(false);
    setIsTestingPaused(false);
  }

  // AÇÃO 4: Importação a partir de texto colado
  function handleImportFromPastedData() {
    if (!pastedMessageData.trim()) {
      alert('Por favor, cole os dados ou nomes/telefones da lista de quem recebeu a mensagem.');
      return;
    }
    handleOpenTransmissionChecklist();
    alert('🎉 Cruzamento dos dados colados realizado! Confira a lista abaixo.');
  }

  // Alternar manualmente o status de um contato na lista de resultados
  function toggleResultStatus(userId) {
    setTestResults((prev) =>
      prev.map((r) => {
        if (r.id !== userId) return r;
        const nextSaved = !r.isSaved;
        return {
          ...r,
          isSaved: nextSaved,
          checks: nextSaved ? 2 : 1,
          status: nextSaved ? 'DELIVERY_ACK' : 'SERVER_ACK',
          label: nextSaved ? '2 Traços (Salvo na Agenda)' : '1 Traço (Pendente)',
        };
      })
    );
  }

  // Marcar todos em lote como Salvos ou Pendentes
  function handleBulkMarkAll(markAsSaved) {
    setTestResults((prev) =>
      prev.map((r) => ({
        ...r,
        isSaved: markAsSaved,
        checks: markAsSaved ? 2 : 1,
        status: markAsSaved ? 'DELIVERY_ACK' : 'SERVER_ACK',
        label: markAsSaved ? '2 Traços (Salvo na Agenda)' : '1 Traço (Pendente)',
      }))
    );
  }

  // AÇÃO 5: Aplicar e Salvar Resultados no Painel
  async function handleApplyVerificationResults() {
    if (testResults.length === 0) {
      alert('Nenhum resultado de verificação para salvar!');
      return;
    }

    const savedList = testResults.filter((r) => r.isSaved);
    const notSavedList = testResults.filter((r) => !r.isSaved);

    const confirmMsg = `💾 Deseja atualizar o Painel de Alcance da Transmissão?\n\n` +
      `✅ ${savedList.length} contatos confirmados com 2 TRAÇOS (Salvos)\n` +
      `❌ ${notSavedList.length} contatos identificados com 1 TRAÇO (Não Salvos / Pendentes)\n\n` +
      `Deseja aplicar agora?`;

    if (!window.confirm(confirmMsg)) return;

    setIsApplyingResults(true);
    try {
      const newlySavedPhones = savedList.map((r) => normalizePhone(r.phone)).filter(Boolean);
      const notSavedSigs = notSavedList.flatMap((r) => getPhoneSignatures(r.phone));

      setSavedPhones((prev) => {
        const filtered = prev.filter((p) => !notSavedSigs.includes(p));
        const next = Array.from(new Set([...filtered, ...newlySavedPhones]));
        localStorage.setItem('wa_saved_phones', JSON.stringify(next));
        return next;
      });

      alert(`🎉 Painel Atualizado com Sucesso!\n\n✅ Salvos: ${savedList.length}\n❌ Pendentes: ${notSavedList.length}`);
      setShowBroadcastTestModal(false);
      setTestResults([]);
    } catch (err) {
      alert('Erro ao salvar resultados: ' + err.message);
    } finally {
      setIsApplyingResults(false);
    }
  }

  function handlePauseTest() {
    testPauseRef.current = !testPauseRef.current;
    setIsTestingPaused(testPauseRef.current);
    addLog(testPauseRef.current ? '⏸️ Verificação pausada pelo usuário.' : '▶️ Verificação retomada.', 'delay');
  }

  function handleStopTest() {
    if (window.confirm('Deseja realmente parar a verificação? Os contatos já verificados serão preservados.')) {
      testAbortRef.current = true;
      testPauseRef.current = false;
      setIsTestingPaused(false);
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

      {/* Modal do Verificador de Transmissão (1 Traço vs 2 Traços) */}
      {showBroadcastTestModal && (
        <div className="modal-bg" style={{ zIndex: 12000 }}>
          <div className="modal" style={{ maxWidth: 580, maxHeight: '92vh', display: 'flex', flexDirection: 'column', padding: 22, gap: 14 }}>
            {/* Header do Modal */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(0, 229, 155, 0.25), rgba(0, 180, 216, 0.25))',
                  border: '1px solid var(--teal)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  flexShrink: 0
                }}>
                  ✓✓
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 900, color: '#fff', margin: 0, lineHeight: 1.2 }}>
                    Verificador de Transmissão (1 vs 2 Traços)
                  </h3>
                  <div style={{ fontSize: 11.5, color: 'var(--ink2)', marginTop: 3 }}>
                    <span style={{ color: '#25D366', fontWeight: 800 }}>✓✓ 2 Traços</span> = Salvo na Agenda · <span style={{ color: '#FF8A65', fontWeight: 800 }}>✓ 1 Traço</span> = Não Salvo
                  </div>
                </div>
              </div>

              {!isTestingRunning && (
                <button 
                  type="button" 
                  onClick={() => setShowBroadcastTestModal(false)}
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
                  title="Fechar"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Conteúdo com Rolagem */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, paddingRight: 2 }}>
              
              {/* VISTA 1: EXIBIÇÃO DETALHADA DOS RESULTADOS (SIM vs NÃO) */}
              {testResults.length > 0 && !isTestingRunning ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Cards de Resumo */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{
                      background: 'linear-gradient(135deg, rgba(37, 211, 102, 0.15) 0%, rgba(15, 23, 42, 0.8) 100%)',
                      border: '1px solid rgba(37, 211, 102, 0.4)',
                      borderRadius: 12,
                      padding: '12px 14px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#25D366', textTransform: 'uppercase' }}>
                          ✅ Salvos (2 Traços)
                        </span>
                        <span style={{ fontSize: 11, background: 'rgba(37,211,102,0.2)', color: '#25D366', padding: '1px 7px', borderRadius: 10, fontWeight: 800 }}>
                          ✓✓
                        </span>
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 900, color: '#25D366', marginTop: 4 }}>
                        {testResults.filter((r) => r.isSaved).length}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink2)', marginTop: 2 }}>
                        Contatos com o número salvo na agenda
                      </div>
                    </div>

                    <div style={{
                      background: 'linear-gradient(135deg, rgba(240, 107, 76, 0.15) 0%, rgba(15, 23, 42, 0.8) 100%)',
                      border: '1px solid rgba(240, 107, 76, 0.4)',
                      borderRadius: 12,
                      padding: '12px 14px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#FF8A65', textTransform: 'uppercase' }}>
                          ❌ Não Salvos (1 Traço)
                        </span>
                        <span style={{ fontSize: 11, background: 'rgba(240,107,76,0.2)', color: '#FF8A65', padding: '1px 7px', borderRadius: 10, fontWeight: 800 }}>
                          ✓
                        </span>
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 900, color: '#FF8A65', marginTop: 4 }}>
                        {testResults.filter((r) => !r.isSaved).length}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink2)', marginTop: 2 }}>
                        Não receberam / apenas servidor
                      </div>
                    </div>
                  </div>

                  {/* Abas para Alternar Visualização: Salvos vs Não Salvos vs Todos */}
                  <div style={{ display: 'flex', gap: 6, background: 'rgba(0,0,0,0.3)', padding: 4, borderRadius: 10, border: '1px solid var(--line)' }}>
                    <button
                      type="button"
                      style={{
                        flex: 1,
                        padding: '7px 8px',
                        fontSize: 11.5,
                        fontWeight: 800,
                        borderRadius: 8,
                        background: activeResultTab === 'all' ? 'rgba(255,255,255,0.1)' : 'transparent',
                        color: activeResultTab === 'all' ? '#fff' : 'var(--ink3)',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                      onClick={() => setActiveResultTab('all')}
                    >
                      Todos ({testResults.length})
                    </button>

                    <button
                      type="button"
                      style={{
                        flex: 1,
                        padding: '7px 8px',
                        fontSize: 11.5,
                        fontWeight: 800,
                        borderRadius: 8,
                        background: activeResultTab === 'saved' ? 'rgba(37,211,102,0.2)' : 'transparent',
                        color: activeResultTab === 'saved' ? '#25D366' : 'var(--ink3)',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                      onClick={() => setActiveResultTab('saved')}
                    >
                      ✓✓ Salvos ({testResults.filter((r) => r.isSaved).length})
                    </button>

                    <button
                      type="button"
                      style={{
                        flex: 1,
                        padding: '7px 8px',
                        fontSize: 11.5,
                        fontWeight: 800,
                        borderRadius: 8,
                        background: activeResultTab === 'not_saved' ? 'rgba(240,107,76,0.2)' : 'transparent',
                        color: activeResultTab === 'not_saved' ? '#FF8A65' : 'var(--ink3)',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                      onClick={() => setActiveResultTab('not_saved')}
                    >
                      ✓ Não Salvos ({testResults.filter((r) => !r.isSaved).length})
                    </button>
                  </div>

                    {/* Ações de Marcação em Lote */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                      <button
                        type="button"
                        className="btn"
                        style={{
                          padding: '5px 10px',
                          fontSize: 11,
                          fontWeight: 700,
                          borderRadius: 6,
                          background: 'rgba(37, 211, 102, 0.15)',
                          color: '#25D366',
                          border: '1px solid rgba(37, 211, 102, 0.35)',
                          margin: 0,
                          cursor: 'pointer'
                        }}
                        onClick={() => handleBulkMarkAll(true)}
                      >
                        ✓✓ Marcar Todos como Salvos
                      </button>
                      <button
                        type="button"
                        className="btn"
                        style={{
                          padding: '5px 10px',
                          fontSize: 11,
                          fontWeight: 700,
                          borderRadius: 6,
                          background: 'rgba(240, 107, 76, 0.15)',
                          color: '#FF8A65',
                          border: '1px solid rgba(240, 107, 76, 0.35)',
                          margin: 0,
                          cursor: 'pointer'
                        }}
                        onClick={() => handleBulkMarkAll(false)}
                      >
                        ✕ Desmarcar Todos (Pendentes)
                      </button>
                    </div>

                    <input
                      type="text"
                      placeholder="🔍 Filtrar por nome, telefone ou cidade..."
                      value={resultSearch}
                      onChange={(e) => setResultSearch(e.target.value)}
                      style={{
                        padding: '7px 10px',
                        fontSize: 12,
                        borderRadius: 8,
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid var(--line)',
                        color: '#fff',
                        boxSizing: 'border-box'
                      }}
                    />

                    {/* Lista de Contatos Verificados */}
                    <div style={{
                      maxHeight: 270,
                      overflowY: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      paddingRight: 2
                    }}>
                      {testResults
                        .filter((r) => {
                          if (activeResultTab === 'saved') return r.isSaved;
                          if (activeResultTab === 'not_saved') return !r.isSaved;
                          return true;
                        })
                        .filter((r) => {
                          const q = resultSearch.toLowerCase().trim();
                          if (!q) return true;
                          return (
                            (r.name || '').toLowerCase().includes(q) ||
                            (r.phone || '').includes(q) ||
                            (r.city || '').toLowerCase().includes(q)
                          );
                        })
                        .map((r) => (
                          <div
                            key={r.id}
                            style={{
                              background: r.isSaved ? 'rgba(37, 211, 102, 0.05)' : 'rgba(240, 107, 76, 0.05)',
                              border: '1px solid ' + (r.isSaved ? 'rgba(37, 211, 102, 0.25)' : 'rgba(240, 107, 76, 0.25)'),
                              borderRadius: 10,
                              padding: '9px 12px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 10
                            }}
                          >
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {r.name}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--ink2)', display: 'flex', gap: 8, marginTop: 2 }}>
                                <span>📱 {r.phone}</span>
                                {r.city && <span>📍 {r.city}</span>}
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {/* Link direto para abrir no WhatsApp */}
                              {r.phone && (
                                <a
                                  href={`https://api.whatsapp.com/send/?phone=${normalizePhone(r.phone)}&text&type=phone_number&app_absent=0`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    background: 'rgba(37, 211, 102, 0.12)',
                                    border: '1px solid rgba(37, 211, 102, 0.3)',
                                    color: '#25D366',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    padding: '4px 8px',
                                    borderRadius: 6,
                                    textDecoration: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3
                                  }}
                                  title="Abrir WhatsApp deste contato"
                                >
                                  💬 WA
                                </a>
                              )}

                              {/* Badge do Traço */}
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 800,
                                  padding: '3px 9px',
                                  borderRadius: 6,
                                  background: r.isSaved ? 'rgba(37, 211, 102, 0.2)' : 'rgba(240, 107, 76, 0.2)',
                                  color: r.isSaved ? '#25D366' : '#FF8A65',
                                  border: '1px solid ' + (r.isSaved ? 'rgba(37, 211, 102, 0.4)' : 'rgba(240, 107, 76, 0.4)'),
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {r.isSaved ? '✓✓ 2 Traços (Salvo)' : '✓ 1 Traço (Não Salvo)'}
                              </span>

                              {/* Alternar Manualmente */}
                              <button
                                type="button"
                                style={{
                                  background: 'rgba(255,255,255,0.06)',
                                  border: '1px solid var(--line)',
                                  color: 'var(--ink2)',
                                  fontSize: 10.5,
                                  padding: '4px 8px',
                                  borderRadius: 6,
                                  cursor: 'pointer'
                                }}
                                onClick={() => toggleResultStatus(r.id)}
                                title="Clique para alternar se este contato tem ou não o número salvo"
                              >
                                Alternar
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>

                    {/* Ações para Salvar / Aplicar Resultados no Banco */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
                      <button
                        type="button"
                        className="btn btn-teal"
                        disabled={isApplyingResults}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          fontSize: 13,
                          fontWeight: 900,
                          margin: 0,
                          borderRadius: 10,
                          background: 'linear-gradient(135deg, #00E59B 0%, #00B4D8 100%)',
                          color: '#081018',
                          cursor: isApplyingResults ? 'not-allowed' : 'pointer'
                        }}
                        onClick={handleApplyVerificationResults}
                      >
                        {isApplyingResults
                          ? '⏳ Atualizando Painel...'
                          : `💾 Salvar e Atualizar Painel (${testResults.filter((r) => r.isSaved).length} Salvos, ${testResults.filter((r) => !r.isSaved).length} Pendentes)`}
                      </button>

                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: '8px 12px', fontSize: 12, margin: 0 }}
                        onClick={() => setTestResults([])}
                      >
                        🔄 Voltar às Opções de Verificação
                      </button>
                    </div>
                  </div>
                ) : (
                  /* VISTA 2: CONFIGURAÇÃO DO TESTE E VERIFICAÇÃO */
                  <>
                    {/* Card Explicativo Dinâmico de 1 vs 2 Traços */}
                    <div style={{
                      background: 'linear-gradient(135deg, rgba(0, 229, 155, 0.12), rgba(15, 23, 42, 0.7))',
                      border: '1px solid rgba(0, 229, 155, 0.35)',
                      borderRadius: 12,
                      padding: '12px 14px',
                      fontSize: 12,
                      color: '#fff',
                      lineHeight: 1.5
                    }}>
                      <strong style={{ color: 'var(--teal)' }}>🎯 Regra Oficial do WhatsApp para Transmissão:</strong><br />
                      <span>
                        • <strong style={{ color: '#25D366' }}>2 Traços (✓✓)</strong>: A mensagem da transmissão foi entregue. <strong>Confirma que o contato tem seu número salvo na agenda!</strong><br />
                        • <strong style={{ color: '#FF8A65' }}>1 Traço (✓)</strong>: A mensagem não chegou. <strong>Indica que ele NÃO tem seu número salvo</strong>.
                      </span>
                    </div>

                    {/* 1. Seleção dos Contatos para Verificar */}
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        1. Quem você deseja analisar na Transmissão?
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginTop: 6 }}>
                        {/* Opção 1: Escolher Contatos Específicos */}
                        <button
                          type="button"
                          className="btn"
                          disabled={isTestingRunning}
                          style={{
                            margin: 0,
                            padding: '10px 8px',
                            fontSize: 11.5,
                            borderRadius: 10,
                            textAlign: 'center',
                            background: testTargetType === 'custom' ? 'rgba(0, 229, 155, 0.18)' : 'rgba(255, 255, 255, 0.03)',
                            color: testTargetType === 'custom' ? '#fff' : 'var(--ink2)',
                            border: '1px solid ' + (testTargetType === 'custom' ? 'var(--teal)' : 'var(--line)'),
                            cursor: isTestingRunning ? 'not-allowed' : 'pointer'
                          }}
                          onClick={() => setTestTargetType('custom')}
                        >
                          <div style={{ fontSize: 16 }}>🎯</div>
                          <div style={{ fontWeight: 800, marginTop: 2 }}>Contatos Específicos</div>
                          <div style={{ fontSize: 10, opacity: 0.7 }}>
                            {customSelectedUserIds.length > 0 ? `${customSelectedUserIds.length} selecionado(s)` : 'Buscar e marcar'}
                          </div>
                        </button>

                        {/* Opção 2: Por Lote de Transmissão */}
                        <button
                          type="button"
                          className="btn"
                          disabled={isTestingRunning}
                          style={{
                            margin: 0,
                            padding: '10px 8px',
                            fontSize: 11.5,
                            borderRadius: 10,
                            textAlign: 'center',
                            background: testTargetType === 'batch' ? 'rgba(0, 229, 155, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                            color: testTargetType === 'batch' ? '#fff' : 'var(--ink2)',
                            border: '1px solid ' + (testTargetType === 'batch' ? 'var(--teal)' : 'var(--line)'),
                            cursor: isTestingRunning ? 'not-allowed' : 'pointer'
                          }}
                          onClick={() => setTestTargetType('batch')}
                        >
                          <div style={{ fontSize: 16 }}>📋</div>
                          <div style={{ fontWeight: 800, marginTop: 2 }}>Por Lote (100)</div>
                          <div style={{ fontSize: 10, opacity: 0.7 }}>Lote T1, T2, T3...</div>
                        </button>

                        {/* Opção 3: Todos os Pendentes */}
                        <button
                          type="button"
                          className="btn"
                          disabled={isTestingRunning}
                          style={{
                            margin: 0,
                            padding: '10px 8px',
                            fontSize: 11.5,
                            borderRadius: 10,
                            textAlign: 'center',
                            background: testTargetType === 'all_pending' ? 'rgba(240, 107, 76, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                            color: testTargetType === 'all_pending' ? '#fff' : 'var(--ink2)',
                            border: '1px solid ' + (testTargetType === 'all_pending' ? '#FF8A65' : 'var(--line)'),
                            cursor: isTestingRunning ? 'not-allowed' : 'pointer'
                          }}
                          onClick={() => setTestTargetType('all_pending')}
                        >
                          <div style={{ fontSize: 16 }}>⏱</div>
                          <div style={{ fontWeight: 800, marginTop: 2 }}>Pendentes</div>
                          <div style={{ fontSize: 10, opacity: 0.7 }}>{withoutNumberUsers.length} contatos</div>
                        </button>
                      </div>

                      {/* Se escolheu Contatos Específicos */}
                      {testTargetType === 'custom' && (
                        <div style={{
                          marginTop: 10,
                          padding: '12px',
                          background: 'rgba(255,255,255,0.03)',
                          borderRadius: 10,
                          border: '1px solid var(--line)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)' }}>
                              🎯 Marque quem você colocou na Transmissão ({customSelectedUserIds.length} selecionados):
                            </span>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                type="button"
                                className="btn"
                                style={{ fontSize: 10, padding: '3px 8px', margin: 0, background: 'rgba(0, 229, 155, 0.15)', color: 'var(--teal)', border: '1px solid var(--teal)' }}
                                onClick={() => {
                                  const searchQ = customContactSearch.toLowerCase().trim();
                                  const matches = validUsers.filter((u) => {
                                    if (!searchQ) return true;
                                    const n = (u.name || '').toLowerCase();
                                    const p = (u.whatsapp || u.phone || '').replace(/\D/g, '');
                                    return n.includes(searchQ) || p.includes(searchQ);
                                  });
                                  const newIds = Array.from(new Set([...customSelectedUserIds, ...matches.map((u) => u.id)]));
                                  setCustomSelectedUserIds(newIds);
                                }}
                              >
                                Selecionar Filtrados
                              </button>
                              <button
                                type="button"
                                className="btn"
                                style={{ fontSize: 10, padding: '3px 8px', margin: 0, background: 'rgba(255, 255, 255, 0.05)', color: 'var(--ink3)' }}
                                onClick={() => setCustomSelectedUserIds([])}
                              >
                                Limpar
                              </button>
                            </div>
                          </div>

                          <input
                            type="text"
                            placeholder="🔍 Digite para buscar (ex: Kauan, Kamilla, Rozy, telefone)..."
                            value={customContactSearch}
                            onChange={(e) => setCustomContactSearch(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '7px 10px',
                              fontSize: 12,
                              borderRadius: 8,
                              background: 'rgba(0,0,0,0.4)',
                              border: '1px solid var(--line)',
                              color: '#fff',
                              boxSizing: 'border-box'
                            }}
                          />

                          <div style={{
                            maxHeight: 160,
                            overflowY: 'auto',
                            border: '1px solid rgba(255,255,255,0.05)',
                            borderRadius: 8,
                            padding: '4px',
                            background: 'rgba(0,0,0,0.2)'
                          }}>
                            {validUsers
                              .filter((u) => {
                                const q = customContactSearch.toLowerCase().trim();
                                if (!q) return true;
                                const n = (u.name || '').toLowerCase();
                                const p = (u.whatsapp || u.phone || '').replace(/\D/g, '');
                                return n.includes(q) || p.includes(q);
                              })
                              .slice(0, 50)
                              .map((u) => {
                                const isSelected = customSelectedUserIds.includes(u.id);
                                return (
                                  <div
                                    key={u.id}
                                    onClick={() => {
                                      if (isSelected) {
                                        setCustomSelectedUserIds((prev) => prev.filter((id) => id !== u.id));
                                      } else {
                                        setCustomSelectedUserIds((prev) => [...prev, u.id]);
                                      }
                                    }}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      padding: '6px 8px',
                                      borderRadius: 6,
                                      cursor: 'pointer',
                                      background: isSelected ? 'rgba(0, 229, 155, 0.12)' : 'transparent',
                                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                                      transition: 'background 0.15s'
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => {}}
                                        style={{ cursor: 'pointer', accentColor: 'var(--teal)' }}
                                      />
                                      <span style={{ fontSize: 12, fontWeight: 700, color: isSelected ? '#fff' : 'var(--ink2)' }}>
                                        {u.name || 'Sem nome'}
                                      </span>
                                    </div>
                                    <span style={{ fontSize: 11, color: 'var(--ink3)' }}>
                                      {u.whatsapp || u.phone}
                                    </span>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      {/* Se escolheu Lote específico */}
                      {testTargetType === 'batch' && (
                        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: 10, border: '1px solid var(--line)' }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>Selecionar Lote:</span>
                            <select
                              value={selectedTestBatch}
                              onChange={(e) => setSelectedTestBatch(e.target.value)}
                              disabled={isTestingRunning}
                              style={{
                                flex: 1,
                                padding: '6px 10px',
                                borderRadius: 8,
                                background: 'rgba(0,0,0,0.4)',
                                border: '1px solid var(--teal)',
                                color: '#fff',
                                fontSize: 12.5,
                                fontWeight: 700
                              }}
                            >
                              {batches.map((b) => (
                                <option key={b.id} value={b.id} style={{ background: '#0F172A', color: '#fff' }}>
                                  {b.id} - {b.name} ({b.count} contatos #{b.startNumber} a #{b.endNumber})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--teal)', paddingLeft: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span>🛡️</span>
                            <span>O robô analisará <strong>apenas os contatos do {selectedTestBatch}</strong>. Suas outras listas de transmissão e conversas permanecem intocadas.</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 2. Escolha do Método de Verificação */}
                    {!isTestingRunning && (
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          2. Como Deseja Verificar os Traços?
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginTop: 6 }}>
                          {/* Opção 1 (SUPER RECOMENDADO / IDEIA DO USUÁRIO): Rastrear por Frase da Transmissão */}
                          <button
                            type="button"
                            className="btn"
                            style={{
                              margin: 0,
                              padding: '10px 8px',
                              fontSize: 11.5,
                              borderRadius: 10,
                              textAlign: 'center',
                              background: verificationMethod === 'phrase_track' ? 'rgba(0, 229, 155, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                              color: verificationMethod === 'phrase_track' ? '#fff' : 'var(--ink2)',
                              border: '1px solid ' + (verificationMethod === 'phrase_track' ? 'var(--teal)' : 'var(--line)'),
                              cursor: 'pointer',
                              boxShadow: verificationMethod === 'phrase_track' ? '0 0 12px rgba(0, 229, 155, 0.3)' : 'none'
                            }}
                            onClick={() => setVerificationMethod('phrase_track')}
                          >
                            <div style={{ fontSize: 16 }}>📝</div>
                            <div style={{ fontWeight: 900, marginTop: 2, color: verificationMethod === 'phrase_track' ? 'var(--teal)' : 'inherit' }}>Rastrear Frase</div>
                            <div style={{ fontSize: 10, opacity: 0.8 }}>Busca texto no WhatsApp</div>
                          </button>

                          {/* Opção 2: Auditoria Geral de Recibos */}
                          <button
                            type="button"
                            className="btn"
                            style={{
                              margin: 0,
                              padding: '10px 8px',
                              fontSize: 11.5,
                              borderRadius: 10,
                              textAlign: 'center',
                              background: verificationMethod === 'auto_broadcast' ? 'rgba(0, 229, 155, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                              color: verificationMethod === 'auto_broadcast' ? '#fff' : 'var(--ink2)',
                              border: '1px solid ' + (verificationMethod === 'auto_broadcast' ? 'var(--teal)' : 'var(--line)'),
                              cursor: 'pointer'
                            }}
                            onClick={() => setVerificationMethod('auto_broadcast')}
                          >
                            <div style={{ fontSize: 16 }}>📡</div>
                            <div style={{ fontWeight: 800, marginTop: 2 }}>Recibos do WA</div>
                            <div style={{ fontSize: 10, opacity: 0.7 }}>Lê recibos gerais</div>
                          </button>

                          {/* Opção 3: Conferência Rápida / Manual */}
                          <button
                            type="button"
                            className="btn"
                            style={{
                              margin: 0,
                              padding: '10px 8px',
                              fontSize: 11.5,
                              borderRadius: 10,
                              textAlign: 'center',
                              background: verificationMethod === 'paste' ? 'rgba(0, 229, 155, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                              color: verificationMethod === 'paste' ? '#fff' : 'var(--ink2)',
                              border: '1px solid ' + (verificationMethod === 'paste' ? 'var(--teal)' : 'var(--line)'),
                              cursor: 'pointer'
                            }}
                            onClick={() => setVerificationMethod('paste')}
                          >
                            <div style={{ fontSize: 16 }}>📋</div>
                            <div style={{ fontWeight: 800, marginTop: 2 }}>Conferência Rápida</div>
                            <div style={{ fontSize: 10, opacity: 0.7 }}>Marcar manual</div>
                          </button>

                          {/* Opção 4: Disparo de Mensagem */}
                          <button
                            type="button"
                            className="btn"
                            style={{
                              margin: 0,
                              padding: '10px 8px',
                              fontSize: 11.5,
                              borderRadius: 10,
                              textAlign: 'center',
                              background: verificationMethod === 'send_and_verify' ? 'rgba(0, 229, 155, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                              color: verificationMethod === 'send_and_verify' ? '#fff' : 'var(--ink2)',
                              border: '1px solid ' + (verificationMethod === 'send_and_verify' ? 'var(--teal)' : 'var(--line)'),
                              cursor: 'pointer'
                            }}
                            onClick={() => setVerificationMethod('send_and_verify')}
                          >
                            <div style={{ fontSize: 16 }}>🚀</div>
                            <div style={{ fontWeight: 800, marginTop: 2 }}>Disparar & Checar</div>
                            <div style={{ fontSize: 10, opacity: 0.7 }}>Robô envia teste</div>
                          </button>
                        </div>

                        {/* Conteúdo do Método Selecionado */}
                        {verificationMethod === 'phrase_track' && (
                          <div style={{
                            marginTop: 10,
                            padding: '12px 14px',
                            background: 'linear-gradient(135deg, rgba(0, 229, 155, 0.12), rgba(15, 23, 42, 0.8))',
                            border: '1.5px solid var(--teal)',
                            borderRadius: 10,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8
                          }}>
                            <div style={{ fontSize: 12, color: '#fff', lineHeight: 1.5 }}>
                              <strong style={{ color: 'var(--teal)' }}>💡 Rastreamento por Frase da Transmissão:</strong><br />
                              <span>
                                Quando você envia uma Lista de Transmissão no seu celular, o WhatsApp <strong>cria uma conversa individual com quem tem seu número salvo</strong> e insere o texto enviado lá.<br />
                                O robô vai buscar quem possui essa palavra/frase exata na conversa e marcar como <strong style={{ color: '#25D366' }}>✓✓ 2 Traços (Salvo)</strong>!
                              </span>
                            </div>

                            <div style={{ marginTop: 2, display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                              <div>
                                <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal)', textTransform: 'uppercase' }}>
                                  Palavra ou Frase de Teste:
                                </label>
                                <input
                                  type="text"
                                  placeholder="ex: teste 1234..."
                                  value={broadcastPhraseText}
                                  onChange={(e) => setBroadcastPhraseText(e.target.value)}
                                  style={{
                                    width: '100%',
                                    padding: '9px 12px',
                                    fontSize: 13,
                                    fontWeight: 700,
                                    borderRadius: 8,
                                    background: 'rgba(0,0,0,0.5)',
                                    border: '1.5px solid var(--teal)',
                                    color: '#fff',
                                    marginTop: 4,
                                    boxSizing: 'border-box'
                                  }}
                                />
                              </div>

                              <div>
                                <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal)', textTransform: 'uppercase' }}>
                                  Janela de Tempo:
                                </label>
                                <select
                                  value={phraseTimeHours}
                                  onChange={(e) => setPhraseTimeHours(Number(e.target.value))}
                                  style={{
                                    width: '100%',
                                    padding: '9px 10px',
                                    fontSize: 12.5,
                                    fontWeight: 800,
                                    borderRadius: 8,
                                    background: 'rgba(0,0,0,0.5)',
                                    border: '1.5px solid var(--teal)',
                                    color: '#fff',
                                    marginTop: 4,
                                    boxSizing: 'border-box'
                                  }}
                                >
                                  <option value={6} style={{ background: '#0F172A' }}>Últimas 6h</option>
                                  <option value={12} style={{ background: '#0F172A' }}>Últimas 12h (Padrão)</option>
                                  <option value={24} style={{ background: '#0F172A' }}>Últimas 24h</option>
                                  <option value={48} style={{ background: '#0F172A' }}>Últimas 48h</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Conteúdo do Método Selecionado */}
                        {verificationMethod === 'auto_broadcast' && (
                          <div style={{
                            marginTop: 10,
                            padding: '12px 14px',
                            background: 'linear-gradient(135deg, rgba(0, 229, 155, 0.08), rgba(15, 23, 42, 0.6))',
                            border: '1px solid rgba(0, 229, 155, 0.3)',
                            borderRadius: 10,
                            fontSize: 12,
                            color: '#fff',
                            lineHeight: 1.5,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8
                          }}>
                            <div>
                              <strong style={{ color: 'var(--teal)' }}>🎯 Auditoria Geral de Transmissões:</strong><br />
                              <span>
                                1. O robô varre <strong>todas as mensagens e listas de transmissão disparadas no seu WhatsApp</strong>.<br />
                                2. Lê os recibos oficiais de entrega (✓✓ 2 Traços) em todas as conversas do aparelho com suporte automático a 8 e 9 dígitos.<br />
                                3. Cruza instantaneamente com os contatos do <strong>{testTargetType === 'batch' ? `Lote ${selectedTestBatch}` : 'grupo selecionado'}</strong> e exibe o status de cada membro.
                              </span>
                            </div>
                          </div>
                        )}

                        {verificationMethod === 'paste' && (
                          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>
                              (Opcional) Cole aqui os nomes ou números copiados de "Dados da Mensagem" do WhatsApp:
                            </label>
                            <textarea
                              rows={3}
                              placeholder="Cole aqui o texto copiado de quem recebeu a transmissão ou clique em 'Abrir Lista' para marcar diretamente..."
                              value={pastedMessageData}
                              onChange={(e) => setPastedMessageData(e.target.value)}
                              style={{
                                width: '100%',
                                padding: '8px 10px',
                                fontSize: 12,
                                borderRadius: 8,
                                background: 'rgba(0,0,0,0.3)',
                                border: '1px solid var(--line)',
                                color: '#fff',
                                boxSizing: 'border-box'
                              }}
                            />
                          </div>
                        )}

                        {verificationMethod === 'check_status' && (
                          <div style={{
                            marginTop: 10,
                            padding: '10px 12px',
                            background: 'rgba(0, 229, 155, 0.06)',
                            border: '1px solid rgba(0, 229, 155, 0.25)',
                            borderRadius: 8,
                            fontSize: 11.5,
                            color: 'var(--ink2)',
                            lineHeight: 1.4
                          }}>
                            ℹ️ <strong>Sincronização Direta:</strong> O sistema consultará a lista de contatos do WhatsApp conectado pelo QR Code e cruzará com os números dos cadastros.
                          </div>
                        )}

                        {verificationMethod === 'send_and_verify' && (
                          <div style={{ marginTop: 10 }}>
                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                              Texto da Mensagem de Teste (Tags: {'{primeiro_nome}'}, {'{nome}'}, {'{cidade}'}):
                            </label>
                            <textarea
                              rows={3}
                              value={testMessageText}
                              onChange={(e) => setTestMessageText(e.target.value)}
                              style={{
                                width: '100%',
                                padding: '8px 10px',
                                fontSize: 12,
                                borderRadius: 8,
                                background: 'rgba(0,0,0,0.3)',
                                border: '1px solid var(--line)',
                                color: '#fff',
                                boxSizing: 'border-box'
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Se a verificação estiver rodando */}
                    {isTestingRunning && (
                      <div style={{
                        background: 'linear-gradient(180deg, rgba(0, 229, 155, 0.08) 0%, rgba(15, 23, 42, 0.8) 100%)',
                        borderRadius: 14,
                        border: '1px solid var(--teal)',
                        padding: '14px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 16 }}>⏳</span>
                            <span style={{ fontSize: 13, fontWeight: 900, color: '#fff' }}>
                              {isTestingPaused ? '⏸️ Verificação Pausada' : '🔍 Analisando Contatos no WhatsApp...'}
                            </span>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--teal)' }}>
                            {testProgress.current} de {testProgress.total} ({testProgress.total > 0 ? Math.round((testProgress.current / testProgress.total) * 100) : 0}%)
                          </span>
                        </div>

                        <div style={{ width: '100%', height: 7, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{
                            width: `${testProgress.total > 0 ? (testProgress.current / testProgress.total) * 100 : 0}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #25D366, var(--teal))',
                            transition: 'width 0.3s ease'
                          }} />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div style={{ background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.3)', borderRadius: 8, padding: '6px 10px', textAlign: 'center' }}>
                            <span style={{ fontSize: 10, color: '#25D366', fontWeight: 800, textTransform: 'uppercase' }}>✓✓ Salvos</span>
                            <div style={{ fontSize: 18, fontWeight: 900, color: '#25D366', marginTop: 2 }}>{testProgress.success}</div>
                          </div>

                          <div style={{ background: 'rgba(240,107,76,0.12)', border: '1px solid rgba(240,107,76,0.3)', borderRadius: 8, padding: '6px 10px', textAlign: 'center' }}>
                            <span style={{ fontSize: 10, color: '#FF8A65', fontWeight: 800, textTransform: 'uppercase' }}>✓ Pendentes</span>
                            <div style={{ fontSize: 18, fontWeight: 900, color: '#FF8A65', marginTop: 2 }}>{testProgress.failed}</div>
                          </div>
                        </div>

                        <div
                          ref={logContainerRef}
                          style={{
                            height: 140,
                            overflowY: 'auto',
                            background: '#040910',
                            borderRadius: 8,
                            padding: '8px 10px',
                            fontSize: 11,
                            fontFamily: 'monospace',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                            border: '1px solid rgba(255,255,255,0.08)'
                          }}
                        >
                          {testLogs.length === 0 ? (
                            <span style={{ color: 'var(--ink3)' }}>Iniciando análise dos contatos...</span>
                          ) : (
                            testLogs.map((l, idx) => (
                              <div key={idx} style={{
                                color: l.type === 'success' ? '#25D366' : l.type === 'error' ? '#FF8A65' : l.type === 'delay' ? '#F59E0B' : 'var(--ink2)'
                              }}>
                                <span style={{ opacity: 0.5 }}>[{l.time}]</span> {l.msg}
                              </div>
                            ))
                          )}
                        </div>

                        <button
                          type="button"
                          className="btn"
                          style={{
                            padding: '9px',
                            fontSize: 12,
                            fontWeight: 800,
                            borderRadius: 8,
                            background: 'rgba(240,107,76,0.15)',
                            color: '#FF8A65',
                            border: '1px solid rgba(240,107,76,0.3)'
                          }}
                          onClick={handleStopTest}
                        >
                          ⏹️ Parar Verificação
                        </button>
                      </div>
                    )}

                    {/* Rodapé e Botão Principal de Ação */}
                    {!isTestingRunning && (
                      <div style={{ marginTop: 6, paddingTop: 12, borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {verificationMethod === 'phrase_track' && (
                          <button
                            type="button"
                            className="btn btn-teal"
                            disabled={getSelectedTargetUsers().length === 0 || !broadcastPhraseText.trim()}
                            style={{
                              width: '100%',
                              padding: '13px 16px',
                              fontSize: 13.5,
                              fontWeight: 900,
                              margin: 0,
                              borderRadius: 10,
                              background: 'linear-gradient(135deg, #00E59B 0%, #00B4D8 100%)',
                              color: '#081018',
                              cursor: 'pointer',
                              boxShadow: '0 4px 16px rgba(0, 229, 155, 0.35)'
                            }}
                            onClick={handleAuditByPhraseLive}
                          >
                            📝 Rastrear Frase "{broadcastPhraseText.trim() || '...'}" ({getSelectedTargetUsers().length} Contatos)
                          </button>
                        )}
                        {verificationMethod === 'auto_broadcast' && (
                          <button
                            type="button"
                            className="btn btn-teal"
                            disabled={getSelectedTargetUsers().length === 0}
                            style={{
                              width: '100%',
                              padding: '13px 16px',
                              fontSize: 13.5,
                              fontWeight: 900,
                              margin: 0,
                              borderRadius: 10,
                              background: 'linear-gradient(135deg, #00E59B 0%, #00B4D8 100%)',
                              color: '#081018',
                              cursor: 'pointer',
                              boxShadow: '0 4px 16px rgba(0, 229, 155, 0.35)'
                            }}
                            onClick={handleAutoAuditBroadcastLive}
                          >
                            📡 Auditar Mensagem da Transmissão {selectedTestBatch} ({getSelectedTargetUsers().length} Contatos)
                          </button>
                        )}

                        {verificationMethod === 'paste' && (
                          <button
                            type="button"
                            className="btn btn-teal"
                            disabled={getSelectedTargetUsers().length === 0}
                            style={{
                              width: '100%',
                              padding: '13px 16px',
                              fontSize: 13.5,
                              fontWeight: 900,
                              margin: 0,
                              borderRadius: 10,
                              background: 'linear-gradient(135deg, #00E59B 0%, #00B4D8 100%)',
                              color: '#081018',
                              cursor: 'pointer',
                              boxShadow: '0 4px 16px rgba(0, 229, 155, 0.35)'
                            }}
                            onClick={handleOpenTransmissionChecklist}
                          >
                            📋 Abrir Lista & Conferir ({getSelectedTargetUsers().length} Contatos)
                          </button>
                        )}

                        {verificationMethod === 'check_status' && (
                          <button
                            type="button"
                            className="btn btn-teal"
                            disabled={getSelectedTargetUsers().length === 0}
                            style={{
                              width: '100%',
                              padding: '13px 16px',
                              fontSize: 13.5,
                              fontWeight: 900,
                              margin: 0,
                              borderRadius: 10,
                              background: 'linear-gradient(135deg, #00E59B 0%, #00B4D8 100%)',
                              color: '#081018',
                              cursor: 'pointer',
                              boxShadow: '0 4px 16px rgba(0, 229, 155, 0.35)'
                            }}
                            onClick={handleCheckBroadcastStatusLive}
                          >
                            🔄 Sincronizar e Checar no WhatsApp ({getSelectedTargetUsers().length} Contatos)
                          </button>
                        )}

                        {verificationMethod === 'send_and_verify' && (
                          <button
                            type="button"
                            className="btn btn-teal"
                            disabled={getSelectedTargetUsers().length === 0}
                            style={{
                              width: '100%',
                              padding: '13px 16px',
                              fontSize: 13.5,
                              fontWeight: 900,
                              margin: 0,
                              borderRadius: 10,
                              background: 'linear-gradient(135deg, #00E59B 0%, #00B4D8 100%)',
                              color: '#081018',
                              cursor: 'pointer',
                              boxShadow: '0 4px 16px rgba(0, 229, 155, 0.35)'
                            }}
                            onClick={handleSendAndVerifyBroadcast}
                          >
                            🚀 Disparar Mensagem na Transmissão & Checar Traços
                          </button>
                        )}

                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ padding: '8px', fontSize: 12, margin: 0 }}
                          onClick={() => setShowBroadcastTestModal(false)}
                        >
                          Fechar
                        </button>
                      </div>
                    )}
                  </>
                )}
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
                background: 'linear-gradient(135deg, #00E59B 0%, #00B4D8 100%)',
                color: '#081018',
                border: 'none',
                boxShadow: '0 4px 14px rgba(0, 229, 155, 0.35)',
                cursor: 'pointer'
              }}
              onClick={() => setShowBroadcastTestModal(true)}
            >
              <span style={{ fontWeight: 900 }}>✓✓</span> Verificador de Transmissão (1 vs 2 Traços)
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
                background: 'rgba(255, 255, 255, 0.05)',
                color: '#fff',
                border: '1px solid var(--line)'
              }}
              onClick={() => setShowGoogleSyncModal(true)}
            >
              <span>☁️</span> Agenda
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
                background: 'rgba(255, 255, 255, 0.05)',
                color: '#fff',
                border: '1px solid var(--line)',
                cursor: (syncingContacts || !status.connected) ? 'not-allowed' : 'pointer',
                opacity: (syncingContacts || !status.connected) ? 0.5 : 1
              }}
              onClick={handleSyncWhatsAppContacts}
              disabled={syncingContacts || !status.connected}
              title={!status.connected ? 'Conecte o WhatsApp pelo QR Code acima primeiro' : 'Sincroniza os contatos que estão salvos na agenda do WhatsApp conectado'}
            >
              <span>🔄</span> {syncingContacts ? 'Sincronizando...' : 'Sincronizar Agenda do Aparelho'}
            </button>

            <button
              type="button"
              className="btn"
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                padding: '9px 12px',
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
              disabled={resettingAnalysis || syncingContacts || isTestingRunning}
              title="Limpar todos os dados analisados e resetar contatos para Pendentes"
            >
              <span>🧹</span> {resettingAnalysis ? 'Limpando...' : 'Limpar'}
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
                  📋 ETAPA 1: Listas de Transmissão Oficiais ({batches.length} Lotes de 100 contatos)
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2 }}>
                  Total: {users.length} membros cadastrados · Baixe o vCard (.vcf) e crie a lista de transmissão no celular
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

                  <div style={{ marginTop: 4, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button 
                      type="button"
                      className="btn btn-teal"
                      style={{ fontSize: 11.5, padding: '8px 10px', margin: 0, borderRadius: 10 }}
                      onClick={() => handleExportBatchVcf(b)}
                      title="Baixar lista em arquivo .vcf para importar nos contatos do celular"
                    >
                      📥 Baixar ({b.id})
                    </button>

                    <button 
                      type="button"
                      className="btn"
                      style={{
                        fontSize: 11.5,
                        fontWeight: 800,
                        padding: '8px 10px',
                        margin: 0,
                        borderRadius: 10,
                        background: 'linear-gradient(135deg, rgba(0, 229, 155, 0.2), rgba(0, 180, 216, 0.2))',
                        color: '#fff',
                        border: '1px solid var(--teal)'
                      }}
                      onClick={() => {
                        setSelectedTestBatch(b.id);
                        setTestTargetType('batch');
                        setTestResults([]);
                        setShowBroadcastTestModal(true);
                      }}
                      title="Verificar se os contatos deste lote têm o número salvo (1 traço vs 2 traços)"
                    >
                      ✓✓ Verificar Lote
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
