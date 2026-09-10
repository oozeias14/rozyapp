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
  const [botStep, setBotStep] = useState(1); // 1: Conectar | 2: Salvar Agendas | 3: Transmissão & Checagem | 4: Ajustes API
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
  const [showLegacyBatches, setShowLegacyBatches] = useState(false); // Colapsado por padrão para destacar a opção recomendada de 1 toque
  const [modalSearch, setModalSearch] = useState('');
  const [modalPage, setModalPage] = useState(1);

  // Estados do Sistema de Verificação de Transmissão (1 Traço vs 2 Traços)
  const [showBroadcastTestModal, setShowBroadcastTestModal] = useState(false);
  const [testTargetType, setTestTargetType] = useState('custom'); // 'custom' | 'batch' | 'all_pending' | 'all'
  const [customSelectedUserIds, setCustomSelectedUserIds] = useState([]);
  const [customContactSearch, setCustomContactSearch] = useState('');
  const [selectedTestBatch, setSelectedTestBatch] = useState('T1');
  const [verificationMethod, setVerificationMethod] = useState('phrase_track'); // 'phrase_track' | 'auto_broadcast' | 'paste'
  const [broadcastPhraseText, setBroadcastPhraseText] = useState('');
  const [phraseTimeHours, setPhraseTimeHours] = useState(0.25); // Janela estrita de 15 minutos a partir do clique
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

  // Polling automático enquanto estiver desconectado para detectar leitura do QR Code
  useEffect(() => {
    if (status.connected) return;
    const interval = setInterval(async () => {
      const res = await fetchInstanceStatus();
      if (res?.connected) {
        setStatus(res);
        setShowConnectModal(false);
        setQrCodeData(null);
        setPairingCodeResult(null);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [status.connected]);

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

    const timeDesc = phraseTimeHours <= 0.25 ? '15 minutos' : phraseTimeHours <= 0.5 ? '30 minutos' : `${phraseTimeHours}h`;

    if (cleanPhrase) {
      addLog(`📝 Iniciando rastreamento da frase "${cleanPhrase}" nos últimos ${timeDesc}...`, 'info');
    } else {
      addLog(`📝 Cruzando contatos do sistema com o WhatsApp nos últimos ${timeDesc}...`, 'info');
    }

    try {
      addLog(`⚡ Escaneando mensagens e listas de transmissão no WhatsApp...`, 'info');
      const preScannedSigs = await scanAllChatsForPhrase(cleanPhrase, phraseTimeHours);
      addLog(`📥 ${preScannedSigs.size} identificadores do WhatsApp confirmaram atividade nos últimos ${timeDesc}.`, 'info');

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
          addLog(`✓✓ [${i + 1}/${targetUsers.length}] ${fullName} (${rawPhone}): TRANSMISSÃO / ATIVIDADE ENTREGUE (2 Traços) ➔ SALVO!`, 'success');
        } else {
          notSavedCount++;
          addLog(`✓ [${i + 1}/${targetUsers.length}] ${fullName} (${rawPhone}): SEM MENSAGEM / ENTREGA ➔ PENDENTE (1 Traço)`, 'error');
        }

        evaluated.push({
          id: u.id,
          user: u,
          name: fullName,
          phone: rawPhone,
          city: u.city || '',
          checks: is2Checks ? 2 : 1,
          status: is2Checks ? 'DELIVERY_ACK' : 'SERVER_ACK',
          label: is2Checks ? `✓✓ 2 Traços (Salvo / Transmissão Recebida)` : `✓ 1 Traço (Não Salvo / Sem Entrega)`,
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
      addLog(`🏁 Rastreamento finalizado! Atividade nos últimos ${timeDesc} (Salvos): ${savedCount} | Sem atividade (Pendentes): ${notSavedCount}`, 'info');

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

      {/* Barra de Progresso por Etapas (Estilo MassSignup / Cadastro de Folha) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 18px',
        background: 'rgba(13, 17, 28, 0.95)',
        borderRadius: 16,
        border: '1px solid var(--line)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
        gap: 6,
        flexWrap: 'wrap'
      }}>
        {/* Passo 1: Conectar */}
        <div 
          onClick={() => setBotStep(1)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            cursor: 'pointer',
            opacity: botStep === 1 ? 1 : 0.75,
            transition: 'all 0.2s'
          }}
        >
          <div style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: botStep === 1 
              ? 'linear-gradient(135deg, #3DD9B3, #25D366)' 
              : status.connected 
                ? 'var(--teal)' 
                : 'var(--panel2)',
            color: botStep === 1 || status.connected ? '#051A14' : 'var(--ink3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 900,
            boxShadow: botStep === 1 ? '0 0 12px rgba(61, 217, 179, 0.45)' : 'none'
          }}>
            {status.connected ? '✓' : '1'}
          </div>
          <span style={{ fontSize: 12, fontWeight: botStep === 1 ? 800 : 600, color: botStep === 1 ? '#fff' : 'var(--ink2)' }}>
            1. Conectar
          </span>
        </div>

        {/* Linha 1-2 */}
        <div style={{ flex: 1, minWidth: 14, height: 2, background: botStep > 1 || status.connected ? 'var(--teal)' : 'var(--line)', margin: '0 4px', transition: 'background 0.3s' }} />

        {/* Passo 2: Salvar Agendas */}
        <div 
          onClick={() => setBotStep(2)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            cursor: 'pointer',
            opacity: botStep === 2 ? 1 : 0.75,
            transition: 'all 0.2s'
          }}
        >
          <div style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: botStep === 2 
              ? 'linear-gradient(135deg, #3DD9B3, #25D366)' 
              : botStep > 2 
                ? 'var(--teal)' 
                : 'var(--panel2)',
            color: botStep === 2 || botStep > 2 ? '#051A14' : 'var(--ink3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 900,
            boxShadow: botStep === 2 ? '0 0 12px rgba(61, 217, 179, 0.45)' : 'none'
          }}>
            {botStep > 2 ? '✓' : '2'}
          </div>
          <span style={{ fontSize: 12, fontWeight: botStep === 2 ? 800 : 600, color: botStep === 2 ? '#fff' : 'var(--ink2)' }}>
            2. Salvar Agenda
          </span>
        </div>

        {/* Linha 2-3 */}
        <div style={{ flex: 1, minWidth: 14, height: 2, background: botStep > 2 ? 'var(--teal)' : 'var(--line)', margin: '0 4px', transition: 'background 0.3s' }} />

        {/* Passo 3: Transmissão & Checagem */}
        <div 
          onClick={() => setBotStep(3)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            cursor: 'pointer',
            opacity: botStep === 3 ? 1 : 0.75,
            transition: 'all 0.2s'
          }}
        >
          <div style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: botStep === 3 
              ? 'linear-gradient(135deg, #3DD9B3, #25D366)' 
              : botStep > 3 
                ? 'var(--teal)' 
                : 'var(--panel2)',
            color: botStep === 3 || botStep > 3 ? '#051A14' : 'var(--ink3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 900,
            boxShadow: botStep === 3 ? '0 0 12px rgba(61, 217, 179, 0.45)' : 'none'
          }}>
            {botStep > 3 ? '✓' : '3'}
          </div>
          <span style={{ fontSize: 12, fontWeight: botStep === 3 ? 800 : 600, color: botStep === 3 ? '#fff' : 'var(--ink2)' }}>
            3. Transmissão & Checagem
          </span>
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
                          2. Como Deseja Sincronizar os Traços?
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginTop: 6 }}>
                          {/* Opção 1: Rastrear por Frase da Transmissão (100% Anti-Ban / Sincronizado com Celular) */}
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
                            <div style={{ fontWeight: 900, marginTop: 2, color: verificationMethod === 'phrase_track' ? 'var(--teal)' : 'inherit' }}>Rastrear Transmissão</div>
                            <div style={{ fontSize: 10, opacity: 0.8 }}>Sincroniza do Celular (Anti-Ban)</div>
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
                            <div style={{ fontWeight: 800, marginTop: 2 }}>Recibos Gerais</div>
                            <div style={{ fontSize: 10, opacity: 0.7 }}>Lê recibos de entrega do WA</div>
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
                            <div style={{ fontWeight: 800, marginTop: 2 }}>Conferência Manual</div>
                            <div style={{ fontSize: 10, opacity: 0.7 }}>Ajustar / Colar dados</div>
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
                              <strong style={{ color: 'var(--teal)' }}>🛡️ Sincronização 100% Anti-Ban (Passivo / Cruzamento em Tempo Real):</strong><br />
                              <span>
                                1. Envie uma mensagem na sua <strong>Lista de Transmissão no WhatsApp do Celular</strong>.<br />
                                2. O robô cruza em tempo real os contatos do app com o WhatsApp conectado e analisa <strong>os últimos 15 minutos a partir do momento que você clicar no botão</strong>.<br />
                                3. Identifica automaticamente: <strong style={{ color: '#25D366' }}>✓✓ 2 Traços = Recebeu / Salvo</strong> e <strong style={{ color: '#FF8A65' }}>✓ 1 Traço = Pendente / Não Salvo</strong>.
                              </span>
                            </div>

                            <div style={{ marginTop: 2 }}>
                              <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal)', textTransform: 'uppercase' }}>
                                Palavra ou Frase da Transmissão (Opcional):
                              </label>
                              <input
                                type="text"
                                placeholder="Deixe em branco para buscar em todas as listas, ou digite uma palavra..."
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
                          </div>
                        )}

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
                                2. Lê os recibos oficiais de entrega (✓✓ 2 Traços) em todas as conversas do aparelho com suporte automático a 8 e 9 dígitos e mapeamento LID.<br />
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
                            onClick={handleAuditByPhraseLive}
                          >
                            {broadcastPhraseText.trim()
                              ? `📝 Rastrear Frase "${broadcastPhraseText.trim()}" (Últimos 15 min · ${getSelectedTargetUsers().length} Contatos)`
                              : `⚡ Rastrear Transmissão dos Últimos 15 Min (${getSelectedTargetUsers().length} Contatos)`}
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

      {/* ========================================================= */}
      {/* 🟢 ETAPA 1: CONECTAR WHATSAPP (QR CODE OU PAREAMENTO)     */}
      {/* ========================================================= */}
      {botStep === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            padding: '24px 20px',
            background: status.connected 
              ? 'linear-gradient(135deg, rgba(37, 211, 102, 0.12), rgba(15, 23, 42, 0.85))'
              : 'linear-gradient(135deg, rgba(61, 217, 179, 0.12), rgba(15, 23, 42, 0.85))',
            border: `1.5px solid ${status.connected ? 'rgba(37, 211, 102, 0.4)' : 'rgba(61, 217, 179, 0.35)'}`,
            borderRadius: 20,
            boxShadow: '0 10px 32px rgba(0, 0, 0, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 16
          }}>
            {/* Ícone Redondo com Brilho */}
            <div style={{
              width: 62,
              height: 62,
              borderRadius: '50%',
              background: status.connected 
                ? 'linear-gradient(135deg, rgba(37, 211, 102, 0.25), rgba(0, 229, 155, 0.15))'
                : 'linear-gradient(135deg, rgba(61, 217, 179, 0.25), rgba(37, 211, 102, 0.15))',
              border: `2px solid ${status.connected ? '#25D366' : 'var(--teal)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 30,
              margin: '0 auto',
              boxShadow: status.connected ? '0 0 20px rgba(37, 211, 102, 0.3)' : '0 0 20px rgba(61, 217, 179, 0.25)'
            }}>
              {status.connected ? '🟢' : '📱'}
            </div>

            <div>
              <h2 style={{
                fontSize: 18,
                fontWeight: 900,
                letterSpacing: '0.5px',
                color: '#fff',
                textTransform: 'uppercase',
                margin: '0 0 6px 0'
              }}>
                {status.connected ? 'WHATSAPP CONECTADO E PRONTO!' : 'ETAPA 1: CONECTAR WHATSAPP'}
              </h2>
              <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5, maxWidth: 440, margin: '0 auto' }}>
                {status.connected 
                  ? `Sessão ativa na instância ${config.instanceName}. O robô está apto a cruzar listas e auditar mensagens entregues nos últimos 15 minutos.`
                  : 'Conecte o WhatsApp do Dr. Cândido Teles para sincronizar agendas e checar entregas da lista de transmissão.'}
              </div>
            </div>

            {/* SE JÁ ESTIVER CONECTADO */}
            {status.connected ? (
              <div style={{
                background: 'rgba(37, 211, 102, 0.08)',
                border: '1px solid rgba(37, 211, 102, 0.3)',
                borderRadius: 14,
                padding: '16px 20px',
                width: '100%',
                maxWidth: 480,
                display: 'flex',
                flexDirection: 'column',
                gap: 12
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--ink2)' }}>Instância Conectada:</span>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: '#25D366' }}>{config.instanceName}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--ink2)' }}>Status da Conexão:</span>
                  <span style={{ fontSize: 11.5, background: 'rgba(37, 211, 102, 0.2)', color: '#25D366', padding: '3px 8px', borderRadius: 6, fontWeight: 800 }}>
                    ✓ Operacional (Pronto)
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                  <button
                    type="button"
                    className="btn btn-teal"
                    style={{
                      flex: 1,
                      padding: '14px 18px',
                      fontSize: 14,
                      fontWeight: 900,
                      margin: 0,
                      borderRadius: 12,
                      boxShadow: '0 6px 20px rgba(0, 229, 155, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      cursor: 'pointer'
                    }}
                    onClick={() => setBotStep(2)}
                  >
                    <span>Avançar para Etapa 2: Salvar Agendas</span>
                    <span>→</span>
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 4 }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '6px 12px', fontSize: 11.5, margin: 0, color: '#FF8A65', borderColor: 'rgba(240, 107, 76, 0.3)' }}
                    onClick={handleDisconnect}
                  >
                    🔌 Desconectar WhatsApp
                  </button>
                </div>
              </div>
            ) : (
              /* SE DESCONECTADO: LEITOR QR CODE OU CÓDIGO DE PAREAMENTO */
              <div style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, background: 'rgba(255,255,255,0.04)', padding: 4, borderRadius: 12 }}>
                  <button
                    type="button"
                    className="btn"
                    style={{
                      margin: 0,
                      padding: '9px 12px',
                      fontSize: 12.5,
                      fontWeight: 800,
                      borderRadius: 9,
                      background: connectTab === 'qr' ? 'var(--teal)' : 'transparent',
                      color: connectTab === 'qr' ? '#081018' : 'var(--ink2)',
                      border: 'none',
                      boxShadow: connectTab === 'qr' ? '0 2px 8px rgba(0,229,155,0.25)' : 'none'
                    }}
                    onClick={() => { setConnectTab('qr'); if (!qrCodeData) handleFetchQrCode(); }}
                  >
                    📷 Ler QR Code
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{
                      margin: 0,
                      padding: '9px 12px',
                      fontSize: 12.5,
                      fontWeight: 800,
                      borderRadius: 9,
                      background: connectTab === 'pairing' ? 'var(--teal)' : 'transparent',
                      color: connectTab === 'pairing' ? '#081018' : 'var(--ink2)',
                      border: 'none',
                      boxShadow: connectTab === 'pairing' ? '0 2px 8px rgba(0,229,155,0.25)' : 'none'
                    }}
                    onClick={() => setConnectTab('pairing')}
                  >
                    🔢 Código (8 Dígitos)
                  </button>
                </div>

                {connectTab === 'qr' && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    {qrLoading ? (
                      <div style={{ padding: '36px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                        <div style={{ fontSize: 28 }}>⏳</div>
                        <div style={{ fontSize: 13, color: 'var(--teal)', fontWeight: 700 }}>Gerando QR Code no Railway...</div>
                      </div>
                    ) : qrCodeData ? (
                      <>
                        <div style={{
                          background: '#ffffff',
                          padding: 14,
                          borderRadius: 16,
                          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
                          display: 'inline-block'
                        }}>
                          <img 
                            src={qrCodeData.startsWith('data:') ? qrCodeData : `data:image/png;base64,${qrCodeData}`} 
                            alt="QR Code WhatsApp" 
                            style={{ width: 230, height: 230, display: 'block', borderRadius: 8 }}
                          />
                        </div>

                        <div style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.5, textAlign: 'center', maxWidth: 360 }}>
                          1. No WhatsApp do celular, abra <strong style={{ color: '#fff' }}>Aparelhos Conectados</strong><br />
                          2. Toque em <strong style={{ color: 'var(--teal)' }}>Conectar um Aparelho</strong> e aponte a câmera para o QR Code acima!
                        </div>

                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-teal"
                            style={{ padding: '8px 16px', fontSize: 12, margin: 0 }}
                            onClick={() => handleFetchQrCode(true)}
                          >
                            🔄 Atualizar QR Code
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ padding: '8px 16px', fontSize: 12, margin: 0, color: '#FF8A65' }}
                            onClick={handleResetAndReconnect}
                            disabled={resettingInstance}
                          >
                            {resettingInstance ? '⏳ Limpando...' : '⚠️ Limpar Sessão'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                        <button
                          type="button"
                          className="btn btn-teal"
                          style={{
                            margin: 0,
                            padding: '16px 28px',
                            fontSize: 15,
                            fontWeight: 900,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 10,
                            borderRadius: 14,
                            boxShadow: '0 8px 24px rgba(61, 217, 179, 0.4)',
                            cursor: 'pointer'
                          }}
                          onClick={() => handleFetchQrCode()}
                        >
                          <span>📷</span> Gerar QR Code do WhatsApp
                        </button>

                        {qrError && (
                          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(240, 107, 76, 0.15)', border: '1px solid rgba(240, 107, 76, 0.3)', color: '#FF8A65', fontSize: 12 }}>
                            {qrError}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {connectTab === 'pairing' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <form onSubmit={handleGeneratePairingCode} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ textAlign: 'left' }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>
                          Número do WhatsApp com DDD
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: 61999999999"
                          value={pairingPhone}
                          onChange={(e) => setPairingPhone(e.target.value)}
                          style={{ width: '100%', marginTop: 4, padding: '10px 12px', fontSize: 14 }}
                        />
                      </div>
                      <button
                        type="submit"
                        className="btn btn-teal"
                        disabled={generatingPairing}
                        style={{ width: '100%', padding: '11px', fontSize: 13, fontWeight: 800, margin: 0 }}
                      >
                        {generatingPairing ? '⏳ Gerando Código...' : '🔢 Gerar Código de 8 Dígitos'}
                      </button>
                    </form>

                    {pairingCodeResult && (
                      <div style={{
                        background: 'rgba(0, 229, 155, 0.1)',
                        border: '1.5px dashed var(--teal)',
                        borderRadius: 14,
                        padding: 16,
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8
                      }}>
                        <div style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 800 }}>SEU CÓDIGO DE PAREAMENTO</div>
                        <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '4px', color: '#fff', background: 'rgba(0,0,0,0.4)', padding: '8px 12px', borderRadius: 8 }}>
                          {pairingCodeResult}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink2)', lineHeight: 1.4 }}>
                          1. No celular: <strong>Aparelhos Conectados</strong> ➔ <strong>Conectar Aparelho</strong>.<br />
                          2. Toque em <strong>"Conectar com número de telefone"</strong> e digite o código acima!
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10, textAlign: 'center' }}>
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
                    {resettingInstance ? '⏳ Reiniciando...' : '⚠️ Sessão travada ou erro de QR? Clique para Limpar Sessão'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 🟢 ETAPA 2: SALVAR AGENDAS NO CELULAR (.VCF / 1 TOQUE)     */}
      {/* ========================================================= */}
      {botStep === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            padding: '22px 20px',
            background: 'linear-gradient(135deg, rgba(0, 229, 155, 0.12), rgba(15, 23, 42, 0.85))',
            border: '1.5px solid rgba(0, 229, 155, 0.35)',
            borderRadius: 20,
            boxShadow: '0 10px 32px rgba(0, 0, 0, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            gap: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  background: 'linear-gradient(135deg, rgba(0, 229, 155, 0.25), rgba(37, 211, 102, 0.15))',
                  border: '1px solid var(--teal)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                  flexShrink: 0
                }}>
                  📥
                </div>
                <div>
                  <h2 style={{ fontSize: 17, fontWeight: 900, color: '#fff', margin: 0, textTransform: 'uppercase' }}>
                    ETAPA 2: SALVAR AGENDAS NO CELULAR
                  </h2>
                  <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginTop: 3 }}>
                    Salve os contatos no celular do Dr. Cândido para garantir que a lista de transmissão entregue as mensagens.
                  </div>
                </div>
              </div>
            </div>

            {/* OPÇÃO 1: SALVAR TODOS NO CELULAR (PADRÃO RECOMENDADO - 1 TOQUE) */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(0, 229, 155, 0.15), rgba(15, 23, 42, 0.7))',
              border: '1.5px solid var(--teal)',
              borderRadius: 16,
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              boxShadow: '0 6px 24px rgba(0, 229, 155, 0.15)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20 }}>📲</span>
                  <span style={{ fontSize: 15, fontWeight: 900, color: '#fff' }}>
                    Salvar Contatos Direto no Celular (Recomendado)
                  </span>
                </div>
                <span style={{
                  fontSize: 10.5,
                  fontWeight: 900,
                  background: 'var(--teal)',
                  color: '#081018',
                  padding: '3px 10px',
                  borderRadius: 20,
                  letterSpacing: '0.5px'
                }}>
                  1 TOQUE · PADRÃO
                </span>
              </div>

              <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.5 }}>
                Gera o arquivo oficial de agenda (.vcf) com todos os <strong>{validUsers.length} contatos</strong> unificados e já organizados com os prefixos dos lotes (T1, T2, T3...).<br />
                Ao clicar abaixo no seu celular, ele abre <strong>direto o app de Contatos do iPhone ou Android</strong> perguntando se deseja salvar todos de uma só vez!
              </div>

              <button
                type="button"
                className="btn btn-teal"
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  fontSize: 14,
                  fontWeight: 900,
                  margin: '4px 0 0 0',
                  borderRadius: 12,
                  boxShadow: '0 6px 20px rgba(0, 229, 155, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  cursor: 'pointer'
                }}
                onClick={handleExportAllBatches}
              >
                <span>📥</span> Salvar Todos no Celular (.vcf - 1 Toque)
              </button>
            </div>



            {/* Rodapé de Navegação da Etapa 2 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 8, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: '9px 16px', fontSize: 12.5, margin: 0 }}
                onClick={() => setBotStep(1)}
              >
                ← Voltar: 1. Conexão
              </button>

              <button
                type="button"
                className="btn btn-teal"
                style={{ padding: '9px 18px', fontSize: 12.5, fontWeight: 900, margin: 0 }}
                onClick={() => setBotStep(3)}
              >
                Avançar para Etapa 3 (Transmissão) →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 🟢 ETAPA 3: TRANSMISSÃO & VERIFICAÇÃO (1 VS 2 TRAÇOS)     */}
      {/* ========================================================= */}
      {botStep === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
            {/* Cabeçalho com Título */}
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
                  ETAPA 3: TRANSMISSÃO & VERIFICAÇÃO (1 VS 2 TRAÇOS)
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2 }}>
                  Monitore o alcance das listas de transmissão e audite a entrega em tempo real
                </div>
              </div>
            </div>

            {/* Cartão de Destaque: Auditoria de Entrega Automática (1 vs 2 Traços) */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(0, 229, 155, 0.12) 0%, rgba(15, 23, 42, 0.8) 100%)',
              border: '1.5px solid var(--teal)',
              borderRadius: 16,
              padding: '20px 22px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              boxShadow: '0 6px 20px rgba(0, 229, 155, 0.15)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    background: 'var(--teal)',
                    color: '#081018',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    fontWeight: 900
                  }}>
                    ✓✓
                  </span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: '#fff' }}>
                      Auditoria de Entrega Automática (Últimos 15 Minutos)
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2 }}>
                      Identifique instantaneamente quem recebeu sua transmissão e quem ainda não tem o número salvo
                    </div>
                  </div>
                </div>

                <span style={{
                  fontSize: 11,
                  background: 'rgba(0, 229, 155, 0.2)',
                  color: 'var(--teal)',
                  padding: '3px 10px',
                  borderRadius: 20,
                  fontWeight: 800,
                  border: '1px solid var(--teal)'
                }}>
                  ⏱ JANELA 15 MIN
                </span>
              </div>

              <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6 }}>
                1. Dispare sua mensagem na Lista de Transmissão oficial no WhatsApp do Dr. Cândido.<br />
                2. Clique no botão abaixo: o robô examina os últimos <strong>15 minutos</strong> e cruza os números.<br />
                3. Se o contato recebeu a mensagem enviada, ele é confirmado com <strong>2 traços (✓✓ Salvo na Agenda)</strong>. Se não recebeu, permanece com <strong>1 traço (⏱ Pendente)</strong>.
              </div>

              {/* Ações de Auditoria: Executar e Limpar posicionado abaixo */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                <div>
                  <button
                    type="button"
                    className="btn btn-teal"
                    style={{
                      padding: '13px 24px',
                      fontSize: 14,
                      fontWeight: 900,
                      margin: 0,
                      borderRadius: 12,
                      boxShadow: '0 4px 16px rgba(0, 229, 155, 0.35)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer'
                    }}
                    onClick={() => setShowBroadcastTestModal(true)}
                  >
                    <span style={{ fontWeight: 900 }}>✓✓</span> Executar Auditoria de 15 Minutos
                  </button>
                </div>

                <div>
                  <button
                    type="button"
                    className="btn"
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      padding: '8px 14px',
                      margin: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      borderRadius: 8,
                      background: 'rgba(240, 107, 76, 0.1)',
                      color: '#FF8A65',
                      border: '1px solid rgba(240, 107, 76, 0.25)',
                      cursor: resettingAnalysis ? 'not-allowed' : 'pointer',
                      opacity: resettingAnalysis ? 0.6 : 1,
                      transition: 'all 0.2s ease'
                    }}
                    onClick={handleResetAnalyzedData}
                    disabled={resettingAnalysis || syncingContacts || isTestingRunning}
                    title="Limpar todos os dados analisados e resetar contatos para Pendentes"
                  >
                    <span>🧹</span> {resettingAnalysis ? 'Limpando...' : 'Limpar Dados Analisados (Resetar para Pendentes)'}
                  </button>
                </div>
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
                  cursor: 'pointer'
                }}
                onClick={() => { setContactFilterModal('with_number'); setModalSearch(''); setModalPage(1); }}
                title="Clique para ver a lista de contatos confirmados"
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: '#25D366', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Salvos na Agenda
                  </span>
                  <span style={{ fontSize: 10, background: 'rgba(37, 211, 102, 0.2)', color: '#25D366', padding: '2px 6px', borderRadius: 6, fontWeight: 800 }}>
                    Prontos (✓✓)
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
                  cursor: 'pointer'
                }}
                onClick={() => { setContactFilterModal('without_number'); setModalSearch(''); setModalPage(1); }}
                title="Clique para ver a lista de contatos pendentes"
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: '#FF8A65', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Pendentes
                  </span>
                  <span style={{ fontSize: 10, background: 'rgba(240, 107, 76, 0.2)', color: '#FF8A65', padding: '2px 6px', borderRadius: 6, fontWeight: 800 }}>
                    1 Traço (⏱)
                  </span>
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#FF8A65', marginTop: 6 }}>
                  {withoutNumberUsers.length.toLocaleString('pt-BR')}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(240, 107, 76, 0.8)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>⏱</span> Sem o número salvo
                </div>
              </div>

              {/* Card: Cobertura */}
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

            {/* Rodapé de Navegação da Etapa 3 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: '9px 16px', fontSize: 12.5, margin: 0 }}
                onClick={() => setBotStep(2)}
              >
                ← Voltar: 2. Salvar Agendas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
