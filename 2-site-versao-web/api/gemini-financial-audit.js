export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const DEFAULT_KEY = Buffer.from('QVEuQWI4Uk42SmVKQTEtMTlITGpVTlNMakpYT1BSazhBOG5DTkhtZndaUlRfYkpYRFlVaEE=', 'base64').toString('utf-8');
  const apiKey = req.headers['x-api-key'] || process.env.VITE_GEMINI_API_KEY || DEFAULT_KEY;
  const { action, base64Data, mimeType, payload } = req.body || {};

  const candidateModels = [
    'gemini-3.8-flash',
    'gemini-flash-lite-latest',
    'gemini-3.5-flash',
    'gemini-flash-latest',
    'gemini-3.7-flash'
  ];

  async function callGemini(parts, jsonResponse = true) {
    let lastError = null;
    for (const model of candidateModels) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              ...(jsonResponse ? { responseMimeType: 'application/json' } : {}),
              temperature: 0.1
            }
          })
        });

        const data = await resp.json();
        if (!resp.ok) {
          lastError = data?.error?.message || `HTTP ${resp.status}`;
          continue;
        }

        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
          lastError = 'Resposta vazia da IA';
          continue;
        }

        return text;
      } catch (err) {
        lastError = err.message;
      }
    }
    throw new Error(`Falha nos modelos Gemini: ${lastError}`);
  }

  try {
    // ── 1. TRANSCREVER ÁUDIO DO WHATSAPP ───────────────────────────────
    if (action === 'transcribe_audio') {
      if (!base64Data) {
        return res.status(400).json({ error: 'Nenhum áudio fornecido em base64.' });
      }

      const prompt = `Você é um auditor financeiro e perito judicial forense.
Ouça com extrema atenção este áudio gravado no WhatsApp em uma negociação de cobrança/empréstimo de dinheiro a juros.
Transcreva o áudio fielmente para o português e identifique minuciosamente:
1. transcricao: transcrição completa e fidedigna das palavras faladas.
2. valores_mencionados: lista de valores em Reais (ex: 500, 1500.50) citados como cobrança, pagamento, dívida ou saldo.
3. taxa_juros_mencionada: qualquer porcentagem ou valor de juro citado (ex: "10% ao mês", "R$ 300 de juro").
4. amortizacao_mencionada: boolean (true se fala sobre abater do valor principal, adiantar parcelas, pagar parte da dívida original).
5. data_mencionada: alguma data citada para pagamento ou vencimento.
6. resumo_financeiro: explicação curta de 1 a 2 frases do que foi negociado ou exigido no áudio.

Retorne EXCLUSIVAMENTE um JSON com esta estrutura:
{
  "transcricao": "...",
  "valores_mencionados": [1000.00],
  "taxa_juros_mencionada": "...",
  "amortizacao_mencionada": false,
  "data_mencionada": "...",
  "resumo_financeiro": "..."
}`;

      const raw = await callGemini([
        { text: prompt },
        {
          inlineData: {
            mimeType: mimeType || 'audio/ogg',
            data: base64Data
          }
        }
      ], true);

      return res.status(200).json(JSON.parse(raw));
    }

    // ── 2. OCR DE COMPROVANTE / PRINT DE PAGAMENTO OU COBRANÇA ────────
    if (action === 'ocr_receipt') {
      if (!base64Data) {
        return res.status(400).json({ error: 'Nenhuma imagem fornecida em base64.' });
      }

      const prompt = `Você é um perito contábil especialista em OCR de comprovantes de pagamento (PIX, TED, DOC, Recibos) e prints de telas de cobrança no Brasil.
Analise a imagem enviada e extraia todos os dados fiscais e contábeis:
1. data_pagamento: no formato AAAA-MM-DD (ex: 2026-05-14). Se não houver ano, deduza com base no contexto.
2. valor_pago: número float (ex: 1250.00).
3. tipo_comprovante: "PIX", "TED", "DOC", "RECIBO", "EXTRATO" ou "PRINT_COBRANCA".
4. favorecido_nome: nome completo da pessoa/empresa que recebeu o valor.
5. favorecido_chave_pix_ou_banco: chave PIX, agência/conta ou banco recebedor.
6. pagador_nome: nome da pessoa que efetuou o pagamento.
7. id_transacao_ou_autenticacao: código E2E do PIX, autenticação bancária ou protocolo.
8. e_comprovante_valido: boolean (true se for comprovante legítimo de pagamento concluído, false se for agendamento ou erro).
9. observacoes: detalhes extras ou anotações manuscritas/descrições do pagamento.

Retorne EXCLUSIVAMENTE um JSON com esta estrutura:
{
  "data_pagamento": "AAAA-MM-DD",
  "valor_pago": 0.00,
  "tipo_comprovante": "PIX",
  "favorecido_nome": "...",
  "favorecido_chave_pix_ou_banco": "...",
  "pagador_nome": "...",
  "id_transacao_ou_autenticacao": "...",
  "e_comprovante_valido": true,
  "observacoes": "..."
}`;

      const raw = await callGemini([
        { text: prompt },
        {
          inlineData: {
            mimeType: mimeType || 'image/jpeg',
            data: base64Data
          }
        }
      ], true);

      return res.status(200).json(JSON.parse(raw));
    }

    // ── 3. AUDITORIA FINANCEIRA & PARECER PERICIAL DE DÍVIDAS ─────────
    if (action === 'audit_financial_history') {
      const {
        mensagensTexto = [],
        audiosTranscritos = [],
        comprovantesPagamento = [],
        valorEmprestimoInformado = 0,
        taxaJurosMensal = 0,
        nomeCredor = '',
        nomeDevedor = ''
      } = payload || {};

      const prompt = `Você é um Perito Contábil e Financeiro Judicial especializado em auditoria de contratos verbais, empréstimos, cobrança de juros e amortizações (Código Civil Brasileiro art. 354: a imputação do pagamento faz-se primeiro nos juros vencidos e, se sobrar saldo, no capital principal amortizado imediatamente).

Você recebeu o histórico completo cronológico de uma negociação no WhatsApp contendo:
- Mensagens de texto trocadas entre credor (${nomeCredor || 'Credor'}) e devedor (${nomeDevedor || 'Devedor'})
- Transcrições fiéis de áudios
- Comprovantes de transferências bancárias / PIX
- Taxa informada de juros: ${taxaJurosMensal ? `${taxaJurosMensal}% ao mês` : 'Não informada (analisar pelo histórico)'}
- Valor inicial aproximado do empréstimo: ${valorEmprestimoInformado ? `R$ ${valorEmprestimoInformado}` : 'Deduzir das primeiras mensagens'}

DADOS DA NEGOCIAÇÃO:
MENSAGENS E ÁUDIOS RELEVANTES:
${JSON.stringify([...mensagensTexto, ...audiosTranscritos].slice(-150), null, 2)}

COMPROVANTES DE PAGAMENTO IDENTIFICADOS:
${JSON.stringify(comprovantesPagamento, null, 2)}

INSTRUÇÕES RIGOROSAS DE CÁLCULO E ANÁLISE PERICIAL:
1. Reconstitua linha do tempo da dívida: Empréstimo original (data e valor), todos os pagamentos e comprovantes.
2. Calcule para cada pagamento:
   - Juros proporcionais acumulados desde o último evento.
   - Parcela do pagamento que quitou os juros.
   - Parcela excedente que efetivamente AMORTIZOU o principal.
   - Novo saldo devedor recalculado após a amortização (com abatimento imediato).
3. Identifique irregularidades cometidas pelo credor:
   - O credor cobrou juros como se o capital nunca tivesse sido amortizado?
   - Houve cobrança de juros sobre juros (anatocismo / agiotagem abusiva)?
   - O devedor fez pagamentos antecipados que não foram abatidos?
   - Cobranças sem comprovante ou duplicadas?
4. Emita o veredito final:
   - Total original emprestado
   - Total comprovadamente pago pelo devedor
   - Total devido segundo a matemática financeira correta
   - Saldo final: O devedor ainda deve alguma quantia ou JÁ QUITOU E TEM SALDO CREDOR (pagou a mais)?
   - Se pagou a mais, qual o valor exato a ser restituído?

Retorne EXCLUSIVAMENTE um JSON com esta estrutura:
{
  "total_emprestado": 0.00,
  "total_pago_comprovado": 0.00,
  "total_juros_cobrados_pelo_credor": 0.00,
  "total_juros_devidos_calculo_correto": 0.00,
  "total_amortizado_principal": 0.00,
  "saldo_final_real": 0.00,
  "status_quitacao": "QUITADO_PAGO_A_MAIS" | "QUITADO_EXATO" | "SALDO_DEVEDOR_RESTANTE",
  "valor_pago_a_mais_a_restituir": 0.00,
  "valor_restante_a_pagar": 0.00,
  "taxa_juros_efetiva_mensal": 0.00,
  "diagnostico_pericial": "Parecer detalhado explicando as cobranças indevidas, onde o credor errou nos cálculos e o direito do devedor...",
  "irregularidades_detectadas": [
    "Descrição de cada erro ou cobrança abusiva encontrada"
  ],
  "extrato_cronologico": [
    {
      "data": "AAAA-MM-DD",
      "tipo_evento": "EMPRESTIMO" | "PAGAMENTO_JUROS" | "AMORTIZACAO" | "PAGAMENTO_ANTECIPADO",
      "descricao": "...",
      "valor_evento": 0.00,
      "juros_periodo": 0.00,
      "amortizacao_capital": 0.00,
      "saldo_devedor_atualizado": 0.00,
      "cobrado_pelo_credor": 0.00,
      "diferenca_ou_cobranca_indevida": 0.00,
      "observacao_pericial": "..."
    }
  ]
}`;

      const raw = await callGemini([{ text: prompt }], true);
      return res.status(200).json(JSON.parse(raw));
    }

    // ── 4. DETECTAR EMPRÉSTIMOS E GASTOS NO CARTÃO AUTOMATICAMENTE ───
    if (action === 'detect_debts_auto') {
      const {
        mensagensTexto = [],
        audiosTranscritos = [],
        nomeCredor = '',
        nomeDevedor = ''
      } = payload || {};

      const prompt = `Você é um perito contábil e auditor forense.
Analise detalhadamente o histórico de mensagens de texto e transcrições de áudios entre o credor (${nomeCredor || 'Credor'}) e o devedor (${nomeDevedor || 'Devedor'}).
Identifique AUTOMATICAMENTE cada evento em que:
1. Houve um EMPRÉSTIMO EM DINHEIRO concedido (valores transferidos via PIX, TED, entregues em espécie, emprestados).
2. Houve o USO DO CARTÃO DE CRÉDITO do credor pelo devedor (compras feitas no cartão, parcelas de compras, faturas cobradas). Regra de taxa: para gastos no cartão de crédito, a taxa de juros padrão cobrada pelo credor é de 5% ao mês (a menos que outra taxa seja explicitamente mencionada).
3. Para cada débito identificado, extraia:
   - tipo: "EMPRESTIMO" ou "CARTAO_CREDITO"
   - data: AAAA-MM-DD (deduza pelo contexto da mensagem se não explícita)
   - valor: número float positivo
   - taxa_juros_mes: número float (ex: 5.0 para cartão, 10.0 ou a taxa pactuada citada para empréstimo)
   - descricao: resumo curto (ex: "Empréstimo inicial", "Compra no Cartão Mercado", etc.)
   - evidencia: trecho da mensagem ou áudio que comprova este débito.

DADOS DA CONVERSA E ÁUDIOS:
${JSON.stringify([...mensagensTexto, ...audiosTranscritos].slice(-150), null, 2)}

Retorne EXCLUSIVAMENTE um JSON com esta estrutura:
{
  "debitos_detectados": [
    {
      "tipo": "EMPRESTIMO" | "CARTAO_CREDITO",
      "data": "AAAA-MM-DD",
      "valor": 0.00,
      "taxa_juros_mes": 0.0,
      "descricao": "...",
      "evidencia": "..."
    }
  ],
  "resumo": "Explicação detalhada dos empréstimos e cartões identificados pela IA..."
}`;

      const raw = await callGemini([{ text: prompt }], true);
      return res.status(200).json(JSON.parse(raw));
    }

    return res.status(400).json({ error: `Ação "${action}" inválida.` });
  } catch (err) {
    console.error('Erro na API de Perícia Financeira:', err);
    return res.status(500).json({ error: err.message || 'Erro interno no processamento da perícia.' });
  }
}
