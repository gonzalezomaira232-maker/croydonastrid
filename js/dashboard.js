// ===== Modulo: Dashboard Regional =====
let chartCumplimiento = null;
let chartTendencia = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnRefreshDash').addEventListener('click', refreshDashboard);
});

function refreshDashboard() {
    const campana = document.getElementById('dashCampana').value;
    const anio = document.getElementById('dashAnio').value;
    const key = getMetaKey(campana, anio);

    const metas = APP.data.metas[key] || [];
    const normCampana = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const seguimiento = APP.data.seguimiento.filter(r => {
        const segCamp = r.campanaAsignada || r['Campaña'] || r['Campana'] || r.campana || '';
        return normCampana(segCamp).includes(normCampana(campana)) &&
            (!r.anioActividad || String(r.anioActividad) === String(anio));
    });

    renderDashTotales(seguimiento, metas);
    renderChartCumplimiento(metas, seguimiento);
    renderChartTendencia(seguimiento);
    renderSemaforo(metas, seguimiento);
}

function renderDashTotales(seguimiento, metas) {
    const container = document.getElementById('dashTotales');
    const kpisDash = APP.kpis.filter(k => k !== 'Estencil Pas');

    // Mapeo KPI meta -> columna actividad
    const colMap = {
        'Consec.': 'Consec.', '% Consec.': '% Consec.', 'Nuevas': 'Nuevas',
        'Crecimiento': 'Cmto.', 'PPDD': 'PPDD', 'Recuperada': 'Recuperadas',
        'Reingresos': 'Reingresos', 'Vr. Venta': 'Vr. Venta', 'VOP': 'V.O.P'
    };
    const pctKpis = ['% Consec.'];
    const avgMetaKpis = ['VOP'];

    const normDash = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    container.innerHTML = kpisDash.map(kpi => {
        const isPct = pctKpis.includes(kpi);
        const colSeg = colMap[kpi] || kpi;

        let metaTotal, actualTotal, falta, pct;

        if (isPct) {
            // Para porcentajes: promediar meta y promediar actividad por zona
            const metasConValor = metas.filter(m => parseFloat(m[kpi]) > 0);
            metaTotal = metasConValor.length > 0
                ? metasConValor.reduce((s, m) => s + (parseFloat(m[kpi]) || 0), 0) / metasConValor.length
                : 0;
            // Promediar la actividad: para cada zona, promediar sus filas, luego promediar zonas
            const promediosPorZona = [];
            APP.zonas.forEach(zona => {
                const segZona = seguimiento.filter(r => normDash(r['CZ-Zona'] || r.Zona || r.zona || '') === normDash(zona));
                if (segZona.length > 0) {
                    promediosPorZona.push(promediarActividadZona(segZona, colSeg));
                }
            });
            actualTotal = promediosPorZona.length > 0
                ? promediosPorZona.reduce((a, b) => a + b, 0) / promediosPorZona.length
                : 0;
            console.log(`Dashboard ${kpi}: meta promedio=${metaTotal}, actual promedio=${actualTotal}, zonas=${promediosPorZona.length}`);
            falta = Math.max(metaTotal - actualTotal, 0);
            pct = calcPct(actualTotal, metaTotal);
        } else if (avgMetaKpis.includes(kpi)) {
            // VOP: promediar meta, promediar actividad
            const metasConValor = metas.filter(m => parseFloat(m[kpi]) > 0);
            metaTotal = metasConValor.length > 0
                ? metasConValor.reduce((s, m) => s + (parseFloat(m[kpi]) || 0), 0) / metasConValor.length
                : 0;
            const valoresPorZona = [];
            APP.zonas.forEach(zona => {
                const segZona = seguimiento.filter(r => normDash(r['CZ-Zona'] || r.Zona || r.zona || '') === normDash(zona));
                const val = sumarActividadZona(segZona, colSeg);
                if (val > 0) valoresPorZona.push(val);
            });
            actualTotal = valoresPorZona.length > 0
                ? valoresPorZona.reduce((a, b) => a + b, 0) / valoresPorZona.length
                : 0;
            falta = Math.max(metaTotal - actualTotal, 0);
            pct = calcPct(actualTotal, metaTotal);
        } else {
            metaTotal = metas.reduce((s, m) => s + (parseFloat(m[kpi]) || 0), 0);
            // Sumar actividad: para cada zona, sumar sus filas de la ultima carga
            actualTotal = 0;
            APP.zonas.forEach(zona => {
                const segZona = seguimiento.filter(r => normDash(r['CZ-Zona'] || r.Zona || r.zona || '') === normDash(zona));
                actualTotal += sumarActividadZona(segZona, colSeg);
            });
            falta = Math.max(metaTotal - actualTotal, 0);
            pct = calcPct(actualTotal, metaTotal);
        }

        const cls = semaforoClass(pct);

        return `<div class="kpi-card total">
            <div class="kpi-label">${kpi}</div>
            <div class="kpi-value">${formatNumber(metaTotal, isPct)}</div>
            <div class="kpi-actual">Actividad: <strong>${formatNumber(actualTotal, isPct)}</strong></div>
            <div class="kpi-pct ${cls}">${pct}% cumplido</div>
            <div class="kpi-falta">Falta: ${formatNumber(falta, isPct)}</div>
        </div>`;
    }).join('');
}

