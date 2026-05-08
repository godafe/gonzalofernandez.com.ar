/* ===== MODULO PROBABILIDADES ===== */
const PR = { rows: [], ui: {} };
const PR_COLS_STORAGE_KEY = 'pr_cols_v2';
const PR_LEGACY_COLS_STORAGE_KEY = 'pr_cols_v1';
const PR_COLS_CONFIG_VERSION = 2;

const PR_COLS = [
  { key: 'date',       label: 'Fecha', defaultHidden: false, appliesTo: 'always' },
  { key: 'spot',       label: 'Precio GGAL', defaultHidden: false, appliesTo: 'always' },
  { key: 'baseCall',   label: 'Precio Base 1', defaultHidden: false, appliesTo: 'always' },
  { key: 'basePut',    label: 'Precio Base 2', defaultHidden: false, appliesTo: 'always' },
  { key: 'cost',       label: 'Straddle', defaultHidden: false, appliesTo: 'mixed' },
  { key: 'bull',       label: 'Costo Bull', defaultHidden: false, appliesTo: 'same' },
  { key: 'ratio',      label: 'Ratio', thColor: 'var(--amber)', strong: true, defaultHidden: false, appliesTo: 'always' },
  { key: 'deltaCall',  label: 'Delta Call', defaultHidden: true, appliesTo: 'always' },
  { key: 'deltaPut',   label: 'Delta Put', defaultHidden: true, appliesTo: 'always' },
  { key: 'delta',      label: 'Delta Total', defaultHidden: true, appliesTo: 'always' },
  { key: 'vegaCall',   label: 'Vega Call', defaultHidden: true, appliesTo: 'always' },
  { key: 'vegaPut',    label: 'Vega Put', defaultHidden: true, appliesTo: 'always' },
  { key: 'vega',       label: 'Vega Total', defaultHidden: true, appliesTo: 'always' },
  { key: 'lnBull',     label: 'LN Bull',  title: 'Movimiento del Bull vs ayer (log-return diario)', defaultHidden: false, appliesTo: 'same' },
  { key: 'lnRatio',    label: 'LN Ratio', title: 'Movimiento del Ratio vs ayer (log-return diario)', defaultHidden: false, appliesTo: 'always' },
  { key: 'lnDelta',    label: 'LN Delta', defaultHidden: true, appliesTo: 'always' },
  { key: 'lnVega',     label: 'LN Vega', defaultHidden: true, appliesTo: 'always' },
  { key: 'probRatio',  label: 'ECDF Ratio', defaultHidden: false, appliesTo: 'always' },
  { key: 'probDelta',  label: 'ECDF Delta', defaultHidden: true, appliesTo: 'always' },
  { key: 'probVega',   label: 'ECDF Vega', defaultHidden: true, appliesTo: 'always' },
  { key: 'probBull',   label: 'ECDF Bull', defaultHidden: false, appliesTo: 'same' },
];

// Default columns layout (order + visibility) to match the desired initial view.
const PR_DEFAULT_ORDER = [
  'date',
  'spot',
  'baseCall',
  'basePut',
  'cost',
  'bull',
  'ratio',
  'deltaCall',
  'deltaPut',
  'delta',
  'vegaCall',
  'vegaPut',
  'vega',
  'lnBull',
  'lnRatio',
  'lnDelta',
  'lnVega',
  'probBull',
  'probRatio',
  'probDelta',
  'probVega',
];

function probGetColMeta(key) {
  return PR_COLS.find(c => c.key === key) || null;
}

function probIsColApplicable(key, type1, type2) {
  const meta = typeof key === 'string' ? probGetColMeta(key) : key;
  if (!meta) return false;
  const t1 = type1 || document.getElementById('pr-type1')?.value || 'call';
  const t2 = type2 || document.getElementById('pr-type2')?.value || 'call';
  if (meta.appliesTo === 'same') return t1 === t2;
  if (meta.appliesTo === 'mixed') return t1 !== t2;
  return true;
}

function probBuildDefaultHiddenMap(type1, type2) {
  const hidden = {};
  PR_COLS.forEach(col => {
    hidden[col.key] = !probIsColApplicable(col, type1, type2) || !!col.defaultHidden;
  });
  return hidden;
}

function probBuildDefaultColsConfig(type1, type2) {
  const allKeys = PR_COLS.map(c => c.key);
  const order = [
    ...PR_DEFAULT_ORDER.filter(k => allKeys.includes(k)),
    ...allKeys.filter(k => !PR_DEFAULT_ORDER.includes(k)),
  ];
  return { order, hidden: probBuildDefaultHiddenMap(type1, type2), version: PR_COLS_CONFIG_VERSION };
}

