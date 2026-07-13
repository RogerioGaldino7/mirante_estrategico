// =============================================================================
// charts.js — Renderização dos gráficos ApexCharts
// =============================================================================
// Depende de: state.js (charts, globalMetas, formatter)
//             filters.js (getFilteredMetas)
// =============================================================================

/** Tema padrão compartilhado entre todos os gráficos */
const chartTheme = {
    mode:       'light',
    palette:    'palette1',
    background: 'transparent'
};

/**
 * Renderiza o gráfico combinado (barras de faturamento + linha de quantidade)
 * no container #chart-mensal. Se houver metas carregadas, adiciona a linha
 * tracejada de Meta Planejada.
 *
 * @param {Object[]} data - Registros filtrados de globalData
 */
function renderChartMensal(data) {
    const mesesOrdem = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

    // Agrega faturamento e quantidade por mês
    const agrupado = {};
    data.forEach(d => {
        if (!agrupado[d.Mes]) agrupado[d.Mes] = { val: 0, qtd: 0 };
        agrupado[d.Mes].val += d.Valor;
        agrupado[d.Mes].qtd += d.Quantidade;
    });

    // Agrega meta por mês (se disponível)
    const agrupadoMeta = {};
    if (globalMetas.length > 0) {
        getFilteredMetas().forEach(m => {
            if (!agrupadoMeta[m.Mes]) agrupadoMeta[m.Mes] = 0;
            agrupadoMeta[m.Mes] += m.MetaValor;
        });
    }

    const categorias = [], serieVal = [], serieMeta = [];
    mesesOrdem.forEach(m => {
        if (agrupado[m] || (globalMetas.length > 0 && agrupadoMeta[m])) {
            categorias.push(m);
            serieVal.push(agrupado[m] ? Number(agrupado[m].val.toFixed(2)) : 0);
            if (globalMetas.length > 0) serieMeta.push(agrupadoMeta[m] ? Number(agrupadoMeta[m].toFixed(2)) : 0);
        }
    });

    let seriesConfig = [
        { name: 'Faturamento', type: 'column', data: serieVal }
    ];
    let chartColors  = ['#0033A0'];
    let chartStrokes = [0];
    let chartDashes  = [0];

    // Injeta linha tracejada de meta quando disponível
    if (globalMetas.length > 0) {
        seriesConfig.unshift({ name: 'Meta Planejada (R$)', type: 'line', data: serieMeta });
        chartColors  = ['#FFC000', '#0033A0'];
        chartStrokes = [3, 0];
        chartDashes  = [5, 0];
    }

    const options = {
        series: seriesConfig,
        chart: {
            height: 280, type: 'line', theme: chartTheme,
            toolbar: { show: false }, fontFamily: 'Roboto, sans-serif'
        },
        stroke:      { width: chartStrokes, dashArray: chartDashes },
        colors:      chartColors,
        dataLabels:  { enabled: false },
        xaxis:       { categories: categorias },
        yaxis: [
            { 
                min: 0, 
                title: { text: 'Faturamento / Meta', style: { color: '#0033A0', fontWeight: 600 } },
                labels: { 
                    formatter: val => {
                        if (val >= 1000000) return 'R$ ' + (val / 1000000).toFixed(1) + 'M';
                        if (val >= 1000) return 'R$ ' + (val / 1000).toFixed(0) + 'k';
                        return 'R$ ' + val;
                    },
                    style: { colors: '#0033A0' }
                } 
            }
        ],
        tooltip: {
            shared: true,
            intersect: false,
            y: {
                formatter: function (val, { seriesIndex, w }) {
                    const name = w.config.series[seriesIndex].name;
                    if (name.includes('Quantidade')) {
                        return val.toLocaleString('pt-BR') + ' un.';
                    }
                    return formatter.format(val);
                }
            }
        },
        legend: { position: 'bottom', fontSize: '12px' },
        responsive: [{
            breakpoint: 640,
            options: {
                chart: { height: 250 },
                legend: { fontSize: '10px', itemMargin: { horizontal: 6, vertical: 2 } },
                xaxis: { labels: { style: { fontSize: '10px' } } }
            }
        }],
        grid: { borderColor: '#edebe9', strokeDashArray: 4 }
    };

    // Não é necessário remover eixos dummy pois temos um eixo y único agora.

    if (charts['mensal']) charts['mensal'].destroy();
    charts['mensal'] = new ApexCharts(document.querySelector("#chart-mensal"), options);
    charts['mensal'].render();
}

