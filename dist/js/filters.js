// =============================================================================
// filters.js — População dos filtros sidebar e queries sobre globalData/globalMetas
// =============================================================================
// Depende de: state.js (globalData, globalMetas)
// Chama ao mudar filtro: updateDashboard() [dashboard.js]
// =============================================================================

/**
 * Constrói dinamicamente os controles de filtro da sidebar
 * (Ano, Centro de Custo, Meses, UF, Clientes) a partir dos dados carregados.
 * Deve ser chamada após qualquer carga de base.
 *
 * IMPORTANTE: usa concatenação em array + join + uma única atribuição de innerHTML
 * por bloco (em vez de innerHTML += em loop), para evitar O(n²) em DOM e
 * o popup "Página sem resposta" em bases grandes.
 */
async function populateFilters() {
    const anos     = [...new Set(globalData.map(d => d.Ano))].filter(a => a !== "Ano Desconhecido" && a).sort().reverse();
    const centros  = [...new Set(globalData.map(d => d.Centro))].sort();
    const ufs      = [...new Set(globalData.map(d => d.UF))].sort();
    const clientes = [...new Set(globalData.map(d => d.Cliente))].filter(c => c && c !== "NÃO IDENTIFICADO").sort();

    // --- Ano ---
    const selectAno = document.getElementById('filter-ano');
    if (selectAno) {
        const optsAno = ['<option value="ALL">Todos os Anos</option>'];
        anos.forEach(a => optsAno.push(`<option value="${a}">${a}</option>`));
        selectAno.innerHTML = optsAno.join('');
        selectAno.onchange = updateDashboard;
    }

    // --- UF ---
    const addOptions = (id, list) => {
        const select = document.getElementById(id);
        if (!select) return;
        const opts = ['<option value="ALL">Selecionar Tudo</option>'];
        list.forEach(item => {
            if (item && item !== 'ND') opts.push(`<option value="${item}">${item}</option>`);
        });
        select.innerHTML = opts.join('');
        select.onchange = updateDashboard;
    };
    addOptions('filter-uf', ufs);

    // --- Centro de Custo (checkboxes) ---
    const centroContainer = document.getElementById('filter-centro-container');
    if (centroContainer) {
        const partsCentro = [
            '<label class="checkbox-item" style="display: block; margin-bottom: 5px;">',
            '<input type="checkbox" id="centro-all" checked onchange="toggleAllCentros(this)"> ',
            '<strong>Selecionar/Limpar Todos</strong></label>'
        ];
        centros.forEach(item => {
            if (item && item !== 'ND') {
                const sigla = getCentroSigla(item);
                const labelText = sigla !== item ? `<strong>${sigla}</strong> | ${item}` : item;
                partsCentro.push(
                    `<label class="checkbox-item" style="display: block; font-size: 11px; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item}">` +
                    `<input type="checkbox" class="centro-checkbox" value="${item}" checked onchange="updateCentroCheckboxes()"> ${labelText}</label>`
                );
            }
        });
        centroContainer.innerHTML = partsCentro.join('');
    }

    // --- Meses (checkboxes) ---
    const mesContainer = document.getElementById('filter-mes-container');
    if (mesContainer) {
        const partsMes = [
            '<label class="checkbox-item"><input type="checkbox" id="mes-all" checked onchange="toggleAllMeses(this)"> <strong>Selecionar/Limpar Todos</strong></label>'
        ];
        ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"].forEach(m => {
            partsMes.push(`<label class="checkbox-item"><input type="checkbox" class="mes-checkbox" value="${m}" checked onchange="updateMesCheckboxes()"> ${m}</label>`);
        });
        mesContainer.innerHTML = partsMes.join('');
    }

    // --- Tipo de Operação: Produto/Serviço (checkboxes) ---
    const tipoOperacaoContainer = document.getElementById('filter-tipo-operacao-container');
    if (tipoOperacaoContainer) {
        const tiposOperacao = [...new Set(globalData.map(d => d.TipoOperacao))].sort();
        const partsTipoOp = [
            '<label class="checkbox-item"><input type="checkbox" id="tipo-operacao-all" checked onchange="toggleAllTipoOperacao(this)"> <strong>Selecionar/Limpar Todos</strong></label>'
        ];
        tiposOperacao.forEach(t => {
            partsTipoOp.push(`<label class="checkbox-item"><input type="checkbox" class="tipo-operacao-checkbox" value="${t}" checked onchange="updateTipoOperacaoCheckboxes()"> ${t}</label>`);
        });
        tipoOperacaoContainer.innerHTML = partsTipoOp.join('');
    }

    // Yield antes do bloco de clientes (que pode ser pesado: 1000+ checkboxes)
    if (typeof yieldUI === 'function') await yieldUI();

    // --- Clientes (checkboxes com busca) ---
    const clienteContainer = document.getElementById('filter-cliente-container');
    if (clienteContainer) {
        clienteContainer.innerHTML = `
            <input type="text" id="search-cliente" placeholder="Buscar cliente..."
                   style="width: 100%; padding: 4px 8px; margin-bottom: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 11px;"
                   onkeyup="filterClientList(this.value)">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-bottom: 8px;">
                <span id="cliente-count" style="font-size: 10px; color: var(--text-muted);"></span>
                <button type="button" onclick="clearClienteSelection()"
                        title="Desmarcar todos os clientes — depois busque e marque apenas os desejados"
                        style="font-size: 10px; padding: 2px 8px; border: 1px solid #ddd; border-radius: 4px; background: #fff; color: var(--tecpar-blue); cursor: pointer; font-weight: 600;">
                    Limpar seleção
                </button>
            </div>
            <label class="checkbox-item" style="display: block; margin-bottom: 5px;">
                <input type="checkbox" id="cliente-all" checked onchange="toggleAllClientes(this)">
                <strong>Selecionar/Limpar Todos</strong>
            </label>
            <div id="cliente-list-inner"></div>
        `;

        // Constrói TODA a lista de clientes em memória (array → join) e atribui
        // innerHTML uma única vez. Para 3 mil clientes isso desce de ~10s para <100ms.
        const listInner = document.getElementById('cliente-list-inner');
        if (listInner) {
            if (typeof updateLoading === 'function') {
                updateLoading(null, `Montando lista de ${clientes.length.toLocaleString('pt-BR')} clientes…`);
            }
            const partsCli = [];
            const total = clientes.length;
            for (let i = 0; i < total; i++) {
                const item = clientes[i];
                partsCli.push(
                    `<label class="checkbox-item client-row" style="display: block; font-size: 10px; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item}">` +
                    `<input type="checkbox" class="cliente-checkbox" value="${item}" checked onchange="updateClienteCheckboxes()"> ${item}</label>`
                );
                // Yield a cada 1000 clientes para manter UI responsiva em bases muito grandes
                if (i > 0 && i % 1000 === 0 && typeof yieldUI === 'function') {
                    await yieldUI();
                }
            }
            listInner.innerHTML = partsCli.join('');
        }
        window.updateClienteCount();
    }
}

