const CONFIG = {
  dataUrl: "https://script.google.com/macros/s/AKfycbzYrpSs7-4n9hL7SK15DeaDVbP8apabGGXQLVVf5h_u2kb3WB2xY5WpBBiD_N0bBGvX/exec?endpoint=history&sheet=HMD",
  liveUrl: "https://script.google.com/macros/s/AKfycbzYrpSs7-4n9hL7SK15DeaDVbP8apabGGXQLVVf5h_u2kb3WB2xY5WpBBiD_N0bBGvX/exec?endpoint=Live",
  storageKey: "panel-ggal-settings",
  dbName: "panel-ggal-cache",
  dbVersion: 1,
  dbStore: "datasets",
  dbKey: "history-HMD",
  defaultLotes: 100,
  defaultRelation: 1.6,
  defaultRateDays: 365,
  currentOpexDate: "2026-08-21",
  defaultAutoRefreshEnabled: false,
  defaultAutoRefreshSeconds: 7
};

const state = {
  historyByDate: [],
  liveEntry: null,
  availableStrikes: [],
  sourceStats: null,
  viewMode: "table",
  charts: {},
  autoRefreshEnabled: false,
  autoRefreshSeconds: 7,
  autoRefreshTimerId: null,
  countdownTimerId: null,
  nextRefreshAt: null,
  lastUpdatedAt: null,
  liveStatus: "Actualizando",
  panels: {
    configCollapsed: false,
    statusCollapsed: false,
    legendCollapsed: false
  },
  optionTypes: {
    base1: "call",
    base2: "call"
  }
};

const elements = {
  tableBody: document.getElementById("tableBody"),
  configCollapsedSummary: document.getElementById("configCollapsedSummary"),
  statusMessage: document.getElementById("statusMessage"),
  statusMetaMessage: document.getElementById("statusMetaMessage"),
  statusUpdateMessage: document.getElementById("statusUpdateMessage"),
  statusCollapsedSummary: document.getElementById("statusCollapsedSummary"),
  legendCollapsedSummary: document.getElementById("legendCollapsedSummary"),
  tableCard: document.querySelector(".table-card"),
  chartsSection: document.getElementById("chartsSection"),
  costoPrimaryHeader: document.getElementById("costoPrimaryHeader"),
  spreadHeader: document.getElementById("spreadHeader"),
  costoRiHeader: document.getElementById("costoRiHeader"),
  costoStraddleHeader: document.getElementById("costoStraddleHeader"),
  tableModeButton: document.getElementById("tableModeButton"),
  chartModeButton: document.getElementById("chartModeButton"),
  configCollapseButton: document.getElementById("configCollapseButton"),
  configPanelBody: document.getElementById("configPanelBody"),
  statusCollapseButton: document.getElementById("statusCollapseButton"),
  statusPanelBody: document.getElementById("statusPanelBody"),
  legendCollapseButton: document.getElementById("legendCollapseButton"),
  legendPanelBody: document.getElementById("legendPanelBody"),
  autoRefreshCheckbox: document.getElementById("autoRefreshCheckbox"),
  autoRefreshSecondsSelect: document.getElementById("autoRefreshSecondsSelect"),
  base1TypeButton: document.getElementById("base1TypeButton"),
  base2TypeButton: document.getElementById("base2TypeButton"),
  base1Header: document.getElementById("base1Header"),
  base2Header: document.getElementById("base2Header"),
  rateBase1Header: document.getElementById("rateBase1Header"),
  rateBase2Header: document.getElementById("rateBase2Header"),
  base1Select: document.getElementById("base1Select"),
  base2Select: document.getElementById("base2Select"),
  swapBasesButton: document.getElementById("swapBasesButton"),
  lotesInput: document.getElementById("lotesInput"),
  relationInput: document.getElementById("relationInput"),
  rateDaysInput: document.getElementById("rateDaysInput"),
  reloadButton: document.getElementById("reloadButton"),
  ratesChartCard: document.getElementById("ratesChartCard"),
  rateDiffChartCard: document.getElementById("rateDiffChartCard"),
  ratioChartCard: document.getElementById("ratioChartCard"),
  costoPrimaryChartCard: document.getElementById("costoPrimaryChartCard"),
  spreadChartCard: document.getElementById("spreadChartCard"),
  costoRiChartCard: document.getElementById("costoRiChartCard"),
  costoStraddleChartCard: document.getElementById("costoStraddleChartCard"),
  ratesChartTitle: document.getElementById("ratesChartTitle"),
  rateDiffChartTitle: document.getElementById("rateDiffChartTitle"),
  ratioChartTitle: document.getElementById("ratioChartTitle"),
  costoBullChartTitle: document.getElementById("costoBullChartTitle"),
  spreadChartTitle: document.getElementById("spreadChartTitle"),
  costoRiChartTitle: document.getElementById("costoRiChartTitle"),
  costoStraddleChartTitle: document.getElementById("costoStraddleChartTitle"),
  ratesChart: document.getElementById("ratesChart"),
  rateDiffChart: document.getElementById("rateDiffChart"),
  ratioChart: document.getElementById("ratioChart"),
  costoBullChart: document.getElementById("costoBullChart"),
  spreadChart: document.getElementById("spreadChart"),
  costoRiChart: document.getElementById("costoRiChart"),
  costoStraddleChart: document.getElementById("costoStraddleChart")
};

elements.tableModeButton.addEventListener("click", () => setViewMode("table"));
elements.chartModeButton.addEventListener("click", () => setViewMode("chart"));
elements.configCollapseButton.addEventListener("click", () => togglePanel("configCollapsed"));
elements.statusCollapseButton.addEventListener("click", () => togglePanel("statusCollapsed"));
elements.legendCollapseButton.addEventListener("click", () => togglePanel("legendCollapsed"));
elements.autoRefreshCheckbox.addEventListener("change", handleAutoRefreshSettingsChange);
elements.autoRefreshSecondsSelect.addEventListener("change", handleAutoRefreshSettingsChange);
elements.base1TypeButton.addEventListener("click", () => toggleOptionType(1));
elements.base2TypeButton.addEventListener("click", () => toggleOptionType(2));
elements.swapBasesButton.addEventListener("click", swapBases);
elements.base1Select.addEventListener("change", renderTable);
elements.base2Select.addEventListener("change", renderTable);
elements.lotesInput.addEventListener("input", renderTable);
elements.relationInput.addEventListener("change", handleRelationCommit);
elements.relationInput.addEventListener("blur", handleRelationCommit);
elements.rateDaysInput.addEventListener("input", renderTable);
elements.reloadButton.addEventListener("click", reloadSheetData);

applyStoredPanelStates();
loadSheetData();

async function loadSheetData() {
  setStatus("Cargando datos...");

  try {
    const cachedPayload = await readCachedPayload();

    if (cachedPayload) {
      try {
        hydrateFromPayload(cachedPayload, "local");
        state.lastUpdatedAt = new Date();
        state.liveStatus = "Actualizando";
        syncStatus();
        void loadLiveData();
        return;
      } catch (cacheError) {
        console.warn("Cache local invalida, se intentara fuente remota", cacheError);
      }
    }

    await fetchAndStoreRemoteData();
    void loadLiveData();
  } catch (error) {
    console.error(error);
    state.historyByDate = [];
    state.liveEntry = null;
    state.availableStrikes = [];
    state.sourceStats = null;
    renderTable();
    setStatus(`${error.message}.`, "");
  }
}

async function reloadSheetData() {
  setStatus("Recargando datos...");

  try {
    await clearCachedPayload();
    state.liveStatus = "Actualizando";
    await fetchAndStoreRemoteData();
    await loadLiveData();
  } catch (error) {
    console.error(error);
    state.liveStatus = "Error";
    syncStatus();
    setStatus(`${error.message}.`, "");
  }
}

async function fetchAndStoreRemoteData() {
  const response = await fetch(CONFIG.dataUrl, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`No se pudo leer la fuente online (${response.status})`);
  }

  const payload = await response.json();
  const parsed = parseHistoryPayload(payload);

  if (!parsed.historyByDate.length) {
    throw new Error("La fuente no devolvio filas utiles.");
  }

  await writeCachedPayload(payload);
  state.lastUpdatedAt = new Date();
  hydrateFromPayload(payload, "remoto");
}

function hydrateFromPayload(payload, sourceLabel) {
  const parsed = parseHistoryPayload(payload);

  if (!parsed.historyByDate.length) {
    throw new Error("La fuente no devolvio filas utiles.");
  }

  parsed.sourceStats.source = sourceLabel;
  state.historyByDate = parsed.historyByDate;
  state.liveEntry = null;
  state.availableStrikes = parsed.availableStrikes;
  state.sourceStats = parsed.sourceStats;
  applyStoredSettings();
  populateBaseSelectors();
  renderTable();
}

