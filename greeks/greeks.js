'use strict';

// BS engine functions (erf, normalCDF, normalPDF, d1d2, bsCall, bsDelta,
// bsGamma, bsTheta, bsVega, impliedVol) are provided by greeks-engine.js

let cachedSigma = 0.30;

// ============================================================
// Defaults & localStorage
// ============================================================

const DEFAULTS = {
  S:          7890,
  K:          8000,
  dias:         27,
  r:            20,
  sigmaNueva: 37.97,
  precio:      380,
};

const LS = 'griegas_';

function loadParams() {
  const p = {};
  for (const [key, def] of Object.entries(DEFAULTS)) {
    const stored = localStorage.getItem(LS + key);
    p[key] = stored !== null ? parseFloat(stored) : def;
  }
  return p;
}

function saveParams(p) {
  for (const [key, val] of Object.entries(p)) {
    localStorage.setItem(LS + key, val);
  }
}

// ============================================================
// Read current inputs from DOM
// ============================================================

function _pf(id, def) { const v = parseFloat(document.getElementById(id).value); return isNaN(v) ? def : v; }

function getParams() {
  return {
    S:          _pf('S',          DEFAULTS.S),
    K:          _pf('K',          DEFAULTS.K),
    dias:       _pf('dias',       DEFAULTS.dias),
    r:          _pf('r',          DEFAULTS.r),
    sigmaNueva: _pf('sigmaNueva', DEFAULTS.sigmaNueva),
    precio:     _pf('precio',     DEFAULTS.precio),
  };
}

function setInputs(p) {
  for (const [key, val] of Object.entries(p)) {
    const el = document.getElementById(key);
    if (el) el.value = val;
    const sl = document.getElementById(key + '-slider');
    if (sl) sl.value = val;
  }
}

// ============================================================
// Formatting
// ============================================================

const FMT_AR = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const FMT_AR4 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const FMT_AR6 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 6, maximumFractionDigits: 6 });

function fmt2(n)  { return isFinite(n) ? FMT_AR.format(n)  : '—'; }
function fmt4(n)  { return isFinite(n) ? FMT_AR4.format(n) : '—'; }
function fmt6(n)  { return isFinite(n) ? FMT_AR6.format(n) : '—'; }
function fmtPct(n) {
  if (!isFinite(n)) return '—';
  return (n >= 0 ? '+' : '') + (n * 100).toFixed(2) + '%';
}

function pctClass(v) {
  if (v > 0.00005) return 'pos';
  if (v < -0.00005) return 'neg';
  return 'neu';
}

// ============================================================
// Summary panel
// ============================================================

function updateSummary(S, K, T, r, sigma) {
  const price = bsCall(S, K, T, r, sigma);
  const delta = bsDelta(S, K, T, r, sigma);
  const gamma = bsGamma(S, K, T, r, sigma);
  const theta = bsTheta(S, K, T, r, sigma);
  const vega  = bsVega(S, K, T, r, sigma);

  document.getElementById('base-bs').textContent    = '$' + fmt2(price);
  document.getElementById('base-delta').textContent = fmt4(delta);
  document.getElementById('base-gamma').textContent = fmt6(gamma);
  document.getElementById('base-theta').textContent = fmt2(theta);
  document.getElementById('base-vega').textContent  = fmt4(vega);
}

// ============================================================
// Sensitivity table
// ============================================================

function rowClass(pct) {
  if (pct === 0) return 'row-0';
  return pct < 0 ? `row-n${Math.abs(pct)}` : `row-p${pct}`;
}

function updateTable(S, K, T, r, sigma, sigmaNueva, precio) {
  const D0 = bsDelta(S, K, T, r, sigma);
  const G0 = bsGamma(S, K, T, r, sigma);
  const tbody = document.getElementById('table-body');
  const rows = [];

  for (let pct = -10; pct <= 10; pct++) {
    const Sn  = S * (1 + pct / 100);
    const dS  = Sn - S;

    // Delta + Gamma second-order estimate (using base-price Greeks)
    const dgEst      = D0 * dS + 0.5 * G0 * dS * dS;
    const precioDG   = precio + dgEst;

    // Full Black-Scholes at new underlying
    const precioBS   = bsCall(Sn, K, T, r, sigma);
    const precioBSn  = bsCall(Sn, K, T, r, sigmaNueva);
    const vegaN      = bsVega(Sn, K, T, r, sigma);

    // % changes relative to original market price
    const pctBS = (precioBS  - precio) / precio;
    const pctVI = (precioBSn - precioBS) / precio;

    // Greeks at new underlying
    const deltaN = bsDelta(Sn, K, T, r, sigma);
    const gammaN = bsGamma(Sn, K, T, r, sigma);
    const thetaN = bsTheta(Sn, K, T, r, sigma);

    const pctLabel = (pct >= 0 ? '+' : '') + pct + '%';
    const dSClass  = pctClass(dS);
    const bsClass  = pctClass(pctBS);
    const viClass  = pctClass(pctVI);
    const dgClass  = pctClass(dgEst);

    rows.push(`
      <tr class="${rowClass(pct)}">
        <td class="${pctClass(pct / 100)}">${pctLabel}</td>
        <td>${fmt2(Sn)}</td>
        <td class="${dSClass}">${fmt2(dS)}</td>
        <td class="${dgClass}">${fmt2(dgEst)}</td>
        <td>${fmt2(precioDG)}</td>
        <td>${fmt2(precioBS)}</td>
        <td>${fmt2(precioBSn)}</td>
        <td>${fmt4(vegaN)}</td>
        <td class="${bsClass}">${fmtPct(pctBS)}</td>
        <td class="${viClass}">${fmtPct(pctVI)}</td>
        <td>${fmt4(deltaN)}</td>
        <td>${fmt6(gammaN)}</td>
        <td class="neg">${fmt2(thetaN)}</td>
      </tr>`);
  }

  tbody.innerHTML = rows.join('');
}

