/* ===== CHAIN RENDER ===== */

const CHAIN_COLS_STORAGE_KEY = 'ggal_chain_cols_v1';
const CHAIN_COL_DEFS = [
  { id: 'label', title: 'Calls', putTitle: 'Puts', callHeaderColor: 'var(--green)', putHeaderColor: 'var(--red)' },
  { id: 'ticker', title: 'Ticker', fullTitle: 'Ticker completo' },
  { id: 'delta', title: 'Delta' },
  { id: 'vega', title: 'Vega' },
  { id: 'theta', title: 'Theta' },
  { id: 'spread', title: 'Spread', fullTitle: 'Spread' },
  { id: 'spreadPct', title: 'Spread %', fullTitle: 'Spread %' },
  { id: 'bid', title: 'Bid' },
  { id: 'ask', title: 'Ask' },
  { id: 'last', title: 'Last', callHeaderColor: 'var(--green)', putHeaderColor: 'var(--red)' },
  { id: 'chg', title: 'CHG', fullTitle: '% Cambio (CHG)', callHeaderColor: 'var(--amber)', putHeaderColor: 'var(--amber)' },
  { id: 'iv', title: 'IV', fullTitle: 'Volatilidad Implicita (IV)' },
  { id: 'moneyness', title: 'ME', fullTitle: 'Moneyness (ME)' },
  { id: 'intrinsic', title: 'VI', fullTitle: 'Valor Intrinseco (VI)' },
  { id: 'extrinsic', title: 'VE', fullTitle: 'Valor Extrinseco (VE)' },
];
const CHAIN_DEFAULT_ORDER = [
  'label',
  'ticker',
  'moneyness',
  'intrinsic',
  'extrinsic',
  'delta',
  'vega',
  'theta',
  'spread',
  'spreadPct',
  'bid',
  'ask',
  'last',
  'chg',
  'iv',
];
const CHAIN_DEFAULT_HIDDEN = ['ticker', 'moneyness', 'intrinsic', 'extrinsic', 'spread', 'spreadPct'];
let chainColsState = null;
let chainColsMenuBound = false;
let chainColsMenuInteracting = false;

function loadChainColsState() {
  if (chainColsState) return chainColsState;
  const fallback = { order: [...CHAIN_DEFAULT_ORDER], hidden: [...CHAIN_DEFAULT_HIDDEN] };
  try {
    const raw = localStorage.getItem(CHAIN_COLS_STORAGE_KEY);
    if (!raw) return (chainColsState = fallback);
    const parsed = JSON.parse(raw);
    const order = Array.isArray(parsed?.order) ? parsed.order.filter(id => CHAIN_DEFAULT_ORDER.includes(id)) : [];
    const hidden = Array.isArray(parsed?.hidden) ? parsed.hidden.filter(id => CHAIN_DEFAULT_ORDER.includes(id)) : [];
    const missing = CHAIN_DEFAULT_ORDER.filter(id => !order.includes(id));
    const hiddenSet = new Set(hidden);
    missing.forEach(id => {
      if (CHAIN_DEFAULT_HIDDEN.includes(id)) hiddenSet.add(id);
    });
    chainColsState = { order: [...order, ...missing], hidden: [...hiddenSet] };
  } catch (e) {
    console.warn('loadChainColsState error:', e);
    chainColsState = fallback;
  }
  return chainColsState;
}

function saveChainColsState() {
  if (!chainColsState) return;
  try {
    localStorage.setItem(CHAIN_COLS_STORAGE_KEY, JSON.stringify(chainColsState));
  } catch (e) {
    console.warn('saveChainColsState error:', e);
  }
}

function getChainCallColumns() {
  const state = loadChainColsState();
  return state.order.filter(id => !state.hidden.includes(id));
}

function getChainColDef(id) {
  return CHAIN_COL_DEFS.find(col => col.id === id);
}

