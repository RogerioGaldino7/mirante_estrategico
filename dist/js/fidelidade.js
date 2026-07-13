// =============================================================================
// fidelidade.js — Aba "Fidelidade": retenção e migração de clientes
// =============================================================================
// Depende de: state.js (globalData, chaveCliente, formatter), setor.js
//             (classificarSetor, setorPrincipal), ApexCharts (CDN)
//
// Responsabilidades:
//   • Popula filtros próprios da aba (ano-base, top-N, setor, granularidade...)
//   • Calcula coorte e taxa de retenção entre ano-base e anos subsequentes
//   • Renderiza 4 KPIs, gráfico de coorte e tabela de Grupos Institucionais
// =============================================================================

const MESES_ORDEM = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

let _fidelityFiltersInited = false;
let _fidelidadeAnosCache = [];
let _cachePerdidos = [];
let _cacheCampeoes = [];
let _cacheVoltadores = [];
let _drilldownActiveList = [];
let _drilldownActiveFlow = '';

/**
 * Garante que os filtros da aba estão populados e ligados.
 * Idempotente — pode ser chamado múltiplas vezes sem efeito colateral.
 */
function _initFidelityFilters() {
    if (_fidelityFiltersInited) {
        // Re-popula apenas o ano-base se já houver dados novos
        _popularAnoBase();
        return;
    }

    _popularAnoBase();

    // Liga listeners para todos os filtros próprios da aba
    const ids = ['fid-ano-base', 'fid-tipo-retencao', 'fid-top-n', 'fid-setor',
                 'fid-granularidade', 'fid-modo-2026'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', () => {
            _atualizarAvisoGranularidade();
            renderFidelitySection();
        });
    });

    _fidelityFiltersInited = true;
}

/**
 * Gera os períodos dinâmicos baseados na granularidade selecionada e na base de dados.
 */
function _gerarPeriodos(granularidade, modo2026) {
    const recs = globalData || [];
    if (recs.length === 0) return [];

    const anosUnicos = [...new Set(recs.map(d => d.Ano))].sort();
    
    // Calcula o teto global (último mês do ano mais recente)
    let tetoGlobal = 11;
    if (modo2026 === 'mesmo_periodo' && anosUnicos.length > 0) {
        const anoMaisRecente = anosUnicos[anosUnicos.length - 1];
        let max = -1;
        for (const d of recs) {
            if (d.Ano === anoMaisRecente) {
                const mid = d.MesId !== undefined ? d.MesId : MESES_ORDEM.indexOf(d.Mes);
                if (mid > max) max = mid;
            }
        }
        if (max >= 0) tetoGlobal = max;
    }

    const periodos = [];
    anosUnicos.forEach(ano => {
        let maxMesId = -1;
        for (const d of recs) {
            if (d.Ano === ano) {
                const mid = d.MesId !== undefined ? d.MesId : MESES_ORDEM.indexOf(d.Mes);
                if (mid > maxMesId) maxMesId = mid;
            }
        }
        if (maxMesId < 0) return;

        const maxConsiderado = (modo2026 === 'mesmo_periodo') ? Math.min(maxMesId, tetoGlobal) : maxMesId;
        
        const addP = (prefix, f, t) => {
            if (f > maxConsiderado && ano === anosUnicos[anosUnicos.length-1]) return;
            const tetoFinal = (modo2026 === 'mesmo_periodo') ? Math.min(t, maxConsiderado) : t;
            if (f <= tetoFinal) {
                periodos.push({ label: prefix, ano: ano, from: f, to: tetoFinal });
            }
        };

        if (granularidade === 'anual') { addP(ano, 0, 11); }
        else if (granularidade === 'semestral') { addP(`${ano}-S1`, 0, 5); addP(`${ano}-S2`, 6, 11); }
        else if (granularidade === 'trimestral') { addP(`${ano}-T1`, 0, 2); addP(`${ano}-T2`, 3, 5); addP(`${ano}-T3`, 6, 8); addP(`${ano}-T4`, 9, 11); }
        else if (granularidade === 'bimestral') { addP(`${ano}-B1`, 0, 1); addP(`${ano}-B2`, 2, 3); addP(`${ano}-B3`, 4, 5); addP(`${ano}-B4`, 6, 7); addP(`${ano}-B5`, 8, 9); addP(`${ano}-B6`, 10, 11); }
        else if (granularidade === 'mensal') { for (let i = 0; i <= 11; i++) addP(`${ano}-${MESES_ORDEM[i]}`, i, i); }
    });

    return periodos;
}

/**
 * Popula o seletor de Ano-base com os períodos disponíveis.
 */
function _popularAnoBase() {
    const sel = document.getElementById('fid-ano-base');
    if (!sel) return;

    const filtros = _lerFiltrosFid();
    const periodos = _gerarPeriodos(filtros.granularidade, filtros.modo2026);
    
    if (periodos.length === 0) {
        sel.innerHTML = '<option value="">Aguardando dados</option>';
        return;
    }

    const valorAtual = sel.value;
    sel.innerHTML = periodos.map(p => `<option value="${p.label}">${p.label}</option>`).join('');

    if (valorAtual && periodos.some(p => p.label === valorAtual)) {
        sel.value = valorAtual;
    } else {
        let defaultIdx = 0;
        if (filtros.granularidade === 'anual') defaultIdx = Math.max(0, periodos.length - 2);
        else if (filtros.granularidade === 'semestral') defaultIdx = Math.max(0, periodos.length - 3);
        else if (filtros.granularidade === 'trimestral') defaultIdx = Math.max(0, periodos.length - 5);
        else defaultIdx = Math.max(0, periodos.length - 2);
        sel.value = periodos[defaultIdx].label;
    }
}

function _atualizarAvisoGranularidade() {
    const gran = (document.getElementById('fid-granularidade') || {}).value;
    const aviso = document.getElementById('fid-aviso-granularidade');
    if (!aviso) return;
    aviso.style.display = (gran === 'mensal' || gran === 'bimestral') ? 'block' : 'none';
}

