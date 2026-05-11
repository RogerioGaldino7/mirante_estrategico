/**
 * AI Knowledge Engine - Mirante Estratégico Tecpar
 * Transforma os dados brutos em uma base de conhecimento estruturada para IA.
 */

/**
 * Gera um arquivo JSON com resumo geral, clientes agregados por ano e
 * desempenho por familia.
 *
 * Fluxo:
 *   1. Le globalData ja carregado pelo usuario.
 *   2. Agrega faturamento por cliente/ano e por familia/ano.
 *   3. Mascara pessoa fisica antes de incluir no JSON.
 *   4. Dispara download local do arquivo.
 *
 * Observacao de manutencao:
 *   Este exportador e independente da renderizacao do dashboard. Alteracoes
 *   aqui nao devem mudar KPIs ou graficos, mas podem afetar a estrutura do JSON
 *   consumido por processos externos.
 */
function exportAIBase() {
    // Tenta encontrar os dados em diferentes locais possíveis
    const data = window.globalData || globalData || [];
    
    if (!data || data.length === 0) {
        alert("Não há dados carregados no momento. Por favor, carregue os arquivos CSV primeiro.");
        return;
    }

    console.log("Iniciando mineração de dados para IA...", data.length, "registros encontrados.");


    // 1. Obter Overrides de Setor (Manual vs Auto)
    const setorOverrides = JSON.parse(localStorage.getItem('setorOverrides') || '{}');

    // 2. Estrutura de Conhecimento
    const knowledgeBase = {
        projeto: "Mirante Estratégico Tecpar",
        data_extracao: new Date().toLocaleString('pt-BR'),
        resumo_geral: {
            total_registros_brutos: data.length,
            anos_disponiveis: [...new Set(data.map(d => d.Ano))],
            centros_custo: [...new Set(data.map(d => d.Centro))]
        },
        clientes: {},
        performance_familias: {}
    };

    // 3. Processar Clientes
    data.forEach(row => {
        let idCliente = row.Cliente || "CLIENTE_NAO_IDENTIFICADO";
        let documento = (row.CnpjCpf || "").replace(/\D/g, ''); // Apenas números
        let ePessoaFisica = documento.length === 11; // Regra básica: 11 dígitos = CPF

        // --- CAMADA DE PROTEÇÃO LGPD ---
        if (ePessoaFisica) {
            // Gera um ID único e anônimo baseado no nome para a IA ainda rastrear o mesmo cliente
            const hash = btoa(idCliente).substring(0, 5); 
            idCliente = `CLIENTE_PF_${hash}`;
            documento = "***.***.***-**";
        }

        if (!knowledgeBase.clientes[idCliente]) {
            knowledgeBase.clientes[idCliente] = {
                nome: idCliente,
                tipo_entidade: ePessoaFisica ? "Pessoa Física (Dados Mascarados)" : "Pessoa Jurídica",
                documento_mascarado: documento,
                cidade: row.Cidade,
                uf: row.UF,
                setor: setorOverrides[idCliente] || row.Setor || "Privado (Auto)",
                faturamento_por_ano: {},
                familias_consumidas: new Set()
            };
        }


        const cli = knowledgeBase.clientes[idCliente];
        const ano = row.Ano;
        const valor = parseFloat(row.Valor) || 0;

        if (!cli.faturamento_por_ano[ano]) cli.faturamento_por_ano[ano] = 0;
        cli.faturamento_por_ano[ano] += valor;
        if (row.Familia) cli.familias_consumidas.add(row.Familia);

        // Processar Performance por Família (Geral)
        if (row.Familia) {
            if (!knowledgeBase.performance_familias[row.Familia]) {
                knowledgeBase.performance_familias[row.Familia] = { total: 0, por_ano: {} };
            }
            knowledgeBase.performance_familias[row.Familia].total += valor;
            if (!knowledgeBase.performance_familias[row.Familia].por_ano[ano]) {
                knowledgeBase.performance_familias[row.Familia].por_ano[ano] = 0;
            }
            knowledgeBase.performance_familias[row.Familia].por_ano[ano] += valor;
        }
    });

    // 4. Converter Sets para Arrays para o JSON ficar limpo
    for (let id in knowledgeBase.clientes) {
        knowledgeBase.clientes[id].familias_consumidas = [...knowledgeBase.clientes[id].familias_consumidas];
    }

    // 5. Gerar o arquivo e disparar download
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(knowledgeBase, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `Base_Conhecimento_IA_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchorNode); 
    downloadAnchorNode.click();
    downloadAnchorNode.remove();

    console.log("Exportação concluída com sucesso.");
}
