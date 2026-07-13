// =============================================================================
// dev-shots.js — Utilitário DEV: regenera os prints do manual do usuário
// =============================================================================
// Só ativo em modo dev (?dev=1, via servidor local — ver 🔧_MODO_DEV.bat).
// O botão "📸 Prints do Manual" percorre as abas, captura as seções que o
// manual.html usa e grava os PNGs direto em _Sistema/Imagem/manual/ pelo
// endpoint POST /__save-shot?dir=manual do .claude/static-server.js.
//
// Técnicas (descobertas em 2026-07-13 — não remover sem entender):
//   • html2canvas não captura elementos dentro do contêiner de scroll da aba
//     → clona a seção para um wrapper offscreen em document.body;
//   • gráficos ApexCharts saem vazios no clone → troca por <img> via
//     chart.dataURI() antes de capturar;
//   • a animação fadeUp (fill:backwards) congela em opacity:0 quando o
//     documento está oculto/ocupado → injeta style matando animation/transition
//     durante a sessão de captura;
//   • ApexCharts depende de requestAnimationFrame, que não dispara com o
//     documento oculto → troca rAF por setTimeout durante a sessão.
// =============================================================================

(function setupDevShots() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('dev') !== '1') return;
    const btn = document.getElementById('devShotsBtn');
    if (!btn) return;

    const ESCALA = 2;          // multiplicador de resolução dos prints
    const FUNDO  = '#f0f2f5';  // --bg-canvas

    const esperar = ms => new Promise(r => setTimeout(r, ms));

    async function esperarAte(cond, timeoutMs, passoMs = 300) {
        const fim = Date.now() + timeoutMs;
        while (Date.now() < fim) {
            try { if (cond()) return true; } catch (e) { /* segue tentando */ }
            await esperar(passoMs);
        }
        return false;
    }

    // Clona a seção p/ fora do scroll da aba e captura; gráficos Apex viram <img>.
    async function capturar(el, bg = FUNDO) {
        const wrap = document.createElement('div');
        wrap.style.cssText = `position:fixed; left:-11000px; top:0; width:${el.offsetWidth}px; background:${bg}; z-index:-1;`;
        const clone = el.cloneNode(true);

        const reg = (typeof charts !== 'undefined' ? charts : window.charts) || {};
        for (const inst of Object.values(reg)) {
            if (!inst || !inst.el) continue;
            const cont = inst.el.closest('[id]');
            if (!cont || !el.contains(cont)) continue;
            try {
                const out = await inst.dataURI({ scale: ESCALA });
                const uri = out && out.imgURI ? out.imgURI : out;
                const tgt = clone.querySelector('#' + CSS.escape(cont.id));
                if (tgt) tgt.innerHTML = `<img src="${uri}" style="width:100%; display:block;">`;
            } catch (e) { console.warn('[Prints] dataURI falhou:', cont.id, e); }
        }

        wrap.appendChild(clone);
        document.body.appendChild(wrap);
        try {
            await esperar(120); // imgs dataURI carregarem
            return await html2canvas(wrap, { scale: ESCALA, backgroundColor: bg === 'transparent' ? null : bg, logging: false });
        } finally {
            document.body.removeChild(wrap);
        }
    }

    function cortar(canvas, y0css, y1css) {
        const y0 = Math.round(y0css * ESCALA);
        const y1 = Math.min(Math.round(y1css * ESCALA), canvas.height);
        const c = document.createElement('canvas');
        c.width = canvas.width; c.height = y1 - y0;
        c.getContext('2d').drawImage(canvas, 0, y0, canvas.width, y1 - y0, 0, 0, canvas.width, y1 - y0);
        return c;
    }

    function juntar(canvases, gapCss = 20) {
        const gap = gapCss * ESCALA;
        const W = Math.max(...canvases.map(c => c.width));
        const H = canvases.reduce((a, c) => a + c.height, 0) + gap * (canvases.length - 1);
        const out = document.createElement('canvas');
        out.width = W; out.height = H;
        const ctx = out.getContext('2d');
        ctx.fillStyle = FUNDO; ctx.fillRect(0, 0, W, H);
        let y = 0;
        canvases.forEach(c => { ctx.drawImage(c, 0, y); y += c.height + gap; });
        return out;
    }

    let _gravados = 0;
    async function salvar(canvas, nome) {
        const resp = await fetch('/__save-shot?dir=manual&name=' + encodeURIComponent(nome), {
            method: 'POST', body: canvas.toDataURL('image/png')
        });
        if (!resp.ok) throw new Error(`${nome}: servidor respondeu ${resp.status}`);
        _gravados++;
        return nome;
    }

    async function capturarEJuntar(els, nome) {
        const cs = [];
        for (const el of els) {
            if (!el) throw new Error(`${nome}: seção não encontrada (layout mudou? ajuste dev-shots.js)`);
            cs.push(await capturar(el));
        }
        return salvar(juntar(cs), nome);
    }

    // Acha a seção da aba pelo começo do texto (resiliente a reordenação).
    const secao = (tab, txt) =>
        [...tab.children].find(e => (e.innerText || '').trim().slice(0, 120).includes(txt));
    const porClasse = (tab, cls) => tab.querySelector(':scope > .' + cls);

    async function abrirAba(tabId) {
        switchTab(tabId, document.querySelector(`.tab-btn[data-tab="${tabId}"]`));
        await esperar(1200); // render inicial da aba
    }

    async function gerarPrintsManual() {
        if (typeof globalData === 'undefined' || globalData.length === 0) {
            alert('Carregue os dados primeiro (botão "Carregar Dados de Teste").');
            return;
        }
        const ok = confirm('Regenerar os 13 prints do manual em _Sistema/Imagem/manual/?\n' +
            'Os arquivos atuais serão SOBRESCRITOS (o git guarda as versões anteriores).\n\n' +
            'Leva ~1–2 minutos; a tela vai alternar entre as abas.');
        if (!ok) return;

        const abaOriginal = document.querySelector('.tab-btn.active');
        const feitos = [], falhas = [];
        _gravados = 0;

        // Sessão de captura: sem animações/transições + rAF por timer
        const stNoAnim = document.createElement('style');
        stNoAnim.textContent = '*,*::before,*::after{animation:none !important; transition:none !important;}';
        document.head.appendChild(stNoAnim);
        const rafOriginal = window.requestAnimationFrame;
        window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16);

        if (typeof showLoading === 'function') showLoading('Gerando prints do manual…', '');
        const progresso = txt => { if (typeof updateLoading === 'function') updateLoading(null, txt); };
        const tentar = async (nome, fn) => {
            progresso(nome);
            try { await fn(); feitos.push(nome); }
            catch (e) { console.error('[Prints]', nome, e); falhas.push(nome + ' — ' + e.message); }
        };

        try {
            // ---- cap1: navbar (sem os botões de dev) --------------------------
            await tentar('cap1_upload.png', async () => {
                const stDev = document.createElement('style');
                stDev.textContent = '.dev-only, #devLoadDataBtn, #devShotsBtn {display:none !important;}';
                document.head.appendChild(stDev);
                try { await salvar(await capturar(document.querySelector('.pbi-navbar'), 'transparent'), 'cap1_upload.png'); }
                finally { stDev.remove(); }
            });

            // ---- cap2: sidebar em 2 partes (corte no grupo MESES) -------------
            await tentar('cap2_filtros_1/2.png', async () => {
                const header  = document.querySelector('.filter-pane-header');
                const filtros = document.querySelector('.filter-pane .filters');
                const kids = [...filtros.children];
                const meses = kids.find(e => (e.innerText || '').includes('MESES'));
                const corte = meses.offsetTop - kids[0].offsetTop;
                const cH = await capturar(header, '#ffffff');
                const cF = await capturar(filtros, '#ffffff');
                await salvar(juntar([cH, cortar(cF, 0, corte)], 0), 'cap2_filtros_1.png');
                await salvar(cortar(cF, corte, cF.height / ESCALA), 'cap2_filtros_2.png');
            });

            // ---- cap3: Faturamento --------------------------------------------
            await abrirAba('tab-faturamento');
            const fat = document.getElementById('tab-faturamento');
            await tentar('cap3_faturamento_1.png', () => capturarEJuntar([
                porClasse(fat, 'report-header'), porClasse(fat, 'context-banner'),
                porClasse(fat, 'kpi-grid'), porClasse(fat, 'charts-section')
            ], 'cap3_faturamento_1.png'));
            await tentar('cap3_faturamento_2.png', () => capturarEJuntar([
                secao(fat, 'Desempenho Consolidado'), porClasse(fat, 'top-lists-grid')
            ], 'cap3_faturamento_2.png'));

            // ---- cap4: Inteligência de Clientes -------------------------------
            await abrirAba('tab-clientes');
            const cli = document.getElementById('tab-clientes');
            await tentar('cap4_inteligencia_1.png', () => capturarEJuntar([
                porClasse(cli, 'report-header'), porClasse(cli, 'kpi-grid'),
                secao(cli, 'Top 15 Clientes — Detalhamento')
            ], 'cap4_inteligencia_1.png'));
            await tentar('cap4_inteligencia_2.png', () => capturarEJuntar([
                secao(cli, 'Clientes por Família')
            ], 'cap4_inteligencia_2.png'));
            await tentar('cap4_inteligencia_3.png', () => capturarEJuntar([
                secao(cli, 'Matriz: Clientes por Centro')
            ], 'cap4_inteligencia_3.png'));

            // ---- cap5: Fidelidade (render é assíncrono e pesado) --------------
            await abrirAba('tab-fidelidade');
            progresso('aguardando análise de fidelidade…');
            await esperarAte(() => document.querySelectorAll('#fid-grupos-body tr').length > 1, 30000);
            const fid = document.getElementById('tab-fidelidade');
            await tentar('cap5_fidelidade_1.png', () => capturarEJuntar([
                porClasse(fid, 'report-header'), porClasse(fid, 'context-banner'),
                secao(fid, 'Configuração da Análise'), porClasse(fid, 'kpi-grid')
            ], 'cap5_fidelidade_1.png'));
            await tentar('cap5_fidelidade_2.png', () => capturarEJuntar([
                secao(fid, 'Curva de Coorte')
            ], 'cap5_fidelidade_2.png'));
            await tentar('cap5_fidelidade_3.png', () => capturarEJuntar([
                secao(fid, 'Matriz de Migração'), secao(fid, 'Visão por Grupo'),
                porClasse(fid, 'top-lists-grid')
            ], 'cap5_fidelidade_3.png'));

            // ---- cap6: Relatório (gera a pré-visualização antes) --------------
            await abrirAba('tab-relatorio');
            await tentar('cap6_relatorio_1.png', async () => {
                progresso('montando pré-visualização do relatório…');
                if (typeof montarPreviewRelatorio === 'function') await montarPreviewRelatorio();
                const temPreview = await esperarAte(
                    () => document.querySelectorAll('#report-preview img').length >= 3, 90000, 1000);
                if (!temPreview) throw new Error('pré-visualização não carregou em 90s');
                const stDetails = document.createElement('style');
                stDetails.textContent = 'details{display:none !important;}';
                document.head.appendChild(stDetails);
                try {
                    const full = await capturar(document.querySelector('#tab-relatorio .report-builder'));
                    await salvar(cortar(full, 0, 1150), 'cap6_relatorio_1.png');
                } finally { stDetails.remove(); }
            });

            // ---- cap7 (arquivo cap6_configuracao_1): Configurações ------------
            await abrirAba('tab-config');
            await tentar('cap6_configuracao_1.png', async () => {
                const stTrim = document.createElement('style');
                stTrim.textContent = '#tipo-review-body tr:nth-child(n+9), #setor-review-body tr:nth-child(n+9){display:none !important;}';
                document.head.appendChild(stTrim);
                try {
                    const cfg = document.getElementById('tab-config');
                    await capturarEJuntar([
                        porClasse(cfg, 'report-header'),
                        secao(cfg, 'Classificação de Famílias'), secao(cfg, 'Revisão Setorial')
                    ], 'cap6_configuracao_1.png');
                } finally { stTrim.remove(); }
            });
        } finally {
            window.requestAnimationFrame = rafOriginal;
            stNoAnim.remove();
            if (typeof hideLoading === 'function') hideLoading();
            if (abaOriginal) abaOriginal.click();
        }

        const resumo = `${_gravados} print(s) gravados em _Sistema/Imagem/manual/.` +
            (falhas.length ? `\n\nFALHARAM (${falhas.length}):\n` + falhas.join('\n') +
                '\n\nVeja o console (F12) e ajuste dev-shots.js se o layout mudou.' : '\n\nConfira as imagens e commite junto com a onda.');
        alert(resumo);
    }

    btn.addEventListener('click', gerarPrintsManual);
})();