/**
 * Renderiza o gráfico de rosca (donut) de distribuição por família
 * no container #chart-familias.
 *
 * @param {Object[]} dataArr - Array de { chave, valor } já agrupados e ordenados
 */
function renderChartFamilia(dataArr) {
    const el = document.querySelector("#chart-familias");
    if (!el) return;

    // Se não houver dados, limpa o gráfico e mostra o placeholder
    if (!dataArr || dataArr.length === 0 || dataArr.every(d => d.valor === 0)) {
        if (charts['familias']) {
            charts['familias'].destroy();
            charts['familias'] = null;
        }
        el.innerHTML = '<p class="placeholder-text" style="display:block; padding-top:100px;">Nenhum dado de faturamento para as famílias no filtro atual.</p>';
        return;
    }

    // Limita a Top 8 + Outros para não poluir
    let processedData = [];
    if (dataArr.length > 9) {
        processedData = dataArr.slice(0, 8);
        const totalOutros = dataArr.slice(8).reduce((acc, curr) => acc + curr.valor, 0);
        processedData.push({ chave: 'OUTROS', valor: totalOutros });
    } else {
        processedData = dataArr;
    }

    // Família líder (antes era um card KPI; agora vira destaque no próprio gráfico)
    const totalFamilias = dataArr.reduce((a, d) => a + d.valor, 0);
    const liderNome = dataArr[0].chave.length > 30 ? dataArr[0].chave.slice(0, 28) + '…' : dataArr[0].chave;
    const liderPct  = totalFamilias > 0 ? (dataArr[0].valor / totalFamilias * 100).toFixed(0) : '0';

    const options = {
        series: processedData.map(d => d.valor),
        labels: processedData.map(d => d.chave),
        chart:  { type: 'donut', height: 380, fontFamily: 'Roboto, sans-serif' },
        title:  {
            text: `Família líder: ${liderNome} (${liderPct}%)`,
            align: 'center',
            style: { fontSize: '12px', fontWeight: 600, fontFamily: 'Montserrat, sans-serif', color: '#0033A0' }
        },
        colors: ['#0033A0', '#00AD68', '#E66C37', '#FFC000', '#7030A0', '#2E75B6', '#548235', '#BF8F00', '#A5A5A5'],
        stroke:      { show: true, colors: ['#fff'], width: 2 },
        dataLabels:  { 
            enabled: true, 
            formatter: (val) => val.toFixed(0) + '%',
            style: { colors: ['#fff'], fontWeight: 700, fontSize: '12px' },
            background: {
                enabled: true,
                foreColor: '#000',
                padding: 4,
                borderRadius: 4,
                borderWidth: 0,
                opacity: 0.9,
                color: '#fff'
            }
        },
        legend:      {
            position: 'bottom',
            fontSize: '11px',
            horizontalAlign: 'center',
            formatter: name => name.length > 26 ? name.substring(0, 24) + '...' : name
        },
        tooltip:     { y: { formatter: val => formatter.format(val) } },
        responsive: [{
            breakpoint: 640,
            options: {
                chart: { height: 280 },
                dataLabels: { enabled: false },
                legend: { fontSize: '10px', itemMargin: { horizontal: 5, vertical: 2 } },
                plotOptions: { pie: { donut: { size: '60%' } } }
            }
        }],
        plotOptions: {
            pie: {
                donut: {
                    size: '65%',
                    labels: {
                        show: false
                    }
                }
            }
        }
    };

    // Remove placeholder se existir antes de renderizar
    el.innerHTML = '';
    
    if (charts['familias']) charts['familias'].destroy();
    charts['familias'] = new ApexCharts(el, options);
    charts['familias'].render();
}
