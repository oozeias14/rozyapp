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
  const { base64Image, mimeType } = req.body || {};

  if (!base64Image) {
    return res.status(400).json({ error: 'Nenhuma imagem fornecida.' });
  }

  const promptText = `Você é um assistente especialista em OCR e transcrição de listas de presença físicas (manuscritas ou impressas) em eventos no Brasil.
Analise detalhadamente a foto da folha de presença enviada.
Identifique e extraia TODOS os nomes e números de telefone / WhatsApp presentes na folha.

Instruções rigorosas:
1. 'name': Nome completo da pessoa (corrija capitalização inicial de cada palavra, ex: 'Maria Silva').
2. 'phone': Apenas os números limpos do telefone/WhatsApp (sem parênteses ou traços). Preserve o DDD se estiver visível (ex: '61999998888'). Se faltar o DDD ou o dígito 9, mantenha os dígitos visíveis legíveis.
3. 'city': Cidade ou bairro se estiver anotado ao lado, caso contrário deixe null.
4. 'needs_review': true se a caligrafia estiver difícil, rasurada ou o telefone tiver menos de 8 dígitos; false se estiver perfeitamente claro e legível.
5. 'notes': Qualquer anotação relevante (ex: 'caligrafia ilegível', 'sem ddd', 'apenas primeiro nome').

Retorne EXCLUSIVAMENTE um objeto JSON válido com a seguinte estrutura:
{
  "contatos": [
    {
      "name": "Nome Completo",
      "phone": "61999998888",
      "city": "Taguatinga",
      "needs_review": false,
      "notes": ""
    }
  ]
}`;

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
    const geminiRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: promptText },
              {
                inlineData: {
                  mimeType: mimeType || 'image/jpeg',
                  data: base64Image
                }
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1
        }
      })
    });

    const geminiData = await geminiRes.json();
    if (!geminiRes.ok) {
      const msg = geminiData?.error?.message || `Erro HTTP ${geminiRes.status}`;
      return res.status(geminiRes.status).json({ error: msg });
    }

    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return res.status(400).json({ error: 'A IA não identificou nenhum texto na imagem.' });
    }

    const parsed = JSON.parse(rawText);
    const list = Array.isArray(parsed) ? parsed : (parsed.contatos || parsed.contacts || parsed.participantes || []);
    
    const cleanedList = list.map((item, idx) => {
      let rawPhone = (item.phone || item.telefone || item.whatsapp || '').toString().replace(/\D/g, '');
      return {
        id: idx + 1,
        name: (item.name || item.nome || '').trim(),
        phone: rawPhone,
        city: (item.city || item.cidade || '').trim(),
        needs_review: Boolean(item.needs_review),
        notes: (item.notes || item.observacao || '').trim()
      };
    }).filter(c => c.name || c.phone);

    return res.status(200).json({ contatos: cleanedList });
  } catch (err) {
    console.error('Erro na função serverless gemini-ocr:', err);
    return res.status(500).json({ error: err.message || 'Erro interno ao processar OCR' });
  }
}
