// =============================================================================
// report.js — Aba "Relatório": monta um relatório imprimível (PDF) a partir dos
// blocos que já existem no painel (KPIs, gráficos, tabelas). MVP: seleção bloco a
// bloco, pré-visualização e download de PDF (jsPDF + html2canvas via CDN).
// =============================================================================
// Depende de: globalData/charts (state.js), updateDashboard() (dashboard.js),
//             renderClientSection() (clients.js), getCheckedCentros() (filters.js),
//             window.jspdf.jsPDF e window.html2canvas (CDN, ver index.html).
// =============================================================================

// Registro dos blocos disponíveis (MVP). Cada bloco resolve para um nó do DOM já
// renderizado; 'apex' usa o dataURI nativo do ApexCharts (nítido); 'svg' serializa
// o SVG (mapa); 'html' rasteriza o nó via html2canvas.
const REPORT_BLOCKS = [
    { id: 'fat-kpis',        secao: 'Faturamento', label: 'KPIs principais',          tipo: 'html', resolve: () => document.querySelector('#tab-faturamento .kpi-grid') },
    { id: 'fat-familia',     secao: 'Faturamento', label: 'Distribuição por família', tipo: 'apex', chartKey: 'familias' },
    { id: 'fat-top-clientes',secao: 'Faturamento', label: 'Top 15 clientes',          tipo: 'html', resolve: () => { const t = document.getElementById('top-clientes'); return t ? t.closest('.pbi-card') : null; } },
    { id: 'cli-kpis',        secao: 'Clientes',    label: 'KPIs de clientes',         tipo: 'html', resolve: () => document.querySelector('#tab-clientes .kpi-grid') },
    { id: 'cli-mapa',        secao: 'Clientes',    label: 'Mapa do Brasil',           tipo: 'svg',  resolve: () => document.querySelector('#cli-chart-mapa svg') }
];

let _reportInited = false;

// -----------------------------------------------------------------------------
// Inicialização da aba (chamada por switchTab em index.html)
// -----------------------------------------------------------------------------
function initReportTab() {
    if (_reportInited) return;
    const list = document.getElementById('report-blocklist');
    if (!list) return;

    // Agrupa os checkboxes por seção
    const secoes = {};
    REPORT_BLOCKS.forEach(b => { (secoes[b.secao] = secoes[b.secao] || []).push(b); });

    let html = '';
    Object.keys(secoes).forEach(sec => {
        html += `<div class="report-sec-title">${sec}</div>`;
        secoes[sec].forEach(b => {
            html += `<label class="report-block-item">
                <input type="checkbox" class="report-block-cb" data-block-id="${b.id}" checked>
                <span>${b.label}</span>
            </label>`;
        });
    });
    list.innerHTML = html;
    _reportInited = true;
}

function _getSelectedBlocks() {
    const marcados = new Set(
        Array.from(document.querySelectorAll('.report-block-cb:checked')).map(cb => cb.dataset.blockId)
    );
    // Mantém a ordem canônica do registro (não a ordem de clique)
    return REPORT_BLOCKS.filter(b => marcados.has(b.id));
}

// -----------------------------------------------------------------------------
// Captura de blocos → imagem
// -----------------------------------------------------------------------------
function _loadImg(src) {
    return new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = src;
    });
}

// Rasteriza um nó HTML fora de tela (evita problema de captura quando a aba de
// origem está oculta). Força opacidade/anima­ção para o snapshot sair completo.
async function _captureHtmlNode(node) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute; left:-10000px; top:0; width:1000px; background:#ffffff; padding:16px;';
    const st = document.createElement('style');
    st.textContent = '*{animation:none!important; transition:none!important; opacity:1!important;}';
    wrap.appendChild(st);
    wrap.appendChild(node.cloneNode(true));
    document.body.appendChild(wrap);
    try {
        const canvas = await html2canvas(wrap, { scale: 2, backgroundColor: '#ffffff', logging: false });
        return { dataURL: canvas.toDataURL('image/png'), wPx: canvas.width, hPx: canvas.height };
    } finally {
        document.body.removeChild(wrap);
    }
}

