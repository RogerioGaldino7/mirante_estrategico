// =============================================================================
// report-pn.js — Relatório PN (modelo diretoria): reproduz o relatório de
// acompanhamento do PN em PDF A4 paisagem, a partir dos filtros da sidebar
// (Ano / Centro / Meses / UF / Tipo de Operação).
//
// Onda R2 (páginas consolidadas):
//   Pág. 1 — tabelas SERVIÇOS / PRODUTOS / GERAL (meses × Faturado/Meta/Ano
//            anterior/Qtd Exec-Plan) + velocímetros de meta.
//   Pág. 2 — gráficos por centro (Faturado × Meta × Ano ant.; % da meta).
//   Pág. 3 — Top 15 clientes e Top 15 serviços, com "E mais N…".
//
// Depende de: state.js (globalData/globalMetas/getCentroSigla), filters.js
// (getFilteredDataByYear/getCheckedCentros), report-pn.css, ApexCharts,
// html2canvas e jsPDF (CDN em index.html).
// =============================================================================

const PN_MESES_ORDEM = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const PN_AZUL    = '#0033A0';
const PN_LARANJA = '#F58220';
const PN_CINZA   = '#b0b7c3';

function _pnFmt(v) {
    return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _pnFmtInt(v) {
    return Math.round(v || 0).toLocaleString('pt-BR');
}

function _pnAnoBase() {
    const v = (document.getElementById('filter-ano') || {}).value || 'ALL';
    if (v !== 'ALL') return v;
    const anos = [...new Set(globalData.map(d => d.Ano))].sort();
    return anos[anos.length - 1];
}

function _pnMesesSelecionados() {
    const marcados = new Set(Array.from(document.querySelectorAll('.mes-checkbox:checked')).map(cb => cb.value));
    return PN_MESES_ORDEM.filter(m => marcados.has(m));
}

// -----------------------------------------------------------------------------
// R4 — Capa: campos editáveis persistidos em localStorage (reuso mensal)
// -----------------------------------------------------------------------------
const PN_CAPA_LS_KEY = 'tecpar_pn_capa_v1';
const PN_CAPA_CAMPOS = ['pn-capa-t1', 'pn-capa-x1', 'pn-capa-t2', 'pn-capa-x2',
                        'pn-capa-t3', 'pn-capa-x3', 'pn-contrato-num',
                        'pn-contrato-valor', 'pn-contrato-faturado'];

function _pnCapaConfig() {
    const v = (id) => ((document.getElementById(id) || {}).value || '').trim();
    return {
        secoes: [
            { titulo: v('pn-capa-t1'), texto: v('pn-capa-x1') },
            { titulo: v('pn-capa-t2'), texto: v('pn-capa-x2') },
            { titulo: v('pn-capa-t3'), texto: v('pn-capa-x3') }
        ],
        contrato: { num: v('pn-contrato-num'), valor: v('pn-contrato-valor'), faturado: v('pn-contrato-faturado') }
    };
}

// Aceita "39.760.000,00", "39760000" ou "39760000.5"
function _pnParseNum(str) {
    if (!str) return 0;
    let s = String(str).replace(/[^\d.,-]/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    return parseFloat(s) || 0;
}

(function _pnCapaInit() {
    let salvo = {};
    try { salvo = JSON.parse(localStorage.getItem(PN_CAPA_LS_KEY) || '{}'); } catch (e) {}
    PN_CAPA_CAMPOS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (typeof salvo[id] === 'string') el.value = salvo[id];
        el.addEventListener('change', () => {
            const dump = {};
            PN_CAPA_CAMPOS.forEach(i => {
                const e2 = document.getElementById(i);
                if (e2) dump[i] = e2.value;
            });
            try { localStorage.setItem(PN_CAPA_LS_KEY, JSON.stringify(dump)); } catch (e) {}
        });
    });
})();

// Caixas "Serviços"/"Produtos" do bloco Relatório PN: controlam quais seções
// entram no PDF (centros só de serviços dispensam as tabelas de produtos).
function _pnTiposSelecionados() {
    const serv = document.getElementById('pn-tipo-servicos');
    const prod = document.getElementById('pn-tipo-produtos');
    const tipos = [];
    if (!serv || serv.checked) tipos.push('Serviço');
    if (!prod || prod.checked) tipos.push('Produto');
    return tipos;
}

// -----------------------------------------------------------------------------
// Agregação de dados
// -----------------------------------------------------------------------------

// Classifica cada família de meta como Serviço/Produto: usa o tipo dominante da
// família no faturamento do ano-base; sem correspondência, heurística "VACINA".
function _pnMapaTipoFamilia(anoBase) {
    // Agora delega diretamente para a função global classificarTipoOperacao(centro, familia)
    return function (familiaMeta, centroMeta) {
        return classificarTipoOperacao(centroMeta, familiaMeta);
    };
}

function _pnMetasFiltradas(anoBase, meses) {
    const fCentro = window.getCheckedCentros();
    return globalMetas.filter(m => {
        if (m.Ano !== anoBase) return false;
        if (fCentro !== 'ALL' && Array.isArray(fCentro) && !fCentro.includes(m.Centro)) return false;
        if (meses && !meses.includes(m.Mes)) return false;
        return true;
    });
}

