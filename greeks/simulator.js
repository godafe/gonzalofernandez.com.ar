'use strict';

// BS engine (bsCall, bsPut, bsDelta, bsDeltaPut, bsGamma, bsTheta, bsThetaPut,
// bsVega, impliedVol, impliedVolPut) provided by greeks-engine.js

// ── Formatting ──────────────────────────────────────────────────
const FMT2 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const FMT3 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const FMT4 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const FMT6 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 6, maximumFractionDigits: 6 });

function fmt2(n) { return isFinite(n) ? FMT2.format(n) : '—'; }
function fmt3(n) { return isFinite(n) ? FMT3.format(n) : '—'; }
function fmt4(n) { return isFinite(n) ? FMT4.format(n) : '—'; }
function fmt6(n) { return isFinite(n) ? FMT6.format(n) : '—'; }

function fmtExport(n) { return String(n).replace('.', ','); }

function parseNum(s) {
  if (typeof s === 'number') return s;
  return parseFloat(String(s).trim().replace(',', '.'));
}

let _toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  if (msg) el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ── Constants ───────────────────────────────────────────────────
const API_BASE = 'https://script.google.com/macros/s/AKfycbx3U-DXD4soaIA1UjDnkCBu5c7DHxW8eptZiaHYMdH-HMyhAcDy_TT4mT-R9YLZfrxU/exec';
// Returns 3rd Friday of the current month, or next month if already past it (BYMA opex cycle)
function getDefaultOpexDate() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  function thirdFriday(year, month) {
    const d = new Date(year, month, 1);
    d.setDate(1 + (5 - d.getDay() + 7) % 7 + 14); // first Friday + 2 weeks
    return d;
  }
  let c = thirdFriday(today.getFullYear(), today.getMonth());
  if (c < today) c = thirdFriday(today.getFullYear(), today.getMonth() + 1);
  return `${c.getFullYear()}-${String(c.getMonth()+1).padStart(2,'0')}-${String(c.getDate()).padStart(2,'0')}`;
}

function calcDTE() {
  return calcDTEFromDate(getDefaultOpexDate());
}

function calcDTEFromDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const today  = new Date(); today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((target.getTime() - today.getTime()) / 86400000));
}

// ── State ────────────────────────────────────────────────────────
let nextStrategyId = 1;

const state = {
  strategies: [],  // [{ id, name, enabled, collapsed, positions: [], nextId }]
  simParams: {
    S: 0,
    S_orig: 0,
    r: 40,
    dte: calcDTE(),
    comisiones: 0.5,
    ivOverrides: {},  // { [strike]: pct }
    ivOriginals: {},  // { [strike]: pct }
    opexDate: getDefaultOpexDate(),
  },
  config: {
    autoUpdate: true,
    intervalSec: 7,
    connection: 'DMD_Bot',
    panels: { sim: true, pnl: true }, // true = expanded
  },
  apiData: {
    prices: {},
    subyPrice: 0,
    lastFetch: null,
  },
};

let autoTimer = null;
let countdownVal = 0;
let isFetching = false;

// ── Sim panel collapsed summary ───────────────────────────────────
function strikeTicker(strike) {
  const digits = String(Math.round(strike));
  return digits.slice(0, strike >= 10000 ? 3 : 2);
}

