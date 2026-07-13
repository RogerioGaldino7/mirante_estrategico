// =============================================================================
// tipo-review.js — Tela de Revisão de Tipo de Operação (Famílias)
// =============================================================================

/**
 * Renderiza a tabela de classificação de tipo de operação das Famílias.
 * Lista todas as famílias encontradas em faturamento real ou metas,
 * permitindo buscar e filtrar por Tipo Atual (Serviço/Produto) ou modificados.
 */
function renderTipoReview() {
    const container = document.getElementById('tipo-review-body');
    if (!container) return;

    if ((!globalData || globalData.length === 0) && (!globalMetas || globalMetas.length === 0)) {
        container.innerHTML = '<tr><td colspan="5" class="placeholder-text">Carregue as bases de dados ou metas para iniciar a classificação.</td></tr>';
        const countEl = document.getElementById('tipo-review-count');
        if (countEl) countEl.innerText = "0 famílias";
        return;
    }

    // 1. Coletar famílias únicas e seus centros a partir de faturamento real e metas
    const familiasMap = new Map();
    
    // De globalData
    if (globalData) {
        globalData.forEach(d => {
            const f = String(d.Familia || '').trim();
            if (!f || f === 'NÃO IDENTIFICADO') return;
            const fUpper = f.toUpperCase();
            
            if (!familiasMap.has(fUpper)) {
                familiasMap.set(fUpper, {
                    Familia: f,
                    Centros: new Set([d.Centro]),
                    ValorTotal: 0
                });
            } else {
                familiasMap.get(fUpper).Centros.add(d.Centro);
            }
            familiasMap.get(fUpper).ValorTotal += d.Valor;
        });
    }

    // De globalMetas (caso haja famílias de metas sem faturamento real correspondente)
    if (globalMetas) {
        globalMetas.forEach(m => {
            const f = String(m.Familia || '').trim();
            if (!f) return;
            const fUpper = f.toUpperCase();
            
            if (!familiasMap.has(fUpper)) {
                familiasMap.set(fUpper, {
                    Familia: f,
                    Centros: new Set([m.Centro]),
                    ValorTotal: 0
                });
            } else {
                familiasMap.get(fUpper).Centros.add(m.Centro);
            }
        });
    }

    // 2. Obter filtros da UI
    const searchInput = document.getElementById('tipo-review-search');
    const filterText = searchInput ? searchInput.value.toUpperCase().trim() : '';

    const filterTipoSelect = document.getElementById('tipo-review-filter-tipo');
    const filterTipo = filterTipoSelect ? filterTipoSelect.value : 'ALL';

    // 3. Processar e classificar cada linha
    let rows = Array.from(familiasMap.values()).map(c => {
        const fUpper = c.Familia.toUpperCase();
        const hasOverride = !!TIPO_OVERRIDES[fUpper];
        
        let hasCVI = false;
        let hasNonCVI = false;
        c.Centros.forEach(centro => {
            const upper = centro.toUpperCase();
            if (upper.includes('IMUNOBIOL') || upper === 'CENTRO DE IMUNOBIOLÓGICOS VETERINÁRIOS') {
                hasCVI = true;
            } else {
                hasNonCVI = true;
            }
        });

        let autoTipo;
        if (hasCVI && hasNonCVI) {
            autoTipo = 'Misto (Produto/Serviço)';
        } else if (hasCVI) {
            autoTipo = 'Produto';
        } else {
            autoTipo = 'Serviço';
        }

        const finalTipo = hasOverride ? TIPO_OVERRIDES[fUpper] : autoTipo;
        const centrosLabel = Array.from(c.Centros).sort().join(', ');

        return {
            ...c,
            centrosLabel,
            autoTipo,
            finalTipo,
            hasOverride
        };
    });

    // 4. Aplicar busca por texto (nome da Família)
    if (filterText) {
        rows = rows.filter(r => r.Familia.toUpperCase().includes(filterText) || r.centrosLabel.toUpperCase().includes(filterText));
    }

    // 5. Aplicar filtro por Tipo Atual
    if (filterTipo === 'Serviço' || filterTipo === 'Produto') {
        rows = rows.filter(r => r.finalTipo === filterTipo);
    } else if (filterTipo === 'OVERRIDE') {
        rows = rows.filter(r => r.hasOverride);
    }

    // 6. Ordenar por faturamento decrescente (mais relevantes primeiro)
    rows.sort((a, b) => b.ValorTotal - a.ValorTotal);

    // Atualizar contagem
    const countEl = document.getElementById('tipo-review-count');
    if (countEl) {
        countEl.innerText = `${rows.length} família(s) encontrada(s)`;
    }

    // 7. Renderizar linhas
    let html = '';
    
    if (rows.length === 0) {
        html = '<tr><td colspan="5" class="placeholder-text" style="padding: 20px;">Nenhuma família encontrada com os filtros atuais.</td></tr>';
    } else {
        rows.forEach(c => {
            const bgStyle = c.hasOverride ? 'background-color: #FFF2CC;' : ''; // tom amarelado leve
            const currentSel = c.hasOverride ? TIPO_OVERRIDES[c.Familia.toUpperCase()] : 'AUTO';
            
            let selectHtml = `<select data-familia="${c.Familia}" onchange="changeTipoOverride(this)" 
                style="font-size: 11px; padding: 6px; border: 1px solid #ccc; border-radius: 4px; width: 100%; max-width: 200px; cursor: pointer; ${c.hasOverride ? 'border-color: #d88b0a; font-weight: 600;' : ''}">`;
            
            const options = [
                { val: 'AUTO', lbl: `✨ Automático (${c.autoTipo})` },
                { val: 'Serviço', lbl: '🛠️ Serviço' },
                { val: 'Produto', lbl: '📦 Produto' }
            ];
            
            options.forEach(opt => {
                const sel = currentSel === opt.val ? 'selected' : '';
                selectHtml += `<option value="${opt.val}" ${sel}>${opt.lbl}</option>`;
            });
            selectHtml += `</select>`;

            const badgeOrigem = c.hasOverride 
                ? `<span style="background: #d88b0a; color: white; padding: 2px 6px; border-radius: 10px; font-size: 9px; font-weight: 600;">MANUAL</span>` 
                : `<span style="background: #e1dfdd; color: #323130; padding: 2px 6px; border-radius: 10px; font-size: 9px;">AUTO</span>`;

            html += `
            <tr style="border-bottom: 1px solid #eee; transition: background 0.2s; ${bgStyle}">
                <td style="padding: 10px 12px; font-size: 12px; font-weight: 600;">${c.Familia}</td>
                <td style="padding: 10px 12px; font-size: 12px; color: #555;">${c.centrosLabel}</td>
                <td style="padding: 10px 12px; font-size: 12px; font-weight: 500;">${c.finalTipo}</td>
                <td style="padding: 10px 12px; text-align: center;">${badgeOrigem}</td>
                <td style="padding: 10px 12px; text-align: right;">${selectHtml}</td>
            </tr>`;
        });
    }

    container.innerHTML = html;
}

/**
 * Event Listener invocado quando o select de classificação da família é alterado
 */
window.changeTipoOverride = function(selectEl) {
    const familia = selectEl.getAttribute('data-familia');
    const val = selectEl.value;
    
    // Chama a função do tipo-operacao.js para salvar no localStorage
    setOverrideTipo(familia, val);
    
    // Re-renderiza a tabela para atualizar cores, badges e categorias
    renderTipoReview();
};

/**
 * Filtro em tempo real (com pequeno debounce)
 */
let _tipoFilterTimeout;
window.filterTipoReview = function() {
    clearTimeout(_tipoFilterTimeout);
    _tipoFilterTimeout = setTimeout(() => {
        renderTipoReview();
    }, 250);
};