/**
 * Lê os filtros atuais da aba como um objeto único.
 */
function _lerFiltrosFid() {
    const get = (id, def) => (document.getElementById(id) || {}).value || def;
    return {
        anoBase:        get('fid-ano-base', ''),
        tipoRetencao:   get('fid-tipo-retencao', 'binaria'),
        topN:           get('fid-top-n', '100'),
        setor:          get('fid-setor', 'TODOS'),
        granularidade:  get('fid-granularidade', 'anual'),
        modo2026:       get('fid-modo-2026', 'mesmo_periodo')
    };
}

// -----------------------------------------------------------------------------
// Cálculos: agregação por cliente, identificação de coorte, retenção
// -----------------------------------------------------------------------------

// Funções antigas _ultimoMesId e _intervaloMeses foram absorvidas por _gerarPeriodos

/**
 * Soma faturamento por cliente em um período.
 * Retorna um Map(chave => {valor, nome, registroExemplo}).
 */
function _faturamentoPorCliente(periodo, filtroSetor) {
    const map = new Map();
    const recs = globalData || [];

    const fCentro = typeof window.getCheckedCentros === 'function' ? window.getCheckedCentros() : "ALL";
    const setCentro = fCentro !== "ALL" && Array.isArray(fCentro) ? new Set(fCentro) : null;
    
    const elUf = document.getElementById('filter-uf');
    const fUf = elUf ? elUf.value : "ALL";
    
    const fCliente = typeof window.getCheckedClientes === 'function' ? window.getCheckedClientes() : "ALL";
    const setCliente = fCliente !== "ALL" && Array.isArray(fCliente) ? new Set(fCliente) : null;

    for (const d of recs) {
        if (d.Ano !== periodo.ano) continue;
        const mesId = d.MesId !== undefined ? d.MesId : MESES_ORDEM.indexOf(d.Mes);
        if (mesId < periodo.from || mesId > periodo.to) continue;

        // Aplica os filtros estruturais globais O(1) usando Set
        if (setCentro && !setCentro.has(d.Centro)) continue;
        if (fUf !== "ALL" && d.UF !== fUf) continue;
        if (setCliente && !setCliente.has(d.Cliente)) continue;

        // Filtro de setor (Público/Privado/Exterior/Todos)
        if (filtroSetor && filtroSetor !== 'TODOS') {
            const sp = setorPrincipal(d);
            if (sp !== filtroSetor) continue;
        }

        const k = chaveCliente(d);
        if (!map.has(k)) {
            map.set(k, { valor: 0, nome: d.Cliente, exemplo: d });
        }
        map.get(k).valor += (d.Valor || 0);
    }
    return map;
}

/**
 * Classifica clientes em Grupos Institucionais (1A, 1B, 2A, 2B, 2C, EXT) para
 * um determinado ano. Retorna Map(chave => grupo).
 *
 * Critérios (do Plano de Fidelização TECPAR):
 *   1A: público,  >= 6%   da receita total do ano
 *   1B: público,  <  6%
 *   2A: privado, >  1%
 *   2B: privado, 0,1% – 0,999%
 *   2C: privado, <  0,1%
 *   EXT: exterior (fora dos critérios brasileiros)
 */
function _classificarGruposInstitucionais(faturamentoMap) {
    const totalAno = [...faturamentoMap.values()].reduce((s,o) => s + o.valor, 0);
    if (totalAno === 0) return new Map();

    const grupos = new Map();
    faturamentoMap.forEach((info, chave) => {
        const pct = info.valor / totalAno;
        const sp = setorPrincipal(info.exemplo);
        let grupo;
        if (sp === 'EXTERIOR')      grupo = 'EXT';
        else if (sp === 'PUBLICO')  grupo = (pct >= 0.06) ? '1A' : '1B';
        else                        grupo = (pct >  0.01) ? '2A'
                                          : (pct >= 0.001) ? '2B'
                                          : '2C';
        grupos.set(chave, grupo);
    });
    return grupos;
}

/**
 * Define a coorte do ano-base segundo os filtros.
 * Retorna Set(chaves) representando os clientes que fazem parte dela.
 */
function _definirCoorte(faturamentoBase, filtros) {
    const top = filtros.topN;
    if (top === 'GRUPOS') {
        // Para análise por grupo, a coorte é "todos os clientes do ano-base classificáveis"
        return new Set(faturamentoBase.keys());
    }
    if (top === 'ALL') {
        return new Set(faturamentoBase.keys());
    }
    const n = parseInt(top, 10) || 100;
    const ranked = [...faturamentoBase.entries()].sort((a,b) => b[1].valor - a[1].valor);
    return new Set(ranked.slice(0, n).map(([k]) => k));
}

/**
 * Calcula retenção entre o período-base e cada um dos períodos subsequentes.
 * Retorna array [{ano, retidos, total, taxa, valorRetido, valorPerdido}].
 */
