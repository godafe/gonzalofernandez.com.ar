const VENCIMIENTO_MAP = {
  'FE': 'FE', 'AB': 'AB', 'JU': 'JU', 'AG': 'AG', 'OC': 'OC', 'DI': 'DI',
  'F':  'FE', 'A':  'AB', 'J':  'JU', 'G':  'AG', 'O':  'OC', 'D':  'DI'
};
const VENCIMIENTO_LABELS = {
  'FE': 'Febrero', 'AB': 'Abril', 'JU': 'Junio',
  'AG': 'Agosto',  'OC': 'Octubre', 'DI': 'Diciembre'
};
const VENCIMIENTO_MONTHS = {
  'FE': 1, 'AB': 3, 'JU': 5, 'AG': 7, 'OC': 9, 'DI': 11
};

function getVencimientoFromTicker(especie) {
  const suffix = especie.replace(/^[A-Z]+\d+/, '');
  return VENCIMIENTO_MAP[suffix] ?? null;
}

function calcOpexDateKeyForVencimiento(canonical) {
  const month = VENCIMIENTO_MONTHS[canonical];

  if (month === undefined) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function thirdFriday(year, m) {
    const d = new Date(year, m, 1);
    d.setDate(1 + (5 - d.getDay() + 7) % 7 + 14);
    return d;
  }

  let d = thirdFriday(today.getFullYear(), month);

  if (d < today) {
    d = thirdFriday(today.getFullYear() + 1, month);
  }

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function _calcOpexDate() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  function thirdFriday(year, month) {
    const d = new Date(year, month, 1);
    d.setDate(1 + (5 - d.getDay() + 7) % 7 + 14);
    return d;
  }
  let c = thirdFriday(today.getFullYear(), today.getMonth());
  if (c < today) c = thirdFriday(today.getFullYear(), today.getMonth() + 1);
  return `${c.getFullYear()}-${String(c.getMonth()+1).padStart(2,'0')}-${String(c.getDate()).padStart(2,'0')}`;
}

const CONFIG = {
  dataUrl: "https://script.google.com/macros/s/AKfycbx3U-DXD4soaIA1UjDnkCBu5c7DHxW8eptZiaHYMdH-HMyhAcDy_TT4mT-R9YLZfrxU/exec?endpoint=history&sheet=HMD",
  liveUrlBase: "https://script.google.com/macros/s/AKfycbx3U-DXD4soaIA1UjDnkCBu5c7DHxW8eptZiaHYMdH-HMyhAcDy_TT4mT-R9YLZfrxU/exec?endpoint=Live",
  storageKey: "panel-ggal-settings",
  dbName: "panel-ggal-cache",
  dbVersion: 1,
  dbStore: "datasets",
  dbKey: "history-HMD",
  defaultLotes: 100,
  defaultRelation: 1.6,
  defaultRateDays: 365,
  defaultLiveConnection: "DMD_Bot",
  allowedLiveConnections: ["DMD_Bot", "DMD_Sabro"],
  currentOpexDate: _calcOpexDate(),
  defaultAutoRefreshEnabled: false,
  defaultAutoRefreshSeconds: 7,
  defaultCrossCount: 4,
  defaultStrikeRange: "near"
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
  liveConnection: "DMD_Bot",
  autoRefreshTimerId: null,
  countdownTimerId: null,
  nextRefreshAt: null,
  lastUpdatedAt: null,
  liveStatus: "Actualizando",
  isLoadingLive: false,
  chartVisibility: {},
  panels: {
    configCollapsed: false,
    statusCollapsed: false,
    legendCollapsed: false,
    tableCollapsed: false,
    ratesChartCollapsed: false,
    rateDiffChartCollapsed: false,
    ratioChartCollapsed: false,
    tasasCrossCollapsed: false,
    tasasVenCollapsed: false,
    tasasVrpCollapsed: false,
    tasasRankCollapsed: false,
    tasasThetaCollapsed: false,
    tasasSkewCollapsed: false,
    tasasTemporalCollapsed: false,
    tasasPrimaCollapsed: false,
    costoPrimaryChartCollapsed: false,
    spreadChartCollapsed: false,
    costoRiChartCollapsed: false,
    costoStraddleChartCollapsed: false,
    multipleTableCollapsed: false,
    multipleRatioChartCollapsed: false,
    multipleCostoChartCollapsed: false,
    multipleSpreadChartCollapsed: false,
    multipleCostoRiChartCollapsed: false,
    parametrosCollapsed: false,
    griegasTableCollapsed: false,
    griegasSimpleTableCollapsed: false,
    griegasPriceChartCollapsed: false,
    griegasIVChartCollapsed: false,
    griegasDeltaChartCollapsed: false,
    griegasGammaChartCollapsed: false,
    griegasVegaChartCollapsed: false,
    griegasThetaChartCollapsed: false,
    showStatus: true,
    showConfig: true,
    showParametros: true,
    showLegend: true
  },
  optionTypes: {
    base1: "call",
    base2: "call"
  },
  multiSeries: [],
  multiSeriesExpanded: {},
  selectedVencimiento: null,
  availableVencimientos: [],
  rawPayload: null,
  selectedFechaDesde: null,
  griegasSelectedStrike: null,
  griegasSelectedStrike2: null,
  griegasOptionType: "call",
  griegasOptionType2: "call",
  griegasCruzar: false
};

const elements = {
  tableBody: document.getElementById("tableBody"),
  parametrosCard:             document.getElementById("parametrosCard"),
  parametrosCollapseButton:   document.getElementById("parametrosCollapseButton"),
  parametrosPanelBody:        document.getElementById("parametrosPanelBody"),
  parametrosCollapsedSummary: document.getElementById("parametrosCollapsedSummary"),
  statusMessage: document.getElementById("statusMessage"),
  statusMetaMessage: document.getElementById("statusMetaMessage"),
  statusUpdateMessage: document.getElementById("statusUpdateMessage"),
  statusCollapsedSummary: document.getElementById("statusCollapsedSummary"),
  legendCollapsedSummary: document.getElementById("legendCollapsedSummary"),
  tableSection: document.getElementById("tableSection"),
  tableCollapseButton: document.getElementById("tableCollapseButton"),
  tablePanelBody: document.getElementById("tablePanelBody"),
  tableCollapsedPreview: document.getElementById("tableCollapsedPreview"),
  chartsSection: document.getElementById("chartsSection"),
  costoPrimaryHeader: document.getElementById("costoPrimaryHeader"),
  spreadHeader: document.getElementById("spreadHeader"),
  costoRiHeader: document.getElementById("costoRiHeader"),
  costoStraddleHeader: document.getElementById("costoStraddleHeader"),
  tableModeButton: document.getElementById("tableModeButton"),
  chartModeButton: document.getElementById("chartModeButton"),
  multipleModeButton: document.getElementById("multipleModeButton"),
  configCollapseButton: document.getElementById("configCollapseButton"),
  configPanelBody: document.getElementById("configPanelBody"),
  statusCollapseButton: document.getElementById("statusCollapseButton"),
  statusPanelBody: document.getElementById("statusPanelBody"),
  legendCollapseButton: document.getElementById("legendCollapseButton"),
  legendPanelBody: document.getElementById("legendPanelBody"),
  autoRefreshCheckbox: document.getElementById("autoRefreshCheckbox"),
  autoRefreshSecondsSelect: document.getElementById("autoRefreshSecondsSelect"),
  liveConnectionSelect: document.getElementById("liveConnectionSelect"),
  base1TypeButton: document.getElementById("base1TypeButton"),
  base2TypeButton: document.getElementById("base2TypeButton"),
  base1Header: document.getElementById("base1Header"),
  base2Header: document.getElementById("base2Header"),
  veBase1Header: document.getElementById("veBase1Header"),
  veBase2Header: document.getElementById("veBase2Header"),
  rateBase1Header: document.getElementById("rateBase1Header"),
  rateBase2Header: document.getElementById("rateBase2Header"),
  base1Select: document.getElementById("base1Select"),
  base2Select: document.getElementById("base2Select"),
  swapBasesButton: document.getElementById("swapBasesButton"),
  lotesInput: document.getElementById("lotesInput"),
  relationInput: document.getElementById("relationInput"),
  rateDaysInput: document.getElementById("rateDaysInput"),
  strikeRangeField: document.getElementById("strikeRangeField"),
  strikeRangeSelect: document.getElementById("strikeRangeSelect"),
  fechaDesdeField: document.getElementById("fechaDesdeField"),
  base1Field: document.getElementById("base1Field"),
  swapField: document.getElementById("swapField"),
  base2Field: document.getElementById("base2Field"),
  lotesField: document.getElementById("lotesField"),
  relationField: document.getElementById("relationField"),
  rateDaysField: document.getElementById("rateDaysField"),
  crossCountField: document.getElementById("crossCountField"),
  crossCountInput: document.getElementById("crossCountInput"),
  reloadButton: document.getElementById("reloadButton"),
  refreshButton: document.getElementById("refreshButton"),
  ratesChartCard: document.getElementById("ratesChartCard"),
  ratesChartCollapseButton: document.getElementById("ratesChartCollapseButton"),
  ratesChartPanelBody: document.getElementById("ratesChartPanelBody"),
  rateDiffChartCard: document.getElementById("rateDiffChartCard"),
  rateDiffChartCollapseButton: document.getElementById("rateDiffChartCollapseButton"),
  rateDiffChartPanelBody: document.getElementById("rateDiffChartPanelBody"),
  ratioChartCard: document.getElementById("ratioChartCard"),
  ratioChartCollapseButton: document.getElementById("ratioChartCollapseButton"),
  ratioChartPanelBody: document.getElementById("ratioChartPanelBody"),
  costoPrimaryChartCard: document.getElementById("costoPrimaryChartCard"),
  costoPrimaryChartCollapseButton: document.getElementById("costoPrimaryChartCollapseButton"),
  costoPrimaryChartPanelBody: document.getElementById("costoPrimaryChartPanelBody"),
  spreadChartCard: document.getElementById("spreadChartCard"),
  spreadChartCollapseButton: document.getElementById("spreadChartCollapseButton"),
  spreadChartPanelBody: document.getElementById("spreadChartPanelBody"),
  costoRiChartCard: document.getElementById("costoRiChartCard"),
  costoRiChartCollapseButton: document.getElementById("costoRiChartCollapseButton"),
  costoRiChartPanelBody: document.getElementById("costoRiChartPanelBody"),
  costoStraddleChartCard: document.getElementById("costoStraddleChartCard"),
  costoStraddleChartCollapseButton: document.getElementById("costoStraddleChartCollapseButton"),
  costoStraddleChartPanelBody: document.getElementById("costoStraddleChartPanelBody"),
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
  costoStraddleChart: document.getElementById("costoStraddleChart"),
  multipleSection: document.getElementById("multipleSection"),
  multipleTableSection: document.getElementById("multipleTableSection"),
  multipleTableCollapseButton: document.getElementById("multipleTableCollapseButton"),
  multipleTablePanelBody: document.getElementById("multipleTablePanelBody"),
  multipleTableBody: document.getElementById("multipleTableBody"),
  multipleChartsSection: document.getElementById("multipleChartsSection"),
  multipleCostoPrimaryHeader: document.getElementById("multipleCostoPrimaryHeader"),
  multipleSpreadHeader: document.getElementById("multipleSpreadHeader"),
  multipleCostoRiHeader: document.getElementById("multipleCostoRiHeader"),
  multipleCostoStraddleHeader: document.getElementById("multipleCostoStraddleHeader"),
  multipleRatioChartTitle: document.getElementById("multipleRatioChartTitle"),
  multipleCostoChartTitle: document.getElementById("multipleCostoChartTitle"),
  multipleSpreadChartTitle: document.getElementById("multipleSpreadChartTitle"),
  multipleCostoRiChartTitle: document.getElementById("multipleCostoRiChartTitle"),
  multipleRatioChartCard: document.getElementById("multipleRatioChartCard"),
  multipleRatioChartCollapseButton: document.getElementById("multipleRatioChartCollapseButton"),
  multipleRatioChartPanelBody: document.getElementById("multipleRatioChartPanelBody"),
  multipleCostoChartCard: document.getElementById("multipleCostoChartCard"),
  multipleCostoChartCollapseButton: document.getElementById("multipleCostoChartCollapseButton"),
  multipleCostoChartPanelBody: document.getElementById("multipleCostoChartPanelBody"),
  multipleSpreadChartCard: document.getElementById("multipleSpreadChartCard"),
  multipleSpreadChartCollapseButton: document.getElementById("multipleSpreadChartCollapseButton"),
  multipleSpreadChartPanelBody: document.getElementById("multipleSpreadChartPanelBody"),
  multipleCostoRiChartCard: document.getElementById("multipleCostoRiChartCard"),
  multipleCostoRiChartCollapseButton: document.getElementById("multipleCostoRiChartCollapseButton"),
  multipleCostoRiChartPanelBody: document.getElementById("multipleCostoRiChartPanelBody"),
  multipleRatioChart: document.getElementById("multipleRatioChart"),
  multipleCostoChart: document.getElementById("multipleCostoChart"),
  multipleSpreadChart: document.getElementById("multipleSpreadChart"),
  multipleCostoRiChart: document.getElementById("multipleCostoRiChart"),
  chainModeButton: document.getElementById("chainModeButton"),
  chainSection: document.getElementById("chainSection"),
  chainTableBody: document.getElementById("chainTableBody"),
  ratioModeButton: document.getElementById("ratioModeButton"),
  ratioSection: document.getElementById("ratioSection"),
  ratioTableBody: document.getElementById("ratioTableBody"),
  tasasModeButton: document.getElementById("tasasModeButton"),
  tasasSection: document.getElementById("tasasSection"),
  tasasCrossChartCard: document.getElementById("tasasCrossChartCard"),
  tasasCrossCollapseButton: document.getElementById("tasasCrossCollapseButton"),
  tasasCrossChartPanelBody: document.getElementById("tasasCrossChartPanelBody"),
  tasasCrossChartTitle: document.getElementById("tasasCrossChartTitle"),
  tasasCrossChart: document.getElementById("tasasCrossChart"),
  tasasVenChartCard: document.getElementById("tasasVenChartCard"),
  tasasVenCollapseButton: document.getElementById("tasasVenCollapseButton"),
  tasasVenChartPanelBody: document.getElementById("tasasVenChartPanelBody"),
  tasasVenChartTitle: document.getElementById("tasasVenChartTitle"),
  tasasVenChart: document.getElementById("tasasVenChart"),
  tasasVrpChartCard: document.getElementById("tasasVrpChartCard"),
  tasasVrpCollapseButton: document.getElementById("tasasVrpCollapseButton"),
  tasasVrpChartPanelBody: document.getElementById("tasasVrpChartPanelBody"),
  tasasVrpChartTitle: document.getElementById("tasasVrpChartTitle"),
  tasasVrpChart: document.getElementById("tasasVrpChart"),
  tasasRankChartCard: document.getElementById("tasasRankChartCard"),
  tasasRankCollapseButton: document.getElementById("tasasRankCollapseButton"),
  tasasRankChartPanelBody: document.getElementById("tasasRankChartPanelBody"),
  tasasRankChartTitle: document.getElementById("tasasRankChartTitle"),
  tasasRankChart: document.getElementById("tasasRankChart"),
  tasasThetaChartCard: document.getElementById("tasasThetaChartCard"),
  tasasThetaCollapseButton: document.getElementById("tasasThetaCollapseButton"),
  tasasThetaChartPanelBody: document.getElementById("tasasThetaChartPanelBody"),
  tasasThetaChartTitle: document.getElementById("tasasThetaChartTitle"),
  tasasThetaChart: document.getElementById("tasasThetaChart"),
  tasasSkewChartCard: document.getElementById("tasasSkewChartCard"),
  tasasSkewCollapseButton: document.getElementById("tasasSkewCollapseButton"),
  tasasSkewChartPanelBody: document.getElementById("tasasSkewChartPanelBody"),
  tasasSkewChartTitle: document.getElementById("tasasSkewChartTitle"),
  tasasSkewChart: document.getElementById("tasasSkewChart"),
  tasasTemporalChartCard: document.getElementById("tasasTemporalChartCard"),
  tasasTemporalCollapseButton: document.getElementById("tasasTemporalCollapseButton"),
  tasasTemporalChartPanelBody: document.getElementById("tasasTemporalChartPanelBody"),
  tasasTemporalChartTitle: document.getElementById("tasasTemporalChartTitle"),
  tasasTemporalChart: document.getElementById("tasasTemporalChart"),
  tasasPrimaChartCard: document.getElementById("tasasPrimaChartCard"),
  tasasPrimaCollapseButton: document.getElementById("tasasPrimaCollapseButton"),
  tasasPrimaChartPanelBody: document.getElementById("tasasPrimaChartPanelBody"),
  tasasPrimaChartTitle: document.getElementById("tasasPrimaChartTitle"),
  tasasPrimaChart: document.getElementById("tasasPrimaChart"),
  vencimientoSelect: document.getElementById("vencimientoSelect"),
  fechaDesdeSelect: document.getElementById("fechaDesdeSelect"),
  griegasModeButton: document.getElementById("griegasModeButton"),
  griegasSection: document.getElementById("griegasSection"),
  griegasTableBody: document.getElementById("griegasTableBody"),
  tasaRField: document.getElementById("tasaRField"),
  tasaRInput: document.getElementById("tasaRInput"),
  ggalOverrideField: document.getElementById("ggalOverrideField"),
  ggalOverrideLabel: document.getElementById("ggalOverrideLabel"),
  ggalOverrideInput: document.getElementById("ggalOverrideInput"),
  griegasTypeField:             document.getElementById("griegasTypeField"),
  griegasTypeButton:            document.getElementById("griegasTypeButton"),
  griegasStrikeSelect:          document.getElementById("griegasStrikeSelect"),
  griegasCruzarCheck:           document.getElementById("griegasCruzarCheck"),
  griegasSwapField:             document.getElementById("griegasSwapField"),
  griegasSwapButton:            document.getElementById("griegasSwapButton"),
  griegasBase2Field:            document.getElementById("griegasBase2Field"),
  griegasBase2TypeButton:       document.getElementById("griegasBase2TypeButton"),
  griegasBase2Select:           document.getElementById("griegasBase2Select"),
  griegasTableCollapseButton:   document.getElementById("griegasTableCollapseButton"),
  griegasTablePanelBody:        document.getElementById("griegasTablePanelBody"),
  griegasSimpleCard:            document.getElementById("griegasSimpleCard"),
  griegasSimpleTableCollapseButton: document.getElementById("griegasSimpleTableCollapseButton"),
  griegasSimpleTablePanelBody:  document.getElementById("griegasSimpleTablePanelBody"),
  griegasSimpleTableBody:       document.getElementById("griegasSimpleTableBody"),
  griegasIVChartCard:             document.getElementById("griegasIVChartCard"),
  griegasPriceChartTitle:         document.getElementById("griegasPriceChartTitle"),
  griegasPriceChartCollapseButton:document.getElementById("griegasPriceChartCollapseButton"),
  griegasPriceChartPanelBody:     document.getElementById("griegasPriceChartPanelBody"),
  griegasPriceChart:              document.getElementById("griegasPriceChart"),
  griegasIVChartTitle:            document.getElementById("griegasIVChartTitle"),
  griegasIVChartCollapseButton:   document.getElementById("griegasIVChartCollapseButton"),
  griegasIVChartPanelBody:        document.getElementById("griegasIVChartPanelBody"),
  griegasIVChart:                 document.getElementById("griegasIVChart"),
  griegasDeltaChartTitle:         document.getElementById("griegasDeltaChartTitle"),
  griegasDeltaChartCollapseButton:document.getElementById("griegasDeltaChartCollapseButton"),
  griegasDeltaChartPanelBody:     document.getElementById("griegasDeltaChartPanelBody"),
  griegasDeltaChart:              document.getElementById("griegasDeltaChart"),
  griegasGammaChartTitle:         document.getElementById("griegasGammaChartTitle"),
  griegasGammaChartCollapseButton:document.getElementById("griegasGammaChartCollapseButton"),
  griegasGammaChartPanelBody:     document.getElementById("griegasGammaChartPanelBody"),
  griegasGammaChart:              document.getElementById("griegasGammaChart"),
  griegasVegaChartTitle:          document.getElementById("griegasVegaChartTitle"),
  griegasVegaChartCollapseButton: document.getElementById("griegasVegaChartCollapseButton"),
  griegasVegaChartPanelBody:      document.getElementById("griegasVegaChartPanelBody"),
  griegasVegaChart:               document.getElementById("griegasVegaChart"),
  griegasThetaChartTitle:         document.getElementById("griegasThetaChartTitle"),
  griegasThetaChartCollapseButton:document.getElementById("griegasThetaChartCollapseButton"),
  griegasThetaChartPanelBody:     document.getElementById("griegasThetaChartPanelBody"),
  griegasThetaChart:              document.getElementById("griegasThetaChart"),
  dteField: document.getElementById("dteField"),
  dteLabel: document.getElementById("dteLabel"),
  dteInput: document.getElementById("dteInput"),
  statusCard: document.getElementById("statusCard"),
  configCard: document.getElementById("configCard"),
  legendCard: document.getElementById("legendCard"),
  settingsButton: document.getElementById("settingsButton"),
  panelSettingsModal: document.getElementById("panelSettingsModal"),
  modalCloseButton: document.getElementById("modalCloseButton"),
  showStatusCheck: document.getElementById("showStatusCheck"),
  showConfigCheck: document.getElementById("showConfigCheck"),
  showParametrosCheck: document.getElementById("showParametrosCheck"),
  showLegendCheck: document.getElementById("showLegendCheck"),
  statusHideButton: document.getElementById("statusHideButton"),
  configHideButton: document.getElementById("configHideButton"),
  parametrosHideButton: document.getElementById("parametrosHideButton"),
  legendHideButton: document.getElementById("legendHideButton")
};