function _pnDados() {
    const anoBase = _pnAnoBase();
    const anoAnt  = String(Number(anoBase) - 1);
    const meses   = _pnMesesSelecionados();
    const tipos   = _pnTiposSelecionados();
    // Foco das págs. de centros/Top 15: Serviços (fiel ao modelo), exceto
    // quando o relatório é só de Produtos.
    const tipoFoco = tipos.includes('Serviço') ? 'Serviço' : 'Produto';

    const dBase = getFilteredDataByYear(anoBase);
    const dAnt  = getFilteredDataByYear(anoAnt);
    const tipoDaMeta = _pnMapaTipoFamilia(anoBase);
    const metasSel = _pnMetasFiltradas(anoBase, meses);   // meses selecionados
    const metasAno = _pnMetasFiltradas(anoBase, null);    // ano cheio (gauge anual)

    // Acumuladores por [tipo][mes]
    const zero = () => ({ fat: 0, fatAnt: 0, qtd: 0, meta: 0, metaQtd: 0 });
    const porTipo = { 'Serviço': {}, 'Produto': {}, 'GERAL': {} };
    const cel = (tipo, mes) => (porTipo[tipo][mes] = porTipo[tipo][mes] || zero());

    dBase.forEach(d => {
        if (d.TipoOperacao === 'Serviço' || d.TipoOperacao === 'Produto') {
            const c = cel(d.TipoOperacao, d.Mes); c.fat += d.Valor; c.qtd += d.Quantidade;
        }
        const g = cel('GERAL', d.Mes); g.fat += d.Valor; g.qtd += d.Quantidade;
    });
    dAnt.forEach(d => {
        if (d.TipoOperacao === 'Serviço' || d.TipoOperacao === 'Produto') cel(d.TipoOperacao, d.Mes).fatAnt += d.Valor;
        cel('GERAL', d.Mes).fatAnt += d.Valor;
    });
    metasSel.forEach(m => {
        const t = tipoDaMeta(m.Familia, m.Centro);
        const c = cel(t, m.Mes); c.meta += m.MetaValor; c.metaQtd += m.MetaQtd;
        const g = cel('GERAL', m.Mes); g.meta += m.MetaValor; g.metaQtd += m.MetaQtd;
    });

    const naoClassificado = dBase.filter(d => d.TipoOperacao === 'Não Classificado')
                                 .reduce((s, d) => s + d.Valor, 0);

    // Totais para os velocímetros
    const somaTipo = (tipo, campo) => meses.reduce((s, m) => s + ((porTipo[tipo][m] || {})[campo] || 0), 0);
    const metaServAnual = metasAno.filter(m => tipoDaMeta(m.Familia, m.Centro) === 'Serviço')
                                  .reduce((s, m) => s + m.MetaValor, 0);
    const metaProdAnual = metasAno.filter(m => tipoDaMeta(m.Familia, m.Centro) === 'Produto')
                                  .reduce((s, m) => s + m.MetaValor, 0);
    const metaGeralAnual = metasAno.reduce((s, m) => s + m.MetaValor, 0);

    // Por centro (siglas) — só o tipo em foco, como no modelo original: o
    // contrato de vacinas (produto) distorceria a escala e é acompanhado à
    // parte na pág. 1.
    const centros = {};
    const celC = (c) => (centros[c] = centros[c] || { fat: 0, meta: 0, fatAnt: 0 });
    dBase.forEach(d => { if (d.TipoOperacao === tipoFoco) celC(d.Centro).fat += d.Valor; });
    dAnt.forEach(d => { if (d.TipoOperacao === tipoFoco) celC(d.Centro).fatAnt += d.Valor; });
    metasSel.forEach(m => { if (tipoDaMeta(m.Familia, m.Centro) === tipoFoco) celC(m.Centro).meta += m.MetaValor; });
    const listaCentros = Object.keys(centros)
        .map(c => ({ sigla: getCentroSigla(c), nome: c, ...centros[c] }))
        .sort((a, b) => b.fat - a.fat);

    // Top 15 — apenas o tipo em foco, como no modelo original
    const topPor = (campo) => {
        const acc = {};
        dBase.forEach(d => { if (d.TipoOperacao === tipoFoco) acc[d[campo]] = (acc[d[campo]] || 0) + d.Valor; });
        const lista = Object.entries(acc).sort((a, b) => b[1] - a[1]);
        const top = lista.slice(0, 15);
        const resto = lista.slice(15);
        return {
            top: top.map(([nome, valor]) => ({ nome, valor })),
            totalTop: top.reduce((s, [, v]) => s + v, 0),
            restoN: resto.length,
            restoValor: resto.reduce((s, [, v]) => s + v, 0)
        };
    };

    return {
        anoBase, anoAnt, meses, tipos, tipoFoco, porTipo, naoClassificado,
        dBase, dAnt, metasSel, metasAno, tipoDaMeta,
        fatServ: somaTipo('Serviço', 'fat'),
        metaServPeriodo: somaTipo('Serviço', 'meta'),
        fatProd: somaTipo('Produto', 'fat'),
        metaProdPeriodo: somaTipo('Produto', 'meta'),
        fatGeral: somaTipo('GERAL', 'fat'),
        metaGeralPeriodo: somaTipo('GERAL', 'meta'),
        metaServAnual, metaProdAnual, metaGeralAnual,
        temMetas: globalMetas.length > 0,
        listaCentros,
        topClientes: topPor('Cliente'),
        topServicos: topPor('Produto')
    };
}

// Velocímetros a exibir conforme os tipos selecionados (config única usada
// tanto na montagem do HTML quanto na renderização dos gráficos).
function _pnListaGauges(dados) {
    const g = [];
    if (dados.tipos.includes('Serviço')) {
        g.push({ key: 'servAnual',   titulo: 'Serviços · Meta Anual',      fat: dados.fatServ, meta: dados.metaServAnual,    rotuloMeta: 'Meta anual',      cor: PN_LARANJA });
        g.push({ key: 'servPeriodo', titulo: 'Serviços · Meta do Período', fat: dados.fatServ, meta: dados.metaServPeriodo,  rotuloMeta: 'Meta do período', cor: PN_AZUL });
    }
    if (dados.tipos.includes('Produto') && !dados.tipos.includes('Serviço')) {
        g.push({ key: 'prodAnual',   titulo: 'Produtos · Meta Anual',      fat: dados.fatProd, meta: dados.metaProdAnual,    rotuloMeta: 'Meta anual',      cor: PN_LARANJA });
        g.push({ key: 'prodPeriodo', titulo: 'Produtos · Meta do Período', fat: dados.fatProd, meta: dados.metaProdPeriodo,  rotuloMeta: 'Meta do período', cor: PN_AZUL });
    }
    if (dados.tipos.length === 2) {
        g.push({ key: 'geralPeriodo', titulo: 'Geral · Meta do Período',   fat: dados.fatGeral, meta: dados.metaGeralPeriodo, rotuloMeta: 'Meta do período', cor: '#2E7D32' });
    }
    return g;
}

// -----------------------------------------------------------------------------
// Construção das páginas (DOM)
// -----------------------------------------------------------------------------
function _pnEscopoCentros() {
    const c = window.getCheckedCentros();
    if (c === 'ALL' || !Array.isArray(c)) return 'TECPAR';
    return c.map(getCentroSigla).join(' · ');
}

function _pnNovaPagina(subtitulo, dados) {
    const pg = document.createElement('div');
    pg.className = 'pn-page';
    pg.innerHTML = `
        <div class="pn-head">
            <div>
                <div class="pn-head-dir">Diretoria de Novos Negócios e Relações Institucionais</div>
                <div class="pn-head-title">Acompanhamento PN ${dados.anoBase} │ ${subtitulo}</div>
            </div>
            <div class="pn-head-dir">${_pnEscopoCentros()} · ${dados.meses[0]}–${dados.meses[dados.meses.length - 1]}/${String(dados.anoBase).slice(-2)}</div>
        </div>
        <div class="pn-body"></div>
        <div class="pn-foot">
            <span>TECPAR · Mirante Estratégico</span>
            <span>Emitido em ${new Date().toLocaleDateString('pt-BR')}</span>
            <span class="pn-pageno"></span>
        </div>`;
    return pg;
}