async function loadLiveData() {
  try {
    state.liveStatus = "Actualizando";
    syncStatus();
    const todayKey = getTodayDateKey();
    const alreadyCovered = state.historyByDate.some((entry) => entry.fechaRaw === todayKey);

    if (alreadyCovered) {
      state.liveEntry = null;
      state.lastUpdatedAt = new Date();
      state.liveStatus = "Ok";
      renderTable();
      return;
    }

    const response = await fetch(CONFIG.liveUrl, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`No se pudo leer la fuente live (${response.status})`);
    }

    const payload = await response.json();
    state.liveEntry = parseLivePayload(payload, todayKey, getLatestHistoricalGgal());
    state.lastUpdatedAt = new Date();
    state.liveStatus = "Ok";
    renderTable();
  } catch (error) {
    console.warn("No se pudo cargar la fila live", error);
    state.liveEntry = null;
    state.liveStatus = "Error";
    renderTable();
  }
}

function populateBaseSelectors() {
  const optionsHtml = state.availableStrikes
    .map((strike) => `<option value="${strike}">${formatNumber(strike, 0)}</option>`)
    .join("");

  elements.base1Select.innerHTML = optionsHtml;
  elements.base2Select.innerHTML = optionsHtml;

  const storedSettings = readStoredSettings();
  const fallbackDefaults = getComputedDefaults();

  setSelectValue(elements.base1Select, storedSettings.base1, fallbackDefaults.base1);
  setSelectValue(elements.base2Select, storedSettings.base2, fallbackDefaults.base2);
}

function setSelectValue(select, preferredValue, fallbackValue) {
  const candidates = [preferredValue, fallbackValue]
    .filter((value) => Number.isFinite(Number(value)))
    .map((value) => String(Math.round(Number(value))));

  const hasOptions = Array.from(select.options);

  for (const candidate of candidates) {
    if (hasOptions.some((option) => option.value === candidate)) {
      select.value = candidate;
      return;
    }
  }

  if (select.options.length > 0) {
    select.selectedIndex = Math.min(select.options.length - 1, select === elements.base2Select ? 1 : 0);
  }
}

function renderTable() {
  const lotes = clampInteger(elements.lotesInput.value, 1, 500, CONFIG.defaultLotes);
  const relation = clampDecimal(elements.relationInput.value, 0, 10, CONFIG.defaultRelation);
  const rateDays = clampInteger(elements.rateDaysInput.value, 1, 5000, CONFIG.defaultRateDays);
  const base1Strike = Number(elements.base1Select.value);
  const base2Strike = Number(elements.base2Select.value);
  const combinationMode = getCombinationMode();
  elements.rateDaysInput.value = String(rateDays);
  persistSettings({
    base1: base1Strike,
    base2: base2Strike,
    lotes,
    relation,
    rateDays
  });
  updateBaseHeaders(base1Strike, base2Strike);
  updateHeadersForMode(combinationMode);
  updateChartTitles(base1Strike, base2Strike, lotes, relation, combinationMode);
  syncCollapsedPanelSummaries(base1Strike, base2Strike, lotes, relation, rateDays);
  const rows = buildRowsByDate(state.historyByDate, base1Strike, base2Strike);
  const enrichedRows = rows.map((row) => addDerivedMetrics(row, lotes, relation, rateDays));
  const seriesStats = buildSeriesStats(enrichedRows);
  const rowsHtml = enrichedRows.map((row) => buildRowMarkup(row, seriesStats, combinationMode)).join("");
  renderCharts(enrichedRows, combinationMode);
  syncMetricVisibility(combinationMode);
  syncViewModeUi();
  syncStatus();

  elements.tableBody.innerHTML = rowsHtml || `
    <tr>
      <td colspan="${combinationMode === "straddle" ? "9" : "11"}" class="placeholder">No hay datos para mostrar todavia.</td>
    </tr>
  `;
}

function handleRelationCommit() {
  const relation = clampDecimal(elements.relationInput.value, 0, 10, CONFIG.defaultRelation);
  elements.relationInput.value = formatStoredRelation(relation);
  renderTable();
}

function updateBaseHeaders(base1Strike, base2Strike) {
  const base1Label = Number.isFinite(base1Strike) ? formatOptionLabel(state.optionTypes.base1, base1Strike, false) : "Base 1";
  const base2Label = Number.isFinite(base2Strike) ? formatOptionLabel(state.optionTypes.base2, base2Strike, false) : "Base 2";
  elements.base1Header.textContent = base1Label;
  elements.base2Header.textContent = base2Label;
  elements.rateBase1Header.textContent = Number.isFinite(base1Strike)
    ? `Tasa ${formatOptionLabel(state.optionTypes.base1, base1Strike)}`
    : "Tasa Base1";
  elements.rateBase2Header.textContent = Number.isFinite(base2Strike)
    ? `Tasa ${formatOptionLabel(state.optionTypes.base2, base2Strike)}`
    : "Tasa Base2";
}

function getCombinationMode() {
  const base1Type = state.optionTypes.base1;
  const base2Type = state.optionTypes.base2;

  if (base1Type !== base2Type) {
    return "straddle";
  }

  return base1Type === "put" ? "bear" : "bull";
}

function updateHeadersForMode(combinationMode) {
  elements.costoPrimaryHeader.textContent = combinationMode === "bear" ? "Costo Bear" : "Costo Bull";
}

function syncMetricVisibility(combinationMode) {
  const isStraddle = combinationMode === "straddle";

  elements.costoPrimaryHeader.hidden = isStraddle;
  elements.spreadHeader.hidden = isStraddle;
  elements.costoRiHeader.hidden = isStraddle;
  elements.costoStraddleHeader.hidden = !isStraddle;

  elements.costoPrimaryChartCard.hidden = isStraddle;
  elements.spreadChartCard.hidden = isStraddle;
  elements.costoRiChartCard.hidden = isStraddle;
  elements.costoStraddleChartCard.hidden = !isStraddle;
}

function buildRowsByDate(historyByDate, base1Strike, base2Strike) {
  if (!Number.isFinite(base1Strike) || !Number.isFinite(base2Strike)) {
    return [];
  }

  const base1Key = strikeKey(base1Strike);
  const base2Key = strikeKey(base2Strike);
  const base1TypeKey = state.optionTypes.base1 === "put" ? "puts" : "calls";
  const base2TypeKey = state.optionTypes.base2 === "put" ? "puts" : "calls";

  const rows = historyByDate
    .map((entry) => ({
      fechaRaw: entry.fechaRaw,
      fecha: formatDate(entry.fechaRaw),
      ggal: entry.ggal,
      isLive: false,
      daysToOpex: getDaysToOpex(entry.fechaRaw),
      strikeBase1: base1Strike,
      lastBase1: entry[base1TypeKey]?.[base1Key],
      strikeBase2: base2Strike,
      lastBase2: entry[base2TypeKey]?.[base2Key]
    }))
    .filter(isValidRow)
    .sort((left, right) => left.fechaRaw.localeCompare(right.fechaRaw));

  if (state.liveEntry && !rows.some((row) => row.fechaRaw === state.liveEntry.fechaRaw)) {
    const liveRow = {
      fechaRaw: state.liveEntry.fechaRaw,
      fecha: formatDate(state.liveEntry.fechaRaw),
      ggal: state.liveEntry.ggal,
      isLive: true,
      daysToOpex: getDaysToOpex(state.liveEntry.fechaRaw),
      strikeBase1: base1Strike,
      lastBase1: state.liveEntry[base1TypeKey]?.[base1Key],
      strikeBase2: base2Strike,
      lastBase2: state.liveEntry[base2TypeKey]?.[base2Key]
    };

    if (isValidRow(liveRow)) {
      rows.push(liveRow);
      rows.sort((left, right) => left.fechaRaw.localeCompare(right.fechaRaw));
    }
  }

  console.log("Filas renderizadas", rows.length, "bases", base1Strike, base2Strike);
  return rows;
}

