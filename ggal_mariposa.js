/* ===== MÓDULO MARIPOSA ===== */

function marPopulateExpiry(){
  // Expiry driven by ST.selExpiry (set from chain tab)
}

function marComi(precio,lotes,com,iva){
  const sign=lotes>0?1:-1;
  return Math.abs(lotes)*precio*(com/100+0.002)*iva*sign;
}

function marCostoBruto(pSL,pSM,pSH,lotes){
  return (pSL - 2*pSM + pSH)*lotes*100;
}

function marCostoNeto(pSL,pSM,pSH,lotes,com,iva){
  const bruto=marCostoBruto(pSL,pSM,pSH,lotes);
  return bruto
    + marComi(pSL, lotes,com,iva)*100
    + marComi(pSM,-2*lotes,com,iva)*100
    + marComi(pSH, lotes,com,iva)*100;
}

function marRatioSimetrico(kSL,kSM,kSH){
  const dL=kSM-kSL, dH=kSH-kSM;
  if(dL<=0||dH<=0)return null;
  return{dL,dH,r:dL/dH};
}

function marCostoSimetrico(pSL,pSM,pSH,kSL,kSM,kSH){
  if(!pSL||!pSM||!pSH)return null;
  const ratio=marRatioSimetrico(kSL,kSM,kSH);
  if(!ratio)return null;
  return (pSL + ratio.r*pSH - (1+ratio.r)*pSM)*100;
}

function marCopyStrategy(row,mode,type='call'){
  const ratio=marRatioSimetrico(row.kSL,row.kSM,row.kSH);
  const r=mode==='simetrica'&&ratio?ratio.r:1;
  let lSL,lSM,lSH;
  if(mode==='estandar'){lSL=10; lSM=-20; lSH=10;}
  else{const mult=100; lSL=mult; lSM=-Math.round((1+r)*mult); lSH=Math.round(r*mult);}

  const abbr=k=>k>=10000?Math.floor(k).toString().slice(0,3):Math.floor(k).toString().slice(0,2);
  const label=mode==='simetrica'?'Simétrica':'Estándar';
  const name=`Mar ${label[0]} ${abbr(row.kSL)}/${abbr(row.kSM)}/${abbr(row.kSH)}`;
  const allStrikes=getAvailableStrikes();
  const closest=k=>allStrikes.length?allStrikes.reduce((p,s)=>Math.abs(s-k)<Math.abs(p-k)?s:p,allStrikes[0]):k;

  const newStrat={name,rows:[
    {lotes:lSL,type,strike:closest(row.kSL),precio:row.pSL,precioManual:''},
    {lotes:lSM,type,strike:closest(row.kSM),precio:row.pSM,precioManual:''},
    {lotes:lSH,type,strike:closest(row.kSH),precio:row.pSH,precioManual:''},
  ]};
  ctrlStrategies.push(newStrat);
  ctrlSave();
  showTab('control');
  ctrlPopulateExpiry();
  renderControl();
  showToast(`Mariposa ${label} "${name}" creada en Control ✓`);
}

function marBuildRows(strikes,pricesFn,wings){
  const S=ST.spot;
  const atmIdx=strikes.reduce((pi,s,i)=>Math.abs(s-S)<Math.abs(strikes[pi]-S)?i:pi,0);
  const rows=[];
  for(let si=Math.max(0,atmIdx-wings);si<=Math.min(strikes.length-1,atmIdx+wings);si++){
    const kSM=strikes[si];
    const pSM=pricesFn(kSM);
    if(!pSM||pSM<=0)continue;
    const below=strikes.slice(0,si).reverse();
    const above=strikes.slice(si+1);
    for(let off=0;off<Math.min(wings,below.length,above.length);off++){
      const kSL=below[off], kSH=above[off];
      const pSL=pricesFn(kSL), pSH=pricesFn(kSH);
      if(!pSL||pSL<=0||!pSH||pSH<=0)continue;
      rows.push({label:`${fmtStrike(kSM)} + ${off}`,kSL,kSM,kSH,pSL,pSM,pSH});
    }
  }
  return rows;
}

const MAR_TH_STYLE='padding:7px 8px;border-bottom:1px solid var(--border);font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.6px;font-weight:500;white-space:nowrap;text-align:center;color:';

function marBuildHeader(trEl){
  const cols=[
    ['var(--muted)','Mariposa'],['var(--muted)','Strike SL'],['var(--muted)','Strike SM'],
    ['var(--muted)','Strike SH'],['var(--text)','Precio SL'],['var(--text)','Precio SM'],
    ['var(--text)','Precio SH'],['var(--amber)','Costo Bruto'],['var(--amber)','Costo Neto (1×2×1)'],
    ['var(--amber)','Costo Simétrico'],['var(--muted)','Ratio Simétrico'],['var(--blue)','Construir Estrategia'],
  ];
  trEl.innerHTML=cols.map(([c,t])=>`<th style="${MAR_TH_STYLE}${c}">${t}</th>`).join('');
}

let MAR_ROWS=[];

