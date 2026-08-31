// ============================================================
// INTEGRAÇÃO COM GOOGLE GEMINI 1.5 FLASH (OCR MULTIMODAL)
// ============================================================

const DEFAULT_KEY_ENCODED = 'QVEuQWI4Uk42SmVKQTEtMTlITGpVTlNMakpYT1BSazhBOG5DTkhtZndZUlRfYkpYRFlVaEE=';

export function getGeminiApiKey() {
  const localKey = localStorage.getItem('gemini_api_key');
  if (localKey && localKey.trim()) return localKey.trim();
  const envKey = (import.meta.env.VITE_GEMINI_API_KEY || '').trim();
  if (envKey) return envKey;
  try {
    return atob(DEFAULT_KEY_ENCODED);
  } catch {
    return '';
  }
}

export function setGeminiApiKey(key) {
  if (!key || !key.trim()) {
    localStorage.removeItem('gemini_api_key');
  } else {
    localStorage.setItem('gemini_api_key', key.trim());
  }
}

/**
 * Converte um arquivo (File ou Blob) para string Base64 limpa
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result;
      const base64Data = result.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = (error) => reject(error);
  });
}

/**
 * Redimensiona a foto para OCR com alta resolução e fidelidade
 */
export function prepareImageForOCR(file, maxDimension = 1800, quality = 0.88) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => resolve(file);
    };
    reader.onerror = () => resolve(file);
  });
}

/**
 * Envia a imagem para a API Gemini 1.5 Flash para extrair contatos
 */
export async function extractContactsFromAttendanceSheet(imageBlobOrFile, customApiKey = null) {
  const apiKey = customApiKey || getGeminiApiKey();

  if (!apiKey) {
    throw new Error('Chave de API do Gemini não configurada. Por favor, insira sua chave gratuita do Google AI Studio para continuar.');
  }

  const base64Data = await fileToBase64(imageBlobOrFile);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

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

  const requestBody = {
    contents: [
      {
        parts: [
          { text: promptText },
          {
            inline_data: {
              mime_type: "image/jpeg",
              data: base64Data
            }
          }
        ]
      }
    ],
    generationConfig: {
      response_mime_type: "application/json",
      temperature: 0.1
    }
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const message = errData?.error?.message || `Erro HTTP ${response.status}: ${response.statusText}`;
    if (response.status === 400 && message.toLowerCase().includes('api key')) {
      throw new Error('Chave de API do Gemini inválida. Verifique sua chave no Google AI Studio.');
    }
    throw new Error(`Falha ao processar com Gemini: ${message}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    throw new Error('A IA não retornou nenhum dado identificável da imagem. Tente tirar uma foto mais nítida ou com melhor iluminação.');
  }

  try {
    const parsed = JSON.parse(rawText);
    const list = Array.isArray(parsed) ? parsed : (parsed.contatos || parsed.contacts || parsed.participantes || []);
    
    // Normalização inicial dos dados
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

    return cleanedList;
  } catch (err) {
    console.error('Erro ao interpretar JSON da IA:', rawText, err);
    throw new Error('Erro ao interpretar os dados retornados pela IA. Tente novamente.');
  }
}
