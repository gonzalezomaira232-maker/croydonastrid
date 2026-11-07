// ===== Modulo: Metas Mensuales =====

// Estado para el calculador automatico
let _calcMetasData = null;    // Archivo de Metas (METAS C9 NAVIDAD)
let _calcInformeData = null;  // Actividad Acumulada (ActAcum)

document.addEventListener('DOMContentLoaded', () => {
    renderMetasTable();

    document.getElementById('btnCargarMetas').addEventListener('click', cargarMetas);
    document.getElementById('btnGuardarMetas').addEventListener('click', guardarMetas);

    // Carga de metas desde Excel (boton naranja existente)
    document.getElementById('btnSubirMetasExcel').addEventListener('click', () => {
        document.getElementById('fileInputMetas').click();
    });
    document.getElementById('fileInputMetas').addEventListener('change', procesarExcelMetas);

    // Calculador automatico de metas (2 archivos)
    initCalculadorMetas();
});

// ===== Calculador Automatico (2 archivos) =====

function initCalculadorMetas() {
    const toggle = document.getElementById('btnToggleCalcMetas');
    const body = document.getElementById('calcMetasBody');
    const chevron = toggle.querySelector('.calc-metas-chevron');

    toggle.addEventListener('click', () => {
        const open = body.style.display === 'none';
        body.style.display = open ? 'block' : 'none';
        chevron.classList.toggle('open', open);
    });

    // Selectores de archivo
    document.getElementById('btnSelMetas').addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('fileMetasNav').click();
    });
    document.getElementById('btnSelInforme').addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('fileInformeFinal').click();
    });

    // Drag & drop
    setupDropZone('dropMetas', 'fileMetasNav');
    setupDropZone('dropInforme', 'fileInformeFinal');

    // File change handlers
    document.getElementById('fileMetasNav').addEventListener('change', (e) => {
        if (e.target.files[0]) parseArchivoMetas(e.target.files[0]);
    });
    document.getElementById('fileInformeFinal').addEventListener('change', (e) => {
        if (e.target.files[0]) parseActividadAcumulada(e.target.files[0]);
    });

    // Boton calcular
    document.getElementById('btnCalcularMetas').addEventListener('click', calcularMetasAutomaticas);
}

function setupDropZone(zoneId, inputId) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.style.borderColor = 'var(--primary)'; });
    zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; });
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.style.borderColor = '';
        if (e.dataTransfer.files.length) {
            const dt = new DataTransfer();
            dt.items.add(e.dataTransfer.files[0]);
            input.files = dt.files;
            input.dispatchEvent(new Event('change'));
        }
    });
}

function updateCalcButton() {
    document.getElementById('btnCalcularMetas').disabled = !(_calcMetasData && _calcInformeData);
}

// --- Leer Excel generico ---
function readExcelSheet(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellFormula: false, cellNF: false });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                // Forzar valores cacheados en celdas con formula
                let range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
                for (let R = range.s.r; R <= range.e.r; R++) {
                    for (let C = range.s.c; C <= range.e.c; C++) {
                        const addr = XLSX.utils.encode_cell({ r: R, c: C });
                        const cell = sheet[addr];
                        if (cell && cell.f) {
                            if (cell.v !== undefined && cell.v !== null) {
                                cell.t = typeof cell.v === 'number' ? 'n' : 's';
                            } else { cell.v = 0; cell.t = 'n'; }
                            delete cell.f; delete cell.w;
                        }
                    }
                }
                resolve(sheet);
            } catch (err) { reject(err); }
        };
        reader.onerror = () => reject(new Error('Error leyendo archivo'));
        reader.readAsArrayBuffer(file);
    });
}

function detectHeaderRow(sheet, knownCols) {
    let range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    for (let R = range.s.r; R <= Math.min(range.e.r, 20); R++) {
        let matches = 0;
        for (let C = range.s.c; C <= range.e.c; C++) {
            const cell = sheet[XLSX.utils.encode_cell({ r: R, c: C })];
            if (cell && cell.v) {
                const val = String(cell.v).trim().toLowerCase();
                if (knownCols.some(k => val.includes(k.toLowerCase()))) matches++;
            }
        }
        if (matches >= 2) {
            if (R > range.s.r) {
                range.s.r = R;
                sheet['!ref'] = XLSX.utils.encode_range(range);
            }
            return;
        }
    }
}

