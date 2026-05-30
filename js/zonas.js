// ===== Modulo: Seguimiento por Zona =====
let gaugeCharts = [];

// Mapeo de KPIs de metas -> columnas del Excel de actividad
const KPI_MAP_SEG = {
    'Consec.': 'Consec.',
    '% Consec.': '% Consec.',
    'Nuevas': 'Nuevas',
    'Estencil Pas': 'Estencil',
    'Crecimiento': 'Cmto.',
    'PPDD': 'PPDD',
    'Recuperada': 'Recuperadas',
    'Reingresos': 'Reingresos',
    'Vr. Venta': 'Vr. Venta',
    'VOP': 'V.O.P'
};

function getSegZona(r) {
    return r['CZ-Zona'] || r.Zona || r.zona || '';
}

function getSegCampana(r) {
    return r.campanaAsignada || r['Campaña'] || r['Campana'] || r.campana || '';
}

const normalize = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

// Sumar todas las filas de la ultima carga para una zona
function sumarActividadZona(seguimiento, col) {
    if (seguimiento.length === 0) return 0;
    // Obtener la fecha de la ultima carga
    const fechas = seguimiento.map(r => r.fechaCarga || '').sort();
    const ultimaFecha = fechas[fechas.length - 1];
    // Sumar todas las filas de esa fecha
    return seguimiento
        .filter(r => (r.fechaCarga || '') === ultimaFecha)
        .reduce((sum, r) => sum + (parseFloat(r[col]) || 0), 0);
}

// Promediar todas las filas de la ultima carga (para % Consec.)
function promediarActividadZona(seguimiento, col) {
    if (seguimiento.length === 0) return 0;
    const fechas = seguimiento.map(r => r.fechaCarga || '').sort();
    const ultimaFecha = fechas[fechas.length - 1];
    const filas = seguimiento.filter(r => (r.fechaCarga || '') === ultimaFecha);
    if (filas.length === 0) return 0;
    return filas.reduce((sum, r) => sum + (parseFloat(r[col]) || 0), 0) / filas.length;
}

document.addEventListener('DOMContentLoaded', () => {
    renderZonasGrid();
    document.getElementById('btnVolverZonas').addEventListener('click', volverAGrid);

    // Actualizar al cambiar campana/anio
    document.getElementById('zonaMetaCampana').addEventListener('change', () => {
        const zonaActual = document.getElementById('zonaDetalleTitle').textContent;
        if (zonaActual) mostrarDetalleZona(zonaActual);
    });
    document.getElementById('zonaMetaAnio').addEventListener('change', () => {
        const zonaActual = document.getElementById('zonaDetalleTitle').textContent;
        if (zonaActual) mostrarDetalleZona(zonaActual);
    });
});

function renderZonasGrid() {
    const grid = document.getElementById('zonasGrid');
    grid.innerHTML = APP.zonas.map(zona =>
        `<div class="zona-card" data-zona="${zona}">
            <i class="fas fa-map-marker-alt"></i>
            <span class="zona-name">${zona}</span>
        </div>`
    ).join('');

    grid.querySelectorAll('.zona-card').forEach(card => {
        card.addEventListener('click', () => {
            mostrarDetalleZona(card.dataset.zona);
        });
    });
}

function mostrarDetalleZona(zona) {
    document.getElementById('zonasGrid').style.display = 'none';
    document.getElementById('zonaDetalle').style.display = 'block';
    document.getElementById('zonaDetalleTitle').textContent = zona;

    const campana = document.getElementById('zonaMetaCampana').value;
    const anio = document.getElementById('zonaMetaAnio').value;
    const key = getMetaKey(campana, anio);

    // Meta por campana
    const metas = APP.data.metas[key] || [];
    const metaZona = metas.find(m => m.zona === zona) || {};

    // Seguimiento filtrado por zona Y campana (parcial, ej: "MADRES 2026" contiene "MADRES")
    const seguimiento = APP.data.seguimiento.filter(r =>
        normalize(getSegZona(r)) === normalize(zona) &&
        normalize(getSegCampana(r)).includes(normalize(campana))
    );

    // Tabla Meta vs Actividad vs Falta vs Cumplimiento
    renderMetaVsActividad(metaZona, seguimiento);

    // Grafico avance vs meta
    renderZonaChart(zona, metaZona, seguimiento);

    // Tabla seguimiento diario
    renderZonaSeguimiento(seguimiento);
}