function _calcularRetencao(filtros, periodos) {
    const baseLabel = filtros.anoBase;
    const idxBase = periodos.findIndex(p => p.label === baseLabel);
    if (idxBase < 0) return [];

    const pBase = periodos[idxBase];
    const fatBase = _faturamentoPorCliente(pBase, filtros.setor);
    const coorte  = _definirCoorte(fatBase, filtros);

    const valorCoorteTotal = [...coorte].reduce((s,k) => s + (fatBase.get(k)?.valor || 0), 0);

    const resultado = [];
    // Ponto inicial: o próprio período-base (100% trivial, mas serve para o gráfico)
    resultado.push({
        ano:           pBase.label,
        retidos:       coorte.size,
        total:         coorte.size,
        taxa:          coorte.size === 0 ? 0 : 1,
        valorRetido:   valorCoorteTotal,
        valorPerdido:  0,
        isBase:        true
    });

    for (let i = idxBase + 1; i < periodos.length; i++) {
        const pAtual = periodos[i];
        const fatComp = _faturamentoPorCliente(pAtual, filtros.setor);

        // Computa coorteComp uma única vez para evitar recálculo dentro do loop
        const coorteComp = (filtros.tipoRetencao === 'topn')
            ? _definirCoorte(fatComp, filtros)
            : null;

        const isRetido = (k) => (filtros.tipoRetencao === 'topn')
            ? coorteComp.has(k)
            : fatComp.has(k);

        let retidos = 0;
        let valorRetido = 0;
        let valorPerdido = 0;
        coorte.forEach(k => {
            if (isRetido(k)) {
                retidos++;
                valorRetido += fatComp.get(k)?.valor || 0;
            } else {
                valorPerdido += fatBase.get(k)?.valor || 0;
            }
        });

        resultado.push({
            ano:          pAtual.label,
            retidos,
            total:        coorte.size,
            taxa:         coorte.size === 0 ? 0 : retidos / coorte.size,
            valorRetido,
            valorPerdido,
            isBase:       false
        });
    }
    return resultado;
}

// -----------------------------------------------------------------------------
// Renderização
// -----------------------------------------------------------------------------

/**
 * Função principal: orquestra cálculos e atualização visual da aba.
 */
function renderFidelitySection() {
    _initFidelityFilters();
    _atualizarAvisoGranularidade();

    if (!globalData || globalData.length === 0) {
        _renderPlaceholders();
        return;
    }

    const filtros = _lerFiltrosFid();
    if (!filtros.anoBase) {
        _renderPlaceholders();
        return;
    }

    const periodos = _gerarPeriodos(filtros.granularidade, filtros.modo2026);
    _fidelidadeAnosCache = periodos; 
    
    if (periodos.length === 0) {
        _renderPlaceholders();
        return;
    }

    const retencao = _calcularRetencao(filtros, periodos);

    _renderKPIs(retencao);
    _renderCoorteChart(retencao, filtros);
    _renderMatrizMigracao(periodos, filtros);
    _renderGruposInstitucionais(periodos, filtros);
    _renderListasAcionaveis(filtros, periodos);
}

function _renderPlaceholders() {
    ['fid-kpi-taxa','fid-kpi-retidos','fid-kpi-valor-retido','fid-kpi-valor-perdido']
        .forEach(id => { const el = document.getElementById(id); if (el) el.innerText = '-'; });

    const chartEl = document.querySelector('#fid-chart-coorte');
    if (chartEl) chartEl.innerHTML = '<p class="placeholder-text">Carregue as bases para visualizar a curva.</p>';
    if (charts['fid-coorte']) { charts['fid-coorte'].destroy(); charts['fid-coorte'] = null; }

    const migTbody = document.getElementById('fid-migracao-body');
    if (migTbody) migTbody.innerHTML = '<tr><td colspan="9" class="placeholder-text">Carregue as bases para visualizar.</td></tr>';
    const migThead = document.getElementById('fid-migracao-head');
    if (migThead) migThead.innerHTML = '';

    const tbody = document.getElementById('fid-grupos-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="placeholder-text">Carregue as bases para visualizar.</td></tr>';
    const thead = document.getElementById('fid-grupos-head');
    if (thead) thead.innerHTML = '';

    ['fid-lista-perdidos', 'fid-lista-campeoes', 'fid-lista-voltadores'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<tr><td colspan="2" class="placeholder-text">Aguardando dados...</td></tr>';
    });
}

function _renderKPIs(retencao) {
    if (retencao.length < 2) {
        // Coorte sem ano de comparação ainda
        const c = retencao[0];
        const elTaxa = document.getElementById('fid-kpi-taxa');
        const elTaxaSub = document.getElementById('fid-kpi-taxa-sub');
        if (elTaxa) elTaxa.innerText = '—';
        if (elTaxaSub) elTaxaSub.innerText = c ? `Coorte: ${c.total} clientes em ${c.ano}` : 'Sem dados';
        const elRetidos = document.getElementById('fid-kpi-retidos');
        if (elRetidos) elRetidos.innerText = c ? `${c.total}` : '0';
        const elRetidosSub = document.getElementById('fid-kpi-retidos-sub');
        if (elRetidosSub) elRetidosSub.innerText = 'Selecione um ano-base com ano subsequente';
        const elValRet = document.getElementById('fid-kpi-valor-retido');
        if (elValRet) elValRet.innerText = c ? formatter.format(c.valorRetido) : '-';
        const elValPerd = document.getElementById('fid-kpi-valor-perdido');
        if (elValPerd) elValPerd.innerText = '-';
        return;
    }

    // Compara o ano-base com o último ano disponível (mais recente)
    const base  = retencao[0];
    const comp  = retencao[retencao.length - 1];

    const elTaxa = document.getElementById('fid-kpi-taxa');
    if (elTaxa) elTaxa.innerText = (comp.taxa * 100).toFixed(1) + '%';
    const elTaxaSub = document.getElementById('fid-kpi-taxa-sub');
    if (elTaxaSub) elTaxaSub.innerText = `${base.ano} → ${comp.ano}`;

    const elRetidos = document.getElementById('fid-kpi-retidos');
    if (elRetidos) elRetidos.innerText = `${comp.retidos}`;
    const elRetidosSub = document.getElementById('fid-kpi-retidos-sub');
    if (elRetidosSub) elRetidosSub.innerText = `de ${comp.total} na coorte de ${base.ano}`;

    const elValRet = document.getElementById('fid-kpi-valor-retido');
    if (elValRet) elValRet.innerText = formatter.format(comp.valorRetido);

    const elValPerd = document.getElementById('fid-kpi-valor-perdido');
    if (elValPerd) elValPerd.innerText = formatter.format(comp.valorPerdido);
}