function findCol(columns, candidates) {
    const norm = s => s.trim().toLowerCase().replace(/\s+/g, ' ');
    // Exacto
    for (const c of candidates) {
        const found = columns.find(col => norm(col) === norm(c));
        if (found) return found;
    }
    // Parcial
    for (const c of candidates) {
        const key = c.toLowerCase();
        const found = columns.find(col => col.toLowerCase().includes(key) || key.includes(col.toLowerCase()));
        if (found) return found;
    }
    return null;
}

// --- Archivo 1: METAS (% Consec, Nuevas, Crecimiento, Pedidos/PPDD) ---
async function parseArchivoMetas(file) {
    try {
        const sheet = await readExcelSheet(file);
        detectHeaderRow(sheet, ['CZ-Zona', 'Zona', 'CONSECUTIVIDAD', 'NUEVAS', 'PEDIDOS']);
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: 0, raw: true });
        if (!rows.length) { showMessage('calcMetasMsg', 'Archivo de Metas vacio.', 'error'); return; }

        const cols = Object.keys(rows[0]);
        console.log('Archivo Metas - columnas:', cols);

        const zonaCol = findCol(cols, ['CZ-Zona']);
        const codigoCol = findCol(cols, ['ZONA']);
        const consecCol = findCol(cols, ['CONSECUTIVIDAD', '% Consec.', '% Consec', 'Consec']);
        const nuevasCol = findCol(cols, ['NUEVAS']);
        const crecCol = findCol(cols, ['CRECIMIENTO']);
        const pedidosCol = findCol(cols, ['PEDIDOS', 'PPDD']);

        // Si no hay CZ-Zona, usar ZONA como nombre
        const nameCol = zonaCol || codigoCol;
        if (!nameCol) { showMessage('calcMetasMsg', 'Metas: no se encontro columna de zona.', 'error'); return; }

        const dataMap = {};
        rows.forEach(row => {
            const zona = String(row[nameCol] || '').trim();
            if (!zona) return;
            // Guardar mapa codigo -> nombre para cruzar con actividad
            const codigo = codigoCol ? String(row[codigoCol] || '').trim() : '';
            if (codigo && zonaCol) {
                APP.zonaCodeMap[codigo.toUpperCase()] = zona;
            }
            let consec = parseFloat(row[consecCol]) || 0;
            // Si viene como decimal (ej: 0.78), es porcentaje
            if (consec > 0 && consec <= 1) consec = consec; // mantener como decimal
            else if (consec > 1) consec = consec / 100; // convertir 78 -> 0.78
            dataMap[zona] = {
                codigo: codigo,
                pctConsec: consec,
                nuevas: parseFloat(row[nuevasCol]) || 0,
                crecimiento: parseFloat(row[crecCol]) || 0,
                pedidos: parseFloat(row[pedidosCol]) || 0
            };
        });

        _calcMetasData = dataMap;
        console.log('Archivo Metas parseado:', Object.keys(dataMap).length, 'zonas', dataMap);

        // UI
        document.getElementById('dropMetas').classList.add('loaded');
        document.getElementById('checkMetas').style.display = 'block';
        document.getElementById('nameMetas').textContent = file.name;
        document.getElementById('btnSelMetas').style.display = 'none';
        updateCalcButton();
        showMessage('calcMetasMsg', `Archivo de Metas cargado: ${Object.keys(dataMap).length} zonas.`, 'success');
    } catch (err) {
        showMessage('calcMetasMsg', 'Error leyendo Archivo de Metas: ' + err.message, 'error');
    }
}

