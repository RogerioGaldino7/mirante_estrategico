// =============================================================================
// clients.js — Inteligência de Clientes: agregação e renderização
// =============================================================================
// Depende de: state.js (globalData, charts, formatter), filters.js (getFilteredData)
// =============================================================================

/**
 * Orquestrador da aba de Clientes.
 * Recebe os dados já filtrados e renderiza todos os 4 blocos.
 */
// Fonte de dados: getFilteredData(). Por isso esta aba segue os filtros globais
// de Ano, Centro, Mes, UF e Cliente.
function renderClientSection() {
    const data = typeof getFilteredData === 'function' ? getFilteredData() : globalData;

    if (!data || data.length === 0) {
        _clearClientSection();
        return;
    }

    _renderClientKPIs(data);
    _renderBrazilMapSection(data);
    _renderGeoCharts(data);
    _renderParetoChart(data);
    _renderSegmentationCharts(data);
    _renderClientDetailTable(data);
}

/**
 * Reseta todos os cards, graficos e tabelas quando o filtro atual nao retorna
 * dados. Tambem destroi instancias ApexCharts antigas para evitar sobreposicao.
 */
function _clearClientSection() {
    const ids = ['cli-kpi-total', 'cli-kpi-ticket', 'cli-kpi-top10', 'cli-kpi-ufs', 'cli-kpi-cidades'];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '-'; });

    ['cli-chart-uf', 'cli-chart-cidades', 'cli-chart-pareto', 'cli-chart-familia', 'cli-chart-evolucao'].forEach(id => {
        if (charts[id]) { charts[id].destroy(); charts[id] = null; }
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<p class="placeholder-text">Sem dados para o filtro atual.</p>';
    });

    const tbody = document.getElementById('cli-detail-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="placeholder-text">Sem dados.</td></tr>';

    const heatBody = document.getElementById('cli-heatmap-body');
    if (heatBody) heatBody.innerHTML = '<tr><td colspan="2" class="placeholder-text">Sem dados.</td></tr>';
    const heatHead = document.getElementById('cli-heatmap-head');
    if (heatHead) heatHead.innerHTML = '';

    const mapEl = document.getElementById('cli-chart-mapa');
    if (mapEl) mapEl.innerHTML = '<p class="placeholder-text">Sem dados para o filtro atual.</p>';
}

/**
 * Formata valores para eixos de graficos usando abreviacoes legiveis.
 *
 * @param {number} value
 * @returns {string}
 */
function _formatCompactCurrency(value) {
    const n = Number(value) || 0;
    if (Math.abs(n) >= 1000000) return 'R$ ' + (n / 1000000).toFixed(1).replace('.', ',') + 'M';
    if (Math.abs(n) >= 1000) return 'R$ ' + (n / 1000).toFixed(0) + 'k';
    return formatter.format(n);
}

// ---------------------------------------------------------------------------
// Mapa do Brasil
// ---------------------------------------------------------------------------
function _renderBrazilMapSection(data) {
    if (typeof renderBrazilMap !== 'function' || typeof _buildMapData !== 'function') return;
    const dataByUF = _buildMapData(data);
    renderBrazilMap('cli-chart-mapa', dataByUF, _currentMapMetric || 'clientes');
}