function _pnTabelaMensal(titulo, tipo, dados, classeQtdLabel) {
    const meses = dados.meses;
    const linha = (classe, rotulo, calc) => {
        let tds = `<td>${rotulo}</td>`;
        let total = 0, totalB = 0, temPar = false;
        meses.forEach(m => {
            const c = dados.porTipo[tipo][m] || {};
            const v = calc(c);
            if (Array.isArray(v)) { // par "exec - plan"
                temPar = true; total += v[0]; totalB += v[1];
                tds += `<td>${_pnFmtInt(v[0])} – ${_pnFmtInt(v[1])}</td>`;
            } else {
                total += v;
                tds += `<td>${_pnFmt(v)}</td>`;
            }
        });
        tds += temPar
            ? `<td class="pn-col-total">${_pnFmtInt(total)} – ${_pnFmtInt(totalB)}</td>`
            : `<td class="pn-col-total">${_pnFmt(total)}</td>`;
        return `<tr class="${classe}">${tds}</tr>`;
    };

    return `<table class="pn-tbl">
        <thead><tr><th>${titulo}</th>${meses.map(m => `<th>${m}</th>`).join('')}<th>Total</th></tr></thead>
        <tbody>
            ${linha('pn-row-fat',  'Faturado ' + dados.anoBase, c => c.fat || 0)}
            ${linha('pn-row-meta', 'Meta ' + dados.anoBase,     c => c.meta || 0)}
            ${linha('pn-row-ant',  'Faturado ' + dados.anoAnt,  c => c.fatAnt || 0)}
            ${linha('pn-row-qtd',  classeQtdLabel,              c => [c.qtd || 0, c.metaQtd || 0])}
        </tbody>
    </table>`;
}

// Capa (R4) — destaques narrativos + gráfico do período + gauge do contrato
function _pnPaginaCapa(dados) {
    const capa = _pnCapaConfig();
    const focoLabel = dados.tipoFoco === 'Serviço' ? 'Serviços' : 'Produtos';
    const pg = _pnNovaPagina('Capa', dados);

    const secoes = capa.secoes.filter(s => s.texto);
    let narrativa = secoes.map(s => `
        <div class="pn-capa-secao">
            <div class="pn-capa-secao-titulo">${s.titulo || 'Destaques'}</div>
            <ul>${s.texto.split('\n').filter(l => l.trim()).map(l => `<li>${l.trim()}</li>`).join('')}</ul>
        </div>`).join('');
    if (!narrativa) {
        narrativa = '<div class="pn-capa-vazia">Sem destaques registrados — preencha em "📝 Capa: destaques e contrato" na aba Relatório.</div>';
    }

    const valorContrato = _pnParseNum(capa.contrato.valor);
    const fatContrato   = _pnParseNum(capa.contrato.faturado);
    const gaugeContrato = valorContrato > 0 ? `
        <div class="pn-gauge" data-gauge="contrato" style="margin-top:14px;">
            <div class="pn-gauge-title">Contrato de Vacinas${capa.contrato.num ? ' — Nº ' + capa.contrato.num : ''}</div>
            <div class="pn-gauge-chart"></div>
            <table class="pn-gauge-legenda">
                <tr><td>Faturado</td><td>R$ ${_pnFmt(fatContrato)}</td></tr>
                <tr><td>Valor do contrato</td><td>R$ ${_pnFmt(valorContrato)}</td></tr>
            </table>
        </div>` : '';

    pg.querySelector('.pn-body').innerHTML = `
        <div class="pn-capa-cabecalho">
            <div class="t1">Relatório de Acompanhamento PN ${dados.anoBase}</div>
            <div class="t2">${_pnEscopoCentros()} · ${dados.meses[0]}–${dados.meses[dados.meses.length - 1]}/${dados.anoBase} · Emitido em ${new Date().toLocaleDateString('pt-BR')}</div>
        </div>
        <div class="pn-2col" style="align-items:flex-start;">
            <div style="border:none; padding:0 10px 0 0;">${narrativa}</div>
            <div style="flex:0 0 420px;">
                <div class="pn-chart-title">${focoLabel} — Meta × Faturado no período</div>
                <div data-chart="capaMensal"></div>
                ${gaugeContrato}
            </div>
        </div>`;
    return pg;
}

// Pág. 1 — tabelas + velocímetros (seções conforme os tipos selecionados)
function _pnPaginaTabelas(dados) {
    const soServ = dados.tipos.length === 1 && dados.tipos[0] === 'Serviço';
    const soProd = dados.tipos.length === 1 && dados.tipos[0] === 'Produto';
    const subtitulo = soServ ? 'Faturamento de Serviços'
                    : soProd ? 'Faturamento de Produtos'
                    : 'Faturamento de Serviços e Produtos e Consolidado';
    const pg = _pnNovaPagina(subtitulo, dados);
    const body = pg.querySelector('.pn-body');

    let html = '';
    if (dados.tipos.includes('Serviço')) html += _pnTabelaMensal('SERVIÇOS', 'Serviço', dados, 'Qtd (Exec – Plan)');
    if (dados.tipos.includes('Produto')) html += _pnTabelaMensal('PRODUTOS', 'Produto', dados, 'Qtd (Exec – Plan)');
    if (dados.tipos.length === 2) {
        html += _pnTabelaMensal('GERAL', 'GERAL', dados, 'Qtd (Exec – Plan)');
        if (dados.naoClassificado > 0) {
            html += `<div class="pn-nota">GERAL inclui R$ ${_pnFmt(dados.naoClassificado)} de operações não classificadas (base sem coluna de operação).</div>`;
        }
    }

    html += `<div class="pn-gauges">` + _pnListaGauges(dados).map(g => `
        <div class="pn-gauge" data-gauge="${g.key}">
            <div class="pn-gauge-title">${g.titulo}</div><div class="pn-gauge-chart"></div>
            <table class="pn-gauge-legenda">
                <tr><td>Faturamento</td><td>R$ ${_pnFmt(g.fat)}</td></tr>
                <tr><td>${g.rotuloMeta}</td><td>R$ ${_pnFmt(g.meta)}</td></tr>
            </table>
        </div>`).join('') + `</div>`;
    body.innerHTML = html;
    return pg;
}

