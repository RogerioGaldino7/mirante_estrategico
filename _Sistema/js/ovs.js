// =============================================================================
// ovs.js — Ordens de Venda: parsing do CSV e renderização da seção OVs
// =============================================================================
// Depende de: state.js (globalOVs, charts, formatter)
// Estrutura do CSV:
//   Linha 0: Centros de custo espalhados (colunas esparsas, carry-forward)
//   Linha 1: Meses por coluna (ex: "01.Jan", "02.Fev"...)
//   Linhas 2-3: Sub-cabeçalhos (ignorados)
//   Linhas 4+: Dados — col0=Operação, col1=Status, col2..N-1=valores, colN=Total
// =============================================================================

/** Mapeamento legível dos códigos de operação */
const OV_OPERACAO_LABELS = {
    '2001': 'S/ Retenções — Pessoa Física',
    '2002': 'C/ Retenções IR/PIS/COFINS/CSLL',
    '2003': 'IR — Simples Nacional / Emp. Pública',
    '2004': 'Vendas Exterior',
    '9001': 'Ordem de Venda Interna'
};

/** Ordem de exibição dos status */
const OV_STATUS_ORDER = ['Faturada', 'Encerrada', 'Em faturamento', 'Confirmada', 'Cancelada', 'Cadastrada'];

/** Cores para os gráficos de pizza */
const OV_STATUS_COLORS = {
    'Faturada':        '#0033A0',
    'Encerrada':       '#00AD68',
    'Em faturamento':  '#FFC000',
    'Confirmada':      '#4472C4',
    'Cancelada':       '#E66C37',
    'Cadastrada':      '#A9A9A9'
};
const OV_OP_COLORS = ['#0033A0', '#E66C37', '#00AD68', '#FFC000', '#7030A0'];

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Converte a label de mês do CSV (ex: "01.Jan") para sigla curta (ex: "Jan").
 */
function _mesLabel(raw) {
    const parts = String(raw).trim().split('.');
    return parts.length > 1 ? parts[1] : parts[0];
}

/**
 * Converte string numérica pt-BR para float (ex: "1.234,56" → 1234.56).
 */
function _parseNum(str) {
    return parseFloat(String(str || '0').replace(/\./g, '').replace(',', '.')) || 0;
}


// -----------------------------------------------------------------------------
// Parsing
// -----------------------------------------------------------------------------

/**
 * Processa as linhas brutas do CSV de Status/Operação.
 * Cada coluna de valor é associada a (Centro, Mês) via cabeçalho hierárquico.
 * O resultado é um array tidy: { Operacao, Status, Centro, Mes, Valor }.
 * Popula globalOVs e chama renderOVSection().
 *
 * @param {Array[]} rows - Linhas parseadas pelo PapaParse
 */
