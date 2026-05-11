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
 * Popula o seletor de Ano-base com os anos disponíveis em globalData.
 * Default: penúltimo ano disponível (assim já há um "ano à frente" para comparar).
 */
function _popularAnoBase() {
    const sel = document.getElementById('fid-ano-base');
    if (!sel) return;

    const anos = [...new Set((globalData || []).map(d => d.Ano))].sort();
    if (anos.length === 0) {
        sel.innerHTML = '<option value="">Aguardando dados</option>';
        return;
    }

    const valorAtual = sel.value;
    sel.innerHTML = anos.map(a => `<option value="${a}">${a}</option>`).join('');

    if (valorAtual && anos.includes(valorAtual)) {
        sel.value = valorAtual;
    } else {
        // Default: penúltimo ano (deixa um "ano à frente" para análise de retenção)
        sel.value = anos[Math.max(0, anos.length - 2)];
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

/**
 * Detecta o último mês do "ano parcial" mais recente em globalData.
 * Ex: se 2026 só tem registros até Mai, retorna 4 (Mai, indexado em 0).
 * Iteração explícita (evita Math.max(...arr) que pode estourar pilha).
 */
function _ultimoMesId(ano) {
    let max = -1;
    const recs = globalData || [];
    for (let i = 0; i < recs.length; i++) {
        const d = recs[i];
        if (d.Ano !== ano) continue;
        const mesId = d.MesId !== undefined ? d.MesId : MESES_ORDEM.indexOf(d.Mes);
        if (mesId > max) max = mesId;
    }
    return max;
}

/**
 * Determina o intervalo de meses a considerar para um ano dado os filtros.
 * Retorna {from, to} com índices (0=Jan, 11=Dez), inclusivos em ambos os lados.
 */
function _intervaloMeses(ano, anos, modo2026) {
    const lastFull = _ultimoMesId(ano); // último mês com dado nesse ano
    if (lastFull < 0) return { from: 0, to: 11 };

    if (modo2026 === 'ano_cheio') {
        return { from: 0, to: 11 };
    }
    // mesmo_periodo: usa o último mês do ANO MAIS RECENTE como teto comum
    const anoMaisRecente = anos[anos.length - 1];
    const tetoComum = _ultimoMesId(anoMaisRecente);
    return { from: 0, to: tetoComum >= 0 ? tetoComum : lastFull };
}

/**
 * Soma faturamento por cliente em um ano (com janela de meses opcional).
 * Retorna um Map(chave => {valor, nome, registroExemplo}).
 */
function _faturamentoPorCliente(ano, mesFrom, mesTo, filtroSetor) {
    const map = new Map();
    const recs = globalData || [];

    // Obtém filtros globais da sidebar
    const fCentro = typeof window.getCheckedCentros === 'function' ? window.getCheckedCentros() : "ALL";
    const elUf = document.getElementById('filter-uf');
    const fUf = elUf ? elUf.value : "ALL";
    const fCliente = typeof window.getCheckedClientes === 'function' ? window.getCheckedClientes() : "ALL";

    for (const d of recs) {
        if (d.Ano !== ano) continue;
        const mesId = d.MesId !== undefined ? d.MesId : MESES_ORDEM.indexOf(d.Mes);
        if (mesId < mesFrom || mesId > mesTo) continue;

        // Aplica os filtros estruturais globais (ignora Mês para respeitar a Coorte)
        if (fCentro !== "ALL" && Array.isArray(fCentro) && !fCentro.includes(d.Centro)) continue;
        if (fUf !== "ALL" && d.UF !== fUf) continue;
        if (fCliente !== "ALL" && Array.isArray(fCliente) && !fCliente.includes(d.Cliente)) continue;

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
 * Calcula retenção entre o ano-base e cada um dos anos subsequentes.
 * Retorna array [{ano, retidos, total, taxa, valorRetido, valorPerdido}].
 */
function _calcularRetencao(filtros, anos) {
    const idxBase = anos.indexOf(filtros.anoBase);
    if (idxBase < 0) return [];

    const intBase = _intervaloMeses(filtros.anoBase, anos, filtros.modo2026);
    const fatBase = _faturamentoPorCliente(filtros.anoBase, intBase.from, intBase.to, filtros.setor);
    const coorte  = _definirCoorte(fatBase, filtros);

    const valorCoorteTotal = [...coorte].reduce((s,k) => s + (fatBase.get(k)?.valor || 0), 0);

    const resultado = [];
    // Ponto inicial: o próprio ano-base (100% trivial, mas serve para o gráfico)
    resultado.push({
        ano:           filtros.anoBase,
        retidos:       coorte.size,
        total:         coorte.size,
        taxa:          coorte.size === 0 ? 0 : 1,
        valorRetido:   valorCoorteTotal,
        valorPerdido:  0,
        isBase:        true
    });

    for (let i = idxBase + 1; i < anos.length; i++) {
        const anoComp = anos[i];
        const intComp = _intervaloMeses(anoComp, anos, filtros.modo2026);
        const fatComp = _faturamentoPorCliente(anoComp, intComp.from, intComp.to, filtros.setor);

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
            ano:          anoComp,
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

    const anos = [...new Set(globalData.map(d => d.Ano))].sort();
    const retencao = _calcularRetencao(filtros, anos);

    _renderKPIs(retencao);
    _renderCoorteChart(retencao, filtros);
    _renderMatrizMigracao(anos, filtros);
    _renderGruposInstitucionais(anos, filtros);
    _renderListasAcionaveis(filtros, anos);
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
        xaxis: { categories: categorias, title: { text: 'Ano' } },
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

function _renderGruposInstitucionais(anos, filtros) {
    const head = document.getElementById('fid-grupos-head');
    const body = document.getElementById('fid-grupos-body');
    if (!head || !body) return;

    // Para cada ano, calcula a classificação institucional e contagens
    const porAno = {};
    anos.forEach(ano => {
        const intervalo = _intervaloMeses(ano, anos, filtros.modo2026);
        const fat = _faturamentoPorCliente(ano, intervalo.from, intervalo.to, filtros.setor);
        const grupos = _classificarGruposInstitucionais(fat);

        const stats = { '1A':{n:0,v:0}, '1B':{n:0,v:0}, '2A':{n:0,v:0}, '2B':{n:0,v:0}, '2C':{n:0,v:0}, 'EXT':{n:0,v:0}, 'TOTAL':{n:0,v:0} };
        grupos.forEach((g, k) => {
            const v = fat.get(k)?.valor || 0;
            stats[g].n++; stats[g].v += v;
            stats.TOTAL.n++; stats.TOTAL.v += v;
        });
        porAno[ano] = { stats, mapaClientes: grupos };
    });

    // Cabeçalho: Grupo | Definição | (#/R$ por ano) | (Ret % entre anos consecutivos)
    let headHtml = '<tr style="background-color:#0033A0; color:white;">';
    headHtml += '<th rowspan="2" style="padding:6px 10px; text-align:left;">Grupo</th>';
    headHtml += '<th rowspan="2" style="padding:6px 10px; text-align:left;">Definição</th>';
    anos.forEach((ano, i) => {
        const span = (i === 0) ? 2 : 3;
        headHtml += `<th colspan="${span}" style="padding:6px 8px; text-align:center; border-left:1px solid #002575;">${ano}</th>`;
    });
    headHtml += '</tr><tr style="background-color:#1F4E79; color:white;">';
    anos.forEach((ano, i) => {
        if (i > 0) headHtml += '<th style="padding:5px 6px; text-align:center; font-size:10px;">Retenção</th>';
        headHtml += '<th style="padding:5px 6px; text-align:center; font-size:10px;">Clientes</th>';
        headHtml += '<th style="padding:5px 6px; text-align:center; font-size:10px;">Faturamento</th>';
    });
    headHtml += '</tr>';
    head.innerHTML = headHtml;

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
        anos.forEach((ano, i) => {
            const stats = porAno[ano].stats[g];
            if (i > 0) {
                // Coluna de Retenção do ano anterior para este grupo
                const anoPrev = anos[i-1];
                const mapaPrev = porAno[anoPrev].mapaClientes;
                const mapaAtual = porAno[ano].mapaClientes;
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

function _renderMatrizMigracao(anos, filtros) {
    const selOrigem = document.getElementById('fid-migracao-ano-origem');
    const selDestino = document.getElementById('fid-migracao-ano-destino');
    if (!selOrigem || !selDestino || anos.length < 2) return;

    // Popula selects se vazios ou com opções antigas
    if (selOrigem.options.length <= 1 || selOrigem.options[0].value !== anos[0]) {
        selOrigem.innerHTML = anos.map(a => `<option value="${a}">${a}</option>`).join('');
        selDestino.innerHTML = anos.map(a => `<option value="${a}">${a}</option>`).join('');
        
        // Default: ano-base como origem, ano+1 como destino (se existir)
        selOrigem.value = filtros.anoBase || anos[anos.length - 2];
        const idxOrig = anos.indexOf(selOrigem.value);
        selDestino.value = (idxOrig >= 0 && idxOrig < anos.length - 1) ? anos[idxOrig + 1] : anos[anos.length - 1];

        // Se por algum motivo ficarem iguais, tenta corrigir
        if (selOrigem.value === selDestino.value && anos.length > 1) {
            selDestino.value = selOrigem.value === anos[0] ? anos[1] : anos[0];
        }

        // Attach event listeners (somente 1 vez, usando dataset pra controle)
        if (!selOrigem.dataset.listener) {
            const redraw = () => {
                const currentAnos = [...new Set((globalData || []).map(d => d.Ano))].sort();
                const curFiltros = _lerFiltrosFid();
                _renderMatrizMigracao(currentAnos, curFiltros);
                _renderListasAcionaveis(curFiltros, currentAnos);
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
        body.innerHTML = `<tr><td colspan="9" class="placeholder-text">Selecione anos diferentes para comparar a migração.</td></tr>`;
        head.innerHTML = '';
        return;
    }

    // Calcula os mapas de faturamento e classificação para os dois anos
    const intN = _intervaloMeses(anoN, anos, filtros.modo2026);
    const fatN = _faturamentoPorCliente(anoN, intN.from, intN.to, filtros.setor);
    const gruposN = _classificarGruposInstitucionais(fatN);

    const intN1 = _intervaloMeses(anoN1, anos, filtros.modo2026);
    const fatN1 = _faturamentoPorCliente(anoN1, intN1.from, intN1.to, filtros.setor);
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
    // Grupos Públicos (1) e Privados (2) e EXT
    const rank = {'1A':1, '1B':2, '2A':3, '2B':4, '2C':5, 'EXT':6};
    
    let bodyHtml = '';
    const renderLinha = (o, isEntrou) => {
        let rowHtml = `<tr style="border-bottom:1px solid #eee;">
            <td style="padding:6px 10px; font-weight:600; border-right:2px solid #ccc; background-color:#f5f6fb;">${o}</td>`;
        
        ordemDestino.forEach(d => {
            const count = matriz[o][d];
            const pct = totalOrigem[o] > 0 ? (count / totalOrigem[o] * 100).toFixed(1) : 0;
            
            let corFundo = '#ffffff';
            let corTexto = '#000000';
            let fontWeight = 'normal';

            if (count > 0) {
                if (isEntrou) {
                    corFundo = '#DDEBF7'; // Azul claro para novas entradas
                } else if (d === 'SAIU') {
                    corFundo = '#FCE4D6'; // Laranja claro para quem saiu
                    corTexto = '#C65911'; 
                } else if (o === d) {
                    corFundo = '#E2EFDA'; // Verde claro para quem ficou na mesma faixa
                    corTexto = '#385623';
                    fontWeight = '600';
                } else {
                    const idxO = rank[o];
                    const idxD = rank[d];
                    if (idxO && idxD) {
                        if (idxD < idxO) {
                            // Subiu de faixa (ex: 2C -> 2A) -> Positivo
                            corFundo = '#BDD7EE';
                        } else {
                            // Caiu de faixa -> Alerta
                            corFundo = '#FFF2CC'; 
                        }
                    }
                }
            }

            const cellText = count > 0 ? `${count}<br><span style="font-size:9px; color:#666;">${pct}%</span>` : `<span style="color:#ccc;">-</span>`;
            rowHtml += `<td style="padding:6px 10px; text-align:center; background-color:${corFundo}; color:${corTexto}; font-weight:${fontWeight};">${cellText}</td>`;
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

function _renderListasAcionaveis(filtros, anos) {
    if (anos.length < 2) return;
    
    // Ano Base (Origem) e Ano Comp (Destino, geralmente o mais recente)
    let anoBase = filtros.anoBase;
    let anoComp = anos[anos.length - 1]; 
    
    // Atrela ao filtro "Ano N" e "Ano N+1" da Matriz de Migração, se existirem
    const selOrigem = document.getElementById('fid-migracao-ano-origem');
    const selDestino = document.getElementById('fid-migracao-ano-destino');
    if (selOrigem && selOrigem.value) anoBase = selOrigem.value;
    if (selDestino && selDestino.value) anoComp = selDestino.value;

    if (anoBase === anoComp) {
        ['fid-lista-perdidos', 'fid-lista-campeoes', 'fid-lista-voltadores'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = `<tr><td colspan="2" class="placeholder-text">Selecione anos diferentes.</td></tr>`;
        });
        return;
    }

    const intBase = _intervaloMeses(anoBase, anos, filtros.modo2026);
    const fatBase = _faturamentoPorCliente(anoBase, intBase.from, intBase.to, filtros.setor);
    const coorteBase = _definirCoorte(fatBase, filtros);

    const intComp = _intervaloMeses(anoComp, anos, filtros.modo2026);
    const fatComp = _faturamentoPorCliente(anoComp, intComp.from, intComp.to, filtros.setor);
    const coorteComp = _definirCoorte(fatComp, filtros);

    const perdidos = [];
    const campeoes = [];
    const voltadores = [];

    // 1. Perdidos: na coorteBase, mas ZERO faturamento no anoComp
    coorteBase.forEach(k => {
        if (!fatComp.has(k) || fatComp.get(k).valor === 0) {
            perdidos.push({ chave: k, info: fatBase.get(k), valor: fatBase.get(k).valor });
        }
    });

    // 2. Novos Campeões: na coorteComp, mas não estavam na coorteBase
    coorteComp.forEach(k => {
        if (!coorteBase.has(k)) {
            campeoes.push({ chave: k, info: fatComp.get(k), valor: fatComp.get(k).valor });
        }
    });

    // 3. Voltadores: faturaram no anoComp, não no anoBase, E já tinham faturado antes do anoBase
    // Cria um Set com as chaves de todos os clientes que faturaram antes do anoBase
    const historicoClientes = new Set();
    const recs = globalData || [];

    const fCentro = typeof window.getCheckedCentros === 'function' ? window.getCheckedCentros() : "ALL";
    const elUf = document.getElementById('filter-uf');
    const fUf = elUf ? elUf.value : "ALL";
    const fCliente = typeof window.getCheckedClientes === 'function' ? window.getCheckedClientes() : "ALL";

    for (const d of recs) {
        if (d.Ano < anoBase && d.Valor > 0) {
            // Aplica os filtros estruturais globais (ignora Mês para respeitar a Coorte)
            if (fCentro !== "ALL" && Array.isArray(fCentro) && !fCentro.includes(d.Centro)) continue;
            if (fUf !== "ALL" && d.UF !== fUf) continue;
            if (fCliente !== "ALL" && Array.isArray(fCliente) && !fCliente.includes(d.Cliente)) continue;

            historicoClientes.add(chaveCliente(d));
        }
    }

    fatComp.forEach((info, k) => {
        if (!fatBase.has(k) || fatBase.get(k).valor === 0) {
            // Não existiu no ano base, mas existiu no ano de comparação
            if (historicoClientes.has(k)) {
                voltadores.push({ chave: k, info: info, valor: info.valor });
            }
        }
    });

    // Ordenar as listas (maior valor primeiro)
    perdidos.sort((a, b) => b.valor - a.valor);
    campeoes.sort((a, b) => b.valor - a.valor);
    voltadores.sort((a, b) => b.valor - a.valor);

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

