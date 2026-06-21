// api/claude.js
// Serverless function (Vercel) — proxy seguro e genérico para a API da Anthropic.
// Usado por atualizarPrecos() e pedirComentario(). A API key fica só no servidor.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  const { prompt, maxTokens, useWebSearch } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ erro: 'prompt é obrigatório' });
  }

  try {
    const payload = {
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens || 600,
      messages: [{ role: 'user', content: prompt }]
    };
    if (useWebSearch) {
      payload.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
    }

    const resposta = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(payload)
    });

    if (!resposta.ok) {
      const errBody = await resposta.text();
      return res.status(resposta.status).json({ erro: 'Erro na API Anthropic', detalhes: errBody });
    }

    const dados = await resposta.json();
    const texto = (dados.content || []).filter(c => c.type === 'text').map(c => c.text).join('');

    return res.status(200).json({ resultado: texto });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao processar requisição no servidor.', detalhes: err.message });
  }
}
