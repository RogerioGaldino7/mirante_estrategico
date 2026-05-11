let globalData = [];
let globalMetas = [];
let charts = {}; // Para armazenar instancias do ApexCharts
const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

document.getElementById('csvFileInput').addEventListener('change', function(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    document.getElementById('file-status').innerText = `Lendo ${files.length} base(s)...`;
    let pending = files.length;
    let allRows = [];

    for (let i = 0; i < files.length; i++) {
        let file = files[i];
        Papa.parse(file, {
            delimiter: ";",
            encoding: "ISO-8859-1",
            skipEmptyLines: true,
            complete: function(results) {
                const yearMatch = file.name.match(/(\d{4})/);
                const yearAssigned = yearMatch ? yearMatch[1] : "Ano Desconhecido";
                
                results.data.forEach(row => { row.push(yearAssigned); });
                allRows = allRows.concat(results.data);
                
                pending--;
                if(pending === 0) processData(allRows);
            },
            error: function(err) {
                alert("Erro ao ler CSV: " + err.message);
                pending--;
                if(pending === 0 && allRows.length > 0) processData(allRows);
            }
        });
    }
});

document.getElementById('csvMetaInput').addEventListener('change', function(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    document.getElementById('meta-status').innerText = `Lendo ${files.length} meta(s)...`;
    let pending = files.length;
    let allRows = [];

    for (let i = 0; i < files.length; i++) {
        let file = files[i];
        Papa.parse(file, {
            delimiter: ";",
            encoding: "ISO-8859-1",
            skipEmptyLines: true,
            complete: function(results) {
                const yearMatch = file.name.match(/(\d{4})/);
                const yearAssigned = yearMatch ? yearMatch[1] : "Ano Desconhecido";
                
                results.data.forEach(row => { row.push(yearAssigned); });
                allRows = allRows.concat(results.data);
                
                pending--;
                if(pending === 0) processMeData(allRows);
            },
            error: function(err) {
                alert("Erro ao ler Metas: " + err.message);
                pending--;
                if(pending === 0 && allRows.length > 0) processMeData(allRows);
            }
        });
    }
});

function countEmptyLeading(row) {
    let count = 0;
    for (let i = 0; i < 6; i++) {
        if (!row[i] || String(row[i]).trim() === "") count++;
        else break;
    }
    return count;
}

function processData(rows) {
    if (rows.length < 3) {
        alert("Formato de arquivo inválido.");
        return;
    }

    let tidyData = [];
    let state = Array(6).fill("");
    const mesesBase = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

    for (let i = 0; i < rows.length; i++) {
        let row = rows[i];
        
        const r0 = String(row[0]).trim().toUpperCase();
        if (r0.includes("DATA DE EMISS") || 
            r0 === "CENTRO DE CUSTO" || 
            r0 === "TOTAL POR LINHAS" || 
            r0.includes("TOTAL GERAL") || 
            row[6] === "Valor") {
                continue;
        }

        let d_current = countEmptyLeading(row);
        for (let j = 0; j < 6; j++) {
            if (row[j] && String(row[j]).trim() !== "") {
                state[j] = String(row[j]).trim();
                for(let k = j + 1; k < 6; k++) state[k] = "";
            }
        }

        let nextRow = null;
        let d_next = -1;
        for (let j = i + 1; j < rows.length; j++) {
            let pr0 = String(rows[j][0]).trim().toUpperCase();
            if(!pr0.includes("DATA DE EMISS") && pr0 !== "CENTRO DE CUSTO" && rows[j][6] !== "Valor") {
                nextRow = rows[j];
                d_next = countEmptyLeading(nextRow);
                break;
            }
        }

        if (d_current >= d_next) {
            let monthIndex = 0;
            let loopLimit = row.length - 3; 
            for (let c = 6; c < loopLimit; c += 2) {
                let vStr = row[c] || "0";
                let qStr = row[c+1] || "0";
                vStr = String(vStr).replace(/\./g, "").replace(",", ".");
                qStr = String(qStr).replace(/\./g, "").replace(",", ".");
                let valor = parseFloat(vStr) || 0;
                let quant = parseFloat(qStr) || 0;

                if (valor !== 0 || quant !== 0) {
                    const anoArquivo = row[row.length - 1];
                    tidyData.push({
                         Ano: anoArquivo,
                         Centro: state[0] || 'NÃO IDENTIFICADO',
                         Familia: state[1] || 'NÃO IDENTIFICADO',
                         Produto: state[2] || 'NÃO DEFINIDO',
                         UF: state[3] || 'ND',
                         Cidade: state[4] || 'NÃO DEFINIDO',
                         Cliente: state[5] || 'NÃO IDENTIFICADO',
                         Mes: mesesBase[monthIndex],
                         Valor: valor,
                         Quantidade: quant,
                         MesId: monthIndex
                    });
                }
                monthIndex++;
                if(monthIndex >= 12) break;
            }
        }
    }

    globalData = tidyData;
    document.getElementById('file-status').innerText = `Base: ${globalData.length} reg.`;
    populateFilters();
    updateDashboard();
}

function processMeData(rows) {
    if (rows.length < 3) return;
    
    let metas = [];
    const mesesOrdem = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    
    for (let i = 0; i < rows.length; i++) {
        let row = rows[i];
        let centro = String(row[0]).trim();
        let familiaProduto = String(row[1]).trim();
        let anoArquivo = row[row.length - 1];
        
        if (!centro || centro === "" || centro.toUpperCase().includes("TOTAL") || centro.toUpperCase().includes("CENTRO DE CUSTO") || centro.toUpperCase().includes("VALOR PROJETADO")) continue;

        let indexMes = 0;
        for (let c = 2; c < row.length - 3; c += 2) {
            let valStr = row[c] || "0";
            let qtdStr = row[c+1] || "0";
            valStr = String(valStr).replace(/\./g, "").replace(",", ".");
            qtdStr = String(qtdStr).replace(/\./g, "").replace(",", ".");
            
            let val = parseFloat(valStr) || 0;
            let qtd = parseFloat(qtdStr) || 0;
            
            if (val !== 0 || qtd !== 0) {
                 if(indexMes < 12) {
                     metas.push({
                         Ano: anoArquivo,
                         Centro: centro,
                         Familia: familiaProduto,
                         Mes: mesesOrdem[indexMes],
                         MetaValor: val,
                         MetaQtd: qtd
                     });
                 }
            }
            indexMes++;
            if (indexMes >= 12) break;
        }
    }
    
    globalMetas = metas;
    document.getElementById('meta-status').innerText = `Metas: ${globalMetas.length} reg.`;
    if(globalData.length > 0) updateDashboard();
}

