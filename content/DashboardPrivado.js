(function(){
  'use strict';

  const APP = {
    storageKey: 'dashboard_privado_config_v1',
    paramsStorageKey: 'dashboard_privado_params_v1',
    visibilityStorageKey: 'dashboard_privado_visibility_v1',
    viewStorageKey: 'dashboard_privado_view_v1',
    dbName: 'dashboard_privado_cache_v1',
    dbStore: 'sheet_cache',
    autoTimer: null,
    countdownTimer: null,
    nextRefreshAt: 0,
    state: {
      historyRows: [],
      liveSnapshot: null,
      availableBases: [],
      combinedRows: [],
      lastLoadedAt: 0,
      columnVisibility: {},
      params: {},
      viewMode: 'table',
      charts: {},
    },
  };

  const $ = (id) => document.getElementById(id);

  const DEFAULTS = {
    webAppUrl: 'https://script.google.com/macros/s/AKfycbzYrpSs7-4n9hL7SK15DeaDVbP8apabGGXQLVWf5h_u2kb3WB2xY5wpBBiD_N0bBGvX/exec',
    historySheet: 'HMD',
    liveSheet: 'DMD_Bot',
    autoSeconds: 0,
    hmdHeaderRow: 1,
    hmdColDate: 'A',
    hmdColLast: 'C',
    hmdColStrike: 'E',
    hmdColType: 'F',
    liveHeaderRow: 1,
    liveColStrike: 'A',
    liveColExpiry: 'G',
    liveColType: 'B',
    liveColLast: 'E',
    liveColChg: 'F',
  };

  const PARAM_DEFAULTS = {
    baseType: 'call',
    baseStrike: '',
    compareType: 'call',
    compareStrike: '',
    ri: '2.00',
    tlr: '30.00',
    lots: '2',
    threshold: '85',
    dateFrom: '',
    dateTo: '',
    compareLegs: [],
  };

  function readConfig(){
    try{
      const raw = JSON.parse(localStorage.getItem(APP.storageKey) || '{}');
      return {
        ...DEFAULTS,
        ...raw,
      };
    }catch(_error){
      return {...DEFAULTS};
    }
  }

  function writeConfig(config){
    localStorage.setItem(APP.storageKey, JSON.stringify(config));
  }

  function readColumnVisibility(){
    try{
      const raw = JSON.parse(localStorage.getItem(APP.visibilityStorageKey) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    }catch(_error){
      return {};
    }
  }

  function writeColumnVisibility(){
    localStorage.setItem(APP.visibilityStorageKey, JSON.stringify(APP.state.columnVisibility || {}));
  }

  function readViewMode(){
    const raw = String(localStorage.getItem(APP.viewStorageKey) || '').trim();
    return raw === 'chart' ? 'chart' : 'table';
  }

  function writeViewMode(){
    try{
      localStorage.setItem(APP.viewStorageKey, APP.state.viewMode || 'table');
    }catch(_error){}
  }

  function readParams(){
    try{
      const raw = JSON.parse(localStorage.getItem(APP.paramsStorageKey) || '{}');
      return {
        ...PARAM_DEFAULTS,
        ...(raw && typeof raw === 'object' ? raw : {}),
        compareLegs: Array.isArray(raw?.compareLegs) ? raw.compareLegs : [],
      };
    }catch(_error){
      return {...PARAM_DEFAULTS, compareLegs: []};
    }
  }

  function writeParams(){
    try{
      localStorage.setItem(APP.paramsStorageKey, JSON.stringify(APP.state.params || PARAM_DEFAULTS));
    }catch(_error){}
  }

  function configFromUi(){
    return {
      webAppUrl: $('cfg-webapp-url').value.trim(),
      historySheet: $('cfg-hmd-sheet').value.trim() || 'HMD',
      liveSheet: $('cfg-live-sheet').value.trim() || 'DMD_Bot',
      autoSeconds: parseInt($('cfg-auto-seconds').value || '0', 10) || 0,
      hmdHeaderRow: Math.max(1, parseInt($('cfg-hmd-header-row').value || '1', 10) || 1),
      hmdColDate: ($('cfg-hmd-col-date').value || 'A').trim().toUpperCase(),
      hmdColLast: ($('cfg-hmd-col-last').value || 'C').trim().toUpperCase(),
      hmdColStrike: ($('cfg-hmd-col-strike').value || 'E').trim().toUpperCase(),
      hmdColType: ($('cfg-hmd-col-type').value || 'F').trim().toUpperCase(),
      liveHeaderRow: Math.max(1, parseInt($('cfg-live-header-row').value || '1', 10) || 1),
      liveColStrike: ($('cfg-live-col-strike').value || 'A').trim().toUpperCase(),
      liveColExpiry: ($('cfg-live-col-expiry').value || 'G').trim().toUpperCase(),
      liveColType: ($('cfg-live-col-type').value || 'B').trim().toUpperCase(),
      liveColLast: ($('cfg-live-col-last').value || 'E').trim().toUpperCase(),
      liveColChg: ($('cfg-live-col-chg').value || 'F').trim().toUpperCase(),
    };
  }

  function applyConfigToUi(config){
    $('cfg-webapp-url').value = config.webAppUrl || DEFAULTS.webAppUrl;
    $('cfg-hmd-sheet').value = config.historySheet || 'HMD';
    $('cfg-live-sheet').value = config.liveSheet || 'DMD_Bot';
    $('cfg-auto-seconds').value = String(config.autoSeconds || 0);
    $('cfg-hmd-header-row').value = String(config.hmdHeaderRow || 1);
    $('cfg-hmd-col-date').value = config.hmdColDate || 'A';
    $('cfg-hmd-col-last').value = config.hmdColLast || 'C';
    $('cfg-hmd-col-strike').value = config.hmdColStrike || 'E';
    $('cfg-hmd-col-type').value = config.hmdColType || 'F';
    $('cfg-live-header-row').value = String(config.liveHeaderRow || 1);
    $('cfg-live-col-strike').value = config.liveColStrike || 'A';
    $('cfg-live-col-expiry').value = config.liveColExpiry || 'G';
    $('cfg-live-col-type').value = config.liveColType || 'B';
    $('cfg-live-col-last').value = config.liveColLast || 'E';
    $('cfg-live-col-chg').value = config.liveColChg || 'F';
  }

  function setStatus(text){
    $('status-text').textContent = text;
  }

  function setLastRefreshLabel(text){
    const el = $('status-data');
    if (el && !el.textContent) el.textContent = text;
  }

  function renderRefreshCountdown(){
    const el = $('status-countdown');
    if (!el) return;
    if (!APP.nextRefreshAt){
      el.textContent = 'Manual';
      return;
    }
    const remainingMs = APP.nextRefreshAt - Date.now();
    if (remainingMs <= 0){
      el.textContent = 'Ahora';
      return;
    }
    const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
    el.textContent = `${seconds}s`;
  }

  function fmtNum(value, decimals = 2){
    if (value == null || !isFinite(value)) return '--';
    return Number(value).toLocaleString('es-AR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function fmtMoney(value, decimals = 2){
    if (value == null || !isFinite(value)) return '--';
    return '$' + fmtNum(value, decimals);
  }

  function fmtPct(value, decimals = 2){
    if (value == null || !isFinite(value)) return '--';
    return fmtNum(value, decimals) + '%';
  }

  function fmtStrike(value){
    return fmtNum(value, 2);
  }

  function legTypeShort(type){
    return String(type || '').toLowerCase() === 'put' ? 'P' : 'C';
  }

  function strikeShortLabel(strike){
    const numeric = Math.round(Math.abs(parseARSNum(strike) || 0));
    const digits = String(numeric).replace(/\D/g, '');
    return numeric >= 10000 ? (digits.slice(0, 3) || '--') : (digits.slice(0, 2) || '--');
  }

  function strikeHeaderLabel(strike){
    const numeric = Math.abs(parseARSNum(strike) || 0);
    return numeric >= 10000 ? strikeShortLabel(strike) : fmtStrike(strike);
  }

  function fmtSigned(value, decimals = 2){
    if (value == null || !isFinite(value)) return '--';
    const prefix = value > 0 ? '+' : '';
    return prefix + fmtNum(value, decimals);
  }

  function escapeHtml(value){
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function colLetterToIndex(col){
    const src = String(col || '').trim().toUpperCase();
    if (!src) return 0;
    if (!isNaN(src)) return Math.max(0, parseInt(src, 10) - 1);
    let index = 0;
    for (let i = 0; i < src.length; i++) index = (index * 26) + (src.charCodeAt(i) - 64);
    return Math.max(0, index - 1);
  }

  function normalizeExpiry(value){
    const src = String(value || '').trim();
    if (!src) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(src)) return src;
    const parts = src.split(/[\/\-]/);
    if (parts.length === 3){
      if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      const year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
      return `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return src;
  }

  function normCDF(x){
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const scaled = Math.abs(x) / Math.SQRT2;
    const t = 1 / (1 + (p * scaled));
    const y = 1 - (((((a5 * t) + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-scaled * scaled);
    return 0.5 * (1 + (sign * y));
  }

  function normPDF(x){
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  function bs(S, K, T, r, q, sigma, type){
    if (!isFinite(S) || !isFinite(K) || !isFinite(T) || !isFinite(sigma) || S <= 0 || K <= 0 || T < 0 || sigma <= 0) return null;
    if (T <= 0){
      const intrinsic = type === 'put' ? Math.max(K - S, 0) : Math.max(S - K, 0);
      return {price: intrinsic, delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0};
    }
    const st = Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * st);
    const d2 = d1 - (sigma * st);
    const eqT = Math.exp(-q * T);
    const erT = Math.exp(-r * T);
    if (type === 'put'){
      return {
        price: (K * erT * normCDF(-d2)) - (S * eqT * normCDF(-d1)),
        delta: -eqT * normCDF(-d1),
        gamma: eqT * normPDF(d1) / (S * sigma * st),
        theta: (-S * eqT * normPDF(d1) * sigma / (2 * st) + r * K * erT * normCDF(-d2) - q * S * eqT * normCDF(-d1)) / 365,
        vega: S * eqT * normPDF(d1) * st / 100,
        rho: -K * T * erT * normCDF(-d2) / 100,
      };
    }
    return {
      price: S * eqT * normCDF(d1) - K * erT * normCDF(d2),
      delta: eqT * normCDF(d1),
      gamma: eqT * normPDF(d1) / (S * sigma * st),
      theta: (-S * eqT * normPDF(d1) * sigma / (2 * st) - r * K * erT * normCDF(d2) + q * S * eqT * normCDF(d1)) / 365,
      vega: S * eqT * normPDF(d1) * st / 100,
      rho: K * T * erT * normCDF(d2) / 100,
    };
  }

  function impliedVol(S, K, T, r, q, mktPrice, type){
    if (!isFinite(S) || !isFinite(K) || !isFinite(T) || !isFinite(mktPrice) || S <= 0 || K <= 0 || T <= 0 || mktPrice <= 0) return null;
    const tol = 0.01;
    const maxIter = 200;
    const lo0 = 0.001;
    const hi0 = 5.0;
    const priceAt = (sigma) => bs(S, K, T, r, q, sigma, type)?.price ?? NaN;
    let lo = lo0;
    let hi = hi0;
    let plo = priceAt(lo) - mktPrice;
    let phi = priceAt(hi) - mktPrice;
    if (!isFinite(plo) || !isFinite(phi)) return null;

    if (plo * phi > 0){
      let hiTry = hi;
      for (let j = 0; j < 6 && plo * phi > 0; j++){
        hiTry *= 1.5;
        if (hiTry > 10) break;
        hi = hiTry;
        phi = priceAt(hi) - mktPrice;
      }
    }

    let sigma = 0.5;
    if (plo * phi <= 0) sigma = (lo + hi) / 2;

    for (let i = 0; i < maxIter; i++){
      const greeks = bs(S, K, T, r, q, sigma, type);
      if (!greeks) return null;
      const diff = greeks.price - mktPrice;
      if (Math.abs(diff) < tol) return sigma;

      if (plo * phi <= 0){
        if (diff > 0){
          hi = sigma;
          phi = diff;
        }else{
          lo = sigma;
          plo = diff;
        }
      }

      const v = greeks.vega * 100;
      let next = sigma;
      if (Math.abs(v) > 1e-10){
        next = sigma - (diff / v);
      }else if (plo * phi <= 0){
        next = (lo + hi) / 2;
      }

      if (plo * phi <= 0 && (next <= lo || next >= hi)) next = (lo + hi) / 2;
      sigma = Math.min(Math.max(next, lo0), hi);
    }

    if (plo * phi <= 0) return (lo + hi) / 2;
    return sigma;
  }

  function calcOptionGreeks(price, strike, type, spot, dateIso, expiryIso, tlrPct){
    if (!isFinite(price) || price <= 0 || !isFinite(strike) || strike <= 0 || !isFinite(spot) || spot <= 0 || !dateIso || !expiryIso) return null;
    const baseMs = new Date(`${dateIso}T12:00:00`).getTime();
    const expiryMs = new Date(`${expiryIso}T12:00:00`).getTime();
    if (!isFinite(baseMs) || !isFinite(expiryMs)) return null;
    const T = Math.max(0, (expiryMs - baseMs) / 86400000) / 365;
    if (T <= 0) return null;
    const r = (parseFloat(tlrPct || '0') || 0) / 100;
    const iv = impliedVol(spot, strike, T, r, 0, price, type);
    if (!isFinite(iv) || iv <= 0) return null;
    const greeks = bs(spot, strike, T, r, 0, iv, type);
    if (!greeks) return null;
    return {
      delta: greeks.delta ?? null,
      vega: greeks.vega ?? null,
    };
  }

  function formatDateDisplay(dateIso){
    if (!dateIso) return '--';
    const parts = String(dateIso).split('-');
    if (parts.length !== 3) return dateIso;
    return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
  }

  function todayIso(){
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function parseARSNum(value){
    if (value == null || value === '') return NaN;
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    const src = String(value).trim().replace(/\s+/g, '');
    if (!src) return NaN;
    if (/^-?\d+(\.\d+)?$/.test(src)) return parseFloat(src);
    if (/^-?\d+(,\d+)?$/.test(src)) return parseFloat(src.replace(',', '.'));
    const lastComma = src.lastIndexOf(',');
    const lastDot = src.lastIndexOf('.');
    if (lastComma > lastDot){
      return parseFloat(src.replace(/\./g, '').replace(',', '.'));
    }
    return parseFloat(src.replace(/,/g, ''));
  }

  function parseARSPrice(value){
    return parseARSNum(value);
  }

  function isReasonableSpotAgainstStrikes(spot, strikes){
    if (!isFinite(spot) || spot <= 0) return false;
    const clean = (strikes || []).filter((value) => isFinite(value) && value > 0).sort((a, b) => a - b);
    if (!clean.length) return true;
    const minStrike = clean[0];
    const maxStrike = clean[clean.length - 1];
    return spot >= (minStrike * 0.35) && spot <= (maxStrike * 1.65);
  }

  function nearestStrikeToSpot(strikes, spot){
    const clean = (strikes || []).filter((value) => isFinite(value) && value > 0);
    if (!clean.length || !isFinite(spot) || spot <= 0) return null;
    return clean.reduce((best, current) => {
      if (best == null) return current;
      return Math.abs(current - spot) < Math.abs(best - spot) ? current : best;
    }, null);
  }

  function sheetEndpoint(sheet){
    const name = String(sheet || '').trim();
    if (/^HMD$/i.test(name)) return 'history';
    if (/intra/i.test(name)) return 'intraday';
    return 'live';
  }

  async function fetchSheetRows(webAppUrl, sheet){
    const endpoint = sheetEndpoint(sheet);
    const url = `${webAppUrl}?endpoint=${encodeURIComponent(endpoint)}&sheet=${encodeURIComponent(sheet)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data && data.error) throw new Error(data.error);
    const rows = Array.isArray(data?.values) ? data.values : data;
    if (!Array.isArray(rows) || !rows.length) throw new Error(`Sin datos en la hoja ${sheet}`);
    return rows;
  }

  function cacheKey(webAppUrl, sheet){
    return `${webAppUrl}::${sheet}`;
  }

  function openDb(){
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(APP.dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(APP.dbStore)) db.createObjectStore(APP.dbStore, {keyPath: 'id'});
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('No se pudo abrir IndexedDB'));
    });
  }

  async function cacheRead(webAppUrl, sheet){
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(APP.dbStore, 'readonly');
      const store = tx.objectStore(APP.dbStore);
      const req = store.get(cacheKey(webAppUrl, sheet));
      req.onsuccess = () => {
        db.close();
        resolve(req.result || null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error || new Error('No se pudo leer cache'));
      };
    });
  }

  async function cacheWrite(webAppUrl, sheet, rows){
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(APP.dbStore, 'readwrite');
      const store = tx.objectStore(APP.dbStore);
      const payload = {
        id: cacheKey(webAppUrl, sheet),
        webAppUrl,
        sheet,
        rows,
        fetchedAt: Date.now(),
      };
      const req = store.put(payload);
      req.onsuccess = () => {
        db.close();
        resolve(payload);
      };
      req.onerror = () => {
        db.close();
        reject(req.error || new Error('No se pudo guardar cache'));
      };
    });
  }

  async function cacheClearAll(){
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(APP.dbStore, 'readwrite');
      const store = tx.objectStore(APP.dbStore);
      const req = store.clear();
      req.onsuccess = () => {
        db.close();
        resolve(true);
      };
      req.onerror = () => {
        db.close();
        reject(req.error || new Error('No se pudo limpiar cache'));
      };
    });
  }

  function parseHistoryRows(rows, config){
    const dateIdx = colLetterToIndex(config.hmdColDate);
    const lastIdx = colLetterToIndex(config.hmdColLast);
    const strikeIdx = colLetterToIndex(config.hmdColStrike);
    const typeIdx = colLetterToIndex(config.hmdColType);
    const headerRowIdx = Math.max(0, (config.hmdHeaderRow || 1) - 1);
    const map = new Map();
    const strikes = new Set();
    const dataRows = rows.slice(headerRowIdx + 1);

    dataRows.forEach((row) => {
      if (!Array.isArray(row) || !row.length) return;
      const rawDate = normalizeExpiry(row[dateIdx]);
      if (!rawDate) return;
      const rawType = String(row[typeIdx] || '').trim().toLowerCase();
      const rawStrike = String(row[strikeIdx] || '').trim();
      const last = parseARSPrice(row[lastIdx]);
      if (!map.has(rawDate)) map.set(rawDate, {date: rawDate, spot: null, prices: {}});
      const bucket = map.get(rawDate);

      if (rawType === 'suby' || rawType === 'subyacente' || rawStrike.toUpperCase() === 'GGAL'){
        if (isFinite(last) && last > 0) bucket.spot = last;
        return;
      }

      const strike = parseARSNum(rawStrike);
      if (!isFinite(strike) || strike <= 0) return;
      const type = rawType.includes('put') || rawType === 'p' ? 'put' : 'call';
      strikes.add(strike);
      bucket.prices[`${type}_${strike}`] = isFinite(last) && last > 0 ? last : null;
    });

    return {
      rows: Array.from(map.values()).sort((a, b) => String(a.date).localeCompare(String(b.date))),
      strikes: Array.from(strikes).sort((a, b) => a - b),
    };
  }

  function normalizeFutureTicker(value){
    const src = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!src) return '';
    const match = src.match(/GGAL\/([A-Z]{3})(\d{2})/);
    return match ? `GGAL/${match[1]}${match[2]}` : src;
  }

  function parseLiveRowsChain(rows, config){
    const headerRowIdx = Math.max(0, (config.liveHeaderRow || 1) - 1);
    const headerRow = rows[headerRowIdx] || [];
    const autoMap = {};
    const synonyms = {
      symbol: ['symbol','simbolo','ticker','contract','contrato','especie'],
      strike: ['strike','ejercicio','base','k'],
      expiry: ['expiry','expiracion','vencimiento','vcto','venc'],
      type: ['tipo','type','cp','call_put'],
      last: ['last','ultimo','precio','cierre','spot','subyacente','ggal'],
      chg: ['chg','change','var','variacion'],
    };
    headerRow.forEach((cell, index) => {
      const normalized = String(cell || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().trim().replace(/\s+/g, '_');
      Object.keys(synonyms).forEach((key) => {
        if (synonyms[key].some((item) => normalized === item || normalized.startsWith(item))) autoMap[key] = index;
      });
    });

    const ci = {
      symbol: autoMap.symbol ?? -1,
      strike: autoMap.strike ?? colLetterToIndex(config.liveColStrike),
      expiry: autoMap.expiry ?? colLetterToIndex(config.liveColExpiry),
      type: autoMap.type ?? colLetterToIndex(config.liveColType),
      last: autoMap.last ?? colLetterToIndex(config.liveColLast),
      chg: autoMap.chg ?? colLetterToIndex(config.liveColChg),
    };

    const prices = {};
    const strikes = new Set();
    let spot = null;
    let spotChg = null;
    let future = null;
    let spotSource = '';
    let expiry = '';

    rows.slice(headerRowIdx + 1).forEach((row) => {
      if (!Array.isArray(row) || !row.length) return;
      const rawStrike = String(row[ci.strike] || '').trim();
      const rawType = String(row[ci.type] || '').trim().toUpperCase();
      const symbol = ci.symbol >= 0 ? String(row[ci.symbol] || '').trim() : '';
      const rawExpiry = normalizeExpiry(row[ci.expiry]);
      const last = parseARSPrice(row[ci.last]);
      const chg = parseARSNum(row[ci.chg]);

      if (rawType === 'SUBY' && rawStrike.toUpperCase() === 'GGAL'){
        if (isFinite(last) && last > 0) spot = last;
        if (isFinite(chg)) spotChg = chg;
        spotSource = `chain row: strike=${rawStrike || '--'} type=${rawType || '--'} lastCol=${config.liveColLast}`;
        return;
      }

      if (rawType === 'FUT' || rawType === 'FUTURO' || rawType === 'FWD'){
        future = {
          ticker: normalizeFutureTicker(symbol || rawStrike),
          last: isFinite(last) && last > 0 ? last : null,
        };
        return;
      }

      const strike = parseARSNum(rawStrike);
      if (!isFinite(strike) || strike <= 0) return;
      const type = rawType.toLowerCase().includes('put') || rawType.toLowerCase() === 'p' ? 'put' : 'call';
      if (!expiry && rawExpiry) expiry = rawExpiry;
      strikes.add(strike);
      prices[`${type}_${strike}`] = isFinite(last) && last > 0 ? last : null;
    });

    if (!Object.keys(prices).length && !isFinite(spot)) return null;

    return {
      source: 'chain',
      spot,
      spotChg,
      spotSource,
      future,
      expiry,
      prices,
      strikes: Array.from(strikes).sort((a, b) => a - b),
      asOfLabel: 'En vivo',
    };
  }

  const SERIAL_EPOCH = Date.UTC(1899, 11, 30);

  function parseTimestamp(raw){
    if (raw instanceof Date && !Number.isNaN(raw.getTime())){
      const year = raw.getFullYear();
      const month = String(raw.getMonth() + 1).padStart(2, '0');
      const day = String(raw.getDate()).padStart(2, '0');
      const hour = String(raw.getHours()).padStart(2, '0');
      const minute = String(raw.getMinutes()).padStart(2, '0');
      return {date: `${year}-${month}-${day}`, time: `${hour}:${minute}`};
    }
    if (typeof raw === 'number' && Number.isFinite(raw)){
      return parseTimestamp(new Date(SERIAL_EPOCH + Math.round(raw * 86400000)));
    }
    const src = String(raw || '').trim();
    if (!src) return {date: '', time: ''};
    const timeMatch = src.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
    const dateMatch = src.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/);
    const date = normalizeExpiry(dateMatch ? dateMatch[1] : src.split(/\s+/)[0]);
    let time = timeMatch ? timeMatch[1] : '';
    if (time.length === 8 && time.endsWith(':00')) time = time.slice(0, 5);
    return {date, time};
  }

  function inferIntraType(ticker){
    const src = String(ticker || '').toUpperCase();
    if (src === 'GGAL') return 'underlying';
    if (src.includes('GFGC')) return 'call';
    if (src.includes('GFGV')) return 'put';
    if (src.includes('/')) return 'future';
    return '';
  }

  function parseLiveRowsIntraday(rows){
    if (!Array.isArray(rows) || rows.length < 2) return null;
    const headerRowIdx = 0;
    const ci = {
      datetime: 0,
      ticker: 1,
      last: 2,
      strike: 3,
    };
    const latestByKey = new Map();
    let lastTime = '';
    let spot = null;
    const strikes = new Set();
    let spotSource = '';

    rows.slice(headerRowIdx + 1).forEach((row) => {
      if (!Array.isArray(row) || !row.length) return;
      const ticker = String(row[ci.ticker] || '').trim();
      if (!ticker) return;
      const info = parseTimestamp(row[ci.datetime]);
      const type = inferIntraType(ticker);
      const last = parseARSPrice(row[ci.last]);
      const strike = parseARSNum(row[ci.strike]);
      const key = `${type}_${isFinite(strike) ? strike : ticker}`;
      if (info.time) lastTime = info.time;
      if (type === 'underlying'){
        if (isFinite(last) && last > 0) spot = last;
        spotSource = 'intraday fallback: ticker=GGAL last col C';
        return;
      }
      if ((type === 'call' || type === 'put') && isFinite(strike) && strike > 0){
        strikes.add(strike);
        latestByKey.set(key, {type, strike, last: isFinite(last) && last > 0 ? last : null});
      }
    });

    if (!latestByKey.size && !isFinite(spot)) return null;
    const prices = {};
    latestByKey.forEach((entry) => {
      prices[`${entry.type}_${entry.strike}`] = entry.last;
    });
    return {
      source: 'intraday',
      spot,
      spotChg: null,
      spotSource,
      future: null,
      expiry: '',
      prices,
      strikes: Array.from(strikes).sort((a, b) => a - b),
      asOfLabel: lastTime ? `En vivo ${lastTime}` : 'En vivo',
    };
  }

  function parseLiveRows(rows, config){
    return parseLiveRowsChain(rows, config) || parseLiveRowsIntraday(rows);
  }

  function buildAvailableBases(historyStrikes, liveStrikes, config){
    const merged = Array.from(new Set([...(historyStrikes || []), ...(liveStrikes || [])])).sort((a, b) => a - b);
    APP.state.availableBases = merged;
    populateBaseSelectors(merged, config);
  }

  function chooseDefaultBases(strikes, spot){
    if (!strikes.length) return ['', '', '', ''];
    if (!isFinite(spot) || spot <= 0){
      const pool = strikes.slice(0, 4);
      while (pool.length < 4) pool.push('');
      return pool.map((value) => value === '' ? '' : String(value));
    }
    const orderedByDistance = strikes
      .slice()
      .sort((a, b) => {
        const diff = Math.abs(a - spot) - Math.abs(b - spot);
        if (diff !== 0) return diff;
        return a - b;
      });
    const pool = orderedByDistance.slice(0, 4).sort((a, b) => a - b);
    while (pool.length < 4) pool.push('');
    return pool.map((value) => value === '' ? '' : String(value));
  }

  function populateBaseSelectors(strikes, config){
    const defaults = chooseDefaultBases(strikes, currentSpot());
    const params = APP.state.params || {...PARAM_DEFAULTS};
    const baseValue = params.baseStrike || defaults[0] || '';
    const compareValue = params.compareStrike || defaults[1] || '';
    const options = ['<option value="">--</option>'].concat(
      strikes.map((strike) => {
        const value = String(strike);
        return `<option value="${escapeHtml(value)}">${escapeHtml(fmtStrike(strike))}</option>`;
      })
    ).join('');
    $('param-base-strike').innerHTML = options;
    $('param-compare-strike').innerHTML = options;
    $('param-base-strike').value = String(baseValue || '');
    $('param-compare-strike').value = String(compareValue || '');
  }

  function paramBaseLeg(){
    const params = APP.state.params || {};
    const strike = parseARSNum(params.baseStrike);
    if (!isFinite(strike) || strike <= 0) return null;
    return {type: params.baseType || 'call', strike};
  }

  function paramVisibleCompareLegs(){
    return ((APP.state.params?.compareLegs) || []).filter((leg) => leg && leg.visible !== false);
  }

  function selectedBases(){
    const base = paramBaseLeg();
    if (!base) return [];
    const compares = paramVisibleCompareLegs().map((leg) => ({type: leg.type, strike: parseARSNum(leg.strike)})).filter((leg) => isFinite(leg.strike) && leg.strike > 0);
    return [base, ...compares].slice(0, 4);
  }

  function sameLeg(a, b){
    return String(a?.type || '') === String(b?.type || '') && Math.round((parseARSNum(a?.strike) || 0) * 100) === Math.round((parseARSNum(b?.strike) || 0) * 100);
  }

  function syncParamInputs(){
    const params = APP.state.params || PARAM_DEFAULTS;
    $('param-base-type').value = params.baseType || 'call';
    $('param-base-strike').value = String(params.baseStrike || '');
    $('param-compare-type').value = params.compareType || 'call';
    $('param-compare-strike').value = String(params.compareStrike || '');
    $('param-ri').value = params.ri || '2.00';
    $('param-tlr').value = params.tlr || '30.00';
    $('param-lots').value = params.lots || '2';
    $('param-threshold').value = params.threshold || '85';
    $('param-date-from').value = params.dateFrom || '';
    $('param-date-to').value = params.dateTo || '';
    syncTypeToggleButton('param-base-type-btn', params.baseType || 'call');
    syncTypeToggleButton('param-compare-type-btn', params.compareType || 'call');
  }

  function syncTypeToggleButton(id, type){
    const btn = $(id);
    if (!btn) return;
    const resolved = type === 'put' ? 'put' : 'call';
    btn.textContent = resolved === 'put' ? 'Put' : 'Call';
    btn.classList.toggle('call-active', resolved === 'call');
    btn.classList.toggle('put-active', resolved === 'put');
  }

  function toggleTypeInput(inputId, buttonId){
    const input = $(inputId);
    const next = (input.value || 'call') === 'call' ? 'put' : 'call';
    input.value = next;
    syncTypeToggleButton(buttonId, next);
    readParamsFromUi();
    renderCompareLegList();
    renderTable();
  }

  function renderCompareLegList(){
    const wrap = $('param-compare-list');
    const list = (APP.state.params?.compareLegs) || [];
    if (!wrap) return;
    if (!list.length){
      wrap.innerHTML = '<span class="badge">Sin comparables</span>';
      return;
    }
    wrap.innerHTML = list.map((leg, index) => `
      <span class="badge" style="background:${leg.type === 'put' ? 'rgba(255,127,127,.12)' : 'rgba(79,211,138,.12)'};border-color:${leg.type === 'put' ? 'rgba(255,127,127,.28)' : 'rgba(79,211,138,.28)'}">
        <strong>${escapeHtml((leg.type === 'put' ? 'P' : 'C') + ' ' + fmtStrike(parseARSNum(leg.strike) || 0))}</strong>
        <button type="button" onclick="window.dashboardPrivadoRemoveCompare(${index})" style="margin-left:6px;border:0;background:transparent;color:var(--dim);cursor:pointer">x</button>
      </span>
    `).join('');
  }

  function ensureParamDefaultsFromData(){
    const strikes = APP.state.availableBases || [];
    const defaults = chooseDefaultBases(strikes, currentSpot());
    const params = APP.state.params;
    if (!params.baseStrike && defaults[0]) params.baseStrike = defaults[0];
    if (!params.compareStrike && defaults[1]) params.compareStrike = defaults[1];
    if ((!params.compareLegs || !params.compareLegs.length) && defaults[1]){
      params.compareLegs = defaults.slice(1).filter(Boolean).map((strike) => ({type: params.baseType || 'call', strike, visible: true})).slice(0, 3);
    }
    const firstDate = APP.state.historyRows?.[0]?.date || '';
    if (!params.dateFrom && firstDate) params.dateFrom = firstDate;
  }

  function readParamsFromUi(){
    const next = {
      ...(APP.state.params || PARAM_DEFAULTS),
      baseType: $('param-base-type').value || 'call',
      baseStrike: $('param-base-strike').value || '',
      compareType: $('param-compare-type').value || 'call',
      compareStrike: $('param-compare-strike').value || '',
      ri: $('param-ri').value || '2.00',
      tlr: $('param-tlr').value || '30.00',
      lots: $('param-lots').value || '2',
      threshold: $('param-threshold').value || '85',
      dateFrom: $('param-date-from').value || '',
      dateTo: $('param-date-to').value || '',
    };
    APP.state.params = next;
    writeParams();
    return next;
  }

  function addCompareLeg(){
    const params = readParamsFromUi();
    const base = {type: params.baseType, strike: params.baseStrike};
    const leg = {type: params.compareType, strike: params.compareStrike, visible: true};
    if (!leg.strike) return;
    if (sameLeg(base, leg)) return;
    const current = Array.isArray(params.compareLegs) ? params.compareLegs.slice() : [];
    if (current.some((item) => sameLeg(item, leg))) return;
    if (current.length >= 3) return;
    params.compareLegs = current.concat(leg);
    APP.state.params = params;
    writeParams();
    renderCompareLegList();
    renderTable();
  }

  function removeCompareLeg(index){
    const params = APP.state.params || PARAM_DEFAULTS;
    params.compareLegs = (params.compareLegs || []).filter((_, idx) => idx !== index);
    APP.state.params = params;
    writeParams();
    renderCompareLegList();
    renderTable();
  }

  function clearParamDate(which){
    const input = $(which === 'from' ? 'param-date-from' : 'param-date-to');
    if (!input) return;
    input.value = '';
    readParamsFromUi();
    renderTable();
  }

  function syncConnectivityToggle(){
    const panel = $('connectivity-panel');
    const btn = $('toggle-connectivity-btn');
    if (!panel || !btn) return;
    const visible = panel.style.display !== 'none';
    btn.textContent = visible ? 'Ocultar conectividad' : 'Mostrar conectividad';
  }

  function toggleConnectivityPanel(){
    const panel = $('connectivity-panel');
    if (!panel) return;
    panel.style.display = panel.style.display === 'none' ? '' : 'none';
    syncConnectivityToggle();
  }

  function currentSpot(){
    const liveSpot = APP.state.liveSnapshot?.spot;
    if (isFinite(liveSpot) && liveSpot > 0) return liveSpot;
    const rows = APP.state.historyRows || [];
    for (let i = rows.length - 1; i >= 0; i--){
      if (isFinite(rows[i].spot) && rows[i].spot > 0) return rows[i].spot;
    }
    return null;
  }

  function latestHistorySpot(){
    const rows = APP.state.historyRows || [];
    for (let i = rows.length - 1; i >= 0; i--){
      if (isFinite(rows[i].spot) && rows[i].spot > 0) return rows[i].spot;
    }
    return null;
  }

  function normalizeLiveSnapshot(snapshot){
    if (!snapshot) return snapshot;
    const strikes = (snapshot.strikes || []).filter((value) => isFinite(value) && value > 0);
    const historySpot = latestHistorySpot();
    const nearestLiveStrike = nearestStrikeToSpot(strikes, historySpot);
    if (!isReasonableSpotAgainstStrikes(snapshot.spot, strikes)){
      snapshot.rawSpot = snapshot.spot;
      snapshot.spot = isFinite(historySpot) && historySpot > 0 ? historySpot : nearestLiveStrike;
      snapshot.spotFallback = true;
    }else{
      snapshot.rawSpot = snapshot.spot;
      snapshot.spotFallback = false;
    }
    return snapshot;
  }

  function mergeRows(){
    const rows = (APP.state.historyRows || []).map((row) => ({...row, source: 'history', label: formatDateDisplay(row.date)}));
    const live = APP.state.liveSnapshot;
    const hasTodayInHistory = rows.some((row) => row.date === todayIso());
    if (live && !hasTodayInHistory){
      rows.push({
        date: live.date || APP.state.historyRows?.[APP.state.historyRows.length - 1]?.date || '',
        label: live.asOfLabel || 'En vivo',
        spot: live.spot,
        prices: live.prices || {},
        expiry: live.expiry || '',
        source: 'live',
      });
    }
    APP.state.combinedRows = rows;
    return rows;
  }

  function computeTableRows(){
    const bases = selectedBases();
    const params = APP.state.params || PARAM_DEFAULTS;
    let rows = mergeRows();
    if (params.dateFrom) rows = rows.filter((row) => !row.date || row.date >= params.dateFrom);
    if (params.dateTo) rows = rows.filter((row) => !row.date || row.date <= params.dateTo);
    if (!bases.length || !rows.length) return {bases, rows: []};
    const base0 = bases[0];
    const riFactor = Math.max(1, Math.min(5, parseFloat(params.ri || '2') || 2));
    const tlr = parseFloat(params.tlr || '30') || 0;
    const lots = Math.max(1, parseFloat(params.lots || '1') || 1);

    const computed = rows.map((row, index) => {
      const entry = {
        date: row.date || '',
        label: row.label || '--',
        source: row.source,
        spot: row.spot,
        baseValues: {},
        baseDeltas: {},
        baseVegas: {},
        totalDelta: null,
        totalVega: null,
        lnRatio: null,
        lnDelta: null,
        lnVega: null,
        probRatio: null,
        probDelta: null,
        probVega: null,
        straddle: null,
        compare: [],
      };
      bases.forEach((leg) => {
        const key = `${leg.type}_${leg.strike}`;
        const price = row.prices?.[key] ?? null;
        entry.baseValues[key] = price;
        const greeks = calcOptionGreeks(price, leg.strike, leg.type, row.spot, row.date, row.expiry || APP.state.liveSnapshot?.expiry || '', tlr);
        entry.baseDeltas[key] = greeks?.delta ?? null;
        entry.baseVegas[key] = greeks?.vega ?? null;
      });
      const deltaValues = bases
        .map((leg) => entry.baseDeltas[`${leg.type}_${leg.strike}`])
        .filter((value) => isFinite(value));
      if (deltaValues.length){
        entry.totalDelta = deltaValues.reduce((acc, value) => acc + ((-value) * lots), 0);
      }
      const vega1 = bases[0] ? entry.baseVegas[`${bases[0].type}_${bases[0].strike}`] : null;
      const vega2 = bases[1] ? entry.baseVegas[`${bases[1].type}_${bases[1].strike}`] : null;
      if (isFinite(vega1) || isFinite(vega2)){
        entry.totalVega = -(((isFinite(vega1) ? vega1 : 0) + (isFinite(vega2) ? vega2 : 0)) * lots);
      }

      for (let i = 1; i < bases.length; i++){
        const compareLeg = bases[i];
        const p1 = entry.baseValues[`${base0.type}_${base0.strike}`];
        const p2 = entry.baseValues[`${compareLeg.type}_${compareLeg.strike}`];
        const strikeDiff = compareLeg.strike - base0.strike;
        let bullStrat = null;
        if (index > 0){
          const prev = rows[index - 1];
          const prevP1 = prev.prices?.[`${base0.type}_${base0.strike}`] ?? null;
          const prevP2 = prev.prices?.[`${compareLeg.type}_${compareLeg.strike}`] ?? null;
          if (isFinite(prevP1) && isFinite(prevP2) && isFinite(p1) && isFinite(p2)){
            bullStrat = ((p1 - p2) - (prevP1 - prevP2)) * lots;
          }
        }
        entry.compare.push({
          strike: compareLeg.strike,
          type: compareLeg.type,
          ratio: isFinite(p1) && isFinite(p2) && p2 > 0 ? p1 / p2 : null,
          straddle: isFinite(p1) && isFinite(p2) ? p1 + p2 : null,
          bull: isFinite(p1) && isFinite(p2) ? (p1 - p2) * lots : null,
          bullPct: isFinite(p1) && isFinite(p2) && strikeDiff !== 0 ? ((p1 - p2) / strikeDiff) * 100 : null,
          ri: isFinite(p1) && isFinite(p2) ? Math.abs(p1 - (riFactor * p2)) * lots : null,
          bullStrat,
        });
      }
      entry.straddle = entry.compare?.[0]?.straddle ?? null;
      return entry;
    });

    for (let index = 1; index < computed.length; index++){
      const current = computed[index];
      const previous = computed[index - 1];
      current.lnRatio = calcLnChange(current.compare?.[0]?.ratio ?? null, previous.compare?.[0]?.ratio ?? null);
      current.lnDelta = calcLnChange(current.totalDelta, previous.totalDelta);
      current.lnVega = calcLnChange(current.totalVega, previous.totalVega);
    }

    const probRatios = calcRankProbabilities(computed.map((row) => row.lnRatio));
    const probDeltas = calcRankProbabilities(computed.map((row) => row.lnDelta));
    const probVegas = calcRankProbabilities(computed.map((row) => row.lnVega));
    computed.forEach((row, index) => {
      row.probRatio = probRatios[index];
      row.probDelta = probDeltas[index];
      row.probVega = probVegas[index];
    });

    return {bases, rows: computed};
  }

  function toneClass(value){
    if (value == null || !isFinite(value)) return 'muted';
    if (value > 0) return 'pos';
    if (value < 0) return 'neg';
    return 'warn';
  }

  function computeSeriesExtremes(model){
    const series = {};
    const pushValue = (key, value) => {
      if (!Number.isFinite(value)) return;
      if (!series[key]) series[key] = [];
      series[key].push(value);
    };

    (model?.rows || []).forEach((row) => {
      (model?.bases || []).forEach((leg, index) => {
        if (index === 0 || columnVisible(`base_${index}`)){
          const baseKey = `${leg.type}_${leg.strike}`;
          pushValue(`price_${baseKey}`, row.baseValues?.[baseKey]);
        }
      });
      (row.compare || []).forEach((compare, index) => {
        if (!compareVisible(index)) return;
        pushValue(`ratio_${index}`, compare.ratio);
        pushValue(`bull_${index}`, compare.bull);
        pushValue(`ri_${index}`, compare.ri);
      });
      pushValue('delta_total', row.totalDelta);
      pushValue('vega_total', row.totalVega);
      pushValue('ln_ratio', row.lnRatio);
      pushValue('ln_delta', row.lnDelta);
      pushValue('ln_vega', row.lnVega);
    });

    return Object.fromEntries(Object.entries(series).map(([key, values]) => {
      const min = Math.min(...values);
      const max = Math.max(...values);
      return [key, {min, max}];
    }));
  }

  function seriesDotClass(value, extremes){
    if (!Number.isFinite(value) || !extremes || !Number.isFinite(extremes.min) || !Number.isFinite(extremes.max)) return '';
    if (Math.abs(extremes.max - extremes.min) < 1e-9) return '';
    if (Math.abs(value - extremes.min) < 1e-9) return 'cell-dot-green';
    if (Math.abs(value - extremes.max) < 1e-9) return 'cell-dot-red';
    return '';
  }

  function thresholdDotClass(value, thresholdPct){
    if (!Number.isFinite(value)) return '';
    const threshold = Math.max(0, Math.min(100, parseFloat(thresholdPct || '85') || 85));
    if (value <= (100 - threshold)) return 'cell-dot-blue';
    if (value >= threshold) return 'cell-dot-yellow';
    return '';
  }

  function setViewMode(mode){
    APP.state.viewMode = mode === 'chart' ? 'chart' : 'table';
    writeViewMode();
    applyViewMode();
  }

  function applyViewMode(){
    const mode = APP.state.viewMode === 'chart' ? 'chart' : 'table';
    const tableView = $('table-view');
    const chartView = $('chart-view');
    const tableBtn = $('view-mode-table');
    const chartBtn = $('view-mode-chart');
    if (tableView) tableView.style.display = mode === 'table' ? 'block' : 'none';
    if (chartView) chartView.style.display = mode === 'chart' ? 'grid' : 'none';
    if (tableBtn) tableBtn.classList.toggle('is-active', mode === 'table');
    if (chartBtn) chartBtn.classList.toggle('is-active', mode === 'chart');
  }

  function escapeAttr(value){
    return String(value == null ? '' : value).replace(/"/g, '&quot;');
  }

  function createLineChart(chartsObj, key, canvasId, labels, data, color, tooltipLabel, fmtFn, opts = {}){
    const ctx = $(canvasId)?.getContext('2d');
    if (!ctx || typeof Chart === 'undefined') return;
    const dense = !!opts.dense;
    const chartData = {
      labels,
      datasets: [{
        label: tooltipLabel,
        data: (data || []).map((value) => value != null && Number.isFinite(value) ? parseFloat(value.toFixed(4)) : null),
        borderColor: color,
        borderWidth: 1.5,
        pointRadius: 3,
        pointBackgroundColor: color,
        fill: false,
        spanGaps: true,
        tension: 0.18,
      }],
    };
    const xTickCb = (_value, index) => {
      const label = labels[index];
      if (!label) return '';
      if (label === 'En vivo' || String(label).startsWith('En vivo')) return 'Vivo';
      const parts = String(label).split('-');
      return parts.length >= 3 ? `${parts[2]}-${parts[1]}` : label;
    };
    const chartOpts = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {display: false},
        tooltip: {
          backgroundColor: '#131920',
          borderColor: '#2a3444',
          borderWidth: 1,
          titleColor: '#7a8fa6',
          bodyColor: '#d8e3ef',
          callbacks: {
            label: (context) => ` ${tooltipLabel}: ${fmtFn(context.raw)}`,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#7a8fa6',
            font: {size: 9},
            maxRotation: dense ? 45 : 0,
            minRotation: dense ? 45 : 0,
            autoSkip: !dense,
            maxTicksLimit: dense ? 9999 : 12,
            callback: xTickCb,
          },
          grid: {color: '#1a2230'},
        },
        y: {
          ticks: {
            color: '#7a8fa6',
            font: {size: 9},
            callback: fmtFn,
          },
          grid: {color: '#1a2230'},
        },
      },
    };
    if (chartsObj[key]){
      chartsObj[key].data = chartData;
      chartsObj[key].options = chartOpts;
      chartsObj[key].update('none');
      return;
    }
    chartsObj[key] = new Chart(ctx, {
      type: 'line',
      data: chartData,
      options: chartOpts,
    });
  }

  function renderCharts(model){
    if (!$('chart-view')) return;
    if (typeof Chart === 'undefined'){
      ['chart-ratio','chart-delta-total','chart-vega-total','chart-cost'].forEach((id) => {
        const canvas = $(id);
        const wrap = canvas?.parentElement;
        if (wrap) wrap.innerHTML = '<div class="chart-empty">No se pudo cargar Chart.js.</div>';
      });
      return;
    }
    const labels = (model.rows || []).map((row) => row.date || row.label || '');
    createLineChart(APP.state.charts, 'ratio', 'chart-ratio', labels, (model.rows || []).map((row) => row.compare?.[0]?.ratio ?? null), '#e8b84b', 'Ratio', (value) => fmtNum(value, 3), {dense: true});
    createLineChart(APP.state.charts, 'deltaTotal', 'chart-delta-total', labels, (model.rows || []).map((row) => row.totalDelta), '#5aabff', 'Delta Total', (value) => fmtNum(value, 3), {dense: true});
    createLineChart(APP.state.charts, 'vegaTotal', 'chart-vega-total', labels, (model.rows || []).map((row) => row.totalVega), '#ffd65a', 'Vega Total', (value) => fmtNum(value, 3), {dense: true});
    createLineChart(APP.state.charts, 'cost', 'chart-cost', labels, (model.rows || []).map((row) => row.straddle ?? null), '#44c76a', 'Straddle', (value) => fmtMoney(value, 2), {dense: true});
  }

  function renderMarkedValue(text, dotClass){
    const safeText = escapeHtml(text);
    if (!dotClass) return safeText;
    return `<span class="cell-mark"><span class="cell-dot ${dotClass}"></span><span>${safeText}</span></span>`;
  }

  function calcLnChange(currentValue, previousValue){
    if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue) || previousValue === 0) return null;
    const ratio = currentValue / previousValue;
    if (!(ratio > 0)) return null;
    return Math.log(ratio) * 100;
  }

  function calcRankProbabilities(values){
    const indexed = values
      .map((value, index) => ({value, index}))
      .filter((item) => Number.isFinite(item.value));
    const total = indexed.length;
    const result = Array(values.length).fill(null);
    if (!total) return result;
    const sorted = indexed.map((item) => item.value).slice().sort((a, b) => a - b);
    indexed.forEach((item) => {
      const rankIndex = sorted.findIndex((candidate) => Math.abs(candidate - item.value) < 1e-9);
      result[item.index] = rankIndex >= 0 ? ((rankIndex + 1) / total) * 100 : null;
    });
    return result;
  }

  function defaultColumnVisible(key){
    const bases = selectedBases();
    const base = bases[0] || null;
    const compare = bases[1] || null;
    if (base?.type === 'call' && compare?.type === 'call'){
      if (key === 'delta' || key === 'vega' || key === 'ln') return false;
    }
    return true;
  }

  function columnVisible(key){
    if (!Object.prototype.hasOwnProperty.call(APP.state.columnVisibility || {}, key)){
      return defaultColumnVisible(key);
    }
    return APP.state.columnVisibility[key] !== false;
  }

  function setColumnVisible(key, visible){
    APP.state.columnVisibility[key] = !!visible;
    writeColumnVisibility();
  }

  function dependentBaseIndices(){
    const total = Math.max(0, selectedBases().length - 1);
    return Array.from({length: total}, (_, index) => index + 1);
  }

  function compareVisible(compareIndex){
    return columnVisible(`base_${compareIndex + 1}`);
  }

  function groupEnabled(key){
    const bases = selectedBases();
    const base = bases[0] || null;
    const compare = bases[1] || null;
    if (!base || !compare) return true;

    if (base.type === 'call' && compare.type === 'put'){
      if (key === 'bull' || key === 'ri' || key === 'strat') return false;
    }

    return true;
  }

  function groupVisible(key){
    return groupEnabled(key) && columnVisible(key);
  }

  function toggleColumnVisibility(key){
    if(/^base_[123]$/.test(key) && columnVisible(key)){
      const visibleDependent = dependentBaseIndices().filter((index) => columnVisible(`base_${index}`)).length;
      if(visibleDependent <= 1)return;
    }
    if (!groupEnabled(key)) return;
    setColumnVisible(key, !columnVisible(key));
    renderTable();
  }

  function renderLegend(model){
    const legend = $('column-legend');
    if (!legend) return;
    const bases = model?.bases || [];
    const items = [];

    items.push({key:'spot', tone:'spot', label:'GGAL', dot:'#ffd65a'});
    bases.forEach((leg, index) => {
      if(index === 0)return;
      items.push({
        key: `base_${index}`,
        tone: 'base',
        label: `Base ${index + 1}`,
        title: `${leg.type === 'put' ? 'P' : 'C'} ${fmtStrike(leg.strike)}`,
        dot: '#67a6ff',
      });
    });

    [
      {key:'ratio', tone:'ratio', label:'Ratio', dot:'#ffd65a'},
      {key:'bull', tone:'bull', label:'Bull / %Bull', dot:'#4fd38a'},
      {key:'ri', tone:'ri', label:'RI', dot:'#b794f6'},
      {key:'strat', tone:'strat', label:'Bull Strat', dot:'#75d6d1'},
      {key:'delta', tone:'delta', label:'Delta', dot:'#67a6ff'},
      {key:'vega', tone:'vega', label:'Vega', dot:'#ffd65a'},
      {key:'ln', tone:'ln', label:'LN', dot:'#f2a55a'},
      {key:'prob', tone:'prob', label:'Prob Acum', dot:'#4aa3ff'},
    ].forEach((item) => items.push(item));

    legend.innerHTML = items.filter((item) => groupEnabled(item.key)).map((item) => {
      const hidden = !columnVisible(item.key);
      return `
        <button
          type="button"
          class="${item.tone}${hidden ? ' is-hidden' : ''}"
          title="${escapeHtml(item.title || item.label)}"
          onclick="window.dashboardPrivadoToggleColumn('${item.key}')"
        >
          <span class="dot" style="background:${item.dot}"></span>
          <span class="legend-text">${escapeHtml(item.label)}</span>
        </button>
      `;
    }).join('');
  }

  function renderTable(){
    const model = computeTableRows();
    const bases = model.bases;
    const seriesExtremes = computeSeriesExtremes(model);
    const threshold = APP.state.params?.threshold || '85';
    const head = $('table-head');
    const body = $('table-body');

    if (!bases.length || !model.rows.length){
      head.innerHTML = '<tr><th>Fecha</th></tr>';
      body.innerHTML = '<tr><td class="empty">No hay suficientes datos para renderizar la tabla.</td></tr>';
      $('table-subtitle').textContent = 'Elegi al menos una base y cargá datos.';
      renderSummary(model);
      return;
    }

    const topRow = ['<tr>'];
    topRow.push('<th class="date-col">Fecha / hora</th>');
    bases.forEach((strike, index) => {
      topRow.push(`<th class="group-base" colspan="1">${index === 0 ? 'Base principal' : `Base +${index}`}</th>`);
    });
    topRow.push('<th class="group-spot" colspan="1">GGAL</th>');
    model.rows[0].compare.forEach((compare, idx) => {
      topRow.push(`<th class="group-ratio" colspan="1">Ratio${idx === 0 ? '' : '+' + (idx + 1)}</th>`);
    });
    model.rows[0].compare.forEach((compare, idx) => {
      topRow.push(`<th class="group-bull" colspan="1">Costo Bull${idx === 0 ? '' : '+' + (idx + 1)}</th>`);
    });
    model.rows[0].compare.forEach((compare, idx) => {
      topRow.push(`<th class="group-bull" colspan="1">% Bull${idx === 0 ? '' : '+' + (idx + 1)}</th>`);
    });
    model.rows[0].compare.forEach((compare, idx) => {
      topRow.push(`<th class="group-ri" colspan="1">Costo RI${idx === 0 ? '' : '+' + (idx + 1)}</th>`);
    });
    model.rows[0].compare.forEach((compare, idx) => {
      topRow.push(`<th class="group-strat" colspan="1">Bull Strat${idx === 0 ? '' : '+' + (idx + 1)}</th>`);
    });
    topRow.push('</tr>');

    const secondRow = ['<tr>'];
    secondRow.push('<th class="date-col muted">Hora</th>');
    bases.forEach((strike) => {
      secondRow.push(`<th class="group-base">${escapeHtml(fmtStrike(strike))}</th>`);
    });
    secondRow.push('<th class="group-spot muted">GGAL</th>');
    for (let i = 0; i < model.rows[0].compare.length; i++) secondRow.push('<th class="group-ratio muted">Ratio</th>');
    for (let i = 0; i < model.rows[0].compare.length; i++) secondRow.push('<th class="group-bull muted">Bull</th>');
    for (let i = 0; i < model.rows[0].compare.length; i++) secondRow.push('<th class="group-bull muted">%Bull</th>');
    for (let i = 0; i < model.rows[0].compare.length; i++) secondRow.push('<th class="group-ri muted">RI</th>');
    for (let i = 0; i < model.rows[0].compare.length; i++) secondRow.push('<th class="group-strat muted">Delta</th>');
    secondRow.push('</tr>');

    head.innerHTML = topRow.join('') + secondRow.join('');

    body.innerHTML = model.rows.map((row) => {
      const cells = [];
      const rowClass = row.source === 'live' ? 'live-row' : '';
      cells.push(`<tr class="${rowClass}">`);
      cells.push(`<td class="date-col left">${escapeHtml(row.label)}</td>`);
      bases.forEach((strike) => {
        const price = row.baseValues[strike];
        cells.push(`<td class="group-base ${toneClass(price)}">${escapeHtml(fmtNum(price, 3))}</td>`);
      });
      cells.push(`<td class="group-spot ${toneClass(row.spot)}">${escapeHtml(fmtNum(row.spot, 1))}</td>`);
      row.compare.forEach((compare) => cells.push(`<td class="group-ratio warn">${escapeHtml(compare.ratio != null ? fmtNum(compare.ratio, 3) : '--')}</td>`));
      row.compare.forEach((compare) => cells.push(`<td class="group-bull ${toneClass(compare.bull)}">${escapeHtml(fmtMoney(compare.bull, 2))}</td>`));
      row.compare.forEach((compare) => cells.push(`<td class="group-bull ${toneClass(compare.bullPct)}">${escapeHtml(fmtPct(compare.bullPct, 2))}</td>`));
      row.compare.forEach((compare) => cells.push(`<td class="group-ri ${toneClass(compare.ri)}">${escapeHtml(fmtMoney(compare.ri, 2))}</td>`));
      row.compare.forEach((compare) => cells.push(`<td class="group-strat ${toneClass(compare.bullStrat)}">${escapeHtml(fmtSigned(compare.bullStrat, 2))}</td>`));
      cells.push('</tr>');
      return cells.join('');
    }).join('');

    const liveLabel = APP.state.liveSnapshot?.asOfLabel || 'Sin vivo';
    $('table-subtitle').textContent = `${model.rows.length} fila(s) renderizadas. La ultima fila se agrega desde ${configFromUi().liveSheet} (${liveLabel}).`;
    renderSummary(model);
  }

  function renderSummary(model){
    const bases = model.bases || [];
    const lastRow = model.rows?.length ? model.rows[model.rows.length - 1] : null;
    $('metric-base-main').textContent = bases.length ? fmtStrike(bases[0].strike) : '--';
    $('metric-base-summary').textContent = bases.length ? `${bases.length} serie(s) activas para ${(bases[0].type || 'call').toUpperCase()}` : 'Sin bases activas';

    const mainCompare = lastRow?.compare?.[0] || null;
    $('metric-ratio').textContent = mainCompare?.ratio != null ? fmtNum(mainCompare.ratio, 3) : '--';
    $('metric-ratio-summary').textContent = mainCompare ? `Contra ${fmtStrike(mainCompare.strike)}` : 'Sin comparable';

    $('metric-bull').textContent = mainCompare?.bull != null ? fmtMoney(mainCompare.bull, 2) : '--';
    $('metric-bull-summary').textContent = mainCompare?.bullPct != null ? `%Bull ${fmtPct(mainCompare.bullPct, 2)}` : 'Sin calculo';

    $('metric-spot').textContent = lastRow?.spot != null ? fmtMoney(lastRow.spot, 1) : '--';
    $('metric-spot-summary').textContent = APP.state.liveSnapshot?.source === 'chain'
      ? 'Spot desde hoja viva'
      : APP.state.liveSnapshot?.source === 'intraday'
        ? 'Spot desde parser intradiario'
        : 'Sin spot';

    $('status-spot').textContent = lastRow?.spot != null ? fmtMoney(lastRow.spot, 1) : '--';
    const liveLabel = APP.state.liveSnapshot ? (APP.state.liveSnapshot.asOfLabel || 'En vivo') : '--';
    $('status-data').textContent = `${model.rows?.length || 0} filas · HMD ${APP.state.historyRows.length || 0} fechas · ${liveLabel}`;
  }

  async function loadAllData(options){
    const config = configFromUi();
    writeConfig(config);
    if (!config.webAppUrl){
      setStatus('Falta URL de Apps Script');
      return;
    }

    const liveOnly = !!options?.liveOnly;
    const forceHistoryRefresh = !!options?.forceHistoryRefresh;
    $('btn-load').disabled = true;
    $('btn-live-only').disabled = true;

    try{
      setStatus(liveOnly ? 'Actualizando fila viva...' : 'Actualizando HMD y fila viva...');
      let historyPayload = null;
      let livePayload = null;

      if (!liveOnly){
        if (!forceHistoryRefresh){
          const cached = await cacheRead(config.webAppUrl, config.historySheet).catch(() => null);
          if (cached?.rows?.length) historyPayload = {rows: cached.rows, cached: true};
        }
        if (!historyPayload){
          try{
            const historyRowsRaw = await fetchSheetRows(config.webAppUrl, config.historySheet);
            await cacheWrite(config.webAppUrl, config.historySheet, historyRowsRaw);
            historyPayload = {rows: historyRowsRaw, cached: false};
          }catch(error){
            const cached = await cacheRead(config.webAppUrl, config.historySheet).catch(() => null);
            if (!cached?.rows?.length) throw error;
            historyPayload = {rows: cached.rows, cached: true};
          }
        }
      }

      try{
        const liveRowsRaw = await fetchSheetRows(config.webAppUrl, config.liveSheet);
        await cacheWrite(config.webAppUrl, config.liveSheet, liveRowsRaw);
        livePayload = {rows: liveRowsRaw, cached: false};
      }catch(error){
        const cached = await cacheRead(config.webAppUrl, config.liveSheet);
        if (!cached?.rows?.length) throw error;
        livePayload = {rows: cached.rows, cached: true};
      }

      if (historyPayload){
        const parsedHistory = parseHistoryRows(historyPayload.rows, config);
        APP.state.historyRows = parsedHistory.rows;
        APP.state.historyCached = historyPayload.cached;
        APP.state.historyStrikes = parsedHistory.strikes;
      }

      if (livePayload){
        APP.state.liveSnapshot = normalizeLiveSnapshot(parseLiveRows(livePayload.rows, config));
        APP.state.liveCached = livePayload.cached;
        APP.state.liveStrikes = APP.state.liveSnapshot?.strikes || [];
        if (!APP.state.liveSnapshot) throw new Error('No se pudo interpretar la hoja viva');
      }

      buildAvailableBases(APP.state.historyStrikes || [], APP.state.liveStrikes || [], config);
      ensureParamDefaultsFromData();
      syncParamInputs();
      renderCompareLegList();
      writeParams();
      renderTable();

      APP.state.lastLoadedAt = Date.now();
      const time = new Date(APP.state.lastLoadedAt).toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      setStatus(`Actualizado ${time}`);
      setLastRefreshLabel(`Ultima actualizacion ${time}`);
    }catch(error){
      console.error(error);
      setStatus(`Error: ${error.message || error}`);
    }finally{
      $('btn-load').disabled = false;
      $('btn-live-only').disabled = false;
      syncAutoRefresh();
    }
  }

  function syncAutoRefresh(){
    if (APP.autoTimer){
      clearInterval(APP.autoTimer);
      APP.autoTimer = null;
    }
    if (APP.countdownTimer){
      clearInterval(APP.countdownTimer);
      APP.countdownTimer = null;
    }
    APP.nextRefreshAt = 0;
    const seconds = parseInt($('cfg-auto-seconds').value || '0', 10) || 0;
    if (seconds > 0){
      APP.nextRefreshAt = Date.now() + (seconds * 1000);
      renderRefreshCountdown();
      APP.countdownTimer = setInterval(renderRefreshCountdown, 500);
      APP.autoTimer = setInterval(() => {
        APP.nextRefreshAt = Date.now() + (seconds * 1000);
        renderRefreshCountdown();
        loadAllData({liveOnly: true});
      }, seconds * 1000);
    }else{
      renderRefreshCountdown();
    }
  }

  function bindEvents(){
    $('btn-load').addEventListener('click', () => loadAllData({liveOnly: false, forceHistoryRefresh: true}));
    $('btn-live-only').addEventListener('click', () => loadAllData({liveOnly: true}));
    $('btn-reset-cache').addEventListener('click', async () => {
      try{
        await cacheClearAll();
        setStatus('Cache local limpiado');
      }catch(error){
        setStatus(`No se pudo limpiar cache: ${error.message || error}`);
      }
    });
    $('cfg-auto-seconds').addEventListener('change', () => {
      writeConfig(configFromUi());
      syncAutoRefresh();
    });
    ['param-base-type','param-base-strike','param-compare-type','param-compare-strike','param-ri','param-tlr','param-lots','param-threshold','param-date-from','param-date-to'].forEach((id) => {
      $(id).addEventListener('change', () => {
        readParamsFromUi();
        renderCompareLegList();
        renderTable();
      });
    });
    $('param-base-type-btn').addEventListener('click', () => toggleTypeInput('param-base-type', 'param-base-type-btn'));
    $('param-compare-type-btn').addEventListener('click', () => toggleTypeInput('param-compare-type', 'param-compare-type-btn'));
    $('param-date-from-clear').addEventListener('click', () => clearParamDate('from'));
    $('param-date-to-clear').addEventListener('click', () => clearParamDate('to'));
    $('toggle-connectivity-btn').addEventListener('click', toggleConnectivityPanel);
    $('param-add-compare').addEventListener('click', addCompareLeg);
    $('view-mode-table').addEventListener('click', () => setViewMode('table'));
    $('view-mode-chart').addEventListener('click', () => setViewMode('chart'));
    [
      'cfg-webapp-url','cfg-hmd-sheet','cfg-live-sheet',
      'cfg-hmd-header-row','cfg-hmd-col-date','cfg-hmd-col-last','cfg-hmd-col-strike','cfg-hmd-col-type',
      'cfg-live-header-row','cfg-live-col-strike','cfg-live-col-expiry','cfg-live-col-type','cfg-live-col-last','cfg-live-col-chg'
    ].forEach((id) => {
      $(id).addEventListener('change', () => writeConfig(configFromUi()));
    });
  }

  function renderTable(){
    const model = computeTableRows();
    const bases = model.bases;
    const seriesExtremes = computeSeriesExtremes(model);
    const threshold = APP.state.params?.threshold || '85';
    const head = $('table-head');
    const body = $('table-body');

    if (!bases.length || !model.rows.length){
      head.innerHTML = '<tr><th>Fecha</th></tr>';
      body.innerHTML = '<tr><td class="empty">No hay suficientes datos para renderizar la tabla.</td></tr>';
      $('table-subtitle').textContent = 'Elegi al menos una base y carga datos.';
      renderLegend(model);
      renderCharts(model);
      renderSummary(model);
      applyViewMode();
      return;
    }

    const topRow = ['<tr>'];
    topRow.push('<th class="date-col center">Fecha</th>');
    if (columnVisible('spot')) topRow.push('<th class="group-spot" colspan="1">GGAL</th>');
    bases.forEach((leg, index) => {
      if (index === 0 || columnVisible(`base_${index}`)){
        topRow.push(`<th class="group-base" colspan="1">${escapeHtml(legTypeShort(leg.type))} ${escapeHtml(strikeHeaderLabel(leg.strike))}</th>`);
      }
    });
    if (groupVisible('delta')) bases.forEach((leg, index) => {
      if (index === 0 || columnVisible(`base_${index}`)){
        topRow.push(`<th class="group-base" colspan="1">Delta ${escapeHtml(legTypeShort(leg.type))} ${escapeHtml(strikeShortLabel(leg.strike))}</th>`);
      }
    });
    if (groupVisible('delta')) topRow.push('<th class="group-greek-total" colspan="1">Delta Total</th>');
    if (groupVisible('vega')) bases.forEach((leg, index) => {
      if (index === 0 || columnVisible(`base_${index}`)){
        topRow.push(`<th class="group-base" colspan="1">Vega ${escapeHtml(legTypeShort(leg.type))} ${escapeHtml(strikeShortLabel(leg.strike))}</th>`);
      }
    });
    if (groupVisible('vega')) topRow.push('<th class="group-greek-total" colspan="1">Vega Total</th>');
    topRow.push('<th class="group-bull" colspan="1">Straddle</th>');
    if (groupVisible('ln')){
      topRow.push('<th class="group-ratio" colspan="1">LN Ratio</th>');
      topRow.push('<th class="group-ratio" colspan="1">LN Delta</th>');
      topRow.push('<th class="group-ratio" colspan="1">LN Vega</th>');
    }
    if (columnVisible('prob')){
      topRow.push('<th class="group-ratio" colspan="1">Prob Acum Ratio</th>');
      topRow.push('<th class="group-ratio" colspan="1">Prob Acum Delta</th>');
      topRow.push('<th class="group-ratio" colspan="1">Prob Acum Vega</th>');
    }
    if (columnVisible('ratio')) model.rows[0].compare.forEach((compare, idx) => {
      if(!compareVisible(idx))return;
      topRow.push(`<th class="group-ratio" colspan="1">Ratio${idx === 0 ? '' : '+' + (idx + 1)}</th>`);
    });
    if (groupVisible('bull')) model.rows[0].compare.forEach((compare, idx) => {
      if(!compareVisible(idx))return;
      topRow.push(`<th class="group-bull" colspan="1">Costo Bull${idx === 0 ? '' : '+' + (idx + 1)}</th>`);
    });
    if (groupVisible('bull')) model.rows[0].compare.forEach((compare, idx) => {
      if(!compareVisible(idx))return;
      topRow.push(`<th class="group-bull" colspan="1">% Bull${idx === 0 ? '' : '+' + (idx + 1)}</th>`);
    });
    if (groupVisible('ri')) model.rows[0].compare.forEach((compare, idx) => {
      if(!compareVisible(idx))return;
      topRow.push(`<th class="group-ri" colspan="1">Costo RI${idx === 0 ? '' : '+' + (idx + 1)}</th>`);
    });
    if (groupVisible('strat')) model.rows[0].compare.forEach((compare, idx) => {
      if(!compareVisible(idx))return;
      topRow.push(`<th class="group-strat" colspan="1">Bull Strat${idx === 0 ? '' : '+' + (idx + 1)}</th>`);
    });
    topRow.push('</tr>');
    head.innerHTML = topRow.join('');

    body.innerHTML = model.rows.map((row) => {
      const cells = [];
      const rowClass = row.source === 'live' ? 'live-row' : '';
      cells.push(`<tr class="${rowClass}">`);
      cells.push(`<td class="date-col center">${escapeHtml(row.label)}</td>`);
      if (columnVisible('spot')) cells.push(`<td class="group-spot ${toneClass(row.spot)}">${escapeHtml(fmtNum(row.spot, 1))}</td>`);
      bases.forEach((leg, index) => {
        if (index === 0 || columnVisible(`base_${index}`)){
          const key = `${leg.type}_${leg.strike}`;
          const price = row.baseValues[key];
          const dotClass = seriesDotClass(price, seriesExtremes[`price_${key}`]);
          cells.push(`<td class="group-base ${toneClass(price)}">${renderMarkedValue(fmtNum(price, 3), dotClass)}</td>`);
        }
      });
      if (groupVisible('delta')) bases.forEach((leg, index) => {
        if (index === 0 || columnVisible(`base_${index}`)){
          const key = `${leg.type}_${leg.strike}`;
          const delta = row.baseDeltas[key];
          cells.push(`<td class="group-base ${toneClass(delta)}">${escapeHtml(delta != null ? fmtNum(delta, 3) : '--')}</td>`);
        }
      });
      if (groupVisible('delta')){
        const dotClass = seriesDotClass(row.totalDelta, seriesExtremes.delta_total);
        cells.push(`<td class="group-greek-total ${toneClass(row.totalDelta)}">${renderMarkedValue(row.totalDelta != null ? fmtNum(row.totalDelta, 3) : '--', dotClass)}</td>`);
      }
      if (groupVisible('vega')) bases.forEach((leg, index) => {
        if (index === 0 || columnVisible(`base_${index}`)){
          const key = `${leg.type}_${leg.strike}`;
          const vega = row.baseVegas[key];
          cells.push(`<td class="group-base ${toneClass(vega)}">${escapeHtml(vega != null ? fmtNum(vega, 3) : '--')}</td>`);
        }
      });
      if (groupVisible('vega')){
        const dotClass = seriesDotClass(row.totalVega, seriesExtremes.vega_total);
        cells.push(`<td class="group-greek-total ${toneClass(row.totalVega)}">${renderMarkedValue(row.totalVega != null ? fmtNum(row.totalVega, 3) : '--', dotClass)}</td>`);
      }
      cells.push(`<td class="group-bull ${toneClass(row.straddle)}">${escapeHtml(row.straddle != null ? fmtMoney(row.straddle, 2) : '--')}</td>`);
      if (groupVisible('ln')){
        const lnRatioDot = seriesDotClass(row.lnRatio, seriesExtremes.ln_ratio);
        const lnDeltaDot = seriesDotClass(row.lnDelta, seriesExtremes.ln_delta);
        const lnVegaDot = seriesDotClass(row.lnVega, seriesExtremes.ln_vega);
        cells.push(`<td class="group-ratio ${toneClass(row.lnRatio)}">${renderMarkedValue(row.lnRatio != null ? fmtPct(row.lnRatio, 2) : '--', lnRatioDot)}</td>`);
        cells.push(`<td class="group-ratio ${toneClass(row.lnDelta)}">${renderMarkedValue(row.lnDelta != null ? fmtPct(row.lnDelta, 2) : '--', lnDeltaDot)}</td>`);
        cells.push(`<td class="group-ratio ${toneClass(row.lnVega)}">${renderMarkedValue(row.lnVega != null ? fmtPct(row.lnVega, 2) : '--', lnVegaDot)}</td>`);
      }
      if (columnVisible('prob')){
        const probRatioDot = thresholdDotClass(row.probRatio, threshold);
        const probDeltaDot = thresholdDotClass(row.probDelta, threshold);
        const probVegaDot = thresholdDotClass(row.probVega, threshold);
        cells.push(`<td class="group-ratio ${toneClass(row.probRatio)}">${renderMarkedValue(row.probRatio != null ? fmtPct(row.probRatio, 2) : '--', probRatioDot)}</td>`);
        cells.push(`<td class="group-ratio ${toneClass(row.probDelta)}">${renderMarkedValue(row.probDelta != null ? fmtPct(row.probDelta, 2) : '--', probDeltaDot)}</td>`);
        cells.push(`<td class="group-ratio ${toneClass(row.probVega)}">${renderMarkedValue(row.probVega != null ? fmtPct(row.probVega, 2) : '--', probVegaDot)}</td>`);
      }
      if (columnVisible('ratio')) row.compare.forEach((compare, idx) => {
        if(!compareVisible(idx))return;
        const dotClass = seriesDotClass(compare.ratio, seriesExtremes[`ratio_${idx}`]);
        cells.push(`<td class="group-ratio warn">${renderMarkedValue(compare.ratio != null ? fmtNum(compare.ratio, 3) : '--', dotClass)}</td>`);
      });
      if (groupVisible('bull')) row.compare.forEach((compare, idx) => {
        if(!compareVisible(idx))return;
        const dotClass = seriesDotClass(compare.bull, seriesExtremes[`bull_${idx}`]);
        cells.push(`<td class="group-bull ${toneClass(compare.bull)}">${renderMarkedValue(fmtMoney(compare.bull, 2), dotClass)}</td>`);
      });
      if (groupVisible('bull')) row.compare.forEach((compare, idx) => {
        if(!compareVisible(idx))return;
        cells.push(`<td class="group-bull ${toneClass(compare.bullPct)}">${escapeHtml(fmtPct(compare.bullPct, 2))}</td>`);
      });
      if (groupVisible('ri')) row.compare.forEach((compare, idx) => {
        if(!compareVisible(idx))return;
        const dotClass = seriesDotClass(compare.ri, seriesExtremes[`ri_${idx}`]);
        cells.push(`<td class="group-ri ${toneClass(compare.ri)}">${renderMarkedValue(fmtMoney(compare.ri, 2), dotClass)}</td>`);
      });
      if (groupVisible('strat')) row.compare.forEach((compare, idx) => {
        if(!compareVisible(idx))return;
        cells.push(`<td class="group-strat ${toneClass(compare.bullStrat)}">${escapeHtml(fmtSigned(compare.bullStrat, 2))}</td>`);
      });
      cells.push('</tr>');
      return cells.join('');
    }).join('');

    const liveLabel = APP.state.liveSnapshot?.asOfLabel || 'Sin vivo';
    $('table-subtitle').textContent = `${model.rows.length} fila(s) renderizadas. La ultima fila se agrega desde ${configFromUi().liveSheet} (${liveLabel}).`;
    renderLegend(model);
    renderCharts(model);
    renderSummary(model);
    applyViewMode();
  }

  function init(){
    const config = readConfig();
    APP.state.columnVisibility = readColumnVisibility();
    APP.state.params = readParams();
    APP.state.viewMode = readViewMode();
    applyConfigToUi(config);
    populateBaseSelectors([], config);
    syncParamInputs();
    renderCompareLegList();
    bindEvents();
    syncConnectivityToggle();
    applyViewMode();
    syncAutoRefresh();
    setStatus('Listo para cargar');
    renderRefreshCountdown();
    $('status-data').textContent = '--';
    if (config.webAppUrl) loadAllData({liveOnly: false});
  }

  window.dashboardPrivadoToggleColumn = toggleColumnVisibility;
  window.dashboardPrivadoRemoveCompare = removeCompareLeg;
  init();
})();