function addDerivedMetrics(row, lotes, relation, rateDays) {
  const tasaBase1 = getAnnualizedBaseRate(row.strikeBase1, row.lastBase1, row.ggal, row.daysToOpex, rateDays);
  const tasaBase2 = getAnnualizedBaseRate(row.strikeBase2, row.lastBase2, row.ggal, row.daysToOpex, rateDays);
  const diferencialTasas = tasaBase2 - tasaBase1;
  const ratio = divide(row.lastBase1, row.lastBase2);
  const costoBull = (row.lastBase1 * lotes) - (row.lastBase2 * lotes);
  const spread = Math.abs(divide(costoBull, (row.strikeBase2 - row.strikeBase1) * lotes));
  const costoRi = (row.lastBase1 * lotes) - (row.lastBase2 * lotes * relation);
  const costoStraddle = row.lastBase1 + row.lastBase2;

  return {
    ...row,
    tasaBase1,
    tasaBase2,
    diferencialTasas,
    ratio,
    costoBull,
    spread,
    costoRi,
    costoStraddle
  };
}

function buildSeriesStats(rows) {
  return {
    tasaBase1: getMetricStats(rows.map((row) => row.tasaBase1)),
    tasaBase2: getMetricStats(rows.map((row) => row.tasaBase2)),
    diferencialTasas: getMetricStats(rows.map((row) => row.diferencialTasas)),
    ratio: getMetricStats(rows.map((row) => row.ratio)),
    costoBull: getMetricStats(rows.map((row) => row.costoBull)),
    spread: getMetricStats(rows.map((row) => row.spread)),
    costoRi: getMetricStats(rows.map((row) => row.costoRi)),
    costoStraddle: getMetricStats(rows.map((row) => row.costoStraddle))
  };
}

