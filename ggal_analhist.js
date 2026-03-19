/* ===== MÓDULO ANÁLISIS HISTÓRICO ===== */
const AH={charts:{vega:null,bull:null,rc:null,ri:null}};

function ahToggleType(n){
  const hidden=document.getElementById('ah-type'+n);
  const btn=document.getElementById('ah-type'+n+'-btn');
  if(!hidden||!btn)return;
  const newVal=hidden.value==='call'?'put':'call';
  hidden.value=newVal;
  const isCall=newVal==='call';
  btn.textContent=isCall?'Call':'Put';
  btn.style.color=isCall?'var(--green)':'var(--red)';
  btn.style.borderColor=isCall?'var(--green)':'var(--red)';
  renderAnalHist();
}

function ahSwapStrikes(){
  const s1=document.getElementById('ah-strike1');
  const s2=document.getElementById('ah-strike2');
  const t1=document.getElementById('ah-type1');
  const t2=document.getElementById('ah-type2');
  if(!s1||!s2)return;
  const tmpS=s1.value; s1.value=s2.value; s2.value=tmpS;
  if(t1&&t2){
    const tmpT=t1.value; t1.value=t2.value; t2.value=tmpT;
    [1,2].forEach(n=>{
      const t=document.getElementById('ah-type'+n);
      const b=document.getElementById('ah-type'+n+'-btn');
      if(t&&b){
        const isCall=t.value==='call';
        b.textContent=isCall?'Call':'Put';
        b.style.color=isCall?'var(--green)':'var(--red)';
        b.style.borderColor=isCall?'var(--green)':'var(--red)';
      }
    });
  }
  renderAnalHist();
}

function ahPopulateStrikes(){
  const s1=document.getElementById('ah-strike1');
  const s2=document.getElementById('ah-strike2');
  if(!s1||!s2||!HIST.cols||!HIST.cols.length)return;
  const uniqueStrikes=[...new Set(HIST.cols.map(c=>c.strike))].sort((a,b)=>a-b);
  const cur1=parseFloat(s1.value)||0;
  const cur2=parseFloat(s2.value)||0;
  s1.innerHTML=''; s2.innerHTML='';
  uniqueStrikes.forEach(s=>{
    const label=fmtStrike(s);
    const o1=document.createElement('option');
    o1.value=s; o1.textContent=label;
    if(Math.round(s*100)===Math.round(cur1*100))o1.selected=true;
    s1.appendChild(o1);
    const o2=document.createElement('option');
    o2.value=s; o2.textContent=label;
    if(Math.round(s*100)===Math.round(cur2*100))o2.selected=true;
    s2.appendChild(o2);
  });
  if(!cur1&&!cur2&&uniqueStrikes.length>=2){
    const S=ST.spot;
    const sorted=[...uniqueStrikes].sort((a,b)=>Math.abs(a-S)-Math.abs(b-S));
    s1.value=sorted[0]; s2.value=sorted[1];
  }
  const expiryEl=document.getElementById('ah-expiry');
  if(expiryEl&&!expiryEl.value&&ST.selExpiry)expiryEl.value=ST.selExpiry;
}

function ahCalcGreeks(price,K,type,spot,T,r,q){
  if(!price||price<=0||T<=0)return null;
  const iv=impliedVol(spot,K,T,r,q,price,type)||null;
  if(!iv)return null;
  const g=bs(spot,K,T,r,q,iv,type);
  return{iv,vega:g.vega,gamma:g.gamma,delta:g.delta};
}