function updateSimSummary() {
  const s = state.simParams;
  const elS   = document.getElementById('sim-csum-s');
  const elR   = document.getElementById('sim-csum-r');
  const elDte = document.getElementById('sim-csum-dte');
  const elIV  = document.getElementById('sim-csum-iv');
  if (!elS) return;
  elS.textContent   = s.S > 0 ? Math.round(s.S).toLocaleString('es-AR') : '—';
  elR.textContent   = isFinite(s.r) ? String(s.r) : '—';
  elDte.textContent = isFinite(s.dte) ? String(s.dte) : '—';

  if (!elIV) return;
  const optPos = getAllPositions().filter(p => p.type !== 'suby');
  const seen   = new Set();
  const parts  = [];
  for (const p of optPos) {
    const key = `${p.type}:${p.strike}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const iv  = s.ivOverrides[p.strike] ?? s.ivOriginals[p.strike];
    const ivStr = iv != null ? Number(iv).toFixed(2).replace('.', ',') : '—';
    const typeChar = p.type === 'call' ? 'C' : 'P';
    parts.push(`${typeChar}${strikeTicker(p.strike)}:${ivStr}`);
  }
  elIV.textContent = parts.join(' / ');
}

// ── Helpers ──────────────────────────────────────────────────────
function getEnabledPositions() {
  return state.strategies.filter(s => s.enabled).flatMap(s => s.positions);
}

function getAllPositions() {
  return state.strategies.flatMap(s => s.positions);
}

function findPosition(stratId, posId) {
  const s = state.strategies.find(s => s.id === stratId);
  return s ? s.positions.find(p => p.id === posId) : null;
}

function syncIVKeys() {
  const active = new Set(
    getAllPositions().filter(p => p.type !== 'suby').map(p => p.strike)
  );
  for (const k of Object.keys(state.simParams.ivOverrides).map(Number)) {
    if (!active.has(k)) delete state.simParams.ivOverrides[k];
  }
  for (const k of Object.keys(state.simParams.ivOriginals).map(Number)) {
    if (!active.has(k)) delete state.simParams.ivOriginals[k];
  }
}

// ── API ──────────────────────────────────────────────────────────
function mapApiResponse(json) {
  const prices = {};
  let subyPrice = 0;
  const rows = json.values || [];
  // API columns: [TICKER, STRIKE, TYPE, BID, ASK, LAST, CHG, EXPIRY]
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 6) continue;
    const strikeRaw = String(row[1]).trim().toUpperCase();
    const type      = String(row[2]).trim().toUpperCase();
    const last      = parseNum(row[5]);
    if (type === 'SUBY' && String(row[0]).trim().toUpperCase() === 'GGAL') {
      const price = isFinite(last) && last > 0 ? last : parseNum(row[4]); // fallback to ASK
      if (price > 0) subyPrice = price;
    } else if (type === 'CALL' || type === 'PUT') {
      if (!isFinite(last) || last <= 0) continue;
      const k = parseFloat(strikeRaw.replace(',', '.'));
      if (isFinite(k) && k > 0) prices[type + '_' + k] = last;
    }
  }
  return { prices, subyPrice };
}

async function fetchPrices() {
  if (isFetching) return;
  isFetching = true;
  countdownVal = state.config.intervalSec;
  updateCountdownUI();
  const url = `${API_BASE}?endpoint=Live&sheet=${state.config.connection}`;
  const statusEl = document.getElementById('api-status');
  try {
    statusEl.textContent = 'Cargando…';
    statusEl.className = 'api-status loading';
    const res  = await fetch(url);
    const json = await res.json();
    // console.log('[fetchPrices] RAW JSON:', JSON.stringify(json));
    const { prices, subyPrice } = mapApiResponse(json);
    // console.log('[fetchPrices] prices mapeados:', prices, '| subyPrice:', subyPrice);
    state.apiData.prices    = prices;
    state.apiData.lastFetch = new Date();

    if (subyPrice > 0) {
      state.apiData.subyPrice = subyPrice;
      const userEdited = state.simParams.S_orig > 0 && state.simParams.S !== state.simParams.S_orig;
      if (!userEdited) {
        state.simParams.S_orig = subyPrice;
        state.simParams.S      = subyPrice;
        document.getElementById('sim-S').value = Math.round(subyPrice);
        updateSimSummary();
      } else if (state.simParams.S_orig === 0) {
        state.simParams.S_orig = subyPrice;
      }
    }

    const t = state.apiData.lastFetch.toLocaleTimeString('es-AR');
    statusEl.textContent = `Actualizado ${t}`;
    statusEl.className = 'api-status ok';
    recompute();
  } catch {
    statusEl.textContent = 'Error de conexión';
    statusEl.className = 'api-status error';
  } finally {
    isFetching = false;
  }
}

function updateCountdownUI() {
  const isAuto = state.config.autoUpdate && state.config.intervalSec > 0;
  const cdEl   = document.getElementById('api-countdown');
  const refBtn = document.getElementById('manual-refresh-btn');
  if (!cdEl || !refBtn) return;
  if (isAuto) {
    cdEl.textContent = countdownVal > 0 ? `(${countdownVal}s)` : '';
    cdEl.style.display = '';
    refBtn.style.display = 'none';
  } else {
    cdEl.textContent = '';
    cdEl.style.display = 'none';
    refBtn.style.display = '';
  }
}

function startAutoTimer() {
  clearInterval(autoTimer);
  autoTimer = null;
  countdownVal = 0;
  updateCountdownUI();
  if (state.config.autoUpdate && state.config.intervalSec > 0) {
    countdownVal = state.config.intervalSec;
    updateCountdownUI();
    autoTimer = setInterval(() => {
      countdownVal--;
      if (countdownVal <= 0) {
        fetchPrices();
      } else {
        updateCountdownUI();
      }
    }, 1000);
  }
}

// ── Compute per-leg ──────────────────────────────────────────────
function computeLeg(pos, cierrePrice) {
  const S       = state.simParams.S;
  const T       = state.simParams.dte / 365;
  const r       = state.simParams.r / 100;
  const sign100 = pos.lotes * 100;
  const priceKey = pos.type === 'suby' ? null : pos.type.toUpperCase() + '_' + pos.strike;
  const apiP    = priceKey ? (state.apiData.prices[priceKey] ?? 0) : (state.apiData.subyPrice ?? 0);
  const curP    = cierrePrice !== undefined ? cierrePrice
                : pos.priceOverride !== undefined ? pos.priceOverride : apiP;

  if (pos.type === 'suby') {
    const pnl = curP > 0 ? (curP - pos.prima) * pos.lotes : 0;
    return { currentPrice: curP, sigmaImpl: NaN, sigma: NaN, price: curP * pos.lotes, pnl, delta: pos.lotes, gamma: 0, vega: 0, theta: 0 };
  }

  if (S <= 0 || T <= 0) {
    return { currentPrice: curP, sigmaImpl: NaN, sigma: NaN, price: 0, pnl: 0, delta: 0, gamma: 0, vega: 0, theta: 0 };
  }

  const isCall = pos.type === 'call';

  let currentMarketIV = NaN;
  if (curP > 0) {
    const miv = isCall
      ? impliedVol(S, pos.strike, T, r, curP)
      : impliedVolPut(S, pos.strike, T, r, curP);
    if (isFinite(miv) && miv > 0) {
      currentMarketIV = miv;
      if (cierrePrice === undefined) {
        // Solo actualizar IV originales desde precios de mercado, no desde precios de cierre
        state.simParams.ivOriginals[pos.strike] = miv * 100;
      }
    }
  }

  let sigma;
  if (state.simParams.ivOverrides[pos.strike] !== undefined) {
    sigma = state.simParams.ivOverrides[pos.strike] / 100;
  } else if (isFinite(currentMarketIV)) {
    sigma = currentMarketIV;
    pos.cachedSigma = currentMarketIV;
  } else {
    const entryIV = isCall
      ? impliedVol(S, pos.strike, T, r, pos.prima)
      : impliedVolPut(S, pos.strike, T, r, pos.prima);
    if (isFinite(entryIV) && entryIV > 0) {
      sigma = entryIV;
      pos.cachedSigma = entryIV;
    } else {
      sigma = pos.cachedSigma || 0.30;
    }
  }

  const sigmaImpl = currentMarketIV;

  const price = isCall ? bsCall(S, pos.strike, T, r, sigma)   : bsPut(S, pos.strike, T, r, sigma);
  const delta = isCall ? bsDelta(S, pos.strike, T, r, sigma)  : bsDeltaPut(S, pos.strike, T, r, sigma);
  const gamma = bsGamma(S, pos.strike, T, r, sigma);
  const vega  = bsVega(S, pos.strike, T, r, sigma);
  const theta = isCall ? bsTheta(S, pos.strike, T, r, sigma)  : bsThetaPut(S, pos.strike, T, r, sigma);
  const pnl   = curP > 0 ? (curP - pos.prima) * sign100 : 0;

  return {
    currentPrice: curP,
    sigmaImpl,
    sigma,
    price:  price * sign100,
    pnl,
    delta:  delta * sign100,
    gamma:  gamma * sign100,
    vega:   vega  * sign100,
    theta:  theta * sign100,
  };
}

function computeAll(positions, preciosCierre) {
  return positions.map(pos => ({ pos, g: computeLeg(pos, preciosCierre?.[pos.id]) }));
}

// ── Summary stats ────────────────────────────────────────────────
function computeSummary(computed) {
  if (!computed.length) return null;

  const comFactor = (state.simParams.comisiones / 100 + 0.002) * 1.21;
  let costoArmado = 0, costoDesarmado = 0;
  for (const { pos, g } of computed) {
    const sign = Math.sign(pos.lotes);
    costoArmado    += -100 * pos.lotes * pos.prima      * (1 + sign * comFactor);
    costoDesarmado +=  100 * pos.lotes * g.currentPrice * (1 - sign * comFactor);
  }
  const resultado = costoDesarmado + costoArmado;

  const longs  = computed.filter(c => c.pos.lotes > 0);
  const shorts = computed.filter(c => c.pos.lotes < 0);
  const totalLong  = longs.reduce((s, c)  => s + Math.abs(c.pos.lotes), 0);
  const totalShort = shorts.reduce((s, c) => s + Math.abs(c.pos.lotes), 0);
  const ratioLotes = totalLong > 0 ? totalShort / totalLong : NaN;

  const fl = longs[0], fs = shorts[0];
  const ratioArmado = (fl && fs) ? fl.pos.prima        / Math.abs(fs.pos.prima)        : NaN;
  const ratioActual = (fl && fs) ? fl.g.currentPrice   / Math.abs(fs.g.currentPrice)   : NaN;

  let spreadPctArmado = NaN, spreadPctActual = NaN, costoRIRC_arm = NaN, costoRIRC_act = NaN;
  if (fl && fs) {
    const w = Math.abs(fs.pos.strike - fl.pos.strike);
    if (w > 0) {
      spreadPctArmado = (fl.pos.prima      - Math.abs(fs.pos.prima))      / w;
      spreadPctActual = (fl.g.currentPrice - Math.abs(fs.g.currentPrice)) / w;
    }
    if (isFinite(ratioLotes)) {
      costoRIRC_arm = (fl.pos.prima      - Math.abs(fs.pos.prima)      * ratioLotes) * 100;
      costoRIRC_act = (fl.g.currentPrice - Math.abs(fs.g.currentPrice) * ratioLotes) * 100;
    }
  }

  return { costoArmado, costoDesarmado, resultado, ratioLotes, ratioArmado, ratioActual, spreadPctArmado, spreadPctActual, costoRIRC_arm, costoRIRC_act };
}

// ── PPP (Precio Ponderado Promedio) ──────────────────────────────
function computePPPPositions(positions) {
  const groups = new Map();
  for (const p of positions) {
    const key = `${p.type}|${p.strike}`;
    if (!groups.has(key)) groups.set(key, { type: p.type, strike: p.strike, entries: [] });
    groups.get(key).entries.push(p);
  }
  const result = [];
  for (const g of groups.values()) {
    const totalLotes = g.entries.reduce((s, p) => s + p.lotes, 0);
    const totalCosto = g.entries.reduce((s, p) => s + p.lotes * p.prima, 0);
    const wavgPrima  = totalCosto / totalLotes;
    result.push({
      id:          g.entries[0].id,
      type:        g.type,
      strike:      g.strike,
      lotes:       totalLotes,
      prima:       +wavgPrima.toFixed(6),
      cachedSigma: g.entries[0].cachedSigma ?? 0.30,
    });
  }
  return result;
}

function toggleStrategyPPP(stratId, checked) {
  const strat = state.strategies.find(s => s.id === stratId);
  if (!strat) return;

  const panel = document.getElementById(`strategy-${stratId}`);

  if (checked) {
    strat.pppOrigPositions = strat.positions.map(p => ({ ...p }));
    strat.ppp = true;
    strat.positions = computePPPPositions(strat.pppOrigPositions);
    if (panel) {
      panel.querySelector('.strat-add-row').disabled = true;
      panel.querySelector('.strat-import').disabled  = true;
      panel.querySelector('.strat-clear').disabled   = true;
      panel.querySelector('.ppp-strat-label').classList.add('ppp-active');
    }
  } else {
    strat.positions = strat.pppOrigPositions ?? strat.positions;
    strat.pppOrigPositions = null;
    strat.ppp = false;
    if (panel) {
      panel.querySelector('.strat-add-row').disabled = false;
      panel.querySelector('.strat-import').disabled  = false;
      panel.querySelector('.strat-clear').disabled   = false;
      panel.querySelector('.ppp-strat-label').classList.remove('ppp-active');
    }
  }

  recompute();
  saveState();
}

function toggleStrategyCierre(stratId, checked) {
  const strat = state.strategies.find(s => s.id === stratId);
  if (!strat) return;

  const panel = document.getElementById(`strategy-${stratId}`);

  if (checked) {
    strat.cierre = true;
    // Pre-populate only positions that don't already have a saved closing price
    const computed = computeAll(strat.positions);
    for (const { pos, g } of computed) {
      if (strat.preciosCierre[pos.id] === undefined) {
        strat.preciosCierre[pos.id] = g.currentPrice > 0 ? g.currentPrice : pos.prima;
      }
    }
    if (panel) {
      panel.querySelector('.cierre-strat-label')?.classList.add('ppp-active');
      const th = panel.querySelector('.strat-th-price');
      if (th) th.textContent = 'Precio Cierre';
    }
  } else {
    strat.cierre = false;
    // Preserve preciosCierre so user data is not lost on uncheck
    if (panel) {
      panel.querySelector('.cierre-strat-label')?.classList.remove('ppp-active');
      const th = panel.querySelector('.strat-th-price');
      if (th) th.textContent = 'Precio Actual';
    }
  }

  recompute();
  saveState();
}

// ── Available strikes from API ────────────────────────────────────
function getAvailableStrikes(type) {
  if (type === 'suby') return [];
  const prefix = type.toUpperCase() + '_';
  return Object.keys(state.apiData.prices)
    .filter(k => k.startsWith(prefix))
    .map(k => parseFloat(k.slice(prefix.length)))
    .filter(k => isFinite(k))
    .sort((a, b) => a - b);
}

// ── Inline cell editing ───────────────────────────────────────────
function startEdit(td, stratId, pos, field) {
  if (td.classList.contains('editing')) return;
  td.classList.add('editing');

  let el;

  if (field === 'type') {
    el = document.createElement('select');
    el.className = 'cell-edit-input cell-edit-select';
    for (const [val, label] of [['call','Call'],['put','Put'],['suby','Acción']]) {
      const opt = document.createElement('option');
      opt.value = val; opt.textContent = label;
      if (val === pos.type) opt.selected = true;
      el.appendChild(opt);
    }
  } else if (field === 'strike') {
    el = document.createElement('select');
    el.className = 'cell-edit-input cell-edit-select';
    const strikes = getAvailableStrikes(pos.type);
    if (!strikes.includes(pos.strike) && pos.strike > 0) strikes.push(pos.strike);
    strikes.sort((a, b) => a - b);
    for (const k of strikes) {
      const opt = document.createElement('option');
      opt.value = k; opt.textContent = FMT2.format(k);
      if (k === pos.strike) opt.selected = true;
      el.appendChild(opt);
    }
  } else if (field === 'lotes') {
    el = document.createElement('input');
    el.type = 'number'; el.step = '1';
    el.className = 'cell-edit-input';
    el.value = pos.lotes;
  } else if (field === 'prima') {
    el = document.createElement('input');
    el.type = 'number'; el.step = '0.0001'; el.min = '0.0001';
    el.className = 'cell-edit-input';
    el.value = pos.prima.toFixed(4);
  } else if (field === 'currentPrice') {
    el = document.createElement('input');
    el.type = 'number'; el.step = '0.001'; el.min = '0.001';
    el.className = 'cell-edit-input';
    el.value = pos.priceOverride !== undefined ? pos.priceOverride : '';
    el.placeholder = '—';
  }

  td.innerHTML = '';
  td.appendChild(el);
  el.focus();
  if (el.tagName === 'INPUT' && el.select) el.select();

  const commit = () => { td.classList.remove('editing'); applyEdit(stratId, pos, field, el.value); };
  const cancel = () => { td.classList.remove('editing'); recompute(); renderIVTable(); };

  el.addEventListener('blur', commit);
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); el.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); el.removeEventListener('blur', commit); cancel(); }
  });
  if (el.tagName === 'SELECT') el.addEventListener('change', () => { el.removeEventListener('blur', commit); commit(); });
}

function applyEdit(stratId, pos, field, rawValue) {
  if (field === 'type') {
    if (['call','put','suby'].includes(rawValue) && rawValue !== pos.type) {
      pos.type = rawValue;
      pos.cachedSigma = 0.30;
      delete state.simParams.ivOriginals[pos.strike];
      delete state.simParams.ivOverrides[pos.strike];
    }
  } else if (field === 'lotes') {
    const v = parseInt(rawValue, 10);
    if (isFinite(v) && v !== 0) pos.lotes = v;
  } else if (field === 'strike') {
    const v = parseFloat(rawValue);
    if (isFinite(v) && v > 0 && v !== pos.strike) {
      delete state.simParams.ivOriginals[pos.strike];
      delete state.simParams.ivOverrides[pos.strike];
      pos.strike = v;
      pos.cachedSigma = 0.30;
    }
  } else if (field === 'prima') {
    const v = parseFloat(rawValue);
    if (isFinite(v) && v > 0) {
      pos.prima = +v.toFixed(4);
      pos.cachedSigma = 0.30;
      delete state.simParams.ivOriginals[pos.strike];
    }
  } else if (field === 'currentPrice') {
    const v = parseFloat(rawValue);
    if (isFinite(v) && v > 0) {
      pos.priceOverride = +v.toFixed(3);
    } else {
      delete pos.priceOverride;
    }
  }
  recompute();
  renderIVTable();
}

// ── Strategy name inline edit ────────────────────────────────────
function startStrategyNameEdit(spanEl, stratId) {
  if (spanEl.dataset.editingName) return;
  spanEl.dataset.editingName = '1';

  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'strategy-name-edit-input';
  inp.value = spanEl.textContent;
  spanEl.style.display = 'none';
  spanEl.parentNode.insertBefore(inp, spanEl.nextSibling);
  inp.focus();
  inp.select();

  const commit = () => {
    const name = inp.value.trim() || spanEl.textContent;
    spanEl.textContent = name;
    spanEl.style.display = '';
    delete spanEl.dataset.editingName;
    inp.remove();
    renameStrategy(stratId, name);
  };
  const cancel = () => {
    spanEl.style.display = '';
    delete spanEl.dataset.editingName;
    inp.remove();
  };

  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); inp.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); inp.removeEventListener('blur', commit); cancel(); }
  });
}

// ── Render: strategy panels ───────────────────────────────────────
const TYPE_LABEL = { call: 'Call', put: 'Put', suby: 'Acción' };

function buildStrategyPanelHTML(strat) {
  const disabledCls  = strat.enabled ? '' : 'strategy-disabled';
  const collapsedCls = strat.collapsed ? 'strategy-collapsed' : '';
  const collapseIcon = strat.collapsed ? '▶' : '▼';
  const bodyStyle    = strat.collapsed ? 'display:none' : '';
  const safeName     = strat.name.replace(/"/g, '&quot;').replace(/</g, '&lt;');

  return `
    <div class="strategy-panel ${disabledCls} ${collapsedCls}" id="strategy-${strat.id}" data-strat-id="${strat.id}">
      <div class="panel positions-panel-inner">
        <div class="positions-header">
          <div class="positions-header-left">
            <input type="checkbox" class="strategy-enabled-cb" ${strat.enabled ? 'checked' : ''}
                   data-strat-id="${strat.id}" title="Incluir en cálculo total">
            <span class="strategy-name-display" data-strat-id="${strat.id}" title="Doble clic para editar">${safeName}</span>
          </div>
          <div class="strategy-collapsed-summary" id="strat-csum-${strat.id}">
            <span class="csum-item"><span class="csum-label">Costo Armado</span><span class="csum-value" id="strat-csum-arm-${strat.id}">—</span></span>
            <span class="csum-sep">/</span>
            <span class="csum-item"><span class="csum-label">Costo Desarmado</span><span class="csum-value" id="strat-csum-des-${strat.id}">—</span></span>
            <span class="csum-sep">/</span>
            <span class="csum-item"><span class="csum-label">Resultado</span><span class="csum-value" id="strat-csum-res-${strat.id}">—</span></span>
          </div>
          <div class="positions-header-right">
            <label class="ppp-strat-label ${strat.ppp ? 'ppp-active' : ''}" title="Precio Ponderado Promedio">
              <input type="checkbox" class="ppp-strat-cb" data-strat-id="${strat.id}" ${strat.ppp ? 'checked' : ''}>
              PPP
            </label>
            <label class="ppp-strat-label cierre-strat-label ${strat.cierre ? 'ppp-active' : ''}" title="Precio de Cierre">
              <input type="checkbox" class="cierre-strat-cb" data-strat-id="${strat.id}" ${strat.cierre ? 'checked' : ''}>
              Cierre
            </label>
            <button class="btn-success strat-add-row"       data-strat-id="${strat.id}" ${strat.ppp ? 'disabled' : ''}>+ Agregar</button>
            <button class="btn-primary strat-import"        data-strat-id="${strat.id}" ${strat.ppp ? 'disabled' : ''}>⬇ Importar</button>
            <button class="btn-outline-accent strat-export" data-strat-id="${strat.id}">↑ Exportar</button>
            <button class="btn-outline-danger strat-clear"  data-strat-id="${strat.id}" ${strat.ppp ? 'disabled' : ''}>↺ Limpiar</button>
            <button class="btn-icon strat-collapse"         data-strat-id="${strat.id}" title="Colapsar/Expandir">${collapseIcon}</button>
            <button class="btn-icon strat-remove"           data-strat-id="${strat.id}" title="Eliminar estrategia">✕</button>
          </div>
        </div>
        <div class="strategy-body" style="${bodyStyle}">
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th style="text-align:left">Tipo</th>
                  <th>Lotes</th>
                  <th>Strike</th>
                  <th>Prima</th>
                  <th class="strat-th-price">${strat.cierre ? 'Precio Cierre' : 'Precio Actual'}</th>
                  <th>Var %</th>
                  <th>P&amp;L Actual</th>
                  <th>Vol. Impl.</th>
                  <th>Delta (Δ)</th>
                  <th>Gamma (Γ)</th>
                  <th>Vega (ν)</th>
                  <th>Theta (θ)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="strat-tbody-${strat.id}">
                <tr><td colspan="13"><div class="empty-state"><span class="empty-icon">📋</span>Agregá posiciones para comenzar</div></td></tr>
              </tbody>
            </table>
          </div>
          <div id="strat-summary-${strat.id}" class="summary-grid"></div>
        </div>
      </div>
    </div>`;
}

function renderStrategies() {
  const container = document.getElementById('strategies-container');
  container.innerHTML = state.strategies.map(s => buildStrategyPanelHTML(s)).join('');
  wireStrategyEvents();
}

function wireStrategyEvents() {
  const container = document.getElementById('strategies-container');

  container.querySelectorAll('.strategy-enabled-cb').forEach(cb => {
    cb.addEventListener('change', () => toggleStrategy(+cb.dataset.stratId, cb.checked));
  });

  container.querySelectorAll('.strategy-name-display').forEach(span => {
    span.addEventListener('dblclick', () => startStrategyNameEdit(span, +span.dataset.stratId));
  });

  container.querySelectorAll('.ppp-strat-cb').forEach(cb => {
    cb.addEventListener('change', () => toggleStrategyPPP(+cb.dataset.stratId, cb.checked));
  });

  container.querySelectorAll('.cierre-strat-cb').forEach(cb => {
    cb.addEventListener('change', () => toggleStrategyCierre(+cb.dataset.stratId, cb.checked));
  });

  container.querySelectorAll('.strat-add-row').forEach(btn => {
    btn.addEventListener('click', () => {
      const _defStrike = getAvailableStrikes('call')[0] ?? 0;
      addPosition(+btn.dataset.stratId, { type: 'call', lotes: 1, strike: _defStrike, prima: 0 });
      saveState();
      recompute();
    });
  });

  container.querySelectorAll('.strat-import').forEach(btn => {
    btn.addEventListener('click', () => openImportModal(+btn.dataset.stratId));
  });

  container.querySelectorAll('.strat-export').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = state.strategies.find(s => s.id === +btn.dataset.stratId);
      if (!s) return;
      const positions = s.ppp && s.pppOrigPositions ? s.pppOrigPositions : s.positions;
      if (!positions.length) return;
      const lines = positions.map(p => `${p.lotes}\t${fmtExport(p.strike)}\t${fmtExport(p.prima)}`);
      navigator.clipboard.writeText(lines.join('\n'));
      showToast('✓ Posiciones copiadas al portapapeles.');
    });
  });

  container.querySelectorAll('.strat-clear').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = +btn.dataset.stratId;
      const s  = state.strategies.find(s => s.id === id);
      if (!s?.positions.length || confirm('¿Limpiar las posiciones de esta estrategia?')) {
        clearStrategyPositions(id);
      }
    });
  });

  container.querySelectorAll('.strat-collapse').forEach(btn => {
    btn.addEventListener('click', () => collapseStrategy(+btn.dataset.stratId));
  });

  container.querySelectorAll('.strat-remove').forEach(btn => {
    btn.addEventListener('click', () => removeStrategy(+btn.dataset.stratId));
  });

  // Inline editing — single delegated listener
  container.addEventListener('dblclick', e => {
    const td = e.target.closest('td[data-field]');
    if (!td) return;
    const stratId = +td.dataset.stratId;
    const strat   = state.strategies.find(s => s.id === stratId);
    if (strat?.ppp) return;
    const posId   = +td.dataset.posId;
    const pos     = findPosition(stratId, posId);
    if (pos) startEdit(td, stratId, pos, td.dataset.field);
  });
}

// ── Render: table for one strategy ───────────────────────────────
function renderStrategyTable(stratId, computed) {
  const tbody = document.getElementById(`strat-tbody-${stratId}`);
  if (!tbody) return;

  if (tbody.querySelector('td.editing')) return;
  if (tbody.querySelector('.cierre-price-input:focus')) return;

  const strat = state.strategies.find(s => s.id === stratId);
  const isCierre = strat?.cierre ?? false;

  if (!computed.length) {
    tbody.innerHTML = `<tr><td colspan="13"><div class="empty-state"><span class="empty-icon">📋</span>Agregá posiciones para comenzar</div></td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  for (const { pos, g } of computed) {
    const pnlCls   = g.pnl > 0 ? 'pos' : g.pnl < 0 ? 'neg' : '';
    const lotesCls = pos.lotes > 0 ? 'pos' : 'neg';
    const lotesStr = (pos.lotes > 0 ? '+' : '') + pos.lotes;
    const ivStr    = isFinite(g.sigmaImpl) && g.sigmaImpl > 0 ? (g.sigmaImpl * 100).toFixed(2) + '%' : '—';
    const ivTip    = isFinite(g.sigmaImpl) && g.sigmaImpl > 0 ? (g.sigmaImpl * 100).toFixed(12) + '%' : '';
    const curStr   = g.currentPrice > 0 ? fmt3(g.currentPrice) : '—';
    const pnlStr   = g.pnl !== 0 ? '$' + fmt2(g.pnl) : '—';
    const isEdited = pos.priceOverride !== undefined;
    const priceCls = 'td-live' + (isEdited && !isCierre ? ' td-live-edited' : '');
    const resetBtn = isEdited && !isCierre
      ? `<button class="price-reset-btn" data-strat-id="${stratId}" data-id="${pos.id}" title="Restaurar precio de mercado">↺</button>`
      : '';

    const cierreVal = isCierre ? (strat.preciosCierre?.[pos.id] ?? g.currentPrice) : null;
    const priceCell = isCierre
      ? `<input type="number" class="cierre-price-input" data-strat-id="${stratId}" data-pos-id="${pos.id}" value="${cierreVal !== null ? cierreVal.toFixed(3) : ''}" step="0.001" min="0">`
      : `<span class="td-price-wrap">${curStr}${resetBtn}</span>`;

    const varPct = (g.currentPrice > 0 && pos.prima > 0)
      ? (g.currentPrice - pos.prima) / pos.prima * 100 : NaN;
    const varCls = !isFinite(varPct) ? 'muted' : varPct > 0 ? 'pos' : varPct < 0 ? 'neg' : 'neu';
    const varStr = isFinite(varPct) ? (varPct > 0 ? '+' : '') + varPct.toFixed(2) + '%' : '—';
    const gc = v => !isFinite(v) || Math.abs(v) < 1e-9 ? 'neu' : v > 0 ? 'pos' : 'neg';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-left td-type" data-field="type"         data-strat-id="${stratId}" data-pos-id="${pos.id}">${TYPE_LABEL[pos.type] ?? pos.type}</td>
      <td class="${lotesCls}"     data-field="lotes"        data-strat-id="${stratId}" data-pos-id="${pos.id}">${lotesStr}</td>
      <td                         data-field="strike"       data-strat-id="${stratId}" data-pos-id="${pos.id}">${fmt2(pos.strike)}</td>
      <td                         data-field="prima"        data-strat-id="${stratId}" data-pos-id="${pos.id}">${fmt3(pos.prima)}</td>
      <td class="${priceCls}"     data-field="currentPrice" data-strat-id="${stratId}" data-pos-id="${pos.id}">
        ${priceCell}
      </td>
      <td class="${varCls}">${varStr}</td>
      <td class="${pnlCls}">${pnlStr}</td>
      <td class="muted" title="${ivTip}">${ivStr}</td>
      <td class="${gc(g.delta)}">${fmt4(g.delta)}</td>
      <td class="${gc(g.gamma)}">${fmt6(g.gamma)}</td>
      <td class="${gc(g.vega)}">${fmt4(g.vega)}</td>
      <td class="${gc(g.theta)}">${fmt4(g.theta)}</td>
      <td><button class="remove-pos-btn" data-strat-id="${stratId}" data-id="${pos.id}">×</button></td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('.remove-pos-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      const stratId = +btn.dataset.stratId;
      if (state.strategies.find(s => s.id === stratId)?.ppp) return;
      removePosition(stratId, +btn.dataset.id);
    }));

  tbody.querySelectorAll('.price-reset-btn').forEach(btn =>
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const stratId = +btn.dataset.stratId;
      if (state.strategies.find(s => s.id === stratId)?.ppp) return;
      const pos = findPosition(stratId, +btn.dataset.id);
      if (pos) { delete pos.priceOverride; recompute(); }
    }));

  tbody.querySelectorAll('.cierre-price-input').forEach(input => {
    input.addEventListener('change', () => {
      const sid  = +input.dataset.stratId;
      const pid  = +input.dataset.posId;
      const val  = parseFloat(input.value);
      const s    = state.strategies.find(s => s.id === sid);
      if (!s || !s.cierre) return;
      if (!isFinite(val) || val < 0) return;
      s.preciosCierre[pid] = val;
      recompute();
      saveState();
    });
    // Prevent dblclick inline-edit from triggering on this input
    input.addEventListener('dblclick', e => e.stopPropagation());
  });
}

