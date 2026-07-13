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

    let maxVal = 0;
    let maxAltVal = 0;

    Object.values(dataByUF).forEach(d => {
        const val = metric === 'clientes' ? d.clientes : d.valor;
        const alt = metric === 'clientes' ? d.valor : d.clientes;
        if (val > maxVal) maxVal = val;
        if (alt > maxAltVal) maxAltVal = alt;
    });

    let svgContent = '';
    let bubblesContent = '';

    Object.entries(BR_STATES).forEach(([uf, state]) => {
        const data = dataByUF[uf];
        let fill, stroke, opacity, cursor;

        const valClientes = data ? data.clientes : 0;
        const valValor = data ? data.valor : 0;
        const valCidades = data ? data.cidades : 0;

        if (valClientes > 0 || valValor > 0) {
            const val = metric === 'clientes' ? valClientes : valValor;
            const intensity = maxVal > 0 ? Math.pow(val / maxVal, 0.4) : 0;
            const r = Math.round(200 - intensity * 200);
            const g = Math.round(220 - intensity * 169);
            const b = Math.round(255 - intensity * 95);
            fill = `rgb(${r},${g},${b})`;
            stroke = '#0033A0';
            opacity = '1';
            cursor = 'pointer';
        } else {
            fill = '#e8ecf0';
            stroke = '#c0c8d0';
            opacity = '0.7';
            cursor = 'default';
        }

        const evt = `onmousemove="showMapTooltip(event, '${state.name}', '${uf}', ${valClientes}, ${valValor}, ${valCidades})" onmouseleave="hideMapTooltip()"`;

        svgContent += `<g class="br-state" data-uf="${uf}" style="cursor:${cursor};" ${evt}>
            <path d="${state.path}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" opacity="${opacity}" style="transition: fill 0.4s ease, stroke-width 0.2s;" />
        </g>`;

        if (data && (valClientes > 0 || valValor > 0)) {
            const coords = state.path.match(/-?\d+(?:\.\d+)?/g).map(Number);
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (let i = 0; i < coords.length; i += 2) { 
                if (coords[i] < minX) minX = coords[i];
                if (coords[i] > maxX) maxX = coords[i];
                if (coords[i + 1] < minY) minY = coords[i + 1];
                if (coords[i + 1] > maxY) maxY = coords[i + 1];
            }
            let cx = (minX + maxX) / 2;
            let cy = (minY + maxY) / 2;

            const altVal = metric === 'clientes' ? valValor : valClientes;
            const radius = maxAltVal > 0 ? Math.max(3, Math.sqrt(altVal / maxAltVal) * 20) : 0;

            const bubbleColor = metric === 'clientes' ? '#00AD68' : '#0033A0';
            
            if (radius > 0) {
                bubblesContent += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${bubbleColor}" opacity="0.65" stroke="#fff" stroke-width="1" pointer-events="none" style="transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);" />`;
            }

            const label = metric === 'clientes' ? valClientes.toString() : (valValor >= 1000000 ? (valValor / 1000000).toFixed(1) + 'M' : (valValor / 1000).toFixed(0) + 'K');
            const fontSize = uf === 'DF' || uf === 'SE' || uf === 'AL' ? '8' : '10';
            const intensity = maxVal > 0 ? Math.pow((metric === 'clientes' ? valClientes : valValor) / maxVal, 0.4) : 0;
            const textColor = intensity > 0.45 ? '#ffffff' : '#1e293b';

            bubblesContent += `<text x="${cx}" y="${cy - radius - 2}" text-anchor="middle" font-family="Montserrat, sans-serif" font-size="${fontSize}" font-weight="700" fill="${textColor}" pointer-events="none">${uf}</text>`;
            bubblesContent += `<text x="${cx}" y="${cy + radius + 8}" text-anchor="middle" font-family="Roboto, sans-serif" font-size="9" font-weight="500" fill="${textColor}" pointer-events="none">${label}</text>`;
        }
    });

    const legendSteps = 5;
    let legendHTML = '<div style="display:flex; flex-direction:column; align-items:center; margin-top:8px;">';
    legendHTML += `<div style="font-size:10px; font-weight:600; color:#333; margin-bottom:4px;">Cor do Estado: ${metric === 'clientes' ? 'Clientes' : 'Faturamento'} | Tamanho da Bolha: ${metric === 'clientes' ? 'Faturamento' : 'Clientes'}</div>`;
    legendHTML += '<div style="display:flex; align-items:center; gap:4px; justify-content:center;">';
    legendHTML += '<span style="font-size:10px; color:#666;">0</span>';
    for (let i = 0; i < legendSteps; i++) {
        const intensity = (i + 1) / legendSteps;
        const r = Math.round(200 - Math.pow(intensity, 0.4) * 200);
        const g = Math.round(220 - Math.pow(intensity, 0.4) * 169);
        const b = Math.round(255 - Math.pow(intensity, 0.4) * 95);
        legendHTML += `<div style="width:30px; height:12px; background:rgb(${r},${g},${b}); border-radius:2px;"></div>`;
    }
    const maxLabel = metric === 'clientes' ? maxVal : (maxVal >= 1000000 ? (maxVal / 1000000).toFixed(1) + 'M' : formatter.format(maxVal));
    legendHTML += `<span style="font-size:10px; color:#666;">${maxLabel}</span></div></div>`;

    const toggleHTML = `<div style="display:flex; gap:6px; justify-content:center; margin-bottom:8px;">
        <button class="map-toggle-btn${metric === 'clientes' ? ' active' : ''}" onclick="toggleMapMetric('clientes')" 
        style="font-family:Roboto; font-size:11px; padding:4px 12px; border:1px solid #0033A0; border-radius:4px; cursor:pointer; transition: 0.3s;
        ${metric === 'clientes' ? 'background:#0033A0; color:#fff;' : 'background:#fff; color:#0033A0;'}">👥 Clientes</button>
        <button class="map-toggle-btn${metric === 'valor' ? ' active' : ''}" onclick="toggleMapMetric('valor')" 
        style="font-family:Roboto; font-size:11px; padding:4px 12px; border:1px solid #00AD68; border-radius:4px; cursor:pointer; transition: 0.3s;
        ${metric === 'valor' ? 'background:#00AD68; color:#fff;' : 'background:#fff; color:#00AD68;'}">💰 Faturamento</button>
        </div>`;

    container.innerHTML = toggleHTML +
        `<svg viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg" style="width:100%; max-height:480px; display:block; margin:0 auto;">
        <style>
        .br-state:hover path { filter: brightness(1.1); stroke-width: 2.5; }
        </style>
        ${svgContent}
        ${bubblesContent}
        </svg>
        ${legendHTML}`;
}

// -----------------------------------------------------------------------------
// Tooltip Glassmorphism
// -----------------------------------------------------------------------------
function showMapTooltip(e, name, uf, clientes, valor, cidades) {
    let tooltip = document.getElementById('map-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'map-tooltip';
        document.body.appendChild(tooltip);
    }
    
    let fmtValor = valor ? formatter.format(valor) : 'R$ 0,00';
    
    tooltip.innerHTML = `
        <h4>${name} (${uf})</h4>
        <p><span class="lbl">Faturamento:</span> <span class="val" style="color:#38bdf8;">${fmtValor}</span></p>
        <p><span class="lbl">Clientes Ativos:</span> <span class="val">${clientes}</span></p>
        <p><span class="lbl">Cidades Atendidas:</span> <span class="val">${cidades}</span></p>
    `;
    
    tooltip.style.display = 'block';
    setTimeout(() => tooltip.classList.add('visible'), 10);

    const x = e.clientX;
    const y = e.clientY;
    
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
}

function hideMapTooltip() {
    const tooltip = document.getElementById('map-tooltip');
    if (tooltip) {
        tooltip.classList.remove('visible');
        setTimeout(() => tooltip.style.display = 'none', 200);
    }
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
