/* ===== MÓDULO PRECIO PROMEDIO ===== */

function promClear(){
  const inp=document.getElementById('prom-input');
  if(inp)inp.value='';
  calcPromedio();
}

function calcPromedio(){
  const raw=document.getElementById('prom-input')?.value||'';
  const com=siteComision();
  const iva=siteIva();
  const comFactor=(com/100+0.002)*iva;

  const rows=[];
  raw.trim().split('\n').forEach(line=>{
    if(!line.trim())return;
    const cols=line.split('\t');
    if(cols.length<3)return;
    const cant=parseARSNum(cols[0].trim());
    const base=parseARSNum(cols[1].trim());
    const prima=parseARSNum(cols[2].trim());
    if(isNaN(cant)||isNaN(prima))return;
    rows.push({cant,base:isNaN(base)?0:base,prima});
  });

  const statusEl=document.getElementById('prom-parse-status');
  if(statusEl)statusEl.textContent=rows.length?`${rows.length} fila${rows.length>1?'s':''} cargada${rows.length>1?'s':''}`:raw.trim()?'Sin filas válidas — verificá el formato':'';

  const container=document.getElementById('prom-results');
  if(!container)return;
  container.innerHTML='';
  if(!rows.length)return;

  // Group by strike
  const groups={};
  rows.forEach(r=>{
    const key=String(r.base||0);
    if(!groups[key])groups[key]=[];
    groups[key].push(r);
  });
  const strikeKeys=Object.keys(groups).map(Number).sort((a,b)=>a-b);

  function wavg(arr){
    const totalLotes=arr.reduce((s,r)=>s+Math.abs(r.cant),0);
    if(!totalLotes)return null;
    const isBuy=arr[0].cant>0;
    const withCom=arr.map(r=>{
      const sign=isBuy?1:-1;
      const primaCom=r.prima*(1+sign*comFactor);
      const costo=-Math.abs(r.cant)*primaCom*100*sign;
      return{...r,primaCom,costo};
    });
    const sumPrima=arr.reduce((s,r)=>s+Math.abs(r.cant)*r.prima,0);
    const sumPrimaCom=withCom.reduce((s,r)=>s+Math.abs(r.cant)*r.primaCom,0);
    return{lotes:totalLotes,avgPrima:sumPrima/totalLotes,avgPrimaCom:sumPrimaCom/totalLotes,
      total:withCom.reduce((s,r)=>s+r.costo,0),rows:withCom};
  }

  let grandNet=0, grandLotes=0;
  const strikeBalances=[]; // for grand total summary

  strikeKeys.forEach(strike=>{
    const stRows=groups[String(strike)];
    const buys=stRows.filter(r=>r.cant>0);
    const sells=stRows.filter(r=>r.cant<0);
    const b=buys.length?wavg(buys):null;
    const s=sells.length?wavg(sells):null;
    const netTotal=(b?.total||0)+(s?.total||0);
    const netLotes=(b?.lotes||0)-(s?.lotes||0);
    grandNet+=netTotal;
    grandLotes+=netLotes;
    if(netLotes!==0)strikeBalances.push({strike,netLotes});

    const netColor=netTotal>=0?'var(--green)':'var(--red)';
    const lotesColor=netLotes>0?'var(--green)':netLotes<0?'var(--red)':'var(--amber)';

    const sec=document.createElement('div');
    sec.style.cssText='background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px';

    sec.innerHTML=`
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--border2)">
        <span style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Strike</span>
        <span style="font-family:var(--mono);font-size:14px;font-weight:700;color:var(--amber)">${strike?fmtStrike(strike):'Sin base'}</span>
        <span style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">${stRows.length} operacion${stRows.length>1?'es':''}</span>
        <span style="margin-left:auto;font-family:var(--mono);font-size:13px;font-weight:600;color:${netColor}">Neto: ${fmtN(netTotal)}</span>
        <span style="font-family:var(--mono);font-size:11px">Balance: <strong style="color:${lotesColor}">${netLotes>=0?'+':''}${netLotes} lotes</strong></span>
      </div>
      <div data-prom-cards="${strike}" style="display:grid;grid-template-columns:${b&&s?'1fr 1fr':'1fr'};gap:10px;margin-bottom:10px"></div>
      <table style="width:100%;border-collapse:collapse;font-family:var(--mono);font-size:11px">
        <thead><tr style="background:var(--surface2)">
          <th style="padding:5px 8px;border-bottom:1px solid var(--border);color:var(--muted);font-family:var(--sans);font-size:8px;text-transform:uppercase;letter-spacing:.5px;text-align:center">Cant</th>
          <th style="padding:5px 8px;border-bottom:1px solid var(--border);color:var(--muted);font-family:var(--sans);font-size:8px;text-transform:uppercase;letter-spacing:.5px;text-align:center">Prima</th>
          <th style="padding:5px 8px;border-bottom:1px solid var(--border);color:var(--amber);font-family:var(--sans);font-size:8px;text-transform:uppercase;letter-spacing:.5px;text-align:center">Prima c/Comi</th>
          <th style="padding:5px 8px;border-bottom:1px solid var(--border);color:var(--amber);font-family:var(--sans);font-size:8px;text-transform:uppercase;letter-spacing:.5px;text-align:center">Costo Total</th>
        </tr></thead>
        <tbody data-prom-tbody="${strike}"></tbody>
      </table>`;
    container.appendChild(sec);

    // Cards
    const cardsEl=sec.querySelector(`[data-prom-cards="${strike}"]`);
    [[b,'Compras','rgba(68,199,106,0.25)','var(--green)'],[s,'Ventas','rgba(240,90,90,0.25)','var(--red)']].forEach(([data,label,border,col])=>{
      if(!data)return;
      const isB=label==='Compras';
      const card=document.createElement('div');
      card.style.cssText=`background:var(--bg);border:1px solid ${border};border-radius:7px;padding:12px`;
      card.innerHTML=`
        <div style="font-size:9px;color:${col};text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">${label}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <div><div style="font-size:9px;color:var(--dim);margin-bottom:1px">Lotes</div><div style="font-family:var(--mono);font-size:16px;font-weight:600;color:${col}">${data.lotes}</div></div>
          <div><div style="font-size:9px;color:var(--dim);margin-bottom:1px">Prima prom.</div><div style="font-family:var(--mono);font-size:16px;font-weight:600;color:${col}">${fmtN(data.avgPrima)}</div></div>
          <div><div style="font-size:9px;color:var(--dim);margin-bottom:1px">Prima c/Comi</div><div style="font-family:var(--mono);font-size:13px;color:var(--amber)">${fmtN(data.avgPrimaCom)}</div></div>
          <div><div style="font-size:9px;color:var(--dim);margin-bottom:1px">Total c/Comi</div><div style="font-family:var(--mono);font-size:13px;color:${isB?'var(--red)':'var(--green)'}">${fmtN(Math.abs(data.total))}</div></div>
        </div>`;
      cardsEl.appendChild(card);
    });

    // Detail rows
    const tbody=sec.querySelector(`[data-prom-tbody="${strike}"]`);
    const allRows=[...(b?.rows||[]).map(r=>({...r,isBuy:true})),...(s?.rows||[]).map(r=>({...r,isBuy:false}))];
    allRows.forEach(r=>{
      const col=r.isBuy?'var(--green)':'var(--red)';
      const costColor=r.costo>=0?'var(--green)':'var(--red)';
      const tr=document.createElement('tr');
      tr.style.borderBottom='1px solid var(--border2)';
      tr.innerHTML=`
        <td style="padding:3px 8px;text-align:center;color:${col};font-weight:500">${r.cant>0?'+':''}${r.cant}</td>
        <td style="padding:3px 8px;text-align:center">${fmtN(r.prima)}</td>
        <td style="padding:3px 8px;text-align:center;color:var(--amber)">${fmtN(r.primaCom)}</td>
        <td style="padding:3px 8px;text-align:center;color:${costColor};font-weight:500">${fmtN(r.costo)}</td>`;
      tbody.appendChild(tr);
    });
  });

  // Grand total bar if multiple strikes
  if(strikeKeys.length>1){
    const gc=grandNet>=0?'var(--green)':'var(--red)';
    const lc=grandLotes>0?'var(--green)':grandLotes<0?'var(--red)':'var(--amber)';
    const grandEl=document.createElement('div');
    grandEl.style.cssText='grid-column:1/-1;background:var(--surface);border:1px solid rgba(232,184,75,0.3);border-radius:8px;padding:12px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-family:var(--mono)';

    // Per-strike badges (only non-zero)
    const badges=strikeBalances.map(({strike,netLotes})=>{
      const bc=netLotes>0?'var(--green)':'var(--red)';
      return`<span style="font-size:11px;padding:2px 8px;border-radius:4px;border:1px solid ${bc};color:${bc};white-space:nowrap">
        ${fmtStrike(strike)}: <strong>${netLotes>=0?'+':''}${netLotes}</strong>
      </span>`;
    }).join('');

    grandEl.innerHTML=`
      <span style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;white-space:nowrap">Total general</span>
      <span style="font-size:9px;color:var(--muted);white-space:nowrap">${strikeKeys.length} strikes</span>
      <span style="font-size:12px;white-space:nowrap">Balance: <strong style="color:${lc}">${grandLotes>=0?'+':''}${grandLotes} lotes</strong></span>
      ${badges}
      <span style="margin-left:auto;font-size:16px;font-weight:700;color:${gc};white-space:nowrap">${fmtN(grandNet)}</span>`;
    container.insertBefore(grandEl,container.firstChild);
  }
}
