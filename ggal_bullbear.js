/* ===== MÓDULO BULL/BEAR ===== */

function bbToggleType(){ toggleOptionType('bb-type','bb-type-btn',renderBullBear); }

function bbPopulateExpiry(){ populateExpirySelect('bb-expiry'); }

function bbGetMode(){
  const v=(localStorage.getItem('bb_mode')||'').trim();
  return (v==='cards' || v==='chain') ? v : 'chain';
}

function bbSetMode(mode){
  mode = (mode==='cards') ? 'cards' : 'chain';
  localStorage.setItem('bb_mode', mode);
  bbApplyMode();
}

function bbApplyMode(opts){
  const skipRender = !!(opts && opts.skipRender);
  const mode=bbGetMode();
  const btnChain=document.getElementById('bb-mode-chain');
  const btnCards=document.getElementById('bb-mode-cards');
  const ctlChain=document.getElementById('bb-controls-chain');
  const ctlCards=document.getElementById('bb-controls-cards');
  const viewChain=document.getElementById('bb2-view');
  const sum=document.getElementById('bb-summary');
  const cards=document.getElementById('bb-cards');

  const activeStyle=(active)=>active
    ? 'background:rgba(255,215,90,.14);border-color:rgba(255,215,90,.55);color:var(--amber)'
    : 'background:var(--surface2);border-color:var(--border);color:var(--text)';

  // Preserve padding/radius etc from inline styles and only override key visual fields.
  if(btnChain) btnChain.style.cssText = btnChain.style.cssText.replace(/background:[^;]+;?/g,'').replace(/border-color:[^;]+;?/g,'') + ';' + activeStyle(mode==='chain');
  if(btnCards) btnCards.style.cssText = btnCards.style.cssText.replace(/background:[^;]+;?/g,'').replace(/border-color:[^;]+;?/g,'') + ';' + activeStyle(mode==='cards');

  if(ctlChain) ctlChain.style.display = (mode==='chain') ? 'flex' : 'none';
  if(ctlCards) ctlCards.style.display = (mode==='cards') ? 'flex' : 'none';

  if(viewChain) viewChain.style.display = (mode==='chain') ? 'block' : 'none';
  if(sum) sum.style.display = (mode==='cards') ? 'flex' : 'none';
  if(cards) cards.style.display = (mode==='cards') ? 'grid' : 'none';

  // Keep expiry selects in sync when switching modes.
  const expCards=document.getElementById('bb-expiry');
  const expChain=document.getElementById('bb2-expiry');
  if(mode==='chain' && expCards && expChain && expCards.value && expChain.value!==expCards.value){
    expChain.value = expCards.value;
  }
  if(mode==='cards' && expCards && expChain && expChain.value && expCards.value!==expChain.value){
    expCards.value = expChain.value;
  }

  if(skipRender) return;

  if(mode==='chain'){
    window.bb2PopulateExpiry?.();
    window.bb2Render?.();
  }else{
    bbPopulateExpiry();
    renderBullBear();
  }
}

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
    <div data-bb-card="1" data-bb-k1="${baseStrike}" data-bb-k2="${sp.K2}" data-bb-type="${type}"
      style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;position:relative;transition:border-color .15s;cursor:default">

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

// Jump from Chain view to Cards view and focus a specific spread card.
function bbOpenCardsForStrike(baseStrike, type, expiry, focusK2){
  try{
    localStorage.setItem('bb_mode','cards');
    bbApplyMode({skipRender:true});

    // Ensure expiry dropdown is populated and set.
    bbPopulateExpiry();
    const expEl=document.getElementById("bb-expiry");
    if(expEl && expiry) expEl.value = expiry;

    // Type (call/put)
    const hidden=document.getElementById("bb-type");
    const btn=document.getElementById("bb-type-btn");
    if(hidden){ hidden.value = (type==='put') ? 'put' : 'call'; }
    if(btn && hidden){ syncTypeBtn(btn, hidden.value==='call'); }

    // Base strike dropdown depends on expiry+type.
    const exp = (expEl && expEl.value) ? expEl.value : expiry;
    bbPopulateBase((hidden && hidden.value) ? hidden.value : 'call', exp);
    const baseEl=document.getElementById("bb-base");
    if(baseEl && baseStrike!=null && isFinite(baseStrike)){
      baseEl.value = baseStrike;
    }

    renderBullBear();

    // Focus the specific K2 card (if provided)
    if(focusK2!=null && isFinite(focusK2)){
      setTimeout(()=>{
        const el=document.querySelector("[data-bb-card=\\\"1\\\"][data-bb-k2=\\\""+focusK2+"\\\"]");
        if(el){
          el.scrollIntoView({behavior:'smooth', block:'center'});
          const prevBorder=el.style.borderColor;
          const prevShadow=el.style.boxShadow;
          el.style.borderColor='rgba(255,215,90,.75)';
          el.style.boxShadow='0 0 0 2px rgba(255,215,90,.20)';
          setTimeout(()=>{ el.style.borderColor=prevBorder; el.style.boxShadow=prevShadow; }, 1200);
        }
      }, 60);
    }
  }catch(_){ }
}