function populateFilters() {
    const anos = [...new Set(globalData.map(d => d.Ano))].filter(a => a !== "Ano Desconhecido" && a).sort().reverse();
    const centros = [...new Set(globalData.map(d => d.Centro))].sort();
    const ufs = [...new Set(globalData.map(d => d.UF))].sort();

    const selectAno = document.getElementById('filter-ano');
    selectAno.innerHTML = '<option value="ALL">Todos os Anos</option>';
    anos.forEach(ano => {
        selectAno.innerHTML += `<option value="${ano}">${ano}</option>`;
    });
    selectAno.addEventListener('change', updateDashboard);

    const addOptions = (id, list) => {
        const select = document.getElementById(id);
        if(!select) return;
        select.innerHTML = '<option value="ALL">Selecionar Tudo</option>';
        list.forEach(item => {
            if(item && item !== 'ND') select.innerHTML += `<option value="${item}">${item}</option>`;
        });
        select.addEventListener('change', updateDashboard);
    };

    addOptions('filter-uf', ufs);

    const centroContainer = document.getElementById('filter-centro-container');
    if (centroContainer) {
        centroContainer.innerHTML = '<label class="checkbox-item" style="display: block; margin-bottom: 5px;"><input type="checkbox" id="centro-all" checked onchange="toggleAllCentros(this)"> <strong>Selecionar/Limpar Todos</strong></label>';
        centros.forEach(item => {
            if(item && item !== 'ND') {
                centroContainer.innerHTML += `<label class="checkbox-item" style="display: block; font-size: 11px; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item}"><input type="checkbox" class="centro-checkbox" value="${item}" checked onchange="updateCentroCheckboxes()"> ${item}</label>`;
            }
        });
    }

    const mesContainer = document.getElementById('filter-mes-container');
    mesContainer.innerHTML = '<label class="checkbox-item"><input type="checkbox" id="mes-all" checked onchange="toggleAllMeses(this)"> <strong>Selecionar/Limpar Todos</strong></label>';
    ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"].forEach(m => {
        mesContainer.innerHTML += `<label class="checkbox-item"><input type="checkbox" class="mes-checkbox" value="${m}" checked onchange="updateMesCheckboxes()"> ${m}</label>`;
    });
}

window.getCheckedCentros = function() {
    const elAll = document.getElementById('centro-all');
    if (elAll && elAll.checked) return "ALL";
    const cbs = document.querySelectorAll('.centro-checkbox:checked');
    if (cbs.length > 0) return Array.from(cbs).map(cb => cb.value);
    
    // Fallback se não encontrou os checkboxes na DOM (e.g. versão antiga ou sem carregamento de base)
    const slc = document.getElementById('filter-centro');
    if (slc) return slc.value;
    
    return [];
};

window.toggleAllCentros = function(master) {
    document.querySelectorAll('.centro-checkbox').forEach(cb => cb.checked = master.checked);
    updateDashboard();
}

window.updateCentroCheckboxes = function() {
    const total = document.querySelectorAll('.centro-checkbox').length;
    const marcados = document.querySelectorAll('.centro-checkbox:checked').length;
    document.getElementById('centro-all').checked = (total === marcados);
    updateDashboard();
}

window.toggleAllMeses = function(master) {
    const cbs = document.querySelectorAll('.mes-checkbox');
    cbs.forEach(cb => cb.checked = master.checked);
    updateDashboard();
}

window.updateMesCheckboxes = function() {
    const total = document.querySelectorAll('.mes-checkbox').length;
    const marcados = document.querySelectorAll('.mes-checkbox:checked').length;
    document.getElementById('mes-all').checked = (total === marcados);
    updateDashboard();
}

function getFilteredDataByYear(targetAno) {
    const fCentro = window.getCheckedCentros();
    const fUf = document.getElementById('filter-uf').value;
    const checkedMeses = Array.from(document.querySelectorAll('.mes-checkbox:checked')).map(cb => cb.value);

    const validData = [];
    globalData.forEach(d => {
        if (d.Ano !== targetAno) return;
        if (fCentro !== "ALL" && Array.isArray(fCentro) && !fCentro.includes(d.Centro)) return;
        if (fUf !== "ALL" && d.UF !== fUf) return;
        if (!checkedMeses.includes(d.Mes)) return;
        if (d.Cliente === 'NÃO IDENTIFICADO' || d.Cliente === 'ND') return;
        validData.push(d);
    });
    return validData;
}

function getFilteredData() {
    const selectAnoObj = document.getElementById('filter-ano');
    const fAno = selectAnoObj ? selectAnoObj.value : "ALL";
    const fCentro = window.getCheckedCentros();
    const fUf = document.getElementById('filter-uf').value;
    const checkedMeses = Array.from(document.querySelectorAll('.mes-checkbox:checked')).map(cb => cb.value);

    const validData = [];

    globalData.forEach(d => {
        if (fAno && fAno !== "ALL" && d.Ano !== fAno) return;
        if (fCentro !== "ALL" && Array.isArray(fCentro) && !fCentro.includes(d.Centro)) return;
        if (fUf !== "ALL" && d.UF !== fUf) return;
        if (!checkedMeses.includes(d.Mes)) return;
        
        if (d.Cliente === 'NÃO IDENTIFICADO' || d.Cliente === 'ND') {
            return;
        }
        
        validData.push(d);
    });

    return validData;
}