window.filterClientList = function(val) {
    const filter = val.toUpperCase();
    const rows = document.querySelectorAll('.client-row');
    rows.forEach(row => {
        const text = row.innerText || row.textContent;
        row.style.display = text.toUpperCase().indexOf(filter) > -1 ? "" : "none";
    });
};

// --- Handlers de checkbox expostos globalmente (chamados via onchange inline no HTML) ---

window.getCheckedCentros = function () {
    const elAll = document.getElementById('centro-all');
    if (elAll && elAll.checked) return "ALL";
    const cbs = document.querySelectorAll('.centro-checkbox:checked');
    if (cbs.length > 0) return Array.from(cbs).map(cb => cb.value);
    const slc = document.getElementById('filter-centro');
    if (slc) return slc.value;
    return [];
};

window.toggleAllCentros = function (master) {
    document.querySelectorAll('.centro-checkbox').forEach(cb => cb.checked = master.checked);
    updateDashboard();
};

window.updateCentroCheckboxes = function () {
    const total   = document.querySelectorAll('.centro-checkbox').length;
    const marcados = document.querySelectorAll('.centro-checkbox:checked').length;
    document.getElementById('centro-all').checked = (total === marcados);
    updateDashboard();
};

window.toggleAllMeses = function (master) {
    document.querySelectorAll('.mes-checkbox').forEach(cb => cb.checked = master.checked);
    updateDashboard();
};

window.updateMesCheckboxes = function () {
    const total   = document.querySelectorAll('.mes-checkbox').length;
    const marcados = document.querySelectorAll('.mes-checkbox:checked').length;
    document.getElementById('mes-all').checked = (total === marcados);
    updateDashboard();
};

window.getCheckedTiposOperacao = function () {
    const elAll = document.getElementById('tipo-operacao-all');
    if (elAll && elAll.checked) return "ALL";
    const cbs = document.querySelectorAll('.tipo-operacao-checkbox:checked');
    return Array.from(cbs).map(cb => cb.value);
};

window.toggleAllTipoOperacao = function (master) {
    document.querySelectorAll('.tipo-operacao-checkbox').forEach(cb => cb.checked = master.checked);
    updateDashboard();
};

window.updateTipoOperacaoCheckboxes = function () {
    const total    = document.querySelectorAll('.tipo-operacao-checkbox').length;
    const marcados = document.querySelectorAll('.tipo-operacao-checkbox:checked').length;
    document.getElementById('tipo-operacao-all').checked = (total === marcados);
    updateDashboard();
};

