/* ===== MODULO PROBABILIDADES ===== */
const PR = { rows: [], ui: {} };

const PR_COLS = [
  { key: 'date',       label: 'Fecha' },
  { key: 'spot',       label: 'Precio GGAL' },
  { key: 'baseCall',   label: 'Precio Call' },
  { key: 'basePut',    label: 'Precio Put' },
  { key: 'cost',       label: 'Straddle' },
  { key: 'bull',       label: 'Bull' },
  { key: 'ratio',      label: 'Ratio', thColor: 'var(--amber)', strong: true },
  { key: 'deltaCall',  label: 'Delta Call' },
  { key: 'deltaPut',   label: 'Delta Put' },
  { key: 'delta',      label: 'Delta Total' },
  { key: 'vegaCall',   label: 'Vega Call' },
  { key: 'vegaPut',    label: 'Vega Put' },
  { key: 'vega',       label: 'Vega Total' },
  { key: 'lnRatio',    label: 'LN Ratio' },
  { key: 'lnDelta',    label: 'LN Delta' },
  { key: 'lnVega',     label: 'LN Vega' },
  { key: 'probRatio',  label: 'Prob Acum Ratio' },
  { key: 'probDelta',  label: 'Prob Acum Delta' },
  { key: 'probVega',   label: 'Prob Acum Vega' },
];

function probLoadColsConfig() {
  try {
    const raw = localStorage.getItem('pr_cols_v1');
    if (!raw) return null;
    const cfg = JSON.parse(raw);
    if (!cfg || typeof cfg !== 'object') return null;
    return cfg;
  } catch (_) {
    return null;
  }
}

function probSaveColsConfig(cfg) {
  try { localStorage.setItem('pr_cols_v1', JSON.stringify(cfg)); } catch (_) {}
}

function probResetColsConfig() {
  const allKeys = PR_COLS.map(c => c.key);
  const hidden = {};
  allKeys.forEach(k => { hidden[k] = false; });
  probSaveColsConfig({ order: allKeys, hidden });
}

function probGetColsConfig() {
  const cfg = probLoadColsConfig() || {};
  const order = Array.isArray(cfg.order) ? cfg.order.filter(Boolean) : [];
  const hidden = (cfg.hidden && typeof cfg.hidden === 'object') ? cfg.hidden : {};
  const allKeys = PR_COLS.map(c => c.key);
  const fixedOrder = [
    ...order.filter(k => allKeys.includes(k)),
    ...allKeys.filter(k => !order.includes(k)),
  ];
  return { order: fixedOrder, hidden: { ...hidden } };
}

function probSetColHidden(key, isHidden) {
  const cfg = probGetColsConfig();
  cfg.hidden[key] = !!isHidden;
  probSaveColsConfig(cfg);
}

function probMoveCol(key, dir) {
  const cfg = probGetColsConfig();
  const idx = cfg.order.indexOf(key);
  if (idx < 0) return;
  const j = idx + dir;
  if (j < 0 || j >= cfg.order.length) return;
  [cfg.order[idx], cfg.order[j]] = [cfg.order[j], cfg.order[idx]];
  probSaveColsConfig(cfg);
}

function probGetVisibleCols() {
  const cfg = probGetColsConfig();
  const map = new Map(PR_COLS.map(c => [c.key, c]));
  return cfg.order
    .map(k => map.get(k))
    .filter(Boolean)
    .filter(c => !cfg.hidden[c.key]);
}

function probRenderTableHeader() {
  const tr = document.querySelector('#tab-probabilidades table thead tr');
  if (!tr) return;
  const cols = probGetVisibleCols();
  tr.innerHTML = cols.map(c => {
    const color = c.thColor || 'var(--muted)';
    const weight = c.strong ? 'font-weight:600;' : '';
    return `<th style="${PR_TH};color:${color};${weight}">${c.label}</th>`;
  }).join('');
}