// --- Archivo 2: Actividad Acumulada (Activas, Inactivas, Estencil, VOP) ---
async function parseActividadAcumulada(file) {
    try {
        const sheet = await readExcelSheet(file);
        detectHeaderRow(sheet, ['CZ-Zona', 'Activas', 'Inactivas', 'Estencil', 'V.O.P']);
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: 0, raw: true });
        if (!rows.length) { showMessage('calcMetasMsg', 'Actividad Acumulada vacia.', 'error'); return; }

        const cols = Object.keys(rows[0]);
        console.log('ActAcum - columnas:', cols);

        const czZonaCol = findCol(cols, ['CZ-Zona']);
        const codigoCol = findCol(cols, ['Zona']);
        const activasCol = findCol(cols, ['Activas']);
        const inactivasCol = findCol(cols, ['Inactivas 1', 'Inactivas']);
        const estencilCol = findCol(cols, ['Estencil']);
        const vopCol = findCol(cols, ['V.O.P', 'VOP']);
        const vrVentaCol = findCol(cols, ['Vr. Venta', 'Vr Venta']);
        const ppddCol = findCol(cols, ['PPDD']);
        const campanaCol = findCol(cols, ['Campaña', 'Campana']);

        const zonaCol = czZonaCol || codigoCol;
        if (!zonaCol) { showMessage('calcMetasMsg', 'ActAcum: no se encontro columna de zona.', 'error'); return; }

        // Solo tomar la primera campana de cada zona (la mas reciente, que esta primero)
        const dataMap = {};
        rows.forEach(row => {
            const zona = String(row[czZonaCol] || '').trim();
            const codigo = codigoCol ? String(row[codigoCol] || '').trim().toUpperCase() : '';
            if (!zona) return;
            const activas = parseFloat(row[activasCol]) || 0;
            if (activas === 0 && !row[activasCol]) return;
            // Usar la primera fila de cada zona (la campana actual)
            const key = codigo || zona;
            if (dataMap[key]) return;
            dataMap[key] = {
                zona: zona,
                codigo: codigo,
                activas: activas,
                inactivas: parseFloat(row[inactivasCol]) || 0,
                estencil: parseFloat(row[estencilCol]) || 0,
                vop: parseFloat(row[vopCol]) || 0,
                vrVenta: parseFloat(row[vrVentaCol]) || 0,
                ppdd: parseFloat(row[ppddCol]) || 0
            };
        });

        _calcInformeData = dataMap;
        console.log('ActAcum parseado:', Object.keys(dataMap).length, 'zonas', dataMap);

        // UI
        document.getElementById('dropInforme').classList.add('loaded');
        document.getElementById('checkInforme').style.display = 'block';
        document.getElementById('nameInforme').textContent = file.name;
        document.getElementById('btnSelInforme').style.display = 'none';
        updateCalcButton();
        showMessage('calcMetasMsg', `Actividad Acumulada cargada: ${Object.keys(dataMap).length} zonas.`, 'success');
    } catch (err) {
        showMessage('calcMetasMsg', 'Error leyendo Actividad Acumulada: ' + err.message, 'error');
    }
}

// --- Calcular metas combinando ambos archivos ---
function calcularCrecimiento(estencil) {
    if (estencil <= 200) return 20;
    if (estencil <= 300) return 15;
    if (estencil <= 400) return 10;
    return 5;
}