function processOVData(rows) {
    if (rows.length < 5) {
        alert("Arquivo de OVs com formato inválido.");
        return;
    }

    // --- Auto-detecta o formato do cabeçalho ---
    // O parser tolera as duas ordens possíveis nas duas primeiras linhas:
    //   Formato A (legado): rows[0]=centros (sparse, carry-forward), rows[1]=meses (densos)
    //   Formato B (atual):  rows[0]=meses (sparse, carry-forward),   rows[1]=centros (densos)
    // A detecção é feita pela presença do padrão de mês "0X.Xxx" (ex: "01.Jan").
    const monthPattern = /^\d{1,2}\.\w+/;
    const countMonths = (row) => (row || []).filter(v => monthPattern.test(String(v || '').trim())).length;
    const r0Months = countMonths(rows[0]);
    const r1Months = countMonths(rows[1]);

    let mesRow, centroRow, mesIsSparse;
    if (r0Months > r1Months && r0Months > 0) {
        mesRow      = rows[0];
        centroRow   = rows[1];
        mesIsSparse = true;        // Formato B
        console.log('[OVs] Cabeçalho detectado: Formato B (meses na linha 0, centros na linha 1).');
    } else if (r1Months > 0) {
        mesRow      = rows[1];
        centroRow   = rows[0];
        mesIsSparse = false;       // Formato A
        console.log('[OVs] Cabeçalho detectado: Formato A (centros na linha 0, meses na linha 1).');
    } else {
        alert("Arquivo de OVs: não foi possível identificar a linha de meses (esperado padrão tipo '01.Jan').");
        return;
    }

    // --- Mapeia cada coluna → (centro, mês) ---
    const colMes = {};       // col index → sigla do mês (ex: "Jan")
    const colCentro = {};    // col index → nome normalizado do centro
    let currentMes = null;
    let currentCentro = "ND";

    const ncols = Math.max((mesRow || []).length, (centroRow || []).length);
    for (let c = 2; c < ncols - 1; c++) {
        const rawMes    = String((mesRow    && mesRow[c])    || '').trim();
        const rawCentro = String((centroRow && centroRow[c]) || '').trim();

        if (mesIsSparse) {
            // Formato B: mês com carry-forward, centro denso
            if (rawMes && monthPattern.test(rawMes)) currentMes = _mesLabel(rawMes);
            if (rawCentro && currentMes) {
                colMes[c]    = currentMes;
                colCentro[c] = normalizeCentro(rawCentro);
            }
        } else {
            // Formato A: centro com carry-forward, mês denso
            if (rawCentro) currentCentro = normalizeCentro(rawCentro);
            if (rawMes && monthPattern.test(rawMes)) {
                colMes[c]    = _mesLabel(rawMes);
                colCentro[c] = currentCentro;
            }
        }
    }

    // --- Processa linhas de dados (a partir da linha 4) ---
    let tidyData = [];
    let currentOp = '';

    for (let i = 4; i < rows.length; i++) {
        const row  = rows[i];
        const col0 = String(row[0] || '').trim();
        const col1 = String(row[1] || '').trim();

        // Ignora linhas vazias, totais e operações proibidas
        if (!col0 && !col1) continue;
        if (col0.startsWith('Total') || col0.startsWith('NAO USE')) continue;

        // Linha de cabeçalho de operação (col0 preenchida com código)
        if (col0) {
            const match = col0.match(/^(\d{4})/);
            if (match) currentOp = match[1];
            continue;  // Não emite dado para a linha-total da operação
        }

        // Linha de status (col0 vazio, col1 preenchido)
        if (col1 && currentOp) {
            Object.entries(colMes).forEach(([c, mes]) => {
                const val = _parseNum(row[parseInt(c)]);
                if (val !== 0) {
                    tidyData.push({
                        Operacao: currentOp,
                        Status:   col1,
                        Centro:   colCentro[c],
                        Mes:      mes,
                        Valor:    val
                    });
                }
            });
        }
    }

    globalOVs = tidyData;

    const statusEl = document.getElementById('ov-status');
    if (statusEl) statusEl.innerText = `OVs: ${globalOVs.length} reg.`;

    console.log('[OVs] Parsed', globalOVs.length, 'registros. Centros encontrados:',
        [...new Set(globalOVs.map(d => d.Centro))]);

    renderOVSection();
}

// -----------------------------------------------------------------------------
// Renderização
// -----------------------------------------------------------------------------

/**
 * Orquestrador da seção OVs: filtra dados pelos filtros ativos da sidebar
 * e chama as duas tabelas e os dois gráficos.
 */
function renderOVSection() {
    if (globalOVs.length === 0) return;

    const fCentro = typeof window.getCheckedCentros === 'function' ? window.getCheckedCentros() : "ALL";
    const mesesAtivos = Array.from(document.querySelectorAll('.mes-checkbox:checked')).map(cb => cb.value);

    // Se nenhum centro ou mês selecionado, limpa tudo
    if ((Array.isArray(fCentro) && fCentro.length === 0) || mesesAtivos.length === 0) {
        clearOVSection();
        return;
    }

    // Filtra OVs pelos centros e meses ativos
    const filteredOVs = globalOVs.filter(d => {
        if (!mesesAtivos.includes(d.Mes)) return false;
        if (fCentro !== "ALL" && Array.isArray(fCentro) && !fCentro.includes(d.Centro)) return false;
        return true;
    });

    if (filteredOVs.length === 0) {
        clearOVSection();
        return;
    }

    _renderOVTableStatus(filteredOVs, mesesAtivos);
    _renderOVTableOperacao(filteredOVs, mesesAtivos);
    _renderOVChartSituacao(filteredOVs);
    _renderOVChartTipos(filteredOVs);
}