// Columns menu behavior mirrors the Chain module:
// - stays open while toggling/reordering
// - closes on click outside (or on the button toggling)
let prColsMenuBound = false;
let prColsMenuInteracting = false;
function probInitColsMenu() {
  if (prColsMenuBound) return;
  prColsMenuBound = true;

  document.addEventListener('pointerdown', e => {
    prColsMenuInteracting = !!(e.target.closest('#pr-cols-pop') || e.target.closest('#pr-cols-btn'));
  }, true);

  document.addEventListener('click', e => {
    const pop = document.getElementById('pr-cols-pop');
    if (!pop || pop.style.display === 'none') return;
    if (prColsMenuInteracting || e.target.closest('#pr-cols-pop') || e.target.closest('#pr-cols-btn')) {
      prColsMenuInteracting = false;
      return;
    }
    pop.style.display = 'none';
    prColsMenuInteracting = false;
  });
}

function probEnsureColsUI() {
  const tab = document.getElementById('tab-probabilidades');
  if (!tab) return;
  // Prefer the static button placed in the "Detalle" header.
  let btn = document.getElementById('pr-cols-btn');
  if (!btn) return;

  let pop = document.getElementById('pr-cols-pop');
  if (!pop) {
    pop = document.createElement('div');
    pop.id = 'pr-cols-pop';
    document.body.appendChild(pop);
  }

  // Ensure look & feel matches the Chain columns menu.
  pop.style.position = 'fixed';
  pop.style.zIndex = '9999';
  if (!pop.style.display) pop.style.display = 'none';
  pop.style.minWidth = '280px';
  pop.style.maxWidth = '320px';
  pop.style.maxHeight = '60vh';
  pop.style.overflow = 'auto';
  pop.style.background = 'var(--surface)';
  pop.style.border = '1px solid var(--border)';
  pop.style.borderRadius = '8px';
  pop.style.boxShadow = '0 10px 24px rgba(0,0,0,.18)';
  pop.style.padding = '10px';

  probInitColsMenu();

  const renderPop = () => {
    const cfg = probGetColsConfig();
    const map = new Map(PR_COLS.map(c => [c.key, c]));
    const rows = cfg.order.map(k => map.get(k)).filter(Boolean);
    pop.innerHTML = `
       <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px">
         <div>
           <div style="font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted)">Columnas a mostrar</div>
         </div>
         <button id="pr-cols-reset" type="button" style="padding:3px 8px;font-size:10px">Reset</button>
       </div>
       <div style="display:flex;flex-direction:column;gap:0">
         ${rows.map((c, i) => {
           const isHidden = !!cfg.hidden[c.key];
           const eye = isHidden ? '--' : '👁️';
           const upDisabled = i === 0;
           const downDisabled = i === rows.length - 1;
           return `
             <div style="display:grid;grid-template-columns:30px 1fr 28px 28px;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border2)">
               <button type="button" data-pr-eye="${c.key}" title="${isHidden ? 'Mostrar' : 'Ocultar'} columna"
                 style="padding:2px 0;background:transparent;border:1px solid ${isHidden ? 'var(--border)' : 'var(--amber)'};color:${isHidden ? 'var(--muted)' : 'var(--amber)'};border-radius:4px;font-size:12px;cursor:pointer">
                 ${eye}
               </button>
               <div style="font-size:11px;color:${isHidden ? 'var(--muted)' : 'var(--text)'}">${c.label}</div>
               <button type="button" data-pr-up="${c.key}" ${upDisabled ? 'disabled' : ''} title="Mover arriba"
                 style="padding:2px 0;border:1px solid var(--border);background:var(--bg);color:${upDisabled ? 'var(--dim)' : 'var(--text)'};border-radius:4px;font-size:11px;cursor:${upDisabled ? 'default' : 'pointer'}">↑</button>
               <button type="button" data-pr-down="${c.key}" ${downDisabled ? 'disabled' : ''} title="Mover abajo"
                 style="padding:2px 0;border:1px solid var(--border);background:var(--bg);color:${downDisabled ? 'var(--dim)' : 'var(--text)'};border-radius:4px;font-size:11px;cursor:${downDisabled ? 'default' : 'pointer'}">↓</button>
             </div>`;
         }).join('')}
       </div>`;

    pop.querySelector('#pr-cols-reset')?.addEventListener('click', () => {
      probResetColsConfig();
      renderPop();
      renderProbabilidades();
    });
    pop.querySelectorAll('[data-pr-eye]').forEach(b => {
      b.addEventListener('click', () => {
        const key = b.getAttribute('data-pr-eye');
        const cfg2 = probGetColsConfig();
        const visibleCount = cfg2.order.filter(k => !cfg2.hidden[k]).length;
        const nextHidden = !cfg2.hidden[key];
        // Avoid ending up with an empty table (mirror Chain behavior).
        if (nextHidden && visibleCount <= 1) return;
        probSetColHidden(key, nextHidden);
        renderPop();
        renderProbabilidades();
      });
    });
    pop.querySelectorAll('[data-pr-up]').forEach(b => {
      b.addEventListener('click', () => {
        const key = b.getAttribute('data-pr-up');
        probMoveCol(key, -1);
        renderPop();
        renderProbabilidades();
      });
    });
    pop.querySelectorAll('[data-pr-down]').forEach(b => {
      b.addEventListener('click', () => {
        const key = b.getAttribute('data-pr-down');
        probMoveCol(key, +1);
        renderPop();
        renderProbabilidades();
      });
    });
  };

  // Bind once (don't rely on HTML attributes like data-bound).
  if (!btn.dataset.prColsBound) {
    btn.dataset.prColsBound = '1';
    btn.addEventListener('click', () => {
      const popEl = document.getElementById('pr-cols-pop');
      if (!popEl) return;
      if (popEl.style.display === 'block') { popEl.style.display = 'none'; return; }
      renderPop();
      const r = btn.getBoundingClientRect();
      const W = 320;
      popEl.style.left = `${Math.max(8, Math.min(window.innerWidth - W - 8, r.right - W))}px`;
      popEl.style.top = `${Math.min(window.innerHeight - 40, r.bottom + 8)}px`;
      popEl.style.display = 'block';
    });
  }
}