function _renderCoorteChart(retencao, filtros) {
    const el = document.querySelector('#fid-chart-coorte');
    if (!el) return;

    if (!retencao || retencao.length === 0) {
        el.innerHTML = '<p class="placeholder-text">Sem dados para a coorte.</p>';
        if (charts['fid-coorte']) { charts['fid-coorte'].destroy(); charts['fid-coorte'] = null; }
        return;
    }

    const categorias = retencao.map(r => r.ano);
    const taxas      = retencao.map(r => +(r.taxa * 100).toFixed(1));
    const counts     = retencao.map(r => r.retidos);

    const options = {
        chart: { type: 'line', height: 320, fontFamily: 'Roboto, sans-serif', toolbar: { show: false } },
        series: [
            { name: '% Retenção',  type: 'line', data: taxas },
            { name: 'Clientes',    type: 'column', data: counts }
        ],
        xaxis: { categories: categorias, title: { text: 'Período' } },
        yaxis: [
            {
                title: { text: '% Retenção' },
                min: 0, max: 100,
                labels: { formatter: v => v.toFixed(0) + '%' }
            },
            {
                opposite: true,
                title: { text: 'Clientes Retidos' },
                min: 0,
                labels: { formatter: v => Math.round(v).toString() }
            }
        ],
        stroke: { width: [3, 0], curve: 'smooth' },
        markers: { size: [6, 0] },
        colors: ['#0033A0', '#E66C37'],
        dataLabels: { enabled: true, enabledOnSeries: [0], formatter: v => v.toFixed(1) + '%' },
        legend: { position: 'top' },
        tooltip: {
            shared: true, intersect: false,
            y: [
                { formatter: v => v.toFixed(1) + '%' },
                { formatter: v => v + ' clientes' }
            ]
        },
        title: {
            text: `Coorte de ${filtros.anoBase} — ${_descricaoCoorte(filtros)}`,
            align: 'left',
            style: { fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: '13px' }
        }
    };

    if (charts['fid-coorte']) { charts['fid-coorte'].destroy(); }
    charts['fid-coorte'] = new ApexCharts(el, options);
    charts['fid-coorte'].render();
}

function _descricaoCoorte(filtros) {
    const top = filtros.topN;
    let coorteDesc = (top === 'GRUPOS' || top === 'ALL') ? 'Todos os clientes' : `Top ${top}`;
    const setorDesc = filtros.setor === 'TODOS' ? '' : ` · ${filtros.setor.toLowerCase()}`;
    const tipoDesc = filtros.tipoRetencao === 'topn' ? ' · persistência' : ' · retenção binária';
    return coorteDesc + setorDesc + tipoDesc;
}

function _renderGruposInstitucionais(periodos, filtros) {
    const thead = document.getElementById('fid-grupos-head');
    const body = document.getElementById('fid-grupos-body');
    if (!thead || !body) return;

    if (periodos.length === 0) return;

    // Filtra período base para frente, limitando a max 5 colunas para não estourar layout
    let idxBase = periodos.findIndex(p => p.label === filtros.anoBase);
    if (idxBase < 0) idxBase = 0;
    const periodosVisiveis = periodos.slice(idxBase, idxBase + 5);

    let theadHtml = '<tr><th style="width:120px;">Grupo Institucional</th><th>Definição</th>';
    periodosVisiveis.forEach((p, i) => {
        if (i > 0) theadHtml += `<th style="text-align:center;" title="Retenção deste grupo em relação ao período anterior">Retenção</th>`;
        theadHtml += `<th style="text-align:center;">Qtd ${p.label}</th><th style="text-align:right;">Fat. ${p.label}</th>`;
    });
    theadHtml += '</tr>';
    thead.innerHTML = theadHtml;

    // Calcula faturamento/classificação por período
    const porPeriodo = {};
    periodosVisiveis.forEach(p => {
        const fat = _faturamentoPorCliente(p, filtros.setor);
        const grupos = _classificarGruposInstitucionais(fat);

        const stats = { '1A':{n:0,v:0}, '1B':{n:0,v:0}, '2A':{n:0,v:0}, '2B':{n:0,v:0}, '2C':{n:0,v:0}, 'EXT':{n:0,v:0}, 'TOTAL':{n:0,v:0} };
        grupos.forEach((g, k) => {
            const v = fat.get(k)?.valor || 0;
            stats[g].n++; stats[g].v += v;
            stats.TOTAL.n++; stats.TOTAL.v += v;
        });
        porPeriodo[p.label] = { stats, mapaClientes: grupos };
    });

    const definicoes = {
        '1A':  'Público — Grandes (≥6%)',
        '1B':  'Público — Médios (<6%)',
        '2A':  'Privado — Grandes (>1%)',
        '2B':  'Privado — Médios (0,1–0,999%)',
        '2C':  'Privado — Pequenos (<0,1%)',
        'EXT': 'Exterior',
        'TOTAL': 'Total Geral'
    };
    const corGrupo = {
        '1A':'#0033A0', '1B':'#4472C4', '2A':'#00AD68', '2B':'#7DBE6E', '2C':'#A8D08D',
        'EXT':'#7030A0', 'TOTAL':'#000'
    };

    const ordemGrupos = ['1A','1B','2A','2B','2C','EXT','TOTAL'];
    let bodyHtml = '';
    ordemGrupos.forEach((g, idx) => {
        const isTotal = g === 'TOTAL';
        const bg = isTotal ? '#FFD966' : (idx % 2 === 0 ? '#f5f6fb' : '#ffffff');
        bodyHtml += `<tr style="background-color:${bg}; ${isTotal ? 'font-weight:700; border-top:2px solid #C9982C;' : ''}">`;
        bodyHtml += `<td style="padding:5px 10px; border-left:4px solid ${corGrupo[g]}; font-weight:${isTotal ? '700' : '600'};">${g}</td>`;
        bodyHtml += `<td style="padding:5px 10px; font-size:11px;">${definicoes[g]}</td>`;
        periodosVisiveis.forEach((p, i) => {
            const stats = porPeriodo[p.label].stats[g];
            if (i > 0) {
                // Coluna de Retenção do período anterior para este grupo
                const pPrev = periodosVisiveis[i-1];
                const mapaPrev = porPeriodo[pPrev.label].mapaClientes;
                const mapaAtual = porPeriodo[p.label].mapaClientes;
                let coortePrev, retidos = 0;
                if (g === 'TOTAL') {
                    coortePrev = new Set(mapaPrev.keys());
                    coortePrev.forEach(k => { if (mapaAtual.has(k)) retidos++; });
                } else {
                    coortePrev = new Set([...mapaPrev.entries()].filter(([_, gr]) => gr === g).map(([k]) => k));
                    coortePrev.forEach(k => { if (mapaAtual.has(k)) retidos++; });
                }
                const taxa = coortePrev.size > 0 ? (retidos / coortePrev.size * 100) : 0;
                const corTaxa = taxa >= 70 ? '#00AD68' : (taxa >= 40 ? '#FFC000' : '#E66C37');
                const txtTaxa = coortePrev.size > 0 ? `${taxa.toFixed(0)}%` : '—';
                bodyHtml += `<td style="padding:5px 6px; text-align:center; font-size:11px; color:${corTaxa}; font-weight:600;" title="${retidos}/${coortePrev.size} retidos">${txtTaxa}</td>`;
            }
            bodyHtml += `<td style="padding:5px 6px; text-align:center;">${stats.n}</td>`;
            bodyHtml += `<td style="padding:5px 8px; text-align:right; font-size:11px;">${stats.v ? formatter.format(stats.v) : '—'}</td>`;
        });
        bodyHtml += '</tr>';
    });

    body.innerHTML = bodyHtml;
}