function getMetricStats(values) {
  const finiteValues = values.filter((value) => Number.isFinite(value));

  if (!finiteValues.length) {
    return { min: NaN, max: NaN, mean: NaN, median: NaN, nearestToMedian: NaN };
  }

  const mean = finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
  const sortedValues = [...finiteValues].sort((left, right) => left - right);
  const middleIndex = Math.floor(sortedValues.length / 2);
  const median = sortedValues.length % 2 === 0
    ? (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2
    : sortedValues[middleIndex];
  const nearestToMedian = finiteValues.reduce((closest, value) => {
    if (!Number.isFinite(closest)) {
      return value;
    }

    const currentDistance = Math.abs(value - median);
    const closestDistance = Math.abs(closest - median);
    return currentDistance < closestDistance ? value : closest;
  }, NaN);

  return {
    min: Math.min(...finiteValues),
    max: Math.max(...finiteValues),
    mean,
    median,
    nearestToMedian
  };
}

function buildRowMarkup(row, seriesStats, combinationMode) {
  const sharedCells = `
    <td>${renderDateCell(row)}</td>
    <td>${formatGroupedNumber(row.ggal, 2)}</td>
    <td>${formatNumber(row.lastBase1, 2)}</td>
    <td>${formatNumber(row.lastBase2, 2)}</td>
    <td>${renderMetricCell(formatPercent(row.tasaBase1), row.tasaBase1, seriesStats.tasaBase1)}</td>
    <td>${renderMetricCell(formatPercent(row.tasaBase2), row.tasaBase2, seriesStats.tasaBase2)}</td>
    <td>${renderMetricCell(formatPercent(row.diferencialTasas), row.diferencialTasas, seriesStats.diferencialTasas)}</td>
    <td>${renderMetricCell(formatNumber(row.ratio, 3), row.ratio, seriesStats.ratio)}</td>
  `;

  const metricCells = combinationMode === "straddle"
    ? `<td>${renderMetricCell(formatGroupedCurrency(row.costoStraddle), row.costoStraddle, seriesStats.costoStraddle)}</td>`
    : `
      <td>${renderMetricCell(formatGroupedCurrency(row.costoBull), row.costoBull, seriesStats.costoBull)}</td>
      <td>${renderMetricCell(formatPercent(row.spread), row.spread, seriesStats.spread)}</td>
      <td>${renderMetricCell(formatGroupedCurrency(row.costoRi), row.costoRi, seriesStats.costoRi)}</td>
    `;

  return `
    <tr class="${row.isLive ? "live-row" : ""}">
      ${sharedCells}
      ${metricCells}
    </tr>
  `;
}

function renderDateCell(row) {
  if (!row.isLive) {
    return escapeHtml(row.fecha);
  }

  return `
    <span class="live-date">
      <span class="live-badge">Live</span>
      <span>${escapeHtml(row.fecha)}</span>
    </span>
  `;
}

function renderMetricCell(label, value, stats) {
  const dot = renderMetricDot(value, stats);

  return `
    <div class="metric-cell">
      ${dot}
      <span>${label}</span>
    </div>
  `;
}

function renderMetricDot(value, stats) {
  const kind = getMetricExtreme(value, stats);

  if (!kind) {
    return "";
  }

  const color = kind === "min"
    ? "var(--dot-min)"
    : kind === "max"
      ? "var(--dot-max)"
      : "var(--dot-mid)";
  return `<span class="metric-dot" style="background:${color};"></span>`;
}

function getMetricExtreme(value, stats) {
  if (!Number.isFinite(value) || !Number.isFinite(stats.min) || !Number.isFinite(stats.max)) {
    return "";
  }

  const epsilon = 0.0000001;
  const matchesMin = Math.abs(value - stats.min) < epsilon;
  const matchesMax = Math.abs(value - stats.max) < epsilon;
  const matchesMean = Number.isFinite(stats.nearestToMedian) && Math.abs(value - stats.nearestToMedian) < epsilon;

  if (matchesMin) {
    return "min";
  }

  if (matchesMax) {
    return "max";
  }

  if (matchesMean) {
    return "mean";
  }

  return "";
}

function applyStoredSettings() {
  const storedSettings = readStoredSettings();
  state.viewMode = storedSettings.viewMode === "chart" ? "chart" : "table";
  state.autoRefreshEnabled = typeof storedSettings.autoRefreshEnabled === "boolean"
    ? storedSettings.autoRefreshEnabled
    : CONFIG.defaultAutoRefreshEnabled;
  state.autoRefreshSeconds = Number.isFinite(storedSettings.autoRefreshSeconds)
    ? clampInteger(storedSettings.autoRefreshSeconds, 5, 10, CONFIG.defaultAutoRefreshSeconds)
    : CONFIG.defaultAutoRefreshSeconds;
  state.panels.configCollapsed = storedSettings.configCollapsed === true;
  state.panels.statusCollapsed = storedSettings.statusCollapsed === true;
  state.panels.legendCollapsed = storedSettings.legendCollapsed === true;
  state.optionTypes.base1 = storedSettings.base1Type === "put" ? "put" : "call";
  state.optionTypes.base2 = storedSettings.base2Type === "put" ? "put" : "call";
  elements.lotesInput.value = Number.isFinite(storedSettings.lotes)
    ? String(storedSettings.lotes)
    : String(CONFIG.defaultLotes);
  elements.relationInput.value = Number.isFinite(storedSettings.relation)
    ? formatStoredRelation(storedSettings.relation)
    : formatStoredRelation(CONFIG.defaultRelation);
  elements.rateDaysInput.value = Number.isFinite(storedSettings.rateDays)
    ? String(clampInteger(storedSettings.rateDays, 1, 5000, CONFIG.defaultRateDays))
    : String(CONFIG.defaultRateDays);
  elements.autoRefreshCheckbox.checked = state.autoRefreshEnabled;
  elements.autoRefreshSecondsSelect.value = String(state.autoRefreshSeconds);
  updateAutoRefreshUi();
  syncOptionTypeUi();
  syncPanelUi();
  scheduleAutoRefresh();
}

function applyStoredPanelStates() {
  const storedSettings = readStoredSettings();
  state.panels.configCollapsed = storedSettings.configCollapsed === true;
  state.panels.statusCollapsed = storedSettings.statusCollapsed === true;
  state.panels.legendCollapsed = storedSettings.legendCollapsed === true;
  syncPanelUi();
}

function getComputedDefaults() {
  const latestEntry = state.historyByDate
    .slice()
    .sort((left, right) => left.fechaRaw.localeCompare(right.fechaRaw))
    .at(-1);

  const latestGgal = latestEntry?.ggal;
  const sortedStrikes = state.availableStrikes.slice().sort((left, right) => left - right);

  if (!sortedStrikes.length) {
    return { base1: NaN, base2: NaN };
  }

  let base1Index = 0;

  if (Number.isFinite(latestGgal)) {
    base1Index = sortedStrikes.reduce((closestIndex, strike, index) => {
      const currentDistance = Math.abs(strike - latestGgal);
      const closestDistance = Math.abs(sortedStrikes[closestIndex] - latestGgal);
      return currentDistance < closestDistance ? index : closestIndex;
    }, 0);
  }

  const base2Index = Math.min(sortedStrikes.length - 1, base1Index + 2);

  return {
    base1: sortedStrikes[base1Index],
    base2: sortedStrikes[base2Index]
  };
}

function getLatestHistoricalGgal() {
  const latestEntry = state.historyByDate
    .slice()
    .sort((left, right) => left.fechaRaw.localeCompare(right.fechaRaw))
    .at(-1);

  return latestEntry?.ggal;
}

function readStoredSettings() {
  try {
    const rawValue = window.localStorage.getItem(CONFIG.storageKey);

    if (!rawValue) {
      return {};
    }

    const parsed = JSON.parse(rawValue);
    return {
      base1: Number(parsed.base1),
      base2: Number(parsed.base2),
      lotes: Number(parsed.lotes),
      relation: Number(parsed.relation),
      rateDays: Number(parsed.rateDays),
      viewMode: parsed.viewMode,
      autoRefreshEnabled: parsed.autoRefreshEnabled,
      autoRefreshSeconds: Number(parsed.autoRefreshSeconds),
      base1Type: parsed.base1Type,
      base2Type: parsed.base2Type,
      configCollapsed: parsed.configCollapsed,
      statusCollapsed: parsed.statusCollapsed,
      legendCollapsed: parsed.legendCollapsed
    };
  } catch (error) {
    console.warn("No se pudo leer localStorage", error);
    return {};
  }
}

function persistSettings(settings) {
  try {
    window.localStorage.setItem(CONFIG.storageKey, JSON.stringify({
      ...settings,
      viewMode: state.viewMode,
      autoRefreshEnabled: state.autoRefreshEnabled,
      autoRefreshSeconds: state.autoRefreshSeconds,
      base1Type: state.optionTypes.base1,
      base2Type: state.optionTypes.base2,
      configCollapsed: state.panels.configCollapsed,
      statusCollapsed: state.panels.statusCollapsed,
      legendCollapsed: state.panels.legendCollapsed
    }));
  } catch (error) {
    console.warn("No se pudo guardar localStorage", error);
  }
}

function setViewMode(mode) {
  state.viewMode = mode === "chart" ? "chart" : "table";
  syncViewModeUi();
  persistSettings({
    base1: Number(elements.base1Select.value),
    base2: Number(elements.base2Select.value),
    lotes: clampInteger(elements.lotesInput.value, 1, 500, CONFIG.defaultLotes),
    relation: clampDecimal(elements.relationInput.value, 0, 10, CONFIG.defaultRelation),
    rateDays: clampInteger(elements.rateDaysInput.value, 1, 5000, CONFIG.defaultRateDays)
  });
}

function setOptionType(baseNumber, optionType) {
  if (baseNumber === 1) {
    state.optionTypes.base1 = optionType === "put" ? "put" : "call";
  } else {
    state.optionTypes.base2 = optionType === "put" ? "put" : "call";
  }

  syncOptionTypeUi();
  renderTable();
}

function swapBases() {
  const base1Value = elements.base1Select.value;
  const base2Value = elements.base2Select.value;
  const base1Type = state.optionTypes.base1;
  const base2Type = state.optionTypes.base2;

  elements.base1Select.value = base2Value;
  elements.base2Select.value = base1Value;
  state.optionTypes.base1 = base2Type;
  state.optionTypes.base2 = base1Type;

  syncOptionTypeUi();
  renderTable();
}

function toggleOptionType(baseNumber) {
  const currentType = baseNumber === 1 ? state.optionTypes.base1 : state.optionTypes.base2;
  setOptionType(baseNumber, currentType === "call" ? "put" : "call");
}

function syncOptionTypeUi() {
  updateOptionTypeButton(elements.base1TypeButton, state.optionTypes.base1);
  updateOptionTypeButton(elements.base2TypeButton, state.optionTypes.base2);
}

function updateOptionTypeButton(button, optionType) {
  const normalizedType = optionType === "put" ? "put" : "call";
  button.textContent = normalizedType === "put" ? "Put" : "Call";
  button.classList.toggle("is-call", normalizedType === "call");
  button.classList.toggle("is-put", normalizedType === "put");
}

function handleAutoRefreshSettingsChange() {
  state.autoRefreshEnabled = elements.autoRefreshCheckbox.checked;
  state.autoRefreshSeconds = clampInteger(elements.autoRefreshSecondsSelect.value, 5, 10, CONFIG.defaultAutoRefreshSeconds);
  elements.autoRefreshSecondsSelect.value = String(state.autoRefreshSeconds);
  updateAutoRefreshUi();
  scheduleAutoRefresh();
  persistSettings({
    base1: Number(elements.base1Select.value),
    base2: Number(elements.base2Select.value),
    lotes: clampInteger(elements.lotesInput.value, 1, 500, CONFIG.defaultLotes),
    relation: clampDecimal(elements.relationInput.value, 0, 10, CONFIG.defaultRelation),
    rateDays: clampInteger(elements.rateDaysInput.value, 1, 5000, CONFIG.defaultRateDays)
  });
  syncStatus();
}

function updateAutoRefreshUi() {
  elements.autoRefreshSecondsSelect.disabled = !state.autoRefreshEnabled;
}

function togglePanel(panelKey) {
  state.panels[panelKey] = !state.panels[panelKey];
  syncPanelUi();
  persistSettings({
    base1: Number(elements.base1Select.value),
    base2: Number(elements.base2Select.value),
    lotes: clampInteger(elements.lotesInput.value, 1, 500, CONFIG.defaultLotes),
    relation: clampDecimal(elements.relationInput.value, 0, 10, CONFIG.defaultRelation),
    rateDays: clampInteger(elements.rateDaysInput.value, 1, 5000, CONFIG.defaultRateDays)
  });
}

function syncPanelUi() {
  syncSinglePanel(elements.configCollapseButton, elements.configPanelBody, state.panels.configCollapsed);
  syncSinglePanel(elements.statusCollapseButton, elements.statusPanelBody, state.panels.statusCollapsed);
  syncSinglePanel(elements.legendCollapseButton, elements.legendPanelBody, state.panels.legendCollapsed);
}

function syncSinglePanel(button, body, collapsed) {
  button.setAttribute("aria-expanded", String(!collapsed));
  body.hidden = collapsed;
  button.closest("section")?.classList.toggle("is-collapsed", collapsed);

  if (body === elements.statusPanelBody) {
    elements.statusCollapsedSummary.hidden = !collapsed;
  }

  if (body === elements.configPanelBody) {
    elements.configCollapsedSummary.hidden = !collapsed;
  }

  if (body === elements.legendPanelBody) {
    elements.legendCollapsedSummary.hidden = !collapsed;
  }
}

function scheduleAutoRefresh() {
  if (state.autoRefreshTimerId) {
    window.clearInterval(state.autoRefreshTimerId);
    state.autoRefreshTimerId = null;
  }

  if (state.countdownTimerId) {
    window.clearInterval(state.countdownTimerId);
    state.countdownTimerId = null;
  }

  if (!state.autoRefreshEnabled) {
    state.nextRefreshAt = null;
    syncStatus();
    return;
  }

  state.nextRefreshAt = new Date(Date.now() + (state.autoRefreshSeconds * 1000));
  state.autoRefreshTimerId = window.setInterval(() => {
    state.nextRefreshAt = new Date(Date.now() + (state.autoRefreshSeconds * 1000));
    void loadLiveData();
  }, state.autoRefreshSeconds * 1000);

  state.countdownTimerId = window.setInterval(() => {
    syncStatus();
  }, 1000);

  syncStatus();
}

function syncViewModeUi() {
  const isChart = state.viewMode === "chart";
  elements.tableModeButton.classList.toggle("is-active", !isChart);
  elements.chartModeButton.classList.toggle("is-active", isChart);
  elements.tableModeButton.setAttribute("aria-selected", String(!isChart));
  elements.chartModeButton.setAttribute("aria-selected", String(isChart));
  elements.tableCard.hidden = isChart;
  elements.chartsSection.hidden = !isChart;
}

function updateChartTitles(base1Strike, base2Strike, lotes, relation, combinationMode) {
  const base1Label = Number.isFinite(base1Strike) ? formatOptionLabel(state.optionTypes.base1, base1Strike) : "Base1";
  const base2Label = Number.isFinite(base2Strike) ? formatOptionLabel(state.optionTypes.base2, base2Strike) : "Base2";
  const relationFactor = lotes * relation;
  const lotesLabel = Number.isFinite(lotes) ? Math.round(lotes) : 0;
  const relationLabel = Number.isFinite(relationFactor) ? formatCompactNumber(relationFactor, 2) : "0";
  const primaryCostLabel = combinationMode === "bear" ? "Costo Bear" : "Costo Bull";

  elements.ratesChartTitle.textContent = `Tasas ${base1Label} y ${base2Label}`;
  elements.rateDiffChartTitle.textContent = `Dif. Tasas ${base2Label} - ${base1Label}`;
  elements.ratioChartTitle.textContent = `Ratio ${base1Label}/${base2Label}`;
  elements.costoBullChartTitle.textContent = `${primaryCostLabel} ${base1Label}/${base2Label}`;
  elements.spreadChartTitle.textContent = `Spread % ${base1Label}/${base2Label}`;
  elements.costoRiChartTitle.textContent = `Costo RI ${base1Label}/${base2Label} (-${lotesLabel}*${relationLabel})`;
  elements.costoStraddleChartTitle.textContent = `Costo Straddle ${base1Label}/${base2Label}`;
}

function renderCharts(rows, combinationMode) {
  renderDualLineChart("rates", elements.ratesChart, rows, {
    title: elements.ratesChartTitle.textContent,
    yTickFormatter: (value) => formatPercent(value),
    labelFormatter: (value) => formatPercent(value),
    series: [
      {
        key: "tasaBase1",
        title: elements.rateBase1Header.textContent,
        color: "#4cb3ff",
        valueAccessor: (row) => row.tasaBase1
      },
      {
        key: "tasaBase2",
        title: elements.rateBase2Header.textContent,
        color: "#ff9f43",
        valueAccessor: (row) => row.tasaBase2
      }
    ]
  });

  renderLineChart("rateDiff", elements.rateDiffChart, rows, {
    title: elements.rateDiffChartTitle.textContent,
    color: "#ff6b8a",
    valueAccessor: (row) => row.diferencialTasas,
    labelFormatter: (value) => formatPercent(value),
    yTickFormatter: (value) => formatPercent(value)
  });

  renderLineChart("ratio", elements.ratioChart, rows, {
    title: elements.ratioChartTitle.textContent,
    color: "#f0c24b",
    valueAccessor: (row) => row.ratio,
    labelFormatter: (value) => formatNumber(value, 3),
    yTickFormatter: (value) => formatNumber(value, 3)
  });

  renderLineChart("costoBull", elements.costoBullChart, rows, {
    title: elements.costoBullChartTitle.textContent,
    color: "#4cb3ff",
    valueAccessor: (row) => row.costoBull,
    labelFormatter: (value) => formatGroupedCurrency(value),
    yTickFormatter: (value) => formatGroupedNumber(value, 2)
  });

  renderLineChart("spread", elements.spreadChart, rows, {
    title: elements.spreadChartTitle.textContent,
    color: "#19c37d",
    valueAccessor: (row) => row.spread,
    labelFormatter: (value) => formatPercent(value),
    yTickFormatter: (value) => formatPercent(value)
  });

  renderLineChart("costoRi", elements.costoRiChart, rows, {
    title: elements.costoRiChartTitle.textContent,
    color: "#b388ff",
    valueAccessor: (row) => row.costoRi,
    labelFormatter: (value) => formatGroupedCurrency(value),
    yTickFormatter: (value) => formatGroupedNumber(value, 2)
  });

  renderLineChart("costoStraddle", elements.costoStraddleChart, rows, {
    title: elements.costoStraddleChartTitle.textContent,
    color: "#ff8a4c",
    valueAccessor: (row) => row.costoStraddle,
    labelFormatter: (value) => formatGroupedCurrency(value),
    yTickFormatter: (value) => formatGroupedNumber(value, 2)
  });

  if (combinationMode !== "straddle") {
    destroyChart("costoStraddle");
  }

  if (combinationMode === "straddle") {
    destroyChart("costoBull");
    destroyChart("spread");
    destroyChart("costoRi");
  }
}

function renderLineChart(chartKey, canvas, rows, config) {
  const points = rows
    .map((row) => ({
      label: formatChartDate(row.fecha),
      value: config.valueAccessor(row),
      isLive: row.isLive
    }))
    .filter((point) => Number.isFinite(point.value));

  if (!points.length) {
    destroyChart(chartKey);
    return;
  }

  destroyChart(chartKey);

  const stats = getMetricStats(points.map((point) => point.value));
  const specialIndices = {
    min: points.findIndex((point) => isClose(point.value, stats.min)),
    max: points.findIndex((point) => isClose(point.value, stats.max)),
    mean: points.findIndex((point) => isClose(point.value, stats.nearestToMedian))
  };
  const liveIndex = points.findIndex((point) => point.isLive);
  const lastSessionIndex = liveIndex === -1 && points.length ? points.length - 1 : -1;

  state.charts[chartKey] = new Chart(canvas, {
    type: "line",
    data: {
      labels: points.map((point) => point.label),
      datasets: [
        {
          label: `${config.title} mediana`,
          data: points.map(() => stats.median),
          borderColor: "rgba(255, 255, 255, 0.75)",
          borderWidth: 1.5,
          borderDash: [6, 6],
          pointRadius: 0,
          pointHoverRadius: 0,
          pointHitRadius: 7,
          fill: false,
          tension: 0,
          order: 0
        },
        {
          label: config.title,
          data: points.map((point) => point.value),
          borderColor: config.color,
          backgroundColor: withAlphaFromHex(config.color, 0.18),
          borderWidth: 2,
          segment: {
            borderDash: (context) => getLiveSegmentBorderDash(context, liveIndex)
          },
          tension: 0.28,
          fill: false,
          pointRadius: (context) => getChartPointRadius(context.dataIndex, specialIndices, liveIndex, lastSessionIndex),
          pointHoverRadius: (context) => Math.max(5, getChartPointRadius(context.dataIndex, specialIndices, liveIndex, lastSessionIndex) + 1),
          pointBorderWidth: (context) => isHighlightedPoint(context.dataIndex, specialIndices, liveIndex, lastSessionIndex) ? 2 : 0,
          pointBorderColor: "#d8e6ff",
          pointBackgroundColor: (context) => getChartPointColor(context.dataIndex, specialIndices, liveIndex, lastSessionIndex),
          spanGaps: true,
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "nearest",
        intersect: false
      },
      layout: {
        padding: {
          left: 10,
          right: 22,
          top: 10
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          backgroundColor: "#111c29",
          borderColor: "rgba(116, 150, 189, 0.22)",
          borderWidth: 1,
          titleColor: "#eaf2ff",
          bodyColor: "#c7d7ef",
          callbacks: {
            label: (context) => context.datasetIndex === 0
              ? `Mediana: ${config.labelFormatter(context.parsed.y)}`
              : config.labelFormatter(context.parsed.y)
          }
        }
      },
      animation: false,
      scales: {
        x: {
          offset: true,
          ticks: {
            color: "#8ea7c6",
            autoSkip: false,
            maxRotation: 45,
            minRotation: 45
          },
          grid: {
            color: "rgba(116, 150, 189, 0.08)"
          },
          border: {
            color: "rgba(116, 150, 189, 0.18)"
          }
        },
        y: {
          grace: "10%",
          ticks: {
            color: "#8ea7c6",
            callback: (_, index, ticks) => {
              const tick = ticks[index];
              return config.yTickFormatter(Number(tick.value));
            }
          },
          grid: {
            color: "rgba(116, 150, 189, 0.12)"
          },
          border: {
            color: "rgba(116, 150, 189, 0.18)"
          }
        }
      }
    },
    plugins: [createPointLabelPlugin(chartKey, points, specialIndices, config, liveIndex, lastSessionIndex)]
  });
}

function renderDualLineChart(chartKey, canvas, rows, config) {
  const labels = rows.map((row) => formatChartDate(row.fecha));
  const liveIndex = rows.findIndex((row) => row.isLive);
  const lastSessionIndex = liveIndex === -1 && rows.length ? rows.length - 1 : -1;
  const seriesEntries = config.series.map((series) => {
    const values = rows.map((row) => series.valueAccessor(row));
    const stats = getMetricStats(values);
    const specialIndices = {
      min: values.findIndex((value) => isClose(value, stats.min)),
      max: values.findIndex((value) => isClose(value, stats.max)),
      mean: values.findIndex((value) => isClose(value, stats.nearestToMedian))
    };

    return {
      ...series,
      values,
      stats,
      specialIndices
    };
  });

  if (!seriesEntries.some((series) => series.values.some((value) => Number.isFinite(value)))) {
    destroyChart(chartKey);
    return;
  }

  destroyChart(chartKey);

  const datasets = [];

  seriesEntries.forEach((series, index) => {
    datasets.push({
      label: `${series.title} mediana`,
      data: series.values.map(() => series.stats.median),
      borderColor: withAlphaFromHex(series.color, 0.6),
      borderWidth: 1.25,
      borderDash: [6, 6],
      pointRadius: 0,
      pointHoverRadius: 0,
      pointHitRadius: 7,
      fill: false,
      tension: 0,
      spanGaps: true,
      order: index * 2
    });

    datasets.push({
      label: series.title,
      data: series.values,
      borderColor: series.color,
      backgroundColor: withAlphaFromHex(series.color, 0.18),
      borderWidth: 2,
      segment: {
        borderDash: (context) => getLiveSegmentBorderDash(context, liveIndex)
      },
      tension: 0.28,
      fill: false,
      pointRadius: (context) => getChartPointRadius(context.dataIndex, series.specialIndices, liveIndex, lastSessionIndex),
      pointHoverRadius: (context) => Math.max(5, getChartPointRadius(context.dataIndex, series.specialIndices, liveIndex, lastSessionIndex) + 1),
      pointBorderWidth: (context) => isHighlightedPoint(context.dataIndex, series.specialIndices, liveIndex, lastSessionIndex) ? 2 : 0,
      pointBorderColor: "#d8e6ff",
      pointBackgroundColor: (context) => getChartPointColor(context.dataIndex, series.specialIndices, liveIndex, lastSessionIndex),
      spanGaps: true,
      order: (index * 2) + 1
    });
  });

  state.charts[chartKey] = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "nearest",
        intersect: false
      },
      layout: {
        padding: {
          left: 10,
          right: 22,
          top: 10
        }
      },
      plugins: {
        legend: {
          display: true,
          labels: {
            color: "#c7d7ef",
            filter: (item) => !item.text.includes(" mediana")
          }
        },
        tooltip: {
          displayColors: true,
          backgroundColor: "#111c29",
          borderColor: "rgba(116, 150, 189, 0.22)",
          borderWidth: 1,
          titleColor: "#eaf2ff",
          bodyColor: "#c7d7ef",
          callbacks: {
            label: (context) => {
              const isMedian = context.dataset.label.includes(" mediana");
              const cleanLabel = context.dataset.label.replace(" mediana", "");
              return isMedian
                ? `${cleanLabel} mediana: ${config.labelFormatter(context.parsed.y)}`
                : `${cleanLabel}: ${config.labelFormatter(context.parsed.y)}`;
            }
          }
        }
      },
      animation: false,
      scales: {
        x: {
          offset: true,
          ticks: {
            color: "#8ea7c6",
            autoSkip: false,
            maxRotation: 45,
            minRotation: 45
          },
          grid: {
            color: "rgba(116, 150, 189, 0.08)"
          },
          border: {
            color: "rgba(116, 150, 189, 0.18)"
          }
        },
        y: {
          grace: "10%",
          ticks: {
            color: "#8ea7c6",
            callback: (_, index, ticks) => {
              const tick = ticks[index];
              return config.yTickFormatter(Number(tick.value));
            }
          },
          grid: {
            color: "rgba(116, 150, 189, 0.12)"
          },
          border: {
            color: "rgba(116, 150, 189, 0.18)"
          }
        }
      }
    },
    plugins: [createDualPointLabelPlugin(chartKey, rows, seriesEntries, config, liveIndex, lastSessionIndex)]
  });
}

