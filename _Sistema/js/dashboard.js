// =============================================================================
// dashboard.js — Orquestrador principal: KPIs + gráficos + tabelas
// =============================================================================
// Depende de: state.js, filters.js, charts.js, tables.js
// Chamada por: filters.js (onChange), data-processor.js (após ETL)
// =============================================================================

/**
 * Atualiza o banner de contexto no topo do dashboard com os filtros ativos.
 * Mostra: Escopo de centros | Ano | Meses selecionados.
 */
function updateContextBanner() {
    const banner    = document.getElementById('context-banner');
    const bannerTxt = document.getElementById('context-banner-text');
    if (!banner || !bannerTxt) return;

    // --- Centro de Custo ---
    const fCentro       = window.getCheckedCentros();
    const totalCentros  = document.querySelectorAll('.centro-checkbox').length;
    const marcadosCentros = document.querySelectorAll('.centro-checkbox:checked').length;

    let centroTxt;
    if (fCentro === "ALL" || marcadosCentros === totalCentros) {
        centroTxt = 'Todas as Áreas';
    } else if (marcadosCentros === 1) {
        centroTxt = Array.from(document.querySelectorAll('.centro-checkbox:checked'))[0].value;
    } else if (marcadosCentros <= 3) {
        centroTxt = Array.from(document.querySelectorAll('.centro-checkbox:checked')).map(cb => cb.value).join(', ');
    } else {
        centroTxt = `${marcadosCentros} de ${totalCentros} centros selecionados`;
    }

    // --- Ano ---
    const fAno    = document.getElementById('filter-ano')?.value ?? 'ALL';
    const anoTxt  = fAno === 'ALL' ? 'Todos os Anos' : fAno;

    // --- Meses ---
    const mesesMarcados = Array.from(document.querySelectorAll('.mes-checkbox:checked')).map(cb => cb.value);
    const totalMeses    = document.querySelectorAll('.mes-checkbox').length;
    const mesesOrdem    = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    mesesMarcados.sort((a, b) => mesesOrdem.indexOf(a) - mesesOrdem.indexOf(b));

    let mesTxt;
    if (mesesMarcados.length === totalMeses) {
        mesTxt = 'Todos os Meses';
    } else if (mesesMarcados.length === 0) {
        mesTxt = 'Nenhum mês';
    } else if (mesesMarcados.length === 1) {
        mesTxt = mesesMarcados[0];
    } else {
        // Exibe como intervalo se forem consecutivos, ou lista se forem avulsos
        const idxs = mesesMarcados.map(m => mesesOrdem.indexOf(m));
        const isConsecutivo = idxs.every((v, i, arr) => i === 0 || v === arr[i - 1] + 1);
        mesTxt = isConsecutivo
            ? `${mesesMarcados[0]} – ${mesesMarcados[mesesMarcados.length - 1]}`
            : mesesMarcados.join(', ');
    }

    // --- UF ---
    const fUf   = document.getElementById('filter-uf')?.value ?? 'ALL';
    const ufTxt = fUf !== 'ALL' ? ` | UF: ${fUf}` : '';

    bannerTxt.textContent = `${centroTxt}  |  Ano: ${anoTxt}  |  Meses: ${mesTxt}${ufTxt}`;
    banner.style.display = 'flex';
}

/**
 * Função mestre de renderização. Recalcula todos os KPIs, redesenha gráficos
 * e atualiza matrizes e tabelas Top 15 com base nos filtros ativos.
 * Deve ser chamada sempre que qualquer filtro mudar ou novos dados forem carregados.
 */