window.bbOpenCardsForStrike = bbOpenCardsForStrike;

/* ===== MODULO BULL/BEAR - MODO CADENA (V2) ===== */
/* ===== MODULO BULL/BEAR V2 (WIP) ===== */

// This module is a compact, chain-like view with expandable rows.
// Each strike row can expand to show 3 candidate spreads above (calls) and below (puts),
// reusing the same core metrics as the Bull/Bear cards.

const BB2 = {
  // key(strike)-> { call: boolean, put: boolean }
  open: new Map(),
  bound: false,
};

function bb2PctColor(p){
  if(p==null || !isFinite(p)) return 'rgba(255,255,255,.16)';
  // Same thresholds as the detail table.
  return p < 33 ? 'var(--green)' : p < 60 ? 'var(--amber)' : 'var(--red)';
}

function bb2PctTextColor(p){
  if(p==null || !isFinite(p)) return 'var(--muted)';
  return p < 33 ? '#062e20' : p < 60 ? '#3a2600' : '#fff4f4';
}

function bb2Dots(cands, titlePrefix, baseStrike, type, expiry){
  const dots = [0,1,2,3].map(i=>{
    const c = (cands && cands[i]) ? cands[i] : null;
    const p = c && isFinite(c.pctLleno) ? c.pctLleno : null;
    const k2 = c && isFinite(c.k2) ? c.k2 : null;
    const col=bb2PctColor(p);
    const op=(p==null || !isFinite(p)) ? 0.35 : 0.95;
    // Tooltip format: "Strike2: Costo, % Lleno"
    const ttl=(k2==null)
      ? `Strike: --, Costo: --, %Lleno: --`
      : `Strike: ${fmtStrike(k2)}, Costo: ${fmtN(c.netDebit,2)}, %Lleno: ${fmtN(p,2)}%`;
    const jumpAttrs = (k2!=null)
      ? `data-bb2-jump="1" data-bb2-exp="${expiry}" data-bb2-type="${type}" data-bb2-k1="${baseStrike}" data-bb2-k2="${k2}"`
      : '';
    const cursor = (k2!=null) ? 'cursor:pointer' : 'cursor:default';
    const pctTxt=(p==null || !isFinite(p)) ? '--' : `${fmtN(p,0)}%`;
    const bg=(p==null || !isFinite(p)) ? 'rgba(255,255,255,.06)' : col;
    const txtCol=bb2PctTextColor(p);
    return `
      <span title="${ttl}" ${jumpAttrs}
        style="display:inline-flex;align-items:center;justify-content:center;min-width:40px;height:24px;padding:0 8px;border-radius:999px;background:${bg};box-shadow:inset 0 0 0 1px rgba(255,255,255,.10);color:${txtCol};text-shadow:0 1px 0 rgba(0,0,0,.10);font-size:10px;font-weight:700;${cursor};opacity:${op};white-space:nowrap">
        ${pctTxt}
      </span>`;
  }).join('');
  return `<div style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap">${dots}</div>`;
}

function bb2PopulateExpiry(){
  populateExpirySelect('bb2-expiry');
}

function bb2KeyStrike(k){
  const n=parseFloat(k);
  return isFinite(n)?Math.round(n*100)/100:n;
}