// ── Render: summary for one strategy ─────────────────────────────
function computeGreekTotals(computed) {
  return computed.reduce(
    (a, { g }) => ({
      delta: a.delta + (isFinite(g.delta) ? g.delta : 0),
      gamma: a.gamma + (isFinite(g.gamma) ? g.gamma : 0),
      vega:  a.vega  + (isFinite(g.vega)  ? g.vega  : 0),
      theta: a.theta + (isFinite(g.theta) ? g.theta : 0),
    }),
    { delta: 0, gamma: 0, vega: 0, theta: 0 }
  );
}

function renderStrategySummary(stratId, computed) {
  const el = document.getElementById(`strat-summary-${stratId}`);
  if (!el) return;
  const summary = computeSummary(computed);
  if (!summary) { el.innerHTML = ''; updateCollapsedSummary(stratId, null); return; }
  const greeks = computeGreekTotals(computed);
  renderSummaryInto(el, summary, greeks, computed.length > 0);
  updateCollapsedSummary(stratId, summary);
}

function updateCollapsedSummary(stratId, summary) {
  const armEl = document.getElementById(`strat-csum-arm-${stratId}`);
  const desEl = document.getElementById(`strat-csum-des-${stratId}`);
  const resEl = document.getElementById(`strat-csum-res-${stratId}`);
  if (!armEl || !desEl || !resEl) return;

  if (!summary) {
    armEl.textContent = '—'; armEl.className = 'csum-value';
    desEl.textContent = '—'; desEl.className = 'csum-value';
    resEl.textContent = '—'; resEl.className = 'csum-value';
    return;
  }

  const mon = v => isFinite(v) ? '$' + fmt2(v) : '—';
  const cs  = v => !isFinite(v) ? '' : v >= 0 ? ' pos' : ' neg';

  armEl.textContent = mon(summary.costoArmado);
  armEl.className   = 'csum-value' + cs(summary.costoArmado);
  desEl.textContent = mon(summary.costoDesarmado);
  desEl.className   = 'csum-value' + cs(summary.costoDesarmado);
  resEl.textContent = mon(summary.resultado);
  resEl.className   = 'csum-value' + cs(summary.resultado);
}

