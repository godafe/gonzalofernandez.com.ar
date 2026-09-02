'use strict';

// BS engine (bsCall, bsPut, bsDelta, bsDeltaPut, bsGamma, bsTheta, bsThetaPut,
// bsVega, impliedVol, impliedVolPut) inyectadas globalmente por greeks-engine.js.
// Helpers de histórico (parseHistoryPayload, loadHistoryPayload, etc.) por history-data.js.

// ── Formateo ─────────────────────────────────────────────────────
const FMT2 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmt2(n) { return isFinite(n) ? FMT2.format(n) : '—'; }
function fmtPct(n) { return isFinite(n) ? FMT2.format(n) + '%' : '—'; }

function parseNum(s) {
  if (typeof s === 'number') return s;
  return parseFloat(String(s).trim().replace(',', '.'));
}

function fmtExport(n) { return String(n).replace('.', ','); }

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

let _toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  if (msg) el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ── Persistencia ─────────────────────────────────────────────────
const BT_LS_CONFIG = 'bt_config_v1';
const BT_LS_LEGS   = 'bt_legs_v1';

function saveLegs() {
  localStorage.setItem(BT_LS_LEGS, JSON.stringify({ legs: btState.legs, nextLegId: btState.nextLegId }));
}

function loadLegs() {
  try {
    const saved = JSON.parse(localStorage.getItem(BT_LS_LEGS) ?? 'null');
    if (!saved || !Array.isArray(saved.legs)) return;
    btState.legs      = saved.legs;
    btState.nextLegId = saved.nextLegId ?? (Math.max(0, ...saved.legs.map(l => l.id)) + 1);
  } catch {}
}

function saveConfig() {
  const r        = parseNum(document.getElementById('bt-r')?.value);
  const opexDate = document.getElementById('bt-opex-date')?.value ?? '';
  const cfg = {
    r: isFinite(r) ? r : 40,
    opexDate,
    panels: {
      params:   document.getElementById('bt-params-body')?.style.display === 'none',
      strategy: document.getElementById('bt-strategy-body')?.style.display === 'none',
    }
  };
  localStorage.setItem(BT_LS_CONFIG, JSON.stringify(cfg));
}

function loadConfig() {
  try {
    const cfg = JSON.parse(localStorage.getItem(BT_LS_CONFIG) ?? 'null');
    if (!cfg) return;
    if (cfg.r != null && isFinite(cfg.r)) {
      const el = document.getElementById('bt-r');
      if (el) el.value = cfg.r;
    }
    if (cfg.opexDate) {
      const el = document.getElementById('bt-opex-date');
      if (el) el.value = cfg.opexDate;
    }
    if (cfg.panels) {
      applyPanelState('params',   cfg.panels.params);
      applyPanelState('strategy', cfg.panels.strategy);
    }
  } catch {}
}

function applyPanelState(name, collapsed) {
  const body   = document.getElementById(`bt-${name}-body`);
  const toggle = document.getElementById(`bt-${name}-toggle`);
  if (!body || !toggle) return;
  body.style.display = collapsed ? 'none' : '';
  toggle.textContent = collapsed ? '▶' : '▼';
}

function togglePanel(name) {
  const body = document.getElementById(`bt-${name}-body`);
  if (!body) return;
  const collapsed = body.style.display === 'none';
  applyPanelState(name, !collapsed);
  saveConfig();
}

// ── Estado ───────────────────────────────────────────────────────
let btState = {
  rawPayload: null,
  historyByDate: [],
  availableVencimientos: [],
  availableStrikes: [],
  selectedVenc: null,
  filteredHistory: [],
  legs: [],
  nextLegId: 1,
  results: null,
  hmResults: null,
  hmOffset: 0,
  hmSelected: 0,
};

let btCharts = { pnl: null, greeks: null, iv: null };

// ── Motor de Backtest ────────────────────────────────────────────

function calcDTE_at(opexDateStr, currentDateStr) {
  const [oy, om, od] = opexDateStr.split('-').map(Number);
  const [cy, cm, cd] = currentDateStr.split('-').map(Number);
  const target  = new Date(oy, om - 1, od);
  const current = new Date(cy, cm - 1, cd);
  return Math.max(0, Math.ceil((target - current) / 86400000));
}

