/* ===== MÃ“DULO SIMULADOR DE ESTRATEGIAS ===== */

const SIM = {
  legs: [],
  chart: null,
  ui: { floatPanelVisible: true, floatPanelPinned: false },
  // Temp strategy persistence (localStorage)
  _tempLoaded: false,
  _tempSaveTid: null,
  _tempSaveSuppress: false,
  _tempIvOverridesPending: null,
};

function simTempKey() { return 'ggal_sim_temp_strategy_v1'; }

function simReadTempState() {
  try {
    const raw = localStorage.getItem(simTempKey());
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || obj.v !== 1) return null;
    return obj;
  } catch (_) { return null; }
}

function simWriteTempState(obj) {
  try { localStorage.setItem(simTempKey(), JSON.stringify(obj)); } catch (_) {}
}

function simRemoveTempState() {
  try { localStorage.removeItem(simTempKey()); } catch (_) {}
}

function simGetTempSnapshot() {
  const exp = simGetActiveExpiry();
  const legs = (SIM.legs || []).map(l => ({
    type: l.type,
    qty: +l.qty || 0,
    strike: +l.strike || 0,
    entryPrice: +l.entryPrice || 0,
    expiry: String(l.expiry || exp || ''),
    iv: +l.iv || 0,
  }));

  const ivOverrides = {};
  const seen = new Set();
  (SIM.legs || []).forEach(l => {
    if (!l || l.type === 'stock') return;
    const key = simGetLegIvKey(l);
    if (seen.has(key)) return;
    seen.add(key);
    const el = document.getElementById(simGetIvSliderId(key));
    const v = parseARSNum(el?.value || '');
    if (isFinite(v) && v > 0) ivOverrides[key] = Math.max(1, Math.min(120, v));
  });

  const p = {
    spot: parseFloat(document.getElementById('sim-sl-spot')?.value || '') || (parseFloat(ST.spot) || 0),
    dte: parseFloat(document.getElementById('sim-sl-dte')?.value || '') || simGetCurrentDTE(),
    tlr: parseFloat(document.getElementById('sim-sl-rfr')?.value || '') || 20,
    step: parseFloat(document.getElementById('sim-table-step')?.value || '') || 1,
    range: parseFloat(document.getElementById('sim-table-range')?.value || '') || 20,
  };

  const sel = document.getElementById('sim-import-sel');
  const src = sel?.value || '';

  return { v: 1, t: Date.now(), exp: String(exp || ''), src, p, legs, ivOverrides };
}

function simApplyIvOverrides(ivOverrides) {
  if (!ivOverrides) return;
  Object.entries(ivOverrides).forEach(([key, v]) => {
    const pct = Math.max(1, Math.min(120, parseFloat(v) || 0));
    if (!isFinite(pct) || pct <= 0) return;
    const el = document.getElementById(simGetIvSliderId(key));
    if (el) el.value = pct.toFixed(2).replace('.', ',');
    (SIM.legs || []).forEach(l => {
      if (!l || l.type === 'stock') return;
      if (simGetLegIvKey(l) === key) l.iv = pct / 100;
    });
  });
}

function simScheduleTempSave() {
  if (SIM._tempSaveSuppress) return;
  if (SIM._tempSaveTid) clearTimeout(SIM._tempSaveTid);
  SIM._tempSaveTid = setTimeout(() => {
    SIM._tempSaveTid = null;
    if (SIM._tempSaveSuppress) return;
    if (!SIM.legs || !SIM.legs.length) { simRemoveTempState(); return; }
    simWriteTempState(simGetTempSnapshot());
  }, 200);
}

function simTryLoadTempOnce() {
  if (SIM._tempLoaded) return false;
  SIM._tempLoaded = true;
  if (SIM.legs && SIM.legs.length) return false;
  const st = simReadTempState();
  if (!st || !Array.isArray(st.legs) || !st.legs.length) return false;

  SIM._tempSaveSuppress = true;
  try {
    const exp = simGetActiveExpiry() || st.exp || '';
    SIM.legs = st.legs.map(l => simBuildImportedLeg({
      type: l.type || 'call',
      qty: +l.qty || 0,
      strike: +l.strike || (ST.spot || 0),
      entryPrice: +l.entryPrice || 0,
      expiry: String(l.expiry || exp || ''),
    }));

    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el && isFinite(v)) el.value = String(v);
    };
    setVal('sim-sl-spot', st.p?.spot);
    setVal('sim-in-spot', st.p?.spot);
    setVal('sim-sl-dte', st.p?.dte);
    setVal('sim-in-dte', st.p?.dte);
    setVal('sim-sl-rfr', st.p?.tlr);
    setVal('sim-in-rfr', st.p?.tlr);
    setVal('sim-table-step', st.p?.step);
    setVal('sim-table-range', st.p?.range);

    SIM._tempIvOverridesPending = st.ivOverrides || null;

    const sel = document.getElementById('sim-import-sel');
    if (sel && st.src) sel.value = st.src;
  } finally {
    SIM._tempSaveSuppress = false;
  }
  return true;
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   HTML estÃ¡tico â€” el tab y el pane estÃ¡n en
   ggal_options_dashboard.html. Esta funciÃ³n
   solo inicializa el layout y los parÃ¡metros.
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function simInjectHTML() {
  if (!document.getElementById('tab-simulador')) return;
  // Build/patch layout first, then normalize params header (dedup buttons + bind events).
  simEnhanceLayout();
  simPatchParamsHeader();
  simResetParams();
}

// Shared style constants for table headers
const SIM_TH  = 'padding:5px 6px;font-family:var(--sans);font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border);font-weight:500;white-space:nowrap;';
const SIM_TH2 = 'padding:6px 10px;font-family:var(--sans);font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border);font-weight:500;';

function simToggleSection(sectionId, btn) {
  const body = document.getElementById(sectionId);
  if (!body) return;
  const container = body.parentElement;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (container) {
    const header = container.querySelector('[data-sim-collapse-header]');
    if (isOpen) {
      container.dataset.simCollapsed = '1';
      container.style.width = 'fit-content';
      container.style.minWidth = '0';
      container.style.maxWidth = 'max-content';
      container.style.flex = '0 0 auto';
      if (header) header.style.marginBottom = '0';
    } else {
      container.dataset.simCollapsed = '0';
      container.style.width = container.dataset.simExpandedWidth || '';
      container.style.maxWidth = '';
      container.style.flex = '';
      container.style.minWidth = container.dataset.simExpandedMinWidth || '';
      if (header) header.style.marginBottom = '10px';
    }
  }
  // Use explicit codepoints to avoid encoding issues.
  if (btn) btn.textContent = isOpen ? '\u25B8' : '\u25BE';
}

function simBindCollapseCarets(root) {
  const scope = root || document;
  const containers = Array.from(scope.querySelectorAll('[data-sim-collapsible=\"1\"]'));
  containers.forEach((container) => {
    const header = container.querySelector('[data-sim-collapse-header]');
    if (!header) return;

    // Body is the first sim-section-* div inside the container.
    const body = container.querySelector('div[id^=\"sim-section-\"]');
    if (!body || !body.id) return;

    const btns = Array.from(header.querySelectorAll('button.btn-sm'));
    if (!btns.length) return;
    const caretBtn = btns[btns.length - 1];
    if (!caretBtn || caretBtn.dataset.simCollapseBound === '1') return;

    caretBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      simToggleSection(body.id, caretBtn);
      simFitFloatingPanelToViewport?.();
      simScheduleTempSave?.();
    });
    caretBtn.dataset.simCollapseBound = '1';
  });
}

function simMakeCollapsible(container, title, sectionId, extraNode) {
  if (!container || container.dataset.simCollapsible === '1') return;
  container.dataset.simCollapsible = '1';
  const body = document.createElement('div');
  body.id = sectionId;
  body.style.display = 'block';
  while (container.firstChild) body.appendChild(container.firstChild);

  const header = document.createElement('div');
  header.dataset.simCollapseHeader = '1';
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.gap = '10px';
  header.style.marginBottom = '10px';

  const titleEl = document.createElement('span');
  titleEl.style.fontSize = '10px';
  titleEl.style.fontWeight = '500';
  titleEl.style.color = 'var(--muted)';
  titleEl.style.textTransform = 'uppercase';
  titleEl.style.letterSpacing = '.6px';
  titleEl.textContent = title;

  const right = document.createElement('div');
  right.style.display = 'flex';
  right.style.alignItems = 'center';
  right.style.gap = '8px';
  if (extraNode) right.appendChild(extraNode);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-sm';
  // Use explicit codepoints to avoid encoding issues.
  btn.textContent = '\u25BE';
  btn.style.padding = '2px 8px';
  btn.style.minWidth = '30px';
  btn.addEventListener('click', () => simToggleSection(sectionId, btn));
  right.appendChild(btn);

  header.appendChild(titleEl);
  header.appendChild(right);
  container.appendChild(header);
  container.appendChild(body);
}