// Pág. 2 — gráficos por centro
function _pnPaginaCentros(dados) {
    const foco = dados.tipoFoco === 'Serviço' ? 'Serviços' : 'Produtos';
    const pg = _pnNovaPagina(`Desempenho por Centro — ${foco}`, dados);
    pg.querySelector('.pn-body').innerHTML = `
        <div class="pn-2col">
            <div>
                <div class="pn-chart-title">Faturado ${dados.anoBase} × Meta × Faturado ${dados.anoAnt}</div>
                <div class="pn-chart-slot" data-chart="barras"></div>
            </div>
            <div>
                <div class="pn-chart-title">% da Meta atingida no período</div>
                <div class="pn-chart-slot" data-chart="pctMeta"></div>
            </div>
        </div>`;
    return pg;
}

// Pág. 3 — Top 15
function _pnTabelaTop15(titulo, colValor, t) {
    let linhas = t.top.map((r, i) =>
        `<tr><td>${i + 1}. ${r.nome}</td><td>${_pnFmt(r.valor)}</td></tr>`).join('');
    linhas += `<tr class="pn-top15-total"><td>Total Top 15</td><td>${_pnFmt(t.totalTop)}</td></tr>`;
    let resto = '';
    if (t.restoN > 0) {
        resto = `<div class="pn-top15-resto">E mais ${t.restoN.toLocaleString('pt-BR')} ${colValor} que somaram R$ ${_pnFmt(t.restoValor)}.</div>`;
    }
    return `<div>
        <table class="pn-top15">
            <thead><tr><th>${titulo}</th><th>Faturamento (R$)</th></tr></thead>
            <tbody>${linhas}</tbody>
        </table>${resto}
    </div>`;
}

function _pnPaginaTop15(dados) {
    const foco = dados.tipoFoco === 'Serviço' ? 'Serviços' : 'Produtos';
    const pg = _pnNovaPagina(`Top 15 Clientes e ${foco}`, dados);
    pg.querySelector('.pn-body').innerHTML = `
        <div class="pn-2col" style="align-items:flex-start;">
            ${_pnTabelaTop15('Cliente', 'clientes', dados.topClientes)}
            ${_pnTabelaTop15(dados.tipoFoco === 'Serviço' ? 'Serviço' : 'Produto', foco.toLowerCase(), dados.topServicos)}
        </div>`;
    return pg;
}

// -----------------------------------------------------------------------------
// R3 — Páginas de detalhe por centro (2 páginas por centro marcado)
// -----------------------------------------------------------------------------

// Centros que ganham páginas de detalhe: os com movimento no ano-base ou meta,
// respeitando o filtro Centro da sidebar. Ordenados por faturamento desc.
function _pnCentrosDetalhe(dados) {
    const fat = {};
    dados.dBase.forEach(d => fat[d.Centro] = (fat[d.Centro] || 0) + d.Valor);
    dados.metasSel.forEach(m => { if (!(m.Centro in fat)) fat[m.Centro] = 0; });
    return Object.keys(fat).sort((a, b) => (fat[b] || 0) - (fat[a] || 0));
}

function _pnDadosCentro(nome, dados) {
    const dC   = dados.dBase.filter(d => d.Centro === nome);
    const dCAnt = dados.dAnt.filter(d => d.Centro === nome);
    const mC   = dados.metasSel.filter(m => m.Centro === nome);
    const mCAno = globalMetas.filter(m => m.Ano === dados.anoBase && m.Centro === nome);
    const mesRef = dados.meses[dados.meses.length - 1];

    // Tabela mensal (todas as operações do centro, como a linha GERAL)
    const porMes = {};
    const cel = (mes) => (porMes[mes] = porMes[mes] || { fat: 0, fatAnt: 0, qtd: 0, meta: 0, metaQtd: 0 });
    dC.forEach(d => { const c = cel(d.Mes); c.fat += d.Valor; c.qtd += d.Quantidade; });
    dCAnt.forEach(d => cel(d.Mes).fatAnt += d.Valor);
    mC.forEach(m => { const c = cel(m.Mes); c.meta += m.MetaValor; c.metaQtd += m.MetaQtd; });

    const soma = (campo) => dados.meses.reduce((s, m) => s + ((porMes[m] || {})[campo] || 0), 0);
    const fatPeriodo   = soma('fat');
    const fatAntPer    = soma('fatAnt');
    const metaPeriodo  = soma('meta');
    const metaAnual    = mCAno.reduce((s, m) => s + m.MetaValor, 0);

    // Famílias: faturado/quantidade (mês ref + acumulado) × previsto (metas)
    const fams = {};
    const celF = (f) => (fams[f] = fams[f] || { fatRef: 0, fatAcum: 0, qtdRef: 0, qtdAcum: 0, prevRef: 0, prevAcum: 0, prevAnual: 0 });
    dC.forEach(d => {
        const f = celF(d.Familia);
        f.fatAcum += d.Valor; f.qtdAcum += d.Quantidade;
        if (d.Mes === mesRef) { f.fatRef += d.Valor; f.qtdRef += d.Quantidade; }
    });
    mC.forEach(m => {
        const f = celF(m.Familia);
        f.prevAcum += m.MetaQtd;
        if (m.Mes === mesRef) f.prevRef += m.MetaQtd;
    });
    mCAno.forEach(m => celF(m.Familia).prevAnual += m.MetaQtd);
    const familias = Object.entries(fams)
        .map(([nomeF, v]) => ({ nome: nomeF, ...v }))
        // descarta famílias sem movimento nem previsto no período (só poluem)
        .filter(f => f.fatAcum !== 0 || f.qtdAcum !== 0 || f.prevAcum !== 0)
        .sort((a, b) => b.fatAcum - a.fatAcum);

    // Top 15 do centro
    const topPorC = (campo) => {
        const acc = {};
        dC.forEach(d => acc[d[campo]] = (acc[d[campo]] || 0) + d.Valor);
        const lista = Object.entries(acc).sort((a, b) => b[1] - a[1]);
        const top = lista.slice(0, 15), resto = lista.slice(15);
        return {
            top: top.map(([n, v]) => ({ nome: n, valor: v })),
            totalTop: top.reduce((s, [, v]) => s + v, 0),
            restoN: resto.length,
            restoValor: resto.reduce((s, [, v]) => s + v, 0)
        };
    };

    // OVs do centro (a base de OVs não tem ano — vale a base carregada)
    const ovs = (typeof globalOVs !== 'undefined' ? globalOVs : [])
        .filter(o => o.Centro === nome && dados.meses.includes(o.Mes));

    return {
        nome, sigla: getCentroSigla(nome), mesRef, porMes,
        fatPeriodo, fatAntPer, metaPeriodo, metaAnual,
        familias, topClientes: topPorC('Cliente'), topServicos: topPorC('Produto'), ovs
    };
}