function renderAnalHist(){
  ahPopulateStrikes();
  const K1=parseFloat(document.getElementById('ah-strike1')?.value)||0;
  const K2=parseFloat(document.getElementById('ah-strike2')?.value)||0;
  const type1=document.getElementById('ah-type1')?.value||'call';
  const type2=document.getElementById('ah-type2')?.value||'call';
  const r=parseFloat(document.getElementById('ah-rate')?.value||'0')/100;
  const ri=Math.max(0.1,Math.min(4,parseFloat(document.getElementById('ah-ri')?.value)||2.0));
  const expiryStr=document.getElementById('ah-expiry')?.value||ST.selExpiry||'';
  const expiryMs=expiryStr?new Date(expiryStr+'T12:00:00').getTime():null;
  const q=ST.q;

  // Update price column headers
  const c1col=type1==='call'?'var(--green)':'var(--red)';
  const c2col=type2==='call'?'var(--green)':'var(--red)';
  const th1=document.getElementById('ah-th1-price');
  const th2=document.getElementById('ah-th2-price');
  if(th1){th1.textContent=fmtStrike(K1);th1.style.color=c1col;}
  if(th2){th2.textContent=fmtStrike(K2);th2.style.color=c2col;}

  const source=HIST.rows.length?HIST.rows:[];
  const empty=msg=>{
    document.getElementById('ah-body1').innerHTML=`<tr><td colspan="7" style="padding:16px;text-align:center;color:var(--muted)">${msg}</td></tr>`;
    document.getElementById('ah-body2').innerHTML='';
  };
  if(!source.length){empty('Sin datos — presioná ⟳ Actualizar HMD');return;}

  const baseKey1=`${type1}_${K1}`;
  const baseKey2=`${type2}_${K2}`;

  // Build rows with greeks
  const rows=source.map(row=>{
    const spot=row.spot||ST.spot;
    const entry1=row.prices[baseKey1]||null;
    const entry2=row.prices[baseKey2]||null;
    const p1=entry1?.price??null;
    const p2=entry2?.price??null;
    const k1=entry1?.strike||K1;
    const k2=entry2?.strike||K2;
    let T1=0,T2=0;
    if(expiryMs){
      const rowMs=new Date(row.date+'T12:00:00').getTime();
      const days=Math.max(0,(expiryMs-rowMs)/(1000*60*60*24));
      T1=T2=days/365;
    }
    const g1=p1!=null?ahCalcGreeks(p1,k1,type1,spot,T1,r,q):null;
    const g2=p2!=null?ahCalcGreeks(p2,k2,type2,spot,T2,r,q):null;
    // Strategies
    const bull=(p1!=null&&p2!=null)?p1-p2:null;
    const rc=(p1!=null&&p2!=null&&p2>0)?p1/p2:null;
    const riCost=(p1!=null&&p2!=null)?(p1*100)+(p2*-ri*100):null;
    const vegaRatio=(g1?.vega>0&&g2?.vega>0)?g1.vega/g2.vega:null;
    return{date:row.date,spot,p1,p2,k1,k2,g1,g2,bull,rc,riCost,vegaRatio};
  });

  // Render table 1
  const renderTable=(tbodyId,col,rows,getP,getG)=>{
    const tb=document.getElementById(tbodyId);
    if(!tb)return;
    tb.innerHTML='';
    rows.forEach(row=>{
      const p=getP(row);
      const g=getG(row);
      const tr=document.createElement('tr');
      tr.style.borderBottom='1px solid var(--border2)';
      tr.innerHTML=`
        <td style="padding:4px 7px;color:var(--muted);white-space:nowrap;text-align:center">${row.date||'--'}</td>
        <td style="padding:4px 7px;color:var(--muted);text-align:center">${row.spot!=null?fmtN(row.spot,0):'--'}</td>
        <td style="padding:4px 7px;color:${col};text-align:center">${p!=null?fmtN(p):'--'}</td>
        <td style="padding:4px 7px;color:var(--amber);text-align:center">${g?.iv!=null?(g.iv*100).toFixed(2)+'%':'--'}</td>
        <td style="padding:4px 7px;text-align:center">${g?.vega!=null?g.vega.toFixed(3):'--'}</td>
        <td style="padding:4px 7px;text-align:center">${g?.gamma!=null?g.gamma.toFixed(4):'--'}</td>
        <td style="padding:4px 7px;text-align:center;color:${g?.delta!=null?(Math.abs(g.delta)>0.5?col:'var(--text)'):'var(--muted)'}">${g?.delta!=null?g.delta.toFixed(3):'--'}</td>`;
      tb.appendChild(tr);
    });
  };

  renderTable('ah-body1',c1col,rows,r=>r.p1,r=>r.g1);
  renderTable('ah-body2',c2col,rows,r=>r.p2,r=>r.g2);

  // Update bull title
  const bullTitle=document.getElementById('ah-chart-bull-title');
  if(bullTitle){
    const bt=type1==='call'&&type2==='call'?'Bull Call Spread':type1==='put'&&type2==='put'?'Bear Put Spread':'Bull/Bear';
    bullTitle.textContent=`Costo ${bt} (S1−S2)`;
  }

  // Charts
  const labels=rows.map(r=>r.date||'');
  const chartOpts=(label,fmt)=>({
    responsive:true,maintainAspectRatio:false,animation:false,
    plugins:{
      legend:{display:false},
      tooltip:{backgroundColor:'#131920',borderColor:'#2a3444',borderWidth:1,
        titleColor:'#7a8fa6',bodyColor:'#d8e3ef',
        callbacks:{label:c=>` ${label}: ${fmt(c.raw)}`}}
    },
    scales:{
      x:{ticks:{color:'#7a8fa6',font:{size:9},maxRotation:0,minRotation:0,autoSkip:true,maxTicksLimit:12,
          callback:(v,i)=>{const d=labels[i];if(!d)return'';const p=d.split('-');return p.length>=3?p[2]+'-'+p[1]:d;}},
        grid:{color:'#1a2230'}},
      y:{ticks:{color:'#7a8fa6',font:{size:9},callback:v=>fmt(v)},grid:{color:'#1a2230'}}
    }
  });

  const makeChart=(key,id,data,color,label,fmt)=>{
    if(AH.charts[key])AH.charts[key].destroy();
    const ctx=document.getElementById(id)?.getContext('2d');
    if(!ctx)return;
    AH.charts[key]=new Chart(ctx,{
      type:'line',
      data:{labels,datasets:[{data:data.map(v=>v!=null?parseFloat(v.toFixed(4)):null),
        borderColor:color,borderWidth:1.5,pointRadius:3,pointBackgroundColor:color,
        fill:false,spanGaps:true}]},
      options:chartOpts(label,fmt)
    });
  };

  makeChart('vega','ah-chart-vega',rows.map(r=>r.vegaRatio),'#5aabff','Ratio Vega',v=>v!=null?v.toFixed(3):'--');
  makeChart('bull','ah-chart-bull',rows.map(r=>r.bull),'#44c76a','Costo Bull',v=>v!=null?fmtN(v):'--');
  makeChart('rc','ah-chart-rc',rows.map(r=>r.rc),'#e8b84b','RC',v=>v!=null?v.toFixed(3):'--');
  makeChart('ri','ah-chart-ri',rows.map(r=>r.riCost),'#b088f0','Costo RI',v=>v!=null?fmtN(v):'--');
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
