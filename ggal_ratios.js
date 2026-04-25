/* ===== MODULO RATIOS ===== */

function ratPopulateExpiry(){ populateExpirySelect('rat-expiry'); }

function ratHistAvg(k1,k2,type='call'){
  if(!HIST.rows?.length)return null;
  const vals=HIST.rows.map(r=>{
    const p1=r.prices[`${type}_${k1}`]?.price;
    const p2=r.prices[`${type}_${k2}`]?.price;
    return(p1>0&&p2>0)?p1/p2:null;
  }).filter(v=>v!=null);
  if(!vals.length)return null;
  return vals.reduce((a,b)=>a+b,0)/vals.length;
}

function ratRecentStats(k1,k2,type,currentRatio){
  if(!HIST.rows?.length)return{percentileRecent:null,mean20:null,median20:null,dev20:null,sampleSize:0};
  const vals=HIST.rows.map(r=>{
    const p1=r.prices[`${type}_${k1}`]?.price;
    const p2=r.prices[`${type}_${k2}`]?.price;
    return(p1>0&&p2>0)?p1/p2:null;
  }).filter(v=>v!=null);
  if(!vals.length)return{percentileRecent:null,mean20:null,median20:null,dev20:null,sampleSize:0};
  const recent=vals;
  const mean20=recent.reduce((a,b)=>a+b,0)/recent.length;
  const sorted=[...recent].sort((a,b)=>a-b);
  const mid=Math.floor(sorted.length/2);
  const median20=sorted.length%2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
  const leCount=recent.filter(v=>v<=currentRatio).length;
  const percentileRecent=recent.length?(leCount/recent.length)*100:null;
  const dev20=(mean20>0&&isFinite(currentRatio))?((currentRatio/mean20)-1)*100:null;
  return{percentileRecent,mean20,median20,dev20,sampleSize:recent.length};
}

function ratCoverageText(ratio){
  if(ratio==null || !isFinite(ratio))return'--';
  return `${ratio.toFixed(2)}x`;
}

function ratColor(ratio,lo,hi,riLo,riHi){
  if(ratio<1){
    if(ratio<=riLo)return'rgba(176,136,240,0.88)';
    if(ratio<=riHi)return'rgba(90,171,255,0.85)';
    return'rgba(59,201,196,0.85)';
  }
  if(ratio<=lo)return'rgba(68,199,106,0.8)';
  if(ratio<=hi)return'rgba(232,184,75,0.85)';
  return'rgba(240,90,90,0.85)';
}

function ratRatioTextColor(ratio,lo,hi,riLo,riHi){
  if(ratio==null || !isFinite(ratio))return'var(--muted)';
  if(ratio<1){
    if(ratio<=riLo)return'#f7efff';
    if(ratio<=riHi)return'#eff7ff';
    return'#042a27';
  }
  if(ratio<=lo)return'#062816';
  if(ratio<=hi)return'#372500';
  return'#fff4f4';
}

function ratGetMode(){
  const mode=(localStorage.getItem('rat_mode')||'').trim();
  return mode==='chain' ? 'chain' : 'cuadro';
}

function ratSetMode(mode){
  localStorage.setItem('rat_mode',mode==='chain'?'chain':'cuadro');
  renderRatios();
}

function ratSyncModeUi(){
  const mode=ratGetMode();
  const btnCuadro=document.getElementById('rat-mode-cuadro');
  const btnChain=document.getElementById('rat-mode-chain');
  const ctlCuadro=document.getElementById('rat-controls-cuadro');
  const ctlChain=document.getElementById('rat-controls-chain');
  const viewCuadro=document.getElementById('rat-cuadro-view');
  const viewChain=document.getElementById('rat-chain-view');
  const activeStyle=(active)=>active
    ? 'background:rgba(255,215,90,.14);border-color:rgba(255,215,90,.55);color:var(--amber)'
    : 'background:var(--surface2);border-color:var(--border);color:var(--text)';
  if(btnCuadro) btnCuadro.style.cssText = btnCuadro.style.cssText.replace(/background:[^;]+;?/g,'').replace(/border-color:[^;]+;?/g,'').replace(/color:[^;]+;?/g,'') + ';' + activeStyle(mode==='cuadro');
  if(btnChain) btnChain.style.cssText = btnChain.style.cssText.replace(/background:[^;]+;?/g,'').replace(/border-color:[^;]+;?/g,'').replace(/color:[^;]+;?/g,'') + ';' + activeStyle(mode==='chain');
  if(ctlCuadro) ctlCuadro.style.display=mode==='cuadro'?'flex':'none';
  if(ctlChain) ctlChain.style.display=mode==='chain'?'flex':'none';
  if(viewCuadro) viewCuadro.style.display=mode==='cuadro'?'block':'none';
  if(viewChain) viewChain.style.display=mode==='chain'?'block':'none';
}