function destroyChart(chartKey) {
  if (state.charts[chartKey]) {
    state.charts[chartKey].destroy();
    delete state.charts[chartKey];
  }
}

function getChartPointRadius(index, specialIndices, liveIndex, lastSessionIndex) {
  if (isHighlightedPoint(index, specialIndices, liveIndex, lastSessionIndex)) {
    return 5;
  }

  return 2.5;
}

function getChartPointColor(index, specialIndices, liveIndex, lastSessionIndex) {
  if (index === specialIndices.min) {
    return "#39a0ff";
  }

  if (index === specialIndices.max) {
    return "#e14d4d";
  }

  if (index === specialIndices.mean) {
    return "#f0c24b";
  }

  if (index === liveIndex) {
    return "#22c55e";
  }

  if (index === lastSessionIndex) {
    return "#a78bfa";
  }

  return "rgba(216, 230, 255, 0.55)";
}

function isSpecialPoint(index, specialIndices) {
  return [specialIndices.min, specialIndices.max, specialIndices.mean].includes(index);
}

function isHighlightedPoint(index, specialIndices, liveIndex, lastSessionIndex) {
  return isSpecialPoint(index, specialIndices) || index === liveIndex || index === lastSessionIndex;
}

function getLiveSegmentBorderDash(context, liveIndex) {
  return liveIndex > 0 && context.p1DataIndex === liveIndex ? [6, 6] : undefined;
}

