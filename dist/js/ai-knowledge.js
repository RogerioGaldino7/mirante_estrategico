/**
 * AI Knowledge Engine - Mirante Estratégico Tecpar
 * Transforma os dados brutos em uma base de conhecimento estruturada para IA.
 *
 * Campos do registro (data-processor.js): Ano, Centro, OperacaoFaturamento,
 * TipoOperacao, Familia, Produto, UF, Cidade, Cliente, CNPJ, CNPJRaiz,
 * TipoDocumento, Mes, Valor, Quantidade, MesId.
 *
 * Privacidade (convenção #6): PJ sai com CNPJ completo; PF (TipoDocumento='CPF')
 * tem o documento mascarado e o nome anonimizado por um ID estável.
 */

/**
 * Hash estável e seguro para acentos (btoa quebra com Ç/ã). djb2 → base36.
 * Usado para anonimizar nomes de Pessoa Física mantendo o mesmo ID entre linhas.
 */
function _hashNomeIA(s) {
    let h = 5381;
    const str = String(s);
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) + h) ^ str.charCodeAt(i);
    }
    return (h >>> 0).toString(36).toUpperCase().slice(0, 6);
}

function exportAIBase() {
    const baseData = window.globalData || (typeof globalData !== 'undefined' ? globalData : []) || [];

    if (!baseData || baseData.length === 0) {
        alert("Não há dados carregados no momento. Por favor, carregue os arquivos CSV primeiro.");
        return;
    }

    // Escopo: respeita apenas os filtros Ano e Centro da sidebar (para um centro
    // solicitar a própria base). Os demais filtros (UF/Cliente/Mês/Tipo Operação)
    // são intencionalmente ignorados — a base de conhecimento deve ser completa
    // dentro do ano/centro escolhido.
    const elAno   = document.getElementById('filter-ano');
    const fAno    = elAno ? elAno.value : 'ALL';
    const fCentro = (typeof window.getCheckedCentros === 'function') ? window.getCheckedCentros() : 'ALL';
    const centrosSel = (fCentro !== 'ALL' && Array.isArray(fCentro)) ? fCentro : null;

    const data = baseData.filter(d => {
        if (fAno !== 'ALL' && d.Ano !== fAno) return false;
        if (centrosSel && !centrosSel.includes(d.Centro)) return false;
        return true;
    });

    if (data.length === 0) {
        alert("Nenhum registro para o filtro atual (Ano/Centro). Ajuste os filtros e tente novamente.");
        return;
    }

    console.log("Iniciando mineração de dados para IA...", data.length,
                `de ${baseData.length} registros (após filtro Ano/Centro).`);

    const knowledgeBase = {
        projeto: "Mirante Estratégico Tecpar",
        data_extracao: new Date().toLocaleString('pt-BR'),
        observacao_privacidade: "CNPJ (PJ) completo; CPF (PF) mascarado e nome anonimizado (convenção #6).",
        resumo_geral: {
            escopo_filtro: {
                ano: fAno === 'ALL' ? 'Todos os anos' : fAno,
                centros: centrosSel ? centrosSel : 'Todos os centros',
                observacao: 'Export respeita apenas os filtros Ano e Centro; UF/Cliente/Mês/Tipo de Operação não são aplicados.'
            },
            total_registros: data.length,
            faturamento_total: 0,
            anos_disponiveis: [...new Set(data.map(d => d.Ano))].sort(),
            centros_custo: [...new Set(data.map(d => d.Centro))].sort(),
            mix_operacao_geral: {},
            distribuicao_setor: { PUBLICO: 0, PRIVADO: 0, EXTERIOR: 0 },
            total_clientes: 0
        },
        clientes: {},
        performance_familias: {}
    };

    // -----------------------------------------------------------------------
    // Processamento — uma única passada sobre globalData
    // -----------------------------------------------------------------------
    data.forEach(row => {
        const tipoDoc = row.TipoDocumento || 'ND';
        const ePF     = tipoDoc === 'CPF';

        let idCliente = row.Cliente || "CLIENTE_NAO_IDENTIFICADO";
        let documento;
        let nomeExibicao;

        if (ePF) {
            // Pessoa Física: anonimiza nome + mascara documento (LGPD)
            idCliente    = `CLIENTE_PF_${_hashNomeIA(row.Cliente || idCliente)}`;
            nomeExibicao = idCliente;
            documento    = (typeof mascararDocumento === 'function')
                ? mascararDocumento(row.CNPJ, tipoDoc)
                : "***.***.***-**";
        } else {
            // PJ / EXT / ND: CNPJ completo (pode ser vazio p/ EXT/ND)
            nomeExibicao = row.Cliente || idCliente;
            documento    = row.CNPJ || "";
        }

        if (!knowledgeBase.clientes[idCliente]) {
            knowledgeBase.clientes[idCliente] = {
                nome: nomeExibicao,
                tipo_entidade: ePF ? "Pessoa Física (anonimizada)" : "Pessoa Jurídica",
                tipo_documento: tipoDoc,
                documento: documento,
                cidade: row.Cidade,
                uf: row.UF,
                setor: (typeof setorPrincipal === 'function') ? setorPrincipal(row) : 'PRIVADO',
                setor_detalhado: (typeof classificarSetor === 'function') ? classificarSetor(row) : 'PRIVADO',
                faturamento_por_ano: {},
                quantidade_por_ano: {},
                faturamento_por_ano_mes: {},
                mix_operacao: {},
                familias_consumidas: new Set(),
                produtos_consumidos: new Set()
            };
        }

        const cli    = knowledgeBase.clientes[idCliente];
        const ano    = row.Ano;
        const mes    = row.Mes;
        const valor  = row.Valor || 0;
        const quant  = row.Quantidade || 0;
        const tipoOp = row.TipoOperacao || 'Não Classificado';

        cli.faturamento_por_ano[ano] = (cli.faturamento_por_ano[ano] || 0) + valor;
        cli.quantidade_por_ano[ano]  = (cli.quantidade_por_ano[ano]  || 0) + quant;

        if (!cli.faturamento_por_ano_mes[ano]) cli.faturamento_por_ano_mes[ano] = {};
        cli.faturamento_por_ano_mes[ano][mes] = (cli.faturamento_por_ano_mes[ano][mes] || 0) + valor;

        cli.mix_operacao[tipoOp] = (cli.mix_operacao[tipoOp] || 0) + valor;

        if (row.Familia) cli.familias_consumidas.add(row.Familia);
        if (row.Produto) cli.produtos_consumidos.add(row.Produto);

        // Performance por Família (geral)
        if (row.Familia) {
            let fam = knowledgeBase.performance_familias[row.Familia];
            if (!fam) {
                fam = knowledgeBase.performance_familias[row.Familia] =
                    { total: 0, por_ano: {}, quantidade_por_ano: {}, por_tipo_operacao: {} };
            }
            fam.total += valor;
            fam.por_ano[ano]            = (fam.por_ano[ano]            || 0) + valor;
            fam.quantidade_por_ano[ano] = (fam.quantidade_por_ano[ano] || 0) + quant;
            fam.por_tipo_operacao[tipoOp] = (fam.por_tipo_operacao[tipoOp] || 0) + valor;
        }

        // Agregados globais
        knowledgeBase.resumo_geral.faturamento_total += valor;
        knowledgeBase.resumo_geral.mix_operacao_geral[tipoOp] =
            (knowledgeBase.resumo_geral.mix_operacao_geral[tipoOp] || 0) + valor;
    });

    // -----------------------------------------------------------------------
    // Pós-processamento: Sets → Arrays e estatísticas de resumo
    // -----------------------------------------------------------------------
    for (let id in knowledgeBase.clientes) {
        const c = knowledgeBase.clientes[id];
        c.familias_consumidas = [...c.familias_consumidas];
        c.produtos_consumidos = [...c.produtos_consumidos];
        const s = c.setor;
        if (knowledgeBase.resumo_geral.distribuicao_setor[s] !== undefined) {
            knowledgeBase.resumo_geral.distribuicao_setor[s]++;
        }
    }
    knowledgeBase.resumo_geral.total_clientes = Object.keys(knowledgeBase.clientes).length;

    // -----------------------------------------------------------------------
    // Serialização (arredonda números para 2 casas — evita ruído de float)
    // -----------------------------------------------------------------------
    const jsonStr = JSON.stringify(
        knowledgeBase,
        (k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v),
        2
    );
    // Sufixo de escopo no nome do arquivo (ajuda quando um centro pede a própria base)
    let escopoSlug = '';
    if (fAno !== 'ALL') escopoSlug += '_' + fAno;
    if (centrosSel && centrosSel.length === 1) {
        escopoSlug += '_' + centrosSel[0].replace(/[^a-zA-Z0-9]/g, '').slice(0, 14);
    } else if (centrosSel && centrosSel.length > 1) {
        escopoSlug += `_${centrosSel.length}centros`;
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(jsonStr);
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `Base_Conhecimento_IA${escopoSlug}_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();

    console.log("Exportação concluída:", knowledgeBase.resumo_geral.total_clientes, "clientes,",
                Object.keys(knowledgeBase.performance_familias).length, "famílias.");
}