function ratPriceForRow(row,type){
  return type==='put' ? row?.putMid : row?.callMid;
}

function ratIvForRow(row,S,T,type){
  const price=ratPriceForRow(row,type);
  if(!(price>0))return null;
  return impliedVol(S,row.strike,T,ST.rate,ST.q,price,type)||null;
}

function ratParityViolation(row,S,T){
  if(!(row?.callMid>0) || !(row?.putMid>0))return null;
  const theo=S*Math.exp(-ST.q*T)-row.strike*Math.exp(-ST.rate*T);
  return Math.abs((row.callMid-row.putMid)-theo);
}

function ratBuildPair(baseRow,row2,type,S,T){
  const p1=ratPriceForRow(baseRow,type);
  const p2=ratPriceForRow(row2,type);
  if(!(p1>0) || !(p2>0))return null;
  const ratio=p1/p2;
  const iv1=ratIvForRow(baseRow,S,T,type);
  const iv2=ratIvForRow(row2,S,T,type);
  const recent=ratRecentStats(baseRow.strike,row2.strike,type,ratio);
  return {
    k1:baseRow.strike,
    k2:row2.strike,
    p1,p2,ratio,iv1,iv2,
    dIV:(iv1!=null&&iv2!=null)?(iv1-iv2)*100:null,
    parityViol1:ratParityViolation(baseRow,S,T),
    parityViol2:ratParityViolation(row2,S,T),
    percentileRecent:recent.percentileRecent,
    mean20:recent.mean20,
    median20:recent.median20,
    dev20:recent.dev20,
    recentSample:recent.sampleSize,
  };
}

function ratBuildSignals(pairs,thLo,thHi,thRiLo,thRiHi,thIV,thParity){
  return pairs.map(p=>{
    const signals=[];
    if(p.ratio<=thRiLo||p.ratio>=thHi)signals.push({label:'RC',color:p.ratio<1?'#b088f0':'var(--red)'});
    if(p.dIV!=null&&Math.abs(p.dIV)>=thIV)signals.push({label:'D IV',color:'var(--green)'});
    if(p.parityViol1!=null&&p.parityViol1>=thParity)signals.push({label:'PC S1',color:'var(--amber)'});
    if(p.parityViol2!=null&&p.parityViol2>=thParity)signals.push({label:'PC S2',color:'var(--amber)'});
    return {...p,signals};
  });
}

function ratToggleHmType(){ toggleOptionType('rat-hm-type','rat-hm-type-btn',renderRatios); }

function ratPopulateBaseSelector(rows,type,S){
  const baseSel=document.getElementById('rat-base');
  if(!baseSel)return;
  const curBase=parseFloat(baseSel.value)||0;
  baseSel.innerHTML='';
  rows.forEach(r=>{
    const o=document.createElement('option');
    o.value=r.strike;
    o.textContent=`${fmtStrike(r.strike)} - ${fmtN(ratPriceForRow(r,type))}`;
    if(Math.round(r.strike*100)===Math.round(curBase*100))o.selected=true;
    baseSel.appendChild(o);
  });
  if(!curBase&&rows.length){
    const atm=rows.reduce((p,r)=>Math.abs(r.strike-S)<Math.abs(p.strike-S)?r:p,rows[0]);
    baseSel.value=atm.strike;
  }
}