window.getCheckedClientes = function () {
    const elAll = document.getElementById('cliente-all');
    if (elAll && elAll.checked) return "ALL";
    const cbs = document.querySelectorAll('.cliente-checkbox:checked');
    return Array.from(cbs).map(cb => cb.value);
};

window.toggleAllClientes = function (master) {
    document.querySelectorAll('.cliente-checkbox').forEach(cb => cb.checked = master.checked);
    window.updateClienteCount();
    updateDashboard();
};

window.updateClienteCheckboxes = function () {
    const total   = document.querySelectorAll('.cliente-checkbox').length;
    const marcados = document.querySelectorAll('.cliente-checkbox:checked').length;
    const elAll = document.getElementById('cliente-all');
    if (elAll) elAll.checked = (total === marcados);
    window.updateClienteCount();
    updateDashboard();
};

/**
 * Desmarca todos os clientes de uma vez — habilita o fluxo "começar do zero":
 * Limpar seleção → buscar → marcar apenas os clientes desejados.
 * (Antes, escolher 2 clientes exigia desmarcar centenas manualmente.)
 */
window.clearClienteSelection = function () {
    document.querySelectorAll('.cliente-checkbox').forEach(cb => cb.checked = false);
    const elAll = document.getElementById('cliente-all');
    if (elAll) elAll.checked = false;
    window.updateClienteCount();
    updateDashboard();
};

/**
 * Atualiza o contador "N de M selecionados" do filtro de clientes.
 * Laranja em negrito quando a seleção é parcial (filtro ativo);
 * cinza discreto quando todos estão marcados (padrão).
 */
window.updateClienteCount = function () {
    const el = document.getElementById('cliente-count');
    if (!el) return;
    const total    = document.querySelectorAll('.cliente-checkbox').length;
    const marcados = document.querySelectorAll('.cliente-checkbox:checked').length;
    el.innerText = `${marcados.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} selecionados`;
    const parcial = marcados !== total;
    el.style.color      = parcial ? 'var(--tecpar-orange)' : 'var(--text-muted)';
    el.style.fontWeight = parcial ? '700' : '400';
};

/**
 * Indicador global de filtro ativo (selo laranja no cabeçalho da sidebar).
 * Conta quantos filtros da sidebar estão diferentes do padrão (tudo selecionado)
 * e lista quais no tooltip. Fica oculto quando nada está filtrado.
 *
 * Complementa o context-banner da aba Faturamento: este selo permanece visível
 * em qualquer aba e mesmo com a sidebar recolhida, e só acende quando há desvio
 * do padrão — reduz o risco de ler número filtrado como se fosse a base inteira.
 */
window.updateFilterIndicator = function () {
    const el = document.getElementById('filter-indicator');
    if (!el) return;
    if (typeof globalData === 'undefined' || globalData.length === 0) {
        el.hidden = true;
        return;
    }

    const ativos = [];

    const fAno = document.getElementById('filter-ano')?.value ?? 'ALL';
    if (fAno !== 'ALL') ativos.push('Ano: ' + fAno);

    if (window.getCheckedCentros() !== 'ALL') {
        const t = document.querySelectorAll('.centro-checkbox').length;
        const n = document.querySelectorAll('.centro-checkbox:checked').length;
        ativos.push(`Centro de custo (${n}/${t})`);
    }

    const mesT = document.querySelectorAll('.mes-checkbox').length;
    const mesN = document.querySelectorAll('.mes-checkbox:checked').length;
    if (mesT > 0 && mesN !== mesT) ativos.push(`Meses (${mesN}/${mesT})`);

    if (window.getCheckedTiposOperacao() !== 'ALL') {
        const t = document.querySelectorAll('.tipo-operacao-checkbox').length;
        const n = document.querySelectorAll('.tipo-operacao-checkbox:checked').length;
        ativos.push(`Tipo de operação (${n}/${t})`);
    }

    const fUf = document.getElementById('filter-uf')?.value ?? 'ALL';
    if (fUf !== 'ALL') ativos.push('UF: ' + fUf);

    if (window.getCheckedClientes() !== 'ALL') {
        const t = document.querySelectorAll('.cliente-checkbox').length;
        const n = document.querySelectorAll('.cliente-checkbox:checked').length;
        ativos.push(`Clientes (${n}/${t})`);
    }

    const n = ativos.length;
    if (n === 0) {
        el.hidden = true;
        el.title = '';
        return;
    }
    el.hidden = false;
    el.innerHTML =
        '<span class="fi-dot" aria-hidden="true">●</span>' +
        `<span class="fi-count">${n}</span>` +
        `<span class="fi-text">filtro${n > 1 ? 's' : ''} ativo${n > 1 ? 's' : ''}</span>`;
    el.title = 'Filtros ativos:\n• ' + ativos.join('\n• ') +
               '\n\nClique em "Limpar" para restaurar o padrão.';
};

