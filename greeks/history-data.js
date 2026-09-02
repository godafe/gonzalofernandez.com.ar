'use strict';

// Módulo independiente para carga y parseo de datos históricos de opciones GGAL.
// No depende de ningún archivo fuera de esta carpeta.
// Comparte la misma IndexedDB que stats/index.html (panel-ggal-cache / history-HMD)
// para evitar fetch redundante cuando el usuario ya visitó ese panel.

// ── Constantes de vencimiento ────────────────────────────────────
const VENCIMIENTO_MAP = {
  'FE': 'FE', 'AB': 'AB', 'JU': 'JU', 'AG': 'AG', 'OC': 'OC', 'DI': 'DI',
  'F':  'FE', 'A':  'AB', 'J':  'JU', 'G':  'AG', 'O':  'OC', 'D':  'DI'
};
const VENCIMIENTO_LABELS = {
  'FE': 'Febrero', 'AB': 'Abril', 'JU': 'Junio',
  'AG': 'Agosto',  'OC': 'Octubre', 'DI': 'Diciembre'
};
const VENCIMIENTO_MONTHS = {
  'FE': 1, 'AB': 3, 'JU': 5, 'AG': 7, 'OC': 9, 'DI': 11
};

// ── IndexedDB ────────────────────────────────────────────────────
const BT_DB_NAME    = 'panel-ggal-cache';
const BT_DB_VERSION = 1;
const BT_DB_STORE   = 'datasets';
const BT_DB_KEY     = 'history-HMD';
const BT_API_URL    = 'https://script.google.com/macros/s/AKfycbx3U-DXD4soaIA1UjDnkCBu5c7DHxW8eptZiaHYMdH-HMyhAcDy_TT4mT-R9YLZfrxU/exec?endpoint=history&sheet=HMD';

function openBtDb() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(BT_DB_NAME, BT_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BT_DB_STORE)) {
        db.createObjectStore(BT_DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror  = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB'));
  });
}

async function readBtCachedPayload() {
  const db = await openBtDb();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(BT_DB_STORE, 'readonly');
    const store = tx.objectStore(BT_DB_STORE);
    const req   = store.get(BT_DB_KEY);
    req.onsuccess = () => { db.close(); resolve(req.result?.payload ?? null); };
    req.onerror   = () => { db.close(); reject(req.error ?? new Error('Error lectura IndexedDB')); };
  });
}

async function writeBtCachedPayload(payload) {
  const db = await openBtDb();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(BT_DB_STORE, 'readwrite');
    const store = tx.objectStore(BT_DB_STORE);
    const req   = store.put({ payload, savedAt: new Date().toISOString() }, BT_DB_KEY);
    req.onsuccess = () => { db.close(); resolve(); };
    req.onerror   = () => { db.close(); reject(req.error ?? new Error('Error escritura IndexedDB')); };
  });
}

// ── Helpers de parseo ────────────────────────────────────────────
function parseLocaleNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value !== 'string') return Number.isFinite(value) ? value : NaN;
  const s = value.replace(/\$/g, '').replace(/\s/g, '').trim();
  if (!s) return NaN;
  const hasComma = s.includes(',');
  const hasDot   = s.includes('.');
  if (hasComma && hasDot) {
    return s.lastIndexOf(',') > s.lastIndexOf('.')
      ? Number(s.replace(/\./g, '').replace(/,/g, '.'))
      : Number(s.replace(/,/g, ''));
  }
  if (hasComma) return Number(s.replace(/\./g, '').replace(/,/g, '.'));
  return Number(s);
}

function strikeKey(value) {
  return String(Math.round(Number(value)));
}

function getVencimientoFromTicker(especie) {
  const suffix = especie.replace(/^[A-Z]+\d+/, '');
  return VENCIMIENTO_MAP[suffix] ?? null;
}

