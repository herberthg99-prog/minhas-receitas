async function gerarDecoracaoBolo() {
    // Captura os elementos da tela
    const aroElement = document.getElementById('aro');
    const coberturaElement = document.getElementById('cobertura');
    const temaElement = document.getElementById('tema');
    const coresElement = document.getElementById('cores');
    const ocasiaoElement = document.getElementById('ocasiao');
    const observacoesElement = document.getElementById('observacoes');
    const resultadoDiv = document.getElementById('resultado-decoracao'); // Ajuste para o ID onde você exibe o resultado

    // Validação simples para garantir que os campos principais foram preenchidos
    if (!temaElement.value || !coresElement.value) {
        alert('Por favor, preencha pelo menos o Tema e as Cores Principais!');
        return;
    }

    if (resultadoDiv) {
        resultadoDiv.innerHTML = '<p style="color: #d1a153;">✨ Confeitando suas propostas... Aguarde...</p>';
    }

    try {
        // Faz a chamada segura para a nossa função na Vercel
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

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detalhes || 'Erro desconhecido na API');
        }

        const data = await response.json();

        // Exibe o resultado formatado vindo do Claude (IA) na tela
        if (resultadoDiv) {
            // Substitui quebras de linha por <br> para ficar bonito no HTML
            resultadoDiv.innerHTML = `
                <div style="background: #1e1b15; padding: 20px; border-radius: 8px; border: 1px solid #d1a153; margin-top: 20px;">
                    <h3 style="color: #d1a153; margin-top: 0;">🎂 Sugestões de Decoração:</h3>
                    <p style="white-space: pre-line; color: #fff;">${data.resultado}</p>
                </div>
            `;
        } else {
            // Caso não encontre a div de resultado, mostra um alerta com o texto
            alert(data.resultado);
        }

    } catch (error) {
        console.error('Erro ao gerar decoração:', error);
        if (resultadoDiv) {
            resultadoDiv.innerHTML = `<p style="color: #ff4d4d;">❌ Erro ao gerar decorações: ${error.message}. Verifique o console.</p>`;
        }
    }
}
