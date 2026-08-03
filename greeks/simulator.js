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

function parseNum(s) {
  if (typeof s === 'number') return s;
  return parseFloat(String(s).trim().replace(',', '.'));
}

let _toastTimer = null;
function showToast() {
  const el = document.getElementById('toast');
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ── Constants ───────────────────────────────────────────────────
const API_BASE = 'https://script.google.com/macros/s/AKfycbzYrpSs7-4n9hL7SK15DeaDVbP8apabGGXQLVVf5h_u2kb3WB2xY5WpBBiD_N0bBGvX/exec';
const EXPIRY_DATE = new Date(2026, 7, 21); // 21 Aug 2026, hora local

function calcDTE() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((EXPIRY_DATE.getTime() - today.getTime()) / 86400000));
}

// ── State ────────────────────────────────────────────────────────
let nextId = 1;

const state = {
  positions: [],
  simParams: {
    S: 0,
    S_orig: 0,
    r: 40,
    dte: calcDTE(),
    comisiones: 0.5,
    ivOverrides: {},  // { [strike]: pct } — manual overrides
    ivOriginals: {},  // { [strike]: pct } — implied from entry prima
  },
  config: {
    autoUpdate: true,
    intervalSec: 7,
    connection: 'DMD_Bot',
  },
  apiData: {
    prices: {},      // { [strike_num]: lastPrice }
    subyPrice: 0,
    lastFetch: null,
  },
};

let autoTimer = null;
let countdownVal = 0;
let isFetching = false;

