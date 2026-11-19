'use strict';

// ── Formateo ──────────────────────────────────────────────────────
const FMT2 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const FMT3 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

function fmt2(n)   { return isFinite(n) ? FMT2.format(n) : '—'; }
function fmt3(n)   { return isFinite(n) ? FMT3.format(n) : '—'; }
function fmtPct(n) { return isFinite(n) ? FMT2.format(n * 100) + '%' : '—'; }

function parseNum(s) {
  if (typeof s === 'number') return s;
  const str = String(s).trim().replace(/\$/g, '').replace(/\s/g, '');
  if (!str) return NaN;
  const hasComma = str.includes(',');
  const hasDot   = str.includes('.');
  if (hasComma && hasDot) {
    return str.lastIndexOf(',') > str.lastIndexOf('.')
      ? Number(str.replace(/\./g, '').replace(',', '.'))
      : Number(str.replace(/,/g, ''));
  }
  if (hasComma) return Number(str.replace(/\./g, '').replace(',', '.'));
  return Number(str);
}

function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

let _toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('est-toast');
  if (msg) el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ── Paleta de colores de estrategias ─────────────────────────────
const STRAT_COLORS = [
  '#58a6ff', '#3fb950', '#d29922', '#bc8cff',
  '#f85149', '#79c0ff', '#56d364', '#e3b341',
];

// ── Estado global ─────────────────────────────────────────────────
let estState = {
  rawPayload: null,
  historyByDate: [],
  filteredHistory: [],
  availableVencimientos: [],
  availableStrikes: [],
  selectedVenc: null,
  trades: [],        // { id, fecha, tipo, cant, base, prima }
  strategies: [],    // { id, name, color, tradeIds: [], closed, closeDate, closePrice }
  nextTradeId: 1,
  nextStratId: 1,
  results: null,
};

let estChart = null;

// ── Persistencia ─────────────────────────────────────────────────
const LS_KEY   = 'estrategias_v1';
const LS_CFG   = 'estrategias_cfg_v1';

function saveState() {
  localStorage.setItem(LS_KEY, JSON.stringify({
    trades:      estState.trades,
    strategies:  estState.strategies,
    nextTradeId: estState.nextTradeId,
    nextStratId: estState.nextStratId,
  }));
}

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null');
    if (!s) return;
    estState.trades      = s.trades      ?? [];
    estState.strategies  = s.strategies  ?? [];
    estState.nextTradeId = s.nextTradeId ?? 1;
    estState.nextStratId = s.nextStratId ?? 1;
  } catch (_) {}
}

function saveConfig() {
  const r        = parseNum(document.getElementById('est-r')?.value);
  const opexDate = document.getElementById('est-opex-date')?.value ?? '';
  const venc     = document.getElementById('est-venc')?.value ?? '';
  localStorage.setItem(LS_CFG, JSON.stringify({ r: isFinite(r) ? r : 0, opexDate, venc }));
}

function loadConfig() {
  try {
    const cfg = JSON.parse(localStorage.getItem(LS_CFG) ?? 'null');
    if (!cfg) return;
    const rEl = document.getElementById('est-r');
    if (rEl && cfg.r != null && isFinite(cfg.r)) rEl.value = cfg.r;
  } catch (_) {}
}

// ── Parseo de texto importado ────────────────────────────────────

function parseTipoStr(s) {
  const v = String(s).trim().toLowerCase();
  if (v === 'call' || v === 'c')           return 'call';
  if (v === 'put' || v === 'p')            return 'put';
  if (v === 'acc' || v === 'accion' || v === 'a' || v === 'acción') return 'acc';
  return null;
}

function parseDateStr(s) {
  const str = String(s).trim();
  // ISO: 2026-08-21
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // DD/MM/YYYY or DD-MM-YYYY (4-digit year)
  const m4 = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m4) return `${m4[3]}-${m4[2].padStart(2,'0')}-${m4[1].padStart(2,'0')}`;
  // DD/MM/YY or DD-MM-YY (2-digit year)
  const m2 = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (m2) {
    const yy = Number(m2[3]);
    const yyyy = yy <= 29 ? 2000 + yy : 1900 + yy;
    return `${yyyy}-${m2[2].padStart(2,'0')}-${m2[1].padStart(2,'0')}`;
  }
  return null;
}

// Intenta parsear formato multi-columna (CALL | PUT | ACC en bloques laterales)
// Formato esperado: FECHA TIPO CANT BASE PRIMA [BRUTO NETO] TIPO CANT BASE PRIMA [BRUTO NETO] ...
function tryParseMultiColumn(lines) {
  const trades = [];
  let currentFecha = null;

  for (const line of lines) {
    const cols = line.split(/\t/);
    if (cols.length < 5) continue;

    // Intentar detectar fecha en col 0
    const maybeDate = parseDateStr(cols[0]);
    if (maybeDate) currentFecha = maybeDate;

    // Buscar bloques de opciones en la misma fila
    // Columnas: [fecha?] TIPO CANT BASE PRIMA [BRUTO NETO] [TIPO CANT BASE PRIMA BRUTO NETO] ...
    // Detectamos grupos de cols donde cols[i] es tipo reconocible
    const colStart = maybeDate ? 1 : 0;
    let i = colStart;
    while (i < cols.length) {
      const tipo = parseTipoStr(cols[i]);
      if (tipo && i + 3 < cols.length) {
        const cant  = parseNum(cols[i + 1]);
        const base  = parseNum(cols[i + 2]);
        const prima = parseNum(cols[i + 3]);
        if (isFinite(cant) && cant !== 0 && isFinite(base) && isFinite(prima) && currentFecha) {
          trades.push({ id: null, fecha: currentFecha, tipo, cant, base, prima });
        }
        i += 4;
        // Skip BRUTO/NETO cols if they look numeric
        while (i < cols.length && isFinite(parseNum(cols[i]))) i++;
      } else {
        i++;
      }
    }
  }
  return trades;
}

