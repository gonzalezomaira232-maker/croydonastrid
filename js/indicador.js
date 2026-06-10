// ===== Modulo: Dashboard por Indicador =====
document.addEventListener('DOMContentLoaded', () => {
    // Poblar select de indicadores (sin Estencil Pas)
    const sel = document.getElementById('indKpi');
    APP.kpis.filter(k => k !== 'Estencil Pas').forEach(kpi => {
        const opt = document.createElement('option');
        opt.value = kpi;
        opt.textContent = kpi;
        sel.appendChild(opt);
    });

    document.getElementById('btnConsultarIndicador').addEventListener('click', renderIndicador);
});

function renderIndicador() {
    const campana = document.getElementById('indCampana').value;
    const anio = document.getElementById('indAnio').value;
    const kpi = document.getElementById('indKpi').value;
    const key = getMetaKey(campana, anio);
    const metas = APP.data.metas[key] || [];
    const isPct = kpi === '% Consec.';
    const col = KPI_MAP_SEG[kpi] || kpi;

    if (metas.length === 0) {
        showMessage('indicadorMsg', 'No hay metas cargadas para ' + campana + ' ' + anio, 'error');
        document.getElementById('bodyIndicador').innerHTML = '';
        return;
    }

    // Obtener fechaHasta de los registros de seguimiento para esta campana/anio
    const segCampana = APP.data.seguimiento.filter(r =>
        normalize(getSegCampana(r)).includes(normalize(campana)) &&
        (!r.anioActividad || String(r.anioActividad) === String(anio))
    );
    let fechaHasta = null;
    for (let i = segCampana.length - 1; i >= 0; i--) {
        if (segCampana[i].fechaHasta) { fechaHasta = segCampana[i].fechaHasta; break; }
    }
    const diasRestantes = diasHabilesRestantes(fechaHasta);

    // Calcular datos por zona
    const rows = APP.zonas.map(zona => {
        const metaZona = metas.find(m => m.zona === zona) || {};
        const metaVal = parseFloat(metaZona[kpi]) || 0;

        const seguimiento = APP.data.seguimiento.filter(r =>
            normalize(getSegZona(r)) === normalize(zona) &&
            normalize(getSegCampana(r)).includes(normalize(campana)) &&
            (!r.anioActividad || String(r.anioActividad) === String(anio))
        );

        const actual = isPct
            ? promediarActividadZona(seguimiento, col)
            : sumarActividadZona(seguimiento, col);
        const falta = Math.max(metaVal - actual, 0);
        const pct = calcPct(actual, metaVal);
        const xDia = diasRestantes > 0 ? Math.ceil(falta / diasRestantes) : null;

        return { zona, metaVal, actual, falta, pct, xDia };
    });

    // Ordenar de mayor a menor cumplimiento
    rows.sort((a, b) => b.pct - a.pct);

    // Renderizar tabla
    const tbody = document.getElementById('bodyIndicador');
    tbody.innerHTML = rows.map((r, i) => {
        const cls = semaforoCellClass(r.pct);
        const xDiaStr = r.xDia != null ? formatNumber(r.xDia, isPct) : '-';
        return `<tr>
            <td class="ranking-num">${i + 1}</td>
            <td><strong>${r.zona}</strong></td>
            <td>${formatNumber(r.metaVal, isPct)}</td>
            <td>${formatNumber(r.actual, isPct)}</td>
            <td>${formatNumber(r.falta, isPct)}</td>
            <td>${xDiaStr}</td>
            <td class="${cls}">${r.pct}%</td>
        </tr>`;
    }).join('');
}
