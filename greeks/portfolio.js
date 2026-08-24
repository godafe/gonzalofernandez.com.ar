'use strict';

// BS engine (bsCall, bsPut, bsDelta, bsDeltaPut, bsGamma, bsTheta, bsThetaPut,
// bsVega, impliedVol, impliedVolPut) provided by greeks-engine.js

// ============================================================
// Formatting
// ============================================================

const FMT_AR  = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const FMT_AR4 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const FMT_AR6 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 6, maximumFractionDigits: 6 });

function fmt2(n) { return isFinite(n) ? FMT_AR.format(n)  : '—'; }
function fmt4(n) { return isFinite(n) ? FMT_AR4.format(n) : '—'; }
function fmt6(n) { return isFinite(n) ? FMT_AR6.format(n) : '—'; }

// ============================================================
// State
// ============================================================

const BASE_COLORS = ['#58a6ff', '#ffa657', '#3fb950', '#ffd700', '#f778ba', '#d2a8ff'];

const GLOBAL_DEFAULTS = { S: 7885, dias: 26, r: 20 };
const BASE_DEFAULTS   = { lotes: 1, tipo: 'call', K: 8000, precio: 380, sigmaNueva: 40.39 };

let nextId = 1;

const state = {
  S:    GLOBAL_DEFAULTS.S,
  dias: GLOBAL_DEFAULTS.dias,
  r:    GLOBAL_DEFAULTS.r,
  bases: [],
};

// ============================================================
// Compute
// ============================================================

function computeBase(base) {
  const T          = state.dias / 365;
  const r          = state.r / 100;
  const sigmaNueva = base.sigmaNueva / 100;
  const isCall   = base.tipo !== 'put';
  const sign100  = base.lotes * 100;          // 1 lote = 100 acciones; mantiene signo para D/G/V/P/theta

  const sigmaImpl = isCall
    ? impliedVol(state.S, base.K, T, r, base.precio)
    : impliedVolPut(state.S, base.K, T, r, base.precio);
  if (isFinite(sigmaImpl)) base.cachedSigma = sigmaImpl;
  const sigma = base.cachedSigma;

  const price         = isCall ? bsCall(state.S, base.K, T, r, sigma)      : bsPut(state.S, base.K, T, r, sigma);
  const priceScenario = isCall ? bsCall(state.S, base.K, T, r, sigmaNueva) : bsPut(state.S, base.K, T, r, sigmaNueva);
  const delta         = isCall ? bsDelta(state.S, base.K, T, r, sigma)     : bsDeltaPut(state.S, base.K, T, r, sigma);
  const theta         = isCall ? bsTheta(state.S, base.K, T, r, sigma)     : bsThetaPut(state.S, base.K, T, r, sigma);

  return {
    sigmaImpl,
    sigma,
    price:         price         * sign100,
    priceScenario: priceScenario * sign100,
    delta:         delta         * sign100,
    gamma:         bsGamma(state.S, base.K, T, r, sigma) * sign100,
    theta:         theta         * sign100,
    vega:          bsVega(state.S, base.K, T, r, sigma)  * sign100,
  };
}

function computePortfolio(allGreeks) {
  if (allGreeks.length === 0) {
    return { price: NaN, priceScenario: NaN, delta: NaN, gamma: NaN, theta: NaN, vega: NaN };
  }
  return allGreeks.reduce((acc, g) => ({
    price:         acc.price         + g.price,
    priceScenario: acc.priceScenario + g.priceScenario,
    delta:         acc.delta         + g.delta,
    gamma:         acc.gamma         + g.gamma,
    theta:         acc.theta         + g.theta,
    vega:          acc.vega          + g.vega,
  }), { price: 0, priceScenario: 0, delta: 0, gamma: 0, theta: 0, vega: 0 });
}

// ============================================================
// Scenario state
// ============================================================

let scenarioBase = null;

function saveScenarioBase() {
  if (scenarioBase) return;
  scenarioBase = {
    S:      state.S,
    sigmas: state.bases.map(b => b.sigmaNueva),
  };
}

function applyScenarioS(factor) {
  saveScenarioBase();
  const newS = +(scenarioBase.S * factor).toFixed(2);
  state.S = newS;
  document.getElementById('S').value        = newS;
  document.getElementById('S-slider').value = newS;
  update(false);
}