/**
 * Limpa completamente toda a seção de OVs (tabelas e gráficos).
 */
function clearOVSection() {
    const tbodyStatus = document.getElementById('ov-table-status-body');
    const tbodyOp     = document.getElementById('ov-table-op-body');
    const theadStatus = document.getElementById('ov-table-status-head');
    const theadOp     = document.getElementById('ov-table-op-head');
    
    if (tbodyStatus) tbodyStatus.innerHTML = '<tr><td colspan="10" class="placeholder-text">Sem dados para o filtro atual.</td></tr>';
    if (tbodyOp)     tbodyOp.innerHTML     = '<tr><td colspan="10" class="placeholder-text">Sem dados para o filtro atual.</td></tr>';
    if (theadStatus) theadStatus.innerHTML = '';
    if (theadOp)     theadOp.innerHTML     = '';

    if (charts['ov-situacao']) { charts['ov-situacao'].destroy(); charts['ov-situacao'] = null; }
    if (charts['ov-tipos'])    { charts['ov-tipos'].destroy();    charts['ov-tipos'] = null; }
    
    const ph1 = document.getElementById('ov-chart-situacao-placeholder');
    if (ph1) { ph1.style.display = 'block'; ph1.innerText = 'Sem dados no filtro'; }
    const ph2 = document.getElementById('ov-chart-tipos-placeholder');
    if (ph2) { ph2.style.display = 'block'; ph2.innerText = 'Sem dados no filtro'; }
}

// -----------------------------------------------------------------------------
// Tabelas
// -----------------------------------------------------------------------------

/**
 * Tabela: Status × Mês + Total
 */
function _renderOVTableStatus(filteredOVs, mesesAtivos) {
    const tbody = document.getElementById('ov-table-status-body');
    const thead = document.getElementById('ov-table-status-head');
    if (!tbody || !thead) return;

    // Meses presentes nos dados filtrados, na ordem dos filtros
    const allMeses = [...new Set(filteredOVs.map(d => d.Mes))]
        .sort((a, b) => mesesAtivos.indexOf(a) - mesesAtivos.indexOf(b));

    // Cabeçalho
    thead.innerHTML = `<tr style="background-color:#0033A0; color:white;">
        <th style="text-align:left; padding:6px 10px;">Status</th>
        ${allMeses.map(m => `<th style="text-align:right; padding:6px 8px;">${m}</th>`).join('')}
        <th style="text-align:right; padding:6px 10px; background:#002575;">Total</th>
    </tr>`;

    // Agrega por status
    const byStatus = {};
    OV_STATUS_ORDER.forEach(s => {
        byStatus[s] = { Total: 0, PorMes: {} };
        allMeses.forEach(m => { byStatus[s].PorMes[m] = 0; });
    });

    filteredOVs.forEach(d => {
        if (!byStatus[d.Status]) {
            byStatus[d.Status] = { Total: 0, PorMes: {} };
            allMeses.forEach(m => { byStatus[d.Status].PorMes[m] = 0; });
        }
        byStatus[d.Status].Total += d.Valor;
        byStatus[d.Status].PorMes[d.Mes] = (byStatus[d.Status].PorMes[d.Mes] || 0) + d.Valor;
    });

    const fmtV = v => v === 0 ? '-' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const grandMes = {};
    allMeses.forEach(m => { grandMes[m] = Object.values(byStatus).reduce((a, b) => a + (b.PorMes[m] || 0), 0); });
    const grandTotal = Object.values(byStatus).reduce((a, b) => a + b.Total, 0);

    let html = '';
    const statusList = OV_STATUS_ORDER.filter(s => byStatus[s] && byStatus[s].Total > 0);
    statusList.forEach((s, idx) => {
        const row   = byStatus[s];
        const color = OV_STATUS_COLORS[s] || '#333';
        const bg    = idx % 2 === 0 ? '#f5f6fb' : '#ffffff';
        html += `<tr style="background-color:${bg};">
            <td style="padding:5px 10px; font-weight:500; border-left:4px solid ${color};">${s}</td>
            ${allMeses.map(m => `<td style="text-align:right; padding:5px 8px;">${fmtV(row.PorMes[m])}</td>`).join('')}
            <td style="text-align:right; padding:5px 10px; font-weight:700;">${fmtV(row.Total)}</td>
        </tr>`;
    });

    // Linha de total geral
    html += `<tr style="background-color:#E2EFDA; font-weight:700; border-top:2px solid #00AD68;">
        <td style="padding:6px 10px; background:#C6E0B4;">Total Geral</td>
        ${allMeses.map(m => `<td style="text-align:right; padding:5px 8px;">${fmtV(grandMes[m])}</td>`).join('')}
        <td style="text-align:right; padding:5px 10px; background:#C6E0B4;">${fmtV(grandTotal)}</td>
    </tr>`;

    tbody.innerHTML = html;
}