function getFilteredMetas() {
    if(globalMetas.length === 0) return [];
    
    const selectAnoObj = document.getElementById('filter-ano');
    const fAno = selectAnoObj ? selectAnoObj.value : "ALL";
    const fCentro = window.getCheckedCentros();
    const checkedMeses = Array.from(document.querySelectorAll('.mes-checkbox:checked')).map(cb => cb.value);

    const validMetas = [];
    globalMetas.forEach(m => {
        if (fAno && fAno !== "ALL" && m.Ano !== fAno) return;
        if (fCentro !== "ALL" && Array.isArray(fCentro) && !fCentro.includes(m.Centro)) return;
        if (!checkedMeses.includes(m.Mes)) return;
        validMetas.push(m);
    });
    return validMetas;
}

function updateDashboard() {
    const data = getFilteredData();
    if(data.length === 0) return;
    
    const metasFiltradas = getFilteredMetas();

    // 1. KPIs
    const faturamentoTotal = data.reduce((acc, curr) => acc + curr.Valor, 0);
    const qtdTotal = data.reduce((acc, curr) => acc + curr.Quantidade, 0);
    
    document.getElementById('kpi-faturamento').innerText = formatter.format(faturamentoTotal);
    document.getElementById('kpi-quantidade').innerText = qtdTotal.toLocaleString('pt-BR');
    
    // Calcula % da Meta KPI Faturamento
    if (globalMetas.length === 0) {
        document.getElementById('kpi-meta-faturamento').innerText = "Meta Indisponível";
        document.getElementById('kpi-meta-faturamento').style.color = "#a19f9d";
        document.getElementById('kpi-meta-quantidade').innerText = "Planejados: Indisponível";
        document.getElementById('kpi-meta-quantidade').style.color = "#a19f9d";
    } else {
        const metaFaturamentoTotal = metasFiltradas.reduce((a, b) => a + b.MetaValor, 0);
        if(metaFaturamentoTotal > 0) {
            let perc = (faturamentoTotal / metaFaturamentoTotal * 100).toFixed(1);
            let color = perc >= 100 ? '#00AD68' : '#E66C37'; // Verde Tecpar se bateu, Laranja se nao
            document.getElementById('kpi-meta-faturamento').innerHTML = `Meta: ${formatter.format(metaFaturamentoTotal)} <span style="color:${color}; font-weight:600;">(${perc}%)</span>`;
        } else {
            document.getElementById('kpi-meta-faturamento').innerText = "Sem meta no filtro";
            document.getElementById('kpi-meta-faturamento').style.color = "#a19f9d";
        }
        
        const metaQtdTotal = metasFiltradas.reduce((a, b) => a + b.MetaQtd, 0);
        if(metaQtdTotal > 0) {
            let percQ = (qtdTotal / metaQtdTotal * 100).toFixed(1);
            let colorQ = percQ >= 100 ? '#00AD68' : '#E66C37';
            document.getElementById('kpi-meta-quantidade').innerHTML = `Planejados: ${metaQtdTotal.toLocaleString('pt-BR')} un. <span style="color:${colorQ}; font-weight:600;">(${percQ}%)</span>`;
        } else {
            document.getElementById('kpi-meta-quantidade').innerText = "Sem planejados no filtro";
            document.getElementById('kpi-meta-quantidade').style.color = "#a19f9d";
        }
    }
    
    // Lógica "Maçãs com Maçãs": só validar os meses que realmente tiveram faturamento no ano atual
    const mesesComDados = [...new Set(data.filter(d => d.Valor > 0).map(d => d.Mes))];

    // YoY KPI (Year over Year) Principal
    const selectAnoObj = document.getElementById('filter-ano');
    const filterAno = selectAnoObj ? selectAnoObj.value : "ALL";
    if (filterAno !== "ALL" && !isNaN(parseInt(filterAno))) {
        const anoAnteriorStr = String(parseInt(filterAno) - 1);
        const prevData = getFilteredDataByYear(anoAnteriorStr).filter(d => mesesComDados.includes(d.Mes));
        const hasPrevYearInBase = globalData.some(d => d.Ano === anoAnteriorStr);
        
        if (hasPrevYearInBase) {
            const prevFat = prevData.reduce((acc, curr) => acc + curr.Valor, 0);
            const prevQtd = prevData.reduce((acc, curr) => acc + curr.Quantidade, 0);
            
            // Faturamento YoY
            if (prevFat > 0) {
                let pFat = ((faturamentoTotal / prevFat) - 1) * 100;
                let cFat = pFat >= 0 ? '#00AD68' : '#E66C37'; // Verde Tecpar se cresceu
                let sFat = pFat >= 0 ? '▲' : '▼';
                document.getElementById('kpi-yoy-faturamento').innerHTML = `Ano Ant. Parcial (${anoAnteriorStr}): ${formatter.format(prevFat)} <span style="color:${cFat}; font-weight:600;">(${sFat} ${Math.abs(pFat).toFixed(1)}%)</span>`;
            } else {
                document.getElementById('kpi-yoy-faturamento').innerText = `Ano Ant. (${anoAnteriorStr}): R$ 0`;
            }
            
            // Volume YoY
            if (prevQtd > 0) {
               let pQtd = ((qtdTotal / prevQtd) - 1) * 100;
               let cQtd = pQtd >= 0 ? '#00AD68' : '#E66C37'; 
               let sQtd = pQtd >= 0 ? '▲' : '▼';
               document.getElementById('kpi-yoy-quantidade').innerHTML = `Ano Ant. Parcial (${anoAnteriorStr}): ${prevQtd.toLocaleString('pt-BR')} un. <span style="color:${cQtd}; font-weight:600;">(${sQtd} ${Math.abs(pQtd).toFixed(1)}%)</span>`;
            } else {
               document.getElementById('kpi-yoy-quantidade').innerText = `Ano Ant. (${anoAnteriorStr}): 0 un.`;
            }
        } else {
            document.getElementById('kpi-yoy-faturamento').innerText = "Ano Ant.: Arquivo não carregado";
            document.getElementById('kpi-yoy-quantidade').innerText = "Ano Ant.: Arquivo não carregado";
            
            document.getElementById('kpi-prog-yoy-title').innerText = `Faturam. Ano/Ant`;
            document.getElementById('kpi-prog-yoy-parcial').innerText = "-";
            document.getElementById('kpi-prog-yoy-acum-lbl').innerText = `Acum. Antigo (%):`;
            document.getElementById('kpi-prog-yoy-acum').innerText = "-";
        }
    } else {
        document.getElementById('kpi-yoy-faturamento').innerText = "Comparação: Selecione 1 Ano específico";
        document.getElementById('kpi-yoy-quantidade').innerText = "Comparação: Selecione 1 Ano específico";
        document.getElementById('kpi-prog-yoy-title').innerText = `Faturam. Ano/Ant`;
        document.getElementById('kpi-prog-yoy-parcial').innerText = "-";
        document.getElementById('kpi-prog-yoy-acum').innerText = "-";
    }
    
    // --- LÓGICA EXATA PARA OS CARDS NOVOS (AZUL E LARANJA DO EXCEL) ---
    const filterCentro = window.getCheckedCentros();
    const filterAnoVal = document.getElementById('filter-ano') ? document.getElementById('filter-ano').value : "ALL";
    const anoTextMeta = filterAnoVal !== "ALL" ? filterAnoVal : "Anual";
    
    document.getElementById('kpi-prog-meta-title').innerText = `Faturamento/Meta ${anoTextMeta}`;
    document.getElementById('kpi-prog-meta-acum-lbl').innerText = `Acumulado ${anoTextMeta}(%):`;
    
    if (globalMetas.length > 0 && filterAnoVal !== "ALL") {
        // MAÇÃS COM MAÇÃS: A meta parcial só deve somar os meses que realmente ocorreram no ano atual
        const metaFaturamentoParcial = metasFiltradas
            .filter(m => mesesComDados.includes(m.Mes))
            .reduce((a, b) => a + b.MetaValor, 0); 
            
        let percParcialMeta = 0;
        if (metaFaturamentoParcial > 0) percParcialMeta = (faturamentoTotal / metaFaturamentoParcial) * 100;
        document.getElementById('kpi-prog-meta-parcial').innerText = percParcialMeta > 0 ? percParcialMeta.toFixed(2).replace('.', ',') + '%' : "-";
        
        // Meta Total do Ano Inteiro (ignorando checkbox de mes para dar a proporção macro do ano)
        const metaAnoInteiro = globalMetas.filter(m => {
             if (m.Ano !== filterAnoVal) return false;
             if (filterCentro !== "ALL" && Array.isArray(filterCentro) && !filterCentro.includes(m.Centro)) return false;
             return true;
        }).reduce((a, b) => a + b.MetaValor, 0);
        
        let percAcumuladoMeta = 0;
        if (metaAnoInteiro > 0) percAcumuladoMeta = (faturamentoTotal / metaAnoInteiro) * 100;
        document.getElementById('kpi-prog-meta-acum').innerText = percAcumuladoMeta > 0 ? percAcumuladoMeta.toFixed(2).replace('.', ',') + '%' : "-";
        
    } else {
        document.getElementById('kpi-prog-meta-parcial').innerText = "-";
        document.getElementById('kpi-prog-meta-acum').innerText = "-";
    }
    
    // CARD LARANJA (YOY)
    if (filterAnoVal !== "ALL" && !isNaN(parseInt(filterAnoVal))) {
        const anoAntNumStr = String(parseInt(filterAnoVal) - 1);
        const hasPrevYear = globalData.some(d => d.Ano === anoAntNumStr);
        document.getElementById('kpi-prog-yoy-title').innerText = `Faturamento ${filterAnoVal}/${anoAntNumStr}`;
        document.getElementById('kpi-prog-yoy-acum-lbl').innerText = `Acumulado ${anoAntNumStr}(%):`;
        
        if (hasPrevYear) {
            // MAÇÃS COM MAÇÃS: Ano anterior reflete estritamente os meses desempenhados desse ano
            const prevAcumuladoParcial = globalData.filter(d => {
                 if (d.Ano !== anoAntNumStr) return false;
                 if (filterCentro !== "ALL" && Array.isArray(filterCentro) && !filterCentro.includes(d.Centro)) return false;
                 if (!mesesComDados.includes(d.Mes)) return false;
                 if (d.Cliente === 'NÃO IDENTIFICADO' || d.Cliente === 'ND') return false;
                 return true;
            }).reduce((a, b) => a + b.Valor, 0);
            
            let percParcialYoY = 0;
            if (prevAcumuladoParcial > 0) percParcialYoY = (faturamentoTotal / prevAcumuladoParcial) * 100;
            document.getElementById('kpi-prog-yoy-parcial').innerText = percParcialYoY > 0 ? percParcialYoY.toFixed(2).replace('.', ',') + '%' : "-";
            
            // Faturamento Ano Inteiro Antigo (Macro, Ano vs Ano Inteiro)
            const prevAnoInteiro = globalData.filter(d => {
                 if (d.Ano !== anoAntNumStr) return false;
                 if (filterCentro !== "ALL" && Array.isArray(filterCentro) && !filterCentro.includes(d.Centro)) return false;
                 if (d.Cliente === 'NÃO IDENTIFICADO' || d.Cliente === 'ND') return false;
                 return true;
            }).reduce((a, b) => a + b.Valor, 0);
            
            let percAcumYoY = 0;
            if (prevAnoInteiro > 0) percAcumYoY = (faturamentoTotal / prevAnoInteiro) * 100;
            document.getElementById('kpi-prog-yoy-acum').innerText = percAcumYoY > 0 ? percAcumYoY.toFixed(2).replace('.', ',') + '%' : "-";
            
        } else {
            document.getElementById('kpi-prog-yoy-parcial').innerText = "-";
            document.getElementById('kpi-prog-yoy-acum').innerText = "-";
        }
    }
    
    const ticketMedio = qtdTotal > 0 ? faturamentoTotal / qtdTotal : 0;
    document.getElementById('kpi-ticket').innerText = formatter.format(ticketMedio);

    // Agrupamentos
    const agrupadoFamilia = groupBySum(data, 'Familia', 'Valor');
    agrupadoFamilia.sort((a,b) => b.valor - a.valor);
    const agClientes = groupBySum(data, 'Cliente', 'Valor').sort((a,b) => b.valor - a.valor);
    const agServicos = groupBySum(data, 'Produto', 'Valor').sort((a,b) => b.valor - a.valor);
    
    if(agrupadoFamilia.length > 0) {
        document.getElementById('kpi-familia').innerText = agrupadoFamilia[0].chave;
    }

    // Listas Top 10/15 com Totalizadores Agregados
    renderList('top-clientes', agClientes, 'cliente', 'clientes');
    renderList('top-servicos', agServicos, 'produto/serviço', 'produtos/serviços');

    // Gráficos
    renderChartMensal(data);
    
    renderMatrix();
    renderMatrixFamilias();
}

