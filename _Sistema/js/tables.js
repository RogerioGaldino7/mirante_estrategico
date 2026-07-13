// =============================================================================
// tables.js — Matrizes analíticas e tabelas Top 15
// =============================================================================
// Depende de: state.js (globalData, globalMetas, formatter)
//             filters.js (getCheckedCentros)
// =============================================================================

/**
 * Agrega um array de objetos somando um campo numérico por chave.
 *
 * @param {Object[]} arr    - Array de registros
 * @param {string}   key    - Campo usado como chave de agrupamento
 * @param {string}   sumKey - Campo numérico a somar
 * @returns {{ chave: string, valor: number }[]}
 */
function groupBySum(arr, key, sumKey) {
    const map = {};
    arr.forEach(item => {
        if (!map[item[key]]) map[item[key]] = 0;
        map[item[key]] += item[sumKey];
    });
    return Object.keys(map).map(k => ({ chave: k, valor: map[k] }));
}

/**
 * Preenche uma tabela com os Top 15 itens mais um rodapé de totais
 * e um resumo do restante agrupado.
 *
 * @param {string}   elementId   - ID do <tbody> alvo
 * @param {Object[]} allItems    - Array { chave, valor } já ordenado por valor desc
 * @param {string}   nameSingular - Nome singular do item (ex: "cliente")
 * @param {string}   namePlural   - Nome plural do item (ex: "clientes")
 */
function renderList(elementId, allItems, nameSingular, namePlural) {
    const el = document.getElementById(elementId);
    el.innerHTML = '';

    if (allItems.length === 0) {
        el.innerHTML = `<tr><td colspan="2" class="placeholder-text">Sem dados para o filtro atual.</td></tr>`;
        return;
    }

    const items    = allItems.slice(0, 15);
    let topTotal   = 0;

    items.forEach((it, idx) => {
        topTotal += it.valor;
        el.innerHTML += `<tr class="ranking-row">
            <td class="ranking-name" title="${it.chave}" data-rank="${idx + 1}">
                <div class="ranking-name-text" style="white-space: normal; overflow-wrap: break-word; line-height: 1.2;">
                    ${it.chave}
                </div>
            </td>
            <td class="right ranking-value" style="font-weight: 600; width: 120px;">
                ${formatter.format(it.valor)}
            </td>
        </tr>`;
    });

    // Linha de total (destaque laranja)
    el.innerHTML += `<tr class="row-total ranking-total">
        <td class="ranking-total-label">Total</td>
        <td class="right ranking-total-value">${formatter.format(topTotal)}</td>
    </tr>`;

    // Linha de "E mais N itens..." se houver excedente
    const remainingCount = allItems.length - items.length;
    if (remainingCount > 0) {
        const remainingSum  = allItems.slice(15).reduce((acc, curr) => acc + curr.valor, 0);
        const nameText      = remainingCount === 1 ? nameSingular : namePlural;
        el.innerHTML += `<tr class="row-remaining ranking-remaining">
            <td colspan="2" class="ranking-remaining-text" style="font-size: 13px;">E mais ${remainingCount} ${nameText} somando ${formatter.format(remainingSum)}</td>
        </tr>`;
    }
}

/**
 * Renderiza a matriz consolidada (Faturado vs Meta vs Histórico vs Serv Exec-Plan)
 * com colunas dinâmicas baseadas nos meses selecionados.
 */
