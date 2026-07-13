// =============================================================================
// tipo-operacao.js — Classificação de Tipo de Operação (Serviço / Produto)
// =============================================================================
// Gerencia a classificação de famílias em Serviço ou Produto.
// Permite que o usuário crie overrides via UI na aba de Configurações,
// persistindo os dados em localStorage.
// =============================================================================

const TIPO_OVERRIDES = {}; // Família (UPPERCASE) → "Serviço" | "Produto"
const TIPO_STORAGE_KEY = 'tecpar_tipo_overrides_v1';

/**
 * Classifica um registro ou uma meta em Serviço ou Produto.
 * Aplica os overrides do usuário salvos no localStorage,
 * caso contrário cai na heurística baseada no Centro de Custo.
 *
 * @param {string} centro - Nome do Centro de Custo (raw ou normalizado)
 * @param {string} familia - Nome da Família de produto/serviço
 */
function classificarTipoOperacao(centro, familia) {
    const f = String(familia || '').toUpperCase().trim();
    
    // 1. Verificar override manual
    if (TIPO_OVERRIDES[f]) {
        return TIPO_OVERRIDES[f];
    }
    
    // 2. Heurística padrão por Centro de Custo
    const c = String(centro || '').toUpperCase().trim();
    if (c.includes("IMUNOBIOL") || c === "CENTRO DE IMUNOBIOLÓGICOS VETERINÁRIOS") {
        return 'Produto';
    }
    
    return 'Serviço';
}

/**
 * Carrega overrides de tipo de operação salvos no localStorage.
 */
function carregarOverridesTipo() {
    try {
        const stored = localStorage.getItem(TIPO_STORAGE_KEY);
        if (!stored) return;
        const data = JSON.parse(stored);
        Object.keys(data).forEach(k => TIPO_OVERRIDES[k] = data[k]);
        const n = Object.keys(TIPO_OVERRIDES).length;
        if (n > 0) console.log(`[Tipo Operação] ${n} override(s) de tipo carregado(s) do localStorage.`);
    } catch (e) {
        console.warn('[Tipo Operação] Erro ao carregar overrides do localStorage:', e);
    }
}

/**
 * Persiste o objeto TIPO_OVERRIDES no localStorage.
 */
function salvarOverridesTipo() {
    try {
        localStorage.setItem(TIPO_STORAGE_KEY, JSON.stringify(TIPO_OVERRIDES));
    } catch (e) {
        console.warn('[Tipo Operação] Erro ao salvar overrides no localStorage:', e);
    }
}

/**
 * Adiciona ou remove um override pontual para uma Família.
 */
function setOverrideTipo(familia, tipo) {
    const f = String(familia || '').toUpperCase().trim();
    if (!f) return;
    
    if (tipo === 'AUTO') {
        delete TIPO_OVERRIDES[f];
    } else if (tipo === 'Serviço' || tipo === 'Produto') {
        TIPO_OVERRIDES[f] = tipo;
    }
    
    salvarOverridesTipo();
    
    // Dispara recálculo dos dados na memória
    if (globalData && globalData.length > 0) {
        // Recalcular campo TipoOperacao em todo o globalData
        globalData.forEach(d => {
            d.TipoOperacao = classificarTipoOperacao(d.Centro, d.Familia);
        });
        
        // Atualiza a tela se as funções de renderização existirem
        if (typeof updateDashboard === 'function') {
            updateDashboard();
        }
        if (typeof renderFidelitySection === 'function') {
            renderFidelitySection();
        }
    }
}

// Inicialização automática
carregarOverridesTipo();
