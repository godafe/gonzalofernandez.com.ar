/* ===== MÓDULO ANÁLISIS DE ESTRATEGIAS ===== */

function anaPopulateExpiry(){ populateExpirySelect('ana-expiry'); }

function anaGetChain(exp){
  if(!exp||!ST.chain[exp])return null;
  return [...ST.chain[exp]].sort((a,b)=>a.strike-b.strike);
}

function anaATM(rows){
  const S=ST.spot;
  return rows.reduce((p,r)=>Math.abs(r.strike-S)<Math.abs(p.strike-S)?r:p,rows[0]);
}

function anaNthOTM(rows,type,n){
  const S=ST.spot;
  if(type==='call'){
    return rows.filter(r=>r.strike>S).sort((a,b)=>a.strike-b.strike)[n-1]||null;
  }
  return rows.filter(r=>r.strike<S).sort((a,b)=>b.strike-a.strike)[n-1]||null;
}

function anaDays(exp){
  if(!exp)return 0;
  return Math.max(0,Math.round((new Date(exp+'T12:00:00')-Date.now())/(1000*60*60*24)));
}

// ---- Card builder ----
const BADGE={
  ALCISTA:    {label:'ALCISTA',    bg:'rgba(68,199,106,0.15)', color:'var(--green)',  border:'rgba(68,199,106,0.4)'},
  BAJISTA:    {label:'BAJISTA',    bg:'rgba(240,90,90,0.15)',  color:'var(--red)',    border:'rgba(240,90,90,0.4)'},
  NEUTRO:     {label:'NEUTRO',     bg:'rgba(122,143,166,0.15)',color:'var(--muted)',  border:'rgba(122,143,166,0.3)'},
  COBERTURA:  {label:'COBERTURA',  bg:'rgba(90,171,255,0.15)', color:'var(--blue)',   border:'rgba(90,171,255,0.4)'},
  VOLATILIDAD:{label:'VOLATILIDAD',bg:'rgba(232,184,75,0.15)', color:'var(--amber)',  border:'rgba(232,184,75,0.4)'},
};

function anaCard({title,subtitle,badge,icon,desc,metrics,legs,extra}){
  const b=BADGE[badge]||BADGE.NEUTRO;
  const badgeHtml=`<span style="font-size:9px;font-weight:600;padding:2px 8px;border-radius:3px;background:${b.bg};color:${b.color};border:1px solid ${b.border};letter-spacing:.5px">${b.label}</span>`;
  const metHtml=(metrics||[]).map(([label,val,color])=>`
    <div style="display:flex;flex-direction:column;gap:2px">
      <span style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">${label}</span>
      <span style="font-family:var(--mono);font-size:13px;font-weight:500;color:${color||'var(--text)'}">${val}</span>
    </div>`).join('');
  const legsHtml=(legs||[]).map(l=>`
    <div style="padding:5px 10px;border-radius:4px;background:${l.side==='buy'?'rgba(68,199,106,0.08)':'rgba(240,90,90,0.08)'};border:1px solid ${l.side==='buy'?'rgba(68,199,106,0.2)':'rgba(240,90,90,0.2)'};font-family:var(--mono);font-size:11px;color:${l.side==='buy'?'var(--green)':'var(--red)'}">
      ${l.label}
    </div>`).join('');
  const el=document.createElement('div');
  el.style.cssText='background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px;display:flex;flex-direction:column;gap:10px';
  el.innerHTML=`
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
      <div>
        <div style="font-family:var(--sans);font-size:13px;font-weight:600;color:var(--text)">${icon?icon+' ':''}${title}</div>
        ${subtitle?`<div style="font-size:10px;color:var(--muted);margin-top:2px">${subtitle}</div>`:''}
      </div>
      ${badgeHtml}
    </div>
    ${desc?`<div style="font-size:11px;color:var(--muted);line-height:1.5;border-top:1px solid var(--border2);padding-top:8px">${desc}</div>`:''}
    ${metrics?.length?`<div style="display:grid;grid-template-columns:repeat(${Math.min(metrics.length,3)},1fr);gap:10px;padding:10px;background:var(--surface2);border-radius:6px">${metHtml}</div>`:''}
    ${legs?.length?`<div style="display:flex;flex-direction:column;gap:4px">${legsHtml}</div>`:''}
    ${extra?`<div style="font-size:10px;color:var(--muted);border-top:1px solid var(--border2);padding-top:6px">${extra}</div>`:''}
  `;
  return el;
}