function ratRenderSignals(pairs){
  const sigBar=document.getElementById('rat-signals');
  if(!sigBar)return;
  sigBar.innerHTML=[
    ['RC fuera de rango', pairs.filter(p=>p.signals.some(s=>s.label==='RC')).length, 'var(--red)'],
    ['D IV anomala', pairs.filter(p=>p.signals.some(s=>s.label==='D IV')).length, 'var(--green)'],
    ['Paridad violada', pairs.filter(p=>p.signals.some(s=>s.label.startsWith('PC'))).length, 'var(--amber)'],
  ].map(([label,n,color])=>`
    <div style="padding:5px 14px;background:var(--surface);border:2px solid ${color.replace(')',',0.3)')};border-radius:20px;font-size:11px;color:${color};font-family:var(--mono)">
      <strong>${n}</strong> <span style="color:var(--muted);font-size:10px">${label}</span>
    </div>`).join('');
}

function ratWindowAroundBase(rows, baseStrike, maxCount=15){
  const src=[...rows].sort((a,b)=>a.strike-b.strike);
  if(!src.length)return[];
  const idx=Math.max(0, src.findIndex(r=>Math.round(r.strike*100)===Math.round(baseStrike*100)));
  let start=Math.max(0, idx-Math.floor(maxCount/2));
  let end=Math.min(src.length, start+maxCount);
  if(end-start<maxCount){
    start=Math.max(0, end-maxCount);
  }
  return src.slice(start,end);
}

function ratRenderCuadro(rows,type,S,lo,hi,riLo,riHi){
  const hm=document.getElementById('rat-heatmap');
  const titleEl=document.getElementById('rat-cuadro-title');
  if(titleEl) titleEl.textContent=`Mapa de calor - Ratio ${type==='put'?'Put/Put':'Call/Call'}`;
  if(!hm)return;
  const selectedBase=parseFloat(document.getElementById('rat-base')?.value)||0;
  const anchorStrike=selectedBase>0 ? selectedBase : (rows.reduce((p,r)=>Math.abs(r.strike-S)<Math.abs(p.strike-S)?r:p,rows[0]||{strike:S})?.strike||S);
  const hmSrc=ratWindowAroundBase(rows,anchorStrike,15);
  if(hmSrc.length<2){ hm.innerHTML=''; return; }

  const cellSz=Math.min(64,Math.floor((window.innerWidth-320)/hmSrc.length));
  const cellH=Math.round(cellSz*0.65);
  const hmColor=type==='call'?'var(--green)':'var(--red)';

  let html=`<table style="border-collapse:collapse;font-size:10px;font-family:var(--mono);margin:0 auto">
    <tr><td style="padding:4px 8px;color:var(--dim);font-size:9px;white-space:nowrap;text-align:right">Prima S1 /<br>Prima S2</td>`;
  hmSrc.forEach(r=>{
    const price=ratPriceForRow(r,type);
    html+=`<td style="width:${cellSz}px;padding:4px 4px;text-align:center;color:var(--muted);font-size:10px;line-height:1.5;white-space:nowrap">${Math.round(r.strike)}<br><span style="color:${hmColor};font-size:10px">${fmtN(price)}</span></td>`;
  });
  html+=`</tr>`;

  hmSrc.forEach(r1=>{
    const p1=ratPriceForRow(r1,type);
    html+=`<tr><td style="padding:4px 10px;white-space:nowrap;text-align:right;font-size:10px;line-height:1.5;color:var(--muted)">${Math.round(r1.strike)}<br><span style="color:${hmColor};font-size:10px">${fmtN(p1)}</span></td>`;
    hmSrc.forEach(r2=>{
      const p2=ratPriceForRow(r2,type);
      if(r1.strike===r2.strike){html+=`<td style="width:${cellSz}px;height:${cellH}px;background:var(--surface2);border:5px solid rgba(255,255,255,0.12)"></td>`;return;}
      if(!p1||!p2){html+=`<td style="width:${cellSz}px;height:${cellH}px;background:var(--bg);text-align:center;color:var(--dim);font-size:9px;border:5px solid rgba(255,255,255,0.08)">--</td>`;return;}
      const ratio=p1/p2;
      const bg=ratColor(ratio,lo,hi,riLo,riHi);
      const l1=100, l2=-Math.round(ratio*100);
      const tooltip=`Prima ${fmtN(p1)} / Prima ${fmtN(p2)} = ${ratio.toFixed(3)} | Cobertura S2: ${ratCoverageText(ratio)}`;
      html+=`<td title="${tooltip}" onclick="ratCreateStrategy(${r1.strike},${p1},${l1},${r2.strike},${p2},${l2},'${type}')"
        style="width:${cellSz}px;height:${cellH}px;background:${bg};text-align:center;vertical-align:middle;color:#fff;font-weight:600;cursor:pointer;font-size:11px;border:5px solid rgba(255,255,255,0.18);transition:filter .1s"
        onmouseover="this.style.filter='brightness(1.25)'" onmouseout="this.style.filter=''">${ratio.toFixed(2)}</td>`;
    });
    html+=`</tr>`;
  });
  html+=`</table>`;
  hm.innerHTML=html;
}