function renderMatrixFamilias() {
    const fHeaderMonths = document.getElementById('family-matrix-header-months');
    const fHeaderMetrics = document.getElementById('family-matrix-header-metrics');
    const tbody = document.getElementById('family-matrix-body');
    const tfoot = document.getElementById('family-matrix-foot');
    if (!tbody || globalData.length === 0) return;

    const selectAnoObj = document.getElementById('filter-ano');
    const fAno = selectAnoObj ? selectAnoObj.value : "ALL";
    const anoAtualStr = fAno !== "ALL" ? fAno : "2026";
    const fCentro = window.getCheckedCentros();
    const fUf = document.getElementById('filter-uf').value;

    let checkedMeses = Array.from(document.querySelectorAll('.mes-checkbox:checked'))
                            .map(cb => cb.value);
    
    const mesesOrdem = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    checkedMeses.sort((a,b) => mesesOrdem.indexOf(a) - mesesOrdem.indexOf(b));

    if (checkedMeses.length === 0) {
        if(fHeaderMonths) fHeaderMonths.innerHTML = '<th rowspan="2" style="background-color: #808080; min-width: 250px; text-align: left; padding: 6px; border: 1px solid white;">Famílias</th>';
        if(fHeaderMetrics) fHeaderMetrics.innerHTML = '';
        tbody.innerHTML = '<tr><td colspan="5" class="placeholder-text">Selecione ao menos um mês.</td></tr>';
        return;
    }

    const getBaseForYear = (yr) => globalData.filter(d => {
        if (d.Ano !== yr) return false;
        if (fCentro !== "ALL" && Array.isArray(fCentro) && !fCentro.includes(d.Centro)) return false;
        if (fUf !== "ALL" && d.UF !== fUf) return false;
        if (d.Cliente === 'NÃO IDENTIFICADO' || d.Cliente === 'ND') return false;
        return true;
    });
    const currData = getBaseForYear(anoAtualStr);

    const getMetasForYear = (yr) => globalMetas.filter(m => {
        if (m.Ano !== yr) return false;
        if (fCentro !== "ALL" && Array.isArray(fCentro) && !fCentro.includes(m.Centro)) return false;
        return true;
    });
    const currMetas = getMetasForYear(anoAtualStr);
    
    let trMText = `<th rowspan="2" style="background-color: #A6A6A6; color: black; min-width: 250px; text-align: left; padding: 6px; border: 1px solid white;">Famílias</th>`;
    let trMetricsText = '';

    checkedMeses.forEach(m => {
        trMText += `<th colspan="4" style="text-align: center; border: 1px solid white; padding: 4px; background-color: #A6A6A6; color: black;">${m}</th>`;
        trMetricsText += `
            <th style="padding: 4px; border: 1px solid white; background-color: #D9D9D9; color: black;">Faturado (R$)</th>
            <th style="padding: 4px; border: 1px solid white; background-color: #D9D9D9; color: black;">Previsto (#)</th>
            <th style="padding: 4px; border: 1px solid white; background-color: #D9D9D9; color: black;">Realizado (#)</th>
            <th style="padding: 4px; border: 1px solid white; background-color: #D9D9D9; color: black;">%</th>
        `;
    });
    
    trMText += `<th colspan="4" style="text-align: center; border: 1px solid white; padding: 4px; background-color: #A6A6A6; color: black;">Acumulado</th>`;
    trMetricsText += `
        <th style="padding: 4px; border: 1px solid white; background-color: #D9D9D9; color: black;">Faturado (R$)</th>
        <th style="padding: 4px; border: 1px solid white; background-color: #D9D9D9; color: black;">Previsto (#)</th>
        <th style="padding: 4px; border: 1px solid white; background-color: #D9D9D9; color: black;">Realizado (#)</th>
        <th style="padding: 4px; border: 1px solid white; background-color: #D9D9D9; color: black;">%</th>
    `;

    fHeaderMonths.innerHTML = trMText;
    fHeaderMetrics.innerHTML = trMetricsText;

    const setFam = new Set();
    currData.forEach(d => { if(d.Familia && d.Familia !== 'NÃO IDENTIFICADO') setFam.add(d.Familia.toUpperCase()); });
    currMetas.forEach(m => { if(m.Familia && m.Familia !== 'NÃO IDENTIFICADO') setFam.add(m.Familia.toUpperCase()); });
    const familiasList = Array.from(setFam).sort();

    const fmtFat = v => v === 0 ? "0,00" : v.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
    const fmtQtd = v => v === 0 ? "0" : v.toLocaleString('pt-BR');
    
    // Tratativa elegante para casos de divisão por zero (Demandas sem Meta)
    const calcVarMes = (real, prev) => {
        if (prev === 0) return real === 0 ? "-" : "Extra";
        return (((real/prev)-1)*100).toFixed(2)+"%";
    };
    
    const calcAtingAcum = (real, prev) => {
        if (prev === 0) return real === 0 ? "-" : "Extra";
        return ((real/prev)*100).toFixed(2)+"%";
    };

    const totMes = Array(checkedMeses.length).fill(null).map(()=>({ fat:0, prev:0, real:0 }));
    let totAcumFat = 0, totAcumPrev = 0, totAcumReal = 0;

    let tbodyHTML = '';
    familiasList.forEach(fam => {
        let trHTML = `<td style="text-align: left; padding: 6px; font-weight: 500; background-color: #E9EBF5;">${fam}</td>`;
        
        let rowAcumFat = 0, rowAcumPrev = 0, rowAcumReal = 0;

        for(let i=0; i<checkedMeses.length; i++) {
            const mesStr = checkedMeses[i];
            const dataMes = currData.filter(d => d.Familia && d.Familia.toUpperCase() === fam && d.Mes === mesStr);
            const metaMes = currMetas.filter(m => m.Familia && m.Familia.toUpperCase() === fam && m.Mes === mesStr);

            const fat = dataMes.reduce((a,b)=>a+b.Valor, 0);
            const real = dataMes.reduce((a,b)=>a+b.Quantidade, 0);
            const prev = metaMes.reduce((a,b)=>a+b.MetaQtd, 0);

            rowAcumFat += fat; rowAcumPrev += prev; rowAcumReal += real;
            totMes[i].fat += fat; totMes[i].prev += prev; totMes[i].real += real;
            
            const valRealStr = (fat > 0 || real > 0) ? fmtQtd(real) : ""; 

            trHTML += `
                <td style="padding: 4px; border: 1px solid rgba(0,0,0,0.1); background-color: #ffffff;">${fmtFat(fat)}</td>
                <td style="padding: 4px; border: 1px solid rgba(0,0,0,0.1); background-color: #ffffff;">${fmtQtd(prev)}</td>
                <td style="padding: 4px; border: 1px solid rgba(0,0,0,0.1); background-color: #ffffff;">${valRealStr}</td>
                <td style="padding: 4px; border: 1px solid rgba(0,0,0,0.1); background-color: #ffffff;">${calcVarMes(real, prev)}</td>
            `;
        }

        totAcumFat += rowAcumFat; totAcumPrev += rowAcumPrev; totAcumReal += rowAcumReal;
        trHTML += `
            <td style="padding: 4px; border: 1px solid rgba(0,0,0,0.1); background-color: #FFF2CC; color: #000;">${fmtFat(rowAcumFat)}</td>
            <td style="padding: 4px; border: 1px solid rgba(0,0,0,0.1); background-color: #FFF2CC; color: #000;">${fmtQtd(rowAcumPrev)}</td>
            <td style="padding: 4px; border: 1px solid rgba(0,0,0,0.1); background-color: #FFF2CC; color: #000;">${(rowAcumFat>0||rowAcumReal>0)?fmtQtd(rowAcumReal):"0"}</td>
            <td style="padding: 4px; border: 1px solid rgba(0,0,0,0.1); background-color: #FFF2CC; color: #000;">${calcAtingAcum(rowAcumReal, rowAcumPrev)}</td>
        `;

        tbodyHTML += `<tr style="border-bottom: 2px solid white;">${trHTML}</tr>`;
    });

    tbody.innerHTML = tbodyHTML;

    let tfootHTML = `<td style="text-align: left; padding: 6px;">Totais</td>`;
    for(let i=0; i<checkedMeses.length; i++) {
        let tfat = totMes[i].fat;
        let tprev = totMes[i].prev;
        let treal = totMes[i].real;
        tfootHTML += `
            <td style="padding: 4px; border: 1px solid rgba(0,0,0,0.2);">${fmtFat(tfat)}</td>
            <td style="padding: 4px; border: 1px solid rgba(0,0,0,0.2);">${fmtQtd(tprev)}</td>
            <td style="padding: 4px; border: 1px solid rgba(0,0,0,0.2);">${(tfat>0||treal>0)?fmtQtd(treal):"0"}</td>
            <td style="padding: 4px; border: 1px solid rgba(0,0,0,0.2);">${calcAtingAcum(treal, tprev)}</td>
        `;
    }
    tfootHTML += `
        <td style="padding: 4px; border: 1px solid #c7a42c; background-color: #FFE699;">${fmtFat(totAcumFat)}</td>
        <td style="padding: 4px; border: 1px solid #c7a42c; background-color: #FFE699;">${fmtQtd(totAcumPrev)}</td>
        <td style="padding: 4px; border: 1px solid #c7a42c; background-color: #FFE699;">${(totAcumFat>0||totAcumReal>0)?fmtQtd(totAcumReal):"0"}</td>
        <td style="padding: 4px; border: 1px solid #c7a42c; background-color: #FFE699;">${calcAtingAcum(totAcumReal, totAcumPrev)}</td>
    `;
    tfoot.innerHTML = `<tr>${tfootHTML}</tr>`;
}