function simEnhanceLayout() {
  const grid = document.getElementById('sim-main-grid');
  if (!grid) return;
  // Even if the HTML already has data-sim-enhanced="1" (because it was pre-rendered),
  // we still need to bind drag + icons for the floating panel elements.
  if (grid.dataset.simEnhanced === '1') {
    simEnsureFloatingPanel();
    return;
  }
  grid.dataset.simEnhanced = '1';
  // Estrategia/Posicion/Metricas live in a floating overlay panel (not in the grid layout).
  grid.style.gridTemplateColumns = 'minmax(0, 1fr)';
  const initialRange = parseFloat(document.getElementById('sim-sl-range')?.value || '20') || 20;

  const leftCol = grid.children[0];
  const rightCol = grid.children[1];
  if (!leftCol || !rightCol) return;
  rightCol.style.minWidth = '0';

  const strategyPanel = leftCol.children[0];
  const positionCardsPanel = leftCol.children[1];
  const metricsPanel = leftCol.children[2];
  // Move left panels into the floating container, then hide the original column.
  const float = simEnsureFloatingPanel();
  simMoveLeftPanelsToFloating(float?.body, strategyPanel, positionCardsPanel, metricsPanel);
  leftCol.style.display = 'none';
  if (strategyPanel) {
    strategyPanel.dataset.simExpandedMinWidth = '320px';
    strategyPanel.dataset.simExpandedWidth = '320px';
    strategyPanel.style.minWidth = '320px';
    strategyPanel.style.width = '320px';
    const strategyTitle = strategyPanel.firstElementChild;
    if (strategyTitle?.classList?.contains('panel-title')) strategyTitle.remove();
    simMakeCollapsible(strategyPanel, 'Estrategia', 'sim-section-strategy');
  }
  if (positionCardsPanel && metricsPanel) {
    positionCardsPanel.dataset.simExpandedMinWidth = '320px';
    positionCardsPanel.dataset.simExpandedWidth = '320px';
    metricsPanel.dataset.simExpandedMinWidth = '320px';
    metricsPanel.dataset.simExpandedWidth = '320px';
    positionCardsPanel.style.minWidth = '320px';
    positionCardsPanel.style.width = '320px';
    metricsPanel.style.minWidth = '320px';
    metricsPanel.style.width = '320px';
    const positionCardsTitle = positionCardsPanel.firstElementChild;
    if (positionCardsTitle?.classList?.contains('panel-title')) positionCardsTitle.remove();
    simMakeCollapsible(positionCardsPanel, 'Posicion', 'sim-section-position-cards');


    const metricsTitle = metricsPanel.firstElementChild;
    if (metricsTitle?.classList?.contains('panel-title')) metricsTitle.remove();
    simMakeCollapsible(metricsPanel, 'Metricas', 'sim-section-metrics');
  }

  const chartCard = document.getElementById('sim-chart')?.closest('.chart-wrap') || null;
  const paramsPanel = document.getElementById('sim-sl-spot')?.closest('.panel') || null;
  const tablePanel = document.getElementById('sim-table-step')?.closest('.panel') || null;
  if (paramsPanel && rightCol.firstElementChild !== paramsPanel) {
    rightCol.insertBefore(paramsPanel, rightCol.firstElementChild);
  }
  if (paramsPanel && tablePanel && paramsPanel.nextElementSibling !== tablePanel) {
    rightCol.insertBefore(tablePanel, paramsPanel.nextElementSibling);
  }
  if (tablePanel && chartCard && tablePanel.nextElementSibling !== chartCard) {
    rightCol.insertBefore(chartCard, tablePanel.nextElementSibling);
  }

  if (paramsPanel) {
    const resetBtn = paramsPanel.querySelector('#sim-reset-btn') || null;
    const recalBtn = paramsPanel.querySelector('#sim-recal-iv-btn') || null;
    let paramsExtra = null;
    if (resetBtn || recalBtn) {
      paramsExtra = document.createElement('div');
      paramsExtra.style.display = 'flex';
      paramsExtra.style.alignItems = 'center';
      paramsExtra.style.gap = '8px';
      if (recalBtn) paramsExtra.appendChild(recalBtn);
      if (resetBtn) paramsExtra.appendChild(resetBtn);
    }

    const innerHeader = paramsPanel.querySelector('[data-sim-params-header]');
    if (innerHeader) innerHeader.remove();

    simMakeCollapsible(paramsPanel, 'Parametros', 'sim-section-params', paramsExtra);

    // Move "Rango" out of Parametros (keep it driven from the table panel controls).
    const rangeSlider = document.getElementById('sim-sl-range');
    if (rangeSlider?.parentElement) rangeSlider.parentElement.remove();
  }

  const stepInput = document.getElementById('sim-table-step');
  if (stepInput) {
    stepInput.min = '0.5';
    stepInput.step = '0.5';
    stepInput.value = '1';
    stepInput.style.width = '48px';
  }

  if (tablePanel) {
    const tableHeader = tablePanel.firstElementChild;
    const oldStepWrap = stepInput?.parentElement || null;
    if (oldStepWrap) oldStepWrap.remove();

    // Table controls: Escala (step %) + Rango (%)
    let tableControls = null;
    if (stepInput) {
      tableControls = document.createElement('div');
      tableControls.style.display = 'flex';
      tableControls.style.alignItems = 'center';
      tableControls.style.gap = '10px';
      tableControls.style.fontSize = '10px';
      tableControls.style.color = 'var(--muted)';

      const mkGroup = (labelText, inputEl, suffixText) => {
        const g = document.createElement('div');
        g.style.display = 'flex';
        g.style.alignItems = 'center';
        g.style.gap = '6px';
        g.appendChild(document.createTextNode(labelText));
        g.appendChild(inputEl);
        if (suffixText) g.appendChild(document.createTextNode(suffixText));
        return g;
      };

      // Escala (was "Paso")
      const stepEl = stepInput;
      stepEl.min = '0.5';
      stepEl.step = '0.5';
      stepEl.value = stepEl.value || '1';
      stepEl.style.width = '48px';
      stepEl.style.textAlign = 'center';
      stepEl.oninput = () => renderSimulador();
      tableControls.appendChild(mkGroup('Escala:', stepEl, ' %'));

      // Rango (only input, no slider)
      const rangeEl = document.createElement('input');
      rangeEl.id = 'sim-table-range';
      rangeEl.type = 'number';
      rangeEl.min = '5';
      rangeEl.max = '60';
      rangeEl.step = '1';
      rangeEl.value = String(initialRange);
      rangeEl.style.width = '48px';
      rangeEl.style.background = 'var(--bg)';
      rangeEl.style.border = '1px solid var(--border)';
      rangeEl.style.color = 'var(--text)';
      rangeEl.style.fontFamily = 'var(--mono)';
      rangeEl.style.fontSize = '11px';
      rangeEl.style.padding = '3px 6px';
      rangeEl.style.borderRadius = '3px';
      rangeEl.style.textAlign = 'center';
      rangeEl.dataset.nonNegative = '1';
      rangeEl.addEventListener('input', () => {
        // clamp and rerender
        const n = parseFloat(rangeEl.value || '0');
        if (!isFinite(n)) return;
        rangeEl.value = String(Math.min(60, Math.max(5, n)));
        renderSimulador();
      });
      tableControls.appendChild(mkGroup('Rango:', rangeEl, ' %'));
    }

    if (tableHeader) tableHeader.remove();
    simMakeCollapsible(tablePanel, 'Tabla P&L Simulado', 'sim-section-table', tableControls);
    const tableScroll = tablePanel.querySelector('#sim-section-table > div');
    if (tableScroll) {
      tableScroll.style.overflowX = 'auto';
      tableScroll.style.overflowY = 'visible';
      tableScroll.style.maxHeight = 'none';
    }
  }

  if (chartCard) {
    const chartHeader = chartCard.firstElementChild;
    if (chartHeader) chartHeader.remove();
    const badgeWrap = document.createElement('div');
    badgeWrap.style.display = 'flex';
    badgeWrap.style.alignItems = 'center';
    badgeWrap.style.gap = '8px';
    const badge = document.getElementById('sim-spot-badge');
    if (badge) badgeWrap.appendChild(badge);
    simMakeCollapsible(chartCard, 'Payoff al vencimiento', 'sim-section-chart', badgeWrap);
  }
}