function renderSummaryInto(el, summary, greeks, hasPositions) {
  const cs  = v => !isFinite(v) ? '' : v >= 0 ? 'pos' : 'neg';
  const pct = v => isFinite(v) ? (v * 100).toFixed(2) + '%' : '—';
  const mon = v => isFinite(v) ? '$' + fmt2(v) : '—';
  const g   = greeks ?? { delta: 0, gamma: 0, vega: 0, theta: 0 };
  const gv  = v => hasPositions ? fmt4(v) : '—';

  el.innerHTML = `
    <div class="summary-section">
      <div class="sum-row">
        <span class="sum-label">Costo Armado</span>
        <span class="sum-value ${cs(summary.costoArmado)}">${mon(summary.costoArmado)}</span>
        <span class="sum-label">Costo Desarmado</span>
        <span class="sum-value ${cs(summary.costoDesarmado)}">${mon(summary.costoDesarmado)}</span>
        <span class="sum-label">Resultado</span>
        <span class="sum-value ${cs(summary.resultado)}">${mon(summary.resultado)}</span>
        <span class="sum-sep"></span>
        <span class="sum-label">Spread % Armado</span>
        <span class="sum-value">${pct(summary.spreadPctArmado)}</span>
        <span class="sum-label">Spread % Actual</span>
        <span class="sum-value ${cs(summary.spreadPctActual)}">${pct(summary.spreadPctActual)}</span>
      </div>
      <div class="sum-row">
        <span class="sum-label">Ratio Armado</span>
        <span class="sum-value">${fmt4(summary.ratioArmado)}</span>
        <span class="sum-label">Ratio Lotes</span>
        <span class="sum-value">${fmt4(summary.ratioLotes)}</span>
        <span class="sum-label">Ratio Actual</span>
        <span class="sum-value">${fmt4(summary.ratioActual)}</span>
        <span class="sum-sep"></span>
        <span class="sum-label">Costo RI/RC Arm.</span>
        <span class="sum-value">${mon(summary.costoRIRC_arm)}</span>
        <span class="sum-label">Costo RI/RC Act.</span>
        <span class="sum-value ${cs(summary.costoRIRC_act)}">${mon(summary.costoRIRC_act)}</span>
      </div>
      <div class="sum-row">
        <span class="sum-label">Delta (Δ)</span>
        <span class="sum-value">${gv(g.delta)}</span>
        <span class="sum-label">Gamma (Γ)</span>
        <span class="sum-value">${hasPositions ? fmt6(g.gamma) : '—'}</span>
        <span class="sum-label">Vega (ν)</span>
        <span class="sum-value">${gv(g.vega)}</span>
        <span class="sum-label">Theta (θ)</span>
        <span class="sum-value">${gv(g.theta)}</span>
      </div>
    </div>`;
}