function probLoadColsConfig() {
  try {
    const raw = localStorage.getItem(PR_COLS_STORAGE_KEY);
    if (raw) {
      const cfg = JSON.parse(raw);
      if (cfg && typeof cfg === 'object') return cfg;
    }
    const legacyRaw = localStorage.getItem(PR_LEGACY_COLS_STORAGE_KEY);
    if (!legacyRaw) return probBuildDefaultColsConfig();
    const legacy = JSON.parse(legacyRaw);
    if (!legacy || typeof legacy !== 'object') return null;
    const migrated = { ...legacy, version: PR_COLS_CONFIG_VERSION, hidden: { ...(legacy.hidden || {}) } };
    ['cost', 'bull', 'lnBull', 'probBull'].forEach(k => { delete migrated.hidden[k]; });
    return migrated;
  } catch (_) {
    return null;
  }
}

function probSaveColsConfig(cfg) {
  try { localStorage.setItem(PR_COLS_STORAGE_KEY, JSON.stringify({ order: cfg.order, hidden: cfg.hidden, version: PR_COLS_CONFIG_VERSION })); } catch (_) {}
}

function probResetColsConfig() {
  probSaveColsConfig(probBuildDefaultColsConfig());
}

function probGetColsConfig() {
  const cfg = probLoadColsConfig() || {};
  const order = Array.isArray(cfg.order) ? cfg.order.filter(Boolean) : [];
  const hidden = (cfg.hidden && typeof cfg.hidden === 'object') ? cfg.hidden : {};
  const allKeys = PR_COLS.map(c => c.key);
  const def = probBuildDefaultColsConfig();
  const fixedOrder = [
    ...order.filter(k => allKeys.includes(k)),
    ...allKeys.filter(k => !order.includes(k)),
  ];
  // For missing keys (new columns), default to the desired baseline visibility.
  return { order: fixedOrder, hidden: { ...def.hidden, ...hidden }, version: cfg.version || PR_COLS_CONFIG_VERSION };
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
    .filter(c => !cfg.hidden[c.key] && probIsColApplicable(c));
}

