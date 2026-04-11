/* ===== SINTETICAS =====
   Put-Call Parity (por unidad):
   Precio Sint = Strike + Precio Call - Precio Put

   Tasas (con DTE en anios):
   Tasa Sint/Spot = (Sint/Spot - 1) / T
   Tasa Sint/Fut  = (Fut/Sint - 1) / T
   Tasa Spot/Fut  = (Fut/Spot - 1) / T
   Arbitraje      = ((Fut - Sint) / Spot) / T
*/

const SYN = {
  futTicker: 'GGAL/ABR26',
  // Threshold to mark opportunities (annualized).
  // Example: 0.10 = 10% annual.
  arbOppThresh: 0.10,
};

let synRenderQueued = false;
function synScheduleRender() {
  if (synRenderQueued) return;
  synRenderQueued = true;
  requestAnimationFrame(() => {
    synRenderQueued = false;
    renderSinteticas();
  });
}

function synPlain(n, dec = 2) {
  if (!isFinite(n)) return '';
  // Sin separador de miles (mejor para editar). Usar coma como decimal.
  return n.toFixed(dec).replace('.', ',');
}

function synParse(v) {
  const n = parseARSNum(v);
  return isFinite(n) ? n : NaN;
}

function synSanitizeNumericInput(el) {
  if (!el) return;
  let s = String(el.value ?? '');
  // Mantener digitos, coma, punto y signo.
  s = s.replace(/[^\d,.\-]/g, '');
  // Solo un signo al inicio
  s = s.replace(/(?!^)-/g, '');
  // Solo una coma/punto decimal (normalizamos a coma)
  const hasComma = s.includes(',');
  if (hasComma) {
    s = s.replace(/\./g, ''); // punto como miles -> afuera
    const parts = s.split(',');
    s = parts[0] + (parts.length > 1 ? ',' + parts.slice(1).join('').replace(/,/g, '') : '');
  } else {
    // si no hay coma, permitir un unico punto como decimal y luego lo dejamos
    const parts = s.split('.');
    s = parts[0] + (parts.length > 1 ? '.' + parts.slice(1).join('').replace(/\./g, '') : '');
  }

  if (el.dataset?.nonNegative === '1') s = s.replace('-', '');
  el.value = s;
}

function synGetExpiry() {
  return ST.selExpiry || document.getElementById('expiry-sel')?.value || '';
}

function synGetTYears(expiry) {
  if (!expiry) return NaN;
  const days = (new Date(expiry + 'T12:00:00') - Date.now()) / 86400000;
  return Math.max(1, Math.round(days)) / 365;
}

function synGetLiveSpot() {
  return isFinite(ST.spot) ? ST.spot : NaN;
}

function synGetLiveFut() {
  const q = ST.futures?.[SYN.futTicker];
  const v = q?.last;
  return isFinite(v) ? v : NaN;
}

function synGetLiveRatePct() {
  const r = siteRate();
  return isFinite(r) ? r : NaN;
}

function synGetParams() {
  const spotAuto = !!document.getElementById('syn-spot-auto')?.checked;
  const futAuto = !!document.getElementById('syn-fut-auto')?.checked;
  const rateAuto = !!document.getElementById('syn-rate-auto')?.checked;

  const spot = spotAuto ? synGetLiveSpot() : synParse(document.getElementById('syn-spot')?.value);
  const fut = futAuto ? synGetLiveFut() : synParse(document.getElementById('syn-fut')?.value);
  const ratePct = rateAuto ? synGetLiveRatePct() : synParse(document.getElementById('syn-rate')?.value);

  return { spotAuto, futAuto, rateAuto, spot, fut, ratePct };
}