function initChainColsMenu() {
  if (chainColsMenuBound) return;
  chainColsMenuBound = true;
  document.addEventListener('pointerdown', e => {
    chainColsMenuInteracting = !!(e.target.closest('#chain-cols-menu') || e.target.closest('#chain-cols-btn'));
  }, true);
  document.addEventListener('click', e => {
    const menu = document.getElementById('chain-cols-menu');
    if (!menu || menu.style.display === 'none') return;
    if (chainColsMenuInteracting || e.target.closest('#chain-cols-menu') || e.target.closest('#chain-cols-btn')) {
      chainColsMenuInteracting = false;
      return;
    }
    menu.style.display = 'none';
    chainColsMenuInteracting = false;
  });
}

function toggleChainColsMenu() {
  initChainColsMenu();
  const menu = document.getElementById('chain-cols-menu');
  if (!menu) return;
  const shouldOpen = menu.style.display === 'none' || !menu.style.display;
  if (!shouldOpen) {
    menu.style.display = 'none';
    return;
  }
  renderChainColsMenu();
  menu.style.display = 'block';
}

function renderChainColsMenu() {
  const menu = document.getElementById('chain-cols-menu');
  if (!menu) return;
  const state = loadChainColsState();
  const items = state.order.map((id, idx) => {
    const def = getChainColDef(id);
    const isHidden = state.hidden.includes(id);
    return `
      <div style="display:grid;grid-template-columns:30px 1fr 28px 28px;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border2)">
        <button type="button" onclick="toggleChainColumn('${id}')" title="${isHidden ? 'Mostrar' : 'Ocultar'} columna"
          style="padding:2px 0;background:transparent;border:1px solid ${isHidden ? 'var(--border)' : 'var(--amber)'};color:${isHidden ? 'var(--muted)' : 'var(--amber)'};border-radius:4px;font-size:12px;cursor:pointer">
          ${isHidden ? '--' : '👁️'}
        </button>
        <div style="font-size:11px;color:${isHidden ? 'var(--muted)' : 'var(--text)'}">${def?.fullTitle || def?.title || id}</div>
        <button type="button" onclick="moveChainColumn('${id}',-1)" ${idx === 0 ? 'disabled' : ''} title="Mover arriba"
          style="padding:2px 0;border:1px solid var(--border);background:var(--bg);color:${idx === 0 ? 'var(--dim)' : 'var(--text)'};border-radius:4px;font-size:11px;cursor:${idx === 0 ? 'default' : 'pointer'}">↑</button>
        <button type="button" onclick="moveChainColumn('${id}',1)" ${idx === state.order.length - 1 ? 'disabled' : ''} title="Mover abajo"
          style="padding:2px 0;border:1px solid var(--border);background:var(--bg);color:${idx === state.order.length - 1 ? 'var(--dim)' : 'var(--text)'};border-radius:4px;font-size:11px;cursor:${idx === state.order.length - 1 ? 'default' : 'pointer'}">↓</button>
      </div>`;
  }).join('');

  menu.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px">
      <div>
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted)">Columnas a mostrar</div>
        <div style="font-size:10px;color:var(--dim)">Calls define el orden y Puts se espeja solo</div>
      </div>
      <button type="button" onclick="resetChainColumns()" style="padding:3px 8px;font-size:10px">Reset</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:0">${items}</div>`;
}

function toggleChainColumn(id) {
  const state = loadChainColsState();
  if (state.hidden.includes(id)) state.hidden = state.hidden.filter(colId => colId !== id);
  else if (state.order.length - state.hidden.length > 1) state.hidden.push(id);
  saveChainColsState();
  renderChainColsMenu();
  renderChain();
}

function moveChainColumn(id, delta) {
  const state = loadChainColsState();
  const idx = state.order.indexOf(id);
  const nextIdx = idx + delta;
  if (idx < 0 || nextIdx < 0 || nextIdx >= state.order.length) return;
  const tmp = state.order[idx];
  state.order[idx] = state.order[nextIdx];
  state.order[nextIdx] = tmp;
  saveChainColsState();
  renderChainColsMenu();
  renderChain();
}

function resetChainColumns() {
  chainColsState = { order: [...CHAIN_DEFAULT_ORDER], hidden: [...CHAIN_DEFAULT_HIDDEN] };
  saveChainColsState();
  renderChainColsMenu();
  renderChain();
}

