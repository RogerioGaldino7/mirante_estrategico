// =============================================================================
// brazil-map.js — Mapa SVG interativo do Brasil com estados clicáveis
// =============================================================================
// Depende de: state.js (formatter), clients.js (integração)
// Renderiza um mapa coroplético do Brasil colorido por faturamento/clientes
// =============================================================================

/**
 * Paths SVG simplificados dos estados brasileiros.
 * Coordenadas no sistema viewBox 0 0 800 760
 */
const BR_STATES = {
    AC: { name: "Acre", path: "M48,340 L95,330 L105,355 L85,375 L45,370 Z" },
    AM: { name: "Amazonas", path: "M95,200 L260,185 L280,215 L290,270 L260,310 L200,330 L105,340 L95,330 L75,280 L80,230 Z" },
    AP: { name: "Amapá", path: "M330,130 L370,110 L385,140 L375,180 L345,185 L325,165 Z" },
    PA: { name: "Pará", path: "M260,185 L345,185 L375,180 L420,195 L450,230 L430,270 L390,290 L350,310 L290,310 L290,270 L280,215 Z" },
    MA: { name: "Maranhão", path: "M430,270 L470,240 L490,260 L490,310 L460,330 L430,320 L390,310 L390,290 Z" },
    PI: { name: "Piauí", path: "M490,260 L520,255 L530,295 L520,340 L490,345 L470,330 L460,330 L490,310 Z" },
    CE: { name: "Ceará", path: "M520,255 L560,240 L580,260 L565,295 L530,295 Z" },
    RN: { name: "Rio Grande do Norte", path: "M565,260 L595,250 L600,270 L580,280 L565,280 Z" },
    PB: { name: "Paraíba", path: "M565,280 L600,275 L605,295 L570,298 Z" },
    PE: { name: "Pernambuco", path: "M530,298 L570,298 L605,295 L610,315 L555,322 L530,320 Z" },
    AL: { name: "Alagoas", path: "M570,322 L600,318 L605,335 L580,338 Z" },
    SE: { name: "Sergipe", path: "M565,338 L585,340 L585,355 L565,352 Z" },
    BA: { name: "Bahia", path: "M430,320 L490,345 L530,340 L555,322 L570,338 L565,355 L550,395 L520,440 L470,445 L440,420 L420,370 Z" },
    TO: { name: "Tocantins", path: "M390,290 L430,320 L420,370 L395,395 L365,380 L350,340 L350,310 Z" },
    GO: { name: "Goiás", path: "M365,380 L395,395 L420,430 L415,465 L390,480 L365,460 L345,430 L340,400 Z" },
    DF: { name: "Distrito Federal", path: "M407,430 L420,430 L420,445 L407,445 Z" },
    MT: { name: "Mato Grosso", path: "M200,330 L260,310 L290,310 L350,310 L350,340 L365,380 L340,400 L310,420 L250,410 L210,380 L190,355 Z" },
    MS: { name: "Mato Grosso do Sul", path: "M310,420 L340,400 L345,430 L365,460 L355,500 L325,520 L290,510 L275,475 L280,440 Z" },
    MG: { name: "Minas Gerais", path: "M420,370 L440,420 L470,445 L520,440 L535,470 L530,510 L495,520 L460,505 L430,490 L390,480 L415,465 L420,430 Z" },
    ES: { name: "Espírito Santo", path: "M535,470 L555,460 L560,490 L545,510 L530,510 Z" },
    RJ: { name: "Rio de Janeiro", path: "M495,520 L530,510 L545,510 L550,525 L525,540 L500,535 Z" },
    SP: { name: "São Paulo", path: "M390,480 L430,490 L460,505 L495,520 L500,535 L480,555 L440,560 L400,540 L370,510 L355,500 Z" },
    PR: { name: "Paraná", path: "M355,500 L370,510 L400,540 L440,560 L435,585 L400,600 L360,590 L330,565 L325,530 Z" },
    SC: { name: "Santa Catarina", path: "M360,590 L400,600 L410,625 L395,645 L365,640 L350,620 Z" },
    RS: { name: "Rio Grande do Sul", path: "M350,620 L365,640 L395,645 L405,670 L395,710 L365,730 L330,720 L310,690 L315,650 L330,630 Z" },
    RO: { name: "Rondônia", path: "M165,340 L200,330 L210,380 L190,400 L155,395 L145,370 Z" },
    RR: { name: "Roraima", path: "M200,120 L240,110 L255,145 L250,180 L220,190 L195,170 Z" }
};

