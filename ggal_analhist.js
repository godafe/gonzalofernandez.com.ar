/* ===== MÓDULO ANÁLISIS HISTÓRICO ===== */
const AH={charts:{vega:null,bull:null,rc:null,ri:null}};

// All three helpers are one-liners now, delegating to shared utilities in ggal_core.js
function ahToggleType(n){ toggleOptionType('ah-type'+n,'ah-type'+n+'-btn',renderAnalHist); }
function ahSwapStrikes(){ swapStrikeSelectors('ah-strike1','ah-strike2','ah-type1','ah-type2',renderAnalHist); }

function ahPopulateStrikes(){
  if(!HIST.cols?.length)return;
  const strikes=[...new Set(HIST.cols.map(c=>c.strike))].sort((a,b)=>a-b);
  populateStrikeDropdowns('ah-strike1','ah-strike2',strikes);
  const expiryEl=document.getElementById('ah-expiry');
  if(expiryEl&&!expiryEl.value&&ST.selExpiry)expiryEl.value=ST.selExpiry;
}

function ahCalcGreeks(price,K,type,spot,T,r,q){
  if(!price||price<=0||T<=0)return null;
  const iv=impliedVol(spot,K,T,r,q,price,type)||null;
  if(!iv)return null;
  const g=bs(spot,K,T,r,q,iv,type);
  return{iv, vega:g.vega, gamma:g.gamma, delta:g.delta};
}