function probSyncTypesUI() {
  const t1 = document.getElementById('pr-type1');
  const t2 = document.getElementById('pr-type2');
  if (!t1 || !t2) return;
  if (t1.value !== 'call' && t1.value !== 'put') t1.value = 'call';
  if (t2.value !== 'call' && t2.value !== 'put') t2.value = 'call';
  if (typeof syncTypeBtns === 'function') syncTypeBtns(['pr-type1', 'pr-type2']);
}

function probToggleType(n) {
  const hidden = document.getElementById('pr-type' + n);
  if (!hidden) return;
  hidden.value = hidden.value === 'call' ? 'put' : 'call';
  probSyncTypesUI();
  renderProbabilidades();
}

function probSwapStrikes() {
  if (typeof swapStrikeSelectors === 'function') {
    swapStrikeSelectors('pr-strike1', 'pr-strike2', 'pr-type1', 'pr-type2', null);
  } else {
    const s1 = document.getElementById('pr-strike1');
    const s2 = document.getElementById('pr-strike2');
    if (s1 && s2) [s1.value, s2.value] = [s2.value, s1.value];
    const t1 = document.getElementById('pr-type1');
    const t2 = document.getElementById('pr-type2');
    if (t1 && t2) [t1.value, t2.value] = [t2.value, t1.value];
  }
  probSyncTypesUI();
  renderProbabilidades();
}

