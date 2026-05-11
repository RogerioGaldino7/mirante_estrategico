// =============================================================================
// loader.js — Leitura de arquivos via upload (event listeners)
// =============================================================================
// Depende de: state.js, data-processor.js (processData, processMeData), ovs.js (processOVData)
// Este módulo deve ser carregado por último no HTML (após todos os outros).
// =============================================================================

/**
 * Upload de uma ou mais bases de faturamento (.csv / .txt).
 * O ano é extraído do nome do arquivo via regex (ex: base_2026.CSV → "2026").
 */
document.getElementById('csvFileInput').addEventListener('change', function (e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const total = files.length;
    document.getElementById('file-status').innerText = `Lendo ${total} base(s)...`;
    if (typeof showLoading === 'function') {
        showLoading('Lendo arquivos…', `0 de ${total} arquivo(s) prontos`);
    }

    let pending  = total;
    let prontos  = 0;
    let allRows  = [];

    for (let i = 0; i < total; i++) {
        const file = files[i];
        Papa.parse(file, {
            delimiter:      ";",
            encoding:       "ISO-8859-1",
            skipEmptyLines: true,
            complete: function (results) {
                const yearMatch    = file.name.match(/(\d{4})/);
                const yearAssigned = yearMatch ? yearMatch[1] : "Ano Desconhecido";
                results.data.forEach(row => row.push(yearAssigned));
                allRows = allRows.concat(results.data);
                pending--;
                prontos++;
                if (typeof updateLoading === 'function') {
                    updateLoading(null, `${prontos} de ${total} arquivo(s) lidos · ${allRows.length.toLocaleString('pt-BR')} linhas`);
                }
                if (pending === 0) {
                    processData(allRows);
                    if (typeof window.collapseMobileFilters === 'function') window.collapseMobileFilters();
                }
            },
            error: function (err) {
                pending--;
                if (typeof hideLoading === 'function') hideLoading();
                alert("Erro ao ler CSV: " + err.message);
                if (pending === 0 && allRows.length > 0) {
                    processData(allRows);
                    if (typeof window.collapseMobileFilters === 'function') window.collapseMobileFilters();
                }
            }
        });
    }
});

/**
 * Upload de uma ou mais bases de metas anuais (.csv / .txt).
 * O ano é extraído do nome do arquivo via regex (ex: meta_2026.CSV → "2026").
 */
document.getElementById('csvMetaInput').addEventListener('change', function (e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const total = files.length;
    document.getElementById('meta-status').innerText = `Lendo ${total} meta(s)...`;
    if (typeof showLoading === 'function') {
        showLoading('Lendo metas…', `0 de ${total} arquivo(s) prontos`);
    }

    let pending = total;
    let prontos = 0;
    let allRows = [];

    for (let i = 0; i < total; i++) {
        const file = files[i];
        Papa.parse(file, {
            delimiter:      ";",
            encoding:       "ISO-8859-1",
            skipEmptyLines: true,
            complete: function (results) {
                const yearMatch    = file.name.match(/(\d{4})/);
                const yearAssigned = yearMatch ? yearMatch[1] : "Ano Desconhecido";
                results.data.forEach(row => row.push(yearAssigned));
                allRows = allRows.concat(results.data);
                pending--;
                prontos++;
                if (typeof updateLoading === 'function') {
                    updateLoading(null, `${prontos} de ${total} arquivo(s) de metas lidos`);
                }
                if (pending === 0) {
                    if (typeof updateLoading === 'function') updateLoading('Processando metas…');
                    processMeData(allRows);
                    if (typeof hideLoading === 'function') hideLoading();
                    if (typeof window.collapseMobileFilters === 'function') window.collapseMobileFilters();
                }
            },
            error: function (err) {
                pending--;
                if (typeof hideLoading === 'function') hideLoading();
                alert("Erro ao ler Metas: " + err.message);
                if (pending === 0 && allRows.length > 0) {
                    processMeData(allRows);
                    if (typeof window.collapseMobileFilters === 'function') window.collapseMobileFilters();
                }
            }
        });
    }
});

/**
 * Upload do CSV de Classificação Setorial (overrides Público/Privado/Exterior).
 * Formato esperado: cabeçalho com colunas "CNPJRaiz" e "Setor" (Observacao opcional).
 * Persistência: localStorage via processarSetorCsv() em setor.js.
 */
const setorInputEl = document.getElementById('csvSetorInput');
if (setorInputEl) {
    setorInputEl.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (!file) return;

        const statusEl = document.getElementById('setor-status');
        if (statusEl) statusEl.innerText = 'Setor: Lendo...';
        if (typeof showLoading === 'function') {
            showLoading('Lendo classificação setorial…', file.name);
        }

        Papa.parse(file, {
            delimiter:      ";",
            encoding:       "ISO-8859-1",
            skipEmptyLines: true,
            complete: function (results) {
                try {
                    if (typeof updateLoading === 'function') updateLoading('Aplicando overrides…');
                    processarSetorCsv(results.data);
                } catch (err) {
                    console.error('[Loader] Erro em processarSetorCsv:', err);
                    if (statusEl) statusEl.innerText = 'Setor: Erro';
                    alert('Erro ao processar classificação setorial: ' + err.message);
                } finally {
                    if (typeof hideLoading === 'function') hideLoading();
                }
            },
            error: function (err) {
                console.error('[Loader] Erro PapaParse setor:', err);
                if (statusEl) statusEl.innerText = 'Setor: Erro';
                if (typeof hideLoading === 'function') hideLoading();
                alert('Erro ao ler arquivo de classificação: ' + err.message);
            }
        });
    });
}