// ── Render: Greeks panel (global totals) ─────────────────────────
function renderGreeks(computed) {
  const t   = computeGreekTotals(computed);
  const has = computed.length > 0;
  document.getElementById('g-delta').textContent = has ? fmt4(t.delta) : '—';
  document.getElementById('g-gamma').textContent = has ? fmt6(t.gamma) : '—';
  document.getElementById('g-vega').textContent  = has ? fmt4(t.vega)  : '—';
  document.getElementById('g-theta').textContent = has ? fmt4(t.theta) : '—';
}

// ── Render: IV table (all positions, enabled or not) ─────────────
function renderIVTable() {
  const wrap   = document.getElementById('iv-table-wrap');
  const optPos = getAllPositions().filter(p => p.type !== 'suby');
  if (!optPos.length) { wrap.innerHTML = ''; return; }

  if (wrap.contains(document.activeElement) && document.activeElement.classList.contains('iv-input')) return;

  const strikes = [...new Set(optPos.map(p => p.strike))].sort((a, b) => a - b);

  const rows = strikes.map(k => {
    const ov  = state.simParams.ivOverrides[k];
    const or_ = state.simParams.ivOriginals[k];
    const val = ov !== undefined ? ov.toFixed(12) : or_ !== undefined ? or_.toFixed(12) : '';
    const highlighted = ov !== undefined;
    return `
      <div class="iv-row" style="${highlighted ? 'border-color:var(--accent)' : ''}">
        <span class="iv-strike">${fmt2(k)}</span>
        <input type="number" class="iv-input" data-strike="${k}"
               value="${val}" min="0.000000000001" max="500" step="any" placeholder="—">
        <span class="iv-unit">%</span>
        <button class="iv-reset-btn" data-strike="${k}" title="Restablecer">↺</button>
      </div>`;
  }).join('');

  wrap.innerHTML = `
    <div class="iv-section-label">Volatilidad Implícita por Base</div>
    <div class="iv-vi-controls">
      <button class="scen-btn" data-act="vi" data-p="-5">−5 pp</button>
      <button class="scen-btn" data-act="vi" data-p="-2">−2 pp</button>
      <button class="scen-btn" data-act="vi" data-p="2">+2 pp</button>
      <button class="scen-btn" data-act="vi" data-p="5">+5 pp</button>
      <button class="scen-btn scen-reset-btn" data-act="reset-vi">↺ Reset</button>
    </div>
    <div class="iv-rows">${rows}</div>`;

  wrap.querySelectorAll('.iv-input').forEach(inp => {
    const k = parseFloat(inp.dataset.strike);
    inp.addEventListener('change', () => {
      const v = parseFloat(inp.value);
      if (isFinite(v) && v > 0) {
        state.simParams.ivOverrides[k] = v;
        inp.closest('.iv-row').style.borderColor = 'var(--accent)';
      } else {
        delete state.simParams.ivOverrides[k];
        inp.closest('.iv-row').style.borderColor = '';
      }
      recompute();
    });
  });

  wrap.querySelectorAll('.iv-reset-btn').forEach(btn => {
    const k = parseFloat(btn.dataset.strike);
    btn.addEventListener('click', () => {
      delete state.simParams.ivOverrides[k];
      renderIVTable();
      recompute();
    });
  });

  wrap.querySelectorAll('.scen-btn[data-act="vi"]').forEach(btn =>
    btn.addEventListener('click', () => applyScenarioVI(+btn.dataset.p)));
  const resetViBtn = wrap.querySelector('.scen-btn[data-act="reset-vi"]');
  if (resetViBtn) resetViBtn.addEventListener('click', resetScenarioVI);
}