function bb2BindEvents(){
  if(BB2.bound) return;
  BB2.bound=true;
  const body=document.getElementById('bb2-body');
  if(!body) return;
  body.addEventListener('click', e=>{
    const jumpBase=e.target.closest('[data-bb2-jump-base]');
    if(jumpBase){
      const k1=parseFloat(jumpBase.dataset.bb2K1);
      const exp=jumpBase.dataset.bb2Exp || '';
      const type=(document.getElementById('bb-type')?.value || 'call');
      if(isFinite(k1)){
        window.bbOpenCardsForStrike?.(k1, type, exp, null);
      }
      return;
    }
    const jump=e.target.closest('[data-bb2-jump]');
    if(jump){
      const k1=parseFloat(jump.dataset.bb2K1);
      const k2=parseFloat(jump.dataset.bb2K2);
      const type=jump.dataset.bb2Type || 'call';
      const exp=jump.dataset.bb2Exp || '';
      if(isFinite(k1) && isFinite(k2)){
        window.bbOpenCardsForStrike?.(k1, type, exp, k2);
      }
      return;
    }
    const btn=e.target.closest('[data-bb2-toggle]');
    if(!btn) return;
    const k=bb2KeyStrike(btn.dataset.bb2K);
    if(!isFinite(k)) return;
    const side=btn.dataset.bb2Toggle;
    const cur=BB2.open.get(k) || { call:false, put:false };
    if(side==='call') cur.call=!cur.call;
    else if(side==='put') cur.put=!cur.put;
    BB2.open.set(k, cur);
    if(!cur.call && !cur.put) BB2.open.delete(k);
    bb2Render();
  });
}

function bb2FmtIv(iv){
  return iv && isFinite(iv) ? (iv*100).toFixed(2)+'%' : '--';
}

function bb2ComputeIv(S,K,T,r,q,price,type){
  if(!(price>0) || !(T>0)) return null;
  return impliedVol(S,K,T,r,q,price,type) || null;
}

function bb2SpreadMetrics(baseStrike, basePrice, k2, p2, lotes){
  const difStrike=Math.abs(k2-baseStrike);
  const netDebit=basePrice-p2;
  const costPerLote=netDebit*100;
  const costTotal=costPerLote*lotes;
  const pctLleno=difStrike>0?(netDebit/difStrike)*100:0;
  const ratio=p2>0?basePrice/p2:null;
  return { k2, p2, difStrike, netDebit, costPerLote, costTotal, pctLleno, ratio };
}