function computeLegAt(leg, S, opexDateStr, fechaRaw, r, marketPrice) {
  // Acción (subyacente)
  if (leg.type === 'suby') {
    return {
      marketPrice: S, iv: NaN, sigma: NaN,
      pnl:   (S - leg.prima) * leg.lotes,
      delta: leg.lotes,
      gamma: 0, vega: 0, theta: 0,
      missing: false
    };
  }

  const T        = calcDTE_at(opexDateStr, fechaRaw) / 365;
  const sign100  = leg.lotes * 100;
  const isCall   = leg.type === 'call';

  // Caso expiración o sin tiempo
  if (T <= 0 || S <= 0) {
    const intrinsic = isCall ? Math.max(S - leg.strike, 0) : Math.max(leg.strike - S, 0);
    return {
      marketPrice: intrinsic, iv: NaN, sigma: 0.30,
      pnl: (intrinsic - leg.prima) * sign100,
      delta: 0, gamma: 0, vega: 0, theta: 0, missing: false
    };
  }

  // IV desde precio de mercado
  let iv = NaN;
  const mktValid = marketPrice > 0;
  if (mktValid) {
    iv = isCall
      ? impliedVol(S, leg.strike, T, r, marketPrice)
      : impliedVolPut(S, leg.strike, T, r, marketPrice);
    if (!isFinite(iv) || iv <= 0) iv = NaN;
  }

  // Sigma para greeks: market IV → entrada IV → fallback
  let sigma = NaN;
  if (isFinite(iv)) {
    sigma = iv;
  } else {
    const entryIv = isCall
      ? impliedVol(S, leg.strike, T, r, leg.prima)
      : impliedVolPut(S, leg.strike, T, r, leg.prima);
    sigma = isFinite(entryIv) && entryIv > 0 ? entryIv : 0.30;
  }

  const bsPrice = isCall ? bsCall(S, leg.strike, T, r, sigma) : bsPut(S, leg.strike, T, r, sigma);
  const effPrice = mktValid ? marketPrice : bsPrice;

  const delta = isCall ? bsDelta(S, leg.strike, T, r, sigma)    : bsDeltaPut(S, leg.strike, T, r, sigma);
  const gamma = bsGamma(S, leg.strike, T, r, sigma);
  const vega  = bsVega(S, leg.strike, T, r, sigma);
  const theta = isCall ? bsTheta(S, leg.strike, T, r, sigma)    : bsThetaPut(S, leg.strike, T, r, sigma);

  return {
    marketPrice: effPrice,
    iv,
    sigma,
    pnl:   (effPrice - leg.prima) * sign100,
    delta: delta * sign100,
    gamma: gamma * sign100,
    vega:  vega  * sign100,
    theta: theta * sign100,
    missing: !mktValid
  };
}

function runBacktest(legs, entryDateStr, opexDateStr, r_pct, historyByDate) {
  const r = r_pct / 100;

  const sorted = historyByDate
    .filter(e => Number.isFinite(e.ggal) && e.ggal > 0)
    .sort((a, b) => a.fechaRaw.localeCompare(b.fechaRaw));

  const startIdx = sorted.findIndex(e => e.fechaRaw >= entryDateStr);
  if (startIdx === -1) throw new Error('La fecha de entrada no se encuentra en el histórico del vencimiento seleccionado.');

  const results = [];

  for (let i = startIdx; i < sorted.length; i++) {
    const entry = sorted[i];
    const S = entry.ggal;

    // Solo los legs activos en esta fecha (leg.fecha vacía = activo desde la entrada)
    const activeLegs = legs.filter(leg => {
      const legDate = leg.fecha || entryDateStr;
      return legDate <= entry.fechaRaw;
    });

    let totalPnL = 0, totalDelta = 0, totalGamma = 0, totalVega = 0, totalTheta = 0;
    const legDetails = {};
    const ivByStrike = {};

    for (const leg of activeLegs) {
      const sk = strikeKey(leg.strike);
      let mktPrice;
      if (leg.type === 'suby') {
        mktPrice = S;
      } else {
        const mktRaw = leg.type === 'call' ? entry.calls?.[sk] : entry.puts?.[sk];
        mktPrice = Number.isFinite(mktRaw) ? mktRaw : 0;
      }

      const g = computeLegAt(leg, S, opexDateStr, entry.fechaRaw, r, mktPrice);

      totalPnL   += g.pnl;
      totalDelta += g.delta;
      totalGamma += g.gamma;
      totalVega  += g.vega;
      totalTheta += g.theta;
      legDetails[leg.id] = g;

      if (Number.isFinite(g.iv)) {
        ivByStrike[`${leg.type}_${leg.strike}`] = g.iv * 100;
      }
    }

    results.push({
      fechaRaw: entry.fechaRaw,
      ggal: S,
      dte: calcDTE_at(opexDateStr, entry.fechaRaw),
      totalPnL, delta: totalDelta, gamma: totalGamma, vega: totalVega, theta: totalTheta,
      legDetails, ivByStrike
    });
  }

  return results;
}

// ── Legs CRUD ────────────────────────────────────────────────────

function addLeg(data) {
  btState.legs.push({ id: btState.nextLegId++, ...data });
  saveLegs();
  renderLegsTable();
  updateRunButton();
}

function removeLeg(id) {
  btState.legs = btState.legs.filter(l => l.id !== id);
  saveLegs();
  renderLegsTable();
  updateRunButton();
}

function clearLegs() {
  btState.legs      = [];
  btState.nextLegId = 1;
  saveLegs();
  renderLegsTable();
  updateRunButton();
}