// ── P&L chart ────────────────────────────────────────────────────
let pnlChart = null;

const verticalLinePlugin = {
  id: 'verticalLine',
  afterDraw(chart) {
    const meta0 = chart.getDatasetMeta(0);
    const meta1 = chart.getDatasetMeta(1);
    if (!meta0?.data.length) return;
    const midIdx = Math.floor(meta0.data.length / 2);
    const x  = meta0.data[midIdx].x;
    const y0 = meta0.data[midIdx].y;
    const y1 = meta1?.data[midIdx]?.y;
    const { ctx, chartArea: { top, bottom } } = chart;

    ctx.save();
    ctx.strokeStyle = 'rgba(210,210,210,0.55)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(x, y0, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#58a6ff';
    ctx.fill();
    ctx.strokeStyle = '#0d1117';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (y1 !== undefined) {
      ctx.beginPath();
      ctx.arc(x, y1, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#3fb950';
      ctx.fill();
      ctx.strokeStyle = '#0d1117';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  },
};

function buildPnLData() {
  const S   = state.simParams.S || 1;
  const T   = state.simParams.dte / 365;
  const r   = state.simParams.r / 100;
  const N   = 61;
  const labels = [], seriesAct = [], seriesExp = [];
  const allPositions = getEnabledPositions();

  for (let i = 0; i < N; i++) {
    const Sn = S * (0.80 + i * 0.40 / (N - 1));
    labels.push(FMT2.format(+Sn.toFixed(0)));
    let pnlAct = 0, pnlExp = 0;

    for (const pos of allPositions) {
      const s100 = pos.lotes * 100;
      if (pos.type === 'suby') {
        pnlAct += (Sn - pos.prima) * pos.lotes;
        pnlExp += (Sn - pos.prima) * pos.lotes;
        continue;
      }
      const isCall = pos.type === 'call';
      const ov  = state.simParams.ivOverrides[pos.strike];
      const sig = ov !== undefined ? ov / 100 : (pos.cachedSigma || 0.30);
      const pAct = isCall ? bsCall(Sn, pos.strike, T, r, sig) : bsPut(Sn, pos.strike, T, r, sig);
      const pExp = isCall ? Math.max(Sn - pos.strike, 0)      : Math.max(pos.strike - Sn, 0);
      pnlAct += (pAct - pos.prima) * s100;
      pnlExp += (pExp - pos.prima) * s100;
    }
    seriesAct.push(+pnlAct.toFixed(2));
    seriesExp.push(+pnlExp.toFixed(2));
  }
  return { labels, seriesAct, seriesExp };
}

function initPnLChart() {
  Chart.register(verticalLinePlugin);
  const ctx = document.getElementById('pnlChart').getContext('2d');
  const { labels, seriesAct, seriesExp } = buildPnLData();
  pnlChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'P&L Actual',
          data: seriesAct,
          borderColor: '#58a6ff',
          backgroundColor: 'rgba(88,166,255,0.08)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          fill: true,
        },
        {
          label: 'P&L al Vencimiento',
          data: seriesExp,
          borderColor: '#3fb950',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [3, 3],
          pointRadius: 0,
          tension: 0,
        },
      ],
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#8b949e', font: { size: 12 } } },
        tooltip: { callbacks: { label: c => c.dataset.label + ': $' + FMT2.format(c.parsed.y) } },
      },
      scales: {
        x: { ticks: { color: '#6e7681', maxTicksLimit: 10, font: { size: 11 } }, grid: { color: 'rgba(48,54,61,0.6)' } },
        y: { ticks: { color: '#6e7681', font: { size: 11 }, callback: v => '$' + FMT2.format(v) }, grid: { color: 'rgba(48,54,61,0.6)' } },
      },
    },
  });
}

function updatePnLChart() {
  if (!pnlChart) return;
  const { labels, seriesAct, seriesExp } = buildPnLData();
  pnlChart.data.labels           = labels;
  pnlChart.data.datasets[0].data = seriesAct;
  pnlChart.data.datasets[1].data = seriesExp;
  pnlChart.update('none');
}

// ── Master recompute ─────────────────────────────────────────────
function recompute() {
  const allComputed = [];
  for (const strat of state.strategies) {
    const computed = computeAll(strat.positions, strat.cierre ? strat.preciosCierre : undefined);
    renderStrategyTable(strat.id, computed);
    renderStrategySummary(strat.id, computed);
    if (strat.enabled) allComputed.push(...computed);
  }
  renderGreeks(allComputed);
  renderIVTable();
  updatePnLChart();
  updateSimSummary();
  saveState();
}

// ── Strategy CRUD ────────────────────────────────────────────────
function addStrategy(data) {
  const id = nextStrategyId++;
  state.strategies.push({
    id,
    name:              data?.name ?? `Estrategia ${id}`,
    enabled:           true,
    collapsed:         false,
    positions:         [],
    nextId:            1,
    ppp:               false,
    pppOrigPositions:  null,
    cierre:            false,
    preciosCierre:     {},
  });
  renderStrategies();
  recompute();
  return id;
}

