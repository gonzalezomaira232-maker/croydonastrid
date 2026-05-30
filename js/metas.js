// ===== Modulo: Metas Mensuales =====
document.addEventListener('DOMContentLoaded', () => {
    renderMetasTable();

    document.getElementById('btnCargarMetas').addEventListener('click', cargarMetas);
    document.getElementById('btnGuardarMetas').addEventListener('click', guardarMetas);

    // Carga de metas desde Excel
    document.getElementById('btnSubirMetasExcel').addEventListener('click', () => {
        document.getElementById('fileInputMetas').click();
    });
    document.getElementById('fileInputMetas').addEventListener('change', procesarExcelMetas);
});

function renderMetasTable() {
    const tbody = document.getElementById('bodyMetas');
    tbody.innerHTML = '';

    APP.zonas.forEach(zona => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${zona}</td>` +
            APP.kpis.map(kpi => `<td><input type="number" data-zona="${zona}" data-kpi="${kpi}" value="0" step="any"></td>`).join('');
        tbody.appendChild(tr);
    });
}

async function cargarMetas() {
    const campana = document.getElementById('metaCampana').value;
    const anio = document.getElementById('metaAnio').value;
    const key = getMetaKey(campana, anio);

    // Intentar cargar de Google Sheets
    if (APP.sheetUrl) {
        try {
            const result = await fetchSheet('getMetas', { campana, anio });
            if (result.success && result.data && result.data.length > 0) {
                APP.data.metas[key] = result.data;
                saveLocalData();
                fillMetasTable(result.data);
                showMessage('metasMsg', `Metas cargadas de Google Sheets para ${campana} ${anio}`, 'success');
                return;
            }
        } catch (err) {
            console.warn('No se pudo cargar de Sheets, usando datos locales:', err.message);
        }
    }

    // Cargar de datos locales
    if (APP.data.metas[key]) {
        fillMetasTable(APP.data.metas[key]);
        showMessage('metasMsg', `Metas cargadas de datos locales para ${campana} ${anio}`, 'info');
    } else {
        renderMetasTable();
        showMessage('metasMsg', `No hay metas guardadas para ${campana} ${anio}`, 'info');
    }
}

function fillMetasTable(data) {
    data.forEach(row => {
        APP.kpis.forEach(kpi => {
            const input = document.querySelector(`input[data-zona="${row.zona}"][data-kpi="${kpi}"]`);
            if (input) input.value = row[kpi] || 0;
        });
    });
}

function procesarExcelMetas(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const data = new Uint8Array(evt.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellFormula: false, cellNF: false });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];

            // Detectar la fila real de encabezados
            let range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
            const colsConocidas = ['CZ-Zona', 'Consec.', 'Zona', 'PPDD', 'Nuevas', 'Campaña'];
            for (let R = range.s.r; R <= Math.min(range.e.r, 20); R++) {
                let matches = 0;
                for (let C = range.s.c; C <= range.e.c; C++) {
                    const cell = sheet[XLSX.utils.encode_cell({ r: R, c: C })];
                    if (cell && cell.v && colsConocidas.includes(String(cell.v).trim())) matches++;
                }
                if (matches >= 3) {
                    if (R > 0) {
                        range.s.r = R;
                        sheet['!ref'] = XLSX.utils.encode_range(range);
                        console.log('Metas: encabezados en fila', R + 1);
                    }
                    break;
                }
            }

            // Forzar que celdas con formula usen el valor cacheado
            range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
            for (let R = range.s.r; R <= range.e.r; R++) {
                for (let C = range.s.c; C <= range.e.c; C++) {
                    const addr = XLSX.utils.encode_cell({ r: R, c: C });
                    const cell = sheet[addr];
                    if (cell && cell.f) {
                        if (cell.v !== undefined && cell.v !== null) {
                            cell.t = typeof cell.v === 'number' ? 'n' : 's';
                        } else {
                            cell.v = 0;
                            cell.t = 'n';
                        }
                        delete cell.f;
                        delete cell.w;
                    }
                }
            }

            const rows = XLSX.utils.sheet_to_json(sheet, { defval: 0, raw: true });

            if (!rows.length) {
                showMessage('metasMsg', 'El archivo esta vacio.', 'error');
                return;
            }

            // Mostrar en consola las columnas del Excel para diagnostico
            const columnasExcel = Object.keys(rows[0]);
            console.log('=== DIAGNOSTICO EXCEL METAS ===');
            console.log('Columnas encontradas en Excel:', columnasExcel);
            console.log('KPIs esperados por la app:', APP.kpis);
            console.log('Primera fila completa:', rows[0]);

            // Crear mapa flexible de columnas: normalizar nombres quitando espacios extra
            const colMap = {};
            columnasExcel.forEach(col => {
                const normalizado = col.trim().replace(/\s+/g, ' ');
                colMap[normalizado.toLowerCase()] = col;
            });
            console.log('Mapa de columnas normalizado:', colMap);

            // Buscar la columna de zona (puede ser CZ-Zona, Zona, zona, etc.)
            const zonaColKeys = ['cz-zona', 'zona', 'cz zona'];
            let zonaCol = null;
            for (const key of zonaColKeys) {
                if (colMap[key]) { zonaCol = colMap[key]; break; }
            }
            // Tambien buscar parcialmente
            if (!zonaCol) {
                const found = columnasExcel.find(c => c.toLowerCase().includes('zona'));
                if (found) zonaCol = found;
            }

            if (!zonaCol) {
                showMessage('metasMsg', 'No se encontro columna de zona. Columnas del Excel: ' + columnasExcel.join(', '), 'error');
                return;
            }
            console.log('Columna de zona usada:', zonaCol);

            // Crear mapa de KPIs: buscar cada KPI de la app en las columnas del Excel
            const kpiMap = {};
            APP.kpis.forEach(kpi => {
                const kpiLower = kpi.trim().toLowerCase().replace(/\s+/g, ' ');
                // Buscar coincidencia exacta normalizada
                if (colMap[kpiLower]) {
                    kpiMap[kpi] = colMap[kpiLower];
                } else {
                    // Buscar parcial
                    const found = columnasExcel.find(c =>
                        c.trim().toLowerCase().replace(/\s+/g, ' ') === kpiLower ||
                        c.trim().toLowerCase().replace(/\s+/g, ' ').includes(kpiLower) ||
                        kpiLower.includes(c.trim().toLowerCase().replace(/\s+/g, ' '))
                    );
                    if (found) kpiMap[kpi] = found;
                }
            });
            console.log('Mapeo de KPIs (app -> excel):', kpiMap);

            const kpisNoEncontrados = APP.kpis.filter(k => !kpiMap[k]);
            if (kpisNoEncontrados.length > 0) {
                console.warn('KPIs NO encontrados en Excel:', kpisNoEncontrados);
            }

            // Mapear datos del Excel a las zonas de la app
            let zonasEncontradas = 0;
            let zonasNoEncontradas = [];

            rows.forEach(row => {
                const zonaExcel = String(row[zonaCol] || '').trim();

                // Buscar coincidencia exacta (ignorando mayusculas/tildes)
                const normalize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                const zonaApp = APP.zonas.find(z => normalize(z) === normalize(zonaExcel));

                if (zonaApp) {
                    APP.kpis.forEach(kpi => {
                        const input = document.querySelector(`input[data-zona="${zonaApp}"][data-kpi="${kpi}"]`);
                        const excelCol = kpiMap[kpi];
                        if (input && excelCol && row[excelCol] !== undefined) {
                            input.value = parseFloat(row[excelCol]) || 0;
                        }
                    });
                    zonasEncontradas++;
                } else if (zonaExcel) {
                    zonasNoEncontradas.push(zonaExcel);
                }
            });

            let msg = `Excel cargado: ${zonasEncontradas} zonas de ${rows.length} filas.`;
            if (kpisNoEncontrados.length > 0) {
                msg += ` KPIs no encontrados: ${kpisNoEncontrados.join(', ')}.`;
            }
            if (zonasNoEncontradas.length > 0) {
                msg += ` Zonas no reconocidas: ${zonasNoEncontradas.join(', ')}`;
            }
            if (zonasNoEncontradas.length > 0 || kpisNoEncontrados.length > 0) {
                showMessage('metasMsg', msg, 'info');
            } else {
                showMessage('metasMsg', msg, 'success');
            }
            console.log('Zonas encontradas:', zonasEncontradas, '| No reconocidas:', zonasNoEncontradas);

        } catch (err) {
            showMessage('metasMsg', 'Error al leer el archivo: ' + err.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);

    // Limpiar input para permitir recargar el mismo archivo
    e.target.value = '';
}

async function guardarMetas() {
    const campana = document.getElementById('metaCampana').value;
    const anio = document.getElementById('metaAnio').value;
    const key = getMetaKey(campana, anio);

    const metasData = APP.zonas.map(zona => {
        const row = { zona, campana, anio: parseInt(anio) };
        APP.kpis.forEach(kpi => {
            const input = document.querySelector(`input[data-zona="${zona}"][data-kpi="${kpi}"]`);
            row[kpi] = input ? parseFloat(input.value) || 0 : 0;
        });
        return row;
    });

    // Guardar localmente
    APP.data.metas[key] = metasData;
    saveLocalData();

    // Enviar a Google Sheets
    if (APP.sheetUrl) {
        try {
            const result = await postSheet('saveMetas', { campana, anio, metas: metasData });
            if (result.success) {
                showMessage('metasMsg', `Metas guardadas en Google Sheets para ${campana} ${anio}`, 'success');
            } else {
                showMessage('metasMsg', 'Error al guardar en Sheets: ' + (result.error || 'desconocido'), 'error');
            }
        } catch (err) {
            showMessage('metasMsg', 'Metas guardadas localmente. Error con Sheets: ' + err.message, 'info');
        }
    } else {
        showMessage('metasMsg', 'Metas guardadas localmente. Configura Google Sheets para respaldo en la nube.', 'info');
    }
}
