/* ===== DATOS HISTÓRICOS ===== */
const HIST={rows:[],charts:{rc:null,vi:null,st:null,varr:null,bb:null,ri:null}};

function parseHistRows(rows){
  if(!rows||rows.length<2)return;
  const headerRowIdx=(+document.getElementById('sh-header-row-hist')?.value||1)-1;
  const dataRows=rows.slice(headerRowIdx+1);
  const dateIdx  =colLetterToIndex(document.getElementById('hist-col-date')?.value||'A');
  const typeIdx  =colLetterToIndex(document.getElementById('hist-col-type')?.value||'C');
  const strikeIdx=colLetterToIndex(document.getElementById('hist-col-strike')?.value||'F');
  const lastIdx  =colLetterToIndex(document.getElementById('hist-col-last')?.value||'E');

  const dateMap={};
  const colMap=new Map();

  dataRows.forEach(r=>{
    if(!r?.length)return;
    const raw=(r[dateIdx]||'').toString().trim();
    const date=normalizeExpiry(raw)||raw;
    if(!date)return;
    const tipoRaw=(r[typeIdx]||'').toString().trim().toLowerCase();
    const strikeF=parseARSNum(r[strikeIdx]);
    const last=parseARSNum(r[lastIdx]);
    if(!dateMap[date])dateMap[date]={};
    if(tipoRaw==='suby'||tipoRaw==='subyacente'){
      dateMap[date].__suby__=isNaN(last)?null:last;
      return;
    }
    if(isNaN(strikeF)||strikeF<=0)return;
    const type=tipoRaw.includes('put')?'put':'call';
    const key=`${type}_${strikeF}`;
    if(!colMap.has(key))colMap.set(key,{key,type,strike:strikeF});
    dateMap[date][key]={price:isNaN(last)?null:last,strike:strikeF};
  });

  HIST.cols=[...colMap.values()].sort((a,b)=>a.type.localeCompare(b.type)||a.strike-b.strike);
  HIST.rows=Object.entries(dateMap)
    .sort((a,b)=>a[0].localeCompare(b[0]))
    .map(([date,priceMap])=>({date,prices:priceMap,spot:priceMap.__suby__||null}));

  histPopulateStrikes();
}

function histPopulateStrikes(){
  if(!HIST.cols?.length)return;
  const strikes=[...new Set(HIST.cols.map(c=>c.strike))].sort((a,b)=>a-b);
  populateStrikeDropdowns('hist-strike1','hist-strike2',strikes);
  const expiryEl=document.getElementById('hist-expiry');
  if(expiryEl&&!expiryEl.value&&ST.selExpiry)expiryEl.value=ST.selExpiry;
  const rEl=document.getElementById('hist-rate');
  if(rEl&&rEl.value==='')rEl.value='0';
}

// Delegate to shared helpers — each a one-liner
function histToggleType(n){ toggleOptionType('hist-type'+n,'hist-type'+n+'-btn',renderHistData); }
function histSwapStrikes(){ swapStrikeSelectors('hist-strike1','hist-strike2','hist-type1','hist-type2',renderHistData); }

function calcHistCalcs(p1,p2,T1,T2,r,q,K1,K2,spot,type1,type2){
  const iv1=(p1!=null&&p1>0&&T1>0)?impliedVol(spot,K1,T1,r,q,p1,type1)||null:null;
  const iv2=(p2!=null&&p2>0&&T2>0)?impliedVol(spot,K2,T2,r,q,p2,type2)||null:null;
  const viProm=(iv1&&iv2)?(iv1+iv2)/2:iv1||iv2||null;
  return{
    iv1, iv2, viProm,
    rc:(p1!=null&&p1>0&&p2!=null&&p2>0)?p1/p2:null,
    straddle:(p1!=null&&p2!=null)?p1+p2:null,
  };
}