function bb2BuildSpreadsTable(title, color, rows, lotes, baseStrike, basePrice, type, expiry, spot){
  if(!rows.length){
    return `<div style="padding:10px 12px;color:var(--muted)">Sin spreads disponibles</div>`;
  }

  const th='padding:6px 8px;border-bottom:1px solid var(--border2);font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);text-align:center;white-space:nowrap';
  const td='padding:6px 8px;border-bottom:1px solid var(--border2);text-align:center;white-space:nowrap';

  const pctColor=p=>p<33?'var(--green)':p<60?'var(--amber)':'var(--red)';
  const fmtSignedPct=v=>{
    if(v==null||!isFinite(v))return'--';
    return `${v>=0?'+':''}${fmtN(v,2)}%`;
  };

  return `
    <div style="border:1px solid var(--border2);border-radius:8px;overflow:hidden;background:rgba(255,255,255,.02)">
      <div style="padding:8px 10px;border-bottom:1px solid var(--border2);display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:${color};font-weight:600">${title}</div>
        <div style="font-size:10px;color:var(--dim)">Lotes: <span style="color:var(--text);font-family:var(--mono)">${lotes}</span></div>
      </div>
      <div style="overflow:auto">
        <table style="width:100%;border-collapse:collapse;font-family:var(--mono);font-size:11px">
          <thead style="background:var(--surface2)">
            <tr>
              <th style="${th};color:${color}">Strike 2</th>
              <th style="${th}">Precio S2</th>
              <th style="${th}">% Lleno</th>
              <th style="${th}">Costo</th>
              <th style="${th}">Costo/Lote</th>
              <th style="${th}">Costo Total</th>
              <th style="${th}">Dif Strike</th>
              <th style="${th}">Breakeven</th>
              <th style="${th}">Dist. BE %</th>
              <th style="${th}">Risk/Reward</th>
              <th style="${th}">Ratio</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r=>{
              const breakeven = type==='call' ? (baseStrike + r.netDebit) : (baseStrike - r.netDebit);
              const bePct = (spot && isFinite(spot) && spot>0) ? ((breakeven-spot)/spot)*100 : null;
              const rr = r.netDebit>0 ? ((r.difStrike - r.netDebit) / r.netDebit) : null;
              const rrTxt = rr==null||!isFinite(rr) ? '--' : `${fmtN(rr,2)}x`;
              // Dist. BE%: positive = green, negative = red (per user request)
              const beColor = bePct==null ? 'var(--muted)' : (bePct>=0 ? 'var(--green)' : 'var(--red)');
              return `
              <tr>
                <td style="${td};color:${color};font-weight:600">
                  <span data-bb2-jump="1" data-bb2-exp="${expiry}" data-bb2-type="${type}" data-bb2-k1="${baseStrike}" data-bb2-k2="${r.k2}"
                    style="cursor:pointer;text-decoration:underline dotted rgba(255,255,255,.25);text-underline-offset:2px">
                    ${fmtStrike(r.k2)}
                  </span>
                </td>
                <td style="${td};color:${color}">${fmtN(r.p2,2)}</td>
                <td style="${td};color:${pctColor(r.pctLleno)}">${fmtN(r.pctLleno,2)}%</td>
                <td style="${td}">${fmtN(r.netDebit,2)}</td>
                <td style="${td}">${fmtN(r.costPerLote,2)}</td>
                <td style="${td}">${fmtN(r.costTotal,2)}</td>
                 <td style="${td}">${fmtN(r.difStrike,0)}</td>
                 <td style="${td}">${fmtStrike(breakeven)}</td>
                 <td style="${td};color:${beColor}">${fmtSignedPct(bePct)}</td>
                 <td style="${td}">${rrTxt}</td>
                 <td style="${td}">${r.ratio!=null?fmtN(r.ratio,2):'--'}</td>
               </tr>
             `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function bb2Render(){
  bb2BindEvents();
  const body=document.getElementById('bb2-body');
  const expEl=document.getElementById('bb2-expiry');
  if(!body || !expEl) return;

  const expiry=expEl.value || ST.selExpiry || ST.expirations[0];
  if(!expiry || !ST.chain[expiry]){ body.innerHTML=''; return; }
  ST.selExpiry=expiry;

  const filter=document.getElementById('bb2-filter')?.value || 'near25';
  // Shared parameter (with Bull/Bear cards view)
  const lotes=Math.max(1, parseInt(document.getElementById('bb-lotes')?.value || '1',10) || 1);

  const S=ST.spot;
  const r=ST.rate;
  const q=ST.q;
  const T=(new Date(expiry+'T12:00:00')-new Date())/(365*24*3600*1000);

  const fullChain=[...ST.chain[expiry]].slice().sort((a,b)=>a.strike-b.strike);
  let rows=[...fullChain];
  if(filter==='near25') rows=rows.filter(row=>Math.abs(row.strike-S)/S<=0.25);

  // Compute the two closest ATM strikes (below/above spot) using the full chain for this expiry.
  const allStrikes=fullChain.map(rw=>rw.strike);
  let lowATM, highATM;
  for(const k of allStrikes){
    if(k<=S) lowATM=k;
    else { highATM=k; break; }
  }
  const atmSet=new Set([lowATM, highATM].filter(v=>v!==undefined));

  // IMPORTANT: end with ';' so concatenated properties (borders) parse correctly.
  const tdBase='padding:6px 8px;border-bottom:1px solid var(--border2);text-align:center;white-space:nowrap;';
  const strikeTd=tdBase+'border-left:1px solid var(--border);border-right:1px solid var(--border);font-weight:600;color:var(--amber);';
  const callSepTd=tdBase+'border-right:1px solid var(--border);';

  body.innerHTML = rows.map(row=>{
    const K=row.strike;
    const key=bb2KeyStrike(K);
    const st=BB2.open.get(key) || { call:false, put:false };
    const isOpenCall=!!st.call;
    const isOpenPut=!!st.put;
    const isAtm=atmSet.has(K);
    const atmBg=isAtm?'background:var(--atm-row);':'';

    const cLast=row.callMid>0?row.callMid:null;
    const pLast=row.putMid>0?row.putMid:null;
    // 3 candidate spreads for the dot indicators are computed against the full chain,
    // so they remain stable even when the table is filtered.
    const above4 = fullChain.filter(r2=>r2.strike>K && r2.callMid>0).slice(0,4);
    const below4 = fullChain.filter(r2=>r2.strike<K && r2.putMid>0).slice(-4).reverse();

    const callCands = (cLast!=null)
      ? above4.map(r2=>bb2SpreadMetrics(K, cLast, r2.strike, r2.callMid, lotes)).filter(s=>s.netDebit>0).slice(0,4)
      : [];
    const putCands = (pLast!=null)
      ? below4.map(r2=>bb2SpreadMetrics(K, pLast, r2.strike, r2.putMid, lotes)).filter(s=>s.netDebit>0).slice(0,4)
      : [];

    const plusStyle='padding:2px 0;width:26px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);cursor:pointer;font-size:12px;line-height:18px';
    const callHtml = cLast!=null?`<span style="color:var(--green);font-weight:600">${fmtN(cLast,2)}</span>`:'--';
    const putHtml  = pLast!=null?`<span style="color:var(--red);font-weight:600">${fmtN(pLast,2)}</span>`:'--';

    const baseRow = `
      <tr>
        <td style="${tdBase};width:34px;${atmBg}">
          <button type="button" data-bb2-toggle="call" data-bb2-k="${key}" title="${isOpenCall?'Cerrar Calls':'Abrir Calls'}" style="${plusStyle}">${isOpenCall?'-':'+'}</button>
        </td>
        <td style="${tdBase};${atmBg}">${callHtml}</td>
        <td style="${callSepTd};${atmBg}">${bb2Dots(callCands, 'Calls', K, 'call', expiry)}</td>
        <td style="${strikeTd};${atmBg}">
          <span data-bb2-jump-base="1" data-bb2-exp="${expiry}" data-bb2-k1="${K}"
            title="Ver tarjetas para ${fmtStrike(K)}"
            style="cursor:pointer;text-decoration:underline dotted rgba(255,255,255,.25);text-underline-offset:2px">
            ${fmtStrike(K)}
          </span>
        </td>
        <td style="${tdBase};${atmBg}">${bb2Dots(putCands, 'Puts', K, 'put', expiry)}</td>
        <td style="${tdBase};${atmBg}">${putHtml}</td>
        <td style="${tdBase};width:34px;${atmBg}">
          <button type="button" data-bb2-toggle="put" data-bb2-k="${key}" title="${isOpenPut?'Cerrar Puts':'Abrir Puts'}" style="${plusStyle}">${isOpenPut?'-':'+'}</button>
        </td>
      </tr>`;

    if(!isOpenCall && !isOpenPut) return baseRow;

    // Build 4 next strikes for call spreads (above) and put spreads (below)
    const above = isOpenCall ? fullChain.filter(r2=>r2.strike>K && r2.callMid>0).slice(0,4) : [];
    const below = isOpenPut ? fullChain.filter(r2=>r2.strike<K && r2.putMid>0).slice(-4).reverse() : [];

    const callSpreads = (isOpenCall && cLast!=null ? above.map(r2=>bb2SpreadMetrics(K, cLast, r2.strike, r2.callMid, lotes)).filter(s=>s.netDebit>0) : []);
    const putSpreads  = (isOpenPut && pLast!=null ? below.map(r2=>bb2SpreadMetrics(K, pLast, r2.strike, r2.putMid, lotes)).filter(s=>s.netDebit>0) : []);

    const panels = [];
    if(isOpenCall) panels.push(bb2BuildSpreadsTable('Bull Call Spread (+1/+2/+3/+4)', 'var(--green)', callSpreads, lotes, K, cLast, 'call', expiry, S));
    if(isOpenPut) panels.push(bb2BuildSpreadsTable('Bear Put Spread (-1/-2/-3/-4)', 'var(--red)', putSpreads, lotes, K, pLast, 'put', expiry, S));

    const details = `
      <tr>
        <td colspan="7" style="padding:10px 12px;border-bottom:1px solid var(--border2);background:rgba(0,0,0,.12)">
          <div style="display:grid;grid-template-columns:repeat(${panels.length},minmax(0,1fr));gap:10px">
            ${panels.join('')}
          </div>
        </td>
      </tr>`;

    return baseRow + details;
  }).join('');
}
