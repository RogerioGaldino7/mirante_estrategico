// =============================================================================
// data-processor.js — ETL: transforma CSVs do formato largo para tidy/long
// =============================================================================
// Depende de: state.js (globalData, globalMetas)
// Chama após processar: populateFilters() [filters.js], updateDashboard() [dashboard.js]
// =============================================================================

// A função classificarTipoOperacao(centro, familia) agora está definida globalmente
// no arquivo js/tipo-operacao.js para permitir overrides dinâmicos via UI.

const VALID_OPERATIONS = [
    '2001', // Vendas de Serviços - S/ Retenções - PESSOA FÍSICA
    '2002', // Vendas de Serviços - C/ Retenções de IR / PIS / COFINS / CSLL
    '2003', // Vendas de Serviços - C/ Retenção de IR - SIMPLES NACIONAL - EMP. PUBLICA
    '2004', // Vendas de Serviços - Exterior
    '3003'  // Venda à Ordem
];

/**
 * Conta quantas das primeiras 7 colunas de uma linha estão vazias.
 * Usado para determinar o nível hierárquico do registro
 * (Centro > Operação de faturamento > Família > Produto > UF > Cidade > Cliente).
 */
function countEmptyLeading(row) {
    let count = 0;
    for (let i = 0; i < 7; i++) {
        if (!row[i] || String(row[i]).trim() === "") count++;
        else break;
    }
    return count;
}

/**
 * Transforma as linhas brutas do CSV de faturamento (formato largo) em
 * registros tidy com um campo por dimensão + Mes + Valor + Quantidade.
 * Popula globalData e dispara populateFilters() + updateDashboard().
 *
 * Estrutura esperada do CSV (formato com Operação de faturamento + CNPJ/CPF):
 *   Col 0..6 : Centro | Operação de faturamento | Família | Produto | UF | Cidade | Cliente
 *   Col 7    : CNPJ ou CPF
 *   Col 8..N : pares Valor / Quantidade dos meses (Jan, Fev, ...)
 *   Col N+1  : Total Valor / Total Quantidade
 *   Col última: Ano (injetado pelo loader.js a partir do nome do arquivo)
 *
 * @param {Array[]} rows - Linhas parseadas pelo PapaParse (já com ano injetado na última coluna)
 */
