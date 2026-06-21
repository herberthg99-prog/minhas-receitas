// api/ler-foto.js
// Serverless function (Vercel) — proxy seguro para a API da Anthropic.
// Evita CORS e protege a API key, que fica apenas no servidor (variável de ambiente).

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  const { fotoB64 } = req.body || {};
  if (!fotoB64) {
    return res.status(400).json({ erro: 'fotoB64 é obrigatório' });
  }

  try {
    const resposta = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: fotoB64 } },
            { type: 'text', text: 'Leia esta foto de anotação/rascunho de receita culinária. Retorne APENAS JSON válido sem markdown:\n{"name":"string","time":minutos,"yield":porcoes,"unit":"porção","preparo":"passo a passo","ingredients":[{"name":"string","qty":numero,"unit":"g ou ml","price":0,"isBase":false}],"comment":"observações"}\nisBase=true apenas no ingrediente principal.' }
          ]
        }]
      })
    });

    if (!resposta.ok) {
      const errBody = await resposta.text();
      return res.status(resposta.status).json({ erro: 'Erro na API Anthropic', detalhes: errBody });
    }

    const dados = await resposta.json();
    const texto = (dados.content || []).find(c => c.type === 'text')?.text || '';
    let parsed;
    try {
      parsed = JSON.parse(texto.replace(/```json|```/g, '').trim());
    } catch (e) {
      return res.status(422).json({ erro: 'Foto não clara, não foi possível extrair a receita.' });
    }

    return res.status(200).json({ resultado: parsed });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao processar requisição no servidor.', detalhes: err.message });
  }
}