function renderMetaVsActividad(meta, seguimiento) {
    const tbody = document.getElementById('bodyMetaVsActividad');
    const pctKpis = ['% Consec.'];
    const kpisZona = APP.kpis.filter(k => k !== 'Estencil Pas');

    console.log('=== META VS ACTIVIDAD ===');
    console.log('Meta zona:', meta);
    console.log('Total registros seguimiento filtrados:', seguimiento.length);

    tbody.innerHTML = kpisZona.map(kpi => {
        const isPct = pctKpis.includes(kpi);
        const metaVal = parseFloat(meta[kpi]) || 0;
        const col = KPI_MAP_SEG[kpi] || kpi;
        const actual = isPct ? promediarActividadZona(seguimiento, col) : sumarActividadZona(seguimiento, col);
        const falta = Math.max(metaVal - actual, 0);
        const pct = calcPct(actual, metaVal);
        const cls = semaforoCellClass(pct);

        return `<tr>
            <td><strong>${kpi}</strong></td>
            <td>${formatNumber(metaVal, isPct)}</td>
            <td>${formatNumber(actual, isPct)}</td>
            <td>${formatNumber(falta, isPct)}</td>
            <td class="${cls}">${pct}%</td>
        </tr>`;
    }).join('');
}

function renderZonaSeguimiento(data) {
    const head = document.getElementById('zonaSeguimientoHead');
    const body = document.getElementById('zonaSeguimientoBody');

    if (data.length === 0) {
        head.innerHTML = '';
        body.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:20px;color:#9e9e9e;">No hay datos de seguimiento para esta zona</td></tr>';
        return;
    }

    const showCols = ['fechaCarga', 'Campaña', 'Activas', 'Consec.', '% Consec.', 'Nuevas', 'Cmto.', 'Recuperadas', 'Reingresos', 'Vr. Venta', 'PPDD', 'V.O.P'];
    const availCols = showCols.filter(c => data[0].hasOwnProperty(c));

    head.innerHTML = '<tr>' + availCols.map(c => `<th>${c}</th>`).join('') + '</tr>';
    body.innerHTML = data.slice(-30).map(row =>
        '<tr>' + availCols.map(c => `<td>${row[c] != null ? row[c] : ''}</td>`).join('') + '</tr>'
    ).join('');
}

function renderZonaChart(zona, meta, seguimiento) {
    // Destruir gauges anteriores
    gaugeCharts.forEach(c => c.destroy());
    gaugeCharts = [];

    const container = document.getElementById('gaugesContainer');
    const gaugeKpis = [
        { kpi: 'Consec.', label: 'Consecutividad' },
        { kpi: 'Vr. Venta', label: 'Valor Venta' },
        { kpi: 'PPDD', label: 'PPDD' },
        { kpi: 'Crecimiento', label: 'Crecimiento' }
    ];

    // Crear HTML de los 4 gauges
    container.innerHTML = gaugeKpis.map((g, i) =>
        `<div class="gauge-card">
            <div class="gauge-title">${g.label}</div>
            <div class="gauge-canvas-wrap">
                <canvas id="gauge${i}"></canvas>
                <div class="gauge-center">
                    <div class="gauge-pct" id="gaugePct${i}"></div>
                    <div class="gauge-detail" id="gaugeDetail${i}"></div>
                </div>
            </div>
        </div>`
    ).join('');

    // Renderizar cada gauge
    gaugeKpis.forEach((g, i) => {
        const metaVal = parseFloat(meta[g.kpi]) || 0;
        const col = KPI_MAP_SEG[g.kpi] || g.kpi;
        const actual = sumarActividadZona(seguimiento, col);
        const pct = metaVal > 0 ? Math.min(Math.round((actual / metaVal) * 100), 120) : 0;
        const pctDisplay = metaVal > 0 ? Math.round((actual / metaVal) * 100) : 0;

        // Color segun cumplimiento
        let color;
        if (pctDisplay >= 90) color = '#2e7d32';
        else if (pctDisplay >= 60) color = '#f57f17';
        else color = '#c62828';

        // Valor del arco (sobre 100, max 120 para overflow)
        const gaugeVal = Math.min(pct, 100);
        const remaining = 100 - gaugeVal;

        const ctx = document.getElementById('gauge' + i).getContext('2d');
        const chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [gaugeVal, remaining],
                    backgroundColor: [color, '#e0e0e0'],
                    borderWidth: 0,
                    circumference: 180,
                    rotation: 270
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 2,
                cutout: '75%',
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                }
            }
        });
        gaugeCharts.push(chart);

        // Textos centrales
        const pctEl = document.getElementById('gaugePct' + i);
        const detailEl = document.getElementById('gaugeDetail' + i);
        pctEl.textContent = pctDisplay + '%';
        pctEl.className = 'gauge-pct ' + (pctDisplay >= 90 ? 'green' : pctDisplay >= 60 ? 'yellow' : 'red');
        detailEl.textContent = formatNumber(actual) + ' / ' + formatNumber(metaVal);
    });
}

function volverAGrid() {
    document.getElementById('zonasGrid').style.display = '';
    document.getElementById('zonaDetalle').style.display = 'none';
}
