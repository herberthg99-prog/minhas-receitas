const axios = require('axios');

module.exports = async (req, res) => {
  // Configura os cabeçalhos CORS para permitir que o seu front-end acesse a função
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Responde requisições de teste (Preflight) do navegador
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { aro, cobertura, tema, cores, ocasiao, observacoes } = req.body;

    // Monta o prompt para a inteligência artificial
    const promptGeral = `Você é um confeiteiro especialista. Crie 3 propostas detalhadas de decoração de bolo com o tema "${tema}".
    Dados do bolo:
    - Tamanho: ${aro}
    - Cobertura: ${cobertura}
    - Cores principais: ${cores}
    - Ocasião: ${ocasiao}
    - Observações extras: ${observacoes || 'Nenhuma'}
    
    Retorne as 3 propostas de forma clara e profissional para apresentar ao cliente.`;

    // Chama a API da Anthropic de forma totalmente segura
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1500,
      messages: [{ role: 'user', content: promptGeral }]
    }, {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY, // Variável que vamos salvar na Vercel
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      }
    });

    const respostaTexto = response.data.content[0].text;

    // Retorna o resultado para o seu front-end
    return res.status(200).json({ resultado: respostaTexto });

  } catch (error) {
    console.error('Erro na API:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Erro ao processar decoração', detalhes: error.message });
  }
};