function ratRenderRatioTable(rows,type,S,lo,hi,riLo,riHi){
  const tb=document.getElementById('rat-body');
  if(!tb)return;
  tb.innerHTML='';
  const baseStrike=parseFloat(document.getElementById('rat-base')?.value)||0;
  const baseRow=rows.find(r=>Math.round(r.strike*100)===Math.round(baseStrike*100));
  if(!baseRow||!rows.length){
    tb.innerHTML=`<tr><td colspan="5" style="padding:16px;text-align:center;color:var(--muted)">Selecciona una base</td></tr>`;
    return;
  }
  const baseIdx=rows.indexOf(baseRow);
  rows.forEach((row,i)=>{
    if(i===baseIdx)return;
    const p1=ratPriceForRow(rows[i],type)||0;
    const rN=n=>{
      const t=rows[i+n];
      const p2=ratPriceForRow(t||{},type);
      return p2>0?p1/p2:null;
    };
      const fmtR=v=>{
        if(v==null)return'<span style="color:var(--dim)">--</span>';
        return`<span style="font-weight:600;color:${ratColor(v,lo,hi,riLo,riHi)}">${v.toFixed(2)}</span>`;
      };
    const offset=i-baseIdx;
    const strikeColor=offset<0?'var(--blue)':offset===0?'var(--amber)':'var(--muted)';
    const tr=document.createElement('tr');
    tr.style.borderBottom='2px solid var(--border2)';
    if(row.strike===baseStrike)tr.style.background='rgba(232,184,75,0.08)';
    tr.innerHTML=`
      <td style="padding:4px 10px;text-align:center;color:${strikeColor}">${fmtStrike(row.strike)}</td>
      <td style="padding:4px 10px;text-align:center;color:var(--amber)">${fmtN(ratPriceForRow(row,type))}</td>
      <td style="padding:4px 10px;text-align:center">${fmtR(rN(1))}</td>
      <td style="padding:4px 10px;text-align:center">${fmtR(rN(2))}</td>
      <td style="padding:4px 10px;text-align:center">${fmtR(rN(3))}</td>`;
    tb.appendChild(tr);
  });
}

function rat2RatioChips(cands,lo,hi,riLo,riHi){
  const chips=[0,1,2,3].map(i=>{
    const c=(cands&&cands[i])?cands[i]:null;
    const ratio=c&&isFinite(c.ratio)?c.ratio:null;
    const bg=(ratio==null)?'rgba(255,255,255,.06)':ratColor(ratio,lo,hi,riLo,riHi);
    const fg=ratRatioTextColor(ratio,lo,hi,riLo,riHi);
    const txt=(ratio==null)?'--':ratio.toFixed(2);
    const ttl=!c ? 'Strike 2: --, Ratio: --' : `Strike 2: ${fmtStrike(c.k2)}, Ratio: ${c.ratio.toFixed(3)}, Precio S2: ${fmtN(c.p2,2)}, Cobertura S2: ${ratCoverageText(c.ratio)}`;
    return `<span title="${ttl}" style="display:inline-flex;align-items:center;justify-content:center;min-width:44px;height:24px;padding:0 8px;border-radius:999px;background:${bg};box-shadow:inset 0 0 0 1px rgba(255,255,255,.10);color:${fg};text-shadow:0 1px 0 rgba(0,0,0,.10);font-size:10px;font-weight:700;white-space:nowrap;opacity:${c?0.98:0.35}">${txt}</span>`;
  }).join('');
  return `<div style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap">${chips}</div>`;
}

