import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  getEvolutionConfig,
  saveEvolutionConfig,
  loadEvolutionConfig,
  testEvolutionServerConnection,
  fetchInstanceStatus,
  createOrConnectInstance,
  getPairingCode,
  disconnectInstance,
  disconnectAndRotateInstance,
  resetAndRecreateInstance,
  fetchWhatsAppChats,
  fetchWhatsAppContacts,
  buildLidPhoneMapping,
  fetchFullChatHistory,
  fetchMediaBase64FromMessage,
  extractCleanPhone,
  getPhoneSignatures,
  fetchRecentMessagesSummary,
  isValidBrazilianDdd,
  isRealBrazilianPhone,
  normalizeBrazilianPhoneWith9
} from '../lib/evolutionApi';

export function FinancialDebtAuditTab({ status, setShowConnectModal, config }) {
  // ── ESTADOS DE CONEXÃO WHATSAPP WEB INTEGRADA ──
  const [showConnectModalLocal, setShowConnectModalLocal] = useState(false);
  const [connectTab, setConnectTab] = useState('qr'); // 'qr' | 'pairing'
  const [qrCodeData, setQrCodeData] = useState(null);
  const [pairingPhone, setPairingPhone] = useState('');
  const [pairingCodeResult, setPairingCodeResult] = useState(null);
  const [generatingPairing, setGeneratingPairing] = useState(false);
  const [loadingQr, setLoadingQr] = useState(false);
  const [resettingInstance, setResettingInstance] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connStatus, setConnStatus] = useState(status || { connected: false });

  // Contato padrão da Etapa 1: Estela 22 (61) 99320-9444
  const DEFAULT_AUDIT_CONTACT = {
    jid: '5561993209444@s.whatsapp.net',
    phone: '5561993209444',
    displayPhone: '(61) 99320-9444',
    name: 'Estela 22',
    lid: null,
    candidateJids: [
      '5561993209444@s.whatsapp.net',
      '556193209444@s.whatsapp.net',
      '61993209444@s.whatsapp.net',
      '6193209444@s.whatsapp.net'
    ]
  };

  // ── SELEÇÃO DE CONTATO / CREDOR ──
  const [chats, setChats] = useState([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [selectedContact, setSelectedContact] = useState(() => ({ ...DEFAULT_AUDIT_CONTACT })); // { jid, name, phone }
  const [manualPhone, setManualPhone] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [linkingChat, setLinkingChat] = useState(null); // Chat com ID privado sendo vinculado manualmente
  const [linkingPhoneInput, setLinkingPhoneInput] = useState('');

  // ── PASSO 2: MODO MANUAL VS MODO AUTOMÁTICO ──
  const [step2Mode, setStep2Mode] = useState('auto'); // 'auto' (padrão com IA no final) | 'manual'

  // MODO MANUAL: Débitos cadastrados pelo usuário
  const [debtConditions, setDebtConditions] = useState(() => {
    try {
      const saved = localStorage.getItem('wa_audit_debt_conditions');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showAddCondition, setShowAddCondition] = useState(false);
  const [conditionForm, setConditionForm] = useState({
    type: 'loan',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    monthlyRate: '10',
    description: ''
  });

  // MODO AUTOMÁTICO: Débitos detectados pelo robô / IA
  const [autoDetectedDebts, setAutoDetectedDebts] = useState(() => {
    try {
      const saved = localStorage.getItem('wa_audit_auto_debts');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isScanningAuto, setIsScanningAuto] = useState(false);
  const [autoScanSummary, setAutoScanSummary] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem('wa_audit_debt_conditions', JSON.stringify(debtConditions));
    } catch (e) {}
  }, [debtConditions]);

  useEffect(() => {
    try {
      localStorage.setItem('wa_audit_auto_debts', JSON.stringify(autoDetectedDebts));
    } catch (e) {}
  }, [autoDetectedDebts]);

  // Monitoramento contínuo de conexão
  useEffect(() => {
    async function checkStatus() {
      try {
        const st = await fetchInstanceStatus();
        setConnStatus(st);
        if (st.connected && chats.length === 0) {
          loadChats();
        }
      } catch (e) {}
    }
    checkStatus();
    const interval = setInterval(checkStatus, 4000);
    return () => clearInterval(interval);
  }, []);

  // Auto-fechamento do modal de conexão SOMENTE quando QR Code ou Pareamento ativo for escaneado/conectado
  useEffect(() => {
    if (!showConnectModalLocal) return;
    const interval = setInterval(async () => {
      try {
        const st = await fetchInstanceStatus();
        // Só fecha automaticamente se a tela estava ativamente aguardando leitura do QR ou Pareamento
        if (st?.connected && (qrCodeData || pairingCodeResult)) {
          setConnStatus(st);
          setShowConnectModalLocal(false);
          setQrCodeData(null);
          setPairingCodeResult(null);
          loadChats();
        } else if (st) {
          setConnStatus(st);
        }
      } catch (e) {}
    }, 2500);
    return () => clearInterval(interval);
  }, [showConnectModalLocal, qrCodeData, pairingCodeResult]);

  // ── COMPROVANTES AVULSOS ENVIADOS PELO USUÁRIO (PRINTS / PIX) ──
  const [uploadedReceipts, setUploadedReceipts] = useState([]);
  const [uploadingReceipts, setUploadingReceipts] = useState(false);

  // ── BACKUP / CONVERSA EXPORTADA (ARQUIVO .TXT OU .ZIP) ──
  const [uploadedChatFile, setUploadedChatFile] = useState(null);

  // ── ESTADOS DE EXECUÇÃO DA PERÍCIA ──
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditProgress, setAuditProgress] = useState({ current: 0, total: 100, stepLabel: '' });
  const [auditLogs, setAuditLogs] = useState([]);
  const abortAuditRef = useRef(false);
  const logEndRef = useRef(null);

  // ── RESULTADOS E LAUDO PERICIAL ──
  const [auditResult, setAuditResult] = useState(null);
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'dialogue' | 'receipts' | 'transcripts'
  const [dialogSearch, setDialogSearch] = useState('');
  const [dialogFilter, setDialogFilter] = useState('all'); // 'all' | 'audio' | 'text' | 'financial' | 'image'

  // ── CONFIGURAÇÃO EVOLUTION API (RAILWAY) ──
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [apiConfig, setApiConfig] = useState(() => getEvolutionConfig());
  const [testingConn, setTestingConn] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [connectError, setConnectError] = useState(null);

  // ── SISTEMA DE NAVEGAÇÃO EM ETAPAS (WIZARD STEPPER) ──
  // 1: Credor | 2: Empréstimos & Juros | 3: Comprovantes & Mídia | 4: Executar & Laudo
  const [wizardStep, setWizardStep] = useState(1);

  // ── PASSO 3: VALOR TOTAL PAGO CONSOLIDADO (MANUAL) ──
  const [manualTotalPaidInput, setManualTotalPaidInput] = useState(() => {
    return localStorage.getItem('wa_audit_manual_total_paid') || '';
  });
  const [manualTotalPaidSaved, setManualTotalPaidSaved] = useState(() => {
    const v = localStorage.getItem('wa_audit_manual_total_paid');
    return v ? parseFloat(v) : null;
  });
  const [manualPaidDate, setManualPaidDate] = useState(() => {
    return localStorage.getItem('wa_audit_manual_paid_date') || new Date().toISOString().slice(0, 10);
  });

  function handleSaveManualTotalPaid() {
    const cleaned = (manualTotalPaidInput || '').replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
    const num = parseFloat(cleaned);
    if (isNaN(num) || num <= 0) {
      alert('Por favor, digite um valor válido maior que zero (ex: 15000,00).');
      return;
    }
    setManualTotalPaidSaved(num);
    localStorage.setItem('wa_audit_manual_total_paid', String(num));
    localStorage.setItem('wa_audit_manual_paid_date', manualPaidDate);
    alert(`✓ Valor total pago de R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} salvo com sucesso! A perícia utilizará este montante para calcular a amortização e restituição.`);
  }

  function handleClearManualTotalPaid() {
    setManualTotalPaidInput('');
    setManualTotalPaidSaved(null);
    localStorage.removeItem('wa_audit_manual_total_paid');
  }

  // ── SELEÇÃO DE PERÍODO DE PERÍCIA (ETAPA 3) ──
  const [auditPeriodMode, setAuditPeriodMode] = useState('full'); // 'full' = da primeira à última | 'custom' = período específico
  const [auditDateStart, setAuditDateStart] = useState('');
  const [auditDateEnd, setAuditDateEnd] = useState('');
  const [auditElapsedSeconds, setAuditElapsedSeconds] = useState(0);
  const auditElapsedTimerRef = useRef(null);

  // ── POP-UP COM CRONÔMETRO REGRESSIVO DE 3 MINUTOS (180s) & FEED AO VIVO ──
  const [showAuditProgressModal, setShowAuditProgressModal] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(180);
  const countdownTimerRef = useRef(null);
  const [liveDialogueFeed, setLiveDialogueFeed] = useState([]);
  const [liveModalTab, setLiveModalTab] = useState('dialogue'); // 'dialogue' | 'logs'
  const [myUserName, setMyUserName] = useState(() => localStorage.getItem('wa_audit_my_name') || 'Ozeias');
  const [liveTotalMsgs, setLiveTotalMsgs] = useState(0);
  const liveFeedEndRef = useRef(null);

  useEffect(() => {
    if (liveFeedEndRef.current) {
      liveFeedEndRef.current.scrollTop = liveFeedEndRef.current.scrollHeight;
    }
  }, [liveDialogueFeed]);

  useEffect(() => {
    if (showAuditProgressModal && isAuditing) {
      setAuditElapsedSeconds(0);
      if (auditElapsedTimerRef.current) clearInterval(auditElapsedTimerRef.current);
      auditElapsedTimerRef.current = setInterval(() => {
        setAuditElapsedSeconds(prev => prev + 1);
      }, 1000);
      countdownTimerRef.current = setInterval(() => {
        setCountdownSeconds(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    } else {
      if (auditElapsedTimerRef.current) clearInterval(auditElapsedTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    }
    return () => {
      if (auditElapsedTimerRef.current) clearInterval(auditElapsedTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [showAuditProgressModal, isAuditing]);

  function formatCountdown(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  async function handleSaveConfig(e) {
    if (e) e.preventDefault();
    await saveEvolutionConfig(apiConfig);
    alert('Configurações da Evolution API salvas com sucesso!');
    setShowConfigModal(false);
    handleFetchQr();
  }

  async function handleTestConn() {
    setTestingConn(true);
    setTestResult(null);
    try {
      const res = await testEvolutionServerConnection(apiConfig.serverUrl, apiConfig.apiKey);
      setTestResult(res);
    } catch (err) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTestingConn(false);
    }
  }

  function addLog(msg, type = 'info') {
    const time = new Date().toLocaleTimeString('pt-BR');
    setAuditLogs(prev => [...prev.slice(-300), { time, msg, type }]);
  }

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollTop = logEndRef.current.scrollHeight;
    }
  }, [auditLogs]);

  // ── CONEXÃO COM WHATSAPP (QR CODE & PAIRING CODE) ──
  async function handleOpenConnectModal() {
    setShowConnectModalLocal(true);
    setConnectError(null);
    if (setShowConnectModal) setShowConnectModal(true);
    handleFetchQr();
  }

  async function handleFetchQr(forceNew = false) {
    setLoadingQr(true);
    setConnectError(null);
    try {
      if (forceNew) {
        const rotRes = await disconnectAndRotateInstance().catch(() => null);
        let rotB64 = rotRes?.qrcode?.base64 || rotRes?.base64 || (typeof rotRes?.qrcode === 'string' ? rotRes.qrcode : null);
        if (rotB64) {
          setQrCodeData(rotB64);
          setConnectError(null);
          return;
        }
      }

      const res = await createOrConnectInstance();

      let b64 = null;
      if (typeof res === 'string' && res.length > 50) {
        b64 = res;
      } else if (res?.qrcode?.base64) {
        b64 = res.qrcode.base64;
      } else if (res?.base64) {
        b64 = res.base64;
      } else if (typeof res?.qrcode === 'string' && res.qrcode.length > 50) {
        b64 = res.qrcode;
      }

      if (b64) {
        setQrCodeData(b64);
        setConnectError(null);
      } else if (res?.instance?.state === 'open' || res?.state === 'open' || res?.status === 'open') {
        setConnStatus({ connected: true, state: 'open' });
        setConnectError('O servidor informa que há uma sessão aberta. Se você NÃO estiver conectado no celular, use o botão "🔌 Limpar Sessão e Gerar Novo QR Code" abaixo.');
      } else {
        // Tenta rotação limpa para obter um QR Code novo
        const retry = await disconnectAndRotateInstance().catch(() => null);
        const retryB64 = retry?.qrcode?.base64 || retry?.base64;
        if (retryB64) {
          setQrCodeData(retryB64);
          setConnectError(null);
        }
      }
    } catch (err) {
      console.warn('Erro ao gerar QR Code:', err);
      const errMsg = err.message || '';
      setConnectError(errMsg || 'Servidor inacessível');
    } finally {
      setLoadingQr(false);
    }
  }

  // 🔌 Desconectar WhatsApp e limpar sessão travada no servidor com rotação de instância
  async function handleDisconnectWhatsApp(forceNewInstance = true) {
    if (!window.confirm('Deseja realmente desconectar o WhatsApp e limpar a sessão travada?\n\nIsso removerá a sessão antiga do servidor e gerará um novo QR Code limpo para você escanear no celular.')) return;
    setDisconnecting(true);
    setConnectError(null);
    setQrCodeData(null);
    setPairingCodeResult(null);
    try {
      const res = await disconnectAndRotateInstance();
      setConnStatus({ connected: false, state: 'close' });
      setChats([]);
      setSelectedContact(null);

      // Extrai o novo QR Code retornado pela instância recém-criada
      let b64 = null;
      if (typeof res === 'string' && res.length > 50) {
        b64 = res;
      } else if (res?.qrcode?.base64) {
        b64 = res.qrcode.base64;
      } else if (res?.base64) {
        b64 = res.base64;
      } else if (typeof res?.qrcode === 'string' && res.qrcode.length > 50) {
        b64 = res.qrcode;
      }

      if (b64) {
        setQrCodeData(b64);
        setConnectError(null);
      }
      setShowConnectModalLocal(true);
      if (!b64) {
        setTimeout(() => {
          handleFetchQr();
        }, 500);
      }
    } catch (err) {
      alert('Erro ao desconectar WhatsApp: ' + (err.message || err));
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleGeneratePairing(e) {
    if (e) e.preventDefault();
    const clean = extractCleanPhone(pairingPhone);
    if (!clean || clean.length < 8) {
      alert('Por favor, informe seu número de WhatsApp com DDD (ex: 61999998888).');
      return;
    }
    setGeneratingPairing(true);
    try {
      const res = await getPairingCode(clean);
      const codeStr = res?.code || res?.pairingCode || (typeof res === 'string' ? res : '');
      if (codeStr) {
        setPairingCodeResult(codeStr);
      } else {
        alert('Código de pareamento não retornado. Verifique se o servidor está ativo.');
      }
    } catch (err) {
      alert('Erro ao gerar código de pareamento: ' + err.message);
    } finally {
      setGeneratingPairing(false);
    }
  }

  async function handleResetSession() {
    setResettingInstance(true);
    setConnectError(null);
    setQrCodeData(null);
    setPairingCodeResult(null);
    try {
      const res = await disconnectAndRotateInstance();
      let b64 = res?.qrcode?.base64 || res?.base64 || (typeof res?.qrcode === 'string' ? res.qrcode : null);
      if (b64) {
        setQrCodeData(b64);
        setConnectError(null);
      } else {
        await handleFetchQr();
      }
      alert('Sessão renovada com sucesso! Escaneie o novo QR Code gerado.');
    } catch (err) {
      const msg = err.message || 'Erro ao reiniciar sessão';
      setConnectError(msg);
      alert('Aviso do Servidor: ' + msg);
    } finally {
      setResettingInstance(false);
    }
  }

  // Função auxiliar: formatar número brasileiro de forma limpa e legível (ex: (61) 99999-8888)
  function formatPhoneBR(raw) {
    if (!raw) return '';
    let clean = String(raw).replace(/\D/g, '');
    if (clean.startsWith('55') && clean.length >= 12) {
      clean = clean.substring(2);
    } else if (clean.startsWith('0') && clean.length >= 11) {
      clean = clean.substring(1);
    }
    // Auto-adiciona 9 se for celular brasileiro com 10 dígitos (ex: 61 9320-9444 -> 61 99320-9444)
    if (clean.length === 10 && ['6', '7', '8', '9'].includes(clean.charAt(2))) {
      clean = `${clean.substring(0, 2)}9${clean.substring(2)}`;
    }
    if (clean.length === 11) {
      const ddd = clean.slice(0, 2);
      if (isValidBrazilianDdd(ddd)) {
        return `(${ddd}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
      }
    }
    if (clean.length === 10) {
      const ddd = clean.slice(0, 2);
      if (isValidBrazilianDdd(ddd)) {
        return `(${ddd}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
      }
    }
    return '';
  }

  // Carregar conversas ativas e contatos reais do WhatsApp (Unificação Completa de Contatos)
  async function loadChats() {
    setLoadingChats(true);
    try {
      const [chatList, contactList, recentMsgs] = await Promise.all([
        fetchWhatsAppChats().catch(() => []),
        fetchWhatsAppContacts().catch(() => []),
        fetchRecentMessagesSummary(300).catch(() => [])
      ]);

      const lidToPhone = await buildLidPhoneMapping(chatList, recentMsgs, contactList);

      // Carrega vínculos manuais persistidos de telefones salvos pelo usuário
      let customPhones = {};
      try {
        customPhones = JSON.parse(localStorage.getItem('wa_custom_contact_phones') || '{}');
      } catch (e) {}

      // Identifica número do dono para não listar a si mesmo como credor
      let ownerClean = '';
      try {
        const cfg = getEvolutionConfig();
        const st = await fetchInstanceStatus().catch(() => null);
        const ownerJid = st?.instance?.ownerJid || st?.ownerJid || cfg?.ownerJid || '';
        if (ownerJid) ownerClean = extractCleanPhone(ownerJid);
      } catch (e) {}

      // Mapeamento de contatos com TODAS as variações telefônicas brasileiras
      const contactsMap = new Map();
      (contactList || []).forEach(ct => {
        const ctId = ct.id || ct.remoteJid || ct.jid || '';
        const lowerId = ctId.toLowerCase();
        const ctDigits = extractCleanPhone(ctId);
        const ctName = ct.name || ct.verifiedName || ct.pushName || ct.notify || ct.shortName || '';

        const savedPhone = customPhones[ctDigits] || customPhones[lowerId] || (ctName ? customPhones[ctName.toLowerCase()] : '');

        let ctPhone = '';
        if (savedPhone && isRealBrazilianPhone(savedPhone)) {
          ctPhone = savedPhone;
        } else if (lidToPhone.has(ctDigits)) {
          ctPhone = lidToPhone.get(ctDigits);
        } else if (isRealBrazilianPhone(ct.phoneNumber)) {
          ctPhone = extractCleanPhone(ct.phoneNumber);
        } else if (isRealBrazilianPhone(ct.number)) {
          ctPhone = extractCleanPhone(ct.number);
        } else if (isRealBrazilianPhone(ct.remoteJidAlt)) {
          ctPhone = extractCleanPhone(ct.remoteJidAlt);
        } else if (isRealBrazilianPhone(ctDigits) && !lowerId.includes('@lid')) {
          ctPhone = ctDigits;
        }

        const ctData = { ...ct, resolvedPhone: ctPhone, name: ctName };

        if (ctId) {
          contactsMap.set(ctId.toLowerCase(), ctData);
        }
        if (ctPhone && isRealBrazilianPhone(ctPhone)) {
          getPhoneSignatures(ctPhone).forEach(sig => {
            contactsMap.set(sig, ctData);
          });
        }
      });

      // Mapa para unir conversas ativas e contatos salvos sem duplicidades
      const mergedMap = new Map();

      // 1. Processa conversas ativas do WhatsApp
      (chatList || []).forEach(c => {
        const rawJid = c.id || c.remoteJid || c.jid || '';
        const lowerJid = rawJid.toLowerCase();
        if (!rawJid || lowerJid.includes('@g.us') || lowerJid.includes('@broadcast') || lowerJid.includes('status@broadcast')) return;

        let cleanDigits = extractCleanPhone(rawJid);
        let isLid = lowerJid.includes('@lid');
        let lid = isLid ? rawJid : (c.lid || null);

        const ct = contactsMap.get(lowerJid) || {};
        const bestName = ct.name || c.name || ct.verifiedName || c.pushName || ct.pushName || c.lastMessage?.pushName || '';

        const savedPhone = customPhones[cleanDigits] || customPhones[lowerJid] || (bestName ? customPhones[bestName.toLowerCase()] : '');

        let realPhone = '';
        if (savedPhone && isRealBrazilianPhone(savedPhone)) {
          realPhone = savedPhone;
        } else if (lidToPhone.has(cleanDigits)) {
          realPhone = lidToPhone.get(cleanDigits);
        } else if (isRealBrazilianPhone(c.phoneNumber)) {
          realPhone = extractCleanPhone(c.phoneNumber);
        } else if (isRealBrazilianPhone(c.remoteJidAlt)) {
          realPhone = extractCleanPhone(c.remoteJidAlt);
        } else if (isRealBrazilianPhone(c.lastMessage?.key?.remoteJidAlt)) {
          realPhone = extractCleanPhone(c.lastMessage.key.remoteJidAlt);
        } else if (contactsMap.has(lowerJid) && contactsMap.get(lowerJid).resolvedPhone) {
          realPhone = contactsMap.get(lowerJid).resolvedPhone;
        } else if (isRealBrazilianPhone(cleanDigits) && !isLid) {
          realPhone = cleanDigits;
        }

        const key = (realPhone && isRealBrazilianPhone(realPhone)) ? realPhone : lowerJid;
        mergedMap.set(key, {
          rawJid,
          lid,
          realPhone: isRealBrazilianPhone(realPhone) ? realPhone : '',
          displayName: bestName,
          lastActivity: c.conversationTimestamp || c.timestamp || c.updatedAt || 0,
          source: 'chat'
        });
      });

      // 2. Processa mensagens recentes para achar conversas ativas extras
      (recentMsgs || []).forEach(m => {
        const rawJid = m.key?.remoteJid || '';
        const lowerJid = rawJid.toLowerCase();
        if (!rawJid || lowerJid.includes('@g.us') || lowerJid.includes('@broadcast') || lowerJid.includes('status@broadcast')) return;

        let cleanDigits = extractCleanPhone(rawJid);
        let isLid = lowerJid.includes('@lid');
        let lid = isLid ? rawJid : null;

        const ct = contactsMap.get(lowerJid) || {};
        const pushName = m.pushName || '';
        const bestName = ct.name || ct.verifiedName || pushName || ct.pushName || '';
        const msgTime = m.messageTimestamp || 0;

        const savedPhone = customPhones[cleanDigits] || customPhones[lowerJid] || (bestName ? customPhones[bestName.toLowerCase()] : '');

        let realPhone = '';
        if (savedPhone && isRealBrazilianPhone(savedPhone)) {
          realPhone = savedPhone;
        } else if (lidToPhone.has(cleanDigits)) {
          realPhone = lidToPhone.get(cleanDigits);
        } else if (isRealBrazilianPhone(m.key?.remoteJidAlt)) {
          realPhone = extractCleanPhone(m.key.remoteJidAlt);
        } else if (isRealBrazilianPhone(cleanDigits) && !isLid) {
          realPhone = cleanDigits;
        }

        const key = (realPhone && isRealBrazilianPhone(realPhone)) ? realPhone : lowerJid;
        if (mergedMap.has(key)) {
          const existing = mergedMap.get(key);
          if (!existing.displayName && bestName) existing.displayName = bestName;
          if (msgTime > (existing.lastActivity || 0)) existing.lastActivity = msgTime;
          if (!existing.realPhone && isRealBrazilianPhone(realPhone)) existing.realPhone = realPhone;
          if (!existing.lid && lid) existing.lid = lid;
        } else {
          mergedMap.set(key, {
            rawJid,
            lid,
            realPhone: isRealBrazilianPhone(realPhone) ? realPhone : '',
            displayName: bestName,
            lastActivity: msgTime,
            source: 'message'
          });
        }
      });

      // 3. Processa a agenda de contatos do telefone (garante contatos salvos mesmo sem mensagens recentes)
      (contactList || []).forEach(ct => {
        const ctId = ct.id || ct.remoteJid || ct.jid || '';
        const lowerId = ctId.toLowerCase();
        if (lowerId.includes('@g.us') || lowerId.includes('@broadcast')) return;

        let ctDigits = extractCleanPhone(ctId);
        let isLid = lowerId.includes('@lid');
        let lid = isLid ? ctId : (ct.lid || null);

        const ctName = ct.name || ct.verifiedName || ct.pushName || ct.notify || ct.shortName || '';
        const savedPhone = customPhones[ctDigits] || customPhones[lowerId] || (ctName ? customPhones[ctName.toLowerCase()] : '');

        let realPhone = '';
        if (savedPhone && isRealBrazilianPhone(savedPhone)) {
          realPhone = savedPhone;
        } else if (lidToPhone.has(ctDigits)) {
          realPhone = lidToPhone.get(ctDigits);
        } else if (isRealBrazilianPhone(ct.phoneNumber)) {
          realPhone = extractCleanPhone(ct.phoneNumber);
        } else if (isRealBrazilianPhone(ct.number)) {
          realPhone = extractCleanPhone(ct.number);
        } else if (isRealBrazilianPhone(ct.remoteJidAlt)) {
          realPhone = extractCleanPhone(ct.remoteJidAlt);
        } else if (isRealBrazilianPhone(ctDigits) && !isLid) {
          realPhone = ctDigits;
        }

        const key = (realPhone && isRealBrazilianPhone(realPhone)) ? realPhone : lowerId;

        if (mergedMap.has(key)) {
          const existing = mergedMap.get(key);
          if (!existing.displayName && ctName) existing.displayName = ctName;
          if (!existing.realPhone && isRealBrazilianPhone(realPhone)) existing.realPhone = realPhone;
        } else {
          mergedMap.set(key, {
            rawJid: ctId,
            lid,
            realPhone: isRealBrazilianPhone(realPhone) ? realPhone : '',
            displayName: ctName,
            lastActivity: 0,
            source: 'contact'
          });
        }
      });

      // 4. Monta lista final normalizada para o componente
      const finalChats = [];
      for (const [key, item] of mergedMap.entries()) {
        // Ignora a própria conta do usuário
        if (ownerClean && (item.realPhone === ownerClean || item.realPhone.startsWith(ownerClean) || ownerClean.startsWith(item.realPhone))) {
          continue;
        }

        const hasRealPhone = Boolean(item.realPhone && isRealBrazilianPhone(item.realPhone));
        const phone = hasRealPhone ? item.realPhone : '';
        const formattedPhone = hasRealPhone ? formatPhoneBR(phone) : '';
        const name = item.displayName ? item.displayName.trim() : '';

        // JIDs candidatos para busca de mensagens
        const candidateJids = [item.rawJid];
        if (phone) {
          let pDigits = phone.startsWith('55') ? phone.substring(2) : phone;
          let pWith9 = pDigits;
          let pWithout9 = pDigits;
          if (pDigits.length === 10 && ['6', '7', '8', '9'].includes(pDigits.charAt(2))) {
            pWith9 = `${pDigits.substring(0, 2)}9${pDigits.substring(2)}`;
          } else if (pDigits.length === 11 && pDigits.charAt(2) === '9') {
            pWithout9 = `${pDigits.substring(0, 2)}${pDigits.substring(3)}`;
          }
          candidateJids.push(`55${pWith9}@s.whatsapp.net`);
          candidateJids.push(`${pWith9}@s.whatsapp.net`);
          candidateJids.push(`55${pWithout9}@s.whatsapp.net`);
          candidateJids.push(`${pWithout9}@s.whatsapp.net`);
        }
        if (item.lid) candidateJids.push(item.lid);

        finalChats.push({
          id: item.rawJid,
          remoteJid: item.rawJid,
          rawJid: item.rawJid,
          lid: item.lid,
          realPhone: phone,
          displayPhone: formattedPhone || (hasRealPhone ? phone : ''),
          displayName: name || (formattedPhone ? formattedPhone : 'Contato WhatsApp'),
          hasCustomName: Boolean(name),
          hasRealPhone,
          lastActivity: item.lastActivity || 0,
          candidateJids: Array.from(new Set(candidateJids.filter(Boolean)))
        });
      }

      // Ordenação: 
      // 0. Contato padrão "Estela 22" / 61 99320-9444 em PRIMEIRO LUGAR
      // 1. Quem tem telefone real verificado no topo
      // 2. Quem tem nome salvo na agenda no topo
      // 3. Quem teve mensagem/interação mais recente
      // 4. Ordem alfabética
      finalChats.sort((a, b) => {
        const isEstelaA = (a.displayName || '').toLowerCase().includes('estela 22') || (a.realPhone || '').includes('61993209444') || (a.realPhone || '').includes('6193209444');
        const isEstelaB = (b.displayName || '').toLowerCase().includes('estela 22') || (b.realPhone || '').includes('61993209444') || (b.realPhone || '').includes('6193209444');
        if (isEstelaA && !isEstelaB) return -1;
        if (!isEstelaA && isEstelaB) return 1;

        if (a.hasRealPhone && !b.hasRealPhone) return -1;
        if (!a.hasRealPhone && b.hasRealPhone) return 1;
        if (a.hasCustomName && !b.hasCustomName) return -1;
        if (!a.hasCustomName && b.hasCustomName) return 1;
        if (a.lastActivity && b.lastActivity && a.lastActivity !== b.lastActivity) {
          return b.lastActivity - a.lastActivity;
        }
        return (a.displayName || '').localeCompare(b.displayName || '');
      });

      setChats(finalChats);

      // Se o contato padrão Estela estiver ativo, sincroniza e agrega os JIDs de todas as conversas encontradas com "Estela"
      const estelaChats = finalChats.filter(c => 
        (c.displayName || '').toLowerCase().includes('estela') ||
        (c.realPhone || '').includes('61993209444') ||
        (c.realPhone || '').includes('6193209444')
      );

      if (estelaChats.length > 0) {
        // Ordena para que o chat com mensagem mais recente seja o primário
        estelaChats.sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
        const primaryEstela = estelaChats[0];

        // Coleta todos os LIDs e JIDs de todas as conversas "Estela" para não perder mensagens
        const combinedCandidateJids = new Set([
          '5561993209444@s.whatsapp.net',
          '556193209444@s.whatsapp.net',
          '61993209444@s.whatsapp.net',
          '6193209444@s.whatsapp.net'
        ]);

        estelaChats.forEach(ec => {
          if (ec.rawJid) combinedCandidateJids.add(ec.rawJid);
          if (ec.lid) combinedCandidateJids.add(ec.lid);
          (ec.candidateJids || []).forEach(j => combinedCandidateJids.add(j));
        });

        setSelectedContact(prev => {
          if (!prev || prev.phone === '5561993209444' || (prev.name && prev.name.toLowerCase().includes('estela'))) {
            return {
              jid: primaryEstela.rawJid || '5561993209444@s.whatsapp.net',
              phone: primaryEstela.realPhone || '5561993209444',
              displayPhone: primaryEstela.displayPhone || '(61) 99320-9444',
              name: primaryEstela.displayName || 'Estela 22',
              lid: primaryEstela.lid || null,
              candidateJids: Array.from(combinedCandidateJids)
            };
          }
          return prev;
        });
      }
    } catch (err) {
      console.warn('Erro ao carregar conversas e contatos:', err);
    } finally {
      setLoadingChats(false);
    }
  }

  // Iniciar vínculo manual de telefone para contato com ID privado
  function handlePromptLinkPhone(c) {
    setLinkingChat(c);
    const isEstela = (c.displayName || c.name || '').toLowerCase().includes('estela');
    setLinkingPhoneInput(isEstela ? '(61) 99320-9444' : (c.realPhone || manualPhone || ''));
  }

  // Salvar vínculo manual de telefone com DDD
  function handleSaveLinkedPhone() {
    if (!linkingChat) return;
    let clean = extractCleanPhone(linkingPhoneInput);
    if (!clean || clean.length < 8) {
      alert('Por favor, digite o número com DDD (ex: 61 9320-9444 ou 61 99320-9444).');
      return;
    }
    if (clean.startsWith('55') && clean.length >= 12) {
      clean = clean.substring(2);
    } else if (clean.startsWith('0') && clean.length >= 11) {
      clean = clean.substring(1);
    }

    let cleanSem9 = clean;
    if (clean.length === 10 && ['6', '7', '8', '9'].includes(clean.charAt(2))) {
      // Auto-injeta o 9 (ex: 61 9320-9444 vira 61 99320-9444)
      clean = `${clean.substring(0, 2)}9${clean.substring(2)}`;
    } else if (clean.length === 11 && clean.charAt(2) === '9') {
      cleanSem9 = `${clean.substring(0, 2)}${clean.substring(3)}`;
    }

    const fullPhone = '55' + clean;
    const fullPhoneSem9 = '55' + cleanSem9;
    const dispPhone = formatPhoneBR(fullPhone) || `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
    const rawJid = linkingChat.rawJid || linkingChat.id || '';
    const lid = linkingChat.lid || (rawJid.includes('@lid') ? rawJid : '');
    const cleanLid = extractCleanPhone(lid || rawJid);
    const ctName = linkingChat.displayName || linkingChat.name || '';

    // 1. Salva no localStorage para persistir para sempre
    try {
      const saved = JSON.parse(localStorage.getItem('wa_custom_contact_phones') || '{}');
      if (cleanLid) saved[cleanLid] = fullPhone;
      if (rawJid) saved[rawJid] = fullPhone;
      if (ctName) saved[ctName.toLowerCase()] = fullPhone;
      localStorage.setItem('wa_custom_contact_phones', JSON.stringify(saved));
    } catch (e) {}

    const candidateJids = Array.from(new Set([
      `${fullPhone}@s.whatsapp.net`,
      `${fullPhoneSem9}@s.whatsapp.net`,
      `${clean}@s.whatsapp.net`,
      `${cleanSem9}@s.whatsapp.net`,
      rawJid,
      lid
    ].filter(Boolean)));

    // 2. Atualiza a lista chats em memória na hora!
    setChats(prev => prev.map(item => {
      const isMatch = item.rawJid === rawJid || (cleanLid && (item.lid === lid || item.rawJid?.includes(cleanLid))) || (ctName && item.displayName?.toLowerCase() === ctName.toLowerCase());
      if (isMatch) {
        return {
          ...item,
          realPhone: fullPhone,
          displayPhone: dispPhone,
          hasRealPhone: true,
          candidateJids: Array.from(new Set([...(item.candidateJids || []), ...candidateJids]))
        };
      }
      return item;
    }));

    // 3. Define como contato selecionado para a perícia
    setSelectedContact({
      jid: `${fullPhone}@s.whatsapp.net`,
      phone: fullPhone,
      displayPhone: dispPhone,
      name: ctName || `Credor (${dispPhone})`,
      lid: lid || null,
      candidateJids
    });

    setLinkingChat(null);
    setLinkingPhoneInput('');
  }

  // Selecionar por clique na lista (permite alternar ou desmarcar ao clicar novamente)
  function handleSelectChat(c) {
    const rawJid = c.rawJid || c.id || c.remoteJid || '';
    const phone = c.realPhone || (isRealBrazilianPhone(extractCleanPhone(rawJid)) ? extractCleanPhone(rawJid) : '');
    
    // Se clicar no contato que já está selecionado, desmarca!
    const isCurrent = (rawJid && selectedContact?.jid === rawJid) || 
      (phone && selectedContact?.phone && selectedContact.phone.replace(/\D/g, '') === phone.replace(/\D/g, ''));
    if (isCurrent) {
      setSelectedContact(null);
      return;
    }

    const displayPhone = c.displayPhone || (phone ? formatPhoneBR(phone) : '');
    const contactName = c.displayName || c.name || c.pushName || c.subject || (displayPhone ? `Contato ${displayPhone}` : 'Credor');
    setSelectedContact({
      jid: rawJid,
      phone: phone || rawJid,
      displayPhone,
      name: contactName,
      lid: c.lid,
      candidateJids: c.candidateJids || [rawJid, `${phone}@s.whatsapp.net`].filter(Boolean)
    });
  }

  // Definir por número digitado
  function handleSetManualPhone() {
    let clean = extractCleanPhone(manualPhone);
    if (!clean || clean.length < 8) {
      alert('Por favor, digite um número de telefone válido com DDD (ex: 61 9320-9444 ou 61 99320-9444).');
      return;
    }
    if (clean.startsWith('55') && clean.length >= 12) {
      clean = clean.substring(2);
    } else if (clean.startsWith('0') && clean.length >= 11) {
      clean = clean.substring(1);
    }

    let cleanSem9 = clean;
    if (clean.length === 10 && ['6', '7', '8', '9'].includes(clean.charAt(2))) {
      // Auto-injeta o nono dígito (ex: 61 9320-9444 vira 61 99320-9444)
      clean = `${clean.substring(0, 2)}9${clean.substring(2)}`;
    } else if (clean.length === 11 && clean.charAt(2) === '9') {
      cleanSem9 = `${clean.substring(0, 2)}${clean.substring(3)}`;
    }

    const fullPhone = '55' + clean;
    const fullPhoneSem9 = '55' + cleanSem9;
    const jid = fullPhone + '@s.whatsapp.net';
    const displayPhone = formatPhoneBR(fullPhone) || `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;

    // Tenta encontrar se o contato já existe na agenda ou conversas por telefone ou nome
    const sigs = [...getPhoneSignatures(fullPhone), ...getPhoneSignatures(fullPhoneSem9)];
    const foundChat = chats.find(c => {
      const cDigits = (c.realPhone || c.displayPhone || '').replace(/\D/g, '');
      return sigs.some(s => s && (cDigits.includes(s) || s.includes(cDigits)));
    }) || chats.find(c => {
      const q = manualPhone.toLowerCase().trim();
      return q.length >= 3 && (c.displayName || '').toLowerCase().includes(q);
    }) || chats.find(c => {
      return contactSearch && (c.displayName || '').toLowerCase().includes(contactSearch.toLowerCase().trim());
    });

    const contactName = foundChat?.displayName || foundChat?.name || `Credor (${displayPhone})`;
    const rawJid = foundChat?.rawJid || foundChat?.id || '';
    const lid = foundChat?.lid || (rawJid.includes('@lid') ? rawJid : null);
    const cleanLid = extractCleanPhone(lid || rawJid);

    // Salva a vinculação no localStorage
    try {
      const saved = JSON.parse(localStorage.getItem('wa_custom_contact_phones') || '{}');
      if (cleanLid) saved[cleanLid] = fullPhone;
      if (rawJid) saved[rawJid] = fullPhone;
      if (contactName) saved[contactName.toLowerCase()] = fullPhone;
      localStorage.setItem('wa_custom_contact_phones', JSON.stringify(saved));
    } catch (e) {}

    const candidateJids = Array.from(new Set([
      jid,
      `${fullPhoneSem9}@s.whatsapp.net`,
      `${clean}@s.whatsapp.net`,
      `${cleanSem9}@s.whatsapp.net`,
      rawJid,
      lid
    ].filter(Boolean)));

    // Atualiza o contato na lista de chats
    if (foundChat) {
      setChats(prev => prev.map(item => {
        if (item.rawJid === rawJid || (cleanLid && item.rawJid?.includes(cleanLid)) || (contactName && item.displayName === contactName)) {
          return {
            ...item,
            realPhone: fullPhone,
            displayPhone,
            hasRealPhone: true,
            candidateJids: Array.from(new Set([...(item.candidateJids || []), ...candidateJids]))
          };
        }
        return item;
      }));
    }

    setSelectedContact({
      jid,
      phone: fullPhone,
      displayPhone,
      name: contactName,
      lid,
      candidateJids
    });
  }

  // ── GERENCIAMENTO MANUAL DE CONDIÇÕES (PASSO 2: APENAS EMPRÉSTIMOS EM DINHEIRO) ──
  function handleAddCondition(e) {
    if (e) e.preventDefault();
    const val = parseFloat(conditionForm.amount);
    if (!val || val <= 0) {
      alert('Por favor, digite um valor maior que zero.');
      return;
    }
    const rate = parseFloat(conditionForm.monthlyRate);
    if (isNaN(rate) || rate < 0) {
      alert('Por favor, informe a taxa de juros cobrada ao mês.');
      return;
    }

    const newCond = {
      id: Date.now() + Math.random().toString(36).substr(2, 5),
      type: 'loan',
      amount: val,
      date: conditionForm.date || new Date().toISOString().slice(0, 10),
      monthlyRate: rate,
      description: conditionForm.description || 'Empréstimo em Dinheiro (PIX/TED/Espécie)'
    };

    setDebtConditions(prev => {
      const updated = [...prev, newCond];
      updated.sort((a, b) => new Date(a.date) - new Date(b.date));
      return updated;
    });

    setConditionForm({
      type: 'loan',
      amount: '',
      date: new Date().toISOString().slice(0, 10),
      monthlyRate: '10',
      description: ''
    });
    setShowAddCondition(false);
  }

  function handleRemoveCondition(id) {
    setDebtConditions(prev => prev.filter(c => c.id !== id));
  }

  // ── VARREDURA AUTOMÁTICA DE DÉBITOS COM IA (PASSO 2) ──
  async function handleAutoScanDebts() {
    if (!selectedContact && !uploadedChatFile) {
      alert('Por favor, primeiro selecione o contato do credor no Passo 1 ou anexe o arquivo .txt de conversa.');
      return;
    }

    setIsScanningAuto(true);
    addLog('🤖 [Modo Automático] Iniciando varredura inteligente na conversa para encontrar empréstimos e taxas pactuadas...', 'info');

    try {
      let rawMessages = [];
      if (uploadedChatFile) {
        addLog(`📄 Lendo mensagens do arquivo de backup "${uploadedChatFile.name}"...`, 'info');
        const lines = uploadedChatFile.content.split('\n');
        lines.forEach((line, idx) => {
          const match = line.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(?:às\s+)?(\d{1,2}:\d{2})\s*-\s*([^:]+):\s*(.*)$/);
          if (match) {
            const [, rawDate, rawTime, sender, text] = match;
            const [d, m, y] = rawDate.split('/');
            const fullYear = y.length === 2 ? '20' + y : y;
            const isoDate = `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            rawMessages.push({
              key: { id: `file-${idx}`, fromMe: sender.toLowerCase().includes('você') || sender.toLowerCase().includes('you') },
              messageTimestamp: Math.floor(new Date(`${isoDate}T${rawTime}:00`).getTime() / 1000),
              senderName: sender.trim(),
              text: text.trim(),
              isoDate
            });
          }
        });
      } else if (selectedContact) {
        addLog(`🌐 Buscando histórico completo do WhatsApp para ${selectedContact.name} (${selectedContact.displayPhone || selectedContact.phone})...`, 'info');
        rawMessages = await fetchFullChatHistory(selectedContact);
      }

      if (rawMessages.length === 0) {
        throw new Error('Nenhuma mensagem encontrada na conversa com este contato.');
      }

      const textRecords = [];
      const audioTranscripts = [];

      for (let i = 0; i < rawMessages.length; i++) {
        const msg = rawMessages[i];
        const isFromMe = msg.key?.fromMe ?? false;
        const senderLabel = isFromMe ? 'Eu (Devedor)' : (selectedContact?.name || 'Credor');
        const tsSec = Number(msg.messageTimestamp || 0);
        const dateStr = msg.isoDate || (tsSec ? new Date(tsSec * 1000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));

        let textContent = msg.text ||
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          '';

        if (textContent.trim()) {
          const hasFinancial = /(emprest|peguei|mandou|juro|pag|r\$|\d+,\d{2}|\d+\.\d{2}|pix|transfer|cobran|devo|saldo)/i.test(textContent);
          if (hasFinancial) {
            textRecords.push({ date: dateStr, sender: senderLabel, text: textContent });
          }
        }

        const isAudio = Boolean(msg.message?.audioMessage || msg.messageType === 'audioMessage');
        const isImage = Boolean(
          msg.message?.imageMessage || 
          msg.messageType === 'imageMessage' ||
          (msg.message?.documentMessage?.mimetype && msg.message?.documentMessage?.mimetype.startsWith('image/'))
        );

        if (isAudio) {
          try {
            const base64Audio = await fetchMediaBase64FromMessage(msg);
            if (base64Audio) {
              const resp = await fetch('/api/gemini-financial-audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'transcribe_audio',
                  base64Data: base64Audio,
                  mimeType: 'audio/ogg'
                })
              });
              if (resp.ok) {
                const audData = await resp.json();
                audioTranscripts.push({
                  date: dateStr,
                  sender: senderLabel,
                  transcription: audData.transcricao,
                  valores: audData.valores_mencionados || [],
                  taxaJuros: audData.taxa_juros_mencionada || ''
                });
                await new Promise(r => setTimeout(r, 60));
              }
            }
          } catch (e) {}
        }

        if (isImage) {
          try {
            const base64Img = await fetchMediaBase64FromMessage(msg);
            if (base64Img) {
              const resp = await fetch('/api/gemini-financial-audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'ocr_receipt',
                  base64Data: base64Img,
                  mimeType: msg.message?.imageMessage?.mimetype || 'image/jpeg'
                })
              });
              if (resp.ok) {
                const imgData = await resp.json();
                if (imgData.valor_pago > 0 || imgData.tipo_comprovante) {
                  textRecords.push({
                    date: imgData.data_pagamento || dateStr,
                    sender: senderLabel,
                    text: `[Print / Comprovante ${imgData.tipo_comprovante || 'PIX'}: R$ ${Number(imgData.valor_pago || 0).toFixed(2)} para ${imgData.favorecido_nome || 'Favorecido'}]`
                  });
                }
                await new Promise(r => setTimeout(r, 60));
              }
            }
          } catch (e) {}
        }
      }

      addLog(`🤖 Enviando ${textRecords.length} mensagens/prints e ${audioTranscripts.length} áudios para detecção automática com IA...`, 'info');

      const resp = await fetch('/api/gemini-financial-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'detect_debts_auto',
          payload: {
            mensagensTexto: textRecords,
            audiosTranscritos: audioTranscripts,
            nomeCredor: selectedContact?.name || 'Credor',
            nomeDevedor: 'Eu (Devedor)'
          }
        })
      });

      if (resp.ok) {
        const data = await resp.json();
        const detected = (data.debitos_detectados || []).map((d, i) => ({
          id: `auto-${Date.now()}-${i}`,
          type: 'loan',
          amount: parseFloat(d.valor) || 0,
          date: d.data || new Date().toISOString().slice(0, 10),
          monthlyRate: parseFloat(d.taxa_juros_mes) || 10,
          description: d.descricao || 'Empréstimo em Dinheiro (Identificado pela IA)',
          evidence: d.evidencia || ''
        }));

        setAutoDetectedDebts(detected);
        setAutoScanSummary(data.resumo || '');
        addLog(`✓ IA identificou automaticamente ${detected.length} operações de empréstimos em dinheiro!`, 'success');
      } else {
        throw new Error('Falha na resposta da IA.');
      }
    } catch (err) {
      addLog(`❌ Erro no escaneamento automático: ${err.message}`, 'error');
      alert('Erro ao escanear automaticamente: ' + err.message);
    } finally {
      setIsScanningAuto(false);
    }
  }

  // Upload de Comprovantes de Pagamento do Usuário
  async function handleReceiptsUpload(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadingReceipts(true);
    addLog(`📤 Carregando ${files.length} comprovante(s) de pagamento anexado(s)...`, 'info');

    for (const file of files) {
      try {
        const reader = new FileReader();
        const base64Promise = new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const base64Data = await base64Promise;

        addLog(`🔍 Analisando comprovante "${file.name}" com OCR da Inteligência Artificial...`, 'info');
        let parsedReceipt = {
          data_pagamento: new Date().toISOString().slice(0, 10),
          valor_pago: 0,
          tipo_comprovante: 'PIX',
          favorecido_nome: '',
          id_transacao_ou_autenticacao: '',
          observacoes: ''
        };

        try {
          const resp = await fetch('/api/gemini-financial-audit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'ocr_receipt',
              base64Data,
              mimeType: file.type || 'image/jpeg'
            })
          });
          if (resp.ok) {
            const data = await resp.json();
            parsedReceipt = { ...parsedReceipt, ...data };
            addLog(`✓ Comprovante reconhecido: R$ ${parsedReceipt.valor_pago?.toFixed(2)} em ${parsedReceipt.data_pagamento} (${parsedReceipt.favorecido_nome || 'Favorecido'})`, 'success');
          }
        } catch (ocrErr) {
          console.warn('Erro no OCR:', ocrErr);
        }

        setUploadedReceipts(prev => [
          ...prev,
          {
            id: Date.now() + Math.random(),
            name: file.name,
            base64: base64Data,
            mimeType: file.type,
            date: parsedReceipt.data_pagamento || new Date().toISOString().slice(0, 10),
            amount: Number(parsedReceipt.valor_pago) || 0,
            beneficiary: parsedReceipt.favorecido_nome || '',
            authId: parsedReceipt.id_transacao_ou_autenticacao || '',
            type: parsedReceipt.tipo_comprovante || 'PIX',
            notes: parsedReceipt.observacoes || ''
          }
        ]);
      } catch (err) {
        addLog(`❌ Erro ao processar arquivo ${file.name}: ${err.message}`, 'error');
      }
    }

    setUploadingReceipts(false);
  }

  // Upload de Conversa Exportada do WhatsApp (.txt)
  function handleChatFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target.result;
      setUploadedChatFile({ name: file.name, content });
      addLog(`📁 Arquivo de conversa exportada "${file.name}" carregado com sucesso (${(content.length / 1024).toFixed(1)} KB).`, 'success');
    };
    reader.readAsText(file);
  }

  // ── UTILITÁRIO DE CÁLCULO DE DIAS CORRIDOS (SEM DRIFT DE FUSO HORÁRIO) ──
  function getDaysBetween(dateStr1, dateStr2) {
    if (!dateStr1 || !dateStr2) return 0;
    const p1 = dateStr1.slice(0, 10).split('-').map(Number);
    const p2 = dateStr2.slice(0, 10).split('-').map(Number);
    if (p1.length < 3 || p2.length < 3) return 0;
    const utc1 = Date.UTC(p1[0], p1[1] - 1, p1[2]);
    const utc2 = Date.UTC(p2[0], p2[1] - 1, p2[2]);
    return Math.max(0, Math.round((utc2 - utc1) / (1000 * 60 * 60 * 24)));
  }

  // ── GERADOR DE ARQUIVO TEXTO COM TRANSCRIÇÃO INTEGRAL (.TXT) ──
  function downloadTranscriptTxt() {
    if (!auditResult || !auditResult.fullDialog || auditResult.fullDialog.length === 0) {
      alert('Nenhuma transcrição de conversa disponível para baixar.');
      return;
    }

    const targetInfo = selectedContact 
      ? `${selectedContact.name} (${selectedContact.phone || selectedContact.jid?.replace('@s.whatsapp.net', '')})`
      : (manualPhone || 'Credor');

    let txt = '================================================================================\r\n';
    txt += '   LAUDO DE TRANSCRIÇÃO FORENSE INTEGRAL DE DIÁLOGOS E ÁUDIOS DO WHATSAPP\r\n';
    txt += '   Sistema Pericial de Auditoria Financeira & Reconstituição de Amortizações\r\n';
    txt += '================================================================================\r\n\r\n';
    txt += `ALVO AUDITADO: ${targetInfo}\r\n`;
    txt += `DATA DA EMISSÃO: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}\r\n`;
    txt += `MODO DE EXECUÇÃO: ${auditResult.executionMode === 'auto' ? 'Automático (Identificado e Transcrito por IA)' : 'Manual'}\r\n`;
    txt += `CRITÉRIO DE AMORTIZAÇÃO: Código Civil Brasileiro art. 354 (Amortização Linear dos Juros Primeiro)\r\n\r\n`;
    txt += '================================================================================\r\n';
    txt += 'ESTATÍSTICAS DA CONVERSA ANALISADA (100% DA 1ª À ÚLTIMA MENSAGEM - AMBOS OS LADOS):\r\n';
    txt += `• Total Geral de Mensagens Examinadas: ${auditResult.metrics?.totalMensagens || auditResult.fullDialog?.length || 0}\r\n`;
    txt += `• Data da 1ª Mensagem da Conversa: ${auditResult.firstMessage?.dateTime || auditResult.firstMessage?.date || '-'} (${auditResult.firstMessage?.sender || '-'})\r\n`;
    txt += `• Data da Última Mensagem da Conversa: ${auditResult.lastMessage?.dateTime || auditResult.lastMessage?.date || '-'}\r\n`;
    txt += `• Ocorrências de Palavras-Chave (Áudios/Textos): ${auditResult.keywordEvents?.length || 0}\r\n`;
    txt += `• Mensagens de Texto Lidas: ${auditResult.metrics?.totalTextos || auditResult.textRecords?.length || 0}\r\n`;
    txt += `• Áudios de Voz Escutados e Transcritos: ${auditResult.metrics?.totalAudios || auditResult.audioTranscripts?.length || 0}\r\n`;
    txt += `• Imagens e Prints Periciados via OCR: ${auditResult.metrics?.totalImagens || 0}\r\n`;
    txt += `• Comprovantes Bancários Identificados: ${auditResult.receipts?.length || 0}\r\n`;
    txt += `• Período Histórico Abrangido: de ${auditResult.metrics?.periodoInicio || '-'} até ${auditResult.metrics?.periodoFim || '-'}\r\n`;
    txt += '================================================================================\r\n\r\n';
    txt += '--------------------------------------------------------------------------------\r\n';
    txt += 'VEREDITO OFICIAL DA PERÍCIA (QUEM DEVE A QUEM):\r\n';
    if (auditResult.status === 'QUITADO_PAGO_A_MAIS') {
      txt += `>> O NÚMERO ${targetInfo} DEVE RESTITUIR R$ ${auditResult.totalPagoAMais.toFixed(2)} AO USUÁRIO!\r\n`;
      txt += `   A dívida está TOTALMENTE QUITADA. O usuário pagou R$ ${auditResult.totalPago.toFixed(2)},\r\n`;
      txt += `   enquanto o montante justo contratado somado aos juros legais calculados em dias corridos\r\n`;
      txt += `   era de R$ ${(auditResult.totalEmprestado + auditResult.totalJurosDevidos).toFixed(2)}.\r\n`;
      txt += `   Houve pagamento a mais de R$ ${auditResult.totalPagoAMais.toFixed(2)} a ser devolvido!\r\n`;
    } else {
      txt += `>> O USUÁRIO DEVE R$ ${auditResult.saldoFinalReal.toFixed(2)} AO NÚMERO ${targetInfo}.\r\n`;
      txt += `   Do total contratado de R$ ${auditResult.totalEmprestado.toFixed(2)}, o usuário já amortizou\r\n`;
      txt += `   R$ ${auditResult.totalAmortizado.toFixed(2)} do principal e pagou R$ ${auditResult.totalJurosCobrados.toFixed(2)} em juros.\r\n`;
      txt += `   Resta pagar o saldo real recalculado de R$ ${auditResult.saldoFinalReal.toFixed(2)}.\r\n`;
    }
    txt += '--------------------------------------------------------------------------------\r\n\r\n';
    txt += 'RESUMO DOS VALORES APURADOS (R$):\r\n';
    txt += `• Total de Empréstimos em Dinheiro/PIX: R$ ${auditResult.totalEmprestado.toFixed(2)}\r\n`;
    txt += `• Total Geral do Principal Contratado: R$ ${auditResult.totalEmprestado.toFixed(2)}\r\n`;
    txt += `• Total Efetivamente Pago pelo Usuário: R$ ${auditResult.totalPago.toFixed(2)}\r\n`;
    txt += `• Total de Juros Legais Devidos no Período: R$ ${auditResult.totalJurosDevidos.toFixed(2)}\r\n`;
    txt += `• Total de Capital Principal Amortizado: R$ ${auditResult.totalAmortizado.toFixed(2)}\r\n`;
    txt += `• Saldo Devedor Restante Real: R$ ${auditResult.saldoFinalReal.toFixed(2)}\r\n`;
    txt += `• Valor Pago a Mais a Restituir: R$ ${auditResult.totalPagoAMais.toFixed(2)}\r\n\r\n`;

    // SEÇÃO DE NEGOCIAÇÕES E RENEGOCIAÇÕES COM DATAS
    txt += '--------------------------------------------------------------------------------\r\n';
    txt += 'NEGOCIAÇÕES & RENEGOCIAÇÕES COM DATAS, PARCELAS E VALORES TOTAIS:\r\n';
    txt += '--------------------------------------------------------------------------------\r\n';
    if ((auditResult.negotiations || []).length === 0) {
      txt += 'Nenhuma repactuação adicional registrada além dos contratos de empréstimo.\r\n\r\n';
    } else {
      auditResult.negotiations.forEach((n, idx) => {
        txt += `[Acordo ${idx + 1}] Data: ${n.data} | Tipo: ${n.tipo} | Valor: R$ ${Number(n.valorNegociado).toFixed(2)}\r\n`;
        txt += `   ↳ Qtd Parcelas: ${n.quantidadeParcelas} | Vencimentos/Prazos: ${n.datasPagamentos}\r\n`;
        txt += `   ↳ Valor Total Pactuado: R$ ${Number(n.valorTotal).toFixed(2)} | Detalhes: ${n.descricao}\r\n`;
        if (n.evidencia) txt += `   ↳ Evidência: "${n.evidencia}"\r\n`;
        txt += '\r\n';
      });
    }

    // SEÇÃO DE AMORTIZAÇÕES COM DIREITO LEGAL NÃO CONCEDIDAS PELO CREDOR (ART. 354 CC)
    txt += '--------------------------------------------------------------------------------\r\n';
    txt += 'AMORTIZAÇÕES COM DIREITO LEGAL NÃO EFETUADAS PELO CREDOR (CÓDIGO CIVIL ART. 354):\r\n';
    txt += '--------------------------------------------------------------------------------\r\n';
    if ((auditResult.unmadeAmortizations || []).length === 0) {
      txt += 'Nenhuma retenção indevida de amortização identificada.\r\n\r\n';
    } else {
      auditResult.unmadeAmortizations.forEach((u, idx) => {
        txt += `[Ocorrência ${idx + 1}] Data do Pagamento: ${u.dataPagamento} | Empréstimo: ${u.emprestimoReferencia}\r\n`;
        txt += `   ↳ Valor Pago: R$ ${Number(u.valorPago).toFixed(2)} | Juros Quitados no Período: R$ ${Number(u.jurosDevidosData).toFixed(2)}\r\n`;
        txt += `   ↳ VALOR COM DIREITO LEGAL DE AMORTIZAR: R$ ${Number(u.valorDireitoAmortizacao).toFixed(2)}\r\n`;
        txt += `   ↳ Saldo Devedor Legal Real Reduzido: R$ ${Number(u.saldoDevedorAposAmortizacao || 0).toFixed(2)}\r\n`;
        txt += `   ↳ Irregularidade: ${u.prejuizoOuIrregularidade}\r\n`;
        txt += '\r\n';
      });
    }

    // SEÇÃO DE PARCELAS COBRADAS POR CADA EMPRÉSTIMO COM DATAS
    txt += '--------------------------------------------------------------------------------\r\n';
    txt += 'QUANTIDADE DE PARCELAS COBRADAS POR CADA EMPRÉSTIMO COM DATAS:\r\n';
    txt += '--------------------------------------------------------------------------------\r\n';
    if ((auditResult.installmentsCharged || []).length === 0) {
      txt += 'Sem detalhamento de parcelas cobradas disponível.\r\n\r\n';
    } else {
      auditResult.installmentsCharged.forEach((inst, idx) => {
        txt += `[Empréstimo ${idx + 1}] ${inst.emprestimo} (Concedido em: ${inst.dataEmprestimo})\r\n`;
        txt += `   ↳ Total de Cobranças Exigidas: ${inst.quantidadeCobradas} parcela(s)\r\n`;
        if (inst.historico && inst.historico.length > 0) {
          inst.historico.forEach(h => {
            txt += `      • Data: ${h.data} | Valor: R$ ${Number(h.valorCobrado).toFixed(2)} | Detalhe: ${h.descricao || 'Cobrança'}\r\n`;
          });
        }
        txt += '\r\n';
      });
    }

    txt += '================================================================================\r\n';
    txt += 'CRONOLOGIA DE TODAS AS MENSAGENS E ÁUDIOS COM PALAVRAS-CHAVE IDENTIFICADAS:\r\n';
    txt += '================================================================================\r\n';
    if ((auditResult.keywordEvents || []).length === 0) {
      txt += 'Nenhuma menção de palavra-chave encontrada.\r\n\r\n';
    } else {
      auditResult.keywordEvents.forEach((ev, idx) => {
        txt += `[${idx + 1}] Data/Hora: ${ev.dateTime || `${ev.date} ${ev.time || ''}`} | Tipo: ${ev.mediaTypeLabel || ev.type} | Remetente: ${ev.sender}\r\n`;
        txt += `    ↳ "${ev.content}"\r\n\r\n`;
      });
    }

    txt += '================================================================================\r\n';
    txt += 'TRANSCRIÇÃO CRONOLÓGICA DAS CONVERSAS, ÁUDIOS E COMPROVANTES:\r\n';
    txt += '================================================================================\r\n\r\n';

    auditResult.fullDialog.forEach((item, index) => {
      txt += `[${index + 1}] [${item.dateTime || item.date}] [${item.sender}] [${item.mediaTypeLabel}]:\r\n`;
      txt += `"${item.content}"\r\n`;
      if (item.resumoFinanceiro) {
        txt += `   ↳ [Análise Pericial]: ${item.resumoFinanceiro}\r\n`;
      }
      if (item.taxaJuros) {
        txt += `   ↳ [Taxa Citada]: ${item.taxaJuros}\r\n`;
      }
      if (item.valores && item.valores.length > 0) {
        txt += `   ↳ [Valores Mencionados]: ${item.valores.join(', ')}\r\n`;
      }
      txt += '\r\n';
    });

    txt += '================================================================================\r\n';
    txt += 'Fim do Documento de Transcrição Forense Integral.\r\n';
    txt += 'Emitido pelo Sistema de Auditoria Financeira Pericial.\r\n';

    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safePhone = (selectedContact?.phone || manualPhone || 'conversa').replace(/\D/g, '');
    link.download = `transcricao_completa_audios_dialogos_${safePhone}_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ── MOTOR PERICIAL PRINCIPAL (COM SUPORTE A MODO MANUAL E AUTOMÁTICO) ──
  async function runFullDebtForensicAudit() {
    if (!selectedContact && !uploadedChatFile) {
      alert('Por favor, selecione um contato conectado no WhatsApp ou anexe o arquivo de conversa exportada.');
      return;
    }

    setIsAuditing(true);
    abortAuditRef.current = false;
    setAuditLogs([]);
    setAuditResult(null);
    setShowAuditProgressModal(true);
    setCountdownSeconds(180);
    setWizardStep(4);

    const targetContactPhone = selectedContact?.phone || (selectedContact?.jid ? selectedContact.jid.replace('@s.whatsapp.net', '') : manualPhone) || 'Credor';
    const targetContactName = selectedContact?.name || 'Credor';
    const targetContactDisplay = `${targetContactName} (${targetContactPhone})`;

    addLog('🚀 INICIANDO PERÍCIA FINANCEIRA FORENSE DE CONVERSA & AMORTIZAÇÕES', 'info');
    addLog(`👤 Alvo da Perícia: ${targetContactDisplay}`, 'info');
    addLog(`⚙️ Modo Escolhido no Passo 2: ${step2Mode === 'auto' ? '🤖 AUTOMÁTICO (Robô & IA)' : '📝 MANUAL'}`, 'info');
    addLog('🛡️ PROTOCOLO FORENSE SOMENTE LEITURA ATIVO (READ-ONLY):', 'success');
    addLog('   🚫 PROIBIDO enviar qualquer mensagem para o credor (zero contato/sem perturbar o alvo).', 'success');
    addLog('   🚫 PROIBIDO apagar ou alterar qualquer dado, áudio ou imagem do WhatsApp.', 'success');
    addLog('   👁️ Extração pericial estritamente passiva: audição de todos os áudios e OCR de comprovantes.', 'success');

    try {
      let rawMessages = [];

      // ── FASE 1: EXTRAIR MENSAGENS DO WHATSAPP OU DO ARQUIVO ──────────
      setAuditProgress({ current: 15, total: 100, stepLabel: 'Fase 1/4: Baixando histórico completo de mensagens...' });

      if (uploadedChatFile) {
        addLog(`📄 Extraindo histórico do arquivo de backup "${uploadedChatFile.name}"...`, 'info');
        const lines = uploadedChatFile.content.split('\n');
        lines.forEach((line, idx) => {
          const match = line.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(?:às\s+)?(\d{1,2}:\d{2})\s*-\s*([^:]+):\s*(.*)$/);
          if (match) {
            const [, rawDate, rawTime, sender, text] = match;
            const [d, m, y] = rawDate.split('/');
            const fullYear = y.length === 2 ? '20' + y : y;
            const isoDate = `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            rawMessages.push({
              key: { id: `file-${idx}`, fromMe: sender.toLowerCase().includes('você') || sender.toLowerCase().includes('you') },
              messageTimestamp: Math.floor(new Date(`${isoDate}T${rawTime}:00`).getTime() / 1000),
              senderName: sender.trim(),
              text: text.trim(),
              isoDate,
              rawTime
            });
          }
        });
        addLog(`📥 ${rawMessages.length} mensagens históricas carregadas do arquivo!`, 'success');
      } else if (selectedContact) {
        addLog(`🌐 Conectando à API para buscar histórico completo de ${selectedContact.name} (${selectedContact.displayPhone || selectedContact.phone})...`, 'info');
        const chatMsgs = await fetchFullChatHistory(selectedContact, (count) => {
          addLog(`📥 Baixando mensagens do WhatsApp... ${count} mensagens recuperadas.`, 'info');
        });
        rawMessages = chatMsgs;
        addLog(`📥 Total de ${rawMessages.length} mensagens históricas recuperadas do WhatsApp!`, 'success');
      }

      if (rawMessages.length === 0 && uploadedReceipts.length === 0) {
        throw new Error('Nenhuma mensagem ou comprovante encontrado para analisar.');
      }

      // ── ORDENAÇÃO CRONOLÓGICA RIGOROSA: DA PRIMEIRA À ÚLTIMA MENSAGEM ──
      rawMessages.sort((a, b) => {
        const tsA = Number(a.messageTimestamp || 0);
        const tsB = Number(b.messageTimestamp || 0);
        if (tsA && tsB) return tsA - tsB;
        const dtA = a.isoDate ? new Date(a.isoDate).getTime() : 0;
        const dtB = b.isoDate ? new Date(b.isoDate).getTime() : 0;
        return dtA - dtB;
      });

      // Se o usuário selecionou período específico na Etapa 3
      if (auditPeriodMode === 'custom' && (auditDateStart || auditDateEnd)) {
        addLog(`📅 Filtrando período específico: de ${auditDateStart || 'início'} até ${auditDateEnd || 'fim'}...`, 'info');
        rawMessages = rawMessages.filter(msg => {
          const ts = Number(msg.messageTimestamp || 0);
          const d = msg.isoDate || (ts ? new Date(ts * 1000).toISOString().slice(0, 10) : '');
          if (!d) return true;
          if (auditDateStart && d < auditDateStart) return false;
          if (auditDateEnd && d > auditDateEnd) return false;
          return true;
        });
        addLog(`📊 ${rawMessages.length} mensagens selecionadas dentro do período especificado.`, 'success');
      } else if (rawMessages.length > 0) {
        const firstMsg = rawMessages[0];
        const lastMsg = rawMessages[rawMessages.length - 1];
        const firstDate = firstMsg.isoDate || (firstMsg.messageTimestamp ? new Date(firstMsg.messageTimestamp * 1000).toLocaleDateString('pt-BR') : 'Início');
        const lastDate = lastMsg.isoDate || (lastMsg.messageTimestamp ? new Date(lastMsg.messageTimestamp * 1000).toLocaleDateString('pt-BR') : 'Hoje');
        addLog(`🌐 PERÍCIA MINUCIOSA TOTAL: Analisando toda a conversa da 1ª mensagem em ${firstDate} até a última em ${lastDate} (Total: ${rawMessages.length} mensagens, sem pular nada)`, 'success');
      }

      // ── FASE 2: TRANSCRIÇÃO DE ÁUDIOS, OCR DE PRINTS E LEITURA DE TEXTOS ─────────────
      setAuditProgress({ current: 40, total: 100, stepLabel: 'Fase 2/4: Lendo mensagens, ouvindo áudios e periciando prints...' });

      const textRecords = [];
      const audioTranscripts = [];
      const whatsappImageReceipts = [];
      const fullConversationDialog = [];
      let textCount = 0;
      let audioCount = 0;
      let imageCount = 0;

      for (let i = 0; i < rawMessages.length; i++) {
        if (abortAuditRef.current) break;
        const msg = rawMessages[i];
        const isFromMe = msg.key?.fromMe ?? false;
        const senderLabel = isFromMe ? 'Você (Devedor)' : `${targetContactName} (${targetContactPhone})`;
        const senderNumber = isFromMe ? 'Você' : targetContactPhone;
        const tsSec = Number(msg.messageTimestamp || 0);
        const dateStr = msg.isoDate || (tsSec ? new Date(tsSec * 1000).toISOString().slice(0, 10) : 'Data Indefinida');
        const timeStr = msg.rawTime || (tsSec ? new Date(tsSec * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
        const dateTimeDisplay = `${dateStr} ${timeStr}`.trim();

        let textContent = msg.text ||
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          '';

        const isAudio = Boolean(msg.message?.audioMessage || msg.messageType === 'audioMessage');
        const isImage = Boolean(
          msg.message?.imageMessage || 
          msg.messageType === 'imageMessage' ||
          (msg.message?.documentMessage?.mimetype && msg.message?.documentMessage?.mimetype.startsWith('image/'))
        );

        if (isAudio) {
          audioCount++;
        } else if (isImage) {
          imageCount++;
        }
        if (textContent.trim()) {
          textCount++;
        }

        const senderNameOnly = isFromMe ? myUserName : targetContactName;

        if (textContent.trim()) {
          const hasFinancialKeywords = /(juro|amortiz|pag|devo|saldo|cobran|r\$|\d+,\d{2}|\d+\.\d{2}|deposit|pix|transferi|acordo|cobrou|venc|resta|cart|compra|fatura|comprovante)/i.test(textContent);
          const tItem = {
            date: dateStr,
            time: timeStr,
            sender: senderLabel,
            senderNumber,
            isFromMe,
            text: textContent,
            isFinancial: hasFinancialKeywords
          };
          textRecords.push(tItem);

          fullConversationDialog.push({
            id: msg.key?.id || `msg-${i}`,
            date: dateStr,
            time: timeStr,
            dateTime: dateTimeDisplay,
            timestamp: tsSec,
            sender: senderLabel,
            senderNumber,
            isFromMe,
            type: 'TEXT',
            mediaTypeLabel: '💬 Mensagem de Texto',
            content: textContent,
            resumoFinanceiro: hasFinancialKeywords ? 'Mencionou termos financeiros' : '',
            isFinancial: hasFinancialKeywords
          });

          // Feed ao Vivo do Pop-up (conforme solicitado no áudio)
          setLiveDialogueFeed(prev => [
            ...prev.slice(-300),
            {
              id: msg.key?.id || `live-txt-${i}`,
              sender: senderNameOnly,
              isFromMe,
              type: 'TEXT',
              time: timeStr || dateStr,
              text: textContent,
              status: 'done'
            }
          ]);

          // Pausa suave a cada lote de mensagens para manter a UI responsiva
          if (!isAudio && !isImage && i % 25 === 0) {
            await new Promise(r => setTimeout(r, 10));
          }
        }

        // Processar áudios do WhatsApp
        if (isAudio) {
          audioCount++;
          const audioLiveId = msg.key?.id || `live-aud-${i}`;
          // Notifica imediatamente no Feed: "Áudio sendo transcrito..."
          setLiveDialogueFeed(prev => [
            ...prev.slice(-300),
            {
              id: audioLiveId,
              sender: senderNameOnly,
              isFromMe,
              type: 'AUDIO',
              time: timeStr || dateStr,
              status: 'transcribing',
              transcription: ''
            }
          ]);

          addLog(`🎙️ Áudio #${audioCount} de ${senderNameOnly} em ${dateTimeDisplay}. Transcrevendo com Inteligência Artificial...`, 'info');
          try {
            const base64Audio = await fetchMediaBase64FromMessage(msg);
            if (base64Audio) {
              const resp = await fetch('/api/gemini-financial-audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'transcribe_audio',
                  base64Data: base64Audio,
                  mimeType: 'audio/ogg'
                })
              });
              if (resp.ok) {
                const audData = await resp.json();
                const audItem = {
                  date: dateStr,
                  time: timeStr,
                  sender: senderLabel,
                  senderNumber,
                  isFromMe,
                  transcription: audData.transcricao,
                  valores: audData.valores_mencionados || [],
                  taxaJuros: audData.taxa_juros_mencionada || '',
                  amortizacao: audData.amortizacao_mencionada || false,
                  resumo: audData.resumo_financeiro || ''
                };
                audioTranscripts.push(audItem);

                fullConversationDialog.push({
                  id: msg.key?.id || `audio-${i}`,
                  date: dateStr,
                  time: timeStr,
                  dateTime: dateTimeDisplay,
                  timestamp: tsSec,
                  sender: senderLabel,
                  senderNumber,
                  isFromMe,
                  type: 'AUDIO',
                  mediaTypeLabel: '🎙️ ÁUDIO TRANSCRIÇÃO',
                  content: audData.transcricao,
                  resumoFinanceiro: audData.resumo_financeiro || '',
                  valores: audData.valores_mencionados || [],
                  taxaJuros: audData.taxa_juros_mencionada || '',
                  isFinancial: true
                });

                // Atualiza o item no Feed com a transcrição concluída
                setLiveDialogueFeed(prev => prev.map(item => item.id === audioLiveId ? {
                  ...item,
                  status: 'done',
                  transcription: audData.transcricao || 'Áudio transcrito',
                  resumo: audData.resumo_financeiro || '',
                  taxa: audData.taxa_juros_mencionada || '',
                  valores: audData.valores_mencionados || []
                } : item));

                addLog(`✓ Áudio #${audioCount} de ${senderNameOnly} transcrito com sucesso: "${audData.resumo_financeiro || audData.transcricao.slice(0, 80)}..."`, 'success');
              } else {
                setLiveDialogueFeed(prev => prev.map(item => item.id === audioLiveId ? {
                  ...item,
                  status: 'done',
                  transcription: '[Áudio sem texto legível detectado]'
                } : item));
              }
            } else {
              setLiveDialogueFeed(prev => prev.map(item => item.id === audioLiveId ? {
                ...item,
                status: 'done',
                transcription: '[Mídia do áudio não disponível para download]'
              } : item));
            }
          } catch (audioErr) {
            console.warn('Erro ao transcrever áudio:', audioErr);
            setLiveDialogueFeed(prev => prev.map(item => item.id === audioLiveId ? {
              ...item,
              status: 'done',
              transcription: '[Erro na transcrição do áudio]'
            } : item));
          }
        }

        // Processar prints e imagens do WhatsApp
        if (isImage) {
          imageCount++;
          const imgLiveId = msg.key?.id || `live-img-${i}`;
          setLiveDialogueFeed(prev => [
            ...prev.slice(-300),
            {
              id: imgLiveId,
              sender: senderNameOnly,
              isFromMe,
              type: 'IMAGE',
              time: timeStr || dateStr,
              status: 'analyzing',
              ocrResult: ''
            }
          ]);

          addLog(`🖼️ Print #${imageCount} de ${senderNameOnly} em ${dateTimeDisplay}. Analisando com OCR da IA...`, 'info');
          try {
            const base64Img = await fetchMediaBase64FromMessage(msg);
            if (base64Img) {
              const mime = msg.message?.imageMessage?.mimetype || 'image/jpeg';
              const resp = await fetch('/api/gemini-financial-audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'ocr_receipt',
                  base64Data: base64Img,
                  mimeType: mime
                })
              });
              if (resp.ok) {
                const ocrData = await resp.json();
                const valPago = parseFloat(ocrData.valor_pago) || 0;
                const isReceipt = ocrData.e_comprovante_valido !== false && valPago > 0;

                if (isReceipt) {
                  whatsappImageReceipts.push({
                    date: ocrData.data_pagamento || dateStr,
                    amount: valPago,
                    origin: 'Print do WhatsApp',
                    evidence: `Print ${ocrData.tipo_comprovante || 'PIX'}: R$ ${valPago.toFixed(2)} para ${ocrData.favorecido_nome || targetContactName} (${ocrData.id_transacao_ou_autenticacao || 'ID não informado'})`,
                    authId: ocrData.id_transacao_ou_autenticacao || ''
                  });
                  addLog(`✓ Print #${imageCount} periciado: ${ocrData.tipo_comprovante || 'Comprovante'} de R$ ${valPago.toFixed(2)} (${ocrData.favorecido_nome || 'Favorecido'})`, 'success');
                }

                setLiveDialogueFeed(prev => prev.map(item => item.id === imgLiveId ? {
                  ...item,
                  status: 'done',
                  ocrResult: isReceipt ? `Comprovante ${ocrData.tipo_comprovante || 'PIX'}: R$ ${valPago.toFixed(2)}` : 'Print analisado (sem comprovante)',
                  valPago
                } : item));

                fullConversationDialog.push({
                  id: msg.key?.id || `img-${i}`,
                  date: dateStr,
                  time: timeStr,
                  dateTime: dateTimeDisplay,
                  timestamp: tsSec,
                  sender: senderLabel,
                  senderNumber,
                  isFromMe,
                  type: 'IMAGE',
                  mediaTypeLabel: isReceipt ? '🖼️ PRINT DE COMPROVANTE' : '🖼️ PRINT / IMAGEM',
                  content: textContent ? `${textContent}\n[Print periciado: ${ocrData.tipo_comprovante || 'Comprovante'} de R$ ${valPago.toFixed(2)}]` : `[Print periciado: ${ocrData.tipo_comprovante || 'Comprovante'} de R$ ${valPago.toFixed(2)} - ${ocrData.favorecido_nome || 'Favorecido'}]`,
                  receiptData: ocrData,
                  isFinancial: isReceipt || valPago > 0
                });
              }
            }
          } catch (imgErr) {
            console.warn('Erro ao periciar imagem do WhatsApp:', imgErr);
            setLiveDialogueFeed(prev => prev.map(item => item.id === imgLiveId ? {
              ...item,
              status: 'done',
              ocrResult: 'Print analisado'
            } : item));
          }
        }
      }

      // Ordenar diálogo completo cronologicamente
      fullConversationDialog.sort((a, b) => {
        if (a.timestamp && b.timestamp) return a.timestamp - b.timestamp;
        return new Date(a.date) - new Date(b.date);
      });

      // Identificar primeira e última mensagem da conversa de ambos os lados
      const firstMessage = fullConversationDialog.length > 0 ? {
        date: fullConversationDialog[0].date,
        time: fullConversationDialog[0].time || '',
        dateTime: fullConversationDialog[0].dateTime || fullConversationDialog[0].date,
        sender: fullConversationDialog[0].sender,
        content: fullConversationDialog[0].content
      } : null;

      const lastMessage = fullConversationDialog.length > 0 ? {
        date: fullConversationDialog[fullConversationDialog.length - 1].date,
        time: fullConversationDialog[fullConversationDialog.length - 1].time || '',
        dateTime: fullConversationDialog[fullConversationDialog.length - 1].dateTime || fullConversationDialog[fullConversationDialog.length - 1].date,
        sender: fullConversationDialog[fullConversationDialog.length - 1].sender,
        content: fullConversationDialog[fullConversationDialog.length - 1].content
      } : null;

      // Extrair todas as ocorrências de conversas e áudios com palavras-chave relevantes
      const KEYWORD_REGEX = /(empr[ée]stim\w*|renegoci\w*|amortiz\w*|parcel\w*|pag\w*|juros|taxa|saldo|d[íi]vida|abat\w*|quitar\w*|quitad\w*)/i;
      const keywordEvents = fullConversationDialog.filter(item => {
        return KEYWORD_REGEX.test(item.content || '') || KEYWORD_REGEX.test(item.resumoFinanceiro || '');
      }).map(item => ({
        id: item.id,
        date: item.date,
        time: item.time,
        dateTime: item.dateTime,
        sender: item.sender,
        isFromMe: item.isFromMe,
        type: item.type === 'AUDIO' ? 'audio' : item.type === 'IMAGE' ? 'image' : 'text',
        mediaTypeLabel: item.mediaTypeLabel,
        content: item.content
      }));

      addLog(`🎙️ Processamento concluído: ${audioTranscripts.length} áudio(s) transcritos e ${imageCount} print(s) periciados via OCR.`, 'info');
      addLog(`📜 Diálogo completo consolidado com ${fullConversationDialog.length} registros no total!`, 'success');
      if (firstMessage) {
        addLog(`📅 Data da 1ª mensagem da conversa: ${firstMessage.dateTime} (${firstMessage.sender})`, 'info');
      }
      addLog(`⭐ Encontradas ${keywordEvents.length} ocorrências de áudios/mensagens com palavras-chave financeiras.`, 'info');

      // ── FASE 3: CONSOLIDAÇÃO DE COMPROVANTES E PAGAMENTOS ─────────────
      setAuditProgress({ current: 65, total: 100, stepLabel: 'Fase 3/4: Cruzando comprovantes, prints e pagamentos efetuados...' });

      let allPayments = [];

      if (manualTotalPaidSaved !== null && manualTotalPaidSaved > 0) {
        addLog(`💵 MODO PRIORITÁRIO ATIVO: Utilizando o montante total pago de R$ ${manualTotalPaidSaved.toFixed(2)} informado diretamente no Passo 3.`, 'success');
        allPayments = [{
          date: manualPaidDate || dateStr,
          amount: manualTotalPaidSaved,
          origin: 'Valor Total Pago Informado Diretamente (Passo 3)',
          evidence: `Montante consolidado de todos os comprovantes pago pelo devedor: R$ ${manualTotalPaidSaved.toFixed(2)}`,
          authId: 'TOTAL-CONSOLIDADO-PASSO3',
          isPayment: true
        }];
      } else {
        allPayments = [
          ...uploadedReceipts.map(r => ({
            date: r.date,
            amount: Number(r.amount) || 0,
            origin: 'Comprovante Anexado',
            evidence: `Comprovante ${r.type}: R$ ${r.amount} para ${r.beneficiary || targetContactName} (Autenticação: ${r.authId || 'Sem ID'})`,
            authId: r.authId
          })),
          ...whatsappImageReceipts
        ];

        textRecords.forEach(t => {
          if (t.isFromMe) {
            const matchPix = t.text.match(/(?:paguei|mandei|transferi|enviei|pix\s*de)\s*(?:r\$)?\s*([\d\.]+,\d{2}|\d+)/i);
            if (matchPix) {
              const rawVal = matchPix[1].replace(/\./g, '').replace(',', '.');
              const valNum = parseFloat(rawVal);
              if (valNum > 0 && valNum < 500000) {
                const alreadyExists = allPayments.some(p => p.date === t.date && Math.abs(p.amount - valNum) < 1);
                if (!alreadyExists) {
                  allPayments.push({
                    date: t.date,
                    amount: valNum,
                    origin: 'Chat (Mensagem de Pagamento)',
                    evidence: `Mensagem em ${t.date}: "${t.text}"`,
                    authId: 'Chat'
                  });
                }
              }
            }
          }
        });
      }

      allPayments.sort((a, b) => new Date(a.date) - new Date(b.date));
      addLog(`💳 ${allPayments.length} registros de pagamentos consolidados para a perícia.`, 'info');

      // ── FASE 4: SELEÇÃO DAS CONDIÇÕES DE DÉBITO (MANUAL VS AUTOMÁTICO) ──
      setAuditProgress({ current: 85, total: 100, stepLabel: 'Fase 4/4: Executando cálculo matemático e parecer da IA...' });

      let activeDebts = [];

      if (step2Mode === 'auto') {
        if (autoDetectedDebts.length > 0) {
          activeDebts = [...autoDetectedDebts];
          addLog(`🤖 Usando ${activeDebts.length} débitos identificados automaticamente pelo robô.`, 'info');
        } else {
          addLog('🤖 Detectando empréstimos em dinheiro automaticamente com IA...', 'info');
          try {
            const respAuto = await fetch('/api/gemini-financial-audit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'detect_debts_auto',
                payload: {
                  mensagensTexto: textRecords,
                  audiosTranscritos: audioTranscripts,
                  nomeCredor: targetContactName,
                  nomeDevedor: 'Você (Devedor)'
                }
              })
            });
            if (respAuto.ok) {
              const dAuto = await respAuto.json();
              activeDebts = (dAuto.debitos_detectados || []).map((d, i) => ({
                id: `auto-${Date.now()}-${i}`,
                type: 'loan',
                amount: parseFloat(d.valor) || 0,
                date: d.data || new Date().toISOString().slice(0, 10),
                monthlyRate: parseFloat(d.taxa_juros_mes) || 10,
                description: d.descricao || 'Empréstimo em Dinheiro',
                evidence: d.evidencia || ''
              }));
              setAutoDetectedDebts(activeDebts);
              addLog(`✓ IA detectou automaticamente ${activeDebts.length} operações de empréstimos!`, 'success');
            }
          } catch (e) {
            console.warn('Falha no auto-detect:', e);
          }
        }
      } else {
        activeDebts = [...debtConditions];
        addLog(`📝 Usando ${activeDebts.length} débitos de empréstimos cadastrados manualmente pelo usuário.`, 'info');
      }

      if (activeDebts.length === 0) {
        let baseCapital = 0;
        for (const t of textRecords) {
          const m = t.text.match(/(?:emprestei|peguei|mandou|valor\s*(?:inicial|do\s*empréstimo))\s*(?:r\$)?\s*([\d\.]+,\d{2}|\d+)/i);
          if (m) {
            baseCapital = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
            break;
          }
        }
        if (baseCapital === 0 && allPayments.length > 0) {
          baseCapital = allPayments[0].amount;
        }

        activeDebts.push({
          id: 'initial-fallback',
          type: 'loan',
          amount: baseCapital,
          date: allPayments.length > 0 ? allPayments[0].date : new Date().toISOString().slice(0, 10),
          monthlyRate: 10,
          description: 'Empréstimo Detectado (Base)',
          evidence: 'Inferido do histórico'
        });
      }

      const totalLoansCash = activeDebts.reduce((sum, c) => sum + c.amount, 0);
      const totalContracted = totalLoansCash;

      // ── CHAMADA DA IA FORENSE PARA PARECER TÉCNICO ──
      let aiAuditResponse = null;
      try {
        const resp = await fetch('/api/gemini-financial-audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'audit_financial_history',
            payload: {
              mensagensTexto: textRecords.filter(t => t.isFinancial),
              audiosTranscritos: audioTranscripts,
              comprovantesPagamento: allPayments,
              valorEmprestimoInformado: totalContracted,
              taxaJurosMensal: 10,
              nomeCredor: targetContactName,
              nomeDevedor: 'Você (Devedor)'
            }
          })
        });

        if (resp.ok) {
          aiAuditResponse = await resp.json();
          addLog('⚖️ Parecer pericial elaborado com sucesso pela Inteligência Artificial!', 'success');
        }
      } catch (aiErr) {
        console.warn('Erro na IA:', aiErr);
      }

      // ── RECONSTITUIÇÃO CRONOLÓGICA (CÓDIGO CIVIL ART. 354 + DIAS CORRIDOS) ──
      const unifiedEvents = [
        ...activeDebts.map(c => ({
          date: c.date,
          amount: c.amount,
          type: 'EMPRESTIMO',
          monthlyRate: Number(c.monthlyRate) || 10,
          description: c.description || 'Empréstimo em Dinheiro',
          evidence: c.evidence,
          isPayment: false
        })),
        ...allPayments.map(p => ({
          date: p.date,
          amount: p.amount,
          type: 'PAGAMENTO',
          origin: p.origin,
          evidence: p.evidence,
          authId: p.authId,
          isPayment: true
        }))
      ];

      // Ordenar: na mesma data, débitos vêm antes de pagamentos para não gerar saldo negativo prematuro
      unifiedEvents.sort((a, b) => {
        const dA = new Date(a.date).getTime();
        const dB = new Date(b.date).getTime();
        if (dA !== dB) return dA - dB;
        if (!a.isPayment && b.isPayment) return -1;
        if (a.isPayment && !b.isPayment) return 1;
        return 0;
      });

      let saldoLoan = 0;       // Principal empréstimos em dinheiro
      let rateLoan = 10;       // Taxa empréstimo (padrão 10% a.m.)

      let accumulatedInterest = 0; // Juros acumulados pendentes de quitação
      let accumulatedSurplus = 0;  // Crédito excedente pago a mais pelo devedor

      let totalPaid = 0;
      let totalInterestChargedByCreditor = 0;
      let totalInterestDue = 0;
      let totalPrincipalAmortized = 0;

      let lastDate = unifiedEvents.length > 0 ? unifiedEvents[0].date : new Date().toISOString().slice(0, 10);
      const amortizationTimeline = [];

      unifiedEvents.forEach((ev, idx) => {
        const currentDate = ev.date;
        const diasCorridos = idx === 0 ? 0 : getDaysBetween(lastDate, currentDate);
        const fractionMonths = diasCorridos / 30;

        // Juros incorridos pro-rata die no período decorrido sobre o saldo anterior
        const saldoAnteriorTotal = saldoLoan;
        const jurosPeriodo = (saldoLoan > 0 && fractionMonths > 0) ? (saldoLoan * (rateLoan / 100) * fractionMonths) : 0;

        accumulatedInterest += jurosPeriodo;
        totalInterestDue += jurosPeriodo;

        const jurosAcumuladosAntes = accumulatedInterest;

        if (!ev.isPayment) {
          // É UM NOVO EMPRÉSTIMO
          rateLoan = ev.monthlyRate || rateLoan;

          let debtAmountEffective = ev.amount;
          let offsetMsg = '';

          // Se o usuário possuía crédito pago a mais, absorve o novo débito
          if (accumulatedSurplus > 0) {
            if (accumulatedSurplus >= debtAmountEffective) {
              accumulatedSurplus -= debtAmountEffective;
              offsetMsg = ` (Totalmente absorvido pelo crédito prévio de R$ ${debtAmountEffective.toFixed(2)})`;
              debtAmountEffective = 0;
            } else {
              debtAmountEffective -= accumulatedSurplus;
              offsetMsg = ` (Abateu R$ ${accumulatedSurplus.toFixed(2)} de crédito prévio)`;
              accumulatedSurplus = 0;
            }
          }

          if (debtAmountEffective > 0) {
            saldoLoan += debtAmountEffective;
          }

          const novoSaldoTotal = saldoLoan;

          amortizationTimeline.push({
            data: currentDate,
            diasCorridos,
            origem: '💵 Empréstimo em Dinheiro',
            descricao: `💵 Empréstimo em Dinheiro: R$ ${ev.amount.toFixed(2)} (${ev.description})${offsetMsg} - Juros: ${ev.monthlyRate}% a.m.`,
            saldoAnterior: saldoAnteriorTotal,
            taxaJurosMensal: `${ev.monthlyRate}% a.m.`,
            jurosPeriodo,
            jurosAcumuladosAntes,
            valorPago: 0,
            jurosAbatidos: 0,
            amortizacaoCapital: 0,
            saldoDevedor: novoSaldoTotal,
            saldoCredor: accumulatedSurplus,
            status: 'NOVO_EMPRESTIMO',
            evidencia: ev.evidence || `Taxa de juros pactuada: ${ev.monthlyRate}% ao mês.`
          });

        } else {
          // É UM PAGAMENTO EFETUADO (PIX, COMPROVANTE, ETC)
          const paid = ev.amount;
          totalPaid += paid;

          // Prioridade 1 (Art. 354 CC): Quitar juros vencidos primeiro
          const interestPaid = Math.min(paid, accumulatedInterest);
          accumulatedInterest -= interestPaid;
          totalInterestChargedByCreditor += interestPaid;

          // Prioridade 2: Amortização do capital principal
          let remainingPayment = paid - interestPaid;
          let principalAmortized = 0;

          if (remainingPayment > 0) {
            if (saldoLoan > 0) {
              const amortL = Math.min(remainingPayment, saldoLoan);
              saldoLoan -= amortL;
              remainingPayment -= amortL;
              principalAmortized += amortL;
            }

            // Se ainda sobrar pagamento após zerar o capital e juros, vira CRÉDITO PAGO A MAIS (indébito)
            if (remainingPayment > 0) {
              accumulatedSurplus += remainingPayment;
            }
          }

          totalPrincipalAmortized += principalAmortized;
          const novoSaldoTotal = saldoLoan;

          let eventStatus = 'AMORTIZACAO';
          let desc = '';

          if (novoSaldoTotal === 0 && accumulatedSurplus > 0) {
            eventStatus = 'QUITADO_EXCEDE';
            desc = `Pagamento de R$ ${paid.toFixed(2)}: QUITAÇÃO TOTAL DA DÍVIDA! Amortizou R$ ${principalAmortized.toFixed(2)} do principal. Saldo excedente pago a mais acumulado: R$ ${accumulatedSurplus.toFixed(2)} a restituir!`;
          } else if (principalAmortized > 0) {
            desc = `Pagamento de R$ ${paid.toFixed(2)}: Cobriu R$ ${interestPaid.toFixed(2)} de juros vencidos e AMORTIZOU R$ ${principalAmortized.toFixed(2)} do capital principal.`;
          } else {
            eventStatus = 'JUROS_ROLAGEM';
            desc = `Pagamento de R$ ${paid.toFixed(2)}: Quitou R$ ${interestPaid.toFixed(2)} de juros vencidos no período (Sem amortização de capital).`;
          }

          amortizationTimeline.push({
            data: currentDate,
            diasCorridos,
            origem: ev.origin || 'Pagamento',
            descricao: desc,
            saldoAnterior: saldoAnteriorTotal,
            taxaJurosMensal: `${rateLoan}% a.m.`,
            jurosPeriodo,
            jurosAcumuladosAntes,
            valorPago: paid,
            jurosAbatidos: interestPaid,
            amortizacaoCapital: principalAmortized,
            saldoDevedor: novoSaldoTotal,
            saldoCredor: accumulatedSurplus,
            status: eventStatus,
            evidencia: ev.evidence || `Comprovante / Autenticação: ${ev.authId || 'Identificado no Chat'}`
          });
        }

        lastDate = currentDate;
      });

      const finalDebtBalance = saldoLoan;
      const finalOverpaid = accumulatedSurplus;
      const finalStatus = finalDebtBalance === 0 || totalPaid >= (totalContracted + totalInterestDue)
        ? 'QUITADO_PAGO_A_MAIS'
        : 'SALDO_DEVEDOR_RESTANTE';

      // Totais para comparação Manual vs Automático
      const manualTotal = debtConditions.reduce((acc, c) => acc + c.amount, 0);
      const autoTotal = autoDetectedDebts.reduce((acc, c) => acc + c.amount, 0);

      // ── AUDITORIA DETALHADA: NEGOCIAÇÕES, RENEGOCIAÇÕES & AMORTIZAÇÕES OMITIDAS ──
      // 1. Amortizações com direito legal não efetuadas pelo credor (Art. 354 CC)
      const calculatedUnmadeAmortizations = amortizationTimeline
        .filter(t => t.amortizacaoCapital > 0)
        .map((t, idx) => {
          const matchedDebt = activeDebts.find(d => new Date(d.date) <= new Date(t.data)) || activeDebts[0];
          return {
            id: `unmade_amort_${idx}`,
            dataPagamento: t.data,
            emprestimoReferencia: matchedDebt ? (matchedDebt.description || `Empréstimo de R$ ${matchedDebt.amount.toFixed(2)} (${matchedDebt.date})`) : 'Capital Principal',
            valorPago: t.valorPago,
            jurosDevidosData: t.jurosAbatidos,
            valorDireitoAmortizacao: t.amortizacaoCapital,
            saldoAnterior: t.saldoAnterior,
            saldoDevedorAposAmortizacao: t.saldoDevedor,
            prejuizoOuIrregularidade: `O pagamento de R$ ${t.valorPago.toFixed(2)} quitou R$ ${t.jurosAbatidos.toFixed(2)} de juros corridos e gerou DIREITO LEGAL DE AMORTIZAR R$ ${t.amortizacaoCapital.toFixed(2)} do principal. Se o credor continuou cobrando juros sobre o saldo anterior de R$ ${t.saldoAnterior.toFixed(2)} sem reduzir para R$ ${t.saldoDevedor.toFixed(2)}, sonegou indevidamente a amortização violando o Art. 354 do Código Civil.`,
            evidencia: t.evidencia || 'Comprovante / Registro de Pagamento'
          };
        });

      const aiUnmadeAmortizations = (aiAuditResponse?.amortizacoes_nao_feitas || []).map((a, idx) => ({
        id: `ai_unmade_${idx}`,
        dataPagamento: a.data_pagamento || '-',
        emprestimoReferencia: a.emprestimo_referencia || 'Empréstimo',
        valorPago: Number(a.valor_pago) || 0,
        jurosDevidosData: Number(a.juros_devidos_na_data) || 0,
        valorDireitoAmortizacao: Number(a.valor_direito_amortizacao) || 0,
        saldoAnterior: 0,
        saldoDevedorAposAmortizacao: 0,
        prejuizoOuIrregularidade: a.prejuizo_ou_irregularidade || 'Amortização do saldo principal ignorada pelo credor',
        evidencia: a.evidencia || 'Registro em conversa'
      }));

      const finalUnmadeAmortizations = calculatedUnmadeAmortizations.length > 0
        ? calculatedUnmadeAmortizations
        : aiUnmadeAmortizations;

      // 2. Negociações e Renegociações com datas, valores e prazos
      const aiNegotiations = (aiAuditResponse?.negociacoes_com_datas || []).map((n, idx) => ({
        id: `neg_${idx}`,
        data: n.data_negociacao || '-',
        tipo: n.tipo === 'RENEGOCIACAO' ? 'Renegociação' : 'Negociação Inicial',
        valorNegociado: Number(n.valor_negociado) || 0,
        quantidadeParcelas: n.quantidade_parcelas || '1 parcela',
        datasPagamentos: Array.isArray(n.datas_pagamentos) ? n.datas_pagamentos.join(', ') : (n.datas_pagamentos || '-'),
        valorTotal: Number(n.valor_total) || Number(n.valor_negociado) || 0,
        descricao: n.descricao || 'Negociação financeira de empréstimo',
        evidencia: n.evidencia || '-'
      }));

      const finalNegotiations = aiNegotiations.length > 0 ? aiNegotiations : activeDebts.map((d, idx) => ({
        id: `neg_def_${idx}`,
        data: d.date,
        tipo: idx === 0 ? 'Negociação Inicial' : 'Renegociação / Reforço',
        valorNegociado: d.amount,
        quantidadeParcelas: 'Vencimento mensal',
        datasPagamentos: `Vencimento mensal (Taxa: ${d.monthlyRate}% a.m.)`,
        valorTotal: d.amount,
        descricao: d.description || 'Contrato de Empréstimo',
        evidencia: d.evidence || 'Registro de empréstimo pactuado'
      }));

      // 3. Quantidade de parcelas cobradas por empréstimo com datas
      const aiInstallments = (aiAuditResponse?.parcelas_cobradas_por_emprestimo || []).map((p, idx) => ({
        id: `inst_${idx}`,
        emprestimo: p.emprestimo || `Empréstimo ${idx + 1}`,
        dataEmprestimo: p.data_emprestimo || '-',
        quantidadeCobradas: p.quantidade_parcelas_cobradas || (p.historico_cobrancas ? p.historico_cobrancas.length : 0),
        historico: p.historico_cobrancas || []
      }));

      const finalInstallments = aiInstallments.length > 0 ? aiInstallments : activeDebts.map((d, idx) => {
        const relatedEvents = amortizationTimeline.filter(t => t.valorPago > 0);
        return {
          id: `inst_def_${idx}`,
          emprestimo: d.description || `Empréstimo de R$ ${d.amount.toFixed(2)} (${d.date})`,
          dataEmprestimo: d.date,
          quantidadeCobradas: relatedEvents.length,
          historico: relatedEvents.map(p => ({
            data: p.data,
            valorCobrado: p.valorPago,
            descricao: p.descricao,
            evidencia: p.evidencia
          }))
        };
      });

      const finalResult = {
        executionMode: step2Mode, // 'manual' | 'auto'
        manualTotal,
        autoTotal,
        totalEmprestado: totalContracted,
        totalEmprestimosDinheiro: totalLoansCash,
        debtConditions: activeDebts,
        totalPago: totalPaid,
        totalJurosDevidos: totalInterestDue,
        totalJurosCobrados: totalInterestChargedByCreditor,
        totalAmortizado: totalPrincipalAmortized,
        saldoFinalReal: finalDebtBalance,
        totalPagoAMais: finalOverpaid,
        status: finalStatus,
        timeline: amortizationTimeline,
        audioTranscripts,
        textRecords,
        fullDialog: fullConversationDialog,
        receipts: allPayments,
        targetContactDisplay,
        negotiations: finalNegotiations,
        unmadeAmortizations: finalUnmadeAmortizations,
        installmentsCharged: finalInstallments,
        firstMessage,
        lastMessage,
        keywordEvents,
        metrics: {
          totalMensagens: rawMessages.length,
          totalTextos: textCount,
          totalAudios: audioCount,
          totalImagens: imageCount,
          totalComprovantes: allPayments.length,
          periodoInicio: rawMessages.length > 0 ? (rawMessages[0].isoDate || (rawMessages[0].messageTimestamp ? new Date(rawMessages[0].messageTimestamp * 1000).toLocaleDateString('pt-BR') : 'Início')) : '-',
          periodoFim: rawMessages.length > 0 ? (rawMessages[rawMessages.length - 1].isoDate || (rawMessages[rawMessages.length - 1].messageTimestamp ? new Date(rawMessages[rawMessages.length - 1].messageTimestamp * 1000).toLocaleDateString('pt-BR') : 'Hoje')) : '-'
        },
        aiReport: aiAuditResponse || {
          diagnostico_pericial: `Após reconstituição contábil com base em dias corridos e no Código Civil art. 354 sobre ${activeDebts.length} operações de empréstimos (Total: R$ ${totalContracted.toFixed(2)}), apurou-se que foram pagos R$ ${totalPaid.toFixed(2)}. ${finalDebtBalance <= 0 ? `Dívida TOTALMENTE QUITADA, restando saldo credor a favor do devedor de R$ ${finalOverpaid.toFixed(2)} pago a mais a ser devolvido pelo número ${targetContactDisplay}!` : `Saldo devedor restante justo a pagar ao número ${targetContactDisplay}: R$ ${finalDebtBalance.toFixed(2)}.`}`,
          irregularidades_detectadas: [
            'Cobrança de juros sem o devido abatimento das amortizações do capital principal.',
            'Não consideração de descontos de juros em pagamentos antecipados e dias corridos pro-rata die.'
          ]
        }
      };

      setAuditResult(finalResult);
      setAuditProgress({ current: 100, total: 100, stepLabel: 'Perícia Concluída com Sucesso!' });
      addLog('🏁 PERÍCIA FINALIZADA COM SUCESSO! Resultados, planilha Excel e arquivo de transcrição prontos para download.', 'success');

    } catch (err) {
      addLog(`❌ Erro durante a perícia: ${err.message}`, 'error');
      alert('Erro na perícia: ' + err.message);
    } finally {
      setIsAuditing(false);
    }
  }

  // Função auxiliar para destacar palavras-chave em HTML para Word e PDF
  function highlightKeywordsHtml(text) {
    if (!text) return '';
    const escaped = String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return escaped.replace(
      /(empr[ée]stim\w*|renegoci\w*|amortiz\w*|parcel\w*|pag\w*|juros|taxa|saldo|d[íi]vida|abat\w*|quitar\w*|quitad\w*)/gi,
      '<mark style="background-color: #fef08a; color: #854d0e; font-weight: bold; padding: 1px 4px; border-radius: 3px;">$1</mark>'
    );
  }

  // ── GERADOR DE PLANILHA EXCEL (.XLSX) COM DIÁLOGO TRANSCRITO E AMORTIZAÇÕES ──
  function exportAuditToExcel() {
    if (!auditResult) {
      alert('Nenhum resultado de perícia disponível para exportar.');
      return;
    }

    try {
      const wb = XLSX.utils.book_new();
      const targetPhone = selectedContact?.phone || (selectedContact?.jid ? selectedContact.jid.replace('@s.whatsapp.net', '') : manualPhone) || 'Credor';
      const targetDisplay = auditResult.targetContactDisplay || targetPhone;

      // ABA 1: RESUMO DO LAUDO & VEREDITO OFICIAL (QUEM DEVE A QUEM)
      const verdictHeader = auditResult.status === 'QUITADO_PAGO_A_MAIS'
        ? `O NÚMERO ${targetDisplay} DEVE RESTITUIR R$ ${auditResult.totalPagoAMais.toFixed(2)} AO USUÁRIO (QUITADO / PAGO A MAIS)`
        : `O USUÁRIO DEVE R$ ${auditResult.saldoFinalReal.toFixed(2)} AO NÚMERO ${targetDisplay} (SALDO RESTANTE JUSTO)`;

      const summaryRows = [
        ['LAUDO PERICIAL DE AUDITORIA FINANCEIRA FORENSE & AMORTIZAÇÕES'],
        ['Emitido pelo Módulo Forense de Inteligência Artificial'],
        [''],
        ['========================================================================================'],
        ['VEREDITO OFICIAL DA PERÍCIA (QUEM DEVE A QUEM):'],
        [verdictHeader],
        ['========================================================================================'],
        [''],
        ['Credor Auditado:', selectedContact?.name || 'Credor'],
        ['Telefone do Credor:', targetPhone],
        ['Modo de Execução Utilizado:', auditResult.executionMode === 'auto' ? 'Automático (Identificado por IA)' : 'Manual'],
        ['Data da Emissão da Perícia:', new Date().toLocaleDateString('pt-BR')],
        ['Critério de Amortização:', 'Código Civil art. 354 (Amortização Linear dos Juros Primeiro + Dias Corridos Pro-Rata Die)'],
        [''],
        ['RESUMO DOS VALORES APURADOS (R$):'],
        ['Total de Empréstimos em Dinheiro/PIX:', auditResult.totalEmprestado],
        ['Total Geral do Principal Contratado:', auditResult.totalEmprestado],
        ['Total Efetivamente Pago pelo Usuário:', auditResult.totalPago],
        ['Total de Juros Legais Devidos (dias corridos):', auditResult.totalJurosDevidos],
        ['Total de Capital Principal Amortizado:', auditResult.totalAmortizado],
        ['Saldo Devedor Real Restante:', auditResult.saldoFinalReal],
        ['Valor Pago a Mais a Restituir (Indébito):', auditResult.totalPagoAMais],
        ['Situação Final da Dívida:', auditResult.status === 'QUITADO_PAGO_A_MAIS' ? 'TOTALMENTE QUITADA - PAGOU A MAIS' : 'SALDO RESTANTE RECALCULADO'],
        [''],
        ['ESTATÍSTICAS DA CONVERSA ANALISADA (WHATSAPP - AMBOS OS LADOS):'],
        ['Total Geral de Mensagens Analisadas (1ª à última):', auditResult.metrics?.totalMensagens || auditResult.fullDialog?.length || 0],
        ['Data da 1ª Mensagem da Conversa:', auditResult.firstMessage?.dateTime || auditResult.firstMessage?.date || '-'],
        ['Remetente da 1ª Mensagem:', auditResult.firstMessage?.sender || '-'],
        ['Data da Última Mensagem da Conversa:', auditResult.lastMessage?.dateTime || auditResult.lastMessage?.date || '-'],
        ['Total de Ocorrências com Palavras-Chave (Áudios/Textos):', auditResult.keywordEvents?.length || 0],
        ['Mensagens de Texto Lidas:', auditResult.metrics?.totalTextos || auditResult.textRecords?.length || 0],
        ['Áudios de Voz Escutados e Transcritos:', auditResult.metrics?.totalAudios || auditResult.audioTranscripts?.length || 0],
        ['Imagens e Prints Periciados (OCR):', auditResult.metrics?.totalImagens || 0],
        ['Comprovantes Bancários Validados:', auditResult.receipts?.length || 0],
        ['Período Histórico Auditado:', `${auditResult.metrics?.periodoInicio || '-'} até ${auditResult.metrics?.periodoFim || '-'}`],
        [''],
        ['PARECER TÉCNICO PERICIAL:'],
        [auditResult.aiReport?.diagnostico_pericial || ''],
        [''],
        ['IRREGULARIDADES E COBRANÇAS INDEVIDAS IDENTIFICADAS:'],
        ...(auditResult.aiReport?.irregularidades_detectadas || []).map(i => [`• ${i}`])
      ];

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo do Laudo');

      // ABA 2: EXTRATO CRONOLÓGICO DE AMORTIZAÇÕES (COM DIAS CORRIDOS)
      const timelineHeaders = [
        'Data',
        'Dias Corridos',
        'Origem do Evento',
        'Descrição da Transação / Amortização',
        'Saldo Principal Anterior (R$)',
        'Taxa Mensal (% a.m.)',
        'Juros do Período (R$)',
        'Juros Acumulados Pendentes (R$)',
        'Valor Pago (R$)',
        'Abatimento de Juros (R$)',
        'Amortização do Principal (R$)',
        'Saldo Devedor Restante (R$)',
        'Crédito a Restituir (R$)',
        'Status do Evento',
        'Evidência Probatória'
      ];
      const timelineRows = auditResult.timeline.map(t => [
        t.data,
        t.diasCorridos,
        t.origem,
        t.descricao,
        t.saldoAnterior,
        t.taxaJurosMensal,
        t.jurosPeriodo,
        t.jurosAcumuladosAntes,
        t.valorPago,
        t.jurosAbatidos,
        t.amortizacaoCapital,
        t.saldoDevedor,
        t.saldoCredor,
        t.status,
        t.evidencia
      ]);
      const wsTimeline = XLSX.utils.aoa_to_sheet([timelineHeaders, ...timelineRows]);
      XLSX.utils.book_append_sheet(wb, wsTimeline, 'Extrato de Amortizações');

      // ABA 3: CONDIÇÕES DE EMPRÉSTIMOS CONTRATADOS
      const conditionsHeaders = ['Tipo de Operação', 'Data', 'Valor (R$)', 'Juros Cobrados (% a.m.)', 'Descrição / Finalidade', 'Evidência'];
      const conditionsRows = (auditResult.debtConditions || []).map(c => [
        'Empréstimo em Dinheiro',
        c.date,
        c.amount,
        `${c.monthlyRate}% ao mês`,
        c.description || 'Empréstimo',
        c.evidence || ''
      ]);
      const wsConditions = XLSX.utils.aoa_to_sheet([conditionsHeaders, ...conditionsRows]);
      XLSX.utils.book_append_sheet(wb, wsConditions, 'Empréstimos Contratados');

      // ABA 4: COMPROVANTES E PAGAMENTOS IDENTIFICADOS
      const receiptsHeaders = ['Data', 'Valor Pago (R$)', 'Origem', 'ID Transação / Autenticação', 'Evidência / Detalhes'];
      const receiptsRows = auditResult.receipts.map(r => [
        r.date,
        r.amount,
        r.origin,
        r.authId || 'Sem Autenticação',
        r.evidence
      ]);
      const wsReceipts = XLSX.utils.aoa_to_sheet([receiptsHeaders, ...receiptsRows]);
      XLSX.utils.book_append_sheet(wb, wsReceipts, 'Comprovantes de Pagamento');

      // ABA 5: DIÁLOGO TRANSCRITO COMPLETO (TEXTOS E ÁUDIOS)
      const dialogHeaders = ['Ordem', 'Data e Hora', 'Remetente', 'Tipo de Mensagem', 'Conteúdo Transcrito / Texto Completo', 'Análise Financeira'];
      const dialogRows = (auditResult.fullDialog || []).map((m, idx) => [
        idx + 1,
        m.dateTime || m.date,
        m.sender,
        m.mediaTypeLabel,
        m.content,
        m.resumoFinanceiro || (m.taxaJuros ? `Taxa citada: ${m.taxaJuros}` : '')
      ]);
      const wsDialog = XLSX.utils.aoa_to_sheet([dialogHeaders, ...dialogRows]);
      XLSX.utils.book_append_sheet(wb, wsDialog, 'Diálogo Transcrito Completo');

      // ABA 6: NEGOCIAÇÕES E RENEGOCIAÇÕES COM DATAS
      const negHeaders = ['Data da Negociação', 'Tipo de Acordo', 'Valor Negociado (R$)', 'Qtd de Parcelas', 'Datas Pactuadas de Pagamento', 'Valor Total Contratado (R$)', 'Descrição do Acordo', 'Evidência Probatória'];
      const negRows = (auditResult.negotiations || []).map(n => [
        n.data,
        n.tipo,
        n.valorNegociado,
        n.quantidadeParcelas,
        n.datasPagamentos,
        n.valorTotal,
        n.descricao,
        n.evidencia
      ]);
      const wsNeg = XLSX.utils.aoa_to_sheet([negHeaders, ...negRows]);
      XLSX.utils.book_append_sheet(wb, wsNeg, 'Negociações e Renegociações');

      // ABA 7: AMORTIZAÇÕES COM DIREITO LEGAL NÃO FEITAS PELO CREDOR (ART. 354 CC)
      const unmadeHeaders = [
        'Data do Pagamento',
        'Empréstimo de Referência',
        'Valor Pago pelo Devedor (R$)',
        'Juros Vencidos Quitados (R$)',
        'Valor com Direito Legal de Amortização (R$)',
        'Saldo Anterior (R$)',
        'Saldo Legal Real Atualizado (R$)',
        'Irregularidade e Prejuízo Cometido pelo Credor',
        'Evidência Probatória'
      ];
      const unmadeRows = (auditResult.unmadeAmortizations || []).map(u => [
        u.dataPagamento,
        u.emprestimoReferencia,
        u.valorPago,
        u.jurosDevidosData,
        u.valorDireitoAmortizacao,
        u.saldoAnterior,
        u.saldoDevedorAposAmortizacao,
        u.prejuizoOuIrregularidade,
        u.evidencia
      ]);
      const wsUnmade = XLSX.utils.aoa_to_sheet([unmadeHeaders, ...unmadeRows]);
      XLSX.utils.book_append_sheet(wb, wsUnmade, 'Amortizações Não Feitas');

      // ABA 8: QUANTIDADE DE PARCELAS COBRADAS POR CADA EMPRÉSTIMO COM DATAS
      const chargedHeaders = ['Empréstimo', 'Data do Empréstimo', 'Qtd de Parcelas Cobradas', 'Data da Cobrança', 'Valor Cobrado (R$)', 'Descrição da Cobrança', 'Evidência Probatória'];
      const chargedRows = [];
      (auditResult.installmentsCharged || []).forEach(inst => {
        if (inst.historico && inst.historico.length > 0) {
          inst.historico.forEach(h => {
            chargedRows.push([
              inst.emprestimo,
              inst.dataEmprestimo,
              inst.quantidadeCobradas,
              h.data,
              h.valorCobrado,
              h.descricao,
              h.evidencia
            ]);
          });
        } else {
          chargedRows.push([
            inst.emprestimo,
            inst.dataEmprestimo,
            inst.quantidadeCobradas,
            '-',
            0,
            'Sem detalhamento individual de cobrança',
            '-'
          ]);
        }
      });
      const wsCharged = XLSX.utils.aoa_to_sheet([chargedHeaders, ...chargedRows]);
      XLSX.utils.book_append_sheet(wb, wsCharged, 'Parcelas Cobradas');

      // ABA 9: TODAS AS MENSAGENS E ÁUDIOS COM PALAVRAS-CHAVE E DATAS
      const kwHeaders = ['Ordem', 'Data e Hora', 'Data', 'Hora', 'Remetente', 'Tipo de Mídia', 'Origem', 'Conteúdo da Mensagem / Áudio'];
      const kwRows = (auditResult.keywordEvents || []).map((ev, i) => [
        i + 1,
        ev.dateTime || `${ev.date} ${ev.time || ''}`,
        ev.date || '',
        ev.time || '',
        ev.sender || (ev.isFromMe ? 'Eu (Devedor)' : 'Credor'),
        ev.mediaTypeLabel || (ev.type === 'audio' ? 'Áudio de Voz' : ev.type === 'image' ? 'Imagem / Print' : 'Texto'),
        ev.isFromMe ? 'Devedor' : 'Credor',
        ev.content || ''
      ]);
      const wsKw = XLSX.utils.aoa_to_sheet([kwHeaders, ...kwRows]);
      XLSX.utils.book_append_sheet(wb, wsKw, 'Palavras-Chave e Datas');

      const safePhone = (selectedContact?.phone || manualPhone || 'credor').replace(/\D/g, '');
      const filename = `pericia_financeira_${auditResult.executionMode}_${safePhone}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, filename);
      addLog(`📥 Planilha Excel oficial "${filename}" baixada com sucesso!`, 'success');

    } catch (exportErr) {
      alert('Erro ao exportar planilha Excel: ' + exportErr.message);
    }
  }

  // ── GERADOR DE LAUDO OFICIAL EM WORD (.DOC) ─────────────────────────
  function exportAuditToWord() {
    if (!auditResult) {
      alert('Nenhum resultado de perícia disponível para exportar.');
      return;
    }
    try {
      const targetPhone = selectedContact?.phone || (selectedContact?.jid ? selectedContact.jid.replace('@s.whatsapp.net', '') : manualPhone) || 'Credor';
      const targetDisplay = auditResult.targetContactDisplay || targetPhone;
      const safePhone = String(targetPhone).replace(/\D/g, '') || 'credor';
      const isPaidOff = auditResult.status === 'QUITADO_PAGO_A_MAIS';
      const nowStr = new Date().toLocaleString('pt-BR');

      const verdictTitle = isPaidOff
        ? `O NÚMERO ${targetDisplay} DEVE RESTITUIR R$ ${auditResult.totalPagoAMais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} AO USUÁRIO (QUITADO / PAGO A MAIS)`
        : `O USUÁRIO DEVE R$ ${auditResult.saldoFinalReal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} AO NÚMERO ${targetDisplay} (SALDO RESTANTE RECALCULADO)`;

      const docHtml = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
          <meta charset='utf-8'>
          <title>Laudo Pericial Financeiro - ${targetDisplay}</title>
          <style>
            body { font-family: 'Segoe UI', Calibri, Arial, sans-serif; font-size: 11pt; color: #1e293b; line-height: 1.5; margin: 25mm 20mm; }
            h1 { color: #0f172a; font-size: 18pt; border-bottom: 3px solid #00B377; padding-bottom: 8px; margin-bottom: 4px; }
            h2 { color: #0284C7; font-size: 13pt; margin-top: 22px; margin-bottom: 8px; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 4px; }
            .header-subtitle { font-size: 10pt; color: #64748b; margin-bottom: 20px; }
            .box { padding: 14px 18px; border-radius: 8px; margin: 16px 0; }
            .verdict-box { background-color: ${isPaidOff ? '#ecfdf5' : '#fffbeb'}; border: 2px solid ${isPaidOff ? '#10b981' : '#f59e0b'}; }
            .verdict-title { font-size: 13pt; font-weight: bold; color: ${isPaidOff ? '#047857' : '#b45309'}; margin-bottom: 6px; }
            .verdict-text { font-size: 10.5pt; color: #1e293b; line-height: 1.5; }
            table { width: 100%; border-collapse: collapse; margin: 14px 0 20px 0; }
            th { background-color: #0f172a; color: #ffffff; padding: 8px 10px; font-size: 9.5pt; text-align: left; border: 1px solid #334155; }
            td { padding: 7px 10px; font-size: 9pt; border: 1px solid #cbd5e1; }
            tr:nth-child(even) { background-color: #f8fafc; }
            .badge-teal { background: #d1fae5; color: #065f46; padding: 2px 6px; border-radius: 4px; font-weight: bold; }
            .badge-amber { background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 4px; font-weight: bold; }
            .footer-sign { margin-top: 40px; border-top: 1px dashed #94a3b8; padding-top: 20px; font-size: 10pt; color: #475569; text-align: center; }
          </style>
        </head>
        <body>
          <h1>LAUDO PERICIAL CONTÁBIL & AUDITORIA FORENSE</h1>
          <div class="header-subtitle">
            Sistema Órbita Forense (Módulo IA de Perícia Financeira de Conversa & Amortizações)<br>
            Emissão: <strong>${nowStr}</strong> • Fundamento Legal: <strong>Código Civil Brasileiro (Art. 354)</strong>
          </div>

          <div class="box verdict-box">
            <div class="verdict-title">⚖️ VEREDITO OFICIAL DA PERÍCIA (QUEM DEVE A QUEM):</div>
            <div style="font-size: 12pt; font-weight: bold; margin-bottom: 6px;">${verdictTitle}</div>
            <div class="verdict-text">
              ${isPaidOff
                ? `Após a recomposição cronológica de todos os mútuos financeiros e amortizações legais (Código Civil art. 354 com juros lineares pro-rata die em dias corridos), constatou-se que a dívida está <strong>TOTALMENTE QUITADA</strong>. O valor global pago de R$ ${auditResult.totalPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} superou a obrigação contratada acrescida de juros legítimos. O saldo remanescente de <strong>R$ ${auditResult.totalPagoAMais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> constitui indébito e deve ser restituído imediatamente pelo credor ao devedor.`
                : `Após a recomposição cronológica de todos os mútuos financeiros e pagamentos comprovados, restam <strong>R$ ${auditResult.saldoFinalReal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> do capital principal a pagar. Todos os pagamentos intermediários abateram integralmente os juros vencidos da respectiva data, havendo amortização de R$ ${auditResult.totalAmortizado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} do saldo principal.`}
            </div>
          </div>

          <h2>1. Identificação das Partes e da Operação</h2>
          <table>
            <tr><td width="30%"><strong>Credor / Cobrador:</strong></td><td>${selectedContact?.name || 'Credor'} (${targetDisplay})</td></tr>
            <tr><td><strong>Modo de Auditoria:</strong></td><td>${auditResult.executionMode === 'auto' ? 'Automático (Detectado por Inteligência Artificial)' : 'Manual (Informado pelo Usuário)'}</td></tr>
            <tr><td><strong>Metodologia Aplicada:</strong></td><td>Amortização Linear Legal (Código Civil Art. 354: Juros primeiro, saldo principal em seguida)</td></tr>
            <tr><td><strong>Regime de Juros:</strong></td><td>Pro-Rata Die (cálculo diário em dias corridos sobre o capital principal pendente)</td></tr>
          </table>

          <h2>2. Escopo Pericial & Estatísticas da Conversa (WhatsApp)</h2>
          <table>
            <tr><td width="35%"><strong>Total Geral de Mensagens Analisadas:</strong></td><td><strong>${auditResult.metrics?.totalMensagens || auditResult.fullDialog?.length || 0}</strong> (examinadas da 1ª à última mensagem de ambos os lados)</td></tr>
            <tr><td><strong>Data da 1ª Mensagem da Conversa:</strong></td><td><strong>${auditResult.firstMessage?.dateTime || auditResult.firstMessage?.date || '-'}</strong> (${auditResult.firstMessage?.sender || '-'})</td></tr>
            <tr><td><strong>Data da Última Mensagem Analisada:</strong></td><td>${auditResult.lastMessage?.dateTime || auditResult.lastMessage?.date || '-'}</td></tr>
            <tr><td><strong>Ocorrências de Palavras-Chave:</strong></td><td><strong style="color: #b45309; background: #fef3c7; padding: 2px 6px; border-radius: 4px;">${auditResult.keywordEvents?.length || 0} mensagens e áudios com termos-chave encontrados</strong></td></tr>
            <tr><td><strong>Mensagens de Texto Lidas:</strong></td><td>${auditResult.metrics?.totalTextos || auditResult.textRecords?.length || 0} textos examinados</td></tr>
            <tr><td><strong>Áudios de Voz Escutados e Transcritos:</strong></td><td><strong>${auditResult.metrics?.totalAudios || auditResult.audioTranscripts?.length || 0} áudios</strong> (transcrição pericial com IA)</td></tr>
            <tr><td><strong>Imagens e Prints Periciados (OCR):</strong></td><td><strong>${auditResult.metrics?.totalImagens || 0} imagens/prints</strong> (leitura ótica de comprovantes e extratos)</td></tr>
            <tr><td><strong>Comprovantes Bancários Validados:</strong></td><td>${auditResult.receipts?.length || 0} pagamentos comprovados</td></tr>
            <tr><td><strong>Período Histórico Auditado:</strong></td><td>De <strong>${auditResult.metrics?.periodoInicio || '-'}</strong> até <strong>${auditResult.metrics?.periodoFim || '-'}</strong></td></tr>
          </table>

          <h2>3. Resumo Geral dos Valores Apurados</h2>
          <table>
            <thead>
              <tr>
                <th>Descrição do Item</th>
                <th>Valor Apurado (R$)</th>
                <th>Detalhamento / Observações</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Total do Principal Contratado</strong></td>
                <td><strong>R$ ${auditResult.totalEmprestado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></td>
                <td>Soma de todos os mútuos em dinheiro concedidos</td>
              </tr>
              <tr>
                <td><strong>Total Efetivamente Pago</strong></td>
                <td style="color: #047857; font-weight: bold;">R$ ${auditResult.totalPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td>Comprovado por recibos, PIX e histórico de pagamentos (${auditResult.receipts.length} comprovantes)</td>
              </tr>
              <tr>
                <td><strong>Juros Legais Devidos (Dias Corridos)</strong></td>
                <td>R$ ${auditResult.totalJurosDevidos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td>Apuração diária pro-rata die com base na taxa mensal pactuada</td>
              </tr>
              <tr>
                <td><strong>Juros Efetivamente Abatidos</strong></td>
                <td>R$ ${auditResult.totalJurosCobrados.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td>Juros quitados pelos pagamentos antes da amortização do capital</td>
              </tr>
              <tr>
                <td><strong>Capital Principal Amortizado</strong></td>
                <td style="color: #0284C7; font-weight: bold;">R$ ${auditResult.totalAmortizado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td>Excedente dos pagamentos que reduziu diretamente o principal</td>
              </tr>
              <tr style="background-color: ${isPaidOff ? '#ecfdf5' : '#fffbeb'};">
                <td><strong>${isPaidOff ? 'VALOR PAGO A MAIS (A RESTITUIR)' : 'SALDO DEVEDOR REAL RESTANTE'}</strong></td>
                <td style="font-size: 11pt; font-weight: bold; color: ${isPaidOff ? '#047857' : '#b45309'};">
                  R$ ${(isPaidOff ? auditResult.totalPagoAMais : auditResult.saldoFinalReal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
                <td>${isPaidOff ? 'Repetição de indébito exigível perante o credor' : 'Saldo remanescente devido legalmente'}</td>
              </tr>
            </tbody>
          </table>

          <h2>4. Cronologia de Mensagens e Áudios com Palavras-Chave Identificadas (Empréstimo, Renegociação, Amortização, Parcelas)</h2>
          <p style="font-size: 9.5pt; color: #475569;">
            Foram identificadas <strong>${(auditResult.keywordEvents || []).length}</strong> mensagens e gravações de áudio contendo termos financeiros relevantes com suas respectivas datas e horários em ordem cronológica:
          </p>
          <table>
            <thead>
              <tr>
                <th width="15%">Data e Hora</th>
                <th width="12%">Tipo</th>
                <th width="18%">Remetente</th>
                <th>Conteúdo da Conversa / Áudio Transcrito (Termos em Destaque)</th>
              </tr>
            </thead>
            <tbody>
              ${(auditResult.keywordEvents || []).map(ev => `
                <tr>
                  <td><strong>${ev.dateTime || `${ev.date} ${ev.time || ''}`}</strong></td>
                  <td><span class="${ev.type === 'audio' ? 'badge-amber' : 'badge-teal'}">${ev.mediaTypeLabel || ev.type}</span></td>
                  <td><strong>${ev.sender}</strong></td>
                  <td style="font-size: 8.5pt;">${highlightKeywordsHtml(ev.content)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          ${auditResult.aiReport?.diagnostico_pericial ? `
            <h2>5. Parecer Técnico & Diagnóstico Pericial</h2>
            <div style="background-color: #f8fafc; padding: 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 10pt;">
              ${auditResult.aiReport.diagnostico_pericial}
            </div>
          ` : ''}

          ${(auditResult.aiReport?.irregularidades_detectadas?.length || 0) > 0 ? `
            <h2>6. Irregularidades e Cobranças Abusivas Detectadas</h2>
            <ul>
              ${auditResult.aiReport.irregularidades_detectadas.map(i => `<li style="margin-bottom: 6px;">${i}</li>`).join('')}
            </ul>
          ` : ''}

          <h2>7. Negociações & Renegociações com Datas, Parcelas e Valores Totais</h2>
          <table>
            <thead>
              <tr>
                <th>Data da Negociação</th>
                <th>Tipo</th>
                <th>Valor Negociado (R$)</th>
                <th>Qtd Parcelas</th>
                <th>Datas Pactuadas</th>
                <th>Valor Total (R$)</th>
                <th>Descrição do Acordo</th>
                <th>Evidência</th>
              </tr>
            </thead>
            <tbody>
              ${(auditResult.negotiations || []).map(n => `
                <tr>
                  <td><strong>${n.data}</strong></td>
                  <td><span class="${n.tipo?.includes('RENEGOCIACAO') ? 'badge-amber' : 'badge-teal'}">${n.tipo}</span></td>
                  <td>R$ ${Number(n.valorNegociado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td>${n.quantidadeParcelas}</td>
                  <td>${n.datasPagamentos}</td>
                  <td><strong>R$ ${Number(n.valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></td>
                  <td>${n.descricao}</td>
                  <td style="font-size: 8.5pt; color: #475569;">${n.evidencia}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <h2>8. Amortizações que o Devedor Tinha Direito e o Credor NÃO Concedeu (Art. 354 CC)</h2>
          <table>
            <thead>
              <tr>
                <th>Data Pagto</th>
                <th>Empréstimo</th>
                <th>Valor Pago (R$)</th>
                <th>Juros Quitados</th>
                <th>Valor com Direito de Amortizar (R$)</th>
                <th>Saldo Dev. Real (R$)</th>
                <th>Violação Legal Cometida pelo Credor</th>
              </tr>
            </thead>
            <tbody>
              ${(auditResult.unmadeAmortizations || []).map(u => `
                <tr>
                  <td><strong>${u.dataPagamento}</strong></td>
                  <td>${u.emprestimoReferencia}</td>
                  <td style="color: #047857; font-weight: bold;">R$ ${Number(u.valorPago).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td>R$ ${Number(u.jurosDevidosData).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td style="color: #0284C7; font-weight: bold; background: #ecfeff;">R$ ${Number(u.valorDireitoAmortizacao).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td>R$ ${Number(u.saldoDevedorAposAmortizacao || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td style="font-size: 8.5pt; color: #b45309;">${u.prejuizoOuIrregularidade}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <h2>9. Quantidade de Parcelas Cobradas por Empréstimo com Datas</h2>
          <table>
            <thead>
              <tr>
                <th>Empréstimo</th>
                <th>Data Concessão</th>
                <th>Total de Parcelas Cobradas</th>
                <th>Datas e Valores das Cobranças Exigidas</th>
              </tr>
            </thead>
            <tbody>
              ${(auditResult.installmentsCharged || []).map(inst => `
                <tr>
                  <td><strong>${inst.emprestimo}</strong></td>
                  <td>${inst.dataEmprestimo}</td>
                  <td style="text-align: center; font-weight: bold;">${inst.quantidadeCobradas} cobrança(s)</td>
                  <td style="font-size: 8.5pt;">
                    ${(inst.historico || []).map(h => `• <strong>${h.data}</strong>: R$ ${Number(h.valorCobrado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${h.descricao || 'Cobrança'})`).join('<br>')}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <h2>10. Relação de Empréstimos Concedidos</h2>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Valor (R$)</th>
                <th>Taxa (% a.m.)</th>
                <th>Descrição / Finalidade</th>
                <th>Evidência</th>
              </tr>
            </thead>
            <tbody>
              ${(auditResult.debtConditions || []).map(c => `
                <tr>
                  <td><strong>${c.date}</strong></td>
                  <td>R$ ${Number(c.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td>${c.monthlyRate}% a.m.</td>
                  <td>${c.description || 'Empréstimo em Dinheiro'}</td>
                  <td style="font-size: 8.5pt; color: #475569;">${c.evidence || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <h2>11. Relação de Pagamentos e Comprovantes Identificados</h2>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Valor Pago (R$)</th>
                <th>Origem</th>
                <th>Autenticação / ID</th>
                <th>Evidência</th>
              </tr>
            </thead>
            <tbody>
              ${auditResult.receipts.map(r => `
                <tr>
                  <td><strong>${r.date}</strong></td>
                  <td style="color: #047857; font-weight: bold;">R$ ${Number(r.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td>${r.origin}</td>
                  <td>${r.authId || '-'}</td>
                  <td style="font-size: 8.5pt; color: #475569;">${r.evidence || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <h2>12. Extrato Cronológico de Amortizações (Código Civil Art. 354)</h2>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Dias</th>
                <th>Descrição do Evento</th>
                <th>Saldo Ant.</th>
                <th>Juros Período</th>
                <th>Valor Pago</th>
                <th>Juros Pagos</th>
                <th>Principal Amortizado</th>
                <th>Saldo Devedor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${auditResult.timeline.map(t => `
                <tr>
                  <td>${t.data}</td>
                  <td>${t.diasCorridos}</td>
                  <td>${t.descricao}</td>
                  <td>R$ ${t.saldoAnterior.toFixed(2)}</td>
                  <td>R$ ${t.jurosPeriodo.toFixed(2)}</td>
                  <td style="font-weight: bold; color: ${t.valorPago > 0 ? '#047857' : '#000'};">R$ ${t.valorPago.toFixed(2)}</td>
                  <td>R$ ${t.jurosAbatidos.toFixed(2)}</td>
                  <td style="font-weight: bold; color: #0284C7;">R$ ${t.amortizacaoCapital.toFixed(2)}</td>
                  <td style="font-weight: bold;">R$ ${t.saldoDevedor.toFixed(2)}</td>
                  <td><span class="${t.status?.includes('PAGO') ? 'badge-teal' : 'badge-amber'}">${t.status}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="footer-sign">
            <strong>ÓRBITA FORENSE • PERÍCIA CONTÁBIL DIGITAL</strong><br>
            Relatório gerado automaticamente por algoritmos de auditoria forense e inteligência artificial.<br>
            Válido como instrumento comprobatório contábil fundamentado na legislação civil e bancária brasileira.
          </div>
        </body>
        </html>
      `;

      const blob = new Blob(['\ufeff', docHtml], { type: 'application/msword;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `laudo_pericial_financeiro_${safePhone}_${new Date().toISOString().slice(0, 10)}.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      addLog(`📄 Laudo pericial em Word (.doc) baixado com sucesso!`, 'success');
    } catch (e) {
      console.error('Erro ao exportar Word:', e);
      alert('Erro ao gerar documento Word: ' + e.message);
    }
  }

  // ── IMPRESSÃO / SALVAR EM PDF ───────────────────────────────────────
  function exportAuditToPdf() {
    if (!auditResult) {
      alert('Nenhum resultado de perícia disponível para exportar.');
      return;
    }
    try {
      const targetPhone = selectedContact?.phone || (selectedContact?.jid ? selectedContact.jid.replace('@s.whatsapp.net', '') : manualPhone) || 'Credor';
      const targetDisplay = auditResult.targetContactDisplay || targetPhone;
      const isPaidOff = auditResult.status === 'QUITADO_PAGO_A_MAIS';
      const nowStr = new Date().toLocaleString('pt-BR');

      const verdictTitle = isPaidOff
        ? `O NÚMERO ${targetDisplay} DEVE RESTITUIR R$ ${auditResult.totalPagoAMais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} AO USUÁRIO (QUITADO / PAGO A MAIS)`
        : `O USUÁRIO DEVE R$ ${auditResult.saldoFinalReal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} AO NÚMERO ${targetDisplay} (SALDO RESTANTE RECALCULADO)`;

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Permita popups no navegador para gerar a impressão / PDF.');
        return;
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Laudo Pericial Financeiro - ${targetDisplay}</title>
          <style>
            @page { size: A4; margin: 15mm 12mm; }
            body { font-family: 'Segoe UI', Calibri, Arial, sans-serif; font-size: 10pt; color: #1e293b; line-height: 1.45; margin: 0; padding: 10px; }
            h1 { color: #0f172a; font-size: 16pt; border-bottom: 2px solid #00B377; padding-bottom: 4px; margin-top: 0; }
            h2 { color: #0284C7; font-size: 12pt; margin-top: 16px; margin-bottom: 6px; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; }
            .header-info { font-size: 9pt; color: #64748b; margin-bottom: 12px; }
            .verdict-box { padding: 12px; border-radius: 6px; margin: 12px 0; background-color: ${isPaidOff ? '#ecfdf5' : '#fffbeb'}; border: 2px solid ${isPaidOff ? '#10b981' : '#f59e0b'}; }
            .verdict-title { font-size: 12pt; font-weight: bold; color: ${isPaidOff ? '#047857' : '#b45309'}; margin-bottom: 4px; }
            table { width: 100%; border-collapse: collapse; margin: 10px 0 14px 0; font-size: 8.5pt; }
            th { background-color: #0f172a; color: #ffffff; padding: 6px 8px; text-align: left; border: 1px solid #334155; }
            td { padding: 5px 8px; border: 1px solid #cbd5e1; }
            tr:nth-child(even) { background-color: #f8fafc; }
            .footer-sign { margin-top: 30px; border-top: 1px dashed #94a3b8; padding-top: 15px; font-size: 9pt; color: #475569; text-align: center; }
            @media print {
              .no-print { display: none !important; }
              body { padding: 0; }
              tr { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="no-print" style="background: #0f172a; color: #fff; padding: 10px 14px; border-radius: 6px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
            <span>💡 <strong>Dica de Impressão:</strong> Na janela de impressão, selecione o destino <strong>"Salvar como PDF"</strong>.</span>
            <button onclick="window.print()" style="background: #00E59B; color: #081018; font-weight: bold; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">🖨️ Imprimir / Salvar PDF</button>
          </div>

          <h1>LAUDO PERICIAL CONTÁBIL & AUDITORIA FORENSE</h1>
          <div class="header-info">
            Sistema Órbita Forense • Emissão: <strong>${nowStr}</strong> • Fundamento: <strong>Código Civil Brasileiro (Art. 354 - Pro-Rata Die)</strong>
          </div>

          <div class="verdict-box">
            <div class="verdict-title">⚖️ VEREDITO OFICIAL DA PERÍCIA (QUEM DEVE A QUEM):</div>
            <div style="font-size: 11pt; font-weight: bold; margin-bottom: 4px;">${verdictTitle}</div>
            <div style="font-size: 9.5pt; line-height: 1.45;">
              ${isPaidOff
                ? `A dívida está <strong>TOTALMENTE QUITADA</strong>. O valor global pago de R$ ${auditResult.totalPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} superou o principal e juros devidos. O saldo credor de <strong>R$ ${auditResult.totalPagoAMais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> constitui repetição de indébito exigível imediatamente perante o credor.`
                : `Restam <strong>R$ ${auditResult.saldoFinalReal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> do capital principal a pagar. Os pagamentos amortizaram R$ ${auditResult.totalAmortizado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} do saldo principal após quitação dos juros devidos no período.`}
            </div>
          </div>

          <h2>1. Dados das Partes e Metodologia</h2>
          <table>
            <tr><td width="30%"><strong>Credor Auditado:</strong></td><td>${selectedContact?.name || 'Credor'} (${targetDisplay})</td></tr>
            <tr><td><strong>Modo de Auditoria:</strong></td><td>${auditResult.executionMode === 'auto' ? 'Automático (Identificado por Inteligência Artificial)' : 'Manual (Cadastrado pelo Usuário)'}</td></tr>
            <tr><td><strong>Critério Legal:</strong></td><td>Código Civil Art. 354 • Amortização Linear (Juros primeiro, Principal em seguida)</td></tr>
            <tr><td><strong>Regime de Juros:</strong></td><td>Pro-Rata Die (cálculo diário em dias corridos)</td></tr>
          </table>

          <h2>2. Escopo Pericial & Estatísticas da Conversa (WhatsApp)</h2>
          <table>
            <tr><td width="35%"><strong>Total Geral de Mensagens Analisadas:</strong></td><td><strong>${auditResult.metrics?.totalMensagens || auditResult.fullDialog?.length || 0}</strong> (examinadas da 1ª à última mensagem de ambos os lados)</td></tr>
            <tr><td><strong>Data da 1ª Mensagem da Conversa:</strong></td><td><strong>${auditResult.firstMessage?.dateTime || auditResult.firstMessage?.date || '-'}</strong> (${auditResult.firstMessage?.sender || '-'})</td></tr>
            <tr><td><strong>Data da Última Mensagem Analisada:</strong></td><td>${auditResult.lastMessage?.dateTime || auditResult.lastMessage?.date || '-'}</td></tr>
            <tr><td><strong>Ocorrências de Palavras-Chave:</strong></td><td><strong style="color: #b45309;">${auditResult.keywordEvents?.length || 0} mensagens e áudios com termos-chave encontrados</strong></td></tr>
            <tr><td><strong>Mensagens de Texto Lidas:</strong></td><td>${auditResult.metrics?.totalTextos || auditResult.textRecords?.length || 0} textos examinados</td></tr>
            <tr><td><strong>Áudios de Voz Escutados e Transcritos:</strong></td><td><strong>${auditResult.metrics?.totalAudios || auditResult.audioTranscripts?.length || 0} áudios</strong> (transcrição pericial com IA)</td></tr>
            <tr><td><strong>Imagens e Prints Periciados (OCR):</strong></td><td><strong>${auditResult.metrics?.totalImagens || 0} imagens/prints</strong> (leitura de comprovantes e extratos)</td></tr>
            <tr><td><strong>Comprovantes Bancários Validados:</strong></td><td>${auditResult.receipts?.length || 0} pagamentos comprovados</td></tr>
            <tr><td><strong>Período Histórico Auditado:</strong></td><td>De <strong>${auditResult.metrics?.periodoInicio || '-'}</strong> até <strong>${auditResult.metrics?.periodoFim || '-'}</strong></td></tr>
          </table>

          <h2>3. Resumo Geral dos Valores Apurados</h2>
          <table>
            <thead>
              <tr><th>Descrição do Item</th><th>Valor Apurado (R$)</th><th>Observações</th></tr>
            </thead>
            <tbody>
              <tr><td><strong>Total do Principal Contratado</strong></td><td><strong>R$ ${auditResult.totalEmprestado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></td><td>Soma dos empréstimos concedidos</td></tr>
              <tr><td><strong>Total Efetivamente Pago</strong></td><td style="color: #047857; font-weight: bold;">R$ ${auditResult.totalPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td>${auditResult.receipts.length} pagamentos identificados</td></tr>
              <tr><td><strong>Juros Legais Devidos (Dias Corridos)</strong></td><td>R$ ${auditResult.totalJurosDevidos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td>Juros pro-rata die pactuados</td></tr>
              <tr><td><strong>Principal Amortizado</strong></td><td style="color: #0284C7; font-weight: bold;">R$ ${auditResult.totalAmortizado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td>Redução do saldo principal</td></tr>
              <tr style="background-color: ${isPaidOff ? '#ecfdf5' : '#fffbeb'};">
                <td><strong>${isPaidOff ? 'VALOR PAGO A MAIS (A RESTITUIR)' : 'SALDO DEVEDOR REAL RESTANTE'}</strong></td>
                <td style="font-weight: bold; color: ${isPaidOff ? '#047857' : '#b45309'};">R$ ${(isPaidOff ? auditResult.totalPagoAMais : auditResult.saldoFinalReal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td>${isPaidOff ? 'Indébito a restituir' : 'Saldo remanescente devedor'}</td>
              </tr>
            </tbody>
          </table>

          <h2>4. Cronologia de Mensagens e Áudios com Palavras-Chave Identificadas (Empréstimo, Renegociação, Amortizações)</h2>
          <table>
            <thead>
              <tr>
                <th width="15%">Data e Hora</th>
                <th width="12%">Tipo</th>
                <th width="18%">Remetente</th>
                <th>Conteúdo com Palavras-Chave Destacadas</th>
              </tr>
            </thead>
            <tbody>
              ${(auditResult.keywordEvents || []).map(ev => `
                <tr>
                  <td><strong>${ev.dateTime || `${ev.date} ${ev.time || ''}`}</strong></td>
                  <td>${ev.mediaTypeLabel || ev.type}</td>
                  <td><strong>${ev.sender}</strong></td>
                  <td style="font-size: 8pt;">${highlightKeywordsHtml(ev.content)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          ${auditResult.aiReport?.diagnostico_pericial ? `
            <h2>5. Parecer Técnico & Diagnóstico Pericial</h2>
            <div style="background-color: #f8fafc; padding: 10px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 9pt;">
              ${auditResult.aiReport.diagnostico_pericial}
            </div>
          ` : ''}

          <h2>6. Negociações & Renegociações com Datas, Parcelas e Valores Totais</h2>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Valor Negociado (R$)</th>
                <th>Qtd Parcelas</th>
                <th>Datas Pactuadas</th>
                <th>Valor Total (R$)</th>
                <th>Descrição do Acordo</th>
              </tr>
            </thead>
            <tbody>
              ${(auditResult.negotiations || []).map(n => `
                <tr>
                  <td><strong>${n.data}</strong></td>
                  <td>${n.tipo}</td>
                  <td>R$ ${Number(n.valorNegociado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td>${n.quantidadeParcelas}</td>
                  <td>${n.datasPagamentos}</td>
                  <td><strong>R$ ${Number(n.valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></td>
                  <td>${n.descricao}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <h2>7. Amortizações que o Devedor Tinha Direito e o Credor NÃO Concedeu (Art. 354 CC)</h2>
          <table>
            <thead>
              <tr>
                <th>Data Pagto</th>
                <th>Empréstimo</th>
                <th>Valor Pago (R$)</th>
                <th>Juros Quitados</th>
                <th>Valor Direito de Amortizar (R$)</th>
                <th>Saldo Real (R$)</th>
                <th>Irregularidade do Credor</th>
              </tr>
            </thead>
            <tbody>
              ${(auditResult.unmadeAmortizations || []).map(u => `
                <tr>
                  <td><strong>${u.dataPagamento}</strong></td>
                  <td>${u.emprestimoReferencia}</td>
                  <td style="color: #047857; font-weight: bold;">R$ ${Number(u.valorPago).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td>R$ ${Number(u.jurosDevidosData).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td style="color: #0284C7; font-weight: bold; background: #ecfeff;">R$ ${Number(u.valorDireitoAmortizacao).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td>R$ ${Number(u.saldoDevedorAposAmortizacao || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td style="font-size: 8pt; color: #b45309;">${u.prejuizoOuIrregularidade}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <h2>8. Quantidade de Parcelas Cobradas por Empréstimo com Datas</h2>
          <table>
            <thead>
              <tr>
                <th>Empréstimo</th>
                <th>Data Concessão</th>
                <th>Total Cobranças</th>
                <th>Histórico de Cobranças Exigidas (Datas e Valores)</th>
              </tr>
            </thead>
            <tbody>
              ${(auditResult.installmentsCharged || []).map(inst => `
                <tr>
                  <td><strong>${inst.emprestimo}</strong></td>
                  <td>${inst.dataEmprestimo}</td>
                  <td style="text-align: center; font-weight: bold;">${inst.quantidadeCobradas} cobrança(s)</td>
                  <td style="font-size: 8pt;">
                    ${(inst.historico || []).map(h => `• <strong>${h.data}</strong>: R$ ${Number(h.valorCobrado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${h.descricao || 'Cobrança'})`).join('<br>')}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <h2>9. Empréstimos Contratados</h2>
          <table>
            <thead>
              <tr><th>Data</th><th>Valor (R$)</th><th>Taxa (% a.m.)</th><th>Descrição</th><th>Evidência</th></tr>
            </thead>
            <tbody>
              ${(auditResult.debtConditions || []).map(c => `
                <tr>
                  <td><strong>${c.date}</strong></td>
                  <td>R$ ${Number(c.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td>${c.monthlyRate}% a.m.</td>
                  <td>${c.description || 'Empréstimo em Dinheiro'}</td>
                  <td>${c.evidence || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <h2>10. Extrato Cronológico de Amortizações (Código Civil Art. 354)</h2>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Dias</th>
                <th>Descrição</th>
                <th>Saldo Ant.</th>
                <th>Juros</th>
                <th>Valor Pago</th>
                <th>Juros Pagos</th>
                <th>Amortizado</th>
                <th>Saldo Dev.</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${auditResult.timeline.map(t => `
                <tr>
                  <td>${t.data}</td>
                  <td>${t.diasCorridos}</td>
                  <td>${t.descricao}</td>
                  <td>R$ ${t.saldoAnterior.toFixed(2)}</td>
                  <td>R$ ${t.jurosPeriodo.toFixed(2)}</td>
                  <td style="font-weight: bold; color: ${t.valorPago > 0 ? '#047857' : '#000'};">R$ ${t.valorPago.toFixed(2)}</td>
                  <td>R$ ${t.jurosAbatidos.toFixed(2)}</td>
                  <td style="font-weight: bold; color: #0284C7;">R$ ${t.amortizacaoCapital.toFixed(2)}</td>
                  <td style="font-weight: bold;">R$ ${t.saldoDevedor.toFixed(2)}</td>
                  <td>${t.status}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="footer-sign">
            <strong>ÓRBITA FORENSE • PERÍCIA CONTÁBIL DIGITAL</strong><br>
            Relatório emitido em conformidade com o Art. 354 do Código Civil Brasileiro.
          </div>
        </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 500);
      addLog(`📑 Janela de impressão e geração de PDF iniciada!`, 'success');
    } catch (e) {
      console.error('Erro ao exportar PDF:', e);
      alert('Erro ao gerar laudo em PDF: ' + e.message);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* CABEÇALHO DO MÓDULO */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(13, 17, 28, 0.98))',
        border: '1px solid rgba(0, 229, 155, 0.3)',
        borderRadius: 16,
        padding: 24,
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 21, fontWeight: 900, color: 'var(--ink1)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span>⚖️</span> 3 - Perícia Financeira de Conversa & Amortizações (IA)
            </h2>
            <p style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 6, marginBottom: 0, lineHeight: 1.5 }}>
              Audite negociações de empréstimos e cobrança de juros no WhatsApp: leitura do histórico completo, audição de áudios,
              OCR de comprovantes e cálculo de amortizações com relatório comparativo e planilha Excel.
            </p>
          </div>

          {/* BOTÃO E STATUS DA CONEXÃO WHATSAPP */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 14px',
            borderRadius: 12,
            background: connStatus?.connected ? 'rgba(0, 229, 155, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            border: `1px solid ${connStatus?.connected ? 'var(--teal)' : 'rgba(239, 68, 68, 0.4)'}`
          }}>
            <div style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: connStatus?.connected ? 'var(--teal)' : '#EF4444',
              boxShadow: connStatus?.connected ? '0 0 8px var(--teal)' : '0 0 8px #EF4444'
            }} />
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#fff' }}>
              {connStatus?.connected ? 'WhatsApp Web Conectado' : 'WhatsApp Desconectado'}
            </div>
            
            <button
              type="button"
              onClick={handleOpenConnectModal}
              style={{
                fontSize: 11.5,
                fontWeight: 900,
                padding: '6px 12px',
                borderRadius: 8,
                background: connStatus?.connected ? 'rgba(255,255,255,0.08)' : 'var(--teal)',
                color: connStatus?.connected ? '#fff' : '#081018',
                border: connStatus?.connected ? '1px solid var(--line)' : 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              <span>📱</span> {connStatus?.connected ? 'Reconectar / QR Code' : 'Conectar Agora'}
            </button>

            {/* Botão de Desconectar WhatsApp Solicitado pelo Usuário */}
            <button
              type="button"
              onClick={handleDisconnectWhatsApp}
              disabled={disconnecting}
              title="Desconectar do WhatsApp e forçar limpeza de sessão"
              style={{
                fontSize: 11.5,
                fontWeight: 800,
                padding: '6px 12px',
                borderRadius: 8,
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#EF4444',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                transition: 'all 0.2s ease'
              }}
            >
              <span>🔌</span> {disconnecting ? 'Desconectando...' : 'Desconectar WhatsApp'}
            </button>

            <button
              type="button"
              onClick={() => setShowConfigModal(true)}
              title="Configurar URL do Servidor Railway e Chave da API"
              style={{
                fontSize: 11.5,
                fontWeight: 800,
                padding: '6px 11px',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.08)',
                color: '#fff',
                border: '1px solid var(--line)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              <span>⚙️</span> Servidor API
            </button>
          </div>
        </div>

        {/* GARANTIA DE RESTRIÇÃO / SEGURANÇA: MODO 100% LEITURA (READ-ONLY) */}
        <div style={{
          marginTop: 16,
          padding: '12px 16px',
          borderRadius: 12,
          background: 'rgba(56, 189, 248, 0.08)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}>
          <span style={{ fontSize: 22 }}>🔒</span>
          <div style={{ fontSize: 12.5, lineHeight: 1.5, color: '#E0F2FE' }}>
            <strong style={{ color: '#38BDF8', fontWeight: 900 }}>Restrição de Segurança Ativa — Modo Somente Leitura (Read-Only):</strong> O sistema foi programado estritamente para <strong>ler mensagens, ouvir áudios, analisar prints</strong> e <strong>fazer os cálculos financeiros</strong>. É <u>terminantemente bloqueado</u> apagar, excluir ou alterar qualquer mensagem, áudio ou imagem do seu WhatsApp. Seus arquivos originais permanecem 100% intactos e preservados.
          </div>
        </div>
      </div>

      {/* MODAL INTEGRADO DE CONEXÃO WHATSAPP (QR CODE + CÓDIGO DE PAREAMENTO) */}
      {showConnectModalLocal && (
        <div className="modal-bg" style={{ zIndex: 12000 }}>
          <div className="modal" style={{ maxWidth: 450, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 16, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>📱</span> Conectar WhatsApp Oficial
              </h3>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setShowConnectModalLocal(false)}
                style={{ width: 28, height: 28, borderRadius: 8, padding: 0, margin: 0, border: '1px solid var(--line)', color: 'var(--ink2)', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {connectError && (
              <div style={{
                padding: '12px 14px',
                borderRadius: 8,
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                fontSize: 12,
                color: '#FCA5A5',
                lineHeight: 1.4,
                display: 'flex',
                flexDirection: 'column',
                gap: 8
              }}>
                <div>⚠️ {connectError}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => handleDisconnectWhatsApp(true)}
                    disabled={disconnecting}
                    style={{
                      padding: '7px 14px',
                      borderRadius: 6,
                      background: '#EF4444',
                      color: '#fff',
                      border: 'none',
                      fontSize: 12,
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      boxShadow: '0 2px 8px rgba(239,68,68,0.3)'
                    }}
                  >
                    <span>🔌</span> {disconnecting ? 'Limpando sessão...' : 'Limpar Sessão e Gerar Novo QR Code'}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setShowConnectModalLocal(false); setShowConfigModal(true); }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      background: 'rgba(255,255,255,0.08)',
                      color: '#fff',
                      border: '1px solid var(--line)',
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    ⚙️ Configurar Servidor
                  </button>
                </div>
              </div>
            )}

            {/* Abas: QR Code vs Código de Pareamento */}
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
                  border: 'none'
                }}
                onClick={() => { setConnectTab('qr'); if (!qrCodeData) handleFetchQr(); }}
              >
                📷 Ler QR Code
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
                  border: 'none'
                }}
                onClick={() => setConnectTab('pairing')}
              >
                🔑 Código de 8 Dígitos
              </button>
            </div>

            {/* Conteúdo Aba QR Code */}
            {connectTab === 'qr' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '10px 0' }}>
                <div style={{
                  width: 220,
                  height: 220,
                  background: '#fff',
                  borderRadius: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 10,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
                }}>
                  {loadingQr ? (
                    <div style={{ color: '#081018', fontSize: 13, fontWeight: 800 }}>⏳ Gerando QR Code...</div>
                  ) : qrCodeData ? (
                    <img
                      src={typeof qrCodeData === 'string' && qrCodeData.startsWith('data:') ? qrCodeData : `data:image/png;base64,${typeof qrCodeData === 'string' ? qrCodeData : (qrCodeData?.base64 || '')}`}
                      alt="QR Code WhatsApp"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  ) : (
                    <div style={{ color: '#081018', fontSize: 12, textAlign: 'center', padding: 8 }}>
                      Clique no botão abaixo para gerar o QR Code.
                    </div>
                  )}
                </div>

                <div style={{ fontSize: 12, color: 'var(--ink2)', textAlign: 'center', lineHeight: 1.4 }}>
                  Abra o WhatsApp no celular ➔ Toque nos <strong>3 pontinhos / Ajustes</strong> ➔ <strong>Aparelhos Conectados</strong> ➔ <strong>Conectar Aparelho</strong> e aponte a câmera.
                </div>

                <button
                  type="button"
                  onClick={handleFetchQr}
                  disabled={loadingQr}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 8,
                    background: 'var(--teal)',
                    color: '#081018',
                    border: 'none',
                    fontWeight: 800,
                    fontSize: 12,
                    cursor: 'pointer'
                  }}
                >
                  {loadingQr ? 'Carregando...' : '🔄 Atualizar QR Code'}
                </button>
              </div>
            )}

            {/* Conteúdo Aba Código de Pareamento */}
            {connectTab === 'pairing' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <form onSubmit={handleGeneratePairing} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: 12, color: 'var(--ink1)', fontWeight: 800 }}>
                    Número do WhatsApp (com DDD):
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 61999998888"
                    value={pairingPhone}
                    onChange={(e) => setPairingPhone(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--line)',
                      background: 'rgba(0,0,0,0.4)',
                      color: '#fff',
                      fontSize: 13
                    }}
                  />
                  <button
                    type="submit"
                    disabled={generatingPairing}
                    style={{
                      width: '100%',
                      padding: '9px',
                      borderRadius: 8,
                      background: 'var(--teal)',
                      color: '#081018',
                      fontWeight: 900,
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    {generatingPairing ? '⏳ Gerando...' : '🔑 Gerar Código'}
                  </button>
                </form>

                {pairingCodeResult && (
                  <div style={{
                    padding: 14,
                    borderRadius: 10,
                    background: 'rgba(0, 229, 155, 0.1)',
                    border: '1px solid var(--teal)',
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 800 }}>CÓDIGO DE PAREAMENTO:</div>
                    <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '4px', color: '#fff', margin: '6px 0' }}>
                      {typeof pairingCodeResult === 'object' ? (pairingCodeResult?.code || pairingCodeResult?.pairingCode || '') : String(pairingCodeResult || '')}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink2)' }}>
                      No celular: <strong>Aparelhos Conectados</strong> ➔ <strong>Conectar com número de telefone</strong> e digite o código acima!
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Opções Rodapé do Modal */}
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                onClick={handleResetSession}
                disabled={resettingInstance}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#FF8A65',
                  fontSize: 11.5,
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                {resettingInstance ? '⏳ Reiniciando...' : '⚠️ Sessão travada? Limpar e Reiniciar'}
              </button>

              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={handleDisconnectWhatsApp}
                  disabled={disconnecting}
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#EF4444',
                    fontSize: 11.5,
                    fontWeight: 800,
                    padding: '4px 10px',
                    borderRadius: 6,
                    cursor: 'pointer'
                  }}
                >
                  {disconnecting ? '⏳ Desconectando...' : '🔌 Desconectar WhatsApp'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowConnectModalLocal(false); setShowConfigModal(true); }}
                  style={{
                    background: 'none',
                    border: '1px solid var(--line)',
                    borderRadius: 6,
                    color: '#38BDF8',
                    fontSize: 11.5,
                    padding: '4px 8px',
                    cursor: 'pointer'
                  }}
                >
                  ⚙️ Configurar Servidor
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowConnectModalLocal(false)}
                  style={{ padding: '4px 12px', fontSize: 12, margin: 0 }}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIGURAÇÃO DA EVOLUTION API / RAILWAY */}
      {showConfigModal && (
        <div className="modal-bg" style={{ zIndex: 14000 }}>
          <div className="modal" style={{ maxWidth: 440, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 16, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>⚙️</span> Servidor da API Evolution (Railway)
              </h3>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setShowConfigModal(false)}
                style={{ width: 28, height: 28, borderRadius: 8, padding: 0, margin: 0, border: '1px solid var(--line)', color: 'var(--ink2)', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.4 }}>
              Atualize a URL e a Chave da sua Evolution API hospedada no Railway ou VPS:
            </div>

            <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>
                  URL do Servidor Evolution API
                </label>
                <input 
                  type="text"
                  placeholder="https://sua-evolution-api.up.railway.app"
                  value={apiConfig.serverUrl}
                  onChange={(e) => setApiConfig({ ...apiConfig, serverUrl: e.target.value })}
                  required
                  style={{ marginTop: 4, width: '100%', padding: '9px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.4)', border: '1px solid var(--line)', color: '#fff', fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>
                  Chave Global da API (AUTHENTICATION_API_KEY)
                </label>
                <input 
                  type="text"
                  placeholder="Chave secreta configurada no Railway"
                  value={apiConfig.apiKey}
                  onChange={(e) => setApiConfig({ ...apiConfig, apiKey: e.target.value })}
                  required
                  style={{ marginTop: 4, width: '100%', padding: '9px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.4)', border: '1px solid var(--line)', color: '#fff', fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>
                  Nome da Instância
                </label>
                <input 
                  type="text"
                  placeholder="dr_candido"
                  value={apiConfig.instanceName}
                  onChange={(e) => setApiConfig({ ...apiConfig, instanceName: e.target.value })}
                  style={{ marginTop: 4, width: '100%', padding: '9px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.4)', border: '1px solid var(--line)', color: '#fff', fontSize: 13 }}
                />
              </div>

              {testResult && (
                <div style={{
                  padding: 10,
                  borderRadius: 8,
                  fontSize: 12,
                  background: testResult.success ? 'rgba(0, 229, 155, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  border: `1px solid ${testResult.success ? 'var(--teal)' : '#EF4444'}`,
                  color: testResult.success ? 'var(--teal)' : '#EF4444',
                  lineHeight: 1.4
                }}>
                  {testResult.success ? '✓ ' : '⚠️ '}{testResult.message}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={handleTestConn}
                  disabled={testingConn}
                  style={{
                    padding: '9px 14px',
                    borderRadius: 8,
                    background: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                    color: '#38BDF8',
                    fontWeight: 800,
                    fontSize: 12,
                    cursor: testingConn ? 'not-allowed' : 'pointer'
                  }}
                >
                  {testingConn ? 'Testando...' : '🧪 Testar Conexão'}
                </button>

                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '9px 16px',
                    borderRadius: 8,
                    background: 'var(--teal)',
                    border: 'none',
                    color: '#081018',
                    fontWeight: 900,
                    fontSize: 12.5,
                    cursor: 'pointer'
                  }}
                >
                  💾 Salvar Configurações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POP-UP MODAL COM CRONÔMETRO REGRESSIVO DE 3 MINUTOS (180s) & FEED AO VIVO DE CONVERSAS E ÁUDIOS */}
      {showAuditProgressModal && (
        <div className="modal-bg" style={{ zIndex: 14500, backdropFilter: 'blur(10px)', background: 'rgba(3, 7, 18, 0.88)' }}>
          <div className="modal" style={{ maxWidth: 760, width: '95%', maxHeight: '92vh', padding: 24, display: 'flex', flexDirection: 'column', gap: 14, border: '1px solid rgba(0, 229, 155, 0.45)', boxShadow: '0 12px 48px rgba(0, 229, 155, 0.25)', overflow: 'hidden' }}>
            
            {/* Cabeçalho */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: isAuditing ? 'rgba(0, 229, 155, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                  border: `1px solid ${isAuditing ? 'var(--teal)' : '#38BDF8'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22
                }}>
                  {isAuditing ? '🤖' : '✓'}
                </div>
                <div>
                  <h3 style={{ fontSize: 17, color: '#fff', margin: 0, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isAuditing ? 'Perícia Forense em Andamento' : 'Perícia Concluída com Sucesso!'}
                    {isAuditing && (
                      <span style={{ fontSize: 11, background: 'rgba(0, 229, 155, 0.2)', color: 'var(--teal)', padding: '2px 8px', borderRadius: 10, fontWeight: 800 }}>
                        AO VIVO
                      </span>
                    )}
                  </h3>
                  <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2 }}>
                    {selectedContact ? `Alvo: ${selectedContact.name || selectedContact.jid} ↔ ${myUserName}` : 'Examinando histórico de conversas...'}
                  </div>
                </div>
              </div>

              {/* CRONÔMETRO COMPACTO NO CABEÇALHO */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  background: 'rgba(0,0,0,0.5)',
                  border: '1px solid rgba(0, 229, 155, 0.4)',
                  borderRadius: 10,
                  padding: '6px 14px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--ink2)', textTransform: 'uppercase' }}>
                    ⏱️ Tempo Decorrido
                  </div>
                  <div style={{
                    fontFamily: 'monospace, "Courier New", Courier',
                    fontSize: 20,
                    fontWeight: 900,
                    color: 'var(--teal)',
                    lineHeight: 1.1
                  }}>
                    {formatCountdown(auditElapsedSeconds)}
                  </div>
                </div>

                {!isAuditing && (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                    setShowAuditProgressModal(false);
                    setWizardStep(4);
                  }}
                    style={{ width: 32, height: 32, borderRadius: 8, padding: 0, margin: 0, border: '1px solid var(--line)', color: '#fff', cursor: 'pointer', fontSize: 14 }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* BARRA DE PROGRESSO & FASE ATUAL */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>
                  {auditProgress.stepLabel || 'Processando dados...'}
                </span>
                <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--teal)' }}>
                  {auditProgress.current}%
                </span>
              </div>
              <div style={{
                width: '100%',
                height: 8,
                borderRadius: 4,
                background: 'rgba(255, 255, 255, 0.08)',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${auditProgress.current}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #00E59B, #38BDF8)',
                  transition: 'width 0.4s ease'
                }} />
              </div>
            </div>

            {/* ABAS DO MODAL: CONVERSAS AO VIVO VS LOGS DO SISTEMA */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setLiveModalTab('dialogue')}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: liveModalTab === 'dialogue' ? 'var(--teal)' : 'rgba(255,255,255,0.06)',
                    color: liveModalTab === 'dialogue' ? '#081018' : 'var(--ink2)',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <span>💬</span> Conversa Sendo Lida ao Vivo ({liveDialogueFeed.length})
                </button>

                <button
                  type="button"
                  onClick={() => setLiveModalTab('logs')}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: liveModalTab === 'logs' ? 'var(--teal)' : 'rgba(255,255,255,0.06)',
                    color: liveModalTab === 'logs' ? '#081018' : 'var(--ink2)',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <span>⚙️</span> Logs Técnicos ({auditLogs.length})
                </button>
              </div>

              {/* CAMPO RÁPIDO PARA AJUSTAR NOME DO USUÁRIO */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--ink2)', fontWeight: 700 }}>Meu Nome:</span>
                <input
                  type="text"
                  value={myUserName}
                  onChange={(e) => {
                    setMyUserName(e.target.value);
                    localStorage.setItem('wa_audit_my_name', e.target.value);
                  }}
                  style={{
                    width: 90,
                    padding: '4px 8px',
                    borderRadius: 6,
                    background: 'rgba(0,0,0,0.5)',
                    border: '1px solid var(--line)',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 800
                  }}
                  title="Altere seu nome se desejar"
                />
              </div>
            </div>

            {/* CONTEÚDO DA ABA 1: FEED AO VIVO DE CONVERSAS ESTILO WHATSAPP */}
            {liveModalTab === 'dialogue' && (
              <div 
                ref={liveFeedEndRef}
                style={{
                  background: 'rgba(2, 6, 23, 0.75)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 12,
                  padding: 14,
                  height: 320,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  scrollBehavior: 'smooth'
                }}
              >
                {liveDialogueFeed.length === 0 ? (
                  <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--ink2)', fontSize: 13, padding: 20 }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
                    Carregando mensagens da conversa com {selectedContact?.name || 'o contato'}...
                  </div>
                ) : (
                  liveDialogueFeed.map((item, idx) => {
                    const isMe = item.isFromMe;
                    return (
                      <div
                        key={item.id || idx}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignSelf: isMe ? 'flex-end' : 'flex-start',
                          maxWidth: '85%',
                          background: isMe 
                            ? 'linear-gradient(135deg, rgba(0, 229, 155, 0.12), rgba(0, 179, 119, 0.18))' 
                            : 'rgba(30, 41, 59, 0.75)',
                          border: `1px solid ${isMe ? 'rgba(0, 229, 155, 0.35)' : 'rgba(56, 189, 248, 0.3)'}`,
                          borderRadius: 12,
                          padding: '8px 12px',
                          gap: 3,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                        }}
                      >
                        {/* Nome do Remetente e Horário */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <span style={{
                            fontSize: 11.5,
                            fontWeight: 900,
                            color: isMe ? 'var(--teal)' : '#38BDF8'
                          }}>
                            {item.sender}:
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--ink3)' }}>
                            {item.time}
                          </span>
                        </div>

                        {/* Corpo da Mensagem */}
                        {item.type === 'TEXT' && (
                          <div style={{ fontSize: 12.5, color: '#fff', lineHeight: 1.4, wordBreak: 'break-word' }}>
                            {item.text}
                          </div>
                        )}

                        {item.type === 'AUDIO' && (
                          <div>
                            {item.status === 'transcribing' ? (
                              <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '4px 10px',
                                borderRadius: 8,
                                background: 'rgba(245, 158, 11, 0.15)',
                                border: '1px solid #F59E0B',
                                color: '#F59E0B',
                                fontSize: 11.5,
                                fontWeight: 800
                              }}>
                                <span>🎙️</span>
                                <span>Áudio sendo transcrito com Inteligência Artificial...</span>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                <div style={{ fontSize: 11, color: '#F59E0B', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span>🎙️</span> Áudio Transcrito:
                                </div>
                                <div style={{ fontSize: 12.5, color: '#fff', fontStyle: 'italic', background: 'rgba(0,0,0,0.3)', padding: '6px 8px', borderRadius: 6 }}>
                                  "{item.transcription}"
                                </div>
                                {item.resumo && (
                                  <div style={{ fontSize: 11, color: '#38BDF8' }}>
                                    ⚡ Resumo Financeiro: {item.resumo}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {item.type === 'IMAGE' && (
                          <div>
                            {item.status === 'analyzing' ? (
                              <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '4px 10px',
                                borderRadius: 8,
                                background: 'rgba(56, 189, 248, 0.15)',
                                border: '1px solid #38BDF8',
                                color: '#38BDF8',
                                fontSize: 11.5,
                                fontWeight: 800
                              }}>
                                <span>🖼️</span>
                                <span>Print / Imagem sendo periciada via OCR da IA...</span>
                              </div>
                            ) : (
                              <div style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 800 }}>
                                🖼️ {item.ocrResult}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* CONTEÚDO DA ABA 2: LOGS TÉCNICOS */}
            {liveModalTab === 'logs' && (
              <div 
                ref={logEndRef}
                style={{
                  background: 'rgba(0, 0, 0, 0.75)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 12,
                  padding: 12,
                  height: 320,
                  overflowY: 'auto',
                  fontFamily: 'monospace',
                  fontSize: 11,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4
                }}
              >
                {auditLogs.length === 0 ? (
                  <span style={{ color: 'var(--ink2)' }}>Iniciando conexão segura em modo somente leitura...</span>
                ) : (
                  auditLogs.map((lg, i) => (
                    <div key={i} style={{
                      color: lg.type === 'error' ? '#EF4444' : lg.type === 'success' ? 'var(--teal)' : 'var(--ink1)',
                      lineHeight: 1.4
                    }}>
                      <span style={{ color: 'var(--ink3)', marginRight: 6 }}>[{lg.time}]</span>
                      {lg.msg}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* AVISO DE SEGURANÇA LEITURA EXCLUSIVA */}
            <div style={{
              fontSize: 11,
              color: 'var(--teal)',
              background: 'rgba(0, 229, 155, 0.08)',
              border: '1px solid rgba(0, 229, 155, 0.25)',
              borderRadius: 8,
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 6
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🔒</span>
                <span><strong>Garantia Estrita de Leitura:</strong> Nenhuma mensagem, áudio ou print é modificado ou excluído do WhatsApp.</span>
              </div>
              {liveDialogueFeed.length > 0 && (
                <span style={{ fontSize: 10.5, color: 'var(--ink2)' }}>
                  📖 {liveDialogueFeed.length} mensagens lidas em tempo real
                </span>
              )}
            </div>

            {/* BOTÕES DE AÇÃO */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              {isAuditing ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                    setShowAuditProgressModal(false);
                    setWizardStep(4);
                  }}
                    style={{
                      padding: '9px 16px',
                      borderRadius: 8,
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid var(--line)',
                      color: 'var(--ink1)',
                      fontSize: 12,
                      cursor: 'pointer'
                    }}
                  >
                    Minimizar Pop-up
                  </button>
                  <button
                    type="button"
                    onClick={() => { abortAuditRef.current = true; }}
                    style={{
                      padding: '9px 16px',
                      borderRadius: 8,
                      background: '#EF4444',
                      border: 'none',
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: 12,
                      cursor: 'pointer'
                    }}
                  >
                    🛑 Parar Perícia
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setShowAuditProgressModal(false);
                    setWizardStep(4);
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 20px',
                    borderRadius: 10,
                    background: 'var(--teal)',
                    border: 'none',
                    color: '#081018',
                    fontWeight: 900,
                    fontSize: 14,
                    cursor: 'pointer',
                    boxShadow: '0 4px 15px rgba(0, 229, 155, 0.4)'
                  }}
                >
                  📊 Ver Laudo Pericial & Resultados Detalhados
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* 🧭 SELETOR DE ETAPAS INTERATIVO (WIZARD STEPPER)                 */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 10,
        margin: '6px 0 16px 0'
      }}>
        {[
          { step: 1, icon: '👤', title: 'Etapa 1', subtitle: 'Selecionar Credor' },
          { step: 2, icon: '💵', title: 'Etapa 2', subtitle: 'Empréstimos (Manual ou IA)' },
          { step: 3, icon: '🧾', title: 'Etapa 3', subtitle: 'Comprovantes & Pagos' },
          { step: 4, icon: '🚀', title: 'Etapa 4', subtitle: 'Análise com IA & Laudo' }
        ].map(s => {
          const isActive = wizardStep === s.step;
          const isCompleted = (s.step === 1 && (selectedContact || uploadedChatFile)) ||
                              (s.step === 2 && (debtConditions.length > 0 || autoDetectedDebts.length > 0 || step2Mode === 'auto')) ||
                              (s.step === 3 && (uploadedReceipts.length > 0 || manualTotalPaidSaved > 0 || selectedContact)) ||
                              (s.step === 4 && auditResult);
          return (
            <div
              key={s.step}
              onClick={() => setWizardStep(s.step)}
              style={{
                padding: '12px 16px',
                borderRadius: 12,
                background: isActive
                  ? 'linear-gradient(135deg, rgba(0, 229, 155, 0.22), rgba(15, 23, 42, 0.95))'
                  : 'rgba(15, 23, 42, 0.75)',
                border: `1.5px solid ${isActive ? 'var(--teal)' : isCompleted ? 'rgba(0, 229, 155, 0.4)' : 'var(--line)'}`,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                transition: 'all 0.2s ease',
                boxShadow: isActive ? '0 4px 18px rgba(0, 229, 155, 0.25)' : 'none'
              }}
            >
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: isActive ? 'var(--teal)' : isCompleted ? 'rgba(0, 229, 155, 0.2)' : 'rgba(255,255,255,0.06)',
                color: isActive ? '#081018' : isCompleted ? 'var(--teal)' : 'var(--ink2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 900
              }}>
                {isCompleted && !isActive ? '✓' : s.icon}
              </div>
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: isActive ? 'var(--teal)' : 'var(--ink2)', textTransform: 'uppercase' }}>
                  {s.title}
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 900, color: '#fff' }}>
                  {s.subtitle}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Banner de atalho caso já exista laudo gerado e usuário esteja em etapas anteriores */}
      {auditResult && wizardStep !== 4 && (
        <div style={{
          padding: '10px 16px',
          borderRadius: 10,
          background: 'rgba(0, 229, 155, 0.12)',
          border: '1px solid var(--teal)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10
        }}>
          <span style={{ fontSize: 12.5, color: '#fff', fontWeight: 800 }}>
            💡 Você possui um Laudo Pericial calculado! Deseja ver os resultados e downloads?
          </span>
          <button
            type="button"
            onClick={() => setWizardStep(4)}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              background: 'var(--teal)',
              border: 'none',
              color: '#081018',
              fontWeight: 900,
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            Ver Laudo & Baixar Arquivos ➔
          </button>
        </div>
      )}

      {/* ────────────────── ETAPA 1: SELECIONAR CONTATO / CREDOR ────────────────── */}
      {wizardStep === 1 && (
        <div style={{
          background: 'rgba(15, 23, 42, 0.9)',
          border: '1px solid var(--line)',
          borderRadius: 16,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 14
        }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>👤</span> Etapa 1: Selecionar Número do Credor
          </div>

          {/* GUIA PASSO A PASSO ETAPA 1 */}
          <div style={{
            padding: '12px 16px',
            borderRadius: 12,
            background: 'rgba(0, 229, 155, 0.08)',
            border: '1px solid rgba(0, 229, 155, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>📌</span> Passo a Passo desta Etapa 1:
            </div>
            <div style={{ fontSize: 12, color: '#fff', lineHeight: 1.6 }}>
              <strong>1. Conectar WhatsApp:</strong> Verifique no topo se está como <em>"WhatsApp Web Conectado"</em> (se não estiver, clique em <em>"Conectar Agora"</em>).<br />
              <strong>2. Selecionar o Contato:</strong> Escolha na lista abaixo a conversa da pessoa/credor que você quer periciar (ou digite o telefone dela no campo com DDD).<br />
              <strong>3. Avançar:</strong> Após selecionar o contato, clique no botão <strong>"Avançar para Etapa 2 ➔"</strong> no final desta página.
            </div>
          </div>

          <div style={{ fontSize: 12.5, color: 'var(--ink2)' }}>
            Escolha uma conversa do WhatsApp conectado ou digite o número da pessoa que está cobrando:
          </div>

          {/* Opção Digitar Número */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="Ex: 61 9320-9444 ou 61993209444 (com DDD)"
                value={manualPhone}
                onChange={(e) => setManualPhone(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid var(--teal)',
                  background: 'rgba(0,0,0,0.4)',
                  color: '#fff',
                  fontSize: 13
                }}
              />
              <button
                type="button"
                onClick={handleSetManualPhone}
                style={{
                  padding: '10px 20px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'var(--teal)',
                  color: '#081018',
                  fontWeight: 900,
                  fontSize: 13,
                  cursor: 'pointer'
                }}
              >
                Definir Número
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink2)' }}>
              💡 <strong>Dica:</strong> Se o número for informado sem o 9 (ex: <strong>61 9320-9444</strong>), o sistema adiciona o <strong>9</strong> automaticamente (<strong>(61) 99320-9444</strong>) e busca todas as variações para evitar erros no WhatsApp e carregar todo o histórico!
            </div>
          </div>

          {/* Conversas e Contatos do WhatsApp */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink1)' }}>
                Conversas & Agenda ({chats.length} {chats.length === 1 ? 'contato' : 'contatos'}):
              </span>
              <button
                type="button"
                onClick={loadChats}
                disabled={loadingChats || !connStatus?.connected}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--teal)',
                  fontSize: 11.5,
                  cursor: 'pointer',
                  fontWeight: 700
                }}
              >
                {loadingChats ? '🔄 Atualizando...' : '🔄 Recarregar'}
              </button>
            </div>

            <input
              type="text"
              placeholder="🔍 Digite o nome ou número com DDD (ex: Estela, 61 99999-8888)..."
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid rgba(0, 229, 155, 0.4)',
                background: 'rgba(0,0,0,0.4)',
                color: '#fff',
                fontSize: 12.5,
                marginBottom: 10,
                outline: 'none'
              }}
            />

            {linkingChat && (
              <div style={{
                padding: '12px 16px',
                borderRadius: 12,
                background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.18), rgba(0, 229, 155, 0.15))',
                border: '1.5px solid #38bdf8',
                marginBottom: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 8
              }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>✏️</span> Vincular Telefone com DDD para: {linkingChat.displayName || 'este contato'}
                </div>
                <div style={{ fontSize: 12, color: '#fff', lineHeight: 1.4 }}>
                  Digite o número do WhatsApp com DDD (ex: <strong>61 9320-9444</strong>) para que o telefone fique visível em definitivo:
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Ex: 61 9320-9444 ou 61993209444"
                    value={linkingPhoneInput}
                    onChange={(e) => setLinkingPhoneInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveLinkedPhone(); }}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--teal)',
                      background: 'rgba(0,0,0,0.6)',
                      color: '#fff',
                      fontSize: 13,
                      outline: 'none'
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleSaveLinkedPhone}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'var(--teal)',
                      color: '#081018',
                      fontWeight: 900,
                      fontSize: 12.5,
                      cursor: 'pointer'
                    }}
                  >
                    ✓ Salvar e Selecionar
                  </button>
                  <button
                    type="button"
                    onClick={() => setLinkingChat(null)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid var(--line)',
                      color: '#fff',
                      fontSize: 12,
                      cursor: 'pointer'
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            <div style={{
              maxHeight: 320,
              overflowY: 'auto',
              borderRadius: 10,
              border: '1px solid var(--line)',
              background: 'rgba(0,0,0,0.2)'
            }}>
              {chats.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--ink2)' }}>
                  {loadingChats ? '⏳ Carregando conversas e contatos...' : (connStatus?.connected ? 'Nenhuma conversa ou contato encontrado.' : 'Conecte o WhatsApp no botão acima para listar todas as conversas.')}
                </div>
              ) : (
                chats
                  .filter(c => {
                    if (!contactSearch || !contactSearch.trim()) return true;
                    const q = contactSearch.toLowerCase().trim();
                    const qDigits = q.replace(/\D/g, '');

                    const name = (c.displayName || c.name || c.pushName || c.subject || '').toLowerCase();
                    const dispPhone = (c.displayPhone || '').toLowerCase();
                    const realPhone = (c.realPhone || '').toLowerCase();
                    const rawJid = (c.id || c.remoteJid || '').toLowerCase();
                    const phoneDigits = (c.realPhone || c.displayPhone || rawJid || '').replace(/\D/g, '');

                    // 1. Match textual direto
                    if (name.includes(q) || dispPhone.includes(q) || realPhone.includes(q) || rawJid.includes(q)) {
                      return true;
                    }

                    // 2. Match por dígitos numéricos (com ou sem DDD)
                    if (qDigits.length >= 2 && phoneDigits.includes(qDigits)) {
                      return true;
                    }

                    // 3. Match multi-palavras (ex: "Estela 61")
                    const tokens = q.split(/\s+/).filter(Boolean);
                    if (tokens.length > 1) {
                      const allTokensMatch = tokens.every(tok => {
                        const tokDigits = tok.replace(/\D/g, '');
                        const matchName = name.includes(tok);
                        const matchPhone = dispPhone.includes(tok) || realPhone.includes(tok);
                        const matchDigits = tokDigits.length >= 2 && phoneDigits.includes(tokDigits);
                        return matchName || matchPhone || matchDigits;
                      });
                      if (allTokensMatch) return true;
                    }

                    return false;
                  })
                  .map(c => {
                    const rawJid = c.id || c.remoteJid || '';
                    const hasRealPhone = Boolean(c.hasRealPhone || (c.realPhone && isRealBrazilianPhone(c.realPhone)));
                    const dispPhone = hasRealPhone ? (c.displayPhone || formatPhoneBR(c.realPhone)) : '';
                    const dispName = c.displayName || c.name || c.pushName || (dispPhone ? `Contato ${dispPhone}` : 'Conversa WhatsApp');
                    const isSel = (rawJid && selectedContact?.jid === rawJid) || 
                      (hasRealPhone && selectedContact?.phone && selectedContact.phone.replace(/\D/g, '') === c.realPhone.replace(/\D/g, '')) ||
                      (selectedContact?.name && dispName.toLowerCase().includes(selectedContact.name.toLowerCase()));
                    return (
                      <div
                        key={rawJid || c.realPhone}
                        onClick={() => handleSelectChat(c)}
                        style={{
                          padding: '10px 14px',
                          borderBottom: '1px solid rgba(255,255,255,0.06)',
                          cursor: 'pointer',
                          background: isSel ? 'rgba(0, 229, 155, 0.18)' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          transition: 'background 0.2s ease'
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ 
                              fontWeight: isSel ? 900 : 700, 
                              color: isSel ? 'var(--teal)' : '#fff',
                              fontSize: 13.5,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>
                              {dispName}
                            </span>
                            {dispPhone ? (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: 11.5,
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: 6,
                                background: isSel ? 'rgba(0, 229, 155, 0.25)' : 'rgba(56, 189, 248, 0.12)',
                                color: isSel ? '#00e59b' : '#38bdf8',
                                border: isSel ? '1px solid var(--teal)' : '1px solid rgba(56, 189, 248, 0.3)',
                                fontFamily: 'monospace'
                              }}>
                                📞 {dispPhone}
                              </span>
                            ) : (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: 11,
                                padding: '2px 6px',
                                borderRadius: 6,
                                background: 'rgba(255, 255, 255, 0.05)',
                                color: 'var(--ink2)'
                              }}>
                                💬 Conversa WhatsApp
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
                            {c.lastActivity ? (
                              <span style={{ fontSize: 11, color: '#38bdf8', fontFamily: 'monospace' }}>
                                🕒 Última mensagem: {new Date(c.lastActivity > 100000000000 ? c.lastActivity : c.lastActivity * 1000).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                              </span>
                            ) : (
                              <span style={{ fontSize: 10.5, color: 'var(--ink2)' }}>
                                🕒 Sem mensagens recentes
                              </span>
                            )}
                            {c.rawJid && (
                              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
                                ID: {c.rawJid.replace('@lid', '').slice(-6)}@lid
                              </span>
                            )}
                          </div>
                          {hasRealPhone && (
                            <span style={{ fontSize: 10.5, color: 'var(--ink2)', fontFamily: 'monospace' }}>
                              Número puro: +{c.realPhone}
                            </span>
                          )}
                          {!hasRealPhone && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                              <span style={{ fontSize: 10.5, color: '#f59e0b', fontFamily: 'monospace' }}>
                                🔒 Contato com ID Privado do WhatsApp
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePromptLinkPhone(c);
                                }}
                                style={{
                                  padding: '3px 10px',
                                  borderRadius: 6,
                                  background: (c.displayName || '').toLowerCase().includes('estela') ? 'rgba(0, 229, 155, 0.2)' : 'rgba(56, 189, 248, 0.2)',
                                  border: (c.displayName || '').toLowerCase().includes('estela') ? '1px solid var(--teal)' : '1px solid rgba(56, 189, 248, 0.5)',
                                  color: (c.displayName || '').toLowerCase().includes('estela') ? 'var(--teal)' : '#38bdf8',
                                  fontSize: 10.5,
                                  fontWeight: 800,
                                  cursor: 'pointer'
                                }}
                              >
                                {(c.displayName || '').toLowerCase().includes('estela') ? '✏️ Vincular a (61) 99320-9444' : '✏️ Informar Telefone (ex: 61 9320-9444)'}
                              </button>
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          {isSel ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedContact(null);
                              }}
                              style={{ 
                                padding: '4px 10px', 
                                borderRadius: 6, 
                                background: 'rgba(239, 68, 68, 0.2)', 
                                border: '1px solid rgba(239, 68, 68, 0.5)',
                                color: '#ff6b6b', 
                                fontSize: 11, 
                                fontWeight: 900,
                                cursor: 'pointer'
                              }}
                              title="Clique para desmarcar este contato"
                            >
                              ✕ Desmarcar
                            </button>
                          ) : (
                            <span style={{ 
                              padding: '4px 10px', 
                              borderRadius: 6, 
                              background: 'rgba(255,255,255,0.06)', 
                              color: 'var(--ink2)', 
                              fontSize: 11,
                              fontWeight: 700
                            }}>
                              Selecionar
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>

          {/* Contato Selecionado */}
          {selectedContact && (
            <div style={{
              padding: '14px 18px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(0, 229, 155, 0.16), rgba(56, 189, 248, 0.10))',
              border: '1.5px solid var(--teal)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              boxShadow: '0 4px 14px rgba(0, 229, 155, 0.12)'
            }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  ✓ CREDOR / CONTATO SELECIONADO:
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#fff' }}>
                    {selectedContact.name}
                  </div>
                  <div style={{ 
                    fontSize: 13, 
                    fontWeight: 800, 
                    color: '#00e59b',
                    background: 'rgba(0, 229, 155, 0.2)',
                    padding: '3px 10px',
                    borderRadius: 8,
                    border: '1px solid rgba(0, 229, 155, 0.4)',
                    fontFamily: 'monospace'
                  }}>
                    📞 {selectedContact.displayPhone || formatPhoneBR(selectedContact.phone) || selectedContact.phone}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink2)', marginTop: 2 }}>
                  Identificador WhatsApp: {selectedContact.jid || selectedContact.phone}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedContact(null);
                    setManualPhone('');
                  }}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: '1px solid rgba(239, 68, 68, 0.5)',
                    background: 'rgba(239, 68, 68, 0.2)',
                    color: '#ff6b6b',
                    fontSize: 12,
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                  title="Clique para desmarcar este contato e escolher outro da lista ou digitar outro número"
                >
                  ✕ Desmarcar / Escolher Outro
                </button>
                <span style={{ fontSize: 24 }}>✅</span>
              </div>
            </div>
          )}

          {!selectedContact && (
            <div style={{
              padding: '12px 16px',
              borderRadius: 12,
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px dashed rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12
            }}>
              <div style={{ fontSize: 13, color: 'var(--ink2)' }}>
                ℹ️ <strong>Nenhum contato selecionado.</strong> Clique em qualquer contato da lista abaixo para selecionar ou digite um número acima.
              </div>
              <button
                type="button"
                onClick={() => setSelectedContact({ ...DEFAULT_AUDIT_CONTACT })}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  background: 'rgba(0, 229, 155, 0.15)',
                  border: '1px solid var(--teal)',
                  color: 'var(--teal)',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                Restaurar Estela 22
              </button>
            </div>
          )}
          {/* Navegação da Etapa 1 */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button
              type="button"
              onClick={() => {
                if (!selectedContact && !uploadedChatFile && !manualPhone) {
                  alert('Por favor, selecione uma conversa do credor ou informe um número de telefone antes de avançar.');
                  return;
                }
                setWizardStep(2);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 24px',
                borderRadius: 10,
                background: 'var(--teal)',
                color: '#081018',
                fontSize: 13,
                fontWeight: 900,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(0, 229, 155, 0.35)'
              }}
            >
              Avançar para Etapa 2: Empréstimos & Taxas ➔
            </button>
          </div>
        </div>
      )}

      {/* ────────────────── ETAPA 2: CONDIÇÕES DE EMPRÉSTIMO & JUROS ────────────────── */}
      {wizardStep === 2 && (
        <div style={{
          background: 'rgba(15, 23, 42, 0.9)',
          border: '1px solid var(--line)',
          borderRadius: 16,
          padding: 22,
          display: 'flex',
          flexDirection: 'column',
          gap: 16
        }}>
          {/* TÍTULO E BOTÕES MANUAL / AUTOMÁTICO */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>⚙️</span> Etapa 2: Condições de Empréstimo & Juros
            </div>

            {/* SELETOR DE MODO: AUTOMÁTICO VS MANUAL */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(0,0,0,0.5)',
              padding: 3,
              borderRadius: 10,
              border: '1px solid var(--line)'
            }}>
              <button
                type="button"
                onClick={() => setStep2Mode('auto')}
                style={{
                  padding: '7px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: step2Mode === 'auto' ? '#38BDF8' : 'transparent',
                  color: step2Mode === 'auto' ? '#081018' : 'var(--ink2)',
                  fontWeight: 900,
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5
                }}
              >
                <span>🤖</span> Automático (IA no Final)
              </button>

              <button
                type="button"
                onClick={() => setStep2Mode('manual')}
                style={{
                  padding: '7px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: step2Mode === 'manual' ? 'var(--teal)' : 'transparent',
                  color: step2Mode === 'manual' ? '#081018' : 'var(--ink2)',
                  fontWeight: 900,
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5
                }}
              >
                <span>📝</span> Manual (Opcional)
              </button>
            </div>
          </div>

          {/* GUIA PASSO A PASSO ETAPA 2 */}
          <div style={{
            padding: '12px 16px',
            borderRadius: 12,
            background: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: '#38BDF8', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>📌</span> Passo a Passo desta Etapa 2:
            </div>
            <div style={{ fontSize: 12, color: '#fff', lineHeight: 1.6 }}>
              <strong>Como você deseja definir os empréstimos tomados?</strong><br />
              • <strong>Recomendado (Automático com IA):</strong> Se você quer que a Inteligência Artificial leia a conversa inteira e descubra tudo sozinha, mantenha selecionado <strong>"🤖 Automático (IA no Final)"</strong> e clique no botão verde <strong>"Avançar para Etapa 3 ➔"</strong>. Nenhuma ação manual é necessária agora!<br />
              • <strong>Opcional (Manual):</strong> Se você já souber de cabeça os valores e datas que pegou emprestado e quiser cadastrar para conferir se os números batem com a IA, selecione a aba <strong>"📝 Manual"</strong>.
            </div>
          </div>

          {/* ────────────────── ABA MANUAL ────────────────── */}
          {step2Mode === 'manual' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--ink2)' }}>
                  Cadastre manualmente os empréstimos tomados com as respectivas taxas de juros:
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddCondition(!showAddCondition)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 12px',
                    borderRadius: 8,
                    background: showAddCondition ? 'rgba(239, 68, 68, 0.15)' : 'var(--teal)',
                    color: showAddCondition ? '#EF4444' : '#081018',
                    border: showAddCondition ? '1px solid rgba(239, 68, 68, 0.4)' : 'none',
                    fontWeight: 900,
                    fontSize: 11.5,
                    cursor: 'pointer'
                  }}
                >
                  {showAddCondition ? '✕ Fechar' : '➕ Novo Débito'}
                </button>
              </div>

              {/* FORMULÁRIO MANUAL */}
              {showAddCondition && (
                <div style={{
                  padding: 14,
                  borderRadius: 12,
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid rgba(0, 229, 155, 0.4)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10
                }}>
                  <div style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(0, 229, 155, 0.12)',
                    border: '1px solid var(--teal)',
                    color: 'var(--teal)',
                    fontSize: 12,
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}>
                    <span>💵</span> Empréstimo em Dinheiro (PIX / TED / Transferência / Espécie)
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink1)', display: 'block', marginBottom: 3 }}>
                        Valor (R$):
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Ex: 1500.00"
                        value={conditionForm.amount}
                        onChange={(e) => setConditionForm({ ...conditionForm, amount: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: 8,
                          border: '1px solid var(--line)',
                          background: 'rgba(0,0,0,0.4)',
                          color: '#fff',
                          fontSize: 12
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink1)', display: 'block', marginBottom: 3 }}>
                        Data da Operação:
                      </label>
                      <input
                        type="date"
                        value={conditionForm.date}
                        onChange={(e) => setConditionForm({ ...conditionForm, date: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: 8,
                          border: '1px solid var(--line)',
                          background: 'rgba(0,0,0,0.4)',
                          color: '#fff',
                          fontSize: 12
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink1)', display: 'block', marginBottom: 3 }}>
                        Juros ao Mês (%):
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={conditionForm.monthlyRate}
                        onChange={(e) => setConditionForm({ ...conditionForm, monthlyRate: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: 8,
                          border: '1px solid var(--line)',
                          background: 'rgba(0,0,0,0.4)',
                          color: '#fff',
                          fontSize: 12
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink1)', display: 'block', marginBottom: 3 }}>
                        Descrição:
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Empréstimo 1 ou Refinanciamento"
                        value={conditionForm.description}
                        onChange={(e) => setConditionForm({ ...conditionForm, description: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: 8,
                          border: '1px solid var(--line)',
                          background: 'rgba(0,0,0,0.4)',
                          color: '#fff',
                          fontSize: 12
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setShowAddCondition(false)}
                      style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--line)', color: '#fff', fontSize: 11.5, cursor: 'pointer' }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleAddCondition}
                      style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--teal)', border: 'none', color: '#081018', fontWeight: 900, fontSize: 11.5, cursor: 'pointer' }}
                    >
                      ✓ Salvar Registro
                    </button>
                  </div>
                </div>
              )}

              {/* TOTAIS MANUAIS */}
              {debtConditions.length > 0 && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: 8,
                  padding: 10,
                  borderRadius: 10,
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.06)'
                }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--ink2)', fontWeight: 700 }}>💵 TOTAL EMPRESTADO:</div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--teal)' }}>
                      R$ {debtConditions.reduce((sum, c) => sum + c.amount, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 10, color: 'var(--ink2)', fontWeight: 700 }}>📋 QUANTIDADE:</div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: '#fff' }}>
                      {debtConditions.length} {debtConditions.length === 1 ? 'registro' : 'registros'}
                    </div>
                  </div>
                </div>
              )}

              {/* LISTA MANUAL DE ITENS */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
                {debtConditions.length === 0 ? (
                  <div style={{ padding: 14, textAlign: 'center', borderRadius: 10, background: 'rgba(0,0,0,0.2)', border: '1px dashed var(--line)' }}>
                    <div style={{ fontSize: 12, color: 'var(--ink2)' }}>Nenhum empréstimo cadastrado no modo manual.</div>
                    <button
                      type="button"
                      onClick={() => setShowAddCondition(true)}
                      style={{ marginTop: 6, padding: '5px 12px', borderRadius: 8, background: 'var(--teal)', color: '#081018', border: 'none', fontWeight: 900, fontSize: 11, cursor: 'pointer' }}
                    >
                      ➕ Adicionar Primeiro Registro
                    </button>
                  </div>
                ) : (
                  debtConditions.map((cond, idx) => {
                    return (
                      <div
                        key={cond.id || idx}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 10,
                          background: 'rgba(0, 229, 155, 0.08)',
                          border: '1px solid rgba(0, 229, 155, 0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 16 }}>💵</span>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 9.5, fontWeight: 900, padding: '2px 5px', borderRadius: 4, background: 'var(--teal)', color: '#081018' }}>
                                EMPRÉSTIMO
                              </span>
                              <span style={{ fontSize: 12.5, fontWeight: 900, color: '#fff' }}>
                                R$ {cond.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div style={{ fontSize: 10.5, color: 'var(--ink2)', marginTop: 2 }}>
                              📅 {cond.date} | ⚡ <strong>{cond.monthlyRate}% ao mês</strong> | {cond.description}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveCondition(cond.id)}
                          style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 13 }}
                        >
                          🗑️
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ────────────────── ABA AUTOMÁTICA (IA NO FINAL) ────────────────── */}
          {step2Mode === 'auto' && (
            <div style={{
              padding: 24,
              borderRadius: 14,
              background: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12
            }}>
              <span style={{ fontSize: 40 }}>🤖✨</span>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>
                Modo 100% Automático com IA Ativado!
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink2)', maxWidth: 540, lineHeight: 1.6 }}>
                Você <strong>não precisa escanear nada nesta etapa</strong>! A Inteligência Artificial fará a varredura minuciosa de todas as mensagens, áudios, imagens, empréstimos e taxas cobradas na <strong>Etapa 4 (Execução Final)</strong>.
              </div>
              <button
                type="button"
                onClick={() => setWizardStep(3)}
                style={{
                  marginTop: 6,
                  padding: '12px 28px',
                  borderRadius: 10,
                  background: 'var(--teal)',
                  color: '#081018',
                  fontSize: 13,
                  fontWeight: 900,
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(0, 229, 155, 0.35)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                Avançar para Etapa 3: Comprovantes de Pagamento ➔
              </button>
            </div>
          )}

          <div style={{
            padding: 8,
            borderRadius: 8,
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.06)',
            fontSize: 11,
            color: 'var(--ink2)',
            lineHeight: 1.4
          }}>
            ⚖️ <strong>Regra de Amortização (Código Civil art. 354):</strong> Pagamentos abatem primeiro os juros acumulados até a data e todo o restante <strong>abate imediatamente o saldo principal</strong>.
          </div>

          {/* Navegação da Etapa 2 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, flexWrap: 'wrap', gap: 10 }}>
            <button
              type="button"
              onClick={() => setWizardStep(1)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 18px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--line)',
                color: '#fff',
                fontSize: 12.5,
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              ⬅ Voltar para Etapa 1
            </button>
            <button
              type="button"
              onClick={() => setWizardStep(3)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 24px',
                borderRadius: 10,
                background: 'var(--teal)',
                color: '#081018',
                fontSize: 13,
                fontWeight: 900,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(0, 229, 155, 0.35)'
              }}
            >
              Avançar para Etapa 3: Comprovantes ➔
            </button>
          </div>
        </div>
      )}

      {/* ────────────────── ETAPA 3: COMPROVANTES & BACKUP DA CONVERSA ────────────────── */}
      {wizardStep === 3 && (
        <div style={{
          background: 'rgba(15, 23, 42, 0.9)',
          border: '1px solid var(--line)',
          borderRadius: 16,
          padding: 22,
          display: 'flex',
          flexDirection: 'column',
          gap: 16
        }}>
          {/* GUIA PASSO A PASSO ETAPA 3 */}
          <div style={{
            padding: '12px 16px',
            borderRadius: 12,
            background: 'rgba(0, 229, 155, 0.08)',
            border: '1px solid rgba(0, 229, 155, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>📌</span> Passo a Passo desta Etapa 3:
            </div>
            <div style={{ fontSize: 12, color: '#fff', lineHeight: 1.6 }}>
              Informe os pagamentos que você já realizou para abater da dívida:<br />
              • <strong>Opção 1 (Digitar Valor Total Já Pago):</strong> Se você já sabe o valor total que pagou (ex: R$ 15.000,00), digite no campo <em>"Valores Pagos Consolidados"</em> abaixo e clique em <em>"Salvar Total Pago"</em>.<br />
              • <strong>Opção 2 (Anexar Prints / Comprovantes de PIX):</strong> Clique no botão verde <em>"Selecionar Comprovantes"</em> para enviar as fotos ou PDFs dos recibos.<br />
              • <strong>Opção 3 (Conversa já tem tudo):</strong> Se os comprovantes e negociações de pagamentos já constam na própria conversa do WhatsApp, você não precisa anexar nada! Basta clicar direto em <strong>"Avançar para Etapa 4 (Executar Perícia com IA) ➔"</strong>.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🧾</span> Etapa 3: Anexar Comprovantes de Pagamento (PIX, TED, Recibos)
              </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginTop: 4 }}>
              Envie fotos ou prints de todos os comprovantes que você pagou para que a IA faça o cruzamento com a conversa.
            </div>
          </div>

          <label style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            borderRadius: 10,
            background: 'var(--teal)',
            color: '#081018',
            fontWeight: 900,
            fontSize: 13,
            cursor: 'pointer'
          }}>
            <span>📂</span> Selecionar Comprovantes (Imagens/Prints)
            <input
              type="file"
              multiple
              accept="image/*,application/pdf"
              style={{ display: 'none' }}
              onChange={handleReceiptsUpload}
              disabled={uploadingReceipts}
            />
          </label>
        </div>

        {/* DIGITAÇÃO RÁPIDA: VALOR TOTAL PAGO CONSOLIDADO (SOMA DE TODOS OS COMPROVANTES) */}
        <div style={{
          background: 'rgba(0, 229, 155, 0.05)',
          border: '1px solid rgba(0, 229, 155, 0.3)',
          borderRadius: 14,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>💵</span>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 900, color: 'var(--teal)' }}>
                  Digitar Valor Total Já Pago (Soma dos Comprovantes)
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink2)', marginTop: 2 }}>
                  Você pode somar todos os comprovantes que já pagou e salvar o total aqui. A perícia e a planilha farão o cálculo de amortização e restituição diretamente em cima desse valor!
                </div>
              </div>
            </div>

            {manualTotalPaidSaved !== null && (
              <span style={{
                padding: '4px 12px',
                borderRadius: 20,
                background: 'rgba(0, 229, 155, 0.2)',
                color: 'var(--teal)',
                fontSize: 12,
                fontWeight: 900,
                border: '1px solid var(--teal)'
              }}>
                ✓ VALOR TOTAL SALVO: R$ {manualTotalPaidSaved.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink1)', display: 'block', marginBottom: 4 }}>
                Valores Pagos Consolidados (R$):
              </label>
              <input
                type="text"
                placeholder="Ex: 15000,00"
                value={manualTotalPaidInput}
                onChange={(e) => setManualTotalPaidInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 8,
                  background: 'rgba(0,0,0,0.5)',
                  border: '1px solid var(--line)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700
                }}
              />
            </div>

            <div style={{ width: 170 }}>
              <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink1)', display: 'block', marginBottom: 4 }}>
                Data de Referência:
              </label>
              <input
                type="date"
                value={manualPaidDate}
                onChange={(e) => setManualPaidDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 8,
                  background: 'rgba(0,0,0,0.5)',
                  border: '1px solid var(--line)',
                  color: '#fff',
                  fontSize: 12
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleSaveManualTotalPaid}
                style={{
                  padding: '9px 18px',
                  borderRadius: 8,
                  background: 'var(--teal)',
                  border: 'none',
                  color: '#081018',
                  fontWeight: 900,
                  fontSize: 12.5,
                  cursor: 'pointer'
                }}
              >
                💾 Salvar Valor Pago
              </button>

              {manualTotalPaidSaved !== null && (
                <button
                  type="button"
                  onClick={handleClearManualTotalPaid}
                  style={{
                    padding: '9px 14px',
                    borderRadius: 8,
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid #EF4444',
                    color: '#EF4444',
                    fontWeight: 800,
                    fontSize: 12,
                    cursor: 'pointer'
                  }}
                >
                  Limpar
                </button>
              )}
            </div>
          </div>
        </div>

        {/* LISTA DE COMPROVANTES ANEXADOS */}
        {uploadedReceipts.length > 0 && (
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink1)', marginBottom: 8 }}>
              Comprovantes Prontos para Perícia ({uploadedReceipts.length}):
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 10,
              maxHeight: 220,
              overflowY: 'auto',
              padding: 4
            }}>
              {uploadedReceipts.map((r, i) => (
                <div
                  key={r.id}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid rgba(0, 229, 155, 0.3)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--teal)' }}>
                      R$ {r.amount.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setUploadedReceipts(prev => prev.filter(x => x.id !== r.id))}
                      style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 13 }}
                      title="Remover comprovante"
                    >
                      ✕
                    </button>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#fff' }}>📅 {r.date} ({r.type})</div>
                  <div style={{ fontSize: 11, color: 'var(--ink2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    👤 {r.beneficiary || r.name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* OPÇÃO ADICIONAL: CONVERSA EXPORTADA (.TXT DO WHATSAPP) */}
        <div style={{
          padding: 12,
          borderRadius: 10,
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px dashed rgba(255, 255, 255, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10
        }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#fff' }}>
              📁 Opcional: Anexar backup de conversa exportada do WhatsApp (.txt)
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink2)' }}>
              Útil se você tiver exportado a conversa direto pelo WhatsApp no celular com anos de mensagens.
            </div>
          </div>
          <label style={{
            fontSize: 12,
            fontWeight: 800,
            padding: '7px 14px',
            borderRadius: 8,
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid var(--line)',
            color: '#fff',
            cursor: 'pointer'
          }}>
            {uploadedChatFile ? `✓ ${uploadedChatFile.name}` : 'Selecionar arquivo .txt'}
            <input type="file" accept=".txt" style={{ display: 'none' }} onChange={handleChatFileUpload} />
          </label>
        </div>

        {/* ESCOLHA DO PERÍODO DAS MENSAGENS PARA A PERÍCIA */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.45)',
          border: '1px solid rgba(0, 229, 155, 0.35)',
          borderRadius: 14,
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 24 }}>📅</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--teal)' }}>
                  Período das Mensagens para Perícia Financeira
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2 }}>
                  Escolha se deseja auditar toda a conversa histórica ou delimitar datas específicas.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setAuditPeriodMode('full')}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: auditPeriodMode === 'full' ? '1px solid var(--teal)' : '1px solid var(--line)',
                  background: auditPeriodMode === 'full' ? 'rgba(0, 229, 155, 0.2)' : 'rgba(255,255,255,0.05)',
                  color: auditPeriodMode === 'full' ? 'var(--teal)' : 'var(--ink1)',
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: 'pointer'
                }}
              >
                🌐 Histórico Completo (1ª à Última Mensagem)
              </button>
              <button
                type="button"
                onClick={() => setAuditPeriodMode('custom')}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: auditPeriodMode === 'custom' ? '1px solid var(--teal)' : '1px solid var(--line)',
                  background: auditPeriodMode === 'custom' ? 'rgba(0, 229, 155, 0.2)' : 'rgba(255,255,255,0.05)',
                  color: auditPeriodMode === 'custom' ? 'var(--teal)' : 'var(--ink1)',
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: 'pointer'
                }}
              >
                📆 Período Específico por Data
              </button>
            </div>
          </div>

          {auditPeriodMode === 'full' ? (
            <div style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(0, 229, 155, 0.08)',
              border: '1px solid rgba(0, 229, 155, 0.2)',
              fontSize: 12,
              color: '#A7F3D0',
              lineHeight: 1.5
            }}>
              ✓ <strong>Modo Minucioso Irrestrito Ativo:</strong> A IA analisará todas as mensagens da primeira até a última trocada com este contato no WhatsApp, transcrevendo todos os áudios e periciando todos os prints/comprovantes sem pular nada.
            </div>
          ) : (
            <div style={{
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              flexWrap: 'wrap',
              padding: '12px 14px',
              borderRadius: 8,
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid var(--line)'
            }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                  Data Inicial:
                </label>
                <input
                  type="date"
                  value={auditDateStart}
                  onChange={(e) => setAuditDateStart(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(0,0,0,0.5)',
                    border: '1px solid var(--line)',
                    color: '#fff',
                    fontSize: 12
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>
                  Data Final:
                </label>
                <input
                  type="date"
                  value={auditDateEnd}
                  onChange={(e) => setAuditDateEnd(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(0,0,0,0.5)',
                    border: '1px solid var(--line)',
                    color: '#fff',
                    fontSize: 12
                  }}
                />
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink2)', maxWidth: 300, alignSelf: 'flex-end', paddingBottom: 6 }}>
                Mensagens fora desse intervalo de datas serão desconsideradas da reconstituição pericial.
              </div>
            </div>
          )}
        </div>

        {/* BANNER DE SEGURANÇA E PROTOCOLO READ-ONLY */}
        <div style={{
          padding: '14px 18px',
          borderRadius: 14,
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          display: 'flex',
          alignItems: 'center',
          gap: 14
        }}>
          <span style={{ fontSize: 26 }}>🛡️</span>
          <div style={{ fontSize: 12, color: '#E2E8F0', lineHeight: 1.5 }}>
            <strong style={{ color: '#10B981', display: 'block', fontSize: 13, marginBottom: 2 }}>
              TRAVA DE SEGURANÇA FORENSE ATIVA: 100% SOMENTE LEITURA (READ-ONLY)
            </strong>
            O sistema opera sob rigorosa proteção de integridade: <strong>é terminantemente proibido enviar qualquer mensagem</strong> para o contato selecionado (zero risco de alertar ou perturbar o credor) e <strong>é impossível apagar ou modificar qualquer dado</strong> do WhatsApp. A perícia apenas lê passivamente os diálogos, transcreve áudios e analisa imagens com precisão.
          </div>
        </div>

        {/* Navegação da Etapa 3 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, flexWrap: 'wrap', gap: 10 }}>
          <button
            type="button"
            onClick={() => setWizardStep(2)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 18px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--line)',
              color: '#fff',
              fontSize: 12.5,
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            ⬅ Voltar para Etapa 2
          </button>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setWizardStep(4)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 24px',
                borderRadius: 10,
                background: 'var(--teal)',
                color: '#081018',
                fontSize: 13.5,
                fontWeight: 900,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(0, 229, 155, 0.35)'
              }}
            >
              Avançar para Etapa 4: Análise & Laudo ➔
            </button>
          </div>
        </div>
      </div>
    )}

      {/* ────────────────── ETAPA 4: EXECUTAR PERÍCIA & RESULTADOS DO LAUDO ────────────────── */}
      {wizardStep === 4 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* GUIA PASSO A PASSO ETAPA 4 */}
          <div style={{
            padding: '14px 18px',
            borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(0, 229, 155, 0.15), rgba(56, 189, 248, 0.1))',
            border: '1px solid var(--teal)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🎯</span> Etapa 4 (Final): Executar Perícia Financeira Completa com IA
            </div>
            <div style={{ fontSize: 12.5, color: '#fff', lineHeight: 1.6 }}>
              Esta é a etapa final onde a Inteligência Artificial fará a leitura e os cálculos matemáticos completos:<br />
              1. <strong>Confira o resumo</strong> das configurações nos cartões abaixo (Credor Selecionado, Modo Automático e Pagamentos).<br />
              2. <strong>Escolha o período</strong> (por padrão, da primeira até a última mensagem da conversa com tempo ilimitado de leitura).<br />
              3. Clique no botão verde <strong>"⚡ EXECUTAR PERÍCIA FINANCEIRA COMPLETA (IA)"</strong>.<br />
              4. Acompanhe na tela o contador de mensagens, textos, áudios e imagens lidos. Ao finalizar, baixe seu <strong>Laudo Pericial Oficial em Word (.docx), PDF e Excel (.xlsx)</strong>!
            </div>
          </div>

          {/* RESUMO DAS ETAPAS ANTERIORES E AÇÕES DE RETORNO */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid var(--line)',
            borderRadius: 16,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🚀</span> Etapa 4: Executar Perícia Forense & Gerar Laudo
              </div>
              <button
                type="button"
                onClick={() => setWizardStep(1)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid var(--line)',
                  color: 'var(--teal)',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                ⚙️ Ajustar Configurações
              </button>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 10,
              padding: 12,
              borderRadius: 10,
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.05)'
            }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--ink2)', fontWeight: 700 }}>👤 CREDOR / ALVO:</div>
                <div style={{ fontSize: 13.5, fontWeight: 900, color: '#fff', marginTop: 2 }}>
                  {selectedContact?.name || 'Credor'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 800, fontFamily: 'monospace', marginTop: 2 }}>
                  📞 {selectedContact?.displayPhone || (selectedContact?.phone ? formatPhoneBR(selectedContact.phone) : '') || manualPhone || (uploadedChatFile ? uploadedChatFile.name : 'Não selecionado')}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: 'var(--ink2)', fontWeight: 700 }}>⚙️ MODO DE EMPRÉSTIMO:</div>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#38BDF8', marginTop: 2 }}>
                  {step2Mode === 'auto' ? '🤖 Automático (Robô & IA)' : '📝 Manual'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink2)' }}>
                  {step2Mode === 'auto'
                    ? `${autoDetectedDebts.length} débito(s) pré-escaneado(s)`
                    : `${debtConditions.length} empréstimo(s) cadastrado(s)`}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: 'var(--ink2)', fontWeight: 700 }}>🧾 COMPROVANTES:</div>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#10B981', marginTop: 2 }}>
                  {manualTotalPaidSaved > 0
                    ? `R$ ${manualTotalPaidSaved.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                    : `${uploadedReceipts.length} anexo(s) + WhatsApp`}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink2)' }}>
                  {manualTotalPaidSaved > 0 ? 'Total pago fixado manualmente' : 'Leitura de OCR e histórico'}
                </div>
              </div>
            </div>
          </div>

          {/* BOTÃO PRINCIPAL DE AÇÃO: EXECUTAR PERÍCIA */}
          <div style={{ textAlign: 'center' }}>
        <button
          type="button"
          onClick={runFullDebtForensicAudit}
          disabled={isAuditing || (!selectedContact && !uploadedChatFile)}
          style={{
            padding: '18px 36px',
            borderRadius: 14,
            border: 'none',
            background: isAuditing ? 'rgba(255,255,255,0.2)' : 'linear-gradient(135deg, #00E59B, #00B377)',
            color: '#081018',
            fontSize: 16,
            fontWeight: 900,
            cursor: isAuditing ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 25px rgba(0, 229, 155, 0.4)',
            transition: 'all 0.25s ease'
          }}
        >
          {isAuditing ? '⏳ Executando Perícia Minuciosa...' : `🚀 Iniciar Perícia Completa (Modo: ${step2Mode === 'auto' ? 'Automático por IA' : 'Manual'})`}
        </button>
      </div>

      {/* PAINEL DE PROGRESSO E LOGS AO VIVO */}
      {(isAuditing || auditLogs.length > 0) && (
        <div style={{
          background: 'rgba(10, 14, 23, 0.98)',
          border: '1px solid var(--line)',
          borderRadius: 16,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--teal)' }}>
              ⚡ Progresso da Perícia Forense
            </div>
            {isAuditing && (
              <button
                type="button"
                onClick={() => { abortAuditRef.current = true; }}
                style={{
                  fontSize: 11,
                  padding: '4px 10px',
                  borderRadius: 6,
                  background: '#EF4444',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 800
                }}
              >
                Parar Perícia
              </button>
            )}
          </div>

          {/* Barra de Progresso */}
          <div>
            <div style={{
              width: '100%',
              height: 8,
              borderRadius: 4,
              background: 'rgba(255,255,255,0.1)',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${auditProgress.current}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #00E59B, #38BDF8)',
                transition: 'width 0.3s ease'
              }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 6, fontWeight: 700 }}>
              {auditProgress.stepLabel || `${auditProgress.current}%`}
            </div>
          </div>

          {/* Terminal de Logs */}
          <div
            ref={logEndRef}
            style={{
              height: 160,
              overflowY: 'auto',
              background: 'rgba(0,0,0,0.6)',
              borderRadius: 10,
              padding: 12,
              fontFamily: 'monospace',
              fontSize: 11.5,
              lineHeight: 1.5,
              border: '1px solid rgba(255,255,255,0.05)'
            }}
          >
            {auditLogs.map((l, idx) => (
              <div
                key={idx}
                style={{
                  color: l.type === 'success' ? '#00E59B' : l.type === 'error' ? '#EF4444' : '#E2E8F0'
                }}
              >
                <span style={{ color: 'var(--ink2)', marginRight: 6 }}>[{l.time}]</span>
                {l.msg}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── RESULTADOS COMPLETOS DA PERÍCIA ───────────────────────────── */}
      {auditResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* BADGE DE MODO UTILIZADO E COMPARATIVO */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 18px',
            borderRadius: 12,
            background: auditResult.executionMode === 'auto' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(0, 229, 155, 0.15)',
            border: `1px solid ${auditResult.executionMode === 'auto' ? '#38BDF8' : 'var(--teal)'}`,
            flexWrap: 'wrap',
            gap: 10
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>{auditResult.executionMode === 'auto' ? '🤖' : '📝'}</span>
              <span style={{ fontSize: 13, fontWeight: 900, color: '#fff' }}>
                Perícia Executada no <strong>Modo {auditResult.executionMode === 'auto' ? 'Automático (Identificado por IA)' : 'Manual'}</strong>
              </span>
            </div>

            {/* Comparativo se houver valores nos dois modos */}
            {auditResult.manualTotal > 0 && auditResult.autoTotal > 0 && (
              <div style={{ fontSize: 12, color: 'var(--ink2)' }}>
                Comparativo: <strong>Manual (R$ {auditResult.manualTotal.toFixed(2)})</strong> vs <strong>Automático (R$ {auditResult.autoTotal.toFixed(2)})</strong>
                {Math.abs(auditResult.manualTotal - auditResult.autoTotal) < 1 ? (
                  <span style={{ color: 'var(--teal)', fontWeight: 800, marginLeft: 6 }}>✓ Valores Batem 100%!</span>
                ) : (
                  <span style={{ color: '#F59E0B', fontWeight: 800, marginLeft: 6 }}>
                    Diferença: R$ {Math.abs(auditResult.manualTotal - auditResult.autoTotal).toFixed(2)}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* 📊 PAINEL DE ESTATÍSTICAS FORENSES: MENSAGENS, ÁUDIOS, TEXTOS E IMAGENS */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          <div style={{
            padding: '16px 20px',
            borderRadius: 14,
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: '#38BDF8', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>📊</span>
                MÉTRICAS DA PERÍCIA FORENSE (DADOS EXTRAÍDOS DO WHATSAPP)
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink2)', fontWeight: 700 }}>
                📅 Período Auditado: <strong style={{ color: '#fff' }}>{auditResult.metrics?.periodoInicio || '-'}</strong> até <strong style={{ color: '#fff' }}>{auditResult.metrics?.periodoFim || '-'}</strong>
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 10
            }}>
              {/* Total Geral de Mensagens */}
              <div style={{
                padding: '12px 14px',
                borderRadius: 10,
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.06)'
              }}>
                <div style={{ fontSize: 11, color: 'var(--ink2)', fontWeight: 800 }}>💬 TOTAL MENSAGENS:</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginTop: 2 }}>
                  {auditResult.metrics?.totalMensagens || auditResult.fullDialog?.length || 0}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--teal)', marginTop: 2 }}>
                  100% da 1ª à última
                </div>
              </div>

              {/* Mensagens de Texto */}
              <div style={{
                padding: '12px 14px',
                borderRadius: 10,
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.06)'
              }}>
                <div style={{ fontSize: 11, color: 'var(--ink2)', fontWeight: 800 }}>📝 TEXTOS LIDOS:</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#38BDF8', marginTop: 2 }}>
                  {auditResult.metrics?.totalTextos || auditResult.textRecords?.length || 0}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--ink2)', marginTop: 2 }}>
                  Diálogos examinados
                </div>
              </div>

              {/* Áudios Escutados & Transcritos */}
              <div style={{
                padding: '12px 14px',
                borderRadius: 10,
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(245, 158, 11, 0.3)'
              }}>
                <div style={{ fontSize: 11, color: '#F59E0B', fontWeight: 800 }}>🎙️ ÁUDIOS OUVIDOS:</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#F59E0B', marginTop: 2 }}>
                  {auditResult.metrics?.totalAudios || auditResult.audioTranscripts?.length || 0}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--ink2)', marginTop: 2 }}>
                  Transcritos com IA
                </div>
              </div>

              {/* Imagens & Prints Periciados */}
              <div style={{
                padding: '12px 14px',
                borderRadius: 10,
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(0, 229, 155, 0.3)'
              }}>
                <div style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 800 }}>🖼️ PRINTS / IMAGENS:</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--teal)', marginTop: 2 }}>
                  {auditResult.metrics?.totalImagens || 0}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--ink2)', marginTop: 2 }}>
                  Periciados via OCR
                </div>
              </div>

              {/* Comprovantes Válidos */}
              <div style={{
                padding: '12px 14px',
                borderRadius: 10,
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(16, 185, 129, 0.3)'
              }}>
                <div style={{ fontSize: 11, color: '#10B981', fontWeight: 800 }}>🧾 PAGAMENTOS IDENTIFICADOS:</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#10B981', marginTop: 2 }}>
                  {auditResult.receipts?.length || 0}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--ink2)', marginTop: 2 }}>
                  Cruzados no cálculo
                </div>
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* 🎯 MEGA PAINEL DE VEREDITO OFICIAL DA PERÍCIA (QUEM DEVE A QUEM)  */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          <div style={{
            padding: '24px 28px',
            borderRadius: 16,
            background: auditResult.status === 'QUITADO_PAGO_A_MAIS'
              ? 'linear-gradient(135deg, rgba(0, 229, 155, 0.22), rgba(15, 23, 42, 0.98))'
              : 'linear-gradient(135deg, rgba(245, 158, 11, 0.22), rgba(15, 23, 42, 0.98))',
            border: `2px solid ${auditResult.status === 'QUITADO_PAGO_A_MAIS' ? 'var(--teal)' : '#F59E0B'}`,
            boxShadow: `0 8px 32px ${auditResult.status === 'QUITADO_PAGO_A_MAIS' ? 'rgba(0, 229, 155, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div style={{
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: '1px',
                textTransform: 'uppercase',
                color: auditResult.status === 'QUITADO_PAGO_A_MAIS' ? 'var(--teal)' : '#F59E0B',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <span>{auditResult.status === 'QUITADO_PAGO_A_MAIS' ? '🎉' : '⚖️'}</span>
                VEREDITO OFICIAL DA PERÍCIA (QUEM DEVE A QUEM)
              </div>
              <div style={{
                fontSize: 11,
                fontWeight: 800,
                padding: '4px 12px',
                borderRadius: 20,
                background: auditResult.status === 'QUITADO_PAGO_A_MAIS' ? 'rgba(0, 229, 155, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                color: auditResult.status === 'QUITADO_PAGO_A_MAIS' ? '#00E59B' : '#F59E0B',
                border: `1px solid ${auditResult.status === 'QUITADO_PAGO_A_MAIS' ? 'var(--teal)' : '#F59E0B'}`
              }}>
                Código Civil Art. 354 • Pro-Rata Die
              </div>
            </div>

            {auditResult.status === 'QUITADO_PAGO_A_MAIS' ? (
              <div>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#fff', lineHeight: 1.35 }}>
                  O número <span style={{ color: 'var(--teal)' }}>{auditResult.targetContactDisplay}</span> DEVE RESTITUIR <span style={{ color: 'var(--teal)', textDecoration: 'underline' }}>R$ {auditResult.totalPagoAMais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span> A VOCÊ!
                </div>
                <div style={{ fontSize: 13.5, color: '#E2E8F0', marginTop: 8, lineHeight: 1.6 }}>
                  Sua dívida está <strong>TOTALMENTE QUITADA</strong>. Você pagou um total de <strong>R$ {auditResult.totalPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>, enquanto a dívida legal recalculada em dias corridos somava <strong>R$ {(auditResult.totalEmprestado + auditResult.totalJurosDevidos).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>. O valor pago a mais de <strong>R$ {auditResult.totalPagoAMais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> é indébito e deve ser devolvido imediatamente pelo credor.
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#fff', lineHeight: 1.35 }}>
                  Você deve <span style={{ color: '#F59E0B' }}>R$ {auditResult.saldoFinalReal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span> ao número <span style={{ color: '#F59E0B' }}>{auditResult.targetContactDisplay}</span>.
                </div>
                <div style={{ fontSize: 13.5, color: '#E2E8F0', marginTop: 8, lineHeight: 1.6 }}>
                  Do total contratado de <strong>R$ {auditResult.totalEmprestado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>, você já pagou <strong>R$ {auditResult.totalPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> (quitando <strong>R$ {auditResult.totalJurosCobrados.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> de juros e amortizando <strong>R$ {auditResult.totalAmortizado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> do principal). Restam <strong>R$ {auditResult.saldoFinalReal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> do capital principal a pagar.
                </div>
              </div>
            )}
          </div>

          {/* CARDS DE VEREDITO / KPIS */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: 12
          }}>
            {/* Card 1: Total Emprestado */}
            <div style={{
              padding: 18,
              borderRadius: 14,
              background: 'rgba(15, 23, 42, 0.9)',
              border: '1px solid var(--line)'
            }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--ink2)' }}>TOTAL DO PRINCIPAL CONTRATADO:</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', marginTop: 4 }}>
                R$ {auditResult.totalEmprestado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 11, color: 'var(--teal)', marginTop: 4 }}>
                💵 {auditResult.contractedDebts?.length || 0} operação(ões) de empréstimo contratada(s)
              </div>
            </div>

            {/* Card 2: Total Pago */}
            <div style={{
              padding: 18,
              borderRadius: 14,
              background: 'rgba(15, 23, 42, 0.9)',
              border: '1px solid rgba(0, 229, 155, 0.4)'
            }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--teal)' }}>TOTAL PAGO (COMPROVADO):</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--teal)', marginTop: 4 }}>
                R$ {auditResult.totalPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink2)', marginTop: 4 }}>
                {auditResult.receipts.length} pagamentos identificados
              </div>
            </div>

            {/* Card 3: Principal Amortizado */}
            <div style={{
              padding: 18,
              borderRadius: 14,
              background: 'rgba(15, 23, 42, 0.9)',
              border: '1px solid var(--line)'
            }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: '#38BDF8' }}>AMORTIZAÇÃO DO CAPITAL:</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#38BDF8', marginTop: 4 }}>
                R$ {auditResult.totalAmortizado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink2)', marginTop: 4 }}>
                Abatimento real da dívida
              </div>
            </div>

            {/* Card 4: Saldo Final / Veredito */}
            <div style={{
              padding: 18,
              borderRadius: 14,
              background: auditResult.status === 'QUITADO_PAGO_A_MAIS'
                ? 'linear-gradient(135deg, rgba(0, 229, 155, 0.2), rgba(15, 23, 42, 0.9))'
                : 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(15, 23, 42, 0.9))',
              border: `1px solid ${auditResult.status === 'QUITADO_PAGO_A_MAIS' ? 'var(--teal)' : '#F59E0B'}`
            }}>
              <div style={{
                fontSize: 11.5,
                fontWeight: 900,
                color: auditResult.status === 'QUITADO_PAGO_A_MAIS' ? 'var(--teal)' : '#F59E0B'
              }}>
                {auditResult.status === 'QUITADO_PAGO_A_MAIS' ? '🎉 SITUAÇÃO: QUITADO (PAGOU A MAIS!)' : '⚖️ SALDO RESTANTE REAL:'}
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', marginTop: 4 }}>
                {auditResult.status === 'QUITADO_PAGO_A_MAIS'
                  ? `+ R$ ${auditResult.totalPagoAMais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  : `R$ ${auditResult.saldoFinalReal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
              </div>
              <div style={{ fontSize: 11, color: '#fff', marginTop: 4 }}>
                {auditResult.status === 'QUITADO_PAGO_A_MAIS' ? 'A restituir pelo credor' : 'Valor justo recalculado'}
              </div>
            </div>

            {/* Card 5: Data da 1ª Mensagem */}
            <div style={{
              padding: 18,
              borderRadius: 14,
              background: 'rgba(15, 23, 42, 0.9)',
              border: '1px solid var(--line)'
            }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: '#38BDF8' }}>DATA DA 1ª MENSAGEM:</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', marginTop: 4 }}>
                {auditResult.firstMessage?.date || 'Identificada'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--teal)', marginTop: 4 }}>
                {auditResult.firstMessage?.sender ? `Remetente: ${auditResult.firstMessage.sender}` : 'Início do diálogo completo'}
              </div>
            </div>

            {/* Card 6: Palavras-Chave Encontradas */}
            <div style={{
              padding: 18,
              borderRadius: 14,
              background: 'rgba(15, 23, 42, 0.9)',
              border: '1px solid rgba(245, 158, 11, 0.4)'
            }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: '#F59E0B' }}>PALAVRAS-CHAVE ENCONTRADAS:</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#F59E0B', marginTop: 4 }}>
                {auditResult.keywordEvents?.length || 0} ocorrência(s)
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink2)', marginTop: 4 }}>
                Empréstimos, renegociações e parcelas
              </div>
            </div>
          </div>

          {/* BARRA DE AÇÃO: BOTÕES DE DOWNLOAD EXCEL E TEXTO */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(0, 229, 155, 0.12)',
            border: '1px solid var(--teal)',
            borderRadius: 14,
            padding: '16px 22px',
            flexWrap: 'wrap',
            gap: 12
          }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 900, color: '#fff' }}>
                📁 Baixar Documentos Oficiais da Perícia
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2 }}>
                Exporte a planilha Excel com 5 abas detalhadas ou baixe o arquivo de texto com todo o diálogo transcrito.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={exportAuditToExcel}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '11px 18px',
                  borderRadius: 10,
                  background: 'var(--teal)',
                  color: '#081018',
                  fontSize: 13,
                  fontWeight: 900,
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(0, 229, 155, 0.3)'
                }}
              >
                <span>📊</span> Baixar Planilha Excel (.xlsx)
              </button>

              <button
                type="button"
                onClick={exportAuditToWord}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '11px 18px',
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #10B981, #059669)',
                  color: '#ffffff',
                  fontSize: 13,
                  fontWeight: 900,
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)'
                }}
              >
                <span>📄</span> Baixar Laudo Word (.doc)
              </button>

              <button
                type="button"
                onClick={exportAuditToPdf}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '11px 18px',
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                  color: '#081018',
                  fontSize: 13,
                  fontWeight: 900,
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(245, 158, 11, 0.3)'
                }}
              >
                <span>📑</span> Imprimir / Salvar em PDF
              </button>

              <button
                type="button"
                onClick={downloadTranscriptTxt}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '11px 18px',
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #38BDF8, #0284C7)',
                  color: '#081018',
                  fontSize: 13,
                  fontWeight: 900,
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(56, 189, 248, 0.3)'
                }}
              >
                <span>📝</span> Baixar Diálogo & Áudios (.txt)
              </button>
            </div>
          </div>

          {/* PARECER PERICIAL DA IA & IRREGULARIDADES DETECTADAS */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid var(--line)',
            borderRadius: 16,
            padding: 22,
            display: 'flex',
            flexDirection: 'column',
            gap: 14
          }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📑</span> Diagnóstico do Perito & Irregularidades Detectadas
            </div>

            <div style={{
              fontSize: 13,
              color: '#fff',
              lineHeight: 1.6,
              background: 'rgba(0,0,0,0.3)',
              padding: 16,
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.06)'
            }}>
              {auditResult.aiReport?.diagnostico_pericial}
            </div>

            {auditResult.aiReport?.irregularidades_detectadas?.length > 0 && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#EF4444', marginBottom: 6 }}>
                  ⚠️ Falhas de Cálculo e Cobranças Indevidas Praticadas pelo Credor:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {auditResult.aiReport.irregularidades_detectadas.map((irr, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        fontSize: 12.5,
                        color: '#fff'
                      }}
                    >
                      • {irr}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* ABAS DA TABELA DETALHADA: EXTRATO / DIÁLOGO / COMPROVANTES / ÁUDIOS */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid var(--line)',
            borderRadius: 16,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 14
          }}>
            <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--line)', paddingBottom: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setActiveTab('summary')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: activeTab === 'summary' ? 'var(--teal)' : 'rgba(255,255,255,0.05)',
                  color: activeTab === 'summary' ? '#081018' : '#fff',
                  fontWeight: 800,
                  fontSize: 12.5,
                  cursor: 'pointer'
                }}
              >
                Extrato de Amortizações ({auditResult.timeline.length})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('negotiations_audit')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: activeTab === 'negotiations_audit' ? 'linear-gradient(135deg, #F59E0B, #D97706)' : 'rgba(255,255,255,0.05)',
                  color: activeTab === 'negotiations_audit' ? '#081018' : '#fff',
                  fontWeight: 900,
                  fontSize: 12.5,
                  cursor: 'pointer',
                  boxShadow: activeTab === 'negotiations_audit' ? '0 4px 15px rgba(245, 158, 11, 0.35)' : 'none'
                }}
              >
                🎯 Negociações & Amortizações Omitidas ({auditResult.unmadeAmortizations?.length || 0})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('keywords_timeline')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: activeTab === 'keywords_timeline' ? 'linear-gradient(135deg, #F59E0B, #D97706)' : 'rgba(255,255,255,0.05)',
                  color: activeTab === 'keywords_timeline' ? '#081018' : '#fff',
                  fontWeight: 900,
                  fontSize: 12.5,
                  cursor: 'pointer',
                  boxShadow: activeTab === 'keywords_timeline' ? '0 4px 15px rgba(245, 158, 11, 0.35)' : 'none'
                }}
              >
                ⭐ Palavras-Chave & Datas ({auditResult.keywordEvents?.length || 0})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('dialogue')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: activeTab === 'dialogue' ? 'var(--teal)' : 'rgba(255,255,255,0.05)',
                  color: activeTab === 'dialogue' ? '#081018' : '#fff',
                  fontWeight: 800,
                  fontSize: 12.5,
                  cursor: 'pointer'
                }}
              >
                📜 Diálogo & Áudios Transcritos ({auditResult.fullDialog?.length || 0})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('receipts')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: activeTab === 'receipts' ? 'var(--teal)' : 'rgba(255,255,255,0.05)',
                  color: activeTab === 'receipts' ? '#081018' : '#fff',
                  fontWeight: 800,
                  fontSize: 12.5,
                  cursor: 'pointer'
                }}
              >
                Comprovantes Identificados ({auditResult.receipts.length})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('transcripts')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: activeTab === 'transcripts' ? 'var(--teal)' : 'rgba(255,255,255,0.05)',
                  color: activeTab === 'transcripts' ? '#081018' : '#fff',
                  fontWeight: 800,
                  fontSize: 12.5,
                  cursor: 'pointer'
                }}
              >
                Áudios Ouvidos ({auditResult.audioTranscripts.length})
              </button>
            </div>

            {/* ABA 1: EXTRATO DE AMORTIZAÇÕES (COM DIAS CORRIDOS) */}
            {activeTab === 'summary' && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left', color: 'var(--ink2)' }}>
                      <th style={{ padding: '10px 10px' }}>Data</th>
                      <th style={{ padding: '10px 10px', textAlign: 'center' }}>Dias Corridos</th>
                      <th style={{ padding: '10px 10px' }}>Origem</th>
                      <th style={{ padding: '10px 10px' }}>Descrição / Amortização</th>
                      <th style={{ padding: '10px 10px', textAlign: 'right' }}>Saldo Anterior</th>
                      <th style={{ padding: '10px 10px', textAlign: 'right' }}>Juros Período</th>
                      <th style={{ padding: '10px 10px', textAlign: 'right' }}>Valor Pago</th>
                      <th style={{ padding: '10px 10px', textAlign: 'right' }}>Amortizado</th>
                      <th style={{ padding: '10px 10px', textAlign: 'right' }}>Saldo Restante</th>
                      <th style={{ padding: '10px 10px', textAlign: 'right' }}>Crédito Excedente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditResult.timeline.map((row, idx) => (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                          background: row.status === 'QUITADO_EXCEDE' ? 'rgba(0, 229, 155, 0.1)' : 'transparent'
                        }}
                      >
                        <td style={{ padding: '10px 10px', whiteSpace: 'nowrap', fontWeight: 700 }}>{row.data}</td>
                        <td style={{ padding: '10px 10px', textAlign: 'center', color: '#F59E0B', fontWeight: 700 }}>
                          {row.diasCorridos > 0 ? `${row.diasCorridos}d` : '-'}
                        </td>
                        <td style={{ padding: '10px 10px', color: 'var(--teal)', fontSize: 11, whiteSpace: 'nowrap' }}>
                          {row.origem}
                        </td>
                        <td style={{ padding: '10px 10px', color: '#fff', maxWidth: 260 }}>
                          <div>{row.descricao}</div>
                          {row.evidencia && (
                            <div style={{ fontSize: 10, color: 'var(--ink2)', marginTop: 2 }}>
                              {row.evidencia}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'right', color: 'var(--ink2)' }}>
                          {row.saldoAnterior > 0 ? `R$ ${row.saldoAnterior.toFixed(2)}` : '-'}
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'right', color: '#EF4444' }}>
                          {row.jurosPeriodo > 0 ? `R$ ${row.jurosPeriodo.toFixed(2)}` : '-'}
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 800, color: row.valorPago > 0 ? '#00E59B' : 'var(--ink2)' }}>
                          {row.valorPago > 0 ? `R$ ${row.valorPago.toFixed(2)}` : '-'}
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 800, color: '#38BDF8' }}>
                          {row.amortizacaoCapital > 0 ? `R$ ${row.amortizacaoCapital.toFixed(2)}` : '-'}
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 900, color: row.saldoDevedor === 0 ? '#00E59B' : '#fff' }}>
                          R$ {row.saldoDevedor.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 900, color: row.saldoCredor > 0 ? '#00E59B' : 'var(--ink2)' }}>
                          {row.saldoCredor > 0 ? `+ R$ ${row.saldoCredor.toFixed(2)}` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ABA: AUDITORIA DETALHADA DE NEGOCIAÇÕES, RENEGOCIAÇÕES & AMORTIZAÇÕES OMITIDAS */}
            {activeTab === 'negotiations_audit' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* 1. NEGOCIAÇÕES & RENEGOCIAÇÕES COM DATAS */}
                <div style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid var(--line)',
                  borderRadius: 14,
                  padding: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 900, color: '#F59E0B', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>🤝</span> Negociações & Renegociações Identificadas com Datas
                    </div>
                    <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(245, 158, 11, 0.2)', color: '#F59E0B', fontWeight: 800 }}>
                      {auditResult.negotiations?.length || 0} negociação(ões) registrada(s)
                    </span>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--ink2)', textAlign: 'left' }}>
                          <th style={{ padding: '8px 10px' }}>Data da Negociação</th>
                          <th style={{ padding: '8px 10px' }}>Tipo</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right' }}>Valor Negociado (R$)</th>
                          <th style={{ padding: '8px 10px' }}>Qtd Parcelas</th>
                          <th style={{ padding: '8px 10px' }}>Datas de Pagamentos</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right' }}>Valor Total (R$)</th>
                          <th style={{ padding: '8px 10px' }}>Descrição & Evidência</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(auditResult.negotiations || []).map((n, idx) => (
                          <tr key={n.id || idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '10px 10px', fontWeight: 900, color: 'var(--teal)' }}>
                              📅 {n.data}
                            </td>
                            <td style={{ padding: '10px 10px' }}>
                              <span style={{
                                fontSize: 10,
                                fontWeight: 800,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: n.tipo?.includes('Renegociação') || n.tipo?.includes('RENEGOCIACAO') ? 'rgba(245, 158, 11, 0.2)' : 'rgba(0, 229, 155, 0.2)',
                                color: n.tipo?.includes('Renegociação') || n.tipo?.includes('RENEGOCIACAO') ? '#F59E0B' : 'var(--teal)'
                              }}>
                                {n.tipo}
                              </span>
                            </td>
                            <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 800, color: '#fff' }}>
                              R$ {Number(n.valorNegociado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td style={{ padding: '10px 10px', color: '#38BDF8', fontWeight: 800 }}>
                              {n.quantidadeParcelas}
                            </td>
                            <td style={{ padding: '10px 10px', color: 'var(--ink1)' }}>
                              {n.datasPagamentos}
                            </td>
                            <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 900, color: '#fff' }}>
                              R$ {Number(n.valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td style={{ padding: '10px 10px', fontSize: 11, color: 'var(--ink2)' }}>
                              <div>{n.descricao}</div>
                              {n.evidencia && (
                                <div style={{ color: '#38BDF8', fontStyle: 'italic', marginTop: 2 }}>
                                  Evidência: "{n.evidencia}"
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 2. AMORTIZAÇÕES COM DIREITO LEGAL NÃO FEITAS PELO CREDOR */}
                <div style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(0, 229, 155, 0.3)',
                  borderRadius: 14,
                  padding: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 14.5, fontWeight: 900, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>⚖️</span> Amortizações que o Devedor Tinha Direito e o Credor NÃO Concedeu
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink2)', marginTop: 2 }}>
                        Art. 354 do Código Civil: Todo valor pago que excedeu os juros acumulados devia ter reduzido imediatamente a dívida principal!
                      </div>
                    </div>
                    <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(0, 229, 155, 0.2)', color: 'var(--teal)', fontWeight: 800 }}>
                      {auditResult.unmadeAmortizations?.length || 0} amortização(ões) de direito
                    </span>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--ink2)', textAlign: 'left' }}>
                          <th style={{ padding: '8px 10px' }}>Data Pagto</th>
                          <th style={{ padding: '8px 10px' }}>Empréstimo</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right' }}>Valor Pago (R$)</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right' }}>Juros Quitados (R$)</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right', color: '#00E59B' }}>Valor a Amortizar (R$)</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right' }}>Saldo Real Restante (R$)</th>
                          <th style={{ padding: '8px 10px' }}>Prejuízo & Irregularidade Cometida</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(auditResult.unmadeAmortizations || []).map((u, idx) => (
                          <tr key={u.id || idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '10px 10px', fontWeight: 900, color: 'var(--teal)' }}>
                              📅 {u.dataPagamento}
                            </td>
                            <td style={{ padding: '10px 10px', fontWeight: 800, color: '#fff' }}>
                              {u.emprestimoReferencia}
                            </td>
                            <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 800, color: '#00E59B' }}>
                              R$ {Number(u.valorPago).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td style={{ padding: '10px 10px', textAlign: 'right', color: '#EF4444' }}>
                              R$ {Number(u.jurosDevidosData).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 900, color: '#38BDF8', background: 'rgba(56, 189, 248, 0.08)' }}>
                              R$ {Number(u.valorDireitoAmortizacao).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 900, color: '#fff' }}>
                              R$ {Number(u.saldoDevedorAposAmortizacao || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td style={{ padding: '10px 10px', fontSize: 11, color: '#F59E0B' }}>
                              <div>{u.prejuizoOuIrregularidade}</div>
                              {u.evidencia && (
                                <div style={{ color: 'var(--ink2)', fontStyle: 'italic', marginTop: 2 }}>
                                  Evidência: "{u.evidencia}"
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 3. PARCELAS COBRADAS POR CADA EMPRÉSTIMO COM DATAS */}
                <div style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid var(--line)',
                  borderRadius: 14,
                  padding: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 900, color: '#38BDF8', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>📊</span> Quantidade de Parcelas Cobradas por Empréstimo com Datas
                    </div>
                    <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(56, 189, 248, 0.2)', color: '#38BDF8', fontWeight: 800 }}>
                      Mapeamento de Cobranças
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {(auditResult.installmentsCharged || []).map((inst, idx) => (
                      <div
                        key={inst.id || idx}
                        style={{
                          padding: 14,
                          borderRadius: 10,
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                          <div>
                            <span style={{ fontSize: 13, fontWeight: 900, color: '#fff' }}>
                              💵 {inst.emprestimo}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--ink2)', marginLeft: 8 }}>
                              (Concedido em: <strong>{inst.dataEmprestimo}</strong>)
                            </span>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 4, background: '#38BDF8', color: '#081018' }}>
                            {inst.quantidadeCobradas} parcela(s) cobrada(s)
                          </span>
                        </div>

                        {inst.historico && inst.historico.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                            {inst.historico.map((h, hIdx) => (
                              <div
                                key={hIdx}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: 6,
                                  background: 'rgba(0,0,0,0.3)',
                                  fontSize: 11.5,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: 8
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ color: 'var(--teal)', fontWeight: 800 }}>📅 {h.data}</span>
                                  <span style={{ color: '#fff' }}>{h.descricao || 'Cobrança efetuada'}</span>
                                </div>
                                <span style={{ fontWeight: 900, color: '#EF4444' }}>
                                  R$ {Number(h.valorCobrado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'dialogue' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Barra de Filtro e Busca */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setDialogFilter('all')}
                      style={{
                        padding: '5px 10px',
                        borderRadius: 6,
                        border: 'none',
                        fontSize: 11.5,
                        fontWeight: 700,
                        background: dialogFilter === 'all' ? 'var(--teal)' : 'rgba(255,255,255,0.06)',
                        color: dialogFilter === 'all' ? '#081018' : '#fff',
                        cursor: 'pointer'
                      }}
                    >
                      Todos ({auditResult.fullDialog?.length || 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDialogFilter('audio')}
                      style={{
                        padding: '5px 10px',
                        borderRadius: 6,
                        border: 'none',
                        fontSize: 11.5,
                        fontWeight: 700,
                        background: dialogFilter === 'audio' ? '#38BDF8' : 'rgba(255,255,255,0.06)',
                        color: dialogFilter === 'audio' ? '#081018' : '#fff',
                        cursor: 'pointer'
                      }}
                    >
                      🎙️ Áudios ({auditResult.audioTranscripts?.length || 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDialogFilter('image')}
                      style={{
                        padding: '5px 10px',
                        borderRadius: 6,
                        border: 'none',
                        fontSize: 11.5,
                        fontWeight: 700,
                        background: dialogFilter === 'image' ? '#F59E0B' : 'rgba(255,255,255,0.06)',
                        color: dialogFilter === 'image' ? '#081018' : '#fff',
                        cursor: 'pointer'
                      }}
                    >
                      🖼️ Prints ({auditResult.fullDialog?.filter(d => d.type === 'IMAGE').length || 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDialogFilter('financial')}
                      style={{
                        padding: '5px 10px',
                        borderRadius: 6,
                        border: 'none',
                        fontSize: 11.5,
                        fontWeight: 700,
                        background: dialogFilter === 'financial' ? 'var(--teal)' : 'rgba(255,255,255,0.06)',
                        color: dialogFilter === 'financial' ? '#081018' : '#fff',
                        cursor: 'pointer'
                      }}
                    >
                      💰 Mencionou Valores / Juros
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, minWidth: 220, justifyContent: 'flex-end' }}>
                    <input
                      type="text"
                      placeholder="Buscar palavra na conversa (ex: juros, cartão, pix)..."
                      value={dialogSearch}
                      onChange={e => setDialogSearch(e.target.value)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        background: 'rgba(0,0,0,0.5)',
                        border: '1px solid var(--line)',
                        color: '#fff',
                        fontSize: 12,
                        width: '100%',
                        maxWidth: 320
                      }}
                    />
                    <button
                      type="button"
                      onClick={downloadTranscriptTxt}
                      title="Baixar arquivo de texto (.txt) completo com todas as mensagens e áudios"
                      style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid var(--line)',
                        color: '#fff',
                        fontSize: 11.5,
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      📄 Baixar .txt
                    </button>
                  </div>
                </div>

                {/* Lista do Diálogo Transcrito */}
                <div style={{
                  maxHeight: 520,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  padding: 12,
                  background: 'rgba(0,0,0,0.4)',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.06)'
                }}>
                  {(() => {
                    const filtered = (auditResult.fullDialog || []).filter(item => {
                      if (dialogFilter === 'audio' && item.type !== 'AUDIO') return false;
                      if (dialogFilter === 'image' && item.type !== 'IMAGE') return false;
                      if (dialogFilter === 'financial' && !item.isFinancial) return false;
                      if (dialogSearch.trim()) {
                        const term = dialogSearch.toLowerCase();
                        const matchText = (item.content || '').toLowerCase().includes(term);
                        const matchSender = (item.sender || '').toLowerCase().includes(term);
                        const matchResumo = (item.resumoFinanceiro || '').toLowerCase().includes(term);
                        if (!matchText && !matchSender && !matchResumo) return false;
                      }
                      return true;
                    });

                    if (filtered.length === 0) {
                      return (
                        <div style={{ textAlign: 'center', padding: 30, color: 'var(--ink2)', fontSize: 13 }}>
                          Nenhuma mensagem encontrada para o filtro atual.
                        </div>
                      );
                    }

                    return filtered.map((item, idx) => {
                      const isMe = item.isFromMe;
                      const isAudio = item.type === 'AUDIO';
                      const isImage = item.type === 'IMAGE';
                      const fullText = `${item.content || ''} ${item.resumoFinanceiro || ''}`.toLowerCase();
                      const hasNegotiation = /renegocia|negocia|acordo|repactua/.test(fullText);
                      const hasLoan = /emprest|mútuo|transfer|pix|ted|dinheiro/.test(fullText);
                      const hasAmortization = /amortiz|abater|abate|principal|rolagem|só juros|so juros/.test(fullText);
                      const hasInstallment = /parcela|prestação|prestacao|cobranca|cobrança/.test(fullText);
                      const isKeywordMatch = hasNegotiation || hasLoan || hasAmortization || hasInstallment;

                      return (
                        <div
                          key={item.id || idx}
                          style={{
                            alignSelf: isMe ? 'flex-end' : 'flex-start',
                            maxWidth: '82%',
                            padding: '12px 16px',
                            borderRadius: 14,
                            background: isMe
                              ? 'linear-gradient(135deg, rgba(0, 229, 155, 0.15), rgba(15, 23, 42, 0.9))'
                              : isImage
                              ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(15, 23, 42, 0.95))'
                              : isKeywordMatch
                              ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(30, 41, 59, 0.95))'
                              : 'linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95))',
                            border: `1.5px solid ${isKeywordMatch ? 'rgba(245, 158, 11, 0.6)' : isMe ? 'rgba(0, 229, 155, 0.35)' : isAudio ? 'rgba(56, 189, 248, 0.4)' : isImage ? 'rgba(245, 158, 11, 0.4)' : 'rgba(255,255,255,0.1)'}`,
                            boxShadow: isKeywordMatch ? '0 0 12px rgba(245, 158, 11, 0.2)' : '0 2px 8px rgba(0,0,0,0.2)'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 800, color: isMe ? 'var(--teal)' : '#fff' }}>
                                {item.sender}
                              </span>
                              <span style={{
                                fontSize: 10,
                                fontWeight: 800,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: isAudio ? '#38BDF8' : isImage ? '#F59E0B' : 'rgba(255,255,255,0.08)',
                                color: (isAudio || isImage) ? '#081018' : 'var(--ink2)'
                              }}>
                                {item.mediaTypeLabel}
                              </span>
                              {hasNegotiation && (
                                <span style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 5px', borderRadius: 4, background: '#F59E0B', color: '#081018' }}>
                                  🤝 Renegociação / Acordo
                                </span>
                              )}
                              {hasAmortization && (
                                <span style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 5px', borderRadius: 4, background: '#00E59B', color: '#081018' }}>
                                  ⚖️ Ponto de Amortização
                                </span>
                              )}
                              {hasInstallment && !hasNegotiation && (
                                <span style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 5px', borderRadius: 4, background: '#38BDF8', color: '#081018' }}>
                                  📅 Parcela / Cobrança
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: 11, fontWeight: isKeywordMatch ? 900 : 700, color: isKeywordMatch ? '#F59E0B' : 'var(--ink2)', background: isKeywordMatch ? 'rgba(245, 158, 11, 0.15)' : 'transparent', padding: '2px 6px', borderRadius: 4 }}>
                              📅 {item.dateTime || item.date}
                            </span>
                          </div>

                          <div style={{
                            fontSize: 13,
                            color: isAudio ? '#E0F2FE' : '#fff',
                            fontStyle: isAudio ? 'italic' : 'normal',
                            lineHeight: 1.5,
                            wordBreak: 'break-word',
                            whiteSpace: 'pre-line'
                          }}>
                            {isAudio ? `"${item.content}"` : item.content}
                          </div>

                          {isImage && item.receiptData && item.receiptData.valor_pago > 0 && (
                            <div style={{
                              marginTop: 8,
                              padding: '8px 12px',
                              borderRadius: 8,
                              background: 'rgba(0, 229, 155, 0.1)',
                              border: '1px solid rgba(0, 229, 155, 0.3)',
                              fontSize: 11.5,
                              color: '#fff',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 2
                            }}>
                              <div style={{ fontWeight: 800, color: 'var(--teal)' }}>
                                ✓ Comprovante Extraído: R$ {Number(item.receiptData.valor_pago).toFixed(2)} ({item.receiptData.tipo_comprovante || 'PIX'})
                              </div>
                              {item.receiptData.favorecido_nome && <div>👤 <strong>Favorecido:</strong> {item.receiptData.favorecido_nome}</div>}
                              {item.receiptData.data_pagamento && <div>📅 <strong>Data:</strong> {item.receiptData.data_pagamento}</div>}
                              {item.receiptData.id_transacao_ou_autenticacao && <div>🔑 <strong>Autenticação:</strong> {item.receiptData.id_transacao_ou_autenticacao}</div>}
                            </div>
                          )}

                          {(item.resumoFinanceiro || item.taxaJuros || (item.valores && item.valores.length > 0)) && (
                            <div style={{
                              marginTop: 8,
                              paddingTop: 6,
                              borderTop: '1px dashed rgba(255,255,255,0.1)',
                              fontSize: 11,
                              color: '#F59E0B',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 2
                            }}>
                              {item.resumoFinanceiro && <div>⚡ <strong>Análise:</strong> {item.resumoFinanceiro}</div>}
                              {item.taxaJuros && <div>⚡ <strong>Taxa Mencionada:</strong> {item.taxaJuros}</div>}
                              {item.valores && item.valores.length > 0 && <div>💵 <strong>Valores:</strong> {item.valores.join(', ')}</div>}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {/* ABA 3: COMPROVANTES IDENTIFICADOS */}
            {activeTab === 'receipts' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {auditResult.receipts.map((r, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: 14,
                      borderRadius: 12,
                      background: 'rgba(0,0,0,0.4)',
                      border: '1px solid rgba(0, 229, 155, 0.3)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--teal)' }}>
                        R$ {r.amount.toFixed(2)}
                      </span>
                      <span style={{ fontSize: 11, background: 'rgba(0, 229, 155, 0.15)', color: 'var(--teal)', padding: '2px 8px', borderRadius: 10 }}>
                        {r.origin}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#fff' }}>📅 Data: {r.date}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink2)' }}>{r.evidence}</div>
                  </div>
                ))}
              </div>
            )}

            {/* ABA 4: ÁUDIOS OUVIDOS COM IA */}
            {activeTab === 'transcripts' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {auditResult.audioTranscripts.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink2)' }}>
                    Nenhum áudio de voz foi encontrado nesta conversa.
                  </div>
                ) : (
                  auditResult.audioTranscripts.map((a, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: 14,
                        borderRadius: 12,
                        background: 'rgba(0,0,0,0.4)',
                        border: '1px solid var(--line)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--teal)' }}>
                          🎙️ Áudio gravado por {a.sender} em {a.date}
                        </span>
                        {a.taxaJuros && (
                          <span style={{ fontSize: 11, color: '#F59E0B' }}>Taxa citada: {a.taxaJuros}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12.5, color: '#fff', fontStyle: 'italic', background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 8 }}>
                        "{a.transcription}"
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink2)' }}>
                        <strong>Resumo Financeiro da IA:</strong> {a.resumo}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ABA 5: TODAS AS MENSAGENS E ÁUDIOS COM PALAVRAS-CHAVE E DATAS */}
            {activeTab === 'keywords_timeline' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: 12,
                  padding: 14,
                  fontSize: 13,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 10
                }}>
                  <div>
                    <strong style={{ color: '#F59E0B' }}>⭐ Cronologia de Termos Financeiros Relevantes:</strong> Listagem cronológica de todas as mensagens e áudios que mencionam empréstimos, renegociações, amortizações e parcelas com suas respectivas datas e remetentes.
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink2)' }}>
                    Data da 1ª mensagem do diálogo: <strong style={{ color: '#fff' }}>{auditResult.firstMessage?.dateTime || auditResult.firstMessage?.date || '-'}</strong> ({auditResult.firstMessage?.sender || '-'})
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left', color: 'var(--ink2)' }}>
                        <th style={{ padding: '10px 10px', width: 160 }}>Data e Hora</th>
                        <th style={{ padding: '10px 10px', width: 120 }}>Tipo</th>
                        <th style={{ padding: '10px 10px', width: 160 }}>Remetente</th>
                        <th style={{ padding: '10px 10px' }}>Conteúdo / Transcrição com Palavras-Chave em Destaque</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(auditResult.keywordEvents || []).length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ padding: 20, textAlign: 'center', color: 'var(--ink2)' }}>
                            Nenhuma palavra-chave financeira específica foi encontrada no conteúdo das mensagens.
                          </td>
                        </tr>
                      ) : (
                        (auditResult.keywordEvents || []).map((ev, idx) => (
                          <tr
                            key={idx}
                            style={{
                              borderBottom: '1px solid rgba(255,255,255,0.05)',
                              background: ev.isFromMe ? 'rgba(0, 229, 155, 0.04)' : 'rgba(245, 158, 11, 0.04)'
                            }}
                          >
                            <td style={{ padding: '10px 10px', whiteSpace: 'nowrap', fontWeight: 700, color: '#fff' }}>
                              📅 {ev.dateTime || `${ev.date} ${ev.time || ''}`}
                            </td>
                            <td style={{ padding: '10px 10px' }}>
                              <span style={{
                                display: 'inline-block',
                                padding: '3px 8px',
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 800,
                                background: ev.type === 'audio' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(56, 189, 248, 0.2)',
                                color: ev.type === 'audio' ? '#F59E0B' : '#38BDF8'
                              }}>
                                {ev.mediaTypeLabel || (ev.type === 'audio' ? '🎙️ Áudio' : '💬 Texto')}
                              </span>
                            </td>
                            <td style={{ padding: '10px 10px', fontWeight: 800, color: ev.isFromMe ? 'var(--teal)' : '#F59E0B' }}>
                              {ev.sender}
                            </td>
                            <td style={{ padding: '10px 10px', color: '#E2E8F0', lineHeight: 1.5 }}>
                              <div dangerouslySetInnerHTML={{ __html: highlightKeywordsHtml(ev.content) }} />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

        </div>
      )}

    </div>
  );
}