// ── API ──────────────────────────────────────────────────────────
function mapApiResponse(json) {
  const prices = {};
  let subyPrice = 0;
  const rows = json.values || [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 5) continue;
    const strikeRaw = String(row[0]).trim().toUpperCase();
    const type      = String(row[1]).trim().toUpperCase();
    const last      = parseNum(row[4]);
    if (!isFinite(last) || last <= 0) continue;
    if (type === 'SUBY' && strikeRaw === 'GGAL') {
      subyPrice = last;
    } else if (type === 'CALL' || type === 'PUT') {
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
    const { prices, subyPrice } = mapApiResponse(json);
    state.apiData.prices    = prices;
    state.apiData.lastFetch = new Date();

    if (subyPrice > 0) {
      state.apiData.subyPrice = subyPrice;
      const userEdited = state.simParams.S_orig > 0 && state.simParams.S !== state.simParams.S_orig;
      if (!userEdited) {
        state.simParams.S_orig = subyPrice;
        state.simParams.S      = subyPrice;
        document.getElementById('sim-S').value = subyPrice.toFixed(2);
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
function computeLeg(pos) {
  const S       = state.simParams.S;
  const T       = state.simParams.dte / 365;
  const r       = state.simParams.r / 100;
  const sign100 = pos.lotes * 100;
  const priceKey = pos.type === 'suby' ? null : pos.type.toUpperCase() + '_' + pos.strike;
  const apiP    = priceKey ? (state.apiData.prices[priceKey] ?? 0) : (state.apiData.subyPrice ?? 0);
  const curP    = pos.priceOverride !== undefined ? pos.priceOverride : apiP;

  if (pos.type === 'suby') {
    const pnl = curP > 0 ? (curP - pos.prima) * sign100 : 0;
    return { currentPrice: curP, sigmaImpl: NaN, sigma: NaN, price: curP * sign100, pnl, delta: sign100, gamma: 0, vega: 0, theta: 0 };
  }

  if (S <= 0 || T <= 0) {
    return { currentPrice: curP, sigmaImpl: NaN, sigma: NaN, price: 0, pnl: 0, delta: 0, gamma: 0, vega: 0, theta: 0 };
  }

  const isCall = pos.type === 'call';

  // Current market IV — derived from live API price, drives the VI Impl. column
  // and is always what "reset" in the IV panel returns to
  let currentMarketIV = NaN;
  if (curP > 0) {
    const miv = isCall
      ? impliedVol(S, pos.strike, T, r, curP)
      : impliedVolPut(S, pos.strike, T, r, curP);
    if (isFinite(miv) && miv > 0) {
      currentMarketIV = miv;
      state.simParams.ivOriginals[pos.strike] = miv * 100; // keep in sync on every cycle
    }
  }

  // Sigma used for BS pricing: override → current market IV → entry prima IV → cached
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

  // sigmaImpl shown in the "VI Impl." column is always the current market IV
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

function computeAll() {
  return state.positions.map(pos => ({ pos, g: computeLeg(pos) }));
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
function startEdit(td, pos, field) {
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

  const commit = () => { td.classList.remove('editing'); applyEdit(pos, field, el.value); };
  const cancel = () => { td.classList.remove('editing'); recompute(); renderIVTable(); };

  el.addEventListener('blur', commit);
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); el.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); el.removeEventListener('blur', commit); cancel(); }
  });
  // selects commit immediately on change
  if (el.tagName === 'SELECT') el.addEventListener('change', () => { el.removeEventListener('blur', commit); commit(); });
}

function applyEdit(pos, field, rawValue) {
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

// ── Render: positions table ──────────────────────────────────────
const TYPE_LABEL = { call: 'Call', put: 'Put', suby: 'Acción' };

function renderTable(computed) {
  const tbody = document.getElementById('positions-tbody');

  // Don't re-render while user is editing a cell
  if (tbody.querySelector('td.editing')) return;

  if (!computed.length) {
    tbody.innerHTML = `<tr><td colspan="12"><div class="empty-state"><span class="empty-icon">📋</span>Importá posiciones para comenzar</div></td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  for (const { pos, g } of computed) {
    const pnlCls    = g.pnl > 0 ? 'pos' : g.pnl < 0 ? 'neg' : '';
    const lotesCls  = pos.lotes > 0 ? 'pos' : 'neg';
    const lotesStr  = (pos.lotes > 0 ? '+' : '') + pos.lotes;
    const ivStr     = isFinite(g.sigmaImpl) && g.sigmaImpl > 0 ? (g.sigmaImpl * 100).toFixed(2) + '%' : '—';
    const ivTooltip = isFinite(g.sigmaImpl) && g.sigmaImpl > 0 ? (g.sigmaImpl * 100).toFixed(12) + '%' : '';
    const curStr    = g.currentPrice > 0 ? fmt3(g.currentPrice) : '—';
    const pnlStr    = g.pnl !== 0 ? '$' + fmt2(g.pnl) : '—';
    const isEdited  = pos.priceOverride !== undefined;
    const priceCls  = 'td-live' + (isEdited ? ' td-live-edited' : '');
    const resetBtn  = isEdited
      ? `<button class="price-reset-btn" data-id="${pos.id}" title="Restaurar precio de mercado">↺</button>`
      : '';

    const varPct    = (g.currentPrice > 0 && pos.prima > 0)
      ? (g.currentPrice - pos.prima) / pos.prima * 100
      : NaN;
    const varCls    = !isFinite(varPct) ? 'muted' : varPct > 0 ? 'pos' : varPct < 0 ? 'neg' : 'neu';
    const varStr    = isFinite(varPct)
      ? (varPct > 0 ? '+' : '') + varPct.toFixed(2) + '%'
      : '—';

    const gc = v => !isFinite(v) || Math.abs(v) < 1e-9 ? 'neu' : v > 0 ? 'pos' : 'neg';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-left td-type" data-field="type"         data-pos-id="${pos.id}">${TYPE_LABEL[pos.type] ?? pos.type}</td>
      <td class="${lotesCls}"     data-field="lotes"        data-pos-id="${pos.id}">${lotesStr}</td>
      <td                         data-field="strike"       data-pos-id="${pos.id}">${fmt2(pos.strike)}</td>
      <td                         data-field="prima"        data-pos-id="${pos.id}">${fmt3(pos.prima)}</td>
      <td class="${priceCls}"     data-field="currentPrice" data-pos-id="${pos.id}">
        <span class="td-price-wrap">${curStr}${resetBtn}</span>
      </td>
      <td class="${varCls}">${varStr}</td>
      <td class="${pnlCls}">${pnlStr}</td>
      <td class="muted" title="${ivTooltip}">${ivStr}</td>
      <td class="${gc(g.delta)}">${fmt4(g.delta)}</td>
      <td class="${gc(g.gamma)}">${fmt6(g.gamma)}</td>
      <td class="${gc(g.vega)}">${fmt4(g.vega)}</td>
      <td class="${gc(g.theta)}">${fmt4(g.theta)}</td>
      <td><button class="remove-pos-btn" data-id="${pos.id}">×</button></td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('.remove-pos-btn').forEach(btn =>
    btn.addEventListener('click', () => removePosition(+btn.dataset.id)));

  tbody.querySelectorAll('.price-reset-btn').forEach(btn =>
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const pos = state.positions.find(p => p.id === +btn.dataset.id);
      if (pos) { delete pos.priceOverride; recompute(); }
    }));
}

// ── Render: summary stats ────────────────────────────────────────
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

function renderSummary(summary, greeks, hasPositions) {
  const el = document.getElementById('summary-grid');
  if (!summary) { el.innerHTML = ''; return; }

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
    </div>
  `;
}

// ── Render: Greeks panel ─────────────────────────────────────────
function renderGreeks(computed) {
  const t   = computeGreekTotals(computed);
  const has = computed.length > 0;
  document.getElementById('g-delta').textContent = has ? fmt4(t.delta) : '—';
  document.getElementById('g-gamma').textContent = has ? fmt6(t.gamma) : '—';
  document.getElementById('g-vega').textContent  = has ? fmt4(t.vega)  : '—';
  document.getElementById('g-theta').textContent = has ? fmt4(t.theta) : '—';
}

// ── Render: IV table ─────────────────────────────────────────────
function renderIVTable() {
  const wrap = document.getElementById('iv-table-wrap');
  const optPos = state.positions.filter(p => p.type !== 'suby');
  if (!optPos.length) { wrap.innerHTML = ''; return; }

  // Don't clobber an in-progress IV edit
  if (wrap.contains(document.activeElement) && document.activeElement.classList.contains('iv-input')) return;

  const strikes = [...new Set(optPos.map(p => p.strike))].sort((a, b) => a - b);

  const rows = strikes.map(k => {
    const ov = state.simParams.ivOverrides[k];
    const or = state.simParams.ivOriginals[k];
    const val = ov !== undefined ? ov.toFixed(12) : or !== undefined ? or.toFixed(12) : '';
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

  wrap.innerHTML = `<div class="iv-section-label">Volatilidad Implícita por Base</div><div class="iv-rows">${rows}</div>`;

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

    // Vertical line — subyacente actual
    ctx.strokeStyle = 'rgba(210,210,210,0.55)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();

    ctx.setLineDash([]);

    // Dot en P&L Actual (Teórico)
    ctx.beginPath();
    ctx.arc(x, y0, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#58a6ff';
    ctx.fill();
    ctx.strokeStyle = '#0d1117';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Dot en P&L al Vencimiento
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
  const S = state.simParams.S || 1;
  const T = state.simParams.dte / 365;
  const r = state.simParams.r / 100;
  const N = 61;
  const labels = [], seriesAct = [], seriesExp = [];

  for (let i = 0; i < N; i++) {
    const Sn = S * (0.80 + i * 0.40 / (N - 1));
    labels.push(FMT2.format(+Sn.toFixed(0)));
    let pnlAct = 0, pnlExp = 0;

    for (const pos of state.positions) {
      const s100 = pos.lotes * 100;
      if (pos.type === 'suby') {
        pnlAct += (Sn - pos.prima) * s100;
        pnlExp += (Sn - pos.prima) * s100;
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
  const computed = computeAll();
  const greeks   = computeGreekTotals(computed);
  renderTable(computed);
  renderSummary(computeSummary(computed), greeks, computed.length > 0);
  renderGreeks(computed);
  renderIVTable();
  updatePnLChart();
  saveState();
}

// ── Positions CRUD ───────────────────────────────────────────────
function addPosition(data) {
  state.positions.push({
    id:          nextId++,
    type:        data.type   ?? 'call',
    lotes:       data.lotes  ?? 1,
    strike:      data.strike ?? 0,
    prima:       data.prima  ?? 0,
    cachedSigma: 0.30,
  });
}

function removePosition(id) {
  state.positions = state.positions.filter(p => p.id !== id);
  const active = new Set(state.positions.map(p => p.strike));
  for (const k of Object.keys(state.simParams.ivOverrides).map(Number)) {
    if (!active.has(k)) delete state.simParams.ivOverrides[k];
  }
  renderIVTable();
  recompute();
}

function clearPositions() {
  state.positions = [];
  nextId = 1;
  state.simParams.ivOverrides = {};
  state.simParams.ivOriginals = {};
  renderIVTable();
  recompute();
}

// ── Scenario buttons ─────────────────────────────────────────────
function applyScenarioS(pct) {
  if (state.simParams.S <= 0) return;
  state.simParams.S = +(state.simParams.S * (1 + pct / 100)).toFixed(4);
  document.getElementById('sim-S').value = state.simParams.S.toFixed(2);
  recompute();
}

function resetScenarioS() {
  state.simParams.S = state.simParams.S_orig;
  document.getElementById('sim-S').value = state.simParams.S_orig > 0 ? state.simParams.S_orig.toFixed(2) : '';
  recompute();
}

function applyScenarioVI(pp) {
  const strikes = [...new Set(state.positions.filter(p => p.type !== 'suby').map(p => p.strike))];
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

function openImportModal() {
  document.getElementById('import-error').textContent = '';
  document.getElementById('import-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('import-textarea').focus(), 50);
}

function closeImportModal() {
  document.getElementById('import-modal').style.display = 'none';
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
  document.getElementById('import-textarea').value = '';
  for (const p of parsed) addPosition(p);
  recompute();       // populates ivOriginals via computeLeg
  renderIVTable();   // then render with computed IVs
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
const LS_KEY_STATE  = 'sim_state_v1';
const LS_KEY_CONFIG = 'sim_config_v1';

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
    nextId,
    positions: state.positions.map(({ id, type, lotes, strike, prima }) => ({ id, type, lotes, strike, prima })),
    simParams: { S: state.simParams.S, S_orig: state.simParams.S_orig, r: state.simParams.r, dte: state.simParams.dte, comisiones: state.simParams.comisiones },
  }));
}

function loadSavedState() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY_STATE) ?? 'null');
    if (!s) return false;
    nextId = s.nextId ?? 1;
    if (s.simParams) {
      state.simParams.S      = s.simParams.S      ?? 0;
      state.simParams.S_orig = s.simParams.S_orig  ?? 0;
      state.simParams.r          = s.simParams.r          ?? 40;
      state.simParams.dte        = s.simParams.dte         ?? calcDTE();
      state.simParams.comisiones = s.simParams.comisiones  ?? 0.5;
    }
    for (const p of (s.positions ?? [])) {
      state.positions.push({ ...p, cachedSigma: 0.30 });
    }
    return (s.positions?.length ?? 0) > 0;
  } catch { return false; }
}

// ── Init ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  const hasPositions = loadSavedState();

  document.getElementById('sim-S').value          = state.simParams.S > 0 ? state.simParams.S.toFixed(2) : '';
  document.getElementById('sim-r').value          = state.simParams.r;
  document.getElementById('sim-dte').value        = state.simParams.dte || calcDTE();
  document.getElementById('sim-comisiones').value = state.simParams.comisiones.toFixed(3);

  // Sim param inputs
  ['input', 'change'].forEach(ev => {
    document.getElementById('sim-S').addEventListener(ev, () => {
      const v = parseFloat(document.getElementById('sim-S').value);
      if (isFinite(v) && v > 0) { state.simParams.S = v; recompute(); }
    });
    document.getElementById('sim-r').addEventListener(ev, () => {
      const v = parseFloat(document.getElementById('sim-r').value);
      if (isFinite(v)) { state.simParams.r = v; recompute(); }
    });
    document.getElementById('sim-dte').addEventListener(ev, () => {
      const v = parseInt(document.getElementById('sim-dte').value);
      if (isFinite(v) && v >= 0) { state.simParams.dte = v; recompute(); }
    });
    document.getElementById('sim-comisiones').addEventListener(ev, () => {
      const v = parseFloat(document.getElementById('sim-comisiones').value);
      if (isFinite(v) && v >= 0) { state.simParams.comisiones = v; recompute(); }
    });
  });

  // Scenario buttons
  document.querySelectorAll('.scen-btn[data-act="s"]').forEach(btn =>
    btn.addEventListener('click', () => applyScenarioS(+btn.dataset.p)));
  document.querySelectorAll('.scen-btn[data-act="vi"]').forEach(btn =>
    btn.addEventListener('click', () => applyScenarioVI(+btn.dataset.p)));
  document.querySelector('.scen-btn[data-act="reset-s"]').addEventListener('click', resetScenarioS);
  document.querySelector('.scen-btn[data-act="reset-vi"]').addEventListener('click', resetScenarioVI);

  // Inline editing (delegation — survives tbody re-renders)
  document.getElementById('positions-tbody').addEventListener('dblclick', e => {
    const td = e.target.closest('td[data-field]');
    if (!td) return;
    const pos = state.positions.find(p => p.id === +td.dataset.posId);
    if (pos) startEdit(td, pos, td.dataset.field);
  });

  // Export positions to clipboard
  document.getElementById('export-btn').addEventListener('click', () => {
    if (!state.positions.length) return;
    const lines = state.positions.map(p => `${p.lotes}\t${p.strike}\t${p.prima}`);
    navigator.clipboard.writeText(lines.join('\n'));
    showToast();
  });

  // Add empty row
  document.getElementById('add-row-btn').addEventListener('click', () => {
    state.positions.push({ id: nextId++, type: 'call', lotes: 1, strike: 0, prima: 0, cachedSigma: 0.30 });
    saveState();
    recompute();
  });

  // Import modal
  document.getElementById('import-btn').addEventListener('click',    openImportModal);
  document.getElementById('import-cancel').addEventListener('click', closeImportModal);
  document.getElementById('import-confirm').addEventListener('click', confirmImport);
  document.getElementById('import-modal').addEventListener('click',  e => { if (e.target === e.currentTarget) closeImportModal(); });

  // Manual refresh
  document.getElementById('manual-refresh-btn').addEventListener('click', fetchPrices);

  // Config modal
  document.getElementById('config-btn').addEventListener('click',    openConfigModal);
  document.getElementById('config-cancel').addEventListener('click', closeConfigModal);
  document.getElementById('config-save').addEventListener('click',   () => { applyConfig(); closeConfigModal(); });
  document.getElementById('config-reload').addEventListener('click', () => { applyConfig(); closeConfigModal(); fetchPrices(); });
  document.getElementById('config-modal').addEventListener('click',  e => { if (e.target === e.currentTarget) closeConfigModal(); });

  // Clear
  document.getElementById('clear-btn').addEventListener('click', () => {
    if (!state.positions.length || confirm('¿Limpiar toda la posición?')) clearPositions();
  });

  // ESC
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeImportModal(); closeConfigModal(); }
  });

  initPnLChart();

  if (hasPositions) {
    recompute();       // populates ivOriginals
    renderIVTable();   // render with computed IVs
  } else {
    renderTable([]);
    renderSummary(null);
    renderGreeks([]);

  }

  fetchPrices();
  startAutoTimer();
});