function renderAnalisis(){
  anaPopulateExpiry();
  const exp=document.getElementById('ana-expiry')?.value||ST.selExpiry;
  const shares=parseInt(document.getElementById('ana-shares')?.value)||100;
  const costBasis=parseFloat(document.getElementById('ana-cost')?.value)||ST.spot;
  const grid=document.getElementById('ana-grid');
  if(!grid)return;
  grid.innerHTML='';

  const rows=anaGetChain(exp);
  if(!rows?.length){
    grid.innerHTML='<div style="padding:30px;text-align:center;color:var(--muted)">Sin datos — cargá la cadena de opciones primero</div>';
    return;
  }

  const S=ST.spot;
  const days=anaDays(exp);
  const T=rows[0]?.T||(days/365);
  const expLabel=fmtExpiry(exp);
  const atm=anaATM(rows);

  // Local helpers
  const c=r=>r?.callMid||0;
  const p=r=>r?.putMid||0;
  const fP=v=>`$${fmtN(v)}`;
  const pct=v=>`${v>=0?'+':''}${(v*100).toFixed(1)}%`;
  const ve=(r,type)=>{const v=type==='call'?r?.callLastVE:r?.putLastVE; return v!=null?(v*100).toFixed(2)+'%':'--';};

  // Key strikes
  const atmCall=c(atm), atmPut=p(atm), atmK=atm.strike;
  const otmCall1=anaNthOTM(rows,'call',1);
  const otmPut1=anaNthOTM(rows,'put',1);

  // ── 1. Bull Call Spread ──
  const bullHigh=otmCall1;
  if(atm&&bullHigh){
    const debit=c(atm)-c(bullHigh);
    const maxProfit=(bullHigh.strike-atm.strike)*100-debit*100;
    const be=atm.strike+debit;
    const rr=maxProfit>0?(maxProfit/(debit*100)).toFixed(1):'--';
    grid.appendChild(anaCard({
      title:'Bull Call Spread',
      subtitle:`${fmtStrike(atm.strike)} / ${fmtStrike(bullHigh.strike)}`,
      badge:'ALCISTA',icon:'📈',
      desc:`Spread alcista limitado. Compra call ${fmtStrike(atm.strike)} y vende call ${fmtStrike(bullHigh.strike)}. Beneficio si el precio sube hacia ${fmtStrike(bullHigh.strike)}.`,
      metrics:[
        ['Débito neto',fP(debit*100),'var(--red)'],
        ['Break even',fmtStrike(be),'var(--amber)'],
        ['Máx. ganancia',fP(maxProfit),'var(--green)'],
        ['Risk/Reward',rr+'x','var(--text)'],
        ['VE compra',ve(atm,'call'),'var(--blue)'],
        ['VE venta',ve(bullHigh,'call'),'var(--blue)'],
        ['VTO',expLabel,'var(--muted)'],
        ['Días',days+'d','var(--muted)'],
      ],
      legs:[
        {side:'buy', label:`COMPRA call ${fmtStrike(atm.strike)}   prima ${fP(c(atm))}`},
        {side:'sell',label:`VENTA  call ${fmtStrike(bullHigh.strike)}  prima ${fP(c(bullHigh))}`},
      ]
    }));
  }

  // ── 2. Bear Put Spread ──
  const bearLow=otmPut1;
  if(atm&&bearLow){
    const debit=p(atm)-p(bearLow);
    const maxProfit=(atm.strike-bearLow.strike)*100-debit*100;
    const be=atm.strike-debit;
    const rr=maxProfit>0?(maxProfit/(debit*100)).toFixed(1):'--';
    grid.appendChild(anaCard({
      title:'Bear Put Spread',
      subtitle:`${fmtStrike(bearLow.strike)} / ${fmtStrike(atm.strike)}`,
      badge:'BAJISTA',icon:'📉',
      desc:`Spread bajista limitado. Compra put ${fmtStrike(atm.strike)} y vende put ${fmtStrike(bearLow.strike)}. Beneficio si el precio cae hacia ${fmtStrike(bearLow.strike)}.`,
      metrics:[
        ['Débito neto',fP(debit*100),'var(--red)'],
        ['Break even',fmtStrike(be),'var(--amber)'],
        ['Máx. ganancia',fP(maxProfit),'var(--green)'],
        ['Risk/Reward',rr+'x','var(--text)'],
        ['VE compra',ve(atm,'put'),'var(--blue)'],
        ['VE venta',ve(bearLow,'put'),'var(--blue)'],
        ['VTO',expLabel,'var(--muted)'],
        ['Días',days+'d','var(--muted)'],
      ],
      legs:[
        {side:'buy', label:`COMPRA put ${fmtStrike(atm.strike)}   prima ${fP(p(atm))}`},
        {side:'sell',label:`VENTA  put ${fmtStrike(bearLow.strike)}  prima ${fP(p(bearLow))}`},
      ]
    }));
  }

  // ── 3. Covered Call ──
  if(otmCall1){
    const callK=otmCall1.strike, premium=c(otmCall1);
    const maxProfit=(callK-costBasis)*shares+premium*100;
    const be=costBasis-premium;
    grid.appendChild(anaCard({
      title:'Covered Call',
      subtitle:`Venta call ${fmtStrike(callK)} · Ingreso sobre tenencia`,
      badge:'NEUTRO',icon:'🛡️',
      desc:`${fmtStrike(callK)} es el Call Wall — zona de máxima resistencia de gamma positiva. Ideal para vender si ya tenés acciones. El precio difícilmente supere ese nivel antes del vencimiento.`,
      metrics:[
        ['Prima cobrada',fP(premium*100),'var(--green)'],
        ['Break even',fmtStrike(be),'var(--amber)'],
        ['Máx. ganancia',fP(maxProfit),'var(--green)'],
        ['Retorno prima',pct(premium/S),'var(--green)'],
        ['Last VE',ve(otmCall1,'call'),'var(--blue)'],
        ['VTO',expLabel,'var(--muted)'],
        ['Días',days+'d','var(--muted)'],
      ],
      legs:[
        {side:'buy', label:`TENENCIA ${shares} acc. GGAL @ ${fP(costBasis)}`},
        {side:'sell',label:`VENTA call ${fmtStrike(callK)}  prima ${fP(premium)}`},
      ]
    }));
  }

  // ── 4. Venta Put Cash Secured ──
  if(otmPut1){
    const putK=otmPut1.strike, premium=p(otmPut1);
    const be=putK-premium;
    grid.appendChild(anaCard({
      title:'Venta Put (Cash Secured)',
      subtitle:`Venta put ${fmtStrike(putK)} · Entrada con descuento`,
      badge:'ALCISTA',icon:'💰',
      desc:`Cobrás la prima ahora. Si el precio se mantiene sobre ${fmtStrike(putK)} al vencimiento, la put vence sin valor. Si baja, comprás acciones efectivamente a ${fmtStrike(be)} (BE).`,
      metrics:[
        ['Prima cobrada',fP(premium*100),'var(--green)'],
        ['Break even',fmtStrike(be),'var(--amber)'],
        ['Ganancia máx.',fP(premium*100),'var(--green)'],
        ['Strike vs Spot',pct((putK-S)/S),'var(--muted)'],
        ['Last VE',ve(otmPut1,'put'),'var(--blue)'],
        ['VTO',expLabel,'var(--muted)'],
        ['Días',days+'d','var(--muted)'],
      ],
      legs:[
        {side:'sell',label:`VENTA put ${fmtStrike(putK)}  prima ${fP(premium)}`},
        {side:'buy', label:`GARANTÍA efectivo ${fmtStrike(putK)} × lote`},
      ]
    }));
  }

  // ── 5. Straddle ATM ──
  if(atmCall>0&&atmPut>0){
    const straddleCost=(atmCall+atmPut)*100;
    const beUp=atmK+atmCall+atmPut, beDown=atmK-(atmCall+atmPut);
    grid.appendChild(anaCard({
      title:'Straddle ATM',
      subtitle:`Compra call+put ${fmtStrike(atmK)} · Apuesta a volatilidad`,
      badge:'VOLATILIDAD',icon:'⚡',
      desc:`Ganás si el mercado se mueve bruscamente en cualquier dirección. Perdés la prima si el precio permanece cerca de ${fmtStrike(atmK)}.`,
      metrics:[
        ['Prima total',fP(straddleCost),'var(--red)'],
        ['BE arriba',fmtStrike(beUp),'var(--green)'],
        ['BE abajo',fmtStrike(beDown),'var(--green)'],
        ['VE call ATM',ve(atm,'call'),'var(--blue)'],
        ['VE put ATM',ve(atm,'put'),'var(--blue)'],
        ['VTO',expLabel,'var(--muted)'],
        ['Días',days+'d','var(--muted)'],
      ],
      legs:[
        {side:'buy',label:`COMPRA call ${fmtStrike(atmK)}  prima ${fP(atmCall)}`},
        {side:'buy',label:`COMPRA put  ${fmtStrike(atmK)}  prima ${fP(atmPut)}`},
      ]
    }));

    // ── 6. Strangle OTM ──
    if(otmCall1&&otmPut1){
      const cP=c(otmCall1), pP=p(otmPut1);
      const cost=(cP+pP)*100;
      grid.appendChild(anaCard({
        title:'Strangle OTM',
        subtitle:`${fmtStrike(otmPut1.strike)} / ${fmtStrike(otmCall1.strike)}`,
        badge:'VOLATILIDAD',icon:'🔀',
        desc:`Versión más barata del straddle. Necesita un movimiento mayor para ser rentable, pero el rango ${fmtStrike(otmPut1.strike)} – ${fmtStrike(otmCall1.strike)} es más amplio.`,
        metrics:[
          ['Prima total',fP(cost),'var(--red)'],
          ['BE arriba',fmtStrike(otmCall1.strike+cP+pP),'var(--green)'],
          ['BE abajo',fmtStrike(otmPut1.strike-(cP+pP)),'var(--green)'],
          ['Ahorro vs straddle',fP(straddleCost-cost),'var(--green)'],
          ['VE call',ve(otmCall1,'call'),'var(--blue)'],
          ['VE put',ve(otmPut1,'put'),'var(--blue)'],
          ['VTO',expLabel,'var(--muted)'],
          ['Días',days+'d','var(--muted)'],
        ],
        legs:[
          {side:'buy',label:`COMPRA call ${fmtStrike(otmCall1.strike)}  prima ${fP(cP)}`},
          {side:'buy',label:`COMPRA put  ${fmtStrike(otmPut1.strike)}  prima ${fP(pP)}`},
        ]
      }));
    }
  }

  // ── 7. Compra Call Directa ──
  if(otmCall1){
    const callK=otmCall1.strike, premium=c(otmCall1);
    const be=callK+premium;
    const greeks=bs(S,callK,T,ST.rate,ST.q,impliedVol(S,callK,T,ST.rate,ST.q,premium,'call')||0.5,'call');
    grid.appendChild(anaCard({
      title:'Compra Call Directa',
      subtitle:`Call ${fmtStrike(callK)} · Ruptura al alza`,
      badge:'ALCISTA',icon:'🚀',
      desc:`Compra especulativa. Si el precio supera ${fmtStrike(be)} antes del vencimiento la operación es ganadora. Delta ${greeks.delta.toFixed(2)} — cada punto que sube el spot, la prima sube ~${fmtN(greeks.delta)}.`,
      metrics:[
        ['Prima',fP(premium*100),'var(--red)'],
        ['Break even',fmtStrike(be),'var(--amber)'],
        ['Target',fmtStrike(callK+(callK-S)*1.5),'var(--green)'],
        ['Delta',greeks.delta.toFixed(2),'var(--text)'],
        ['Last VE',ve(otmCall1,'call'),'var(--blue)'],
        ['VTO',expLabel,'var(--muted)'],
        ['Días',days+'d','var(--muted)'],
      ],
      legs:[{side:'buy',label:`COMPRA call ${fmtStrike(callK)}  prima ${fP(premium)}`}]
    }));
  }

  // ── 8. Compra Put Cobertura ──
  if(otmPut1){
    const putK=otmPut1.strike, premium=p(otmPut1);
    const be=putK-premium;
    const greeks=bs(S,putK,T,ST.rate,ST.q,impliedVol(S,putK,T,ST.rate,ST.q,premium,'put')||0.5,'put');
    grid.appendChild(anaCard({
      title:'Compra Put — Cobertura',
      subtitle:`Put ${fmtStrike(putK)} · Protección bajista`,
      badge:'COBERTURA',icon:'🔒',
      desc:`Seguro bajista sobre tu cartera. Si el precio cae bajo ${fmtStrike(be)} la put compensa las pérdidas. Delta ${greeks.delta.toFixed(2)}.`,
      metrics:[
        ['Prima',fP(premium*100),'var(--red)'],
        ['Break even',fmtStrike(be),'var(--amber)'],
        ['Target bajista',fmtStrike(putK-(S-putK)*1.5),'var(--red)'],
        ['Delta',greeks.delta.toFixed(2),'var(--text)'],
        ['Last VE',ve(otmPut1,'put'),'var(--blue)'],
        ['VTO',expLabel,'var(--muted)'],
        ['Días',days+'d','var(--muted)'],
      ],
      legs:[{side:'buy',label:`COMPRA put ${fmtStrike(putK)}  prima ${fP(premium)}`}]
    }));
  }
}
