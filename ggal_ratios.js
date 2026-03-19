/* ===== MÓDULO RATIOS ===== */

function ratPopulateExpiry(){
  const sel=document.getElementById('rat-expiry');
  if(!sel)return;
  const cur=sel.value;
  sel.innerHTML='';
  ST.expirations.forEach(e=>{
    const o=document.createElement('option');
    o.value=e;o.textContent=fmtExpiry(e);
    if(e===cur)o.selected=true;
    sel.appendChild(o);
  });
  if(!sel.value&&ST.selExpiry)sel.value=ST.selExpiry;
}

function ratHistAvg(k1,k2){
  if(!HIST.rows||!HIST.rows.length)return null;
  const key1=`call_${k1}`;
  const key2=`call_${k2}`;
  const vals=HIST.rows
    .map(r=>{
      const p1=r.prices[key1]?.price;
      const p2=r.prices[key2]?.price;
      return(p1>0&&p2>0)?p1/p2:null;
    }).filter(v=>v!=null);
  if(!vals.length)return null;
  return vals.reduce((a,b)=>a+b,0)/vals.length;
}

function ratColor(ratio,lo,hi){
  if(ratio<=lo)return'rgba(90,171,255,0.85)';
  if(ratio<=(lo+hi)/2)return'rgba(68,199,106,0.8)';
  if(ratio<=hi)return'rgba(232,184,75,0.85)';
  return'rgba(240,90,90,0.85)';
}

function ratToggleHmType(){
  const hidden=document.getElementById('rat-hm-type');
  const btn=document.getElementById('rat-hm-type-btn');
  if(!hidden||!btn)return;
  const newVal=hidden.value==='call'?'put':'call';
  hidden.value=newVal;
  const isCall=newVal==='call';
  btn.textContent=isCall?'Call':'Put';
  btn.style.color=isCall?'var(--green)':'var(--red)';
  btn.style.borderColor=isCall?'var(--green)':'var(--red)';
  renderRatios();
}