function renderChainHead(callCols) {
  const thead = document.getElementById('chain-head');
  if (!thead) return;
  const puts = [...callCols].reverse();
  const th = (label, align, color, fullTitle) => `<th title="${fullTitle || label}" style="${align ? `text-align:${align};` : ''}${color ? `color:${color};` : ''}">${label}</th>`;
  thead.innerHTML = `<tr>${
    callCols.map(id => {
      const def = getChainColDef(id);
      return th(def?.title || id, def?.callAlign || 'center', def?.callHeaderColor || '', def?.fullTitle || def?.title || id);
    }).join('')
  }<th title="Strike" class="strike-col" style="border-left:1px solid var(--border);border-right:1px solid var(--border);text-align:center">STRIKE</th>${
    puts.map(id => {
      const def = getChainColDef(id);
      return th(def?.putTitle || def?.title || id, def?.putAlign || 'center', def?.putHeaderColor || '', def?.fullTitle || def?.putTitle || def?.title || id);
    }).join('')
  }</tr>`;
}

function buildChainCallCells(row, cG, ivC, volC, callLabel, callLabelColor, bgCall) {
  const bg = bgCall ? `background:${bgCall};` : '';
  const callIntrinsic = Math.max(ST.spot - row.strike, 0);
  const callExtrinsic = Math.max((row.callMid || 0) - callIntrinsic, 0);
  const callMoneyness = row.strike > 0 ? ((ST.spot / row.strike) - 1) * 100 : null;
  const callSpread = row.callAsk > 0 && row.callBid > 0 ? Math.max(row.callAsk - row.callBid, 0) : null;
  const callSpreadPct = callSpread != null && row.callMid > 0 ? (callSpread / row.callMid) * 100 : null;
  return {
    label: `<td style="${bg}font-size:10px;font-weight:500;color:${callLabelColor}">${callLabel}</td>`,
    ticker: `<td style="${bg}" title="${row.callTicker || '--'}">${row.callTicker || '--'}</td>`,
    delta: `<td style="${bg}color:${cG.delta > 0.5 ? 'var(--green)' : 'var(--text)'}">${cG.delta.toFixed(3)}</td>`,
    vega: `<td style="${bg}color:var(--muted)">${cG.vega.toFixed(3)}</td>`,
    theta: `<td style="${bg}" class="neg">${cG.theta.toFixed(3)}</td>`,
    spread: `<td style="${bg}">${fmtChainValue(callSpread, 'var(--text)')}</td>`,
    spreadPct: `<td style="${bg}">${fmtChainPct(callSpreadPct, 'var(--amber)')}</td>`,
    bid: `<td style="${bg}">${fmtN(row.callBid)}</td>`,
    ask: `<td style="${bg}color:var(--green)">${fmtN(row.callAsk)}</td>`,
    last: `<td style="${bg}color:var(--green);font-weight:500">${row.callMid > 0 ? fmtN(row.callMid) : '--'}</td>`,
    chg: `<td style="${bg}">${fmtChainChg(row.callChg)}</td>`,
    iv: `<td style="${bg}" class="amber">${ivC ? (volC * 100).toFixed(2) + '%' : '--'}</td>`,
    moneyness: `<td style="${bg}">${fmtChainPct(callMoneyness, 'var(--green)')}</td>`,
    intrinsic: `<td style="${bg}">${fmtChainValue(callIntrinsic, 'var(--text)')}</td>`,
    extrinsic: `<td style="${bg}">${fmtChainValue(callExtrinsic, 'var(--blue)')}</td>`,
  };
}

