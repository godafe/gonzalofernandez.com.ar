/* ===== DATOS HISTÓRICOS ===== */
const HIST={rows:[],charts:{rc:null,vi:null,st:null,varr:null,bb:null,ri:null,rcband:null,lleno:null,ivpct:null}};

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
    const lastRaw=r[lastIdx];
    if(!dateMap[date])dateMap[date]={};
    if(tipoRaw==='suby'||tipoRaw==='subyacente'){
      const last=parseARSNum(lastRaw);
      dateMap[date].__suby__=isNaN(last)?null:last;
      return;
    }
    if(isNaN(strikeF)||strikeF<=0)return;
    const last=parseARSPrice(lastRaw);
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
  if(typeof probPopulateStrikes==='function')probPopulateStrikes();
  if(typeof renderProbabilidades==='function'&&document.getElementById('tab-probabilidades'))renderProbabilidades();
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
    const spreadStrikes=Math.abs(K2-K1);
    const pctLleno=(p1!=null&&p2!=null&&spreadStrikes>0)
      ?((p1-p2)/spreadStrikes)*100:null;
    return{date:row.date, p1, p2, spot,
      ...calcHistCalcs(p1,p2,T,T,r,q,k1,k2,spot,type1,type2),
      bb, riCost, pctLleno};
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
  // Shared percentile helper used by RC-bands and IV-percentiles charts
  const pctile=(arr,p)=>{
    const s=[...arr].filter(v=>v!=null).sort((a,b)=>a-b);
    if(!s.length)return null;
    const idx=(p/100)*(s.length-1);
    const lo=Math.floor(idx),hi=Math.ceil(idx);
    return lo===hi?s[lo]:s[lo]+(s[hi]-s[lo])*(idx-lo);
  };
  const xTickCb=(v,i)=>{const d=labels[i];if(!d)return'';const p=d.split('-');return p.length>=3?p[2]+'-'+p[1]:d;};
  createLineChart(HIST.charts,'rc','hist-chart-rc',labels,calc.map(r=>r.rc),'#e8b84b','RC',v=>v!=null?v.toFixed(2):'--',{dense:true});
  createLineChart(HIST.charts,'vi','hist-chart-vi',labels,calc.map(r=>r.viProm),'#5aabff','VI prom',v=>v!=null?(v*100).toFixed(1)+'%':'--',{dense:true});
  createLineChart(HIST.charts,'st','hist-chart-st',labels,calc.map(r=>r.straddle),'#44c76a','Straddle',fP,{dense:true});
  createLineChart(HIST.charts,'bb','hist-chart-bb',labels,calc.map(r=>r.bb),'#5aabff',bbLabel,fP,{dense:true});
  createLineChart(HIST.charts,'ri','hist-chart-ri',labels,calc.map(r=>r.riCost),'#b088f0','Costo RI',fP,{dense:true});

  // Variación chart — multi-series, not handled by shared factory
  upsertChart(HIST.charts,'varr','hist-chart-var',{
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

  // ── RC con bandas de percentil ──
  const rcVals=calc.map(r=>r.rc).filter(v=>v!=null).sort((a,b)=>a-b);
  if(rcVals.length>=4&&HIST.charts){
    const p10=pctile(rcVals,10), p25=pctile(rcVals,25),
          p50=pctile(rcVals,50), p75=pctile(rcVals,75), p90=pctile(rcVals,90);
    const flat=v=>labels.map(()=>parseFloat(v.toFixed(3)));
    upsertChart(HIST.charts,'rcband','hist-chart-rcband',{
        type:'line',
        data:{labels, datasets:[
          {label:'p10', data:flat(p10), borderColor:'rgba(240,90,90,0.35)',  borderWidth:1,borderDash:[4,3],pointRadius:0,fill:false},
          {label:'p25', data:flat(p25), borderColor:'rgba(232,184,75,0.55)', borderWidth:1,borderDash:[4,3],pointRadius:0,fill:false},
          {label:'p50', data:flat(p50), borderColor:'rgba(122,143,166,0.7)', borderWidth:1.5,borderDash:[6,3],pointRadius:0,fill:false},
          {label:'p75', data:flat(p75), borderColor:'rgba(232,184,75,0.55)', borderWidth:1,borderDash:[4,3],pointRadius:0,fill:false},
          {label:'p90', data:flat(p90), borderColor:'rgba(240,90,90,0.35)',  borderWidth:1,borderDash:[4,3],pointRadius:0,fill:false},
          {label:'RC',  data:calc.map(r=>r.rc!=null?parseFloat(r.rc.toFixed(3)):null),
            borderColor:'#e8b84b',borderWidth:2,pointRadius:3,pointBackgroundColor:'#e8b84b',fill:false,spanGaps:true},
        ]},
        options:{
          responsive:true,maintainAspectRatio:false,animation:false,
          plugins:{
            legend:{display:true,labels:{color:'#7a8fa6',font:{size:9},boxWidth:8,padding:6}},
            tooltip:{backgroundColor:'#131920',borderColor:'#2a3444',borderWidth:1,
              titleColor:'#7a8fa6',bodyColor:'#d8e3ef',
              callbacks:{label:c=>` ${c.dataset.label}: ${c.raw!=null?c.raw.toFixed(3):'--'}`}},
          },
          scales:{
            x:{ticks:{color:'#7a8fa6',font:{size:8},maxRotation:45,minRotation:45,autoSkip:false,callback:xTickCb},grid:{color:'#1a2230'}},
            y:{ticks:{color:'#7a8fa6',font:{size:9},callback:v=>v.toFixed(2)},grid:{color:'#1a2230'}},
          }
        }
      });
  }

  // ── % Lleno del spread ──
  const llenoData=calc.map(r=>r.pctLleno!=null?parseFloat(r.pctLleno.toFixed(2)):null);
  const llenoColors=llenoData.map(v=>v==null?'#3d4f63':v<33?'#44c76a':v<60?'#e8b84b':'#f05a5a');
  upsertChart(HIST.charts,'lleno','hist-chart-lleno',{
      type:'bar',
      data:{labels, datasets:[{
        label:'% Lleno', data:llenoData,
        backgroundColor:llenoColors, borderColor:llenoColors, borderWidth:0,
      }]},
      options:{
        responsive:true,maintainAspectRatio:false,animation:false,
        plugins:{
          legend:{display:false},
          tooltip:{backgroundColor:'#131920',borderColor:'#2a3444',borderWidth:1,
            titleColor:'#7a8fa6',bodyColor:'#d8e3ef',
            callbacks:{
              label:c=>` % Lleno: ${c.raw!=null?c.raw.toFixed(1)+'%':'--'}`,
              afterLabel:c=>{
                const v=c.raw;
                return v==null?'':v<33?' → Barato (< 33%)':v<60?' → Normal (33–60%)':' → Caro (> 60%)';
              }
            }},
        },
        scales:{
          x:{ticks:{color:'#7a8fa6',font:{size:8},maxRotation:45,minRotation:45,autoSkip:false,callback:xTickCb},grid:{color:'#1a2230'}},
          y:{ticks:{color:'#7a8fa6',font:{size:9},callback:v=>v.toFixed(0)+'%'},grid:{color:'#1a2230'},
            min:0, max:100,
          },
        }
      }
    });

  // ── Percentiles de IV — S1 y S2 ──
  const iv1Vals=calc.map(r=>r.iv1!=null?r.iv1*100:null);
  const iv2Vals=calc.map(r=>r.iv2!=null?r.iv2*100:null);
  const iv1Clean=iv1Vals.filter(v=>v!=null);
  const iv2Clean=iv2Vals.filter(v=>v!=null);
  if((iv1Clean.length>=4||iv2Clean.length>=4)){
    {
      const flatLine=(val,col,lbl)=>({
        label:lbl, data:labels.map(()=>val!=null?parseFloat(val.toFixed(2)):null),
        borderColor:col, borderWidth:1, borderDash:[4,3],
        pointRadius:0, fill:false, spanGaps:true,
      });
      const ivDatasets=[];
      // S1 bands — amber
      if(iv1Clean.length>=4){
        ivDatasets.push(flatLine(pctile(iv1Clean,90),'rgba(232,184,75,0.20)','S1 p90'));
        ivDatasets.push(flatLine(pctile(iv1Clean,75),'rgba(232,184,75,0.40)','S1 p75'));
        ivDatasets.push(flatLine(pctile(iv1Clean,50),'rgba(232,184,75,0.80)','S1 p50'));
        ivDatasets.push(flatLine(pctile(iv1Clean,25),'rgba(232,184,75,0.40)','S1 p25'));
        ivDatasets.push(flatLine(pctile(iv1Clean,10),'rgba(232,184,75,0.20)','S1 p10'));
      }
      // S2 bands — blue
      if(iv2Clean.length>=4){
        ivDatasets.push(flatLine(pctile(iv2Clean,90),'rgba(90,171,255,0.20)','S2 p90'));
        ivDatasets.push(flatLine(pctile(iv2Clean,75),'rgba(90,171,255,0.40)','S2 p75'));
        ivDatasets.push(flatLine(pctile(iv2Clean,50),'rgba(90,171,255,0.80)','S2 p50'));
        ivDatasets.push(flatLine(pctile(iv2Clean,25),'rgba(90,171,255,0.40)','S2 p25'));
        ivDatasets.push(flatLine(pctile(iv2Clean,10),'rgba(90,171,255,0.20)','S2 p10'));
      }
      // Actual IV lines on top — hex colors (Chart.js doesn't support CSS vars)
      const hex1='#e8b84b';  // amber for S1
      const hex2='#5aabff';  // blue for S2
      if(iv1Clean.length>=4){
        ivDatasets.push({
          label:`IV ${colAbbr(type1,K1)}`,
          data:iv1Vals.map(v=>v!=null?parseFloat(v.toFixed(2)):null),
          borderColor:hex1, borderWidth:2.5,
          pointRadius:2.5, pointBackgroundColor:hex1, fill:false, spanGaps:true,
        });
      }
      if(iv2Clean.length>=4){
        ivDatasets.push({
          label:`IV ${colAbbr(type2,K2)}`,
          data:iv2Vals.map(v=>v!=null?parseFloat(v.toFixed(2)):null),
          borderColor:hex2, borderWidth:2.5,
          pointRadius:2.5, pointBackgroundColor:hex2, fill:false, spanGaps:true,
        });
      }
      upsertChart(HIST.charts,'ivpct','hist-chart-ivpct',{
        type:'line',
        data:{labels, datasets:ivDatasets},
        options:{
          responsive:true, maintainAspectRatio:false, animation:false,
          plugins:{
            legend:{display:true,labels:{color:'#7a8fa6',font:{size:9},boxWidth:8,padding:5,
              filter:item=>!item.text.includes(' p')||item.text.endsWith('p50'),
            }},
            tooltip:{backgroundColor:'#131920',borderColor:'#2a3444',borderWidth:1,
              titleColor:'#7a8fa6',bodyColor:'#d8e3ef',
              callbacks:{label:c=>` ${c.dataset.label}: ${c.raw!=null?c.raw.toFixed(2)+'%':'--'}`}},
          },
          scales:{
            x:{ticks:{color:'#7a8fa6',font:{size:8},maxRotation:45,minRotation:45,autoSkip:false,callback:xTickCb},grid:{color:'#1a2230'}},
            y:{ticks:{color:'#7a8fa6',font:{size:9},callback:v=>v.toFixed(0)+'%'},grid:{color:'#1a2230'}},
          }
        }
      });
    }
  }

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