function renderHistData(){
  syncDateFromPicker('hist-date-from','hist-date-range');
  const K1=parseFloat(document.getElementById('hist-strike1')?.value)||0;
  const K2=parseFloat(document.getElementById('hist-strike2')?.value)||0;
  const type1=document.getElementById('hist-type1')?.value||'call';
  const type2=document.getElementById('hist-type2')?.value||'call';
  const r=parseFloat(document.getElementById('hist-rate')?.value||'0')/100;
  const ri=Math.max(0.1,Math.min(4,parseFloat(document.getElementById('hist-ri')?.value)||1.0));
  const q=ST.q;
  const expiryStr=document.getElementById('hist-expiry')?.value||ST.selExpiry||'';
  const expiryMs=expiryStr?new Date(expiryStr+'T12:00:00').getTime():null;
  const c1col=type1==='call'?'var(--green)':'var(--red)';
  const c2col=type2==='call'?'var(--green)':'var(--red)';

  // Column header abbreviation: C65, P79, etc.
  const colAbbr=(type,K)=>{
    const digits=K>=10000?3:2;
    return `${type==='call'?'C':'P'}${Math.floor(K).toString().slice(0,digits)}`;
  };

  // Update table headers
  [['hist-th-s1',type1,K1,c1col,''],['hist-th-s2',type2,K2,c2col,''],
   ['hist-th-vi1',type1,K1,c1col,'VI '],['hist-th-vi2',type2,K2,c2col,'VI ']
  ].forEach(([id,t,K,col,prefix])=>{
    const el=document.getElementById(id);
    if(el){el.textContent=prefix+colAbbr(t,K); el.style.color=col;}
  });

  const bbLabel=type1==='call'&&type2==='call'?'Bull Call Spread'
    :type1==='put'&&type2==='put'?'Bear Put Spread':'Bull/Bear';
  const bbTh=document.getElementById('hist-th-bb');
  if(bbTh)bbTh.textContent=bbLabel;
  const bbChartTitle=document.getElementById('hist-chart-bb-title');
  if(bbChartTitle)bbChartTitle.textContent=bbLabel;

  if(!HIST.rows.length){
    document.getElementById('hist-body').innerHTML=
      `<tr><td colspan="16" style="padding:24px;text-align:center;color:var(--muted)">Sin datos — presioná ⟳ Actualizar HMD</td></tr>`;
    return;
  }

  // Apply "Fecha desde" filter — clamped to available range
  const dateFromStr=document.getElementById('hist-date-from')?.value.trim()||'';
  const allDates=HIST.rows.map(r=>r.date).filter(Boolean).sort();
  const minDate=allDates[0]||'', maxDate=allDates[allDates.length-1]||'';
  const effectiveFrom=dateFromStr&&dateFromStr>maxDate?maxDate
    :dateFromStr&&dateFromStr<minDate?minDate
    :dateFromStr;
  const source=effectiveFrom
    ? HIST.rows.filter(r=>r.date>=effectiveFrom)
    : HIST.rows;

  if(!source.length){
    document.getElementById('hist-body').innerHTML=
      `<tr><td colspan="16" style="padding:24px;text-align:center;color:var(--muted)">Sin datos para el rango de fechas seleccionado</td></tr>`;
    return;
  }

  // Build calculated rows
  const calc=source.map(row=>{
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
    const bb=(p1!=null&&p2!=null)?p1-p2:null;
    const riCost=(p1!=null&&p2!=null)?(-10*p1)+(p2*ri*10):null;
    return{date:row.date, p1, p2, spot,
      ...calcHistCalcs(p1,p2,T,T,r,q,k1,k2,spot,type1,type2),
      bb, riCost};
  });

  // Add % variation vs previous row
  const varOf=(prev,cur)=>(prev!=null&&cur!=null&&prev!==0)?(cur-prev)/Math.abs(prev):null;
  calc.forEach((row,i)=>{
    if(i===0){row.varVI=row.varRC=row.varST=row.varBB=row.varRI=null;return;}
    const prev=calc[i-1];
    row.varVI=varOf(prev.viProm,row.viProm);
    row.varRC=varOf(prev.rc,row.rc);
    row.varST=varOf(prev.straddle,row.straddle);
    row.varBB=varOf(prev.bb,row.bb);
    row.varRI=varOf(prev.riCost,row.riCost);
  });

  const pct=v=>v==null?'--':(v>=0?'+':'')+((v*100).toFixed(2))+'%';
  const varCol=v=>v==null?'var(--muted)':v>0?'var(--green)':'var(--red)';
  const priceCol=v=>v!=null?(v>=0?'var(--green)':'var(--red)'):'var(--muted)';

  document.getElementById('hist-body').innerHTML=calc.map(row=>`
    <tr style="border-bottom:1px solid var(--border2)">
      <td style="padding:4px 8px;text-align:center;color:var(--muted);white-space:nowrap">${row.date||'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:var(--muted)">${row.spot!=null?fmtN(row.spot,0):'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:${c1col}">${row.p1!=null?fmtN(row.p1):'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:${c2col}">${row.p2!=null?fmtN(row.p2):'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:${c1col}">${row.iv1!=null?(row.iv1*100).toFixed(2)+'%':'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:${c2col}">${row.iv2!=null?(row.iv2*100).toFixed(2)+'%':'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:var(--amber)">${row.viProm!=null?(row.viProm*100).toFixed(2)+'%':'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:${varCol(row.varVI)}">${pct(row.varVI)}</td>
      <td style="padding:4px 8px;text-align:center;color:var(--amber)">${row.rc!=null?row.rc.toFixed(2):'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:${varCol(row.varRC)}">${pct(row.varRC)}</td>
      <td style="padding:4px 8px;text-align:center;color:var(--amber)">${row.straddle!=null?fmtN(row.straddle):'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:${varCol(row.varST)}">${pct(row.varST)}</td>
      <td style="padding:4px 8px;text-align:center;color:${priceCol(row.bb)}">${row.bb!=null?fmtN(row.bb):'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:${varCol(row.varBB)}">${pct(row.varBB)}</td>
      <td style="padding:4px 8px;text-align:center;color:${priceCol(row.riCost)}">${row.riCost!=null?fmtN(row.riCost):'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:${varCol(row.varRI)}">${pct(row.varRI)}</td>
    </tr>`).join('');

  // Charts using shared factory
  const labels=calc.map(r=>r.date||'');
  const fP=v=>v!=null?fmtN(v):'--';
  createLineChart(HIST.charts,'rc','hist-chart-rc',labels,calc.map(r=>r.rc),'#e8b84b','RC',v=>v!=null?v.toFixed(2):'--',{dense:true});
  createLineChart(HIST.charts,'vi','hist-chart-vi',labels,calc.map(r=>r.viProm),'#5aabff','VI prom',v=>v!=null?(v*100).toFixed(1)+'%':'--',{dense:true});
  createLineChart(HIST.charts,'st','hist-chart-st',labels,calc.map(r=>r.straddle),'#44c76a','Straddle',fP,{dense:true});
  createLineChart(HIST.charts,'bb','hist-chart-bb',labels,calc.map(r=>r.bb),'#5aabff',bbLabel,fP,{dense:true});
  createLineChart(HIST.charts,'ri','hist-chart-ri',labels,calc.map(r=>r.riCost),'#b088f0','Costo RI',fP,{dense:true});

  // Variación chart — multi-series, not handled by shared factory
  if(HIST.charts.varr)HIST.charts.varr.destroy();
  const ctxV=document.getElementById('hist-chart-var')?.getContext('2d');
  if(!ctxV)return;
  const xTickCb=(v,i)=>{const d=labels[i];if(!d)return'';const p=d.split('-');return p.length>=3?p[2]+'-'+p[1]:d;};
  HIST.charts.varr=new Chart(ctxV,{
    type:'line',
    data:{labels, datasets:[
      {label:'Var VI%', data:calc.map(r=>r.varVI!=null?parseFloat((r.varVI*100).toFixed(3)):null), borderColor:'#b088f0',borderWidth:1.5,pointRadius:3,fill:false,spanGaps:true},
      {label:'Var RC%', data:calc.map(r=>r.varRC!=null?parseFloat((r.varRC*100).toFixed(3)):null), borderColor:'#f05a5a',borderWidth:1.5,pointRadius:3,fill:false,spanGaps:true},
      {label:'Var ST%', data:calc.map(r=>r.varST!=null?parseFloat((r.varST*100).toFixed(3)):null), borderColor:'#e8b84b',borderWidth:1.5,pointRadius:0,fill:false,spanGaps:true},
    ]},
    options:{
      responsive:true, maintainAspectRatio:false, animation:false,
      plugins:{
        legend:{display:true,labels:{color:'#7a8fa6',font:{size:9},boxWidth:8,padding:8}},
        tooltip:{backgroundColor:'#131920',borderColor:'#2a3444',borderWidth:1,titleColor:'#7a8fa6',bodyColor:'#d8e3ef'},
      },
      scales:{
        x:{ticks:{color:'#7a8fa6',font:{size:8},maxRotation:45,minRotation:45,autoSkip:false,callback:xTickCb},grid:{color:'#1a2230'}},
        y:{ticks:{color:'#7a8fa6',font:{size:9},callback:v=>v!=null?v.toFixed(2)+'%':'--'},grid:{color:'#1a2230'}},
      }
    }
  });

  // Update status with filtered count
  const statusEl=document.getElementById('hist-status');
  if(statusEl&&HIST.rows.length){
    const total=HIST.rows.length, shown=source.length;
    statusEl.textContent=shown<total
      ? `Mostrando ${shown} de ${total} registros · desde ${effectiveFrom}`
      : `${total} registros`;
  }
}

async function fetchHistData(){
  const webAppUrl=document.getElementById('sh-webapp-url')?.value.trim();
  const sheet=document.getElementById('sh-sheetname-hist')?.value.trim()||'HMD';
  const statusEl=document.getElementById('hist-status');
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
    renderHistData();
    if(statusEl)statusEl.textContent=`${HIST.rows.length} registros cargados · ${new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}`;
    showToast(`Datos históricos (HMD) cargados — ${HIST.rows.length} filas`);
  }catch(e){
    if(statusEl)statusEl.textContent='Error: '+e.message;
    showToast('Error HMD: '+e.message);
    console.error('fetchHistData:',e);
  }
}