function renderMariposa(){
  marPopulateExpiry();
  const exp=ST.selExpiry;
  if(!exp||!ST.chain[exp]){
    document.getElementById('mar-body-calls').innerHTML=
      `<tr><td colspan="12" style="padding:20px;text-align:center;color:var(--muted)">Sin datos — cargá la cadena de opciones primero</td></tr>`;
    document.getElementById('mar-body-puts').innerHTML='';
    return;
  }

  const wings=Math.max(1,parseInt(document.getElementById('mar-wings')?.value)||3);
  const threshold=Math.max(0,parseInt(document.getElementById('mar-threshold')?.value)||5000);
  const com=siteComision(), iva=siteIva();
  const chainRows=ST.chain[exp];
  const strikes=chainRows.map(r=>r.strike).sort((a,b)=>a-b);

  const callPrice=K=>{const r=chainRows.find(x=>Math.round(x.strike*100)===Math.round(K*100));return r?(r.callMid||0):0;};
  const putPrice =K=>{const r=chainRows.find(x=>Math.round(x.strike*100)===Math.round(K*100));return r?(r.putMid||0):0;};

  const callRows=marBuildRows(strikes,callPrice,wings);
  const putRows =marBuildRows(strikes,putPrice,wings);
  MAR_ROWS=[...callRows,...putRows];

  const thCalls=document.getElementById('mar-thead-calls');
  const thPuts =document.getElementById('mar-thead-puts');
  if(thCalls)marBuildHeader(thCalls);
  if(thPuts) marBuildHeader(thPuts);

  // ATM strikes for row highlighting
  const below=strikes.filter(s=>s<=ST.spot);
  const above=strikes.filter(s=>s>ST.spot);
  const atmStrikes=new Set([below.at(-1),above[0]].filter(s=>s!==undefined));

  function buildBody(rows,offset,tbodyEl,type){
    if(!rows.length){
      tbodyEl.innerHTML=`<tr><td colspan="12" style="padding:16px;text-align:center;color:var(--muted)">Sin combinaciones disponibles para los parámetros actuales</td></tr>`;
      return;
    }
    tbodyEl.innerHTML='';
    rows.forEach((row,ri)=>{
      const globalIdx=offset+ri;
      const bruto=marCostoBruto(row.pSL,row.pSM,row.pSH,1);
      const neto=marCostoNeto(row.pSL,row.pSM,row.pSH,1,com,iva);
      const simetrico=marCostoSimetrico(row.pSL,row.pSM,row.pSH,row.kSL,row.kSM,row.kSH);
      const ratio=marRatioSimetrico(row.kSL,row.kSM,row.kSH);
      const colorVal=v=>v==null?'var(--muted)':v<=0||Math.abs(v)<threshold?'var(--green)':'var(--red)';
      const ratioLabel=ratio
        ?`1 × ${(1+ratio.r).toFixed(2).replace('.',',')} × ${ratio.r.toFixed(2).replace('.',',')}`:'--';

      const tr=document.createElement('tr');
      tr.style.borderBottom='1px solid var(--border2)';
      if(atmStrikes.has(row.kSM)){
        tr.style.background='rgba(232,184,75,0.25)';
        tr.style.borderLeft='3px solid var(--amber)';
      }
      tr.innerHTML=`
        <td style="padding:4px 8px;text-align:center;color:var(--muted);white-space:nowrap">${row.label}</td>
        <td style="padding:4px 8px;text-align:center;color:var(--muted)">${fmtStrike(row.kSL)}</td>
        <td style="padding:4px 8px;text-align:center;color:var(--amber)">${fmtStrike(row.kSM)}</td>
        <td style="padding:4px 8px;text-align:center;color:var(--muted)">${fmtStrike(row.kSH)}</td>
        <td style="padding:4px 8px;text-align:center">${fmtN(row.pSL)}</td>
        <td style="padding:4px 8px;text-align:center;color:var(--amber)">${fmtN(row.pSM)}</td>
        <td style="padding:4px 8px;text-align:center">${fmtN(row.pSH)}</td>
        <td style="padding:4px 8px;text-align:center;font-weight:500;color:${colorVal(bruto)}">${fmtN(bruto)}</td>
        <td style="padding:4px 8px;text-align:center;font-weight:500;color:${colorVal(neto)}">${fmtN(neto)}</td>
        <td style="padding:4px 8px;text-align:center;font-weight:500;color:${colorVal(simetrico)}">${simetrico!=null?fmtN(simetrico):'--'}</td>
        <td style="padding:4px 8px;text-align:center;color:var(--muted);font-size:10px">${ratioLabel}</td>
        <td style="padding:4px 8px;text-align:center;white-space:nowrap">
          <button onclick="marCopyStrategy(MAR_ROWS[${globalIdx}],'estandar','${type}')"
            style="padding:2px 8px;font-size:10px;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:4px;cursor:pointer;margin-right:4px"
            onmouseover="this.style.borderColor='var(--amber)'" onmouseout="this.style.borderColor='var(--border)'">Estándar</button>
          <button onclick="marCopyStrategy(MAR_ROWS[${globalIdx}],'simetrica','${type}')"
            style="padding:2px 8px;font-size:10px;background:var(--surface2);border:1px solid var(--blue);color:var(--blue);border-radius:4px;cursor:pointer"
            onmouseover="this.style.background='rgba(90,171,255,0.1)'" onmouseout="this.style.background='var(--surface2)'">Simétrica</button>
        </td>`;
      tbodyEl.appendChild(tr);
    });
  }

  buildBody(callRows, 0,                document.getElementById('mar-body-calls'),'call');
  buildBody(putRows,  callRows.length,  document.getElementById('mar-body-puts'), 'put');
}
