/* ===== MÓDULO BULL/BEAR ===== */

function bbToggleType(){ toggleOptionType('bb-type','bb-type-btn',renderBullBear); }

function bbPopulateExpiry(){ populateExpirySelect('bb-expiry'); }

function bbPopulateBase(type, expiry){
  const sel=document.getElementById('bb-base');
  if(!sel||!expiry||!ST.chain[expiry])return;
  const cur=parseFloat(sel.value)||0;
  sel.innerHTML='';
  const rows=ST.chain[expiry].filter(r=>type==='call'?r.callMid>0:r.putMid>0);
  rows.forEach(r=>{
    const o=document.createElement('option');
    o.value=r.strike; o.textContent=fmtStrike(r.strike);
    if(Math.round(r.strike*100)===Math.round(cur*100))o.selected=true;
    sel.appendChild(o);
  });
  if(!cur&&rows.length){
    const atm=rows.reduce((p,r)=>Math.abs(r.strike-ST.spot)<Math.abs(p.strike-ST.spot)?r:p,rows[0]);
    sel.value=atm.strike;
  }
}

function bbBindCardEvents(){
  const container=document.getElementById('bb-cards');
  if(!container||container._bbBound)return;
  container._bbBound=true;
  container.addEventListener('click',e=>{
    const btn=e.target.closest('[data-bb-create]');
    if(!btn)return;
    bbCreateStrategy(
      parseFloat(btn.dataset.k1),
      parseFloat(btn.dataset.p1),
      parseFloat(btn.dataset.k2),
      parseFloat(btn.dataset.p2),
      btn.dataset.type
    );
  });
}

// Build the HTML for a single spread card
function bbBuildCard(sp, baseStrike, priceBase, type, lotes){
  const isCall=type==='call';
  const pctColor=sp.pctLleno<33?'var(--green)':sp.pctLleno<60?'var(--amber)':'var(--red)';
  const roiColor=sp.roi>200?'var(--green)':sp.roi>100?'var(--amber)':'var(--muted)';
  const beColor=sp.breakevenPct>0?'var(--red)':'var(--green)';
  const strikeColor=isCall?'var(--green)':'var(--red)';
  const barW=Math.min(100,sp.pctLleno).toFixed(1);

  const metric=(label,val)=>`
    <div style="background:var(--bg);border-radius:6px;padding:7px 8px">
      <div style="font-size:9px;color:var(--muted);margin-bottom:2px">${label}</div>
      <div style="font-family:var(--mono);font-size:12px;font-weight:600;color:${val[1]}">${val[0]}</div>
    </div>`;

  const secMetric=(label,val,color='var(--muted)')=>`
    <div style="text-align:center">
      <div style="color:var(--dim);font-size:8px;margin-bottom:1px">${label}</div>
      <div style="color:${color};font-family:var(--mono)">${val}</div>
    </div>`;

  return`
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;position:relative;transition:border-color .15s;cursor:default">

      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div>
          <span style="font-family:var(--mono);font-size:13px;font-weight:700;color:${strikeColor}">${fmtStrike(baseStrike)}</span>
          <span style="color:var(--dim);margin:0 6px">→</span>
          <span style="font-family:var(--mono);font-size:13px;font-weight:700;color:${strikeColor}">${fmtStrike(sp.K2)}</span>
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

      <!-- Main metrics -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px">
        ${metric('Costo neto',   [fmtN(sp.netDebit),     'var(--red)'])}
        ${metric('Costo × lote', [fmtN(sp.costPerLote,0),'var(--red)'])}
        ${metric('Costo total',  [fmtN(sp.costConComi,0),'var(--red)'])}
        ${metric('Max profit',   [fmtN(sp.maxProfit,0),  'var(--green)'])}
        ${metric('Breakeven',    [fmtN(sp.breakeven),     beColor])}
        ${metric('BE %',         [(sp.breakevenPct>=0?'+':'')+sp.breakevenPct.toFixed(2)+'%', beColor])}
      </div>

      <!-- Secondary metrics -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:4px;font-size:10px;padding-top:8px;border-top:1px solid var(--border2)">
        ${secMetric('Dif.Strike', fmtN(sp.difStrike,0))}
        ${secMetric('Ratio',      sp.ratio.toFixed(2))}
        ${secMetric('Delta Δ',    sp.spreadDelta.toFixed(3))}
        ${secMetric('Theta Θ',    sp.spreadTheta.toFixed(2))}
        ${secMetric('IV S1',      (sp.iv1*100).toFixed(1)+'%','var(--amber)')}
        ${secMetric('IV S2',      (sp.iv2*100).toFixed(1)+'%','var(--amber)')}
        ${secMetric('Vega Δ',     sp.spreadVega.toFixed(3))}
        ${secMetric('Dist.%',     sp.distancia.toFixed(1)+'%')}
      </div>

      <!-- Create strategy button -->
      <button data-bb-create="1" data-k1="${baseStrike}" data-p1="${priceBase}" data-k2="${sp.K2}" data-p2="${sp.price2}" data-type="${type}"
        style="width:100%;margin-top:10px;padding:5px;background:var(--surface2);border:1px solid var(--border);color:var(--muted);border-radius:6px;cursor:pointer;font-size:10px;transition:all .15s">
        + Crear en Control de estrategias
      </button>
    </div>`;
}