function renderMatrix() {
    const theadTr = document.getElementById('matrix-header');
    const tbody   = document.getElementById('matrix-body');
    if (!tbody || !theadTr || globalData.length === 0) return;

    const fAno      = document.getElementById('filter-ano')?.value ?? "ALL";
    const anoAtualStr = fAno !== "ALL" ? fAno : "2026";
    const anoAntStr   = (fAno !== "ALL" && !isNaN(parseInt(fAno))) ? String(parseInt(fAno) - 1) : "Anterior";
    const fCentro   = window.getCheckedCentros();
    const mesesOrdem = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

    let checkedMeses = Array.from(document.querySelectorAll('.mes-checkbox:checked')).map(cb => cb.value);
    checkedMeses.sort((a, b) => mesesOrdem.indexOf(a) - mesesOrdem.indexOf(b));

    if (checkedMeses.length === 0) {
        theadTr.innerHTML = '<th style="background-color: #808080; padding: 6px 10px;">Referência</th>';
        tbody.innerHTML   = '<tr><td colspan="14" class="placeholder-text">Selecione ao menos um mês para visualizar os dados.</td></tr>';
        return;
    }

    // Cabeçalho dinâmico
    let theadHTML = `<th style="background-color: #808080; padding: 6px 10px;">Referência</th>`;
    checkedMeses.forEach(m => { theadHTML += `<th style="text-align: right; padding: 6px 10px;">${m}</th>`; });
    theadHTML += `<th style="text-align: right; background-color: #595959; padding: 6px 10px;">Total</th>`;
    theadTr.innerHTML = theadHTML;

    const filterMetas = (yr) => globalMetas.filter(m => {
        if (m.Ano !== yr) return false;
        if (fCentro !== "ALL" && Array.isArray(fCentro) && !fCentro.includes(m.Centro)) return false;
        return true;
    });

    // Usa getFilteredDataByYear() (filters.js) para manter Centro/UF/Cliente/
    // Tipo de Operação consistentes com o restante do painel — não duplicar
    // a lógica de filtro aqui (já causou divergência com o KPI principal).
    const currData  = getFilteredDataByYear(anoAtualStr);
    const prevData  = getFilteredDataByYear(anoAntStr);
    const currMetas = filterMetas(anoAtualStr);

    let rCurrFat = Array(checkedMeses.length).fill(0);
    let rCurrQtd = Array(checkedMeses.length).fill(0);
    let rPrevFat = Array(checkedMeses.length).fill(0);
    let rMetaFat = Array(checkedMeses.length).fill(0);
    let rMetaQtd = Array(checkedMeses.length).fill(0);

    currData.forEach(d  => { let i = checkedMeses.indexOf(d.Mes);  if (i >= 0) { rCurrFat[i] += d.Valor;    rCurrQtd[i] += d.Quantidade; } });
    prevData.forEach(d  => { let i = checkedMeses.indexOf(d.Mes);  if (i >= 0)   rPrevFat[i] += d.Valor; });
    currMetas.forEach(m => { let i = checkedMeses.indexOf(m.Mes);  if (i >= 0) { rMetaFat[i] += m.MetaValor; rMetaQtd[i] += m.MetaQtd; } });

    const fmt = val => val === 0 ? "-" : val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sum = arr => arr.reduce((a, b) => a + b, 0);

    const buildRow = (label, arr, bg, bgTotal, opts = {}) => {
        let tr = `<tr style="background-color: ${bg}; border-bottom: 2px solid white;">
            <td style="background-color: ${bgTotal}; padding: 6px;">${label}</td>`;
        arr.forEach(v => {
            const cell = opts.center
                ? `<td style="text-align: center; padding: 6px;">${v}</td>`
                : `<td style="text-align: right; padding: 6px;">${fmt(v)}</td>`;
            tr += cell;
        });
        const totalVal = opts.center
            ? `<td style="text-align: center; background-color: ${bgTotal}; font-weight: 600; padding: 6px;">${opts.totalText}</td>`
            : `<td style="text-align: right; background-color: ${bgTotal}; font-weight: 600; padding: 6px;">${fmt(sum(arr))}</td>`;
        tr += totalVal + '</tr>';
        return tr;
    };

    // Linha Serv (Exec-Plan) — formato especial "exec - plan"
    const execPlanCells = checkedMeses.map((_, i) => {
        const exec = Math.round(rCurrQtd[i]), pl = Math.round(rMetaQtd[i]);
        return (exec === 0 && pl === 0) ? "-" : `${exec} - ${pl}`;
    });
    const totalExecPlan = `${Math.round(sum(rCurrQtd))} - ${Math.round(sum(rMetaQtd))}`;

    tbody.innerHTML =
        buildRow(`Faturado ${anoAtualStr}`, rCurrFat, '#DDEBF7', '#BDD7EE') +
        buildRow(`Meta ${anoAtualStr}`,     rMetaFat, '#FCE4D6', '#F8CBAD') +
        buildRow(`Faturado ${anoAntStr}`,   rPrevFat, '#FFF2CC', '#FFE699') +
        buildRow('Serv (Exec-Plan)',         execPlanCells, '#E2EFDA', '#C6E0B4', { center: true, totalText: totalExecPlan });
}