function updateDashboard() {
    if (typeof window.updateFilterIndicator === 'function') window.updateFilterIndicator();
    const data = getFilteredData();
    if (data.length === 0) {
        // Zera os KPIs e avisa — em vez de travar silenciosamente no último estado
        ['kpi-faturamento','kpi-ticket'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = 'R$ 0,00';
        });
        ['kpi-quantidade'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = '0';
        });
        const mixEl0 = document.getElementById('kpi-mix');
        if (mixEl0) mixEl0.innerText = '-';
        ['kpi-meta-faturamento','kpi-meta-quantidade',
         'kpi-yoy-faturamento','kpi-yoy-quantidade'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = 'Nenhum dado no filtro atual';
        });
        ['kpi-prog-meta-parcial','kpi-prog-meta-acum',
         'kpi-prog-yoy-parcial','kpi-prog-yoy-acum'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = '-';
        });
        updateContextBanner();
        
        // --- NOVO: Zera tabelas e gráficos para mostrar que não há dados ---
        if (typeof renderList === 'function') {
            renderList('top-clientes', [], 'cliente', 'clientes');
            renderList('top-servicos', [], 'produto/serviço', 'produtos/serviços');
        }
        if (typeof renderChartMensal === 'function') renderChartMensal([]);
        if (typeof renderChartFamilia === 'function') renderChartFamilia([]);
        if (typeof renderMatrix === 'function') renderMatrix();
        if (typeof renderMatrixFamilias === 'function') renderMatrixFamilias();
        if (typeof clearOVSection === 'function') clearOVSection();

        return;
    }

    updateContextBanner();

    const metasFiltradas = getFilteredMetas();

    // -------------------------------------------------------------------------
    // 1. KPIs principais
    // -------------------------------------------------------------------------
    const faturamentoTotal = data.reduce((acc, curr) => acc + curr.Valor,      0);
    const qtdTotal         = data.reduce((acc, curr) => acc + curr.Quantidade, 0);

    document.getElementById('kpi-faturamento').innerText = formatter.format(faturamentoTotal);
    document.getElementById('kpi-quantidade').innerText  = qtdTotal.toLocaleString('pt-BR');

    // --- KPI Meta de Faturamento ---
    if (globalMetas.length === 0) {
        document.getElementById('kpi-meta-faturamento').innerText = "Meta Indisponível";
        document.getElementById('kpi-meta-faturamento').style.color = "#a19f9d";
        document.getElementById('kpi-meta-quantidade').innerText  = "Planejados: Indisponível";
        document.getElementById('kpi-meta-quantidade').style.color = "#a19f9d";
    } else {
        const metaFat = metasFiltradas.reduce((a, b) => a + b.MetaValor, 0);
        if (metaFat > 0) {
            const perc  = (faturamentoTotal / metaFat * 100).toFixed(1);
            const color = perc >= 100 ? '#00AD68' : '#E66C37';
            document.getElementById('kpi-meta-faturamento').innerHTML =
                `Meta: ${formatter.format(metaFat)} <span style="color:${color}; font-weight:600;">(${perc}%)</span>`;
        } else {
            document.getElementById('kpi-meta-faturamento').innerText = "Sem meta no filtro";
            document.getElementById('kpi-meta-faturamento').style.color = "#a19f9d";
        }

        const metaQtd = metasFiltradas.reduce((a, b) => a + b.MetaQtd, 0);
        if (metaQtd > 0) {
            const percQ  = (qtdTotal / metaQtd * 100).toFixed(1);
            const colorQ = percQ >= 100 ? '#00AD68' : '#E66C37';
            document.getElementById('kpi-meta-quantidade').innerHTML =
                `Planejados: ${metaQtd.toLocaleString('pt-BR')} un. <span style="color:${colorQ}; font-weight:600;">(${percQ}%)</span>`;
        } else {
            document.getElementById('kpi-meta-quantidade').innerText = "Sem planejados no filtro";
            document.getElementById('kpi-meta-quantidade').style.color = "#a19f9d";
        }
    }

    // -------------------------------------------------------------------------
    // 2. YoY — "Maçãs com Maçãs": compara somente os meses com dados reais
    // -------------------------------------------------------------------------
    const mesesComDados = [...new Set(data.filter(d => d.Valor > 0).map(d => d.Mes))];
    const filterAno     = document.getElementById('filter-ano')?.value ?? "ALL";

    if (filterAno !== "ALL" && !isNaN(parseInt(filterAno))) {
        const anoAnteriorStr = String(parseInt(filterAno) - 1);
        const prevData       = getFilteredDataByYear(anoAnteriorStr).filter(d => mesesComDados.includes(d.Mes));
        const hasPrevYear    = globalData.some(d => d.Ano === anoAnteriorStr);

        if (hasPrevYear) {
            const prevFat = prevData.reduce((acc, curr) => acc + curr.Valor,      0);
            const prevQtd = prevData.reduce((acc, curr) => acc + curr.Quantidade, 0);

            if (prevFat > 0) {
                const pFat = ((faturamentoTotal / prevFat) - 1) * 100;
                const cFat = pFat >= 0 ? '#00AD68' : '#E66C37';
                const sFat = pFat >= 0 ? '▲' : '▼';
                document.getElementById('kpi-yoy-faturamento').innerHTML =
                    `Ano Ant. Parcial (${anoAnteriorStr}): ${formatter.format(prevFat)} <span style="color:${cFat}; font-weight:600;">(${sFat} ${Math.abs(pFat).toFixed(1)}%)</span>`;
            } else {
                document.getElementById('kpi-yoy-faturamento').innerText = `Ano Ant. (${anoAnteriorStr}): R$ 0`;
            }

            if (prevQtd > 0) {
                const pQtd = ((qtdTotal / prevQtd) - 1) * 100;
                const cQtd = pQtd >= 0 ? '#00AD68' : '#E66C37';
                const sQtd = pQtd >= 0 ? '▲' : '▼';
                document.getElementById('kpi-yoy-quantidade').innerHTML =
                    `Ano Ant. Parcial (${anoAnteriorStr}): ${prevQtd.toLocaleString('pt-BR')} un. <span style="color:${cQtd}; font-weight:600;">(${sQtd} ${Math.abs(pQtd).toFixed(1)}%)</span>`;
            } else {
                document.getElementById('kpi-yoy-quantidade').innerText = `Ano Ant. (${anoAnteriorStr}): 0 un.`;
            }
        } else {
            document.getElementById('kpi-yoy-faturamento').innerText = "Ano Ant.: Arquivo não carregado";
            document.getElementById('kpi-yoy-quantidade').innerText  = "Ano Ant.: Arquivo não carregado";
        }
    } else {
        // Quando ALL: os KPIs pequenos de YoY não se aplicam
        const anosDisp = [...new Set(data.map(d => d.Ano))].filter(a => !isNaN(parseInt(a))).sort().reverse();
        if (anosDisp.length >= 2) {
            const anoMaisRecente = anosDisp[0];
            const anoAnterior    = anosDisp[1];
            const fatRecente = data.filter(d => d.Ano === anoMaisRecente).reduce((a, b) => a + b.Valor, 0);
            const mesesRef   = [...new Set(data.filter(d => d.Ano === anoMaisRecente && d.Valor > 0).map(d => d.Mes))];
            const prevData    = getFilteredDataByYear(anoAnterior).filter(d => mesesRef.includes(d.Mes));
            const prevFat     = prevData.reduce((a, b) => a + b.Valor, 0);

            if (prevFat > 0) {
                const pFat = ((fatRecente / prevFat) - 1) * 100;
                const cFat = pFat >= 0 ? '#00AD68' : '#E66C37';
                const sFat = pFat >= 0 ? '▲' : '▼';
                document.getElementById('kpi-yoy-faturamento').innerHTML =
                    `${anoMaisRecente} vs ${anoAnterior}: ${formatter.format(prevFat)} <span style="color:${cFat}; font-weight:600;">(${sFat} ${Math.abs(pFat).toFixed(1)}%)</span>`;
            } else {
                document.getElementById('kpi-yoy-faturamento').innerText = `Ano ${anoAnterior}: R$ 0`;
            }

            const prevQtd     = prevData.reduce((a, b) => a + b.Quantidade, 0);
            const qtdRecente  = data.filter(d => d.Ano === anoMaisRecente).reduce((a, b) => a + b.Quantidade, 0);
            if (prevQtd > 0) {
                const pQtd = ((qtdRecente / prevQtd) - 1) * 100;
                const cQtd = pQtd >= 0 ? '#00AD68' : '#E66C37';
                const sQtd = pQtd >= 0 ? '▲' : '▼';
                document.getElementById('kpi-yoy-quantidade').innerHTML =
                    `${anoMaisRecente} vs ${anoAnterior}: ${prevQtd.toLocaleString('pt-BR')} un. <span style="color:${cQtd}; font-weight:600;">(${sQtd} ${Math.abs(pQtd).toFixed(1)}%)</span>`;
            } else {
                document.getElementById('kpi-yoy-quantidade').innerText = `Ano ${anoAnterior}: 0 un.`;
            }
        } else {
            document.getElementById('kpi-yoy-faturamento').innerText = "Carregue 2+ anos para comparar";
            document.getElementById('kpi-yoy-quantidade').innerText  = "Carregue 2+ anos para comparar";
        }
    }

    // -------------------------------------------------------------------------
    // 3. Card azul: Faturamento / Meta
    // -------------------------------------------------------------------------
    const filterCentro = window.getCheckedCentros();
    const anoTextMeta  = filterAno !== "ALL" ? filterAno : "Anual";

    document.getElementById('kpi-prog-meta-title').innerText    = `Faturamento vs Meta ${anoTextMeta}`;
    document.getElementById('kpi-prog-meta-acum-lbl').innerText = `Acumulado ${anoTextMeta}(%):`;

    if (globalMetas.length > 0) {
        // Parcial: meta apenas para os meses que tiveram faturamento real
        const metaParcial = metasFiltradas.filter(m => mesesComDados.includes(m.Mes)).reduce((a, b) => a + b.MetaValor, 0);
        const percParcial = metaParcial > 0 ? (faturamentoTotal / metaParcial) * 100 : 0;
        document.getElementById('kpi-prog-meta-parcial').innerText =
            percParcial > 0 ? percParcial.toFixed(2).replace('.', ',') + '%' : "-";

        // Acumulado: meta do(s) ano(s) inteiro(s) (ignora filtro de mês para dar a proporção macro)
        let metaAnoInteiro;
        if (filterAno !== "ALL") {
            metaAnoInteiro = globalMetas
                .filter(m => m.Ano === filterAno && (filterCentro === "ALL" || (Array.isArray(filterCentro) && filterCentro.includes(m.Centro))))
                .reduce((a, b) => a + b.MetaValor, 0);
        } else {
            // ALL: soma metas de todos os anos que existem nos dados filtrados
            const anosNoDados = [...new Set(data.map(d => d.Ano))];
            metaAnoInteiro = globalMetas
                .filter(m => anosNoDados.includes(m.Ano) && (filterCentro === "ALL" || (Array.isArray(filterCentro) && filterCentro.includes(m.Centro))))
                .reduce((a, b) => a + b.MetaValor, 0);
        }
        const percAcum = metaAnoInteiro > 0 ? (faturamentoTotal / metaAnoInteiro) * 100 : 0;
        document.getElementById('kpi-prog-meta-acum').innerText =
            percAcum > 0 ? percAcum.toFixed(2).replace('.', ',') + '%' : "-";
    } else {
        document.getElementById('kpi-prog-meta-parcial').innerText = "Sem metas";
        document.getElementById('kpi-prog-meta-acum').innerText    = "Sem metas";
    }

    // -------------------------------------------------------------------------
    // 4. Card laranja: Faturamento Ano/Ano Anterior
    // -------------------------------------------------------------------------
    // Determina o ano de referência e o anterior
    let anoRef, anoAntStr;
    if (filterAno !== "ALL" && !isNaN(parseInt(filterAno))) {
        anoRef = filterAno;
        anoAntStr = String(parseInt(filterAno) - 1);
    } else {
        // ALL: detecta o ano mais recente nos dados filtrados
        const anosDisponiveis = [...new Set(data.map(d => d.Ano))].filter(a => !isNaN(parseInt(a))).sort().reverse();
        if (anosDisponiveis.length >= 2) {
            anoRef = anosDisponiveis[0];
            anoAntStr = anosDisponiveis[1];
        } else if (anosDisponiveis.length === 1) {
            anoRef = anosDisponiveis[0];
            anoAntStr = String(parseInt(anosDisponiveis[0]) - 1);
        } else {
            anoRef = null;
            anoAntStr = null;
        }
    }

    if (anoRef && anoAntStr) {
        const hasPrevYear = globalData.some(d => d.Ano === anoAntStr);

        document.getElementById('kpi-prog-yoy-title').innerText    = `Crescimento ${anoRef} vs ${anoAntStr}`;
        document.getElementById('kpi-prog-yoy-acum-lbl').innerText = `Acumulado ${anoAntStr}(%):`;

        if (hasPrevYear) {
            // Faturamento do ano de referência (apenas meses com dados reais)
            const fatAnoRef = data.filter(d => d.Ano === anoRef).reduce((a, b) => a + b.Valor, 0);
            const mesesComDadosRef = [...new Set(data.filter(d => d.Ano === anoRef && d.Valor > 0).map(d => d.Mes))];

            // Usa getFilteredDataByYear() (filters.js) para manter Centro/UF/Cliente/
            // Tipo de Operação consistentes com o restante do painel — filtrar
            // globalData diretamente aqui já causou divergência com o KPI principal
            // (ver renderMatrix/renderMatrixFamilias em tables.js).
            const prevParcial = getFilteredDataByYear(anoAntStr)
                .filter(d => mesesComDadosRef.includes(d.Mes))
                .reduce((a, b) => a + b.Valor, 0);

            const fatParaComparar = filterAno !== "ALL" ? faturamentoTotal : fatAnoRef;
            const percYoYParcial = prevParcial > 0 ? (fatParaComparar / prevParcial) * 100 : 0;
            document.getElementById('kpi-prog-yoy-parcial').innerText =
                percYoYParcial > 0 ? percYoYParcial.toFixed(2).replace('.', ',') + '%' : "-";

            const prevAnoInteiro = getFilteredDataByYear(anoAntStr)
                .reduce((a, b) => a + b.Valor, 0);

            const percYoYAcum = prevAnoInteiro > 0 ? (fatParaComparar / prevAnoInteiro) * 100 : 0;
            document.getElementById('kpi-prog-yoy-acum').innerText =
                percYoYAcum > 0 ? percYoYAcum.toFixed(2).replace('.', ',') + '%' : "-";
        } else {
            document.getElementById('kpi-prog-yoy-parcial').innerText = "Sem dados " + anoAntStr;
            document.getElementById('kpi-prog-yoy-acum').innerText    = "Sem dados " + anoAntStr;
        }
    } else {
        document.getElementById('kpi-prog-yoy-title').innerText   = "Crescimento vs Ano Anterior";
        document.getElementById('kpi-prog-yoy-parcial').innerText = "-";
        document.getElementById('kpi-prog-yoy-acum').innerText    = "-";
    }

    // -------------------------------------------------------------------------
    // 5. Ticket médio e Família líder
    // -------------------------------------------------------------------------
    document.getElementById('kpi-ticket').innerText = formatter.format(qtdTotal > 0 ? faturamentoTotal / qtdTotal : 0);

    // --- Mix Serviço × Produto (usa o campo TipoOperacao) ---
    // Serviço + Produto podem não somar 100%: o restante é "Não Classificado"
    // (bases antigas sem a coluna Operação de faturamento caem todas aqui).
    const fatServico = data.reduce((a, d) => a + (d.TipoOperacao === 'Serviço' ? d.Valor : 0), 0);
    const fatProduto = data.reduce((a, d) => a + (d.TipoOperacao === 'Produto' ? d.Valor : 0), 0);
    const mixEl  = document.getElementById('kpi-mix');
    const mixSub = document.getElementById('kpi-mix-sub');
    if (mixEl) {
        if (faturamentoTotal > 0) {
            const pServ = fatServico / faturamentoTotal * 100;
            const pProd = fatProduto / faturamentoTotal * 100;
            const pNaoClass = Math.max(0, 100 - pServ - pProd);
            mixEl.innerHTML =
                `<span style="color:var(--tecpar-green);">Serv ${pServ.toFixed(0)}%</span>` +
                ` · <span style="color:var(--tecpar-blue);">Prod ${pProd.toFixed(0)}%</span>`;
            if (mixSub) {
                mixSub.innerText = pNaoClass >= 0.5
                    ? `${pNaoClass.toFixed(0)}% não classificado`
                    : '% do faturamento';
            }
        } else {
            mixEl.innerText = '-';
            if (mixSub) mixSub.innerText = '% do faturamento';
        }
    }

    const agrupadoFamilia = groupBySum(data, 'Familia', 'Valor').sort((a, b) => b.valor - a.valor);

    // -------------------------------------------------------------------------
    // 6. Top 15 Clientes e Produtos/Serviços
    // -------------------------------------------------------------------------
    const agClientes = groupBySum(data, 'Cliente', 'Valor').filter(c => !c.chave.includes('IDENTIFICADO') && c.chave !== 'ND').sort((a, b) => b.valor - a.valor);
    const agServicos = groupBySum(data, 'Produto',  'Valor').sort((a, b) => b.valor - a.valor);
    renderList('top-clientes', agClientes, 'cliente',        'clientes');
    renderList('top-servicos', agServicos, 'produto/serviço', 'produtos/serviços');

    // -------------------------------------------------------------------------
    // 7. Gráficos e matrizes
    renderChartMensal(data);
    renderChartFamilia(agrupadoFamilia);
    renderMatrix();
    renderMatrixFamilias();
    
    // Atualiza a seção de OVs para respeitar os filtros
    if (typeof renderOVSection === 'function') renderOVSection();

    // Atualiza a aba de Clientes se estiver visível
    const tabClientes = document.getElementById('tab-clientes');
    if (tabClientes && tabClientes.style.display !== 'none' && typeof renderClientSection === 'function') {
        renderClientSection();
    }

    // Atualiza a aba de Fidelidade se estiver visível
    const tabFidelidade = document.getElementById('tab-fidelidade');
    if (tabFidelidade && tabFidelidade.style.display !== 'none' && typeof renderFidelitySection === 'function') {
        renderFidelitySection();
    }

    // Atualiza a aba de Configurações se estiver visível
    const tabConfig = document.getElementById('tab-config');
    if (tabConfig && tabConfig.style.display !== 'none') {
        if (typeof renderSetorReview === 'function') renderSetorReview();
        if (typeof renderTipoReview === 'function') renderTipoReview();
    }
}