function buildChainPutCells(row, pG, ivP, volP, putLabel, putLabelColor, bgPut) {
  const bg = bgPut ? `background:${bgPut};` : '';
  const putIntrinsic = Math.max(row.strike - ST.spot, 0);
  const putExtrinsic = Math.max((row.putMid || 0) - putIntrinsic, 0);
  const putMoneyness = ST.spot > 0 ? ((row.strike / ST.spot) - 1) * 100 : null;
  const putSpread = row.putAsk > 0 && row.putBid > 0 ? Math.max(row.putAsk - row.putBid, 0) : null;
  const putSpreadPct = putSpread != null && row.putMid > 0 ? (putSpread / row.putMid) * 100 : null;
  return {
    label: `<td style="${bg}font-size:10px;font-weight:500;color:${putLabelColor}">${putLabel}</td>`,
    ticker: `<td style="${bg}" title="${row.putTicker || '--'}">${row.putTicker || '--'}</td>`,
    delta: `<td style="${bg}color:${pG.delta < -0.5 ? 'var(--red)' : 'var(--text)'}">${pG.delta.toFixed(3)}</td>`,
    vega: `<td style="${bg}color:var(--muted)">${pG.vega.toFixed(3)}</td>`,
    theta: `<td style="${bg}" class="neg">${pG.theta.toFixed(3)}</td>`,
    spread: `<td style="${bg}">${fmtChainValue(putSpread, 'var(--text)')}</td>`,
    spreadPct: `<td style="${bg}">${fmtChainPct(putSpreadPct, 'var(--amber)')}</td>`,
    bid: `<td style="${bg}">${fmtN(row.putBid)}</td>`,
    ask: `<td style="${bg}color:var(--red)">${fmtN(row.putAsk)}</td>`,
    last: `<td style="${bg}color:var(--red);font-weight:500">${row.putMid > 0 ? fmtN(row.putMid) : '--'}</td>`,
    chg: `<td style="${bg}">${fmtChainChg(row.putChg)}</td>`,
    iv: `<td style="${bg}" class="amber">${ivP ? (volP * 100).toFixed(2) + '%' : '--'}</td>`,
    moneyness: `<td style="${bg}">${fmtChainPct(putMoneyness, 'var(--red)')}</td>`,
    intrinsic: `<td style="${bg}">${fmtChainValue(putIntrinsic, 'var(--text)')}</td>`,
    extrinsic: `<td style="${bg}">${fmtChainValue(putExtrinsic, 'var(--blue)')}</td>`,
  };
}

function fmtChainChg(v) {
  if (v == null || isNaN(v)) return '--';
  const color = v > 0 ? 'var(--green)' : v < 0 ? 'var(--red)' : 'var(--muted)';
  return `<span style="color:${color}">${v > 0 ? '+' : ''}${fmtN(v)}</span>`;
}

function fmtChainPct(v, posColor) {
  if (v == null || !isFinite(v)) return '--';
  const color = v > 0 ? posColor : v < 0 ? 'var(--muted)' : 'var(--text)';
  return `<span style="color:${color}">${v > 0 ? '+' : ''}${v.toFixed(1)}%</span>`;
}

function fmtChainValue(v, color) {
  if (v == null || !isFinite(v)) return '--';
  return `<span style="color:${color || 'var(--text)'}">${fmtN(v)}</span>`;
}