function probRenderTableHeader() {
  const tr = document.querySelector('#tab-probabilidades table thead tr');
  if (!tr) return;
  const cols = probGetVisibleCols();
  tr.innerHTML = cols.map(c => {
    const color = c.thColor || 'var(--muted)';
    const weight = c.strong ? 'font-weight:600;' : '';
    const title = (c.title || c.label || '').replace(/"/g, '&quot;');
    return `<th title="${title}" style="${PR_TH};color:${color};${weight}">${c.label}</th>`;
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
  // Use almost full viewport height so the list feels complete (less scrolling).
  pop.style.maxHeight = 'calc(100vh - 16px)';
  pop.style.overflowY = 'auto';
  pop.style.overflowX = 'hidden';
  pop.style.overscrollBehavior = 'contain';
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
           const isApplicable = probIsColApplicable(c);
           const isHidden = !isApplicable || !!cfg.hidden[c.key];
           const eye = !isApplicable ? '🚫' : (isHidden ? '--' : '👁️');
           const upDisabled = i === 0;
           const downDisabled = i === rows.length - 1;
           const eyeTitle = !isApplicable
             ? 'No aplica para la combinacion de tipos actual'
             : `${isHidden ? 'Mostrar' : 'Ocultar'} columna`;
           return `
             <div style="display:grid;grid-template-columns:30px 1fr 28px 28px;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border2)">
               <button type="button" data-pr-eye="${c.key}" ${!isApplicable ? 'disabled' : ''} title="${eyeTitle}"
                 style="padding:2px 0;background:transparent;border:1px solid ${isHidden ? 'var(--border)' : 'var(--amber)'};color:${isHidden ? 'var(--muted)' : 'var(--amber)'};border-radius:4px;font-size:12px;cursor:${!isApplicable ? 'default' : 'pointer'};opacity:${!isApplicable ? '.65' : '1'}">
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
        if (!probIsColApplicable(key)) return;
        const cfg2 = probGetColsConfig();
        const visibleCount = probGetVisibleCols().length;
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
      // Show first so we can measure height and clamp to viewport.
      popEl.style.display = 'block';
      // Default: open below the button; if it doesn't fit, move it up.
      const desiredTop = r.bottom + 8;
      const h = popEl.offsetHeight || 0;
      const maxTop = Math.max(8, window.innerHeight - h - 8);
      popEl.style.top = `${Math.min(desiredTop, maxTop)}px`;
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
  // Note: HTML may have data-bound="1" already; use our own binding marker.
  if (rateEl && !rateEl.dataset.prRateBound) {
    // Use capture so this runs before inline onchange="renderProbabilidades()"
    rateEl.addEventListener('change', () => { rateEl.dataset.userTouched = '1'; }, true);
    rateEl.addEventListener('input', () => { rateEl.dataset.userTouched = '1'; }, true);
    rateEl.dataset.prRateBound = '1';
  }
  const thrEl = document.getElementById('pr-threshold');
  if (thrEl && !thrEl.dataset.prThrBound) {
    thrEl.addEventListener('change', () => { thrEl.dataset.userTouched = '1'; }, true);
    thrEl.addEventListener('input', () => { thrEl.dataset.userTouched = '1'; }, true);
    thrEl.dataset.prThrBound = '1';
  }
  // If the user manually changes strikes, preserve their choice on subsequent auto-populates.
  ['pr-strike1', 'pr-strike2'].forEach(id => {
    const el = document.getElementById(id);
    // Use capture so this runs before the inline onchange="renderProbabilidades()"
    // (otherwise the first change gets overwritten by probPopulateStrikes).
    if (el && !el.dataset.prTouchBound) {
      el.addEventListener('change', () => { el.dataset.userTouched = '1'; }, true);
      el.dataset.prTouchBound = '1';
    }
  });
  probSyncTypesUI();
  probEnsureColsUI();
  probSyncDefaults();
}

const PR_TH = 'padding:7px 8px;border-bottom:1px solid var(--border);color:var(--muted);font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.6px;text-align:center;white-space:nowrap';

function probSyncDefaults() {
  const rateEl = document.getElementById('pr-rate');
  const lotsEl = document.getElementById('pr-lots');
  const thrEl = document.getElementById('pr-threshold');
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
  if (thrEl) {
    const cur = parseFloat(thrEl.value);
    const should = thrEl.dataset.userTouched !== '1' || !isFinite(cur);
    if (should) thrEl.value = '80';
  }
  probPopulateStrikes();
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
  const ah1 = parseFloat(document.getElementById('ah-strike1')?.value) || 0;
  const ah2 = parseFloat(document.getElementById('ah-strike2')?.value) || 0;
  // Ignore pre-filled HTML values unless the user has interacted with these selects.
  const s1Cur = s1.dataset.userTouched === '1' ? (parseFloat(s1.value) || 0) : 0;
  const s2Cur = s2.dataset.userTouched === '1' ? (parseFloat(s2.value) || 0) : 0;

  // Default: S1 = ATM, S2 = ATM + 2 strikes (if possible), both Call.
  const atmIdx = Math.max(0, strikes.findIndex(k => k === defaultAtm));
  const default2 = strikes[Math.min(atmIdx + 2, strikes.length - 1)];

  const cur1 = s1Cur || ah1 || defaultAtm || strikes[0];
  const cur2 = s2Cur || ah2 || default2 || defaultAtm || strikes[Math.min(1, strikes.length - 1)];
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
  if (!s2.value && strikes.length) s2.value = String(default2 || defaultAtm || strikes[0]);
  probSyncTypesUI();
}

async function probRefreshHist() {
  return window.historicosRefreshHmd?.();
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

function probClamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function probRatioHeatStyle(value, min, max) {
  if (!isFinite(value)) return null;
  if (!isFinite(min) || !isFinite(max) || max <= min) {
    return {
      bg: 'rgba(255,215,90,.14)',
      txt: 'var(--amber)',
      border: 'rgba(255,215,90,.35)',
    };
  }
  const t = probClamp01((value - min) / (max - min));
  // Cold -> warm badge colors.
  const hue = 220 - (220 - 18) * t;
  const sat = 82;
  return {
    bg: `hsla(${hue},${sat}%,50%,.16)`,
    txt: `hsl(${hue},90%,68%)`,
    border: `hsla(${hue},${sat}%,58%,.42)`,
  };
}

function probRatioBadgeHtml(value, min, max) {
  if (!isFinite(value)) return '--';
  const palette = probRatioHeatStyle(value, min, max);
  if (!palette) return fmtN(value, 3);
  return `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:74px;height:24px;padding:0 10px;border-radius:999px;background:${palette.bg};box-shadow:inset 0 0 0 1px ${palette.border};color:${palette.txt};text-shadow:0 1px 0 rgba(0,0,0,.10);font-size:12px;font-weight:700;white-space:nowrap">${fmtN(value, 3)}</span>`;
}

function probDecisionSignal(kind, p, thr) {
  // Returns { dotHtml, tip } or null
  if (p == null || !isFinite(p) || thr == null || !isFinite(thr)) return null;
  const lo = 1 - thr;
  if (kind === 'ratio') {
    if (p > thr) {
      return {
        dotHtml: `<span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:var(--blue);box-shadow:0 0 0 2px rgba(90,171,255,.18)"></span>`,
        tip: `ECDF Ratio > Umbral -> FRONT RATIO INVERTIDO (2x1)`,
      };
    }
    if (p < lo) {
      return {
        dotHtml: `<span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:var(--amber);box-shadow:0 0 0 2px rgba(232,184,75,.18)"></span>`,
        tip: `ECDF Ratio < (1-Umbral) -> RATIO SPREAD COMUN (1x2)`,
      };
    }
    return null;
  }
  if (kind === 'bull') {
    if (p < lo) {
      return {
        dotHtml: `<span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:var(--green);box-shadow:0 0 0 2px rgba(68,199,106,.18)"></span>`,
        tip: `ECDF Costo < (1-Umbral) -> LONG BULL CALL SPREAD`,
      };
    }
    if (p > thr) {
      return {
        dotHtml: `<span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:var(--red);box-shadow:0 0 0 2px rgba(240,90,90,.18)"></span>`,
        tip: `ECDF Costo > Umbral -> BEAR CALL SPREAD (credito)`,
      };
    }
    return null;
  }
  return null;
}

function probExtremeSignal(value, min, max) {
  if (!isFinite(value) || !isFinite(min) || !isFinite(max) || max <= min) return null;
  if (value === max) {
    return {
      dotHtml: `<span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:var(--red);box-shadow:0 0 0 2px rgba(240,90,90,.18)"></span>`,
      tip: 'Valor maximo',
    };
  }
  if (value === min) {
    return {
      dotHtml: `<span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:var(--green);box-shadow:0 0 0 2px rgba(68,199,106,.18)"></span>`,
      tip: 'Valor minimo',
    };
  }
  return null;
}

function renderProbabilidades() {
  probSyncDefaults();
  syncDateFromPicker('pr-date-from', null);
  syncDateFromPicker('pr-date-to', null);
  const body = document.getElementById('pr-body');
  const summary = document.getElementById('pr-summary');
  const hero = document.getElementById('pr-hero');
  const status = document.getElementById('pr-status');
  if (!body || !summary || !hero) return;

  probEnsureColsUI();
  probSyncTypesUI();
  const type1 = document.getElementById('pr-type1')?.value || 'call';
  const type2 = document.getElementById('pr-type2')?.value || 'call';
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

  const K1 = parseFloat(document.getElementById('pr-strike1')?.value) || 0;
  const K2 = parseFloat(document.getElementById('pr-strike2')?.value) || 0;
  const r = (parseFloat(document.getElementById('pr-rate')?.value || '0') || 0) / 100;
  const lots = parseFloat(document.getElementById('pr-lots')?.value || '100') || 100;
  const thrP = Math.max(0, Math.min(100, parseFloat(document.getElementById('pr-threshold')?.value || '80') || 80)) / 100;
  const q = ST.q || 0;
  const expiryStr = ST.selExpiry || document.getElementById('ah-expiry')?.value || '';
  const expiryMs = expiryStr ? new Date(expiryStr + 'T12:00:00').getTime() : null;
  const dateFrom = document.getElementById('pr-date-from')?.value.trim() || '';
  const dateTo = document.getElementById('pr-date-to')?.value.trim() || '';
  let source = HIST.rows;
  if (dateFrom) source = source.filter(rw => rw.date >= dateFrom);
  if (dateTo) source = source.filter(rw => rw.date <= dateTo);

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
    // LN Ratio is a day-over-day log return: LN(Ratio_T2 / Ratio_T1) -> ln(current / prev).
    const lnRatio = prev?.ratio && row.ratio ? Math.log(row.ratio / prev.ratio) : null;
    const lnDelta = prev?.delta && row.delta && Math.abs(prev.delta) > 0 && Math.abs(row.delta) > 0
      ? Math.log(Math.abs(prev.delta) / Math.abs(row.delta))
      : null;
    const lnVega = prev?.vega && row.vega && Math.abs(prev.vega) > 0 && Math.abs(row.vega) > 0
      ? Math.log(Math.abs(prev.vega) / Math.abs(row.vega))
      : null;
    // Excel reference: LN(Bull_T+1 / Bull_T). With rows in chronological order: ln(currentBull / prevBull).
    // If bull is <= 0 (or missing) LN is undefined -> null.
    const lnBull = prev?.bull != null && row.bull != null && prev.bull > 0 && row.bull > 0
      ? Math.log(row.bull / prev.bull)
      : null;
    return {
      ...row,
      lnRatio,
      lnDelta,
      lnVega,
      lnBull,
      probRatio: null,
      probDelta: null,
      probVega: null,
      probBull: null,
    };
  });

  const lnRows = PR.rows.slice(1);
  const lnRatioSeries = lnRows.map(rw => rw.lnRatio);
  const lnDeltaSeries = lnRows.map(rw => rw.lnDelta);
  const lnVegaSeries = lnRows.map(rw => rw.lnVega);
  const lnBullSeries = lnRows.map(rw => rw.lnBull);
  PR.rows.forEach((row, idx) => {
    if (idx === 0) {
      row.probRatio = null;
      row.probDelta = null;
      row.probVega = null;
      row.probBull = null;
      return;
    }
    row.probRatio = probRankPct(lnRatioSeries, row.lnRatio);
    row.probDelta = probRankPct(lnDeltaSeries, row.lnDelta);
    row.probVega = probRankPct(lnVegaSeries, row.lnVega);
    row.probBull = probRankPct(lnBullSeries, row.lnBull);
  });

  const latest = PR.rows[PR.rows.length - 1];
  const ratioValues = PR.rows.map(rw => rw.ratio).filter(v => isFinite(v));
  const ratioMin = ratioValues.length ? Math.min(...ratioValues) : null;
  const ratioMax = ratioValues.length ? Math.max(...ratioValues) : null;
  const costValues = PR.rows.map(rw => rw.cost).filter(v => isFinite(v));
  const costMin = costValues.length ? Math.min(...costValues) : null;
  const costMax = costValues.length ? Math.max(...costValues) : null;
  const bullValues = PR.rows.map(rw => rw.bull).filter(v => isFinite(v));
  const bullMin = bullValues.length ? Math.min(...bullValues) : null;
  const bullMax = bullValues.length ? Math.max(...bullValues) : null;

  // Pseudo-probabilities: count how often the daily log-return is positive (excluding the first row where LN is null).
  const lnRows2 = PR.rows.slice(1);
  const denom = Math.max(0, PR.rows.length - 1);
  const posBull = lnRows2.filter(rw => isFinite(rw.lnBull) && rw.lnBull > 0).length;
  const posRatio = lnRows2.filter(rw => isFinite(rw.lnRatio) && rw.lnRatio > 0).length;
  const pseudoBull = denom > 0 ? posBull / denom : null;
  const pseudoRC = denom > 0 ? posRatio / denom : null;

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

  // "Lectura actual": keep it focused (hide Delta/Vega/Straddle and ECDF Delta/Vega).
  const heroCards = [
    // Row 1
    ['Costo Bull Actual', latest.bull != null ? fmtN(latest.bull, 2) : '--', 'var(--green)'],
    ['ECDF Bull', probFmtPct(latest.probBull), 'var(--green)'],
    ['Ratio Actual', latest.ratio != null ? fmtN(latest.ratio, 2) : '--', 'var(--amber)'],
    ['ECDF Ratio', probFmtPct(latest.probRatio), 'var(--amber)'],
    // Row 2
    ['Muestra', `${PR.rows.length} ruedas`, 'var(--text)'],
    ['Positivos Bull', denom ? String(posBull) : '--', 'var(--green)', 'Cantidad de ruedas con LN Bull > 0'],
    ['Positivos Ratio', denom ? String(posRatio) : '--', 'var(--amber)', 'Cantidad de ruedas con LN Ratio > 0'],
    // Filler so row 2 stays at 3 cards (grid is 4 columns).
    ['__spacer__'],
    // Row 3
    ['Pseudo Bull', probFmtPct(pseudoBull), 'var(--green)', 'Positivos Bull / (Muestra - 1)'],
    ['Pseudo Bear', pseudoBull == null ? '--' : probFmtPct(1 - pseudoBull), 'var(--red)', '1 - Pseudo Bull'],
    ['Pseudo RC', probFmtPct(pseudoRC), 'var(--amber)', 'Positivos Ratio / (Muestra - 1)'],
    ['Pseudo RI', pseudoRC == null ? '--' : probFmtPct(1 - pseudoRC), 'var(--blue)', '1 - Pseudo RC'],
  ];

  hero.innerHTML = heroCards.map(card => {
    const [label, value, color, tip] = card;
    if (label === '__spacer__') return `<div style="pointer-events:none"></div>`;
    return `
      <div style="padding:12px;background:var(--surface2);border:1px solid var(--border2);border-radius:8px">
        <div ${tip ? `title="${String(tip).replace(/\"/g,'&quot;')}"` : ''} style="font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:5px">${label}</div>
        <div style="font-family:var(--mono);font-size:18px;color:${color};font-weight:600">${value}</div>
      </div>`;
  }).join('');

  const colKeys = visibleCols.map(c => c.key);
  const cell = (key, row) => {
    const deltaColor = row.delta == null ? 'var(--muted)' : row.delta >= 0 ? 'var(--green)' : 'var(--red)';
    const vegaColor = row.vega == null ? 'var(--muted)' : row.vega >= 0 ? 'var(--green)' : 'var(--red)';
    if (key === 'date') return { html: probFmtDate(row.date), style: 'color:var(--muted)' };
    if (key === 'spot') return { html: row.spot != null ? fmtN(row.spot, 0) : '--' };
    if (key === 'baseCall') return { html: row.baseCall != null ? fmtN(row.baseCall, 2) : '--' };
    if (key === 'basePut') return { html: row.basePut != null ? fmtN(row.basePut, 2) : '--' };
    if (key === 'ratio') {
      return {
        html: probRatioBadgeHtml(row.ratio, ratioMin, ratioMax),
      };
    }
    if (key === 'cost') {
      const sig = probExtremeSignal(row.cost, costMin, costMax);
      const dot = sig ? `<span title="${sig.tip}" style="display:inline-flex;align-items:center;margin-right:6px">${sig.dotHtml}</span>` : '';
      return { html: `${dot}${row.cost != null ? fmtN(row.cost, 2) : '--'}` };
    }
    if (key === 'bull') {
      const sig = probExtremeSignal(row.bull, bullMin, bullMax);
      const dot = sig ? `<span title="${sig.tip}" style="display:inline-flex;align-items:center;margin-right:6px">${sig.dotHtml}</span>` : '';
      return { html: `${dot}${row.bull != null ? fmtN(row.bull, 2) : '--'}` };
    }
    if (key === 'deltaCall') return { html: row.deltaCall != null ? fmtN(row.deltaCall, 4) : '--' };
    if (key === 'deltaPut') return { html: row.deltaPut != null ? fmtN(row.deltaPut, 4) : '--' };
    if (key === 'delta') return { html: row.delta != null ? fmtN(row.delta, 2) : '--', style: `color:${deltaColor}` };
    if (key === 'vegaCall') return { html: row.vegaCall != null ? fmtN(row.vegaCall, 4) : '--' };
    if (key === 'vegaPut') return { html: row.vegaPut != null ? fmtN(row.vegaPut, 4) : '--' };
    if (key === 'vega') return { html: row.vega != null ? fmtN(row.vega, 2) : '--', style: `color:${vegaColor}` };
    if (key === 'lnBull') return { html: probFmtLn(row.lnBull) };
    if (key === 'lnRatio') return { html: probFmtLn(row.lnRatio) };
    if (key === 'lnDelta') return { html: probFmtLn(row.lnDelta) };
    if (key === 'lnVega') return { html: probFmtLn(row.lnVega) };
    if (key === 'probRatio') {
      const sig = probDecisionSignal('ratio', row.probRatio, thrP);
      const dot = sig ? `<span title="${sig.tip}" style="display:inline-flex;align-items:center;margin-right:6px">${sig.dotHtml}</span>` : '';
      return { html: `${dot}${probFmtPct(row.probRatio)}` };
    }
    if (key === 'probDelta') return { html: probFmtPct(row.probDelta) };
    if (key === 'probVega') return { html: probFmtPct(row.probVega) };
    if (key === 'probBull') {
      const sig = probDecisionSignal('bull', row.probBull, thrP);
      const dot = sig ? `<span title="${sig.tip}" style="display:inline-flex;align-items:center;margin-right:6px">${sig.dotHtml}</span>` : '';
      return { html: `${dot}${probFmtPct(row.probBull)}` };
    }
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