function probInjectHTML() {
  if (!document.getElementById('tab-probabilidades')) return;
  const rateEl = document.getElementById('pr-rate');
  if (rateEl && !rateEl.dataset.bound) {
    rateEl.addEventListener('input', () => { rateEl.dataset.userTouched = '1'; });
    rateEl.dataset.bound = '1';
  }
  probSyncTypesUI();
  probEnsureColsUI();
  probSyncDefaults();
}

const PR_TH = 'padding:7px 8px;border-bottom:1px solid var(--border);color:var(--muted);font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.6px;text-align:center;white-space:nowrap';

function probSyncDefaults() {
  const rateEl = document.getElementById('pr-rate');
  const lotsEl = document.getElementById('pr-lots');
  if (rateEl) {
    const siteRateValue = isFinite(ST?.rate) && ST.rate > 0 ? ST.rate * 100 : siteRate();
    const currentValue = parseFloat(rateEl.value);
    const lastSynced = parseFloat(rateEl.dataset.lastSiteRate || '');
    const shouldSync = rateEl.dataset.userTouched !== '1'
      || !isFinite(currentValue)
      || currentValue === lastSynced;
    if (shouldSync) rateEl.value = siteRateValue;
    rateEl.dataset.lastSiteRate = String(siteRateValue);
  }
  if (lotsEl && (lotsEl.value === '' || lotsEl.value === '0')) lotsEl.value = '100';
  probPopulateStrikes();
  const expEl = document.getElementById('pr-expiry');
  if (expEl) expEl.textContent = ST.selExpiry ? fmtExpiry(ST.selExpiry) : '--';
}

function probGetDefaultStrike(strikes) {
  if (!strikes.length) return 0;
  const chainRows = Array.isArray(ST.chain?.[ST.selExpiry]) ? ST.chain[ST.selExpiry] : [];
  const chainAtm = chainRows.length
    ? chainRows.reduce((best, row) =>
      Math.abs(row.strike - ST.spot) < Math.abs(best.strike - ST.spot) ? row : best,
    chainRows[0])
    : null;
  const targetStrike = isFinite(chainAtm?.strike) ? chainAtm.strike : ST.spot;
  return strikes.reduce((best, strike) =>
    Math.abs(strike - targetStrike) < Math.abs(best - targetStrike) ? strike : best,
  strikes[0]);
}

function probPopulateStrikes() {
  const histCols = Array.isArray(HIST?.cols) ? HIST.cols : [];
  const histRows = Array.isArray(HIST?.rows) ? HIST.rows : [];
  let strikes = [...new Set(histCols.map(c => c.strike))].filter(v => isFinite(v)).sort((a, b) => a - b);
  if (!strikes.length && histRows.length) {
    const strikeSet = new Set();
    histRows.forEach(row => {
      Object.keys(row.prices || {}).forEach(key => {
        const parts = key.split('_');
        const strike = parseFloat(parts[1]);
        if (isFinite(strike)) strikeSet.add(strike);
      });
    });
    strikes = [...strikeSet].sort((a, b) => a - b);
  }
  const s1 = document.getElementById('pr-strike1');
  const s2 = document.getElementById('pr-strike2');
  if (!s1 || !s2) return;
  if (!strikes.length) {
    s1.innerHTML = '';
    s2.innerHTML = '';
    return;
  }
  const defaultAtm = probGetDefaultStrike(strikes);
  const cur1 = parseFloat(s1.value) || parseFloat(document.getElementById('ah-strike1')?.value) || defaultAtm || 0;
  const cur2 = parseFloat(s2.value) || parseFloat(document.getElementById('ah-strike2')?.value) || defaultAtm || 0;
  [s1, s2].forEach(sel => sel.innerHTML = '');
  strikes.forEach(k => {
    const o1 = document.createElement('option');
    o1.value = k; o1.textContent = fmtStrike(k);
    if (k === cur1) o1.selected = true;
    s1.appendChild(o1);
    const o2 = document.createElement('option');
    o2.value = k; o2.textContent = fmtStrike(k);
    if (k === cur2) o2.selected = true;
    s2.appendChild(o2);
  });
  if (!s1.value && strikes.length) s1.value = String(defaultAtm || strikes[0]);
  if (!s2.value && strikes.length) s2.value = String(defaultAtm || strikes[0]);
  probSyncTypesUI();
}