/**
 * Restaura todos os filtros da sidebar para o padrão (tudo selecionado)
 * e redesenha o dashboard. Chamado pelo botão "Limpar" (index.html).
 * Não afeta a aba Fidelidade, que possui filtros próprios.
 */
window.resetAllFilters = function () {
    if (typeof globalData === 'undefined' || globalData.length === 0) return;

    const selAno = document.getElementById('filter-ano');
    if (selAno) selAno.value = 'ALL';
    const selUf = document.getElementById('filter-uf');
    if (selUf) selUf.value = 'ALL';

    const checkAll = (masterId, cls) => {
        const master = document.getElementById(masterId);
        if (master) master.checked = true;
        document.querySelectorAll(cls).forEach(cb => cb.checked = true);
    };
    checkAll('centro-all',        '.centro-checkbox');
    checkAll('mes-all',           '.mes-checkbox');
    checkAll('tipo-operacao-all', '.tipo-operacao-checkbox');
    checkAll('cliente-all',       '.cliente-checkbox');

    const search = document.getElementById('search-cliente');
    if (search) {
        search.value = '';
        window.filterClientList('');
    }
    window.updateClienteCount();

    updateDashboard();
};

// --- Funções de consulta filtrada ---

/**
 * Retorna registros de globalData aplicando todos os filtros ativos da sidebar.
 * Exclui clientes não identificados.
 */
function getFilteredData() {
    const fAno    = document.getElementById('filter-ano')?.value ?? "ALL";
    const fCentro = window.getCheckedCentros();
    const fUf     = document.getElementById('filter-uf').value;
    const fCliente = window.getCheckedClientes();
    const fTipoOperacao = window.getCheckedTiposOperacao();
    const mesesAtivos = Array.from(document.querySelectorAll('.mes-checkbox:checked')).map(cb => cb.value);

    return globalData.filter(d => {
        if (fAno !== "ALL" && d.Ano !== fAno) return false;
        if (fCentro !== "ALL" && Array.isArray(fCentro) && !fCentro.includes(d.Centro)) return false;
        if (fUf !== "ALL" && d.UF !== fUf) return false;
        if (fCliente !== "ALL" && Array.isArray(fCliente) && !fCliente.includes(d.Cliente)) return false;
        if (fTipoOperacao !== "ALL" && Array.isArray(fTipoOperacao) && !fTipoOperacao.includes(d.TipoOperacao)) return false;
        if (!mesesAtivos.includes(d.Mes)) return false;

        return true;
    });
}

/**
 * Retorna registros de globalData para um ano específico, mantendo os demais filtros ativos.
 * Usado para cálculos YoY (comparativo com ano anterior).
 *
 * @param {string} targetAno - Ano alvo (ex: "2025")
 */
function getFilteredDataByYear(targetAno) {
    const fCentro = window.getCheckedCentros();
    const fUf     = document.getElementById('filter-uf').value;
    const fCliente = window.getCheckedClientes();
    const fTipoOperacao = window.getCheckedTiposOperacao();
    const mesesAtivos = Array.from(document.querySelectorAll('.mes-checkbox:checked')).map(cb => cb.value);

    return globalData.filter(d => {
        if (d.Ano !== targetAno) return false;
        if (fCentro !== "ALL" && Array.isArray(fCentro) && !fCentro.includes(d.Centro)) return false;
        if (fUf !== "ALL" && d.UF !== fUf) return false;
        if (fCliente !== "ALL" && Array.isArray(fCliente) && !fCliente.includes(d.Cliente)) return false;
        if (fTipoOperacao !== "ALL" && Array.isArray(fTipoOperacao) && !fTipoOperacao.includes(d.TipoOperacao)) return false;
        if (!mesesAtivos.includes(d.Mes)) return false;

        return true;
    });
}

/**
 * Retorna registros de globalMetas aplicando filtros de Ano, Centro e Mês ativos.
 */
function getFilteredMetas() {
    if (globalMetas.length === 0) return [];
    const fAno    = document.getElementById('filter-ano')?.value ?? "ALL";
    const fCentro = window.getCheckedCentros();
    const mesesAtivos = Array.from(document.querySelectorAll('.mes-checkbox:checked')).map(cb => cb.value);

    return globalMetas.filter(m => {
        if (fAno !== "ALL" && m.Ano !== fAno) return false;
        if (fCentro !== "ALL" && Array.isArray(fCentro) && !fCentro.includes(m.Centro)) return false;
        if (!mesesAtivos.includes(m.Mes)) return false;
        return true;
    });
}