function applyScenarioVI(delta) {
  saveScenarioBase();
  state.bases.forEach((base, i) => {
    const newSigma = +(scenarioBase.sigmas[i] + delta).toFixed(7);
    base.sigmaNueva = newSigma;
    const card = document.querySelector(`.base-card[data-id="${base.id}"]`);
    if (card) {
      card.querySelector('.base-sigmaNew').value        = newSigma;
      card.querySelector('.base-sigmaNew-slider').value = newSigma;
    }
  });
  update(false);
}

function resetScenario() {
  if (!scenarioBase) return;
  state.S = scenarioBase.S;
  document.getElementById('S').value        = scenarioBase.S;
  document.getElementById('S-slider').value = scenarioBase.S;
  state.bases.forEach((base, i) => {
    base.sigmaNueva = scenarioBase.sigmas[i];
    const card = document.querySelector(`.base-card[data-id="${base.id}"]`);
    if (card) {
      card.querySelector('.base-sigmaNew').value        = scenarioBase.sigmas[i];
      card.querySelector('.base-sigmaNew-slider').value = scenarioBase.sigmas[i];
    }
  });
  scenarioBase = null;
  update(false);
}

// ============================================================
// DOM — base card
// ============================================================

function createBaseCard(base, index) {
  const color = BASE_COLORS[index % BASE_COLORS.length];
  const div   = document.createElement('div');
  div.className  = 'base-card';
  div.dataset.id = base.id;
  div.style.borderLeftColor = color;

  div.innerHTML = `
    <div class="base-header">
      <span class="base-title" style="color:${color}">Base ${index + 1}</span>
      <button class="remove-base-btn" title="Eliminar base">×</button>
    </div>
    <div class="input-grid base-inputs">
      <div class="input-group">
        <label>Lotes</label>
        <input type="number" class="base-lotes" value="${base.lotes}" step="1">
      </div>
      <div class="input-group">
        <label>Strike (K)</label>
        <input type="number" class="base-K" value="${base.K}" min="1" step="10">
      </div>
      <div class="input-group">
        <label>Precio real ($)</label>
        <input type="number" class="base-precio" value="${base.precio}" min="0" step="1">
      </div>
      <div class="input-group">
        <label>VI Actual (%) <span class="calc-badge">calculada</span></label>
        <div class="calc-display base-sigma-display">—</div>
      </div>
      <div class="input-group">
        <label>VI Escenario (%)</label>
        <input type="range" class="base-sigmaNew-slider" min="1" max="200" step="0.1" value="${base.sigmaNueva}">
        <div class="sigma-row">
          <input type="number" class="base-sigmaNew" min="0.0000001" max="200" step="0.0000001" value="${base.sigmaNueva}">
          <button class="sigma-reset-btn" title="Volver a VI calculada">↺</button>
        </div>
      </div>
    </div>
    <div class="greeks-grid">
      <div class="greek-card">
        <span class="greek-label">Precio BS</span>
        <span class="greek-value base-bs">—</span>
      </div>
      <div class="greek-card">
        <span class="greek-label">BS (σ esc.)</span>
        <span class="greek-value base-bs-scenario">—</span>
      </div>
      <div class="greek-card">
        <span class="greek-label">Delta (Δ)</span>
        <span class="greek-value base-delta">—</span>
      </div>
      <div class="greek-card">
        <span class="greek-label">Gamma (Γ)</span>
        <span class="greek-value base-gamma">—</span>
      </div>
      <div class="greek-card">
        <span class="greek-label">Vega (ν)</span>
        <span class="greek-value base-vega">—</span>
        <span class="greek-sub">$ / 1% VI</span>
      </div>
      <div class="greek-card">
        <span class="greek-label">Theta (θ)</span>
        <span class="greek-value base-theta">—</span>
        <span class="greek-sub">$ / día</span>
      </div>
    </div>`;

  wireBaseCard(div, base);
  return div;
}