// ---------------------------------------------------------------------------
// Bloco 1 — KPIs
// ---------------------------------------------------------------------------
function _renderClientKPIs(data) {
    // Clientes ativos (com faturamento > 0, excluindo genéricos)
    const clienteMap = {};
    data.forEach(d => {
        if (d.Cliente && d.Cliente !== 'NÃO IDENTIFICADO' && d.Cliente !== 'ND') {
            if (!clienteMap[d.Cliente]) clienteMap[d.Cliente] = 0;
            clienteMap[d.Cliente] += d.Valor;
        }
    });

    const clientes = Object.entries(clienteMap).sort((a, b) => b[1] - a[1]);
    const totalClientes = clientes.length;
    const totalFat = clientes.reduce((s, c) => s + c[1], 0);
    const ticketMedio = totalClientes > 0 ? totalFat / totalClientes : 0;

    // Top 10 concentration
    const top10Fat = clientes.slice(0, 10).reduce((s, c) => s + c[1], 0);
    const top10Pct = totalFat > 0 ? (top10Fat / totalFat * 100) : 0;

    // Geographic coverage
    const ufs = new Set(data.filter(d => d.UF && d.UF !== 'ND').map(d => d.UF));
    const cidades = new Set(data.filter(d => d.Cidade && d.Cidade !== 'NÃO DEFINIDO').map(d => d.Cidade));

    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('cli-kpi-total', totalClientes.toLocaleString('pt-BR'));
    el('cli-kpi-ticket', formatter.format(ticketMedio));
    el('cli-kpi-top10', top10Pct.toFixed(1) + '%');
    el('cli-kpi-ufs', ufs.size.toString());
    el('cli-kpi-cidades', cidades.size.toString());
}