function renderMatrix() {
    const theadTr = document.getElementById('matrix-header');
    const tbody = document.getElementById('matrix-body');
    if (!tbody || !theadTr || globalData.length === 0) return;

    const selectAnoObj = document.getElementById('filter-ano');
    const fAno = selectAnoObj ? selectAnoObj.value : "ALL";
    const anoAtualStr = fAno !== "ALL" ? fAno : "2026";
    const anoAntStr = (fAno !== "ALL" && !isNaN(parseInt(fAno))) ? String(parseInt(fAno) - 1) : "Anterior";
    
    const fCentro = window.getCheckedCentros();
    const fUf = document.getElementById('filter-uf').value;
    
    // Ler os meses correntes marcados na sidebar!
    let checkedMeses = Array.from(document.querySelectorAll('.mes-checkbox:checked'))
                            .map(cb => cb.value);
    
    const mesesOrdem = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    checkedMeses.sort((a,b) => mesesOrdem.indexOf(a) - mesesOrdem.indexOf(b));
    
    if (checkedMeses.length === 0) {
       theadTr.innerHTML = '<th style="background-color: #808080; padding: 6px 10px;">Referência</th>';
       tbody.innerHTML = '<tr><td colspan="14" class="placeholder-text">Selecione ao menos um mês para visualizar os dados.</td></tr>';
       return;
    }

    // Builder Headers (Dynamic)
    let theadHTML = `<th style="background-color: #808080; padding: 6px 10px;">Referência</th>`;
    checkedMeses.forEach(m => {
        theadHTML += `<th style="text-align: right; padding: 6px 10px;">${m}</th>`;
    });
    theadHTML += `<th style="text-align: right; background-color: #595959; padding: 6px 10px;">Total</th>`;
    theadTr.innerHTML = theadHTML;

    const getBaseForYear = (yr) => globalData.filter(d => {
        if (d.Ano !== yr) return false;
        if (fCentro !== "ALL" && Array.isArray(fCentro) && !fCentro.includes(d.Centro)) return false;
        if (fUf !== "ALL" && d.UF !== fUf) return false;
        if (d.Cliente === 'NÃO IDENTIFICADO' || d.Cliente === 'ND') return false;
        return true;
    });

    const currData = getBaseForYear(anoAtualStr);
    
    // Ler os dados do ano ANTERIOR (histórico)
    const prevData = getBaseForYear(anoAntStr);

    // Ler as metas do ano atual
    const getMetasForYear = (yr) => globalMetas.filter(m => {
        if (m.Ano !== yr) return false;
        if (fCentro !== "ALL" && Array.isArray(fCentro) && !fCentro.includes(m.Centro)) return false;
        return true;
    });
    const currMetas = getMetasForYear(anoAtualStr);
    
    let rCurrFat = Array(checkedMeses.length).fill(0);
    let rCurrQtd = Array(checkedMeses.length).fill(0);
    let rPrevFat = Array(checkedMeses.length).fill(0);
    let rMetaFat = Array(checkedMeses.length).fill(0);
    let rMetaQtd = Array(checkedMeses.length).fill(0);
    
    currData.forEach(d => {
        let idx = checkedMeses.indexOf(d.Mes);
        if(idx>=0) { rCurrFat[idx] += d.Valor; rCurrQtd[idx] += d.Quantidade; }
    });
    prevData.forEach(d => {
        let idx = checkedMeses.indexOf(d.Mes);
        if(idx>=0) { rPrevFat[idx] += d.Valor; }
    });
    currMetas.forEach(m => {
         let idx = checkedMeses.indexOf(m.Mes);
         if(idx>=0) { rMetaFat[idx] += m.MetaValor; rMetaQtd[idx] += m.MetaQtd; }
    });
    
    const fmt = val => val === 0 ? "-" : val.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    const sum = arr => arr.reduce((a,b)=>a+b,0);
    
    let tr1 = `<tr style="background-color: #DDEBF7; border-bottom: 2px solid white;">
        <td style="background-color: #BDD7EE; padding: 6px;">Faturado ${anoAtualStr}</td>`;
    rCurrFat.forEach(v => tr1 += `<td style="text-align: right; padding: 6px;">${fmt(v)}</td>`);
    tr1 += `<td style="text-align: right; background-color: #BDD7EE; font-weight: 600; padding: 6px;">${fmt(sum(rCurrFat))}</td></tr>`;
    
    let tr2 = `<tr style="background-color: #FCE4D6; border-bottom: 2px solid white;">
        <td style="background-color: #F8CBAD; padding: 6px;">Meta ${anoAtualStr}</td>`;
    rMetaFat.forEach(v => tr2 += `<td style="text-align: right; padding: 6px;">${fmt(v)}</td>`);
    tr2 += `<td style="text-align: right; background-color: #F8CBAD; font-weight: 600; padding: 6px;">${fmt(sum(rMetaFat))}</td></tr>`;

    let tr3 = `<tr style="background-color: #FFF2CC; border-bottom: 2px solid white;">
        <td style="background-color: #FFE699; padding: 6px;">Faturado ${anoAntStr}</td>`;
    rPrevFat.forEach(v => tr3 += `<td style="text-align: right; padding: 6px;">${fmt(v)}</td>`);
    tr3 += `<td style="text-align: right; background-color: #FFE699; font-weight: 600; padding: 6px;">${fmt(sum(rPrevFat))}</td></tr>`;

    let tr4 = `<tr style="background-color: #E2EFDA; border-bottom: 2px solid white;">
        <td style="background-color: #C6E0B4; padding: 6px;">Serv (Exec-Plan)</td>`;
    for(let i=0; i<checkedMeses.length; i++) {
        let exec = Math.round(rCurrQtd[i]);
        let pl = Math.round(rMetaQtd[i]);
        let txt = (exec===0 && pl===0) ? "-" : `${exec} - ${pl}`;
        tr4 += `<td style="text-align: center; padding: 6px;">${txt}</td>`;
    }
    let totalExec = sum(rCurrQtd);
    let totalPl = sum(rMetaQtd);
    tr4 += `<td style="text-align: center; background-color: #C6E0B4; font-weight: 600; padding: 6px;">${Math.round(totalExec)} - ${Math.round(totalPl)}</td></tr>`;
    
    tbody.innerHTML = tr1 + tr2 + tr3 + tr4;
}