function _pnTabelaMensalCentro(dc, dados) {
    const linha = (classe, rotulo, calc, par) => {
        let tds = `<td>${rotulo}</td>`, total = 0, totalB = 0;
        dados.meses.forEach(m => {
            const c = dc.porMes[m] || {};
            if (par) {
                const [a, b] = calc(c); total += a; totalB += b;
                tds += `<td>${_pnFmtInt(a)} – ${_pnFmtInt(b)}</td>`;
            } else {
                const v = calc(c); total += v;
                tds += `<td>${_pnFmt(v)}</td>`;
            }
        });
        tds += par ? `<td class="pn-col-total">${_pnFmtInt(total)} – ${_pnFmtInt(totalB)}</td>`
                   : `<td class="pn-col-total">${_pnFmt(total)}</td>`;
        return `<tr class="${classe}">${tds}</tr>`;
    };
    return `<table class="pn-tbl">
        <thead><tr><th>${dc.sigla}</th>${dados.meses.map(m => `<th>${m}</th>`).join('')}<th>Total</th></tr></thead>
        <tbody>
            ${linha('pn-row-fat',  'Faturado ' + dados.anoBase, c => c.fat || 0)}
            ${linha('pn-row-meta', 'Meta ' + dados.anoBase,     c => c.meta || 0)}
            ${linha('pn-row-ant',  'Faturado ' + dados.anoAnt,  c => c.fatAnt || 0)}
            ${linha('pn-row-qtd',  'Qtd (Exec – Plan)',         c => [c.qtd || 0, c.metaQtd || 0], true)}
        </tbody>
    </table>`;
}

function _pnPct(num, den) {
    if (!den) return '—';
    return (100 * num / den).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
}

// Página "Resumo" do centro: tabela mensal + blocos de % + Top 15 próprios
function _pnPaginaCentroResumo(dc, dados) {
    const pg = _pnNovaPagina(`${dc.sigla} — Resumo`, dados);
    const deltaAnt = dc.fatPeriodo - dc.fatAntPer;
    pg.querySelector('.pn-body').innerHTML = `
        ${_pnTabelaMensalCentro(dc, dados)}
        <div class="pn-3col" style="margin-top:6px;">
            <div class="pn-col-pct">
                <div class="pn-pct-block">
                    <div class="pn-pct-title">Faturamento / Meta ${dados.anoBase}</div>
                    <div class="pn-pct-linha"><span>Período (%)</span><span class="v">${_pnPct(dc.fatPeriodo, dc.metaPeriodo)}</span></div>
                    <div class="pn-pct-linha"><span>Meta anual (%)</span><span class="v">${_pnPct(dc.fatPeriodo, dc.metaAnual)}</span></div>
                    <div class="pn-pct-linha"><span>Meta do período</span><span class="v">R$ ${_pnFmt(dc.metaPeriodo)}</span></div>
                    <div class="pn-pct-linha"><span>Meta anual</span><span class="v">R$ ${_pnFmt(dc.metaAnual)}</span></div>
                </div>
                <div class="pn-pct-block">
                    <div class="pn-pct-title">Faturamento ${dados.anoBase} / ${dados.anoAnt}</div>
                    <div class="pn-pct-linha"><span>Período (%)</span><span class="v">${_pnPct(dc.fatPeriodo, dc.fatAntPer)}</span></div>
                    <div class="pn-pct-linha"><span>${dados.anoAnt} no período</span><span class="v">R$ ${_pnFmt(dc.fatAntPer)}</span></div>
                    <div class="pn-pct-linha"><span>Variação</span><span class="v ${deltaAnt >= 0 ? 'pos' : 'neg'}">${deltaAnt >= 0 ? '+' : '−'}R$ ${_pnFmt(Math.abs(deltaAnt))}</span></div>
                </div>
            </div>
            ${_pnTabelaTop15('Cliente', 'clientes', dc.topClientes)}
            ${_pnTabelaTop15('Serviço / Produto', 'itens', dc.topServicos)}
        </div>`;
    return pg;
}

// Página "Famílias e OVs" do centro
function _pnLinhaFamilia(f) {
    const flag = (prev, prevAnual, qtd) => {
        if (prev > 0) return _pnPct(qtd, prev);
        if (qtd <= 0) return '—';
        return `<span class="pn-flag">${prevAnual > 0 ? 'Extra' : 'Novo'}</span>`;
    };
    return `<tr>
        <td>${f.nome}</td>
        <td>${_pnFmt(f.fatRef)}</td><td>${_pnFmtInt(f.prevRef)}</td><td>${_pnFmtInt(f.qtdRef)}</td><td>${flag(f.prevRef, f.prevAnual, f.qtdRef)}</td>
        <td class="pn-sep">${_pnFmt(f.fatAcum)}</td><td>${_pnFmtInt(f.prevAcum)}</td><td>${_pnFmtInt(f.qtdAcum)}</td><td>${flag(f.prevAcum, f.prevAnual, f.qtdAcum)}</td>
    </tr>`;
}

function _pnTabelaOV(titulo, ovs, chave, labels, dados) {
    const grupos = {};
    ovs.forEach(o => {
        const k = o[chave];
        (grupos[k] = grupos[k] || {})[o.Mes] = (grupos[k][o.Mes] || 0) + o.Valor;
    });
    const chaves = Object.keys(grupos);
    if (chaves.length === 0) return '';
    if (chave === 'Status') chaves.sort((a, b) => OV_STATUS_ORDER.indexOf(a) - OV_STATUS_ORDER.indexOf(b));
    else chaves.sort();

    const totalMes = {};
    let linhas = chaves.map(k => {
        let tds = `<td>${labels ? (k + ' — ' + (labels[k] || '')) : k}</td>`, tot = 0;
        dados.meses.forEach(m => {
            const v = grupos[k][m] || 0; tot += v; totalMes[m] = (totalMes[m] || 0) + v;
            tds += `<td style="text-align:right;">${_pnFmt(v)}</td>`;
        });
        return `<tr>${tds}<td style="text-align:right; font-weight:700;">${_pnFmt(tot)}</td></tr>`;
    }).join('');
    const totGeral = Object.values(totalMes).reduce((s, v) => s + v, 0);
    linhas += `<tr class="pn-top15-total"><td>Total</td>${dados.meses.map(m =>
        `<td style="text-align:right;">${_pnFmt(totalMes[m] || 0)}</td>`).join('')}<td style="text-align:right;">${_pnFmt(totGeral)}</td></tr>`;

    return `<div style="flex:1; min-width:0;">
        <table class="pn-top15">
            <thead><tr><th>${titulo}</th>${dados.meses.map(m => `<th style="text-align:right;">${m}</th>`).join('')}<th style="text-align:right;">Total</th></tr></thead>
            <tbody>${linhas}</tbody>
        </table>
    </div>`;
}