function calcularMetasAutomaticas() {
    if (!_calcMetasData || !_calcInformeData) return;

    const normalize = normalizeZona;

    // Emparejar zonas entre ambos archivos usando CODIGO de zona (B03, B52, etc.)
    const metasZonas = Object.keys(_calcMetasData);
    const informeKeys = Object.keys(_calcInformeData);

    const zonePairs = [];
    metasZonas.forEach(mz => {
        const met = _calcMetasData[mz];
        const metCodigo = (met.codigo || '').toUpperCase();

        // Primero intentar por codigo de zona
        let infKey = null;
        if (metCodigo) {
            infKey = informeKeys.find(k => (_calcInformeData[k].codigo || '').toUpperCase() === metCodigo);
        }
        // Fallback: por nombre normalizado
        if (!infKey) {
            infKey = informeKeys.find(k => normalize(_calcInformeData[k].zona || k) === normalize(mz));
        }

        if (infKey) {
            zonePairs.push({ metas: mz, informe: infKey, display: mz });
        } else {
            zonePairs.push({ metas: mz, informe: null, display: mz });
        }
    });

    if (!zonePairs.length) {
        showMessage('calcMetasMsg', 'No se encontraron zonas en comun.', 'error');
        return;
    }

    // Actualizar APP.zonas
    APP.zonas = zonePairs.map(p => p.display).sort((a, b) => a.localeCompare(b, 'es'));
    renderMetasTable();
    if (typeof renderZonasGrid === 'function') renderZonasGrid();

    let filled = 0;
    let warnings = [];

    zonePairs.forEach(({ metas, informe, display }) => {
        const met = _calcMetasData[metas];
        const inf = informe ? _calcInformeData[informe] : null;

        if (!inf) {
            warnings.push(display);
            // Solo llenar lo que viene del archivo de metas
            setInput(display, '% Consec.', met.pctConsec);
            setInput(display, 'Nuevas', met.nuevas);
            setInput(display, 'Crecimiento', met.crecimiento);
            setInput(display, 'PPDD', met.pedidos);
            return;
        }

        // Datos del archivo de metas
        const pctConsec = met.pctConsec;
        const nuevas = met.nuevas;
        const crecimiento = met.crecimiento; // Viene del archivo de metas directamente
        const pedidos = met.pedidos;

        // Calculos usando Actividad Acumulada
        const consec = Math.round(inf.activas * pctConsec * 10) / 10;
        const estencilPas = inf.estencil;
        const recuperada = Math.round(inf.inactivas * 0.55 * 10) / 10;
        const reingresos = Math.round((crecimiento - nuevas - recuperada + inf.inactivas) * 100) / 100;
        const vop = inf.vop;
        const vrVenta = Math.round(pedidos * vop * 100) / 100;

        // Llenar tabla
        setInput(display, 'Consec.', consec);
        setInput(display, '% Consec.', pctConsec);
        setInput(display, 'Nuevas', nuevas);
        setInput(display, 'Estencil Pas', estencilPas);
        setInput(display, 'Crecimiento', crecimiento);
        setInput(display, 'PPDD', pedidos);
        setInput(display, 'Recuperada', recuperada);
        setInput(display, 'Reingresos', reingresos);
        setInput(display, 'Vr. Venta', vrVenta);
        setInput(display, 'VOP', vop);

        filled++;
    });

    let msg = `Metas calculadas para ${filled} zonas. Revisa y haz clic en "Guardar Metas".`;
    if (warnings.length) {
        msg += ` Zonas sin datos en ActAcum: ${warnings.join(', ')}.`;
    }
    showMessage('calcMetasMsg', msg, warnings.length ? 'info' : 'success');
}

function setInput(zona, kpi, value) {
    const input = document.querySelector(`input[data-zona="${zona}"][data-kpi="${kpi}"]`);
    if (input) input.value = Math.round(value * 100) / 100;
}