// Parsea formato simple: una operacion por linea
// Fecha Tipo Cant Base Prima
function parseSimpleLines(lines) {
  const trades = [];
  let currentFecha = null;

  for (const line of lines) {
    const cols = line.trim().split(/\t|\s{2,}/);
    if (cols.length === 0 || !cols[0]) continue;

    // Si la primera col es una fecha
    const maybeDate = parseDateStr(cols[0]);
    if (maybeDate) {
      currentFecha = maybeDate;
      // Puede que el resto de la línea sea también una operación
      if (cols.length >= 5) {
        const tipo  = parseTipoStr(cols[1]);
        const cant  = parseNum(cols[2]);
        const base  = parseNum(cols[3]);
        const prima = parseNum(cols[4]);
        if (tipo && isFinite(cant) && cant !== 0 && isFinite(base) && isFinite(prima)) {
          trades.push({ id: null, fecha: currentFecha, tipo, cant, base, prima });
        }
      }
      continue;
    }

    // Sin fecha en col 0: Tipo Cant Base Prima
    if (cols.length >= 4 && currentFecha) {
      const tipo  = parseTipoStr(cols[0]);
      const cant  = parseNum(cols[1]);
      const base  = parseNum(cols[2]);
      const prima = parseNum(cols[3]);
      if (tipo && isFinite(cant) && cant !== 0 && isFinite(base) && isFinite(prima)) {
        trades.push({ id: null, fecha: currentFecha, tipo, cant, base, prima });
      }
    }
  }
  return trades;
}

function parseImportText(text) {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];

  // Intentar formato multi-columna primero (detectamos si hay múltiples tipos por línea)
  const multiResult = tryParseMultiColumn(lines);
  if (multiResult.length > 0) return multiResult;

  return parseSimpleLines(lines);
}

// ── CRUD de operaciones ──────────────────────────────────────────

function importTrades(newTrades) {
  for (const t of newTrades) {
    t.id = estState.nextTradeId++;
    estState.trades.push(t);
  }
  saveState();
  renderTradesTable();
  renderStrategiesPanel();
}

function removeTrade(id) {
  estState.trades = estState.trades.filter(t => t.id !== id);
  // Quitar de estrategias
  estState.strategies.forEach(s => {
    s.tradeIds = s.tradeIds.filter(tid => tid !== id);
  });
  saveState();
  renderTradesTable();
  renderStrategiesPanel();
}

function updateTrade(id, field, value) {
  const t = estState.trades.find(t => t.id === id);
  if (!t) return;
  t[field] = value;
  saveState();
}

// ── CRUD de estrategias ──────────────────────────────────────────

function addStrategy(name, color) {
  const id = estState.nextStratId++;
  estState.strategies.push({
    id,
    name: name || `Estrategia ${id}`,
    color: color || STRAT_COLORS[(id - 1) % STRAT_COLORS.length],
    tradeIds: [],
    closed: false,
    closeDate: null,
    closePrice: null,
  });
  saveState();
  renderStrategiesPanel();
  renderTradesTable();
}

function removeStrategy(id) {
  // Devolver los trades a "sin asignar"
  const s = estState.strategies.find(s => s.id === id);
  estState.strategies = estState.strategies.filter(s => s.id !== id);
  saveState();
  renderStrategiesPanel();
  renderTradesTable();
}

function assignTradeToStrategy(tradeId, stratId) {
  // Desasignar de cualquier estrategia anterior
  estState.strategies.forEach(s => {
    s.tradeIds = s.tradeIds.filter(id => id !== tradeId);
  });
  // Asignar a la nueva (0 = sin asignar)
  if (stratId !== 0) {
    const strat = estState.strategies.find(s => s.id === stratId);
    if (strat) strat.tradeIds.push(tradeId);
  }
  saveState();
  renderStrategiesPanel();
}

function closeStrategy(id, closeDate, closePrice) {
  const s = estState.strategies.find(s => s.id === id);
  if (!s) return;
  s.closed     = true;
  s.closeDate  = closeDate;
  s.closePrice = parseNum(closePrice);
  saveState();
  renderStrategiesPanel();
}

function reopenStrategy(id) {
  const s = estState.strategies.find(s => s.id === id);
  if (!s) return;
  s.closed = false; s.closeDate = null; s.closePrice = null;
  saveState();
  renderStrategiesPanel();
}

// ── Detección de patrón ──────────────────────────────────────────

function detectStrategyPattern(trades) {
  const optionTrades = trades.filter(t => t.tipo === 'call' || t.tipo === 'put');

  // Trade intradiario: compra y venta de la misma base (independiente del tipo)
  if (optionTrades.length >= 2) {
    const buyers  = optionTrades.filter(t => t.cant > 0);
    const sellers = optionTrades.filter(t => t.cant < 0);
    const allBases = [...new Set(optionTrades.map(t => t.base))];
    if (allBases.length === 1 && buyers.length > 0 && sellers.length > 0) {
      return 'Trade Intradiario';
    }
  }

  const calls = trades.filter(t => t.tipo === 'call');
  const puts  = trades.filter(t => t.tipo === 'put');

  function detect(legs, isCall) {
    if (legs.length < 2) return null;
    const buyers  = legs.filter(l => l.cant > 0);
    const sellers = legs.filter(l => l.cant < 0);
    if (buyers.length === 0 || sellers.length === 0) return null;

    const totalBuy  = buyers.reduce((s, l) => s + Math.abs(l.cant), 0);
    const totalSell = sellers.reduce((s, l) => s + Math.abs(l.cant), 0);
    const avgBuyBase  = buyers.reduce((s, l)  => s + l.base * Math.abs(l.cant), 0)  / totalBuy;
    const avgSellBase = sellers.reduce((s, l) => s + l.base * Math.abs(l.cant), 0) / totalSell;

    const lotesIguales  = Math.abs(totalBuy - totalSell) < 0.01;
    const masVendidos   = totalSell > totalBuy;
    const masComprados  = totalBuy  > totalSell;

    if (isCall) {
      if (lotesIguales  && avgBuyBase < avgSellBase) return 'Bull Call';
      if (lotesIguales  && avgBuyBase > avgSellBase) return 'Bear Call';
      if (masVendidos   && avgSellBase < avgBuyBase) return 'Ratio Invertido Call';
      if (masVendidos   && avgSellBase > avgBuyBase) return 'Ratio Común Call';
      if (masComprados  && avgBuyBase  < avgSellBase) return 'Ratio Compra Call';
      if (masComprados  && avgBuyBase  > avgSellBase) return 'Ratio Compra Inv Call';
    } else {
      if (lotesIguales  && avgBuyBase > avgSellBase) return 'Bear Put';
      if (lotesIguales  && avgBuyBase < avgSellBase) return 'Bull Put';
      if (masVendidos   && avgSellBase > avgBuyBase) return 'Ratio Invertido Put';
      if (masVendidos   && avgSellBase < avgBuyBase) return 'Ratio Común Put';
      if (masComprados  && avgBuyBase  > avgSellBase) return 'Ratio Compra Put';
      if (masComprados  && avgBuyBase  < avgSellBase) return 'Ratio Compra Inv Put';
    }
    return null;
  }

  const hasCalls = calls.length > 0;
  const hasPuts  = puts.length  > 0;

  const callPattern = hasCalls ? detect(calls, true)  : null;
  const putPattern  = hasPuts  ? detect(puts,  false) : null;

  if (callPattern && putPattern) return `${callPattern} / ${putPattern}`;
  if (callPattern && hasPuts)   return `${callPattern} / Ratio Put`;
  if (putPattern  && hasCalls)  return `${putPattern} / Ratio Call`;
  return callPattern ?? putPattern ?? null;
}