async function processData(rows) {
    if (rows.length < 3) {
        alert("Formato de arquivo inválido.");
        if (typeof hideLoading === 'function') hideLoading();
        return;
    }

    if (typeof showLoading === 'function') {
        showLoading('Processando bases…', `0 de ${rows.length} linhas`);
    }
    if (typeof yieldUI === 'function') await yieldUI();

    // Posições fixas no novo formato (com coluna Operação de faturamento + CNPJ/CPF):
    const CNPJ_COL        = 7;
    const MONTH_START_COL = 8;

    let tidyData = [];
    let state = Array(7).fill("");
    const mesesBase = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

    let formatoValidado = false;
    // Linhas-fantasma do cubo: rows com valor preenchido mas SEM nenhum centro
    // identificável (nem por carry-forward). São artefatos da exportação OLAP
    // — não há ação possível sobre elas (não constam no cubo nem por filtro).
    // Tratamos descartando silenciosamente e logando o resumo.
    let phantomCount = 0;
    let phantomValor = 0;

    // A cada N linhas, devolvemos o controle ao navegador para evitar trava
    // de UI (popup "Página sem resposta") em bases grandes.
    const CHUNK_YIELD = 2500;

    for (let i = 0; i < rows.length; i++) {
        // Yield periódico ao navegador para manter UI responsiva
        if (i > 0 && i % CHUNK_YIELD === 0 && typeof yieldUI === 'function') {
            if (typeof updateLoading === 'function') {
                updateLoading(null, `${i.toLocaleString('pt-BR')} de ${rows.length.toLocaleString('pt-BR')} linhas`);
            }
            await yieldUI();
        }
        let row = rows[i];
        const r0 = String(row[0]).trim().toUpperCase();

        // Cabeçalho de colunas: validamos que a base está no formato esperado
        // (deve conter "CNPJ" ou "CPF" na coluna 7, após a coluna
        // "Operação de faturamento" inserida na 2ª posição)
        if (r0 === "CENTRO DE CUSTO") {
            const colCnpjHeader = String(row[CNPJ_COL] || '').toUpperCase();
            if (!colCnpjHeader.includes('CNPJ') && !colCnpjHeader.includes('CPF')) {
                if (typeof hideLoading === 'function') hideLoading();
                alert(
                    "Base em formato antigo detectada (sem coluna 'Operação de faturamento' " +
                    "e/ou CNPJ/CPF).\n\n" +
                    "Por favor, re-exporte do ERP no formato atual: Centro de custo | Operação " +
                    "de faturamento | Família | Produto | UF | Cidade | Cliente | CNPJ ou CPF.\n\n" +
                    `Esperado em col ${CNPJ_COL + 1}: "CNPJ ou CPF"\n` +
                    `Encontrado: "${row[CNPJ_COL] || '(vazio)'}"`
                );
                return;
            }
            formatoValidado = true;
            // Reseta o estado hierárquico ao começar uma nova base — evita que
            // valores de Centro/Família/etc da base anterior vazem para a próxima
            // quando múltiplos arquivos são concatenados pelo loader.
            for (let s = 0; s < 7; s++) state[s] = "";
            continue;
        }

        // Pula demais cabeçalhos, sub-cabeçalhos ("Valor;Valor;...") e totais
        const rowJoined = row.join('').toUpperCase();
        if (rowJoined.includes("DATA DE EMISS") ||
            r0 === "TOTAL POR LINHAS" ||
            r0 === "TOTAL POR COLUNAS" ||
            r0.includes("TOTAL GERAL") ||
            String(row[MONTH_START_COL] || '').trim() === "Valor") {
            continue;
        }

        // Atualiza o estado hierárquico: qualquer célula preenchida redefine aquele nível
        // e zera os níveis filhos (carry-forward)
        for (let j = 0; j < 7; j++) {
            if (row[j] && String(row[j]).trim() !== "") {
                state[j] = String(row[j]).trim();
                for (let k = j + 1; k < 7; k++) state[k] = "";
            }
        }

        // Determina se esta linha é "folha" (nível mais granular visível)
        // comparando a profundidade hierárquica com a próxima linha válida.
        //
        // IMPORTANTE: PARA a busca quando encontra cabeçalhos de uma nova base
        // (DATA DE EMISS / CENTRO DE CUSTO) — esses marcam o fim do bloco de dados
        // da base atual. Sem isso, ao concatenar várias bases, a busca cruzaria o
        // limite e usaria a profundidade da próxima base como referência, causando
        // falsa detecção de "folha" em linhas de subtotal no fim da base atual.
        // Também IGNORA linhas "Total por..." (continua procurando).
        let d_current = countEmptyLeading(row);
        let nextRow = null;
        let d_next = -1;
        for (let j = i + 1; j < rows.length; j++) {
            let pr0 = String(rows[j][0]).trim().toUpperCase();
            let pJoined = rows[j].join('').toUpperCase();

            // Limite de base — para a busca; sem próxima linha válida nesta base
            if (pJoined.includes("DATA DE EMISS") || pr0 === "CENTRO DE CUSTO") break;

            // Subcabeçalho ou linha de total — ignora e continua procurando
            const pIsSubHeader = String(rows[j][MONTH_START_COL] || '').trim() === "Valor";
            const pIsTotal = pr0.startsWith("TOTAL POR") || pr0.includes("TOTAL GERAL");
            if (pIsSubHeader || pIsTotal) continue;

            let candidateRow = rows[j];
            // Verifica se a linha é completamente vazia (ignorando o ano na última coluna)
            let isEmptyRow = true;
            for (let c = 0; c < candidateRow.length - 1; c++) {
                if (String(candidateRow[c] || '').trim() !== "") {
                    isEmptyRow = false;
                    break;
                }
            }
            if (isEmptyRow) continue;

            nextRow = candidateRow;
            d_next = countEmptyLeading(nextRow);
            break;
        }

        // Só emite registros para linhas folha (sem filhos abaixo)
        if (d_current >= d_next) {
            
            // -----------------------------------------------------------------
            // NORMALIZAÇÃO DE HIERARQUIA (ERP muda a ordem entre anos)
            // 2025 exportado como: Centro > Familia > Operacao
            // 2026 exportado como: Centro > Operacao > Familia
            // -----------------------------------------------------------------
            let realOp = String(state[1] || '').trim();
            let realFam = String(state[2] || '').trim();
            
            // Se state[2] começa com 4 dígitos (ex: "4003 - Entrada") e state[1] não, estão invertidos!
            if (/^\d{4}/.test(realFam) && !/^\d{4}/.test(realOp)) {
                realOp = String(state[2] || '').trim();
                realFam = String(state[1] || '').trim();
            }

            // -----------------------------------------------------------------
            // FILTRO DE OPERAÇÕES DE VENDA
            // -----------------------------------------------------------------
            if (realOp !== "") {
                const isValidOp = VALID_OPERATIONS.some(op => realOp.startsWith(op));
                if (!isValidOp) continue; // Pula folha se não for venda
            }

            // Extrai e classifica o documento:
            //   CNPJ — 14 dígitos (pessoa jurídica brasileira)
            //   CPF  — 11 dígitos (pessoa física brasileira)
            //   EXT  — sem documento, mas UF = EX → cliente do exterior (legítimo)
            //   ND   — sem documento e UF ≠ EX → suspeita de cadastro incompleto
            //          ou nó colapsado no cubo
            const docRaw    = String(row[CNPJ_COL] || '').trim();
            const docDigits = docRaw.replace(/\D/g, '');
            const ufUpper   = String(state[4] || '').trim().toUpperCase();
            const isExterior = ufUpper === 'EX' || ufUpper === 'EXT' || ufUpper.startsWith('EXTERIOR');

            let docTipo = 'ND';
            if (docDigits.length === 14)      docTipo = 'CNPJ';
            else if (docDigits.length === 11) docTipo = 'CPF';
            else if (isExterior)              docTipo = 'EXT';
            // Raiz CNPJ (8 primeiros dígitos) identifica o grupo econômico / órgão raiz
            const cnpjRaiz = (docTipo === 'CNPJ') ? docDigits.substring(0, 8) : '';

            // Detecta linha-fantasma: dados sem qualquer centro identificável.
            // Sem state[0] não há contexto pro registro — são artefatos do cubo
            // sem caminho de drill-down possível. Vamos descartar mas contar.
            const isPhantom = !state[0];

            let monthIndex = 0;
            let loopLimit  = row.length - 3;
            for (let c = MONTH_START_COL; c < loopLimit; c += 2) {
                let vStr = String(row[c]   || "0").replace(/\./g, "").replace(",", ".");
                let qStr = String(row[c+1] || "0").replace(/\./g, "").replace(",", ".");
                let valor = parseFloat(vStr) || 0;
                let quant = parseFloat(qStr) || 0;

                if (valor !== 0 || quant !== 0) {
                    if (isPhantom) {
                        phantomCount++;
                        phantomValor += valor;
                    } else {
                        // Correção para não confundir a Família "PRODUTOS" do ERP com a Classificação "Produto"
                        let famStr = realFam || 'NÃO IDENTIFICADO';
                        if (famStr.trim().toUpperCase() === 'PRODUTOS') {
                            famStr = 'OUTROS SERVIÇOS';
                        }

                        tidyData.push({
                            Ano:                 row[row.length - 1],
                            Centro:              normalizeCentro(state[0]),
                            OperacaoFaturamento: realOp,
                            TipoOperacao:        classificarTipoOperacao(normalizeCentro(state[0]), famStr),
                            Familia:             famStr,
                            Produto:             state[3] || 'NÃO DEFINIDO',
                            UF:                  state[4] || 'ND',
                            Cidade:              state[5] || 'NÃO DEFINIDO',
                            Cliente:             state[6] || 'NÃO IDENTIFICADO',
                            CNPJ:                docDigits,
                            CNPJRaiz:            cnpjRaiz,
                            TipoDocumento:       docTipo,
                            Mes:                 mesesBase[monthIndex],
                            Valor:               valor,
                            Quantidade:          quant,
                            MesId:               monthIndex
                        });
                    }
                }
                monthIndex++;
                if (monthIndex >= 12) break;
            }
        }
    }

    if (!formatoValidado) {
        if (typeof hideLoading === 'function') hideLoading();
        alert("Não foi encontrado o cabeçalho 'Centro de custo' no arquivo. Verifique o formato.");
        return;
    }

    if (typeof updateLoading === 'function') {
        updateLoading('Consolidando registros…', `${tidyData.length.toLocaleString('pt-BR')} registros válidos`);
    }
    if (typeof yieldUI === 'function') await yieldUI();

    globalData = tidyData;

    // Estatísticas de documento para feedback ao usuário
    const comCnpj = tidyData.filter(d => d.TipoDocumento === 'CNPJ').length;
    const comCpf  = tidyData.filter(d => d.TipoDocumento === 'CPF').length;
    const extRegs = tidyData.filter(d => d.TipoDocumento === 'EXT');
    const comExt  = extRegs.length;
    const sdRegs  = tidyData.filter(d => d.TipoDocumento === 'ND');
    const semDoc  = sdRegs.length;
    const valorAfetado = sdRegs.reduce((acc, d) => acc + (d.Valor || 0), 0);
    const valorExterior = extRegs.reduce((acc, d) => acc + (d.Valor || 0), 0);

    // Status na sidebar: linguagem de negócio (anos + total + alerta se houver
    // registro sem documento); o detalhamento técnico CNPJ/CPF/EXT/ND fica no
    // tooltip (hover) para não expor jargão ao usuário final.
    const statusEl = document.getElementById('file-status');
    const anosCarregados = [...new Set(tidyData.map(d => d.Ano))].sort().join(', ');
    const totalFmt = globalData.length.toLocaleString('pt-BR');
    statusEl.innerText = `Base: ${totalFmt} registros (${anosCarregados})` +
        (semDoc > 0 ? ` · ⚠️ ${semDoc} sem documento` : '');
    statusEl.title =
        `CNPJ: ${comCnpj.toLocaleString('pt-BR')} · CPF: ${comCpf.toLocaleString('pt-BR')} · ` +
        `Exterior (EXT): ${comExt.toLocaleString('pt-BR')} · Sem documento (ND): ${semDoc.toLocaleString('pt-BR')}`;

    console.log(`[Base] Total: ${tidyData.length} | CNPJ: ${comCnpj} | CPF: ${comCpf} | Exterior: ${comExt} | Sem doc: ${semDoc}`);

    if (comExt > 0) {
        console.log(`[Base] ${comExt} registro(s) do exterior (UF=EX) — ${formatter.format(valorExterior)} (sem CNPJ/CPF é esperado).`);
    }

    if (phantomCount > 0) {
        console.warn(
            `[Base] ${phantomCount} linha(s)-fantasma do cubo descartada(s) — ${formatter.format(phantomValor)}. ` +
            `Sem hierarquia identificável (artefatos da exportação OLAP, não localizáveis no cubo via filtro).`
        );
    }

    // ---- Validação: nós colapsados no cubo ----
    // Apenas registros 'ND' (sem documento E sem UF=EX) são tratados como suspeitos.
    // Clientes do exterior (EXT) não geram alerta porque legitimamente não possuem
    // CNPJ/CPF brasileiro.
    if (semDoc > 0) {
        const valorFmt = formatter.format(valorAfetado);
        console.warn(
            `[Validação] ${semDoc} registro(s) sem documento detectado(s) — ` +
            `${valorFmt} possivelmente afetado(s) por nós colapsados no cubo.`
        );
        try {
            console.table(sdRegs.map(d => ({
                Ano:     d.Ano,
                Centro:  d.Centro,
                Familia: d.Familia,
                Produto: d.Produto,
                UF:      d.UF,
                Cidade:  d.Cidade,
                Cliente: d.Cliente,
                Mes:     d.Mes,
                Valor:   d.Valor
            })));
        } catch (_) { /* console.table indisponível */ }

        renderValidacaoBanner(semDoc, valorAfetado);
    } else {
        renderValidacaoBanner(0, 0);
    }

    if (typeof updateLoading === 'function') updateLoading('Atualizando filtros…');
    if (typeof yieldUI === 'function') await yieldUI();
    await populateFilters();

    if (typeof updateLoading === 'function') updateLoading('Renderizando dashboard…');
    if (typeof yieldUI === 'function') await yieldUI();
    updateDashboard();

    // Remove a classe pre-data para ocultar o painel de boas-vindas e exibir o dashboard
    const mainCanvas = document.querySelector('.main-canvas');
    if (mainCanvas) {
        mainCanvas.classList.remove('pre-data');
    }

    if (typeof renderFidelitySection === 'function') {
        if (typeof updateLoading === 'function') updateLoading('Calculando análise de fidelidade…');
        if (typeof yieldUI === 'function') await yieldUI();
        renderFidelitySection();
    }

    if (typeof hideLoading === 'function') hideLoading();
}