function wireBaseCard(div, base) {
  const lotesInput  = div.querySelector('.base-lotes');
  const kInput      = div.querySelector('.base-K');
  const precioInput = div.querySelector('.base-precio');
  const sigmaSlider = div.querySelector('.base-sigmaNew-slider');
  const sigmaInput  = div.querySelector('.base-sigmaNew');
  const sigmaReset  = div.querySelector('.sigma-reset-btn');
  const removeBtn   = div.querySelector('.remove-base-btn');

  const onLotes  = () => { const v = parseInt(lotesInput.value);  if (!isNaN(v)) base.lotes  = v; update(); };
  lotesInput.addEventListener('input',  onLotes);
  lotesInput.addEventListener('change', onLotes);

  const onK      = () => { const v = parseFloat(kInput.value);     if (!isNaN(v)) base.K      = v; update(); };
  kInput.addEventListener('input',  onK);
  kInput.addEventListener('change', onK);

  const onPrecio = () => { const v = parseFloat(precioInput.value); if (!isNaN(v)) base.precio = v; update(); };
  precioInput.addEventListener('input',  onPrecio);
  precioInput.addEventListener('change', onPrecio);

  sigmaSlider.addEventListener('input', () => {
    sigmaInput.value = sigmaSlider.value;
    base.sigmaNueva = parseFloat(sigmaSlider.value);
    update();
  });
  const onSigmaInput = () => {
    if (sigmaInput.value !== '') sigmaSlider.value = sigmaInput.value;
    const v = parseFloat(sigmaInput.value);
    if (!isNaN(v)) base.sigmaNueva = v;
    update();
  };
  sigmaInput.addEventListener('input', onSigmaInput);

  sigmaReset.addEventListener('click', () => {
    const iv = base.cachedSigma * 100;
    base.sigmaNueva    = iv;
    sigmaInput.value   = iv;
    sigmaSlider.value  = iv;
    update();
  });

  removeBtn.addEventListener('click', () => removeBase(base.id));
}

function updateBaseDisplay(cardEl, greeks) {
  cardEl.querySelector('.base-sigma-display').textContent =
    isFinite(greeks.sigmaImpl) ? (greeks.sigmaImpl * 100).toFixed(4) + '%' : '—';
  cardEl.querySelector('.base-bs').textContent          = '$' + fmt2(greeks.price);
  cardEl.querySelector('.base-bs-scenario').textContent = '$' + fmt2(greeks.priceScenario);
  cardEl.querySelector('.base-delta').textContent       = fmt4(greeks.delta);
  cardEl.querySelector('.base-gamma').textContent       = fmt6(greeks.gamma);
  cardEl.querySelector('.base-vega').textContent        = fmt4(greeks.vega);
  cardEl.querySelector('.base-theta').textContent       = fmt4(greeks.theta);
}

function renumberCards() {
  document.querySelectorAll('.base-card').forEach((card, i) => {
    const color = BASE_COLORS[i % BASE_COLORS.length];
    card.style.borderLeftColor = color;
    const title = card.querySelector('.base-title');
    if (title) { title.textContent = `Base ${i + 1}`; title.style.color = color; }
  });
}

// ============================================================
// DOM — portfolio totals
// ============================================================

function updatePortfolioDisplay(totals) {
  document.getElementById('total-bs').textContent          = '$' + fmt2(totals.price);
  document.getElementById('total-bs-scenario').textContent = '$' + fmt2(totals.priceScenario);
  document.getElementById('total-delta').textContent       = fmt4(totals.delta);
  document.getElementById('total-gamma').textContent       = fmt6(totals.gamma);
  document.getElementById('total-vega').textContent        = fmt4(totals.vega);
  document.getElementById('total-theta').textContent       = fmt4(totals.theta);
}

// ============================================================
// CRUD — bases
// ============================================================

function addBase(saved) {
  const base = {
    id:          nextId++,
    lotes:       saved?.lotes      ?? BASE_DEFAULTS.lotes,
    tipo:        saved?.tipo       ?? BASE_DEFAULTS.tipo,
    K:           saved?.K          ?? BASE_DEFAULTS.K,
    precio:      saved?.precio     ?? BASE_DEFAULTS.precio,
    sigmaNueva:  saved?.sigmaNueva ?? BASE_DEFAULTS.sigmaNueva,
    cachedSigma: 0.30,
  };
  if (saved?.id !== undefined) base.id = saved.id;

  state.bases.push(base);
  document.getElementById('bases-list').appendChild(createBaseCard(base, state.bases.length - 1));
  saveState();
  update();
}

function removeBase(id) {
  state.bases = state.bases.filter(b => b.id !== id);
  const card = document.querySelector(`.base-card[data-id="${id}"]`);
  if (card) card.remove();
  renumberCards();
  saveState();
  update();
}

// ============================================================
// P&L chart
// ============================================================

let pnlChart = null;