/**
 * Renderiza o mapa do Brasil como SVG dentro do elemento informado.
 * Colore os estados com base nos dados passados.
 *
 * @param {string} containerId - ID do elemento container
 * @param {Object} dataByUF - Objeto { UF: { valor, clientes, cidades } }
 * @param {string} metric - 'valor' | 'clientes' para definir a escala de cor
 */
function renderBrazilMap(containerId, dataByUF, metric) {
    const container = document.getElementById(containerId);
    if (!container) return;

    metric = metric || 'clientes';

    // Calcula escala de cores
    let maxVal = 0;
    Object.values(dataByUF).forEach(d => {
        const val = metric === 'clientes' ? d.clientes : d.valor;
        if (val > maxVal) maxVal = val;
    });

    // Cria SVG
    let svgContent = '';

    // Desenha cada estado
    Object.entries(BR_STATES).forEach(([uf, state]) => {
        const data = dataByUF[uf];
        let fill, stroke, opacity, cursor;

        if (data && (data.clientes > 0 || data.valor > 0)) {
            const val = metric === 'clientes' ? data.clientes : data.valor;
            const intensity = maxVal > 0 ? Math.pow(val / maxVal, 0.4) : 0; // Raiz para melhor distribuição
            // Gradiente de azul claro a azul Tecpar escuro
            const r = Math.round(200 - intensity * 200);
            const g = Math.round(220 - intensity * 169);
            const b = Math.round(255 - intensity * 95);
            fill = 'rgb(' + r + ',' + g + ',' + b + ')';
            stroke = '#0033A0';
            opacity = '1';
            cursor = 'pointer';
        } else {
            fill = '#e8ecf0';
            stroke = '#c0c8d0';
            opacity = '0.7';
            cursor = 'default';
        }

        const tooltipVal = data ? (metric === 'clientes' ?
            data.clientes + ' clientes | ' + formatter.format(data.valor) :
            formatter.format(data.valor) + ' | ' + data.clientes + ' clientes') : 'Sem dados';
        const cidadesText = data && data.cidades ? data.cidades + ' cidades' : '';

        svgContent += '<g class="br-state" data-uf="' + uf + '" style="cursor:' + cursor + ';">' +
            '<path d="' + state.path + '" ' +
            'fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.5" opacity="' + opacity + '" ' +
            'style="transition: all 0.3s ease;"' +
            '/>' +
            '<title>' + state.name + ' (' + uf + ')\n' + tooltipVal + (cidadesText ? '\n' + cidadesText : '') + '</title>' +
            '</g>';
    });

    // Labels dos estados com dados
    Object.entries(BR_STATES).forEach(([uf, state]) => {
        const data = dataByUF[uf];
        if (!data || (data.clientes === 0 && data.valor === 0)) return;

        // Calcula centro aproximado do path
        const coords = state.path.match(/\d+/g).map(Number);
        let cx = 0, cy = 0, count = 0;
        for (let i = 0; i < coords.length; i += 2) {
            cx += coords[i];
            cy += coords[i + 1];
            count++;
        }
        cx = Math.round(cx / count);
        cy = Math.round(cy / count);

        const val = metric === 'clientes' ? data.clientes : data.valor;
        const label = metric === 'clientes' ? val.toString() : (val >= 1000000 ? (val / 1000000).toFixed(1) + 'M' : (val / 1000).toFixed(0) + 'K');
        const fontSize = uf === 'DF' || uf === 'SE' || uf === 'AL' ? '8' : '10';
        const intensity = maxVal > 0 ? Math.pow(val / maxVal, 0.4) : 0;
        const textColor = intensity > 0.45 ? '#ffffff' : '#1e293b';

        svgContent += '<text x="' + cx + '" y="' + (cy - 5) + '" text-anchor="middle" ' +
            'font-family="Montserrat, sans-serif" font-size="' + fontSize + '" font-weight="700" ' +
            'fill="' + textColor + '" pointer-events="none">' + uf + '</text>';
        svgContent += '<text x="' + cx + '" y="' + (cy + 8) + '" text-anchor="middle" ' +
            'font-family="Roboto, sans-serif" font-size="9" font-weight="500" ' +
            'fill="' + textColor + '" pointer-events="none">' + label + '</text>';
    });

    // Monta a legenda
    const legendSteps = 5;
    let legendHTML = '<div style="display:flex; align-items:center; gap:4px; margin-top:8px; justify-content:center;">';
    legendHTML += '<span style="font-size:10px; color:#666;">0</span>';
    for (let i = 0; i < legendSteps; i++) {
        const intensity = (i + 1) / legendSteps;
        const r = Math.round(200 - Math.pow(intensity, 0.4) * 200);
        const g = Math.round(220 - Math.pow(intensity, 0.4) * 169);
        const b = Math.round(255 - Math.pow(intensity, 0.4) * 95);
        legendHTML += '<div style="width:30px; height:12px; background:rgb(' + r + ',' + g + ',' + b + '); border-radius:2px;"></div>';
    }
    const maxLabel = metric === 'clientes' ? maxVal : (maxVal >= 1000000 ? (maxVal / 1000000).toFixed(1) + 'M' : formatter.format(maxVal));
    legendHTML += '<span style="font-size:10px; color:#666;">' + maxLabel + '</span></div>';

    // Toggle buttons
    const toggleHTML = '<div style="display:flex; gap:6px; justify-content:center; margin-bottom:8px;">' +
        '<button class="map-toggle-btn' + (metric === 'clientes' ? ' active' : '') + '" onclick="toggleMapMetric(\'clientes\')" ' +
        'style="font-family:Roboto; font-size:11px; padding:4px 12px; border:1px solid #0033A0; border-radius:4px; cursor:pointer; ' +
        (metric === 'clientes' ? 'background:#0033A0; color:#fff;' : 'background:#fff; color:#0033A0;') + '">👥 Clientes</button>' +
        '<button class="map-toggle-btn' + (metric === 'valor' ? ' active' : '') + '" onclick="toggleMapMetric(\'valor\')" ' +
        'style="font-family:Roboto; font-size:11px; padding:4px 12px; border:1px solid #00AD68; border-radius:4px; cursor:pointer; ' +
        (metric === 'valor' ? 'background:#00AD68; color:#fff;' : 'background:#fff; color:#00AD68;') + '">💰 Faturamento</button>' +
        '</div>';

    container.innerHTML = toggleHTML +
        '<svg viewBox="30 100 600 660" xmlns="http://www.w3.org/2000/svg" ' +
        'style="width:100%; max-height:480px; display:block; margin:0 auto;">' +
        '<style>' +
        '.br-state:hover path { filter: brightness(1.15); stroke-width: 2.5; }' +
        '.br-state:hover { filter: drop-shadow(0 2px 6px rgba(0,51,160,0.3)); }' +
        '</style>' +
        svgContent +
        '</svg>' +
        legendHTML;
}

