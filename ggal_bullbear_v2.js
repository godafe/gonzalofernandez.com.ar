/* ===== MODULO BULL/BEAR V2 (WIP) ===== */

// This module is a compact, chain-like view with expandable rows.
// Each strike row can expand to show 3 candidate spreads above (calls) and below (puts),
// reusing the same core metrics as the Bull/Bear cards.

const BB2 = {
  // key(strike)-> { call: boolean, put: boolean }
  open: new Map(),
  bound: false,
};

function bb2PctColor(p){
  if(p==null || !isFinite(p)) return 'rgba(255,255,255,.16)';
  // Same thresholds as the detail table.
  return p < 33 ? 'var(--green)' : p < 60 ? 'var(--amber)' : 'var(--red)';
}

function bb2Dots(cands, titlePrefix, baseStrike, type, expiry){
  const dots = [0,1,2,3].map(i=>{
    const c = (cands && cands[i]) ? cands[i] : null;
    const p = c && isFinite(c.pctLleno) ? c.pctLleno : null;
    const k2 = c && isFinite(c.k2) ? c.k2 : null;
    const col=bb2PctColor(p);
    const op=(p==null || !isFinite(p)) ? 0.35 : 0.95;
    // Tooltip format: "Strike2: Costo, % Lleno"
    const ttl=(k2==null)
      ? `Strike: --, Costo: --, %Lleno: --`
      : `Strike: ${fmtStrike(k2)}, Costo: ${fmtN(c.netDebit,2)}, %Lleno: ${fmtN(p,2)}%`;
    const jumpAttrs = (k2!=null)
      ? `data-bb2-jump="1" data-bb2-exp="${expiry}" data-bb2-type="${type}" data-bb2-k1="${baseStrike}" data-bb2-k2="${k2}"`
      : '';
    const cursor = (k2!=null) ? 'cursor:pointer' : 'cursor:default';
    return `<span title="${ttl}" ${jumpAttrs} style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${col};opacity:${op};box-shadow:inset 0 0 0 1px rgba(255,255,255,.10);${cursor}"></span>`;
  }).join('');
  return `<div style="display:flex;justify-content:center;gap:6px">${dots}</div>`;
}

function bb2PopulateExpiry(){
  populateExpirySelect('bb2-expiry');
}

function bb2KeyStrike(k){
  const n=parseFloat(k);
  return isFinite(n)?Math.round(n*100)/100:n;
}

function bb2BindEvents(){
  if(BB2.bound) return;
  BB2.bound=true;
  const body=document.getElementById('bb2-body');
  if(!body) return;
  body.addEventListener('click', e=>{
    const jumpBase=e.target.closest('[data-bb2-jump-base]');
    if(jumpBase){
      const k1=parseFloat(jumpBase.dataset.bb2K1);
      const exp=jumpBase.dataset.bb2Exp || '';
      const type=(document.getElementById('bb-type')?.value || 'call');
      if(isFinite(k1)){
        window.bbOpenCardsForStrike?.(k1, type, exp, null);
      }
      return;
    }
    const jump=e.target.closest('[data-bb2-jump]');
    if(jump){
      const k1=parseFloat(jump.dataset.bb2K1);
      const k2=parseFloat(jump.dataset.bb2K2);
      const type=jump.dataset.bb2Type || 'call';
      const exp=jump.dataset.bb2Exp || '';
      if(isFinite(k1) && isFinite(k2)){
        window.bbOpenCardsForStrike?.(k1, type, exp, k2);
      }
      return;
    }
    const btn=e.target.closest('[data-bb2-toggle]');
    if(!btn) return;
    const k=bb2KeyStrike(btn.dataset.bb2K);
    if(!isFinite(k)) return;
    const side=btn.dataset.bb2Toggle;
    const cur=BB2.open.get(k) || { call:false, put:false };
    if(side==='call') cur.call=!cur.call;
    else if(side==='put') cur.put=!cur.put;
    BB2.open.set(k, cur);
    if(!cur.call && !cur.put) BB2.open.delete(k);
    bb2Render();
  });
}

function bb2FmtIv(iv){
  return iv && isFinite(iv) ? (iv*100).toFixed(2)+'%' : '--';
}

function bb2ComputeIv(S,K,T,r,q,price,type){
  if(!(price>0) || !(T>0)) return null;
  return impliedVol(S,K,T,r,q,price,type) || null;
}

function bb2SpreadMetrics(baseStrike, basePrice, k2, p2, lotes){
  const difStrike=Math.abs(k2-baseStrike);
  const netDebit=basePrice-p2;
  const costPerLote=netDebit*100;
  const costTotal=costPerLote*lotes;
  const pctLleno=difStrike>0?(netDebit/difStrike)*100:0;
  const ratio=p2>0?basePrice/p2:null;
  return { k2, p2, difStrike, netDebit, costPerLote, costTotal, pctLleno, ratio };
}