const verticalLinePlugin = {
  id: 'verticalLine',
  afterDraw(chart) {
    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data.length) return;
    const midIdx = Math.floor(meta.data.length / 2);
    const x = meta.data[midIdx].x;
    const { ctx, chartArea: { top, bottom } } = chart;
    ctx.save();
    ctx.strokeStyle = 'rgba(200,200,200,0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.restore();
  },
};

function buildPnLData() {
  const T = state.dias / 365;
  const r = state.r / 100;
  const N = 61;
  const labels    = [];
  const seriesAct = [];
  const seriesScn = [];
  const seriesExp = [];

  for (let i = 0; i < N; i++) {
    const Sn = state.S * (0.80 + i * 0.40 / (N - 1));
    labels.push(FMT_AR.format(+Sn.toFixed(0)));

    let pnlAct = 0, pnlScn = 0, pnlExp = 0;
    for (const base of state.bases) {
      const sigma    = base.cachedSigma;
      const sigmaScn = base.sigmaNueva / 100;
      const sign100  = base.lotes * 100;
      const isCall   = base.tipo !== 'put';
      const pricePaid = base.precio;

      const priceAct = isCall ? bsCall(Sn, base.K, T, r, sigma)    : bsPut(Sn, base.K, T, r, sigma);
      const priceScn = isCall ? bsCall(Sn, base.K, T, r, sigmaScn) : bsPut(Sn, base.K, T, r, sigmaScn);
      const priceExp = isCall ? Math.max(Sn - base.K, 0) : Math.max(base.K - Sn, 0);

      pnlAct += (priceAct - pricePaid) * sign100;
      pnlScn += (priceScn - pricePaid) * sign100;
      pnlExp += (priceExp - pricePaid) * sign100;
    }
    seriesAct.push(+pnlAct.toFixed(2));
    seriesScn.push(+pnlScn.toFixed(2));
    seriesExp.push(+pnlExp.toFixed(2));
  }
  return { labels, seriesAct, seriesScn, seriesExp };
}

function initPnLChart() {
  Chart.register(verticalLinePlugin);
  const ctx = document.getElementById('pnlChart').getContext('2d');
  const { labels, seriesAct, seriesScn, seriesExp } = buildPnLData();
  pnlChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'P&L (σ actual)',
          data: seriesAct,
          borderColor: '#58a6ff',
          backgroundColor: 'rgba(88,166,255,0.08)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          fill: true,
        },
        {
          label: 'P&L (σ escenario)',
          data: seriesScn,
          borderColor: '#ffa657',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [6, 3],
          pointRadius: 0,
          tension: 0.3,
        },
        {
          label: 'P&L al vencimiento',
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
        tooltip: {
          callbacks: {
            label: ctx => ctx.dataset.label + ': $' + FMT_AR.format(ctx.parsed.y),
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#6e7681', maxTicksLimit: 10, font: { size: 11 } },
          grid:  { color: 'rgba(48,54,61,0.6)' },
        },
        y: {
          ticks: { color: '#6e7681', font: { size: 11 },
                   callback: v => '$' + FMT_AR.format(v) },
          grid:  { color: 'rgba(48,54,61,0.6)' },
        },
      },
    },
  });
}

function updatePnLChart() {
  if (!pnlChart) return;
  const { labels, seriesAct, seriesScn, seriesExp } = buildPnLData();
  pnlChart.data.labels            = labels;
  pnlChart.data.datasets[0].data  = seriesAct;
  pnlChart.data.datasets[1].data  = seriesScn;
  pnlChart.data.datasets[2].data  = seriesExp;
  pnlChart.update('none');
}

// ============================================================
// Master update
// ============================================================

function update(clearScenario = true) {
  if (clearScenario) scenarioBase = null;

  state.S    = parseFloat(document.getElementById('S').value)    || state.S;
  state.dias = parseFloat(document.getElementById('dias').value) || state.dias;
  state.r    = parseFloat(document.getElementById('r').value)    || state.r;

  const allGreeks = state.bases.map(base => {
    const greeks = computeBase(base);
    const cardEl = document.querySelector(`.base-card[data-id="${base.id}"]`);
    if (cardEl) updateBaseDisplay(cardEl, greeks);
    return greeks;
  });

  updatePortfolioDisplay(computePortfolio(allGreeks));
  updatePnLChart();
  saveState();
}

// ============================================================
// Persistence
// ============================================================

const LS_KEY = 'portfolio_state';

