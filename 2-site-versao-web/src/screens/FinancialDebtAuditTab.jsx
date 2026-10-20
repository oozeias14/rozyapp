import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  getEvolutionConfig,
  fetchInstanceStatus,
  createOrConnectInstance,
  getPairingCode,
  resetAndRecreateInstance,
  fetchWhatsAppChats,
  fetchFullChatHistory,
  fetchMediaBase64FromMessage,
  extractCleanPhone
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
  const [connStatus, setConnStatus] = useState(status || { connected: false });

  // ── SELEÇÃO DE CONTATO / CREDOR ──
  const [chats, setChats] = useState([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null); // { jid, name, phone }
  const [manualPhone, setManualPhone] = useState('');
  const [contactSearch, setContactSearch] = useState('');

  // ── PASSO 2: MODO MANUAL VS MODO AUTOMÁTICO ──
  const [step2Mode, setStep2Mode] = useState('manual'); // 'manual' | 'auto'

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
    type: 'loan', // 'loan' | 'credit_card'
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    monthlyRate: '10', // padrão 10% empréstimo, 5% cartão
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
  const [dialogFilter, setDialogFilter] = useState('all'); // 'all' | 'audio' | 'text' | 'financial'

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
    if (setShowConnectModal) setShowConnectModal(true);
    handleFetchQr();
  }

  async function handleFetchQr() {
    setLoadingQr(true);
    try {
      const res = await createOrConnectInstance();
      if (res?.base64 || res?.qrcode) {
        setQrCodeData(res.base64 || res.qrcode);
      }
    } catch (err) {
      console.warn('Erro ao gerar QR Code:', err);
    } finally {
      setLoadingQr(false);
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
      const code = await getPairingCode(clean);
      setPairingCodeResult(code);
    } catch (err) {
      alert('Erro ao gerar código de pareamento: ' + err.message);
    } finally {
      setGeneratingPairing(false);
    }
  }

  async function handleResetSession() {
    setResettingInstance(true);
    try {
      await resetAndRecreateInstance();
      setQrCodeData(null);
      setPairingCodeResult(null);
      await handleFetchQr();
      alert('Sessão limpa! Escaneie o novo QR Code que apareceu na tela.');
    } catch (err) {
      alert('Erro ao reiniciar sessão: ' + err.message);
    } finally {
      setResettingInstance(false);
    }
  }

  // Carregar conversas ativas do WhatsApp
  async function loadChats() {
    setLoadingChats(true);
    try {
      const chatList = await fetchWhatsAppChats();
      const filtered = (chatList || []).filter(c => {
        const id = (c.id || c.remoteJid || '').toLowerCase();
        return !id.includes('@g.us') && !id.includes('@broadcast');
      });
      setChats(filtered);
    } catch (err) {
      console.warn('Erro ao carregar conversas:', err);
    } finally {
      setLoadingChats(false);
    }
  }

  // Selecionar por clique na lista
  function handleSelectChat(c) {
    const rawJid = c.id || c.remoteJid || '';
    const cleanNumber = extractCleanPhone(rawJid);
    const contactName = c.name || c.pushName || c.subject || cleanNumber || 'Sem Nome';
    setSelectedContact({
      jid: rawJid,
      name: contactName,
      phone: cleanNumber
    });
  }

  // Definir por número digitado
  function handleSetManualPhone() {
    const clean = extractCleanPhone(manualPhone);
    if (!clean || clean.length < 8) {
      alert('Por favor, digite um número de telefone válido com DDD (ex: 61999998888).');
      return;
    }
    const jid = (clean.startsWith('55') ? clean : '55' + clean) + '@s.whatsapp.net';
    setSelectedContact({
      jid,
      name: `Credor (${clean})`,
      phone: clean
    });
  }

  // ── GERENCIAMENTO MANUAL DE CONDIÇÕES (PASSO 2) ──
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
      type: conditionForm.type, // 'loan' | 'credit_card'
      amount: val,
      date: conditionForm.date || new Date().toISOString().slice(0, 10),
      monthlyRate: rate,
      description: conditionForm.description || (conditionForm.type === 'credit_card' ? 'Gasto com Cartão de Crédito' : 'Empréstimo em Dinheiro')
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
    addLog('🤖 [Modo Automático] Iniciando varredura inteligente na conversa para encontrar empréstimos e cartões...', 'info');

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
        addLog(`🌐 Buscando histórico do WhatsApp para ${selectedContact.name}...`, 'info');
        rawMessages = await fetchFullChatHistory(selectedContact.jid);
      }

      if (rawMessages.length === 0) {
        throw new Error('Nenhuma mensagem encontrada na conversa.');
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
          const hasFinancial = /(emprest|peguei|mandou|juro|cart|compra|fatura|pag|r\$|\d+,\d{2}|\d+\.\d{2}|limite|pix|transfer)/i.test(textContent);
          if (hasFinancial) {
            textRecords.push({ date: dateStr, sender: senderLabel, text: textContent });
          }
        }

        const isAudio = Boolean(msg.message?.audioMessage || msg.messageType === 'audioMessage');
        if (isAudio && audioTranscripts.length < 15) {
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
              }
            }
          } catch (e) {}
        }
      }

      addLog(`🤖 Enviando ${textRecords.length} mensagens e ${audioTranscripts.length} áudios para detecção automática com IA...`, 'info');

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
          type: (d.tipo || '').toLowerCase().includes('cart') ? 'credit_card' : 'loan',
          amount: parseFloat(d.valor) || 0,
          date: d.data || new Date().toISOString().slice(0, 10),
          monthlyRate: parseFloat(d.taxa_juros_mes) || ((d.tipo || '').toLowerCase().includes('cart') ? 5 : 10),
          description: d.descricao || 'Débito Detectado Automaticamente',
          evidence: d.evidencia || ''
        }));

        setAutoDetectedDebts(detected);
        setAutoScanSummary(data.resumo || '');
        addLog(`✓ IA identificou automaticamente ${detected.length} operações de empréstimos e cartões!`, 'success');
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
    txt += `TOTAL DE MENSAGENS E ÁUDIOS PROCESSADOS: ${auditResult.fullDialog.length}\r\n`;
    txt += `TOTAL DE ÁUDIOS TRANSCREVความADOS POR IA: ${auditResult.audioTranscripts?.length || 0}\r\n`;
    txt += `CRITÉRIO DE AMORTIZAÇÃO: Código Civil Brasileiro art. 354 (Amortização Linear dos Juros Primeiro)\r\n\r\n`;
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
    txt += `• Total de Empréstimos em Dinheiro/PIX: R$ ${(auditResult.totalEmprestimosDinheiro || 0).toFixed(2)}\r\n`;
    txt += `• Total de Gastos no Cartão de Crédito (5% a.m.): R$ ${(auditResult.totalGastosCartao || 0).toFixed(2)}\r\n`;
    txt += `• Total Geral do Principal Contratado: R$ ${auditResult.totalEmprestado.toFixed(2)}\r\n`;
    txt += `• Total Efetivamente Pago pelo Usuário: R$ ${auditResult.totalPago.toFixed(2)}\r\n`;
    txt += `• Total de Juros Legais Devidos no Período: R$ ${auditResult.totalJurosDevidos.toFixed(2)}\r\n`;
    txt += `• Total de Capital Principal Amortizado: R$ ${auditResult.totalAmortizado.toFixed(2)}\r\n`;
    txt += `• Saldo Devedor Restante Real: R$ ${auditResult.saldoFinalReal.toFixed(2)}\r\n`;
    txt += `• Valor Pago a Mais a Restituir: R$ ${auditResult.totalPagoAMais.toFixed(2)}\r\n\r\n`;
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

    const targetContactPhone = selectedContact?.phone || (selectedContact?.jid ? selectedContact.jid.replace('@s.whatsapp.net', '') : manualPhone) || 'Credor';
    const targetContactName = selectedContact?.name || 'Credor';
    const targetContactDisplay = `${targetContactName} (${targetContactPhone})`;

    addLog('🚀 INICIANDO PERÍCIA FINANCEIRA FORENSE DE CONVERSA & AMORTIZAÇÕES', 'info');
    addLog(`👤 Alvo da Perícia: ${targetContactDisplay}`, 'info');
    addLog(`⚙️ Modo Escolhido no Passo 2: ${step2Mode === 'auto' ? '🤖 AUTOMÁTICO (Robô & IA)' : '📝 MANUAL'}`, 'info');

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
        addLog(`🌐 Conectando à API para buscar histórico completo de ${selectedContact.jid}...`, 'info');
        const chatMsgs = await fetchFullChatHistory(selectedContact.jid, (count) => {
          addLog(`📥 Baixando mensagens do WhatsApp... ${count} mensagens recuperadas.`, 'info');
        });
        rawMessages = chatMsgs;
        addLog(`📥 Total de ${rawMessages.length} mensagens históricas recuperadas do WhatsApp!`, 'success');
      }

      if (rawMessages.length === 0 && uploadedReceipts.length === 0) {
        throw new Error('Nenhuma mensagem ou comprovante encontrado para analisar.');
      }

      // ── FASE 2: TRANSCRIÇÃO DE ÁUDIOS E LEITURA DE TEXTOS ─────────────
      setAuditProgress({ current: 40, total: 100, stepLabel: 'Fase 2/4: Ouvindo e transcrevendo áudios com IA...' });

      const textRecords = [];
      const audioTranscripts = [];
      const fullConversationDialog = [];
      let audioCount = 0;

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
        }

        if (isAudio) {
          audioCount++;
          addLog(`🎙️ Áudio #${audioCount} detectado em ${dateTimeDisplay}. Transcrevendo com IA...`, 'info');
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
                addLog(`✓ Áudio #${audioCount} transcrito com sucesso: "${audData.resumo_financeiro || audData.transcricao.slice(0, 80)}..."`, 'success');
              }
            }
          } catch (audioErr) {
            console.warn('Erro ao transcrever áudio:', audioErr);
          }
        }
      }

      // Ordenar diálogo completo cronologicamente
      fullConversationDialog.sort((a, b) => {
        if (a.timestamp && b.timestamp) return a.timestamp - b.timestamp;
        return new Date(a.date) - new Date(b.date);
      });

      addLog(`🎙️ Processamento de áudios concluído: ${audioTranscripts.length} áudio(s) transcritos e periciados.`, 'info');
      addLog(`📜 Diálogo completo consolidado com ${fullConversationDialog.length} registros no total!`, 'success');

      // ── FASE 3: CONSOLIDAÇÃO DE COMPROVANTES E PAGAMENTOS ─────────────
      setAuditProgress({ current: 65, total: 100, stepLabel: 'Fase 3/4: Cruzando comprovantes e pagamentos efetuados...' });

      const allPayments = [...uploadedReceipts.map(r => ({
        date: r.date,
        amount: Number(r.amount) || 0,
        origin: 'Comprovante Anexado',
        evidence: `Comprovante ${r.type}: R$ ${r.amount} para ${r.beneficiary || targetContactName} (Autenticação: ${r.authId || 'Sem ID'})`,
        authId: r.authId
      }))];

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
          addLog('🤖 Detectando empréstimos e gastos no cartão automaticamente com IA...', 'info');
          try {
            const respAuto = await fetch('/api/gemini-financial-audit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'detect_debts_auto',
                payload: {
                  mensagensTexto: textRecords.slice(-100),
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
                type: (d.tipo || '').toLowerCase().includes('cart') ? 'credit_card' : 'loan',
                amount: parseFloat(d.valor) || 0,
                date: d.data || new Date().toISOString().slice(0, 10),
                monthlyRate: parseFloat(d.taxa_juros_mes) || ((d.tipo || '').toLowerCase().includes('cart') ? 5 : 10),
                description: d.descricao || 'Débito Detectado',
                evidence: d.evidencia || ''
              }));
              setAutoDetectedDebts(activeDebts);
              addLog(`✓ IA detectou automaticamente ${activeDebts.length} débitos!`, 'success');
            }
          } catch (e) {
            console.warn('Falha no auto-detect:', e);
          }
        }
      } else {
        activeDebts = [...debtConditions];
        addLog(`📝 Usando ${activeDebts.length} débitos cadastrados manualmente pelo usuário.`, 'info');
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

      let totalLoansCash = 0;
      let totalCardExpenses = 0;
      activeDebts.forEach(c => {
        if (c.type === 'credit_card') totalCardExpenses += c.amount;
        else totalLoansCash += c.amount;
      });
      const totalContracted = totalLoansCash + totalCardExpenses;

      // ── CHAMADA DA IA FORENSE PARA PARECER TÉCNICO ──
      let aiAuditResponse = null;
      try {
        const resp = await fetch('/api/gemini-financial-audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'audit_financial_history',
            payload: {
              mensagensTexto: textRecords.filter(t => t.isFinancial).slice(-100),
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
          type: c.type === 'credit_card' ? 'CARTAO_CREDITO' : 'EMPRESTIMO',
          monthlyRate: Number(c.monthlyRate) || (c.type === 'credit_card' ? 5 : 10),
          description: c.description || (c.type === 'credit_card' ? 'Gasto no Cartão de Crédito' : 'Empréstimo em Dinheiro'),
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
      let saldoCard = 0;       // Principal cartão de crédito
      let rateCard = 5;        // Taxa cartão (padrão 5% a.m.)

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

        // Juros incorridos pro-rata die no período decorrido sobre os saldos anteriores
        const saldoAnteriorTotal = saldoLoan + saldoCard;
        const jurosLoanPeriodo = (saldoLoan > 0 && fractionMonths > 0) ? (saldoLoan * (rateLoan / 100) * fractionMonths) : 0;
        const jurosCardPeriodo = (saldoCard > 0 && fractionMonths > 0) ? (saldoCard * (rateCard / 100) * fractionMonths) : 0;
        const jurosPeriodo = jurosLoanPeriodo + jurosCardPeriodo;

        accumulatedInterest += jurosPeriodo;
        totalInterestDue += jurosPeriodo;

        const jurosAcumuladosAntes = accumulatedInterest;

        if (!ev.isPayment) {
          // É UM NOVO DÉBITO (EMPRÉSTIMO OU CARTÃO)
          const isCard = ev.type === 'CARTAO_CREDITO';
          if (isCard) rateCard = ev.monthlyRate || rateCard;
          else rateLoan = ev.monthlyRate || rateLoan;

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
            if (isCard) saldoCard += debtAmountEffective;
            else saldoLoan += debtAmountEffective;
          }

          const novoSaldoTotal = saldoLoan + saldoCard;

          amortizationTimeline.push({
            data: currentDate,
            diasCorridos,
            origem: isCard ? '💳 Cartão de Crédito' : '💵 Empréstimo em Dinheiro',
            descricao: `${isCard ? '💳 Gasto no Cartão de Crédito' : '💵 Empréstimo em Dinheiro'}: R$ ${ev.amount.toFixed(2)} (${ev.description})${offsetMsg} - Juros: ${ev.monthlyRate}% a.m.`,
            saldoAnterior: saldoAnteriorTotal,
            taxaJurosMensal: `${ev.monthlyRate}% a.m.`,
            jurosPeriodo,
            jurosAcumuladosAntes,
            valorPago: 0,
            jurosAbatidos: 0,
            amortizacaoCapital: 0,
            saldoDevedor: novoSaldoTotal,
            saldoCredor: accumulatedSurplus,
            status: isCard ? 'GASTO_CARTAO' : 'NOVO_EMPRESTIMO',
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
            // Amortiza a dívida de maior taxa primeiro (empréstimo a 10%, depois cartão a 5%)
            if (rateLoan >= rateCard) {
              if (saldoLoan > 0) {
                const amortL = Math.min(remainingPayment, saldoLoan);
                saldoLoan -= amortL;
                remainingPayment -= amortL;
                principalAmortized += amortL;
              }
              if (remainingPayment > 0 && saldoCard > 0) {
                const amortC = Math.min(remainingPayment, saldoCard);
                saldoCard -= amortC;
                remainingPayment -= amortC;
                principalAmortized += amortC;
              }
            } else {
              if (saldoCard > 0) {
                const amortC = Math.min(remainingPayment, saldoCard);
                saldoCard -= amortC;
                remainingPayment -= amortC;
                principalAmortized += amortC;
              }
              if (remainingPayment > 0 && saldoLoan > 0) {
                const amortL = Math.min(remainingPayment, saldoLoan);
                saldoLoan -= amortL;
                remainingPayment -= amortL;
                principalAmortized += amortL;
              }
            }

            // Se ainda sobrar pagamento após zerar o capital e juros, vira CRÉDITO PAGO A MAIS (indébito)
            if (remainingPayment > 0) {
              accumulatedSurplus += remainingPayment;
            }
          }

          totalPrincipalAmortized += principalAmortized;
          const novoSaldoTotal = saldoLoan + saldoCard;

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
            taxaJurosMensal: `${rateLoan}% (Emp.) / ${rateCard}% (Cartão)`,
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

      const finalDebtBalance = saldoLoan + saldoCard;
      const finalOverpaid = accumulatedSurplus;
      const finalStatus = finalDebtBalance === 0 || totalPaid >= (totalContracted + totalInterestDue)
        ? 'QUITADO_PAGO_A_MAIS'
        : 'SALDO_DEVEDOR_RESTANTE';

      // Totais para comparação Manual vs Automático
      const manualTotal = debtConditions.reduce((acc, c) => acc + c.amount, 0);
      const autoTotal = autoDetectedDebts.reduce((acc, c) => acc + c.amount, 0);

      const finalResult = {
        executionMode: step2Mode, // 'manual' | 'auto'
        manualTotal,
        autoTotal,
        totalEmprestado: totalContracted,
        totalEmprestimosDinheiro: totalLoansCash,
        totalGastosCartao: totalCardExpenses,
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
        aiReport: aiAuditResponse || {
          diagnostico_pericial: `Após reconstituição contábil com base em dias corridos e no Código Civil art. 354 sobre ${activeDebts.length} operações (Total: R$ ${totalContracted.toFixed(2)}), apurou-se que foram pagos R$ ${totalPaid.toFixed(2)}. ${finalDebtBalance <= 0 ? `Dívida TOTALMENTE QUITADA, restando saldo credor a favor do devedor de R$ ${finalOverpaid.toFixed(2)} pago a mais a ser devolvido pelo número ${targetContactDisplay}!` : `Saldo devedor restante justo a pagar ao número ${targetContactDisplay}: R$ ${finalDebtBalance.toFixed(2)}.`}`,
          irregularidades_detectadas: [
            'Cobrança de juros sem o devido abatimento das amortizações do capital principal.',
            'Não consideração de descontos de juros em pagamentos antecipados e dias corridos pro-rata die.',
            'Cobrança de juros sobre parcelas de cartão já quitadas.'
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
        ['Total de Empréstimos em Dinheiro/PIX:', auditResult.totalEmprestimosDinheiro || 0],
        ['Total de Gastos no Cartão de Crédito (5% a.m.):', auditResult.totalGastosCartao || 0],
        ['Total Geral do Principal Contratado:', auditResult.totalEmprestado],
        ['Total Efetivamente Pago pelo Usuário:', auditResult.totalPago],
        ['Total de Juros Legais Devidos (dias corridos):', auditResult.totalJurosDevidos],
        ['Total de Capital Principal Amortizado:', auditResult.totalAmortizado],
        ['Saldo Devedor Real Restante:', auditResult.saldoFinalReal],
        ['Valor Pago a Mais a Restituir (Indébito):', auditResult.totalPagoAMais],
        ['Situação Final da Dívida:', auditResult.status === 'QUITADO_PAGO_A_MAIS' ? 'TOTALMENTE QUITADA - PAGOU A MAIS' : 'SALDO RESTANTE RECALCULADO'],
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

      // ABA 3: CONDIÇÕES DE EMPRÉSTIMOS E CARTÃO
      const conditionsHeaders = ['Tipo de Operação', 'Data', 'Valor (R$)', 'Juros Cobrados (% a.m.)', 'Descrição / Finalidade', 'Evidência'];
      const conditionsRows = (auditResult.debtConditions || []).map(c => [
        c.type === 'credit_card' ? 'Gasto no Cartão de Crédito' : 'Empréstimo em Dinheiro',
        c.date,
        c.amount,
        `${c.monthlyRate}% ao mês`,
        c.description,
        c.evidence || ''
      ]);
      const wsConditions = XLSX.utils.aoa_to_sheet([conditionsHeaders, ...conditionsRows]);
      XLSX.utils.book_append_sheet(wb, wsConditions, 'Empréstimos e Cartão');

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

      const safePhone = (selectedContact?.phone || manualPhone || 'credor').replace(/\D/g, '');
      const filename = `pericia_financeira_${auditResult.executionMode}_${safePhone}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, filename);
      addLog(`📥 Planilha Excel oficial "${filename}" baixada com sucesso!`, 'success');

    } catch (exportErr) {
      alert('Erro ao exportar planilha Excel: ' + exportErr.message);
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
              Audite negociações de cobrança de juros e cartão de crédito no WhatsApp: leitura do histórico completo, audição de áudios,
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
          </div>
        </div>
      </div>

      {/* MODAL INTEGRADO DE CONEXÃO WHATSAPP (QR CODE + CÓDIGO DE PAREAMENTO) */}
      {showConnectModalLocal && (
        <div className="modal-bg" style={{ zIndex: 12000 }}>
          <div className="modal" style={{ maxWidth: 430, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                      src={qrCodeData.startsWith('data:') ? qrCodeData : `data:image/png;base64,${qrCodeData}`}
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
                      {pairingCodeResult}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink2)' }}>
                      No celular: <strong>Aparelhos Conectados</strong> ➔ <strong>Conectar com número de telefone</strong> e digite o código acima!
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Opção Limpar e Reiniciar Sessão */}
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
      )}

      {/* BLOCO EM GRID: PASSO 1 (CONTATO) + PASSO 2 (CONDIÇÕES: MANUAL VS AUTOMÁTICO) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: 16
      }}>

        {/* PASSO 1: SELECIONAR CONTATO / CREDOR */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.9)',
          border: '1px solid var(--line)',
          borderRadius: 16,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 14
        }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>👤</span> Passo 1: Selecionar Número do Credor
          </div>

          <div style={{ fontSize: 12.5, color: 'var(--ink2)' }}>
            Escolha uma conversa do WhatsApp conectado ou digite o número da pessoa que está cobrando:
          </div>

          {/* Opção Digitar Número */}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Ex: 61999998888 (com DDD)"
              value={manualPhone}
              onChange={(e) => setManualPhone(e.target.value)}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid var(--line)',
                background: 'rgba(0,0,0,0.4)',
                color: '#fff',
                fontSize: 13
              }}
            />
            <button
              type="button"
              onClick={handleSetManualPhone}
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                border: 'none',
                background: 'var(--teal)',
                color: '#081018',
                fontWeight: 900,
                fontSize: 12.5,
                cursor: 'pointer'
              }}
            >
              Definir
            </button>
          </div>

          {/* Conversas Recentes do WhatsApp */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink1)' }}>Ou selecione das conversas ativas:</span>
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
              placeholder="Filtrar por nome ou número..."
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 12px',
                borderRadius: 8,
                border: '1px solid var(--line)',
                background: 'rgba(0,0,0,0.3)',
                color: '#fff',
                fontSize: 12,
                marginBottom: 8
              }}
            />

            <div style={{
              maxHeight: 140,
              overflowY: 'auto',
              borderRadius: 8,
              border: '1px solid var(--line)',
              background: 'rgba(0,0,0,0.2)'
            }}>
              {chats.length === 0 ? (
                <div style={{ padding: 12, textAlign: 'center', fontSize: 12, color: 'var(--ink2)' }}>
                  {connStatus?.connected ? 'Nenhuma conversa individual encontrada.' : 'Conecte o WhatsApp no botão acima para listar conversas.'}
                </div>
              ) : (
                chats
                  .filter(c => {
                    const q = contactSearch.toLowerCase();
                    const name = (c.name || c.pushName || c.subject || '').toLowerCase();
                    const jid = (c.id || c.remoteJid || '').toLowerCase();
                    return name.includes(q) || jid.includes(q);
                  })
                  .slice(0, 20)
                  .map(c => {
                    const rawJid = c.id || c.remoteJid || '';
                    const clean = extractCleanPhone(rawJid);
                    const isSel = selectedContact?.jid === rawJid;
                    return (
                      <div
                        key={rawJid}
                        onClick={() => handleSelectChat(c)}
                        style={{
                          padding: '8px 12px',
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                          cursor: 'pointer',
                          background: isSel ? 'rgba(0, 229, 155, 0.2)' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: 12
                        }}
                      >
                        <span style={{ fontWeight: isSel ? 900 : 600, color: isSel ? 'var(--teal)' : '#fff' }}>
                          {c.name || c.pushName || clean || 'Contato'}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--ink2)' }}>{clean}</span>
                      </div>
                    );
                  })
              )}
            </div>
          </div>

          {/* Contato Selecionado */}
          {selectedContact && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 10,
              background: 'rgba(0, 229, 155, 0.1)',
              border: '1px solid var(--teal)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--teal)', fontWeight: 800 }}>CONTATO SELECIONADO:</div>
                <div style={{ fontSize: 13.5, fontWeight: 900, color: '#fff' }}>{selectedContact.name}</div>
                <div style={{ fontSize: 12, color: 'var(--ink2)' }}>{selectedContact.phone}</div>
              </div>
              <span style={{ fontSize: 20 }}>✅</span>
            </div>
          )}
        </div>

        {/* PASSO 2: CONDIÇÕES DE EMPRÉSTIMO & CARTÃO (COM BOTÕES MANUAL VS AUTOMÁTICO) */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.9)',
          border: '1px solid var(--line)',
          borderRadius: 16,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 14
        }}>
          {/* TÍTULO E BOTÕES MANUAL / AUTOMÁTICO */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>⚙️</span> Passo 2: Condições de Empréstimo & Cartão
            </div>

            {/* SELETOR DE MODO: MANUAL VS AUTOMÁTICO */}
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
                onClick={() => setStep2Mode('manual')}
                style={{
                  padding: '6px 14px',
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
                <span>📝</span> Manual
              </button>

              <button
                type="button"
                onClick={() => setStep2Mode('auto')}
                style={{
                  padding: '6px 14px',
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
                <span>🤖</span> Automático (IA)
              </button>
            </div>
          </div>

          {/* ────────────────── ABA MANUAL ────────────────── */}
          {step2Mode === 'manual' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--ink2)' }}>
                  Cadastre manualmente os empréstimos e despesas no cartão com juros:
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setConditionForm(prev => ({ ...prev, type: 'loan', monthlyRate: prev.monthlyRate === '5' ? '10' : prev.monthlyRate }))}
                      style={{
                        padding: '7px 10px',
                        borderRadius: 8,
                        border: conditionForm.type === 'loan' ? '1px solid var(--teal)' : '1px solid var(--line)',
                        background: conditionForm.type === 'loan' ? 'rgba(0, 229, 155, 0.18)' : 'rgba(255,255,255,0.03)',
                        color: conditionForm.type === 'loan' ? 'var(--teal)' : 'var(--ink2)',
                        fontWeight: 800,
                        fontSize: 11.5,
                        cursor: 'pointer'
                      }}
                    >
                      💵 Empréstimo Dinheiro (PIX)
                    </button>

                    <button
                      type="button"
                      onClick={() => setConditionForm(prev => ({ ...prev, type: 'credit_card', monthlyRate: prev.monthlyRate === '10' ? '5' : prev.monthlyRate }))}
                      style={{
                        padding: '7px 10px',
                        borderRadius: 8,
                        border: conditionForm.type === 'credit_card' ? '1px solid #38BDF8' : '1px solid var(--line)',
                        background: conditionForm.type === 'credit_card' ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255,255,255,0.03)',
                        color: conditionForm.type === 'credit_card' ? '#38BDF8' : 'var(--ink2)',
                        fontWeight: 800,
                        fontSize: 11.5,
                        cursor: 'pointer'
                      }}
                    >
                      💳 Cartão de Crédito (5%)
                    </button>
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
                        placeholder={conditionForm.type === 'credit_card' ? 'Ex: Compra Mercado' : 'Ex: Empréstimo 1'}
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
                    <div style={{ fontSize: 10, color: 'var(--ink2)', fontWeight: 700 }}>💵 DINHEIRO / PIX:</div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--teal)' }}>
                      R$ {debtConditions.filter(c => c.type !== 'credit_card').reduce((sum, c) => sum + c.amount, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 10, color: 'var(--ink2)', fontWeight: 700 }}>💳 CARTÃO (5% a.m.):</div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: '#38BDF8' }}>
                      R$ {debtConditions.filter(c => c.type === 'credit_card').reduce((sum, c) => sum + c.amount, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 10, color: 'var(--ink2)', fontWeight: 700 }}>💰 TOTAL CONTRATADO:</div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: '#fff' }}>
                      R$ {debtConditions.reduce((sum, c) => sum + c.amount, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              )}

              {/* LISTA MANUAL DE ITENS */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
                {debtConditions.length === 0 ? (
                  <div style={{ padding: 14, textAlign: 'center', borderRadius: 10, background: 'rgba(0,0,0,0.2)', border: '1px dashed var(--line)' }}>
                    <div style={{ fontSize: 12, color: 'var(--ink2)' }}>Nenhum empréstimo ou gasto cadastrado no modo manual.</div>
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
                    const isCard = cond.type === 'credit_card';
                    return (
                      <div
                        key={cond.id || idx}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 10,
                          background: isCard ? 'rgba(56, 189, 248, 0.08)' : 'rgba(0, 229, 155, 0.08)',
                          border: `1px solid ${isCard ? 'rgba(56, 189, 248, 0.3)' : 'rgba(0, 229, 155, 0.3)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 16 }}>{isCard ? '💳' : '💵'}</span>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 9.5, fontWeight: 900, padding: '2px 5px', borderRadius: 4, background: isCard ? '#38BDF8' : 'var(--teal)', color: '#081018' }}>
                                {isCard ? 'CARTÃO DE CRÉDITO' : 'EMPRÉSTIMO'}
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

          {/* ────────────────── ABA AUTOMÁTICA (IA & ROBÔ) ────────────────── */}
          {step2Mode === 'auto' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{
                padding: 12,
                borderRadius: 10,
                background: 'rgba(56, 189, 248, 0.1)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                fontSize: 12,
                color: '#fff',
                lineHeight: 1.5
              }}>
                🤖 <strong>Detecção 100% Automática por Inteligência Artificial:</strong><br />
                O robô examina todo o histórico de conversas, transcreve os áudios e inspeciona os prints para descobrir automaticamente
                cada empréstimo tomado e cada gasto feito no cartão de crédito com a taxa de 5% ao mês!
              </div>

              {/* Botão de Varredura Automática Prévia */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 11.5, color: 'var(--ink2)' }}>
                  {autoDetectedDebts.length > 0 ? `${autoDetectedDebts.length} débitos identificados pela IA:` : 'Clique para escanear antecipadamente:'}
                </span>

                <button
                  type="button"
                  onClick={handleAutoScanDebts}
                  disabled={isScanningAuto}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 14px',
                    borderRadius: 8,
                    background: isScanningAuto ? 'rgba(255,255,255,0.2)' : 'linear-gradient(135deg, #38BDF8, #0284C7)',
                    color: '#081018',
                    fontWeight: 900,
                    fontSize: 12,
                    border: 'none',
                    cursor: isScanningAuto ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isScanningAuto ? '⏳ Escaneando com IA...' : '⚡ Escanear Débitos com IA'}
                </button>
              </div>

              {/* TOTAIS IDENTIFICADOS AUTOMATICAMENTE */}
              {autoDetectedDebts.length > 0 && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: 8,
                  padding: 10,
                  borderRadius: 10,
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(56, 189, 248, 0.3)'
                }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--ink2)', fontWeight: 700 }}>💵 EMPRÉSTIMOS (IA):</div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--teal)' }}>
                      R$ {autoDetectedDebts.filter(c => c.type !== 'credit_card').reduce((sum, c) => sum + c.amount, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 10, color: 'var(--ink2)', fontWeight: 700 }}>💳 CARTÃO 5% (IA):</div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: '#38BDF8' }}>
                      R$ {autoDetectedDebts.filter(c => c.type === 'credit_card').reduce((sum, c) => sum + c.amount, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 10, color: 'var(--ink2)', fontWeight: 700 }}>💰 TOTAL IDENTIFICADO:</div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: '#fff' }}>
                      R$ {autoDetectedDebts.reduce((sum, c) => sum + c.amount, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              )}

              {/* LISTA AUTOMÁTICA DE ITENS IDENTIFICADOS */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
                {autoDetectedDebts.length === 0 ? (
                  <div style={{ padding: 14, textAlign: 'center', borderRadius: 10, background: 'rgba(0,0,0,0.2)', border: '1px dashed var(--line)' }}>
                    <div style={{ fontSize: 12, color: 'var(--ink2)' }}>
                      Nenhum débito escaneado ainda. Clique no botão acima para escanear ou clique diretamente em "Iniciar Perícia" que o robô fará tudo na hora.
                    </div>
                  </div>
                ) : (
                  autoDetectedDebts.map((cond, idx) => {
                    const isCard = cond.type === 'credit_card';
                    return (
                      <div
                        key={cond.id || idx}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 10,
                          background: isCard ? 'rgba(56, 189, 248, 0.08)' : 'rgba(0, 229, 155, 0.08)',
                          border: `1px solid ${isCard ? 'rgba(56, 189, 248, 0.3)' : 'rgba(0, 229, 155, 0.3)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 16 }}>{isCard ? '💳' : '💵'}</span>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 9.5, fontWeight: 900, padding: '2px 5px', borderRadius: 4, background: isCard ? '#38BDF8' : 'var(--teal)', color: '#081018' }}>
                                {isCard ? 'CARTÃO DE CRÉDITO' : 'EMPRÉSTIMO'}
                              </span>
                              <span style={{ fontSize: 12.5, fontWeight: 900, color: '#fff' }}>
                                R$ {cond.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div style={{ fontSize: 10.5, color: 'var(--ink2)', marginTop: 2 }}>
                              📅 {cond.date} | ⚡ <strong>{cond.monthlyRate}% a.m.</strong> | {cond.description}
                            </div>
                            {cond.evidence && (
                              <div style={{ fontSize: 10, color: '#38BDF8', fontStyle: 'italic', marginTop: 1 }}>
                                Evidência: "{cond.evidence}"
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setAutoDetectedDebts(prev => prev.filter(c => c.id !== cond.id))}
                          style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 13 }}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
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
        </div>
      </div>

      {/* BLOCO: PASSO 3 (UPLOAD DE COMPROVANTES DE PAGAMENTO + BACKUP DE CONVERSA) */}
      <div style={{
        background: 'rgba(15, 23, 42, 0.9)',
        border: '1px solid var(--line)',
        borderRadius: 16,
        padding: 22,
        display: 'flex',
        flexDirection: 'column',
        gap: 16
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🧾</span> Passo 3: Anexar Comprovantes de Pagamento (PIX, TED, Recibos)
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
            {/* Card 1: Total Emprestado & Cartão */}
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
                💵 Dinheiro: R$ {(auditResult.totalEmprestimosDinheiro || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | 💳 Cartão 5%: R$ {(auditResult.totalGastosCartao || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
                <span>📄</span> Baixar Diálogo & Áudios (.txt)
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

            {/* ABA 2: DIÁLOGO COMPLETO & TRANSCRIÇÕES DOS ÁUDIOS */}
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
                      onClick={() => setDialogFilter('financial')}
                      style={{
                        padding: '5px 10px',
                        borderRadius: 6,
                        border: 'none',
                        fontSize: 11.5,
                        fontWeight: 700,
                        background: dialogFilter === 'financial' ? '#F59E0B' : 'rgba(255,255,255,0.06)',
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
                              : 'linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95))',
                            border: `1px solid ${isMe ? 'rgba(0, 229, 155, 0.35)' : isAudio ? 'rgba(56, 189, 248, 0.4)' : 'rgba(255,255,255,0.1)'}`,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 800, color: isMe ? 'var(--teal)' : '#fff' }}>
                                {item.sender}
                              </span>
                              <span style={{
                                fontSize: 10,
                                fontWeight: 800,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: isAudio ? '#38BDF8' : 'rgba(255,255,255,0.08)',
                                color: isAudio ? '#081018' : 'var(--ink2)'
                              }}>
                                {item.mediaTypeLabel}
                              </span>
                            </div>
                            <span style={{ fontSize: 10.5, color: 'var(--ink2)' }}>
                              {item.dateTime || item.date}
                            </span>
                          </div>

                          <div style={{
                            fontSize: 13,
                            color: isAudio ? '#E0F2FE' : '#fff',
                            fontStyle: isAudio ? 'italic' : 'normal',
                            lineHeight: 1.5,
                            wordBreak: 'break-word'
                          }}>
                            {isAudio ? `"${item.content}"` : item.content}
                          </div>

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
          </div>
        </div>
      )}

    </div>
  );
}
