// ==========================================
// CONFIGURAÇÕES E INICIALIZAÇÃO DO APP
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    console.log("Sucree v2.0.0 – Inicializado com sucesso.");
    
    // Vincula o evento de clique ao botão de gerar decoração, se ele existir na página
    const btnGerar = document.getElementById('btn-gerar-decoracao');
    if (btnGerar) {
        btnGerar.addEventListener('click', gerarDecoracaoBolo);
    }
});

// ==========================================
// FUNÇÃO PRINCIPAL: GERAR DECORAÇÃO (VERCEL)
// ==========================================

async function gerarDecoracaoBolo() {
    // Captura os elementos do formulário na tela
    const aroElement = document.getElementById('aro');
    const coberturaElement = document.getElementById('cobertura');
    const temaElement = document.getElementById('tema');
    const coresElement = document.getElementById('cores');
    const ocasiaoElement = document.getElementById('ocasiao');
    const observacoesElement = document.getElementById('observacoes');
    const resultadoDiv = document.getElementById('resultado-decoracao');

    // Validação: Tema e Cores são obrigatórios para a IA trabalhar bem
    if (!temaElement || !coresElement || !temaElement.value.trim() || !coresElement.value.trim()) {
        alert('Por favor, preencha pelo menos os campos de "Tema do bolo" e "Cores principais"!');
        return;
    }

    // Feedback visual de carregamento para o usuário
    if (resultadoDiv) {
        resultadoDiv.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #d1a153;">
                <p>✨ Confeitando suas 3 propostas personalizadas...</p>
                <p style="font-size: 0.9em; color: #aaa;">Isso pode levar alguns segundos, a IA está trabalhando nisso.</p>
            </div>
        `;
    }

    try {
        // Faz a chamada para a nossa Serverless Function na Vercel
        const response = await fetch('/api/gerar-decoracao', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                aro: aroElement ? aroElement.value : 'Não informado',
                cobertura: coberturaElement ? coberturaElement.value : 'Não informado',
                tema: temaElement.value,
                cores: coresElement.value,
                ocasiao: ocasiaoElement ? ocasiaoElement.value : 'Não informado',
                observacoes: observacoesElement ? observacoesElement.value : ''
            })
        });

        // Se a resposta do servidor não for bem-sucedida, captura o erro
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detalhes || 'Erro ao processar requisição no servidor.');
        }

        const data = await response.json();

        // Renderiza o resultado de forma elegante na tela
        if (resultadoDiv) {
            resultadoDiv.innerHTML = `
                <div style="background: #1e1b15; padding: 25px; border-radius: 8px; border: 1px solid #d1a153; margin-top: 25px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
                    <h3 style="color: #d1a153; margin-top: 0; font-size: 1.4em; border-bottom: 1px solid #332c20; padding-bottom: 10px; display: flex; align-items: center; gap: 10px;">
                        🎂 Suas Propostas de Decoração
                    </h3>
                    <div style="white-space: pre-line; color: #eeeeee; font-line-height: 1.6; font-size: 1.05em;">${data.resultado}</div>
                </div>
            `;
        } else {
            // Backup caso a div de resultado sumisse do HTML
            alert(data.resultado);
        }

    } catch (error) {
        console.error('Erro na comunicação com a API:', error);
        if (resultadoDiv) {
            resultadoDiv.innerHTML = `
                <div style="background: #2a1818; padding: 20px; border-radius: 8px; border: 1px solid #ff4d4d; margin-top: 25px; color: #ffcccc;">
                    <p style="margin: 0; font-weight: bold;">❌ Falha ao gerar sugestões</p>
                    <p style="margin: 5px 0 0 0; font-size: 0.9em; color: #ffa3a3;">Motivo: ${error.message}</p>
                </div>
            `;
        }
    }
}