// ===== Tabla y CRUD de Metas =====

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

    if (APP.sheetUrl) {
        try {
            const result = await fetchSheet('getMetas', { campana, anio });
            if (result.success && result.data && result.data.length > 0) {
                APP.data.metas[key] = result.data;
                saveLocalData();
                updateZonasFromMetas();
                renderMetasTable();
                if (typeof renderZonasGrid === 'function') renderZonasGrid();
                fillMetasTable(result.data);
                showMessage('metasMsg', `Metas cargadas de Google Sheets para ${campana} ${anio}`, 'success');
                return;
            }
        } catch (err) {
            console.warn('No se pudo cargar de Sheets, usando datos locales:', err.message);
        }
    }

    if (APP.data.metas[key]) {
        updateZonasFromMetas();
        renderMetasTable();
        if (typeof renderZonasGrid === 'function') renderZonasGrid();
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

            let range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
            const colsConocidas = ['CZ-Zona', 'Consec.', 'Zona', 'PPDD', 'Nuevas', 'Campaña'];
            for (let R = range.s.r; R <= Math.min(range.e.r, 20); R++) {
                let matches = 0;
                for (let C = range.s.c; C <= range.e.c; C++) {
                    const cell = sheet[XLSX.utils.encode_cell({ r: R, c: C })];
                    if (cell && cell.v && colsConocidas.includes(String(cell.v).trim())) matches++;
                }
                if (matches >= 3) {
                    if (R > 0) { range.s.r = R; sheet['!ref'] = XLSX.utils.encode_range(range); }
                    break;
                }
            }

            range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
            for (let R = range.s.r; R <= range.e.r; R++) {
                for (let C = range.s.c; C <= range.e.c; C++) {
                    const addr = XLSX.utils.encode_cell({ r: R, c: C });
                    const cell = sheet[addr];
                    if (cell && cell.f) {
                        if (cell.v !== undefined && cell.v !== null) {
                            cell.t = typeof cell.v === 'number' ? 'n' : 's';
                        } else { cell.v = 0; cell.t = 'n'; }
                        delete cell.f; delete cell.w;
                    }
                }
            }

            const rows = XLSX.utils.sheet_to_json(sheet, { defval: 0, raw: true });
            if (!rows.length) { showMessage('metasMsg', 'El archivo esta vacio.', 'error'); return; }

            const columnasExcel = Object.keys(rows[0]);
            const colMap = {};
            columnasExcel.forEach(col => { colMap[col.trim().replace(/\s+/g, ' ').toLowerCase()] = col; });

            const zonaColKeys = ['cz-zona', 'zona', 'cz zona'];
            let zonaCol = null;
            for (const key of zonaColKeys) { if (colMap[key]) { zonaCol = colMap[key]; break; } }
            if (!zonaCol) {
                const found = columnasExcel.find(c => c.toLowerCase().includes('zona'));
                if (found) zonaCol = found;
            }
            if (!zonaCol) { showMessage('metasMsg', 'No se encontro columna de zona.', 'error'); return; }

            const kpiMap = {};
            APP.kpis.forEach(kpi => {
                const kpiLower = kpi.trim().toLowerCase().replace(/\s+/g, ' ');
                if (colMap[kpiLower]) { kpiMap[kpi] = colMap[kpiLower]; }
                else {
                    const found = columnasExcel.find(c =>
                        c.trim().toLowerCase().replace(/\s+/g, ' ') === kpiLower ||
                        c.trim().toLowerCase().replace(/\s+/g, ' ').includes(kpiLower) ||
                        kpiLower.includes(c.trim().toLowerCase().replace(/\s+/g, ' '))
                    );
                    if (found) kpiMap[kpi] = found;
                }
            });

            const kpisNoEncontrados = APP.kpis.filter(k => !kpiMap[k]);

            const zonasExcel = [];
            rows.forEach(row => {
                const zonaExcel = String(row[zonaCol] || '').trim();
                if (zonaExcel && !zonasExcel.find(z => z === zonaExcel)) zonasExcel.push(zonaExcel);
            });

            if (zonasExcel.length > 0) {
                APP.zonas = zonasExcel.sort((a, b) => a.localeCompare(b, 'es'));
                renderMetasTable();
                if (typeof renderZonasGrid === 'function') renderZonasGrid();
            }

            let zonasEncontradas = 0;
            const normalizeZona = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

            rows.forEach(row => {
                const zonaExcel = String(row[zonaCol] || '').trim();
                const zonaApp = APP.zonas.find(z => normalizeZona(z) === normalizeZona(zonaExcel));
                if (zonaApp) {
                    APP.kpis.forEach(kpi => {
                        const input = document.querySelector(`input[data-zona="${zonaApp}"][data-kpi="${kpi}"]`);
                        const excelCol = kpiMap[kpi];
                        if (input && excelCol && row[excelCol] !== undefined) input.value = parseFloat(row[excelCol]) || 0;
                    });
                    zonasEncontradas++;
                }
            });

            let msg = `Excel cargado: ${zonasEncontradas} zonas encontradas.`;
            if (kpisNoEncontrados.length > 0) msg += ` KPIs no encontrados: ${kpisNoEncontrados.join(', ')}.`;
            showMessage('metasMsg', msg, kpisNoEncontrados.length > 0 ? 'info' : 'success');

        } catch (err) {
            showMessage('metasMsg', 'Error al leer el archivo: ' + err.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
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

    APP.data.metas[key] = metasData;
    saveLocalData();

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