function simEnsureFloatingPanel() {
  const tab = document.getElementById('tab-simulador');
  if (!tab) return null;

  // Click outside auto-hide (unless pinned).
  if (!document.body.dataset.simFloatOutsideHandler) {
    document.body.dataset.simFloatOutsideHandler = '1';
    document.addEventListener('mousedown', (e) => {
      const shell = document.getElementById('sim-float-panel');
      const openBtn = document.getElementById('sim-float-open');
      if (!shell || shell.style.display === 'none') return;
      if (SIM.ui?.floatPanelPinned) return;
      if (shell.contains(e.target)) return;
      if (openBtn && openBtn.contains(e.target)) return;
      simHideFloatingPanel();
    }, true);
  }

  // Bind helpers for when the floating panel elements exist in the static HTML.
  const bindExistingFloatUI = () => {
    const openBtn = document.getElementById('sim-float-open');
    const shell = document.getElementById('sim-float-panel');
    // Ensure collapse carets inside the floating panel are bound.
    simBindCollapseCarets?.(shell || document);

    // Minimized open button (drag + expand icon)
    if (openBtn && openBtn.dataset.simFloatBound !== '1') {
      const expand = document.getElementById('sim-float-open-expand');
      if (expand) {
        expand.textContent = '\u26F6'; // â›¶
        expand.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          simShowFloatingPanel();
        });
      }

      let dragging = false;
      let startX = 0, startY = 0, startLeft = 0, startTop = 0;
      const getPx = (v) => {
        const n = parseFloat(String(v || '').replace('px', ''));
        return isFinite(n) ? n : 0;
      };
      const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
      const onMove = (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const maxLeft = Math.max(8, window.innerWidth - openBtn.offsetWidth - 8);
        const maxTop = Math.max(8, window.innerHeight - openBtn.offsetHeight - 8);
        openBtn.style.left = `${clamp(startLeft + dx, 8, maxLeft)}px`;
        openBtn.style.top = `${clamp(startTop + dy, 8, maxTop)}px`;
      };
      const endDrag = () => {
        if (!dragging) return;
        dragging = false;
        openBtn.style.cursor = 'grab';
        try { openBtn.releasePointerCapture?.(activePointerId); } catch (_) {}
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointercancel', onUp, true);
      };
      let activePointerId = null;
      const onUp = () => endDrag();
      openBtn.addEventListener('pointerdown', (e) => {
        if (e.button != null && e.button !== 0) return;
        if (e.target && (e.target.tagName === 'BUTTON' || e.target.closest?.('button'))) return;
        dragging = true;
        openBtn.dataset.userMoved = '1';
        activePointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = getPx(openBtn.style.left) || openBtn.getBoundingClientRect().left;
        startTop = getPx(openBtn.style.top) || openBtn.getBoundingClientRect().top;
        openBtn.style.cursor = 'grabbing';
        try { openBtn.setPointerCapture?.(e.pointerId); } catch (_) {}
        window.addEventListener('pointermove', onMove, true);
        window.addEventListener('pointerup', onUp, true);
        window.addEventListener('pointercancel', onUp, true);
        e.preventDefault();
      });

      openBtn.dataset.simFloatBound = '1';
    }

    // Main shell (drag + pin/close icons)
    if (shell && shell.dataset.simFloatBound !== '1') {
      const header = shell.querySelector('[data-sim-drag-handle]');
      if (header) {
        header.style.cursor = 'grab';
        header.style.userSelect = 'none';
        header.style.touchAction = 'none';

        const pinBtn = document.getElementById('sim-float-pin');
        if (pinBtn) {
          pinBtn.textContent = '\uD83D\uDCCC'; // ðŸ“Œ
          pinBtn.addEventListener('click', () => {
            SIM.ui.floatPanelPinned = !SIM.ui.floatPanelPinned;
            simSyncFloatingVisibility();
          });
        }

        const btns = header.querySelectorAll('button');
        const closeBtn = btns.length ? btns[btns.length - 1] : null;
        if (closeBtn) {
          closeBtn.textContent = '\u274C'; // âŒ
          closeBtn.addEventListener('click', () => simHideFloatingPanel());
        }

        let dragging = false;
        let startX = 0, startY = 0, startLeft = 0, startTop = 0;
        const getPx = (v) => {
          const n = parseFloat(String(v || '').replace('px', ''));
          return isFinite(n) ? n : 0;
        };
        const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
        const onMove = (e) => {
          if (!dragging) return;
          const dx = e.clientX - startX;
          const dy = e.clientY - startY;
          const maxLeft = Math.max(8, window.innerWidth - shell.offsetWidth - 8);
          const maxTop = Math.max(8, window.innerHeight - 60);
          shell.style.left = `${clamp(startLeft + dx, 8, maxLeft)}px`;
          shell.style.top = `${clamp(startTop + dy, 8, maxTop)}px`;
        };
        const endDrag = () => {
          if (!dragging) return;
          dragging = false;
          header.style.cursor = 'grab';
          try { header.releasePointerCapture?.(activePointerId); } catch (_) {}
          window.removeEventListener('pointermove', onMove, true);
          window.removeEventListener('pointerup', onUp, true);
          window.removeEventListener('pointercancel', onUp, true);
        };
        let activePointerId = null;
        const onUp = () => endDrag();
        header.addEventListener('pointerdown', (e) => {
          if (e.button != null && e.button !== 0) return;
          if (e.target && (e.target.tagName === 'BUTTON' || e.target.closest?.('button'))) return;
          dragging = true;
          activePointerId = e.pointerId;
          startX = e.clientX;
          startY = e.clientY;
          startLeft = getPx(shell.style.left) || shell.getBoundingClientRect().left;
          startTop = getPx(shell.style.top) || shell.getBoundingClientRect().top;
          header.style.cursor = 'grabbing';
          try { header.setPointerCapture?.(e.pointerId); } catch (_) {}
          window.addEventListener('pointermove', onMove, true);
          window.addEventListener('pointerup', onUp, true);
          window.addEventListener('pointercancel', onUp, true);
          e.preventDefault();
        });
      }

      shell.dataset.simFloatBound = '1';
    }

    // Fix legacy '?' carets and broken button labels inside the floating body.
    const caretBtns = document.querySelectorAll('#sim-float-panel [data-sim-collapse-header] button.btn-sm');
    caretBtns.forEach(b => {
      if (!b) return;
      const t = (b.textContent || '').trim();
      if (t === '?' || t === '') b.textContent = '\u25BE';
    });
    const strategyRoot = document.getElementById('sim-section-strategy');
    if (strategyRoot) {
      const btns = strategyRoot.querySelectorAll('button');
      btns.forEach(b => {
        const t = (b.textContent || '').replace(/\?/g, '').trim();
        if (t.match(/Importar/i)) b.textContent = 'Importar';
        if (t.match(/Guardar/i)) b.textContent = 'Guardar';
        if (t.match(/Copiar/i)) b.textContent = 'Copiar';
        if (t.match(/Limpiar/i)) b.textContent = 'Limpiar';
      });
    }
  };

  // If elements are present in the static HTML, ensure they're interactive.
  bindExistingFloatUI();

  let openBtn = document.getElementById('sim-float-open');
  if (!openBtn) {
    openBtn = document.createElement('div');
    openBtn.id = 'sim-float-open';
    openBtn.className = 'btn-sm';
    openBtn.textContent = '';
    openBtn.style.position = 'fixed';
    openBtn.style.top = '140px';
    openBtn.style.zIndex = '9999';
    openBtn.style.padding = '6px 10px';
    openBtn.style.display = 'none';
    openBtn.style.cursor = 'grab';
    openBtn.style.userSelect = 'none';
    openBtn.style.touchAction = 'none';
    openBtn.style.display = 'none';
    openBtn.style.alignItems = 'center';
    openBtn.style.justifyContent = 'space-between';
    openBtn.style.gap = '8px';
    openBtn.style.width = 'fit-content';
    openBtn.style.maxWidth = '520px';

    const label = document.createElement('span');
    label.id = 'sim-float-open-label';
    label.textContent = 'ESTRATEGIA/POSICION';
    label.style.fontFamily = 'var(--mono)';
    label.style.fontSize = '11px';
    label.style.whiteSpace = 'nowrap';

    const expand = document.createElement('button');
    expand.id = 'sim-float-open-expand';
    expand.type = 'button';
    expand.className = 'btn-sm';
    // Use explicit codepoints to avoid encoding issues.
    expand.textContent = '\u26F6'; // â›¶
    expand.style.padding = '0';
    expand.style.width = '34px';
    expand.style.height = '26px';
    expand.style.display = 'inline-flex';
    expand.style.alignItems = 'center';
    expand.style.justifyContent = 'center';
    expand.title = 'Expandir';
    expand.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      simShowFloatingPanel();
    });

    openBtn.appendChild(label);
    openBtn.appendChild(expand);
    tab.appendChild(openBtn);

    // Drag support for minimized button (mouse + touch).
    let dragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;
    const getPx = (v) => {
      const n = parseFloat(String(v || '').replace('px', ''));
      return isFinite(n) ? n : 0;
    };
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const maxLeft = Math.max(8, window.innerWidth - openBtn.offsetWidth - 8);
      const maxTop = Math.max(8, window.innerHeight - openBtn.offsetHeight - 8);
      openBtn.style.left = `${clamp(startLeft + dx, 8, maxLeft)}px`;
      openBtn.style.top = `${clamp(startTop + dy, 8, maxTop)}px`;
    };
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      openBtn.style.cursor = 'grab';
      try { openBtn.releasePointerCapture?.(activePointerId); } catch (_) {}
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
    };
    let activePointerId = null;
    const onUp = () => endDrag();
    openBtn.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button !== 0) return;
      if (e.target && (e.target.tagName === 'BUTTON' || e.target.closest?.('button'))) return;
      dragging = true;
      openBtn.dataset.userMoved = '1';
      activePointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = getPx(openBtn.style.left) || openBtn.getBoundingClientRect().left;
      startTop = getPx(openBtn.style.top) || openBtn.getBoundingClientRect().top;
      openBtn.style.cursor = 'grabbing';
      try { openBtn.setPointerCapture?.(e.pointerId); } catch (_) {}
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', onUp, true);
      e.preventDefault();
    });
    openBtn.dataset.simFloatBound = '1';
  }

  let shell = document.getElementById('sim-float-panel');
  if (!shell) {
    shell = document.createElement('div');
    shell.id = 'sim-float-panel';
    shell.style.position = 'fixed';
    shell.style.left = '14px';
    shell.style.top = '180px';
    shell.style.zIndex = '9999';
    // Fit to contents (inner panels are ~320px) while keeping sane bounds.
    shell.style.width = 'fit-content';
    shell.style.minWidth = '360px';
    shell.style.maxWidth = '520px';
    shell.style.overflowX = 'hidden';
    shell.style.overflowY = 'visible';
    shell.style.background = 'rgba(13, 18, 24, .96)';
    shell.style.backdropFilter = 'blur(10px)';
    shell.style.border = '1px solid var(--border2)';
    shell.style.borderRadius = '12px';
    shell.style.boxShadow = '0 20px 60px rgba(0,0,0,.35)';
    shell.style.padding = '10px';
    shell.style.display = 'flex';
    shell.style.flexDirection = 'column';
    shell.style.alignItems = 'stretch';

    const header = document.createElement('div');
    header.dataset.simDragHandle = '1';
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.gap = '10px';
    header.style.marginBottom = '10px';
    header.style.cursor = 'grab';
    header.style.userSelect = 'none';
    header.style.touchAction = 'none';

    const title = document.createElement('div');
    title.textContent = 'Estrategia/Posicion';
    title.style.fontSize = '10px';
    title.style.fontWeight = '600';
    title.style.color = 'var(--muted)';
    title.style.textTransform = 'uppercase';
    title.style.letterSpacing = '.6px';

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.alignItems = 'center';
    actions.style.gap = '8px';

    const pinBtn = document.createElement('button');
    pinBtn.id = 'sim-float-pin';
    pinBtn.type = 'button';
    pinBtn.className = 'btn-sm';
    pinBtn.style.padding = '0';
    pinBtn.style.width = '34px';
    pinBtn.style.height = '26px';
    pinBtn.style.display = 'inline-flex';
    pinBtn.style.alignItems = 'center';
    pinBtn.style.justifyContent = 'center';
    // Use explicit codepoints to avoid encoding issues.
    pinBtn.textContent = '\uD83D\uDCCC'; // ðŸ“Œ
    pinBtn.addEventListener('click', () => {
      SIM.ui.floatPanelPinned = !SIM.ui.floatPanelPinned;
      simSyncFloatingVisibility();
    });

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn-sm';
    // Use explicit codepoints to avoid encoding issues.
    closeBtn.textContent = '\u274C'; // âŒ
    closeBtn.style.padding = '0';
    closeBtn.style.width = '34px';
    closeBtn.style.height = '26px';
    closeBtn.style.display = 'inline-flex';
    closeBtn.style.alignItems = 'center';
    closeBtn.style.justifyContent = 'center';
    closeBtn.addEventListener('click', () => simHideFloatingPanel());

    actions.appendChild(pinBtn);
    actions.appendChild(closeBtn);

    header.appendChild(title);
    header.appendChild(actions);

    const body = document.createElement('div');
    body.id = 'sim-float-body';
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.gap = '10px';
    body.style.alignItems = 'center';
    body.style.width = '100%';

    shell.appendChild(header);
    shell.appendChild(body);
    tab.appendChild(shell);

    // Drag support (mouse + touch) via Pointer Events.
    // Only start dragging when the header (not a button) is the target.
    let dragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;
    const getPx = (v) => {
      const n = parseFloat(String(v || '').replace('px', ''));
      return isFinite(n) ? n : 0;
    };
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const maxLeft = Math.max(8, window.innerWidth - shell.offsetWidth - 8);
      const maxTop = Math.max(8, window.innerHeight - 60);
      shell.style.left = `${clamp(startLeft + dx, 8, maxLeft)}px`;
      shell.style.top = `${clamp(startTop + dy, 8, maxTop)}px`;
    };
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      header.style.cursor = 'grab';
      try { header.releasePointerCapture?.(activePointerId); } catch (_) {}
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
    };
    let activePointerId = null;
    const onUp = () => endDrag();
    header.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button !== 0) return;
      if (e.target && (e.target.tagName === 'BUTTON' || e.target.closest?.('button'))) return;
      dragging = true;
      activePointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = getPx(shell.style.left) || shell.getBoundingClientRect().left;
      startTop = getPx(shell.style.top) || shell.getBoundingClientRect().top;
      header.style.cursor = 'grabbing';
      try { header.setPointerCapture?.(e.pointerId); } catch (_) {}
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', onUp, true);
      e.preventDefault();
    });
    shell.dataset.simFloatBound = '1';
  }

  // Bind again (covers the newly created elements).
  bindExistingFloatUI();

  simSyncFloatingVisibility();
  return { shell, body: shell.querySelector('#sim-float-body'), openBtn };
}

function simMoveLeftPanelsToFloating(floatBody, strategyPanel, positionCardsPanel, metricsPanel) {
  if (!floatBody) return;
  [strategyPanel, positionCardsPanel, metricsPanel].forEach(p => {
    if (!p) return;
    p.style.margin = '0';
    floatBody.appendChild(p);
  });
}

function simHideFloatingPanel() {
  const shell = document.getElementById('sim-float-panel');
  const openBtn = document.getElementById('sim-float-open');
  if (shell) shell.style.display = 'none';
  if (openBtn) {
    openBtn.style.display = 'inline-flex';
    // Default dock: centered above Parametros.
    simAutoDockMinimizedButton(true);
  }
  if (SIM.ui) SIM.ui.floatPanelVisible = false;
}

function simShowFloatingPanel() {
  const shell = document.getElementById('sim-float-panel');
  const openBtn = document.getElementById('sim-float-open');
  if (shell) shell.style.display = 'block';
  if (openBtn) openBtn.style.display = 'none';
  if (SIM.ui) SIM.ui.floatPanelVisible = true;
  simFitFloatingPanelToViewport();
  simSyncFloatingVisibility();
}

function simSyncFloatingVisibility() {
  const tab = document.getElementById('tab-simulador');
  const shell = document.getElementById('sim-float-panel');
  const openBtn = document.getElementById('sim-float-open');
  if (!tab || !shell || !openBtn) return;
  const tabVisible = tab.style.display !== 'none';
  if (!tabVisible) {
    shell.style.display = 'none';
    openBtn.style.display = 'none';
    return;
  }
  if (SIM.ui?.floatPanelVisible === false) {
    shell.style.display = 'none';
    openBtn.style.display = 'inline-flex';
    const label = document.getElementById('sim-float-open-label');
    if (label) label.textContent = 'ESTRATEGIA/POSICION';
    simAutoDockMinimizedButton();
  } else {
    shell.style.display = 'block';
    openBtn.style.display = 'none';
    simFitFloatingPanelToViewport();
  }
  const pinBtn = document.getElementById('sim-float-pin');
  if (pinBtn) {
    const pinned = !!SIM.ui?.floatPanelPinned;
    // Use explicit codepoints to avoid encoding issues.
    pinBtn.textContent = '\uD83D\uDCCC'; // ðŸ“Œ
    pinBtn.style.borderColor = pinned ? 'var(--green)' : '';
    pinBtn.style.color = pinned ? 'var(--green)' : '';
  }
}

function simAutoDockMinimizedButton(force = false) {
  const openBtn = document.getElementById('sim-float-open');
  if (!openBtn || openBtn.style.display === 'none') return;
  if (!force && openBtn.dataset.userMoved === '1') return;

  // Dock centered above Parametros (fallback: top center).
  requestAnimationFrame(() => {
    const w = openBtn.offsetWidth || 120;
    const h = openBtn.offsetHeight || 28;
    const margin = 14;
    const paramsPanel = document.getElementById('sim-sl-spot')?.closest('.panel') || null;
    if (paramsPanel) {
      const r = paramsPanel.getBoundingClientRect();
      const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + (r.width / 2) - (w / 2)));
      // Inside Parametros, near the top, centered.
      const top = Math.max(8, Math.min(window.innerHeight - h - 8, r.top + 10));
      openBtn.style.left = `${left}px`;
      openBtn.style.top = `${top}px`;
      return;
    }
    const left = Math.max(8, (window.innerWidth - w) / 2);
    const top = Math.min(Math.max(8, parseFloat(openBtn.style.top || '140') || 140), Math.max(8, window.innerHeight - h - 8));
    openBtn.style.left = `${left}px`;
    openBtn.style.top = `${top}px`;
  });
}