// ---------------------------------------------------------------------------
// Bloco 2 — Geografia
// ---------------------------------------------------------------------------
function _renderGeoCharts(data) {
    // Faturamento por UF
    const ufMap = {};
    const ufClientes = {};
    data.forEach(d => {
        if (!d.UF || d.UF === 'ND') return;
        ufMap[d.UF] = (ufMap[d.UF] || 0) + d.Valor;
        if (!ufClientes[d.UF]) ufClientes[d.UF] = new Set();
        if (d.Cliente && d.Cliente !== 'NÃO IDENTIFICADO') ufClientes[d.UF].add(d.Cliente);
    });

    const ufSorted = Object.entries(ufMap).sort((a, b) => b[1] - a[1]);
    const ufLabels = ufSorted.map(u => u[0]);
    const ufValues = ufSorted.map(u => u[1]);
    const ufCliCount = ufSorted.map(u => (ufClientes[u[0]] || new Set()).size);

    const elUf = document.getElementById('cli-chart-uf');
    if (elUf && ufLabels.length > 0) {
        elUf.innerHTML = '';
        if (charts['cli-chart-uf']) { charts['cli-chart-uf'].destroy(); charts['cli-chart-uf'] = null; }
        charts['cli-chart-uf'] = new ApexCharts(elUf, {
            series: [{ name: 'Faturamento', data: ufValues }],
            chart: { type: 'bar', height: 320, fontFamily: 'Roboto, sans-serif', toolbar: { show: false } },
            plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '65%' } },
            colors: ['#0033A0'],
            dataLabels: { enabled: false },
            fill: { type: 'gradient', gradient: { shade: 'light', type: 'horizontal', shadeIntensity: 0.25, opacityFrom: 0.85, opacityTo: 1 } },
            xaxis: { categories: ufLabels, tickAmount: 4, labels: { formatter: v => _formatCompactCurrency(v) } },
            yaxis: { labels: { style: { fontWeight: 600 } } },
            tooltip: {
                custom: function({ seriesIndex, dataPointIndex }) {
                    const uf = ufLabels[dataPointIndex];
                    return '<div style="padding:8px 12px; font-family:Roboto;">' +
                        '<strong>' + uf + '</strong><br>' +
                        'Faturamento: ' + formatter.format(ufValues[dataPointIndex]) + '<br>' +
                        'Clientes: ' + ufCliCount[dataPointIndex] +
                        '</div>';
                }
            },
            title: { text: 'Faturamento por Estado (UF)', align: 'center', style: { fontFamily: 'Montserrat', fontWeight: 700, fontSize: '13px' } },
            responsive: [{
                breakpoint: 640,
                options: {
                    chart: { height: 360 },
                    plotOptions: { bar: { barHeight: '54%' } },
                    xaxis: { tickAmount: 3, labels: { style: { fontSize: '10px' }, formatter: v => _formatCompactCurrency(v) } },
                    yaxis: { labels: { style: { fontSize: '10px' } } },
                    title: { style: { fontSize: '12px' } }
                }
            }]
        });
        charts['cli-chart-uf'].render();
    }

    // Top 20 Cidades
    const cidMap = {};
    const cidUf = {};
    data.forEach(d => {
        if (!d.Cidade || d.Cidade === 'NÃO DEFINIDO') return;
        const key = d.Cidade;
        cidMap[key] = (cidMap[key] || 0) + d.Valor;
        cidUf[key] = d.UF || 'ND';
    });

    const cidSorted = Object.entries(cidMap).sort((a, b) => b[1] - a[1]).slice(0, 20);
    const cidLabels = cidSorted.map(c => c[0]);
    const cidValues = cidSorted.map(c => c[1]);
    const cidUfs = cidSorted.map(c => cidUf[c[0]]);

    const elCid = document.getElementById('cli-chart-cidades');
    if (elCid && cidLabels.length > 0) {
        elCid.innerHTML = '';
        if (charts['cli-chart-cidades']) { charts['cli-chart-cidades'].destroy(); charts['cli-chart-cidades'] = null; }
        charts['cli-chart-cidades'] = new ApexCharts(elCid, {
            series: [{ name: 'Faturamento', data: cidValues }],
            chart: { type: 'bar', height: 400, fontFamily: 'Roboto, sans-serif', toolbar: { show: false } },
            plotOptions: { bar: { horizontal: true, borderRadius: 3, barHeight: '60%' } },
            colors: ['#00AD68'],
            dataLabels: { enabled: false },
            fill: { type: 'gradient', gradient: { shade: 'light', type: 'horizontal', shadeIntensity: 0.2, opacityFrom: 0.8, opacityTo: 1 } },
            xaxis: { categories: cidLabels, tickAmount: 4, labels: { formatter: v => _formatCompactCurrency(v) } },
            yaxis: { labels: { style: { fontSize: '11px' } } },
            tooltip: {
                custom: function({ dataPointIndex }) {
                    return '<div style="padding:8px 12px; font-family:Roboto;">' +
                        '<strong>' + cidLabels[dataPointIndex] + '</strong> (' + cidUfs[dataPointIndex] + ')<br>' +
                        'Faturamento: ' + formatter.format(cidValues[dataPointIndex]) +
                        '</div>';
                }
            },
            title: { text: 'Top 20 Cidades por Faturamento', align: 'center', style: { fontFamily: 'Montserrat', fontWeight: 700, fontSize: '13px' } },
            responsive: [{
                breakpoint: 640,
                options: {
                    chart: { height: 430 },
                    plotOptions: { bar: { barHeight: '50%' } },
                    xaxis: { tickAmount: 3, labels: { style: { fontSize: '10px' }, formatter: v => _formatCompactCurrency(v) } },
                    yaxis: { labels: { style: { fontSize: '10px' } } },
                    title: { style: { fontSize: '12px' } }
                }
            }]
        });
        charts['cli-chart-cidades'].render();
    }
}