function saveState() {
  const payload = {
    S:      state.S,
    dias:   state.dias,
    r:      state.r,
    nextId,
    bases:  state.bases.map(({ id, lotes, tipo, K, precio, sigmaNueva }) =>
              ({ id, lotes, tipo, K, precio, sigmaNueva })),
  };
  localStorage.setItem(LS_KEY, JSON.stringify(payload));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null');
    if (!saved) return false;
    state.S    = saved.S    ?? GLOBAL_DEFAULTS.S;
    state.dias = saved.dias ?? GLOBAL_DEFAULTS.dias;
    state.r    = saved.r    ?? GLOBAL_DEFAULTS.r;
    nextId     = saved.nextId ?? 1;
    for (const b of (saved.bases ?? [])) addBase(b);
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// Import
// ============================================================

function parseImportText(text) {
  const T = state.dias / 365;
  const r = state.r / 100;
  const bases = [];

  for (const line of text.trim().split('\n')) {
    const cols = line.trim().split(/\t+|\s{2,}/);
    if (cols.length < 3) continue;

    const lotes  = parseInt(cols[0], 10);
    const K      = parseFloat(cols[1].replace(',', '.'));
    const precio = parseFloat(cols[2].replace(',', '.'));

    if (!isFinite(lotes) || lotes === 0 || !isFinite(K) || !isFinite(precio)) continue;

    const tipoRaw = (cols[3] ?? '').trim().toLowerCase();
    const tipo = tipoRaw === 'put' || tipoRaw === 'p' ? 'put' : 'call';
    const iv = impliedVol(state.S, K, T, r, precio);
    const sigmaNueva = isFinite(iv) ? +(iv * 100).toFixed(2) : BASE_DEFAULTS.sigmaNueva;

    bases.push({ lotes, tipo, K, precio, sigmaNueva });
  }
  return bases;
}

function applyImport(bases) {
  state.bases = [];
  nextId = 1;
  document.getElementById('bases-list').innerHTML = '';
  for (const b of bases) addBase(b);
}

function openImportModal() {
  document.getElementById('import-modal').style.display = 'flex';
  document.getElementById('import-textarea').focus();
}

function closeImportModal() {
  document.getElementById('import-modal').style.display = 'none';
  document.getElementById('import-textarea').value = '';
}

function confirmImport() {
  const text  = document.getElementById('import-textarea').value;
  const bases = parseImportText(text);
  if (bases.length === 0) {
    document.getElementById('import-error').textContent =
      'No se encontraron filas válidas. Formato esperado: lotes \\t K \\t prima';
    return;
  }
  closeImportModal();
  applyImport(bases);
}

// ============================================================
// Wire globals
// ============================================================

function syncPair(sliderId, inputId) {
  const slider = document.getElementById(sliderId);
  const input  = document.getElementById(inputId);
  if (!slider || !input) return;
  slider.addEventListener('input', () => { input.value = slider.value; update(); });
  const onInput = () => { if (input.value !== '') slider.value = input.value; update(); };
  input.addEventListener('input',  onInput);
  input.addEventListener('change', onInput);
}

// ============================================================
// Init
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const loaded = loadState();

  document.getElementById('S').value           = state.S;
  document.getElementById('S-slider').value    = state.S;
  document.getElementById('dias').value        = state.dias;
  document.getElementById('dias-slider').value = state.dias;
  document.getElementById('r').value           = state.r;

  syncPair('S-slider',    'S');
  syncPair('dias-slider', 'dias');
  document.getElementById('r').addEventListener('input',  update);
  document.getElementById('r').addEventListener('change', update);

  document.getElementById('scen-s-plus').addEventListener('click',   () => applyScenarioS(1.03));
  document.getElementById('scen-s-minus').addEventListener('click',  () => applyScenarioS(0.97));
  document.getElementById('scen-vi-plus').addEventListener('click',  () => applyScenarioVI(+5));
  document.getElementById('scen-vi-minus').addEventListener('click', () => applyScenarioVI(-5));
  document.getElementById('scen-reset').addEventListener('click',    resetScenario);

  document.getElementById('add-base-btn').addEventListener('click',    () => addBase());
  document.getElementById('import-btn').addEventListener('click',      openImportModal);
  document.getElementById('import-confirm').addEventListener('click',  confirmImport);
  document.getElementById('import-cancel').addEventListener('click',   closeImportModal);
  document.getElementById('import-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeImportModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeImportModal();
  });

  if (!loaded || state.bases.length === 0) addBase();
  else update();

  initPnLChart();
});
