// =============================================================================
// setor.js — Classificação setorial dos clientes (Público / Privado / Exterior)
// =============================================================================
// Camadas de classificação, em ordem de prioridade:
//   1. Override do usuário (CSV carregado, persistido em localStorage)
//   2. CNPJ raiz conhecido (lista hardcoded de entes públicos)
//   3. Tipo do documento (EXTERIOR via TipoDocumento === 'EXT')
//   4. Heurística por padrões no nome do cliente
//   5. Default: PRIVADO
//
// Categorias possíveis:
//   PUBLICO_FEDERAL | PUBLICO_ESTADUAL | PUBLICO_MUNICIPAL | PUBLICO_OUTROS
//   PRIVADO | EXTERIOR
//
// Para análises mais simples, use setorPrincipal() — agrupa em PUBLICO / PRIVADO / EXTERIOR.
// =============================================================================

const SETOR_OVERRIDES = {};                                  // CNPJRaiz → categoria
const SETOR_STORAGE_KEY = 'tecpar_setor_overrides_v1';

/**
 * CNPJs raiz (8 primeiros dígitos) conhecidos como setor público.
 * Lista inicial baseada no Plano de Fidelização 2024 e bases observadas.
 * Pode ser expandida via CSV de override carregado pelo usuário.
 */
const CNPJ_RAIZ_PUBLICO = {
    '00394544': 'PUBLICO_FEDERAL',     // Ministério da Saúde / Sec. Executiva Logística em Saúde
    '00396895': 'PUBLICO_FEDERAL',     // Ministério da Agricultura e Pecuária (MAPA)
    '15563402': 'PUBLICO_ESTADUAL',    // Casa Civil PR / Administração Estadual PR
    '76105642': 'PUBLICO_MUNICIPAL',   // Município de Adrianópolis
    '76416940': 'PUBLICO_ESTADUAL',    // ADAPAR (Agência Defesa Agropecuária PR)
    '76416908': 'PUBLICO_ESTADUAL',    // FUNDEPAR (Instituto Paranaense Desenv. Educacional)
};

/** Padrões de nome que apontam para setor público FEDERAL */
const PADROES_PUBLICO_FEDERAL = [
    /\bMINIST[ÉE]RIO\b/i,
    /\bSECRETARIA EXECUTIVA\b/i,
    /\bAG[ÊE]NCIA NACIONAL\b/i,
    /\bUNIVERSIDADE FEDERAL\b/i,
    /\bINSTITUTO FEDERAL\b/i,
    /\bBANCO DO BRASIL\b/i,
    /\bCAIXA ECON[ÔO]MICA\b/i,
    /\bPETROBRAS\b/i,
    /\bTRANSPETRO\b/i,
    /\bEMPRESA BRASILEIRA\b/i,
    /\bFUNDA[ÇC][ÃA]O OSWALDO CRUZ\b/i,
    /\bFIOCRUZ\b/i,
    /\bSERVI[ÇC]O NACIONAL DE APRENDIZAGEM\b/i,    // SENAI / SENAC / SENAR / SENAT
    /\bSENAI\b/i,
    /\bPRESID[ÊE]NCIA DA REP[ÚU]BLICA\b/i,
    /\bSUPREMO TRIBUNAL\b/i,
    /\bSUPERIOR TRIBUNAL\b/i,
    /\bJUSTI[ÇC]A FEDERAL\b/i,
    /\bRECEITA FEDERAL\b/i,
    /\bPOL[ÍI]CIA FEDERAL\b/i,
    /\bMARINHA DO BRASIL\b/i,
    /\bEX[ÉE]RCITO BRASILEIRO\b/i,
];

/** Padrões de nome que apontam para setor público ESTADUAL (com viés Paraná) */
const PADROES_PUBLICO_ESTADUAL = [
    /\bGOVERNO DO ESTADO\b/i,
    /\bSECRETARIA DE ESTADO\b/i,
    /\bCASA CIVIL\b/i,
    /\bASSEMBLEIA LEGISLATIVA\b/i,
    /\bUNIVERSIDADE ESTADUAL\b/i,
    /\bDETRAN\b/i,
    /\bSEBRAE\b/i,
    /\bSANEPAR\b/i,
    /\bCOPEL\b/i,
    /\bFUNDEPAR\b/i,
    /\bADAPAR\b/i,
    /\bCEASA\b/i,
    /\bCENTRAIS DE ABASTECIMENTO\b/i,
    /\bDEPARTAMENTO DE ESTRADAS\b/i,
    /\bDER\b\s*-\s*DEPARTAMENTO/i,
    /\bTRIBUNAL DE JUSTI[ÇC]A\b/i,
    /\bMINIST[ÉE]RIO P[ÚU]BLICO\b/i,
    /\bDEFENSORIA P[ÚU]BLICA\b/i,
    /\bPROCURADORIA\b/i,
    /\bPOL[ÍI]CIA MILITAR\b/i,
    /\bPOL[ÍI]CIA CIVIL\b/i,
    /\bCORPO DE BOMBEIROS\b/i,
    /\bSANEAMENTO DO PARAN[ÁA]\b/i,
];