// ---------------------------------------------------------------------------
// Bloco 3 — Pareto (80/20)
// ---------------------------------------------------------------------------
function _renderParetoChart(data) {
    const clienteMap = {};
    data.forEach(d => {
        if (d.Cliente && d.Cliente !== 'NÃO IDENTIFICADO' && d.Cliente !== 'ND') {
            clienteMap[d.Cliente] = (clienteMap[d.Cliente] || 0) + d.Valor;
        }
    });

    const sorted = Object.entries(clienteMap).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return;

    const totalFat = sorted.reduce((s, c) => s + c[1], 0);
    const labels = sorted.map((c, i) => (i + 1).toString());
    const values = sorted.map(c => c[1]);

    // Acumulado percentual
    let acum = 0;
    const acumPct = sorted.map(c => {
        acum += c[1];
        return parseFloat((acum / totalFat * 100).toFixed(1));
    });

    // Encontra onde chega a 80%
    const idx80 = acumPct.findIndex(v => v >= 80);
    const qtd80 = idx80 >= 0 ? idx80 + 1 : sorted.length;

    // Atualizar insight
    const insight = document.getElementById('cli-pareto-insight');
    if (insight) {
        insight.innerHTML = '<span style="color: var(--tecpar-blue); font-weight:700;">' +
            qtd80 + ' clientes</span> representam <span style="color: var(--tecpar-green); font-weight:700;">80%</span> do faturamento ' +
            '(de um total de ' + sorted.length + ' clientes ativos)';
    }

    const el = document.getElementById('cli-chart-pareto');
    if (!el) return;
    el.innerHTML = '';

    if (charts['cli-chart-pareto']) { charts['cli-chart-pareto'].destroy(); charts['cli-chart-pareto'] = null; }

    // Limita a exibição para os top 50 para legibilidade
    const showMax = Math.min(sorted.length, 50);

    charts['cli-chart-pareto'] = new ApexCharts(el, {
        series: [
            { name: 'Faturamento', type: 'bar', data: values.slice(0, showMax) },
            { name: '% Acumulado', type: 'line', data: acumPct.slice(0, showMax) }
        ],
        chart: { height: 350, fontFamily: 'Roboto, sans-serif', toolbar: { show: false } },
        plotOptions: { bar: { borderRadius: 2, columnWidth: '70%' } },
        colors: ['#0033A0', '#E66C37'],
        stroke: { width: [0, 3], curve: 'smooth' },
        fill: { type: ['gradient', 'solid'], gradient: { shade: 'light', type: 'vertical', shadeIntensity: 0.15, opacityFrom: 0.85, opacityTo: 1 } },
        xaxis: { categories: labels.slice(0, showMax), title: { text: 'Ranking de Clientes' }, labels: { show: showMax <= 30 } },
        yaxis: [
            { title: { text: 'Faturamento (R$)' }, labels: { formatter: v => formatter.format(v) } },
            { opposite: true, title: { text: '% Acumulado' }, min: 0, max: 100, labels: { formatter: v => v.toFixed(0) + '%' } }
        ],
        tooltip: {
            shared: true,
            custom: function({ dataPointIndex }) {
                if (dataPointIndex >= sorted.length) return '';
                const c = sorted[dataPointIndex];
                return '<div style="padding:8px 12px; font-family:Roboto;">' +
                    '<strong>#' + (dataPointIndex + 1) + ' ' + c[0] + '</strong><br>' +
                    'Faturamento: ' + formatter.format(c[1]) + '<br>' +
                    'Acumulado: ' + acumPct[dataPointIndex] + '%' +
                    '</div>';
            }
        },
        annotations: {
            yaxis: [{ y: 80, y2: null, yAxisIndex: 1, borderColor: '#E66C37', strokeDashArray: 4,
                label: { text: '80%', borderColor: '#E66C37', style: { background: '#E66C37', color: '#fff', fontSize: '11px' } }
            }]
        },
        title: { text: 'Curva de Concentração (Pareto 80/20)', align: 'center', style: { fontFamily: 'Montserrat', fontWeight: 700, fontSize: '13px' } },
        responsive: [{
            breakpoint: 640,
            options: {
                chart: { height: 300 },
                plotOptions: { bar: { columnWidth: '82%' } },
                stroke: { width: [0, 2] },
                xaxis: { title: { text: undefined }, labels: { show: false } },
                title: { style: { fontSize: '12px' } }
            }
        }]
    });
    charts['cli-chart-pareto'].render();
}