// -----------------------------------------------------------------------------
// Matriz de Migração Institucional 5x5
// -----------------------------------------------------------------------------

function _renderMatrizMigracao(periodos, filtros) {
    const selOrigem = document.getElementById('fid-migracao-ano-origem');
    const selDestino = document.getElementById('fid-migracao-ano-destino');
    if (!selOrigem || !selDestino || periodos.length < 2) return;

    // Popula selects se vazios ou com opções antigas
    if (selOrigem.options.length <= 1 || selOrigem.options[0].value !== periodos[0].label) {
        selOrigem.innerHTML = periodos.map(p => `<option value="${p.label}">${p.label}</option>`).join('');
        selDestino.innerHTML = periodos.map(p => `<option value="${p.label}">${p.label}</option>`).join('');
        
        // Default: período-base como origem, p+1 como destino
        selOrigem.value = filtros.anoBase || periodos[periodos.length - 2].label;
        const idxOrig = periodos.findIndex(p => p.label === selOrigem.value);
        selDestino.value = (idxOrig >= 0 && idxOrig < periodos.length - 1) ? periodos[idxOrig + 1].label : periodos[periodos.length - 1].label;

        // Se por algum motivo ficarem iguais, tenta corrigir
        if (selOrigem.value === selDestino.value && periodos.length > 1) {
            selDestino.value = selOrigem.value === periodos[0].label ? periodos[1].label : periodos[0].label;
        }

        // Attach event listeners
        if (!selOrigem.dataset.listener) {
            const redraw = () => {
                const curFiltros = _lerFiltrosFid();
                const currentPeriodos = _gerarPeriodos(curFiltros.granularidade, curFiltros.modo2026);
                if (typeof window.fecharDrillDown === 'function') window.fecharDrillDown();
                _renderMatrizMigracao(currentPeriodos, curFiltros);
                _renderListasAcionaveis(curFiltros, currentPeriodos);
            };
            selOrigem.addEventListener('change', redraw);
            selDestino.addEventListener('change', redraw);
            selOrigem.dataset.listener = "true";
        }
    }

    const anoN = selOrigem.value;
    const anoN1 = selDestino.value;

    const head = document.getElementById('fid-migracao-head');
    const body = document.getElementById('fid-migracao-body');
    if (!head || !body) return;

    if (anoN === anoN1) {
        body.innerHTML = `<tr><td colspan="9" class="placeholder-text">Selecione períodos diferentes para comparar a migração.</td></tr>`;
        head.innerHTML = '';
        return;
    }

    const pN = periodos.find(p => p.label === anoN);
    const pN1 = periodos.find(p => p.label === anoN1);

    const fatN = _faturamentoPorCliente(pN, filtros.setor);
    const gruposN = _classificarGruposInstitucionais(fatN);

    const fatN1 = _faturamentoPorCliente(pN1, filtros.setor);
    const gruposN1 = _classificarGruposInstitucionais(fatN1);

    const categorias = ['1A', '1B', '2A', '2B', '2C', 'EXT'];
    const ordemOrigem = [...categorias];
    const ordemDestino = [...categorias, 'SAIU']; // colunas

    // Inicializa a matriz de contagem
    const matriz = {};
    const totalOrigem = {};
    ordemOrigem.forEach(o => {
        matriz[o] = {};
        ordemDestino.forEach(d => matriz[o][d] = 0);
        totalOrigem[o] = 0;
    });
    // Tratar 'ENTROU'
    matriz['ENTROU'] = {};
    ordemDestino.forEach(d => matriz['ENTROU'][d] = 0);
    totalOrigem['ENTROU'] = 0;

    // Popula a matriz com as migrações cliente a cliente
    const todasChaves = new Set([...gruposN.keys(), ...gruposN1.keys()]);
    todasChaves.forEach(k => {
        const origem = gruposN.get(k);
        const destino = gruposN1.get(k);

        if (origem && destino) {
            matriz[origem][destino]++;
            totalOrigem[origem]++;
        } else if (origem && !destino) {
            matriz[origem]['SAIU']++;
            totalOrigem[origem]++;
        } else if (!origem && destino) {
            matriz['ENTROU'][destino]++;
            totalOrigem['ENTROU']++;
        }
    });

    // Renderiza a tabela
    let headHtml = `<tr style="background-color:#0033A0; color:white;">
        <th style="padding:6px 10px; text-align:left; border-right:2px solid white;">Origem (${anoN}) ↓ \\ Destino (${anoN1}) →</th>`;
    ordemDestino.forEach(d => {
        headHtml += `<th style="padding:6px 10px; text-align:center;">${d}</th>`;
    });
    headHtml += `<th style="padding:6px 10px; text-align:center; border-left:2px solid white; background-color:#1F4E79;">Total Origem</th></tr>`;
    head.innerHTML = headHtml;

    // Índices de hierarquia para saber se o cliente subiu ou caiu de faixa
    const rank = {'1A':1, '1B':2, '2A':3, '2B':4, '2C':5, 'EXT':6};
    
    const descricoes = {
        '1A': 'Público ≥ 6%',
        '1B': 'Público < 6%',
        '2A': 'Privado > 1%',
        '2B': 'Privado 0,1% – 0,999%',
        '2C': 'Privado < 0,1%',
        'EXT': 'Exterior'
    };

    let bodyHtml = '';
    const renderLinha = (o, isEntrou) => {
        const descHtml = descricoes[o] ? ` <span style="font-size:11px; font-weight:normal; color:#666;">(${descricoes[o]})</span>` : '';
        let rowHtml = `<tr style="border-bottom:1px solid #eee;">
            <td style="padding:6px 10px; font-weight:700; border-right:2px solid #ccc; background-color:#f5f6fb;">${o}${descHtml}</td>`;
        
        ordemDestino.forEach(d => {
            const count = matriz[o][d];
            const pct = totalOrigem[o] > 0 ? (count / totalOrigem[o] * 100).toFixed(1) : 0;
            
            let classeCel = '';
            let clickAttr = '';

            if (count > 0) {
                let catCel = '';
                if (isEntrou) {
                    catCel = 'migracao-celula-entrou';
                } else if (d === 'SAIU') {
                    catCel = 'migracao-celula-saiu';
                } else if (o === d) {
                    catCel = 'migracao-celula-igual';
                } else {
                    const idxO = rank[o];
                    const idxD = rank[d];
                    if (idxO && idxD) {
                        if (idxD < idxO) {
                            catCel = 'migracao-celula-subiu';
                        } else {
                            catCel = 'migracao-celula-caiu';
                        }
                    }
                }
                classeCel = `class="migracao-celula-interativa ${catCel}"`;
                clickAttr = `onclick="window._exibirDrillDownClientes('${o}', '${d}', this)"`;
            }

            const cellText = count > 0 ? `${count}<br><span style="font-size:9px; opacity:0.8;">${pct}%</span>` : `<span style="color:#ccc;">-</span>`;
            rowHtml += `<td ${classeCel} ${clickAttr}>${cellText}</td>`;
        });
        
        rowHtml += `<td style="padding:6px 10px; text-align:center; font-weight:600; border-left:2px solid #ccc; background-color:#f5f6fb;">${totalOrigem[o]}</td></tr>`;
        return rowHtml;
    };

    ordemOrigem.forEach(o => bodyHtml += renderLinha(o, false));
    bodyHtml += renderLinha('ENTROU', true);

    body.innerHTML = bodyHtml;
}

