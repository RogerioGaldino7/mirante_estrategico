// =============================================================================
// state.js — Estado global compartilhado entre todos os módulos
// =============================================================================

let globalData  = [];   // Registros de faturamento real (formato tidy/long)
let globalMetas = [];   // Registros de metas/planejamento (formato tidy/long)
let globalOVs   = [];   // Registros de Ordens de Venda por Operação × Status × Mês
let charts      = {};   // Instâncias ApexCharts, chaveadas pelo nome do gráfico

const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Normaliza o nome do centro de custo para garantir consistência entre as
 * diferentes bases (Faturamento, Metas e OVs).
 */
function normalizeCentro(centro) {
    if (!centro) return "NÃO IDENTIFICADO";
    const c = centro.toUpperCase().trim();

    if (c.includes("IMUNOBIOL"))                       return "CENTRO DE IMUNOBIOLÓGICOS VETERINÁRIOS";
    if (c.includes("CERTIFICA"))                       return "CENTRO DE CERTIFICAÇÃO";
    if (c.includes("CMV") || c.includes("MEDI"))       return "CENTRO DE MEDIÇÕES E VALIDAÇÃO";
    if (c.includes("CREATIVE"))                        return "CREATIVE HUB";
    if (c.includes("CSA") || c.includes("SA\u00DADE") || c.includes("SAUDE") || c.includes("TECNOLOGIA EM SA")) 
        return "CENTRO DE TECNOLOGIA EM SAÚDE E MEIO AMBIENTE";
    if (c.includes("CTM") && !c.includes("CTI"))       return "CENTRO DE TECNOLOGIA DE MATERIAIS";
    if (c.includes("PROVAS BIOL"))                     return "LABORATÓRIO PROVAS BIOLÓGICAS";
    if (c.includes("QUALIDADE MICROBIOL"))             return "LABORATÓRIO DE QUALIDADE MICROBIOLÓGICO E FÍSICO-QUÍMICO";
    if (c.includes("CTI") || c.includes("INFORMA"))    return "CENTRO DE TECNOLOGIA DA INFORMAÇÃO - CTI";
    if (c.includes("DCQ") || c.includes("CONTROLE"))   return "DIVISÃO DE CONTROLE DA QUALIDADE";
    if (c.includes("COMERCIAL"))                       return "DIVISÃO COMERCIAL";

    return centro.trim().toUpperCase();
}

/** Mapeamento de nomes completos para siglas parametrizadas */
const CENTRO_SIGLAS = {
    "CENTRO DE CERTIFICAÇÃO": "CERT",
    "CENTRO DE IMUNOBIOLÓGICOS VETERINÁRIOS": "CIV",
    "CENTRO DE MEDIÇÕES E VALIDAÇÃO": "CMV",
    "CENTRO DE TECNOLOGIA DE MATERIAIS": "CTM",
    "CENTRO DE TECNOLOGIA EM SAÚDE E MEIO AMBIENTE": "CSA",
    "CREATIVE HUB": "HUB",
    "LABORATÓRIO DE QUALIDADE MICROBIOLÓGICO E FÍSICO-QUÍMICO": "LQMF",
    "LABORATÓRIO PROVAS BIOLÓGICAS": "LPB",
    "CENTRO DE TECNOLOGIA DA INFORMAÇÃO - CTI": "CTI",
    "DIVISÃO DE CONTROLE DA QUALIDADE": "DCQ",
    "DIVISÃO COMERCIAL": "COM"
};

/** Retorna a sigla de um centro ou o próprio nome se não houver sigla */
function getCentroSigla(nomeCompleto) {
    return CENTRO_SIGLAS[nomeCompleto] || nomeCompleto;
}

// =============================================================================
// Helpers de UI: overlay de carregamento e yields para evitar travas de thread
// =============================================================================

/**
 * Exibe o overlay de carregamento com texto principal e linha secundária de progresso.
 * Pode ser chamado várias vezes para atualizar mensagem.
 */
function showLoading(text, progress) {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    const txt = document.getElementById('loading-text');
    const prg = document.getElementById('loading-progress');
    if (txt) txt.innerText = text || 'Processando...';
    if (prg) prg.innerText = progress || '';
}

/**
 * Atualiza apenas o texto e progresso do overlay já visível.
 */
function updateLoading(text, progress) {
    const txt = document.getElementById('loading-text');
    const prg = document.getElementById('loading-progress');
    if (txt && text != null)     txt.innerText = text;
    if (prg && progress != null) prg.innerText = progress;
}

/**
 * Esconde o overlay de carregamento.
 */
function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';
}

/**
 * Cede controle ao navegador permitindo repaints e respostas de UI.
 * Usar dentro de loops longos ou entre fases pesadas para evitar o popup
 * "Página sem resposta" do Chrome/Edge.
 */
function yieldUI() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Mascara documentos para exibição respeitando privacidade (LGPD).
 * - CNPJ é dado público — exibido completo no formato XX.XXX.XXX/XXXX-XX
 * - CPF é dado pessoal — exibido apenas com últimos 2 dígitos visíveis
 * - Vazio ou desconhecido — retorna string vazia
 *
 * @param {string} docDigits - Dígitos do documento (sem pontuação)
 * @param {string} tipo - 'CNPJ' | 'CPF' | 'ND'
 */
function mascararDocumento(docDigits, tipo) {
    if (!docDigits) return '';
    if (tipo === 'CNPJ' && docDigits.length === 14) {
        return `${docDigits.substring(0,2)}.${docDigits.substring(2,5)}.${docDigits.substring(5,8)}/${docDigits.substring(8,12)}-${docDigits.substring(12,14)}`;
    }
    if (tipo === 'CPF' && docDigits.length === 11) {
        return `***.***.***-${docDigits.substring(9,11)}`;
    }
    return docDigits;
}

/**
 * Retorna a chave canônica de um cliente para fins de comparação entre anos.
 * Prioriza CNPJ raiz (grupo econômico), depois CNPJ completo, depois CPF, e por
 * fim cai para o nome normalizado quando o documento está ausente.
 *
 * Prefixos das chaves:
 *   G: → grupo econômico (raiz CNPJ)
 *   C: → CNPJ completo
 *   P: → CPF (pessoa física)
 *   E: → cliente do exterior (UF=EX), chave por nome normalizado
 *   N: → fallback por nome normalizado (cadastro incompleto / ND)
 */
function chaveCliente(record) {
    if (record.CNPJRaiz)                                 return 'G:' + record.CNPJRaiz;
    if (record.CNPJ && record.TipoDocumento === 'CNPJ')  return 'C:' + record.CNPJ;
    if (record.CNPJ && record.TipoDocumento === 'CPF')   return 'P:' + record.CNPJ;
    const nome = String(record.Cliente || '').toUpperCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    if (record.TipoDocumento === 'EXT')                  return 'E:' + nome;
    return 'N:' + nome;
}