// ── Auto-agrupación ──────────────────────────────────────────────

// Agrupa un array de trades en clusters de fechas cercanas (dayWindow días entre fechas contiguas)
function clusterByDate(trades, dayWindow) {
  if (trades.length === 0) return [];
  const dates = [...new Set(trades.map(t => t.fecha))].sort();
  const dateClusters = [];
  let current = [dates[0]];

  for (let i = 1; i < dates.length; i++) {
    const diff = (new Date(dates[i]) - new Date(current[current.length - 1])) / 86400000;
    if (diff <= dayWindow) current.push(dates[i]);
    else { dateClusters.push(current); current = [dates[i]]; }
  }
  dateClusters.push(current);

  return dateClusters.map(batch => trades.filter(t => batch.includes(t.fecha)));
}

function autoGroupByDate() {
  if (estState.trades.length === 0) return;

  // Separar por tipo antes de clusterizar, con ventanas distintas
  // Calls: 2 días (suelen operar juntos); Puts: 10 días (más espaciados); ACC: 2 días
  const callGroups = clusterByDate(estState.trades.filter(t => t.tipo === 'call'), 2);
  const putGroups  = clusterByDate(estState.trades.filter(t => t.tipo === 'put'),  10);
  const accGroups  = clusterByDate(estState.trades.filter(t => t.tipo === 'acc'),  2);

  // Unir todos los grupos y ordenar por fecha de entrada más temprana
  const allGroups = [...callGroups, ...putGroups, ...accGroups]
    .filter(g => g.length > 0)
    .sort((a, b) => {
      const aMin = a.reduce((m, t) => t.fecha < m ? t.fecha : m, a[0].fecha);
      const bMin = b.reduce((m, t) => t.fecha < m ? t.fecha : m, b[0].fecha);
      return aMin.localeCompare(bMin);
    });

  estState.strategies = [];
  estState.nextStratId = 1;

  allGroups.forEach(tradesInGroup => {
    const pattern = detectStrategyPattern(tradesInGroup);
    const stratId = estState.nextStratId++;
    const color   = STRAT_COLORS[(stratId - 1) % STRAT_COLORS.length];
    estState.strategies.push({
      id: stratId,
      name: pattern ?? `Estrategia ${stratId}`,
      color,
      tradeIds: tradesInGroup.map(t => t.id),
      closed: false, closeDate: null, closePrice: null,
    });
  });

  saveState();
  renderTradesTable();
  renderStrategiesPanel();
  showToast(`${estState.strategies.length} estrategia(s) creadas por fecha.`);
}

function autoGroupByBase(dayWindow = 3) {
  if (estState.trades.length === 0) return;

  // Agrupar por base (strike), luego fusionar si están dentro de dayWindow días
  const byBase = new Map();
  for (const t of estState.trades) {
    const key = `${t.tipo}_${t.base}`;
    if (!byBase.has(key)) byBase.set(key, []);
    byBase.get(key).push(t);
  }

  // Fusionar grupos cuyas fechas se solapan dentro de dayWindow
  const groups = [];
  for (const [, trades] of byBase) {
    const dates = [...new Set(trades.map(t => t.fecha))].sort();
    // Ver si este grupo se solapa con alguno existente
    let merged = false;
    for (const g of groups) {
      const gDates = [...new Set(g.map(t => t.fecha))].sort();
      // Solapan si hay alguna fecha en ambos dentro de dayWindow
      const overlap = dates.some(d =>
        gDates.some(gd => Math.abs((new Date(d) - new Date(gd)) / 86400000) <= dayWindow)
      );
      if (overlap) { g.push(...trades); merged = true; break; }
    }
    if (!merged) groups.push([...trades]);
  }

  estState.strategies = [];
  estState.nextStratId = 1;

  groups.forEach(tradesInGroup => {
    const pattern = detectStrategyPattern(tradesInGroup);
    const stratId = estState.nextStratId++;
    const color   = STRAT_COLORS[(stratId - 1) % STRAT_COLORS.length];
    const name    = pattern ?? `Estrategia ${stratId}`;
    estState.strategies.push({
      id: stratId, name, color,
      tradeIds: tradesInGroup.map(t => t.id),
      closed: false, closeDate: null, closePrice: null,
    });
  });

  saveState();
  renderTradesTable();
  renderStrategiesPanel();
  showToast(`${estState.strategies.length} estrategia(s) creadas por base.`);
}

// ── Motor de cálculo ─────────────────────────────────────────────

function calcDTE(opexDateStr, currentDateStr) {
  const [oy, om, od] = opexDateStr.split('-').map(Number);
  const [cy, cm, cd] = currentDateStr.split('-').map(Number);
  return Math.max(0, Math.ceil((new Date(oy, om-1, od) - new Date(cy, cm-1, cd)) / 86400000));
}