// -----------------------------------------------------------------------------
// Listas Acionáveis (Onda 3)
// -----------------------------------------------------------------------------

function _renderListasAcionaveis(filtros, periodos) {
    if (periodos.length < 2) return;
    
    // Período Base (Origem) e Período Comp (Destino, geralmente o mais recente)
    let anoBase = filtros.anoBase;
    let anoComp = periodos[periodos.length - 1].label; 
    
    // Atrela ao filtro "Ano N" e "Ano N+1" da Matriz de Migração, se existirem
    const selOrigem = document.getElementById('fid-migracao-ano-origem');
    const selDestino = document.getElementById('fid-migracao-ano-destino');
    if (selOrigem && selOrigem.value) anoBase = selOrigem.value;
    if (selDestino && selDestino.value) anoComp = selDestino.value;

    if (anoBase === anoComp) {
        ['fid-lista-perdidos', 'fid-lista-campeoes', 'fid-lista-voltadores'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = `<tr><td colspan="2" class="placeholder-text">Selecione períodos diferentes.</td></tr>`;
        });
        return;
    }

    const pBase = periodos.find(p => p.label === anoBase);
    const fatBase = _faturamentoPorCliente(pBase, filtros.setor);
    const coorteBase = _definirCoorte(fatBase, filtros);

    const pComp = periodos.find(p => p.label === anoComp);
    const fatComp = _faturamentoPorCliente(pComp, filtros.setor);
    const coorteComp = _definirCoorte(fatComp, filtros);

    const perdidos = [];
    const campeoes = [];
    const voltadores = [];

    // 1. Perdidos: na coorteBase, mas ZERO faturamento no anoComp
    coorteBase.forEach(k => {
        if (!fatComp.has(k) || fatComp.get(k).valor === 0) {
            const inf = fatBase.get(k);
            perdidos.push({
                chave: k,
                info: inf,
                valor: inf.valor,
                doc: inf.exemplo?.CNPJ || '',
                tipoDoc: inf.exemplo?.TipoDocumento || 'ND',
                valorN: inf.valor,
                valorN1: 0,
                delta: -inf.valor,
                deltaPct: -100
            });
        }
    });

    // 2. Novos Campeões: na coorteComp, mas não estavam na coorteBase
    coorteComp.forEach(k => {
        if (!coorteBase.has(k)) {
            const inf = fatComp.get(k);
            const valBase = fatBase.has(k) ? fatBase.get(k).valor : 0;
            const deltaVal = inf.valor - valBase;
            const deltaPct = valBase > 0 ? (deltaVal / valBase * 100) : 100;
            campeoes.push({
                chave: k,
                info: inf,
                valor: inf.valor,
                doc: inf.exemplo?.CNPJ || '',
                tipoDoc: inf.exemplo?.TipoDocumento || 'ND',
                valorN: valBase,
                valorN1: inf.valor,
                delta: deltaVal,
                deltaPct: deltaPct
            });
        }
    });

    // 3. Voltadores: faturaram no período de comp, não no período base, E já tinham faturado ANTES do período base
    // Cria um Set com as chaves de todos os clientes que faturaram antes do período base
    const historicoClientes = new Set();
    const recs = globalData || [];

    const fCentro = typeof window.getCheckedCentros === 'function' ? window.getCheckedCentros() : "ALL";
    const setCentro = fCentro !== "ALL" && Array.isArray(fCentro) ? new Set(fCentro) : null;
    
    const elUf = document.getElementById('filter-uf');
    const fUf = elUf ? elUf.value : "ALL";
    
    const fCliente = typeof window.getCheckedClientes === 'function' ? window.getCheckedClientes() : "ALL";
    const setCliente = fCliente !== "ALL" && Array.isArray(fCliente) ? new Set(fCliente) : null;

    for (const d of recs) {
        const mid = d.MesId !== undefined ? d.MesId : MESES_ORDEM.indexOf(d.Mes);
        const antesDoBase = d.Ano < pBase.ano || (d.Ano === pBase.ano && mid < pBase.from);

        if (antesDoBase && d.Valor > 0) {
            // Aplica os filtros estruturais globais O(1) usando Set
            if (setCentro && !setCentro.has(d.Centro)) continue;
            if (fUf !== "ALL" && d.UF !== fUf) continue;
            if (setCliente && !setCliente.has(d.Cliente)) continue;

            historicoClientes.add(chaveCliente(d));
        }
    }

    fatComp.forEach((info, k) => {
        if (!fatBase.has(k) || fatBase.get(k).valor === 0) {
            // Não existiu no ano base, mas existiu no ano de comparação
            if (historicoClientes.has(k)) {
                voltadores.push({
                    chave: k,
                    info: info,
                    valor: info.valor,
                    doc: info.exemplo?.CNPJ || '',
                    tipoDoc: info.exemplo?.TipoDocumento || 'ND',
                    valorN: 0,
                    valorN1: info.valor,
                    delta: info.valor,
                    deltaPct: 100
                });
            }
        }
    });

    // Ordenar as listas (maior valor primeiro)
    perdidos.sort((a, b) => b.valor - a.valor);
    campeoes.sort((a, b) => b.valor - a.valor);
    voltadores.sort((a, b) => b.valor - a.valor);

    // Guardar nos caches para exportação posterior
    _cachePerdidos = perdidos;
    _cacheCampeoes = campeoes;
    _cacheVoltadores = voltadores;

    // Função de renderização para as tabelas (similar ao Top 15)
    const renderTable = (id, lista, msgVazia) => {
        const tbody = document.getElementById(id);
        if (!tbody) return;
        if (lista.length === 0) {
            tbody.innerHTML = `<tr><td colspan="2" class="placeholder-text">${msgVazia}</td></tr>`;
            return;
        }

        const top15 = lista.slice(0, 15);
        let html = '';
        top15.forEach((item, idx) => {
            const nomeStr = item.info.nome || item.chave;
            html += `<tr class="ranking-row">
                <td class="ranking-name" data-rank="${idx + 1}"><span class="ranking-name-text" title="${nomeStr}">${nomeStr}</span></td>
                <td class="ranking-value">${formatter.format(item.valor)}</td>
            </tr>`;
        });
        tbody.innerHTML = html;
    };

    renderTable('fid-lista-perdidos', perdidos, 'Nenhum cliente perdido na coorte.');
    renderTable('fid-lista-campeoes', campeoes, 'Nenhum novo campeão neste Top N.');
    renderTable('fid-lista-voltadores', voltadores, 'Nenhum cliente resgatado.');
}