function renderChartCumplimiento(metas, seguimiento) {
    const ctx = document.getElementById('chartCumplimientoZona').getContext('2d');
    if (chartCumplimiento) chartCumplimiento.destroy();

    const normalize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    const zonasPct = APP.zonas.map(zona => {
        const meta = metas.find(m => m.zona === zona);
        const seg = seguimiento.filter(r => normalize(r['CZ-Zona'] || r.Zona || r.zona || '') === normalize(zona));

        if (!meta || !meta['PPDD']) return 0;

        const actual = sumarActividadZona(seg, 'PPDD');
        return calcPct(actual, meta['PPDD']);
    });

    const colors = zonasPct.map(p => {
        if (p >= 90) return '#4caf50';
        if (p >= 60) return '#ff9800';
        return '#f44336';
    });

    chartCumplimiento = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: APP.zonas.map(z => z.length > 12 ? z.substring(0, 10) + '..' : z),
            datasets: [{
                label: '% Cumplimiento',
                data: zonasPct,
                backgroundColor: colors,
                borderWidth: 0,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 120,
                    ticks: { callback: v => v + '%' }
                },
                x: {
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45,
                        font: { size: 10 }
                    }
                }
            }
        }
    });
}

function renderChartTendencia(seguimiento) {
    const ctx = document.getElementById('chartTendencia').getContext('2d');
    if (chartTendencia) chartTendencia.destroy();

    const fechas = [...new Set(seguimiento.map(r => r.fechaCarga).filter(Boolean))].sort();

    if (fechas.length === 0) {
        chartTendencia = new Chart(ctx, {
            type: 'line',
            data: { labels: ['Sin datos'], datasets: [{ label: 'Sin datos', data: [0] }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
        return;
    }

    const datasets = [
        { label: 'Consecutividad', key: 'Consec.', color: '#1a237e' },
        { label: 'Nuevas', key: 'Nuevas', color: '#ff6f00' },
        { label: 'PPDD', key: 'PPDD', color: '#2e7d32' }
    ];

    chartTendencia = new Chart(ctx, {
        type: 'line',
        data: {
            labels: fechas,
            datasets: datasets.map(ds => ({
                label: ds.label,
                data: fechas.map(f => {
                    const rows = seguimiento.filter(r => r.fechaCarga === f);
                    return rows.reduce((s, r) => s + (parseFloat(r[ds.key]) || 0), 0);
                }),
                borderColor: ds.color,
                backgroundColor: ds.color + '20',
                fill: false,
                tension: 0.3,
                pointRadius: 4
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

function renderSemaforo(metas, seguimiento) {
    const head = document.getElementById('headSemaforo');
    const body = document.getElementById('bodySemaforo');
    const normalize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    const kpisDash = APP.kpis.filter(k => k !== 'Estencil Pas');
    head.innerHTML = '<tr><th>Zona</th>' + kpisDash.map(k => `<th>${k}</th>`).join('') + '</tr>';

    body.innerHTML = APP.zonas.map(zona => {
        const meta = metas.find(m => m.zona === zona) || {};
        const seg = seguimiento.filter(r => normalize(r['CZ-Zona'] || r.Zona || r.zona || '') === normalize(zona));

        const cells = kpisDash.map(kpi => {
            const metaVal = meta[kpi] || 0;
            const col = KPI_MAP_SEG[kpi] || kpi;
            const isPctKpi = kpi === '% Consec.';
            const actual = isPctKpi ? promediarActividadZona(seg, col) : sumarActividadZona(seg, col);
            const pct = calcPct(actual, metaVal);
            const cls = semaforoCellClass(pct);
            return `<td class="${cls}">${pct}%</td>`;
        }).join('');

        return `<tr><td><strong>${zona}</strong></td>${cells}</tr>`;
    }).join('');
}
