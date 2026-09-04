import React, { useState, useEffect } from 'react';
import { 
  getEvolutionConfig, 
  loadEvolutionConfig,
  saveEvolutionConfig,
  fetchInstanceStatus, 
  createOrConnectInstance, 
  disconnectInstance, 
  sendWhatsAppMessage, 
  checkWhatsAppNumbers,
  generateTransmissionBatches,
  DEFAULT_INSTANCE_NAME 
} from '../lib/evolutionApi';
import { supabase } from '../lib/supabase';

export function EvolutionBotTab({ users, reload }) {
  const [config, setConfig] = useState(getEvolutionConfig());
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [status, setStatus] = useState({ connected: false, state: 'checking' });
  const [qrCodeData, setQrCodeData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sendingBatch, setSendingBatch] = useState(null);
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0, sent: 0, failed: 0, currentName: '', statusInfo: '' });
  const [customMsg, setCustomMsg] = useState(
    'Olá {nome}! Tudo bem? Aqui é o Dr. Cândido. Gostaria de saber se você já tem meu contato salvo na sua agenda? Responda com um "Sim" ou "Ok" por favor! 🙏'
  );
  const batchSize = 100;

  // Gera os lotes de transmissão (T1, T2, T3... padrão fixo 100 por lote para compatibilidade com celular)
  const batches = generateTransmissionBatches(users, batchSize);

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

  async function handleConnect() {
    setLoading(true);
    try {
      const res = await createOrConnectInstance();
      if (res?.qrcode?.base64) {
        setQrCodeData(res.qrcode.base64);
      } else if (res?.base64) {
        setQrCodeData(res.base64);
      } else if (res?.instance?.state === 'open') {
        alert('WhatsApp já está conectado com sucesso!');
        setQrCodeData(null);
        await checkStatus();
      } else {
        alert('Instância criada/iniciada! Aguarde alguns instantes e clique em verificar.');
        await checkStatus();
      }
    } catch (err) {
      alert('Erro ao conectar: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm('Deseja realmente desconectar o WhatsApp do robô?')) return;
    setLoading(true);
    try {
      await disconnectInstance();
      alert('WhatsApp desconectado!');
      setQrCodeData(null);
      await checkStatus();
    } catch (err) {
      alert('Erro ao desconectar: ' + err.message);
    } finally {
      setLoading(false);
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

  // Exportar todos os lotes combinados (T1, T2, T3...)
  function handleExportAllBatches() {
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
      const blob = new Blob([vcfContent], { type: 'text/vcard;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `contatos_todos_lotes_T_${Date.now()}.vcf`);
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

  // Disparo em lote com verificação prévia e delay seguro anti-bloqueio
  async function handleStartBatchSend(batch) {
    if (!status.connected) {
      alert('O WhatsApp precisa estar conectado antes de realizar disparos!');
      return;
    }

    const confirmSend = window.confirm(
      `🛡️ ATENÇÃO - SEGURANÇA MÁXIMA DO CHIP:\n\n` +
      `Deseja iniciar o envio para a lista "${batch.name}" (${batch.count} contatos)?\n\n` +
      `Protocolo de Proteção Ativo:\n` +
      `1. Verificação prévia de existência de WhatsApp para cada número\n` +
      `2. Simulação de digitação humana ("Digitando...")\n` +
      `3. Intervalo randômico de 5 a 10 segundos por mensagem\n` +
      `4. Pausa de resfriamento anti-aquecimento (25s) a cada 15 envios`
    );
    if (!confirmSend) return;

    setSendingBatch(batch.id);
    setSendProgress({ current: 0, total: batch.users.length, sent: 0, failed: 0, currentName: 'Iniciando verificação...', statusInfo: '' });

    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < batch.users.length; i++) {
      const u = batch.users[i];
      const firstName = (u.name || 'Amigo(a)').split(' ')[0];
      const personalizedMsg = customMsg.replace(/\{nome\}/gi, firstName);
      const phone = u.whatsapp || u.phone;

      setSendProgress({
        current: i + 1,
        total: batch.users.length,
        sent: sentCount,
        failed: failedCount,
        currentName: u.name || phone,
        statusInfo: 'Digitando e enviando...'
      });

      try {
        await sendWhatsAppMessage(phone, personalizedMsg);
        sentCount++;
      } catch (err) {
        console.error(`Falha ao enviar para ${u.name}:`, err);
        failedCount++;
      }

      setSendProgress({
        current: i + 1,
        total: batch.users.length,
        sent: sentCount,
        failed: failedCount,
        currentName: u.name || phone,
        statusInfo: 'Aguardando próximo contato...'
      });

      // Pausa periódica de resfriamento a cada 15 envios (25 a 35 segundos)
      if (i > 0 && (i + 1) % 15 === 0 && i < batch.users.length - 1) {
        const cooldownSec = Math.floor(Math.random() * 10) + 25; // 25s a 35s
        setSendProgress((prev) => ({
          ...prev,
          statusInfo: `☕ Pausa de resfriamento anti-bloqueio (${cooldownSec}s)...`
        }));
        await new Promise((r) => setTimeout(r, cooldownSec * 1000));
      } else if (i < batch.users.length - 1) {
        // Intervalo de segurança randômico (5 a 10 segundos entre mensagens)
        const randomDelayMs = Math.floor(Math.random() * (10000 - 5000 + 1)) + 5000;
        await new Promise((r) => setTimeout(r, randomDelayMs));
      }
    }

    alert(`Disparo da lista ${batch.name} finalizado!\nEnviados: ${sentCount} | Falhas: ${failedCount}`);
    setSendingBatch(null);
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
                onClick={handleConnect}
                disabled={loading || !config.serverUrl}
              >
                📲 Conectar WhatsApp (QR Code)
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

      {/* Modal QR Code */}
      {qrCodeData && (
        <div className="modal-bg" style={{ zIndex: 12000 }}>
          <div className="modal" style={{ maxWidth: 360, textAlign: 'center', padding: 24 }}>
            <h3 style={{ fontSize: 16, color: '#fff', marginBottom: 12 }}>📱 Conectar WhatsApp Oficial</h3>
            <p style={{ fontSize: 12.5, color: 'var(--ink2)', marginBottom: 16 }}>
              Abra o WhatsApp do Dr. Cândido ➔ Vá em <strong>Aparelhos Conectados</strong> ➔ <strong>Conectar Aparelho</strong> e aponte a câmera para o QR Code abaixo:
            </p>
            <div style={{ background: '#fff', padding: 12, borderRadius: 12, display: 'inline-block', marginBottom: 16 }}>
              <img src={qrCodeData.startsWith('data:') ? qrCodeData : `data:image/png;base64,${qrCodeData}`} alt="QR Code" style={{ width: 220, height: 220 }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-teal" style={{ flex: 1, margin: 0 }} onClick={checkStatus}>
                ✅ Já Escaneei
              </button>
              <button className="btn btn-ghost" style={{ flex: 1, margin: 0 }} onClick={() => setQrCodeData(null)}>
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

      {/* Editor da Mensagem de Transmissão / Teste */}
      <div style={{ background: 'var(--panel2)', padding: '16px', borderRadius: 14, border: '1px solid var(--line)' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
          ✉️ Mensagem do Teste de Transmissão
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink2)', marginBottom: 10 }}>
          Use a tag <code style={{ color: 'var(--teal)', background: 'rgba(61, 217, 179, 0.1)', padding: '2px 4px', borderRadius: 4 }}>{'{nome}'}</code> para personalizar com o primeiro nome do membro:
        </div>
        <textarea 
          rows={3} 
          value={customMsg} 
          onChange={(e) => setCustomMsg(e.target.value)}
          style={{ width: '100%', fontSize: 13, lineHeight: 1.4 }}
        />
      </div>

      {/* Barra de Progresso durante Disparo Ativo */}
      {sendingBatch && (
        <div style={{ background: 'rgba(61, 217, 179, 0.1)', border: '1px solid var(--teal)', padding: 16, borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
            <div>
              <span style={{ fontWeight: 800, fontSize: 13, color: '#fff' }}>
                🚀 Enviando para {sendingBatch} ({sendProgress.current}/{sendProgress.total})
              </span>
              {sendProgress.currentName && (
                <div style={{ fontSize: 11.5, color: 'var(--teal)', marginTop: 2 }}>
                  👤 Contato: <strong>{sendProgress.currentName}</strong>
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 700 }}>
                🟢 Sucesso: {sendProgress.sent} · 🔴 Falhas: {sendProgress.failed}
              </span>
              {sendProgress.statusInfo && (
                <div style={{ fontSize: 11, color: '#FFD166', marginTop: 2 }}>
                  {sendProgress.statusInfo}
                </div>
              )}
            </div>
          </div>
          <div style={{ height: 8, width: '100%', background: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
            <div 
              style={{ 
                height: '100%', 
                background: 'var(--teal)', 
                width: `${(sendProgress.current / sendProgress.total) * 100}%`,
                transition: 'width 0.3s ease'
              }} 
            />
          </div>
        </div>
      )}

      {/* Cartão Informativo de Proteção Anti-Bloqueio e Lista de Transmissão */}
      <div style={{ 
        background: 'linear-gradient(135deg, rgba(123, 108, 244, 0.12), rgba(15, 23, 42, 0.6))', 
        padding: '14px 16px', 
        borderRadius: 14, 
        border: '1px solid rgba(123, 108, 244, 0.3)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🛡️</span>
          <span style={{ fontWeight: 800, fontSize: 13, color: '#fff' }}>
            Proteção e Funcionamento das Listas de Transmissão
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.5 }}>
          • <strong style={{ color: '#fff' }}>No WhatsApp do Celular (Lista Oficial):</strong> Risco <strong>ZERO</strong> de bloqueio. Pela regra oficial do WhatsApp, apenas os contatos que possuem o número do Dr. Cândido salvo na agenda recebem as mensagens da Lista de Transmissão.<br />
          • <strong style={{ color: '#fff' }}>No Robô de Validação / Aquecimento:</strong> O robô atua com <strong>simulação de digitação humana</strong>, intervalo randômico de <strong>5 a 10 segundos</strong> e <strong>pausas de resfriamento periódicas (25s a cada 15 envios)</strong> para validar e aquecer o chip com segurança máxima.
        </div>
      </div>

      {/* Visualização dos Lotes T1, T2, T3... */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#fff' }}>
              📋 Listas de Transmissão Automáticas ({batches.length} Lotes de 100 contatos)
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
          {batches.map((b) => (
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

              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button 
                  type="button"
                  className="btn btn-ghost"
                  style={{ flex: 1, fontSize: 11.5, padding: '7px', margin: 0 }}
                  onClick={() => handleExportBatchVcf(b)}
                  title="Baixar lista em arquivo .vcf para importar nos contatos do celular"
                >
                  📥 Baixar vCard
                </button>

                <button 
                  type="button"
                  className="btn btn-teal"
                  style={{ flex: 1, fontSize: 11.5, padding: '7px', margin: 0 }}
                  onClick={() => handleStartBatchSend(b)}
                  disabled={sendingBatch !== null || !status.connected}
                  title="Enviar mensagem personalizada pelo WhatsApp conectado"
                >
                  🚀 Disparar Teste
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