function simFitFloatingPanelToViewport() {
  const shell = document.getElementById('sim-float-panel');
  if (!shell || shell.style.display === 'none') return;

  // Always prevent horizontal scroll in the floating overlay.
  shell.style.overflowX = 'hidden';

  // If it fits, avoid vertical scrolling; otherwise allow it.
  const margin = 16;
  const availableH = Math.max(200, window.innerHeight - margin * 2);
  // Reset maxHeight to measure natural height.
  shell.style.maxHeight = '';
  shell.style.overflowY = 'visible';
  const naturalH = shell.scrollHeight || shell.offsetHeight || 0;
  if (naturalH > availableH) {
    shell.style.maxHeight = `calc(100vh - ${margin * 2}px)`;
    shell.style.overflowY = 'auto';
  }

  // Clamp position so it remains reachable.
  const rect = shell.getBoundingClientRect();
  const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
  const maxTop = Math.max(8, window.innerHeight - Math.min(rect.height, availableH) - 8);
  const curLeft = parseFloat(shell.style.left || rect.left) || rect.left;
  const curTop = parseFloat(shell.style.top || rect.top) || rect.top;
  shell.style.left = `${Math.min(maxLeft, Math.max(8, curLeft))}px`;
  shell.style.top = `${Math.min(maxTop, Math.max(8, curTop))}px`;
}

function simPatchParamsHeader() {
  const slider = document.getElementById('sim-sl-spot');
  const panel = slider?.closest('.panel');
  if (!panel) return;

  // Prefer the existing collapsible header (static HTML). Only create our own if missing.
  let header = panel.querySelector('[data-sim-collapse-header]') || panel.querySelector('[data-sim-params-header]');
  if (!header) {
    header = document.createElement('div');
    header.dataset.simParamsHeader = '1';
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.flexWrap = 'wrap';
    header.style.marginBottom = '14px';
    panel.prepend(header);
  }

  // Find/create the actions container on the right side of the header.
  let actions = null;
  if (header.querySelector) {
    // In the static header structure, the right-side is the last child div.
    const divs = header.querySelectorAll(':scope > div');
    actions = divs.length ? divs[divs.length - 1] : null;
  }
  if (!actions) {
    actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.alignItems = 'center';
    actions.style.gap = '8px';
    header.appendChild(actions);
  }

  // De-dup & move existing buttons into the header actions.
  const dedup = (id) => {
    const all = Array.from(panel.querySelectorAll('#' + id));
    const keep = all.shift() || null;
    all.forEach(el => el.remove());
    return keep;
  };

  let resetBtn = dedup('sim-reset-btn');
  if (!resetBtn) {
    resetBtn = document.createElement('button');
    resetBtn.id = 'sim-reset-btn';
    resetBtn.className = 'btn-sm';
    resetBtn.textContent = 'Reset';
    resetBtn.style.padding = '5px 12px';
  }
  if (resetBtn.dataset.simBound !== '1') {
    resetBtn.addEventListener('click', simResetParams);
    resetBtn.dataset.simBound = '1';
  }

  let recalBtn = dedup('sim-recal-iv-btn');
  if (!recalBtn) {
    recalBtn = document.createElement('button');
    recalBtn.id = 'sim-recal-iv-btn';
    recalBtn.className = 'btn-sm';
    recalBtn.textContent = 'Recalibrar VI';
    recalBtn.style.padding = '5px 12px';
  }
  if (recalBtn.dataset.simBound !== '1') {
    recalBtn.addEventListener('click', simRecalibrateIvs);
    recalBtn.dataset.simBound = '1';
  }

  // Remove any extra legacy buttons that may have been injected without ids.
  Array.from(panel.querySelectorAll('button.btn-sm')).forEach((b) => {
    const t = (b.textContent || '').trim();
    if (t === 'Recalibrar VI' && b.id !== 'sim-recal-iv-btn') b.remove();
    if (t === 'Reset' && b.id !== 'sim-reset-btn') b.remove();
  });

  // Ensure ordering: Recalibrar VI then Reset.
  if (recalBtn.parentElement !== actions) actions.appendChild(recalBtn);
  if (resetBtn.parentElement !== actions) actions.appendChild(resetBtn);
  if (actions.firstChild !== recalBtn) actions.insertBefore(recalBtn, actions.firstChild);

  // Fix the collapse caret button in the static header (it was rendered as '?').
  const caretBtn = header.querySelector('button.btn-sm:not(#sim-recal-iv-btn):not(#sim-reset-btn)');
  if (caretBtn) {
    const t = (caretBtn.textContent || '').trim();
    if (t === '?' || t === '') caretBtn.textContent = '\u25BE';
    if (caretBtn.dataset.simBound !== '1') {
      caretBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        simToggleSection('sim-section-params', caretBtn);
      });
      caretBtn.dataset.simBound = '1';
    }
  }
}

function simEnsureParamsSummary() {
  const slider = document.getElementById('sim-sl-spot');
  const panel = slider?.closest('.panel');
  if (!panel) return null;
  let summary = document.getElementById('sim-params-summary');
  if (!summary) {
    summary = document.createElement('div');
    summary.id = 'sim-params-summary';
    summary.style.marginTop = '12px';
    summary.style.paddingTop = '10px';
    summary.style.borderTop = '1px solid var(--border2)';
    summary.style.display = 'grid';
    summary.style.gridTemplateColumns = 'repeat(5, minmax(0, 1fr))';
    summary.style.gap = '10px';
    panel.appendChild(summary);
  }
  return summary;
}

function simRenderParamsSummary({ simSpot, dte, T, r, q }) {
  const summary = simEnsureParamsSummary();
  if (!summary) return;
  const baseIVs = [];
  const seen = new Set();
  SIM.legs.forEach(leg => {
    if (!leg || leg.type === 'stock') return;
    const key = simGetLegIvKey(leg);
    if (seen.has(key)) return;
    seen.add(key);
    const iv = simGetLegIvPercent(leg, r, q) / 100;
    if (iv != null && isFinite(iv) && iv > 0) baseIVs.push(iv);
  });
  const avgBaseIV = baseIVs.length ? baseIVs.reduce((a, b) => a + b, 0) / baseIVs.length : null;
  const items = [
    ['Spot', `$${fmtN(simSpot, 0)}`],
    ['T', `${dte}d / ${T.toFixed(3)}a`],
    ['TLR', `${(r * 100).toFixed(1)}%`],
    ['Yield', `${(q * 100).toFixed(1)}%`],
    ['IV Promedio', avgBaseIV != null ? `${fmtN(avgBaseIV * 100, 1)}%` : '--'],
  ];
  summary.innerHTML = items.map(([label, value]) => `
    <div style="min-width:0">
      <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">${label}</div>
      <div style="font-family:var(--mono);font-size:11px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${value}</div>
    </div>
  `).join('');
}

function simGetLegIvKey(leg) {
  return `${leg.type}:${leg.strike}`;
}

function simGetIvSliderId(key) {
  return `sim-sl-iv-${String(key).replace(/[^a-z0-9_-]+/gi, '-')}`;
}

function simGetLegIvPercent(leg, r, q) {
  const slider = document.getElementById(simGetIvSliderId(simGetLegIvKey(leg)));
  const sliderVal = parseARSNum(slider?.value || '');
  if (isFinite(sliderVal) && sliderVal > 0) return sliderVal;
  return Math.max(1, Math.min(120, simGetLegIV(leg, r, q) * 100));
}

function simGetLegIvDecimal(leg, r, q) {
  return Math.max(0.01, simGetLegIvPercent(leg, r, q) / 100);
}

function simGetSpotSliderBounds(targetValue) {
  const base = Math.max(1, parseFloat(ST.spot) || 1);
  let min = Math.max(1, Math.floor(base * 0.5));
  let max = Math.max(min + 1, Math.ceil(base * 1.5));
  const target = parseFloat(targetValue);
  if (isFinite(target) && target > 0) {
    if (target < min) min = Math.max(1, Math.floor(target * 0.95));
    if (target > max) max = Math.ceil(target * 1.05);
  }
  return { min, max, step: 1 };
}

function simSyncSpotSliderBounds(targetValue) {
  const slider = document.getElementById('sim-sl-spot');
  if (!slider) return;
  const { min, max, step } = simGetSpotSliderBounds(targetValue);
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
}