function _pnPaginaCentroDetalhe(dc, dados) {
    const pg = _pnNovaPagina(`${dc.sigla} — Famílias e Ordens de Venda`, dados);

    const MAX_FAM = 11;
    const visiveis = dc.familias.slice(0, MAX_FAM);
    const outras = dc.familias.slice(MAX_FAM);
    let linhasFam = visiveis.map(f => _pnLinhaFamilia(f)).join('');
    if (outras.length > 0) {
        const agg = outras.reduce((a, f) => ({
            nome: `Outras famílias (${outras.length})`,
            fatRef: a.fatRef + f.fatRef, fatAcum: a.fatAcum + f.fatAcum,
            qtdRef: a.qtdRef + f.qtdRef, qtdAcum: a.qtdAcum + f.qtdAcum,
            prevRef: a.prevRef + f.prevRef, prevAcum: a.prevAcum + f.prevAcum, prevAnual: a.prevAnual + f.prevAnual
        }), { nome: '', fatRef: 0, fatAcum: 0, qtdRef: 0, qtdAcum: 0, prevRef: 0, prevAcum: 0, prevAnual: 0 });
        linhasFam += _pnLinhaFamilia(agg);
    }
    const tot = dc.familias.reduce((a, f) => ({
        fatRef: a.fatRef + f.fatRef, fatAcum: a.fatAcum + f.fatAcum,
        qtdRef: a.qtdRef + f.qtdRef, qtdAcum: a.qtdAcum + f.qtdAcum,
        prevRef: a.prevRef + f.prevRef, prevAcum: a.prevAcum + f.prevAcum
    }), { fatRef: 0, fatAcum: 0, qtdRef: 0, qtdAcum: 0, prevRef: 0, prevAcum: 0 });

    const tabelaFam = `<table class="pn-tbl pn-tbl-familias">
        <thead><tr>
            <th>Famílias</th>
            <th>Fat. ${dc.mesRef} (R$)</th><th>Prev. (#)</th><th>Real. (#)</th><th>%</th>
            <th class="pn-sep">Fat. Acum. (R$)</th><th>Prev. (#)</th><th>Real. (#)</th><th>%</th>
        </tr></thead>
        <tbody>${linhasFam}
            <tr class="pn-fam-total">
                <td>Totais</td>
                <td>${_pnFmt(tot.fatRef)}</td><td>${_pnFmtInt(tot.prevRef)}</td><td>${_pnFmtInt(tot.qtdRef)}</td><td>${_pnPct(tot.qtdRef, tot.prevRef)}</td>
                <td class="pn-sep">${_pnFmt(tot.fatAcum)}</td><td>${_pnFmtInt(tot.prevAcum)}</td><td>${_pnFmtInt(tot.qtdAcum)}</td><td>${_pnPct(tot.qtdAcum, tot.prevAcum)}</td>
            </tr>
        </tbody>
    </table>
    <div class="pn-nota">Prev./Real. em quantidades (metas × executado). "Novo" = família fora do plano anual; "Extra" = sem previsto no período.</div>`;

    let secaoOV;
    if (typeof globalOVs === 'undefined' || globalOVs.length === 0) {
        secaoOV = '<div class="pn-nota" style="margin-top:14px;">Base de Ordens de Venda não carregada — seção de OVs omitida.</div>';
    } else if (dc.ovs.length === 0) {
        secaoOV = '<div class="pn-nota" style="margin-top:14px;">Sem Ordens de Venda para este centro no período selecionado.</div>';
    } else {
        secaoOV = `<div style="display:flex; gap:16px; margin-top:10px; align-items:flex-start;">
            ${_pnTabelaOV('OVs por Situação', dc.ovs, 'Status', null, dados)}
            ${_pnTabelaOV('OVs por Operação', dc.ovs, 'Operacao', OV_OPERACAO_LABELS, dados)}
        </div>
        <div class="pn-nota">Valores de inclusão de OVs conforme a base de status carregada (ano corrente).</div>`;
    }

    pg.querySelector('.pn-body').innerHTML = tabelaFam + secaoOV;
    return pg;
}

// -----------------------------------------------------------------------------
// Gráficos (renderiza ApexCharts no slot, converte em <img> e destrói)
// -----------------------------------------------------------------------------
async function _pnChartParaImg(slot, options) {
    const chart = new ApexCharts(slot, options);
    await chart.render();
    await new Promise(r => setTimeout(r, 120));
    const out = await chart.dataURI({ scale: 2 });
    chart.destroy();
    const img = document.createElement('img');
    img.className = 'pn-chart-img';
    img.src = out.imgURI || out;
    slot.innerHTML = '';
    slot.appendChild(img);
}