/** Padrões de nome que apontam para setor público MUNICIPAL */
const PADROES_PUBLICO_MUNICIPAL = [
    /\bMUNIC[ÍI]PIO\b/i,
    /\bPREFEITURA\b/i,
    /\bC[ÂA]MARA MUNICIPAL\b/i,
    /\bFUNDO MUNICIPAL\b/i,
    /\bFUNDO DE URBANIZA[ÇC][ÃA]O\b/i,
];

/** Padrões de nome para outras categorias públicas (autarquias, mistas, binacionais, fundações) */
const PADROES_PUBLICO_OUTROS = [
    /\bAUTARQUIA\b/i,
    /\bEMPRESA P[ÚU]BLICA\b/i,
    /\bSOCIEDADE DE ECONOMIA MISTA\b/i,
    /\bITAIPU\b/i,
    /\bFUNDA[ÇC][ÃA]O DE APOIO\b/i,
    /\bFUNDA[ÇC][ÃA]O DE PESQUISAS\b/i,
];

/**
 * Classifica um registro em uma categoria setorial detalhada.
 * Aplica os overrides do usuário primeiro, depois fallbacks.
 */
function classificarSetor(record) {
    if (!record) return 'PRIVADO';

    // 1. Override por CNPJ raiz (do CSV carregado pelo usuário)
    if (record.CNPJRaiz && SETOR_OVERRIDES[record.CNPJRaiz]) {
        return SETOR_OVERRIDES[record.CNPJRaiz];
    }

    // 2. Lista hardcoded de raízes conhecidas
    if (record.CNPJRaiz && CNPJ_RAIZ_PUBLICO[record.CNPJRaiz]) {
        return CNPJ_RAIZ_PUBLICO[record.CNPJRaiz];
    }

    // 3. Cliente do exterior
    if (record.TipoDocumento === 'EXT') return 'EXTERIOR';

    // 4. Heurística por nome
    const nome = String(record.Cliente || '').toUpperCase();
    if (PADROES_PUBLICO_FEDERAL.some(re => re.test(nome)))   return 'PUBLICO_FEDERAL';
    if (PADROES_PUBLICO_ESTADUAL.some(re => re.test(nome)))  return 'PUBLICO_ESTADUAL';
    if (PADROES_PUBLICO_MUNICIPAL.some(re => re.test(nome))) return 'PUBLICO_MUNICIPAL';
    if (PADROES_PUBLICO_OUTROS.some(re => re.test(nome)))    return 'PUBLICO_OUTROS';

    // 5. Default
    return 'PRIVADO';
}

/**
 * Versão simplificada do setor: PUBLICO / PRIVADO / EXTERIOR.
 * Útil para filtros de alto nível e classificação institucional 1A-2C.
 */
function setorPrincipal(record) {
    const cat = classificarSetor(record);
    if (cat === 'EXTERIOR') return 'EXTERIOR';
    if (cat === 'PRIVADO')  return 'PRIVADO';
    return 'PUBLICO';
}

/**
 * Carrega overrides setoriais salvos no localStorage para a sessão atual.
 */
function carregarOverridesSetoriais() {
    try {
        const stored = localStorage.getItem(SETOR_STORAGE_KEY);
        if (!stored) return;
        const data = JSON.parse(stored);
        Object.keys(data).forEach(k => SETOR_OVERRIDES[k] = data[k]);
        const n = Object.keys(SETOR_OVERRIDES).length;
        if (n > 0) console.log(`[Setor] ${n} override(s) setorial(is) carregado(s) do localStorage.`);
    } catch (e) {
        console.warn('[Setor] Erro ao carregar overrides do localStorage:', e);
    }
}

/**
 * Persiste o objeto SETOR_OVERRIDES no localStorage.
 */
function salvarOverridesSetoriais() {
    try {
        localStorage.setItem(SETOR_STORAGE_KEY, JSON.stringify(SETOR_OVERRIDES));
    } catch (e) {
        console.warn('[Setor] Erro ao salvar overrides no localStorage:', e);
    }
}

/**
 * Limpa todos os overrides setoriais (do objeto e do localStorage).
 */
function limparOverridesSetoriais() {
    Object.keys(SETOR_OVERRIDES).forEach(k => delete SETOR_OVERRIDES[k]);
    try { localStorage.removeItem(SETOR_STORAGE_KEY); } catch (e) {}
    console.log('[Setor] Overrides setoriais limpos.');
}

/**
 * Adiciona ou atualiza um override pontual para um CNPJ Raiz.
 */
function setOverrideSetorial(cnpjRaiz, setor) {
    if (!cnpjRaiz || cnpjRaiz.length !== 8) return;
    
    if (setor === 'AUTO') {
        // Remove o override se voltar pro "automático"
        delete SETOR_OVERRIDES[cnpjRaiz];
    } else {
        SETOR_OVERRIDES[cnpjRaiz] = setor;
    }
    salvarOverridesSetoriais();
    
    // Dispara recálculo se houver dados
    if (typeof updateDashboard === 'function' && globalData && globalData.length > 0) {
        updateDashboard();
    }
}

