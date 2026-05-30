// ======================================================
// Google Apps Script - API para Seguimiento Comercial
// ======================================================
// INSTRUCCIONES:
// 1. Crea un Google Sheet nuevo
// 2. Crea dos hojas: "Metas" y "Seguimiento"
// 3. Ve a Extensiones > Apps Script
// 4. Borra el contenido y pega TODO este codigo
// 5. Clic en "Implementar" > "Nueva implementacion"
// 6. Tipo: "Aplicacion web"
// 7. Ejecutar como: "Yo" (tu cuenta)
// 8. Acceso: "Cualquier persona"
// 9. Clic en "Implementar" y copia la URL
// 10. Pega la URL en la pagina web (boton Configurar Sheets)
// ======================================================

function doGet(e) {
  var action = e.parameter.action;

  try {
    if (action === 'getMetas') {
      return handleGetMetas(e.parameter);
    }
    if (action === 'getSeguimiento') {
      return handleGetSeguimiento(e.parameter);
    }
    return jsonResponse({ success: false, error: 'Accion no reconocida: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;

    if (action === 'saveMetas') {
      return handleSaveMetas(body.data);
    }
    if (action === 'saveSeguimiento') {
      return handleSaveSeguimiento(body.data);
    }
    return jsonResponse({ success: false, error: 'Accion no reconocida: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ===== Metas =====
function handleGetMetas(params) {
  var anio = params.anio;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Metas');

  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('Metas');
    sheet.appendRow(['campana', 'anio', 'zona', 'Consec.', '% Consec.', 'Nuevas',
      'Estencil Pas', 'Crecimiento', 'PPDD', 'Recuperada', 'Reingresos', 'Vr. Venta', 'VOP']);
  }

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var result = [];

  for (var i = 1; i < data.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      row[headers[j]] = data[i][j];
    }
    if (String(row.campana) === String(params.campana) && String(row.anio) === String(anio)) {
      result.push(row);
    }
  }

  return jsonResponse({ success: true, data: result });
}

function handleSaveMetas(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Metas');

  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('Metas');
  }

  var campana = data.campana;
  var anio = data.anio;
  var metas = data.metas;
  var headers = ['campana', 'anio', 'zona', 'Consec.', '% Consec.', 'Nuevas',
    'Estencil Pas', 'Crecimiento', 'PPDD', 'Recuperada', 'Reingresos', 'Vr. Venta', 'VOP'];

  // Limpiar datos existentes de la misma campana/anio
  var existingData = sheet.getDataRange().getValues();
  var rowsToKeep = [headers];

  for (var i = 1; i < existingData.length; i++) {
    if (!(String(existingData[i][0]) === String(campana) && String(existingData[i][1]) === String(anio))) {
      rowsToKeep.push(existingData[i]);
    }
  }

  // Agregar nuevos datos
  for (var k = 0; k < metas.length; k++) {
    var m = metas[k];
    rowsToKeep.push([
      campana, anio, m.zona,
      m['Consec.'] || 0, m['% Consec.'] || 0, m['Nuevas'] || 0,
      m['Estencil Pas'] || 0, m['Crecimiento'] || 0, m['PPDD'] || 0,
      m['Recuperada'] || 0, m['Reingresos'] || 0, m['Vr. Venta'] || 0, m['VOP'] || 0
    ]);
  }

  sheet.clearContents();
  sheet.getRange(1, 1, rowsToKeep.length, headers.length).setValues(rowsToKeep);

  return jsonResponse({ success: true, message: 'Metas guardadas: ' + metas.length + ' zonas' });
}

// ===== Seguimiento =====
function handleGetSeguimiento(params) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Seguimiento');

  if (!sheet) {
    return jsonResponse({ success: true, data: [] });
  }

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var result = [];

  for (var i = 1; i < data.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      row[headers[j]] = data[i][j];
    }
    result.push(row);
  }

  // Filtrar por zona si se especifica
  if (params.zona) {
    result = result.filter(function(r) {
      return r.Zona === params.zona || r.zona === params.zona;
    });
  }

  return jsonResponse({ success: true, data: result });
}

function handleSaveSeguimiento(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Seguimiento');
  var registros = data.registros;

  if (!registros || registros.length === 0) {
    return jsonResponse({ success: false, error: 'No hay registros para guardar' });
  }

  var headers = Object.keys(registros[0]);

  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('Seguimiento');
    sheet.appendRow(headers);
  } else {
    // Verificar si los headers coinciden
    var existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (existingHeaders.length === 0 || existingHeaders[0] === '') {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  }

  // Agregar filas
  var rows = registros.map(function(r) {
    return headers.map(function(h) {
      return r[h] != null ? r[h] : '';
    });
  });

  var lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, rows.length, headers.length).setValues(rows);

  return jsonResponse({
    success: true,
    message: 'Seguimiento guardado: ' + registros.length + ' registros'
  });
}

// ===== Utilidades =====
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