function computeLegAt(trade, S, opexDateStr, fechaRaw, r, marketPrice) {
  const lotes100 = trade.cant * 100;

  if (trade.tipo === 'acc') {
    return { marketPrice: S, iv: NaN, sigma: NaN, pnl: (S - trade.prima) * trade.cant, delta: trade.cant, gamma: 0, vega: 0, theta: 0, missing: false };
  }

  const T      = calcDTE(opexDateStr, fechaRaw) / 365;
  const isCall = trade.tipo === 'call';

  if (T <= 0 || S <= 0) {
    const intrinsic = isCall ? Math.max(S - trade.base, 0) : Math.max(trade.base - S, 0);
    return { marketPrice: intrinsic, iv: NaN, sigma: 0.30, pnl: (intrinsic - trade.prima) * lotes100, delta: 0, gamma: 0, vega: 0, theta: 0, missing: false };
  }

  let iv = NaN;
  const mktValid = marketPrice > 0;
  if (mktValid) {
    iv = isCall ? impliedVol(S, trade.base, T, r, marketPrice) : impliedVolPut(S, trade.base, T, r, marketPrice);
    if (!isFinite(iv) || iv <= 0) iv = NaN;
  }

  let sigma;
  if (isFinite(iv)) {
    sigma = iv;
  } else {
    const entryIv = isCall ? impliedVol(S, trade.base, T, r, trade.prima) : impliedVolPut(S, trade.base, T, r, trade.prima);
    sigma = isFinite(entryIv) && entryIv > 0 ? entryIv : 0.30;
  }

  const bsPrice = isCall ? bsCall(S, trade.base, T, r, sigma) : bsPut(S, trade.base, T, r, sigma);
  const effPrice = mktValid ? marketPrice : bsPrice;

  const delta = isCall ? bsDelta(S, trade.base, T, r, sigma) : bsDeltaPut(S, trade.base, T, r, sigma);
  const gamma = bsGamma(S, trade.base, T, r, sigma);
  const vega  = bsVega(S, trade.base, T, r, sigma);
  const theta = isCall ? bsTheta(S, trade.base, T, r, sigma) : bsThetaPut(S, trade.base, T, r, sigma);

  return {
    marketPrice: effPrice,
    iv, sigma,
    pnl:   (effPrice - trade.prima) * lotes100,
    delta: delta * lotes100,
    gamma: gamma * lotes100,
    vega:  vega  * lotes100,
    theta: theta * lotes100,
    missing: !mktValid,
  };
}

function computeStrategyMetrics(strat, allTrades, historyByDate, opexDateStr, r) {
  const trades = allTrades.filter(t => strat.tradeIds.includes(t.id));
  if (trades.length === 0) return null;

  const entryDate = trades.reduce((min, t) => t.fecha < min ? t.fecha : min, trades[0].fecha);

  const sorted = historyByDate
    .filter(e => Number.isFinite(e.ggal) && e.ggal > 0 && e.fechaRaw >= entryDate)
    .sort((a, b) => a.fechaRaw.localeCompare(b.fechaRaw));

  const series = [];
  for (const entry of sorted) {
    // Si la estrategia está cerrada y ya pasamos la fecha de cierre, dejar P&L fijo
    if (strat.closed && strat.closeDate && entry.fechaRaw > strat.closeDate) {
      const last = series[series.length - 1];
      if (last) {
        series.push({
          ...last,
          fechaRaw: entry.fechaRaw,
          ggal: entry.ggal,
          dte: calcDTE(opexDateStr, entry.fechaRaw),
          locked: true,
        });
      }
      continue;
    }

    let totalPnl = 0, totalDelta = 0, totalGamma = 0, totalVega = 0, totalTheta = 0;
    const ivByStrike = {};

    for (const trade of trades) {
      if (trade.tipo === 'acc') {
        totalPnl   += (entry.ggal - trade.prima) * trade.cant;
        totalDelta += trade.cant;
        continue;
      }
      const sk = String(Math.round(trade.base));
      const mktRaw = trade.tipo === 'call' ? entry.calls?.[sk] : entry.puts?.[sk];
      const mktPrice = Number.isFinite(mktRaw) ? mktRaw : 0;
      const g = computeLegAt(trade, entry.ggal, opexDateStr, entry.fechaRaw, r, mktPrice);
      totalPnl   += g.pnl;
      totalDelta += g.delta;
      totalGamma += g.gamma;
      totalVega  += g.vega;
      totalTheta += g.theta;
      if (Number.isFinite(g.iv)) ivByStrike[`${trade.tipo}_${trade.base}`] = g.iv * 100;
    }

    series.push({
      fechaRaw: entry.fechaRaw, ggal: entry.ggal,
      dte: calcDTE(opexDateStr, entry.fechaRaw),
      totalPnl, totalDelta, totalGamma, totalVega, totalTheta,
      ivByStrike, locked: false,
    });
  }

  return { strat, trades, entryDate, series };
}

