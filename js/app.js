// ===== Configuracion Global =====
const APP = {
    sheetUrl: localStorage.getItem('sheetUrl') || '',
    zonas: [
        'Aguazul', 'Arauca', 'Bogota 3', 'Bogota 6', 'Bogota 13', 'Bogota 14',
        'Bogota 30', 'Bogota 32', 'Bogota - Suba 2', 'Chiquinquirá', 'Duitama',
        'Sogamoso', 'Tunja', 'Valledupar 2', 'Valledupar', 'Yopal 1'
    ],
    kpis: ['Consec.', '% Consec.', 'Nuevas', 'Estencil Pas', 'Crecimiento', 'PPDD', 'Recuperada', 'Reingresos', 'Vr. Venta', 'VOP'],
    campanas: ['MADRES', 'MODA', 'MUJER', 'COLEGIAL', 'NAVIDAD', 'PRE-NAVIDAD', 'AMOR Y AMISTAD', 'VERANO', 'PADRES'],
    // Datos en memoria (respaldo local)
    data: {
        metas: {},       // { "2026-01": [ {zona, kpi1, kpi2...}, ... ] }
        seguimiento: []  // [ {fecha, zona, ...campos} ]
    }
};

// ===== Inicializacion =====
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initSelectors();
    initConfigModal();
    loadLocalData();
    updateConnectionStatus();
});

// ===== Navegacion =====
function initNavigation() {
    const menuItems = document.querySelectorAll('.sidebar-menu li');
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const module = item.dataset.module;
            menuItems.forEach(m => m.classList.remove('active'));
            item.classList.add('active');
            document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
            document.getElementById('module-' + module).classList.add('active');
            // Cerrar sidebar en mobile
            document.getElementById('sidebar').classList.remove('open');
        });
    });

    // Mobile toggle
    document.getElementById('menuToggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });

    // Cerrar sidebar al hacer clic fuera (mobile)
    document.getElementById('mainContent').addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('open');
    });
}

// ===== Selectores de mes/anio =====
function initSelectors() {
    const campanaSelects = document.querySelectorAll('#metaCampana, #zonaMetaCampana, #dashCampana, #segCampana');
    const anioSelects = document.querySelectorAll('#metaAnio, #zonaMetaAnio, #dashAnio, #segAnio');
    const now = new Date();

    campanaSelects.forEach(sel => {
        APP.campanas.forEach(campana => {
            const opt = document.createElement('option');
            opt.value = campana;
            opt.textContent = campana;
            sel.appendChild(opt);
        });
    });

    anioSelects.forEach(sel => {
        for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            if (y === now.getFullYear()) opt.selected = true;
            sel.appendChild(opt);
        }
    });
}

// ===== Modal de Configuracion =====
function initConfigModal() {
    const modal = document.getElementById('modalConfig');
    const input = document.getElementById('inputSheetUrl');

    document.getElementById('btnConfigSheet').addEventListener('click', () => {
        input.value = APP.sheetUrl;
        modal.style.display = 'flex';
    });

    document.getElementById('btnCloseModal').addEventListener('click', () => {
        modal.style.display = 'none';
    });

    document.getElementById('btnSaveConfig').addEventListener('click', () => {
        APP.sheetUrl = input.value.trim();
        localStorage.setItem('sheetUrl', APP.sheetUrl);
        modal.style.display = 'none';
        updateConnectionStatus();
        showMessage('metasMsg', 'URL de Google Sheets guardada correctamente.', 'success');
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });
}

// ===== Estado de conexion =====
function updateConnectionStatus() {
    const el = document.getElementById('connectionStatus');
    if (APP.sheetUrl) {
        el.classList.add('connected');
        el.innerHTML = '<i class="fas fa-circle"></i><span>Conectado a Sheets</span>';
    } else {
        el.classList.remove('connected');
        el.innerHTML = '<i class="fas fa-circle"></i><span>Sin conexion a Sheets</span>';
    }
}

// ===== Comunicacion con Google Sheets =====
async function fetchSheet(action, params = {}) {
    if (!APP.sheetUrl) {
        throw new Error('No hay URL de Google Sheets configurada. Usa el boton "Configurar Sheets".');
    }
    const url = new URL(APP.sheetUrl);
    url.searchParams.set('action', action);
    Object.entries(params).forEach(([k, v]) => {
        url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : v);
    });

    try {
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error('Error de red: ' + res.status);
        return await res.json();
    } catch (err) {
        console.error('fetchSheet error:', err);
        throw err;
    }
}

async function postSheet(action, data) {
    if (!APP.sheetUrl) {
        throw new Error('No hay URL de Google Sheets configurada. Usa el boton "Configurar Sheets".');
    }
    try {
        const res = await fetch(APP.sheetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action, data })
        });
        if (!res.ok) throw new Error('Error de red: ' + res.status);
        return await res.json();
    } catch (err) {
        console.error('postSheet error:', err);
        throw err;
    }
}

// ===== Almacenamiento Local (respaldo) =====
function saveLocalData() {
    localStorage.setItem('appData', JSON.stringify(APP.data));
}

function loadLocalData() {
    const stored = localStorage.getItem('appData');
    if (stored) {
        try {
            APP.data = JSON.parse(stored);
        } catch (e) {
            console.error('Error cargando datos locales:', e);
        }
    }
}

// ===== Utilidades =====
function showMessage(containerId, text, type = 'info') {
    const container = document.getElementById(containerId);
    if (!container) return;
    const icons = { success: 'check-circle', error: 'exclamation-circle', info: 'info-circle' };
    container.innerHTML = `<div class="msg msg-${type}"><i class="fas fa-${icons[type]}"></i> ${text}</div>`;
    setTimeout(() => { container.innerHTML = ''; }, 5000);
}

function getMetaKey(campana, anio) {
    return `${anio}-${campana}`;
}

function formatNumber(n, isPercent) {
    if (n == null || isNaN(n)) return '0';
    const val = Number(n);
    if (isPercent) {
        // Si viene como decimal (ej: 0.75), convertir a porcentaje
        const pct = val <= 1 && val > 0 ? val * 100 : val;
        return Math.round(pct) + '%';
    }
    return Math.round(val).toLocaleString('es-CO');
}

function calcPct(actual, meta) {
    if (!meta || meta === 0) return 0;
    return Math.round((actual / meta) * 100);
}

function semaforoClass(pct) {
    if (pct >= 90) return 'green';
    if (pct >= 60) return 'yellow';
    return 'red';
}

function semaforoCellClass(pct) {
    if (pct >= 90) return 'semaforo-green';
    if (pct >= 60) return 'semaforo-yellow';
    return 'semaforo-red';
}