/**
 * Renderiza a matriz de detalhamento por família com colunas mensais dinâmicas
 * mostrando Faturado (R$), Previsto (#), Realizado (#) e % de atingimento.
 */
function renderMatrixFamilias() {
    const fHeaderMonths  = document.getElementById('family-matrix-header-months');
    const fHeaderMetrics = document.getElementById('family-matrix-header-metrics');
    const tbody = document.getElementById('family-matrix-body');
    const tfoot = document.getElementById('family-matrix-foot');
    if (!tbody || globalData.length === 0) return;

    const fAno       = document.getElementById('filter-ano')?.value ?? "ALL";
    const anoAtualStr = fAno !== "ALL" ? fAno : "2026";
    const fCentro    = window.getCheckedCentros();
    const mesesOrdem = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

    let checkedMeses = Array.from(document.querySelectorAll('.mes-checkbox:checked')).map(cb => cb.value);
    checkedMeses.sort((a, b) => mesesOrdem.indexOf(a) - mesesOrdem.indexOf(b));

    if (checkedMeses.length === 0) {
        if (fHeaderMonths)  fHeaderMonths.innerHTML  = '<th rowspan="2" style="background-color: #808080; min-width: 250px; text-align: left; padding: 6px; border: 1px solid white;">Famílias</th>';
        if (fHeaderMetrics) fHeaderMetrics.innerHTML = '';
        tbody.innerHTML = '<tr><td colspan="5" class="placeholder-text">Selecione ao menos um mês.</td></tr>';
        return;
    }

    const metaFilter = (yr) => globalMetas.filter(m => {
        if (m.Ano !== yr) return false;
        if (fCentro !== "ALL" && Array.isArray(fCentro) && !fCentro.includes(m.Centro)) return false;
        return true;
    });

    // Usa getFilteredDataByYear() (filters.js) — ver nota em renderMatrix().
    const currData  = getFilteredDataByYear(anoAtualStr);
    const currMetas = metaFilter(anoAtualStr);

    // Monta cabeçalho duplo (meses + métricas)
    let trMText      = `<th rowspan="2" style="background-color: #A6A6A6; color: black; min-width: 140px; max-width: 200px; text-align: left; padding: 3px 5px; border: 1px solid white; font-size: 10px;">Famílias</th>`;
    let trMetricsText = '';
    const thMes = (label) =>
        `<th colspan="4" style="text-align: center; border: 1px solid white; padding: 2px 3px; background-color: #A6A6A6; color: black; font-size: 10px;">${label}</th>`;
    const thMetric = (label) =>
        `<th style="padding: 2px 3px; border: 1px solid white; background-color: #D9D9D9; color: black; font-size: 9px; white-space: nowrap;">${label}</th>`;

    checkedMeses.forEach(m => {
        trMText      += thMes(m);
        trMetricsText += thMetric('Fat.R$') + thMetric('Prev.#') + thMetric('Real.#') + thMetric('%');
    });
    trMText      += thMes('Acumulado');
    trMetricsText += thMetric('Fat.R$') + thMetric('Prev.#') + thMetric('Real.#') + thMetric('%');

    fHeaderMonths.innerHTML  = trMText;
    fHeaderMetrics.innerHTML = trMetricsText;

    // Coleta famílias únicas de dados + metas
    const setFam = new Set();
    currData.forEach(d  => { if (d.Familia && d.Familia !== 'NÃO IDENTIFICADO') setFam.add(d.Familia.toUpperCase()); });
    currMetas.forEach(m => { if (m.Familia && m.Familia !== 'NÃO IDENTIFICADO') setFam.add(m.Familia.toUpperCase()); });
    const familiasList = Array.from(setFam).sort();

    const fmtFat = v => v === 0 ? "0,00" : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtQtd = v => v === 0 ? "0"    : v.toLocaleString('pt-BR');

    // % de atingimento — mostra quanto do previsto foi atingido
    const calcPctMes   = (real, prev) => prev === 0 ? (real === 0 ? "-" : "Extra") : ((real / prev) * 100).toFixed(2) + "%";
    const calcAtingAcum = (real, prev) => prev === 0 ? (real === 0 ? "-" : "Extra") : ((real / prev) * 100).toFixed(2) + "%";

    const totMes = Array(checkedMeses.length).fill(null).map(() => ({ fat: 0, prev: 0, real: 0 }));
    let totAcumFat = 0, totAcumPrev = 0, totAcumReal = 0;

    const cellStyle = (bg = '#ffffff') => `style="padding: 2px 3px; border: 1px solid rgba(0,0,0,0.1); background-color: ${bg}; white-space: nowrap; font-size: 10px;"`;

    let tbodyHTML = '';
    familiasList.forEach(fam => {
        let trHTML = `<td style="text-align: left; padding: 3px 5px; font-weight: 500; background-color: #E9EBF5; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px;" title="${fam}">${fam}</td>`;
        let rowAcumFat = 0, rowAcumPrev = 0, rowAcumReal = 0;

        for (let i = 0; i < checkedMeses.length; i++) {
            const mesStr  = checkedMeses[i];
            const dataMes = currData.filter(d => d.Familia?.toUpperCase() === fam && d.Mes === mesStr);
            const metaMes = currMetas.filter(m => m.Familia?.toUpperCase() === fam && m.Mes === mesStr);

            const fat  = dataMes.reduce((a, b) => a + b.Valor, 0);
            const real = dataMes.reduce((a, b) => a + b.Quantidade, 0);
            const prev = metaMes.reduce((a, b) => a + b.MetaQtd, 0);

            rowAcumFat += fat; rowAcumPrev += prev; rowAcumReal += real;
            totMes[i].fat += fat; totMes[i].prev += prev; totMes[i].real += real;

            trHTML += `
                <td ${cellStyle()}>${fmtFat(fat)}</td>
                <td ${cellStyle()}>${fmtQtd(prev)}</td>
                <td ${cellStyle()}>${(fat > 0 || real > 0) ? fmtQtd(real) : ""}</td>
                <td ${cellStyle()}>${calcPctMes(real, prev)}</td>`;
        }

        totAcumFat += rowAcumFat; totAcumPrev += rowAcumPrev; totAcumReal += rowAcumReal;
        trHTML += `
            <td ${cellStyle('#FFF2CC')}>${fmtFat(rowAcumFat)}</td>
            <td ${cellStyle('#FFF2CC')}>${fmtQtd(rowAcumPrev)}</td>
            <td ${cellStyle('#FFF2CC')}>${(rowAcumFat > 0 || rowAcumReal > 0) ? fmtQtd(rowAcumReal) : "0"}</td>
            <td ${cellStyle('#FFF2CC')}>${calcAtingAcum(rowAcumReal, rowAcumPrev)}</td>`;

        tbodyHTML += `<tr style="border-bottom: 2px solid white;">${trHTML}</tr>`;
    });
    tbody.innerHTML = tbodyHTML;

    // Rodapé de totais
    const cellFootStyle = (bg = '#00AD68') => `style="padding: 2px 4px; border: 1px solid rgba(255,255,255,0.3); white-space: nowrap; font-size: 10px; font-weight: 700; color: white !important; background-color: ${bg} !important;"`;
    let tfootHTML = `<td ${cellFootStyle()}>Totais</td>`;
    for (let i = 0; i < checkedMeses.length; i++) {
        const { fat, prev, real } = totMes[i];
        tfootHTML += `
            <td ${cellFootStyle()}>${fmtFat(fat)}</td>
            <td ${cellFootStyle()}>${fmtQtd(prev)}</td>
            <td ${cellFootStyle()}>${(fat > 0 || real > 0) ? fmtQtd(real) : "0"}</td>
            <td ${cellFootStyle()}>${calcPctMes(real, prev)}</td>`;
    }
    tfootHTML += `
        <td ${cellFootStyle('#008a53')}>${fmtFat(totAcumFat)}</td>
        <td ${cellFootStyle('#008a53')}>${fmtQtd(totAcumPrev)}</td>
        <td ${cellFootStyle('#008a53')}>${(totAcumFat > 0 || totAcumReal > 0) ? fmtQtd(totAcumReal) : "0"}</td>
        <td ${cellFootStyle('#008a53')}>${calcAtingAcum(totAcumReal, totAcumPrev)}</td>`;
    tfoot.innerHTML = `<tr>${tfootHTML}</tr>`;
}