/**
 * Exibe (ou esconde) o banner amarelo que avisa sobre registros sem documento,
 * provavelmente vindos de nós colapsados na exportação do cubo Benner.
 */
function renderValidacaoBanner(qtde, valorAfetado) {
    let banner = document.getElementById('validacao-banner');
    if (qtde === 0) {
        if (banner) banner.style.display = 'none';
        return;
    }

    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'validacao-banner';
        banner.style.cssText = [
            'background:#FFF3CD',
            'border:1px solid #FFE69C',
            'border-left:4px solid #E66C37',
            'color:#664D03',
            'padding:10px 16px',
            'margin:10px 18px 0 18px',
            'border-radius:4px',
            'font-size:13px',
            'font-family:Roboto, sans-serif',
            'display:flex',
            'align-items:center',
            'gap:10px'
        ].join(';');

        // Insere logo no início da área principal de canvas
        const main = document.querySelector('.main-canvas') || document.body;
        main.insertBefore(banner, main.firstChild);
    }

    const valorFmt = formatter.format(valorAfetado);
    banner.innerHTML =
        `<span style="font-size:18px;">⚠️</span>` +
        `<div style="flex:1;">` +
        `<strong>${qtde} registro(s) sem documento (CNPJ/CPF) detectado(s)</strong> — ` +
        `${valorFmt} de faturamento sem detalhamento de cliente. ` +
        `<span style="color:#856404;">Provavelmente nós colapsados no cubo Benner. ` +
        `Veja detalhes no console (F12) e re-expanda o ramo correspondente antes de re-exportar.</span>` +
        `</div>` +
        `<button type="button" id="validacao-banner-close" style="background:transparent;border:none;font-size:18px;cursor:pointer;color:#664D03;" aria-label="Fechar">×</button>`;
    banner.style.display = 'flex';

    const closeBtn = document.getElementById('validacao-banner-close');
    if (closeBtn) closeBtn.addEventListener('click', () => banner.style.display = 'none');
}

