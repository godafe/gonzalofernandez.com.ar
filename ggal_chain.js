/* ===== CHAIN RENDER ===== */
function renderChain(){
  const exp=document.getElementById('expiry-sel').value||ST.selExpiry;
  const filter=document.getElementById('chain-filter').value;
  if(!exp||!ST.chain[exp])return;
  ST.selExpiry=exp;
  // Auto-update days in BS bar when expiry changes
  const T=(new Date(exp+'T12:00:00')-new Date())/(365*24*3600*1000);
  const days=Math.max(1,Math.round(T*365));
  const daysEl=document.getElementById('bs-days');
  if(daysEl&&!daysEl._userEdited)daysEl.value=days;
  const S=ST.spot,r=ST.rate,q=ST.q;
  let rows=[...ST.chain[exp]];
  if(filter==='near')rows=rows.filter(r=>Math.abs(r.strike-S)/S<0.25);
  else if(filter==='itm-call')rows=rows.filter(r=>r.strike<S);
  else if(filter==='itm-put')rows=rows.filter(r=>r.strike>S);
  // ATM: nearest strike BELOW spot and nearest strike ABOVE spot
  const sortedStrikes=rows.map(r=>r.strike).sort((a,b)=>a-b);
  const atmBelow=sortedStrikes.filter(s=>s<=S).slice(-1)[0];
  const atmAbove=sortedStrikes.filter(s=>s>S)[0];
  const atmStrikes=new Set([atmBelow,atmAbove].filter(s=>s!==undefined));

  const tb=document.getElementById('chain-body');
  tb.innerHTML='';
  rows.forEach(row=>{
    // T: use BS bar override if set, otherwise row's natural T
    const daysEl=document.getElementById('bs-days');
    const daysOverride=daysEl&&daysEl._userEdited?parseFloat(daysEl.value):NaN;
    const T=!isNaN(daysOverride)&&daysOverride>0 ? daysOverride/365 : row.T;

    // Recalculate IV live with current ST.rate / ST.spot / ST.q and market LAST price
    // Only use LAST (callMid/putMid) — no bid/ask fallback
    const midC=row.callMid>0?row.callMid:0;
    const midP=row.putMid>0?row.putMid:0;
    const ivC=midC>0 ? (impliedVol(S,row.strike,T,r,q,midC,'call')||null) : null;
    const ivP=midP>0 ? (impliedVol(S,row.strike,T,r,q,midP,'put')||null) : null;
    const vol=ivC||ivP||row.iv;
    const volC=ivC||vol;
    const volP=ivP||vol;

    const cG=bs(S,row.strike,T,r,q,volC,'call');
    const pG=bs(S,row.strike,T,r,q,volP,'put');

    const isAtmRow=atmStrikes.has(row.strike);
    const itmC=!isAtmRow&&row.strike<S;
    const itmP=!isAtmRow&&row.strike>S;

    // Label: ATM for the two nearest strikes, ITM/OTM for the rest
    const callLabel=isAtmRow?'ATM':itmC?'ITM':'OTM';
    const putLabel =isAtmRow?'ATM':itmP?'ITM':'OTM';
    const callLabelColor=isAtmRow?'var(--amber)':itmC?'var(--green)':'var(--muted)';
    const putLabelColor =isAtmRow?'var(--amber)':itmP?'var(--red)':'var(--muted)';

    // Per-side background colors
    const bgCall=isAtmRow?'rgba(232,184,75,0.15)':itmC?'var(--itm-call)':'';
    const bgPut =isAtmRow?'rgba(232,184,75,0.15)':itmP?'rgba(240,90,90,0.10)':'';
    const bgAttr=bg=>bg?`background:${bg};`:'';

    const fmtChg=v=>{
      if(v==null||isNaN(v))return'--';
      const color=v>0?'var(--green)':v<0?'var(--red)':'var(--muted)';
      return`<span style="color:${color}">${v>0?'+':''}${fmtN(v)}</span>`;
    };
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td style="${bgAttr(bgCall)}font-size:10px;font-weight:500;color:${callLabelColor}">${callLabel}</td>
      <td style="${bgAttr(bgCall)}color:${cG.delta>0.5?'var(--green)':'var(--text)'}">${cG.delta.toFixed(3)}</td>
      <td style="${bgAttr(bgCall)}color:var(--muted)">${cG.vega.toFixed(3)}</td>
      <td style="${bgAttr(bgCall)}" class="neg">${cG.theta.toFixed(3)}</td>
      <td style="${bgAttr(bgCall)}">${fmtN(row.callBid)}</td>
      <td style="${bgAttr(bgCall)}color:var(--green)">${fmtN(row.callAsk)}</td>
      <td style="${bgAttr(bgCall)}color:var(--green);font-weight:500">${row.callMid>0?fmtN(row.callMid):'--'}</td>
      <td style="${bgAttr(bgCall)}">${fmtChg(row.callChg)}</td>
      <td style="${bgAttr(bgCall)}" class="amber">${ivC?(volC*100).toFixed(2)+'%':'--'}</td>
      <td class="strike-col">${fmtStrike(row.strike)}</td>
      <td style="${bgAttr(bgPut)}" class="amber">${ivP?(volP*100).toFixed(2)+'%':'--'}</td>
      <td style="${bgAttr(bgPut)}">${fmtChg(row.putChg)}</td>
      <td style="${bgAttr(bgPut)}color:var(--red);font-weight:500">${row.putMid>0?fmtN(row.putMid):'--'}</td>
      <td style="${bgAttr(bgPut)}color:var(--red)">${fmtN(row.putAsk)}</td>
      <td style="${bgAttr(bgPut)}">${fmtN(row.putBid)}</td>
      <td style="${bgAttr(bgPut)}" class="neg">${pG.theta.toFixed(3)}</td>
      <td style="${bgAttr(bgPut)}color:var(--muted)">${pG.vega.toFixed(3)}</td>
      <td style="${bgAttr(bgPut)}color:${pG.delta<-0.5?'var(--red)':'var(--text)'}">${pG.delta.toFixed(3)}</td>
      <td style="${bgAttr(bgPut)}font-size:10px;font-weight:500;color:${putLabelColor};text-align:right">${putLabel}</td>`;
    tr.addEventListener('click',(e)=>{
      const cellIdx=e.target.cellIndex;
      if(cellIdx<=8) selectOpt(row,'call',cG,volC);
      else if(cellIdx>=10) selectOpt(row,'put',pG,volP);
    });
    tb.appendChild(tr);
  });
}

function selectOpt(row,type,g,vol){
  document.querySelectorAll('.chain-table tr.selected').forEach(r=>r.classList.remove('selected'));
  const price=type==='call'?row.callMid:row.putMid;
  document.getElementById('sel-name').textContent=`${type.toUpperCase()} — Strike $${fmtStrike(row.strike)} — ${fmtExpiry(row.expiry)}`;
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
  showToast(`${type.toUpperCase()} Strike ${fmtStrike(row.strike)} — IV ${(vol*100).toFixed(1)}%`);
}