// ============================================================
// Charts
// ============================================================

let priceChart  = null;
let greeksChart = null;

// Vertical line plugin — draws at data index 30 (always = current S in chart data)
const verticalLinePlugin = {
  id: 'verticalLine',
  afterDraw(chart) {
    const opts = chart.options.plugins.verticalLine;
    if (!opts || opts.idx === undefined) return;
    const { ctx, chartArea } = chart;
    const meta = chart.getDatasetMeta(0);
    const point = meta?.data?.[opts.idx];
    if (!point) return;
    const x = point.x;
    if (x < chartArea.left || x > chartArea.right) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.strokeStyle = opts.color ?? 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.restore();
  }
};
Chart.register(verticalLinePlugin);

const CHART_GRID = '#1c2128';
const CHART_TICK = '#6e7681';

function initCharts() {
  const baseOpts = {
    responsive: true,
    maintainAspectRatio: true,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: '#8b949e', font: { size: 11 }, boxWidth: 24 } },
      tooltip: {
        backgroundColor: '#161b22',
        titleColor: '#c9d1d9',
        bodyColor: '#8b949e',
        borderColor: '#30363d',
        borderWidth: 1,
      },
    },
  };

  const priceCtx  = document.getElementById('priceChart').getContext('2d');
  const greeksCtx = document.getElementById('greeksChart').getContext('2d');

  priceChart = new Chart(priceCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'BS (σ actual)',
          data: [],
          borderColor: '#58a6ff',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
        },
        {
          label: 'BS (σ escenario)',
          data: [],
          borderColor: '#ffa657',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          borderDash: [6, 3],
        },
        {
          label: 'Est. Δ+Γ',
          data: [],
          borderColor: '#f85149',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0,
          borderDash: [3, 4],
        },
      ],
    },
    options: {
      ...baseOpts,
      scales: {
        x: {
          ticks: {
            color: CHART_TICK,
            maxTicksLimit: 9,
            callback: function(value) {
              const labels = this.chart.data.labels;
              return labels?.[value]?.toLocaleString('es-AR') ?? '';
            },
          },
          grid: { color: CHART_GRID },
        },
        y: {
          ticks: { color: CHART_TICK },
          grid: { color: CHART_GRID },
        },
      },
      plugins: {
        ...baseOpts.plugins,
        verticalLine: { idx: 30, color: 'rgba(255,255,255,0.20)' },
        tooltip: {
          ...baseOpts.plugins.tooltip,
          callbacks: {
            title: (items) => `S = ${priceChart.data.labels[items[0].dataIndex]?.toLocaleString('es-AR')}`,
            label: (item) => ` ${item.dataset.label}: $${item.parsed.y.toFixed(2)}`,
          },
        },
      },
    },
  });

  greeksChart = new Chart(greeksCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Delta',
          data: [],
          borderColor: '#58a6ff',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          yAxisID: 'yDelta',
        },
        {
          label: 'Gamma × 1000',
          data: [],
          borderColor: '#ffd700',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          yAxisID: 'yOther',
        },
        {
          label: '|Theta|',
          data: [],
          borderColor: '#f85149',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          yAxisID: 'yOther',
        },
        {
          label: 'Vega',
          data: [],
          borderColor: '#3fb950',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          yAxisID: 'yOther',
        },
      ],
    },
    options: {
      ...baseOpts,
      scales: {
        x: {
          ticks: {
            color: CHART_TICK,
            maxTicksLimit: 9,
            callback: function(value) {
              const labels = this.chart.data.labels;
              return labels?.[value]?.toLocaleString('es-AR') ?? '';
            },
          },
          grid: { color: CHART_GRID },
        },
        yDelta: {
          type: 'linear',
          position: 'left',
          min: 0,
          max: 1,
          title: { display: true, text: 'Delta', color: '#58a6ff', font: { size: 10 } },
          ticks: { color: '#58a6ff', stepSize: 0.25 },
          grid: { color: CHART_GRID },
        },
        yOther: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'Gamma×1k / |Theta| / Vega', color: CHART_TICK, font: { size: 10 } },
          ticks: { color: CHART_TICK },
          grid: { display: false },
        },
      },
      plugins: {
        ...baseOpts.plugins,
        verticalLine: { idx: 30, color: 'rgba(255,255,255,0.20)' },
        tooltip: {
          ...baseOpts.plugins.tooltip,
          callbacks: {
            title: (items) => `S = ${greeksChart.data.labels[items[0].dataIndex]?.toLocaleString('es-AR')}`,
          },
        },
      },
    },
  });
}