function removeStrategy(id) {
  if (!confirm('¿Eliminar esta estrategia y todas sus posiciones?')) return;
  state.strategies = state.strategies.filter(s => s.id !== id);
  syncIVKeys();
  renderStrategies();
  recompute();
}

function toggleStrategy(id, enabled) {
  const s = state.strategies.find(s => s.id === id);
  if (!s) return;
  s.enabled = enabled;
  s.collapsed = !enabled;
  const panel = document.getElementById(`strategy-${id}`);
  if (panel) {
    panel.classList.toggle('strategy-disabled', !enabled);
    panel.classList.toggle('strategy-collapsed', s.collapsed);
    const body = panel.querySelector('.strategy-body');
    const btn  = panel.querySelector('.strat-collapse');
    if (body) body.style.display = s.collapsed ? 'none' : '';
    if (btn)  btn.textContent    = s.collapsed ? '▶' : '▼';
  }
  recompute();
}

function collapseStrategy(id) {
  const s = state.strategies.find(s => s.id === id);
  if (!s) return;
  s.collapsed = !s.collapsed;
  const panel = document.getElementById(`strategy-${id}`);
  if (!panel) return;
  const body = panel.querySelector('.strategy-body');
  const btn  = panel.querySelector('.strat-collapse');
  if (body) body.style.display = s.collapsed ? 'none' : '';
  if (btn)  btn.textContent    = s.collapsed ? '▶' : '▼';
  panel.classList.toggle('strategy-collapsed', s.collapsed);
  saveState();
}

function renameStrategy(id, name) {
  const s = state.strategies.find(s => s.id === id);
  if (s) { s.name = name; saveState(); }
}

function addPosition(stratId, data) {
  const s = state.strategies.find(s => s.id === stratId);
  if (!s) return;
  s.positions.push({
    id:          s.nextId++,
    type:        data.type   ?? 'call',
    lotes:       data.lotes  ?? 1,
    strike:      data.strike ?? 0,
    prima:       data.prima  ?? 0,
    cachedSigma: 0.30,
  });
}

function removePosition(stratId, posId) {
  const s = state.strategies.find(s => s.id === stratId);
  if (!s) return;
  s.positions = s.positions.filter(p => p.id !== posId);
  syncIVKeys();
  renderIVTable();
  recompute();
}

function clearStrategyPositions(stratId) {
  const s = state.strategies.find(s => s.id === stratId);
  if (!s) return;
  s.positions        = [];
  s.nextId           = 1;
  s.ppp              = false;
  s.pppOrigPositions = null;
  s.cierre           = false;
  s.preciosCierre    = {};
  const panel = document.getElementById(`strategy-${stratId}`);
  if (panel) {
    const pppCb = panel.querySelector('.ppp-strat-cb');
    if (pppCb) pppCb.checked = false;
    panel.querySelector('.ppp-strat-label')?.classList.remove('ppp-active');
    panel.querySelector('.strat-add-row').disabled = false;
    panel.querySelector('.strat-import').disabled  = false;
    panel.querySelector('.strat-clear').disabled   = false;
    const ciCb = panel.querySelector('.cierre-strat-cb');
    if (ciCb) ciCb.checked = false;
    panel.querySelector('.cierre-strat-label')?.classList.remove('ppp-active');
    const th = panel.querySelector('.strat-th-price');
    if (th) th.textContent = 'Precio Actual';
  }
  syncIVKeys();
  renderIVTable();
  recompute();
}

// ── Scenario buttons ─────────────────────────────────────────────
function applyScenarioS(pct) {
  if (state.simParams.S <= 0) return;
  state.simParams.S = +(state.simParams.S * (1 + pct / 100)).toFixed(4);
  document.getElementById('sim-S').value = Math.round(state.simParams.S);
  updateSimSummary();
  recompute();
}

function resetScenarioS() {
  state.simParams.S = state.simParams.S_orig;
  document.getElementById('sim-S').value = state.simParams.S_orig > 0 ? Math.round(state.simParams.S_orig) : '';
  updateSimSummary();
  recompute();
}

function applyScenarioVI(pp) {
  const strikes = [...new Set(getAllPositions().filter(p => p.type !== 'suby').map(p => p.strike))];
  for (const k of strikes) {
    const cur = state.simParams.ivOverrides[k] ?? state.simParams.ivOriginals[k] ?? 30;
    state.simParams.ivOverrides[k] = Math.max(0.01, +(cur + pp).toFixed(4));
  }
  renderIVTable();
  recompute();
}

function resetScenarioVI() {
  state.simParams.ivOverrides = {};
  renderIVTable();
  recompute();
}

// ── Import ───────────────────────────────────────────────────────
let _pendingImportStratId = null;

function parseImportText(text, type) {
  const result = [];
  for (const line of text.trim().split('\n')) {
    const cols = line.trim().split(/\t|\s{2,}|\s+/);
    if (cols.length < 3) continue;
    const lotes  = parseInt(cols[0], 10);
    const strike = parseNum(cols[1]);
    const prima  = parseNum(cols[2]);
    if (!isFinite(lotes) || lotes === 0 || !isFinite(strike) || !isFinite(prima)) continue;
    result.push({ type, lotes, strike, prima });
  }
  return result;
}

function openImportModal(stratId) {
  _pendingImportStratId = stratId ?? null;
  document.getElementById('import-error').textContent = '';
  const h3 = document.querySelector('#import-modal h3');
  if (h3) h3.textContent = stratId ? 'Importar posiciones' : 'Importar como nueva estrategia';
  document.getElementById('import-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('import-textarea').focus(), 50);
}

function closeImportModal() {
  document.getElementById('import-modal').style.display = 'none';
  document.getElementById('import-textarea').value = '';
  document.getElementById('import-error').textContent = '';
}

function confirmImport() {
  const text   = document.getElementById('import-textarea').value;
  const type   = document.getElementById('import-type').value;
  const parsed = parseImportText(text, type);
  if (!parsed.length) {
    document.getElementById('import-error').textContent =
      'No se encontraron filas válidas. Formato: lotes   strike   prima';
    return;
  }
  closeImportModal();
  let targetStratId = _pendingImportStratId;
  if (targetStratId === null) {
    targetStratId = addStrategy();
  }

  for (const p of parsed) addPosition(targetStratId, p);
  recompute();
  renderIVTable();
}

// ── Config ───────────────────────────────────────────────────────
function openConfigModal() {
  document.getElementById('cfg-auto').checked     = state.config.autoUpdate;
  document.getElementById('cfg-interval').value   = state.config.intervalSec;
  document.getElementById('cfg-connection').value = state.config.connection;
  document.getElementById('cfg-iv-method').value  = window.APP_IV_METHOD || 'bs';
  document.getElementById('config-modal').style.display = 'flex';
}

function closeConfigModal() {
  document.getElementById('config-modal').style.display = 'none';
}

function applyConfig() {
  state.config.autoUpdate  = document.getElementById('cfg-auto').checked;
  state.config.intervalSec = parseInt(document.getElementById('cfg-interval').value) || 0;
  state.config.connection  = document.getElementById('cfg-connection').value;
  setIvMethod(document.getElementById('cfg-iv-method').value);
  startAutoTimer();
  saveConfig();
  recompute();
}

// ── Persistence ──────────────────────────────────────────────────
const LS_KEY_STATE    = 'sim_state_v2';
const LS_KEY_STATE_V1 = 'sim_state_v1';
const LS_KEY_CONFIG   = 'sim_config_v1';

function saveConfig() {
  localStorage.setItem(LS_KEY_CONFIG, JSON.stringify(state.config));
}

function loadConfig() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY_CONFIG) ?? 'null');
    if (s) Object.assign(state.config, s);
  } catch {}
}

function saveState() {
  localStorage.setItem(LS_KEY_STATE, JSON.stringify({
    nextStrategyId,
    strategies: state.strategies.map(s => ({
      id:        s.id,
      name:      s.name,
      enabled:   s.enabled,
      collapsed: s.collapsed,
      nextId:    s.nextId,
      positions: (s.ppp && s.pppOrigPositions ? s.pppOrigPositions : s.positions)
                   .map(({ id, type, lotes, strike, prima }) => ({ id, type, lotes, strike, prima })),
    })),
    simParams: {
      S:          state.simParams.S,
      S_orig:     state.simParams.S_orig,
      r:          state.simParams.r,
      dte:        state.simParams.dte,
      comisiones: state.simParams.comisiones,
      opexDate:   state.simParams.opexDate,
    },
  }));
}