async function _blockToImage(block) {
    const chartsRef = (typeof charts !== 'undefined' ? charts : (window.charts || {}));

    if (block.tipo === 'apex') {
        const inst = chartsRef[block.chartKey];
        if (!inst || typeof inst.dataURI !== 'function') return null;
        const out = await inst.dataURI({ scale: 2 });
        const uri = out && out.imgURI ? out.imgURI : out;
        const img = await _loadImg(uri);
        return { dataURL: uri, wPx: img.naturalWidth || img.width, hPx: img.naturalHeight || img.height };
    }

    if (block.tipo === 'svg') {
        const svg = block.resolve();
        if (!svg) return null;
        const W = 600, H = 660, scale = 2;
        const xml = new XMLSerializer().serializeToString(svg);
        const uri = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
        const img = await _loadImg(uri);
        const cv = document.createElement('canvas');
        cv.width = W * scale; cv.height = H * scale;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        return { dataURL: cv.toDataURL('image/png'), wPx: cv.width, hPx: cv.height };
    }

    // html
    const node = block.resolve();
    if (!node) return null;
    return await _captureHtmlNode(node);
}

// -----------------------------------------------------------------------------
// Cabeçalho / escopo (reflete os filtros ativos)
// -----------------------------------------------------------------------------
function _reportTitulo() {
    const el = document.getElementById('report-titulo');
    return (el && el.value.trim()) || 'Relatório Estratégico';
}

function _escopoTexto() {
    const parts = [];
    const ano = (document.getElementById('filter-ano') || {}).value || 'ALL';
    parts.push('Ano: ' + (ano === 'ALL' ? 'Todos' : ano));

    const c = (typeof window.getCheckedCentros === 'function') ? window.getCheckedCentros() : 'ALL';
    if (c === 'ALL' || !Array.isArray(c)) parts.push('Centro: Todos');
    else parts.push('Centro: ' + (c.length === 1 ? c[0] : c.length + ' selecionados'));

    const uf = (document.getElementById('filter-uf') || {}).value || 'ALL';
    if (uf !== 'ALL') parts.push('UF: ' + uf);

    return parts.join('   ·   ');
}

// Torna as abas de origem visíveis FORA DA TELA e re-renderiza com os filtros
// atuais, executa `fn` (que captura os blocos) e restaura o estado. Necessário
// porque ApexCharts.dataURI() e html2canvas exigem que o container tenha tamanho
// real — com a aba oculta (display:none) o gráfico sai vazio ("data:,").
async function _withSourceTabsVisible(fn) {
    const ids = ['tab-faturamento', 'tab-clientes'];
    const saved = ids.map(id => {
        const el = document.getElementById(id);
        return { el, css: el ? el.style.cssText : '' };
    });
    saved.forEach(({ el }) => {
        if (el) el.style.cssText = 'display:block; position:absolute; left:-10000px; top:0; width:1000px;';
    });
    try {
        if (typeof updateDashboard === 'function') updateDashboard();
        if (typeof renderClientSection === 'function') renderClientSection();
        // espera o ApexCharts concluir render + animação antes de capturar
        await new Promise(r => setTimeout(r, 700));
        return await fn();
    } finally {
        saved.forEach(({ el, css }) => { if (el) el.style.cssText = css; });
    }
}

// Captura todos os blocos selecionados como imagens (dentro do contexto visível)
async function _capturarBlocos(sel) {
    return await _withSourceTabsVisible(async () => {
        const shots = [];
        for (const b of sel) {
            let img = null;
            try { img = await _blockToImage(b); } catch (e) { console.warn('[Relatório] bloco falhou:', b.id, e); }
            if (img) shots.push({ label: b.label, img });
        }
        return shots;
    });
}

// -----------------------------------------------------------------------------
// Pré-visualização
// -----------------------------------------------------------------------------
async function montarPreviewRelatorio() {
    const prev = document.getElementById('report-preview');
    if (!prev) return;
    if (typeof globalData === 'undefined' || globalData.length === 0) {
        prev.innerHTML = '<p class="placeholder-text">Carregue as bases primeiro.</p>';
        return;
    }
    const sel = _getSelectedBlocks();
    if (sel.length === 0) {
        prev.innerHTML = '<p class="placeholder-text">Selecione ao menos um bloco.</p>';
        return;
    }

    prev.innerHTML = '<p class="placeholder-text">Montando pré-visualização…</p>';
    const shots = await _capturarBlocos(sel);

    let html = `<div class="report-sheet">
        <div class="report-sheet-header">
            <div>
                <div class="report-brand">TECPAR</div>
                <div class="report-title">${_reportTitulo()}</div>
                <div class="report-escopo">${_escopoTexto()}</div>
            </div>
            <div class="report-date">Emitido<br>${new Date().toLocaleDateString('pt-BR')}</div>
        </div>`;

    for (const { label, img } of shots) {
        html += `<div class="report-block">
            <div class="report-block-title">${label}</div>
            <img src="${img.dataURL}" alt="${label}" style="width:100%; display:block;">
        </div>`;
    }
    html += '</div>';
    prev.innerHTML = html;
}