elements.tableModeButton.addEventListener("click", () => setViewMode("table"));
elements.chartModeButton.addEventListener("click", () => setViewMode("chart"));
elements.multipleModeButton.addEventListener("click", () => setViewMode("multiple"));
elements.chainModeButton.addEventListener("click", () => setViewMode("chain"));
elements.ratioModeButton.addEventListener("click", () => setViewMode("ratio"));
elements.tasasModeButton.addEventListener("click", () => setViewMode("tasas"));
elements.griegasModeButton.addEventListener("click", () => setViewMode("griegas"));
elements.tasaRInput.addEventListener("input", renderTable);
elements.ggalOverrideLabel.addEventListener("dblclick", () => {
  if (!elements.ggalOverrideInput.hidden) {
    elements.ggalOverrideInput.hidden = true;
    elements.ggalOverrideInput.value = "";
  } else {
    elements.ggalOverrideInput.value = Math.round(getGreeksGgal());
    elements.ggalOverrideInput.hidden = false;
    elements.ggalOverrideInput.focus();
  }
  renderTable();
});
elements.ggalOverrideInput.addEventListener("input", () => {
  if (elements.ggalOverrideInput.value === "") {
    elements.ggalOverrideInput.hidden = true;
  }
  renderTable();
});
elements.dteLabel.addEventListener("dblclick", () => {
  if (!elements.dteInput.hidden) {
    elements.dteInput.hidden = true;
    elements.dteInput.value = "";
  } else {
    const dte = getDaysToOpex(getTodayDateKey());
    elements.dteInput.value = Number.isFinite(dte) ? String(dte) : "";
    elements.dteInput.hidden = false;
    elements.dteInput.focus();
  }
  renderTable();
});
elements.dteInput.addEventListener("input", () => {
  if (elements.dteInput.value === "") {
    elements.dteInput.hidden = true;
  }
  renderTable();
});
elements.configCollapseButton.addEventListener("click", () => togglePanel("configCollapsed"));
elements.parametrosCollapseButton.addEventListener("click", () => togglePanel("parametrosCollapsed"));
elements.statusCollapseButton.addEventListener("click", () => togglePanel("statusCollapsed"));
elements.legendCollapseButton.addEventListener("click", () => togglePanel("legendCollapsed"));
elements.statusHideButton.addEventListener("click", () => {
  state.panels.showStatus = false;
  elements.showStatusCheck.checked = false;
  syncPanelCards();
  persistSettings({});
});
elements.configHideButton.addEventListener("click", () => {
  state.panels.showConfig = false;
  elements.showConfigCheck.checked = false;
  syncPanelCards();
  persistSettings({});
});
elements.parametrosHideButton.addEventListener("click", () => {
  state.panels.showParametros = false;
  elements.showParametrosCheck.checked = false;
  syncPanelCards();
  persistSettings({});
});
elements.legendHideButton.addEventListener("click", () => {
  state.panels.showLegend = false;
  elements.showLegendCheck.checked = false;
  syncPanelCards();
  persistSettings({});
});
elements.tableCollapseButton.addEventListener("click", () => togglePanel("tableCollapsed"));
elements.griegasTableCollapseButton.addEventListener("click", () => togglePanel("griegasTableCollapsed"));
elements.griegasSimpleTableCollapseButton.addEventListener("click", () => togglePanel("griegasSimpleTableCollapsed"));
elements.griegasPriceChartCollapseButton.addEventListener("click", () => togglePanel("griegasPriceChartCollapsed"));
elements.griegasIVChartCollapseButton.addEventListener("click", () => togglePanel("griegasIVChartCollapsed"));
elements.griegasDeltaChartCollapseButton.addEventListener("click", () => togglePanel("griegasDeltaChartCollapsed"));
elements.griegasGammaChartCollapseButton.addEventListener("click", () => togglePanel("griegasGammaChartCollapsed"));
elements.griegasVegaChartCollapseButton.addEventListener("click", () => togglePanel("griegasVegaChartCollapsed"));
elements.griegasThetaChartCollapseButton.addEventListener("click", () => togglePanel("griegasThetaChartCollapsed"));
elements.griegasTypeButton.addEventListener("click", () => {
  state.griegasOptionType = state.griegasOptionType === "call" ? "put" : "call";
  updateOptionTypeButton(elements.griegasTypeButton, state.griegasOptionType);
  renderTable();
});
elements.griegasStrikeSelect.addEventListener("change", () => {
  const val = elements.griegasStrikeSelect.value;
  state.griegasSelectedStrike = val ? parseFloat(val) : null;
  renderTable();
});
elements.griegasCruzarCheck.addEventListener("change", () => {
  state.griegasCruzar = elements.griegasCruzarCheck.checked;
  syncGriegasCruzarUi();
  renderTable();
});
elements.griegasSwapButton.addEventListener("click", () => {
  const s1 = state.griegasSelectedStrike, s2 = state.griegasSelectedStrike2;
  const t1 = state.griegasOptionType, t2 = state.griegasOptionType2;
  state.griegasSelectedStrike  = s2; state.griegasSelectedStrike2 = s1;
  state.griegasOptionType      = t2; state.griegasOptionType2     = t1;
  elements.griegasStrikeSelect.value = s2 !== null ? String(s2) : "";
  elements.griegasBase2Select.value  = s1 !== null ? String(s1) : "";
  updateOptionTypeButton(elements.griegasTypeButton,      state.griegasOptionType);
  updateOptionTypeButton(elements.griegasBase2TypeButton, state.griegasOptionType2);
  renderTable();
});
elements.griegasBase2TypeButton.addEventListener("click", () => {
  state.griegasOptionType2 = state.griegasOptionType2 === "call" ? "put" : "call";
  updateOptionTypeButton(elements.griegasBase2TypeButton, state.griegasOptionType2);
  renderTable();
});
elements.griegasBase2Select.addEventListener("change", () => {
  const val = elements.griegasBase2Select.value;
  state.griegasSelectedStrike2 = val ? parseFloat(val) : null;
  renderTable();
});
elements.ratesChartCollapseButton.addEventListener("click", () => togglePanel("ratesChartCollapsed"));
elements.rateDiffChartCollapseButton.addEventListener("click", () => togglePanel("rateDiffChartCollapsed"));
elements.ratioChartCollapseButton.addEventListener("click", () => togglePanel("ratioChartCollapsed"));
elements.costoPrimaryChartCollapseButton.addEventListener("click", () => togglePanel("costoPrimaryChartCollapsed"));
elements.spreadChartCollapseButton.addEventListener("click", () => togglePanel("spreadChartCollapsed"));
elements.costoRiChartCollapseButton.addEventListener("click", () => togglePanel("costoRiChartCollapsed"));
elements.costoStraddleChartCollapseButton.addEventListener("click", () => togglePanel("costoStraddleChartCollapsed"));
elements.multipleTableCollapseButton.addEventListener("click", () => togglePanel("multipleTableCollapsed"));
elements.multipleRatioChartCollapseButton.addEventListener("click", () => togglePanel("multipleRatioChartCollapsed"));
elements.multipleCostoChartCollapseButton.addEventListener("click", () => togglePanel("multipleCostoChartCollapsed"));
elements.multipleSpreadChartCollapseButton.addEventListener("click", () => togglePanel("multipleSpreadChartCollapsed"));
elements.multipleCostoRiChartCollapseButton.addEventListener("click", () => togglePanel("multipleCostoRiChartCollapsed"));
elements.tasasCrossCollapseButton.addEventListener("click", () => togglePanel("tasasCrossCollapsed"));
elements.tasasVenCollapseButton.addEventListener("click", () => togglePanel("tasasVenCollapsed"));
elements.tasasVrpCollapseButton.addEventListener("click", () => togglePanel("tasasVrpCollapsed"));
elements.tasasRankCollapseButton.addEventListener("click", () => togglePanel("tasasRankCollapsed"));
elements.tasasThetaCollapseButton.addEventListener("click", () => togglePanel("tasasThetaCollapsed"));
elements.tasasSkewCollapseButton.addEventListener("click", () => togglePanel("tasasSkewCollapsed"));
elements.tasasTemporalCollapseButton.addEventListener("click", () => togglePanel("tasasTemporalCollapsed"));
elements.tasasPrimaCollapseButton.addEventListener("click", () => togglePanel("tasasPrimaCollapsed"));
elements.autoRefreshCheckbox.addEventListener("change", handleAutoRefreshSettingsChange);
elements.autoRefreshSecondsSelect.addEventListener("change", handleAutoRefreshSettingsChange);
elements.liveConnectionSelect.addEventListener("change", handleLiveConnectionChange);
elements.base1TypeButton.addEventListener("click", () => toggleOptionType(1));
elements.base2TypeButton.addEventListener("click", () => toggleOptionType(2));
elements.swapBasesButton.addEventListener("click", swapBases);
elements.base1Select.addEventListener("change", () => { resetFechaDesde(); renderTable(); });
elements.base2Select.addEventListener("change", () => { resetFechaDesde(); renderTable(); });
elements.lotesInput.addEventListener("input", renderTable);
elements.relationInput.addEventListener("change", handleRelationCommit);
elements.relationInput.addEventListener("blur", handleRelationCommit);
elements.rateDaysInput.addEventListener("input", renderTable);
elements.crossCountInput.addEventListener("input", renderTable);
elements.strikeRangeSelect.addEventListener("change", renderTable);
elements.reloadButton.addEventListener("click", reloadSheetData);
elements.refreshButton.addEventListener("click", reloadSheetData);
elements.multipleTableBody.addEventListener("click", handleMultipleTableClick);
elements.tableBody.addEventListener("dblclick", (e) => {
  const td = e.target.closest("td[data-fecha-raw]");
  if (!td) return;
  elements.fechaDesdeSelect.value = td.dataset.fechaRaw;
  handleFechaDesdeChange();
});
elements.vencimientoSelect.addEventListener("change", handleVencimientoChange);
elements.fechaDesdeSelect.addEventListener("change", handleFechaDesdeChange);
elements.settingsButton.addEventListener("click", () => {
  elements.showStatusCheck.checked = state.panels.showStatus;
  elements.showConfigCheck.checked = state.panels.showConfig;
  elements.showParametrosCheck.checked = state.panels.showParametros;
  elements.showLegendCheck.checked = state.panels.showLegend;
  elements.panelSettingsModal.hidden = false;
});
elements.modalCloseButton.addEventListener("click", () => {
  elements.panelSettingsModal.hidden = true;
});
elements.panelSettingsModal.addEventListener("click", (e) => {
  if (e.target === elements.panelSettingsModal) elements.panelSettingsModal.hidden = true;
});
elements.showStatusCheck.addEventListener("change", () => {
  state.panels.showStatus = elements.showStatusCheck.checked;
  syncPanelCards();
  persistSettings({});
});
elements.showConfigCheck.addEventListener("change", () => {
  state.panels.showConfig = elements.showConfigCheck.checked;
  syncPanelCards();
  persistSettings({});
});
elements.showParametrosCheck.addEventListener("change", () => {
  state.panels.showParametros = elements.showParametrosCheck.checked;
  syncPanelCards();
  persistSettings({});
});
elements.showLegendCheck.addEventListener("change", () => {
  state.panels.showLegend = elements.showLegendCheck.checked;
  syncPanelCards();
  persistSettings({});
});

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
  state.rawPayload = payload;

  // Primer pase: descubrir vencimientos disponibles sin filtro
  const discovery = parseHistoryPayload(payload, null);
  state.availableVencimientos = discovery.availableVencimientos;

  // Auto-seleccionar el primer vencimiento (cronológico) si ninguno es válido
  const sortedVenc = getSortedVencimientos(state.availableVencimientos);
  if (!state.selectedVencimiento || !sortedVenc.includes(state.selectedVencimiento)) {
    state.selectedVencimiento = sortedVenc[0] ?? null;
  }

  // Segundo pase: parsear con el filtro definido
  const parsed = parseHistoryPayload(payload, state.selectedVencimiento);

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
  populateVencimientoSelector();
  populateFechaDesdeSelector();
  renderTable();
}

