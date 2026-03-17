/* ===== MÓDULO PRECIO PROMEDIO ===== */

function promClear(){
  const inp=document.getElementById('prom-input');
  if(inp)inp.value='';
  calcPromedio();
}

function calcPromedio(){
  const raw=document.getElementById('prom-input')?.value||'';
  const com=parseFloat(document.getElementById('prom-com')?.value)||0.5;
  const iva=parseFloat(document.getElementById('prom-iva')?.value)||1.21;
  const comFactor=(com/100+0.002)*iva;

  // Parse rows
  const rows=[];
  const lines=raw.trim().split('\n');
  let parsed=0,errors=0;
  lines.forEach(line=>{
    if(!line.trim())return;
    const cols=line.split('\t');
    if(cols.length<3){errors++;return;}
    const cant=parseARSNum(cols[0].trim());
    const base=parseARSNum(cols[1].trim());
    const prima=parseARSNum(cols[2].trim());
    if(isNaN(cant)||isNaN(prima)){errors++;return;}
    rows.push({cant,base:isNaN(base)?0:base,prima});
    parsed++;
  });

  const statusEl=document.getElementById('prom-parse-status');
  if(statusEl)statusEl.textContent=parsed?`${parsed} fila${parsed>1?'s':''} cargada${parsed>1?'s':''}${errors?` · ${errors} con error`:''}`:errors?`${errors} filas con error`:'';

  // Separate buys and sells
  const buys=rows.filter(r=>r.cant>0);
  const sells=rows.filter(r=>r.cant<0);

  // Weighted average helpers
  function wavg(arr){
    const totalLotes=arr.reduce((s,r)=>s+Math.abs(r.cant),0);
    if(!totalLotes)return{lotes:0,avgPrima:0,avgPrimaCom:0,total:0};
    const sumPrima=arr.reduce((s,r)=>s+Math.abs(r.cant)*r.prima,0);
    const isBuy=arr[0]?.cant>0;
    // Cost per row with commission
    const costs=arr.map(r=>{
      const sign=isBuy?1:-1;
      const primaCom=r.prima*(1+sign*comFactor);
      const costo=-Math.abs(r.cant)*primaCom*100*sign; // negative = outflow for buy
      return{...r,primaCom,costo};
    });
    const totalCost=costs.reduce((s,r)=>s+r.costo,0);
    const sumPrimaCom=costs.reduce((s,r)=>s+Math.abs(r.cant)*r.primaCom,0);
    return{
      lotes:totalLotes,
      avgPrima:sumPrima/totalLotes,
      avgPrimaCom:sumPrimaCom/totalLotes,
      total:totalCost,
      rows:costs
    };
  }

  const b=buys.length?wavg(buys):{lotes:0,avgPrima:0,avgPrimaCom:0,total:0,rows:[]};
  const s=sells.length?wavg(sells):{lotes:0,avgPrima:0,avgPrimaCom:0,total:0,rows:[]};

  // Update buy card
  const set=(id,val)=>{const e=document.getElementById(id);if(e)e.textContent=val;};
  set('prom-buy-lotes',  b.lotes?b.lotes:'--');
  set('prom-buy-avg',    b.lotes?fmtN(b.avgPrima):'--');
  set('prom-buy-avg-com',b.lotes?fmtN(b.avgPrimaCom):'--');
  set('prom-buy-total',  b.lotes?fmtN(b.total):'--');

  // Update sell card
  set('prom-sell-lotes',  s.lotes?s.lotes:'--');
  set('prom-sell-avg',    s.lotes?fmtN(s.avgPrima):'--');
  set('prom-sell-avg-com',s.lotes?fmtN(s.avgPrimaCom):'--');
  set('prom-sell-total',  s.lotes?fmtN(Math.abs(s.total)):'--');

  // Net result: buy total (negative) + sell total (positive credit)
  const netTotal=b.total+s.total; // already signed correctly
  const netLotes=(b.lotes||0)-(s.lotes||0);
  const netAvg=rows.length?(b.lotes*b.avgPrimaCom-s.lotes*s.avgPrimaCom)/(b.lotes+s.lotes||1):0;
  const netColor=netTotal>=0?'var(--green)':'var(--red)';

  set('prom-net-lotes', rows.length?(b.lotes||0)+' C / '+(s.lotes||0)+' V':'--');
  const netEl=document.getElementById('prom-net-total');
  if(netEl){netEl.textContent=rows.length?fmtN(netTotal):'--';netEl.style.color=netColor;}
  set('prom-net-avg', rows.length?fmtN(netAvg):'--');

  // Detail table
  const tb=document.getElementById('prom-body');
  if(!tb)return;
  tb.innerHTML='';
  const allRows=[...(b.rows||[]).map(r=>({...r,isBuy:true})),...(s.rows||[]).map(r=>({...r,isBuy:false}))];
  allRows.forEach(r=>{
    const tr=document.createElement('tr');
    tr.style.borderBottom='1px solid var(--border2)';
    const col=r.isBuy?'var(--green)':'var(--red)';
    const costColor=r.costo>=0?'var(--green)':'var(--red)';
    tr.innerHTML=`
      <td style="padding:4px 10px;text-align:center;color:${col};font-weight:500">${r.cant>0?'+':''}${r.cant}</td>
      <td style="padding:4px 10px;text-align:center;color:var(--muted)">${r.base?fmtStrike(r.base):'--'}</td>
      <td style="padding:4px 10px;text-align:center">${fmtN(r.prima)}</td>
      <td style="padding:4px 10px;text-align:center;color:var(--amber)">${fmtN(r.primaCom)}</td>
      <td style="padding:4px 10px;text-align:center;color:${costColor};font-weight:500">${fmtN(r.costo)}</td>`;
    tb.appendChild(tr);
  });
}