async function probRefreshHist() {
  const status = document.getElementById('pr-status');
  if (status) status.textContent = 'Actualizando HMD...';
  try {
    await fetchAnalHist();
  } finally {
    probPopulateStrikes();
    renderProbabilidades();
  }
}

function probRankPct(values, current) {
  const valid = values.filter(v => isFinite(v));
  if (!valid.length || !isFinite(current)) return null;
  const rank = valid.filter(v => v < current).length + 1;
  return rank / valid.length;
}

function probFmtPct(v) {
  return v == null || !isFinite(v) ? '--' : `${fmtN(v * 100, 2)}%`;
}

function probFmtLn(v) {
  return v == null || !isFinite(v) ? '--' : `${fmtN(v * 100, 2)}%`;
}

function probFmtDate(s) {
  if (!s) return '--';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim());
  if (!m) return s;
  return `${m[3]}/${m[2]}/${m[1].slice(-2)}`;
}

function renderProbabilidades() {
  probSyncDefaults();
  syncDateFromPicker('pr-date-from', null);
  const body = document.getElementById('pr-body');
  const summary = document.getElementById('pr-summary');
  const hero = document.getElementById('pr-hero');
  const status = document.getElementById('pr-status');
  if (!body || !summary || !hero) return;

  probEnsureColsUI();
  probRenderTableHeader();
  const visibleCols = probGetVisibleCols();
  const colCount = Math.max(1, visibleCols.length);

  if (!HIST.rows.length) {
    body.innerHTML = `<tr><td colspan="${colCount}" style="padding:18px;text-align:center;color:var(--muted)">Sin HMD cargado. Usá "Actualizar HMD" para poblar el módulo.</td></tr>`;
    summary.innerHTML = '';
    hero.innerHTML = '';
    if (status) status.textContent = 'Sin datos';
    return;
  }

  probSyncTypesUI();
  const K1 = parseFloat(document.getElementById('pr-strike1')?.value) || 0;
  const K2 = parseFloat(document.getElementById('pr-strike2')?.value) || 0;
  const type1 = document.getElementById('pr-type1')?.value || 'call';
  const type2 = document.getElementById('pr-type2')?.value || 'call';
  const r = (parseFloat(document.getElementById('pr-rate')?.value || '0') || 0) / 100;
  const lots = parseFloat(document.getElementById('pr-lots')?.value || '100') || 100;
  const q = ST.q || 0;
  const expiryStr = ST.selExpiry || document.getElementById('ah-expiry')?.value || '';
  const expiryMs = expiryStr ? new Date(expiryStr + 'T12:00:00').getTime() : null;
  const dateFrom = document.getElementById('pr-date-from')?.value.trim() || '';
  const source = dateFrom ? HIST.rows.filter(rw => rw.date >= dateFrom) : HIST.rows;

  const baseRows = source.map(row => {
    const e1 = row.prices[`${type1}_${K1}`] || null;
    const e2 = row.prices[`${type2}_${K2}`] || null;
    const p1 = e1?.price ?? null;
    const p2 = e2?.price ?? null;
    const spot = row.spot || ST.spot;
    let T = 0;
    if (expiryMs && row.date) {
      const days = Math.max(0, (expiryMs - new Date(row.date + 'T12:00:00').getTime()) / 86400000);
      T = days / 365;
    }
    const k1 = e1?.strike || K1;
    const k2 = e2?.strike || K2;
    const g1 = p1 != null ? ahCalcGreeks(p1, k1, type1, spot, T, r, q) : null;
    const g2 = p2 != null ? ahCalcGreeks(p2, k2, type2, spot, T, r, q) : null;
    const baseCall = p1 != null ? p1 : null;
    const basePut = p2 != null ? p2 : null;
    const ratio = p1 != null && p2 != null && p2 > 0 ? p1 / p2 : null;
    const cost = baseCall != null && basePut != null ? baseCall + basePut : null;
    const bull = p1 != null && p2 != null ? (p1 - p2) : null;
    const delta = g1 && g2 ? ((g1.delta * -1) + (g2.delta * -1)) * lots : null;
    const vega = g1 && g2 ? (g1.vega + g2.vega) * -lots : null;
    return {
      date: row.date || '--',
      spot,
      cost, bull, baseCall, basePut, ratio, delta, vega,
      deltaCall: g1?.delta ?? null,
      deltaPut: g2?.delta ?? null,
      vegaCall: g1?.vega ?? null,
      vegaPut: g2?.vega ?? null,
    };
  }).filter(row => row.baseCall != null && row.basePut != null);

  if (!baseRows.length) {
    body.innerHTML = `<tr><td colspan="${colCount}" style="padding:18px;text-align:center;color:var(--muted)">No hay suficientes datos para ese Call/Put en el rango elegido.</td></tr>`;
    summary.innerHTML = '';
    hero.innerHTML = '';
    if (status) status.textContent = 'Sin cruces historicos';
    return;
  }

  PR.rows = baseRows.map((row, idx) => {
    const prev = idx > 0 ? baseRows[idx - 1] : null;
    const lnRatio = prev?.ratio && row.ratio ? Math.log(row.ratio / prev.ratio) : null;
    const lnDelta = prev?.delta && row.delta && Math.abs(prev.delta) > 0 && Math.abs(row.delta) > 0
      ? Math.log(Math.abs(row.delta) / Math.abs(prev.delta))
      : null;
    const lnVega = prev?.vega && row.vega && Math.abs(prev.vega) > 0 && Math.abs(row.vega) > 0
      ? Math.log(Math.abs(row.vega) / Math.abs(prev.vega))
      : null;
    return {
      ...row,
      lnRatio,
      lnDelta,
      lnVega,
      probRatio: null,
      probDelta: null,
      probVega: null,
    };
  });

  const lnRows = PR.rows.slice(1);
  const lnRatioSeries = lnRows.map(rw => rw.lnRatio);
  const lnDeltaSeries = lnRows.map(rw => rw.lnDelta);
  const lnVegaSeries = lnRows.map(rw => rw.lnVega);
  PR.rows.forEach((row, idx) => {
    if (idx === 0) {
      row.probRatio = null;
      row.probDelta = null;
      row.probVega = null;
      return;
    }
    row.probRatio = probRankPct(lnRatioSeries, row.lnRatio);
    row.probDelta = probRankPct(lnDeltaSeries, row.lnDelta);
    row.probVega = probRankPct(lnVegaSeries, row.lnVega);
  });

  const latest = PR.rows[PR.rows.length - 1];
  const summaryCards = [
    ['Muestra', `${PR.rows.length} ruedas`, 'var(--text)'],
    ['Ratio actual', latest.ratio != null ? fmtN(latest.ratio, 2) : '--', 'var(--amber)'],
    ['Delta ratio', latest.delta != null ? fmtN(latest.delta, 2) : '--', latest.delta >= 0 ? 'var(--green)' : 'var(--red)'],
    ['Vega ratio', latest.vega != null ? fmtN(latest.vega, 2) : '--', latest.vega >= 0 ? 'var(--green)' : 'var(--red)'],
  ];
  summary.innerHTML = summaryCards.map(([label, value, color]) => `
    <div class="panel" style="padding:12px">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:6px">${label}</div>
      <div style="font-family:var(--mono);font-size:22px;color:${color};font-weight:600">${value}</div>
    </div>`).join('');
  summary.style.display = 'none';

  hero.innerHTML = [
    ...summaryCards,
    ['Prob. acum ratio', probFmtPct(latest.probRatio), 'var(--amber)'],
    ['Prob. acum delta', probFmtPct(latest.probDelta), latest.probDelta >= 0.5 ? 'var(--green)' : 'var(--red)'],
    ['Prob. acum vega', probFmtPct(latest.probVega), latest.probVega >= 0.5 ? 'var(--green)' : 'var(--red)'],
    ['Straddle', latest.cost != null ? fmtN(latest.cost, 2) : '--', 'var(--text)'],
  ].map(([label, value, color]) => `
    <div style="padding:12px;background:var(--surface2);border:1px solid var(--border2);border-radius:8px">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:5px">${label}</div>
      <div style="font-family:var(--mono);font-size:18px;color:${color};font-weight:600">${value}</div>
    </div>`).join('');

  const colKeys = visibleCols.map(c => c.key);
  const cell = (key, row) => {
    const deltaColor = row.delta == null ? 'var(--muted)' : row.delta >= 0 ? 'var(--green)' : 'var(--red)';
    const vegaColor = row.vega == null ? 'var(--muted)' : row.vega >= 0 ? 'var(--green)' : 'var(--red)';
    if (key === 'date') return { html: probFmtDate(row.date), style: 'color:var(--muted)' };
    if (key === 'spot') return { html: row.spot != null ? fmtN(row.spot, 0) : '--' };
    if (key === 'baseCall') return { html: row.baseCall != null ? fmtN(row.baseCall, 2) : '--' };
    if (key === 'basePut') return { html: row.basePut != null ? fmtN(row.basePut, 2) : '--' };
    if (key === 'ratio') return { html: row.ratio != null ? fmtN(row.ratio, 2) : '--', style: 'color:var(--amber);font-weight:600' };
    if (key === 'cost') return { html: row.cost != null ? fmtN(row.cost, 2) : '--' };
    if (key === 'bull') return { html: row.bull != null ? fmtN(row.bull, 2) : '--' };
    if (key === 'deltaCall') return { html: row.deltaCall != null ? fmtN(row.deltaCall, 4) : '--' };
    if (key === 'deltaPut') return { html: row.deltaPut != null ? fmtN(row.deltaPut, 4) : '--' };
    if (key === 'delta') return { html: row.delta != null ? fmtN(row.delta, 2) : '--', style: `color:${deltaColor}` };
    if (key === 'vegaCall') return { html: row.vegaCall != null ? fmtN(row.vegaCall, 4) : '--' };
    if (key === 'vegaPut') return { html: row.vegaPut != null ? fmtN(row.vegaPut, 4) : '--' };
    if (key === 'vega') return { html: row.vega != null ? fmtN(row.vega, 2) : '--', style: `color:${vegaColor}` };
    if (key === 'lnRatio') return { html: probFmtLn(row.lnRatio) };
    if (key === 'lnDelta') return { html: probFmtLn(row.lnDelta) };
    if (key === 'lnVega') return { html: probFmtLn(row.lnVega) };
    if (key === 'probRatio') return { html: probFmtPct(row.probRatio) };
    if (key === 'probDelta') return { html: probFmtPct(row.probDelta) };
    if (key === 'probVega') return { html: probFmtPct(row.probVega) };
    return { html: '--' };
  };

  body.innerHTML = PR.rows.map(row => {
    return `<tr style="border-bottom:1px solid var(--border2)">${colKeys.map(k => {
      const { html, style } = cell(k, row);
      return `<td style="${PR_TD}${style ? style + ';' : ''}">${html}</td>`;
    }).join('')}</tr>`;
  }).join('');

  if (status) status.textContent = `${PR.rows.length} registros`;
}

const PR_TD = 'padding:5px 8px;text-align:center;white-space:nowrap';