function renderRatios(){
  ratPopulateExpiry();
  const exp=document.getElementById('rat-expiry')?.value||ST.selExpiry;
  const thLo=parseFloat(document.getElementById('rat-thresh-lo')?.value)||0.30;
  const thHi=parseFloat(document.getElementById('rat-thresh-hi')?.value)||0.70;
  const thIV=parseFloat(document.getElementById('rat-thresh-iv')?.value)||5.0;
  const thParity=parseFloat(document.getElementById('rat-thresh-parity')?.value)||10;
  const onlyOpps=document.getElementById('rat-only-opps')?.checked||false;

  if(!exp||!ST.chain[exp]){
    document.getElementById('rat-body').innerHTML=`<tr><td colspan="9" style="padding:20px;text-align:center;color:var(--muted)">Sin datos — cargá la cadena primero</td></tr>`;
    return;
  }

  const chainRows=[...ST.chain[exp]].sort((a,b)=>a.strike-b.strike);
  const S=ST.spot;
  const T=chainRows[0]?.T||(30/365);

  // Only calls with valid Last price
  const callRows=chainRows.filter(r=>r.callMid>0);

  // Build all call/call pairs (S1 < S2)
  const pairs=[];
  for(let i=0;i<callRows.length;i++){
    for(let j=i+1;j<callRows.length;j++){
      const r1=callRows[i], r2=callRows[j];
      const c1=r1.callMid, c2=r2.callMid;
      const ratio=c1/c2;

      // IV for each
      const iv1=impliedVol(S,r1.strike,T,ST.rate,ST.q,c1,'call')||null;
      const iv2=impliedVol(S,r2.strike,T,ST.rate,ST.q,c2,'call')||null;
      const dIV=(iv1&&iv2)?(iv1-iv2)*100:null; // in %

      // Put-call parity: C - P = S*e^(-qT) - K*e^(-rT)
      // Theoretical: C - P should equal forward - K discounted
      // Violation: |C1 - P1 - (S·e^-qT - K1·e^-rT)| > threshold
      const p1=r1.putMid, p2=r2.putMid;
      let parityViol1=null, parityViol2=null;
      if(p1>0&&c1>0){
        const theoretical=S*Math.exp(-ST.q*T)-r1.strike*Math.exp(-ST.rate*T);
        parityViol1=Math.abs((c1-p1)-theoretical);
      }
      if(p2>0&&c2>0){
        const theoretical=S*Math.exp(-ST.q*T)-r2.strike*Math.exp(-ST.rate*T);
        parityViol2=Math.abs((c2-p2)-theoretical);
      }

      // Historical average ratio
      const hist=ratHistAvg(r1.strike,r2.strike);
      const dHist=hist?ratio-hist:null;

      // Signals
      const signals=[];
      if(ratio<=thLo||ratio>=thHi)signals.push({label:'RC',color:ratio<=thLo?'var(--blue)':'var(--red)'});
      if(dIV!=null&&Math.abs(dIV)>=thIV)signals.push({label:'ΔIV',color:'var(--green)'});
      if(parityViol1!=null&&parityViol1>=thParity)signals.push({label:'PC S1',color:'var(--amber)'});
      if(parityViol2!=null&&parityViol2>=thParity)signals.push({label:'PC S2',color:'var(--amber)'});

      pairs.push({r1,r2,c1,c2,ratio,iv1,iv2,dIV,parityViol1,parityViol2,hist,dHist,signals});
    }
  }

  // Summary signals bar
  const sigBar=document.getElementById('rat-signals');
  if(sigBar){
    const totalRC=pairs.filter(p=>p.signals.some(s=>s.label==='RC')).length;
    const totalIV=pairs.filter(p=>p.signals.some(s=>s.label.startsWith('ΔIV'))).length;
    const totalPC=pairs.filter(p=>p.signals.some(s=>s.label.startsWith('PC'))).length;
    sigBar.innerHTML=[
      ['RC fuera de rango',totalRC,'var(--red)'],
      ['Δ IV anómala',totalIV,'var(--green)'],
      ['Paridad violada',totalPC,'var(--amber)'],
    ].map(([label,n,color])=>`
      <div style="padding:5px 14px;background:var(--surface);border:1px solid ${color.replace(')',',0.3)')};border-radius:20px;font-size:11px;color:${color};font-family:var(--mono)">
        <strong>${n}</strong> <span style="color:var(--muted);font-size:10px">${label}</span>
      </div>`).join('');
  }

  // Populate base selector
  const baseSel=document.getElementById('rat-base');
  if(baseSel){
    const curBase=parseFloat(baseSel.value)||0;
    baseSel.innerHTML='';
    callRows.forEach(r=>{
      const o=document.createElement('option');
      o.value=r.strike;
      o.textContent=`${fmtStrike(r.strike)} — ${fmtN(r.callMid)}`;
      if(Math.round(r.strike*100)===Math.round(curBase*100))o.selected=true;
      baseSel.appendChild(o);
    });
    // Default to ATM
    if(!curBase&&callRows.length){
      const atm=callRows.reduce((p,r)=>Math.abs(r.strike-S)<Math.abs(p.strike-S)?r:p,callRows[0]);
      baseSel.value=atm.strike;
    }
  }
  const baseStrike=parseFloat(document.getElementById('rat-base')?.value)||0;
  const baseRow=callRows.find(r=>Math.round(r.strike*100)===Math.round(baseStrike*100));

  // Render Ratio+N table
  const tb=document.getElementById('rat-body');
  tb.innerHTML='';
  if(!baseRow||!callRows.length){
    tb.innerHTML=`<tr><td colspan="5" style="padding:16px;text-align:center;color:var(--muted)">Seleccioná una base</td></tr>`;
  } else {
    const baseIdx=callRows.indexOf(baseRow);
    callRows.forEach((row,i)=>{
      if(i===baseIdx)return; // skip self
      const price=row.callMid;
      // Ratio+N: how many positions is this row from base
      const offset=i-baseIdx; // can be negative (rows above base)
      // For each row, compute ratio against base+1, base+2, base+3 from that row's position
      const r1=callRows[i]?.callMid||0;
      const rN=(n)=>{const t=callRows[i+n];return t?.callMid>0?r1/t.callMid:null;};
      const ratio1=rN(1), ratio2=rN(2), ratio3=rN(3);
      const isBase=row.strike===baseStrike;
      const tr=document.createElement('tr');
      tr.style.borderBottom='1px solid var(--border2)';
      if(isBase)tr.style.background='rgba(232,184,75,0.08)';
      const fmtR=(v)=>{
        if(v==null)return'<span style="color:var(--dim)">--</span>';
        const c=ratColor(v,thLo,thHi);
        return`<span style="font-weight:600;color:${c}">${v.toFixed(2)}</span>`;
      };
      const strikeColor=offset<0?'var(--blue)':offset===0?'var(--amber)':'var(--muted)';
      tr.innerHTML=`
        <td style="padding:4px 10px;text-align:center;color:${strikeColor}">${fmtStrike(row.strike)}</td>
        <td style="padding:4px 10px;text-align:center;color:var(--amber)">${fmtN(price)}</td>
        <td style="padding:4px 10px;text-align:center">${fmtR(ratio1)}</td>
        <td style="padding:4px 10px;text-align:center">${fmtR(ratio2)}</td>
        <td style="padding:4px 10px;text-align:center">${fmtR(ratio3)}</td>`;
      tb.appendChild(tr);
    });
  }

  // Heatmap — full width, bigger cells
  const hmType=document.getElementById('rat-hm-type')?.value||'call';
  document.getElementById('rat-heatmap-label').textContent='';
  // Build hmSrc: 8 strikes below spot + 8 above, centered on current spot
  const hmPool=(hmType==='call'?callRows:chainRows.filter(r=>r.putMid>0));
  const below=hmPool.filter(r=>r.strike<=S).slice(-8);  // last 8 at or below spot
  const above=hmPool.filter(r=>r.strike>S).slice(0,8);  // first 8 above spot
  const hmSrc=[...below,...above];
  const hm=document.getElementById('rat-heatmap');
  if(!hm||hmSrc.length<2)return;
  const cellSz=Math.min(64,Math.floor((window.innerWidth-320)/hmSrc.length));
  const cellH=Math.round(cellSz*0.65);
  const hmColor=hmType==='call'?'var(--green)':'var(--red)';
  let html=`<table style="border-collapse:collapse;font-size:10px;font-family:var(--mono);margin:0 auto">`;
  html+=`<tr><td style="padding:4px 8px;color:var(--dim);font-size:9px;white-space:nowrap;text-align:right">Prima S1 /<br>Prima S2</td>`;
  hmSrc.forEach(r=>{
    const price=hmType==='call'?r.callMid:r.putMid;
    html+=`<td style="width:${cellSz}px;padding:4px 4px;text-align:center;color:var(--muted);font-size:10px;line-height:1.5;white-space:nowrap">${Math.round(r.strike)}<br><span style="color:${hmColor};font-size:10px">${fmtN(price)}</span></td>`;
  });
  html+=`</tr>`;
  hmSrc.forEach(r1=>{
    const p1=hmType==='call'?r1.callMid:r1.putMid;
    html+=`<tr><td style="padding:4px 10px;white-space:nowrap;text-align:right;font-size:10px;line-height:1.5;color:var(--muted)">${Math.round(r1.strike)}<br><span style="color:${hmColor};font-size:10px">${fmtN(p1)}</span></td>`;
    hmSrc.forEach(r2=>{
      const p2=hmType==='call'?r2.callMid:r2.putMid;
      if(r1.strike===r2.strike){html+=`<td style="width:${cellSz}px;height:${cellH}px;background:var(--surface2)"></td>`;return;}
      if(!p1||!p2){html+=`<td style="width:${cellSz}px;height:${cellH}px;background:var(--bg);text-align:center;color:var(--dim);font-size:9px">--</td>`;return;}
      const ratio=p1/p2;
      const bg=ratColor(ratio,thLo,thHi);
      const pair=pairs.find(p=>(p.r1.strike===r1.strike&&p.r2.strike===r2.strike)||(p.r1.strike===r2.strike&&p.r2.strike===r1.strike));
      const hasSig=pair?.signals?.length>0;
      const sigIcon=hasSig?'<div style="font-size:8px;line-height:1">⚡</div>':'';
      const tooltip=`Prima ${fmtN(p1)} / Prima ${fmtN(p2)} = ${ratio.toFixed(3)}${hasSig?' — '+pair.signals.map(s=>s.label).join(', '):''}\nClick para crear estrategia en Control`;
      // Encode params for onclick — lotes: +100 S1, -round(ratio*100) S2
      const l1=100;
      const l2=-Math.round(ratio*100);
      const type=hmType;
      html+=`<td title="${tooltip}" onclick="ratCreateStrategy(${r1.strike},${p1},${l1},${r2.strike},${p2},${l2},'${type}')"
        style="width:${cellSz}px;height:${cellH}px;background:${bg};text-align:center;vertical-align:middle;color:#fff;font-weight:${hasSig?'700':'400'};cursor:pointer;font-size:11px;${hasSig?'outline:2px solid rgba(255,255,255,0.5);':''}transition:filter .1s"
        onmouseover="this.style.filter='brightness(1.25)'" onmouseout="this.style.filter=''">${ratio.toFixed(2)}${sigIcon}</td>`;
    });
    html+=`</tr>`;
  });
  html+=`</table>`;
  hm.innerHTML=html;

  // Stats inline
  const statsEl=document.getElementById('rat-stats');
  if(statsEl&&pairs.length){
    const ratios=pairs.map(p=>p.ratio);
    const avg=ratios.reduce((a,b)=>a+b,0)/ratios.length;
    statsEl.innerHTML=`
      <div><span style="color:var(--muted);font-size:9px">Pares </span><strong>${pairs.length}</strong></div>
      <div><span style="color:var(--amber);font-size:9px">Señales </span><strong style="color:var(--amber)">${pairs.filter(p=>p.signals.length).length}</strong></div>
      <div><span style="color:var(--muted);font-size:9px">Ratio prom. </span><strong>${avg.toFixed(3)}</strong></div>
      <div><span style="color:var(--muted);font-size:9px">Rango </span><strong>${Math.min(...ratios).toFixed(3)}–${Math.max(...ratios).toFixed(3)}</strong></div>`;
  }
}