/**
 * Exporta todos os clientes identificados e suas categorias atuais em formato CSV.
 */
function baixarClassificacaoCsv() {
    if (!globalData || globalData.length === 0) {
        alert("Carregue uma base de dados primeiro.");
        return;
    }
    
    // Obter clientes únicos
    const clientesMap = new Map();
    globalData.forEach(d => {
        if (!d.CNPJRaiz || d.CNPJRaiz.length !== 8) return; // Só entidades com CNPJ válido
        if (!clientesMap.has(d.CNPJRaiz)) {
            clientesMap.set(d.CNPJRaiz, {
                CNPJRaiz: d.CNPJRaiz,
                Cliente: d.Cliente,
                SetorDetalhado: classificarSetor(d),
                SetorPrincipal: setorPrincipal(d),
                HasOverride: !!SETOR_OVERRIDES[d.CNPJRaiz]
            });
        }
    });
    
    let csvContent = "CNPJRaiz;Cliente;Setor;Manual;SetorPrincipal\n";
    clientesMap.forEach(c => {
        csvContent += `${c.CNPJRaiz};"${c.Cliente}";${c.SetorDetalhado};${c.HasOverride ? 'SIM' : 'NAO'};${c.SetorPrincipal}\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `classificacao_setorial_tecpar_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Processa um CSV de overrides setoriais carregado pelo usuário.
 * Formato esperado (colunas em qualquer ordem, cabeçalho obrigatório):
 *   CNPJRaiz ; Setor ; Observacao(opcional)
 * Categorias válidas em "Setor":
 *   PUBLICO_FEDERAL | PUBLICO_ESTADUAL | PUBLICO_MUNICIPAL | PUBLICO_OUTROS
 *   PRIVADO | EXTERIOR
 */
function processarSetorCsv(rows) {
    if (!rows || rows.length < 2) {
        alert('Arquivo de classificação setorial vazio ou inválido.');
        return;
    }

    const header = (rows[0] || []).map(c => String(c || '').toUpperCase().trim());
    const idxRaiz  = header.findIndex(h => h.includes('CNPJ') || h.includes('RAIZ'));
    const idxSetor = header.findIndex(h => h.includes('SETOR') || h.includes('CATEG') || h.includes('CLASSIF'));

    if (idxRaiz < 0 || idxSetor < 0) {
        alert(
            'Formato de classificação setorial inválido.\n\n' +
            'Cabeçalho esperado: "CNPJRaiz" e "Setor" (ou variações).\n' +
            'Categorias válidas:\n' +
            '  PUBLICO_FEDERAL, PUBLICO_ESTADUAL, PUBLICO_MUNICIPAL, PUBLICO_OUTROS\n' +
            '  PRIVADO, EXTERIOR'
        );
        return;
    }

    const setoresValidos = new Set([
        'PUBLICO_FEDERAL', 'PUBLICO_ESTADUAL', 'PUBLICO_MUNICIPAL', 'PUBLICO_OUTROS',
        'PRIVADO', 'EXTERIOR'
    ]);

    let aplicados = 0;
    let invalidos = 0;
    let erradoFmt = 0;

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const raizRaw = String(row[idxRaiz] || '').replace(/\D/g, '');
        const setor   = String(row[idxSetor] || '').toUpperCase().trim();

        if (raizRaw.length !== 8)   { erradoFmt++; continue; }
        if (!setoresValidos.has(setor)) { invalidos++; continue; }

        SETOR_OVERRIDES[raizRaw] = setor;
        aplicados++;
    }

    salvarOverridesSetoriais();

    const total = Object.keys(SETOR_OVERRIDES).length;
    console.log(
        `[Setor] CSV processado: ${aplicados} override(s) aplicado(s), ` +
        `${erradoFmt} com CNPJ raiz inválido, ${invalidos} com setor inválido. ` +
        `Total acumulado: ${total} override(s).`
    );

    const statusEl = document.getElementById('setor-status');
    if (statusEl) statusEl.innerText = `Setor: ${total} override(s)`;

    // Re-renderiza painéis se já houver dados carregados
    if (typeof updateDashboard === 'function' && globalData && globalData.length > 0) {
        updateDashboard();
    }
    if (typeof renderFidelitySection === 'function') {
        renderFidelitySection();
    }
}

/**
 * Gera uma estatística rápida da distribuição setorial dos dados atuais.
 * Útil para diagnóstico no console.
 */
function estatSetor() {
    if (!globalData || globalData.length === 0) {
        console.log('[Setor] Sem dados carregados ainda.');
        return;
    }
    // Agrupa por chave de cliente (entidade única) e classifica uma vez por entidade
    const porChave = new Map();
    globalData.forEach(d => {
        const k = chaveCliente(d);
        if (!porChave.has(k)) porChave.set(k, d);
    });
    const dist = {};
    porChave.forEach(rec => {
        const cat = classificarSetor(rec);
        dist[cat] = (dist[cat] || 0) + 1;
    });
    console.table(dist);
    return dist;
}

// Inicialização: carrega overrides do localStorage assim que o script é executado
carregarOverridesSetoriais();