function bb2BuildSpreadsTable(title, color, rows, lotes, baseStrike, basePrice, type, expiry, spot){
  if(!rows.length){
    return `<div style="padding:10px 12px;color:var(--muted)">Sin spreads disponibles</div>`;
  }

  const th='padding:6px 8px;border-bottom:1px solid var(--border2);font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);text-align:center;white-space:nowrap';
  const td='padding:6px 8px;border-bottom:1px solid var(--border2);text-align:center;white-space:nowrap';

  const pctColor=p=>p<33?'var(--green)':p<60?'var(--amber)':'var(--red)';
  const fmtSignedPct=v=>{
    if(v==null||!isFinite(v))return'--';
    return `${v>=0?'+':''}${fmtN(v,2)}%`;
  };

  return `
    <div style="border:1px solid var(--border2);border-radius:8px;overflow:hidden;background:rgba(255,255,255,.02)">
      <div style="padding:8px 10px;border-bottom:1px solid var(--border2);display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:${color};font-weight:600">${title}</div>
        <div style="font-size:10px;color:var(--dim)">Lotes: <span style="color:var(--text);font-family:var(--mono)">${lotes}</span></div>
      </div>
      <div style="overflow:auto">
        <table style="width:100%;border-collapse:collapse;font-family:var(--mono);font-size:11px">
          <thead style="background:var(--surface2)">
            <tr>
              <th style="${th};color:${color}">Strike 2</th>
              <th style="${th}">% Lleno</th>
              <th style="${th}">Costo</th>
              <th style="${th}">Costo/Lote</th>
              <th style="${th}">Costo Total</th>
              <th style="${th}">Dif Strike</th>
              <th style="${th}">Breakeven</th>
              <th style="${th}">Dist. BE %</th>
              <th style="${th}">Risk/Reward</th>
              <th style="${th}">Ratio</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r=>{
              const breakeven = type==='call' ? (baseStrike + r.netDebit) : (baseStrike - r.netDebit);
              const bePct = (spot && isFinite(spot) && spot>0) ? ((breakeven-spot)/spot)*100 : null;
              const rr = r.netDebit>0 ? ((r.difStrike - r.netDebit) / r.netDebit) : null;
              const rrTxt = rr==null||!isFinite(rr) ? '--' : `${fmtN(rr,2)}x`;
              // Dist. BE%: positive = green, negative = red (per user request)
              const beColor = bePct==null ? 'var(--muted)' : (bePct>=0 ? 'var(--green)' : 'var(--red)');
              return `
              <tr>
                <td style="${td};color:${color};font-weight:600">
                  <span data-bb2-jump="1" data-bb2-exp="${expiry}" data-bb2-type="${type}" data-bb2-k1="${baseStrike}" data-bb2-k2="${r.k2}"
                    style="cursor:pointer;text-decoration:underline dotted rgba(255,255,255,.25);text-underline-offset:2px">
                    ${fmtStrike(r.k2)}
                  </span>
                </td>
                <td style="${td};color:${pctColor(r.pctLleno)}">${fmtN(r.pctLleno,2)}%</td>
                <td style="${td}">${fmtN(r.netDebit,2)}</td>
                <td style="${td}">${fmtN(r.costPerLote,2)}</td>
                <td style="${td}">${fmtN(r.costTotal,2)}</td>
                 <td style="${td}">${fmtN(r.difStrike,0)}</td>
                 <td style="${td}">${fmtStrike(breakeven)}</td>
                 <td style="${td};color:${beColor}">${fmtSignedPct(bePct)}</td>
                 <td style="${td}">${rrTxt}</td>
                 <td style="${td}">${r.ratio!=null?fmtN(r.ratio,2):'--'}</td>
               </tr>
             `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function bb2Render(){
  bb2BindEvents();
  const body=document.getElementById('bb2-body');
  const expEl=document.getElementById('bb2-expiry');
  if(!body || !expEl) return;

  const expiry=expEl.value || ST.selExpiry || ST.expirations[0];
  if(!expiry || !ST.chain[expiry]){ body.innerHTML=''; return; }
  ST.selExpiry=expiry;

  const filter=document.getElementById('bb2-filter')?.value || 'near25';
  // Shared parameter (with Bull/Bear cards view)
  const lotes=Math.max(1, parseInt(document.getElementById('bb-lotes')?.value || '1',10) || 1);

  const S=ST.spot;
  const r=ST.rate;
  const q=ST.q;
  const T=(new Date(expiry+'T12:00:00')-new Date())/(365*24*3600*1000);

  const fullChain=[...ST.chain[expiry]].slice().sort((a,b)=>a.strike-b.strike);
  let rows=[...fullChain];
  if(filter==='near25') rows=rows.filter(row=>Math.abs(row.strike-S)/S<=0.25);

  // Compute the two closest ATM strikes (below/above spot) using the full chain for this expiry.
  const allStrikes=fullChain.map(rw=>rw.strike);
  let lowATM, highATM;
  for(const k of allStrikes){
    if(k<=S) lowATM=k;
    else { highATM=k; break; }
  }
  const atmSet=new Set([lowATM, highATM].filter(v=>v!==undefined));

  // IMPORTANT: end with ';' so concatenated properties (borders) parse correctly.
  const tdBase='padding:6px 8px;border-bottom:1px solid var(--border2);text-align:center;white-space:nowrap;';
  const strikeTd=tdBase+'border-left:1px solid var(--border);border-right:1px solid var(--border);font-weight:600;color:var(--amber);';
  const callSepTd=tdBase+'border-right:1px solid var(--border);';

  body.innerHTML = rows.map(row=>{
    const K=row.strike;
    const key=bb2KeyStrike(K);
    const st=BB2.open.get(key) || { call:false, put:false };
    const isOpenCall=!!st.call;
    const isOpenPut=!!st.put;
    const isAtm=atmSet.has(K);
    const atmBg=isAtm?'background:var(--atm-row);':'';

    const cLast=row.callMid>0?row.callMid:null;
    const pLast=row.putMid>0?row.putMid:null;
    // 3 candidate spreads for the dot indicators are computed against the full chain,
    // so they remain stable even when the table is filtered.
    const above4 = fullChain.filter(r2=>r2.strike>K && r2.callMid>0).slice(0,4);
    const below4 = fullChain.filter(r2=>r2.strike<K && r2.putMid>0).slice(-4).reverse();

    const callCands = (cLast!=null)
      ? above4.map(r2=>bb2SpreadMetrics(K, cLast, r2.strike, r2.callMid, lotes)).filter(s=>s.netDebit>0).slice(0,4)
      : [];
    const putCands = (pLast!=null)
      ? below4.map(r2=>bb2SpreadMetrics(K, pLast, r2.strike, r2.putMid, lotes)).filter(s=>s.netDebit>0).slice(0,4)
      : [];

    const plusStyle='padding:2px 0;width:26px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);cursor:pointer;font-size:12px;line-height:18px';
    const callHtml = cLast!=null?`<span style="color:var(--green);font-weight:600">${fmtN(cLast,2)}</span>`:'--';
    const putHtml  = pLast!=null?`<span style="color:var(--red);font-weight:600">${fmtN(pLast,2)}</span>`:'--';

    const baseRow = `
      <tr>
        <td style="${tdBase};width:34px;${atmBg}">
          <button type="button" data-bb2-toggle="call" data-bb2-k="${key}" title="${isOpenCall?'Cerrar Calls':'Abrir Calls'}" style="${plusStyle}">${isOpenCall?'-':'+'}</button>
        </td>
        <td style="${tdBase};${atmBg}">${callHtml}</td>
        <td style="${callSepTd};${atmBg}">${bb2Dots(callCands, 'Calls', K, 'call', expiry)}</td>
        <td style="${strikeTd};${atmBg}">
          <span data-bb2-jump-base="1" data-bb2-exp="${expiry}" data-bb2-k1="${K}"
            title="Ver tarjetas para ${fmtStrike(K)}"
            style="cursor:pointer;text-decoration:underline dotted rgba(255,255,255,.25);text-underline-offset:2px">
            ${fmtStrike(K)}
          </span>
        </td>
        <td style="${tdBase};${atmBg}">${bb2Dots(putCands, 'Puts', K, 'put', expiry)}</td>
        <td style="${tdBase};${atmBg}">${putHtml}</td>
        <td style="${tdBase};width:34px;${atmBg}">
          <button type="button" data-bb2-toggle="put" data-bb2-k="${key}" title="${isOpenPut?'Cerrar Puts':'Abrir Puts'}" style="${plusStyle}">${isOpenPut?'-':'+'}</button>
        </td>
      </tr>`;

    if(!isOpenCall && !isOpenPut) return baseRow;

    // Build 4 next strikes for call spreads (above) and put spreads (below)
    const above = isOpenCall ? fullChain.filter(r2=>r2.strike>K && r2.callMid>0).slice(0,4) : [];
    const below = isOpenPut ? fullChain.filter(r2=>r2.strike<K && r2.putMid>0).slice(-4).reverse() : [];

    const callSpreads = (isOpenCall && cLast!=null ? above.map(r2=>bb2SpreadMetrics(K, cLast, r2.strike, r2.callMid, lotes)).filter(s=>s.netDebit>0) : []);
    const putSpreads  = (isOpenPut && pLast!=null ? below.map(r2=>bb2SpreadMetrics(K, pLast, r2.strike, r2.putMid, lotes)).filter(s=>s.netDebit>0) : []);

    const panels = [];
    if(isOpenCall) panels.push(bb2BuildSpreadsTable('Bull Call Spread (+1/+2/+3/+4)', 'var(--green)', callSpreads, lotes, K, cLast, 'call', expiry, S));
    if(isOpenPut) panels.push(bb2BuildSpreadsTable('Bear Put Spread (-1/-2/-3/-4)', 'var(--red)', putSpreads, lotes, K, pLast, 'put', expiry, S));

    const details = `
      <tr>
        <td colspan="7" style="padding:10px 12px;border-bottom:1px solid var(--border2);background:rgba(0,0,0,.12)">
          <div style="display:grid;grid-template-columns:repeat(${panels.length},minmax(0,1fr));gap:10px">
            ${panels.join('')}
          </div>
        </td>
      </tr>`;

    return baseRow + details;
  }).join('');
}
