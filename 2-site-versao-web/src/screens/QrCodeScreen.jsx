import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { fetchAppSettings, fetchTotalUsersCount, updateAppSettings } from '../lib/api';
import TopBar from '../components/TopBar';

export default function QrCodeScreen({ profile }) {
  const isAdmin = profile.role === 'admin' || profile.role === 'admin2';
  const [appDomain, setAppDomain] = useState('amigosdrcandido.com.br');
  const [totalUsers, setTotalUsers] = useState(0);
  const [settings, setSettings] = useState(null);

  // Estados para o editor de template (apenas Admins)
  const [qrX, setQrX] = useState(10);
  const [qrY, setQrY] = useState(10);
  const [qrSize, setQrSize] = useState(20);
  const [templateUrl, setTemplateUrl] = useState('');
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // Refs para controle de arrastar (drag and drop)
  const containerRef = useRef(null);
  const isDragging = useRef(false);
  const startOffset = useRef({ x: 0, y: 0 });

  const referralLink = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? `${window.location.origin}/${profile.username || profile.id}`
    : `https://${appDomain}/${profile.username || profile.id}`;

  const loadData = async () => {
    try {
      const [appSettings, count] = await Promise.all([fetchAppSettings(), fetchTotalUsersCount()]);
      if (appSettings) {
        setAppDomain(appSettings.app_domain);
        setSettings(appSettings);
        
        // Preenche o estado do editor com os dados salvos
        setQrX(appSettings.card_qr_x || 10);
        setQrY(appSettings.card_qr_y || 10);
        setQrSize(appSettings.card_qr_size || 20);
        setTemplateUrl(appSettings.card_template_url || '');
      }
      setTotalUsers(count);
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  async function handleCopyLink() {
    await navigator.clipboard.writeText(referralLink);
    alert('Link de indicação copiado!');
  }

  // Lógica de upload do template de cartão (Admin apenas)
  async function handleTemplateUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingTemplate(true);
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      const path = `templates/card_template_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, {
        upsert: true,
        contentType: file.type || 'image/jpeg'
      });
      if (uploadError) {
        alert('Erro ao enviar template: ' + uploadError.message);
        return;
      }
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      setTemplateUrl(pub.publicUrl);
    } catch (err) {
      alert('Erro inesperado: ' + err.message);
    } finally {
      setUploadingTemplate(false);
    }
  }

  // Lógica para salvar configuração do layout (Admin apenas)
  async function saveCardTemplate() {
    setSavingSettings(true);
    try {
      await updateAppSettings({
        card_template_url: templateUrl,
        card_qr_x: qrX,
        card_qr_y: qrY,
        card_qr_size: qrSize
      });
      alert('Layout do cartão de visitas 9x16 salvo com sucesso!');
      await loadData();
    } catch (err) {
      alert('Erro ao salvar layout: ' + err.message);
    } finally {
      setSavingSettings(false);
    }
  }

  // Lógica de deletar o template atual (Admin apenas)
  async function handleDeleteTemplate() {
    if (!window.confirm('Tem certeza que deseja excluir o template de cartão de visitas atual? Todos os membros voltarão a ver apenas o QR Code simples.')) return;
    try {
      await updateAppSettings({
        card_template_url: null,
        card_qr_x: 10,
        card_qr_y: 10,
        card_qr_size: 20
      });
      alert('Template excluído com sucesso!');
      setTemplateUrl('');
      await loadData();
    } catch (err) {
      alert('Erro ao excluir template: ' + err.message);
    }
  }

  // Lógica de arrastar para posicionar (Admin apenas)
  function handleMouseDown(e) {
    if (!isAdmin || !containerRef.current) return;
    isDragging.current = true;
    const qrRect = e.currentTarget.getBoundingClientRect();
    startOffset.current = {
      x: e.clientX - qrRect.left,
      y: e.clientY - qrRect.top
    };
    e.preventDefault();
  }

  useEffect(() => {
    if (!isAdmin) return;

    function handleMouseMove(e) {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      
      let xPx = e.clientX - rect.left - startOffset.current.x;
      let yPx = e.clientY - rect.top - startOffset.current.y;
      
      let xPct = (xPx / rect.width) * 100;
      let yPct = (yPx / rect.height) * 100;
      
      const qrHeightPct = qrSize * 9 / 16;
      xPct = Math.max(0, Math.min(100 - qrSize, xPct));
      yPct = Math.max(0, Math.min(100 - qrHeightPct, yPct));
      
      setQrX(Math.round(xPct));
      setQrY(Math.round(yPct));
    }

    function handleMouseUp() {
      isDragging.current = false;
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [qrSize, isAdmin]);

  function handlePrintCard() {
    const cardUrl = settings?.card_template_url || templateUrl;
    if (!cardUrl) return;
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    
    // QR Code preto e branco para legibilidade ideal na impressão
    const printQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&color=000000&bgcolor=ffffff&data=${encodeURIComponent(referralLink)}`;
    const actualQrSize = settings?.card_qr_size || qrSize;
    const qrHeightPct = actualQrSize * 9 / 16;

    printWindow.document.write(`
      <html>
        <head>
          <title>Cartão de Visitas - ${profile.name}</title>
          <style>
            @page {
              size: 90mm 160mm;
              margin: 0;
            }
            body {
              margin: 0;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              background-color: #fff;
              font-family: sans-serif;
            }
            .card-container {
              position: relative;
              width: 90mm;
              height: 160mm;
              box-sizing: border-box;
              overflow: hidden;
              background-image: url('${cardUrl}');
              background-size: cover;
              background-position: center;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .qr-code {
              position: absolute;
              left: ${isAdmin ? qrX : settings?.card_qr_x || 10}%;
              top: ${isAdmin ? qrY : settings?.card_qr_y || 10}%;
              width: ${actualQrSize}%;
              height: ${qrHeightPct}%;
            }
            @media print {
              body {
                background: none;
              }
              .card-container {
                width: 90mm;
                height: 160mm;
                border: none;
              }
            }
          </style>
        </head>
        <body>
          <div class="card-container">
            <img class="qr-code" src="${printQrUrl}" alt="QR Code" />
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                window.close();
              }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&color=00f2fe&bgcolor=090d16&data=${encodeURIComponent(referralLink)}`;
  const qrHeightPct = qrSize * 9 / 16;

  return (
    <div className="screen">
      <TopBar totalUsers={totalUsers} />
      
      <div className="content" style={{ padding: '24px 16px', textAlign: 'center', overflowY: 'auto', height: 'calc(100vh - 120px)' }}>
        
        {/* PARTE SUPERIOR (Apenas Admin): Painel de Criação e Configuração */}
        {isAdmin && (
          <div className="card" style={{ 
            padding: '20px 16px', 
            background: 'linear-gradient(135deg, rgba(22, 28, 44, 0.95), rgba(13, 17, 28, 0.98))', 
            border: '1.5px solid rgba(0, 242, 254, 0.15)', 
            boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)', 
            borderRadius: 16,
            maxWidth: '400px',
            margin: '0 auto 24px auto',
            textAlign: 'left'
          }}>
            <h3 style={{ fontSize: 16, color: 'var(--teal)', fontWeight: 700, marginTop: 0, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              ⚙️ Criar / Editar Template 9x16
            </h3>
            <p style={{ color: 'var(--ink2)', fontSize: 12, marginBottom: 14 }}>
              Envie um fundo 9x16. Arraste o QR Code vermelho para posicioná-lo.
            </p>

            <div style={{ display: 'flex', gap: '8px', marginBottom: 12 }}>
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleTemplateUpload} 
                style={{ display: 'none' }} 
                id="template-upload-input-qr" 
              />
              <button 
                type="button" 
                className="btn btn-ghost" 
                style={{ margin: 0, width: '100%', fontSize: 12, padding: '10px' }}
                onClick={() => document.getElementById('template-upload-input-qr').click()}
                disabled={uploadingTemplate}
              >
                {uploadingTemplate ? 'Enviando...' : '📷 Escolher Imagem (Fundo)'}
              </button>
              
              {templateUrl && (
                <button 
                  type="button" 
                  className="btn btn-ghost" 
                  style={{ margin: 0, width: 'auto', color: 'var(--warn)', fontSize: 12, padding: '10px' }}
                  onClick={() => setTemplateUrl('')}
                >
                  Limpar
                </button>
              )}
            </div>

            {/* Botão de Deletar do Banco se o template já estiver salvo */}
            {settings?.card_template_url && (
              <button 
                type="button" 
                className="btn btn-ghost" 
                style={{ width: '100%', color: 'var(--warn)', fontSize: '11px', marginBottom: 12, border: '1px dashed rgba(255, 59, 48, 0.3)', padding: '6px 10px', margin: '0 0 12px 0' }}
                onClick={handleDeleteTemplate}
              >
                🗑️ Deletar Template Atual do Banco
              </button>
            )}

            {templateUrl && (
              <div>
                {/* Container de Arraste (Visualização em 9:16) */}
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
                  <div 
                    ref={containerRef}
                    style={{
                      position: 'relative',
                      width: '100%',
                      maxWidth: '200px',
                      aspectRatio: '9/16',
                      backgroundImage: `url(${templateUrl})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      borderRadius: '8px',
                      border: '1.5px solid rgba(0, 242, 254, 0.3)',
                      overflow: 'hidden',
                      userSelect: 'none'
                    }}
                  >
                    {/* QR Code Overlay (Mantido Perfeitamente Quadrado via proporção 9/16 da altura) */}
                    <div 
                      onMouseDown={handleMouseDown}
                      style={{
                        position: 'absolute',
                        left: `${qrX}%`,
                        top: `${qrY}%`,
                        width: `${qrSize}%`,
                        height: `${qrHeightPct}%`,
                        border: '2px solid #FF3B30',
                        background: 'rgba(255, 59, 48, 0.25)',
                        cursor: 'move',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: '9px',
                        fontWeight: 700,
                        textAlign: 'center',
                        boxSizing: 'border-box'
                      }}
                    >
                      QR
                    </div>
                  </div>
                </div>

                {/* Sliders de Ajuste */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--ink2)' }}>
                    <span>Horizontal (X): {qrX}%</span>
                    <input 
                      type="range" 
                      min="0" 
                      max={100 - qrSize} 
                      value={qrX} 
                      onChange={(e) => setQrX(parseInt(e.target.value))} 
                      style={{ width: '65%' }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--ink2)' }}>
                    <span>Vertical (Y): {qrY}%</span>
                    <input 
                      type="range" 
                      min="0" 
                      max={100 - Math.round(qrHeightPct)} 
                      value={qrY} 
                      onChange={(e) => setQrY(parseInt(e.target.value))} 
                      style={{ width: '65%' }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--ink2)' }}>
                    <span>Tamanho: {qrSize}%</span>
                    <input 
                      type="range" 
                      min="5" 
                      max="50" 
                      value={qrSize} 
                      onChange={(e) => setQrSize(parseInt(e.target.value))} 
                      style={{ width: '65%' }}
                    />
                  </div>
                </div>

                <button 
                  className="btn btn-teal" 
                  style={{ width: '100%', margin: 0 }}
                  onClick={saveCardTemplate}
                  disabled={savingSettings}
                >
                  {savingSettings ? 'Salvando Layout...' : 'Salvar Layout'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* PARTE INFERIOR: Visualização do Cartão Pronto (Todos) / QR Code de Indicação */}
        {settings?.card_template_url ? (
          /* CARTÃO DE VISITAS PRONTO (Exibição em 9:16) */
          <div className="card" style={{
            padding: '20px 16px',
            background: 'linear-gradient(135deg, rgba(22, 28, 44, 0.95), rgba(13, 17, 28, 0.98))',
            border: '1.5px solid rgba(0, 242, 254, 0.12)',
            boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
            borderRadius: 16,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            maxWidth: '400px',
            margin: '0 auto 40px auto'
          }}>
            <h3 style={{ fontSize: 16, color: '#fff', fontWeight: 700, margin: 0 }}>Seu Cartão de Visitas</h3>
            
            <div style={{
              position: 'relative',
              width: '100%',
              maxWidth: '220px',
              aspectRatio: '9/16',
              backgroundImage: `url(${settings.card_template_url})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
              overflow: 'hidden',
              margin: '0 auto'
            }}>
              {/* QR Code mantido perfeitamente quadrado aplicando a proporção 9/16 na altura */}
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&color=000000&bgcolor=ffffff&data=${encodeURIComponent(referralLink)}`}
                alt="QR Code"
                style={{
                  position: 'absolute',
                  left: `${settings.card_qr_x}%`,
                  top: `${settings.card_qr_y}%`,
                  width: `${settings.card_qr_size}%`,
                  height: `${settings.card_qr_size * 9 / 16}%`
                }}
              />
            </div>

            <div style={{ width: '100%', textAlign: 'left' }}>
              <div style={{ fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, fontWeight: 700 }}>
                Link de Indicação:
              </div>
              <div 
                onClick={handleCopyLink}
                style={{
                  background: 'rgba(0, 242, 254, 0.03)',
                  border: '1px solid rgba(0, 242, 254, 0.2)',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  color: 'var(--teal)',
                  fontFamily: 'var(--mono)',
                  fontSize: '12px',
                  wordBreak: 'break-all',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8
                }}
              >
                <span style={{ flex: 1 }}>{referralLink}</span>
                <span style={{ fontSize: 16 }}>📋</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
              <a 
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Venha fazer parte do Amigos Dr. Cândido! Cadastre-se pelo meu link de indicação: ${referralLink}`)}`}
                target="_blank" 
                rel="noreferrer"
                className="btn"
                style={{ 
                  flex: 1, 
                  backgroundColor: '#25D366', 
                  color: '#fff', 
                  fontWeight: 700, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: 6,
                  padding: '12px 10px',
                  fontSize: '13px',
                  textDecoration: 'none',
                  borderRadius: '10px',
                  border: 'none',
                  margin: 0
                }}
              >
                <span>WhatsApp</span>
              </a>

              <button 
                onClick={handlePrintCard}
                className="btn btn-teal"
                style={{ flex: 1.2, margin: 0, fontSize: '13px', fontWeight: 700 }}
              >
                🖨️ Imprimir / PDF
              </button>
            </div>
          </div>
        ) : (
          /* FALLBACK: Mostra QR Code simples se nenhum template de cartão estiver configurado */
          <div className="card" style={{ 
            padding: '24px 16px', 
            background: 'linear-gradient(135deg, rgba(22, 28, 44, 0.95), rgba(13, 17, 28, 0.98))', 
            border: '1.5px solid rgba(0, 242, 254, 0.12)', 
            boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)', 
            borderRadius: 16,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
            maxWidth: '400px',
            margin: '0 auto 40px auto'
          }}>
            <h3 style={{ fontSize: 16, color: '#fff', fontWeight: 700, margin: 0 }}>Seu Código QR</h3>
            
            <div style={{ 
              background: '#090d16', 
              padding: '12px', 
              borderRadius: '16px', 
              border: '1.5px solid rgba(0, 242, 254, 0.25)',
              boxShadow: '0 0 20px rgba(0, 242, 254, 0.1)',
              display: 'inline-block'
            }}>
              <img 
                src={qrCodeUrl}
                alt="QR Code de Indicação" 
                style={{ width: '180px', height: '180px', display: 'block', borderRadius: '8px' }} 
              />
            </div>

            <div style={{ width: '100%' }}>
              <div style={{ fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, fontWeight: 700, textAlign: 'left' }}>
                Link de Indicação Direta:
              </div>
              <div 
                onClick={handleCopyLink}
                style={{
                  background: 'rgba(0, 242, 254, 0.03)',
                  border: '1px solid rgba(0, 242, 254, 0.2)',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  color: 'var(--teal)',
                  fontFamily: 'var(--mono)',
                  fontSize: '12.5px',
                  wordBreak: 'break-all',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8
                }}
              >
                <span style={{ flex: 1, textAlign: 'left' }}>{referralLink}</span>
                <span style={{ fontSize: 16 }}>📋</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginTop: '4px' }}>
              <a 
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Venha fazer parte do Amigos Dr. Cândido! Cadastre-se pelo meu link de indicação: ${referralLink}`)}`}
                target="_blank" 
                rel="noreferrer"
                className="btn"
                style={{ 
                  width: '100%', 
                  backgroundColor: '#25D366', 
                  color: '#fff', 
                  fontWeight: 700, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: 6,
                  padding: '12px 10px',
                  fontSize: '13px',
                  textDecoration: 'none',
                  borderRadius: '10px',
                  border: 'none',
                  margin: 0
                }}
              >
                <svg viewBox="0 0 448 512" width="16" height="16" fill="#fff" style={{ flexShrink: 0 }}>
                  <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-117zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
                </svg>
                <span>WhatsApp</span>
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