// Métricas de la tarjeta de estrategia (cálculo estático al momento de armado)
function computeCardMetrics(strat, allTrades, historyByDate) {
  const trades = allTrades.filter(t => strat.tradeIds.includes(t.id));
  if (trades.length === 0) return null;

  const calls = trades.filter(t => t.tipo === 'call');
  const puts  = trades.filter(t => t.tipo === 'put');
  const optionTrades = [...calls, ...puts];

  // Costo Armado: positivo = crédito, negativo = débito
  // −sum(cant * 100 * prima)  [cant negativa = vendido → contribuye positivo]
  const costoArmado = -optionTrades.reduce((s, t) => s + t.cant * 100 * t.prima, 0);

  // Separar compras y ventas
  const buyers  = optionTrades.filter(t => t.cant > 0);
  const sellers = optionTrades.filter(t => t.cant < 0);

  const totalBuyVol  = buyers.reduce((s, t) => s + Math.abs(t.cant), 0);
  const totalSellVol = sellers.reduce((s, t) => s + Math.abs(t.cant), 0);

  const primaComprada = totalBuyVol  > 0 ? buyers.reduce((s, t)  => s + t.prima * Math.abs(t.cant), 0) / totalBuyVol  : NaN;
  const primaVendida  = totalSellVol > 0 ? sellers.reduce((s, t) => s + t.prima * Math.abs(t.cant), 0) / totalSellVol : NaN;

  const ratioArmado = isFinite(primaComprada) && primaComprada > 0 ? primaVendida / primaComprada : NaN;
  const ratioLotes  = totalBuyVol > 0 ? totalSellVol / totalBuyVol : NaN;

  // Costo RC/RI: primaComprada*100 + primaVendida*(-100)*ratioLotes
  const costoRCRI = isFinite(primaComprada) && isFinite(primaVendida) && isFinite(ratioLotes)
    ? primaComprada * 100 + primaVendida * -100 * ratioLotes
    : NaN;

  // Buscar precio actual (último dato disponible)
  const entryDate = trades.reduce((min, t) => t.fecha < min ? t.fecha : min, trades[0].fecha);
  const sortedHistory = historyByDate
    .filter(e => Number.isFinite(e.ggal) && e.ggal > 0 && e.fechaRaw >= entryDate)
    .sort((a, b) => a.fechaRaw.localeCompare(b.fechaRaw));
  const lastEntry = sortedHistory[sortedHistory.length - 1];

  let costoDesarmado = NaN;
  let ratioActual = NaN;
  let currentBuyVol = 0, currentSellVol = 0;
  let currentBuyPrima = 0, currentSellPrima = 0;

  if (lastEntry) {
    const S = lastEntry.ggal;
    let cdTotal = 0;

    for (const t of optionTrades) {
      const sk = String(Math.round(t.base));
      const mktRaw = t.tipo === 'call' ? lastEntry.calls?.[sk] : lastEntry.puts?.[sk];
      const mktPrice = Number.isFinite(mktRaw) && mktRaw > 0 ? mktRaw : t.prima;

      cdTotal += t.cant > 0
        ? -mktPrice * Math.abs(t.cant) * 100
        :  mktPrice * Math.abs(t.cant) * 100;

      if (t.cant > 0) { currentBuyVol += Math.abs(t.cant); currentBuyPrima += mktPrice * Math.abs(t.cant); }
      else             { currentSellVol += Math.abs(t.cant); currentSellPrima += mktPrice * Math.abs(t.cant); }
    }

    costoDesarmado = cdTotal;
    const avgBuyNow  = currentBuyVol  > 0 ? currentBuyPrima  / currentBuyVol  : NaN;
    const avgSellNow = currentSellVol > 0 ? currentSellPrima / currentSellVol : NaN;
    ratioActual = isFinite(avgBuyNow) && avgBuyNow > 0 ? avgSellNow / avgBuyNow : NaN;
  }

  const resultado = isFinite(costoArmado) && isFinite(costoDesarmado)
    ? costoDesarmado - costoArmado
    : NaN;

  return {
    costoArmado, costoDesarmado, resultado,
    ratioArmado, ratioActual, ratioLotes, costoRCRI,
    primaComprada, primaVendida,
    entryDate, lastEntry,
    totalBuyVol, totalSellVol,
  };
}

// ── Render tabla de operaciones ──────────────────────────────────

function getTradeStrategy(tradeId) {
  return estState.strategies.find(s => s.tradeIds.includes(tradeId)) ?? null;
}