// -----------------------------------------------------------------------------
// Inicialização: garante registro do listener para quando o tab estiver aberto
// na primeira renderização. Como a aba começa escondida, a chamada inicial vem
// de switchTab() em index.html.
// -----------------------------------------------------------------------------

// =============================================================================
// Drill-down de Clientes da Matriz de Migração (Onda 2)
// =============================================================================

window._exibirDrillDownClientes = function(origem, destino, elemento) {
    // 1. Destaque visual da célula clicada
    document.querySelectorAll('.migracao-celula-interativa').forEach(el => {
        el.classList.remove('cell-active');
    });
    if (elemento) {
        elemento.classList.add('cell-active');
    }

    const selOrigem = document.getElementById('fid-migracao-ano-origem');
    const selDestino = document.getElementById('fid-migracao-ano-destino');
    if (!selOrigem || !selDestino) return;

    const anoN = selOrigem.value;
    const anoN1 = selDestino.value;
    const filtros = _lerFiltrosFid();

    // 2. Reprocessa os faturamentos e grupos exatamente como na matriz
    const currentPeriodos = _gerarPeriodos(filtros.granularidade, filtros.modo2026);
    const pN = currentPeriodos.find(p => p.label === anoN);
    const pN1 = currentPeriodos.find(p => p.label === anoN1);

    const fatN = _faturamentoPorCliente(pN, filtros.setor);
    const gruposN = _classificarGruposInstitucionais(fatN);

    const fatN1 = _faturamentoPorCliente(pN1, filtros.setor);
    const gruposN1 = _classificarGruposInstitucionais(fatN1);

    // 3. Filtra os clientes pertencentes a esta célula
    const todasChaves = new Set([...gruposN.keys(), ...gruposN1.keys()]);
    const clientesFiltrados = [];

    todasChaves.forEach(k => {
        const gN = gruposN.get(k);
        const gN1 = gruposN1.get(k);

        let match = false;
        let info = null;

        if (origem === 'ENTROU' && !gN && gN1 === destino) {
            match = true;
            info = fatN1.get(k);
        } else if (destino === 'SAIU' && gN === origem && !gN1) {
            match = true;
            info = fatN.get(k);
        } else if (gN === origem && gN1 === destino) {
            match = true;
            info = fatN.get(k) || fatN1.get(k);
        }

        if (match && info) {
            const valN = fatN.get(k)?.valor || 0;
            const valN1 = fatN1.get(k)?.valor || 0;
            const deltaVal = valN1 - valN;
            const deltaPct = valN > 0 ? (deltaVal / valN * 100) : 100;

            clientesFiltrados.push({
                chave: k,
                nome: info.nome || k,
                doc: info.exemplo?.CNPJ || '',
                tipoDoc: info.exemplo?.TipoDocumento || 'ND',
                valorN: valN,
                valorN1: valN1,
                delta: deltaVal,
                deltaPct: deltaPct
            });
        }
    });

    // Ordena por maior faturamento combinado (ou faturamento do ano ativo)
    clientesFiltrados.sort((a, b) => Math.max(b.valorN, b.valorN1) - Math.max(a.valorN, a.valorN1));

    // Salva para exportação posterior
    _drilldownActiveList = clientesFiltrados;
    _drilldownActiveFlow = `${origem} para ${destino} (${anoN} a ${anoN1})`;

    // 4. Renderiza na tabela
    document.getElementById('fid-drilldown-fluxo').innerText = `${origem} → ${destino}`;
    document.getElementById('fid-drilldown-ano-n').innerText = anoN;
    document.getElementById('fid-drilldown-ano-n1').innerText = anoN1;
    
    const tbody = document.getElementById('fid-drilldown-body');
    if (tbody) {
        if (clientesFiltrados.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="placeholder-text">Nenhum cliente neste fluxo.</td></tr>`;
        } else {
            tbody.innerHTML = clientesFiltrados.map(c => {
                const docMasc = mascararDocumento(c.doc, c.tipoDoc);
                const valNFmt = formatter.format(c.valorN);
                const valN1Fmt = formatter.format(c.valorN1);
                
                let deltaFmt = formatter.format(c.delta);
                let classDelta = 'delta-estavel';
                if (c.delta > 0) {
                    deltaFmt = `+${deltaFmt} (+${c.deltaPct.toFixed(1)}%)`;
                    classDelta = 'delta-positivo';
                } else if (c.delta < 0) {
                    deltaFmt = `${deltaFmt} (${c.deltaPct.toFixed(1)}%)`;
                    classDelta = 'delta-negativo';
                } else {
                    deltaFmt = `— (0.0%)`;
                }

                return `
                    <tr>
                        <td style="font-weight: 600;">${c.nome}</td>
                        <td style="font-family: monospace; font-size: 11px;">${docMasc || '—'}</td>
                        <td class="right">${valNFmt}</td>
                        <td class="right">${valN1Fmt}</td>
                        <td class="right ${classDelta}">${deltaFmt}</td>
                    </tr>
                `;
            }).join('');
        }
    }

    // 5. Exibe a seção de drill-down
    const container = document.getElementById('fid-migracao-drilldown');
    if (container) {
        container.style.display = 'block';
        container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
};

window.fecharDrillDown = function() {
    const container = document.getElementById('fid-migracao-drilldown');
    if (container) container.style.display = 'none';
    
    document.querySelectorAll('.migracao-celula-interativa').forEach(el => {
        el.classList.remove('cell-active');
    });
};

window.exportarDrillDownCsv = function() {
    if (!_drilldownActiveList || _drilldownActiveList.length === 0) {
        alert('Nenhum dado para exportar.');
        return;
    }

    const headers = ['Cliente', 'Documento', 'Faturamento Anterior', 'Faturamento Novo', 'Variacao (Delta)', 'Variacao (%)'];
    const rows = _drilldownActiveList.map(c => [
        c.nome,
        c.doc,
        c.valorN.toFixed(2),
        c.valorN1.toFixed(2),
        c.delta.toFixed(2),
        c.deltaPct.toFixed(1)
    ]);

    const csvContent = "\uFEFF" + [
        headers.join(';'),
        ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(';'))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `migracao_clientes_${_drilldownActiveFlow.toLowerCase().replace(/[^a-z0-9]/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.exportarListaAcionavel = function(tipo) {
    let lista = [];
    let titulo = '';
    
    if (tipo === 'perdidos') {
        lista = _cachePerdidos;
        titulo = 'clientes_perdidos_churn';
    } else if (tipo === 'campeoes') {
        lista = _cacheCampeoes;
        titulo = 'novos_campeoes';
    } else if (tipo === 'voltadores') {
        lista = _cacheVoltadores;
        titulo = 'clientes_resgatados_voltadores';
    }
    
    if (!lista || lista.length === 0) {
        alert('Nenhum dado para exportar.');
        return;
    }
    
    const selOrigem = document.getElementById('fid-migracao-ano-origem');
    const selDestino = document.getElementById('fid-migracao-ano-destino');
    const anoN = selOrigem ? selOrigem.value : '';
    const anoN1 = selDestino ? selDestino.value : '';
    
    const headers = ['Cliente', 'Documento', 'Faturamento Ano Base', 'Faturamento Ano Comparado', 'Variacao (Delta)', 'Variacao (%)'];
    const rows = lista.map(c => [
        c.info.nome || c.chave,
        c.doc,
        c.valorN.toFixed(2),
        c.valorN1.toFixed(2),
        c.delta.toFixed(2),
        c.deltaPct.toFixed(1)
    ]);
    
    const csvContent = "\uFEFF" + [
        headers.join(';'),
        ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(';'))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${titulo}_${anoN}_para_${anoN1}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

