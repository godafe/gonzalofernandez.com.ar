/* ===== MÓDULO RATIOS ===== */

function ratPopulateExpiry(){ populateExpirySelect('rat-expiry'); }

function ratHistAvg(k1,k2){
  if(!HIST.rows?.length)return null;
  const vals=HIST.rows.map(r=>{
    const p1=r.prices[`call_${k1}`]?.price;
    const p2=r.prices[`call_${k2}`]?.price;
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

// Delegate to shared helper — one-liner
function ratToggleHmType(){ toggleOptionType('rat-hm-type','rat-hm-type-btn',renderRatios); }

function renderRatios(){
  ratPopulateExpiry();
  const exp=document.getElementById('rat-expiry')?.value||ST.selExpiry;
  const thLo=parseFloat(document.getElementById('rat-thresh-lo')?.value)||0.30;
  const thHi=parseFloat(document.getElementById('rat-thresh-hi')?.value)||0.70;
  const thIV=parseFloat(document.getElementById('rat-thresh-iv')?.value)||5.0;
  const thParity=parseFloat(document.getElementById('rat-thresh-parity')?.value)||10;
  const onlyOpps=false;

  if(!exp||!ST.chain[exp]){
    document.getElementById('rat-body').innerHTML=
      `<tr><td colspan="9" style="padding:20px;text-align:center;color:var(--muted)">Sin datos — cargá la cadena primero</td></tr>`;
    return;
  }

  const chainRows=[...ST.chain[exp]].sort((a,b)=>a.strike-b.strike);
  const S=ST.spot;
  const T=chainRows[0]?.T||(30/365);
  const callRows=chainRows.filter(r=>r.callMid>0);

  // Build all call/call pairs (S1 < S2)
  const pairs=[];
  for(let i=0;i<callRows.length;i++){
    for(let j=i+1;j<callRows.length;j++){
      const r1=callRows[i], r2=callRows[j];
      const c1=r1.callMid, c2=r2.callMid;
      const ratio=c1/c2;
      const iv1=impliedVol(S,r1.strike,T,ST.rate,ST.q,c1,'call')||null;
      const iv2=impliedVol(S,r2.strike,T,ST.rate,ST.q,c2,'call')||null;
      const dIV=(iv1&&iv2)?(iv1-iv2)*100:null;
      const p1=r1.putMid, p2=r2.putMid;
      let parityViol1=null, parityViol2=null;
      if(p1>0&&c1>0){const theo=S*Math.exp(-ST.q*T)-r1.strike*Math.exp(-ST.rate*T);parityViol1=Math.abs((c1-p1)-theo);}
      if(p2>0&&c2>0){const theo=S*Math.exp(-ST.q*T)-r2.strike*Math.exp(-ST.rate*T);parityViol2=Math.abs((c2-p2)-theo);}
      const hist=ratHistAvg(r1.strike,r2.strike);
      const signals=[];
      if(ratio<=thLo||ratio>=thHi)signals.push({label:'RC',color:ratio<=thLo?'var(--blue)':'var(--red)'});
      if(dIV!=null&&Math.abs(dIV)>=thIV)signals.push({label:'ΔIV',color:'var(--green)'});
      if(parityViol1!=null&&parityViol1>=thParity)signals.push({label:'PC S1',color:'var(--amber)'});
      if(parityViol2!=null&&parityViol2>=thParity)signals.push({label:'PC S2',color:'var(--amber)'});
      pairs.push({r1,r2,c1,c2,ratio,iv1,iv2,dIV,parityViol1,parityViol2,hist,dHist:hist?ratio-hist:null,signals});
    }
  }

  // Summary signals bar
  const sigBar=document.getElementById('rat-signals');
  if(sigBar){
    sigBar.innerHTML=[
      ['RC fuera de rango', pairs.filter(p=>p.signals.some(s=>s.label==='RC')).length,   'var(--red)'],
      ['Δ IV anómala',      pairs.filter(p=>p.signals.some(s=>s.label.startsWith('ΔIV'))).length, 'var(--green)'],
      ['Paridad violada',   pairs.filter(p=>p.signals.some(s=>s.label.startsWith('PC'))).length,  'var(--amber)'],
    ].map(([label,n,color])=>`
      <div style="padding:5px 14px;background:var(--surface);border:2px solid ${color.replace(')',',0.3)')};border-radius:20px;font-size:11px;color:${color};font-family:var(--mono)">
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
    if(!curBase&&callRows.length){
      const atm=callRows.reduce((p,r)=>Math.abs(r.strike-S)<Math.abs(p.strike-S)?r:p,callRows[0]);
      baseSel.value=atm.strike;
    }
  }
  const baseStrike=parseFloat(document.getElementById('rat-base')?.value)||0;
  const baseRow=callRows.find(r=>Math.round(r.strike*100)===Math.round(baseStrike*100));

  // Ratio+N table
  const tb=document.getElementById('rat-body');
  tb.innerHTML='';
  if(!baseRow||!callRows.length){
    tb.innerHTML=`<tr><td colspan="5" style="padding:16px;text-align:center;color:var(--muted)">Seleccioná una base</td></tr>`;
  } else {
    const baseIdx=callRows.indexOf(baseRow);
    callRows.forEach((row,i)=>{
      if(i===baseIdx)return;
      const r1=callRows[i]?.callMid||0;
      const rN=n=>{const t=callRows[i+n];return t?.callMid>0?r1/t.callMid:null;};
      const fmtR=v=>{
        if(v==null)return'<span style="color:var(--dim)">--</span>';
        return`<span style="font-weight:600;color:${ratColor(v,thLo,thHi)}">${v.toFixed(2)}</span>`;
      };
      const offset=i-baseIdx;
      const strikeColor=offset<0?'var(--blue)':offset===0?'var(--amber)':'var(--muted)';
      const tr=document.createElement('tr');
      tr.style.borderBottom='2px solid var(--border2)';
      if(row.strike===baseStrike)tr.style.background='rgba(232,184,75,0.08)';
      tr.innerHTML=`
        <td style="padding:4px 10px;text-align:center;color:${strikeColor}">${fmtStrike(row.strike)}</td>
        <td style="padding:4px 10px;text-align:center;color:var(--amber)">${fmtN(row.callMid)}</td>
        <td style="padding:4px 10px;text-align:center">${fmtR(rN(1))}</td>
        <td style="padding:4px 10px;text-align:center">${fmtR(rN(2))}</td>
        <td style="padding:4px 10px;text-align:center">${fmtR(rN(3))}</td>`;
      tb.appendChild(tr);
    });
  }

  // Heatmap
  const hmType=document.getElementById('rat-hm-type')?.value||'call';
  const hmPool=hmType==='call'?callRows:chainRows.filter(r=>r.putMid>0);
  const below=hmPool.filter(r=>r.strike<=S).slice(-8);
  const above=hmPool.filter(r=>r.strike>S).slice(0,8);
  const hmSrc=[...below,...above];
  const hm=document.getElementById('rat-heatmap');
  if(!hm||hmSrc.length<2)return;

  const cellSz=Math.min(64,Math.floor((window.innerWidth-320)/hmSrc.length));
  const cellH=Math.round(cellSz*0.65);
  const hmColor=hmType==='call'?'var(--green)':'var(--red)';

  let html=`<table style="border-collapse:collapse;font-size:10px;font-family:var(--mono);margin:0 auto">
    <tr><td style="padding:4px 8px;color:var(--dim);font-size:9px;white-space:nowrap;text-align:right">Prima S1 /<br>Prima S2</td>`;
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
      if(r1.strike===r2.strike){html+=`<td style="width:${cellSz}px;height:${cellH}px;background:var(--surface2);border:5px solid rgba(255,255,255,0.12)"></td>`;return;}
      if(!p1||!p2){html+=`<td style="width:${cellSz}px;height:${cellH}px;background:var(--bg);text-align:center;color:var(--dim);font-size:9px;border:5px solid rgba(255,255,255,0.08)">--</td>`;return;}
      const ratio=p1/p2;
      const bg=ratColor(ratio,thLo,thHi);
      const l1=100, l2=-Math.round(ratio*100);
      const tooltip=`Prima ${fmtN(p1)} / Prima ${fmtN(p2)} = ${ratio.toFixed(3)}`;
      html+=`<td title="${tooltip}" onclick="ratCreateStrategy(${r1.strike},${p1},${l1},${r2.strike},${p2},${l2},'${hmType}')"
        style="width:${cellSz}px;height:${cellH}px;background:${bg};text-align:center;vertical-align:middle;color:#fff;font-weight:400;cursor:pointer;font-size:11px;border:5px solid rgba(255,255,255,0.18);transition:filter .1s"
        onmouseover="this.style.filter='brightness(1.25)'" onmouseout="this.style.filter=''">${ratio.toFixed(2)}</td>`;
    });
    html+=`</tr>`;
  });
  html+=`</table>`;
  hm.innerHTML=html;

  // Stats hidden
  const statsEl=document.getElementById('rat-stats');
  if(statsEl) statsEl.innerHTML='';
}

function ratCreateStrategy(k1,p1,l1,k2,p2,l2,type){
  const abbr=k=>{const d=k>=10000?3:2;return Math.floor(k).toString().slice(0,d);};
  const ratio=p1/p2;
  const prefix=ratio<1?'RI':'RC';
  const kLo=Math.min(k1,k2), kHi=Math.max(k1,k2);
  const t=type==='call'?'C':'P';
  const name=`${prefix} ${t}${abbr(kLo)}/${t}${abbr(kHi)}`;
  const allStrikes=getAvailableStrikes();
  const closest=k=>allStrikes.reduce((p,s)=>Math.abs(s-k)<Math.abs(p-k)?s:p,allStrikes[0]||k);
  ctrlStrategies.push({name,rows:[
    {lotes:l1,type,strike:closest(k1),precio:p1,precioManual:''},
    {lotes:l2,type,strike:closest(k2),precio:p2,precioManual:''},
  ]});
  ctrlSave();
  showTab('control');
  ctrlPopulateExpiry();
  renderControl();
  showToast(`Estrategia "${name}" creada en Control ✓`);
}