function withAlphaFromHex(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexToRgb(hex) {
  const sanitized = hex.replace("#", "");
  const normalized = sanitized.length === 3
    ? sanitized.split("").map((char) => char + char).join("")
    : sanitized;

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
}

function isClose(left, right) {
  return Math.abs(left - right) < 0.0000001;
}

function createPointLabelPlugin(chartKey, points, specialIndices, config, liveIndex, lastSessionIndex) {
  return {
    id: `pointLabels-${chartKey}`,
    afterDatasetsDraw(chart) {
      const datasetMeta = chart.getDatasetMeta(1);

      if (!datasetMeta || !datasetMeta.data) {
        return;
      }

      const ctx = chart.ctx;
      ctx.save();
      ctx.font = "12px Barlow, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";

      datasetMeta.data.forEach((element, index) => {
        if (!isHighlightedPoint(index, specialIndices, liveIndex, lastSessionIndex)) {
          return;
        }

        const point = points[index];
        const label = config.labelFormatter(point.value);
        const placement = chooseSpecialLabelPlacement(chart, element, label, ctx);
        const kind = index === specialIndices.min
          ? "min"
          : index === specialIndices.max
            ? "max"
            : index === specialIndices.mean
              ? "mean"
              : index === liveIndex
                ? "live"
                : "last";

        ctx.fillStyle = kind === "min"
          ? "#39a0ff"
          : kind === "max"
            ? "#ff7b7b"
            : kind === "mean"
              ? "#f0c24b"
              : kind === "live"
                ? "#22c55e"
                : "#a78bfa";
        ctx.textAlign = placement.align;
        ctx.textBaseline = placement.baseline;
        ctx.fillText(label, placement.x, placement.y);
      });

      ctx.restore();
    }
  };
}

function createDualPointLabelPlugin(chartKey, rows, seriesEntries, config, liveIndex, lastSessionIndex) {
  return {
    id: `pointLabels-${chartKey}`,
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      ctx.save();
      ctx.font = "12px Barlow, sans-serif";

      seriesEntries.forEach((series, seriesIndex) => {
        const datasetMeta = chart.getDatasetMeta((seriesIndex * 2) + 1);

        if (!datasetMeta || !datasetMeta.data) {
          return;
        }

        datasetMeta.data.forEach((element, index) => {
          const value = series.values[index];

          if (!Number.isFinite(value) || !isHighlightedPoint(index, series.specialIndices, liveIndex, lastSessionIndex)) {
            return;
          }

          const label = config.labelFormatter(value);
          const placement = chooseSpecialLabelPlacement(chart, element, label, ctx);
          const kind = index === series.specialIndices.min
            ? "min"
            : index === series.specialIndices.max
              ? "max"
              : index === series.specialIndices.mean
                ? "mean"
                : index === liveIndex
                  ? "live"
                  : "last";

          ctx.fillStyle = kind === "min"
            ? "#39a0ff"
            : kind === "max"
              ? "#ff7b7b"
              : kind === "mean"
                ? "#f0c24b"
                : kind === "live"
                  ? "#22c55e"
                  : "#a78bfa";
          ctx.textAlign = placement.align;
          ctx.textBaseline = placement.baseline;
          ctx.fillText(label, placement.x, placement.y);
        });
      });

      ctx.restore();
    }
  };
}

function chooseSpecialLabelPlacement(chart, element, label, ctx) {
  const chartArea = chart.chartArea;
  const textWidth = ctx.measureText(label).width;
  const horizontalPadding = 12;
  const isNearTop = element.y < chartArea.top + 24;
  const verticalOffset = isNearTop ? 18 : 10;
  const minX = chartArea.left + horizontalPadding;
  const maxX = chartArea.right - horizontalPadding;
  const y = isNearTop ? element.y + verticalOffset : element.y - verticalOffset;
  const baseline = isNearTop ? "top" : "bottom";

  if (element.x + (textWidth / 2) > chartArea.right - 4) {
    return {
      x: maxX,
      y,
      align: "right",
      baseline
    };
  }

  if (element.x - (textWidth / 2) < chartArea.left + 4) {
    return {
      x: minX,
      y,
      align: "left",
      baseline
    };
  }

  return {
    x: element.x,
    y,
    align: "center",
    baseline
  };
}