// ---------------------------------------------------------------------------
// Bloco 4 — Segmentação
// ---------------------------------------------------------------------------
function _renderSegmentationCharts(data) {
    // Clientes por Família
    const famClientes = {};
    data.forEach(d => {
        if (!d.Familia || d.Familia === 'NÃO IDENTIFICADO') return;
        if (!d.Cliente || d.Cliente === 'NÃO IDENTIFICADO' || d.Cliente === 'ND') return;
        if (!famClientes[d.Familia]) famClientes[d.Familia] = new Set();
        famClientes[d.Familia].add(d.Cliente);
    });

    const famAll = Object.entries(famClientes)
        .map(([fam, set]) => ({ fam, count: set.size }))
        .sort((a, b) => b.count - a.count);

    let famSorted = famAll;
    if (famAll.length > 9) {
        famSorted = famAll.slice(0, 8);
        famSorted.push({
            fam: 'OUTRAS FAMÍLIAS',
            count: famAll.slice(8).reduce((acc, item) => acc + item.count, 0)
        });
    }

    const elFam = document.getElementById('cli-chart-familia');
    if (elFam && famSorted.length > 0) {
        elFam.innerHTML = '';
        if (charts['cli-chart-familia']) { charts['cli-chart-familia'].destroy(); charts['cli-chart-familia'] = null; }

        const famColors = ['#0033A0', '#00AD68', '#E66C37', '#4472C4', '#FFC000', '#7030A0',
            '#2E75B6', '#548235', '#BF8F00', '#C55A11', '#7B7B7B', '#375623', '#1F4E79', '#843C0C', '#525252'];

        charts['cli-chart-familia'] = new ApexCharts(elFam, {
            series: famSorted.map(f => f.count),
            labels: famSorted.map(f => f.fam.length > 30 ? f.fam.substring(0, 28) + '...' : f.fam),
            colors: famColors.slice(0, famSorted.length),
            chart: { type: 'donut', height: 340, fontFamily: 'Roboto, sans-serif' },
            stroke: { show: true, colors: ['#fff'] },
            dataLabels: { enabled: true, formatter: (val, opts) => opts.w.config.series[opts.seriesIndex] + ' cli.' },
            legend: {
                position: 'bottom',
                fontSize: '10px',
                horizontalAlign: 'center',
                formatter: name => name.length > 26 ? name.substring(0, 24) + '...' : name
            },
            tooltip: {
                y: { formatter: (val, opts) => val + ' clientes' }
            },
            title: { text: 'Clientes por Família de Produto', align: 'center', style: { fontFamily: 'Montserrat', fontWeight: 700, fontSize: '13px' } },
            responsive: [{
                breakpoint: 640,
                options: {
                    chart: { height: 300 },
                    dataLabels: { enabled: false },
                    legend: { fontSize: '9px', itemMargin: { horizontal: 4, vertical: 2 } },
                    title: { style: { fontSize: '12px' } }
                }
            }]
        });
        charts['cli-chart-familia'].render();
    }

    // Evolução mensal de clientes ativos
    const mesesOrdem = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const mesClientes = {};
    data.forEach(d => {
        if (!d.Cliente || d.Cliente === 'NÃO IDENTIFICADO' || d.Cliente === 'ND') return;
        if (!mesClientes[d.Mes]) mesClientes[d.Mes] = new Set();
        mesClientes[d.Mes].add(d.Cliente);
    });

    const mesesPresentes = mesesOrdem.filter(m => mesClientes[m] && mesClientes[m].size > 0);
    if (mesesPresentes.length === 0) return;

    const mesValues = mesesPresentes.map(m => mesClientes[m].size);

    const elEvo = document.getElementById('cli-chart-evolucao');
    if (elEvo) {
        elEvo.innerHTML = '';
        if (charts['cli-chart-evolucao']) { charts['cli-chart-evolucao'].destroy(); charts['cli-chart-evolucao'] = null; }
        charts['cli-chart-evolucao'] = new ApexCharts(elEvo, {
            series: [{ name: 'Clientes Ativos', data: mesValues }],
            chart: { type: 'bar', height: 300, fontFamily: 'Roboto, sans-serif', toolbar: { show: false } },
            plotOptions: { bar: { borderRadius: 6, columnWidth: '55%' } },
            colors: ['#0033A0'],
            fill: { type: 'gradient', gradient: { shade: 'dark', type: 'vertical', shadeIntensity: 0.3, opacityFrom: 1, opacityTo: 0.8 } },
            xaxis: { categories: mesesPresentes },
            yaxis: { title: { text: 'Nº de Clientes' } },
            dataLabels: { enabled: true, style: { fontSize: '12px', fontWeight: 700 } },
            tooltip: { y: { formatter: v => v + ' clientes' } },
            title: { text: 'Clientes Ativos por Mês', align: 'center', style: { fontFamily: 'Montserrat', fontWeight: 700, fontSize: '13px' } },
            responsive: [{
                breakpoint: 640,
                options: {
                    chart: { height: 260 },
                    plotOptions: { bar: { columnWidth: '70%' } },
                    dataLabels: { style: { fontSize: '10px' } },
                    yaxis: { title: { text: undefined } },
                    title: { style: { fontSize: '12px' } }
                }
            }]
        });
        charts['cli-chart-evolucao'].render();
    }

    // Matriz Centro × UF (Heatmap)
    _renderHeatmapCentroUF(data);
}

