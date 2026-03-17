/* ===== MÓDULO MARIPOSA ===== */

function marPopulateExpiry(){
  const sel=document.getElementById('mar-expiry');
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

// Commission cost for one leg (buy=+1, sell=-1)
function marComi(precio,lotes,com,iva){
  const sign=lotes>0?1:-1;
  return Math.abs(lotes)*precio*(com/100+0.002)*iva*sign;
}

function marCostoBruto(pSL,pSM,pSH,lotes){
  // Standard butterfly: +1 SL, -2 SM, +1 SH (scaled by lotes)
  return (pSL - 2*pSM + pSH)*lotes*100;
}

function marCostoNeto(pSL,pSM,pSH,lotes,com,iva){
  const bruto=marCostoBruto(pSL,pSM,pSH,lotes);
  // Commission on each leg
  const cSL =marComi(pSL, lotes,com,iva)*100;
  const cSM =marComi(pSM,-2*lotes,com,iva)*100;
  const cSH =marComi(pSH, lotes,com,iva)*100;
  return bruto+cSL+cSM+cSH;
}

function marRatioSimetrico(kSL,kSM,kSH){
  const dL=kSM-kSL;
  const dH=kSH-kSM;
  if(dL<=0||dH<=0)return null;
  return{dL,dH,r:dL/dH};
}

function marCostoSimetrico(pSL,pSM,pSH,kSL,kSM,kSH){
  if(!pSL||!pSM||!pSH)return null;
  const ratio=marRatioSimetrico(kSL,kSM,kSH);
  if(!ratio)return null;
  const r=ratio.r;
  // Formula: (pSL + r*pSH - (1+r)*pSM) * 100
  return (pSL + r*pSH - (1+r)*pSM)*100;
}

function marCopyStrategy(row,mode){
  const ratio=marRatioSimetrico(row.kSL,row.kSM,row.kSH);
  const r=mode==='simetrica'&&ratio?ratio.r:1;

  let lSL,lSM,lSH;
  if(mode==='estandar'){
    lSL=10; lSM=-20; lSH=10;
  } else {
    // ×100 so r becomes integer — lots: +100 SL / -(1+r)*100 SM / +r*100 SH
    const mult=100;
    lSL=mult; lSM=-Math.round((1+r)*mult); lSH=Math.round(r*mult);
  }

  const fmtL=n=>String(n).replace('.',',');
  const lines=[
    `${fmtL(lSL)}\t${fmtStrike(row.kSL).replace(/\./g,'')}\t${row.pSL.toFixed(3).replace('.',',')}`,
    `${fmtL(lSM)}\t${fmtStrike(row.kSM).replace(/\./g,'')}\t${row.pSM.toFixed(3).replace('.',',')}`,
    `${fmtL(lSH)}\t${fmtStrike(row.kSH).replace(/\./g,'')}\t${row.pSH.toFixed(3).replace('.',',')}`
  ];
  const tsv=lines.join('\n');
  const label=mode==='simetrica'?'Simétrica':'Estándar';
  navigator.clipboard.writeText(tsv)
    .then(()=>showToast(`Mariposa ${label} copiada — ${fmtStrike(row.kSM)}`))
    .catch(()=>{
      const ta=document.createElement('textarea');
      ta.value=tsv;ta.style.position='fixed';ta.style.opacity='0';
      document.body.appendChild(ta);ta.select();
      document.execCommand('copy');document.body.removeChild(ta);
      showToast(`Mariposa ${label} copiada — ${fmtStrike(row.kSM)}`);
    });
}

function marBuildRows(strikes,pricesFn,wings){
  // strikes: sorted array of strike values
  // pricesFn(K) -> price for that strike
  // wings: how many SL/SH offsets to generate per SM
  const S=ST.spot;
  // Find ATM index
  const atmIdx=strikes.reduce((pi,s,i)=>Math.abs(s-S)<Math.abs(strikes[pi]-S)?i:pi,0);
  // SM candidates: strikes within wings positions around ATM
  const smRange=wings;
  const rows=[];
  for(let si=Math.max(0,atmIdx-smRange);si<=Math.min(strikes.length-1,atmIdx+smRange);si++){
    const kSM=strikes[si];
    const pSM=pricesFn(kSM);
    if(!pSM||pSM<=0)continue;
    // Generate combinations: SL below SM, SH above SM
    // offset 0: nearest available on each side; +1: next one out; etc.
    const below=strikes.slice(0,si).reverse(); // strikes below SM, nearest first
    const above=strikes.slice(si+1);           // strikes above SM, nearest first
    for(let off=0;off<Math.min(wings,below.length,above.length);off++){
      const kSL=below[off];
      const kSH=above[off];
      const pSL=pricesFn(kSL);
      const pSH=pricesFn(kSH);
      if(!pSL||pSL<=0||!pSH||pSH<=0)continue;
      rows.push({label:`${fmtStrike(kSM)} + ${off}`,kSL,kSM,kSH,pSL,pSM,pSH});
    }
  }
  return rows;
}

const MAR_TH_STYLE='padding:7px 8px;border-bottom:1px solid var(--border);font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.6px;font-weight:500;white-space:nowrap;text-align:center;color:';
function marBuildHeader(trEl){
  const cols=[
    ['var(--muted)','Mariposa'],
    ['var(--muted)','Strike SL'],
    ['var(--muted)','Strike SM'],
    ['var(--muted)','Strike SH'],
    ['var(--text)','Precio SL'],
    ['var(--text)','Precio SM'],
    ['var(--text)','Precio SH'],
    ['var(--amber)','Costo Bruto'],
    ['var(--amber)','Costo Neto (1×2×1)'],
    ['var(--amber)','Costo Simétrico'],
    ['var(--muted)','Ratio Simétrico'],
    ['var(--blue)','Generar'],
  ];
  trEl.innerHTML=cols.map(([c,t])=>`<th style="${MAR_TH_STYLE}${c}">${t}</th>`).join('');
}

function marBuildTBody(rows,com,iva,lotes,tbodyEl){
  tbodyEl.innerHTML='';
  rows.forEach((row,ri)=>{
    const bruto=marCostoBruto(row.pSL,row.pSM,row.pSH,lotes);
    const neto=marCostoNeto(row.pSL,row.pSM,row.pSH,lotes,com,iva);
    const simetrico=marCostoSimetrico(row.pSL,row.pSM,row.pSH,row.kSL,row.kSM,row.kSH);
    const ratio=marRatioSimetrico(row.kSL,row.kSM,row.kSH);
    const colorVal=v=>v==null?'var(--muted)':v<=0||Math.abs(v)<threshold?'var(--green)':'var(--red)';
    const fmtCost=v=>v!=null?(v<=0?'+':'')+fmtN(Math.abs(v))+(v<=0?' crédito':' débito'):'--';
    const tr=document.createElement('tr');
    tr.style.borderBottom='1px solid var(--border2)';
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
      <td style="padding:4px 8px;text-align:center;color:var(--muted);font-size:10px">${ratio?("1 × "+(1+ratio.r).toFixed(2).replace(".",",")+" × "+ratio.r.toFixed(2).replace(".",",")):"--"}</td>
      <td style="padding:4px 8px;text-align:center;white-space:nowrap">
        <button onclick="marCopyStrategy(MAR_ROWS[${ri}],'estandar')"
          style="padding:2px 8px;font-size:10px;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:4px;cursor:pointer;margin-right:4px"
          onmouseover="this.style.borderColor='var(--amber)'" onmouseout="this.style.borderColor='var(--border)'">Estándar</button>
        <button onclick="marCopyStrategy(MAR_ROWS[${ri}],'simetrica')"
          style="padding:2px 8px;font-size:10px;background:var(--surface2);border:1px solid var(--blue);color:var(--blue);border-radius:4px;cursor:pointer"
          onmouseover="this.style.background='rgba(90,171,255,0.1)'" onmouseout="this.style.background='var(--surface2)'">Simétrica</button>
      </td>`;
    tbodyEl.appendChild(tr);
  });
}

let MAR_ROWS=[];  // flat array for button callbacks

function renderMariposa(){
  marPopulateExpiry();
  const exp=document.getElementById('mar-expiry')?.value||ST.selExpiry;
  if(!exp||!ST.chain[exp]){
    document.getElementById('mar-body-calls').innerHTML=`<tr><td colspan="12" style="padding:20px;text-align:center;color:var(--muted)">Sin datos — cargá la cadena de opciones primero</td></tr>`;
    document.getElementById('mar-body-puts').innerHTML='';
    return;
  }
  const wings=Math.max(1,parseInt(document.getElementById('mar-wings')?.value)||3);
  const com=parseFloat(document.getElementById('mar-com')?.value)||0.5;
  const iva=parseFloat(document.getElementById('mar-iva')?.value)||1.21;
  const lotes=1;
  const threshold=Math.max(0,parseInt(document.getElementById('mar-threshold')?.value)||5000);
  const chainRows=ST.chain[exp];
  const strikes=chainRows.map(r=>r.strike).sort((a,b)=>a-b);

  // Price functions using callMid / putMid (LAST price)
  const callPrice=K=>{const r=chainRows.find(x=>Math.round(x.strike*100)===Math.round(K*100));return r?(r.callMid||0):0;};
  const putPrice =K=>{const r=chainRows.find(x=>Math.round(x.strike*100)===Math.round(K*100));return r?(r.putMid||0):0;};

  const callRows=marBuildRows(strikes,callPrice,wings);
  const putRows =marBuildRows(strikes,putPrice,wings);

  // Store flat for button callbacks with offset
  MAR_ROWS=[...callRows,...putRows];

  // Rebuild button indices per table
  const callRowsOffset=0;
  const putRowsOffset=callRows.length;

  // Build headers
  const thCalls=document.getElementById('mar-thead-calls');
  const thPuts =document.getElementById('mar-thead-puts');
  if(thCalls)marBuildHeader(thCalls);
  if(thPuts) marBuildHeader(thPuts);

  // Build bodies — need per-table row index offset for MAR_ROWS
  function buildBody(rows,offset,tbodyEl){
    tbodyEl.innerHTML='';
    rows.forEach((row,ri)=>{
      const globalIdx=offset+ri;
      const bruto=marCostoBruto(row.pSL,row.pSM,row.pSH,lotes);
      const neto=marCostoNeto(row.pSL,row.pSM,row.pSH,lotes,com,iva);
      const simetrico=marCostoSimetrico(row.pSL,row.pSM,row.pSH,row.kSL,row.kSM,row.kSH);
      const ratio=marRatioSimetrico(row.kSL,row.kSM,row.kSH);
      const colorVal=v=>v==null?'var(--muted)':v<=0||Math.abs(v)<threshold?'var(--green)':'var(--red)';
      const tr=document.createElement('tr');
      tr.style.borderBottom='1px solid var(--border2)';
      // Highlight rows where SM is ATM
      const S=ST.spot;
      const atmStrikes=new Set();
      const sorted=[...strikes].sort((a,b)=>a-b);
      const below=sorted.filter(s=>s<=S);
      const above=sorted.filter(s=>s>S);
      if(below.length)atmStrikes.add(below[below.length-1]);
      if(above.length)atmStrikes.add(above[0]);
      if(atmStrikes.has(row.kSM))tr.style.background='rgba(232,184,75,0.07)';
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
        <td style="padding:4px 8px;text-align:center;color:var(--muted);font-size:10px">${ratio?("1 × "+(1+ratio.r).toFixed(2).replace(".",",")+" × "+ratio.r.toFixed(2).replace(".",",")):"--"}</td>
        <td style="padding:4px 8px;text-align:center;white-space:nowrap">
          <button onclick="marCopyStrategy(MAR_ROWS[${globalIdx}],'estandar')"
            style="padding:2px 8px;font-size:10px;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:4px;cursor:pointer;margin-right:4px"
            onmouseover="this.style.borderColor='var(--amber)'" onmouseout="this.style.borderColor='var(--border)'">Estándar</button>
          <button onclick="marCopyStrategy(MAR_ROWS[${globalIdx}],'simetrica')"
            style="padding:2px 8px;font-size:10px;background:var(--surface2);border:1px solid var(--blue);color:var(--blue);border-radius:4px;cursor:pointer"
            onmouseover="this.style.background='rgba(90,171,255,0.1)'" onmouseout="this.style.background='var(--surface2)'">Simétrica</button>
        </td>`;
      tbodyEl.appendChild(tr);
    });
    if(!rows.length){
      tbodyEl.innerHTML=`<tr><td colspan="12" style="padding:16px;text-align:center;color:var(--muted)">Sin combinaciones disponibles para los parámetros actuales</td></tr>`;
    }
  }

  buildBody(callRows,callRowsOffset,document.getElementById('mar-body-calls'));
  buildBody(putRows, putRowsOffset, document.getElementById('mar-body-puts'));
}