/**
 * Transforma as linhas brutas do CSV de metas em registros tidy
 * com Centro, Família, Mês, MetaValor e MetaQtd.
 * Popula globalMetas e dispara updateDashboard() se já houver base carregada.
 *
 * @param {Array[]} rows - Linhas parseadas pelo PapaParse (já com ano injetado na última coluna)
 */
function processMeData(rows) {
    if (rows.length < 3) return;

    let metas = [];
    const mesesOrdem = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

    for (let i = 0; i < rows.length; i++) {
        let row = rows[i];
        let centro         = String(row[0]).trim();
        let familiaProduto = String(row[1]).trim();
        let anoArquivo     = row[row.length - 1];

        if (!centro || centro === "" ||
            centro.toUpperCase().includes("TOTAL") ||
            centro.toUpperCase().includes("CENTRO DE CUSTO") ||
            centro.toUpperCase().includes("VALOR PROJETADO")) continue;

        let indexMes = 0;
        for (let c = 2; c < row.length - 3; c += 2) {
            let val = parseFloat(String(row[c]   || "0").replace(/\./g, "").replace(",", ".")) || 0;
            let qtd = parseFloat(String(row[c+1] || "0").replace(/\./g, "").replace(",", ".")) || 0;

            if ((val !== 0 || qtd !== 0) && indexMes < 12) {
                metas.push({
                    Ano:       anoArquivo,
                    Centro:    normalizeCentro(centro),
                    Familia:   familiaProduto,
                    Mes:       mesesOrdem[indexMes],
                    MetaValor: val,
                    MetaQtd:   qtd
                });
            }
            indexMes++;
            if (indexMes >= 12) break;
        }
    }

    globalMetas = metas;
    document.getElementById('meta-status').innerText = `Metas: ${globalMetas.length} reg.`;
    if (globalData.length > 0) updateDashboard();
}