async function loadLiveData() {
  if (state.isLoadingLive) return;
  state.isLoadingLive = true;
  try {
    state.liveStatus = "Actualizando";
    syncStatus();
    const todayKey = getTodayDateKey();
    const todayHistoryEntry = state.historyByDate.find((entry) => entry.fechaRaw === todayKey);

    let alreadyCovered = false;
    if (todayHistoryEntry) {
      const base1Strike = Number(elements.base1Select.value);
      const base2Strike = Number(elements.base2Select.value);
      if (Number.isFinite(base1Strike) && Number.isFinite(base2Strike)) {
        const b1Key = strikeKey(base1Strike);
        const b2Key = strikeKey(base2Strike);
        const b1TypeKey = state.optionTypes.base1 === "put" ? "puts" : "calls";
        const b2TypeKey = state.optionTypes.base2 === "put" ? "puts" : "calls";
        alreadyCovered = Number.isFinite(todayHistoryEntry.ggal) &&
          Number.isFinite(todayHistoryEntry[b1TypeKey]?.[b1Key]) &&
          Number.isFinite(todayHistoryEntry[b2TypeKey]?.[b2Key]);
      }
    }

    if (alreadyCovered) {
      // Sintetizar liveEntry desde el histórico de hoy para que Spread/Ratio chain puedan renderizar.
      // buildRowsByDate() ya evita duplicar la fila en la tabla porque compara fechaRaw.
      state.liveEntry = {
        fechaRaw: todayHistoryEntry.fechaRaw,
        ggal: todayHistoryEntry.ggal,
        calls: todayHistoryEntry.calls ?? {},
        puts: todayHistoryEntry.puts ?? {},
      };
      state.lastUpdatedAt = new Date();
      state.liveStatus = "Ok";
      renderTable();
      return;
    }

    const response = await fetch(getLiveUrl(), { cache: "no-store" });

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
    state.liveStatus = "Error";
    renderTable();
  } finally {
    state.isLoadingLive = false;
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

function getSortedVencimientos(vencimientos) {
  return vencimientos.slice().sort((a, b) => {
    const da = calcOpexDateKeyForVencimiento(a) ?? "";
    const db = calcOpexDateKeyForVencimiento(b) ?? "";
    return da.localeCompare(db);
  });
}

function formatOpexShort(dateKey) {
  const [year, month, day] = dateKey.split("-");
  return `${day}/${month}/${year.slice(2)}`;
}

function populateVencimientoSelector() {
  const sorted = getSortedVencimientos(state.availableVencimientos);

  if (!sorted.length) {
    elements.vencimientoSelect.innerHTML = '<option value="">Sin datos</option>';
    return;
  }

  const options = sorted.map((v) => {
    const label = VENCIMIENTO_LABELS[v] ?? v;
    const opexKey = calcOpexDateKeyForVencimiento(v);
    const fullLabel = opexKey ? `${label} (${formatOpexShort(opexKey)})` : label;
    const selected = state.selectedVencimiento === v ? " selected" : "";
    return `<option value="${v}"${selected}>${fullLabel}</option>`;
  }).join("");

  elements.vencimientoSelect.innerHTML = options;
}

function handleVencimientoChange() {
  state.selectedVencimiento = elements.vencimientoSelect.value || null;
  state.selectedFechaDesde = null;
  state.griegasSelectedStrike  = null;
  state.griegasSelectedStrike2 = null;
  elements.griegasStrikeSelect.value = "";
  elements.griegasBase2Select.value  = "";
  elements.dteInput.hidden = true;
  elements.dteInput.value = "";

  if (state.rawPayload) {
    hydrateFromPayload(state.rawPayload, state.sourceStats?.source ?? "local");
  }
}

function populateFechaDesdeSelector() {
  const prevValue = state.selectedFechaDesde;
  const dates = state.historyByDate
    .map((entry) => entry.fechaRaw)
    .filter(Boolean)
    .sort();

  const options = [
    '<option value="">Todas</option>',
    ...dates.map((raw) => {
      const label = formatDate(raw);
      const selected = prevValue === raw ? " selected" : "";
      return `<option value="${raw}"${selected}>${label}</option>`;
    })
  ].join("");

  elements.fechaDesdeSelect.innerHTML = options;

  if (prevValue && dates.includes(prevValue)) {
    elements.fechaDesdeSelect.value = prevValue;
    state.selectedFechaDesde = prevValue;
  } else {
    state.selectedFechaDesde = null;
  }
}

function handleFechaDesdeChange() {
  state.selectedFechaDesde = elements.fechaDesdeSelect.value || null;
  renderTable();
}

function resetFechaDesde() {
  state.selectedFechaDesde = null;
  elements.fechaDesdeSelect.value = "";
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
  const crossCount = clampInteger(elements.crossCountInput.value, 0, 20, CONFIG.defaultCrossCount);
  const strikeRangeAll = elements.strikeRangeSelect.value === "all";
  const base1Strike = Number(elements.base1Select.value);
  const base2Strike = Number(elements.base2Select.value);
  const combinationMode = getCombinationMode();
  elements.rateDaysInput.value = String(rateDays);
  elements.crossCountInput.value = String(crossCount);
  persistSettings({
    base1: base1Strike,
    base2: base2Strike,
    lotes,
    relation,
    rateDays,
    crossCount,
    strikeRange: elements.strikeRangeSelect.value
  });
  updateBaseHeaders(base1Strike, base2Strike);
  updateHeadersForMode(combinationMode);
  updateChartTitles(base1Strike, base2Strike, lotes, relation, combinationMode);
  updateMultipleTitles(base1Strike, base2Strike, lotes, relation, combinationMode);
  syncCollapsedPanelSummaries(base1Strike, base2Strike, lotes, relation, rateDays, crossCount);
  const rows = buildRowsByDate(state.historyByDate, base1Strike, base2Strike);
  const enrichedRows = rows.map((row) => addDerivedMetrics(row, lotes, relation, rateDays, state.optionTypes.base1, state.optionTypes.base2));
  const seriesStats = buildSeriesStats(enrichedRows);
  const rowsHtml = enrichedRows.map((row) => buildRowMarkup(row, seriesStats, combinationMode)).join("");
  renderCharts(enrichedRows, combinationMode);
  renderMultipleView(base1Strike, base2Strike, lotes, relation, rateDays, crossCount, combinationMode);
  renderSpreadChain(strikeRangeAll);
  renderRatioChain(strikeRangeAll);
  renderGreeksChain(strikeRangeAll);
  renderGreeksSimpleChain(strikeRangeAll);
  renderTasasCharts(base1Strike, base2Strike);
  syncMetricVisibility(combinationMode);
  syncViewModeUi();
  syncStatus();

  elements.tableBody.innerHTML = rowsHtml || `
    <tr>
      <td colspan="${combinationMode === "straddle" ? "9" : "11"}" class="placeholder">No hay datos para mostrar todavia.</td>
    </tr>
  `;
  renderCollapsedTablePreview(enrichedRows, seriesStats, combinationMode);
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
  elements.veBase1Header.textContent = Number.isFinite(base1Strike)
    ? `VE ${formatOptionLabel(state.optionTypes.base1, base1Strike)}`
    : "VE Base1";
  elements.veBase2Header.textContent = Number.isFinite(base2Strike)
    ? `VE ${formatOptionLabel(state.optionTypes.base2, base2Strike)}`
    : "VE Base2";
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
  elements.multipleCostoPrimaryHeader.textContent = combinationMode === "bear" ? "Costo Bear" : "Costo Bull";
}

function syncMetricVisibility(combinationMode) {
  const isStraddle = combinationMode === "straddle";

  elements.costoPrimaryHeader.hidden = isStraddle;
  elements.spreadHeader.hidden = isStraddle;
  elements.costoRiHeader.hidden = isStraddle;
  elements.costoStraddleHeader.hidden = !isStraddle;
  elements.multipleCostoPrimaryHeader.hidden = isStraddle;
  elements.multipleSpreadHeader.hidden = isStraddle;
  elements.multipleCostoRiHeader.hidden = isStraddle;
  elements.multipleCostoStraddleHeader.hidden = !isStraddle;

  elements.costoPrimaryChartCard.hidden = isStraddle;
  elements.spreadChartCard.hidden = isStraddle;
  elements.costoRiChartCard.hidden = isStraddle;
  elements.costoStraddleChartCard.hidden = !isStraddle;
  elements.multipleCostoChartCard.hidden = false;
  elements.multipleRatioChartCard.hidden = false;
  elements.multipleSpreadChartCard.hidden = isStraddle;
  elements.multipleCostoRiChartCard.hidden = isStraddle;
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
    .filter((row) => {
      if (!isValidRow(row)) return false;
      if (state.selectedFechaDesde && row.fechaRaw < state.selectedFechaDesde) return false;
      return true;
    })
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

  return rows;
}

function addDerivedMetrics(row, lotes, relation, rateDays, optionType1, optionType2) {
  const veBase1 = getBaseExtrinsicValue(row.strikeBase1, row.lastBase1, row.ggal, optionType1);
  const veBase2 = getBaseExtrinsicValue(row.strikeBase2, row.lastBase2, row.ggal, optionType2);
  const tasaBase1 = getAnnualizedBaseRate(row.strikeBase1, row.lastBase1, row.ggal, row.daysToOpex, rateDays, optionType1);
  const tasaBase2 = getAnnualizedBaseRate(row.strikeBase2, row.lastBase2, row.ggal, row.daysToOpex, rateDays, optionType2);
  const diferencialTasas = tasaBase2 - tasaBase1;
  const ratio = divide(row.lastBase1, row.lastBase2);
  const costoBull = (row.lastBase1 * lotes) - (row.lastBase2 * lotes);
  const spread = Math.abs(divide(costoBull, (row.strikeBase2 - row.strikeBase1) * lotes));
  const costoRi = (row.lastBase1 * lotes) - (row.lastBase2 * lotes * relation);
  const costoStraddle = row.lastBase1 + row.lastBase2;

  return {
    ...row,
    veBase1,
    veBase2,
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
  const dateTdAttrs = !row.isLive ? ` class="fecha-desde-clickable" data-fecha-raw="${escapeHtml(row.fechaRaw)}" title="Doble click para filtrar desde esta fecha"` : "";
  const sharedCells = `
    <td${dateTdAttrs}>${renderDateCell(row)}</td>
    <td>${formatGroupedNumber(row.ggal, 2)}</td>
    <td>${formatNumber(row.lastBase1, 2)}</td>
    <td>${formatNumber(row.lastBase2, 2)}</td>
    <td>${formatNumber(row.veBase1, 2)}</td>
    <td>${formatNumber(row.veBase2, 2)}</td>
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
  state.viewMode = ["chart", "multiple", "chain", "ratio", "tasas", "griegas"].includes(storedSettings.viewMode)
    ? storedSettings.viewMode
    : "table";
  state.selectedFechaDesde = storedSettings.fechaDesde ?? null;
  state.autoRefreshEnabled = typeof storedSettings.autoRefreshEnabled === "boolean"
    ? storedSettings.autoRefreshEnabled
    : CONFIG.defaultAutoRefreshEnabled;
  state.autoRefreshSeconds = Number.isFinite(storedSettings.autoRefreshSeconds)
    ? clampInteger(storedSettings.autoRefreshSeconds, 5, 10, CONFIG.defaultAutoRefreshSeconds)
    : CONFIG.defaultAutoRefreshSeconds;
  state.panels.configCollapsed = storedSettings.configCollapsed === true;
  state.panels.statusCollapsed = storedSettings.statusCollapsed === true;
  state.panels.legendCollapsed = storedSettings.legendCollapsed === true;
  state.panels.tableCollapsed = storedSettings.tableCollapsed === true;
  state.panels.ratesChartCollapsed = storedSettings.ratesChartCollapsed === true;
  state.panels.rateDiffChartCollapsed = storedSettings.rateDiffChartCollapsed === true;
  state.panels.ratioChartCollapsed = storedSettings.ratioChartCollapsed === true;
  state.panels.costoPrimaryChartCollapsed = storedSettings.costoPrimaryChartCollapsed === true;
  state.panels.spreadChartCollapsed = storedSettings.spreadChartCollapsed === true;
  state.panels.costoRiChartCollapsed = storedSettings.costoRiChartCollapsed === true;
  state.panels.costoStraddleChartCollapsed = storedSettings.costoStraddleChartCollapsed === true;
  state.panels.multipleTableCollapsed = storedSettings.multipleTableCollapsed === true;
  state.panels.multipleRatioChartCollapsed = storedSettings.multipleRatioChartCollapsed === true;
  state.panels.multipleCostoChartCollapsed = storedSettings.multipleCostoChartCollapsed === true;
  state.panels.multipleSpreadChartCollapsed = storedSettings.multipleSpreadChartCollapsed === true;
  state.panels.multipleCostoRiChartCollapsed = storedSettings.multipleCostoRiChartCollapsed === true;
  state.panels.tasasCrossCollapsed = storedSettings.tasasCrossCollapsed === true;
  state.panels.tasasVenCollapsed = storedSettings.tasasVenCollapsed === true;
  state.panels.tasasVrpCollapsed = storedSettings.tasasVrpCollapsed === true;
  state.panels.tasasRankCollapsed = storedSettings.tasasRankCollapsed === true;
  state.panels.tasasThetaCollapsed = storedSettings.tasasThetaCollapsed === true;
  state.panels.tasasSkewCollapsed = storedSettings.tasasSkewCollapsed === true;
  state.panels.tasasTemporalCollapsed = storedSettings.tasasTemporalCollapsed === true;
  state.panels.tasasPrimaCollapsed = storedSettings.tasasPrimaCollapsed === true;
  state.panels.parametrosCollapsed = storedSettings.parametrosCollapsed === true;
  state.panels.griegasTableCollapsed = storedSettings.griegasTableCollapsed === true;
  state.panels.griegasSimpleTableCollapsed = storedSettings.griegasSimpleTableCollapsed === true;
  state.panels.griegasPriceChartCollapsed = storedSettings.griegasPriceChartCollapsed === true;
  state.panels.griegasIVChartCollapsed = storedSettings.griegasIVChartCollapsed === true;
  state.panels.griegasDeltaChartCollapsed = storedSettings.griegasDeltaChartCollapsed === true;
  state.panels.griegasGammaChartCollapsed = storedSettings.griegasGammaChartCollapsed === true;
  state.panels.griegasVegaChartCollapsed = storedSettings.griegasVegaChartCollapsed === true;
  state.panels.griegasThetaChartCollapsed = storedSettings.griegasThetaChartCollapsed === true;
  state.griegasOptionType = (storedSettings.griegasOptionType === "put") ? "put" : "call";
  state.griegasCruzar = storedSettings.griegasCruzar === true;
  state.griegasOptionType2 = (storedSettings.griegasOptionType2 === "put") ? "put" : "call";
  state.griegasSelectedStrike = Number.isFinite(storedSettings.griegasSelectedStrike) && storedSettings.griegasSelectedStrike > 0 ? storedSettings.griegasSelectedStrike : null;
  state.griegasSelectedStrike2 = Number.isFinite(storedSettings.griegasSelectedStrike2) && storedSettings.griegasSelectedStrike2 > 0 ? storedSettings.griegasSelectedStrike2 : null;
  elements.griegasCruzarCheck.checked = state.griegasCruzar;
  updateOptionTypeButton(elements.griegasBase2TypeButton, state.griegasOptionType2);
  state.panels.showStatus = storedSettings.showStatus !== false;
  state.panels.showConfig = storedSettings.showConfig !== false;
  state.panels.showParametros = storedSettings.showParametros !== false;
  state.panels.showLegend = storedSettings.showLegend !== false;
  state.optionTypes.base1 = storedSettings.base1Type === "put" ? "put" : "call";
  state.optionTypes.base2 = storedSettings.base2Type === "put" ? "put" : "call";
  state.liveConnection = getSafeLiveConnection(storedSettings.liveConnection);
  elements.lotesInput.value = Number.isFinite(storedSettings.lotes)
    ? String(storedSettings.lotes)
    : String(CONFIG.defaultLotes);
  elements.relationInput.value = Number.isFinite(storedSettings.relation)
    ? formatStoredRelation(storedSettings.relation)
    : formatStoredRelation(CONFIG.defaultRelation);
  elements.rateDaysInput.value = Number.isFinite(storedSettings.rateDays)
    ? String(clampInteger(storedSettings.rateDays, 1, 5000, CONFIG.defaultRateDays))
    : String(CONFIG.defaultRateDays);
  elements.crossCountInput.value = Number.isFinite(storedSettings.crossCount)
    ? String(clampInteger(storedSettings.crossCount, 0, 20, CONFIG.defaultCrossCount))
    : String(CONFIG.defaultCrossCount);
  elements.strikeRangeSelect.value = (storedSettings.strikeRange === "all" || storedSettings.strikeRange === "near")
    ? storedSettings.strikeRange
    : CONFIG.defaultStrikeRange;
  elements.tasaRInput.value = (Number.isFinite(storedSettings.tasaR) && storedSettings.tasaR >= 0)
    ? String(storedSettings.tasaR)
    : "0";
  elements.autoRefreshCheckbox.checked = state.autoRefreshEnabled;
  elements.autoRefreshSecondsSelect.value = String(state.autoRefreshSeconds);
  elements.liveConnectionSelect.value = state.liveConnection;
  updateAutoRefreshUi();
  syncOptionTypeUi();
  syncPanelUi();
  syncPanelCards();
  scheduleAutoRefresh();
}

function applyStoredPanelStates() {
  const storedSettings = readStoredSettings();
  state.panels.configCollapsed = storedSettings.configCollapsed === true;
  state.panels.statusCollapsed = storedSettings.statusCollapsed === true;
  state.panels.legendCollapsed = storedSettings.legendCollapsed === true;
  state.panels.tableCollapsed = storedSettings.tableCollapsed === true;
  state.panels.ratesChartCollapsed = storedSettings.ratesChartCollapsed === true;
  state.panels.rateDiffChartCollapsed = storedSettings.rateDiffChartCollapsed === true;
  state.panels.ratioChartCollapsed = storedSettings.ratioChartCollapsed === true;
  state.panels.costoPrimaryChartCollapsed = storedSettings.costoPrimaryChartCollapsed === true;
  state.panels.spreadChartCollapsed = storedSettings.spreadChartCollapsed === true;
  state.panels.costoRiChartCollapsed = storedSettings.costoRiChartCollapsed === true;
  state.panels.costoStraddleChartCollapsed = storedSettings.costoStraddleChartCollapsed === true;
  state.panels.multipleTableCollapsed = storedSettings.multipleTableCollapsed === true;
  state.panels.multipleRatioChartCollapsed = storedSettings.multipleRatioChartCollapsed === true;
  state.panels.multipleCostoChartCollapsed = storedSettings.multipleCostoChartCollapsed === true;
  state.panels.multipleSpreadChartCollapsed = storedSettings.multipleSpreadChartCollapsed === true;
  state.panels.multipleCostoRiChartCollapsed = storedSettings.multipleCostoRiChartCollapsed === true;
  state.panels.tasasCrossCollapsed = storedSettings.tasasCrossCollapsed === true;
  state.panels.tasasVenCollapsed = storedSettings.tasasVenCollapsed === true;
  state.panels.tasasVrpCollapsed = storedSettings.tasasVrpCollapsed === true;
  state.panels.tasasRankCollapsed = storedSettings.tasasRankCollapsed === true;
  state.panels.tasasThetaCollapsed = storedSettings.tasasThetaCollapsed === true;
  state.panels.tasasSkewCollapsed = storedSettings.tasasSkewCollapsed === true;
  state.panels.tasasTemporalCollapsed = storedSettings.tasasTemporalCollapsed === true;
  state.panels.parametrosCollapsed = storedSettings.parametrosCollapsed === true;
  state.panels.griegasTableCollapsed = storedSettings.griegasTableCollapsed === true;
  state.panels.griegasSimpleTableCollapsed = storedSettings.griegasSimpleTableCollapsed === true;
  state.panels.griegasPriceChartCollapsed = storedSettings.griegasPriceChartCollapsed === true;
  state.panels.griegasIVChartCollapsed = storedSettings.griegasIVChartCollapsed === true;
  state.panels.griegasDeltaChartCollapsed = storedSettings.griegasDeltaChartCollapsed === true;
  state.panels.griegasGammaChartCollapsed = storedSettings.griegasGammaChartCollapsed === true;
  state.panels.griegasVegaChartCollapsed = storedSettings.griegasVegaChartCollapsed === true;
  state.panels.griegasThetaChartCollapsed = storedSettings.griegasThetaChartCollapsed === true;
  state.panels.showStatus = storedSettings.showStatus !== false;
  state.panels.showConfig = storedSettings.showConfig !== false;
  state.panels.showParametros = storedSettings.showParametros !== false;
  state.panels.showLegend = storedSettings.showLegend !== false;
  syncPanelUi();
  syncPanelCards();
}

function syncPanelCards() {
  elements.statusCard.hidden = !state.panels.showStatus;
  elements.configCard.hidden = !state.panels.showConfig;
  elements.parametrosCard.hidden = !state.panels.showParametros;
  elements.legendCard.hidden = !state.panels.showLegend;
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
      crossCount: Number(parsed.crossCount),
      strikeRange: parsed.strikeRange,
      viewMode: parsed.viewMode,
      autoRefreshEnabled: parsed.autoRefreshEnabled,
      autoRefreshSeconds: Number(parsed.autoRefreshSeconds),
      liveConnection: parsed.liveConnection,
      base1Type: parsed.base1Type,
      base2Type: parsed.base2Type,
      configCollapsed: parsed.configCollapsed,
      statusCollapsed: parsed.statusCollapsed,
      legendCollapsed: parsed.legendCollapsed,
      tableCollapsed: parsed.tableCollapsed,
      ratesChartCollapsed: parsed.ratesChartCollapsed,
      rateDiffChartCollapsed: parsed.rateDiffChartCollapsed,
      ratioChartCollapsed: parsed.ratioChartCollapsed,
      costoPrimaryChartCollapsed: parsed.costoPrimaryChartCollapsed,
      spreadChartCollapsed: parsed.spreadChartCollapsed,
      costoRiChartCollapsed: parsed.costoRiChartCollapsed,
      costoStraddleChartCollapsed: parsed.costoStraddleChartCollapsed,
      multipleTableCollapsed: parsed.multipleTableCollapsed,
      multipleRatioChartCollapsed: parsed.multipleRatioChartCollapsed,
      multipleCostoChartCollapsed: parsed.multipleCostoChartCollapsed,
      multipleSpreadChartCollapsed: parsed.multipleSpreadChartCollapsed,
      multipleCostoRiChartCollapsed: parsed.multipleCostoRiChartCollapsed,
      tasasCrossCollapsed: parsed.tasasCrossCollapsed,
      tasasVenCollapsed: parsed.tasasVenCollapsed,
      tasasVrpCollapsed: parsed.tasasVrpCollapsed,
      tasasRankCollapsed: parsed.tasasRankCollapsed,
      tasasThetaCollapsed: parsed.tasasThetaCollapsed,
      tasasSkewCollapsed: parsed.tasasSkewCollapsed,
      tasasTemporalCollapsed: parsed.tasasTemporalCollapsed,
      tasasPrimaCollapsed: parsed.tasasPrimaCollapsed,
      fechaDesde: parsed.fechaDesde ?? null,
      tasaR: Number(parsed.tasaR),
      parametrosCollapsed: parsed.parametrosCollapsed,
      griegasTableCollapsed: parsed.griegasTableCollapsed,
      griegasSimpleTableCollapsed: parsed.griegasSimpleTableCollapsed,
      griegasPriceChartCollapsed: parsed.griegasPriceChartCollapsed,
      griegasIVChartCollapsed: parsed.griegasIVChartCollapsed,
      griegasDeltaChartCollapsed: parsed.griegasDeltaChartCollapsed,
      griegasGammaChartCollapsed: parsed.griegasGammaChartCollapsed,
      griegasVegaChartCollapsed: parsed.griegasVegaChartCollapsed,
      griegasThetaChartCollapsed: parsed.griegasThetaChartCollapsed,
      griegasOptionType: parsed.griegasOptionType,
      griegasCruzar: parsed.griegasCruzar === true,
      griegasOptionType2: parsed.griegasOptionType2,
      griegasSelectedStrike: Number.isFinite(Number(parsed.griegasSelectedStrike)) && Number(parsed.griegasSelectedStrike) > 0 ? Number(parsed.griegasSelectedStrike) : null,
      griegasSelectedStrike2: Number.isFinite(Number(parsed.griegasSelectedStrike2)) && Number(parsed.griegasSelectedStrike2) > 0 ? Number(parsed.griegasSelectedStrike2) : null,
      showStatus: parsed.showStatus !== false,
      showConfig: parsed.showConfig !== false,
      showParametros: parsed.showParametros !== false,
      showLegend: parsed.showLegend !== false
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
      liveConnection: state.liveConnection,
      base1Type: state.optionTypes.base1,
      base2Type: state.optionTypes.base2,
      configCollapsed: state.panels.configCollapsed,
      statusCollapsed: state.panels.statusCollapsed,
      legendCollapsed: state.panels.legendCollapsed,
      tableCollapsed: state.panels.tableCollapsed,
      ratesChartCollapsed: state.panels.ratesChartCollapsed,
      rateDiffChartCollapsed: state.panels.rateDiffChartCollapsed,
      ratioChartCollapsed: state.panels.ratioChartCollapsed,
      costoPrimaryChartCollapsed: state.panels.costoPrimaryChartCollapsed,
      spreadChartCollapsed: state.panels.spreadChartCollapsed,
      costoRiChartCollapsed: state.panels.costoRiChartCollapsed,
      costoStraddleChartCollapsed: state.panels.costoStraddleChartCollapsed,
      multipleTableCollapsed: state.panels.multipleTableCollapsed,
      multipleRatioChartCollapsed: state.panels.multipleRatioChartCollapsed,
      multipleCostoChartCollapsed: state.panels.multipleCostoChartCollapsed,
      multipleSpreadChartCollapsed: state.panels.multipleSpreadChartCollapsed,
      multipleCostoRiChartCollapsed: state.panels.multipleCostoRiChartCollapsed,
      tasasCrossCollapsed: state.panels.tasasCrossCollapsed,
      tasasVenCollapsed: state.panels.tasasVenCollapsed,
      tasasVrpCollapsed: state.panels.tasasVrpCollapsed,
      tasasRankCollapsed: state.panels.tasasRankCollapsed,
      tasasThetaCollapsed: state.panels.tasasThetaCollapsed,
      tasasSkewCollapsed: state.panels.tasasSkewCollapsed,
      tasasTemporalCollapsed: state.panels.tasasTemporalCollapsed,
      tasasPrimaCollapsed: state.panels.tasasPrimaCollapsed,
      fechaDesde: state.selectedFechaDesde ?? null,
      tasaR: parseFloat(elements.tasaRInput.value) || 0,
      parametrosCollapsed: state.panels.parametrosCollapsed,
      griegasTableCollapsed: state.panels.griegasTableCollapsed,
      griegasSimpleTableCollapsed: state.panels.griegasSimpleTableCollapsed,
      griegasPriceChartCollapsed: state.panels.griegasPriceChartCollapsed,
      griegasIVChartCollapsed: state.panels.griegasIVChartCollapsed,
      griegasDeltaChartCollapsed: state.panels.griegasDeltaChartCollapsed,
      griegasGammaChartCollapsed: state.panels.griegasGammaChartCollapsed,
      griegasVegaChartCollapsed: state.panels.griegasVegaChartCollapsed,
      griegasThetaChartCollapsed: state.panels.griegasThetaChartCollapsed,
      griegasOptionType: state.griegasOptionType,
      griegasCruzar: state.griegasCruzar,
      griegasOptionType2: state.griegasOptionType2,
      griegasSelectedStrike: state.griegasSelectedStrike,
      griegasSelectedStrike2: state.griegasSelectedStrike2,
      showStatus: state.panels.showStatus,
      showConfig: state.panels.showConfig,
      showParametros: state.panels.showParametros,
      showLegend: state.panels.showLegend
    }));
  } catch (error) {
    console.warn("No se pudo guardar localStorage", error);
  }
}

function setViewMode(mode) {
  state.viewMode = ["chart", "multiple", "chain", "ratio", "tasas", "griegas"].includes(mode) ? mode : "table";
  syncViewModeUi();
  persistSettings({
    base1: Number(elements.base1Select.value),
    base2: Number(elements.base2Select.value),
    lotes: clampInteger(elements.lotesInput.value, 1, 500, CONFIG.defaultLotes),
    relation: clampDecimal(elements.relationInput.value, 0, 10, CONFIG.defaultRelation),
    rateDays: clampInteger(elements.rateDaysInput.value, 1, 5000, CONFIG.defaultRateDays),
    crossCount: clampInteger(elements.crossCountInput.value, 0, 20, CONFIG.defaultCrossCount),
    strikeRange: elements.strikeRangeSelect.value
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
  updateOptionTypeButton(elements.griegasTypeButton, state.griegasOptionType);
}

function syncGriegasCruzarUi() {
  const on = state.griegasCruzar;
  elements.griegasSwapField.hidden  = !on;
  elements.griegasBase2Field.hidden = !on;
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
    rateDays: clampInteger(elements.rateDaysInput.value, 1, 5000, CONFIG.defaultRateDays),
    crossCount: clampInteger(elements.crossCountInput.value, 0, 20, CONFIG.defaultCrossCount),
    strikeRange: elements.strikeRangeSelect.value
  });
  syncStatus();
}

function handleLiveConnectionChange() {
  state.liveConnection = getSafeLiveConnection(elements.liveConnectionSelect.value);
  elements.liveConnectionSelect.value = state.liveConnection;
  persistSettings({
    base1: Number(elements.base1Select.value),
    base2: Number(elements.base2Select.value),
    lotes: clampInteger(elements.lotesInput.value, 1, 500, CONFIG.defaultLotes),
    relation: clampDecimal(elements.relationInput.value, 0, 10, CONFIG.defaultRelation),
    rateDays: clampInteger(elements.rateDaysInput.value, 1, 5000, CONFIG.defaultRateDays),
    crossCount: clampInteger(elements.crossCountInput.value, 0, 20, CONFIG.defaultCrossCount),
    strikeRange: elements.strikeRangeSelect.value
  });
  void loadLiveData();
}

function getSafeLiveConnection(value) {
  return CONFIG.allowedLiveConnections.includes(value)
    ? value
    : CONFIG.defaultLiveConnection;
}

function getLiveUrl() {
  return `${CONFIG.liveUrlBase}&sheet=${encodeURIComponent(state.liveConnection)}`;
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
    rateDays: clampInteger(elements.rateDaysInput.value, 1, 5000, CONFIG.defaultRateDays),
    crossCount: clampInteger(elements.crossCountInput.value, 0, 20, CONFIG.defaultCrossCount),
    strikeRange: elements.strikeRangeSelect.value
  });
}

function syncPanelUi() {
  syncSinglePanel(elements.configCollapseButton, elements.configPanelBody, state.panels.configCollapsed);
  syncSinglePanel(elements.parametrosCollapseButton, elements.parametrosPanelBody, state.panels.parametrosCollapsed);
  syncSinglePanel(elements.statusCollapseButton, elements.statusPanelBody, state.panels.statusCollapsed);
  syncSinglePanel(elements.legendCollapseButton, elements.legendPanelBody, state.panels.legendCollapsed);
  syncSinglePanel(elements.tableCollapseButton, elements.tablePanelBody, state.panels.tableCollapsed);
  syncSinglePanel(elements.ratesChartCollapseButton, elements.ratesChartPanelBody, state.panels.ratesChartCollapsed);
  syncSinglePanel(elements.rateDiffChartCollapseButton, elements.rateDiffChartPanelBody, state.panels.rateDiffChartCollapsed);
  syncSinglePanel(elements.ratioChartCollapseButton, elements.ratioChartPanelBody, state.panels.ratioChartCollapsed);
  syncSinglePanel(elements.costoPrimaryChartCollapseButton, elements.costoPrimaryChartPanelBody, state.panels.costoPrimaryChartCollapsed);
  syncSinglePanel(elements.spreadChartCollapseButton, elements.spreadChartPanelBody, state.panels.spreadChartCollapsed);
  syncSinglePanel(elements.costoRiChartCollapseButton, elements.costoRiChartPanelBody, state.panels.costoRiChartCollapsed);
  syncSinglePanel(elements.costoStraddleChartCollapseButton, elements.costoStraddleChartPanelBody, state.panels.costoStraddleChartCollapsed);
  syncSinglePanel(elements.multipleTableCollapseButton, elements.multipleTablePanelBody, state.panels.multipleTableCollapsed);
  syncSinglePanel(elements.multipleRatioChartCollapseButton, elements.multipleRatioChartPanelBody, state.panels.multipleRatioChartCollapsed);
  syncSinglePanel(elements.multipleCostoChartCollapseButton, elements.multipleCostoChartPanelBody, state.panels.multipleCostoChartCollapsed);
  syncSinglePanel(elements.multipleSpreadChartCollapseButton, elements.multipleSpreadChartPanelBody, state.panels.multipleSpreadChartCollapsed);
  syncSinglePanel(elements.multipleCostoRiChartCollapseButton, elements.multipleCostoRiChartPanelBody, state.panels.multipleCostoRiChartCollapsed);
  syncSinglePanel(elements.tasasCrossCollapseButton, elements.tasasCrossChartPanelBody, state.panels.tasasCrossCollapsed);
  syncSinglePanel(elements.tasasVenCollapseButton, elements.tasasVenChartPanelBody, state.panels.tasasVenCollapsed);
  syncSinglePanel(elements.tasasVrpCollapseButton, elements.tasasVrpChartPanelBody, state.panels.tasasVrpCollapsed);
  syncSinglePanel(elements.tasasRankCollapseButton, elements.tasasRankChartPanelBody, state.panels.tasasRankCollapsed);
  syncSinglePanel(elements.tasasThetaCollapseButton, elements.tasasThetaChartPanelBody, state.panels.tasasThetaCollapsed);
  syncSinglePanel(elements.tasasSkewCollapseButton, elements.tasasSkewChartPanelBody, state.panels.tasasSkewCollapsed);
  syncSinglePanel(elements.tasasTemporalCollapseButton, elements.tasasTemporalChartPanelBody, state.panels.tasasTemporalCollapsed);
  syncSinglePanel(elements.tasasPrimaCollapseButton, elements.tasasPrimaChartPanelBody, state.panels.tasasPrimaCollapsed);
  syncSinglePanel(elements.griegasTableCollapseButton, elements.griegasTablePanelBody, state.panels.griegasTableCollapsed);
  syncSinglePanel(elements.griegasSimpleTableCollapseButton, elements.griegasSimpleTablePanelBody, state.panels.griegasSimpleTableCollapsed);
  syncSinglePanel(elements.griegasPriceChartCollapseButton, elements.griegasPriceChartPanelBody, state.panels.griegasPriceChartCollapsed);
  syncSinglePanel(elements.griegasIVChartCollapseButton, elements.griegasIVChartPanelBody, state.panels.griegasIVChartCollapsed);
  syncSinglePanel(elements.griegasDeltaChartCollapseButton, elements.griegasDeltaChartPanelBody, state.panels.griegasDeltaChartCollapsed);
  syncSinglePanel(elements.griegasGammaChartCollapseButton, elements.griegasGammaChartPanelBody, state.panels.griegasGammaChartCollapsed);
  syncSinglePanel(elements.griegasVegaChartCollapseButton, elements.griegasVegaChartPanelBody, state.panels.griegasVegaChartCollapsed);
  syncSinglePanel(elements.griegasThetaChartCollapseButton, elements.griegasThetaChartPanelBody, state.panels.griegasThetaChartCollapsed);
}

function syncSinglePanel(button, body, collapsed) {
  button.setAttribute("aria-expanded", String(!collapsed));
  body.hidden = collapsed;
  button.closest("section")?.classList.toggle("is-collapsed", collapsed);

  if (body === elements.statusPanelBody) {
    elements.statusCollapsedSummary.hidden = !collapsed;
  }

  if (body === elements.parametrosPanelBody) {
    elements.parametrosCollapsedSummary.hidden = !collapsed;
  }

  if (body === elements.legendPanelBody) {
    elements.legendCollapsedSummary.hidden = !collapsed;
  }

  if (body === elements.tablePanelBody) {
    elements.tableCollapsedPreview.hidden = !collapsed;
  }
}

function renderCollapsedTablePreview(rows, seriesStats, combinationMode) {
  const liveRows = rows.filter((row) => row.isLive);
  const latestLiveRow = liveRows.at(-1) ?? rows.at(-1);

  if (!latestLiveRow) {
    elements.tableCollapsedPreview.innerHTML = `
      <div class="table-collapsed-empty">No hay registro live para mostrar.</div>
    `;
    return;
  }

  elements.tableCollapsedPreview.innerHTML = `
    <div class="table-wrap table-wrap-collapsed">
      <table class="collapsed-preview-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>GGAL</th>
            <th>${escapeHtml(elements.base1Header.textContent || "Base 1")}</th>
            <th>${escapeHtml(elements.base2Header.textContent || "Base 2")}</th>
            <th>${escapeHtml(elements.veBase1Header.textContent || "VE Base1")}</th>
            <th>${escapeHtml(elements.veBase2Header.textContent || "VE Base2")}</th>
            <th>${escapeHtml(elements.rateBase1Header.textContent || "Tasa Base1")}</th>
            <th>${escapeHtml(elements.rateBase2Header.textContent || "Tasa Base2")}</th>
            <th>Diferencial</th>
            <th>Ratio</th>
            ${combinationMode === "straddle"
              ? `<th>${escapeHtml(elements.costoStraddleHeader.textContent || "Costo Straddle")}</th>`
              : `
                <th>${escapeHtml(elements.costoPrimaryHeader.textContent || "Costo Bull")}</th>
                <th>${escapeHtml(elements.spreadHeader.textContent || "Spread")}</th>
                <th>${escapeHtml(elements.costoRiHeader.textContent || "Costo RC/RI")}</th>
              `}
          </tr>
        </thead>
        <tbody>
          ${buildRowMarkup(latestLiveRow, seriesStats, combinationMode)}
        </tbody>
      </table>
    </div>
  `;
}

function scheduleAutoRefresh() {
  if (state.autoRefreshTimerId) {
    window.clearTimeout(state.autoRefreshTimerId);
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

  function scheduleNext() {
    if (!state.autoRefreshEnabled) return;
    state.nextRefreshAt = new Date(Date.now() + (state.autoRefreshSeconds * 1000));
    syncStatus();
    state.autoRefreshTimerId = window.setTimeout(async () => {
      await loadLiveData();
      scheduleNext();
    }, state.autoRefreshSeconds * 1000);
  }

  scheduleNext();

  state.countdownTimerId = window.setInterval(() => {
    syncStatus();
  }, 1000);
}

function syncViewModeUi() {
  const isTable = state.viewMode === "table";
  const isChart = state.viewMode === "chart";
  const isMultiple = state.viewMode === "multiple";
  const isChain = state.viewMode === "chain";
  const isRatio = state.viewMode === "ratio";
  const isTasas = state.viewMode === "tasas";
  const isGreigas = state.viewMode === "griegas";
  elements.tableModeButton.classList.toggle("is-active", isTable);
  elements.chartModeButton.classList.toggle("is-active", isChart);
  elements.multipleModeButton.classList.toggle("is-active", isMultiple);
  elements.chainModeButton.classList.toggle("is-active", isChain);
  elements.ratioModeButton.classList.toggle("is-active", isRatio);
  elements.tasasModeButton.classList.toggle("is-active", isTasas);
  elements.griegasModeButton.classList.toggle("is-active", isGreigas);
  elements.tableModeButton.setAttribute("aria-selected", String(isTable));
  elements.chartModeButton.setAttribute("aria-selected", String(isChart));
  elements.multipleModeButton.setAttribute("aria-selected", String(isMultiple));
  elements.chainModeButton.setAttribute("aria-selected", String(isChain));
  elements.ratioModeButton.setAttribute("aria-selected", String(isRatio));
  elements.tasasModeButton.setAttribute("aria-selected", String(isTasas));
  elements.griegasModeButton.setAttribute("aria-selected", String(isGreigas));
  elements.tableSection.hidden = !isTable;
  elements.chartsSection.hidden = !isChart;
  elements.multipleSection.hidden = !isMultiple;
  elements.chainSection.hidden = !isChain;
  elements.ratioSection.hidden = !isRatio;
  elements.tasasSection.hidden = !isTasas;
  elements.griegasSection.hidden = !isGreigas;
  elements.tableSection.classList.toggle("is-hidden-view", !isTable);
  elements.chartsSection.classList.toggle("is-hidden-view", !isChart);
  elements.multipleSection.classList.toggle("is-hidden-view", !isMultiple);
  elements.chainSection.classList.toggle("is-hidden-view", !isChain);
  elements.ratioSection.classList.toggle("is-hidden-view", !isRatio);
  elements.tasasSection.classList.toggle("is-hidden-view", !isTasas);
  elements.griegasSection.classList.toggle("is-hidden-view", !isGreigas);
  const isChainLike = isChain || isRatio || isGreigas;
  elements.strikeRangeField.hidden = !isChainLike;
  elements.fechaDesdeField.hidden = isChain || isRatio;
  elements.base1Field.hidden = isChainLike;
  elements.swapField.hidden = isChainLike;
  elements.base2Field.hidden = isChainLike;
  elements.lotesField.hidden = isChainLike || isTasas;
  elements.relationField.hidden = isChainLike || isTasas;
  elements.rateDaysField.hidden = isChainLike || isTasas;
  elements.crossCountField.hidden = !isMultiple;
  elements.griegasTypeField.hidden = !isGreigas;
  elements.griegasSwapField.hidden  = !isGreigas || !state.griegasCruzar;
  elements.griegasBase2Field.hidden = !isGreigas || !state.griegasCruzar;
  elements.tasaRField.hidden = !isGreigas;
  elements.ggalOverrideField.hidden = !isGreigas;
  elements.dteField.hidden = !isGreigas;
  document.getElementById("legendDefault").hidden = isChain || isRatio || isTasas || isGreigas;
  document.getElementById("legendSpread").hidden  = !isChain;
  document.getElementById("legendRatio").hidden   = !isRatio;
  document.getElementById("legendGreeks").hidden  = !isGreigas;
  if (isChain) {
    elements.legendCollapsedSummary.innerHTML = `<span class="summary-dots">
      <span class="summary-dot-item"><span class="chain-badge-green legend-badge-sample"></span><span>&lt;33%</span></span>
      <span class="summary-dot-item"><span class="chain-badge-yellow legend-badge-sample"></span><span>33&ndash;66%</span></span>
      <span class="summary-dot-item"><span class="chain-badge-red legend-badge-sample"></span><span>&gt;66%</span></span>
    </span>`;
  } else if (isRatio) {
    elements.legendCollapsedSummary.innerHTML = `<span class="summary-dots">
      <span class="summary-dot-item"><span class="chain-badge-green legend-badge-sample"></span><span>&lt;1.5x</span></span>
      <span class="summary-dot-item"><span class="chain-badge-yellow legend-badge-sample"></span><span>1.5&ndash;2.2x</span></span>
      <span class="summary-dot-item"><span class="chain-badge-red legend-badge-sample"></span><span>&gt;2.2x</span></span>
    </span>`;
  } else if (isGreigas) {
    elements.legendCollapsedSummary.innerHTML = `<span class="summary-dots">
      <span class="summary-dot-item"><span>&Delta;</span><span>Delta</span></span>
      <span class="summary-dot-item"><span>&Gamma;</span><span>Gamma</span></span>
      <span class="summary-dot-item"><span>&nu;</span><span>Vega</span></span>
      <span class="summary-dot-item"><span>&Theta;</span><span>Theta</span></span>
    </span>`;
  } else {
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
  syncParametrosSummary();
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
  elements.costoRiChartTitle.textContent = `Costo RC/RI ${base1Label}/${base2Label} (-${lotesLabel}*${relationLabel})`;
  elements.costoStraddleChartTitle.textContent = `Costo Straddle ${base1Label}/${base2Label}`;
}

function updateMultipleTitles(base1Strike, base2Strike, lotes, relation, combinationMode) {
  const base1Label = Number.isFinite(base1Strike) ? formatOptionLabel(state.optionTypes.base1, base1Strike) : "Base1";
  const base2Label = Number.isFinite(base2Strike) ? formatOptionLabel(state.optionTypes.base2, base2Strike) : "Base2";
  const pairLabel = `${base1Label}/${base2Label}`;
  const relationFactor = lotes * relation;
  const lotesLabel = Number.isFinite(lotes) ? Math.round(lotes) : 0;
  const relationLabel = Number.isFinite(relationFactor) ? formatCompactNumber(relationFactor, 2) : "0";
  const primaryCostLabel = combinationMode === "straddle"
    ? "Costo Straddle"
    : combinationMode === "bear"
      ? "Costo Bear"
      : "Costo Bull";

  elements.multipleRatioChartTitle.textContent = `Ratio multiples ${pairLabel}`;
  elements.multipleCostoChartTitle.textContent = `${primaryCostLabel} multiples ${pairLabel}`;
  elements.multipleSpreadChartTitle.textContent = `Spread % multiples ${pairLabel}`;
  elements.multipleCostoRiChartTitle.textContent = `Costo RC/RI multiples ${pairLabel} (-${lotesLabel}*${relationLabel})`;
}

function renderMultipleView(base1Strike, base2Strike, lotes, relation, rateDays, crossCount, combinationMode) {
  const series = buildMultipleSeries(base1Strike, base2Strike, lotes, relation, rateDays, crossCount);
  state.multiSeries = series;
  syncMultipleSeriesExpandedState(series);

  const rowsHtml = series.map((seriesEntry) => buildMultipleSeriesGroupMarkup(seriesEntry, combinationMode)).join("");

  elements.multipleTableBody.innerHTML = rowsHtml || `
    <tr>
      <td colspan="${combinationMode === "straddle" ? "7" : "9"}" class="placeholder">No hay cruces suficientes para mostrar en modo multiple.</td>
    </tr>
  `;

  renderMultipleCharts(series, combinationMode);
}

function buildMultipleSeries(base1Strike, base2Strike, lotes, relation, rateDays, crossCount) {
  if (!Number.isFinite(base1Strike) || !Number.isFinite(base2Strike)) {
    return [];
  }

  const sortedStrikes = state.availableStrikes.slice().sort((left, right) => left - right);
  const base1Index = sortedStrikes.indexOf(base1Strike);
  const base2Index = sortedStrikes.indexOf(base2Strike);

  if (base1Index === -1 || base2Index === -1) {
    return [];
  }

  const backwardCount = Math.floor(crossCount / 2);
  const forwardCount = Math.ceil(crossCount / 2);
  const offsets = [];

  for (let offset = backwardCount; offset >= 1; offset -= 1) {
    offsets.push(-offset);
  }

  offsets.push(0);

  for (let offset = 1; offset <= forwardCount; offset += 1) {
    offsets.push(offset);
  }

  return offsets
    .map((offset) => {
      const strike1 = sortedStrikes[base1Index + offset];
      const strike2 = sortedStrikes[base2Index + offset];

      if (!Number.isFinite(strike1) || !Number.isFinite(strike2)) {
        return null;
      }

      const rows = buildRowsByDate(state.historyByDate, strike1, strike2)
        .map((row) => addDerivedMetrics(row, lotes, relation, rateDays, state.optionTypes.base1, state.optionTypes.base2));

      if (!rows.length) {
        return null;
      }

      return {
        key: `${strike1}-${strike2}`,
        offset,
        base1Strike: strike1,
        base2Strike: strike2,
        label: formatMultipleSeriesLabel(offset, strike1, strike2),
        rows
      };
    })
    .filter(Boolean);
}

function formatMultipleSeriesLabel(offset, base1Strike, base2Strike) {
  const pairLabel = `${formatOptionLabel(state.optionTypes.base1, base1Strike, false)}/${formatOptionLabel(state.optionTypes.base2, base2Strike, false)}`;

  if (offset === 0) {
    return `Serie Base ${pairLabel}`;
  }

  return offset < 0
    ? `Serie${offset}: ${pairLabel}`
    : `Serie+${offset}: ${pairLabel}`;
}

function buildMultipleRowMarkup(seriesEntry, row, seriesStats, combinationMode) {
  const sharedCells = `
    <td>${renderDateCell(row)}</td>
    <td>${formatGroupedNumber(row.ggal, 2)}</td>
    <td>${formatNumber(row.lastBase1, 2)}</td>
    <td>${formatNumber(row.lastBase2, 2)}</td>
    <td>${renderMetricCell(formatNumber(row.ratio, 3), row.ratio, seriesStats.ratio)}</td>
  `;

  const metricCells = combinationMode === "straddle"
    ? `<td>${renderMetricCell(formatGroupedCurrency(row.costoStraddle), row.costoStraddle, seriesStats.costoStraddle)}</td>`
    : `
      <td>${renderMetricCell(formatGroupedCurrency(row.costoBull), row.costoBull, seriesStats.costoBull)}</td>
      <td>${renderMetricCell(formatPercent(row.spread), row.spread, seriesStats.spread)}</td>
      <td>${renderMetricCell(formatGroupedCurrency(row.costoRi), row.costoRi, seriesStats.costoRi)}</td>
    `;

  return `${sharedCells}${metricCells}`;
}

function buildMultipleSeriesGroupMarkup(seriesEntry, combinationMode) {
  const orderedRows = seriesEntry.rows.slice().sort((left, right) => left.fechaRaw.localeCompare(right.fechaRaw));
  const stats = buildSeriesStats(orderedRows);
  const latestRow = orderedRows.at(-1);
  const isExpanded = state.multiSeriesExpanded[seriesEntry.key] === true;
  const summaryCells = buildMultipleRowMarkup(seriesEntry, latestRow, stats, combinationMode);
  const detailRows = isExpanded
    ? orderedRows
      .slice(0, -1)
      .map((row) => buildMultipleDetailRowMarkup(seriesEntry, row, stats, combinationMode))
      .join("")
    : "";
  const summaryRow = `
    <tr class="multiple-summary-row ${latestRow.isLive ? "live-row" : ""}">
      <td>
        <button
          type="button"
          class="series-toggle-button"
          data-series-key="${escapeHtml(seriesEntry.key)}"
          aria-expanded="${String(isExpanded)}"
        >
          <span class="series-toggle-symbol">${isExpanded ? "-" : "+"}</span>
          <span>${escapeHtml(seriesEntry.label)}</span>
        </button>
      </td>
      ${summaryCells}
    </tr>
  `;

  return isExpanded
    ? `${detailRows}${summaryRow}`
    : summaryRow;
}

function buildMultipleDetailRowMarkup(seriesEntry, row, seriesStats, combinationMode) {
  return `
    <tr class="multiple-detail-row ${row.isLive ? "live-row" : ""}">
      <td class="series-detail-label">${escapeHtml(seriesEntry.label)}</td>
      ${buildMultipleRowMarkup(seriesEntry, row, seriesStats, combinationMode)}
    </tr>
  `;
}

function syncMultipleSeriesExpandedState(series) {
  const nextExpandedState = {};

  series.forEach((seriesEntry) => {
    nextExpandedState[seriesEntry.key] = state.multiSeriesExpanded[seriesEntry.key] === true;
  });

  state.multiSeriesExpanded = nextExpandedState;
}

function handleMultipleTableClick(event) {
  const toggleButton = event.target.closest(".series-toggle-button");

  if (!toggleButton) {
    return;
  }

  const seriesKey = toggleButton.dataset.seriesKey;

  if (!seriesKey) {
    return;
  }

  state.multiSeriesExpanded[seriesKey] = !(state.multiSeriesExpanded[seriesKey] === true);
  renderTable();
}

function renderMultipleCharts(series, combinationMode) {
  renderAggregateLineChart("multipleRatio", elements.multipleRatioChart, series, {
    title: elements.multipleRatioChartTitle.textContent,
    valueKey: "ratio",
    labelFormatter: (value) => formatNumber(value, 3),
    yTickFormatter: (value) => formatNumber(value, 3)
  });

  const primaryMetricKey = combinationMode === "straddle" ? "costoStraddle" : "costoBull";
  renderAggregateLineChart("multipleCosto", elements.multipleCostoChart, series, {
    title: elements.multipleCostoChartTitle.textContent,
    valueKey: primaryMetricKey,
    labelFormatter: (value) => formatGroupedCurrency(value),
    yTickFormatter: (value) => formatGroupedNumber(value, 2)
  });

  renderAggregateLineChart("multipleSpread", elements.multipleSpreadChart, series, {
    title: elements.multipleSpreadChartTitle.textContent,
    valueKey: "spread",
    labelFormatter: (value) => formatPercent(value),
    yTickFormatter: (value) => formatPercent(value),
    skip: combinationMode === "straddle"
  });

  renderAggregateLineChart("multipleCostoRi", elements.multipleCostoRiChart, series, {
    title: elements.multipleCostoRiChartTitle.textContent,
    valueKey: "costoRi",
    labelFormatter: (value) => formatGroupedCurrency(value),
    yTickFormatter: (value) => formatGroupedNumber(value, 2),
    skip: combinationMode === "straddle"
  });
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

function renderAggregateLineChart(chartKey, canvas, seriesList, config) {
  if (config.skip) {
    destroyChart(chartKey);
    return;
  }

  const labels = collectSeriesLabels(seriesList);

  if (!labels.length || !seriesList.length) {
    destroyChart(chartKey);
    return;
  }

  const palette = ["#4cb3ff", "#ff9f43", "#19c37d", "#b388ff", "#f0c24b", "#ff6b8a", "#67e8f9", "#f97316"];
  const datasets = [];
  const pluginSeries = [];

  seriesList.forEach((seriesEntry, index) => {
    const pointMap = new Map(seriesEntry.rows.map((row) => [formatChartDate(row.fecha), row]));
    const values = labels.map((label) => {
      const row = pointMap.get(label);
      return row ? row[config.valueKey] : NaN;
    });
    const stats = getMetricStats(values);
    const specialIndices = {
      min: values.findIndex((value) => isClose(value, stats.min)),
      max: values.findIndex((value) => isClose(value, stats.max)),
      mean: values.findIndex((value) => isClose(value, stats.nearestToMedian))
    };
    const liveIndex = labels.findIndex((label) => pointMap.get(label)?.isLive);
    const lastFiniteIndex = getLastFiniteIndex(values, liveIndex);
    const color = palette[index % palette.length];

    datasets.push({
      label: `${seriesEntry.label} mediana`,
      data: values.map((value) => Number.isFinite(value) ? stats.median : NaN),
      borderColor: withAlphaFromHex(color, 0.6),
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
      label: seriesEntry.label,
      data: values,
      borderColor: color,
      backgroundColor: withAlphaFromHex(color, 0.18),
      borderWidth: 2,
      segment: {
        borderDash: (context) => getLiveSegmentBorderDash(context, liveIndex)
      },
      tension: 0.28,
      fill: false,
      pointRadius: (context) => getChartPointRadius(context.dataIndex, specialIndices, liveIndex, lastFiniteIndex),
      pointHoverRadius: (context) => Math.max(5, getChartPointRadius(context.dataIndex, specialIndices, liveIndex, lastFiniteIndex) + 1),
      pointBorderWidth: (context) => isHighlightedPoint(context.dataIndex, specialIndices, liveIndex, lastFiniteIndex) ? 2 : 0,
      pointBorderColor: "#d8e6ff",
      pointBackgroundColor: (context) => getChartPointColor(context.dataIndex, specialIndices, liveIndex, lastFiniteIndex),
      spanGaps: true,
      order: (index * 2) + 1
    });

    pluginSeries.push({
      values,
      specialIndices,
      liveIndex,
      lastFiniteIndex
    });
  });

  if (!datasets.some((dataset) => dataset.data.some((value) => Number.isFinite(value)))) {
    destroyChart(chartKey);
    return;
  }

  captureChartVisibilityState(chartKey);
  applyChartVisibilityState(chartKey, datasets);
  destroyChart(chartKey);

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
          onClick: handlePersistentLegendClick,
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
    plugins: [createAggregatePointLabelPlugin(chartKey, pluginSeries, config)]
  });
}

function destroyChart(chartKey) {
  if (state.charts[chartKey]) {
    state.charts[chartKey].destroy();
    delete state.charts[chartKey];
  }
}

function captureChartVisibilityState(chartKey) {
  const chart = state.charts[chartKey];

  if (!chart) {
    return;
  }

  const hiddenLabels = {};

  chart.data.datasets.forEach((dataset, datasetIndex) => {
    const label = getVisibilityLabel(dataset.label);

    if (!label) {
      return;
    }

    if (!chart.isDatasetVisible(datasetIndex)) {
      hiddenLabels[label] = true;
    }
  });

  state.chartVisibility[chartKey] = hiddenLabels;
}

function applyChartVisibilityState(chartKey, datasets) {
  const hiddenLabels = state.chartVisibility[chartKey];

  if (!hiddenLabels) {
    return;
  }

  datasets.forEach((dataset) => {
    const label = getVisibilityLabel(dataset.label);

    if (label && hiddenLabels[label]) {
      dataset.hidden = true;
    }
  });
}

function getVisibilityLabel(label) {
  if (typeof label !== "string" || !label) {
    return "";
  }

  return label.replace(" mediana", "");
}

function handlePersistentLegendClick(event, legendItem, legend) {
  const chart = legend.chart;
  const datasetIndex = legendItem.datasetIndex;
  const dataset = chart.data.datasets[datasetIndex];
  const label = getVisibilityLabel(dataset?.label);

  if (!label) {
    return;
  }

  const matchingDatasetIndices = chart.data.datasets.reduce((indices, currentDataset, currentIndex) => {
    if (getVisibilityLabel(currentDataset.label) === label) {
      indices.push(currentIndex);
    }

    return indices;
  }, []);

  const shouldHide = matchingDatasetIndices.some((index) => chart.isDatasetVisible(index));

  matchingDatasetIndices.forEach((index) => {
    chart.setDatasetVisibility(index, !shouldHide);
  });

  const chartKey = Object.entries(state.charts).find(([, currentChart]) => currentChart === chart)?.[0];

  if (chartKey) {
    state.chartVisibility[chartKey] = state.chartVisibility[chartKey] || {};

    if (shouldHide) {
      state.chartVisibility[chartKey][label] = true;
    } else {
      delete state.chartVisibility[chartKey][label];
    }
  }

  chart.update();
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

function collectSeriesLabels(seriesList) {
  return Array.from(new Set(
    seriesList.flatMap((seriesEntry) => seriesEntry.rows.map((row) => formatChartDate(row.fecha)))
  )).sort();
}

function getLastFiniteIndex(values, liveIndex) {
  if (liveIndex >= 0) {
    return -1;
  }

  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (Number.isFinite(values[index])) {
      return index;
    }
  }

  return -1;
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

function createAggregatePointLabelPlugin(chartKey, seriesEntries, config) {
  return {
    id: `pointLabels-${chartKey}`,
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      ctx.save();
      ctx.font = "12px Barlow, sans-serif";

      seriesEntries.forEach((series, seriesIndex) => {
        const datasetIndex = (seriesIndex * 2) + 1;
        const datasetMeta = chart.getDatasetMeta(datasetIndex);

        if (!datasetMeta || !datasetMeta.data || !chart.isDatasetVisible(datasetIndex)) {
          return;
        }

        datasetMeta.data.forEach((element, index) => {
          const value = series.values[index];

          if (!Number.isFinite(value) || !isHighlightedPoint(index, series.specialIndices, series.liveIndex, series.lastFiniteIndex)) {
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
                : index === series.liveIndex
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
  const liveStatusText = `Estado Live: ${renderStatusState(state.liveStatus)} (${state.liveConnection})`;
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

  if (state.isLoadingLive) {
    return "...";
  }

  const remainingMs = state.nextRefreshAt.getTime() - Date.now();

  if (remainingMs <= 0) {
    return "0s";
  }

  return `${Math.ceil(remainingMs / 1000)}s`;
}

function parseHistoryPayload(payload, vencimientoFilter = null) {
  if (!payload || !Array.isArray(payload.values) || payload.values.length < 2) {
    return {
      historyByDate: [],
      availableStrikes: [],
      availableVencimientos: [],
      sourceStats: { totalRows: 0, totalDates: 0 }
    };
  }

  const strikes = new Set();
  const vencimientos = new Set();
  const byDate = new Map();
  let totalRows = 0;

  payload.values.slice(1).forEach((rawRow) => {
    const row = normalizeSourceRow(rawRow);

    if (!row) {
      return;
    }

    if ((row.isCall || row.isPut) && row.vencimiento) {
      vencimientos.add(row.vencimiento);

      if (vencimientoFilter && row.vencimiento !== vencimientoFilter) {
        return;
      }
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
    availableVencimientos: Array.from(vencimientos).sort(),
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

  const isCall = type === "call";
  const isPut = type === "put";

  return {
    fechaRaw,
    especie,
    type,
    strike,
    last,
    isUnderlying: especie === "GGAL" || type === "subyacente",
    isCall,
    isPut,
    vencimiento: (isCall || isPut) ? getVencimientoFromTicker(especie) : null
  };
}

function parseLivePayload(payload, todayKey, fallbackGgal) {
  const rows = Array.isArray(payload?.values)
    ? payload.values
    : Array.isArray(payload)
      ? payload
      : [];

  const headerMap = getLiveHeaderMap(rows[0]);
  const calls = {};
  const puts = {};
  let liveGgal = NaN;
  rows.forEach((rawRow, index) => {
    if (!Array.isArray(rawRow) || (headerMap && index === 0)) {
      return;
    }

    if (index === 0 && String(rawRow[0] ?? "").trim().toUpperCase() === "STRIKE") {
      return;
    }

    const row = normalizeLiveRow(rawRow, headerMap);

    if (!row) {
      return;
    }

    const isGgal = row.isUnderlying
      || (row.isCall && row.ticker.startsWith("GFGC"))
      || (row.isPut && row.ticker.startsWith("GFGV"));

    if (!isGgal) {
      return;
    }


    if (row.isUnderlying) {
      liveGgal = row.last;
    }

    if (row.isCall && Number.isFinite(row.strike)) {
      calls[strikeKey(row.strike)] = row.last;
      return;
    }

    if (row.isPut && Number.isFinite(row.strike)) {
      puts[strikeKey(row.strike)] = row.last;
    }
  });

  if (!Object.keys(calls).length && !Object.keys(puts).length) {
    return null;
  }

  return {
    fechaRaw: todayKey,
    ggal: Number.isFinite(liveGgal) ? liveGgal : fallbackGgal,
    calls,
    puts
  };
}

function getLiveHeaderMap(headerRow) {
  if (!Array.isArray(headerRow)) {
    return null;
  }

  const normalizedHeaders = headerRow.map((value) => normalizeHeaderLabel(value));

  if (!normalizedHeaders.some(Boolean)) {
    return null;
  }

  const tickerIndex = findHeaderIndex(normalizedHeaders, ["ticker", "especie", "simbolo", "symbol"]);
  const typeIndex = findHeaderIndex(normalizedHeaders, ["tipo", "type"]);
  const strikeIndex = findHeaderIndex(normalizedHeaders, ["strike", "base", "ejercicio"]);
  const lastIndex = findHeaderIndex(normalizedHeaders, ["last", "ultimo", "precio", "cotizacion", "cierre"]);

  if ([tickerIndex, typeIndex, strikeIndex, lastIndex].every((index) => index < 0)) {
    return null;
  }

  return {
    tickerIndex,
    typeIndex,
    strikeIndex,
    lastIndex
  };
}

function normalizeLiveRow(rawRow, headerMap) {
  const strikeCell = getLiveCellValue(rawRow, headerMap?.strikeIndex, 0);
  const tickerCell = getLiveCellValue(rawRow, headerMap?.tickerIndex, headerMap?.strikeIndex ?? 0);
  const typeCell = getLiveCellValue(rawRow, headerMap?.typeIndex, 1);
  const strikeLabel = String(strikeCell ?? "").trim().toUpperCase();
  const ticker = String(tickerCell ?? "").trim().toUpperCase();
  const type = String(typeCell ?? "").trim().toLowerCase();
  const strike = parseLocaleNumber(strikeCell);
  const last = parseLocaleNumber(getLiveCellValue(rawRow, headerMap?.lastIndex, 4));

  if (!Number.isFinite(last)) {
    return null;
  }

  return {
    strikeLabel,
    ticker,
    type,
    strike,
    last,
    isUnderlying: strikeLabel === "GGAL" && type === "suby",
    isCall: type === "call",
    isPut: type === "put"
  };
}

function getLiveCellValue(rawRow, headerIndex, fallbackIndex) {
  if (Number.isInteger(headerIndex) && headerIndex >= 0) {
    return rawRow[headerIndex];
  }

  return rawRow[fallbackIndex];
}

function findHeaderIndex(headers, aliases) {
  return headers.findIndex((header) => aliases.some((alias) => header.includes(alias)));
}

function normalizeHeaderLabel(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function strikeKey(value) {
  return String(Math.round(Number(value)));
}

function isValidRow(row) {
  return row.fecha && Number.isFinite(row.ggal) && Number.isFinite(row.strikeBase1) &&
    Number.isFinite(row.lastBase1) && Number.isFinite(row.strikeBase2) && Number.isFinite(row.lastBase2);
}

function getBaseExtrinsicValue(strike, optionPrice, ggal, optionType) {
  const raw = optionType === "put"
    ? optionPrice - Math.max(0, strike - ggal)
    : optionPrice - Math.max(0, ggal - strike);
  return Math.max(0, raw);
}

function getAnnualizedBaseRate(strike, optionPrice, ggal, daysToOpex, rateDays, optionType) {
  if (!Number.isFinite(strike) || !Number.isFinite(optionPrice) || !Number.isFinite(ggal) ||
    !Number.isFinite(daysToOpex) || !Number.isFinite(rateDays) || ggal === 0 || daysToOpex <= 0) {
    return NaN;
  }

  const baseExtrinsic = divide(getBaseExtrinsicValue(strike, optionPrice, ggal, optionType), ggal);
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

function getActiveOpexDateKey() {
  if (state.selectedVencimiento) {
    return calcOpexDateKeyForVencimiento(state.selectedVencimiento) ?? CONFIG.currentOpexDate;
  }

  return CONFIG.currentOpexDate;
}

function getDaysToOpex(dateKey) {
  const currentDateUtc = parseDateKeyAsUtc(dateKey);
  const opexDateUtc = parseDateKeyAsUtc(getActiveOpexDateKey());

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
  const parsed = Number(String(value).replace(/,/g, "."));

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

function syncParametrosSummary() {
  const mode = state.viewMode;
  const isChain   = mode === "chain";
  const isRatio   = mode === "ratio";
  const isGreigas = mode === "griegas";
  const isTasas   = mode === "tasas";
  const isMultiple = mode === "multiple";
  const isChainLike = isChain || isRatio || isGreigas;

  const venIdx = elements.vencimientoSelect.selectedIndex;
  const venText = venIdx >= 0 ? elements.vencimientoSelect.options[venIdx].text : "-";

  const parts = [`Vencimiento: ${venText}`];

  if (isChainLike) {
    const strikeText = elements.strikeRangeSelect.value === "all" ? "Todos" : "Cercanos";
    parts.push(`Strikes: ${strikeText}`);
    if (isGreigas) {
      const tasaR = parseFloat(elements.tasaRInput.value) || 0;
      parts.push(`Tasa r: ${tasaR}%`);
      const ggal = elements.ggalOverrideInput.hidden
        ? elements.ggalOverrideLabel.textContent
        : formatNumber(parseFloat(elements.ggalOverrideInput.value) || 0, 0);
      if (ggal && ggal !== "--") parts.push(`Subyacente: ${ggal}`);
      const dte = elements.dteInput.hidden
        ? elements.dteLabel.textContent
        : elements.dteInput.value;
      if (dte && dte !== "--") parts.push(`DTE: ${dte}`);
    }
  } else {
    const fdIdx = elements.fechaDesdeSelect.selectedIndex;
    if (fdIdx >= 0) parts.push(`Fecha: ${elements.fechaDesdeSelect.options[fdIdx].text}`);
    const b1Type = state.optionTypes.base1 === "put" ? "Put" : "Call";
    const b2Type = state.optionTypes.base2 === "put" ? "Put" : "Call";
    const b1 = Number(elements.base1Select.value);
    const b2 = Number(elements.base2Select.value);
    parts.push(`Base 1: ${b1Type} ${Number.isFinite(b1) ? formatNumber(b1, 0) : "-"}`);
    parts.push(`Base 2: ${b2Type} ${Number.isFinite(b2) ? formatNumber(b2, 0) : "-"}`);
    if (!isTasas) {
      const lotes    = clampInteger(elements.lotesInput.value, 1, 500, CONFIG.defaultLotes);
      const relation = clampDecimal(elements.relationInput.value, 0, 10, CONFIG.defaultRelation);
      const rateDays = clampInteger(elements.rateDaysInput.value, 1, 5000, CONFIG.defaultRateDays);
      parts.push(`Lotes: ${lotes}`);
      parts.push(`Relacion: ${Number.isFinite(relation) ? formatStoredRelation(relation) : "-"}`);
      parts.push(`Dias tasa: ${rateDays}`);
      if (isMultiple) {
        const crossCount = clampInteger(elements.crossCountInput.value, 0, 20, CONFIG.defaultCrossCount);
        parts.push(`Cruces: ${crossCount}`);
      }
    }
  }

  elements.parametrosCollapsedSummary.textContent = parts.join(" | ");
}

function syncCollapsedPanelSummaries(base1Strike, base2Strike, lotes, relation, rateDays, crossCount) {
  syncParametrosSummary();

  if (state.viewMode === "chain") {
    elements.legendCollapsedSummary.innerHTML = `<span class="summary-dots">
      <span class="summary-dot-item"><span class="chain-badge-green legend-badge-sample"></span><span>&lt;33%</span></span>
      <span class="summary-dot-item"><span class="chain-badge-yellow legend-badge-sample"></span><span>33&ndash;66%</span></span>
      <span class="summary-dot-item"><span class="chain-badge-red legend-badge-sample"></span><span>&gt;66%</span></span>
    </span>`;
  } else if (state.viewMode === "ratio") {
    elements.legendCollapsedSummary.innerHTML = `<span class="summary-dots">
      <span class="summary-dot-item"><span class="chain-badge-green legend-badge-sample"></span><span>&lt;1.5x</span></span>
      <span class="summary-dot-item"><span class="chain-badge-yellow legend-badge-sample"></span><span>1.5&ndash;2.2x</span></span>
      <span class="summary-dot-item"><span class="chain-badge-red legend-badge-sample"></span><span>&gt;2.2x</span></span>
    </span>`;
  } else {
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

function renderSpreadChain(strikeRangeAll = false) {
  const entry = state.liveEntry;
  const allStrikes = state.availableStrikes; // sorted ascending
  const tbody = elements.chainTableBody;
  tbody.innerHTML = "";

  if (!entry) {
    tbody.innerHTML = `<tr><td colspan="7" class="placeholder">Sin datos live disponibles.</td></tr>`;
    return;
  }

  const ggal = entry.ggal;

  const visibleStrikes = (strikeRangeAll || !Number.isFinite(ggal))
    ? allStrikes
    : allStrikes.filter((s) => s >= ggal * 0.75 && s <= ggal * 1.25);

  // Find the two strikes bracketing the underlying for ATM highlight
  let atmLow = null;
  let atmHigh = null;
  if (Number.isFinite(ggal)) {
    for (const s of visibleStrikes) {
      if (s <= ggal) atmLow = s;
      else if (atmHigh === null) atmHigh = s;
    }
  }

  // Render ascending (low strike at top)
  visibleStrikes.forEach((strike) => {
    const i = allStrikes.indexOf(strike);
    const callPrice = entry.calls[strikeKey(strike)];
    const putPrice = entry.puts[strikeKey(strike)];
    const isAtm = strike === atmLow || strike === atmHigh;
    const dist = Number.isFinite(ggal) && ggal !== 0 ? (strike - ggal) / ggal * 100 : NaN;
    const distText = Number.isFinite(dist) ? `${dist >= 0 ? "+" : ""}${formatNumber(dist, 2)}%` : "--";
    // Call dist: negative=red, positive=green (reversed vs puts)
    const distCallClass = `chain-dist ${dist < 0 ? "chain-dist-call-neg" : "chain-dist-call-pos"}`;
    // Put dist: negative=green, positive=red
    const distPutClass = `chain-dist ${dist < 0 ? "chain-dist-below" : "chain-dist-above"}`;

    const tr = document.createElement("tr");
    if (isAtm) tr.classList.add("chain-row-atm");

    // Call price
    const callPriceTd = document.createElement("td");
    callPriceTd.className = "chain-price chain-price-call";
    callPriceTd.textContent = Number.isFinite(callPrice) ? formatNumber(callPrice, 2) : "--";
    tr.appendChild(callPriceTd);

    // Call badges: this strike vs +1, +2, +3, +4
    const callBadgesTd = document.createElement("td");
    callBadgesTd.className = "chain-badges";
    for (let j = 0; j < 4; j++) {
      if (i + j + 1 < allStrikes.length) {
        callBadgesTd.appendChild(createChainBadge(entry.calls, allStrikes[i], allStrikes[i + j + 1], "call"));
      } else {
        callBadgesTd.appendChild(createEmptyChainBadge());
      }
    }
    tr.appendChild(callBadgesTd);

    // Distance (call side)
    const distCallTd = document.createElement("td");
    distCallTd.className = distCallClass;
    distCallTd.textContent = distText;
    tr.appendChild(distCallTd);

    // Strike
    const strikeTd = document.createElement("td");
    strikeTd.className = "chain-strike";
    strikeTd.textContent = formatNumber(strike, 0);
    tr.appendChild(strikeTd);

    // Distance (put side)
    const distPutTd = document.createElement("td");
    distPutTd.className = distPutClass;
    distPutTd.textContent = distText;
    tr.appendChild(distPutTd);

    // Put badges: this strike vs -1, -2, -3, -4
    const putBadgesTd = document.createElement("td");
    putBadgesTd.className = "chain-badges chain-badges-put";
    for (let j = 0; j < 4; j++) {
      if (i - j - 1 >= 0) {
        putBadgesTd.appendChild(createChainBadge(entry.puts, allStrikes[i - j - 1], allStrikes[i], "put"));
      } else {
        putBadgesTd.appendChild(createEmptyChainBadge());
      }
    }
    tr.appendChild(putBadgesTd);

    // Put price
    const putPriceTd = document.createElement("td");
    putPriceTd.className = "chain-price chain-price-put";
    putPriceTd.textContent = Number.isFinite(putPrice) ? formatNumber(putPrice, 2) : "--";
    tr.appendChild(putPriceTd);

    tbody.appendChild(tr);

    // Insert GGAL live price row between atmLow and atmHigh
    if (strike === atmLow && Number.isFinite(ggal)) {
      tbody.appendChild(buildGgalRow(ggal));
    }
  });

  requestAnimationFrame(equalizeChainBadgeWidths);
}

function buildGgalRow(ggal) {
  const tr = document.createElement("tr");
  tr.className = "chain-row-ggal";
  const ggalText = formatNumber(ggal, 2);
  const cells = [
    { cls: "chain-price chain-price-call", text: ggalText },  // 0: PRECIO CALL
    { cls: "", text: "" },                                      // 1: SPREAD (call)
    { cls: "chain-dist chain-dist-ggal", text: formatPercent(0) },  // 2: DIST% CALL
    { cls: "chain-strike chain-strike-ggal", text: ggalText },      // 3: STRIKE
    { cls: "chain-dist chain-dist-ggal", text: formatPercent(0) },  // 4: DIST% PUT
    { cls: "", text: "" },                                      // 5: SPREAD (put)
    { cls: "chain-price chain-price-put", text: ggalText }     // 6: PRECIO PUT
  ];
  cells.forEach(({ cls, text }) => {
    const td = document.createElement("td");
    if (cls) td.className = cls;
    if (text) td.textContent = text;
    tr.appendChild(td);
  });
  return tr;
}

function createChainBadge(priceMap, s1, s2, type) {
  const p1 = priceMap[strikeKey(s1)];
  const p2 = priceMap[strikeKey(s2)];
  const value = (Number.isFinite(p1) && Number.isFinite(p2) && s2 !== s1)
    ? Math.abs(p1 - p2) / Math.abs(s2 - s1)
    : NaN;

  const btn = document.createElement("button");
  btn.type = "button";
  const pct = Number.isFinite(value) ? value * 100 : NaN;
  let colorClass = "chain-badge-red";
  if (!Number.isFinite(pct)) {
    colorClass = "chain-badge-empty";
  } else if (pct <= 33) {
    colorClass = "chain-badge-green";
  } else if (pct <= 66) {
    colorClass = "chain-badge-yellow";
  }
  btn.className = `chain-badge ${colorClass}`;
  btn.textContent = Number.isFinite(value) ? formatPercent(value) : "--";

  const tl = type === "call" ? "C" : "P";
  btn.title = `${tl}${Math.round(s1 / 100)}/${tl}${Math.round(s2 / 100)}`;

  btn.addEventListener("click", () => {
    const lower = Math.min(s1, s2);
    const upper = Math.max(s1, s2);
    elements.base1Select.value = type === "put" ? String(upper) : String(lower);
    elements.base2Select.value = type === "put" ? String(lower) : String(upper);
    state.optionTypes.base1 = type;
    state.optionTypes.base2 = type;
    syncOptionTypeUi();
    setViewMode("chart");
    renderTable();
  });
  return btn;
}

function equalizeChainBadgeWidths() {
  const badges = elements.chainTableBody.querySelectorAll(".chain-badge");
  badges.forEach((b) => { b.style.width = ""; });
  let maxW = 0;
  badges.forEach((b) => { maxW = Math.max(maxW, b.offsetWidth); });
  if (maxW > 0) badges.forEach((b) => { b.style.width = `${maxW}px`; });
}

function createEmptyChainBadge() {
  const span = document.createElement("span");
  span.className = "chain-badge chain-badge-empty";
  span.textContent = "--";
  return span;
}

function renderRatioChain(strikeRangeAll = false) {
  const entry = state.liveEntry;
  const allStrikes = state.availableStrikes;
  const tbody = elements.ratioTableBody;
  tbody.innerHTML = "";

  if (!entry) {
    tbody.innerHTML = `<tr><td colspan="7" class="placeholder">Sin datos live disponibles.</td></tr>`;
    return;
  }

  const ggal = entry.ggal;

  const visibleStrikes = (strikeRangeAll || !Number.isFinite(ggal))
    ? allStrikes
    : allStrikes.filter((s) => s >= ggal * 0.75 && s <= ggal * 1.25);

  let atmLow = null;
  let atmHigh = null;
  if (Number.isFinite(ggal)) {
    for (const s of visibleStrikes) {
      if (s <= ggal) atmLow = s;
      else if (atmHigh === null) atmHigh = s;
    }
  }

  visibleStrikes.forEach((strike) => {
    const i = allStrikes.indexOf(strike);
    const callPrice = entry.calls[strikeKey(strike)];
    const putPrice = entry.puts[strikeKey(strike)];
    const isAtm = strike === atmLow || strike === atmHigh;
    const dist = Number.isFinite(ggal) && ggal !== 0 ? (strike - ggal) / ggal * 100 : NaN;
    const distText = Number.isFinite(dist) ? `${dist >= 0 ? "+" : ""}${formatNumber(dist, 2)}%` : "--";
    const distCallClass = `chain-dist ${dist < 0 ? "chain-dist-call-neg" : "chain-dist-call-pos"}`;
    const distPutClass = `chain-dist ${dist < 0 ? "chain-dist-below" : "chain-dist-above"}`;

    const tr = document.createElement("tr");
    if (isAtm) tr.classList.add("chain-row-atm");

    const callPriceTd = document.createElement("td");
    callPriceTd.className = "chain-price chain-price-call";
    callPriceTd.textContent = Number.isFinite(callPrice) ? formatNumber(callPrice, 2) : "--";
    tr.appendChild(callPriceTd);

    // Call ratio badges: current strike (lower) vs +1, +2, +3, +4 (higher)
    const callBadgesTd = document.createElement("td");
    callBadgesTd.className = "chain-badges";
    for (let j = 0; j < 4; j++) {
      if (i + j + 1 < allStrikes.length) {
        callBadgesTd.appendChild(createRatioBadge(allStrikes[i], allStrikes[i + j + 1], entry.calls, entry.puts, true));
      } else {
        callBadgesTd.appendChild(createEmptyChainBadge());
      }
    }
    tr.appendChild(callBadgesTd);

    const distCallTd = document.createElement("td");
    distCallTd.className = distCallClass;
    distCallTd.textContent = distText;
    tr.appendChild(distCallTd);

    const strikeTd = document.createElement("td");
    strikeTd.className = "chain-strike";
    strikeTd.textContent = formatNumber(strike, 0);
    tr.appendChild(strikeTd);

    const distPutTd = document.createElement("td");
    distPutTd.className = distPutClass;
    distPutTd.textContent = distText;
    tr.appendChild(distPutTd);

    // Put ratio badges: -1, -2, -3, -4 (lower) vs current strike (higher)
    const putBadgesTd = document.createElement("td");
    putBadgesTd.className = "chain-badges chain-badges-put";
    for (let j = 0; j < 4; j++) {
      if (i - j - 1 >= 0) {
        putBadgesTd.appendChild(createRatioBadge(allStrikes[i - j - 1], allStrikes[i], entry.calls, entry.puts, false));
      } else {
        putBadgesTd.appendChild(createEmptyChainBadge());
      }
    }
    tr.appendChild(putBadgesTd);

    const putPriceTd = document.createElement("td");
    putPriceTd.className = "chain-price chain-price-put";
    putPriceTd.textContent = Number.isFinite(putPrice) ? formatNumber(putPrice, 2) : "--";
    tr.appendChild(putPriceTd);

    tbody.appendChild(tr);

    if (strike === atmLow && Number.isFinite(ggal)) {
      const ggalRow = buildGgalRow(ggal);
      tbody.appendChild(ggalRow);
    }
  });

  requestAnimationFrame(equalizeRatioBadgeWidths);
}

function createRatioBadge(sLow, sHigh, calls, puts, isCall) {
  // Call: ratio = price(lower strike) / price(higher strike)
  // Put:  ratio = price(higher strike) / price(lower strike)
  const p1 = isCall ? calls[strikeKey(sLow)]  : puts[strikeKey(sHigh)];
  const p2 = isCall ? calls[strikeKey(sHigh)] : puts[strikeKey(sLow)];
  const ratio = (Number.isFinite(p1) && Number.isFinite(p2) && p2 > 0) ? p1 / p2 : NaN;

  let colorClass = "chain-badge-red";
  if (!Number.isFinite(ratio)) {
    colorClass = "chain-badge-empty";
  } else if (ratio < 1.5) {
    colorClass = "chain-badge-green";
  } else if (ratio <= 2.2) {
    colorClass = "chain-badge-yellow";
  }

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `chain-badge ${colorClass}`;
  btn.textContent = Number.isFinite(ratio) ? ratio.toFixed(2) + "x" : "--";

  const tl = isCall ? "C" : "P";
  btn.title = `${tl}${Math.round(sLow / 100)}/${tl}${Math.round(sHigh / 100)}`;

  btn.addEventListener("click", () => {
    elements.base1Select.value = isCall ? String(sLow) : String(sHigh);
    elements.base2Select.value = isCall ? String(sHigh) : String(sLow);
    state.optionTypes.base1 = isCall ? "call" : "put";
    state.optionTypes.base2 = isCall ? "call" : "put";
    syncOptionTypeUi();
    setViewMode("chart");
    renderTable();
  });
  return btn;
}

function equalizeRatioBadgeWidths() {
  const badges = elements.ratioTableBody.querySelectorAll(".chain-badge");
  badges.forEach((b) => { b.style.width = ""; });
  let maxW = 0;
  badges.forEach((b) => { maxW = Math.max(maxW, b.offsetWidth); });
  if (maxW > 0) badges.forEach((b) => { b.style.width = `${maxW}px`; });
}

function getGreeksT() {
  if (!elements.dteInput.hidden) {
    const val = parseInt(elements.dteInput.value, 10);
    if (Number.isFinite(val) && val > 0) return val / 365;
  }
  const vencimiento = state.selectedVencimiento;
  if (!vencimiento) return NaN;
  const opexDateStr = calcOpexDateKeyForVencimiento(vencimiento);
  if (!opexDateStr) return NaN;
  const opexDate = new Date(opexDateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = opexDate.getTime() - today.getTime();
  if (diffMs <= 0) return 0;
  return diffMs / (365 * 24 * 60 * 60 * 1000);
}

function getGreeksGgal() {
  if (!elements.ggalOverrideInput.hidden) {
    const val = parseFloat(elements.ggalOverrideInput.value);
    if (Number.isFinite(val) && val > 0) return val;
  }
  return state.liveEntry?.ggal ?? NaN;
}

function renderGreeksChain(strikeRangeAll = false) {
  const tbody = elements.griegasTableBody;
  tbody.innerHTML = "";

  const entry = state.liveEntry;
  if (!entry) {
    tbody.innerHTML = `<tr><td colspan="13" class="placeholder">Sin datos live disponibles.</td></tr>`;
    renderGreeksIVChart(null);
    return;
  }

  const ggal = getGreeksGgal();

  if (elements.ggalOverrideInput.hidden) {
    elements.ggalOverrideLabel.textContent = Number.isFinite(entry.ggal)
      ? formatNumber(entry.ggal, 0)
      : "--";
  }
  if (elements.dteInput.hidden) {
    const dte = getDaysToOpex(getTodayDateKey());
    elements.dteLabel.textContent = Number.isFinite(dte) ? String(dte) : "--";
  }

  const r = (parseFloat(elements.tasaRInput.value) || 0) / 100;
  const T = getGreeksT();

  const allStrikes = state.availableStrikes;
  const visibleStrikes = (strikeRangeAll || !Number.isFinite(ggal))
    ? allStrikes
    : allStrikes.filter((s) => s >= ggal * 0.75 && s <= ggal * 1.25);

  let atmLow = null, atmHigh = null;
  if (Number.isFinite(ggal)) {
    for (const s of visibleStrikes) {
      if (s <= ggal) atmLow = s;
      else if (atmHigh === null) atmHigh = s;
    }
  }
  const firstAtm = atmLow ?? atmHigh;

  const canCompute = Number.isFinite(T) && T > 0 && Number.isFinite(ggal) && ggal > 0;

  function makeGreekTd(val, displayDecimals, cssClass) {
    const td = document.createElement("td");
    if (Number.isFinite(val)) {
      td.className = "greek-val " + cssClass;
      td.textContent = val.toFixed(displayDecimals);
      td.title = val.toFixed(10);
    } else {
      td.className = "greek-val greek-na";
      td.textContent = "--";
    }
    return td;
  }

  visibleStrikes.forEach((strike) => {
    const callPrice = entry.calls[strikeKey(strike)];
    const putPrice  = entry.puts[strikeKey(strike)];
    const isAtm = strike === atmLow || strike === atmHigh;

    const tr = document.createElement("tr");
    if (isAtm) tr.classList.add("chain-row-atm");
    if (strike === state.griegasSelectedStrike) tr.classList.add("greeks-row-selected");
    tr.style.cursor = "pointer";
    tr.addEventListener("dblclick", () => {
      state.griegasSelectedStrike = (state.griegasSelectedStrike === strike) ? null : strike;
      elements.griegasStrikeSelect.value = state.griegasSelectedStrike !== null ? String(state.griegasSelectedStrike) : "";
      tbody.querySelectorAll("tr").forEach((r) => r.classList.remove("greeks-row-selected"));
      if (state.griegasSelectedStrike !== null) tr.classList.add("greeks-row-selected");
      renderGreeksIVChart(firstAtm);
    });

    let callIV = NaN;
    let callG = { delta: NaN, gamma: NaN, vega: NaN, theta: NaN };
    if (canCompute && Number.isFinite(callPrice)) {
      callIV = greeksBSComputeIV(callPrice, ggal, strike, T, r, true);
      if (Number.isFinite(callIV)) callG = greeksBSAll(ggal, strike, T, r, callIV, true);
    }

    let putIV = NaN;
    let putG = { delta: NaN, gamma: NaN, vega: NaN, theta: NaN };
    if (canCompute && Number.isFinite(putPrice)) {
      putIV = greeksBSComputeIV(putPrice, ggal, strike, T, r, false);
      if (Number.isFinite(putIV)) putG = greeksBSAll(ggal, strike, T, r, putIV, false);
    }

    function makeIVTd(iv) {
      const td = document.createElement("td");
      if (Number.isFinite(iv)) {
        const pct = iv * 100;
        td.className = "greek-val greek-iv";
        td.textContent = pct.toFixed(2) + "%";
        td.title = pct.toFixed(10) + "%";
      } else {
        td.className = "greek-val greek-na";
        td.textContent = "--";
      }
      return td;
    }

    const callPriceTd = document.createElement("td");
    callPriceTd.className = "chain-price chain-price-call";
    callPriceTd.textContent = Number.isFinite(callPrice) ? formatNumber(callPrice, 2) : "--";
    tr.appendChild(callPriceTd);

    tr.appendChild(makeGreekTd(callG.delta, 3, "greek-delta"));
    tr.appendChild(makeGreekTd(callG.gamma, 5, "greek-gamma"));
    tr.appendChild(makeGreekTd(callG.vega,  3, "greek-vega"));
    tr.appendChild(makeGreekTd(callG.theta, 3, "greek-theta"));
    tr.appendChild(makeIVTd(callIV));

    const strikeTd = document.createElement("td");
    strikeTd.className = "chain-strike";
    strikeTd.textContent = formatNumber(strike, 0);
    tr.appendChild(strikeTd);

    tr.appendChild(makeIVTd(putIV));
    tr.appendChild(makeGreekTd(putG.delta, 3, "greek-delta-put"));
    tr.appendChild(makeGreekTd(putG.gamma, 5, "greek-gamma"));
    tr.appendChild(makeGreekTd(putG.vega,  3, "greek-vega"));
    tr.appendChild(makeGreekTd(putG.theta, 3, "greek-theta"));

    const putPriceTd = document.createElement("td");
    putPriceTd.className = "chain-price chain-price-put";
    putPriceTd.textContent = Number.isFinite(putPrice) ? formatNumber(putPrice, 2) : "--";
    tr.appendChild(putPriceTd);

    tbody.appendChild(tr);
  });

  renderGreeksPriceChart(firstAtm);
  renderGreeksIVChart(firstAtm);
  renderGreeksDeltaChart(firstAtm);
  renderGreeksGammaChart(firstAtm);
  renderGreeksVegaChart(firstAtm);
  renderGreeksThetaChart(firstAtm);
}

function strikeAbbrev(strike) {
  return String(Math.floor(strike / 100));
}

function populateGreekStrikeSelect(strikes) {
  function fillSelect(sel, currentVal) {
    const prev = sel.value;
    sel.innerHTML = '<option value="">ATM</option>';
    for (const s of strikes) {
      const opt = document.createElement("option");
      opt.value = String(s);
      opt.textContent = formatNumber(s, 0);
      sel.appendChild(opt);
    }
    if (currentVal !== null) {
      sel.value = String(currentVal);
    } else if (prev && strikes.includes(parseFloat(prev))) {
      sel.value = prev;
    }
  }
  fillSelect(elements.griegasStrikeSelect,  state.griegasSelectedStrike);
  fillSelect(elements.griegasBase2Select,   state.griegasSelectedStrike2);
}

function renderGreeksSimpleChain(strikeRangeAll = false) {
  const tbody = elements.griegasSimpleTableBody;
  tbody.innerHTML = "";

  const entry = state.liveEntry;
  if (!entry) {
    tbody.innerHTML = `<tr><td colspan="7" class="placeholder">Sin datos live disponibles.</td></tr>`;
    return;
  }

  const ggal = getGreeksGgal();
  const r = (parseFloat(elements.tasaRInput.value) || 0) / 100;
  const T = getGreeksT();
  const isCall = state.griegasOptionType !== "put";

  const allStrikes = state.availableStrikes;
  const visibleStrikes = (strikeRangeAll || !Number.isFinite(ggal))
    ? allStrikes
    : allStrikes.filter((s) => s >= ggal * 0.75 && s <= ggal * 1.25);

  populateGreekStrikeSelect(allStrikes);

  let atmLow = null, atmHigh = null;
  if (Number.isFinite(ggal)) {
    for (const s of visibleStrikes) {
      if (s <= ggal) atmLow = s;
      else if (atmHigh === null) atmHigh = s;
    }
  }

  const canCompute = Number.isFinite(T) && T > 0 && Number.isFinite(ggal) && ggal > 0;

  function makeGreekTd(val, displayDecimals, cssClass) {
    const td = document.createElement("td");
    if (Number.isFinite(val)) {
      td.className = "greek-val " + cssClass;
      td.textContent = val.toFixed(displayDecimals);
      td.title = val.toFixed(10);
    } else {
      td.className = "greek-val greek-na";
      td.textContent = "--";
    }
    return td;
  }

  visibleStrikes.forEach((strike) => {
    const price = isCall ? entry.calls[strikeKey(strike)] : entry.puts[strikeKey(strike)];
    const isAtm = strike === atmLow || strike === atmHigh;

    const tr = document.createElement("tr");
    if (isAtm) tr.classList.add("chain-row-atm");
    if (strike === state.griegasSelectedStrike) tr.classList.add("greeks-row-selected");
    tr.style.cursor = "pointer";
    tr.addEventListener("click", () => {
      state.griegasSelectedStrike = (state.griegasSelectedStrike === strike) ? null : strike;
      elements.griegasStrikeSelect.value = state.griegasSelectedStrike !== null ? String(state.griegasSelectedStrike) : "";
      tbody.querySelectorAll("tr").forEach((r) => r.classList.remove("greeks-row-selected"));
      if (state.griegasSelectedStrike !== null) tr.classList.add("greeks-row-selected");
      const atm = atmLow ?? atmHigh;
      renderGreeksPriceChart(atm);
      renderGreeksIVChart(atm);
      renderGreeksDeltaChart(atm);
      renderGreeksGammaChart(atm);
      renderGreeksVegaChart(atm);
      renderGreeksThetaChart(atm);
    });

    let iv = NaN;
    let g = { delta: NaN, gamma: NaN, vega: NaN, theta: NaN };
    if (canCompute && Number.isFinite(price)) {
      iv = greeksBSComputeIV(price, ggal, strike, T, r, isCall);
      if (Number.isFinite(iv)) g = greeksBSAll(ggal, strike, T, r, iv, isCall);
    }

    const strikeTd = document.createElement("td");
    strikeTd.className = "chain-strike";
    strikeTd.textContent = formatNumber(strike, 0);
    tr.appendChild(strikeTd);

    const priceTd = document.createElement("td");
    priceTd.className = isCall ? "chain-price chain-price-call" : "chain-price chain-price-put";
    priceTd.textContent = Number.isFinite(price) ? formatNumber(price, 2) : "--";
    tr.appendChild(priceTd);

    const ivTd = document.createElement("td");
    if (Number.isFinite(iv)) {
      const pct = iv * 100;
      ivTd.className = "greek-val greek-iv";
      ivTd.textContent = pct.toFixed(2) + "%";
      ivTd.title = pct.toFixed(10) + "%";
    } else {
      ivTd.className = "greek-val greek-na";
      ivTd.textContent = "--";
    }
    tr.appendChild(ivTd);

    tr.appendChild(makeGreekTd(g.delta, 3, isCall ? "greek-delta" : "greek-delta-put"));
    tr.appendChild(makeGreekTd(g.gamma, 5, "greek-gamma"));
    tr.appendChild(makeGreekTd(g.vega,  3, "greek-vega"));
    tr.appendChild(makeGreekTd(g.theta, 3, "greek-theta"));

    tbody.appendChild(tr);
  });
}

function createGreeksLastValuePlugin(chartKey, formatter) {
  return {
    id: `greeksLastValue-${chartKey}`,
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      ctx.save();
      ctx.font = "bold 12px Barlow, sans-serif";

      const entries = [];
      chart.data.datasets.forEach((dataset, dsIndex) => {
        const meta = chart.getDatasetMeta(dsIndex);
        if (meta.hidden) return;
        const data = dataset.data;
        let lastIdx = -1;
        for (let i = data.length - 1; i >= 0; i--) {
          if (Number.isFinite(data[i])) { lastIdx = i; break; }
        }
        if (lastIdx < 0) return;
        const element = meta.data[lastIdx];
        if (!element) return;
        entries.push({ element, value: data[lastIdx], color: dataset.borderColor ?? "#c7d7ef" });
      });

      entries.sort((a, b) => a.element.y - b.element.y);

      const THRESHOLD = 20;
      const OFFSET = 10;
      const directions = entries.map(() => -1);
      for (let i = 0; i < entries.length - 1; i++) {
        if (Math.abs(entries[i + 1].element.y - entries[i].element.y) < THRESHOLD) {
          directions[i]     = -1;
          directions[i + 1] = +1;
        }
      }

      const chartArea = chart.chartArea;
      const hPad = 12;
      for (let i = 0; i < entries.length; i++) {
        const { element, value, color } = entries[i];
        const label = formatter(value);

        let placement;
        if (directions[i] === -1) {
          placement = chooseSpecialLabelPlacement(chart, element, label, ctx);
        } else {
          const textWidth = ctx.measureText(label).width;
          const y = element.y + OFFSET;
          let x = element.x, align = "center";
          if (element.x + textWidth / 2 > chartArea.right - 4) {
            x = chartArea.right - hPad; align = "right";
          } else if (element.x - textWidth / 2 < chartArea.left + 4) {
            x = chartArea.left + hPad; align = "left";
          }
          placement = { x, y, align, baseline: "top" };
        }

        ctx.fillStyle = color;
        ctx.textAlign = placement.align;
        ctx.textBaseline = placement.baseline;
        ctx.fillText(label, placement.x, placement.y);
      }

      ctx.restore();
    }
  };
}

function renderGreeksPriceChart(firstAtm) {
  const chartKey = "griegasPrice";
  const k = state.griegasSelectedStrike ?? firstAtm;

  if (!k) {
    destroyChart(chartKey);
    return;
  }

  const isCall = state.griegasOptionType !== "put";
  const kStr = strikeKey(k);

  let entries = [...state.historyByDate];
  if (state.liveEntry && !entries.some((e) => e.fechaRaw === state.liveEntry.fechaRaw)) {
    entries.push(state.liveEntry);
  }
  entries.sort((a, b) => a.fechaRaw.localeCompare(b.fechaRaw));
  if (state.selectedFechaDesde) {
    entries = entries.filter((e) => e.fechaRaw >= state.selectedFechaDesde);
  }

  const isCruzar = state.griegasCruzar;
  const k2p    = isCruzar ? (state.griegasSelectedStrike2 ?? firstAtm) : null;
  const isCall2p = state.griegasOptionType2 !== "put";
  const kStr2p = k2p ? strikeKey(k2p) : null;

  const labels = [];
  const prices = [];
  const prices2 = [];

  for (const entry of entries) {
    const price = isCall ? entry.calls?.[kStr] : entry.puts?.[kStr];
    const p1 = (Number.isFinite(price) && price > 0) ? price : NaN;
    let p2 = NaN;
    if (isCruzar && k2p) {
      const price2 = isCall2p ? entry.calls?.[kStr2p] : entry.puts?.[kStr2p];
      p2 = (Number.isFinite(price2) && price2 > 0) ? price2 : NaN;
    }
    if (!Number.isFinite(p1) && !Number.isFinite(p2)) continue;
    labels.push(formatChartDate(formatDate(entry.fechaRaw)));
    prices.push(Number.isFinite(p1) ? p1 : NaN);
    prices2.push(Number.isFinite(p2) ? p2 : NaN);
  }

  if (!labels.length) {
    destroyChart(chartKey);
    return;
  }

  const typeLabel = isCall ? "Call" : "Put";
  const color = isCall ? "#22c55e" : "#e14d4d";
  const typeStrike1p = `${typeLabel} ${formatNumber(k, 0)}`;
  const titleSuffixP = isCruzar && k2p
    ? `${typeStrike1p}/${isCall2p ? "Call" : "Put"} ${formatNumber(k2p, 0)}`
    : typeStrike1p;
  elements.griegasPriceChartTitle.textContent = `Precio histórico — ${titleSuffixP}`;

  const labelB1 = `Precio ${isCall ? "C" : "P"}${strikeAbbrev(k)}`;
  const datasets = [{
    label: labelB1,
    data: prices,
    borderColor: color,
    backgroundColor: withAlphaFromHex(color, 0.12),
    borderWidth: 2,
    tension: 0.28,
    fill: false,
    pointRadius: 2,
    pointHoverRadius: 5,
    spanGaps: true
  }];

  if (isCruzar && prices2.some((v) => Number.isFinite(v))) {
    datasets.push({
      label: `Precio ${isCall2p ? "C" : "P"}${strikeAbbrev(k2p)}`,
      data: prices2,
      borderColor: "#ff9f43",
      backgroundColor: withAlphaFromHex("#ff9f43", 0.12),
      borderWidth: 2,
      tension: 0.28,
      fill: false,
      pointRadius: 2,
      pointHoverRadius: 5,
      spanGaps: true
    });
  }

  captureChartVisibilityState(chartKey);
  applyChartVisibilityState(chartKey, datasets);
  destroyChart(chartKey);
  state.charts[chartKey] = new Chart(elements.griegasPriceChart, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      animation: false,
      layout: { padding: { left: 10, right: 22, top: 10 } },
      plugins: {
        legend: { display: true, labels: { color: "#c7d7ef" } },
        tooltip: {
          displayColors: true,
          backgroundColor: "#111c29",
          borderColor: "rgba(116, 150, 189, 0.22)",
          borderWidth: 1,
          titleColor: "#eaf2ff",
          bodyColor: "#c7d7ef",
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y != null ? formatNumber(ctx.parsed.y, 2) : "--"}` }
        }
      },
      scales: {
        x: {
          offset: true,
          ticks: { color: "#8ea7c6", autoSkip: false, maxRotation: 45, minRotation: 45 },
          grid: { color: "rgba(116, 150, 189, 0.08)" },
          border: { color: "rgba(116, 150, 189, 0.18)" }
        },
        y: {
          grace: "10%",
          ticks: { color: "#8ea7c6", callback: (v) => formatNumber(v, 2) },
          grid: { color: "rgba(116, 150, 189, 0.12)" },
          border: { color: "rgba(116, 150, 189, 0.18)" }
        }
      }
    },
    plugins: [createGreeksLastValuePlugin(chartKey, (v) => formatNumber(v, 2))]
  });
}