/**
 * Upload do arquivo de Ordens de Venda (Status × Operação × Centro × Mês).
 * Formato: CSV com 4 linhas de cabeçalho hierárquico (Centro, Mês, Operação, Status).
 */
document.getElementById('csvOVInput').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('ov-status').innerText = 'OVs: Lendo...';
    console.log('[Loader] Iniciando leitura do arquivo OV:', file.name, 'Tamanho:', file.size);
    if (typeof showLoading === 'function') {
        showLoading('Lendo Ordens de Venda…', file.name);
    }

    Papa.parse(file, {
        delimiter:      ";",
        encoding:       "ISO-8859-1",
        skipEmptyLines: false,   // Manter linhas vazias — a posição das linhas importa para o parsing
        complete: function (results) {
            console.log('[Loader] PapaParse concluído. Linhas:', results.data.length);
            try {
                if (typeof updateLoading === 'function') {
                    updateLoading('Processando OVs…', `${results.data.length.toLocaleString('pt-BR')} linhas`);
                }
                processOVData(results.data);
                if (typeof window.collapseMobileFilters === 'function') window.collapseMobileFilters();
                console.log('[Loader] processOVData executado com sucesso.');
            } catch (err) {
                console.error('[Loader] ERRO em processOVData:', err);
                document.getElementById('ov-status').innerText = 'OVs: Erro no processamento';
                alert('Erro ao processar OVs: ' + err.message);
            } finally {
                if (typeof hideLoading === 'function') hideLoading();
            }
        },
        error: function (err) {
            console.error('[Loader] ERRO PapaParse:', err);
            if (typeof hideLoading === 'function') hideLoading();
            alert("Erro ao ler arquivo de OVs: " + err.message);
            document.getElementById('ov-status').innerText = 'OVs: Erro na leitura';
        }
    });
});

// -----------------------------------------------------------------------------
// Modo de desenvolvimento: carregamento automático das bases padrão
// -----------------------------------------------------------------------------
// Use via servidor local, por exemplo:
// http://localhost:8765/Dashboard_Web/index.html?dev=1
// O navegador bloqueia leitura automática de arquivos locais quando aberto via file://.
(function setupDevDataLoader() {
    const params = new URLSearchParams(window.location.search);
    const isDevMode = params.get('dev') === '1';
    const btn = document.getElementById('devLoadDataBtn');
    if (!isDevMode || !btn) return;

    document.body.classList.add('dev-mode');

    const DEV_FILES = {
        bases: [
            '../Repositorio_Bases/base_2025.CSV',
            '../Repositorio_Bases/base_2026.CSV'
        ],
        metas: [
            '../Repositorio_Metas/meta_2026.CSV'
        ],
        ovs: '../Repositorio_Ovs/BaseStatusOperacao_2026.CSV'
    };

    async function fetchCsvRows(path, options = {}) {
        const response = await fetch(path, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`${path}: ${response.status} ${response.statusText}`);
        }

        const buffer = await response.arrayBuffer();
        const text = new TextDecoder(options.encoding || 'iso-8859-1').decode(buffer);
        const parsed = Papa.parse(text, {
            delimiter: ';',
            skipEmptyLines: options.skipEmptyLines ?? true
        });

        if (parsed.errors && parsed.errors.length > 0) {
            console.warn('[DevLoader] Avisos PapaParse:', path, parsed.errors);
        }

        return parsed.data;
    }

    async function loadDevData() {
        if (window.location.protocol === 'file:') {
            alert('O carregamento automático precisa ser aberto via servidor local (http://localhost). Use a URL com ?dev=1.');
            return;
        }

        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Carregando teste...';

        try {
            document.getElementById('file-status').innerText = `Lendo ${DEV_FILES.bases.length} base(s) de teste...`;
            let baseRows = [];
            for (const path of DEV_FILES.bases) {
                const rows = await fetchCsvRows(path, { skipEmptyLines: true });
                const yearMatch = path.match(/(\d{4})/);
                const yearAssigned = yearMatch ? yearMatch[1] : 'Ano Desconhecido';
                rows.forEach(row => row.push(yearAssigned));
                baseRows = baseRows.concat(rows);
            }
            processData(baseRows);

            document.getElementById('meta-status').innerText = `Lendo ${DEV_FILES.metas.length} meta(s) de teste...`;
            let metaRows = [];
            for (const path of DEV_FILES.metas) {
                const rows = await fetchCsvRows(path, { skipEmptyLines: true });
                const yearMatch = path.match(/(\d{4})/);
                const yearAssigned = yearMatch ? yearMatch[1] : 'Ano Desconhecido';
                rows.forEach(row => row.push(yearAssigned));
                metaRows = metaRows.concat(rows);
            }
            processMeData(metaRows);

            document.getElementById('ov-status').innerText = 'OVs: Lendo teste...';
            const ovRows = await fetchCsvRows(DEV_FILES.ovs, { skipEmptyLines: false });
            processOVData(ovRows);

            if (typeof window.collapseMobileFilters === 'function') window.collapseMobileFilters();
            btn.textContent = 'Dados de Teste OK';
        } catch (err) {
            console.error('[DevLoader] Erro ao carregar dados de teste:', err);
            alert('Erro ao carregar dados de teste: ' + err.message);
            btn.textContent = originalText;
        } finally {
            btn.disabled = false;
        }
    }

    btn.addEventListener('click', loadDevData);
})();
