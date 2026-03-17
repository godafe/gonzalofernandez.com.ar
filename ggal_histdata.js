/* ===== DATOS HISTÓRICOS ===== */
const HIST={rows:[],charts:{rc:null,vi:null,st:null,varr:null,bb:null,ri:null}};

// Parse HMD — tall format: one row per instrument per date
// Key = type + canonicalStrike (col F). Col E = last price.
function parseHistRows(rows){
  if(!rows||rows.length<2)return;
  const headerRowIdx=(+document.getElementById('sh-header-row-hist')?.value||1)-1;
  const dataRows=rows.slice(headerRowIdx+1);

  const dateIdx    =colLetterToIndex(document.getElementById('hist-col-date')?.value||'A');
  const typeIdx    =colLetterToIndex(document.getElementById('hist-col-type')?.value||'C');
  const strikeIdx  =colLetterToIndex(document.getElementById('hist-col-strike')?.value||'F');  // col F = canonical
  const lastIdx    =colLetterToIndex(document.getElementById('hist-col-last')?.value||'E');

  const dateMap={};
  const colMap=new Map(); // "call_6902.9" → {type, strike, key}

  dataRows.forEach(r=>{
    if(!r||!r.length)return;
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

  // HIST.cols — sorted by type then strike ascending
  HIST.cols=[...colMap.values()].sort((a,b)=>{
    if(a.type!==b.type)return a.type.localeCompare(b.type);
    return a.strike-b.strike;
  });

  // HIST.rows — sorted ascending by date
  HIST.rows=Object.entries(dateMap)
    .sort((a,b)=>a[0].localeCompare(b[0]))
    .map(([date,priceMap])=>({date,prices:priceMap,spot:priceMap.__suby__||null}));

  histPopulateStrikes();
}

function histPopulateStrikes(){
  const s1=document.getElementById('hist-strike1');
  const s2=document.getElementById('hist-strike2');
  if(!s1||!s2)return;
  if(!HIST.cols||!HIST.cols.length)return;

  // Unique strikes (regardless of type), sorted ascending
  const uniqueStrikes=[...new Set(HIST.cols.map(c=>c.strike))].sort((a,b)=>a-b);

  const cur1=parseFloat(s1.value)||0;
  const cur2=parseFloat(s2.value)||0;
  s1.innerHTML='';s2.innerHTML='';

  uniqueStrikes.forEach(s=>{
    const label=fmtStrike(s);
    const o1=document.createElement('option');
    o1.value=s;o1.textContent=label;
    if(Math.round(s*100)===Math.round(cur1*100))o1.selected=true;
    s1.appendChild(o1);
    const o2=document.createElement('option');
    o2.value=s;o2.textContent=label;
    if(Math.round(s*100)===Math.round(cur2*100))o2.selected=true;
    s2.appendChild(o2);
  });

  // Default: two ATM-closest strikes
  if(!cur1&&!cur2&&uniqueStrikes.length>=2){
    const S=ST.spot;
    const sorted=[...uniqueStrikes].sort((a,b)=>Math.abs(a-S)-Math.abs(b-S));
    s1.value=sorted[0];
    s2.value=sorted[1];
  }

  // Sync expiry
  const expiryEl=document.getElementById('hist-expiry');
  if(expiryEl&&!expiryEl.value&&ST.selExpiry)expiryEl.value=ST.selExpiry;
  const rEl=document.getElementById('hist-rate');
  if(rEl&&rEl.value==='')rEl.value='0';
}

function calcHistCalcs(p1,p2,T1,T2,r,q,K1,K2,spot,type1,type2){
  const iv1=(p1!=null&&p1>0&&T1>0)?impliedVol(spot,K1,T1,r,q,p1,type1)||null:null;
  const iv2=(p2!=null&&p2>0&&T2>0)?impliedVol(spot,K2,T2,r,q,p2,type2)||null:null;
  const viProm=(iv1&&iv2)?(iv1+iv2)/2:iv1||iv2||null;
  const rc=(p1!=null&&p1>0&&p2!=null&&p2>0)?p1/p2:null;
  const straddle=(p1!=null&&p2!=null)?p1+p2:null;
  return{iv1,iv2,viProm,rc,straddle};
}

function histToggleType(n){
  const hidden=document.getElementById('hist-type'+n);
  const btn=document.getElementById('hist-type'+n+'-btn');
  if(!hidden||!btn)return;
  const newVal=hidden.value==='call'?'put':'call';
  hidden.value=newVal;
  const isCall=newVal==='call';
  btn.textContent=isCall?'Call':'Put';
  btn.style.color=isCall?'var(--green)':'var(--red)';
  btn.style.borderColor=isCall?'var(--green)':'var(--red)';
  renderHistData();
}

function histSwapStrikes(){
  const s1=document.getElementById('hist-strike1');
  const s2=document.getElementById('hist-strike2');
  const t1=document.getElementById('hist-type1');
  const t2=document.getElementById('hist-type2');
  const b1=document.getElementById('hist-type1-btn');
  const b2=document.getElementById('hist-type2-btn');
  if(!s1||!s2)return;
  // Swap values
  const tmpS=s1.value;s1.value=s2.value;s2.value=tmpS;
  if(t1&&t2){
    const tmpT=t1.value;t1.value=t2.value;t2.value=tmpT;
    // Sync button appearances
    [1,2].forEach(n=>{
      const t=document.getElementById('hist-type'+n);
      const b=document.getElementById('hist-type'+n+'-btn');
      if(t&&b){
        const isCall=t.value==='call';
        b.textContent=isCall?'Call':'Put';
        b.style.color=isCall?'var(--green)':'var(--red)';
        b.style.borderColor=isCall?'var(--green)':'var(--red)';
      }
    });
  }
  renderHistData();
}

function renderHistData(){
  // baseKey from selectors
  const K1=parseFloat(document.getElementById('hist-strike1')?.value)||0;
  const K2=parseFloat(document.getElementById('hist-strike2')?.value)||0;
  const type1=document.getElementById('hist-type1')?.value||'call';
  const type2=document.getElementById('hist-type2')?.value||'call';
  const baseKey1=`${type1}_${K1}`;
  const baseKey2=`${type2}_${K2}`;
  const col1=HIST.cols.find(c=>c.key===baseKey1)||null;
  const col2=HIST.cols.find(c=>c.key===baseKey2)||null;
  const r=parseFloat(document.getElementById('hist-rate')?.value||'0')/100;
  const ri=Math.max(0.1,Math.min(4,parseFloat(document.getElementById('hist-ri')?.value)||1.0));
  const q=ST.q;
  const expiryStr=document.getElementById('hist-expiry')?.value||ST.selExpiry||'';
  const expiryMs=expiryStr?new Date(expiryStr+'T12:00:00').getTime():null;

  // Update headers
  // Column abbreviation from base col
  function colAbbr(col,fbType,fbK){
    const s=col?.strike||fbK||0;
    const t=col?.type||fbType||'call';
    const p=t==='call'?'C':'P';
    const digits=s>=10000?3:2;
    return`${p}${Math.floor(s).toString().slice(0,digits)}`;
  }

  const th1=document.getElementById('hist-th-s1');
  const th2=document.getElementById('hist-th-s2');
  const thvi1=document.getElementById('hist-th-vi1');
  const thvi2=document.getElementById('hist-th-vi2');
  const c1color=type1==='call'?'var(--green)':'var(--red)';
  const c2color=type2==='call'?'var(--green)':'var(--red)';
  if(th1){th1.textContent=colAbbr(col1,type1,K1);th1.style.color=c1color;}
  if(th2){th2.textContent=colAbbr(col2,type2,K2);th2.style.color=c2color;}
  if(thvi1){thvi1.textContent='VI '+colAbbr(col1,type1,K1);thvi1.style.color=c1color;}
  if(thvi2){thvi2.textContent='VI '+colAbbr(col2,type2,K2);thvi2.style.color=c2color;}

  // Update Bull/Bear header label based on types
  const bbLabel=type1==='call'&&type2==='call'?'Bull Call Spread':type1==='put'&&type2==='put'?'Bear Put Spread':'Bull/Bear';
  const bbTh=document.getElementById('hist-th-bb');
  if(bbTh)bbTh.textContent=bbLabel;
  const bbChartTitle=document.getElementById('hist-chart-bb-title');
  if(bbChartTitle)bbChartTitle.textContent=bbLabel;

  const source=HIST.rows.length?HIST.rows:[];
  if(!source.length){
    document.getElementById('hist-body').innerHTML=`<tr><td colspan="12" style="padding:24px;text-align:center;color:var(--muted)">Sin datos — presioná ⟳ Actualizar HMD</td></tr>`;
    return;
  }

  // Build calculated rows — ascending date order, use exact strike from each row for IV
  const calc=source.map(row=>{
    const spot=row.spot||ST.spot;
    const entry1=row.prices[baseKey1]||null;
    const entry2=row.prices[baseKey2]||null;
    const p1=entry1?.price??null;
    const p2=entry2?.price??null;
    const k1=entry1?.strike||K1;  // exact strike on this date
    const k2=entry2?.strike||K2;
    let T1=0,T2=0;
    if(expiryMs){
      const rowMs=new Date(row.date+'T12:00:00').getTime();
      const days=Math.max(0,(expiryMs-rowMs)/(1000*60*60*24));
      T1=T2=days/365;
    }
    // Bull/Bear = p1 - p2 (buy S1, sell S2 — net debit/credit)
    const bb=(p1!=null&&p2!=null)?p1-p2:null;
    // Costo RI = (p1 * -10) + p2 * ri * 10
    const riCost=(p1!=null&&p2!=null)?(-10*p1)+(p2*ri*10):null;
    return{date:row.date,p1,p2,spot,...calcHistCalcs(p1,p2,T1,T2,r,q,k1,k2,spot,type1,type2),bb,riCost};
  });

  // Add variation fields (% change vs previous row)
  calc.forEach((row,i)=>{
    if(i===0){row.varVI=null;row.varRC=null;row.varST=null;row.varBB=null;row.varRI=null;return;}
    const prev=calc[i-1];
    row.varVI=prev.viProm&&row.viProm?(row.viProm-prev.viProm)/prev.viProm:null;
    row.varRC=prev.rc&&row.rc?(row.rc-prev.rc)/prev.rc:null;
    row.varST=prev.straddle&&row.straddle?(row.straddle-prev.straddle)/prev.straddle:null;
    row.varBB=prev.bb!=null&&row.bb!=null&&prev.bb!==0?(row.bb-prev.bb)/Math.abs(prev.bb):null;
    row.varRI=prev.riCost!=null&&row.riCost!=null&&prev.riCost!==0?(row.riCost-prev.riCost)/Math.abs(prev.riCost):null;
  });

  // Render table
  const tb=document.getElementById('hist-body');
  tb.innerHTML='';
  calc.forEach(row=>{
    const tr=document.createElement('tr');
    tr.style.borderBottom='1px solid var(--border2)';
    const pct=v=>v==null?'--':(v>=0?'+':'')+((v*100).toFixed(2))+'%';
    const varColor=v=>v==null?'var(--muted)':v>0?'var(--green)':'var(--red)';
    tr.innerHTML=`
      <td style="padding:4px 8px;text-align:center;color:var(--muted);white-space:nowrap">${row.date||'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:var(--muted)">${row.spot!=null?fmtN(row.spot,0):'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:${c1color}">${row.p1!=null?fmtN(row.p1):'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:${c2color}">${row.p2!=null?fmtN(row.p2):'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:${c1color}">${row.iv1!=null?(row.iv1*100).toFixed(2)+'%':'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:${c2color}">${row.iv2!=null?(row.iv2*100).toFixed(2)+'%':'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:var(--amber)">${row.viProm!=null?(row.viProm*100).toFixed(2)+'%':'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:${varColor(row.varVI)}">${pct(row.varVI)}</td>
      <td style="padding:4px 8px;text-align:center;color:var(--amber)">${row.rc!=null?row.rc.toFixed(2):'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:${varColor(row.varRC)}">${pct(row.varRC)}</td>
      <td style="padding:4px 8px;text-align:center;color:var(--amber)">${row.straddle!=null?fmtN(row.straddle):'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:${varColor(row.varST)}">${pct(row.varST)}</td>
      <td style="padding:4px 8px;text-align:center;color:${row.bb!=null?(row.bb>=0?'var(--green)':'var(--red)'):'var(--muted)'}">${row.bb!=null?fmtN(row.bb):'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:${varColor(row.varBB)}">${pct(row.varBB)}</td>
      <td style="padding:4px 8px;text-align:center;color:${row.riCost!=null?(row.riCost>=0?'var(--green)':'var(--red)'):'var(--muted)'}">${row.riCost!=null?fmtN(row.riCost):'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:${varColor(row.varRI)}">${pct(row.varRI)}</td>`;
    tb.appendChild(tr);
  });

  // Charts
  const labels=calc.map(r=>r.date||'');
  const chartOpts=(color,label,fmt)=>({
    responsive:true,maintainAspectRatio:false,animation:false,
    plugins:{
      legend:{display:false},
      tooltip:{backgroundColor:'#131920',borderColor:'#2a3444',borderWidth:1,titleColor:'#7a8fa6',bodyColor:'#d8e3ef',
        callbacks:{label:c=>` ${label}: ${fmt(c.raw)}`}}
    },
    scales:{
      x:{ticks:{color:'#7a8fa6',font:{size:8},maxRotation:45,minRotation:45,autoSkip:false,callback:(v,i,vals)=>{
          const d=labels[i];if(!d)return'';
          const p=d.split('-');return p.length>=3?p[2]+'-'+p[1]:d;
        }},grid:{color:'#1a2230'}},
      y:{ticks:{color:'#7a8fa6',font:{size:9},callback:v=>fmt(v)},grid:{color:'#1a2230'}}
    }
  });

  const makeChart=(id,key,color,label,fmt)=>{
    if(HIST.charts[key])HIST.charts[key].destroy();
    const ctx=document.getElementById(id)?.getContext('2d');
    if(!ctx)return;
    HIST.charts[key]=new Chart(ctx,{
      type:'line',
      data:{labels,datasets:[{data:calc.map(r=>r[key]!=null?parseFloat(r[key].toFixed(4)):null),
        borderColor:color,borderWidth:1.5,pointRadius:3,pointBackgroundColor:color,fill:false,spanGaps:true}]},
      options:chartOpts(color,label,fmt)
    });
  };

  makeChart('hist-chart-rc','rc','#e8b84b','RC',v=>v!=null?v.toFixed(2):'--');
  makeChart('hist-chart-vi','viProm','#5aabff','VI prom',v=>v!=null?(v*100).toFixed(1)+'%':'--');
  makeChart('hist-chart-st','straddle','#44c76a','Straddle',v=>v!=null?fmtN(v):'--');
  makeChart('hist-chart-bb','bb','#5aabff',bbLabel,v=>v!=null?fmtN(v):'--');
  makeChart('hist-chart-ri','riCost','#b088f0','Costo RI',v=>v!=null?fmtN(v):'--');

  // Variación chart — 3 series
  if(HIST.charts.varr)HIST.charts.varr.destroy();
  const ctxV=document.getElementById('hist-chart-var')?.getContext('2d');
  if(ctxV){
    HIST.charts.varr=new Chart(ctxV,{
      type:'line',
      data:{labels,datasets:[
        {label:'Var VI%',data:calc.map(r=>r.varVI!=null?parseFloat((r.varVI*100).toFixed(3)):null),borderColor:'#b088f0',borderWidth:1.5,pointRadius:3,fill:false,spanGaps:true},
        {label:'Var RC%',data:calc.map(r=>r.varRC!=null?parseFloat((r.varRC*100).toFixed(3)):null),borderColor:'#f05a5a',borderWidth:1.5,pointRadius:3,fill:false,spanGaps:true},
        {label:'Var ST%',data:calc.map(r=>r.varST!=null?parseFloat((r.varST*100).toFixed(3)):null),borderColor:'#e8b84b',borderWidth:1.5,pointRadius:0,fill:false,spanGaps:true}
      ]},
      options:{...chartOpts('','%',v=>v!=null?v.toFixed(2)+'%':'--'),
        plugins:{
          legend:{display:true,labels:{color:'#7a8fa6',font:{size:9},boxWidth:8,padding:8}},
          tooltip:{backgroundColor:'#131920',borderColor:'#2a3444',borderWidth:1,titleColor:'#7a8fa6',bodyColor:'#d8e3ef'}
        }
      }
    });
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