// Retorna el 3er viernes del mes del vencimiento en el año dado.
// VENCIMIENTO_MONTHS usa índices 0-based de JS (FE=1=Feb, AB=3=Apr, …, OC=9=Oct, DI=11=Dec).
function opexDateForVencCode(vencCode, year) {
  const month = VENCIMIENTO_MONTHS[vencCode];
  if (month === undefined) return null;
  const d = new Date(year, month, 1);
  d.setDate(1 + (5 - d.getDay() + 7) % 7 + 14);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function normalizeSourceRow(rawRow) {
  const fechaRaw = String(rawRow[0] ?? '').trim();
  const especie  = String(rawRow[1] ?? '').trim();
  const last     = parseLocaleNumber(rawRow[2]);
  const strike   = parseLocaleNumber(rawRow[4]);
  const type     = String(rawRow[5] ?? '').trim().toLowerCase();

  if (!fechaRaw || !especie || !Number.isFinite(last)) return null;

  const isCall = type === 'call';
  const isPut  = type === 'put';

  return {
    fechaRaw,
    especie,
    type,
    strike,
    last,
    isUnderlying: especie === 'GGAL' || type === 'subyacente',
    isCall,
    isPut,
    vencimiento: (isCall || isPut) ? getVencimientoFromTicker(especie) : null
  };
}

function parseHistoryPayload(payload, vencimientoFilter = null) {
  if (!payload || !Array.isArray(payload.values) || payload.values.length < 2) {
    return { historyByDate: [], availableStrikes: [], availableVencimientos: [], sourceStats: { totalRows: 0, totalDates: 0 } };
  }

  const strikes     = new Set();
  const vencimientos = new Set();
  const byDate      = new Map();
  let totalRows     = 0;

  payload.values.slice(1).forEach(rawRow => {
    const row = normalizeSourceRow(rawRow);
    if (!row) return;

    if ((row.isCall || row.isPut) && row.vencimiento) {
      vencimientos.add(row.vencimiento);
      if (vencimientoFilter && row.vencimiento !== vencimientoFilter) return;
    }

    totalRows++;

    if (!byDate.has(row.fechaRaw)) {
      byDate.set(row.fechaRaw, { fechaRaw: row.fechaRaw, ggal: NaN, calls: {}, puts: {} });
    }

    const entry = byDate.get(row.fechaRaw);

    if (row.isUnderlying) { entry.ggal = row.last; return; }
    if (row.isCall && Number.isFinite(row.strike)) { entry.calls[strikeKey(row.strike)] = row.last; strikes.add(row.strike); return; }
    if (row.isPut  && Number.isFinite(row.strike)) { entry.puts[strikeKey(row.strike)]  = row.last; strikes.add(row.strike); }
  });

  return {
    historyByDate: Array.from(byDate.values()),
    availableStrikes: Array.from(strikes).sort((a, b) => a - b),
    availableVencimientos: Array.from(vencimientos).sort(),
    sourceStats: { totalRows, totalDates: byDate.size, source: 'remote' }
  };
}

// ── Carga orquestada ─────────────────────────────────────────────

async function fetchAndCacheHistoryPayload() {
  const res = await fetch(BT_API_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const payload = await res.json();
  try { await writeBtCachedPayload(payload); } catch (_) { /* caché opcional */ }
  return payload;
}

// Retorna el payload crudo (desde caché o fetch).
// onProgress(msg) se llama con mensajes de estado opcionales.
async function loadHistoryPayload(onProgress) {
  const notify = typeof onProgress === 'function' ? onProgress : () => {};
  let payload = null;

  try {
    notify('Buscando datos en caché…');
    payload = await readBtCachedPayload();
  } catch (_) { /* ignorar error de IndexedDB, ir a fetch */ }

  if (payload) {
    notify('Datos cargados desde caché.');
    return payload;
  }

  notify('Descargando datos históricos…');
  payload = await fetchAndCacheHistoryPayload();
  notify('Datos descargados correctamente.');
  return payload;
}