function renderGreeksIVChart(firstAtm) {
  const chartKey = "griegasIV";
  const k = state.griegasSelectedStrike ?? firstAtm;

  if (!k) {
    destroyChart(chartKey);
    return;
  }

  const isCall = state.griegasOptionType !== "put";
  const r = (parseFloat(elements.tasaRInput.value) || 0) / 100;
  const kStr = strikeKey(k);

  let entries = [...state.historyByDate];
  if (state.liveEntry && !entries.some((e) => e.fechaRaw === state.liveEntry.fechaRaw)) {
    entries.push(state.liveEntry);
  }
  entries.sort((a, b) => a.fechaRaw.localeCompare(b.fechaRaw));
  if (state.selectedFechaDesde) {
    entries = entries.filter((e) => e.fechaRaw >= state.selectedFechaDesde);
  }

  const isCruzar = state.griegasCruzar;
  const k2     = isCruzar ? (state.griegasSelectedStrike2 ?? firstAtm) : null;
  const isCall2 = state.griegasOptionType2 !== "put";
  const kStr2  = k2 ? strikeKey(k2) : null;

  const labels = [];
  const ivValues = [];
  const ivValues2 = [];

  for (const entry of entries) {
    const S = entry.ggal;
    if (!Number.isFinite(S) || S <= 0) continue;
    const daysToOpex = getDaysToOpex(entry.fechaRaw);
    if (!Number.isFinite(daysToOpex) || daysToOpex <= 0) continue;
    const T = daysToOpex / 365;
    const price = isCall ? entry.calls?.[kStr] : entry.puts?.[kStr];
    const iv = (Number.isFinite(price) && price > 0) ? greeksBSComputeIV(price, S, k, T, r, isCall) : NaN;
    let iv2 = NaN;
    if (isCruzar && k2) {
      const price2 = isCall2 ? entry.calls?.[kStr2] : entry.puts?.[kStr2];
      iv2 = (Number.isFinite(price2) && price2 > 0) ? greeksBSComputeIV(price2, S, k2, T, r, isCall2) : NaN;
    }
    if (!Number.isFinite(iv) && !Number.isFinite(iv2)) continue;
    labels.push(formatChartDate(formatDate(entry.fechaRaw)));
    ivValues.push(Number.isFinite(iv) ? iv * 100 : NaN);
    ivValues2.push(Number.isFinite(iv2) ? iv2 * 100 : NaN);
  }

  if (!labels.length) {
    destroyChart(chartKey);
    return;
  }

  const typeLabel = isCall ? "Call" : "Put";
  const color = "#f0c24b";
  const typeStrike1iv = `${typeLabel} ${formatNumber(k, 0)}`;
  const titleSuffixIV = isCruzar && k2
    ? `${typeStrike1iv}/${isCall2 ? "Call" : "Put"} ${formatNumber(k2, 0)}`
    : typeStrike1iv;
  elements.griegasIVChartTitle.textContent = `IV histórica — ${titleSuffixIV}`;

  const fmtPct = (v) => (v != null ? v.toFixed(2) + "%" : "--");
  const labelB1 = `IV ${isCall ? "C" : "P"}${strikeAbbrev(k)}`;
  const datasets = [{
    label: labelB1,
    data: ivValues,
    borderColor: color,
    backgroundColor: withAlphaFromHex(color, 0.12),
    borderWidth: 2,
    tension: 0.28,
    fill: false,
    pointRadius: 2,
    pointHoverRadius: 5,
    spanGaps: true
  }];

  if (isCruzar && ivValues2.some((v) => Number.isFinite(v))) {
    datasets.push({
      label: `IV ${isCall2 ? "C" : "P"}${strikeAbbrev(k2)}`,
      data: ivValues2,
      borderColor: "#ff9f43",
      backgroundColor: withAlphaFromHex("#ff9f43", 0.12),
      borderWidth: 2,
      tension: 0.28,
      fill: false,
      pointRadius: 2,
      pointHoverRadius: 5,
      spanGaps: true
    });
  }

  captureChartVisibilityState(chartKey);
  applyChartVisibilityState(chartKey, datasets);
  destroyChart(chartKey);
  state.charts[chartKey] = new Chart(elements.griegasIVChart, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      animation: false,
      layout: { padding: { left: 10, right: 22, top: 10 } },
      plugins: {
        legend: { display: true, labels: { color: "#c7d7ef" } },
        tooltip: {
          displayColors: true,
          backgroundColor: "#111c29",
          borderColor: "rgba(116, 150, 189, 0.22)",
          borderWidth: 1,
          titleColor: "#eaf2ff",
          bodyColor: "#c7d7ef",
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtPct(ctx.parsed.y)}` }
        }
      },
      scales: {
        x: {
          offset: true,
          ticks: { color: "#8ea7c6", autoSkip: false, maxRotation: 45, minRotation: 45 },
          grid: { color: "rgba(116, 150, 189, 0.08)" },
          border: { color: "rgba(116, 150, 189, 0.18)" }
        },
        y: {
          grace: "10%",
          ticks: { color: "#8ea7c6", callback: (v) => Number(v).toFixed(1) + "%" },
          grid: { color: "rgba(116, 150, 189, 0.12)" },
          border: { color: "rgba(116, 150, 189, 0.18)" }
        }
      }
    },
    plugins: [createGreeksLastValuePlugin(chartKey, (v) => v.toFixed(1) + "%")]
  });
}

function renderGreekHistoryChart(cfg, firstAtm) {
  const { chartKey, canvasEl, titleEl, greekName, accessor, yTickCallback } = cfg;
  const k = state.griegasSelectedStrike ?? firstAtm;

  if (!k) {
    destroyChart(chartKey);
    return;
  }

  const isCall = state.griegasOptionType !== "put";
  const r = (parseFloat(elements.tasaRInput.value) || 0) / 100;
  const kStr = strikeKey(k);

  let entries = [...state.historyByDate];
  if (state.liveEntry && !entries.some((e) => e.fechaRaw === state.liveEntry.fechaRaw)) {
    entries.push(state.liveEntry);
  }
  entries.sort((a, b) => a.fechaRaw.localeCompare(b.fechaRaw));
  if (state.selectedFechaDesde) {
    entries = entries.filter((e) => e.fechaRaw >= state.selectedFechaDesde);
  }

  const isCruzar = state.griegasCruzar;
  const k2h    = isCruzar ? (state.griegasSelectedStrike2 ?? firstAtm) : null;
  const isCall2h = state.griegasOptionType2 !== "put";
  const kStr2h = k2h ? strikeKey(k2h) : null;

  const labels = [];
  const values = [];
  const values2 = [];

  for (const entry of entries) {
    const S = entry.ggal;
    if (!Number.isFinite(S) || S <= 0) continue;
    const daysToOpex = getDaysToOpex(entry.fechaRaw);
    if (!Number.isFinite(daysToOpex) || daysToOpex <= 0) continue;
    const T = daysToOpex / 365;
    const price = isCall ? entry.calls?.[kStr] : entry.puts?.[kStr];
    let val = NaN;
    if (Number.isFinite(price) && price > 0) {
      const iv = greeksBSComputeIV(price, S, k, T, r, isCall);
      if (Number.isFinite(iv)) val = accessor(greeksBSAll(S, k, T, r, iv, isCall));
    }
    let val2 = NaN;
    if (isCruzar && k2h) {
      const price2 = isCall2h ? entry.calls?.[kStr2h] : entry.puts?.[kStr2h];
      if (Number.isFinite(price2) && price2 > 0) {
        const iv2 = greeksBSComputeIV(price2, S, k2h, T, r, isCall2h);
        if (Number.isFinite(iv2)) val2 = accessor(greeksBSAll(S, k2h, T, r, iv2, isCall2h));
      }
    }
    if (!Number.isFinite(val) && !Number.isFinite(val2)) continue;
    labels.push(formatChartDate(formatDate(entry.fechaRaw)));
    values.push(Number.isFinite(val) ? val : NaN);
    values2.push(Number.isFinite(val2) ? val2 : NaN);
  }

  if (!labels.length) {
    destroyChart(chartKey);
    return;
  }

  const typeLabel = isCall ? "Call" : "Put";
  const color = cfg.fixedColor ?? (isCall ? "#7ff0ae" : "#ff9a9a");
  const metricShort = greekName.replace(" histórica", "");
  const typeStrike1h = `${typeLabel} ${formatNumber(k, 0)}`;
  const titleSuffixH = isCruzar && k2h
    ? `${typeStrike1h}/${isCall2h ? "Call" : "Put"} ${formatNumber(k2h, 0)}`
    : typeStrike1h;
  titleEl.textContent = `${greekName} — ${titleSuffixH}`;

  const labelB1 = `${metricShort} ${isCall ? "C" : "P"}${strikeAbbrev(k)}`;
  const datasets = [{
    label: labelB1,
    data: values,
    borderColor: color,
    backgroundColor: withAlphaFromHex(color, 0.12),
    borderWidth: 2,
    tension: 0.28,
    fill: false,
    pointRadius: 2,
    pointHoverRadius: 5,
    spanGaps: true
  }];

  if (isCruzar && values2.some((v) => Number.isFinite(v))) {
    datasets.push({
      label: `${metricShort} ${isCall2h ? "C" : "P"}${strikeAbbrev(k2h)}`,
      data: values2,
      borderColor: "#ff9f43",
      backgroundColor: withAlphaFromHex("#ff9f43", 0.12),
      borderWidth: 2,
      tension: 0.28,
      fill: false,
      pointRadius: 2,
      pointHoverRadius: 5,
      spanGaps: true
    });
  }

  captureChartVisibilityState(chartKey);
  applyChartVisibilityState(chartKey, datasets);
  destroyChart(chartKey);
  state.charts[chartKey] = new Chart(canvasEl, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      animation: false,
      layout: { padding: { left: 10, right: 22, top: 10 } },
      plugins: {
        legend: { display: true, labels: { color: "#c7d7ef" } },
        tooltip: {
          displayColors: true,
          backgroundColor: "#111c29",
          borderColor: "rgba(116, 150, 189, 0.22)",
          borderWidth: 1,
          titleColor: "#eaf2ff",
          bodyColor: "#c7d7ef",
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y != null ? ctx.parsed.y.toFixed(6) : "--"}` }
        }
      },
      scales: {
        x: {
          offset: true,
          ticks: { color: "#8ea7c6", autoSkip: false, maxRotation: 45, minRotation: 45 },
          grid: { color: "rgba(116, 150, 189, 0.08)" },
          border: { color: "rgba(116, 150, 189, 0.18)" }
        },
        y: {
          grace: "10%",
          ticks: { color: "#8ea7c6", callback: yTickCallback },
          grid: { color: "rgba(116, 150, 189, 0.12)" },
          border: { color: "rgba(116, 150, 189, 0.18)" }
        }
      }
    },
    plugins: [createGreeksLastValuePlugin(chartKey, yTickCallback)]
  });
}