// -----------------------------------------------------------------------------
// Geração do PDF
// -----------------------------------------------------------------------------
// PNG embutido em escala 2 gera PDFs de dezenas de MB; para o arquivo final,
// reencoda cada captura como JPEG sobre fundo branco (as capturas do Apex podem
// ter fundo transparente, que viraria preto no JPEG sem o fill).
async function _toJpeg(shot) {
    const img = await _loadImg(shot.dataURL);
    const cv = document.createElement('canvas');
    cv.width = shot.wPx; cv.height = shot.hPx;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0);
    return cv.toDataURL('image/jpeg', 0.88);
}

async function baixarPDFRelatorio() {
    if (typeof globalData === 'undefined' || globalData.length === 0) {
        alert('Carregue as bases antes de gerar o relatório.');
        return;
    }
    if (!window.jspdf || !window.jspdf.jsPDF || typeof window.html2canvas !== 'function') {
        alert('Bibliotecas de PDF ainda não carregaram. Aguarde alguns segundos e tente novamente.');
        return;
    }
    const sel = _getSelectedBlocks();
    if (sel.length === 0) { alert('Selecione ao menos um bloco.'); return; }

    const btn = document.getElementById('report-btn-pdf');
    const txtOrig = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = 'Gerando…'; }

    try {
        const shots = await _capturarBlocos(sel);

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageW = 210, pageH = 297, margin = 12;
        const contentW = pageW - 2 * margin;

        // Cabeçalho
        let y = margin;
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.setTextColor(0, 51, 160);
        pdf.text('TECPAR', margin, y + 4);
        pdf.setFontSize(13); pdf.setTextColor(30, 30, 30);
        pdf.text(_reportTitulo(), margin, y + 11);
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(110, 110, 110);
        pdf.text(_escopoTexto(), margin, y + 16.5);
        pdf.text('Emitido: ' + new Date().toLocaleString('pt-BR'), margin, y + 21);
        pdf.setDrawColor(200); pdf.line(margin, y + 24, margin + contentW, y + 24);
        y += 30;

        for (const { label, img } of shots) {
            let drawW = contentW;
            let drawH = contentW * (img.hPx / img.wPx);
            const titleH = 6;

            // Nova página se nem o título + um pedaço mínimo cabem
            if (y + titleH + 20 > pageH - margin) { pdf.addPage(); y = margin; }

            pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(0, 51, 160);
            pdf.text(label, margin, y + 4);
            y += titleH;

            // Se a imagem natural ocupar quase todo o resto da folha e sobrar muito pouco, joga para a proxima folha
            let maxH = pageH - margin - y;
            if (drawH > maxH && maxH < 120) {
                pdf.addPage();
                y = margin;
                maxH = pageH - margin - y;
            }

            // Se a imagem não couber na página, escala para caber (mantém proporção)
            if (drawH > maxH) { const s = maxH / drawH; drawH = maxH; drawW = contentW * s; }

            // Centraliza horizontalmente se a imagem for menor que a largura da página
            let drawX = margin;
            if (drawW < contentW) {
                drawX = margin + (contentW - drawW) / 2;
            }

            pdf.addImage(await _toJpeg(img), 'JPEG', drawX, y, drawW, drawH);
            y += drawH + 8;
        }

        // Rodapé com numeração de páginas
        const total = pdf.internal.getNumberOfPages();
        for (let p = 1; p <= total; p++) {
            pdf.setPage(p);
            pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(150, 150, 150);
            pdf.text(`Página ${p} de ${total}`, pageW / 2, pageH - 6, { align: 'center' });
        }

        pdf.save(_reportFilename());
    } catch (e) {
        console.error('[Relatório] falha ao gerar PDF:', e);
        alert('Não foi possível gerar o PDF. Veja o console (F12) para detalhes.');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = txtOrig; }
    }
}

function _reportFilename() {
    const ano = (document.getElementById('filter-ano') || {}).value || 'ALL';
    const slugTitulo = _reportTitulo().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30);
    const anoSlug = ano === 'ALL' ? '' : '_' + ano;
    const dataSlug = new Date().toISOString().split('T')[0];
    return `${slugTitulo || 'relatorio'}${anoSlug}_${dataSlug}.pdf`;
}

window.initReportTab = initReportTab;
window.montarPreviewRelatorio = montarPreviewRelatorio;
window.baixarPDFRelatorio = baixarPDFRelatorio;