function groupBySum(arr, key, sumKey) {
    const map = {};
    arr.forEach(item => {
        if(!map[item[key]]) map[item[key]] = 0;
        map[item[key]] += item[sumKey];
    });
    return Object.keys(map).map(k => ({ chave: k, valor: map[k] }));
}

function renderList(elementId, allItems, nameSingular, namePlural) {
    const el = document.getElementById(elementId);
    el.innerHTML = '';
    
    if (allItems.length === 0) {
        el.innerHTML = `<tr><td colspan="2" class="placeholder-text">Sem dados para o filtro atual.</td></tr>`;
        return;
    }

    // Pega apenas o limite que estipulamos (15)
    const items = allItems.slice(0, 15);
    let topTotal = 0;

    items.forEach(it => {
        topTotal += it.valor;
        // Formatar texto limitando tamanho e botando os 3 pontinhos para nomes gigantes
        const shortName = it.chave.length > 50 ? it.chave.substring(0, 48) + "..." : it.chave;
        
        el.innerHTML += `<tr>
            <td title="${it.chave}">
                <div style="max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${shortName}
                </div>
            </td>
            <td class="right" style="font-weight: 600; width: 120px;">
                ${formatter.format(it.valor)}
            </td>
        </tr>`;
    });
    
    // Adiciona Linha Laranja (Total)
    el.innerHTML += `<tr class="row-total">
        <td>Total</td>
        <td class="right">${formatter.format(topTotal)}</td>
    </tr>`;

    // Adiciona Linha de Restante Agrupado se houver mais de 15
    const remainingCount = allItems.length - items.length;
    if (remainingCount > 0) {
        const remainingSum = allItems.slice(15).reduce((acc, curr) => acc + curr.valor, 0);
        const nameText = remainingCount === 1 ? nameSingular : namePlural;
        
        el.innerHTML += `<tr class="row-remaining">
            <td colspan="2" style="font-size: 13px;">E mais ${remainingCount} ${nameText} somando ${formatter.format(remainingSum)}</td>
        </tr>`;
    }
}