function renderGreeksDeltaChart(firstAtm) {
  renderGreekHistoryChart({
    chartKey:  "griegasDelta",
    canvasEl:  elements.griegasDeltaChart,
    titleEl:   elements.griegasDeltaChartTitle,
    greekName: "Delta histórica",
    accessor:  (g) => g.delta,
    yTickCallback: (v) => Number(v).toFixed(3),
  }, firstAtm);
}

function renderGreeksGammaChart(firstAtm) {
  renderGreekHistoryChart({
    chartKey:  "griegasGamma",
    canvasEl:  elements.griegasGammaChart,
    titleEl:   elements.griegasGammaChartTitle,
    greekName: "Gamma histórica",
    accessor:  (g) => g.gamma,
    yTickCallback: (v) => Number(v).toFixed(5),
    fixedColor: "#9fd0ff",
  }, firstAtm);
}

function renderGreeksVegaChart(firstAtm) {
  renderGreekHistoryChart({
    chartKey:  "griegasVega",
    canvasEl:  elements.griegasVegaChart,
    titleEl:   elements.griegasVegaChartTitle,
    greekName: "Vega histórica",
    accessor:  (g) => g.vega,
    yTickCallback: (v) => Number(v).toFixed(4),
    fixedColor: "#c4b5fd",
  }, firstAtm);
}