/**
 * Tabela: Operação × Mês + Total
 */
function _renderOVTableOperacao(filteredOVs, mesesAtivos) {
    const tbody = document.getElementById('ov-table-op-body');
    const thead = document.getElementById('ov-table-op-head');
    if (!tbody || !thead) return;

    const allMeses = [...new Set(filteredOVs.map(d => d.Mes))]
        .sort((a, b) => mesesAtivos.indexOf(a) - mesesAtivos.indexOf(b));

    thead.innerHTML = `<tr style="background-color:#0033A0; color:white;">
        <th style="text-align:left; padding:6px 10px;">Operação</th>
        ${allMeses.map(m => `<th style="text-align:right; padding:6px 8px;">${m}</th>`).join('')}
        <th style="text-align:right; padding:6px 10px; background:#002575;">Total</th>
    </tr>`;

    // Agrega por operação
    const byOp = {};
    filteredOVs.forEach(d => {
        if (!byOp[d.Operacao]) {
            byOp[d.Operacao] = { Total: 0, PorMes: {} };
            allMeses.forEach(m => { byOp[d.Operacao].PorMes[m] = 0; });
        }
        byOp[d.Operacao].Total += d.Valor;
        byOp[d.Operacao].PorMes[d.Mes] = (byOp[d.Operacao].PorMes[d.Mes] || 0) + d.Valor;
    });

    const fmtV = v => v === 0 ? '-' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const ops  = Object.keys(byOp).sort();
    const grandMes = {};
    allMeses.forEach(m => { grandMes[m] = ops.reduce((a, op) => a + (byOp[op].PorMes[m] || 0), 0); });
    const grandTotal = ops.reduce((a, op) => a + byOp[op].Total, 0);

    let html = '';
    ops.forEach((op, idx) => {
        const row   = byOp[op];
        const label = OV_OPERACAO_LABELS[op] || op;
        const color = OV_OP_COLORS[idx % OV_OP_COLORS.length];
        const bg    = idx % 2 === 0 ? '#f5f6fb' : '#ffffff';
        html += `<tr style="background-color:${bg};">
            <td style="padding:5px 10px; border-left:4px solid ${color};">
                <strong style="color:${color};">Op. ${op}</strong><br>
                <span style="font-size:11px; color:#666;">${label}</span>
            </td>
            ${allMeses.map(m => `<td style="text-align:right; padding:5px 8px;">${fmtV(row.PorMes[m])}</td>`).join('')}
            <td style="text-align:right; padding:5px 10px; font-weight:700;">${fmtV(row.Total)}</td>
        </tr>`;
    });

    html += `<tr style="background-color:#DDEBF7; font-weight:700; border-top:2px solid #0033A0;">
        <td style="padding:6px 10px; background:#BDD7EE;">Total Geral</td>
        ${allMeses.map(m => `<td style="text-align:right; padding:5px 8px;">${fmtV(grandMes[m])}</td>`).join('')}
        <td style="text-align:right; padding:5px 10px; background:#BDD7EE;">${fmtV(grandTotal)}</td>
    </tr>`;

    tbody.innerHTML = html;
}