// ------ APEX CHARTS RENDERERS ------

const chartTheme = {
    mode: 'light', 
    palette: 'palette1',
    background: 'transparent'
};

function renderChartMensal(data) {
    const mesesOrdem = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    
    const agrupado = {};
    data.forEach(d => {
        if(!agrupado[d.Mes]) agrupado[d.Mes] = { val: 0, qtd: 0 };
        agrupado[d.Mes].val += d.Valor;
        agrupado[d.Mes].qtd += d.Quantidade;
    });
    
    const agrupadoMeta = {};
    if(globalMetas.length > 0) {
        const metFiltradas = getFilteredMetas();
        metFiltradas.forEach(m => {
            if(!agrupadoMeta[m.Mes]) agrupadoMeta[m.Mes] = 0;
            agrupadoMeta[m.Mes] += m.MetaValor;
        });
    }

    // Ordenar pelos meses
    const categorias = [];
    const serieVal = [];
    const serieQtd = [];
    const serieMeta = [];
    
    mesesOrdem.forEach(m => {
        if(agrupado[m] || (globalMetas.length > 0 && agrupadoMeta[m])) {
            categorias.push(m);
            serieVal.push(agrupado[m] ? agrupado[m].val.toFixed(2) : 0);
            serieQtd.push(agrupado[m] ? agrupado[m].qtd : 0);
            if(globalMetas.length > 0) {
                serieMeta.push(agrupadoMeta[m] ? agrupadoMeta[m].toFixed(2) : 0);
            }
        }
    });

    let seriesConfig = [
        { name: 'Faturamento', type: 'column', data: serieVal },
        { name: 'Quantidade Real', type: 'line', data: serieQtd }
    ];
    let chartColors = ['#0033A0', '#00AD68']; // Tecpar Azul e Verde
    let chartStrokes = [0, 3];
    let chartDashes = [0, 0];

    // Se temos metas e array tem mais q zero, injeta a linha da meta na frent
    if (globalMetas.length > 0) {
        seriesConfig.unshift({ name: 'Meta Planejada (R$)', type: 'line', data: serieMeta });
        chartColors = ['#FFC000', '#0033A0', '#00AD68']; // Amarelo, Azul, Verde
        chartStrokes = [3, 0, 3];
        chartDashes = [5, 0, 0]; // Meta linha tracejada para destacar
    }

    const options = {
        series: seriesConfig,
        chart: { height: 280, type: 'line', theme: chartTheme, toolbar: { show: false }, fontFamily: 'Roboto, sans-serif' },
        stroke: { width: chartStrokes, dashArray: chartDashes },
        colors: chartColors,
        dataLabels: { enabled: false },
        xaxis: { categories: categorias },
        yaxis: [
            { min: 0, title: { text: 'R$' }, labels: { formatter: val => 'R$ ' + (val/1000).toFixed(0) + 'k' } },
            { title: { text: 'Faturamento' }, show: false }, // Placeholder espelhado se tiver 3 series
            { min: 0, opposite: true, title: { text: 'Quantidade' } }
        ],
        grid: { borderColor: '#edebe9' }
    };
    
    if (globalMetas.length === 0) {
       options.yaxis.splice(1, 1); // remove o dummy eixo
    }

    if(charts['mensal']) charts['mensal'].destroy();
    charts['mensal'] = new ApexCharts(document.querySelector("#chart-mensal"), options);
    charts['mensal'].render();
}

function renderChartFamilia(dataArr) {
    const options = {
        series: dataArr.map(d => d.valor),
        labels: dataArr.map(d => d.chave),
        chart: { type: 'donut', height: 280, fontFamily: 'Roboto, sans-serif' },
        colors: ['#0033A0', '#00AD68', '#E66C37', '#FFC000', '#002575', '#007a4a', '#8fb0d9', '#82e2b3', '#cbd9eb'],
        stroke: { show: true, colors: '#fff' },
        dataLabels: { enabled: false },
        legend: { position: 'right', fontSize: '12px' },
        tooltip: {
            y: { formatter: function(val) { return formatter.format(val); } }
        }
    };

    if(charts['familias']) charts['familias'].destroy();
    charts['familias'] = new ApexCharts(document.querySelector("#chart-familias"), options);
    charts['familias'].render();
}