// Variável para controlar a métrica atual do mapa
let _currentMapMetric = 'clientes';

/**
 * Alterna a métrica exibida no mapa (clientes vs faturamento).
 */
function toggleMapMetric(metric) {
    _currentMapMetric = metric;
    // Recarrega os dados e re-renderiza
    const data = typeof getFilteredData === 'function' ? getFilteredData() : globalData;
    if (!data || data.length === 0) return;

    const dataByUF = _buildMapData(data);
    renderBrazilMap('cli-chart-mapa', dataByUF, metric);
}

/**
 * Constrói o objeto de dados por UF para o mapa.
 */
function _buildMapData(data) {
    const dataByUF = {};
    data.forEach(d => {
        if (!d.UF || d.UF === 'ND') return;
        if (!dataByUF[d.UF]) dataByUF[d.UF] = { valor: 0, clientes: new Set(), cidades: new Set() };
        dataByUF[d.UF].valor += d.Valor;
        if (d.Cliente && d.Cliente !== 'NÃO IDENTIFICADO') dataByUF[d.UF].clientes.add(d.Cliente);
        if (d.Cidade && d.Cidade !== 'NÃO DEFINIDO') dataByUF[d.UF].cidades.add(d.Cidade);
    });

    // Converte Sets para contagem
    const result = {};
    Object.entries(dataByUF).forEach(([uf, d]) => {
        result[uf] = { valor: d.valor, clientes: d.clientes.size, cidades: d.cidades.size };
    });
    return result;
}