function renderGreeksThetaChart(firstAtm) {
  renderGreekHistoryChart({
    chartKey:  "griegasTheta",
    canvasEl:  elements.griegasThetaChart,
    titleEl:   elements.griegasThetaChartTitle,
    greekName: "Theta histórica",
    accessor:  (g) => g.theta,
    yTickCallback: (v) => Number(v).toFixed(4),
    fixedColor: "#fca5a5",
  }, firstAtm);
}

function renderTasasCharts(base1Strike, base2Strike) {
  renderTasasCrossChart();
  renderTasasVenChart();
  renderTasasVrpChart(base1Strike);
  renderTasasRankChart(base1Strike, base2Strike);
  renderTasasThetaChart(base1Strike, base2Strike);
  renderTasasSkewChart();
  renderTasasTemporalChart(base1Strike, base2Strike);
  renderTasasPrimaChart(base1Strike, base2Strike);
}

function renderTasasCrossChart() {
  const chartKey = "tasasCross";
  const entry = state.liveEntry ?? state.historyByDate.at(-1);

  if (!entry) {
    destroyChart(chartKey);
    return;
  }

  const allStrikeKeys = new Set([
    ...Object.keys(entry.calls ?? {}),
    ...Object.keys(entry.puts ?? {})
  ]);
  const sortedStrikes = [...allStrikeKeys]
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  if (!sortedStrikes.length) {
    destroyChart(chartKey);
    return;
  }

  const labels = sortedStrikes.map((s) => formatNumber(s, 0));
  const vecData = sortedStrikes.map((s) => {
    const price = entry.calls?.[strikeKey(s)];
    return Number.isFinite(price) ? getBaseExtrinsicValue(s, price, entry.ggal, "call") : null;
  });
  const vepData = sortedStrikes.map((s) => {
    const price = entry.puts?.[strikeKey(s)];
    return Number.isFinite(price) ? getBaseExtrinsicValue(s, price, entry.ggal, "put") : null;
  });

  const dateLabel = entry.fechaRaw ?? "";
  elements.tasasCrossChartTitle.textContent = `VE por Strike${dateLabel ? ` — ${dateLabel}` : ""}`;

  // Datasets are transparent: the plugin draws the actual bars centered on each
  // category so that the smaller bar appears visually "inside" the larger one.
  const datasets = [
    { label: "VEC (Call)", data: vecData, backgroundColor: "transparent", borderColor: "transparent", hoverBackgroundColor: "transparent", hoverBorderColor: "transparent" },
    { label: "VEP (Put)",  data: vepData, backgroundColor: "transparent", borderColor: "transparent", hoverBackgroundColor: "transparent", hoverBorderColor: "transparent" }
  ];

  captureChartVisibilityState(chartKey);
  applyChartVisibilityState(chartKey, datasets);
  destroyChart(chartKey);

  const veStrikeLabelsPlugin = {
    id: "veStrikeLabels",
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      const meta0 = chart.getDatasetMeta(0);
      const meta1 = chart.getDatasetMeta(1);
      const yScale = chart.scales.y;
      const yZero = yScale.getPixelForValue(0);
      const hidden0 = meta0.hidden;
      const hidden1 = meta1.hidden;

      const drawBar = (catCenter, groupW, value, fillColor, strokeColor) => {
        if (value === null || value === undefined || !Number.isFinite(value)) return;
        const yTop = yScale.getPixelForValue(value);
        const barH = yZero - yTop;
        if (barH <= 0) return;
        const r = Math.min(4, groupW / 4, barH / 2);
        ctx.save();
        ctx.fillStyle = fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(catCenter - groupW / 2, yTop, groupW, barH, [r, r, 0, 0]);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      };

      vecData.forEach((vecVal, i) => {
        const vepVal = vepData[i];
        const bar0 = meta0.data[i];
        const bar1 = meta1.data[i];
        // Average of the two grouped bar centers = category center
        const catCenter = (bar0.x + bar1.x) / 2;
        // Combined width covers the full bar group
        const groupW = bar0.width + bar1.width;

        // Draw larger bar first (behind), smaller bar on top
        if (!hidden0 && !hidden1) {
          if ((vecVal ?? 0) >= (vepVal ?? 0)) {
            drawBar(catCenter, groupW, vecVal, "rgba(79, 195, 247, 0.65)", "#4fc3f7");
            drawBar(catCenter, groupW, vepVal, "rgba(239, 83, 80, 0.85)",  "#ef5350");
          } else {
            drawBar(catCenter, groupW, vepVal, "rgba(239, 83, 80, 0.65)", "#ef5350");
            drawBar(catCenter, groupW, vecVal, "rgba(79, 195, 247, 0.85)", "#4fc3f7");
          }
        } else if (!hidden0) {
          drawBar(catCenter, groupW, vecVal, "rgba(79, 195, 247, 0.7)", "#4fc3f7");
        } else if (!hidden1) {
          drawBar(catCenter, groupW, vepVal, "rgba(239, 83, 80, 0.7)", "#ef5350");
        }

        // Labels above each bar's top edge
        ctx.save();
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";

        if (!hidden0 && vecVal !== null && Number.isFinite(vecVal)) {
          const yTop = yScale.getPixelForValue(vecVal);
          ctx.fillStyle = "#69f0ae";
          ctx.fillText(labels[i], catCenter, yTop - 12);
          ctx.fillText(formatNumber(vecVal, 2), catCenter, yTop - 2);
        }
        if (!hidden1 && vepVal !== null && Number.isFinite(vepVal)) {
          const yTop = yScale.getPixelForValue(vepVal);
          const vecTop = (!hidden0 && Number.isFinite(vecVal)) ? yScale.getPixelForValue(vecVal) : Infinity;
          // Skip label if too close to the VEC label (avoids overlap)
          if (Math.abs(yTop - vecTop) > 20 || hidden0) {
            ctx.fillStyle = "#ff1744";
            ctx.fillText(labels[i], catCenter, yTop - 12);
            ctx.fillText(formatNumber(vepVal, 2), catCenter, yTop - 2);
          }
        }
        ctx.restore();
      });
    }
  };

  state.charts[chartKey] = new Chart(elements.tasasCrossChart, {
    type: "bar",
    data: { labels, datasets },
    plugins: [veStrikeLabelsPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      layout: { padding: { left: 10, right: 22, top: 10 } },
      plugins: {
        legend: {
          display: true,
          onClick: handlePersistentLegendClick,
          labels: {
            color: "#c7d7ef",
            generateLabels(chart) {
              return chart.data.datasets.map((ds, i) => {
                const meta = chart.getDatasetMeta(i);
                const fillColor = i === 0 ? "rgba(79, 195, 247, 0.7)" : "rgba(239, 83, 80, 0.7)";
                const strokeColor = i === 0 ? "#4fc3f7" : "#ef5350";
                return { text: ds.label, fillStyle: fillColor, strokeStyle: strokeColor, lineWidth: 1, datasetIndex: i, hidden: meta.hidden, fontColor: "#c7d7ef" };
              });
            }
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
            label: (context) => `${context.dataset.label}: ${formatNumber(context.parsed.y, 2)}`
          }
        }
      },
      animation: false,
      scales: {
        x: {
          offset: true,
          ticks: { color: "#8ea7c6", maxRotation: 45, minRotation: 45 },
          grid: { color: "rgba(116, 150, 189, 0.08)" },
          border: { color: "rgba(116, 150, 189, 0.18)" }
        },
        y: {
          grace: "5%",
          ticks: { color: "#8ea7c6", callback: (v) => formatNumber(v, 0) },
          grid: { color: "rgba(116, 150, 189, 0.12)" },
          border: { color: "rgba(116, 150, 189, 0.18)" }
        }
      }
    }
  });
}