function loadSavedState() {
  try {
    let s = JSON.parse(localStorage.getItem(LS_KEY_STATE) ?? 'null');

    if (!s) {
      // Migrate from v1
      const v1 = JSON.parse(localStorage.getItem(LS_KEY_STATE_V1) ?? 'null');
      if (v1?.positions?.length) {
        s = {
          nextStrategyId: 2,
          strategies: [{
            id: 1, name: 'Estrategia 1', enabled: true, collapsed: false,
            nextId: v1.nextId ?? v1.positions.length + 1,
            positions: v1.positions,
            ppp: false, pppOrigPositions: null,
          }],
          simParams: v1.simParams,
        };
      }
    }

    if (!s) return false;

    nextStrategyId = s.nextStrategyId ?? 1;
    if (s.simParams) {
      state.simParams.S          = s.simParams.S          ?? 0;
      state.simParams.S_orig     = s.simParams.S_orig     ?? 0;
      state.simParams.r          = s.simParams.r          ?? 40;
      state.simParams.dte        = s.simParams.dte        ?? calcDTE();
      state.simParams.comisiones = s.simParams.comisiones ?? 0.5;
      state.simParams.opexDate   = s.simParams.opexDate   ?? getDefaultOpexDate();
    }
    for (const strat of (s.strategies ?? [])) {
      state.strategies.push({
        id:               strat.id,
        name:             strat.name      ?? `Estrategia ${strat.id}`,
        enabled:          strat.enabled   ?? true,
        collapsed:        strat.collapsed ?? false,
        nextId:           strat.nextId    ?? 1,
        positions:        (strat.positions ?? []).map(p => ({ ...p, cachedSigma: 0.30 })),
        ppp:              false,
        pppOrigPositions: null,
        cierre:           false,
        preciosCierre:    {},
      });
    }
    return state.strategies.some(s => s.positions.length > 0);
  } catch { return false; }
}

// ── Init ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  const hasPositions = loadSavedState();

  // Default: one empty strategy if none loaded
  if (!state.strategies.length) {
    state.strategies.push({ id: nextStrategyId++, name: 'Estrategia 1', enabled: true, collapsed: false, positions: [], nextId: 1, ppp: false, pppOrigPositions: null, cierre: false, preciosCierre: {} });
  }

  document.getElementById('sim-S').value          = state.simParams.S > 0 ? Math.round(state.simParams.S) : '';
  document.getElementById('sim-r').value          = state.simParams.r;
  document.getElementById('sim-opex-date').value  = state.simParams.opexDate;
  document.getElementById('sim-dte').value        = state.simParams.dte || calcDTEFromDate(state.simParams.opexDate);
  document.getElementById('sim-comisiones').value = state.simParams.comisiones.toFixed(3);
  updateSimSummary();

  ['input', 'change'].forEach(ev => {
    document.getElementById('sim-S').addEventListener(ev, () => {
      const v = parseFloat(document.getElementById('sim-S').value);
      if (isFinite(v) && v > 0) { state.simParams.S = v; updateSimSummary(); recompute(); }
    });
    document.getElementById('sim-r').addEventListener(ev, () => {
      const v = parseFloat(document.getElementById('sim-r').value);
      if (isFinite(v)) { state.simParams.r = v; updateSimSummary(); recompute(); }
    });
    document.getElementById('sim-dte').addEventListener(ev, () => {
      const v = parseInt(document.getElementById('sim-dte').value);
      if (isFinite(v) && v >= 0) { state.simParams.dte = v; updateSimSummary(); recompute(); }
    });
    document.getElementById('sim-comisiones').addEventListener(ev, () => {
      const v = parseFloat(document.getElementById('sim-comisiones').value);
      if (isFinite(v) && v >= 0) { state.simParams.comisiones = v; recompute(); }
    });
    document.getElementById('sim-opex-date').addEventListener(ev, () => {
      const dateStr = document.getElementById('sim-opex-date').value;
      if (!dateStr) return;
      state.simParams.opexDate = dateStr;
      const dte = calcDTEFromDate(dateStr);
      state.simParams.dte = dte;
      document.getElementById('sim-dte').value = dte;
      updateSimSummary();
      recompute();
    });
  });

  document.getElementById('sim-dte-reset').addEventListener('click', () => {
    const dte = calcDTEFromDate(state.simParams.opexDate);
    state.simParams.dte = dte;
    document.getElementById('sim-dte').value = dte;
    updateSimSummary();
    recompute();
  });

  // Scenario buttons
  document.querySelectorAll('.scen-btn[data-act="s"]').forEach(btn =>
    btn.addEventListener('click', () => applyScenarioS(+btn.dataset.p)));
  document.querySelector('.scen-btn[data-act="reset-s"]').addEventListener('click', resetScenarioS);

  // Global strategy bar
  document.getElementById('add-strategy-btn').addEventListener('click', () => addStrategy());
  document.getElementById('import-strategy-btn').addEventListener('click', () => openImportModal(null));
  document.getElementById('export-strategy-btn').addEventListener('click', () => {
    const lines = state.strategies.flatMap(s => s.positions.map(p => `${p.lotes}\t${fmtExport(p.strike)}\t${fmtExport(p.prima)}`));
    if (!lines.length) return;
    navigator.clipboard.writeText(lines.join('\n'));
    showToast('✓ Todas las posiciones copiadas al portapapeles.');
  });
  document.getElementById('clear-strategy-btn').addEventListener('click', () => {
    const hasAny = state.strategies.some(s => s.positions.length > 0);
    if (!hasAny || confirm('¿Limpiar todas las estrategias?')) {
      state.strategies.forEach(s => {
        s.positions = []; s.nextId = 1;
        s.ppp = false; s.pppOrigPositions = null;
        s.cierre = false; s.preciosCierre = {};
      });
      state.simParams.ivOverrides = {};
      state.simParams.ivOriginals = {};
      renderStrategies();
      recompute();
    }
  });

  // Import modal
  document.getElementById('import-cancel').addEventListener('click',  closeImportModal);
  document.getElementById('import-confirm').addEventListener('click', confirmImport);
  document.getElementById('import-modal').addEventListener('click',   e => { if (e.target === e.currentTarget) closeImportModal(); });

  // Manual refresh
  document.getElementById('manual-refresh-btn').addEventListener('click', fetchPrices);

  // Config modal
  document.getElementById('config-btn').addEventListener('click',    openConfigModal);
  document.getElementById('config-cancel').addEventListener('click', closeConfigModal);
  document.getElementById('config-save').addEventListener('click',   () => { applyConfig(); closeConfigModal(); });
  document.getElementById('config-reload').addEventListener('click', () => { applyConfig(); closeConfigModal(); fetchPrices(); });
  document.getElementById('config-modal').addEventListener('click',  e => { if (e.target === e.currentTarget) closeConfigModal(); });

  // ESC
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeImportModal(); closeConfigModal(); }
  });

  // Panel collapse buttons
  function applyPanelState(key, expanded) {
    const body = document.getElementById(`${key}-panel-body`);
    const btn  = document.getElementById(`${key}-panel-toggle`);
    if (!body || !btn) return;
    body.style.display = expanded ? '' : 'none';
    btn.textContent    = expanded ? '▼' : '▶';
    if (key === 'sim') document.getElementById('sim-panel').classList.toggle('sim-collapsed', !expanded);
    if (key === 'pnl' && expanded && pnlChart) pnlChart.resize();
  }

  // Apply saved state
  applyPanelState('sim', state.config.panels.sim !== false);
  applyPanelState('pnl', state.config.panels.pnl !== false);

  ['sim', 'pnl'].forEach(key => {
    document.getElementById(`${key}-panel-toggle`).addEventListener('click', () => {
      state.config.panels[key] = !state.config.panels[key];
      applyPanelState(key, state.config.panels[key]);
      saveConfig();
    });
  });

  // Render strategy panels
  renderStrategies();
  initPnLChart();

  if (hasPositions) {
    recompute();
    renderIVTable();
  } else {
    renderGreeks([]);
  }

  fetchPrices();
  startAutoTimer();
});