function chooseMeanLabelPlacement(chart, elementsList, meanPoint, label, ctx) {
  const chartArea = chart.chartArea;
  const metrics = measureChartBadge(ctx, label);
  const offsetY = meanPoint.y < chartArea.top + 32 ? 20 : -20;
  const candidateY = meanPoint.y + offsetY;
  const candidates = [
    { x: chartArea.right - 10, y: candidateY, align: "right" },
    { x: chartArea.left + 10, y: candidateY, align: "left" },
    { x: (chartArea.left + chartArea.right) / 2, y: candidateY, align: "center" },
    { x: chartArea.right - 10, y: meanPoint.y - offsetY, align: "right" }
  ];

  let bestCandidate = candidates[0];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const rect = getBadgeRect(candidate, metrics);
    const overlapScore = elementsList.reduce((score, element) => {
      if (!element) {
        return score;
      }

      const padding = 10;
      const pointRect = {
        left: element.x - padding,
        right: element.x + padding,
        top: element.y - padding,
        bottom: element.y + padding
      };

      return score + (rectanglesOverlap(rect, pointRect) ? 1 : 0);
    }, 0);

    if (overlapScore < bestScore) {
      bestScore = overlapScore;
      bestCandidate = candidate;
    }

    if (overlapScore === 0) {
      return candidate;
    }
  }

  return bestCandidate;
}

function drawChartBadge(ctx, options) {
  const metrics = measureChartBadge(ctx, options.text);
  const rect = getBadgeRect(options, metrics);
  const textX = rect.left + ((rect.right - rect.left) / 2);
  const textY = rect.top + ((rect.bottom - rect.top) / 2);

  ctx.save();
  ctx.fillStyle = options.fillStyle;
  ctx.strokeStyle = options.strokeStyle;
  ctx.lineWidth = 1;
  roundRectPath(ctx, rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top, 8);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = options.textColor;
  ctx.fillText(options.text, textX, textY);
  ctx.restore();
}

function measureChartBadge(ctx, text) {
  const paddingX = 8;
  const paddingY = 5;
  const textWidth = ctx.measureText(text).width;

  return {
    width: textWidth + (paddingX * 2),
    height: 20
  };
}

function getBadgeRect(position, metrics) {
  let left = position.x;

  if (position.align === "right") {
    left = position.x - metrics.width;
  } else if (position.align === "center") {
    left = position.x - (metrics.width / 2);
  }

  return {
    left,
    right: left + metrics.width,
    top: position.y - (metrics.height / 2),
    bottom: position.y + (metrics.height / 2)
  };
}

function rectanglesOverlap(leftRect, rightRect) {
  return !(
    leftRect.right < rightRect.left ||
    leftRect.left > rightRect.right ||
    leftRect.bottom < rightRect.top ||
    leftRect.top > rightRect.bottom
  );
}

function roundRectPath(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

function formatStoredRelation(value) {
  return new Intl.NumberFormat("es-AR", {
    useGrouping: false,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(value);
}

function syncStatus() {
  if (!state.historyByDate.length) {
    return;
  }

  const totalRows = buildRowsByDate(state.historyByDate, Number(elements.base1Select.value), Number(elements.base2Select.value)).length;
  const totalFechas = state.sourceStats?.totalDates ?? totalRows;
  const sourceText = state.sourceStats?.source === "local" ? "cache local" : state.sourceStats?.source === "remote" ? "fuente remota" : "datos disponibles";
  const refreshText = state.autoRefreshEnabled
    ? `Auto-refresh activo cada ${state.autoRefreshSeconds}s (proxima en ${formatCountdown()})`
    : "Auto-refresh manual";
  const liveStatusText = `Estado Live: ${renderStatusState(state.liveStatus)}`;
  const updatedText = state.lastUpdatedAt
    ? `Ultima actualizacion: ${formatTime(state.lastUpdatedAt)}`
    : "Ultima actualizacion: -";
  const collapsedStatusText = renderStatusState(getCollapsedStatusLabel());
  const collapsedCountdown = state.autoRefreshEnabled ? formatCountdown() : "-";
  const collapsedSummary = `Estado: ${collapsedStatusText} | ${collapsedCountdown} | Ultimo: ${state.lastUpdatedAt ? formatTime(state.lastUpdatedAt) : "-"}`;

  setStatus(
    `Se cargaron ${totalRows} filas. Fechas detectadas: ${totalFechas}. Origen: ${sourceText}.`,
    `${refreshText}. ${liveStatusText}.`,
    updatedText,
    collapsedSummary
  );
}

function formatTime(value) {
  const date = value instanceof Date ? value : new Date(value);

  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

function getCollapsedStatusLabel() {
  return state.liveStatus;
}

function formatCountdown() {
  if (!state.autoRefreshEnabled || !state.nextRefreshAt) {
    return "-";
  }

  const remainingMs = state.nextRefreshAt.getTime() - Date.now();

  if (remainingMs <= 0) {
    return "0s";
  }

  return `${Math.ceil(remainingMs / 1000)}s`;
}

function parseHistoryPayload(payload) {
  if (!payload || !Array.isArray(payload.values) || payload.values.length < 2) {
    return {
      historyByDate: [],
      availableStrikes: [],
      sourceStats: { totalRows: 0, totalDates: 0 }
    };
  }

  const strikes = new Set();
  const byDate = new Map();
  let totalRows = 0;

  payload.values.slice(1).forEach((rawRow) => {
    const row = normalizeSourceRow(rawRow);

    if (!row) {
      return;
    }

    totalRows += 1;

    if (!byDate.has(row.fechaRaw)) {
      byDate.set(row.fechaRaw, {
        fechaRaw: row.fechaRaw,
        ggal: NaN,
        calls: {},
        puts: {}
      });
    }

    const entry = byDate.get(row.fechaRaw);

    if (row.isUnderlying) {
      entry.ggal = row.last;
    }

    if (row.isCall && Number.isFinite(row.strike)) {
      const key = strikeKey(row.strike);
      entry.calls[key] = row.last;
      strikes.add(row.strike);
      return;
    }

    if (row.isPut && Number.isFinite(row.strike)) {
      const key = strikeKey(row.strike);
      entry.puts[key] = row.last;
      strikes.add(row.strike);
    }
  });

  return {
    historyByDate: Array.from(byDate.values()),
    availableStrikes: Array.from(strikes).sort((left, right) => left - right),
    sourceStats: {
      totalRows,
      totalDates: byDate.size,
      source: "remote"
    }
  };
}

function normalizeSourceRow(rawRow) {
  const fechaRaw = String(rawRow[0] ?? "").trim();
  const especie = String(rawRow[1] ?? "").trim();
  const last = parseLocaleNumber(rawRow[2]);
  const strike = parseLocaleNumber(rawRow[4]);
  const type = String(rawRow[5] ?? "").trim().toLowerCase();

  if (!fechaRaw || !especie || !Number.isFinite(last)) {
    return null;
  }

  return {
    fechaRaw,
    especie,
    type,
    strike,
    last,
    isUnderlying: especie === "GGAL" || type === "subyacente",
    isCall: type === "call",
    isPut: type === "put"
  };
}

function parseLivePayload(payload, todayKey, fallbackGgal) {
  const rows = Array.isArray(payload?.values)
    ? payload.values
    : Array.isArray(payload)
      ? payload
      : [];

  const calls = {};
  const puts = {};
  let liveGgal = Number.isFinite(fallbackGgal) ? fallbackGgal : NaN;

  rows.forEach((rawRow, index) => {
    if (!Array.isArray(rawRow)) {
      return;
    }

    if (index === 0 && String(rawRow[0] ?? "").trim().toUpperCase() === "STRIKE") {
      return;
    }

    const strike = parseLocaleNumber(rawRow[0]);
    const type = String(rawRow[1] ?? "").trim().toLowerCase();
    const last = parseLocaleNumber(rawRow[4]);

    if (type === "call" && Number.isFinite(strike) && Number.isFinite(last)) {
      calls[strikeKey(strike)] = last;
      return;
    }

    if (type === "put" && Number.isFinite(strike) && Number.isFinite(last)) {
      puts[strikeKey(strike)] = last;
      return;
    }

    if (!Number.isFinite(strike) && Number.isFinite(last) && !Number.isFinite(liveGgal)) {
      liveGgal = last;
    }
  });

  if (!Object.keys(calls).length && !Object.keys(puts).length) {
    return null;
  }

  return {
    fechaRaw: todayKey,
    ggal: liveGgal,
    calls,
    puts
  };
}

function strikeKey(value) {
  return String(Math.round(Number(value)));
}

function isValidRow(row) {
  return row.fecha && Number.isFinite(row.ggal) && Number.isFinite(row.strikeBase1) &&
    Number.isFinite(row.lastBase1) && Number.isFinite(row.strikeBase2) && Number.isFinite(row.lastBase2);
}

function getAnnualizedBaseRate(strike, optionPrice, ggal, daysToOpex, rateDays) {
  if (!Number.isFinite(strike) || !Number.isFinite(optionPrice) || !Number.isFinite(ggal) ||
    !Number.isFinite(daysToOpex) || !Number.isFinite(rateDays) || ggal === 0 || daysToOpex <= 0) {
    return NaN;
  }

  const baseExtrinsic = divide((strike + optionPrice) - ggal, ggal);
  return baseExtrinsic * divide(rateDays, daysToOpex);
}

function parseLocaleNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : NaN;
  }

  if (typeof value !== "string") {
    return Number.isFinite(value) ? value : NaN;
  }

  const sanitized = value
    .replace(/\$/g, "")
    .replace(/\s/g, "")
    .trim();

  if (!sanitized) {
    return NaN;
  }

  const hasComma = sanitized.includes(",");
  const hasDot = sanitized.includes(".");

  if (hasComma && hasDot) {
    const lastComma = sanitized.lastIndexOf(",");
    const lastDot = sanitized.lastIndexOf(".");

    if (lastComma > lastDot) {
      return Number(sanitized.replace(/\./g, "").replace(/,/g, "."));
    }

    return Number(sanitized.replace(/,/g, ""));
  }

  if (hasComma) {
    return Number(sanitized.replace(/\./g, "").replace(/,/g, "."));
  }

  return Number(sanitized);
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const [year, month, day] = String(value).split("-");

  if (!year || !month || !day) {
    return String(value);
  }

  return `${day}/${month}/${year.slice(-2)}`;
}

function parseDateKeyAsUtc(value) {
  const [year, month, day] = String(value).split("-").map(Number);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return NaN;
  }

  return Date.UTC(year, month - 1, day);
}

function getDaysToOpex(dateKey) {
  const currentDateUtc = parseDateKeyAsUtc(dateKey);
  const opexDateUtc = parseDateKeyAsUtc(CONFIG.currentOpexDate);

  if (!Number.isFinite(currentDateUtc) || !Number.isFinite(opexDateUtc)) {
    return NaN;
  }

  return Math.round((opexDateUtc - currentDateUtc) / 86400000);
}

function getTodayDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatChartDate(value) {
  if (!value) {
    return "";
  }

  const parts = String(value).split("/");

  if (parts.length < 2) {
    return String(value);
  }

  return `${parts[0]}/${parts[1]}`;
}

function formatStrikeTitle(value) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  const normalized = String(Math.round(value));
  return normalized.length >= 5
    ? normalized.slice(0, 3)
    : normalized.slice(0, 2);
}