function renderTasasVenChart() {
  const chartKey = "tasasVen";
  const entry = state.liveEntry ?? state.historyByDate.at(-1);

  if (!entry || !Number.isFinite(entry.ggal) || entry.ggal === 0) {
    destroyChart(chartKey);
    return;
  }

  const allStrikeKeys = new Set([
    ...Object.keys(entry.calls ?? {}),
    ...Object.keys(entry.puts ?? {})
  ]);
  const sortedStrikes = [...allStrikeKeys]
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  if (!sortedStrikes.length) {
    destroyChart(chartKey);
    return;
  }

  const labels = sortedStrikes.map((s) => formatNumber(s, 0));
  const vencData = sortedStrikes.map((s) => {
    const price = entry.calls?.[strikeKey(s)];
    return Number.isFinite(price) ? getBaseExtrinsicValue(s, price, entry.ggal, "call") / entry.ggal : null;
  });
  const venpData = sortedStrikes.map((s) => {
    const price = entry.puts?.[strikeKey(s)];
    return Number.isFinite(price) ? getBaseExtrinsicValue(s, price, entry.ggal, "put") / entry.ggal : null;
  });

  const dateLabel = entry.fechaRaw ?? "";
  elements.tasasVenChartTitle.textContent = `VEN por Strike${dateLabel ? ` — ${dateLabel}` : ""}`;

  const commonPointStyle = {
    pointRadius: 4,
    pointHoverRadius: 6,
    tension: 0.2,
    fill: false,
    spanGaps: true
  };

  const datasets = [
    {
      label: "VENC (Call)",
      data: vencData,
      borderColor: "#4fc3f7",
      backgroundColor: "#4fc3f7",
      ...commonPointStyle
    },
    {
      label: "VENP (Put)",
      data: venpData,
      borderColor: "#ef5350",
      backgroundColor: "#ef5350",
      ...commonPointStyle
    }
  ];

  captureChartVisibilityState(chartKey);
  applyChartVisibilityState(chartKey, datasets);
  destroyChart(chartKey);

  state.charts[chartKey] = new Chart(elements.tasasVenChart, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      layout: { padding: { left: 10, right: 22, top: 10 } },
      plugins: {
        legend: {
          display: true,
          onClick: handlePersistentLegendClick,
          labels: { color: "#c7d7ef" }
        },
        tooltip: {
          displayColors: true,
          backgroundColor: "#111c29",
          borderColor: "rgba(116, 150, 189, 0.22)",
          borderWidth: 1,
          titleColor: "#eaf2ff",
          bodyColor: "#c7d7ef",
          callbacks: {
            label: (context) => `${context.dataset.label}: ${formatPercent(context.parsed.y)}`
          }
        }
      },
      animation: false,
      scales: {
        x: {
          offset: true,
          ticks: { color: "#8ea7c6", maxRotation: 45, minRotation: 45 },
          grid: { color: "rgba(116, 150, 189, 0.08)" },
          border: { color: "rgba(116, 150, 189, 0.18)" }
        },
        y: {
          grace: "5%",
          ticks: { color: "#8ea7c6", callback: (v) => formatPercent(v) },
          grid: { color: "rgba(116, 150, 189, 0.12)" },
          border: { color: "rgba(116, 150, 189, 0.18)" }
        }
      }
    }
  });
}

function findClosestEntry(sortedEntries, targetMs) {
  let closest = null;
  let minDiff = Infinity;
  for (const entry of sortedEntries) {
    const entryMs = new Date(entry.fechaRaw).getTime();
    const diff = Math.abs(entryMs - targetMs);
    if (diff < minDiff) { minDiff = diff; closest = entry; }
  }
  return closest;
}

function makeTasasChartOptions(yLeftFormatter, yRightFormatter) {
  const scales = {
    x: {
      offset: true,
      ticks: { color: "#8ea7c6", maxRotation: 45, minRotation: 45, autoSkip: true, maxTicksLimit: 24 },
      grid: { color: "rgba(116, 150, 189, 0.08)" },
      border: { color: "rgba(116, 150, 189, 0.18)" }
    },
    y: {
      position: "left",
      grace: "5%",
      ticks: { color: "#8ea7c6", callback: (v) => yLeftFormatter(v) },
      grid: { color: "rgba(116, 150, 189, 0.12)" },
      border: { color: "rgba(116, 150, 189, 0.18)" }
    }
  };
  if (yRightFormatter) {
    scales.y2 = {
      position: "right",
      grace: "5%",
      ticks: { color: "#8ea7c6", callback: (v) => yRightFormatter(v) },
      grid: { drawOnChartArea: false },
      border: { color: "rgba(116, 150, 189, 0.18)" }
    };
  }
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "nearest", intersect: false },
    layout: { padding: { left: 10, right: 22, top: 10 } },
    plugins: {
      legend: { display: true, onClick: handlePersistentLegendClick, labels: { color: "#c7d7ef" } },
      tooltip: {
        displayColors: true,
        backgroundColor: "#111c29",
        borderColor: "rgba(116, 150, 189, 0.22)",
        borderWidth: 1,
        titleColor: "#eaf2ff",
        bodyColor: "#c7d7ef"
      }
    },
    animation: false,
    scales
  };
}

function renderTasasVrpChart(base1Strike) {
  const chartKey = "tasasVrp";

  if (!Number.isFinite(base1Strike) || !state.historyByDate.length) {
    destroyChart(chartKey);
    return;
  }

  const b1Key = strikeKey(base1Strike);
  const b1TypeKey = state.optionTypes.base1 === "put" ? "puts" : "calls";
  const sorted = [...state.historyByDate].sort((a, b) => a.fechaRaw.localeCompare(b.fechaRaw));

  const labels = [];
  const impliedData = [];
  const realizedData = [];
  const vrpData = [];

  for (const entry of sorted) {
    if (state.selectedFechaDesde && entry.fechaRaw < state.selectedFechaDesde) continue;
    const price1 = entry[b1TypeKey]?.[b1Key];
    if (!Number.isFinite(price1) || !Number.isFinite(entry.ggal) || entry.ggal === 0) continue;

    const dte = getDaysToOpex(entry.fechaRaw);
    const ven = getBaseExtrinsicValue(base1Strike, price1, entry.ggal, state.optionTypes.base1) / entry.ggal;
    const targetMs = new Date(entry.fechaRaw).getTime() + dte * 86400000;
    const futureEntry = findClosestEntry(sorted, targetMs);
    const realized = (futureEntry && futureEntry.fechaRaw > entry.fechaRaw && Number.isFinite(futureEntry.ggal))
      ? Math.abs(futureEntry.ggal - entry.ggal) / entry.ggal
      : null;

    const [yr, mo, dy] = entry.fechaRaw.split("-");
    labels.push(`${dy}/${mo}`);
    impliedData.push(ven);
    realizedData.push(realized);
    vrpData.push(realized !== null ? ven - realized : null);
  }

  if (!labels.length) { destroyChart(chartKey); return; }

  const b1Label = formatOptionLabel(state.optionTypes.base1, base1Strike);
  elements.tasasVrpChartTitle.textContent = `VRP — ${b1Label}`;

  const pt = { tension: 0.2, fill: false, spanGaps: true, pointRadius: 3, pointHoverRadius: 5 };
  const datasets = [
    { label: "VEN implícito", data: impliedData, borderColor: "#4fc3f7", backgroundColor: "#4fc3f7", yAxisID: "y", ...pt },
    { label: "Movimiento realizado", data: realizedData, borderColor: "#66bb6a", backgroundColor: "#66bb6a", yAxisID: "y", ...pt },
    { label: "VRP (impl − real)", data: vrpData, borderColor: "#ffa726", backgroundColor: "#ffa726", yAxisID: "y", borderDash: [4, 3], ...pt }
  ];

  captureChartVisibilityState(chartKey);
  applyChartVisibilityState(chartKey, datasets);
  destroyChart(chartKey);

  const opts = makeTasasChartOptions((v) => formatPercent(v));
  opts.plugins.tooltip.callbacks = { label: (ctx) => `${ctx.dataset.label}: ${formatPercent(ctx.parsed.y)}` };
  state.charts[chartKey] = new Chart(elements.tasasVrpChart, { type: "line", data: { labels, datasets }, options: opts });
}