function renderTradesTable() {
  const tbody = document.getElementById('est-trades-tbody');
  if (!tbody) return;

  if (estState.trades.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="placeholder">Sin operaciones. Importá desde la planilla.</td></tr>`;
    return;
  }

  const sorted = [...estState.trades].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);

  const stratOptions = estState.strategies.map(s =>
    `<option value="${s.id}">${escHtml(s.name)}</option>`
  ).join('');

  let html = '';
  let lastDate = null;
  for (const t of sorted) {
    const isNewDate = t.fecha !== lastDate;
    lastDate = t.fecha;
    const strat = getTradeStrategy(t.id);
    const stratColor = strat ? strat.color : 'transparent';
    const stratBadge = strat
      ? `<span class="strat-badge" style="background:${strat.color}"></span>`
      : '';
    const tipoColor = t.tipo === 'call' ? '#3fb950' : t.tipo === 'put' ? '#f85149' : '#58a6ff';
    const cantColor = t.cant >= 0 ? '#3fb950' : '#f85149';

    html += `<tr data-trade-id="${t.id}" class="${isNewDate ? 'new-date-row' : ''}">
      <td style="color:#6e7681;white-space:nowrap">${isNewDate ? formatDate(t.fecha) : ''}</td>
      <td style="color:${tipoColor};font-weight:700;text-transform:uppercase">${escHtml(t.tipo)}</td>
      <td style="color:${cantColor};font-weight:600">${t.cant > 0 ? '+' : ''}${t.cant}</td>
      <td>${fmt2(t.base)}</td>
      <td>${fmt3(t.prima)}</td>
      <td>${stratBadge}
        <select class="trade-strat-sel" data-id="${t.id}" style="background:none;border:none;color:${strat ? strat.color : '#6e7681'};font-size:0.8rem;cursor:pointer;padding:0;font-family:inherit">
          <option value="0" ${!strat ? 'selected' : ''}>Sin asignar</option>
          ${estState.strategies.map(s => `<option value="${s.id}" ${strat?.id === s.id ? 'selected' : ''}>${escHtml(s.name)}</option>`).join('')}
        </select>
      </td>
      <td><button class="remove-trade-btn" data-id="${t.id}" title="Eliminar">×</button></td>
    </tr>`;
  }

  tbody.innerHTML = html;
}

// ── Render panel de estrategias ──────────────────────────────────

function renderStrategiesPanel() {
  const container = document.getElementById('est-strategies-list');
  if (!container) return;

  if (estState.strategies.length === 0) {
    container.innerHTML = '<p class="placeholder-text">Sin estrategias. Creá una o usá Auto-agrupar.</p>';
    return;
  }

  let html = '';
  for (const s of estState.strategies) {
    const trades = estState.trades.filter(t => s.tradeIds.includes(t.id));
    const legsSummary = trades.map(t =>
      `<span style="color:${t.tipo==='call'?'#3fb950':t.tipo==='put'?'#f85149':'#58a6ff'}">${t.tipo.toUpperCase()} ${t.cant > 0 ? '+' : ''}${t.cant} × ${fmt2(t.base)}</span>`
    ).join(' | ');

    const statusBadge = s.closed
      ? `<span class="status-badge closed">CERRADA</span>`
      : `<span class="status-badge open">ABIERTA</span>`;

    html += `<div class="strat-card-compact" data-strat-id="${s.id}" style="border-left:3px solid ${s.color}">
      <div class="strat-card-header">
        <span class="strat-color-dot" style="background:${s.color}"></span>
        <input class="strat-name-input" type="text" value="${escHtml(s.name)}" data-id="${s.id}" title="Editar nombre">
        ${statusBadge}
        <button class="btn-remove-strat" data-id="${s.id}" title="Eliminar estrategia">×</button>
      </div>
      <div class="strat-legs-summary">${legsSummary || '<span style="color:#6e7681">Sin operaciones asignadas</span>'}</div>
      ${s.closed
        ? `<div class="strat-close-info">Cerrada el ${formatDate(s.closeDate)} · Precio cierre: $${fmt2(s.closePrice)} <button class="btn-reopen" data-id="${s.id}">Reabrir</button></div>`
        : `<div class="strat-close-row">
            <input type="date" class="strat-close-date" data-id="${s.id}" placeholder="Fecha cierre">
            <input type="number" class="strat-close-price" data-id="${s.id}" placeholder="Precio cierre (neto)" step="0.01">
            <button class="btn-close-strat" data-id="${s.id}">Cerrar estrategia</button>
          </div>`
      }
    </div>`;
  }

  container.innerHTML = html;
}

// ── Render tarjetas de métricas ───────────────────────────────────

function renderStrategyCards(stratResults) {
  const container = document.getElementById('est-cards-container');
  if (!container) return;
  if (!stratResults || stratResults.length === 0) {
    container.innerHTML = '';
    return;
  }

  let html = '';
  for (const sr of stratResults) {
    const { strat } = sr;
    const m = computeCardMetrics(strat, estState.trades, estState.filteredHistory);
    if (!m) continue;

    const costoArmadoClass = m.costoArmado >= 0 ? 'positive' : 'negative';
    const costoDesarmadoClass = m.costoDesarmado >= 0 ? 'positive' : 'negative';
    const resultadoClass = m.resultado >= 0 ? 'positive' : 'negative';

    const lastPnl = sr.series.length > 0 ? sr.series[sr.series.length - 1].totalPnl : NaN;

    html += `<div class="strategy-card" style="border-top:3px solid ${strat.color}">
      <div class="card-title-row">
        <span class="card-color-dot" style="background:${strat.color}"></span>
        <strong>${escHtml(strat.name)}</strong>
        <span class="status-badge ${strat.closed ? 'closed' : 'open'}">${strat.closed ? 'CERRADA' : 'ABIERTA'}</span>
      </div>
      <div class="card-legs">
        ${estState.trades.filter(t => strat.tradeIds.includes(t.id)).map(t =>
          `<span class="leg-tag" style="border-color:${t.tipo==='call'?'#3fb950':t.tipo==='put'?'#f85149':'#58a6ff'}">
            ${t.tipo.toUpperCase()} ${t.cant>0?'+':''}${t.cant} × ${fmt2(t.base)} @ ${fmt3(t.prima)}
          </span>`
        ).join('')}
      </div>
      <div class="card-metrics-grid">
        <div class="metric-item">
          <span class="metric-label">Costo Armado</span>
          <span class="metric-value ${costoArmadoClass}">$${fmt2(m.costoArmado)}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Costo Desarmado</span>
          <span class="metric-value ${costoDesarmadoClass}">$${fmt2(m.costoDesarmado)}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Ratio Armado</span>
          <span class="metric-value">${fmt3(m.ratioArmado)}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Ratio Actual</span>
          <span class="metric-value">${fmt3(m.ratioActual)}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Ratio Lotes</span>
          <span class="metric-value">${fmt2(m.ratioLotes)}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Resultado</span>
          <span class="metric-value ${resultadoClass}">$${fmt2(m.resultado)}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Costo RC/RI (armado)</span>
          <span class="metric-value">${fmt2(m.costoRCRI)}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">P&amp;L Actual</span>
          <span class="metric-value ${lastPnl >= 0 ? 'positive' : 'negative'}">$${fmt2(lastPnl)}</span>
        </div>
      </div>
    </div>`;
  }

  container.innerHTML = html;
}

// ── Análisis (backtest multi-estrategia) ─────────────────────────

function runAnalysis() {
  const opexDate = document.getElementById('est-opex-date')?.value;
  const r_pct    = parseNum(document.getElementById('est-r')?.value);
  const r        = isFinite(r_pct) ? r_pct / 100 : 0;

  if (!opexDate) { showToast('Completá la fecha OPEX.'); return; }
  if (estState.strategies.length === 0) { showToast('Creá al menos una estrategia.'); return; }

  const stratResults = [];
  for (const strat of estState.strategies) {
    const result = computeStrategyMetrics(strat, estState.trades, estState.filteredHistory, opexDate, r);
    if (result) stratResults.push(result);
  }

  if (stratResults.length === 0) {
    showToast('No hay datos históricos para las estrategias definidas.');
    return;
  }

  estState.results = stratResults;

  // Construir serie "Total"
  const allDates = [...new Set(stratResults.flatMap(sr => sr.series.map(s => s.fechaRaw)))].sort();
  const totalSeries = allDates.map(fecha => {
    let totalPnl = 0, totalDelta = 0, totalGamma = 0, totalVega = 0, totalTheta = 0, ggal = NaN, dte = 0;
    for (const sr of stratResults) {
      const row = sr.series.find(s => s.fechaRaw === fecha);
      if (row) {
        totalPnl   += row.totalPnl;
        totalDelta += row.totalDelta;
        totalGamma += row.totalGamma;
        totalVega  += row.totalVega;
        totalTheta += row.totalTheta;
        ggal = row.ggal;
        dte  = row.dte;
      }
    }
    return { fechaRaw: fecha, ggal, dte, totalPnl, totalDelta, totalGamma, totalVega, totalTheta };
  });

  renderChart(stratResults, totalSeries);
  renderResultsTable(totalSeries);
  renderStrategyCards(stratResults);
  renderSummaryStrip(totalSeries);

  document.getElementById('est-results-section').style.display = '';
  document.getElementById('est-table-section').style.display   = '';
  document.getElementById('est-cards-section').style.display   = '';
  document.getElementById('est-results-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Chart ────────────────────────────────────────────────────────

function renderChart(stratResults, totalSeries) {
  const ctx = document.getElementById('est-chart-pnl')?.getContext('2d');
  if (!ctx) return;

  if (estChart) { estChart.destroy(); estChart = null; }

  // Etiquetas: unión de todas las fechas
  const labels = totalSeries.map(r => formatDate(r.fechaRaw));

  const datasets = [];

  // Una serie por estrategia
  for (const sr of stratResults) {
    const dateMap = new Map(sr.series.map(s => [s.fechaRaw, s.totalPnl]));
    datasets.push({
      label: sr.strat.name,
      data: totalSeries.map(r => dateMap.get(r.fechaRaw) ?? null),
      borderColor: sr.strat.color,
      backgroundColor: 'transparent',
      borderWidth: 1.8,
      pointRadius: 1.5,
      tension: 0.2,
      fill: false,
      spanGaps: false,
      yAxisID: 'y',
    });
  }

  // Serie total (dashed)
  datasets.push({
    label: 'Total',
    data: totalSeries.map(r => r.totalPnl),
    borderColor: '#ffffff',
    backgroundColor: 'transparent',
    borderWidth: 2.5,
    borderDash: [5, 4],
    pointRadius: 0,
    tension: 0.2,
    fill: false,
    yAxisID: 'y',
  });

  // GGAL como referencia (eje derecho)
  datasets.push({
    label: 'GGAL',
    data: totalSeries.map(r => r.ggal),
    borderColor: 'rgba(200,200,200,0.3)',
    borderWidth: 1,
    pointRadius: 0,
    tension: 0.2,
    fill: false,
    yAxisID: 'y2',
  });

  estChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#8b949e', font: { size: 11 } } },
        tooltip: { callbacks: { label: c => c.dataset.label + ': $' + FMT2.format(c.parsed.y) } }
      },
      scales: {
        x: { ticks: { color: '#6e7681', maxTicksLimit: 12 }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: {
          ticks: { color: '#6e7681', callback: v => '$' + FMT2.format(v) },
          grid:  { color: 'rgba(255,255,255,0.05)' },
          title: { display: true, text: 'P&L ($)', color: '#6e7681' },
        },
        y2: {
          position: 'right',
          ticks: { color: '#6e7681', callback: v => '$' + FMT2.format(v) },
          grid:  { drawOnChartArea: false },
          title: { display: true, text: 'GGAL ($)', color: '#6e7681' },
        },
      },
    },
  });
}

// ── Tabla de resultados ──────────────────────────────────────────

function renderResultsTable(totalSeries) {
  const tbody = document.getElementById('est-results-tbody');
  if (!tbody) return;
  tbody.innerHTML = totalSeries.map(r => `
    <tr>
      <td>${formatDate(r.fechaRaw)}</td>
      <td>$${fmt2(r.ggal)}</td>
      <td>${r.dte}</td>
      <td class="${r.totalPnl >= 0 ? 'positive' : 'negative'}">$${fmt2(r.totalPnl)}</td>
      <td>${fmt2(r.totalDelta)}</td>
      <td>${fmt2(r.totalGamma)}</td>
      <td>${fmt2(r.totalVega)}</td>
      <td>${fmt2(r.totalTheta)}</td>
    </tr>
  `).join('');
}

function renderSummaryStrip(totalSeries) {
  const first = totalSeries[0];
  const last  = totalSeries[totalSeries.length - 1];
  if (!first || !last) return;

  const pnl = last.totalPnl;
  const pnlEl = document.getElementById('est-sum-pnl');

  document.getElementById('est-sum-entry').textContent = formatDate(first.fechaRaw);
  document.getElementById('est-sum-last').textContent  = formatDate(last.fechaRaw);
  document.getElementById('est-sum-ggal').textContent  = '$' + fmt2(last.ggal);
  if (pnlEl) { pnlEl.textContent = '$' + fmt2(pnl); pnlEl.className = 'sum-value ' + (pnl >= 0 ? 'positive' : 'negative'); }
  document.getElementById('est-sum-strats').textContent = estState.strategies.length + ' estrategia(s)';
}

// ── Carga de datos históricos ────────────────────────────────────

async function loadHistoryData() {
  const statusEl = document.getElementById('est-status');
  const setStatus = msg => { if (statusEl) statusEl.textContent = msg; };

  try {
    estState.rawPayload = await loadHistoryPayload(setStatus);
    const parsed = parseHistoryPayload(estState.rawPayload);
    estState.availableVencimientos = parsed.availableVencimientos;

    if (parsed.availableVencimientos.length === 0) {
      setStatus('No se encontraron vencimientos.'); return;
    }

    populateVencSelect(parsed.availableVencimientos);
    onVencChange();
    setStatus('Listo.');
  } catch (err) {
    setStatus('Error: ' + err.message);
    console.error(err);
  }
}

function populateVencSelect(vencimientos) {
  const sel = document.getElementById('est-venc');
  if (!sel) return;
  sel.innerHTML = vencimientos.map(v =>
    `<option value="${v}">${VENCIMIENTO_LABELS[v] ?? v} (${v})</option>`
  ).join('');

  // Restaurar vencimiento guardado
  try {
    const cfg = JSON.parse(localStorage.getItem(LS_CFG) ?? 'null');
    if (cfg?.venc && vencimientos.includes(cfg.venc)) sel.value = cfg.venc;
  } catch (_) {}
}

function onVencChange() {
  const venc    = document.getElementById('est-venc')?.value;
  const opexEl  = document.getElementById('est-opex-date');
  if (!venc) return;

  estState.selectedVenc = venc;
  const parsed = parseHistoryPayload(estState.rawPayload, venc);
  estState.filteredHistory  = parsed.historyByDate;
  estState.availableStrikes = parsed.availableStrikes;

  const lastDate = parsed.historyByDate.slice(-1)[0]?.fechaRaw;
  const refYear  = lastDate ? Number(lastDate.slice(0, 4)) : new Date().getFullYear();
  const opexDate = opexDateForVencCode(venc, refYear) ?? opexDateForVencCode(venc, refYear + 1);
  if (opexDate && opexEl) opexEl.value = opexDate;

  saveConfig();
}

// ── Modal de importación ─────────────────────────────────────────

function openImportModal() {
  document.getElementById('est-import-modal').style.display = 'flex';
  document.getElementById('est-import-error').textContent = '';
  setTimeout(() => document.getElementById('est-import-textarea').focus(), 50);
}

function closeImportModal() {
  document.getElementById('est-import-modal').style.display = 'none';
  document.getElementById('est-import-textarea').value = '';
  document.getElementById('est-import-error').textContent = '';
}

function confirmImport() {
  const text = document.getElementById('est-import-textarea').value;
  const trades = parseImportText(text);
  if (trades.length === 0) {
    document.getElementById('est-import-error').textContent = 'No se encontraron operaciones válidas. Verificá el formato.';
    return;
  }
  closeImportModal();
  importTrades(trades);
  showToast(`${trades.length} operación(es) importadas.`);
}

// ── Modal nueva estrategia ───────────────────────────────────────

function openNewStratModal() {
  document.getElementById('est-new-strat-modal').style.display = 'flex';
  document.getElementById('est-new-strat-name').value = '';
  const nextColor = STRAT_COLORS[(estState.strategies.length) % STRAT_COLORS.length];
  document.getElementById('est-new-strat-color').value = nextColor;
  setTimeout(() => document.getElementById('est-new-strat-name').focus(), 50);
}

function closeNewStratModal() {
  document.getElementById('est-new-strat-modal').style.display = 'none';
}

function confirmNewStrat() {
  const name  = document.getElementById('est-new-strat-name').value.trim();
  const color = document.getElementById('est-new-strat-color').value;
  addStrategy(name, color);
  closeNewStratModal();
}

// ── Inicialización ───────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  loadState();
  renderTradesTable();
  renderStrategiesPanel();

  loadHistoryData();

  // Vencimiento
  document.getElementById('est-venc')?.addEventListener('change', () => { onVencChange(); saveConfig(); });
  document.getElementById('est-opex-date')?.addEventListener('change', saveConfig);
  document.getElementById('est-r')?.addEventListener('change', saveConfig);

  // Importar
  document.getElementById('est-import-btn')?.addEventListener('click', openImportModal);
  document.getElementById('est-import-cancel')?.addEventListener('click', closeImportModal);
  document.getElementById('est-import-close')?.addEventListener('click', closeImportModal);
  document.getElementById('est-import-confirm')?.addEventListener('click', confirmImport);

  // Limpiar operaciones
  document.getElementById('est-clear-trades')?.addEventListener('click', () => {
    if (estState.trades.length === 0) return;
    estState.trades = []; estState.strategies = [];
    estState.nextTradeId = 1; estState.nextStratId = 1;
    saveState();
    renderTradesTable();
    renderStrategiesPanel();
    showToast('Operaciones y estrategias eliminadas.');
  });

  // Nueva estrategia
  document.getElementById('est-new-strat-btn')?.addEventListener('click', openNewStratModal);
  document.getElementById('est-new-strat-cancel')?.addEventListener('click', closeNewStratModal);
  document.getElementById('est-new-strat-confirm')?.addEventListener('click', confirmNewStrat);
  document.getElementById('est-new-strat-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeNewStratModal();
  });

  // Auto-agrupar
  document.getElementById('est-autogroup-btn')?.addEventListener('click', () => {
    const mode = document.getElementById('est-autogroup-mode')?.value ?? 'fecha';
    if (mode === 'base') autoGroupByBase();
    else autoGroupByDate();
  });

  // Estrategias: nombre inline + eliminar + cerrar/reabrir
  document.getElementById('est-strategies-list')?.addEventListener('input', e => {
    if (e.target.classList.contains('strat-name-input')) {
      const id = Number(e.target.dataset.id);
      const s  = estState.strategies.find(s => s.id === id);
      if (s) { s.name = e.target.value; saveState(); renderTradesTable(); }
    }
  });

  document.getElementById('est-strategies-list')?.addEventListener('click', e => {
    const removeBtn = e.target.closest('.btn-remove-strat');
    if (removeBtn) { removeStrategy(Number(removeBtn.dataset.id)); return; }

    const closeBtn = e.target.closest('.btn-close-strat');
    if (closeBtn) {
      const id        = Number(closeBtn.dataset.id);
      const row       = closeBtn.closest('.strat-card-compact');
      const dateInput = row?.querySelector('.strat-close-date');
      const priceInput = row?.querySelector('.strat-close-price');
      const d = dateInput?.value;
      const p = priceInput?.value;
      if (!d || !p) { showToast('Completá fecha y precio de cierre.'); return; }
      closeStrategy(id, d, p);
      return;
    }

    const reopenBtn = e.target.closest('.btn-reopen');
    if (reopenBtn) { reopenStrategy(Number(reopenBtn.dataset.id)); return; }
  });

  // Trades table: asignación a estrategia + eliminar
  document.getElementById('est-trades-tbody')?.addEventListener('change', e => {
    if (e.target.classList.contains('trade-strat-sel')) {
      assignTradeToStrategy(Number(e.target.dataset.id), Number(e.target.value));
    }
  });

  document.getElementById('est-trades-tbody')?.addEventListener('click', e => {
    const btn = e.target.closest('.remove-trade-btn');
    if (btn) removeTrade(Number(btn.dataset.id));
  });

  // Ejecutar análisis
  document.getElementById('est-run-btn')?.addEventListener('click', runAnalysis);

  // Toggle tabla de resultados
  document.getElementById('est-table-toggle')?.addEventListener('click', () => {
    const body = document.getElementById('est-table-body');
    const btn  = document.getElementById('est-table-toggle');
    if (!body || !btn) return;
    const collapsed = body.style.display === 'none';
    body.style.display = collapsed ? '' : 'none';
    btn.textContent = collapsed ? '▼' : '▶';
  });

  // Reload datos
  document.getElementById('est-reload-btn')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('est-status');
    if (statusEl) statusEl.textContent = 'Descargando datos frescos…';
    try {
      estState.rawPayload = await fetchAndCacheHistoryPayload();
      const parsed = parseHistoryPayload(estState.rawPayload);
      estState.availableVencimientos = parsed.availableVencimientos;
      populateVencSelect(parsed.availableVencimientos);
      onVencChange();
      if (statusEl) statusEl.textContent = 'Datos actualizados.';
    } catch (err) {
      if (statusEl) statusEl.textContent = 'Error: ' + err.message;
    }
  });

  // Escape cierra modales
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeImportModal(); closeNewStratModal(); }
  });
});
