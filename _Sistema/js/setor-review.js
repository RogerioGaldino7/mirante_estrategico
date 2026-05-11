// =============================================================================
// setor-review.js — Tela de Revisão Setorial
// =============================================================================

// Depende de: state.js (globalData, formatter)
//             setor.js (SETOR_OVERRIDES, classificarSetor, setOverrideSetorial)
//
// Esta tela e uma camada operacional para corrigir classificacoes sem editar
// codigo. As alteracoes ficam persistidas no localStorage via setor.js.

/**
 * Renderiza a tabela de revisão de classificação setorial dos clientes.
 * Lista todos os clientes carregados em globalData, permite busca e alteração
 * da categoria (Público/Privado) diretamente via UI.
 */
// A chave de edicao e o CNPJRaiz, porque a analise de fidelidade considera
// grupo economico / raiz de orgao como entidade principal.
function renderSetorReview() {
    const container = document.getElementById('setor-review-body');
    if (!container) return;

    if (!globalData || globalData.length === 0) {
        container.innerHTML = '<tr><td colspan="5" class="placeholder-text">Carregue as bases de dados para iniciar a revisão.</td></tr>';
        document.getElementById('setor-review-count').innerText = "0 clientes encontrados";
        return;
    }

    // 1. Agrupar clientes únicos pelo CNPJ Raiz
    const clientesMap = new Map();
    globalData.forEach(d => {
        if (!d.CNPJRaiz || d.CNPJRaiz.length !== 8) return; 
        
        if (!clientesMap.has(d.CNPJRaiz)) {
            clientesMap.set(d.CNPJRaiz, {
                CNPJRaiz: d.CNPJRaiz,
                Cliente: d.Cliente,
                SetorDetalhado: classificarSetor(d), // Usa as regras do setor.js
                HasOverride: !!SETOR_OVERRIDES[d.CNPJRaiz], // True se foi sobrescrito
                FaturamentoTotal: 0
            });
        }
        clientesMap.get(d.CNPJRaiz).FaturamentoTotal += d.Valor;
    });

    // 2. Aplicar busca
    const searchInput = document.getElementById('setor-review-search');
    const filterText = searchInput ? searchInput.value.toUpperCase().trim() : '';

    let rows = Array.from(clientesMap.values());
    if (filterText) {
        rows = rows.filter(c => 
            c.Cliente.toUpperCase().includes(filterText) || 
            c.CNPJRaiz.includes(filterText)
        );
    }
    
    // 3. Ordenar por faturamento decrescente (mais relevantes primeiro)
    rows.sort((a, b) => b.FaturamentoTotal - a.FaturamentoTotal);

    document.getElementById('setor-review-count').innerText = `${rows.length.toLocaleString('pt-BR')} clientes encontrados`;

    // 4. Paginação / Limite de renderização (para não travar o DOM com milhares de selects)
    const maxRender = 100;
    const toRender = rows.slice(0, maxRender);

    const catOptions = [
        { val: 'AUTO', lbl: '✨ Automático (Heurística)' },
        { val: 'PUBLICO_FEDERAL', lbl: '🏛️ Público Federal' },
        { val: 'PUBLICO_ESTADUAL', lbl: '🏛️ Público Estadual' },
        { val: 'PUBLICO_MUNICIPAL', lbl: '🏛️ Público Municipal' },
        { val: 'PUBLICO_OUTROS', lbl: '🏛️ Público (Outros/Autarquias)' },
        { val: 'PRIVADO', lbl: '🏢 Privado' },
        { val: 'EXTERIOR', lbl: '🌐 Exterior' }
    ];

    let html = '';
    
    if (toRender.length === 0) {
        html = '<tr><td colspan="5" class="placeholder-text" style="padding: 20px;">Nenhum cliente encontrado com a busca atual.</td></tr>';
    } else {
        toRender.forEach(c => {
            // Destaque visual para linhas que possuem intervenção manual
            const bgClass = c.HasOverride ? 'background-color: #E2EFDA;' : '';
            const currentSel = c.HasOverride ? c.SetorDetalhado : 'AUTO';
            
            let selectHtml = `<select data-cnpj="${c.CNPJRaiz}" onchange="changeSetorOverride(this)" 
                style="font-size: 11px; padding: 6px; border: 1px solid #ccc; border-radius: 4px; width: 100%; max-width: 200px; cursor: pointer; ${c.HasOverride ? 'border-color: #548235; font-weight: 600;' : ''}">`;
            
            catOptions.forEach(opt => {
                const sel = currentSel === opt.val ? 'selected' : '';
                // Se a opção é AUTO, mostramos no texto qual foi a decisão da heurística
                const label = opt.val === 'AUTO' ? `${opt.lbl} -> ${c.SetorDetalhado.replace('PUBLICO_','')}` : opt.lbl;
                selectHtml += `<option value="${opt.val}" ${sel}>${label}</option>`;
            });
            selectHtml += `</select>`;

            const badgeOrigem = c.HasOverride 
                ? `<span style="background: #548235; color: white; padding: 2px 6px; border-radius: 10px; font-size: 9px; font-weight: 600;">MANUAL</span>` 
                : `<span style="background: #e1dfdd; color: #323130; padding: 2px 6px; border-radius: 10px; font-size: 9px;">AUTO</span>`;

            html += `
            <tr style="border-bottom: 1px solid #eee; transition: background 0.2s; ${bgClass}">
                <td style="padding: 10px 12px; font-size: 12px; font-family: monospace;">${c.CNPJRaiz}</td>
                <td style="padding: 10px 12px; font-size: 12px; font-weight: 500;">${c.Cliente}</td>
                <td style="padding: 10px 12px; font-size: 12px; text-align: right;">${formatter.format(c.FaturamentoTotal)}</td>
                <td style="padding: 10px 12px; text-align: center;">${badgeOrigem}</td>
                <td style="padding: 10px 12px; text-align: right;">${selectHtml}</td>
            </tr>`;
        });

        if (rows.length > maxRender) {
            html += `<tr><td colspan="5" class="placeholder-text" style="padding: 16px; background: #faf9f8;">Mostrando os <b>${maxRender}</b> maiores clientes (por faturamento). Use a barra de busca acima para encontrar clientes específicos.</td></tr>`;
        }
    }

    container.innerHTML = html;
}

/**
 * Event Listener invocado quando o select de categoria é alterado
 */
// Handler global chamado pelo atributo onchange dos selects criados em
// renderSetorReview().
window.changeSetorOverride = function(selectEl) {
    const cnpj = selectEl.getAttribute('data-cnpj');
    const val = selectEl.value;
    
    // Chama a função do setor.js para salvar no localStorage
    setOverrideSetorial(cnpj, val);
    
    // Re-renderiza a tabela para atualizar as cores e badges
    renderSetorReview();
};

/**
 * Filtro em tempo real (com pequeno debounce)
 */
let _setorFilterTimeout;
// Busca com debounce para evitar re-renderizar a tabela a cada tecla em bases
// com muitos clientes.
window.filterSetorReview = function() {
    clearTimeout(_setorFilterTimeout);
    _setorFilterTimeout = setTimeout(() => {
        renderSetorReview();
    }, 300);
};