function renderChain(){
  initChainColsMenu();
  const exp=document.getElementById('expiry-sel').value||ST.selExpiry;
  const filter=document.getElementById('chain-filter').value;
  if(!exp||!ST.chain[exp])return;
  ST.selExpiry=exp;

  const callCols = getChainCallColumns();
  renderChainHead(callCols);

  const expT=(new Date(exp+'T12:00:00')-new Date())/(365*24*3600*1000);
  const expDays=Math.max(1,Math.round(expT*365));
  const daysEl=document.getElementById('bs-days');
  if(daysEl&&!daysEl._userEdited)daysEl.value=expDays;

  const daysOverride=daysEl?._userEdited?parseFloat(daysEl.value):NaN;
  const hasOverride=!isNaN(daysOverride)&&daysOverride>0;

  const S=ST.spot, r=ST.rate, q=ST.q;
  let rows=[...ST.chain[exp]];
  if(filter==='near') rows=rows.filter(row=>Math.abs(row.strike-S)/S<0.25);
  else if(filter==='itm-call') rows=rows.filter(row=>row.strike<S);
  else if(filter==='itm-put') rows=rows.filter(row=>row.strike>S);

  const sortedStrikes=rows.map(row=>row.strike).sort((a,b)=>a-b);
  let lowATM;
  let highATM;
  for(const strike of sortedStrikes){
    if(strike<=S)lowATM=strike;
    else{highATM=strike;break;}
  }
  const atmStrikes=new Set([lowATM,highATM].filter(s=>s!==undefined));

  const tb=document.getElementById('chain-body');
  const frag=document.createDocumentFragment();
  rows.forEach(row=>{
    const T=hasOverride?daysOverride/365:row.T;
    const midC=row.callMid>0?row.callMid:0;
    const midP=row.putMid>0?row.putMid:0;
    const ivC=midC>0?(impliedVol(S,row.strike,T,r,q,midC,'call')||null):null;
    const ivP=midP>0?(impliedVol(S,row.strike,T,r,q,midP,'put')||null):null;
    const vol=row.iv||0;
    const volC=ivC||vol;
    const volP=ivP||vol;

    const cG=bs(S,row.strike,T,r,q,volC,'call');
    const pG=bs(S,row.strike,T,r,q,volP,'put');

    const isAtm=atmStrikes.has(row.strike);
    const itmC=!isAtm&&row.strike<S;
    const itmP=!isAtm&&row.strike>S;
    const callLabel=isAtm?'ATM':itmC?'ITM':'OTM';
    const putLabel=isAtm?'ATM':itmP?'ITM':'OTM';
    const callLabelColor=isAtm?'var(--amber)':itmC?'var(--green)':'var(--muted)';
    const putLabelColor=isAtm?'var(--amber)':itmP?'var(--red)':'var(--muted)';
    const bgCall=isAtm?'rgba(232,184,75,0.15)':itmC?'var(--itm-call)':'';
    const bgPut=isAtm?'rgba(232,184,75,0.15)':itmP?'rgba(240,90,90,0.10)':'';

    const callCells = buildChainCallCells(row, cG, ivC, volC, callLabel, callLabelColor, bgCall);
    const putCells = buildChainPutCells(row, pG, ivP, volP, putLabel, putLabelColor, bgPut);

    const tr=document.createElement('tr');
    tr.innerHTML = [
      ...callCols.map(id => callCells[id]),
      `<td class="strike-col${isAtm ? ' strike-atm' : ''}">${fmtStrike(row.strike)}</td>`,
      ...[...callCols].reverse().map(id => putCells[id]),
    ].join('');

    tr.addEventListener('click',e=>{
      const cell = e.target.closest('td');
      const ci = cell ? cell.cellIndex : -1;
      const callCount = callCols.length;
      if(ci < 0) return;
      if(ci < callCount){
        selectOpt(row,'call',cG,volC);
        tr.classList.add('selected');
      }else if(ci > callCount){
        selectOpt(row,'put',pG,volP);
        tr.classList.add('selected');
      }
    });
    frag.appendChild(tr);
  });
  tb.replaceChildren(frag);
}

function selectOpt(row,type,g,vol){
  document.querySelectorAll('.chain-table tr.selected').forEach(r=>r.classList.remove('selected'));
  const price=type==='call'?row.callMid:row.putMid;
  document.getElementById('sel-name').textContent =
    `${type.toUpperCase()} - Strike $${fmtStrike(row.strike)} - ${fmtExpiry(row.expiry)}`;
  const typEl=document.getElementById('sel-type');
  typEl.textContent=type.toUpperCase();
  typEl.style.color=type==='call'?'var(--green)':'var(--red)';
  document.getElementById('g-price').textContent='$'+price.toFixed(2);
  const dEl=document.getElementById('g-delta');
  dEl.textContent=g.delta.toFixed(4);
  dEl.style.color=g.delta>0?'var(--green)':'var(--red)';
  document.getElementById('g-gamma').textContent=g.gamma.toFixed(5);
  document.getElementById('g-theta').textContent=g.theta.toFixed(2);
  document.getElementById('g-vega').textContent=g.vega.toFixed(4);
  document.getElementById('g-iv').textContent=(vol*100).toFixed(2)+'%';
  showToast(`${type.toUpperCase()} Strike ${fmtStrike(row.strike)} - IV ${(vol*100).toFixed(1)}%`);
}