function ratCreateStrategy(k1, p1, l1, k2, p2, l2, type) {
  // Abbreviate strike: 2 digits for <10000, 3 for >=10000
  const abbr = k => {
    const d = k >= 10000 ? 3 : 2;
    return Math.floor(k).toString().slice(0, d);
  };
  const ratio = p1 / p2;
  const prefix = ratio < 1 ? 'RI' : 'RC';
  // Always show lower strike first in the name
  const kLo = Math.min(k1, k2);
  const kHi = Math.max(k1, k2);
  const name = `${prefix} ${type==='call'?'C':'P'}${abbr(kLo)}/${type==='call'?'C':'P'}${abbr(kHi)}`;

  const newStrat = { name, rows: [] };
  const allStrikes = getAvailableStrikes();
  const mid = allStrikes.length ? allStrikes[Math.floor(allStrikes.length / 2)] : 0;

  // Find closest matching strike from chain
  const closest = (k) => allStrikes.reduce((p, s) => Math.abs(s-k) < Math.abs(p-k) ? s : p, allStrikes[0] || mid);

  [[l1, k1, p1], [l2, k2, p2]].forEach(([lotes, strike, precio]) => {
    newStrat.rows.push({ lotes, type, strike: closest(strike), precio, precioManual: '' });
  });

  ctrlStrategies.push(newStrat);
  ctrlSave();
  showTab('control');
  ctrlPopulateExpiry();
  renderControl();
  showToast(`Estrategia "${name}" creada en Control ✓`);
}