function formatOptionLabel(optionType, strike, compact = true) {
  const prefix = optionType === "put" ? "P" : "C";

  if (!Number.isFinite(strike)) {
    return compact ? `${prefix}0` : `${prefix}0`;
  }

  return compact
    ? `${prefix}${formatStrikeTitle(strike)}`
    : `${prefix}${formatNumber(strike, 0)}`;
}

function formatCompactNumber(value, decimals) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  const fixed = value.toFixed(decimals);
  return fixed
    .replace(/\.?0+$/, "")
    .replace(".", ",");
}

function formatNumber(value, decimals) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat("es-AR", {
    useGrouping: false,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}

function formatGroupedNumber(value, decimals) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat("es-AR", {
    useGrouping: true,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}

function formatCurrency(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatGroupedCurrency(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    useGrouping: true,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat("es-AR", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function clampInteger(value, min, max, fallback) {
  const parsed = Math.round(Number(value));

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function clampDecimal(value, min, max, fallback) {
  const parsed = Number(String(value).replace(",", "."));

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function divide(dividend, divisor) {
  if (!Number.isFinite(dividend) || !Number.isFinite(divisor) || divisor === 0) {
    return NaN;
  }

  return dividend / divisor;
}

function setStatus(message, metaMessage = "", updateMessage = "", collapsedSummary = "") {
  elements.statusMessage.textContent = message;
  elements.statusMetaMessage.innerHTML = metaMessage;
  elements.statusUpdateMessage.textContent = updateMessage;
  elements.statusCollapsedSummary.innerHTML = collapsedSummary;
}

function syncCollapsedPanelSummaries(base1Strike, base2Strike, lotes, relation, rateDays) {
  const base1Text = Number.isFinite(base1Strike) ? formatNumber(base1Strike, 0) : "-";
  const base2Text = Number.isFinite(base2Strike) ? formatNumber(base2Strike, 0) : "-";
  const lotesText = Number.isFinite(lotes) ? String(lotes) : "-";
  const relationText = Number.isFinite(relation) ? formatStoredRelation(relation) : "-";
  const rateDaysText = Number.isFinite(rateDays) ? String(rateDays) : "-";
  const base1TypeText = state.optionTypes.base1 === "put" ? "Put" : "Call";
  const base2TypeText = state.optionTypes.base2 === "put" ? "Put" : "Call";

  elements.configCollapsedSummary.textContent =
    `Base 1: ${base1TypeText} ${base1Text} | Base 2: ${base2TypeText} ${base2Text} | Lotes: ${lotesText} | Relacion: ${relationText} | Dias tasa: ${rateDaysText}`;

  elements.legendCollapsedSummary.innerHTML = `
    <span class="summary-dots">
      <span class="summary-dot-item"><span class="metric-dot legend-dot legend-dot-max"></span><span>Maximo</span></span>
      <span class="summary-dot-item"><span class="metric-dot legend-dot legend-dot-min"></span><span>Minimo</span></span>
      <span class="summary-dot-item"><span class="metric-dot legend-dot legend-dot-mid"></span><span>Cercano mediana</span></span>
      <span class="summary-dot-item"><span class="metric-dot legend-dot legend-dot-live"></span><span>Live</span></span>
      <span class="summary-dot-item"><span class="metric-dot legend-dot legend-dot-last"></span><span>Ultimo</span></span>
      <span class="summary-dot-item"><span class="legend-mean-line"></span><span>Mediana serie</span></span>
    </span>
  `;
}

function renderStatusState(status) {
  const normalized = status === "Ok" || status === "Error" || status === "Actualizando"
    ? status
    : "Actualizando";
  const cssClass = normalized === "Ok"
    ? "status-state-ok"
    : normalized === "Error"
      ? "status-state-error"
      : "status-state-working";

  return `<span class="status-state ${cssClass}">${normalized}</span>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function openCacheDb() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(CONFIG.dbName, CONFIG.dbVersion);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(CONFIG.dbStore)) {
        db.createObjectStore(CONFIG.dbStore);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("No se pudo abrir indexedDB"));
  });
}

async function readCachedPayload() {
  const db = await openCacheDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CONFIG.dbStore, "readonly");
    const store = transaction.objectStore(CONFIG.dbStore);
    const request = store.get(CONFIG.dbKey);

    request.onsuccess = () => {
      db.close();
      const result = request.result;
      resolve(result?.payload ?? null);
    };

    request.onerror = () => {
      db.close();
      reject(request.error ?? new Error("No se pudo leer indexedDB"));
    };
  });
}

async function writeCachedPayload(payload) {
  const db = await openCacheDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CONFIG.dbStore, "readwrite");
    const store = transaction.objectStore(CONFIG.dbStore);
    const request = store.put({
      payload,
      savedAt: new Date().toISOString()
    }, CONFIG.dbKey);

    request.onsuccess = () => {
      db.close();
      resolve();
    };

    request.onerror = () => {
      db.close();
      reject(request.error ?? new Error("No se pudo guardar indexedDB"));
    };
  });
}

async function clearCachedPayload() {
  const db = await openCacheDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CONFIG.dbStore, "readwrite");
    const store = transaction.objectStore(CONFIG.dbStore);
    const request = store.delete(CONFIG.dbKey);

    request.onsuccess = () => {
      db.close();
      resolve();
    };

    request.onerror = () => {
      db.close();
      reject(request.error ?? new Error("No se pudo limpiar indexedDB"));
    };
  });
}