function _pnGaugeOptions(pct, cor) {
    const real = isFinite(pct) ? pct : 0;
    return {
        chart: { type: 'radialBar', height: 140, animations: { enabled: false }, sparkline: { enabled: true } },
        series: [Math.max(0, Math.min(real, 100))],
        plotOptions: {
            radialBar: {
                startAngle: -90, endAngle: 90,
                track: { background: '#e8ecf5' },
                hollow: { size: '58%' },
                dataLabels: {
                    name: { show: false },
                    value: { offsetY: -8, fontSize: '21px', fontWeight: 700, color: '#1e2430',
                             formatter: () => real.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%' }
                }
            }
        },
        fill: { colors: [cor] },
        stroke: { lineCap: 'round' }
    };
}

async function _pnRenderizarGraficos(stage, dados) {
    // Gráfico da capa: Meta × Faturado por mês (tipo em foco)
    const slotCapa = stage.querySelector('[data-chart="capaMensal"]');
    if (slotCapa) {
        await _pnChartParaImg(slotCapa, {
            chart: { type: 'bar', height: 300, animations: { enabled: false }, toolbar: { show: false } },
            series: [
                { name: 'Faturado ' + dados.anoBase, data: dados.meses.map(m => Math.round((dados.porTipo[dados.tipoFoco][m] || {}).fat || 0)) },
                { name: 'Meta ' + dados.anoBase,     data: dados.meses.map(m => Math.round((dados.porTipo[dados.tipoFoco][m] || {}).meta || 0)) }
            ],
            colors: [PN_AZUL, PN_LARANJA],
            plotOptions: { bar: { columnWidth: '55%' } },
            dataLabels: { enabled: false },
            xaxis: { categories: dados.meses },
            yaxis: { labels: { formatter: v => (v / 1000).toLocaleString('pt-BR') + ' mil' } },
            legend: { position: 'bottom' },
            grid: { strokeDashArray: 3 }
        });
    }

    // Velocímetro do contrato (capa) — dados manuais do usuário
    const boxContrato = stage.querySelector('[data-gauge="contrato"] .pn-gauge-chart');
    if (boxContrato) {
        const capa = _pnCapaConfig();
        const pct = 100 * _pnParseNum(capa.contrato.faturado) / _pnParseNum(capa.contrato.valor);
        await _pnChartParaImg(boxContrato, _pnGaugeOptions(isFinite(pct) ? pct : 0, '#2E7D32'));
    }

    // Velocímetros da página de tabelas
    for (const g of _pnListaGauges(dados)) {
        const box = stage.querySelector(`[data-gauge="${g.key}"] .pn-gauge-chart`);
        if (!box) continue;
        const pct = g.meta > 0 ? 100 * g.fat / g.meta : NaN;
        if (!dados.temMetas || !isFinite(pct)) {
            box.innerHTML = '<div style="height:120px; display:flex; align-items:center; justify-content:center; color:#8a93a3; font-size:12px;">Sem metas carregadas</div>';
            continue;
        }
        await _pnChartParaImg(box, _pnGaugeOptions(pct, g.cor));
    }

    // Gráficos por centro
    const siglas = dados.listaCentros.map(c => c.sigla);
    const alturaBarras = Math.max(360, 40 * siglas.length + 90);

    await _pnChartParaImg(stage.querySelector('[data-chart="barras"]'), {
        chart: { type: 'bar', height: Math.min(alturaBarras, 560), animations: { enabled: false }, toolbar: { show: false } },
        series: [
            { name: 'Faturado ' + dados.anoBase, data: dados.listaCentros.map(c => Math.round(c.fat)) },
            { name: 'Meta',                      data: dados.listaCentros.map(c => Math.round(c.meta)) },
            { name: 'Faturado ' + dados.anoAnt,  data: dados.listaCentros.map(c => Math.round(c.fatAnt)) }
        ],
        colors: [PN_AZUL, PN_LARANJA, PN_CINZA],
        plotOptions: { bar: { horizontal: true, barHeight: '72%' } },
        dataLabels: { enabled: false },
        xaxis: { categories: siglas, labels: { formatter: v => (v / 1000).toLocaleString('pt-BR') + ' mil' } },
        legend: { position: 'bottom' },
        grid: { strokeDashArray: 3 }
    });

    const pcts = dados.listaCentros.map(c => c.meta > 0 ? 100 * c.fat / c.meta : 0);
    await _pnChartParaImg(stage.querySelector('[data-chart="pctMeta"]'), {
        chart: { type: 'bar', height: 560, stacked: true, animations: { enabled: false }, toolbar: { show: false } },
        series: [
            { name: '% atingido', data: pcts.map(p => Math.min(p, 100)) },
            { name: 'Restante',   data: pcts.map(p => Math.max(0, 100 - p)) }
        ],
        colors: [PN_AZUL, PN_LARANJA],
        plotOptions: { bar: { columnWidth: '60%' } },
        dataLabels: {
            enabled: true,
            formatter: (v, opt) => opt.seriesIndex === 0
                ? pcts[opt.dataPointIndex].toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + '%' : '',
            style: { fontSize: '11px', colors: ['#fff'] }
        },
        xaxis: { categories: siglas },
        yaxis: { max: 100, labels: { formatter: v => v + '%' } },
        legend: { position: 'bottom' },
        tooltip: { enabled: false },
        grid: { strokeDashArray: 3 }
    });
}

// -----------------------------------------------------------------------------
// Pipeline: montar páginas → capturar → preview / PDF / apresentação
// -----------------------------------------------------------------------------
// Cache das últimas capturas: preview, PDF e apresentação compartilham as
// mesmas imagens enquanto os filtros não mudarem (fingerprint) — recapturar as
// ~23 páginas do relatório completo leva ~1 min.
let _pnShotsCache = null;      // { shots, dados }
let _pnShotsFingerprint = '';

async function _pnObterShots() {
    if (_pnShotsCache && _pnShotsFingerprint === _pnFingerprint()) return _pnShotsCache;
    return await _pnConstruirECapturar();
}

function _pnFingerprint() {
    return JSON.stringify({
        ano: _pnAnoBase(),
        meses: _pnMesesSelecionados(),
        centros: window.getCheckedCentros(),
        uf: (document.getElementById('filter-uf') || {}).value || 'ALL',
        tipos: _pnTiposSelecionados(),
        capa: _pnCapaConfig()
    });
}

async function _pnConstruirECapturar() {
    const dados = _pnDados();
    const stage = document.createElement('div');
    stage.style.cssText = 'position:absolute; left:-12000px; top:0;';
    const paginas = [_pnPaginaCapa(dados), _pnPaginaTabelas(dados), _pnPaginaCentros(dados), _pnPaginaTop15(dados)];
    // R3: dupla de páginas de detalhe para cada centro com movimento no escopo
    for (const nomeCentro of _pnCentrosDetalhe(dados)) {
        const dc = _pnDadosCentro(nomeCentro, dados);
        paginas.push(_pnPaginaCentroResumo(dc, dados));
        paginas.push(_pnPaginaCentroDetalhe(dc, dados));
    }
    paginas.forEach(p => stage.appendChild(p));
    document.body.appendChild(stage);
    try {
        await _pnRenderizarGraficos(stage, dados);
        paginas.forEach((p, i) => {
            p.querySelector('.pn-pageno').textContent = `Página ${i + 1} de ${paginas.length}`;
        });
        const shots = [];
        for (const p of paginas) {
            const canvas = await html2canvas(p, { scale: 2, backgroundColor: '#ffffff', logging: false });
            shots.push(canvas.toDataURL('image/jpeg', 0.9));
            if (typeof yieldUI === 'function') await yieldUI();
        }
        _pnShotsCache = { shots, dados };
        _pnShotsFingerprint = _pnFingerprint();
        return _pnShotsCache;
    } finally {
        document.body.removeChild(stage);
    }
}

function _pnValidar() {
    if (typeof globalData === 'undefined' || globalData.length === 0) {
        alert('Carregue as bases antes de gerar o Relatório PN.');
        return false;
    }
    if (_pnMesesSelecionados().length === 0) {
        alert('Selecione ao menos um mês na sidebar.');
        return false;
    }
    if (_pnTiposSelecionados().length === 0) {
        alert('Marque ao menos um tipo (Serviços e/ou Produtos) no bloco do Relatório PN.');
        return false;
    }
    return true;
}

async function montarPreviewPN() {
    if (!_pnValidar()) return;
    const prev = document.getElementById('report-preview');
    if (!prev) return;
    prev.innerHTML = '<p class="placeholder-text">Montando Relatório PN…</p>';
    try {
        const { shots } = await _pnObterShots();
        prev.innerHTML = shots.map(s =>
            `<div class="pn-preview-pagina"><img src="${s}" alt="Página do Relatório PN"></div>`).join('');
    } catch (e) {
        console.error('[Relatório PN] falha no preview:', e);
        prev.innerHTML = '<p class="placeholder-text">Erro ao montar o Relatório PN. Veja o console (F12).</p>';
    }
}

async function baixarPDFPN() {
    if (!_pnValidar()) return;
    const btn = document.getElementById('report-pn-btn-pdf');
    const txtOrig = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = 'Preparando…'; }
    try {
        const dados = _pnDados();
        const stage = document.createElement('div');
        stage.style.cssText = 'position:absolute; left:-12000px; top:0;';
        
        const paginas = [_pnPaginaCapa(dados), _pnPaginaTabelas(dados), _pnPaginaCentros(dados), _pnPaginaTop15(dados)];
        for (const nomeCentro of _pnCentrosDetalhe(dados)) {
            const dc = _pnDadosCentro(nomeCentro, dados);
            paginas.push(_pnPaginaCentroResumo(dc, dados));
            paginas.push(_pnPaginaCentroDetalhe(dc, dados));
        }
        
        paginas.forEach((p, i) => {
            stage.appendChild(p);
            p.querySelector('.pn-pageno').textContent = `Página ${i + 1} de ${paginas.length}`;
        });
        
        document.body.appendChild(stage);
        
        try {
            await _pnRenderizarGraficos(stage, dados);
            
            // Abrir janela para impressão
            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                alert('O bloqueador de pop-ups impediu a abertura da tela de impressão. Por favor, permita pop-ups para este site.');
                return;
            }
            
            // Obter todos os estilos atuais da página principal
            let estilosHtml = '';
            document.querySelectorAll('link[rel="stylesheet"]').forEach(l => {
                estilosHtml += `<link rel="stylesheet" href="${l.getAttribute('href')}">`;
            });
            document.querySelectorAll('style').forEach(s => {
                estilosHtml += s.outerHTML;
            });
            
            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>Relatório PN - ${dados.anoBase}</title>
                    ${estilosHtml}
                    <style>
                        /* Estilos adicionais para impressão limpa */
                        body {
                            background: #ffffff !important;
                            margin: 0 !important;
                            padding: 0 !important;
                        }
                        .pn-page {
                            box-shadow: none !important;
                            border: none !important;
                            margin: 0 !important;
                            page-break-after: always !important;
                            page-break-inside: avoid !important;
                            display: flex !important;
                        }
                        @media print {
                            @page {
                                size: A4 landscape;
                                margin: 0;
                            }
                            body {
                                -webkit-print-color-adjust: exact !important;
                                print-color-adjust: exact !important;
                            }
                            .pn-page {
                                page-break-after: always !important;
                                page-break-inside: avoid !important;
                            }
                        }
                    </style>
                </head>
                <body>
                    ${stage.innerHTML}
                    <script>
                        function startPrint() {
                            window.focus();
                            window.print();
                        }
                        if (document.readyState === 'complete') {
                            setTimeout(startPrint, 500);
                        } else {
                            window.onload = function() { setTimeout(startPrint, 500); };
                        }
                    <\/script>
                </body>
                </html>
            `);
            printWindow.document.close();
            
        } finally {
            document.body.removeChild(stage);
        }
        
    } catch (e) {
        console.error('[Relatório PN] falha ao preparar impressão:', e);
        alert('Não foi possível abrir a tela de impressão. Veja o console (F12) para detalhes.');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = txtOrig; }
    }
}

// -----------------------------------------------------------------------------
// Modo apresentação (tela cheia, estilo PowerPoint)
// -----------------------------------------------------------------------------
async function apresentarPN() {
    if (!_pnValidar()) return;
    if (document.getElementById('pn-present')) return; // já aberto

    // O overlay nasce imediatamente (ainda no gesto do clique) para o
    // requestFullscreen não ser bloqueado pelo navegador; as páginas entram depois.
    const ov = document.createElement('div');
    ov.id = 'pn-present';
    ov.innerHTML = '<div class="pn-present-loading">Preparando apresentação…</div>';
    document.body.appendChild(ov);
    if (ov.requestFullscreen) {
        try { await ov.requestFullscreen(); } catch (e) { /* segue como overlay */ }
    }

    let fechado = false;
    const fechar = () => {
        if (fechado) return;
        fechado = true;
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('fullscreenchange', onFsChange);
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        ov.remove();
    };
    const onFsChange = () => { if (!document.fullscreenElement) fechar(); };
    document.addEventListener('fullscreenchange', onFsChange);

    let shots;
    try {
        shots = (await _pnObterShots()).shots;
    } catch (e) {
        console.error('[Relatório PN] falha ao preparar apresentação:', e);
        fechar();
        alert('Não foi possível montar a apresentação. Veja o console (F12).');
        return;
    }
    if (fechado) return; // usuário saiu durante a captura

    let atual = 0;
    ov.innerHTML = `
        <img class="pn-present-slide" alt="Página do Relatório PN">
        <div class="pn-present-hint">← → ou clique para navegar · Esc para sair</div>
        <div class="pn-present-controls">
            <button type="button" data-nav="-1" title="Anterior">‹</button>
            <span class="pn-present-contador"></span>
            <button type="button" data-nav="1" title="Próxima">›</button>
            <button type="button" data-nav="x" title="Sair (Esc)">✕</button>
        </div>`;
    const img = ov.querySelector('.pn-present-slide');
    const contador = ov.querySelector('.pn-present-contador');

    const mostrar = (i) => {
        atual = Math.max(0, Math.min(i, shots.length - 1));
        img.src = shots[atual];
        contador.textContent = `${atual + 1} / ${shots.length}`;
    };
    mostrar(0);

    img.addEventListener('click', () => {
        if (atual < shots.length - 1) mostrar(atual + 1);
        else fechar(); // clique no último slide encerra, como no PowerPoint
    });
    ov.querySelectorAll('[data-nav]').forEach(btn => btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const nav = btn.dataset.nav;
        if (nav === 'x') fechar();
        else mostrar(atual + Number(nav));
    }));

    function onKey(ev) {
        if (ev.key === 'Escape') { ev.preventDefault(); fechar(); }
        else if (ev.key === 'ArrowRight' || ev.key === 'PageDown' || ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); mostrar(atual + 1); }
        else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') { ev.preventDefault(); mostrar(atual - 1); }
        else if (ev.key === 'Home') { ev.preventDefault(); mostrar(0); }
        else if (ev.key === 'End') { ev.preventDefault(); mostrar(shots.length - 1); }
    }
    document.addEventListener('keydown', onKey);
}

window.montarPreviewPN = montarPreviewPN;
window.baixarPDFPN = baixarPDFPN;
window.apresentarPN = apresentarPN;
