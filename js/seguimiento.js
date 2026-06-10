// ===== Modulo: Carga de Excel =====
document.addEventListener('DOMContentLoaded', () => {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');

    document.getElementById('btnSelectFile').addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    uploadArea.addEventListener('click', () => fileInput.click());

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            processFile(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            processFile(fileInput.files[0]);
        }
    });

    document.getElementById('btnRemoveFile').addEventListener('click', resetUpload);
    document.getElementById('btnCancelarCarga').addEventListener('click', resetUpload);
    document.getElementById('btnConfirmarCarga').addEventListener('click', confirmarCarga);
    document.getElementById('btnLimpiarActividad').addEventListener('click', () => {
        if (confirm('¿Seguro que deseas eliminar todos los datos de actividad cargados?')) {
            APP.data.seguimiento = [];
            saveLocalData();
            showMessage('seguimientoMsg', 'Datos de actividad eliminados correctamente.', 'success');
        }
    });
});

let parsedExcelData = null;

const EXCEL_COLUMNS = [
    'Reg', 'Ing_Zona', 'Ing_Coord', 'Zona', 'CZ-Zona', 'Coord', 'Campana',
    'Activas', 'Inactivas 1', 'Consec.', '% Consec.', 'Estencil', 'Recuperadas',
    'Reingresos', 'Nuevas', 'Egresos', 'Cmto.', 'Recaudo_Cat', 'Recaudo_Anterior',
    'Vr. Venta', 'PPDD', 'FQ', 'V.O.P', 'Rodamiento', 'Cartera',
    'Meta Consecutividad', 'Meta Crecimiento'
];

function processFile(file) {
    if (!file.name.match(/\.(xls|xlsx)$/i)) {
        showMessage('seguimientoMsg', 'Por favor selecciona un archivo .xls o .xlsx', 'error');
        return;
    }

    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileInfo').style.display = 'flex';
    document.getElementById('uploadArea').style.display = 'none';

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellFormula: false });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];

            // Detectar la fila real de encabezados buscando columnas conocidas
            const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
            const columnasConocidas = ['CZ-Zona', 'Consec.', 'Zona', 'Activas', 'PPDD', 'Nuevas', 'Campaña'];
            let headerRow = 0;

            for (let R = range.s.r; R <= Math.min(range.e.r, 20); R++) {
                let matches = 0;
                for (let C = range.s.c; C <= range.e.c; C++) {
                    const cell = sheet[XLSX.utils.encode_cell({ r: R, c: C })];
                    if (cell && cell.v && columnasConocidas.includes(String(cell.v).trim())) {
                        matches++;
                    }
                }
                if (matches >= 3) {
                    headerRow = R;
                    console.log('Fila de encabezados detectada en fila:', R + 1);
                    break;
                }
            }

            // Si la fila de encabezados no es la primera, ajustar el rango
            if (headerRow > 0) {
                range.s.r = headerRow;
                sheet['!ref'] = XLSX.utils.encode_range(range);
            }

            // Forzar valores en celdas con formula
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

            const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });

            if (jsonData.length === 0) {
                showMessage('seguimientoMsg', 'El archivo esta vacio', 'error');
                return;
            }

            console.log('Columnas detectadas:', Object.keys(jsonData[0]));
            console.log('Primera fila:', jsonData[0]);
            console.log('Total filas:', jsonData.length);

            parsedExcelData = jsonData;
            showPreview(jsonData);
        } catch (err) {
            showMessage('seguimientoMsg', 'Error al leer el archivo: ' + err.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

function showPreview(data) {
    const container = document.getElementById('previewContainer');
    const columns = Object.keys(data[0]);
    const previewRows = data.slice(0, 20);

    // Stats
    const zonasEncontradas = [...new Set(data.map(r => r.Zona || r.zona || '').filter(Boolean))];
    document.getElementById('previewStats').innerHTML = `
        <div class="stat"><strong>${data.length}</strong> filas totales</div>
        <div class="stat"><strong>${columns.length}</strong> columnas</div>
        <div class="stat"><strong>${zonasEncontradas.length}</strong> zonas encontradas</div>
        <div class="stat">Mostrando <strong>${previewRows.length}</strong> de ${data.length} filas</div>
    `;

    // Table header
    document.getElementById('headPreview').innerHTML = '<tr>' +
        columns.map(c => `<th>${c}</th>`).join('') + '</tr>';

    // Table body
    document.getElementById('bodyPreview').innerHTML = previewRows.map(row =>
        '<tr>' + columns.map(c => `<td>${row[c] != null ? row[c] : ''}</td>`).join('') + '</tr>'
    ).join('');

    container.style.display = 'block';
}

async function confirmarCarga() {
    if (!parsedExcelData || parsedExcelData.length === 0) {
        showMessage('seguimientoMsg', 'No hay datos para cargar', 'error');
        return;
    }

    // Agregar fecha de carga y derivar campana de cada fila del Excel
    const fechaCarga = new Date().toISOString().split('T')[0];
    const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    // Derivar campanaAsignada de la columna Campaña del Excel (ej: "PADRES 2026" -> "PADRES")
    const dataConFecha = parsedExcelData.map(row => {
        const campExcel = row['Campaña'] || row['Campana'] || '';
        const campMatch = APP.campanas.find(c => norm(campExcel).includes(norm(c))) || campExcel;
        return { ...row, fechaCarga, campanaAsignada: campMatch };
    });

    // Reemplazar datos de las campanas que vienen en el archivo (no acumular)
    const campanasEnArchivo = [...new Set(dataConFecha.map(r => norm(r.campanaAsignada)))];
    APP.data.seguimiento = APP.data.seguimiento.filter(r => {
        const camp = norm(r.campanaAsignada || r['Campaña'] || r['Campana'] || '');
        return !campanasEnArchivo.some(c => camp.includes(c));
    });
    APP.data.seguimiento = APP.data.seguimiento.concat(dataConFecha);
    saveLocalData();

    // Enviar a Google Sheets
    if (APP.sheetUrl) {
        try {
            const result = await postSheet('saveSeguimiento', { registros: dataConFecha });
            if (result.success) {
                showMessage('seguimientoMsg', `${dataConFecha.length} registros cargados exitosamente a Google Sheets`, 'success');
            } else {
                showMessage('seguimientoMsg', 'Datos guardados localmente. Error en Sheets: ' + (result.error || ''), 'error');
            }
        } catch (err) {
            showMessage('seguimientoMsg', 'Datos guardados localmente. Error con Sheets: ' + err.message, 'info');
        }
    } else {
        showMessage('seguimientoMsg', `${dataConFecha.length} registros guardados localmente. Configura Google Sheets para respaldo.`, 'info');
    }

    resetUpload();
}

function resetUpload() {
    parsedExcelData = null;
    document.getElementById('fileInput').value = '';
    document.getElementById('fileInfo').style.display = 'none';
    document.getElementById('previewContainer').style.display = 'none';
    document.getElementById('uploadArea').style.display = '';
}