function synSyncInputsFromAuto(params) {
  const spotEl = document.getElementById('syn-spot');
  const futEl = document.getElementById('syn-fut');
  const rateEl = document.getElementById('syn-rate');
  if (spotEl) {
    spotEl.disabled = params.spotAuto;
    spotEl.style.opacity = params.spotAuto ? '0.65' : '1';
    if (params.spotAuto) spotEl.value = synPlain(params.spot, 2);
  }
  if (futEl) {
    futEl.disabled = params.futAuto;
    futEl.style.opacity = params.futAuto ? '0.65' : '1';
    if (params.futAuto) futEl.value = synPlain(params.fut, 2);
  }
  if (rateEl) {
    rateEl.disabled = params.rateAuto;
    rateEl.style.opacity = params.rateAuto ? '0.65' : '1';
    if (params.rateAuto) rateEl.value = synPlain(params.ratePct, 2);
  }
}

function synFmtPct(x, dec = 2) {
  if (!isFinite(x)) return '--';
  return (x * 100).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + '%';
}

function renderSinteticas() {
  const expiry = synGetExpiry();
  const T = synGetTYears(expiry);

  const params = synGetParams();
  synSyncInputsFromAuto(params);

  // Threshold (in % annual) for OP marking
  const thrEl = document.getElementById('syn-opp-thresh');
  let thr = SYN.arbOppThresh;
  if (thrEl) {
    const thrPct = synParse(thrEl.value);
    if (isFinite(thrPct) && thrPct >= 0) thr = thrPct / 100;
  }

  const meta = document.getElementById('syn-meta');
  if (meta) {
    const expTxt = expiry ? fmtExpiry(expiry) : '--';
    const days = expiry ? Math.max(1, Math.round((new Date(expiry + 'T12:00:00') - Date.now()) / 86400000)) : null;
    const futTxt = (params.futAuto && !(isFinite(params.fut) && params.fut > 0)) ? ` \u00b7 Fut ${SYN.futTicker}: --` : '';
    meta.textContent = `Vencimiento ${expTxt}` + (days != null ? ` \u00b7 DTE ${days}d` : '') + futTxt;
  }

  const body = document.getElementById('syn-body');
  const status = document.getElementById('syn-status');
  if (!body) return;

  const spot = params.spot;
  const fut = params.fut;
  const futValid = isFinite(fut) && fut > 0;

  if (!expiry || !ST.chain?.[expiry]?.length) {
    body.innerHTML = `<tr><td colspan="12" style="padding:14px 10px;color:var(--dim);text-align:center;border-bottom:1px solid var(--border)">Sin datos de cadena para el vencimiento seleccionado</td></tr>`;
    if (status) status.textContent = '';
    return;
  }

  if (!isFinite(spot) || spot <= 0) {
    body.innerHTML = `<tr><td colspan="12" style="padding:14px 10px;color:var(--dim);text-align:center;border-bottom:1px solid var(--border)">Precio GGAL no disponible</td></tr>`;
    if (status) status.textContent = '';
    return;
  }
  if (!isFinite(T) || T <= 0) {
    body.innerHTML = `<tr><td colspan="12" style="padding:14px 10px;color:var(--dim);text-align:center;border-bottom:1px solid var(--border)">DTE no disponible</td></tr>`;
    if (status) status.textContent = '';
    return;
  }

  const rows = ST.chain[expiry];
  const out = [];
  let used = 0;
  let opps = 0;

  for (const row of rows) {
    const K = row.strike;
    let c = row.callMid || 0;
    let p = row.putMid || 0;
    if (!(c > 0) && row.callBid != null && row.callAsk != null && row.callBid > 0 && row.callAsk > 0) c = (row.callBid + row.callAsk) / 2;
    if (!(p > 0) && row.putBid != null && row.putAsk != null && row.putBid > 0 && row.putAsk > 0) p = (row.putBid + row.putAsk) / 2;
    if (!(c > 0) || !(p > 0) || !isFinite(K)) continue;

    const sint = K + c - p;

    const tasaSintSpot = (sint / spot - 1) / T;
    const tasaSintFut = futValid ? (fut / sint - 1) / T : NaN;
    const tasaSpotFut = futValid ? (fut / spot - 1) / T : NaN;
    const arbitraje = futValid ? ((fut - sint) / spot) / T : NaN;

    const brechaSintFut = futValid ? (fut - sint) : NaN;
    const brechaSintSpot = sint - spot;
    const brechaSpotFut = futValid ? (fut - spot) : NaN;

    const col = (v) => (v >= 0 ? 'var(--green)' : 'var(--red)');
    const td = (html, color) => `<td style="padding:7px 8px;border-bottom:1px solid var(--border2);text-align:center;white-space:nowrap${color ? ';color:' + color : ''}">${html}</td>`;

    const tdMaybe = (html, color) => `<td style="padding:7px 8px;border-bottom:1px solid var(--border2);text-align:center;white-space:nowrap${color ? ';color:' + color : ''}">${html}</td>`;
    const tdOpp = (html) => `<td style="padding:7px 6px;border-bottom:1px solid var(--border2);text-align:center;white-space:nowrap">${html}</td>`;

    const isOpp = futValid && isFinite(arbitraje) && Math.abs(arbitraje) >= thr;
    if (isOpp) opps++;
    const oppDir = isOpp ? (brechaSintFut >= 0 ? 'F>S' : 'S>F') : '';
    const oppTitle = isOpp
      ? (() => {
          const futGtSyn = brechaSintFut >= 0; // brecha = Fut - Sint
          const rel = futGtSyn ? 'Futuro > Sintetico (sintetica barata)' : 'Sintetico > Futuro (sintetica cara)';
          const op = futGtSyn
            ? 'Operacion sugerida: Vender Futuro y Comprar Sintetico (Comprar Call + Vender Put). Alternativa: Vender Futuro y Comprar Accion Spot.'
            : 'Operacion sugerida: Comprar Futuro y Vender Sintetico (Vender Call + Comprar Put). Alternativa: Comprar Futuro y Vender/Short Accion Spot.';
          return `Oportunidad: ${rel}. ${op} (${synFmtPct(arbitraje, 1)} anual)`;
        })()
      : '';
    const oppPill = isOpp
      ? `<span title="${oppTitle}" style="display:inline-block;min-width:36px;padding:2px 6px;border-radius:999px;border:1px solid ${col(arbitraje)};background:${(arbitraje >= 0) ? 'rgba(40,199,111,0.10)' : 'rgba(255,92,92,0.10)'};color:${col(arbitraje)};font-size:10px;line-height:1">${oppDir}</span>`
      : '';

    out.push('<tr>' +
      td(fmtStrike(K), 'var(--amber)') +
      tdOpp(oppPill) +
      td(fmtN(c, 2), 'var(--text)') +
      td(fmtN(p, 2), 'var(--text)') +
      td(fmtN(sint, 2), 'var(--amber)') +
      td(synFmtPct(tasaSintSpot, 2), col(tasaSintSpot)) +
      tdMaybe(futValid ? synFmtPct(tasaSintFut, 2) : '--', futValid ? col(tasaSintFut) : 'var(--dim)') +
      tdMaybe(futValid ? synFmtPct(tasaSpotFut, 2) : '--', futValid ? col(tasaSpotFut) : 'var(--dim)') +
      tdMaybe(futValid ? synFmtPct(arbitraje, 2) : '--', futValid ? col(arbitraje) : 'var(--dim)') +
      tdMaybe(futValid ? fmtN(brechaSintFut, 2) : '--', futValid ? col(brechaSintFut) : 'var(--dim)') +
      td(fmtN(brechaSintSpot, 2), col(brechaSintSpot)) +
      tdMaybe(futValid ? fmtN(brechaSpotFut, 2) : '--', futValid ? col(brechaSpotFut) : 'var(--dim)') +
    '</tr>');
    used++;
  }

  if (!used) {
    body.innerHTML = `<tr><td colspan="12" style="padding:14px 10px;color:var(--dim);text-align:center;border-bottom:1px solid var(--border)">No hay strikes con Call y Put con precio (mid)</td></tr>`;
    if (status) status.textContent = '';
    return;
  }

  body.innerHTML = out.join('');
  if (status) status.textContent =
    `${used} strikes \u00b7 Opp ${opps} \u00b7 Spot ${fmtN(spot, 2)}` +
    (futValid ? ` \u00b7 Fut ${fmtN(fut, 2)}` : ` \u00b7 Fut ${SYN.futTicker} no disponible`);
}