// -----------------------------------------------------------------------------
// Gráficos
// -----------------------------------------------------------------------------

/**
 * Gráfico de pizza: distribuição por Status (Situação OVs)
 */
function _renderOVChartSituacao(filteredOVs) {
    const el = document.querySelector('#ov-chart-situacao');
    if (!el) return;

    const byStatus = {};
    filteredOVs.forEach(d => {
        byStatus[d.Status] = (byStatus[d.Status] || 0) + d.Valor;
    });

    const labels  = OV_STATUS_ORDER.filter(s => byStatus[s] > 0);
    const series  = labels.map(s => byStatus[s]);
    const colors  = labels.map(s => OV_STATUS_COLORS[s] || '#ccc');

    if (series.length === 0) return;

    const options = {
        series, labels, colors,
        chart:      { type: 'donut', height: 260, fontFamily: 'Roboto, sans-serif' },
        stroke:     { show: true, colors: ['#fff'] },
        dataLabels: { 
            enabled: true, 
            formatter: (val) => val.toFixed(1) + '%',
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
        legend:     { position: 'bottom', fontSize: '11px' },
        tooltip:    { y: { formatter: v => formatter.format(v) } },
        title:      { text: 'Situação OVs', align: 'center', style: { fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '13px' } },
        responsive: [{
            breakpoint: 640,
            options: {
                chart: { height: 240 },
                dataLabels: { enabled: false },
                legend: { fontSize: '10px', itemMargin: { horizontal: 4, vertical: 2 } },
                title: { style: { fontSize: '12px' } }
            }
        }]
    };

    const ph1 = document.getElementById('ov-chart-situacao-placeholder');
    if (ph1) ph1.style.display = 'none';
    if (charts['ov-situacao']) { charts['ov-situacao'].destroy(); charts['ov-situacao'] = null; }
    charts['ov-situacao'] = new ApexCharts(el, options);
    charts['ov-situacao'].render();
}

/**
 * Gráfico de pizza: distribuição por Tipo de Operação
 */
function _renderOVChartTipos(filteredOVs) {
    const el = document.querySelector('#ov-chart-tipos');
    if (!el) return;

    const byOp = {};
    filteredOVs.forEach(d => {
        byOp[d.Operacao] = (byOp[d.Operacao] || 0) + d.Valor;
    });

    const ops    = Object.keys(byOp).sort();
    const labels = ops.map(op => 'Op. ' + op);
    const series = ops.map(op => byOp[op]);

    if (series.length === 0) return;

    const options = {
        series, labels,
        colors:     OV_OP_COLORS.slice(0, ops.length),
        chart:      { type: 'donut', height: 260, fontFamily: 'Roboto, sans-serif' },
        stroke:     { show: true, colors: ['#fff'] },
        dataLabels: { 
            enabled: true, 
            formatter: (val) => val.toFixed(1) + '%',
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
        legend:     { position: 'bottom', fontSize: '11px' },
        tooltip:    { y: { formatter: v => formatter.format(v) } },
        title:      { text: 'Tipos de OVs', align: 'center', style: { fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '13px' } },
        responsive: [{
            breakpoint: 640,
            options: {
                chart: { height: 240 },
                dataLabels: { enabled: false },
                legend: { fontSize: '10px', itemMargin: { horizontal: 4, vertical: 2 } },
                title: { style: { fontSize: '12px' } }
            }
        }]
    };

    const ph2 = document.getElementById('ov-chart-tipos-placeholder');
    if (ph2) ph2.style.display = 'none';
    if (charts['ov-tipos']) { charts['ov-tipos'].destroy(); charts['ov-tipos'] = null; }
    charts['ov-tipos'] = new ApexCharts(el, options);
    charts['ov-tipos'].render();
}