function simFormatInputValue(num, decimals = 0) {
  if (!isFinite(num)) return '';
  if (decimals <= 0) return String(Math.round(num));
  return num.toFixed(decimals).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

function simFormatPlainNumber(num, decimals = 0) {
  if (!isFinite(num)) return '';
  if (decimals <= 0) return String(Math.round(num));
  return num.toFixed(decimals).replace('.', ',');
}

function simUpdateParamInput(kind, rawValue) {
  const num = parseFloat(String(rawValue).replace(',', '.'));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  if (!isFinite(num)) return;
  if (kind === 'spot') {
    const slider = document.getElementById('sim-sl-spot');
    if (!slider) return;
    simSyncSpotSliderBounds(num);
    slider.value = String(clamp(num, parseFloat(slider.min || '1'), parseFloat(slider.max || '999999')));
    simUpdateSliders();
    return;
  }
  const configs = {
    dte: { slider: 'sim-sl-dte', min: 1, max: 70, step: 1 },
    rfr: { slider: 'sim-sl-rfr', min: 0, max: 100, step: 1 },
  };
  const cfg = configs[kind];
  if (!cfg) return;
  const slider = document.getElementById(cfg.slider);
  if (!slider) return;
  slider.value = String(clamp(num, cfg.min, cfg.max));
  simUpdateSliders();
}

function simRenderIvSliders(r, q) {
  const wrap = document.getElementById('sim-iv-sliders');
  if (!wrap) return;
  const groups = [];
  const seen = new Set();
  SIM.legs.forEach(leg => {
    if (leg.type === 'stock') return;
    const key = simGetLegIvKey(leg);
    if (seen.has(key)) return;
    seen.add(key);
    groups.push({ leg, key });
  });
  if (!groups.length) {
    wrap.innerHTML = '';
    return;
  }
  wrap.innerHTML = groups.map(({ leg, key }) => {
    const typeText = leg.type === 'call'
      ? '<span style="color:var(--green)">CALL</span>'
      : '<span style="color:var(--red)">PUT</span>';
    const strikeText = `<span style="color:var(--amber)">${fmtStrike(leg.strike)}</span>`;
    const ivPct = simGetLegIvPercent(leg, r, q);
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border:1px solid var(--border2);border-radius:8px;background:rgba(255,255,255,.015)">
      <span style="font-size:11px;letter-spacing:.3px;white-space:nowrap">${typeText} ${strikeText}</span>
      <div style="display:flex;align-items:center;justify-content:flex-end;gap:6px;white-space:nowrap">
        <span style="font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)">IV %</span>
        <input id="${simGetIvSliderId(key)}" type="text" inputmode="decimal" value="${simFormatPlainNumber(ivPct, 2)}" data-non-negative="1"
          style="width:70px;font-family:var(--mono);font-size:11px;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:3px 6px;border-radius:4px;text-align:right"
          oninput="simSanitizeNumericInput(this)" onchange="this.value=Math.max(0, parseARSNum(this.value)||0).toFixed(2).replace('.', ',');renderSimulador()">
        <span id="${simGetIvSliderId(key)}-val" style="font-family:var(--mono);font-size:11px;font-weight:600;color:var(--amber)">%</span>
      </div>
    </div>`;
  }).join('');
}

function simParseExpiryDate(exp) {
  if (!exp) return null;
  exp = String(exp).trim();
  // Primary format used by the app: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(exp)) {
    const d = new Date(exp + 'T12:00:00');
    return isFinite(d.getTime()) ? d : null;
  }
  // Fallback: "17 abr 2026" (avoid relying on Date.parse locale).
  const m = String(exp).trim().toLowerCase().match(/^(\d{1,2})\s+([a-z]{3})\s+(\d{4})$/);
  if (!m) return null;
  const dd = parseInt(m[1], 10);
  const mmMap = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12 };
  const mm = mmMap[m[2]] || 0;
  const yy = parseInt(m[3], 10);
  if (!dd || !mm || !yy) return null;
  const iso = `${yy.toString().padStart(4, '0')}-${mm.toString().padStart(2, '0')}-${dd.toString().padStart(2, '0')}`;
  const d = new Date(iso + 'T12:00:00');
  return isFinite(d.getTime()) ? d : null;
}

function simPickNearestFutureExpiry(list) {
  const now = Date.now();
  const uniq = Array.from(new Set((list || []).filter(Boolean).map(s => String(s).trim()).filter(Boolean)));
  let best = '';
  let bestDays = Infinity;
  uniq.forEach(exp => {
    const d = simParseExpiryDate(exp);
    if (!d) return;
    const days = Math.round((d.getTime() - now) / 86400000);
    if (days >= 1 && days < bestDays) {
      bestDays = days;
      best = exp;
    }
  });
  return best;
}

function simGetActiveExpiry() {
  const byLeg = (SIM?.legs || [])
    .filter(l => l && l.type !== 'stock' && l.expiry)
    .map(l => String(l.expiry).trim());
  const byUI = [
    ST.selExpiry,
    document.getElementById('expiry-sel')?.value || '',
  ].filter(Boolean).map(s => String(s).trim()).filter(Boolean);
  const chainKeys = Object.keys(ST.chain || {});
  const expList = (ST.expirations || []);

  // Prefer expiries that actually exist in the chain.
  const preferred = simPickNearestFutureExpiry([...byLeg, ...byUI].filter(e => ST.chain?.[e]));
  if (preferred) return preferred;
  const chainBest = simPickNearestFutureExpiry(chainKeys);
  if (chainBest) return chainBest;

  // Fallbacks (even if in the past).
  return byLeg.find(e => ST.chain?.[e]) ||
    byUI.find(e => ST.chain?.[e]) ||
    chainKeys[0] ||
    expList[0] ||
    byUI[0] ||
    ST.selExpiry ||
    '';
}

function simGetCurrentDTE() {
  // Prefer the UI-selected expiry if it parses and is in the future; otherwise use the active chain expiry.
  const uiExp = String(document.getElementById('expiry-sel')?.value || ST.selExpiry || '').trim();
  let d = simParseExpiryDate(uiExp);
  let days = d ? Math.round((d.getTime() - Date.now()) / 86400000) : NaN;
  if (!isFinite(days) || days < 1) {
    const expiry = simGetActiveExpiry();
    d = simParseExpiryDate(expiry);
    days = d ? Math.round((d.getTime() - Date.now()) / 86400000) : NaN;
  }
  if (!isFinite(days) || days < 1) return 30;
  return Math.max(1, Math.min(70, days));
}

function simSliderHTML(id, label, min, max, val, step, display) {
  return `<div style="display:flex;flex-direction:column;gap:6px">
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <span style="font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)">${label}</span>
      <span id="${id}-val" style="font-family:var(--mono);font-size:11px;font-weight:600;color:var(--amber)">${display}</span>
    </div>
    <input id="${id}" type="range" min="${min}" max="${max}" value="${val}" step="${step}"
      style="width:100%;accent-color:var(--amber);cursor:pointer;height:4px"
      oninput="simUpdateSliders()">
  </div>`;
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   IMPORT FROM CONTROL
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function simRefreshImportSel() {
  const sel = document.getElementById('sim-import-sel');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">-- Importar de Control --</option>';
  (typeof ctrlStrategies !== 'undefined' ? ctrlStrategies : []).forEach((s, i) => {
    const o = document.createElement('option');
    o.value = i;
    o.textContent = s.name || `Estrategia ${i + 1}`;
    if (String(i) === cur) o.selected = true;
    sel.appendChild(o);
  });
}

function simBuildControlRowsFromLegs() {
  return SIM.legs
    .filter(leg => leg && leg.type !== 'stock')
    .map(leg => ({
      lotes: leg.qty || 0,
      type: leg.type || 'call',
      strike: leg.strike || ST.spot,
      precio: parseFloat(leg.entryPrice) || 0,
      precioManual: '',
    }));
}

function simCopyStrategy() {
  const rows = simBuildControlRowsFromLegs();
  if (!rows.length) {
    showToast('No hay patas para copiar');
    return false;
  }
  const tsv = rows.map(r => {
    const lotes = String(r.lotes).replace('.', ',');
    const strike = fmtStrike(r.strike).replace(/\./g, '');
    const precio = (parseFloat(r.precio) || 0).toFixed(3).replace('.', ',');
    return `${lotes}\t${strike}\t${precio}`;
  }).join('\n');
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = tsv;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  };
  navigator.clipboard.writeText(tsv).then(
    () => showToast('Estrategia copiada al portapapeles'),
    () => { fallback(); showToast('Estrategia copiada al portapapeles'); }
  );
  return true;
}

function simSaveStrategy() {
  const rows = simBuildControlRowsFromLegs();
  if (!rows.length) {
    showToast('No hay patas para guardar');
    return false;
  }
  if (typeof ctrlStrategies === 'undefined' || typeof ctrlSave !== 'function') {
    showToast('Control de estrategias no esta disponible');
    return false;
  }
  const sel = document.getElementById('sim-import-sel');
  const source = sel?.value || '';
  let name = 'Estrategia';
  let selectValue = '';

  if (source.startsWith('control:')) {
    const idx = parseInt(source.replace('control:', ''), 10);
    if (isFinite(idx) && ctrlStrategies[idx]) {
      ctrlStrategies[idx].rows = rows;
      name = ctrlStrategies[idx].name || `Estrategia ${idx + 1}`;
      selectValue = `control:${idx}`;
    }
  }

  if (!selectValue) {
    const nextIndex = ctrlStrategies.length;
    name = `Estrategia ${nextIndex + 1}`;
    ctrlStrategies.push({ name, rows });
    selectValue = `control:${nextIndex}`;
  }

  ctrlSave();
  if (typeof renderControl === 'function') renderControl();
  simRefreshImportSel();
  if (sel) sel.value = selectValue;
  showToast(`"${name}" guardada en Control`);
  return true;
}

function simImportFromTextRaw(raw) {
  if (!String(raw || '').trim()) return false;
  const allStrikes = typeof getAvailableStrikes === 'function' ? getAvailableStrikes() : [];
  const closest = strikeRaw => allStrikes.length
    ? allStrikes.reduce((p, c) => Math.abs(c - strikeRaw) < Math.abs(p - strikeRaw) ? c : p, allStrikes[0])
    : strikeRaw;

  const parsed = String(raw).trim().split(/\r?\n/).filter(l => l.trim()).map(line => {
    const cols = line.split('\t').map(c => c.trim());
    const lotes = parseARSNum(cols[0]);
    const strikeRaw = parseARSNum(cols[1]);
    const precio = parseARSNum(cols[2]);
    if (isNaN(lotes) || isNaN(strikeRaw)) return null;
    return simBuildImportedLeg({
      type: 'call',
      qty: lotes,
      strike: closest(strikeRaw),
      entryPrice: isNaN(precio) ? 0 : precio,
      expiry: ST.selExpiry || '',
    });
  }).filter(Boolean);

  if (!parsed.length) {
    showToast('No se reconocieron datos en el formato esperado');
    return false;
  }

  SIM.legs = parsed;
  const ta = document.getElementById('sim-paste');
  if (ta) ta.value = '';
  simRenderLegs();
  renderSimulador();
  simScheduleTempSave?.();
  showToast(`${parsed.length} pata${parsed.length > 1 ? 's' : ''} cargada${parsed.length > 1 ? 's' : ''} desde texto`);
  return true;
}

function simHandlePaste(event) {
  event.preventDefault();
  const raw = event.clipboardData?.getData('text') || '';
  simImportFromTextRaw(raw);
}

function simImportTextInput() {
  const ta = document.getElementById('sim-paste');
  if (!ta) return false;
  return simImportFromTextRaw(ta.value);
}


/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   LEG MANAGEMENT
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function simRefreshImportSel() {
  const sel = document.getElementById('sim-import-sel');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Importar estrategia</option>';
  const strategyLegs=typeof getStrategyLegsSnapshot==='function'?getStrategyLegsSnapshot():[];

  if (strategyLegs.length) {
    const currentOpt = document.createElement('option');
    currentOpt.value = 'strategy:current';
    currentOpt.textContent = 'Estrategias - Actual';
    if (currentOpt.value === cur) currentOpt.selected = true;
    sel.appendChild(currentOpt);
  }

  (typeof ctrlStrategies !== 'undefined' ? ctrlStrategies : []).forEach((s, i) => {
    const o = document.createElement('option');
    o.value = `control:${i}`;
    o.textContent = s.name || `Estrategia ${i + 1}`;
    if (o.value === cur) o.selected = true;
    sel.appendChild(o);
  });
}

function simImportFromControl() {
  simRefreshImportSel();
  const sel = document.getElementById('sim-import-sel');
  const source = sel ? sel.value : '';
  if (!source) {
    showToast('Selecciona una estrategia para importar');
    return;
  }

  if (source === 'strategy:current') {
    const strategyLegs=typeof getStrategyLegsSnapshot==='function'?getStrategyLegsSnapshot():[];
    if (!strategyLegs.length) {
      showToast('No hay una estrategia activa en el constructor');
      return;
    }
    SIM.legs = strategyLegs.map(leg => simBuildImportedLeg({
      type: leg.type || 'call',
      qty: leg.qty || 0,
      strike: leg.strike,
      entryPrice: parseFloat(leg.premium) || 0,
      expiry: ST.selExpiry || '',
    }));
    simRenderLegs();
    renderSimulador();
    showToast('Estrategia actual importada al Simulador');
    return;
  }

  const idx = parseInt(source.replace('control:', ''), 10);
  const strats = typeof ctrlStrategies !== 'undefined' ? ctrlStrategies : [];
  if (isNaN(idx) || !strats[idx]) {
    showToast('Selecciona una estrategia para importar');
    return;
  }

  const strat = strats[idx];
  SIM.legs = strat.rows.map(row => simBuildImportedLeg({
    type: row.type || 'call',
    qty: row.lotes || 0,
    strike: row.strike || ST.spot,
    entryPrice: parseFloat(row.precioManual) || row.precio || 0,
    expiry: ST.selExpiry || '',
  }));
  simRenderLegs();
  renderSimulador();
  showToast(`"${strat.name}" importada al Simulador`);
}

function simLoadControlStrategy(strategy, options = {}) {
  if (!strategy || !Array.isArray(strategy.rows)) {
    showToast('No hay una estrategia valida para cargar en el Simulador');
    return false;
  }

  SIM.legs = strategy.rows.map(row => simBuildImportedLeg({
    type: row.type || 'call',
    qty: row.lotes || 0,
    strike: row.strike || ST.spot,
    entryPrice: parseFloat(row.precioManual) || row.precio || 0,
    expiry: ST.selExpiry || '',
  }));

  simRefreshImportSel();
  const sel = document.getElementById('sim-import-sel');
  if (sel && options.selectValue) sel.value = options.selectValue;

  simRenderLegs();
  renderSimulador();
  if (options.openTab !== false && typeof showTab === 'function') showTab('simulador');
  showToast(`"${options.name || strategy.name || 'Estrategia'}" cargada en el Simulador`);
  simScheduleTempSave?.();
  return true;
}

function simAddLeg(preset) {
  const strikes = getAvailableStrikes();
  const atm = strikes.length
    ? strikes.reduce((p, s) => Math.abs(s - ST.spot) < Math.abs(p - ST.spot) ? s : p, strikes[0])
    : Math.round(ST.spot / 500) * 500;
  const leg = preset || { type: 'call', qty: 1, strike: atm, entryPrice: 0, expiry: ST.selExpiry || '', iv: 0 };
  if (leg.type !== 'stock') leg.iv = simInferLegMarketIV(leg, leg.expiry || ST.selExpiry || '', simGetParams().rfr, ST.q);
  SIM.legs.push(leg);
  simRenderLegs();
  renderSimulador();
}

function simRemoveLeg(i) {
  SIM.legs.splice(i, 1);
  simRenderLegs();
  renderSimulador();
}

function simUpdateLeg(i, field, rawVal) {
  const leg = SIM.legs[i];
  if (!leg) return;
  const numFields = ['qty', 'strike', 'entryPrice', 'iv'];
  leg[field] = numFields.includes(field) ? (parseFloat(rawVal) || 0) : rawVal;

  // Auto-fill entry price from chain when strike or type changes
  if (['strike', 'type'].includes(field) && leg.type !== 'stock') {
    const exp = ST.selExpiry || simGetActiveExpiry();
    if (exp && ST.chain[exp]) {
      // Use the same "closest strike" logic as pricing to avoid float mismatch.
      const px = simGetLegMarketPrice(leg, exp);
      if (px > 0) leg.entryPrice = px;
    }
    leg.expiry = exp || leg.expiry || '';
    leg.iv = simInferLegMarketIV(leg, leg.expiry, simGetParams().rfr, ST.q);
  } else if (field === 'type' && leg.type === 'stock') {
    leg.iv = 0;
  }
  simRenderLegs();
  renderSimulador();
}

function simSanitizeNumericInput(input) {
  if (!input) return;
  let value = input.value.replace(',', '.').replace(/[^0-9.\-]/g, '');
  const firstDot = value.indexOf('.');
  if (firstDot !== -1) {
    value = value.slice(0, firstDot + 1) + value.slice(firstDot + 1).replace(/\./g, '');
  }
  if (input.dataset.nonNegative === '1') {
    value = value.replace(/-/g, '');
  } else {
    const firstMinus = value.indexOf('-');
    if (firstMinus > 0) value = value.replace(/-/g, '');
    else if (firstMinus === 0) value = '-' + value.slice(1).replace(/-/g, '');
  }
  input.value = value;
}

function simRenderLegs() {
  const cardsWrap = document.getElementById('sim-legs-cards');
  const emptyCards = document.getElementById('sim-legs-empty-cards');
  const cardsTotal = document.getElementById('sim-pnl-total-cards');
  if (!cardsWrap) return;

  if (!SIM.legs.length) {
    cardsWrap.innerHTML = '';
    if (emptyCards) emptyCards.style.display = '';
    if (cardsTotal) cardsTotal.style.display = 'none';
    return;
  }

  if (emptyCards) emptyCards.style.display = 'none';

  const strikes = getAvailableStrikes();
  const exp = ST.selExpiry;
  let totalPnl = 0;
  let pricedLegCount = 0;

  const rows = SIM.legs.map((leg, i) => {
    let mktPrice = 0;
    if (leg.type === 'stock') {
      mktPrice = ST.spot;
    } else if (exp && ST.chain[exp]) {
      const row = ST.chain[exp].find(r => r.strike === leg.strike);
      if (row) mktPrice = leg.type === 'call' ? (row.callMid || 0) : (row.putMid || 0);
    }
    const hasCost = leg.entryPrice > 0;
    const mult = leg.type === 'stock' ? 1 : 100;
    const pnlRaw = hasCost ? leg.qty * (mktPrice - leg.entryPrice) * mult : null;
    if (pnlRaw != null) {
      totalPnl += pnlRaw;
      pricedLegCount += 1;
    }
    return {
      leg, i, mktPrice, pnlRaw,
      typeColor: leg.type === 'call' ? 'var(--green)' : leg.type === 'put' ? 'var(--red)' : 'var(--blue)',
      qtyColor: leg.qty >= 0 ? 'var(--green)' : 'var(--red)',
      pnlColor: pnlRaw == null ? 'var(--dim)' : pnlRaw >= 0 ? 'var(--green)' : 'var(--red)',
      strikeOpts: strikes.map(s => `<option value="${s}"${s === leg.strike ? ' selected' : ''}>${fmtN(Math.round(s), 0)}</option>`).join(''),
    };
  });

  cardsWrap.innerHTML = rows.map(({ leg, i, mktPrice, pnlRaw, typeColor, qtyColor, pnlColor, strikeOpts }) => `
    <div style="border:1px solid var(--border2);border-radius:8px;padding:5px;background:rgba(255,255,255,.015)">
      <div style="display:flex;flex-direction:column;gap:8px">
        <div style="display:grid;grid-template-columns:54px 64px 74px 24px;column-gap:6px;justify-content:space-between;align-items:end">
            <div>
              <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Tipo</div>
              <select onchange="simUpdateLeg(${i},'type',this.value)"
                style="width:100%;background:var(--bg);border:1px solid var(--border);color:${typeColor};font-size:10px;padding:1px 3px;border-radius:4px;font-weight:600;text-align:center;text-align-last:center">
                <option value="call"${leg.type==='call'?' selected':''}>Call</option>
                <option value="put"${leg.type==='put'?' selected':''}>Put</option>
                <option value="stock"${leg.type==='stock'?' selected':''}>Acc.</option>
              </select>
            </div>
            <div>
              <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Cant</div>
              <input type="text" inputmode="numeric" value="${simFormatPlainNumber(leg.qty, 0)}"
                style="width:100%;font-family:var(--mono);color:${qtyColor};font-size:11px;font-weight:600;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:1px 4px;text-align:right"
                oninput="simSanitizeNumericInput(this);this.style.color=(parseARSNum(this.value)||0)>=0?'var(--green)':'var(--red)'"
                onchange="SIM.legs[${i}].qty=parseARSNum(this.value)||0;this.style.color=(SIM.legs[${i}].qty)>=0?'var(--green)':'var(--red)';renderSimulador()" />
            </div>
            <div>
              <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Strike</div>
              <select onchange="simUpdateLeg(${i},'strike',parseFloat(this.value))"
                style="width:100%;font-family:var(--mono);font-size:11px;background:var(--bg);border:1px solid var(--border);color:var(--amber);border-radius:4px;padding:1px 3px;text-align:center;text-align-last:center">
                ${strikeOpts}
              </select>
            </div>
            <div style="display:flex;align-items:flex-end;justify-content:flex-end">
              <button onclick="simRemoveLeg(${i})"
                style="width:24px;height:20px;padding:0;font-size:10px;background:var(--red-bg);border:1px solid var(--red);color:var(--red);border-radius:4px;cursor:pointer;line-height:1">x</button>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:68px 68px 84px;gap:4px;justify-content:space-between">
            <div>
              <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Entrada</div>
              <input type="text" inputmode="decimal" value="${simFormatPlainNumber(leg.entryPrice, 2)}" data-non-negative="1"
                style="width:100%;font-family:var(--mono);font-size:11px;color:var(--text);background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:1px 3px;text-align:right"
                oninput="simSanitizeNumericInput(this)"
                onchange="SIM.legs[${i}].entryPrice=Math.max(0, parseARSNum(this.value)||0);this.value=simFormatPlainNumber(SIM.legs[${i}].entryPrice, 2);renderSimulador()" />
            </div>
            <div style="display:flex;flex-direction:column;justify-content:flex-end">
              <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Last</div>
              <div style="font-family:var(--mono);font-size:11px;color:var(--amber);background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:1px 3px;text-align:right">${mktPrice > 0 ? fmtN(mktPrice, 2) : '--'}</div>
            </div>
            <div style="display:flex;flex-direction:column;justify-content:flex-end">
              <div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">P&L</div>
              <div style="font-family:var(--mono);font-size:11px;color:${pnlColor};background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:1px 3px;text-align:right">${pnlRaw != null ? (pnlRaw >= 0 ? '+' : '') + fmtN(pnlRaw, 0) : '--'}</div>
            </div>
          </div>
      </div>
    </div>
  `).join('');

  [
    { wrap: cardsTotal, val: document.getElementById('sim-pnl-total-val-cards') },
  ].forEach(({ wrap, val }) => {
    if (!wrap || !val) return;
    if (pricedLegCount > 0) {
      wrap.style.display = 'flex';
      val.textContent = (totalPnl >= 0 ? '+' : '') + fmtN(totalPnl, 0);
      val.style.color = totalPnl >= 0 ? 'var(--green)' : 'var(--red)';
    } else {
      wrap.style.display = 'none';
    }
  });
}
/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   SLIDERS
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function simUpdateSliders() {
  simSyncSpotSliderBounds(parseFloat(document.getElementById('sim-sl-spot')?.value || ST.spot || 1));
  const simSpot = parseFloat(document.getElementById('sim-sl-spot')?.value || ST.spot || 0);
  const dte     = Math.min(70, parseFloat(document.getElementById('sim-sl-dte')?.value || simGetCurrentDTE()));
  const rfr     = parseFloat(document.getElementById('sim-sl-rfr')?.value   || 20);

  const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  const setValue = (id, txt) => { const el = document.getElementById(id); if (el) el.value = txt; };

  setText('sim-sl-spot-val',  `$${fmtN(simSpot, 0)}`);
  setText('sim-sl-dte-val',   `${dte}d`);
  setText('sim-sl-rfr-val',   `${rfr.toFixed(0)}%`);
  setValue('sim-in-spot',  simFormatInputValue(simSpot, 0));
  setValue('sim-in-dte',   `${dte.toFixed(0)}`);
  setValue('sim-in-rfr',   `${rfr.toFixed(0)}`);
  SIM.legs.forEach(leg => {
    if (leg.type === 'stock') return;
    setText(`${simGetIvSliderId(simGetLegIvKey(leg))}-val`, `%`);
  });

  renderSimulador();
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   CORE CALCULATION HELPERS
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function simResetParams() {
  const currentDTE = Math.min(70, simGetCurrentDTE());
  simSyncSpotSliderBounds(ST.spot || 1);
  const defaults = {
    'sim-sl-spot': Math.max(1, parseFloat(ST.spot) || 1),
    'sim-sl-dte': currentDTE,
    'sim-sl-rfr': 20,
    'sim-table-range': 20,
  };
  Object.entries(defaults).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  });
  SIM.legs.forEach((leg, index) => {
    if (leg.type === 'stock') return;
    const slider = document.getElementById(simGetIvSliderId(simGetLegIvKey(leg)));
    if (slider) slider.value = Math.max(1, Math.min(120, simGetLegIV(leg, 0.20, ST.q || 0) * 100)).toFixed(2);
  });
  simUpdateSliders();
  simScheduleTempSave?.();
}

function simGetParams() {
  const simSpot = parseFloat(document.getElementById('sim-sl-spot')?.value  || ST.spot || 0);
  const dte     = Math.min(70, parseFloat(document.getElementById('sim-sl-dte')?.value || simGetCurrentDTE()));
  const rfr     = parseFloat(document.getElementById('sim-sl-rfr')?.value   || 20) / 100;
  const range   = Math.min(60, Math.max(5, parseFloat(document.getElementById('sim-table-range')?.value || 20)));
  const step    = Math.max(0.5, parseFloat(document.getElementById('sim-table-step')?.value || 1));
  return {
    simSpot,
    dte, rfr, range, step,
    T: dte / 365,
  };
}

function simGetLegMarketPrice(leg, expiry) {
  if (!leg) return 0;
  if (leg.type === 'stock') return ST.spot || 0;
  const exp = expiry || leg.expiry || simGetActiveExpiry();
  if (!exp || !ST.chain?.[exp]) return 0;
  const rows = ST.chain[exp];
  const target = Math.round((parseFloat(leg.strike) || 0) * 100) / 100;
  // Strikes may not match by strict equality due to float formatting; match by rounding.
  let row = rows.find(r => (Math.round((r.strike || 0) * 100) / 100) === target);
  if (!row && rows.length) {
    // Fallback: closest strike.
    row = rows.reduce((best, r) => {
      if (!best) return r;
      return Math.abs((r.strike || 0) - target) < Math.abs((best.strike || 0) - target) ? r : best;
    }, null);
    if (!row) return 0;
    // If user provided a non-existent strike, allow snapping within the typical chain spacing.
    const strikes = rows.map(r => r.strike).filter(n => isFinite(n)).sort((a, b) => a - b);
    let minDiff = Infinity;
    for (let i = 1; i < strikes.length; i++) {
      const d = strikes[i] - strikes[i - 1];
      if (d > 0 && d < minDiff) minDiff = d;
    }
    if (!isFinite(minDiff) || minDiff <= 0) minDiff = 999999;
    const tol = Math.max(1, minDiff * 1.5);
    if (Math.abs((row.strike || 0) - target) > tol) return 0;
  }
  if (!row) return 0;
  return leg.type === 'call' ? (row.callMid || 0) : (row.putMid || 0);
}

function simRecalibrateIvs() {
  const { simSpot, rfr, T } = simGetParams();
  const q = ST.q || 0;
  const exp = simGetActiveExpiry();
  const seen = new Set();
  let anyUpdated = false;
  SIM.legs.forEach(leg => {
    if (!leg || leg.type === 'stock') return;
    const legExp = String(leg.expiry || '').trim();
    // If leg expiry is missing or not present in the chain, use the active expiry.
    if (!legExp || !ST.chain?.[legExp]) leg.expiry = exp;
    const key = simGetLegIvKey(leg);
    if (seen.has(key)) return;
    seen.add(key);

    const marketPrice = simGetLegMarketPrice(leg, leg.expiry || exp);
    let iv = 0.5;
    const canInfer = (marketPrice > 0 && simSpot > 0 && T > 0);
    if (canInfer) {
      try {
        const inferred = impliedVol(simSpot, leg.strike, Math.max(0.001, T), rfr, q, marketPrice, leg.type);
        if (isFinite(inferred) && inferred > 0) iv = inferred;
      } catch (_) {
        iv = 0.5;
      }
    }

    SIM.legs.forEach(targetLeg => {
      const a = Math.round((parseFloat(targetLeg?.strike) || 0) * 100) / 100;
      const b = Math.round((parseFloat(leg.strike) || 0) * 100) / 100;
      if (targetLeg?.type === leg.type && a === b) targetLeg.iv = iv;
    });

    const input = document.getElementById(simGetIvSliderId(key));
    if (input) input.value = (iv * 100).toFixed(2).replace('.', ',');
    if (canInfer) anyUpdated = true;
  });
  if (!anyUpdated) {
    const first = (SIM.legs || []).find(l => l && l.type !== 'stock') || null;
    const expDbg = exp || simGetActiveExpiry() || '';
    const hasChain = !!(expDbg && ST.chain?.[expDbg] && ST.chain[expDbg].length);
    const pxDbg = first ? simGetLegMarketPrice(first, expDbg) : 0;
    const dteDbg = parseFloat(document.getElementById('sim-sl-dte')?.value || '') || simGetCurrentDTE();
    if (!expDbg || !hasChain) {
      showToast('No se pudo recalibrar VI: sin vencimiento valido.');
    } else if (!(simSpot > 0) || !(T > 0) || !(dteDbg > 0)) {
      showToast('No se pudo recalibrar VI: DTE invalido.');
    } else if (!(pxDbg > 0)) {
      showToast(`No se pudo recalibrar VI: sin precio de mercado (${expDbg}).`);
    } else {
      showToast('No se pudo recalibrar VI.');
    }
  }
  renderSimulador();
  simScheduleTempSave?.();
}

function simInferLegMarketIV(leg, expiry, r, q) {
  if (!leg || leg.type === 'stock') return 0;
  const exp = expiry || leg.expiry || simGetActiveExpiry();
  const T = simGetExpiryT(exp);
  const marketPrice = simGetLegMarketPrice(leg, exp);
  if (marketPrice <= 0 || T <= 0) return 0.5;
  return impliedVol(ST.spot, leg.strike, T, r, q, marketPrice, leg.type) || 0.5;
}

function simBuildImportedLeg(base) {
  const expiry = simGetActiveExpiry() || base.expiry || '';
  const { rfr } = simGetParams();

  // Snap strike to the closest available strike for the expiry to ensure we can price it from ST.chain.
  let strike = base.type === 'stock' ? (base.strike || 0) : (base.strike || ST.spot);
  if (base.type !== 'stock' && expiry && ST.chain?.[expiry]?.length) {
    const strikes = ST.chain[expiry].map(r => r.strike).filter(n => isFinite(n));
    const target = parseFloat(strike) || 0;
    if (strikes.length && isFinite(target) && target > 0) {
      strike = strikes.reduce((p, s) => Math.abs(s - target) < Math.abs(p - target) ? s : p, strikes[0]);
    }
  }
  const leg = {
    type: base.type || 'call',
    qty: base.qty || 0,
    strike,
    entryPrice: parseFloat(base.entryPrice) || 0,
    expiry,
    iv: 0,
  };
  leg.iv = simInferLegMarketIV(leg, expiry, rfr, ST.q || 0);
  return leg;
}

function simGetLegIV(leg, r, q) {
  if (leg.type === 'stock') return 0;
  if (leg.iv > 0.001) return leg.iv;
  const marketIV = simInferLegMarketIV(leg, leg.expiry, r, q);
  if (marketIV > 0.001) return marketIV;
  if (leg.entryPrice <= 0) return 0.5;
  const T = simGetExpiryT(leg.expiry);
  if (T <= 0) return 0.5;
  return impliedVol(ST.spot, leg.strike, T, r, q, leg.entryPrice, leg.type) || 0.5;
}

function simGetExpiryT(expiry) {
  if (!expiry) return 30 / 365;
  const d = simParseExpiryDate(expiry);
  if (!d) return 30 / 365;
  return Math.max(0, (d.getTime() - Date.now()) / (365 * 24 * 3600 * 1000));
}

function simPayoffAtExpiry(spot, leg) {
  const qty = leg.qty;
  if (leg.type === 'stock') return qty * (spot - leg.entryPrice);
  const intr = leg.type === 'call'
    ? Math.max(spot - leg.strike, 0)
    : Math.max(leg.strike - spot, 0);
  return qty * (intr - leg.entryPrice) * 100;
}

function simPayoffTheoretical(spot, leg, T, r, q, ivOverridePct) {
  if (leg.type === 'stock') return leg.qty * (spot - leg.entryPrice);
  if (T <= 0) return simPayoffAtExpiry(spot, leg);
  const baseIV = ivOverridePct > 0 ? ivOverridePct / 100 : simGetLegIV(leg, r, q);
  const iv     = Math.max(0.01, baseIV);
  const res    = bs(spot, leg.strike, T, r, q, iv, leg.type);
  return leg.qty * (res.price - leg.entryPrice) * 100;
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   MAIN RENDER
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function renderSimulador() {
  if (!document.getElementById('tab-simulador')) return;
  // Bind/repair floating panel + header icons even if the HTML was pre-rendered.
  simEnsureFloatingPanel?.();
  simPatchParamsHeader?.();
  simBindCollapseCarets?.(document.getElementById('tab-simulador'));

  // Auto-restore last temp strategy (only once, only if nothing is loaded yet).
  if (simTryLoadTempOnce?.()) {
    setTimeout(() => renderSimulador(), 0);
    return;
  }

  // Auto-set DTE to the active expiry (once we have chain data), unless the user edited it.
  const dteEl = document.getElementById('sim-sl-dte');
  const dteIn = document.getElementById('sim-in-dte');
  const spotEl = document.getElementById('sim-sl-spot');
  const spotIn = document.getElementById('sim-in-spot');

  // Auto-set Spot to the current GGAL spot once available (HTML placeholder was 1).
  if (spotEl && spotEl.dataset.simUserBind !== '1') {
    spotEl.addEventListener('input', () => (spotEl.dataset.simUserEdited = '1'));
    spotEl.addEventListener('change', () => (spotEl.dataset.simUserEdited = '1'));
    spotIn?.addEventListener('input', () => (spotEl.dataset.simUserEdited = '1'));
    spotEl.dataset.simUserBind = '1';
  }
  if (spotEl && spotEl.dataset.simUserEdited !== '1') {
    const cur = parseFloat(spotEl.value);
    const s = parseFloat(ST.spot) || 0;
    if (s > 0 && (!isFinite(cur) || cur <= 1)) {
      simSyncSpotSliderBounds(s);
      spotEl.value = String(Math.max(1, Math.round(s)));
      if (spotIn) spotIn.value = simFormatPlainNumber(s, 2);
    }
  }

  if (dteEl && dteEl.dataset.simUserBind !== '1') {
    dteEl.addEventListener('input', () => (dteEl.dataset.simUserEdited = '1'));
    dteEl.addEventListener('change', () => (dteEl.dataset.simUserEdited = '1'));
    dteIn?.addEventListener('input', () => (dteEl.dataset.simUserEdited = '1'));
    dteEl.dataset.simUserBind = '1';
  }
  if (dteEl && dteEl.dataset.simUserEdited !== '1') {
    const computed = Math.min(70, Math.max(1, simGetCurrentDTE()));
    const cur = parseFloat(dteEl.value);
    // Fix common bad defaults (expired expiry -> 1d) and pre-load placeholder (30d).
    if (!isFinite(cur) || cur <= 1 || cur === 30) {
      dteEl.value = String(computed);
      if (dteIn) dteIn.value = String(computed);
    }
  }
  simSyncFloatingVisibility();

  // Keep legs table in sync
  simRenderLegs();

  if (!SIM.legs.length) {
    _simClearAll();
    return;
  }

  const { simSpot, dte, rfr: r, range, step, T } = simGetParams();
  const q  = ST.q;
  simRenderIvSliders(r, q);
  if (SIM._tempIvOverridesPending) {
    simApplyIvOverrides(SIM._tempIvOverridesPending);
    SIM._tempIvOverridesPending = null;
  }
  const lo = ST.spot * (1 - range / 100);
  const hi = ST.spot * (1 + range / 100);
  const N  = 120;
  const spots = Array.from({ length: N }, (_, i) => lo + (hi - lo) * i / (N - 1));

  // â”€â”€ Payoff series â”€â”€
  const payExp = spots.map(s => SIM.legs.reduce((acc, leg) => acc + simPayoffAtExpiry(s, leg),          0));
  const payTeo = spots.map(s => SIM.legs.reduce((acc, leg) => acc + simPayoffTheoretical(s, leg, T, r, q, simGetLegIvPercent(leg, r, q)), 0));
  const payT3  = T > 3/365  ? spots.map(s => SIM.legs.reduce((acc, leg) => acc + simPayoffTheoretical(s, leg, Math.max(0.001, T - 3/365),  r, q, simGetLegIvPercent(leg, r, q)), 0)) : null;
  const payT7  = T > 7/365  ? spots.map(s => SIM.legs.reduce((acc, leg) => acc + simPayoffTheoretical(s, leg, Math.max(0.001, T - 7/365),  r, q, simGetLegIvPercent(leg, r, q)), 0)) : null;

  // â”€â”€ Metrics â”€â”€
  const maxProfit = Math.max(...payExp);
  const maxLoss   = Math.min(...payExp);
  const breakevens = [];
  for (let i = 0; i < payExp.length - 1; i++) {
    if ((payExp[i] < 0 && payExp[i+1] >= 0) || (payExp[i] >= 0 && payExp[i+1] < 0)) {
      const t = -payExp[i] / (payExp[i+1] - payExp[i]);
      breakevens.push(spots[i] + t * (spots[i+1] - spots[i]));
    }
  }
  const profitPct = payExp.filter(p => p > 0).length / payExp.length * 100;

  // â”€â”€ Greeks at simSpot â”€â”€
  let deltaNet = 0, thetaNet = 0, gammaNet = 0, vegaNet = 0;
  SIM.legs.forEach(leg => {
    if (leg.type === 'stock') { deltaNet += leg.qty; return; }
    const useT = Math.max(0.001, T);
    const iv   = simGetLegIvDecimal(leg, r, q);
    const g    = bs(simSpot, leg.strike, useT, r, q, iv, leg.type);
    deltaNet  += leg.qty * g.delta  * 100;
    thetaNet  += leg.qty * g.theta  * 100;
    gammaNet  += leg.qty * g.gamma  * 100;
    vegaNet   += leg.qty * g.vega   * 100;
  });

  // â”€â”€ Spot badge â”€â”€
  const badge = document.getElementById('sim-spot-badge');
  if (badge) {
    const pct = ((simSpot / ST.spot - 1) * 100);
    badge.textContent = `Spot: $${fmtN(simSpot, 0)} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`;
  }

  // â”€â”€ Render all panels â”€â”€
  simRenderParamsSummary({ simSpot, dte, T, r, q });
  _simRenderMetrics({ maxProfit, maxLoss, breakevens, profitPct, deltaNet, thetaNet, gammaNet, vegaNet });
  _simRenderChart(spots, payExp, payTeo, payT3, payT7, simSpot);
  _simRenderTable(simSpot, r, q, range, step, T);

  // Persist temp strategy snapshot on every change (debounced).
  simScheduleTempSave?.();
}

function _simClearAll() {
  const paramsSummary = document.getElementById('sim-params-summary');
  if (paramsSummary) paramsSummary.innerHTML = '';
  const ivWrap = document.getElementById('sim-iv-sliders');
  if (ivWrap) ivWrap.innerHTML = '';
  const metricsEl = document.getElementById('sim-metrics');
  if (metricsEl) metricsEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--dim);font-size:11px">Agreg\\u00e1 posiciones para ver m\\u00e9tricas</div>';
  if (SIM.chart) { SIM.chart.destroy(); SIM.chart = null; }
  const tb = document.getElementById('sim-table-body');
  if (tb) tb.innerHTML = '';
  const chartEmpty = document.getElementById('sim-chart-empty');
  if (chartEmpty) chartEmpty.style.display = '';
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   METRICS PANEL
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function _simRenderMetrics({ maxProfit, maxLoss, breakevens, profitPct, deltaNet, thetaNet, gammaNet, vegaNet }) {
  const el = document.getElementById('sim-metrics');
  if (!el) return;

  const fV = v => Math.abs(v) > 5e6 ? 'Ilimitada' : fmtN(v, 0);
  const beStr = breakevens.length
    ? breakevens.map(b => '$' + fmtN(b, 0)).join(' / ')
    : '--';

  const rows = [
    ['Ganancia M\\u00e1x.',  fV(maxProfit),                  maxProfit > 0 ? 'var(--green)' : 'var(--muted)', 'al vencimiento'],
    ['P\\u00e9rdida M\\u00e1x.',   fV(maxLoss),                    maxLoss < 0   ? 'var(--red)'   : 'var(--muted)', 'al vencimiento'],
    ['Breakevens',     beStr,                          'var(--amber)',                                   'puntos de equilibrio'],
    ['PoP aprox.',     profitPct.toFixed(1) + '%',     profitPct > 50 ? 'var(--green)' : 'var(--amber)','log-normal aproximado'],
    ['Delta Neto',     deltaNet.toFixed(2),            deltaNet > 0 ? 'var(--green)' : deltaNet < 0 ? 'var(--red)' : 'var(--muted)', 'exposici\\u00f3n direccional'],
    ['Theta / D\\u00eda',    thetaNet.toFixed(2),            thetaNet > 0 ? 'var(--green)' : 'var(--red)',    'decaimiento temporal'],
    ['Gamma Neto',     gammaNet.toFixed(5),            'var(--text)',                                    'curvatura del delta'],
    ['Vega Neto',      vegaNet.toFixed(3),             vegaNet > 0 ? 'var(--green)' : 'var(--red)',     'sensibilidad a IV'],
  ];

  el.innerHTML = rows.map(([label, val, color, sub]) => `
    <div style="display:flex;justify-content:space-between;align-items:flex-end;padding:7px 4px;border-bottom:1px solid var(--border2)">
      <div>
        <div style="font-size:9px;font-weight:600;color:var(--text);text-transform:uppercase;letter-spacing:.4px">${label}</div>
        <div style="font-size:8px;color:var(--dim);margin-top:1px">${sub}</div>
      </div>
      <div style="font-family:var(--mono);font-size:13px;font-weight:600;color:${color}">${val}</div>
    </div>`).join('');
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   PAYOFF CHART
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function _simRenderChart(spots, payExp, payTeo, payT3, payT7, simSpot) {
  if (SIM.chart) { SIM.chart.destroy(); SIM.chart = null; }
  const chartEmpty = document.getElementById('sim-chart-empty');
  const ctx = document.getElementById('sim-chart')?.getContext('2d');
  if (!ctx) return;
  if (chartEmpty) chartEmpty.style.display = 'none';

  // Vertical line plugin at simSpot
  const spotIdx = spots.reduce((pi, s, i) => Math.abs(s - simSpot) < Math.abs(spots[pi] - simSpot) ? i : pi, 0);
  const vlinePlugin = {
    id: 'simVline',
    afterDraw(chart) {
      const { ctx: c, chartArea: { top, bottom }, scales: { x } } = chart;
      const xPos = x.getPixelForValue(spotIdx);
      c.save();
      c.beginPath();
      c.setLineDash([5, 4]);
      c.strokeStyle = 'rgba(232,184,75,0.5)';
      c.lineWidth = 1.5;
      c.moveTo(xPos, top);
      c.lineTo(xPos, bottom);
      c.stroke();
      c.restore();
    }
  };

  const datasets = [
    {
      label: 'Vencimiento',
      data: payExp,
      borderWidth: 2.5, pointRadius: 0, fill: true, tension: 0,
      segment: {
        borderColor:     ctx => ctx.p1.parsed.y >= 0 ? '#44c76a' : '#f05a5a',
        backgroundColor: ctx => ctx.p1.parsed.y >= 0 ? 'rgba(68,199,106,0.10)' : 'rgba(240,90,90,0.10)',
      },
    },
    {
      label: 'Res. Te\\u00f3rico',
      data: payTeo,
      borderColor: '#5aabff', borderWidth: 2, pointRadius: 0, fill: false, tension: 0.3,
    },
  ];

  if (payT3) datasets.push({
    label: 'T-3d', data: payT3,
    borderColor: 'rgba(232,184,75,0.7)', borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.3, borderDash: [5, 4],
  });
  if (payT7) datasets.push({
    label: 'T-7d', data: payT7,
    borderColor: 'rgba(176,136,240,0.7)', borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.3, borderDash: [5, 4],
  });

  SIM.chart = new Chart(ctx, {
    type: 'line',
    plugins: [vlinePlugin],
    data: { labels: spots.map((_, i) => i), datasets },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: {
        legend: {
          display: true,
          labels: { color: '#7a8fa6', font: { size: 10 }, boxWidth: 14, padding: 14 }
        },
        tooltip: {
          backgroundColor: '#131920', borderColor: '#2a3444', borderWidth: 1,
          titleColor: '#7a8fa6', bodyColor: '#d8e3ef',
          callbacks: {
            title: items => 'Spot: $' + spots[items[0].dataIndex].toLocaleString('es-AR', { maximumFractionDigits: 0 }),
            label: item => ` ${item.dataset.label}: ${item.raw >= 0 ? '+' : ''}${fmtN(item.raw, 0)}`,
          }
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#7a8fa6', font: { size: 9 }, maxTicksLimit: 9,
            callback: (v, i) => '$' + Math.round(spots[i] / 1000) + 'k',
          },
          grid: { color: '#1a2230' },
        },
        y: {
          ticks: {
            color: '#7a8fa6', font: { size: 9 },
            callback: v => (v >= 0 ? '+' : '') + fmtN(v, 0),
          },
          grid: { color: '#1a2230' },
        }
      }
    }
  });
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   P&L TABLE
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function _simRenderTable(simSpot, r, q, range, step, T) {
  const tb = document.getElementById('sim-table-body');
  if (!tb) return;

  const pcts = [];
  for (let p = -Math.ceil(range); p <= Math.ceil(range) + 0.01; p += step) {
    pcts.push(parseFloat(p.toFixed(2)));
  }

  tb.innerHTML = pcts.map(pct => {
    const price   = simSpot * (1 + pct / 100);
    const pFinish = SIM.legs.reduce((acc, leg) => acc + simPayoffAtExpiry(price, leg), 0);
    const pTeo    = SIM.legs.reduce((acc, leg) => acc + simPayoffTheoretical(price, leg, T, r, q, simGetLegIvPercent(leg, r, q)), 0);
    const pTeo3   = SIM.legs.reduce((acc, leg) => acc + simPayoffTheoretical(price, leg, Math.max(0, T - 3 / 365), r, q, simGetLegIvPercent(leg, r, q)), 0);
    const pTeo7   = SIM.legs.reduce((acc, leg) => acc + simPayoffTheoretical(price, leg, Math.max(0, T - 7 / 365), r, q, simGetLegIvPercent(leg, r, q)), 0);
    const isCur   = pct === 0;
    const pctC    = pct > 0 ? 'var(--green)' : pct < 0 ? 'var(--red)' : 'var(--amber)';
    const pnlC    = v => v > 0 ? 'var(--green)' : v < 0 ? 'var(--red)' : 'var(--muted)';
    const rowBg   = isCur ? 'background:rgba(232,184,75,0.10);' : '';
    const fw      = isCur ? 'font-weight:700;' : '';
    return `<tr style="${rowBg}border-bottom:1px solid var(--border2)">
      <td style="padding:4px 10px;text-align:center;font-family:var(--mono);font-size:11px;color:${pctC};${fw}">${pct >= 0 ? '+' : ''}${pct.toLocaleString('es-AR',{minimumFractionDigits:pct % 1 === 0 ? 0 : 1,maximumFractionDigits:1})}%</td>
      <td style="padding:4px 10px;text-align:center;font-family:var(--mono);font-size:11px">${fmtN(price, 0)}</td>
      <td style="padding:4px 10px;text-align:center;font-family:var(--mono);font-size:11px;color:${pnlC(pFinish)};${fw}">${(pFinish >= 0 ? '+' : '') + fmtN(pFinish, 0)}</td>
      <td style="padding:4px 10px;text-align:center;font-family:var(--mono);font-size:11px;color:${pnlC(pTeo)}">${(pTeo >= 0 ? '+' : '') + fmtN(pTeo, 0)}</td>
      <td style="padding:4px 10px;text-align:center;font-family:var(--mono);font-size:11px;color:${pnlC(pTeo3)}">${(pTeo3 >= 0 ? '+' : '') + fmtN(pTeo3, 0)}</td>
      <td style="padding:4px 10px;text-align:center;font-family:var(--mono);font-size:11px;color:${pnlC(pTeo7)}">${(pTeo7 >= 0 ? '+' : '') + fmtN(pTeo7, 0)}</td>
    </tr>`;
  }).join('');
}