function renderLegsTable() {
  const tbody = document.getElementById('bt-legs-tbody');
  if (!tbody) return;

  if (btState.legs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="placeholder">Sin posiciones. Agregá un leg o importá del simulador.</td></tr>`;
    return;
  }

  const strikes = btState.availableStrikes;

  // Strike ATM: dos más cercanos al último precio disponible
  const lastGgal = btState.filteredHistory.length
    ? btState.filteredHistory[btState.filteredHistory.length - 1].ggal
    : NaN;
  let atmBelow = null, atmAbove = null;
  if (Number.isFinite(lastGgal) && strikes.length) {
    atmBelow = strikes.filter(s => s <= lastGgal).at(-1) ?? null;
    atmAbove = strikes.find(s => s >  lastGgal) ?? null;
  }

  tbody.innerHTML = btState.legs.map(leg => {
    const typeColor  = leg.type === 'call' ? '#3fb950' : leg.type === 'put' ? '#f85149' : '#58a6ff';
    const lotesColor = leg.type === 'suby' ? '#58a6ff' : (leg.lotes >= 0 ? '#3fb950' : '#f85149');

    const strikeCell = leg.type === 'suby'
      ? `<td><input class="leg-num-input" type="number" data-id="${leg.id}" data-field="strike" value="${leg.strike}" step="1" min="0"></td>`
      : `<td><select class="leg-strike-sel" data-id="${leg.id}">
          ${strikes.map(s => {
            const atm = s === atmBelow || s === atmAbove;
            const style = atm ? ' style="background:#1f3a1f;color:#7ee787;font-weight:700"' : '';
            const mark  = atm ? ' ◆' : '';
            return `<option value="${s}"${Number(leg.strike) === s ? ' selected' : ''}${style}>${s}${mark}</option>`;
          }).join('')}
         </select></td>`;

    return `
    <tr data-leg-id="${leg.id}">
      <td>
        <select class="leg-type-sel" data-id="${leg.id}" style="color:${typeColor};font-weight:700">
          <option value="call" ${leg.type === 'call' ? 'selected' : ''}>Call</option>
          <option value="put"  ${leg.type === 'put'  ? 'selected' : ''}>Put</option>
          <option value="suby" ${leg.type === 'suby' ? 'selected' : ''}>Acción</option>
        </select>
      </td>
      <td><input class="leg-num-input" type="number" data-id="${leg.id}" data-field="lotes" value="${leg.lotes}" step="1" style="color:${lotesColor};font-weight:600"></td>
      ${strikeCell}
      <td><input class="leg-num-input" type="number" data-id="${leg.id}" data-field="prima" value="${leg.prima}" step="0.01" min="0"></td>
      <td><input class="leg-date-input" type="date" data-id="${leg.id}" data-field="fecha" value="${leg.fecha || (document.getElementById('bt-entry-date')?.value ?? '')}" title="Fecha de apertura del leg"></td>
      <td><button class="remove-leg-btn" data-id="${leg.id}" title="Eliminar">×</button></td>
    </tr>`;
  }).join('');
}

function updateRunButton() {
  const btn = document.getElementById('bt-run-btn');
  if (btn) btn.disabled = btState.legs.length === 0;
}

// ── Import desde planilla ────────────────────────────────────────

function openImportPlanillaModal() {
  document.getElementById('bt-import-planilla-error').textContent = '';
  document.getElementById('bt-import-planilla-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('bt-import-planilla-textarea').focus(), 50);
}

function closeImportPlanillaModal() {
  document.getElementById('bt-import-planilla-modal').style.display = 'none';
  document.getElementById('bt-import-planilla-textarea').value = '';
  document.getElementById('bt-import-planilla-error').textContent = '';
}

function confirmImportPlanilla() {
  const text = document.getElementById('bt-import-planilla-textarea').value;
  const type = document.getElementById('bt-import-planilla-type').value;
  const parsed = parseImportText(text, type);
  if (!parsed.length) {
    document.getElementById('bt-import-planilla-error').textContent = 'No se encontraron posiciones válidas.';
    return;
  }
  closeImportPlanillaModal();
  parsed.forEach(p => addLeg({ ...p, fecha: '' }));
  showToast(`${parsed.length} leg(s) importados desde planilla.`);
}

function exportPlanilla() {
  if (!btState.legs.length) return;
  const lines = btState.legs.map(l => `${l.lotes}\t${fmtExport(l.strike)}\t${fmtExport(l.prima)}`);
  navigator.clipboard.writeText(lines.join('\n'));
  showToast('✓ Posiciones copiadas al portapapeles.');
}

// ── Import del Simulador ─────────────────────────────────────────

function openImportSimModal() {
  const raw = localStorage.getItem('sim_state_v2');
  const overlay = document.getElementById('import-sim-modal');
  const list    = document.getElementById('import-sim-list');

  if (!raw) {
    list.innerHTML = '<p class="modal-hint">No hay estrategias guardadas en el Simulador.</p>';
    overlay.style.display = 'flex';
    return;
  }

  let saved;
  try { saved = JSON.parse(raw); } catch (_) {
    list.innerHTML = '<p class="modal-hint">Error al leer el estado del Simulador.</p>';
    overlay.style.display = 'flex';
    return;
  }

  const strategies = saved.strategies ?? [];
  if (strategies.length === 0) {
    list.innerHTML = '<p class="modal-hint">No hay estrategias guardadas en el Simulador.</p>';
    overlay.style.display = 'flex';
    return;
  }

  list.innerHTML = strategies.map((s, idx) => {
    const legs = s.positions ?? [];
    return `<div class="sim-strat-item" data-idx="${idx}">
      <strong>${escHtml(s.name)}</strong>
      <span class="modal-hint" style="margin:0">${legs.length} posición${legs.length !== 1 ? 'es' : ''}</span>
    </div>`;
  }).join('');

  overlay.style.display = 'flex';
}

function closeImportSimModal() {
  document.getElementById('import-sim-modal').style.display = 'none';
}

function confirmImportSim(idx) {
  const raw = localStorage.getItem('sim_state_v2');
  if (!raw) return;
  let saved;
  try { saved = JSON.parse(raw); } catch (_) { return; }

  const strat = (saved.strategies ?? [])[idx];
  if (!strat) return;

  const positions = strat.positions ?? [];
  btState.legs = [];
  btState.nextLegId = 1;
  positions.forEach(p => {
    btState.legs.push({ id: btState.nextLegId++, type: p.type, lotes: p.lotes, strike: p.strike ?? 0, prima: p.prima, fecha: p.fecha ?? '' });
  });

  saveLegs();
  renderLegsTable();
  updateRunButton();
  closeImportSimModal();
  showToast(`${positions.length} leg(s) importados de "${strat.name}".`);
}

// ── Población de UI ──────────────────────────────────────────────

function populateVencimientoSelect(vencimientos) {
  const sel = document.getElementById('bt-venc');
  sel.innerHTML = vencimientos.map(v =>
    `<option value="${v}">${VENCIMIENTO_LABELS[v] ?? v} (${v})</option>`
  ).join('');
  sel.value = vencimientos[0] ?? '';
}

function onVencimientoChange() {
  const venc   = document.getElementById('bt-venc').value;
  const opexEl = document.getElementById('bt-opex-date');

  btState.selectedVenc = venc;

  // Reparsear filtrando por vencimiento
  const parsed = parseHistoryPayload(btState.rawPayload, venc);
  btState.filteredHistory  = parsed.historyByDate;
  btState.availableStrikes = parsed.availableStrikes;
  renderLegsTable();

  // Recalcular fecha OPEX a partir del vencimiento seleccionado
  const lastDate = parsed.historyByDate.slice(-1)[0]?.fechaRaw;
  const refYear  = lastDate ? Number(lastDate.slice(0, 4)) : new Date().getFullYear();
  const opexDate = opexDateForVencCode(venc, refYear) ?? opexDateForVencCode(venc, refYear + 1);
  if (opexDate && opexEl) opexEl.value = opexDate;

  populateEntryDateSelect(parsed.historyByDate);
  saveConfig();
}

function populateEntryDateSelect(historyByDate) {
  const sel    = document.getElementById('bt-entry-date');
  const sorted = historyByDate
    .filter(e => Number.isFinite(e.ggal) && e.ggal > 0)
    .sort((a, b) => a.fechaRaw.localeCompare(b.fechaRaw));

  sel.innerHTML = sorted.map(e =>
    `<option value="${e.fechaRaw}">${formatDateDisplay(e.fechaRaw)} — GGAL $${fmt2(e.ggal)}</option>`
  ).join('');
}

function formatDateDisplay(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// ── Carga inicial ────────────────────────────────────────────────

async function loadHistoryData() {
  const statusEl = document.getElementById('bt-status');
  const setStatus = msg => { if (statusEl) statusEl.textContent = msg; };

  try {
    btState.rawPayload = await loadHistoryPayload(setStatus);

    const parsed = parseHistoryPayload(btState.rawPayload);
    btState.availableVencimientos = parsed.availableVencimientos;

    if (parsed.availableVencimientos.length === 0) {
      setStatus('No se encontraron vencimientos en los datos.');
      return;
    }

    populateVencimientoSelect(parsed.availableVencimientos);
    onVencimientoChange();
    setStatus('Listo. Definí la estrategia y ejecutá el backtest.');
  } catch (err) {
    const statusEl = document.getElementById('bt-status');
    if (statusEl) statusEl.textContent = `Error: ${err.message}`;
    console.error(err);
  }
}

// ── Charts ───────────────────────────────────────────────────────

const SERIES_COLORS = ['#58a6ff', '#3fb950', '#d29922', '#bc8cff', '#f85149', '#79c0ff'];

const verticalLinePlugin = {
  id: 'verticalLine',
  afterDraw(chart, _args, opts) {
    if (!opts?.index && opts?.index !== 0) return;
    const { ctx, chartArea, scales } = chart;
    const x = scales.x.getPixelForTick(opts.index);
    if (x === undefined) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
};

if (typeof Chart !== 'undefined') {
  Chart.register(verticalLinePlugin);
}

function destroyCharts() {
  Object.values(btCharts).forEach(c => c?.destroy());
  btCharts = { pnl: null, greeks: null, iv: null };
}

function buildPnLChart(results) {
  const labels  = results.map(r => formatDateDisplay(r.fechaRaw));
  const pnlData = results.map(r => r.totalPnL);
  const ggalData = results.map(r => r.ggal);

  const ctx = document.getElementById('bt-chart-pnl').getContext('2d');
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'P&L',
          data: pnlData,
          borderColor: '#58a6ff',
          backgroundColor: 'rgba(88,166,255,0.07)',
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.2,
          fill: true,
          yAxisID: 'y'
        },
        {
          label: 'GGAL',
          data: ggalData,
          borderColor: 'rgba(200,200,200,0.4)',
          borderWidth: 1,
          pointRadius: 0,
          tension: 0.2,
          fill: false,
          yAxisID: 'y2'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        verticalLine: { index: 0 },
        legend: { labels: { color: '#8b949e' } },
        tooltip: {
          callbacks: {
            label: ctx => ctx.dataset.label + ': $' + FMT2.format(ctx.parsed.y)
          }
        }
      },
      scales: {
        x: { ticks: { color: '#6e7681', maxTicksLimit: 10 }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: {
          ticks: { color: '#6e7681', callback: v => '$' + FMT2.format(v) },
          grid: { color: 'rgba(255,255,255,0.05)' },
          title: { display: true, text: 'P&L ($)', color: '#6e7681' }
        },
        y2: {
          position: 'right',
          ticks: { color: '#6e7681', callback: v => '$' + FMT2.format(v) },
          grid: { drawOnChartArea: false },
          title: { display: true, text: 'GGAL ($)', color: '#6e7681' }
        }
      }
    }
  });
}

function buildGreeksChart(results) {
  const labels = results.map(r => formatDateDisplay(r.fechaRaw));

  const mkDataset = (label, key, color, yAxisID, dash) => ({
    label,
    data: results.map(r => r[key]),
    borderColor: color,
    backgroundColor: 'transparent',
    borderWidth: 1.8,
    borderDash: dash ?? [],
    pointRadius: 1.5,
    tension: 0.2,
    fill: false,
    yAxisID
  });

  const ctx = document.getElementById('bt-chart-greeks').getContext('2d');
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        mkDataset('Delta (Δ)',  'delta', '#58a6ff', 'y'),
        mkDataset('Gamma (Γ)',  'gamma', '#d29922',  'y2'),
        mkDataset('Vega (ν)',   'vega',  '#bc8cff',  'y2'),
        mkDataset('Theta (θ)',  'theta', '#f85149',  'y2', [3,3])
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        verticalLine: { index: 0 },
        legend: { labels: { color: '#8b949e' } },
        tooltip: {
          callbacks: { label: ctx => ctx.dataset.label + ': ' + FMT2.format(ctx.parsed.y) }
        }
      },
      scales: {
        x: { ticks: { color: '#6e7681', maxTicksLimit: 10 }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y:  { ticks: { color: '#6e7681' }, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: 'Delta', color: '#6e7681' } },
        y2: { position: 'right', ticks: { color: '#6e7681' }, grid: { drawOnChartArea: false }, title: { display: true, text: 'Gamma / Vega / Theta', color: '#6e7681' } }
      }
    }
  });
}

function buildIVChart(results, legs) {
  const labels = results.map(r => formatDateDisplay(r.fechaRaw));

  // Una serie por (type, strike) único
  const seriesKeys = [...new Set(legs.map(l => `${l.type}_${l.strike}`))];

  const datasets = seriesKeys.map((key, i) => {
    const [type, strike] = key.split('_');
    return {
      label: `${type.toUpperCase()} ${strike}`,
      data: results.map(r => {
        const v = r.ivByStrike[key];
        return Number.isFinite(v) ? v : null;
      }),
      borderColor: SERIES_COLORS[i % SERIES_COLORS.length],
      backgroundColor: 'transparent',
      borderWidth: 1.8,
      pointRadius: 2,
      tension: 0.2,
      fill: false,
      spanGaps: false
    };
  });

  const ctx = document.getElementById('bt-chart-iv').getContext('2d');
  return new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        verticalLine: { index: 0 },
        legend: { labels: { color: '#8b949e' } },
        tooltip: {
          callbacks: { label: ctx => ctx.dataset.label + ': ' + FMT2.format(ctx.parsed.y) + '%' }
        }
      },
      scales: {
        x: { ticks: { color: '#6e7681', maxTicksLimit: 10 }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: {
          ticks: { color: '#6e7681', callback: v => v.toFixed(0) + '%' },
          grid:  { color: 'rgba(255,255,255,0.05)' },
          title: { display: true, text: 'IV (%)', color: '#6e7681' }
        }
      }
    }
  });
}

function initCharts(results, legs) {
  destroyCharts();
  btCharts.pnl    = buildPnLChart(results);
  btCharts.greeks = buildGreeksChart(results);
  btCharts.iv     = buildIVChart(results, legs);
}

// ── Heatmap diario ──────────────────────────────────────────────

const HM_PAGE = 10;

const HM_METRICS = [
  { key: 'dailyPnL', label: 'P&L Diarios',  isDollar: true  },
  { key: 'theta',    label: 'Theta Neto',    isDollar: false },
  { key: 'vega',     label: 'Vega Neto',     isDollar: false },
  { key: 'gamma',    label: 'Gamma Neto',    isDollar: false },
  { key: 'delta',    label: 'Delta Neto',    isDollar: false },
];

// Color stops per metric (positive hue, negative hue)
const HM_COLORS = [
  { pos: [46, 160, 67],   neg: [218, 54,  51]  },  // P&L: verde / rojo
  { pos: [210, 153, 34],  neg: [180, 100, 20]  },  // Theta: naranja
  { pos: [188, 140, 255], neg: [110, 64,  201] },  // Vega: violeta
  { pos: [63,  185, 80],  neg: [25,  97,  39]  },  // Gamma: verde esmeralda
  { pos: [88,  166, 255], neg: [3,   102, 214] },  // Delta: azul
];

function hmCellColor(value, maxAbs, colorIdx) {
  if (maxAbs === 0) return 'rgba(80,80,80,0.5)';
  const t       = Math.min(Math.abs(value) / maxAbs, 1);
  const alpha   = 0.35 + t * 0.65;
  const scheme  = HM_COLORS[colorIdx];
  const [r, g, b] = value >= 0 ? scheme.pos : scheme.neg;
  return `rgba(${r},${g},${b},${alpha})`;
}

function hmFmtCell(value, isDollar) {
  if (!isFinite(value)) return '—';
  const abs = Math.abs(value);
  const sign = value >= 0 ? '+' : '−';
  if (isDollar) return `${sign}$${fmt2(abs)}`;
  return `${sign}${fmt2(abs)}`;
}

function buildHeatmap(results) {
  if (!results || results.length === 0) return;

  // Calcular P&L diario (cambio vs día anterior)
  const withDaily = results.map((r, i) => ({
    ...r,
    dailyPnL: i === 0 ? r.totalPnL : r.totalPnL - results[i - 1].totalPnL
  }));

  btState.hmResults  = withDaily;
  btState.hmOffset   = 0;
  btState.hmSelected = 0;
  renderHeatmap();
}

function renderHeatmap() {
  const wrap = document.getElementById('bt-heatmap-wrap');
  if (!wrap || !btState.hmResults) return;

  const results  = btState.hmResults;
  const offset   = btState.hmOffset;
  const pageData = results.slice(offset, offset + HM_PAGE);
  const numCols  = pageData.length;

  if (numCols === 0) { wrap.innerHTML = ''; return; }

  // Precompute maxAbs per metric row
  const maxAbs = HM_METRICS.map(m =>
    Math.max(...results.map(r => Math.abs(r[m.key] ?? 0)), 1e-9)
  );

  // Build grid as CSS grid: label col + numCols data cols
  const colTemplate = `auto repeat(${numCols}, 1fr)`;

  let html = `<div class="heatmap-outer">
    <div class="heatmap-grid" style="grid-template-columns:${colTemplate}">`;

  // Rows
  HM_METRICS.forEach((m, mi) => {
    html += `<div class="hm-row">`;
    html += `<div class="hm-label">${m.label}</div>`;
    pageData.forEach((r, ci) => {
      const v     = r[m.key] ?? 0;
      const bg    = hmCellColor(v, maxAbs[mi], mi);
      const label = hmFmtCell(v, m.isDollar);
      const selClass = (offset + ci === btState.hmSelected) ? ' hm-selected' : '';
      html += `<div class="hm-cell${selClass}" style="background:${bg}" data-day="${offset + ci}">${label}</div>`;
    });
    html += `</div>`;
  });

  // Day labels row (below data)
  html += `<div class="hm-row"><div class="hm-label"></div>`;
  pageData.forEach((r, ci) => {
    const dayNum = offset + ci + 1;
    html += `<div class="hm-day-label">D${dayNum}<br><span style="font-size:0.62rem;opacity:0.7">${formatDateDisplay(r.fechaRaw)}</span></div>`;
  });
  html += `</div>`;

  html += `</div>`; // .heatmap-grid

  // Pager
  const totalPages = Math.ceil(results.length / HM_PAGE);
  const curPage    = Math.floor(offset / HM_PAGE) + 1;
  html += `<div class="hm-pager">
    <button class="hm-pager-btn" id="hm-prev" ${offset === 0 ? 'disabled' : ''}>← Anterior</button>
    <span>${curPage} / ${totalPages} &nbsp;·&nbsp; Días ${offset + 1}–${Math.min(offset + HM_PAGE, results.length)} de ${results.length}</span>
    <button class="hm-pager-btn" id="hm-next" ${offset + HM_PAGE >= results.length ? 'disabled' : ''}>Siguiente →</button>
  </div>`;

  // Stats del día seleccionado
  const sel     = results[btState.hmSelected] ?? results[0];
  const ivVals  = Object.values(sel.ivByStrike ?? {});
  const avgIv   = ivVals.length > 0 ? ivVals.reduce((a, b) => a + b, 0) / ivVals.length : NaN;
  const dpnl    = btState.hmResults[btState.hmSelected]?.dailyPnL ?? 0;
  const dpClass = dpnl >= 0 ? 'positive' : 'negative';

  html += `<div class="hm-stats">
    <div class="hm-stat">
      <span class="hm-stat-label">Spot Price</span>
      <span class="hm-stat-value">$${fmt2(sel.ggal)}</span>
    </div>
    <div class="hm-stat">
      <span class="hm-stat-label">IV promedio</span>
      <span class="hm-stat-value">${isFinite(avgIv) ? fmt2(avgIv) + '%' : '—'}</span>
    </div>
    <div class="hm-stat">
      <span class="hm-stat-label">P&L del día</span>
      <span class="hm-stat-value ${dpClass}">${hmFmtCell(dpnl, true)}</span>
    </div>
    <div class="hm-stat">
      <span class="hm-stat-label">DTE</span>
      <span class="hm-stat-value">${sel.dte}</span>
    </div>
    <div class="hm-stat">
      <span class="hm-stat-label">Fecha</span>
      <span class="hm-stat-value" style="font-size:0.85rem">${formatDateDisplay(sel.fechaRaw)}</span>
    </div>
  </div>`;

  html += `</div>`; // .heatmap-outer
  wrap.innerHTML = html;

  // Pager listeners
  document.getElementById('hm-prev')?.addEventListener('click', () => {
    btState.hmOffset = Math.max(0, btState.hmOffset - HM_PAGE);
    renderHeatmap();
  });
  document.getElementById('hm-next')?.addEventListener('click', () => {
    btState.hmOffset = Math.min(results.length - 1, btState.hmOffset + HM_PAGE);
    renderHeatmap();
  });

  // Cell click → update stats
  wrap.querySelectorAll('.hm-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      btState.hmSelected = Number(cell.dataset.day);
      renderHeatmap();
    });
  });
}

function setActiveTab(name) {
  ['pnl', 'greeks', 'iv', 'heatmap'].forEach(t => {
    const wrap = document.getElementById(`bt-tab-${t}`);
    const btn  = document.querySelector(`[data-tab="${t}"]`);
    if (!wrap || !btn) return;
    const active = t === name;
    wrap.style.display = active ? '' : 'none';
    btn.classList.toggle('tab-active', active);
    if (active && btCharts[t]) btCharts[t].resize();
    if (active && t === 'heatmap') renderHeatmap();
  });
}

// ── Tabla de resultados ──────────────────────────────────────────

function renderResultsTable(results) {
  const tbody = document.getElementById('bt-results-tbody');
  if (!tbody) return;
  tbody.innerHTML = results.map(r => `
    <tr>
      <td>${formatDateDisplay(r.fechaRaw)}</td>
      <td>$${fmt2(r.ggal)}</td>
      <td>${r.dte}</td>
      <td class="${r.totalPnL >= 0 ? 'positive' : 'negative'}">$${fmt2(r.totalPnL)}</td>
      <td>${fmt2(r.delta)}</td>
      <td>${fmt2(r.gamma)}</td>
      <td>${fmt2(r.vega)}</td>
      <td>${fmt2(r.theta)}</td>
    </tr>
  `).join('');
}

function renderSummary(results, entryDateStr) {
  const first = results[0];
  const last  = results[results.length - 1];
  if (!first || !last) return;

  document.getElementById('bt-sum-entry-date').textContent = formatDateDisplay(entryDateStr);
  document.getElementById('bt-sum-ggal').textContent = '$' + fmt2(first.ggal);
  document.getElementById('bt-sum-pnl').textContent  = '$' + fmt2(last.totalPnL);
  document.getElementById('bt-sum-pnl').className    = last.totalPnL >= 0 ? 'positive' : 'negative';
  document.getElementById('bt-sum-days').textContent = results.length + ' día(s)';
  document.getElementById('bt-sum-dte').textContent  = first.dte + ' → ' + last.dte;
}

// ── Helpers ──────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Event listeners ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

  // Restaurar config guardada
  loadConfig();

  // Guardar campos cuando cambian
  document.getElementById('bt-r').addEventListener('change', saveConfig);
  document.getElementById('bt-opex-date').addEventListener('change', saveConfig);

  // Colapsar/expandir paneles
  document.getElementById('bt-params-toggle').addEventListener('click',   () => togglePanel('params'));
  document.getElementById('bt-strategy-toggle').addEventListener('click', () => togglePanel('strategy'));

  // Carga de datos
  loadHistoryData();

  // Vencimiento cambia
  document.getElementById('bt-venc').addEventListener('change', onVencimientoChange);

  // Agregar leg
  document.getElementById('bt-add-leg').addEventListener('click', () => {
    addLeg({ type: 'call', lotes: 1, strike: 0, prima: 0 });
  });

  // Import desde planilla y exportar
  document.getElementById('bt-import-planilla').addEventListener('click', openImportPlanillaModal);
  document.getElementById('bt-import-planilla-cancel').addEventListener('click', closeImportPlanillaModal);
  document.getElementById('bt-import-planilla-confirm').addEventListener('click', confirmImportPlanilla);
  document.getElementById('bt-import-planilla-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeImportPlanillaModal();
  });
  document.getElementById('bt-export-planilla').addEventListener('click', exportPlanilla);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeImportPlanillaModal();
  });

  // Import del simulador
  document.getElementById('bt-import-sim').addEventListener('click', openImportSimModal);
  document.getElementById('import-sim-cancel').addEventListener('click', closeImportSimModal);
  document.getElementById('import-sim-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeImportSimModal();
  });

  // Click en lista de estrategias del modal
  document.getElementById('import-sim-list').addEventListener('click', e => {
    const item = e.target.closest('.sim-strat-item');
    if (!item) return;
    confirmImportSim(Number(item.dataset.idx));
  });

  // Legs table: edición inline y eliminación
  document.getElementById('bt-legs-tbody').addEventListener('change', e => {
    const id = Number(e.target.dataset.id);
    const leg = btState.legs.find(l => l.id === id);
    if (!leg) return;
    if (e.target.classList.contains('leg-type-sel')) {
      leg.type = e.target.value;
      saveLegs();
      renderLegsTable();
      return;
    } else if (e.target.classList.contains('leg-strike-sel')) {
      leg.strike = parseNum(e.target.value);
    } else if (e.target.classList.contains('leg-num-input')) {
      const field = e.target.dataset.field;
      leg[field] = parseNum(e.target.value);
    } else if (e.target.classList.contains('leg-date-input')) {
      leg.fecha = e.target.value;
    } else { return; }
    saveLegs();
  });

  document.getElementById('bt-legs-tbody').addEventListener('click', e => {
    const btn = e.target.closest('.remove-leg-btn');
    if (!btn) return;
    removeLeg(Number(btn.dataset.id));
  });

  // Re-renderizar tabla de legs cuando cambia la fecha de entrada (actualiza defaults de fecha BT)
  document.getElementById('bt-entry-date').addEventListener('change', () => {
    renderLegsTable();
  });

  // Ejecutar backtest
  document.getElementById('bt-run-btn').addEventListener('click', () => {
    const entryDate = document.getElementById('bt-entry-date').value;
    const opexDate  = document.getElementById('bt-opex-date').value;
    const r_pct     = parseNum(document.getElementById('bt-r').value);

    if (!entryDate || !opexDate) { showToast('Completá fecha de entrada y vencimiento.'); return; }
    if (btState.legs.length === 0) { showToast('Agregá al menos un leg.'); return; }
    if (!isFinite(r_pct) || r_pct < 0) { showToast('Tasa inválida.'); return; }

    const errEl = document.getElementById('bt-error');
    errEl.style.display = 'none';
    errEl.textContent = '';

    try {
      const results = runBacktest(btState.legs, entryDate, opexDate, r_pct, btState.filteredHistory);
      btState.results = results;

      if (results.length === 0) throw new Error('No hay datos entre la fecha de entrada y el vencimiento.');

      renderSummary(results, entryDate);
      initCharts(results, btState.legs);
      buildHeatmap(results);
      renderResultsTable(results);

      document.getElementById('bt-results-panel').style.display = '';
      document.getElementById('bt-table-panel').style.display   = '';
      setActiveTab('pnl');

      document.getElementById('bt-results-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = '';
    }
  });

  // Tabs
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
  });

  // Panel tabla colapsable
  document.getElementById('bt-table-toggle').addEventListener('click', () => {
    const body = document.getElementById('bt-table-body');
    const btn  = document.getElementById('bt-table-toggle');
    const collapsed = body.style.display === 'none';
    body.style.display = collapsed ? '' : 'none';
    btn.textContent = collapsed ? '▼' : '▶';
  });

  // Reload de datos
  document.getElementById('bt-reload-btn')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('bt-status');
    if (statusEl) statusEl.textContent = 'Descargando datos frescos…';
    try {
      btState.rawPayload = await fetchAndCacheHistoryPayload();
      const parsed = parseHistoryPayload(btState.rawPayload);
      btState.availableVencimientos = parsed.availableVencimientos;
      populateVencimientoSelect(parsed.availableVencimientos);
      onVencimientoChange();
      if (statusEl) statusEl.textContent = 'Datos actualizados.';
    } catch (err) {
      if (statusEl) statusEl.textContent = 'Error al recargar: ' + err.message;
    }
  });

  // Botón Limpiar estrategia
  document.getElementById('bt-clear-legs').addEventListener('click', () => {
    if (btState.legs.length === 0) return;
    clearLegs();
    showToast('Estrategia limpiada.');
  });

  // Cargar legs guardados y renderizar
  loadLegs();
  renderLegsTable();
  updateRunButton();
});
