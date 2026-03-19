/* ===== MÓDULO BULL/BEAR ===== */

function bbToggleType(){
  const hidden=document.getElementById('bb-type');
  const btn=document.getElementById('bb-type-btn');
  if(!hidden||!btn)return;
  const newVal=hidden.value==='call'?'put':'call';
  hidden.value=newVal;
  const isCall=newVal==='call';
  btn.textContent=isCall?'Call':'Put';
  btn.style.color=isCall?'var(--green)':'var(--red)';
  btn.style.borderColor=isCall?'var(--green)':'var(--red)';
  renderBullBear();
}

function bbPopulateExpiry(){
  const sel=document.getElementById('bb-expiry');
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

function bbPopulateBase(type, expiry){
  const sel=document.getElementById('bb-base');
  if(!sel||!expiry||!ST.chain[expiry])return;
  const cur=parseFloat(sel.value)||0;
  sel.innerHTML='';
  const rows=ST.chain[expiry].filter(r=>type==='call'?r.callMid>0:r.putMid>0);
  rows.forEach(r=>{
    const o=document.createElement('option');
    o.value=r.strike;
    o.textContent=fmtStrike(r.strike);
    if(Math.round(r.strike*100)===Math.round(cur*100))o.selected=true;
    sel.appendChild(o);
  });
  // Default to ATM
  if(!cur&&rows.length){
    const S=ST.spot;
    const atm=rows.reduce((p,r)=>Math.abs(r.strike-S)<Math.abs(p.strike-S)?r:p,rows[0]);
    sel.value=atm.strike;
  }
}

function renderBullBear(){
  bbPopulateExpiry();
  const exp=document.getElementById('bb-expiry')?.value||ST.selExpiry;
  const type=document.getElementById('bb-type')?.value||'call';
  const lotes=parseInt(document.getElementById('bb-lotes')?.value)||1;

  if(!exp||!ST.chain[exp]){
    document.getElementById('bb-cards').innerHTML=`<div style="color:var(--muted);padding:20px">Sin datos — cargá la cadena primero</div>`;
    return;
  }

  bbPopulateBase(type, exp);
  const baseStrike=parseFloat(document.getElementById('bb-base')?.value)||0;
  const chainRows=[...ST.chain[exp]].sort((a,b)=>a.strike-b.strike);
  const S=ST.spot;
  const T=chainRows[0]?.T||(30/365);
  const r=ST.rate, q=ST.q;
  const com=siteComision(), iva=siteIva();

  const baseRow=chainRows.find(r=>Math.round(r.strike*100)===Math.round(baseStrike*100));
  if(!baseRow){document.getElementById('bb-cards').innerHTML='';return;}

  const priceBase=type==='call'?baseRow.callMid:baseRow.putMid;
  const ivBase=priceBase>0?impliedVol(S,baseRow.strike,T,r,q,priceBase,type)||0:0;
  const greeksBase=priceBase>0?bs(S,baseRow.strike,T,r,q,ivBase,type):{delta:0,vega:0,gamma:0,theta:0};

  // All strikes on the other side
  const isCall=type==='call';
  // Bull call: sell higher strikes; Bear put: sell lower strikes
  const legs2=isCall
    ? chainRows.filter(row=>row.strike>baseStrike&&row.callMid>0)
    : chainRows.filter(row=>row.strike<baseStrike&&row.putMid>0).reverse();

  const isBull=isCall; // bull call or bull put (buying lower put)
  const stratLabel=isCall?'Bull Call Spread':'Bear Put Spread';

  const spreads=legs2.map(row2=>{
    const price2=isCall?row2.callMid:row2.putMid;
    const K1=baseStrike, K2=row2.strike;
    const p1=priceBase, p2=price2;
    const difStrike=Math.abs(K2-K1);

    // Net debit: always buy base (p1), sell leg2 (p2)
    const netDebit=p1-p2;
    const costPerLote=netDebit*100;
    const costTotal=costPerLote*lotes;
    // With commission
    const costConComi=costTotal*(1+com/100*iva);

    // Breakeven
    const breakeven=isCall?(K1+netDebit):(K1-netDebit);
    const breakevenPct=(breakeven-S)/S*100;

    // Max profit
    const maxProfit=(difStrike-netDebit)*100*lotes;
    const aMaxProfit=difStrike-netDebit; // per share

    // % Lleno — what % of the max spread width you're paying
    const pctLleno=difStrike>0?(netDebit/difStrike)*100:0;

    // ROI
    const roi=netDebit>0?(aMaxProfit/netDebit)*100:0;

    // Ratio
    const ratio=p2>0?p1/p2:0;

    // Distancia al strike S2 desde spot
    const distancia=Math.abs(K2-S)/S*100;

    // Greeks of the spread (buy base - sell leg2)
    const iv2=price2>0?impliedVol(S,K2,T,r,q,price2,type)||0:0;
    const g2=price2>0?bs(S,K2,T,r,q,iv2,type):{delta:0,vega:0,gamma:0,theta:0};
    const spreadDelta=isCall?greeksBase.delta-g2.delta:g2.delta-greeksBase.delta;
    const spreadTheta=isCall?greeksBase.theta-g2.theta:g2.theta-greeksBase.theta;
    const spreadVega=isCall?greeksBase.vega-g2.vega:g2.vega-greeksBase.vega;

    // Risk/Reward
    const riskReward=netDebit>0?(difStrike-netDebit)/netDebit:0;

    return{K2,price2,difStrike,netDebit,costPerLote,costTotal,costConComi,
      breakeven,breakevenPct,maxProfit,aMaxProfit,pctLleno,roi,ratio,distancia,
      spreadDelta,spreadTheta,spreadVega,riskReward,iv1:ivBase,iv2};
  }).filter(s=>s.netDebit>0);

  // Summary bar
  const sumEl=document.getElementById('bb-summary');
  if(sumEl){
    sumEl.innerHTML=`
      <div style="padding:5px 14px;background:var(--surface);border:1px solid var(--border);border-radius:20px;color:var(--muted)">
        <strong style="color:var(--text)">${stratLabel}</strong>
      </div>
      <div style="padding:5px 14px;background:var(--surface);border:1px solid var(--border);border-radius:20px;color:var(--muted)">
        Base <strong style="color:var(--amber)">${fmtStrike(baseStrike)}</strong>
        &nbsp;·&nbsp; Precio <strong style="color:var(--amber)">${fmtN(priceBase)}</strong>
        &nbsp;·&nbsp; Spot <strong style="color:var(--text)">${fmtN(S,0)}</strong>
      </div>
      <div style="padding:5px 14px;background:var(--surface);border:1px solid var(--border);border-radius:20px;color:var(--muted)">
        Delta base <strong style="color:var(--green)">${greeksBase.delta.toFixed(3)}</strong>
        &nbsp;·&nbsp; IV <strong style="color:var(--amber)">${(ivBase*100).toFixed(1)}%</strong>
      </div>
      <div style="padding:5px 14px;background:var(--surface);border:1px solid var(--border);border-radius:20px;color:var(--muted)">
        <strong style="color:var(--text)">${spreads.length}</strong> spreads disponibles
      </div>`;
  }

  // Render cards
  const container=document.getElementById('bb-cards');
  if(!container)return;
  if(!spreads.length){
    container.innerHTML=`<div style="color:var(--muted);padding:20px">Sin spreads disponibles para esta base</div>`;
    return;
  }

  container.innerHTML='';
  spreads.forEach(sp=>{
    const pctColor=sp.pctLleno<33?'var(--green)':sp.pctLleno<60?'var(--amber)':'var(--red)';
    const roiColor=sp.roi>200?'var(--green)':sp.roi>100?'var(--amber)':'var(--muted)';
    const beColor=sp.breakevenPct>0?'var(--red)':'var(--green)';
    const card=document.createElement('div');
    card.style.cssText='background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;position:relative;transition:border-color .15s;cursor:default';
    card.onmouseover=()=>card.style.borderColor='var(--amber)';
    card.onmouseout=()=>card.style.borderColor='var(--border)';

    // Mini bar: pctLleno visual
    const barW=Math.min(100,sp.pctLleno).toFixed(1);
    const isCall2=type==='call';

    card.innerHTML=`
      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div>
          <span style="font-family:var(--mono);font-size:13px;font-weight:700;color:${isCall2?'var(--green)':'var(--red)'}">${fmtStrike(baseStrike)}</span>
          <span style="color:var(--dim);margin:0 6px">→</span>
          <span style="font-family:var(--mono);font-size:13px;font-weight:700;color:${isCall2?'var(--green)':'var(--red)'}">${fmtStrike(sp.K2)}</span>
        </div>
        <div style="text-align:right">
          <span style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">ROI</span><br>
          <span style="font-family:var(--mono);font-size:15px;font-weight:700;color:${roiColor}">${sp.roi.toFixed(0)}%</span>
        </div>
      </div>

      <!-- % Lleno bar -->
      <div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--muted);margin-bottom:3px">
          <span>% Lleno del spread</span>
          <span style="color:${pctColor};font-weight:600">${sp.pctLleno.toFixed(1)}%</span>
        </div>
        <div style="height:5px;background:var(--surface2);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${barW}%;background:${pctColor};border-radius:3px;transition:width .3s"></div>
        </div>
      </div>

      <!-- Main metrics grid -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px">
        <div style="background:var(--bg);border-radius:6px;padding:7px 8px">
          <div style="font-size:9px;color:var(--muted);margin-bottom:2px">Costo neto</div>
          <div style="font-family:var(--mono);font-size:12px;font-weight:600;color:var(--red)">${fmtN(sp.netDebit)}</div>
        </div>
        <div style="background:var(--bg);border-radius:6px;padding:7px 8px">
          <div style="font-size:9px;color:var(--muted);margin-bottom:2px">Costo × lote</div>
          <div style="font-family:var(--mono);font-size:12px;font-weight:600;color:var(--red)">${fmtN(sp.costPerLote,0)}</div>
        </div>
        <div style="background:var(--bg);border-radius:6px;padding:7px 8px">
          <div style="font-size:9px;color:var(--muted);margin-bottom:2px">Costo total</div>
          <div style="font-family:var(--mono);font-size:12px;font-weight:600;color:var(--red)">${fmtN(sp.costConComi,0)}</div>
        </div>
        <div style="background:var(--bg);border-radius:6px;padding:7px 8px">
          <div style="font-size:9px;color:var(--muted);margin-bottom:2px">Max profit</div>
          <div style="font-family:var(--mono);font-size:12px;font-weight:600;color:var(--green)">${fmtN(sp.maxProfit,0)}</div>
        </div>
        <div style="background:var(--bg);border-radius:6px;padding:7px 8px">
          <div style="font-size:9px;color:var(--muted);margin-bottom:2px">Breakeven</div>
          <div style="font-family:var(--mono);font-size:12px;font-weight:600;color:${beColor}">${fmtN(sp.breakeven)}</div>
        </div>
        <div style="background:var(--bg);border-radius:6px;padding:7px 8px">
          <div style="font-size:9px;color:var(--muted);margin-bottom:2px">BE %</div>
          <div style="font-family:var(--mono);font-size:12px;font-weight:600;color:${beColor}">${sp.breakevenPct>=0?'+':''}${sp.breakevenPct.toFixed(2)}%</div>
        </div>
      </div>

      <!-- Secondary metrics -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:4px;font-size:10px;padding-top:8px;border-top:1px solid var(--border2)">
        <div style="text-align:center">
          <div style="color:var(--dim);font-size:8px;margin-bottom:1px">Dif.Strike</div>
          <div style="color:var(--muted);font-family:var(--mono)">${fmtN(sp.difStrike,0)}</div>
        </div>
        <div style="text-align:center">
          <div style="color:var(--dim);font-size:8px;margin-bottom:1px">Ratio</div>
          <div style="color:var(--muted);font-family:var(--mono)">${sp.ratio.toFixed(2)}</div>
        </div>
        <div style="text-align:center">
          <div style="color:var(--dim);font-size:8px;margin-bottom:1px">Delta Δ</div>
          <div style="color:var(--muted);font-family:var(--mono)">${sp.spreadDelta.toFixed(3)}</div>
        </div>
        <div style="text-align:center">
          <div style="color:var(--dim);font-size:8px;margin-bottom:1px">Theta Θ</div>
          <div style="color:var(--muted);font-family:var(--mono)">${sp.spreadTheta.toFixed(2)}</div>
        </div>
        <div style="text-align:center">
          <div style="color:var(--dim);font-size:8px;margin-bottom:1px">IV S1</div>
          <div style="color:var(--amber);font-family:var(--mono)">${(sp.iv1*100).toFixed(1)}%</div>
        </div>
        <div style="text-align:center">
          <div style="color:var(--dim);font-size:8px;margin-bottom:1px">IV S2</div>
          <div style="color:var(--amber);font-family:var(--mono)">${(sp.iv2*100).toFixed(1)}%</div>
        </div>
        <div style="text-align:center">
          <div style="color:var(--dim);font-size:8px;margin-bottom:1px">Vega Δ</div>
          <div style="color:var(--muted);font-family:var(--mono)">${sp.spreadVega.toFixed(3)}</div>
        </div>
        <div style="text-align:center">
          <div style="color:var(--dim);font-size:8px;margin-bottom:1px">Dist.%</div>
          <div style="color:var(--muted);font-family:var(--mono)">${sp.distancia.toFixed(1)}%</div>
        </div>
      </div>

      <!-- Create strategy button -->
      <button onclick="bbCreateStrategy(${baseStrike},${priceBase},${sp.K2},${sp.price2},'${type}')"
        style="width:100%;margin-top:10px;padding:5px;background:var(--surface2);border:1px solid var(--border);color:var(--muted);border-radius:6px;cursor:pointer;font-size:10px;transition:all .15s"
        onmouseover="this.style.borderColor='var(--amber)';this.style.color='var(--amber)'"
        onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--muted)'">
        + Crear en Control de estrategias
      </button>`;

    container.appendChild(card);
  });
}

function bbCreateStrategy(k1, p1, k2, p2, type){
  const lotes=parseInt(document.getElementById('bb-lotes')?.value)||1;
  const isCall=type==='call';
  // Bull call: +lotes K1, -lotes K2
  // Bear put: -lotes K1, +lotes K2 (buy lower put, sell higher put) — actually bear put: buy higher put, sell lower put
  const abbr=k=>k>=10000?Math.floor(k).toString().slice(0,3):Math.floor(k).toString().slice(0,2);
  const name=`${isCall?'Bull Call':'Bear Put'} ${isCall?'C':'P'}${abbr(k1)}/${isCall?'C':'P'}${abbr(k2)}`;
  const allStrikes=getAvailableStrikes();
  const closest=k=>allStrikes.reduce((p,s)=>Math.abs(s-k)<Math.abs(p-k)?s:p,allStrikes[0]||k);
  const newStrat={name,rows:[
    {lotes:lotes, type, strike:closest(k1), precio:p1, precioManual:''},
    {lotes:-lotes, type, strike:closest(k2), precio:p2, precioManual:''},
  ]};
  ctrlStrategies.push(newStrat);
  ctrlSave();
  showTab('control');
  ctrlPopulateExpiry();
  renderControl();
  showToast(`"${name}" creada en Control ✓`);
}