function renderBullBear(){
  bbBindCardEvents();
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
  const isCall=type==='call';
  const stratLabel=isCall?'Bull Call Spread':'Bear Put Spread';

  const legs2=isCall
    ?chainRows.filter(row=>row.strike>baseStrike&&row.callMid>0)
    :chainRows.filter(row=>row.strike<baseStrike&&row.putMid>0).reverse();

  const spreads=legs2.map(row2=>{
    const price2=isCall?row2.callMid:row2.putMid;
    const K1=baseStrike, K2=row2.strike;
    const difStrike=Math.abs(K2-K1);
    const netDebit=priceBase-price2;
    const costPerLote=netDebit*100;
    const costTotal=costPerLote*lotes;
    const costConComi=costTotal*(1+com/100*iva);
    const breakeven=isCall?(K1+netDebit):(K1-netDebit);
    const breakevenPct=(breakeven-S)/S*100;
    const maxProfit=(difStrike-netDebit)*100*lotes;
    const pctLleno=difStrike>0?(netDebit/difStrike)*100:0;
    const roi=netDebit>0?((difStrike-netDebit)/netDebit)*100:0;
    const ratio=price2>0?priceBase/price2:0;
    const distancia=Math.abs(K2-S)/S*100;
    const iv2=price2>0?impliedVol(S,K2,T,r,q,price2,type)||0:0;
    const g2=price2>0?bs(S,K2,T,r,q,iv2,type):{delta:0,vega:0,gamma:0,theta:0};
    return{
      K2, price2, difStrike, netDebit, costPerLote, costTotal, costConComi,
      breakeven, breakevenPct, maxProfit, pctLleno, roi, ratio, distancia,
      spreadDelta:isCall?greeksBase.delta-g2.delta:g2.delta-greeksBase.delta,
      spreadTheta:isCall?greeksBase.theta-g2.theta:g2.theta-greeksBase.theta,
      spreadVega :isCall?greeksBase.vega -g2.vega :g2.vega -greeksBase.vega,
      iv1:ivBase, iv2,
    };
  }).filter(s=>s.netDebit>0);

  // Summary bar
  const sumEl=document.getElementById('bb-summary');
  if(sumEl){
    sumEl.innerHTML=[
      `<strong style="color:var(--text)">${stratLabel}</strong>`,
      `Base <strong style="color:var(--amber)">${fmtStrike(baseStrike)}</strong>&nbsp;·&nbsp;Precio <strong style="color:var(--amber)">${fmtN(priceBase)}</strong>&nbsp;·&nbsp;Spot <strong style="color:var(--text)">${fmtN(S,0)}</strong>`,
      `Delta base <strong style="color:var(--green)">${greeksBase.delta.toFixed(3)}</strong>&nbsp;·&nbsp;IV <strong style="color:var(--amber)">${(ivBase*100).toFixed(1)}%</strong>`,
      `<strong style="color:var(--text)">${spreads.length}</strong> spreads disponibles`,
    ].map(html=>`<div style="padding:5px 14px;background:var(--surface);border:1px solid var(--border);border-radius:20px;color:var(--muted)">${html}</div>`).join('');
  }

  const container=document.getElementById('bb-cards');
  if(!spreads.length){
    container.innerHTML=`<div style="color:var(--muted);padding:20px">Sin spreads disponibles para esta base</div>`;
    return;
  }
  container.innerHTML=spreads.map(sp=>bbBuildCard(sp,baseStrike,priceBase,type,lotes)).join('');
}

function bbCreateStrategy(k1, p1, k2, p2, type){
  const lotes=parseInt(document.getElementById('bb-lotes')?.value)||1;
  const isCall=type==='call';
  const abbr=k=>k>=10000?Math.floor(k).toString().slice(0,3):Math.floor(k).toString().slice(0,2);
  const name=`${isCall?'Bull Call':'Bear Put'} ${isCall?'C':'P'}${abbr(k1)}/${isCall?'C':'P'}${abbr(k2)}`;
  const allStrikes=getAvailableStrikes();
  const closest=k=>allStrikes.reduce((p,s)=>Math.abs(s-k)<Math.abs(p-k)?s:p,allStrikes[0]||k);
  ctrlStrategies.push({name,rows:[
    {lotes: lotes,type,strike:closest(k1),precio:p1,precioManual:''},
    {lotes:-lotes,type,strike:closest(k2),precio:p2,precioManual:''},
  ]});
  ctrlSave();
  showTab('control');
  ctrlPopulateExpiry();
  renderControl();
  showToast(`"${name}" creada en Control ✓`);
}