function buildChartData(S, K, T, r, sigma, sigmaNueva, precio) {
  const D0 = bsDelta(S, K, T, r, sigma);
  const G0 = bsGamma(S, K, T, r, sigma);

  // 61 points from S*0.80 to S*1.20; S is always at index 30
  const POINTS = 60;
  const labelsArr  = [];
  const bsActual   = [];
  const bsEscen    = [];
  const dgEstArr   = [];
  const deltaArr   = [];
  const gammaArr   = [];
  const thetaArr   = [];
  const vegaArr    = [];

  for (let i = 0; i <= POINTS; i++) {
    const Sn  = S * (0.80 + i * (0.40 / POINTS));
    const dS  = Sn - S;
    labelsArr.push(Math.round(Sn));
    bsActual.push(bsCall(Sn, K, T, r, sigma));
    bsEscen.push(bsCall(Sn, K, T, r, sigmaNueva));
    dgEstArr.push(Math.max(0, precio + D0 * dS + 0.5 * G0 * dS * dS));
    deltaArr.push(bsDelta(Sn, K, T, r, sigma));
    gammaArr.push(bsGamma(Sn, K, T, r, sigma) * 1000);
    thetaArr.push(Math.abs(bsTheta(Sn, K, T, r, sigma)));
    vegaArr.push(bsVega(Sn, K, T, r, sigma));
  }

  return { labelsArr, bsActual, bsEscen, dgEstArr, deltaArr, gammaArr, thetaArr, vegaArr };
}

function updateCharts(S, K, T, r, sigma, sigmaNueva, precio) {
  const d = buildChartData(S, K, T, r, sigma, sigmaNueva, precio);

  priceChart.data.labels         = d.labelsArr;
  priceChart.data.datasets[0].data = d.bsActual;
  priceChart.data.datasets[1].data = d.bsEscen;
  priceChart.data.datasets[2].data = d.dgEstArr;
  priceChart.update();

  greeksChart.data.labels          = d.labelsArr;
  greeksChart.data.datasets[0].data = d.deltaArr;
  greeksChart.data.datasets[1].data = d.gammaArr;
  greeksChart.data.datasets[2].data = d.thetaArr;
  greeksChart.data.datasets[3].data = d.vegaArr;
  greeksChart.update();
}

// ============================================================
// Main update — called on every input change
// ============================================================

function update() {
  const p = getParams();
  saveParams(p);

  const T          = p.dias / 365;
  const sigmaNueva = p.sigmaNueva / 100;
  const r          = p.r / 100;

  const sigmaImpl = impliedVol(p.S, p.K, T, r, p.precio);
  if (isFinite(sigmaImpl)) cachedSigma = sigmaImpl;
  const sigma = isFinite(sigmaImpl) ? sigmaImpl : sigmaNueva;

  const display = document.getElementById('sigma-display');
  if (display) display.textContent = isFinite(sigmaImpl) ? (sigmaImpl * 100).toFixed(4) + '%' : '—';

  updateSummary(p.S, p.K, T, r, sigma);
  updateTable(p.S, p.K, T, r, sigma, sigmaNueva, p.precio);
  updateCharts(p.S, p.K, T, r, sigma, sigmaNueva, p.precio);
}

// ============================================================
// Wire up controls — slider <-> number input sync
// ============================================================

function syncPair(sliderId, inputId) {
  const slider = document.getElementById(sliderId);
  const input  = document.getElementById(inputId);
  if (!slider || !input) return;

  slider.addEventListener('input', () => {
    input.value = slider.value;
    update();
  });
  input.addEventListener('input', () => {
    if (input.value !== '') slider.value = input.value;
    update();
  });
}

function wireInputs() {
  syncPair('S-slider',         'S');
  syncPair('dias-slider',      'dias');
  syncPair('sigmaNueva-slider','sigmaNueva');

  for (const id of ['K', 'r', 'precio']) {
    document.getElementById(id)?.addEventListener('input', update);
    document.getElementById(id)?.addEventListener('change', update);
  }
}

// ============================================================
// Init
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const saved = loadParams();
  setInputs(saved);
  initCharts();
  wireInputs();
  update();
});