function renderTasasRankChart(base1Strike, base2Strike) {
  const chartKey = "tasasRank";

  if (!Number.isFinite(base1Strike) || !Number.isFinite(base2Strike) || !state.historyByDate.length) {
    destroyChart(chartKey);
    return;
  }

  const b1Key = strikeKey(base1Strike);
  const b2Key = strikeKey(base2Strike);
  const b1TypeKey = state.optionTypes.base1 === "put" ? "puts" : "calls";
  const b2TypeKey = state.optionTypes.base2 === "put" ? "puts" : "calls";

  const sorted = [...state.historyByDate].sort((a, b) => a.fechaRaw.localeCompare(b.fechaRaw));

  // Compute full historical VEN for rank context (no date filter)
  const allVen1 = sorted
    .map((e) => {
      const p = e[b1TypeKey]?.[b1Key];
      return (Number.isFinite(p) && Number.isFinite(e.ggal) && e.ggal > 0)
        ? getBaseExtrinsicValue(base1Strike, p, e.ggal, state.optionTypes.base1) / e.ggal
        : null;
    })
    .filter((v) => v !== null)
    .sort((a, b) => a - b);

  const percentileOf = (val, sortedArr) => {
    if (!sortedArr.length) return null;
    const below = sortedArr.filter((v) => v <= val).length;
    return (below / sortedArr.length) * 100;
  };

  const labels = [];
  const ven1Data = [];
  const ven2Data = [];
  const rankData = [];

  for (const entry of sorted) {
    if (state.selectedFechaDesde && entry.fechaRaw < state.selectedFechaDesde) continue;
    const p1 = entry[b1TypeKey]?.[b1Key];
    const p2 = entry[b2TypeKey]?.[b2Key];
    if (!Number.isFinite(p1) && !Number.isFinite(p2)) continue;
    if (!Number.isFinite(entry.ggal) || entry.ggal === 0) continue;

    const ven1 = Number.isFinite(p1) ? getBaseExtrinsicValue(base1Strike, p1, entry.ggal, state.optionTypes.base1) / entry.ggal : null;
    const ven2 = Number.isFinite(p2) ? getBaseExtrinsicValue(base2Strike, p2, entry.ggal, state.optionTypes.base2) / entry.ggal : null;
    const rank = ven1 !== null ? percentileOf(ven1, allVen1) : null;

    const [yr, mo, dy] = entry.fechaRaw.split("-");
    labels.push(`${dy}/${mo}`);
    ven1Data.push(ven1);
    ven2Data.push(ven2);
    rankData.push(rank);
  }

  if (!labels.length) { destroyChart(chartKey); return; }

  const b1Label = formatOptionLabel(state.optionTypes.base1, base1Strike);
  const b2Label = formatOptionLabel(state.optionTypes.base2, base2Strike);
  elements.tasasRankChartTitle.textContent = `VEN + Rank — ${b1Label} / ${b2Label}`;

  const pt = { tension: 0.2, fill: false, spanGaps: true, pointRadius: 3, pointHoverRadius: 5 };
  const datasets = [
    { label: `VEN ${b1Label}`, data: ven1Data, borderColor: "#4fc3f7", backgroundColor: "#4fc3f7", yAxisID: "y", ...pt },
    { label: `VEN ${b2Label}`, data: ven2Data, borderColor: "#ef5350", backgroundColor: "#ef5350", yAxisID: "y", ...pt },
    { label: `Rank ${b1Label}`, data: rankData, borderColor: "#f0c24b", backgroundColor: "#f0c24b", yAxisID: "y2", borderDash: [4, 3], pointRadius: 2, pointHoverRadius: 4, tension: 0.2, fill: false, spanGaps: true }
  ];

  captureChartVisibilityState(chartKey);
  applyChartVisibilityState(chartKey, datasets);
  destroyChart(chartKey);

  const opts = makeTasasChartOptions((v) => formatPercent(v), (v) => `${formatNumber(v, 0)}%`);
  opts.scales.y2.min = 0;
  opts.scales.y2.max = 100;
  opts.scales.y2.grace = 0;
  opts.plugins.tooltip.callbacks = {
    label: (ctx) => ctx.dataset.yAxisID === "y2"
      ? `${ctx.dataset.label}: ${formatNumber(ctx.parsed.y, 1)}%`
      : `${ctx.dataset.label}: ${formatPercent(ctx.parsed.y)}`
  };
  state.charts[chartKey] = new Chart(elements.tasasRankChart, { type: "line", data: { labels, datasets }, options: opts });
}

function renderTasasThetaChart(base1Strike, base2Strike) {
  const chartKey = "tasasTheta";

  if (!Number.isFinite(base1Strike) || !Number.isFinite(base2Strike) || !state.historyByDate.length) {
    destroyChart(chartKey);
    return;
  }

  const b1Key = strikeKey(base1Strike);
  const b2Key = strikeKey(base2Strike);
  const b1TypeKey = state.optionTypes.base1 === "put" ? "puts" : "calls";
  const b2TypeKey = state.optionTypes.base2 === "put" ? "puts" : "calls";

  const data1 = [];
  const data2 = [];

  for (const entry of state.historyByDate) {
    if (state.selectedFechaDesde && entry.fechaRaw < state.selectedFechaDesde) continue;
    if (!Number.isFinite(entry.ggal) || entry.ggal === 0) continue;
    const dte = getDaysToOpex(entry.fechaRaw);
    if (!Number.isFinite(dte) || dte < 0) continue;

    const p1 = entry[b1TypeKey]?.[b1Key];
    const p2 = entry[b2TypeKey]?.[b2Key];
    if (Number.isFinite(p1)) data1.push({ x: dte, y: getBaseExtrinsicValue(base1Strike, p1, entry.ggal, state.optionTypes.base1) / entry.ggal });
    if (Number.isFinite(p2)) data2.push({ x: dte, y: getBaseExtrinsicValue(base2Strike, p2, entry.ggal, state.optionTypes.base2) / entry.ggal });
  }

  if (!data1.length && !data2.length) { destroyChart(chartKey); return; }

  const b1Label = formatOptionLabel(state.optionTypes.base1, base1Strike);
  const b2Label = formatOptionLabel(state.optionTypes.base2, base2Strike);
  elements.tasasThetaChartTitle.textContent = `Theta Decay — ${b1Label} / ${b2Label}`;

  const datasets = [
    { label: `VEN ${b1Label}`, data: data1, backgroundColor: "#4fc3f780", borderColor: "#4fc3f7", pointRadius: 5, pointHoverRadius: 7 },
    { label: `VEN ${b2Label}`, data: data2, backgroundColor: "#ef535080", borderColor: "#ef5350", pointRadius: 5, pointHoverRadius: 7 }
  ];

  captureChartVisibilityState(chartKey);
  applyChartVisibilityState(chartKey, datasets);
  destroyChart(chartKey);

  const opts = makeTasasChartOptions((v) => formatPercent(v));
  opts.scales.x = {
    type: "linear",
    title: { display: true, text: "DTE (días al vencimiento)", color: "#8ea7c6" },
    ticks: { color: "#8ea7c6" },
    grid: { color: "rgba(116, 150, 189, 0.08)" },
    border: { color: "rgba(116, 150, 189, 0.18)" }
  };
  opts.plugins.tooltip.callbacks = {
    title: (items) => `DTE: ${items[0]?.parsed.x} días`,
    label: (ctx) => `${ctx.dataset.label}: ${formatPercent(ctx.parsed.y)}`
  };
  state.charts[chartKey] = new Chart(elements.tasasThetaChart, { type: "scatter", data: { datasets }, options: opts });
}

function renderTasasSkewChart() {
  const chartKey = "tasasSkew";
  const entry = state.liveEntry ?? state.historyByDate.at(-1);

  if (!entry || !Number.isFinite(entry.ggal) || entry.ggal === 0) {
    destroyChart(chartKey);
    return;
  }

  const allStrikeKeys = new Set([
    ...Object.keys(entry.calls ?? {}),
    ...Object.keys(entry.puts ?? {})
  ]);
  const sortedStrikes = [...allStrikeKeys].map(Number).filter(Number.isFinite).sort((a, b) => a - b);

  if (!sortedStrikes.length) { destroyChart(chartKey); return; }

  const callData = [];
  const putData = [];

  for (const s of sortedStrikes) {
    const moneyness = s / entry.ggal;
    const callPrice = entry.calls?.[strikeKey(s)];
    const putPrice = entry.puts?.[strikeKey(s)];
    if (Number.isFinite(callPrice)) callData.push({ x: moneyness, y: getBaseExtrinsicValue(s, callPrice, entry.ggal, "call") / entry.ggal });
    if (Number.isFinite(putPrice)) putData.push({ x: moneyness, y: getBaseExtrinsicValue(s, putPrice, entry.ggal, "put") / entry.ggal });
  }

  const dateLabel = entry.fechaRaw ?? "";
  elements.tasasSkewChartTitle.textContent = `Volatility Skew / Smile${dateLabel ? ` — ${dateLabel}` : ""}`;

  const pt = { tension: 0.2, fill: false, spanGaps: true, pointRadius: 4, pointHoverRadius: 6 };
  const datasets = [
    { label: "VENC (Call)", data: callData, borderColor: "#4fc3f7", backgroundColor: "#4fc3f7", ...pt },
    { label: "VENP (Put)", data: putData, borderColor: "#ef5350", backgroundColor: "#ef5350", ...pt }
  ];

  captureChartVisibilityState(chartKey);
  applyChartVisibilityState(chartKey, datasets);
  destroyChart(chartKey);

  const opts = makeTasasChartOptions((v) => formatPercent(v));
  opts.scales.x = {
    type: "linear",
    title: { display: true, text: "Moneyness (K/S)", color: "#8ea7c6" },
    ticks: { color: "#8ea7c6", callback: (v) => formatNumber(v, 2) },
    grid: { color: "rgba(116, 150, 189, 0.08)" },
    border: { color: "rgba(116, 150, 189, 0.18)" }
  };
  opts.plugins.tooltip.callbacks = {
    title: (items) => `K/S: ${formatNumber(items[0]?.parsed.x, 3)}`,
    label: (ctx) => `${ctx.dataset.label}: ${formatPercent(ctx.parsed.y)}`
  };
  state.charts[chartKey] = new Chart(elements.tasasSkewChart, { type: "line", data: { datasets }, options: opts });
}

function createTemporalLivePlugin(chartKey, liveIndex, seriesEntries) {
  return {
    id: `pointLabels-${chartKey}`,
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      ctx.save();
      ctx.font = "12px Barlow, sans-serif";

      seriesEntries.forEach(({ datasetIndex, values }) => {
        const datasetMeta = chart.getDatasetMeta(datasetIndex);
        if (!datasetMeta?.data) return;

        const targetIndex = liveIndex >= 0 ? liveIndex : values.length - 1;
        const value = values[targetIndex];
        if (!Number.isFinite(value)) return;

        const element = datasetMeta.data[targetIndex];
        if (!element) return;

        const label = formatNumber(value, 2);
        const placement = chooseSpecialLabelPlacement(chart, element, label, ctx);
        ctx.fillStyle = liveIndex >= 0 ? "#22c55e" : "#a78bfa";
        ctx.textAlign = placement.align;
        ctx.textBaseline = placement.baseline;
        ctx.fillText(label, placement.x, placement.y);
      });

      ctx.restore();
    }
  };
}

function renderTasasTemporalChart(base1Strike, base2Strike) {
  const chartKey = "tasasTemporal";

  if (!Number.isFinite(base1Strike) || !Number.isFinite(base2Strike) || !state.historyByDate.length) {
    destroyChart(chartKey);
    return;
  }

  const b1Key = strikeKey(base1Strike);
  const b2Key = strikeKey(base2Strike);
  const b1TypeKey = state.optionTypes.base1 === "put" ? "puts" : "calls";
  const b2TypeKey = state.optionTypes.base2 === "put" ? "puts" : "calls";

  const allEntries = [...state.historyByDate];
  if (state.liveEntry && !state.historyByDate.some((e) => e.fechaRaw === state.liveEntry.fechaRaw)) {
    allEntries.push({ ...state.liveEntry, isLive: true });
  }
  const sorted = allEntries.sort((a, b) => a.fechaRaw.localeCompare(b.fechaRaw));

  const labels = [];
  const ve1Data = [];
  const ve2Data = [];
  const straddleData = [];
  const ggalData = [];
  let liveIndex = -1;

  for (const entry of sorted) {
    if (state.selectedFechaDesde && entry.fechaRaw < state.selectedFechaDesde) continue;
    const price1 = entry[b1TypeKey]?.[b1Key];
    const price2 = entry[b2TypeKey]?.[b2Key];
    if (!Number.isFinite(price1) && !Number.isFinite(price2)) continue;
    if (entry.isLive) liveIndex = labels.length;
    const [yr, mo, dy] = entry.fechaRaw.split("-");
    labels.push(`${dy}/${mo}`);
    ve1Data.push(Number.isFinite(price1) ? getBaseExtrinsicValue(base1Strike, price1, entry.ggal, state.optionTypes.base1) : null);
    ve2Data.push(Number.isFinite(price2) ? getBaseExtrinsicValue(base2Strike, price2, entry.ggal, state.optionTypes.base2) : null);
    straddleData.push((Number.isFinite(price1) && Number.isFinite(price2)) ? price1 + price2 : null);
    ggalData.push(Number.isFinite(entry.ggal) ? entry.ggal : null);
  }

  if (!labels.length) {
    destroyChart(chartKey);
    return;
  }

  const b1Label = formatOptionLabel(state.optionTypes.base1, base1Strike);
  const b2Label = formatOptionLabel(state.optionTypes.base2, base2Strike);
  elements.tasasTemporalChartTitle.textContent = `VE Temporal — ${b1Label} / ${b2Label}`;

  const livePointRadius = (dataIndex, defaultRadius) => {
    if (dataIndex === liveIndex) return 6;
    const lastIdx = liveIndex >= 0 ? liveIndex - 1 : ve1Data.length - 1;
    if (dataIndex === lastIdx) return 5;
    return defaultRadius;
  };

  const livePointColor = (dataIndex, baseColor) => {
    if (dataIndex === liveIndex) return "#22c55e";
    const lastIdx = liveIndex >= 0 ? liveIndex - 1 : ve1Data.length - 1;
    if (dataIndex === lastIdx) return "#a78bfa";
    return baseColor;
  };

  const datasets = [
    {
      label: `VE ${b1Label}`,
      data: ve1Data,
      borderColor: "#4fc3f7",
      backgroundColor: "#4fc3f7",
      yAxisID: "y",
      pointRadius: (context) => livePointRadius(context.dataIndex, 3),
      pointHoverRadius: 5,
      pointBackgroundColor: (context) => livePointColor(context.dataIndex, "#4fc3f7"),
      segment: { borderDash: (context) => getLiveSegmentBorderDash(context, liveIndex) },
      tension: 0.2,
      fill: false,
      spanGaps: true
    },
    {
      label: `VE ${b2Label}`,
      data: ve2Data,
      borderColor: "#ef5350",
      backgroundColor: "#ef5350",
      yAxisID: "y",
      pointRadius: (context) => livePointRadius(context.dataIndex, 3),
      pointHoverRadius: 5,
      pointBackgroundColor: (context) => livePointColor(context.dataIndex, "#ef5350"),
      segment: { borderDash: (context) => getLiveSegmentBorderDash(context, liveIndex) },
      tension: 0.2,
      fill: false,
      spanGaps: true
    },
    {
      label: "Straddle",
      data: straddleData,
      borderColor: "#66bb6a",
      backgroundColor: "#66bb6a",
      yAxisID: "y2",
      borderDash: [4, 3],
      segment: { borderDash: (context) => getLiveSegmentBorderDash(context, liveIndex) },
      pointRadius: 2,
      pointHoverRadius: 4,
      tension: 0.2,
      fill: false,
      spanGaps: true
    },
    {
      label: "GGAL",
      data: ggalData,
      borderColor: "#f0c24b",
      backgroundColor: "#f0c24b",
      yAxisID: "y3",
      borderDash: [6, 3],
      segment: { borderDash: (context) => getLiveSegmentBorderDash(context, liveIndex) },
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0.2,
      fill: false,
      spanGaps: true
    }
  ];

  captureChartVisibilityState(chartKey);
  applyChartVisibilityState(chartKey, datasets);
  destroyChart(chartKey);

  state.charts[chartKey] = new Chart(elements.tasasTemporalChart, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      layout: { padding: { left: 10, right: 22, top: 10 } },
      plugins: {
        legend: {
          display: true,
          onClick: handlePersistentLegendClick,
          labels: { color: "#c7d7ef" }
        },
        tooltip: {
          displayColors: true,
          backgroundColor: "#111c29",
          borderColor: "rgba(116, 150, 189, 0.22)",
          borderWidth: 1,
          titleColor: "#eaf2ff",
          bodyColor: "#c7d7ef",
          callbacks: {
            label: (context) => `${context.dataset.label}: ${formatNumber(context.parsed.y, 2)}`
          }
        }
      },
      animation: false,
      scales: {
        x: {
          offset: true,
          ticks: { color: "#8ea7c6", maxRotation: 45, minRotation: 45, autoSkip: false },
          grid: { color: "rgba(116, 150, 189, 0.08)" },
          border: { color: "rgba(116, 150, 189, 0.18)" }
        },
        y: {
          position: "left",
          grace: "5%",
          ticks: { color: "#8ea7c6", callback: (v) => formatNumber(v, 0) },
          grid: { color: "rgba(116, 150, 189, 0.12)" },
          border: { color: "rgba(116, 150, 189, 0.18)" }
        },
        y2: {
          position: "right",
          grace: "5%",
          ticks: { color: "#66bb6a", callback: (v) => formatNumber(v, 2) },
          grid: { drawOnChartArea: false },
          border: { color: "rgba(116, 150, 189, 0.18)" }
        },
        y3: {
          position: "right",
          offset: true,
          grace: "5%",
          ticks: { color: "#f0c24b", callback: (v) => formatNumber(v, 0) },
          grid: { drawOnChartArea: false },
          border: { color: "rgba(116, 150, 189, 0.18)" }
        }
      }
    },
    plugins: [createTemporalLivePlugin(chartKey, liveIndex, [
      { datasetIndex: 0, values: ve1Data },
      { datasetIndex: 1, values: ve2Data }
    ])]
  });
}

function renderTasasPrimaChart(base1Strike, base2Strike) {
  const chartKey = "tasasPrima";

  if (!Number.isFinite(base1Strike) || !Number.isFinite(base2Strike) || !state.historyByDate.length) {
    destroyChart(chartKey);
    return;
  }

  const b1Key = strikeKey(base1Strike);
  const b2Key = strikeKey(base2Strike);
  const b1TypeKey = state.optionTypes.base1 === "put" ? "puts" : "calls";
  const b2TypeKey = state.optionTypes.base2 === "put" ? "puts" : "calls";

  const sorted = [...state.historyByDate].sort((a, b) => a.fechaRaw.localeCompare(b.fechaRaw));
  const labels = [];
  const p1Data = [];
  const p2Data = [];
  const straddleData = [];
  const ggalData = [];

  for (const entry of sorted) {
    if (state.selectedFechaDesde && entry.fechaRaw < state.selectedFechaDesde) continue;
    const price1 = entry[b1TypeKey]?.[b1Key];
    const price2 = entry[b2TypeKey]?.[b2Key];
    if (!Number.isFinite(price1) && !Number.isFinite(price2)) continue;
    const [yr, mo, dy] = entry.fechaRaw.split("-");
    labels.push(`${dy}/${mo}`);
    p1Data.push(Number.isFinite(price1) ? price1 : null);
    p2Data.push(Number.isFinite(price2) ? price2 : null);
    straddleData.push((Number.isFinite(price1) && Number.isFinite(price2)) ? price1 + price2 : null);
    ggalData.push(Number.isFinite(entry.ggal) ? entry.ggal : null);
  }

  if (!labels.length) { destroyChart(chartKey); return; }

  const b1Label = formatOptionLabel(state.optionTypes.base1, base1Strike);
  const b2Label = formatOptionLabel(state.optionTypes.base2, base2Strike);
  elements.tasasPrimaChartTitle.textContent = `Prima Temporal — ${b1Label} / ${b2Label}`;

  const commonPointStyle = { pointRadius: 3, pointHoverRadius: 5, tension: 0.2, fill: false, spanGaps: true };

  const datasets = [
    { label: `Prima ${b1Label}`, data: p1Data, borderColor: "#4fc3f7", backgroundColor: "#4fc3f7", yAxisID: "y", ...commonPointStyle },
    { label: `Prima ${b2Label}`, data: p2Data, borderColor: "#ef5350", backgroundColor: "#ef5350", yAxisID: "y", ...commonPointStyle },
    { label: "Straddle", data: straddleData, borderColor: "#66bb6a", backgroundColor: "#66bb6a", yAxisID: "y2", borderDash: [4, 3], pointRadius: 2, pointHoverRadius: 4, tension: 0.2, fill: false, spanGaps: true },
    { label: "GGAL", data: ggalData, borderColor: "#f0c24b", backgroundColor: "#f0c24b", yAxisID: "y3", borderDash: [6, 3], pointRadius: 0, pointHoverRadius: 4, tension: 0.2, fill: false, spanGaps: true }
  ];

  captureChartVisibilityState(chartKey);
  applyChartVisibilityState(chartKey, datasets);
  destroyChart(chartKey);

  state.charts[chartKey] = new Chart(elements.tasasPrimaChart, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      layout: { padding: { left: 10, right: 22, top: 10 } },
      plugins: {
        legend: { display: true, onClick: handlePersistentLegendClick, labels: { color: "#c7d7ef" } },
        tooltip: {
          displayColors: true,
          backgroundColor: "#111c29",
          borderColor: "rgba(116, 150, 189, 0.22)",
          borderWidth: 1,
          titleColor: "#eaf2ff",
          bodyColor: "#c7d7ef",
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatNumber(ctx.parsed.y, 2)}` }
        }
      },
      animation: false,
      scales: {
        x: {
          offset: true,
          ticks: { color: "#8ea7c6", maxRotation: 45, minRotation: 45, autoSkip: true, maxTicksLimit: 20 },
          grid: { color: "rgba(116, 150, 189, 0.08)" },
          border: { color: "rgba(116, 150, 189, 0.18)" }
        },
        y: {
          position: "left",
          grace: "5%",
          ticks: { color: "#8ea7c6", callback: (v) => formatNumber(v, 2) },
          grid: { color: "rgba(116, 150, 189, 0.12)" },
          border: { color: "rgba(116, 150, 189, 0.18)" }
        },
        y2: {
          position: "right",
          grace: "5%",
          ticks: { color: "#66bb6a", callback: (v) => formatNumber(v, 2) },
          grid: { drawOnChartArea: false },
          border: { color: "rgba(116, 150, 189, 0.18)" }
        },
        y3: {
          position: "right",
          offset: true,
          grace: "5%",
          ticks: { color: "#f0c24b", callback: (v) => formatNumber(v, 0) },
          grid: { drawOnChartArea: false },
          border: { color: "rgba(116, 150, 189, 0.18)" }
        }
      }
    }
  });
}