function rat2BuildPairsTable(title,color,rows,lo,hi,riLo,riHi){
  if(!rows.length){
    return `<div style="padding:10px 12px;color:var(--muted)">Sin pares disponibles</div>`;
  }
  const th='padding:6px 8px;border-bottom:1px solid var(--border2);font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);text-align:center;white-space:nowrap';
  const td='padding:6px 8px;border-bottom:1px solid var(--border2);text-align:center;white-space:nowrap';
  const fmtSignedPct=v=>{
    if(v==null||!isFinite(v))return'--';
    return `${v>=0?'+':''}${fmtN(v,2)}%`;
  };
  return `
    <div style="border:1px solid var(--border2);border-radius:8px;overflow:hidden;background:rgba(255,255,255,.02)">
      <div style="padding:8px 10px;border-bottom:1px solid var(--border2);display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:${color};font-weight:600">${title}</div>
      </div>
      <div style="overflow:auto">
        <table style="width:100%;border-collapse:collapse;font-family:var(--mono);font-size:11px">
          <thead style="background:var(--surface2)">
            <tr>
              <th title="Strike 2 {Strike de la segunda base comparada contra la base actual}" style="${th};color:${color}">Strike 2</th>
              <th title="Precio S2 {Prima actual de la segunda base del par}" style="${th}">Precio S2</th>
              <th title="Ratio {Relacion entre la prima base y la prima de Strike 2}" style="${th}">Ratio</th>
              <th title="Cob. S2 {Cuantos lotes de S2 podes comprar vendiendo 1 lote de la base al precio actual}" style="${th}">Cob. S2</th>
              <th title="IV Base {Volatilidad implicita de la base actual}" style="${th}">IV Base</th>
              <th title="IV S2 {Volatilidad implicita de la segunda base}" style="${th}">IV S2</th>
              <th title="D IV {Diferencia de volatilidad implicita entre Base y S2}" style="${th}">D IV</th>
              <th title="Media Hist. {Promedio del ratio con todos los datos historicos disponibles}" style="${th}">Media Hist.</th>
              <th title="Mediana Hist. {Valor central del ratio con todos los datos historicos disponibles}" style="${th}">Mediana Hist.</th>
              <th title="Pct Hist. {Percentil del ratio actual dentro de todos los datos historicos disponibles}" style="${th}">Pct Hist.</th>
              <th title="Desv Hist. {Desvio porcentual del ratio actual contra la Media Historica}" style="${th}">Desv Hist.</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r=>{
              const bg=ratColor(r.ratio,lo,hi,riLo,riHi);
              const fg=ratRatioTextColor(r.ratio,lo,hi,riLo,riHi);
              return `
                <tr>
                  <td style="${td};color:${color};font-weight:600">${fmtStrike(r.k2)}</td>
                  <td style="${td};color:${color}">${fmtN(r.p2,2)}</td>
                  <td style="${td}"><span style="display:inline-flex;align-items:center;justify-content:center;min-width:50px;height:22px;padding:0 8px;border-radius:999px;background:${bg};color:${fg};font-weight:700">${r.ratio.toFixed(2)}</span></td>
                  <td style="${td};color:${r.ratio<1?'#8fb8ff':'var(--text)'}">${ratCoverageText(r.ratio)}</td>
                  <td style="${td}">${r.iv1!=null?(r.iv1*100).toFixed(2)+'%':'--'}</td>
                  <td style="${td}">${r.iv2!=null?(r.iv2*100).toFixed(2)+'%':'--'}</td>
                  <td style="${td};color:${r.dIV==null?'var(--muted)':(Math.abs(r.dIV)>=5?'var(--amber)':'var(--text)')}">${r.dIV!=null?fmtSignedPct(r.dIV):'--'}</td>
                  <td style="${td}">${r.mean20!=null?fmtN(r.mean20,2):'--'}</td>
                  <td style="${td}">${r.median20!=null?fmtN(r.median20,2):'--'}</td>
                  <td style="${td};color:${r.percentileRecent==null?'var(--muted)':(r.percentileRecent>=80?'var(--red)':r.percentileRecent<=20?'var(--green)':'var(--text)')}">${r.percentileRecent!=null?fmtN(r.percentileRecent,0)+'%':'--'}</td>
                  <td style="${td};color:${r.dev20==null?'var(--muted)':(r.dev20>=0?'var(--green)':'var(--red)')}">${r.dev20!=null?fmtSignedPct(r.dev20):'--'}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function ratRenderCadena(rows,type,S,T,lo,hi,riLo,riHi){
  const body=document.getElementById('rat2-body');
  if(!body)return;
  if(!rows.length){
    body.innerHTML=`<tr><td colspan="7" style="padding:18px;text-align:center;color:var(--muted)">Sin bases con precio para este tipo</td></tr>`;
    return;
  }
  const filter=document.getElementById('rat2-filter')?.value||'near25';
  const src=[...rows].sort((a,b)=>a.strike-b.strike);
  const visible=(filter==='near25') ? src.filter(r=>Math.abs(r.strike-S)/S<=0.25) : src;
  const allStrikes=src.map(r=>r.strike);
  let lowATM, highATM;
  for(const k of allStrikes){
    if(k<=S) lowATM=k;
    else { highATM=k; break; }
  }
  const atmSet=new Set([lowATM,highATM].filter(v=>v!==undefined));
  const state=window.RAT2||(window.RAT2={open:new Map(),bound:false});
  if(!state.bound){
    state.bound=true;
    body.addEventListener('click',e=>{
      const btn=e.target.closest('[data-rat2-toggle]');
      if(!btn)return;
      const key=btn.dataset.rat2K;
      const side=btn.dataset.rat2Toggle;
      const cur=state.open.get(key)||{down:false,up:false};
      if(side==='down') cur.down=!cur.down;
      if(side==='up') cur.up=!cur.up;
      state.open.set(key,cur);
      if(!cur.down&&!cur.up) state.open.delete(key);
      renderRatios();
    });
  }

  const tdBase='padding:6px 8px;border-bottom:1px solid var(--border2);text-align:center;white-space:nowrap;';
  const strikeTd=tdBase+'border-left:1px solid var(--border);border-right:1px solid var(--border);font-weight:600;color:var(--amber);';
  const leftSepTd=tdBase+'border-right:1px solid var(--border);';
  const plusStyle='padding:2px 0;width:26px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);cursor:pointer;font-size:12px;line-height:18px';

  body.innerHTML=visible.map(row=>{
    const key=String(row.strike);
    const open=state.open.get(key)||{down:false,up:false};
    const price=ratPriceForRow(row,type);
    const priceColor=type==='call'?'var(--green)':'var(--red)';
    const idx=src.findIndex(r=>r.strike===row.strike);
    const downCands=src.slice(Math.max(0,idx-4),idx).reverse().map(r2=>ratBuildPair(row,r2,type,S,T)).filter(Boolean);
    const upCands=src.slice(idx+1,idx+5).map(r2=>ratBuildPair(row,r2,type,S,T)).filter(Boolean);
    const atmBg=atmSet.has(row.strike)?'background:var(--atm-row);':'';
    const priceHtml=price>0?`<span style="color:${priceColor};font-weight:600">${fmtN(price,2)}</span>`:'--';
    const baseRow=`
      <tr>
        <td style="${tdBase};width:34px;${atmBg}">
          <button type="button" data-rat2-toggle="down" data-rat2-k="${key}" title="${open.down?'Cerrar bases abajo':'Abrir bases abajo'}" style="${plusStyle}">${open.down?'-':'+'}</button>
        </td>
        <td style="${tdBase};${atmBg}">${priceHtml}</td>
        <td style="${leftSepTd};${atmBg}">${rat2RatioChips(downCands,lo,hi,riLo,riHi)}</td>
        <td style="${strikeTd};${atmBg}">${fmtStrike(row.strike)}</td>
        <td style="${tdBase};${atmBg}">${rat2RatioChips(upCands,lo,hi,riLo,riHi)}</td>
        <td style="${tdBase};${atmBg}">${priceHtml}</td>
        <td style="${tdBase};width:34px;${atmBg}">
          <button type="button" data-rat2-toggle="up" data-rat2-k="${key}" title="${open.up?'Cerrar bases arriba':'Abrir bases arriba'}" style="${plusStyle}">${open.up?'-':'+'}</button>
        </td>
      </tr>`;
    if(!open.down && !open.up) return baseRow;
    const panels=[];
    if(open.down) panels.push(rat2BuildPairsTable('Bases abajo (-1/-2/-3/-4)', 'var(--blue)', downCands, lo, hi, riLo, riHi));
    if(open.up) panels.push(rat2BuildPairsTable('Bases arriba (+1/+2/+3/+4)', 'var(--green)', upCands, lo, hi, riLo, riHi));
    return baseRow + `
      <tr>
        <td colspan="7" style="padding:10px 12px;border-bottom:1px solid var(--border2);background:rgba(0,0,0,.12)">
          <div style="display:grid;grid-template-columns:repeat(${panels.length},minmax(0,1fr));gap:10px">
            ${panels.join('')}
          </div>
        </td>
      </tr>`;
  }).join('');
}

function renderRatios(){
  ratSyncModeUi();
  ratPopulateExpiry();
  const exp=document.getElementById('rat-expiry')?.value||ST.selExpiry;
  const thLo=parseFloat(document.getElementById('rat-thresh-lo')?.value)||1.50;
  const thHi=parseFloat(document.getElementById('rat-thresh-hi')?.value)||2.50;
  const thRiLo=parseFloat(document.getElementById('rat-thresh-ri-lo')?.value)||0.30;
  const thRiHi=parseFloat(document.getElementById('rat-thresh-ri-hi')?.value)||0.50;
  const thIV=parseFloat(document.getElementById('rat-thresh-iv')?.value)||5.0;
  const thParity=parseFloat(document.getElementById('rat-thresh-parity')?.value)||10;
  const type=document.getElementById('rat-hm-type')?.value||'call';

  if(!exp||!ST.chain[exp]){
    const tb=document.getElementById('rat-body');
    const chainBody=document.getElementById('rat2-body');
    const hm=document.getElementById('rat-heatmap');
    if(tb) tb.innerHTML=`<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--muted)">Sin datos - carga la cadena primero</td></tr>`;
    if(chainBody) chainBody.innerHTML=`<tr><td colspan="7" style="padding:20px;text-align:center;color:var(--muted)">Sin datos - carga la cadena primero</td></tr>`;
    if(hm) hm.innerHTML='';
    return;
  }

  const chainRows=[...ST.chain[exp]].sort((a,b)=>a.strike-b.strike);
  const S=ST.spot;
  const T=chainRows[0]?.T||(30/365);
  const typedRows=(type==='put'?chainRows.filter(r=>r.putMid>0):chainRows.filter(r=>r.callMid>0));
  const pairs=[];
  for(let i=0;i<typedRows.length;i++){
    for(let j=i+1;j<typedRows.length;j++){
      const pair=ratBuildPair(typedRows[i],typedRows[j],type,S,T);
      if(pair)pairs.push(pair);
    }
  }
  const enrichedPairs=ratBuildSignals(pairs,thLo,thHi,thRiLo,thRiHi,thIV,thParity);
  ratRenderSignals(enrichedPairs);
  ratPopulateBaseSelector(typedRows,type,S);
  ratRenderCuadro(typedRows,type,S,thLo,thHi,thRiLo,thRiHi);
  ratRenderRatioTable(typedRows,type,S,thLo,thHi,thRiLo,thRiHi);
  ratRenderCadena(typedRows,type,S,T,thLo,thHi,thRiLo,thRiHi);
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
  showToast(`Estrategia "${name}" creada en Control OK`);
}