function renderAnalHist(){
  ahPopulateStrikes();
  syncDateFromPicker('ah-date-from','ah-date-range');
  const K1=parseFloat(document.getElementById('ah-strike1')?.value)||0;
  const K2=parseFloat(document.getElementById('ah-strike2')?.value)||0;
  const type1=document.getElementById('ah-type1')?.value||'call';
  const type2=document.getElementById('ah-type2')?.value||'call';
  const r=parseFloat(document.getElementById('ah-rate')?.value||'0')/100;
  const ri=Math.max(0.1,Math.min(4,parseFloat(document.getElementById('ah-ri')?.value)||2.0));
  const expiryStr=document.getElementById('ah-expiry')?.value||ST.selExpiry||'';
  const expiryMs=expiryStr?new Date(expiryStr+'T12:00:00').getTime():null;
  const q=ST.q;
  const c1col=type1==='call'?'var(--green)':'var(--red)';
  const c2col=type2==='call'?'var(--green)':'var(--red)';

  // Update price column headers
  [['ah-th1-price',K1,c1col],['ah-th2-price',K2,c2col]].forEach(([id,K,col])=>{
    const el=document.getElementById(id);
    if(el){el.textContent=fmtStrike(K); el.style.color=col;}
  });

  if(!HIST.rows.length){
    document.getElementById('ah-body1').innerHTML=
      `<tr><td colspan="7" style="padding:16px;text-align:center;color:var(--muted)">Sin datos — presioná ⟳ Actualizar HMD</td></tr>`;
    document.getElementById('ah-body2').innerHTML='';
    return;
  }

  // Apply "Fecha desde" filter — clamped to available range
  const dateFromStr=document.getElementById('ah-date-from')?.value.trim()||'';
  const allDates=HIST.rows.map(r=>r.date).filter(Boolean).sort();
  const minDate=allDates[0]||'', maxDate=allDates[allDates.length-1]||'';
  const effectiveFrom=dateFromStr&&dateFromStr>maxDate?maxDate
    :dateFromStr&&dateFromStr<minDate?minDate
    :dateFromStr;
  const source=effectiveFrom
    ? HIST.rows.filter(r=>r.date>=effectiveFrom)
    : HIST.rows;

  if(!source.length){
    document.getElementById('ah-body1').innerHTML=
      `<tr><td colspan="7" style="padding:16px;text-align:center;color:var(--muted)">Sin datos para el rango de fechas seleccionado</td></tr>`;
    document.getElementById('ah-body2').innerHTML='';
    return;
  }

  // Build rows with greeks and strategy metrics
  const rows=source.map(row=>{
    const spot=row.spot||ST.spot;
    const e1=row.prices[`${type1}_${K1}`]||null;
    const e2=row.prices[`${type2}_${K2}`]||null;
    const p1=e1?.price??null, p2=e2?.price??null;
    const k1=e1?.strike||K1, k2=e2?.strike||K2;
    let T=0;
    if(expiryMs){
      const days=Math.max(0,(expiryMs-new Date(row.date+'T12:00:00').getTime())/86400000);
      T=days/365;
    }
    const g1=p1!=null?ahCalcGreeks(p1,k1,type1,spot,T,r,q):null;
    const g2=p2!=null?ahCalcGreeks(p2,k2,type2,spot,T,r,q):null;
    return{
      date:row.date, spot, p1, p2, g1, g2,
      bull:(p1!=null&&p2!=null)?p1-p2:null,
      rc:(p1!=null&&p2!=null&&p2>0)?p1/p2:null,
      riCost:(p1!=null&&p2!=null)?(p1*100)+(p2*-ri*100):null,
      vegaRatio:(g1?.vega>0&&g2?.vega>0)?g1.vega/g2.vega:null,
    };
  });

  // Render a greeks table using innerHTML (avoids per-row DOM creation)
  const renderTable=(tbodyId,col,getP,getG)=>{
    const tb=document.getElementById(tbodyId);
    if(!tb)return;
    tb.innerHTML=rows.map(row=>{
      const p=getP(row), g=getG(row);
      const dCol=g?.delta!=null?(Math.abs(g.delta)>0.5?col:'var(--text)'):'var(--muted)';
      return`<tr style="border-bottom:1px solid var(--border2)">
        <td style="padding:4px 7px;color:var(--muted);white-space:nowrap;text-align:center">${row.date||'--'}</td>
        <td style="padding:4px 7px;color:var(--muted);text-align:center">${row.spot!=null?fmtN(row.spot,0):'--'}</td>
        <td style="padding:4px 7px;color:${col};text-align:center">${p!=null?fmtN(p):'--'}</td>
        <td style="padding:4px 7px;color:var(--amber);text-align:center">${g?.iv!=null?(g.iv*100).toFixed(2)+'%':'--'}</td>
        <td style="padding:4px 7px;text-align:center">${g?.vega!=null?g.vega.toFixed(3):'--'}</td>
        <td style="padding:4px 7px;text-align:center">${g?.gamma!=null?g.gamma.toFixed(4):'--'}</td>
        <td style="padding:4px 7px;text-align:center;color:${dCol}">${g?.delta!=null?g.delta.toFixed(3):'--'}</td>
      </tr>`;
    }).join('');
  };

  renderTable('ah-body1',c1col,r=>r.p1,r=>r.g1);
  renderTable('ah-body2',c2col,r=>r.p2,r=>r.g2);

  // Update bull/bear spread title
  const bullTitle=document.getElementById('ah-chart-bull-title');
  if(bullTitle){
    const bt=type1==='call'&&type2==='call'?'Bull Call Spread'
      :type1==='put'&&type2==='put'?'Bear Put Spread':'Bull/Bear';
    bullTitle.textContent=`Costo ${bt} (S1−S2)`;
  }

  // Charts using shared factory
  const labels=rows.map(r=>r.date||'');
  const fP=v=>v!=null?fmtN(v):'--';
  const fR=v=>v!=null?v.toFixed(3):'--';
  createLineChart(AH.charts,'vega','ah-chart-vega',labels,rows.map(r=>r.vegaRatio),'#5aabff','Ratio Vega',fR);
  createLineChart(AH.charts,'bull','ah-chart-bull',labels,rows.map(r=>r.bull),'#44c76a','Costo Bull',fP);
  createLineChart(AH.charts,'rc','ah-chart-rc',labels,rows.map(r=>r.rc),'#e8b84b','RC',fR);
  createLineChart(AH.charts,'ri','ah-chart-ri',labels,rows.map(r=>r.riCost),'#b088f0','Costo RI',fP);

  // Update status with filtered count
  const ahStatusEl=document.getElementById('ah-status');
  if(ahStatusEl&&HIST.rows.length){
    const total=HIST.rows.length, shown=source.length;
    ahStatusEl.textContent=shown<total
      ? `Mostrando ${shown} de ${total} registros · desde ${effectiveFrom}`
      : `${total} registros`;
  }
}

async function fetchAnalHist(){
  const webAppUrl=document.getElementById('sh-webapp-url')?.value.trim();
  const sheet=document.getElementById('sh-sheetname-hist')?.value.trim()||'HMD';
  const statusEl=document.getElementById('ah-status');
  if(!webAppUrl){if(statusEl)statusEl.textContent='Sin URL configurada';return;}
  if(statusEl)statusEl.textContent='Cargando…';
  try{
    const res=await fetch(`${webAppUrl}?sheet=${encodeURIComponent(sheet)}`);
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const data=await res.json();
    if(data.error)throw new Error(data.error);
    const rows=data.values||data;
    if(!Array.isArray(rows)||rows.length<2)throw new Error('Sin datos');
    parseHistRows(rows);
    ahPopulateStrikes();
    renderAnalHist();
    if(statusEl)statusEl.textContent=`${HIST.rows.length} registros · ${new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}`;
    showToast(`HMD cargado — ${HIST.rows.length} filas`);
  }catch(e){
    if(statusEl)statusEl.textContent='Error: '+e.message;
    showToast('Error HMD: '+e.message);
  }
}