/**
 * Renderiza a matriz Centro x UF contando clientes unicos por combinacao.
 * A cor de cada celula e proporcional ao maior valor encontrado no filtro.
 *
 * @param {Object[]} data - Registros ja filtrados de globalData.
 */
function _renderHeatmapCentroUF(data) {
    const thead = document.getElementById('cli-heatmap-head');
    const tbody = document.getElementById('cli-heatmap-body');
    if (!thead || !tbody) return;

    const centroUf = {};
    const allUfs = new Set();
    data.forEach(d => {
        if (!d.UF || d.UF === 'ND') return;
        if (!d.Cliente || d.Cliente === 'NÃO IDENTIFICADO' || d.Cliente === 'ND') return;
        allUfs.add(d.UF);
        const key = d.Centro + '||' + d.UF;
        if (!centroUf[key]) centroUf[key] = new Set();
        centroUf[key].add(d.Cliente);
    });

    const ufs = [...allUfs].sort();
    const centros = [...new Set(data.map(d => d.Centro))].filter(c => c !== 'NÃO IDENTIFICADO').sort();

    // Find max for color scale
    let maxVal = 0;
    centros.forEach(c => {
        ufs.forEach(u => {
            const key = c + '||' + u;
            const val = centroUf[key] ? centroUf[key].size : 0;
            if (val > maxVal) maxVal = val;
        });
    });

    thead.innerHTML = '<tr style="background-color:#0033A0; color:white;">' +
        '<th style="text-align:left; padding:6px 10px; min-width:220px;">Centro de Custo</th>' +
        ufs.map(u => '<th style="text-align:center; padding:6px 8px;">' + u + '</th>').join('') +
        '<th style="text-align:center; padding:6px 10px; background:#002575;">Total</th></tr>';

    let html = '';
    centros.forEach((c, idx) => {
        let total = 0;
        const shortName = c.length > 35 ? c.substring(0, 33) + '...' : c;
        html += '<tr style="background-color:' + (idx % 2 === 0 ? '#f5f6fb' : '#fff') + ';">';
        html += '<td style="padding:5px 10px; font-weight:500; font-size:11px;" title="' + c + '">' + shortName + '</td>';
        ufs.forEach(u => {
            const key = c + '||' + u;
            const val = centroUf[key] ? centroUf[key].size : 0;
            total += val;
            const intensity = maxVal > 0 ? val / maxVal : 0;
            const bg = val === 0 ? 'transparent' :
                'rgba(0, 51, 160, ' + (0.1 + intensity * 0.7).toFixed(2) + ')';
            const color = intensity > 0.5 ? '#fff' : '#333';
            html += '<td style="text-align:center; padding:4px 6px; background:' + bg + '; color:' + color + '; font-size:12px; font-weight:' + (val > 0 ? '600' : '400') + ';">' +
                (val > 0 ? val : '-') + '</td>';
        });
        html += '<td style="text-align:center; padding:5px 8px; font-weight:700; background:#e8f0fe;">' + total + '</td>';
        html += '</tr>';
    });

    tbody.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Tabela detalhada Top 15
// ---------------------------------------------------------------------------
/**
 * Renderiza tabela de Top 15 clientes com localizacao, familias consumidas,
 * faturamento e participacao no total filtrado.
 *
 * @param {Object[]} data - Registros ja filtrados de globalData.
 */
function _renderClientDetailTable(data) {
    const tbody = document.getElementById('cli-detail-body');
    if (!tbody) return;

    const clienteMap = {};
    data.forEach(d => {
        if (!d.Cliente || d.Cliente === 'NÃO IDENTIFICADO' || d.Cliente === 'ND') return;
        if (!clienteMap[d.Cliente]) {
            clienteMap[d.Cliente] = { valor: 0, uf: d.UF || 'ND', cidade: d.Cidade || '-', centro: d.Centro || '-', familias: new Set() };
        }
        clienteMap[d.Cliente].valor += d.Valor;
        if (d.Familia && d.Familia !== 'NÃO IDENTIFICADO') clienteMap[d.Cliente].familias.add(d.Familia);
    });

    const sorted = Object.entries(clienteMap).sort((a, b) => b[1].valor - a[1].valor);
    const totalFat = sorted.reduce((s, c) => s + c[1].valor, 0);
    const top15 = sorted.slice(0, 15);

    let html = '';
    top15.forEach(([nome, info], idx) => {
        const pct = totalFat > 0 ? (info.valor / totalFat * 100).toFixed(1) : '0.0';
        const shortName = nome.length > 45 ? nome.substring(0, 43) + '...' : nome;
        const famList = [...info.familias].join(', ');
        const shortFam = famList.length > 30 ? famList.substring(0, 28) + '...' : famList;
        const bg = idx % 2 === 0 ? '#f5f6fb' : '#fff';
        html += '<tr class="client-detail-row" style="background:' + bg + ';">' +
            '<td class="client-detail-rank" data-label="#" style="padding:5px 8px; text-align:center; font-weight:700; color:var(--tecpar-blue);">' + (idx + 1) + '</td>' +
            '<td class="client-detail-name" data-label="Cliente" style="padding:5px 8px; font-size:11px;" title="' + nome + '">' + shortName + '</td>' +
            '<td class="client-detail-uf" data-label="UF" style="padding:5px 8px; text-align:center;">' + info.uf + '</td>' +
            '<td class="client-detail-city" data-label="Cidade" style="padding:5px 8px; font-size:11px;">' + info.cidade + '</td>' +
            '<td class="client-detail-family" data-label="Famílias" style="padding:5px 8px; font-size:10px;" title="' + famList + '">' + shortFam + '</td>' +
            '<td class="client-detail-value" data-label="Faturamento" style="padding:5px 8px; text-align:right; font-weight:600;">' + formatter.format(info.valor) + '</td>' +
            '<td class="client-detail-share" data-label="% Total" style="padding:5px 8px; text-align:center; font-weight:500;">' + pct + '%</td>' +
            '</tr>';
    });

    // Total row
    const top15Fat = top15.reduce((s, c) => s + c[1].valor, 0);
    const top15Pct = totalFat > 0 ? (top15Fat / totalFat * 100).toFixed(1) : '0.0';
    html += '<tr class="client-detail-total" style="background:#E2EFDA; font-weight:700; border-top:2px solid #00AD68;">' +
        '<td class="client-detail-total-label" colspan="5" style="padding:6px 10px;">Total Top 15 (' + top15.length + ' de ' + sorted.length + ' clientes)</td>' +
        '<td class="client-detail-total-value" style="padding:6px 8px; text-align:right;">' + formatter.format(top15Fat) + '</td>' +
        '<td class="client-detail-total-share" style="padding:6px 8px; text-align:center;">' + top15Pct + '%</td>' +
        '</tr>';

    tbody.innerHTML = html;
}
