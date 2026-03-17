/* ===== BLACK-SCHOLES ENGINE ===== */
function normCDF(x) {
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
  const sign=x<0?-1:1; x=Math.abs(x)/Math.SQRT2;
  const t=1/(1+p*x);
  const y=1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
  return 0.5*(1+sign*y);
}
function normPDF(x){return Math.exp(-0.5*x*x)/Math.sqrt(2*Math.PI)}

function bs(S,K,T,r,q,sigma,type){
  if(T<=0){const i=type==='call'?Math.max(S-K,0):Math.max(K-S,0);return{price:i,delta:0,gamma:0,theta:0,vega:0,rho:0}}
  const st=Math.sqrt(T);
  const d1=(Math.log(S/K)+(r-q+0.5*sigma*sigma)*T)/(sigma*st);
  const d2=d1-sigma*st;
  const eqT=Math.exp(-q*T),erT=Math.exp(-r*T);
  let price,delta,rho;
  if(type==='call'){
    price=S*eqT*normCDF(d1)-K*erT*normCDF(d2);
    delta=eqT*normCDF(d1);
    rho=K*T*erT*normCDF(d2)/100;
  }else{
    price=K*erT*normCDF(-d2)-S*eqT*normCDF(-d1);
    delta=-eqT*normCDF(-d1);
    rho=-K*T*erT*normCDF(-d2)/100;
  }
  const gamma=eqT*normPDF(d1)/(S*sigma*st);
  const th_c=(-S*eqT*normPDF(d1)*sigma/(2*st)-r*K*erT*normCDF(d2)+q*S*eqT*normCDF(d1))/365;
  const th_p=(-S*eqT*normPDF(d1)*sigma/(2*st)+r*K*erT*normCDF(-d2)-q*S*eqT*normCDF(-d1))/365;
  const theta=type==='call'?th_c:th_p;
  const vega=S*eqT*normPDF(d1)*st/100;
  return{price,delta,gamma,theta,vega,rho};
}

function impliedVol(S,K,T,r,q,mktPrice,type){
  if(T<=0||mktPrice<=0)return null;
  let sig=0.50;
  for(let i=0;i<200;i++){
    const res=bs(S,K,T,r,q,sig,type);
    const diff=res.price-mktPrice;
    if(Math.abs(diff)<0.01)return sig;
    const v=res.vega*100;
    if(Math.abs(v)<1e-10)break;
    sig-=diff/v;
    if(sig<=0.001)sig=0.001;
    if(sig>5)sig=5;
  }
  return sig;
}

/* ===== STATE ===== */
const ST={
  spot:8200,rate:0.30,q:0,
  expirations:[],chain:{},
  selExpiry:null,
  legs:[],
  charts:{pnl:null,sens:null,iv:null,ivSens:null}
};

/* ===== MOCK DATA ===== */
function generateMockData(){
  const S=ST.spot,r=ST.rate,q=ST.q;
  const today=new Date();
  const expirations=[];
  for(let m=1;m<=3;m++){
    const d=new Date(today);
    d.setMonth(d.getMonth()+m);d.setDate(1);
    let fri=0;
    while(fri<3){if(d.getDay()===5)fri++;if(fri<3)d.setDate(d.getDate()+1);}
    expirations.push(d.toISOString().split('T')[0]);
  }
  const base=Math.round(S/500)*500;
  const strikes=[];
  for(let i=-6;i<=6;i++)strikes.push(base+i*500);
  const chain={};
  expirations.forEach(exp=>{
    const T=(new Date(exp+'T12:00:00')-today)/(365*24*3600*1000);
    chain[exp]=strikes.map(K=>{
      const m=Math.log(K/S);
      const vol=Math.max(0.35,Math.min(1.8,0.70-0.06*m+0.18*m*m));
      const cR=bs(S,K,T,r,q,vol,'call'),pR=bs(S,K,T,r,q,vol,'put');
      const sp=Math.max(3,cR.price*0.04);
      return{
        strike:K,expiry:exp,T,iv:vol,
        callBid:Math.max(0,cR.price-sp/2),callAsk:cR.price+sp/2,callMid:cR.price,
        callOI:Math.round(Math.random()*2000+50),
        putBid:Math.max(0,pR.price-sp/2),putAsk:pR.price+sp/2,putMid:pR.price,
        putOI:Math.round(Math.random()*1500+50)
      };
    });
  });
  ST.expirations=expirations;ST.chain=chain;
  ST.selExpiry=expirations[0];
  const atmRow=chain[expirations[0]].find(r=>r.strike===base)||chain[expirations[0]][6];
  document.getElementById('hdr-atm-vol').textContent=(atmRow.iv*100).toFixed(1)+'%';
  document.getElementById('hdr-time').textContent=new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
}

function populateExpiries(){
  const sel=document.getElementById('expiry-sel');
  sel.innerHTML='';
  ST.expirations.forEach(e=>{
    const o=document.createElement('option');
    o.value=e;o.textContent=fmtExpiry(e);sel.appendChild(o);
  });
}

/* ===== CHAIN RENDER ===== */
function renderChain(){
  const exp=document.getElementById('expiry-sel').value||ST.selExpiry;
  const filter=document.getElementById('chain-filter').value;
  if(!exp||!ST.chain[exp])return;
  ST.selExpiry=exp;
  // Auto-update days in BS bar when expiry changes
  const T=(new Date(exp+'T12:00:00')-new Date())/(365*24*3600*1000);
  const days=Math.max(1,Math.round(T*365));
  const daysEl=document.getElementById('bs-days');
  if(daysEl&&!daysEl._userEdited)daysEl.value=days;
  const S=ST.spot,r=ST.rate,q=ST.q;
  let rows=[...ST.chain[exp]];
  if(filter==='near')rows=rows.filter(r=>Math.abs(r.strike-S)/S<0.25);
  else if(filter==='itm-call')rows=rows.filter(r=>r.strike<S);
  else if(filter==='itm-put')rows=rows.filter(r=>r.strike>S);
  // ATM: nearest strike BELOW spot and nearest strike ABOVE spot
  const sortedStrikes=rows.map(r=>r.strike).sort((a,b)=>a-b);
  const atmBelow=sortedStrikes.filter(s=>s<=S).slice(-1)[0];
  const atmAbove=sortedStrikes.filter(s=>s>S)[0];
  const atmStrikes=new Set([atmBelow,atmAbove].filter(s=>s!==undefined));

  const tb=document.getElementById('chain-body');
  tb.innerHTML='';
  rows.forEach(row=>{
    // T: use BS bar override if set, otherwise row's natural T
    const daysEl=document.getElementById('bs-days');
    const daysOverride=daysEl&&daysEl._userEdited?parseFloat(daysEl.value):NaN;
    const T=!isNaN(daysOverride)&&daysOverride>0 ? daysOverride/365 : row.T;

    // Recalculate IV live with current ST.rate / ST.spot / ST.q and market LAST price
    // Only use LAST (callMid/putMid) — no bid/ask fallback
    const midC=row.callMid>0?row.callMid:0;
    const midP=row.putMid>0?row.putMid:0;
    const ivC=midC>0 ? (impliedVol(S,row.strike,T,r,q,midC,'call')||null) : null;
    const ivP=midP>0 ? (impliedVol(S,row.strike,T,r,q,midP,'put')||null) : null;
    const vol=ivC||ivP||row.iv;
    const volC=ivC||vol;
    const volP=ivP||vol;

    const cG=bs(S,row.strike,T,r,q,volC,'call');
    const pG=bs(S,row.strike,T,r,q,volP,'put');

    const isAtmRow=atmStrikes.has(row.strike);
    const itmC=!isAtmRow&&row.strike<S;
    const itmP=!isAtmRow&&row.strike>S;

    // Label: ATM for the two nearest strikes, ITM/OTM for the rest
    const callLabel=isAtmRow?'ATM':itmC?'ITM':'OTM';
    const putLabel =isAtmRow?'ATM':itmP?'ITM':'OTM';
    const callLabelColor=isAtmRow?'var(--amber)':itmC?'var(--green)':'var(--muted)';
    const putLabelColor =isAtmRow?'var(--amber)':itmP?'var(--red)':'var(--muted)';

    // Per-side background colors
    const bgCall=isAtmRow?'rgba(232,184,75,0.15)':itmC?'var(--itm-call)':'';
    const bgPut =isAtmRow?'rgba(232,184,75,0.15)':itmP?'rgba(240,90,90,0.10)':'';
    const bgAttr=bg=>bg?`background:${bg};`:'';

    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td style="${bgAttr(bgCall)}font-size:10px;font-weight:500;color:${callLabelColor}">${callLabel}</td>
      <td style="${bgAttr(bgCall)}color:${cG.delta>0.5?'var(--green)':'var(--text)'}">${cG.delta.toFixed(3)}</td>
      <td style="${bgAttr(bgCall)}color:var(--muted)">${cG.vega.toFixed(3)}</td>
      <td style="${bgAttr(bgCall)}" class="neg">${cG.theta.toFixed(3)}</td>
      <td style="${bgAttr(bgCall)}">${fmtN(row.callBid)}</td>
      <td style="${bgAttr(bgCall)}color:var(--green)">${fmtN(row.callAsk)}</td>
      <td style="${bgAttr(bgCall)}color:var(--green);font-weight:500">${row.callMid>0?fmtN(row.callMid):'--'}</td>
      <td style="${bgAttr(bgCall)}" class="amber">${ivC?(volC*100).toFixed(2)+'%':'--'}</td>
      <td class="strike-col">${fmtStrike(row.strike)}</td>
      <td style="${bgAttr(bgPut)}" class="amber">${ivP?(volP*100).toFixed(2)+'%':'--'}</td>
      <td style="${bgAttr(bgPut)}color:var(--red);font-weight:500">${row.putMid>0?fmtN(row.putMid):'--'}</td>
      <td style="${bgAttr(bgPut)}color:var(--red)">${fmtN(row.putAsk)}</td>
      <td style="${bgAttr(bgPut)}">${fmtN(row.putBid)}</td>
      <td style="${bgAttr(bgPut)}" class="neg">${pG.theta.toFixed(3)}</td>
      <td style="${bgAttr(bgPut)}color:var(--muted)">${pG.vega.toFixed(3)}</td>
      <td style="${bgAttr(bgPut)}color:${pG.delta<-0.5?'var(--red)':'var(--text)'}">${pG.delta.toFixed(3)}</td>
      <td style="${bgAttr(bgPut)}font-size:10px;font-weight:500;color:${putLabelColor};text-align:right">${putLabel}</td>`;
    tr.addEventListener('click',(e)=>{
      const cellIdx=e.target.cellIndex;
      if(cellIdx<=7) selectOpt(row,'call',cG,volC);
      else if(cellIdx>=9) selectOpt(row,'put',pG,volP);
    });
    tb.appendChild(tr);
  });
}

function selectOpt(row,type,g,vol){
  document.querySelectorAll('.chain-table tr.selected').forEach(r=>r.classList.remove('selected'));
  const price=type==='call'?row.callMid:row.putMid;
  document.getElementById('sel-name').textContent=`${type.toUpperCase()} — Strike $${fmtStrike(row.strike)} — ${fmtExpiry(row.expiry)}`;
  const typEl=document.getElementById('sel-type');
  typEl.textContent=type.toUpperCase();
  typEl.style.color=type==='call'?'var(--green)':'var(--red)';
  document.getElementById('g-price').textContent='$'+price.toFixed(2);
  const dEl=document.getElementById('g-delta');
  dEl.textContent=g.delta.toFixed(4);
  dEl.style.color=g.delta>0?'var(--green)':'var(--red)';
  document.getElementById('g-gamma').textContent=g.gamma.toFixed(5);
  document.getElementById('g-theta').textContent=g.theta.toFixed(2);
  document.getElementById('g-vega').textContent=g.vega.toFixed(4);
  document.getElementById('g-iv').textContent=(vol*100).toFixed(2)+'%';
  showToast(`${type.toUpperCase()} Strike ${fmtStrike(row.strike)} — IV ${(vol*100).toFixed(1)}%`);
}

/* ===== STRATEGY BUILDER ===== */
let legs=[];

function loadPreset(name,el){
  document.querySelectorAll('.preset-btn').forEach(b=>b.classList.remove('active'));
  if(el)el.classList.add('active');
  const S=ST.spot,r=ST.rate,q=ST.q;
  const exp=ST.selExpiry||ST.expirations[0];
  const T=ST.chain[exp]?.[0]?.T||(30/365);
  const strikes=getAvailableStrikes();

  // Find nearest strike to a target value
  const nearest=(target)=>strikes.length
    ? strikes.reduce((p,c)=>Math.abs(c-target)<Math.abs(p-target)?c:p,strikes[0])
    : Math.round(target/500)*500;

  const atm=nearest(S);
  const otmC=nearest(S*1.06);
  const otmP=nearest(S*0.94);

  // Get real market price from chain, fall back to BS
  const chainRow=(K)=>exp&&ST.chain[exp]?ST.chain[exp].find(r=>r.strike===K):null;
  const priceC=(K)=>{const row=chainRow(K);return row&&row.callMid>0?row.callMid:parseFloat(bs(S,K,T,r,q,0.70,'call').price.toFixed(2));};
  const priceP=(K)=>{const row=chainRow(K);return row&&row.putMid>0?row.putMid:parseFloat(bs(S,K,T,r,q,0.73,'put').price.toFixed(2));};

  const presets={
    bull_spread:[
      {type:'call',qty:1, strike:atm, premium:priceC(atm)},
      {type:'call',qty:-1,strike:otmC,premium:priceC(otmC)}
    ],
    bear_spread:[
      {type:'put',qty:1, strike:atm, premium:priceP(atm)},
      {type:'put',qty:-1,strike:otmP,premium:priceP(otmP)}
    ],
    straddle:[
      {type:'call',qty:1,strike:atm,premium:priceC(atm)},
      {type:'put', qty:1,strike:atm,premium:priceP(atm)}
    ],
    strangle:[
      {type:'call',qty:1,strike:otmC,premium:priceC(otmC)},
      {type:'put', qty:1,strike:otmP,premium:priceP(otmP)}
    ],
    covered_call:[
      {type:'stock',qty:100, strike:0,   premium:parseFloat(S.toFixed(2))},
      {type:'call', qty:-1,  strike:otmC,premium:priceC(otmC)}
    ],
    custom:[]
  };
  legs=(presets[name]||[]).map(l=>({...l}));
  renderLegs();updatePnL();
}

function getAvailableStrikes(){
  // Pull strikes from current chain data if available, else empty
  const exp=ST.selExpiry||ST.expirations[0];
  if(exp&&ST.chain[exp])return ST.chain[exp].map(r=>r.strike);
  return [];
}

function addLeg(){
  const strikes=getAvailableStrikes();
  const defStrike=strikes.length ? strikes[Math.floor(strikes.length/2)] : Math.round(ST.spot/500)*500;
  legs.push({type:'call',qty:1,strike:defStrike,premium:0});
  renderLegs();updatePnL();
}

function removeLeg(i){legs.splice(i,1);renderLegs();updatePnL();}

function updateLeg(i,f,v){
  if(f==='qty'){
    const n=parseFloat(v);
    legs[i].qty=isNaN(n)?1:n;
  } else if(f==='strike'){
    legs[i].strike=parseFloat(v)||0;
    // Auto-fill premium from chain data
    const exp=ST.selExpiry||ST.expirations[0];
    if(exp&&ST.chain[exp]){
      const row=ST.chain[exp].find(r=>r.strike===legs[i].strike);
      if(row){
        legs[i].premium=legs[i].type==='put'?(row.putMid||row.putAsk||0):(row.callMid||row.callAsk||0);
        renderLegs();
      }
    }
  } else {
    legs[i][f]=isNaN(parseFloat(v))?v:parseFloat(v);
    if(f==='type'){
      // Auto-update premium when type changes
      const exp=ST.selExpiry||ST.expirations[0];
      if(exp&&ST.chain[exp]){
        const row=ST.chain[exp].find(r=>r.strike===legs[i].strike);
        if(row)legs[i].premium=v==='put'?(row.putMid||row.putAsk||0):(row.callMid||row.callAsk||0);
      }
      renderLegs();
    }
  }
  updatePnL();
}

function renderLegs(){
  const tb=document.getElementById('legs-body');
  tb.innerHTML='';
  const strikes=getAvailableStrikes();
  legs.forEach((leg,i)=>{
    const sign=leg.qty>=0?1:-1;
    const qtyColor=sign>0?'var(--green)':'var(--red)';
    const qtyLabel=sign>0?'Compra':'Venta';
    const strikeOpts=strikes.length
      ? strikes.map(s=>`<option value="${s}"${Math.round(s*100)===Math.round(leg.strike*100)?' selected':''}>${fmtStrike(s)}</option>`).join('')
      : `<option value="${leg.strike}">${fmtStrike(leg.strike)}</option>`;
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td><select onchange="updateLeg(${i},'type',this.value)" style="width:58px">
        <option value="call"${leg.type==='call'?' selected':''}>Call</option>
        <option value="put"${leg.type==='put'?' selected':''}>Put</option>
        <option value="stock"${leg.type==='stock'?' selected':''}>Stock</option>
      </select></td>
      <td>
        <div style="display:flex;align-items:center;gap:4px">
          <input type="number" value="${leg.qty}" step="1" style="width:60px;font-family:var(--mono);color:${qtyColor};font-weight:500;background:var(--bg);border:1px solid var(--border);border-radius:3px;padding:2px 4px"
            oninput="updateLeg(${i},'qty',this.value);this.style.color=+this.value>=0?'var(--green)':'var(--red)'" />
          <span style="font-size:9px;color:${qtyColor}">${qtyLabel}</span>
        </div>
      </td>
      <td><select onchange="updateLeg(${i},'strike',this.value)" style="width:80px;font-family:var(--mono)">
        ${strikeOpts}
      </select></td>
      <td><input type="number" value="${leg.premium.toFixed(2)}" step="0.01" style="width:72px;font-family:var(--mono)" onchange="updateLeg(${i},'premium',+this.value)" /></td>
      <td><button class="btn-sm btn-danger" onclick="removeLeg(${i})">✕</button></td>`;
    tb.appendChild(tr);
  });
}

function calcPnLAt(spot,legs){
  return legs.reduce((sum,leg)=>{
    const qty=leg.qty||0; // positive=buy, negative=sell
    let payoff;
    if(leg.type==='call')payoff=Math.max(spot-leg.strike,0)-leg.premium;
    else if(leg.type==='put')payoff=Math.max(leg.strike-spot,0)-leg.premium;
    else payoff=spot-leg.premium;
    return sum+qty*payoff;
  },0);
}

function updatePnL(){
  if(!legs.length)return;
  const S=ST.spot;
  const lo=S*0.5,hi=S*1.55;
  const N=120;
  const spots=Array.from({length:N},(_,i)=>lo+(hi-lo)*i/(N-1));
  const pnls=spots.map(s=>calcPnLAt(s,legs));
  const maxP=Math.max(...pnls),minP=Math.min(...pnls);
  const netCost=legs.reduce((s,l)=>s+l.qty*l.premium,0);
  const bes=[];
  for(let i=0;i<pnls.length-1;i++){
    if((pnls[i]<=0&&pnls[i+1]>=0)||(pnls[i]>=0&&pnls[i+1]<=0)){
      const t=-pnls[i]/(pnls[i+1]-pnls[i]);
      bes.push(spots[i]+t*(spots[i+1]-spots[i]));
    }
  }
  document.getElementById('ss-cost').textContent=(netCost>=0?'+':'')+fmtN(netCost);
  document.getElementById('ss-cost').style.color=netCost<=0?'var(--green)':'var(--red)';
  document.getElementById('ss-maxp').textContent=maxP>1e7?'Ilimitada':fmtN(maxP);
  document.getElementById('ss-maxl').textContent=minP<-1e7?'Ilimitada':fmtN(minP);
  document.getElementById('ss-be').textContent=bes.length?bes.map(b=>'$'+b.toFixed(0)).join(' / '):'--';

  if(ST.charts.pnl)ST.charts.pnl.destroy();
  const ctx=document.getElementById('pnl-chart').getContext('2d');
  ST.charts.pnl=new Chart(ctx,{
    type:'line',
    data:{
      labels:spots.map(s=>s.toFixed(0)),
      datasets:[{
        data:pnls,borderWidth:2,pointRadius:0,fill:false,tension:0,
        segment:{borderColor:ctx=>ctx.p0.parsed.y>=0&&ctx.p1.parsed.y>=0?'#44c76a':ctx.p0.parsed.y<0&&ctx.p1.parsed.y<0?'#f05a5a':'#e8b84b'}
      },{
        data:spots.map(()=>0),borderColor:'#3d4f63',borderWidth:1,borderDash:[4,4],pointRadius:0,fill:false
      }]
    },
    options:{
      responsive:true,maintainAspectRatio:false,animation:false,
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:'#131920',borderColor:'#2a3444',borderWidth:1,
          titleColor:'#7a8fa6',bodyColor:'#d8e3ef',
          callbacks:{
            label:c=>' P&L: '+(c.raw>=0?'+':'')+fmtN(c.raw),
            title:c=>'Spot: $'+parseFloat(spots[c[0].dataIndex]).toLocaleString('es-AR')
          }
        }
      },
      scales:{
        x:{ticks:{color:'#7a8fa6',font:{size:10},maxTicksLimit:8,callback:(v,i)=>'$'+(spots[i]/1000).toFixed(0)+'k'},grid:{color:'#1a2230'}},
        y:{ticks:{color:'#7a8fa6',font:{size:10},callback:v=>(v>=0?'+':'')+fmtN(v)},grid:{color:'#1a2230'}}
      }
    }
  });
}

/* ===== BS CALCULATOR ===== */
function runCalc(){
  const S=+document.getElementById('c-s').value;
  const K=+document.getElementById('c-k').value;
  const Td=+document.getElementById('c-t').value;
  const vol=+document.getElementById('c-vol').value/100;
  const r=+document.getElementById('c-r').value/100;
  const q=+document.getElementById('c-q').value/100;
  const type=document.getElementById('c-type').value;
  if(!S||!K||!Td||!vol)return;
  const T=Td/365;
  const res=bs(S,K,T,r,q,vol,type);
  document.getElementById('c-price').textContent='$ '+res.price.toFixed(2);
  const dEl=document.getElementById('cc-delta');
  dEl.textContent=res.delta.toFixed(4);
  dEl.style.color=res.delta>0?'var(--green)':'var(--red)';
  document.getElementById('cc-gamma').textContent=res.gamma.toFixed(6);
  document.getElementById('cc-theta').textContent=res.theta.toFixed(2);
  document.getElementById('cc-vega').textContent=res.vega.toFixed(4);
  document.getElementById('cc-rho').textContent=res.rho.toFixed(4);
  const mon=(S/K-1)*100;
  const mEl=document.getElementById('cc-money');
  mEl.textContent=(mon>=0?'+':'')+mon.toFixed(1)+'%';
  mEl.style.color=(type==='call'?S>K:S<K)?'var(--green)':'var(--red)';
  const lo=S*0.65,hi=S*1.35;
  const sp=Array.from({length:60},(_,i)=>lo+(hi-lo)*i/59);
  const pr=sp.map(s=>bs(s,K,T,r,q,vol,type).price);
  const intr=sp.map(s=>type==='call'?Math.max(s-K,0):Math.max(K-s,0));
  if(ST.charts.sens)ST.charts.sens.destroy();
  const ctx2=document.getElementById('sens-chart').getContext('2d');
  ST.charts.sens=new Chart(ctx2,{
    type:'line',
    data:{
      labels:sp.map(s=>s.toFixed(0)),
      datasets:[
        {label:'Prima BS',data:pr,borderColor:'#e8b84b',borderWidth:2,pointRadius:0,fill:false},
        {label:'Valor intrínseco',data:intr,borderColor:'#3d4f63',borderWidth:1,borderDash:[4,4],pointRadius:0,fill:false}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,animation:false,
      plugins:{
        legend:{display:true,labels:{color:'#7a8fa6',font:{size:10},boxWidth:10,padding:12}},
        tooltip:{backgroundColor:'#131920',borderColor:'#2a3444',borderWidth:1,titleColor:'#7a8fa6',bodyColor:'#d8e3ef',callbacks:{label:c=>` ${c.dataset.label}: $${c.raw.toFixed(2)}`}}
      },
      scales:{
        x:{ticks:{color:'#7a8fa6',font:{size:10},maxTicksLimit:6,callback:(v,i)=>'$'+(sp[i]/1000).toFixed(1)+'k'},grid:{color:'#1a2230'}},
        y:{ticks:{color:'#7a8fa6',font:{size:10},callback:v=>'$'+v.toFixed(0)},grid:{color:'#1a2230'}}
      }
    }
  });
}

/* ===== IV CALCULATOR ===== */
function runIVCalc(){
  const S=+document.getElementById('iv-s').value;
  const K=+document.getElementById('iv-k').value;
  const Td=+document.getElementById('iv-t').value;
  const mkt=+document.getElementById('iv-mkt').value;
  const r=+document.getElementById('iv-r').value/100;
  const q=+document.getElementById('iv-q').value/100;
  const type=document.getElementById('iv-type').value;
  const resVal=document.getElementById('iv-result-val');
  const resStatus=document.getElementById('iv-result-status');
  const gauge=document.getElementById('iv-gauge-bar');

  if(!S||!K||!Td||!mkt){resVal.textContent='--';resStatus.textContent='Completá todos los campos';gauge.style.width='0%';return;}
  const T=Td/365;
  const intrinsic=type==='call'?Math.max(S-K,0):Math.max(K-S,0);
  if(mkt<intrinsic-0.01){
    resVal.textContent='--';
    resStatus.textContent='⚠ La prima es menor al valor intrínseco ('+fmtN(intrinsic)+')';
    gauge.style.width='0%';
    clearIVGreeks();clearIVTable();return;
  }
  const iv=impliedVol(S,K,T,r,q,mkt,type);
  if(!iv||iv<0.001){
    resVal.textContent='--';resStatus.textContent='No convergió — verificá los datos';gauge.style.width='0%';
    clearIVGreeks();clearIVTable();return;
  }
  const ivPct=iv*100;
  resVal.textContent=ivPct.toFixed(2);
  const lvl=ivPct<30?'Baja':ivPct<60?'Normal':ivPct<100?'Elevada':ivPct<150?'Alta':'Muy alta';
  const lvlColor=ivPct<30?'var(--blue)':ivPct<60?'var(--green)':ivPct<100?'var(--amber)':'var(--red)';
  resStatus.style.color=lvlColor;
  resStatus.textContent=`${lvl} — converge en Newton-Raphson`;
  resVal.style.color=lvlColor;
  gauge.style.background=lvlColor;
  gauge.style.width=Math.min(ivPct/200*100,100)+'%';
  const g=bs(S,K,T,r,q,iv,type);
  const dEl=document.getElementById('iv-g-delta');
  dEl.textContent=g.delta.toFixed(4);dEl.style.color=g.delta>0?'var(--green)':'var(--red)';
  document.getElementById('iv-g-gamma').textContent=g.gamma.toFixed(6);
  document.getElementById('iv-g-theta').textContent=g.theta.toFixed(2);
  document.getElementById('iv-g-vega').textContent=g.vega.toFixed(4);
  document.getElementById('iv-g-rho').textContent=g.rho.toFixed(4);
  const intrEl=document.getElementById('iv-g-intr');
  intrEl.textContent='$'+fmtN(intrinsic);
  intrEl.style.color=intrinsic>0?'var(--green)':'var(--muted)';
  buildIVSensTable(S,K,T,r,q,type,mkt,iv);
}

function clearIVGreeks(){
  ['iv-g-delta','iv-g-gamma','iv-g-theta','iv-g-vega','iv-g-rho','iv-g-intr'].forEach(id=>{document.getElementById(id).textContent='--';});
  clearIVTable();
}

function clearIVTable(){
  document.getElementById('iv-sens-body').innerHTML='';
  if(ST.charts.ivSens)ST.charts.ivSens.destroy();
}

function buildIVSensTable(S,K,T,r,q,type,mktCenter,ivCenter){
  const steps=9;
  const lo=mktCenter*0.5,hi=mktCenter*1.5;
  const rows=Array.from({length:steps},(_,i)=>{
    const p=lo+(hi-lo)*i/(steps-1);
    const iv=impliedVol(S,K,T,r,q,p,type);
    if(!iv)return null;
    const g=bs(S,K,T,r,q,iv,type);
    return{p,iv:iv*100,delta:g.delta,theta:g.theta,vega:g.vega,bsPrice:g.price,diff:g.price-p};
  }).filter(Boolean);
  const tb=document.getElementById('iv-sens-body');
  tb.innerHTML='';
  rows.forEach(row=>{
    const isCurrent=Math.abs(row.p-mktCenter)<(hi-lo)/(steps*2);
    const tr=document.createElement('tr');
    if(isCurrent)tr.className='selected';
    const dif=row.diff;
    tr.innerHTML=`<td style="font-weight:${isCurrent?'500':'400'};color:${isCurrent?'var(--amber)':'var(--text)'}">$${fmtN(row.p)}</td>
      <td class="amber" style="font-weight:${isCurrent?'500':'400'}">${row.iv.toFixed(2)}%</td>
      <td style="color:${row.delta>0?'var(--green)':'var(--red)'}">${row.delta.toFixed(4)}</td>
      <td class="neg">${row.theta.toFixed(2)}</td>
      <td>${row.vega.toFixed(4)}</td>
      <td>$${fmtN(row.bsPrice)}</td>
      <td style="color:${Math.abs(dif)<1?'var(--muted)':dif>0?'var(--green)':'var(--red)'}">${dif>=0?'+':''}${fmtN(dif)}</td>`;
    tb.appendChild(tr);
  });
  if(ST.charts.ivSens)ST.charts.ivSens.destroy();
  const ctx=document.getElementById('iv-sens-chart').getContext('2d');
  ST.charts.ivSens=new Chart(ctx,{
    type:'line',
    data:{
      labels:rows.map(r=>'$'+r.p.toFixed(0)),
      datasets:[{
        label:'IV implícita (%)',data:rows.map(r=>parseFloat(r.iv.toFixed(2))),
        borderColor:'#e8b84b',borderWidth:2,pointRadius:3,pointBackgroundColor:rows.map(r=>Math.abs(r.p-mktCenter)<(hi-lo)/(steps*2)?'#e8b84b':'transparent'),fill:false
      }]
    },
    options:{
      responsive:true,maintainAspectRatio:false,animation:false,
      plugins:{legend:{display:false},tooltip:{backgroundColor:'#131920',borderColor:'#2a3444',borderWidth:1,titleColor:'#7a8fa6',bodyColor:'#d8e3ef',callbacks:{label:c=>` IV: ${c.raw}%`}}},
      scales:{
        x:{ticks:{color:'#7a8fa6',font:{size:10}},grid:{color:'#1a2230'}},
        y:{ticks:{color:'#7a8fa6',font:{size:10},callback:v=>v+'%'},grid:{color:'#1a2230'}}
      }
    }
  });
}


/* ===== CONTROL DE ESTRATEGIAS ===== */
// ctrlStrategies: array of strategies, each strategy = array of row objects
const CTRL_STORAGE_KEY='ggal_ctrl_strategies_v1';

function ctrlSave(){
  try{
    localStorage.setItem(CTRL_STORAGE_KEY, JSON.stringify(ctrlStrategies));
  }catch(e){console.warn('ctrlSave error:',e);}
}

function ctrlLoad(){
  try{
    const raw=localStorage.getItem(CTRL_STORAGE_KEY);
    if(!raw)return false;
    const parsed=JSON.parse(raw);
    if(!Array.isArray(parsed)||!parsed.length)return false;
    ctrlStrategies=parsed;
    return true;
  }catch(e){
    console.warn('ctrlLoad error:',e);
    return false;
  }
}

function ctrlClearSaved(){
  localStorage.removeItem(CTRL_STORAGE_KEY);
  ctrlStrategies=[];
  renderControl();
  showToast('Estrategias guardadas eliminadas');
}

let ctrlStrategies=[];

function ctrlDefaultRow(){
  const strikes=getAvailableStrikes();
  const mid=strikes.length?strikes[Math.floor(strikes.length/2)]:0;
  return {lotes:1,type:'call',strike:mid,precio:0,precioManual:''};
}

function addCtrlStrategy(){
  const n=ctrlStrategies.length+1;
  ctrlStrategies.push({name:`Estrategia ${n}`,rows:[ctrlDefaultRow(),ctrlDefaultRow()]});
  ctrlSave();renderControl();
}

function removeCtrlStrategy(si){
  ctrlStrategies.splice(si,1);
  ctrlSave();renderControl();
}

function addCtrlRowToStrategy(si){
  ctrlStrategies[si].rows.push(ctrlDefaultRow());
  ctrlSave();renderControl();
}

function removeCtrlRow(si,ri){
  ctrlStrategies[si].rows.splice(ri,1);
  ctrlSave();renderControl();
}

function updateCtrlRow(si,ri,field,val){
  const row=ctrlStrategies[si].rows[ri];
  row[field]=field==='lotes'||field==='precio'||field==='strike'
    ?(val===''?val:parseFloat(val)||0):val;
  ctrlSave();renderControl();
}

function renameCtrlStrategy(si,val){
  ctrlStrategies[si].name=val||`Estrategia ${si+1}`;
  ctrlSave();
}

function copyCtrlStrategy(si){
  const rows=ctrlStrategies[si].rows;
  const tsv=rows.map(r=>{
    const lotes=String(r.lotes).replace('.',',');
    const strike=fmtStrike(r.strike).replace(/\./g,'');
    const precio=r.precio>0?r.precio.toFixed(3).replace('.',','):'0,000';
    return `${lotes}\t${strike}\t${precio}`;
  }).join('\n');
  navigator.clipboard.writeText(tsv).then(()=>{
    showToast(`Estrategia "${ctrlStrategies[si].name}" copiada al portapapeles`);
  }).catch(()=>{
    // Fallback for browsers that block clipboard
    const ta=document.createElement('textarea');
    ta.value=tsv;
    ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(`Estrategia "${ctrlStrategies[si].name}" copiada al portapapeles`);
  });
}

function ctrlPopulateExpiry(){
  const sel=document.getElementById('ctrl-expiry');
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

function ctrlGetLast(strike,type){
  const exp=document.getElementById('ctrl-expiry')?.value||ST.selExpiry;
  if(!exp||!ST.chain[exp])return 0;
  const row=ST.chain[exp].find(r=>r.strike===strike);
  if(!row)return 0;
  return type==='put'?(row.putMid||0):(row.callMid||0);
}

function ctrlFormula_armado(lotes,precio,comPct,iva){
  const sign=lotes>0?1:lotes<0?-1:0;
  return -100*lotes*precio*(1+sign*(comPct/100+0.002)*iva);
}

function ctrlFormula_desarmado(lotes,precioLast,comPct,iva){
  const sign=lotes>0?1:lotes<0?-1:0;
  return 100*lotes*precioLast*(1-sign*(comPct/100+0.002)*iva);
}

function ctrlBuildRow(si,ri,row,strikes,com,iva){
  const last=ctrlGetLast(row.strike,row.type);
  const hasManual=row.precioManual!==''&&row.precioManual!==null&&!isNaN(parseFloat(row.precioManual));
  const precioLastEfectivo=hasManual?parseFloat(row.precioManual):last;
  const costoArmado=row.lotes!==0&&row.precio>0?ctrlFormula_armado(row.lotes,row.precio,com,iva):0;
  const desarmado=row.lotes!==0&&precioLastEfectivo>0?ctrlFormula_desarmado(row.lotes,precioLastEfectivo,com,iva):0;
  const difPct=row.precio>0&&precioLastEfectivo>0?(precioLastEfectivo-row.precio)/row.precio:0;

  const lotesColor=row.lotes>=0?'var(--green)':'var(--red)';
  const difColor=difPct>0?'var(--green)':difPct<0?'var(--red)':'var(--muted)';
  const costoColor=costoArmado>=0?'var(--green)':'var(--red)';
  const desarColor=desarmado>=0?'var(--green)':'var(--red)';
  const strikeOpts=strikes.map(s=>`<option value="${s}"${Math.round(s*100)===Math.round(row.strike*100)?' selected':''}>${fmtStrike(s)}</option>`).join('');

  const tr=document.createElement('tr');
  tr.style.borderBottom='1px solid var(--border2)';
  tr.innerHTML=`
    <td style="padding:5px 8px;text-align:center">
      <input type="number" value="${row.lotes}" step="1"
        style="width:65px;font-family:var(--mono);font-size:12px;color:${lotesColor};font-weight:500;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:3px 6px"
        oninput="this.style.color=+this.value>=0?'var(--green)':'var(--red)'"
        onchange="updateCtrlRow(${si},${ri},'lotes',this.value)" />
    </td>
    <td style="padding:5px 8px;text-align:center">
      <select onchange="updateCtrlRow(${si},${ri},'type',this.value)"
        style="background:var(--surface);border:1px solid var(--border);color:var(--text);font-family:var(--mono);font-size:12px;padding:3px 7px;border-radius:4px">
        <option value="call"${row.type==='call'?' selected':''}>Call</option>
        <option value="put"${row.type==='put'?' selected':''}>Put</option>
      </select>
    </td>
    <td style="padding:5px 8px;text-align:center">
      <select onchange="updateCtrlRow(${si},${ri},'strike',this.value)"
        style="background:var(--surface);border:1px solid var(--border);color:var(--text);font-family:var(--mono);font-size:12px;padding:3px 7px;border-radius:4px;width:100px">
        ${strikeOpts}
      </select>
    </td>
    <td style="padding:5px 8px;text-align:center">
      <input type="number" value="${row.precio>0?row.precio.toFixed(3):''}" step="0.001" placeholder="0,000"
        style="width:85px;font-family:var(--mono);font-size:12px;background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:4px;padding:3px 6px"
        onchange="updateCtrlRow(${si},${ri},'precio',this.value)" />
    </td>
    <td style="padding:5px 10px;text-align:center;font-weight:500;color:${costoColor};white-space:nowrap">${costoArmado!==0?fmtN(costoArmado):'--'}</td>
    <td style="padding:5px 10px;text-align:center;color:${precioLastEfectivo>0?'var(--text)':'var(--dim)'};white-space:nowrap">
      ${precioLastEfectivo>0?fmtN(precioLastEfectivo,3):'--'}
      ${hasManual?'<span style="font-size:9px;color:var(--amber);margin-left:3px">MAN</span>':''}
    </td>
    <td style="padding:5px 8px;text-align:center">
      <input type="number" value="${hasManual?parseFloat(row.precioManual).toFixed(3):''}" step="0.001" placeholder="—"
        style="width:85px;font-family:var(--mono);font-size:12px;background:var(--bg);border:1px solid var(--border);color:var(--amber);border-radius:4px;padding:3px 6px"
        onchange="updateCtrlRow(${si},${ri},'precioManual',this.value===''?'':this.value)" />
    </td>
    <td style="padding:5px 10px;text-align:center;font-weight:500;color:${desarColor};white-space:nowrap">${desarmado!==0?fmtN(desarmado):'--'}</td>
    <td style="padding:5px 10px;text-align:center;font-weight:500;color:${difColor};white-space:nowrap">
      ${row.precio>0&&precioLastEfectivo>0?(difPct>=0?'+':'')+(difPct*100).toFixed(2)+'%':'--'}
    </td>
    <td style="padding:5px 8px;text-align:center">
      <button class="btn-sm btn-danger" onclick="removeCtrlRow(${si},${ri})">✕</button>
    </td>`;
  return {tr,costoArmado,desarmado};
}

const CTRL_TH=`
  <th style="padding:7px 10px;border-bottom:1px solid var(--border);border-top:1px solid var(--border2);color:var(--muted);font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.6px;font-weight:500;white-space:nowrap;background:var(--surface2);text-align:center">Lotes</th>
  <th style="padding:7px 10px;border-bottom:1px solid var(--border);border-top:1px solid var(--border2);color:var(--muted);font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.6px;font-weight:500;white-space:nowrap;background:var(--surface2);text-align:center">Tipo</th>
  <th style="padding:7px 10px;border-bottom:1px solid var(--border);border-top:1px solid var(--border2);color:var(--muted);font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.6px;font-weight:500;white-space:nowrap;background:var(--surface2);text-align:center">Strike</th>
  <th style="padding:7px 10px;border-bottom:1px solid var(--border);border-top:1px solid var(--border2);color:var(--muted);font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.6px;font-weight:500;white-space:nowrap;background:var(--surface2);text-align:center">Precio</th>
  <th style="padding:7px 10px;border-bottom:1px solid var(--border);border-top:1px solid var(--border2);color:var(--amber);font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.6px;font-weight:500;white-space:nowrap;background:var(--surface2);text-align:center">Costo c/Comi</th>
  <th style="padding:7px 10px;border-bottom:1px solid var(--border);border-top:1px solid var(--border2);color:var(--muted);font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.6px;font-weight:500;white-space:nowrap;background:var(--surface2);text-align:center">Precio Last</th>
  <th style="padding:7px 10px;border-bottom:1px solid var(--border);border-top:1px solid var(--border2);color:var(--muted);font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.6px;font-weight:500;white-space:nowrap;background:var(--surface2);text-align:center">Precio Manual</th>
  <th style="padding:7px 10px;border-bottom:1px solid var(--border);border-top:1px solid var(--border2);color:var(--amber);font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.6px;font-weight:500;white-space:nowrap;background:var(--surface2);text-align:center">Desarmado c/Comi</th>
  <th style="padding:7px 10px;border-bottom:1px solid var(--border);border-top:1px solid var(--border2);color:var(--muted);font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.6px;font-weight:500;white-space:nowrap;background:var(--surface2);text-align:center">Dif Precio %</th>
  <th style="padding:7px 8px;border-bottom:1px solid var(--border);border-top:1px solid var(--border2);background:var(--surface2);text-align:center"></th>`;

function parseARSNum(s){
  // Handles: "296,13" "296.13" "1.234,56" "-30,00"
  if(!s&&s!==0)return NaN;
  s=String(s).trim();
  // If has comma and dot: "1.234,56" → ARS format
  if(s.includes(',')&&s.includes('.')){
    return parseFloat(s.replace(/\./g,'').replace(',','.'));
  }
  // Only comma: "296,13" → decimal comma
  if(s.includes(','))return parseFloat(s.replace(',','.'));
  // Only dot or plain number
  return parseFloat(s);
}

function handleCtrlPaste(e,si){
  e.preventDefault();
  const raw=e.clipboardData.getData('text');
  if(!raw.trim())return;

  const allStrikes=getAvailableStrikes();

  // Parse lines — split by newline, columns by tab
  const lines=raw.trim().split(/\r?\n/).filter(l=>l.trim());
  const parsed=lines.map(line=>{
    const cols=line.split('\t').map(c=>c.trim());
    const lotes=parseARSNum(cols[0]);
    const strikeRaw=parseARSNum(cols[1]);
    const precio=parseARSNum(cols[2]);
    if(isNaN(lotes)||isNaN(strikeRaw))return null;

    // Find nearest available strike — compare rounded to avoid float precision issues
    const roundTo2=(n)=>Math.round(n*100);
    const strike=allStrikes.length
      ?allStrikes.reduce((p,c)=>Math.abs(roundTo2(c)-roundTo2(strikeRaw))<Math.abs(roundTo2(p)-roundTo2(strikeRaw))?c:p,allStrikes[0])
      :strikeRaw;

    return{lotes,strike,precio:isNaN(precio)?0:precio,type:'call',precioManual:''};
  }).filter(Boolean);

  if(!parsed.length){showToast('No se reconocieron datos en el formato esperado');return;}

  // Replace strategy rows with parsed data
  ctrlStrategies[si].rows=parsed;
  ctrlSave();
  const ta=document.getElementById('ctrl-paste-'+si);
  if(ta)ta.value='';

  renderControl();
  showToast(`${parsed.length} pata${parsed.length>1?'s':''} cargada${parsed.length>1?'s':''} en Estrategia ${si+1}`);
}

function renderControl(){
  ctrlPopulateExpiry();
  const com=parseFloat(document.getElementById('ctrl-comision')?.value)||0.5;
  const iva=parseFloat(document.getElementById('ctrl-iva')?.value)||1.21;
  const strikes=getAvailableStrikes();
  const container=document.getElementById('ctrl-strategies-container');
  if(!container)return;
  container.innerHTML='';

  if(!ctrlStrategies.length){
    container.innerHTML='<div style="padding:32px;text-align:center;color:var(--muted);font-size:12px">Presioná <b>+ Agregar estrategia</b> para comenzar</div>';
    return;
  }

  ctrlStrategies.forEach((strat,si)=>{
    const stratRows=strat.rows;
    let totalArmado=0,totalDesarmado=0;

    // Build wrapper
    const wrap=document.createElement('div');
    wrap.style.cssText='margin-bottom:14px;border:1px solid var(--border);border-radius:8px;overflow:hidden';

    // Strategy header
    const hdr=document.createElement('div');
    hdr.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--surface2);border-bottom:1px solid var(--border);flex-wrap:wrap;gap:6px';
    hdr.innerHTML=`
      <div style="display:flex;align-items:center;gap:8px;min-width:160px">
        <input type="text" value="${strat.name}"
          style="font-family:var(--sans);font-size:12px;font-weight:500;color:var(--text);background:transparent;border:none;border-bottom:1px solid transparent;padding:1px 2px;width:140px;outline:none"
          onfocus="this.style.borderBottomColor='var(--amber)';this.style.background='var(--bg)'"
          onblur="this.style.borderBottomColor='transparent';this.style.background='transparent';renameCtrlStrategy(${si},this.value)"
          onchange="renameCtrlStrategy(${si},this.value)" />
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex:1;max-width:420px;margin:0 8px">
        <textarea id="ctrl-paste-${si}" rows="1" placeholder="Pegá datos (lotes · strike · precio por fila)…"
          style="flex:1;font-family:var(--mono);font-size:11px;background:var(--bg);border:1px solid var(--border);color:var(--muted);border-radius:4px;padding:4px 8px;resize:none;height:28px;overflow:hidden"
          onfocus="this.style.borderColor='var(--amber)';this.style.color='var(--text)'"
          onblur="this.style.borderColor='var(--border)';this.style.color='var(--muted)'"
          onpaste="handleCtrlPaste(event,${si})"></textarea>
      </div>
      <div style="display:flex;gap:6px">
        <button onclick="copyCtrlStrategy(${si})" style="padding:3px 10px;font-size:11px;background:var(--surface);border:1px solid var(--border);color:var(--muted);border-radius:4px;cursor:pointer" title="Copiar patas como TSV">⎘ Copiar</button>
        <button onclick="addCtrlRowToStrategy(${si})" style="padding:3px 10px;font-size:11px;background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:4px;cursor:pointer">+ Agregar pata</button>
        <button onclick="removeCtrlStrategy(${si})" style="padding:3px 8px;font-size:11px;background:var(--red-bg);border:1px solid var(--red);color:var(--red);border-radius:4px;cursor:pointer">✕ Eliminar</button>
      </div>`;
    wrap.appendChild(hdr);

    // Table
    const tableWrap=document.createElement('div');
    tableWrap.style.overflowX='auto';
    const table=document.createElement('table');
    table.style.cssText='width:100%;border-collapse:collapse;font-family:var(--mono);font-size:12px';

    // thead
    const thead=document.createElement('thead');
    thead.innerHTML=`<tr>${CTRL_TH}</tr>`;
    table.appendChild(thead);

    // tbody
    const tbody=document.createElement('tbody');
    stratRows.forEach((row,ri)=>{
      const {tr,costoArmado,desarmado}=ctrlBuildRow(si,ri,row,strikes,com,iva);
      totalArmado+=costoArmado;
      totalDesarmado+=desarmado;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    // tfoot
    const resultado=totalArmado+totalDesarmado;
    const resColor=resultado>0?'var(--green)':resultado<0?'var(--red)':'var(--muted)';
    const armColor=totalArmado>=0?'var(--green)':'var(--red)';
    const desarColor=totalDesarmado>=0?'var(--green)':'var(--red)';
    const tfoot=document.createElement('tfoot');
    tfoot.innerHTML=`
      <tr style="background:var(--surface2);border-top:1px solid var(--border)">
        <td colspan="4" style="padding:7px 10px;font-family:var(--sans);font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Totales</td>
        <td style="padding:7px 10px;font-weight:500;color:${armColor};white-space:nowrap">${totalArmado!==0?fmtN(totalArmado):'--'}</td>
        <td colspan="2"></td>
        <td style="padding:7px 10px;font-weight:500;color:${desarColor};white-space:nowrap">${totalDesarmado!==0?fmtN(totalDesarmado):'--'}</td>
        <td colspan="2"></td>
      </tr>
      <tr style="background:var(--amber-bg);border-top:1px solid rgba(232,184,75,.25)">
        <td colspan="4" style="padding:9px 10px;font-family:var(--sans);font-size:10px;color:var(--amber);text-transform:uppercase;letter-spacing:.6px;font-weight:500">Resultado</td>
        <td colspan="6" style="padding:9px 10px;text-align:right">
          <span style="font-family:var(--mono);font-size:18px;font-weight:500;color:${resColor}">
            ${stratRows.length?(resultado>=0?'+':'')+fmtN(resultado):'--'}
          </span>
        </td>
      </tr>`;
    table.appendChild(tfoot);
    tableWrap.appendChild(table);
    wrap.appendChild(tableWrap);
    container.appendChild(wrap);
  });
}


function renderIVSmile(){
  if(!ST.expirations.length)return;
  const S=ST.spot;
  const colors=['#e8b84b','#5aabff','#44c76a'];
  const datasets=ST.expirations.map((exp,i)=>{
    const rows=ST.chain[exp]||[];
    return{
      label:fmtExpiry(exp),
      data:rows.map(r=>({x:r.strike,y:parseFloat((r.iv*100).toFixed(2))})),
      borderColor:colors[i%3],borderWidth:2,pointRadius:3,fill:false,tension:0.3
    };
  });
  if(ST.charts.iv)ST.charts.iv.destroy();
  const ctx=document.getElementById('iv-chart').getContext('2d');
  ST.charts.iv=new Chart(ctx,{
    type:'line',
    data:{datasets},
    options:{
      responsive:true,maintainAspectRatio:false,animation:false,
      plugins:{
        legend:{display:true,labels:{color:'#7a8fa6',font:{size:11},boxWidth:10,padding:14}},
        tooltip:{backgroundColor:'#131920',borderColor:'#2a3444',borderWidth:1,titleColor:'#7a8fa6',bodyColor:'#d8e3ef',callbacks:{label:c=>` IV: ${c.raw.y}%`,title:c=>`Strike: $${c[0].raw.x}`}}
      },
      scales:{
        x:{type:'linear',ticks:{color:'#7a8fa6',font:{size:10},callback:v=>'$'+(v/1000).toFixed(1)+'k'},grid:{color:'#1a2230'},title:{display:true,text:'Strike',color:'#7a8fa6',font:{size:10}}},
        y:{ticks:{color:'#7a8fa6',font:{size:10},callback:v=>v+'%'},grid:{color:'#1a2230'},title:{display:true,text:'Volatilidad implícita (%)',color:'#7a8fa6',font:{size:10}}}
      }
    }
  });
}

/* ===== SOURCE SELECTOR ===== */
let currentSource='sheets';

function selectSource(src){
  currentSource=src;
  ['sheets','demo'].forEach(s=>{
    const el=document.getElementById('src-'+s);
    if(el)el.style.display=s===src?'block':'none';
    const btn=document.getElementById('src-btn-'+s);
    if(btn)btn.classList.toggle('active',s===src);
  });
}

function applyAndFetch(){
  applyConfig();
  fetchData();
}

/* ===== BS PARAMS BAR (inline in chain tab) ===== */
function applyBSParams(){
  const spot=parseFloat(document.getElementById('bs-spot').value);
  const rate=parseFloat(document.getElementById('bs-rate').value);
  const q=parseFloat(document.getElementById('bs-q').value)||0;
  if(!isNaN(spot)&&spot>0){
    ST.spot=spot;
    document.getElementById('spot-display').textContent='$ '+spot.toLocaleString('es-AR');
    document.getElementById('spot-input').value=spot;
  }
  if(!isNaN(rate))ST.rate=rate/100;
  if(!isNaN(q))ST.q=q/100;
  document.getElementById('risk-free-rate').value=isNaN(rate)?ST.rate*100:rate;
  document.getElementById('hdr-rate').textContent=(ST.rate*100).toFixed(1)+'%';
  // Override T for all chain rows if days manually set
  const daysEl=document.getElementById('bs-days');
  const days=parseFloat(daysEl.value);
  if(!isNaN(days)&&days>0&&ST.selExpiry&&ST.chain[ST.selExpiry]){
    const T=days/365;
    ST.chain[ST.selExpiry].forEach(r=>r.T=T);
  }
  renderChain();
  showToast(`Recalculado — Spot $${spot||ST.spot} · Tasa ${(ST.rate*100).toFixed(1)}%`);
}

function syncBSBar(){
  const spot=ST.spot;
  document.getElementById('bs-spot').value=spot;
  document.getElementById('bs-rate').value=(ST.rate*100).toFixed(1);
  document.getElementById('bs-q').value=(ST.q*100).toFixed(1);
  // Calculate days to selected expiry
  if(ST.selExpiry){
    const T=(new Date(ST.selExpiry+'T12:00:00')-new Date())/(365*24*3600*1000);
    const days=Math.max(1,Math.round(T*365));
    document.getElementById('bs-days').value=days;
  }
}

/* ===== AUTO-REFRESH ===== */
let autoRefreshTimer=null;

function toggleAutoRefresh(){
  const chk=document.getElementById('auto-refresh-chk');
  const interval=+document.getElementById('auto-refresh-interval').value;
  clearInterval(autoRefreshTimer);autoRefreshTimer=null;
  if(chk.checked){
    autoRefreshTimer=setInterval(()=>fetchData(true),interval);
    document.getElementById('refresh-status').textContent='Próx. actualización en '+interval/1000+'s';
  }else{
    document.getElementById('refresh-status').textContent='';
  }
}

/* ===== API (Python server) ===== */
async function fetchData(silent=false){
  if(currentSource==='demo'){generateMockAndRender();return;}
  if(currentSource==='sheets'){fetchSheets(silent);return;}
  const url=document.getElementById('api-url').value.trim();
  const token=document.getElementById('api-token').value.trim();
  if(!url){showToast('Sin URL configurada — usando datos demo');generateMockAndRender();return;}
  if(!silent)showToast('Conectando al servidor Python...');
  try{
    const ticker=document.getElementById('api-ticker').value||'GGAL';
    const res=await fetch(`${url}/options?ticker=${ticker}`,{headers:token?{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}:{}});
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const data=await res.json();
    parseApiData(data);
    document.getElementById('data-badge').textContent='live';
    document.getElementById('data-badge').className='badge badge-live';
    document.getElementById('hdr-time').textContent=new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    if(!silent)showToast('Datos Python actualizados ✓');
  }catch(e){
    showToast('Error servidor Python: '+e.message);
  }
}

/* ===== GOOGLE SHEETS via Apps Script ===== */
function colLetterToIndex(col){
  col=col.trim().toUpperCase();
  if(!isNaN(col))return parseInt(col)-1;
  let idx=0;
  for(let i=0;i<col.length;i++)idx=idx*26+(col.charCodeAt(i)-64);
  return idx-1;
}

async function fetchSheets(silent=false){
  const webAppUrl=document.getElementById('sh-webapp-url').value.trim();
  if(!webAppUrl){showToast('Pegá la URL del Apps Script web app');return;}
  const sheet=document.getElementById('sh-sheetname').value.trim()||'DMD_Sabro';
  const url=`${webAppUrl}?sheet=${encodeURIComponent(sheet)}`;
  if(!silent)showToast('Conectando a Google Sheets...');
  try{
    const res=await fetch(url);
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const data=await res.json();
    if(data.error)throw new Error(data.error);
    const rows=data.values||data;
    if(!Array.isArray(rows)||!rows.length)throw new Error('Sin datos — verificá el nombre de la pestaña');
    parseSheetsRows(rows);
    document.getElementById('data-badge').textContent='sheets';
    document.getElementById('data-badge').className='badge badge-live';
    document.getElementById('hdr-time').textContent=new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    if(!silent)showToast('Google Sheets cargado ✓');
  }catch(e){
    showToast('Error Sheets: '+e.message);
    console.error('Apps Script error:',e);
  }
}

function parseSheetsRows(rows){
  if(!rows||!rows.length){showToast('La hoja no tiene datos');return;}

  const headerRowIdx=(+document.getElementById('sh-header-row').value||1)-1;
  const headerRow=rows[headerRowIdx]||[];
  const dataRows=rows.slice(headerRowIdx+1);

  // Auto-detect columns by header name
  const autoMap={};
  const synonyms={
    strike:['strike','strikes','ejercicio','k'],
    expiry:['expiry','expiracion','expiración','vencimiento','vcto','fecha'],
    type:['tipo','type','call_put','cp'],
    bid:['bid','compra'],
    ask:['ask','venta'],
    last:['last','ultimo','último','cierre','precio','spot','subyacente','ggal'],
  };
  headerRow.forEach((h,i)=>{
    const norm=(h||'').toLowerCase().trim().replace(/\s+/g,'_');
    Object.entries(synonyms).forEach(([field,syns])=>{
      if(syns.some(s=>norm===s||norm.startsWith(s)))autoMap[field]=i;
    });
  });

  const ci={
    strike: autoMap.strike??colLetterToIndex(document.getElementById('sh-col-strike').value),
    expiry: autoMap.expiry??colLetterToIndex(document.getElementById('sh-col-expiry').value),
    type:   autoMap.type  ??colLetterToIndex(document.getElementById('sh-col-type').value),
    bid:    autoMap.bid   ??colLetterToIndex(document.getElementById('sh-col-bid').value),
    ask:    autoMap.ask   ??colLetterToIndex(document.getElementById('sh-col-ask').value),
    last:   autoMap.last  ??colLetterToIndex(document.getElementById('sh-col-last').value),
    lastve: colLetterToIndex(document.getElementById('sh-col-lastve')?.value||'G'),
  };

  console.log('Columnas mapeadas:', ci, '| Auto-detectadas:', autoMap);

  // Parse número — detecta automáticamente el formato:
  // Formato ARS: "10.950,00" (punto=miles, coma=decimal)
  // Formato estándar: "10950.00" o "519.99" (punto=decimal)
  function parseARS(s){
    if(s===null||s===undefined||s==='')return NaN;
    const str=String(s).trim();
    if(!str)return NaN;
    // Si tiene coma → formato ARS: quitar puntos de miles, cambiar coma a punto
    if(str.includes(',')){
      return parseFloat(str.replace(/\./g,'').replace(',','.'));
    }
    // Sin coma → ya es formato estándar (el Apps Script serializa números con punto)
    return parseFloat(str);
  }

  let spot=null;
  const opts=[];
  let skipped=0;

  dataRows.forEach(cols=>{
    if(!cols||!cols.length)return;
    const rawStrike=(cols[ci.strike]||'').toString().trim();
    const rawType=(cols[ci.type]||'').toString().trim().toUpperCase();

    // ── Fila del subyacente (STRIKE="GGAL" o TYPE="SUBY") ──
    // El precio spot viene de la columna LAST de esta fila
    if(rawStrike.toUpperCase()==='GGAL'||rawType==='SUBY'){
      const s=parseARS(cols[ci.last]);
      if(!isNaN(s)&&s>0){
        spot=s;
        console.log('Spot detectado de fila SUBY/GGAL:', spot);
      }
      return; // no es una opción, no la procesamos
    }

    const K=parseARS(rawStrike);
    const exp=normalizeExpiry((cols[ci.expiry]||'').toString().trim());
    const tp=rawType.toLowerCase();
    const bid=parseARS(cols[ci.bid]);
    const ask=parseARS(cols[ci.ask]);
    const last=parseARS(cols[ci.last]);
    const lastve=parseARS(cols[ci.lastve]); // valor extrínseco % del spot

    if(isNaN(K)||K<=0||!exp){skipped++;return;}

    const safeBid=isNaN(bid)?0:bid;
    const safeAsk=isNaN(ask)?0:ask;

    // mid = LAST únicamente. Si no hay last, queda en 0 → se muestra "---" y no se calcula IV
    const mid=(!isNaN(last)&&last>0) ? last : 0;

    opts.push({
      strike:K,
      expiry:exp,
      optionType:tp.includes('put')||tp==='p'?'put':'call',
      bid:safeBid,
      ask:safeAsk,
      mid, // ← este valor alimenta impliedVol()
      lastve:isNaN(lastve)?null:lastve,
    });
  });

  console.log(`Sheets parseado: spot=${spot}, opciones=${opts.length}, salteadas=${skipped}`);

  if(!opts.length){
    showToast(`Sin opciones válidas. ${skipped} filas salteadas — revisá columnas.`);
    return;
  }
  if(spot&&spot>0)ST.spot=spot;
  parseApiData({last:ST.spot,options:opts});
}

function normalizeExpiry(s){
  if(!s)return s;
  s=s.trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  const parts=s.split(/[\/\-]/);
  if(parts.length===3){
    if(parts[0].length===4)return `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
    // DD/MM/YYYY (formato argentino)
    return `${parts[2].padStart(4,'20')}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
  }
  return s;
}
function parseApiData(data){
  const sf=document.getElementById('map-spot').value;
  const kf=document.getElementById('map-strike').value;
  const bf=document.getElementById('map-bid').value;
  const af=document.getElementById('map-ask').value;
  const tf=document.getElementById('map-type').value;
  const ef=document.getElementById('map-expiry').value;
  if(data[sf]){ST.spot=parseFloat(data[sf]);document.getElementById('spot-display').textContent='$ '+ST.spot.toLocaleString('es-AR');document.getElementById('spot-input').value=ST.spot;}
  const opts=data.options||data.data||data;
  if(!Array.isArray(opts)){generateMockAndRender();return;}
  const byExp={};
  opts.forEach(o=>{
    const e=o[ef];if(!byExp[e])byExp[e]=[];
    const bid=parseFloat(o[bf])||0;
    const ask=parseFloat(o[af])||0;
    // Only use LAST — no bid/ask fallback
    const mid= o.mid>0 ? o.mid : 0;
    byExp[e].push({strike:parseFloat(o[kf]),type:o[tf],bid,ask,mid,lastve:o.lastve??null});
  });
  ST.expirations=Object.keys(byExp).sort();ST.chain={};
  ST.expirations.forEach(exp=>{
    const T=(new Date(exp+'T12:00:00')-new Date())/(365*24*3600*1000);
    const calls=byExp[exp].filter(o=>o.type.toLowerCase().includes('call'));
    const puts=byExp[exp].filter(o=>o.type.toLowerCase().includes('put'));
    const strikes=[...new Set([...calls,...puts].map(o=>o.strike))].sort((a,b)=>a-b);
    ST.chain[exp]=strikes.map(K=>{
      const c=calls.find(x=>x.strike===K)||{};
      const p=puts.find(x=>x.strike===K)||{};
      const iv=impliedVol(ST.spot,K,T,ST.rate,ST.q,c.mid||p.mid||1,c.mid?'call':'put')||0.70;
      return{strike:K,expiry:exp,T,iv,
        callBid:c.bid||0,callAsk:c.ask||0,callMid:c.mid||0,callLastVE:c.lastve??null,
        putBid:p.bid||0,putAsk:p.ask||0,putMid:p.mid||0,putLastVE:p.lastve??null,
        callOI:0,putOI:0};
    });
  });
  populateExpiries();renderChain();renderIVSmile();syncBSBar();ctrlPopulateExpiry();renderControl();
}

function applyConfig(){
  ST.rate=parseFloat(document.getElementById('risk-free-rate').value)/100;
  ST.q=parseFloat(document.getElementById('div-yield').value)/100;
  document.getElementById('hdr-rate').textContent=(ST.rate*100).toFixed(1)+'%';
  document.getElementById('iv-r').value=(ST.rate*100).toFixed(1);
  document.getElementById('c-r').value=(ST.rate*100).toFixed(1);
  syncBSBar();
}

/* ===== HELPERS ===== */
function fmtN(n,dec=2){
  if(n===undefined||n===null||isNaN(n))return '--';
  return n.toLocaleString('es-AR',{minimumFractionDigits:dec,maximumFractionDigits:dec});
}
// Muestra el strike con sus decimales reales (sin trailing zeros innecesarios)
function fmtStrike(n){
  if(n===undefined||n===null||isNaN(n))return '--';
  // Si tiene decimales significativos, mostrarlos; si es entero, sin decimales
  const dec=n%1===0?0:2;
  return n.toLocaleString('es-AR',{minimumFractionDigits:dec,maximumFractionDigits:dec});
}
function fmtExpiry(s){
  const mn=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const d=new Date(s+'T12:00:00');
  return `${d.getDate()} ${mn[d.getMonth()]} ${d.getFullYear()}`;
}
function toggleEl(id){const e=document.getElementById(id);e.style.display=e.style.display==='none'?'block':'none'}
function showTab(name){
  ['chain','strategy','control','calc','ivsmile','ivcalc','histdata','mariposa','analisis','promedio','tutoriales'].forEach(t=>{
    const el=document.getElementById('tab-'+t);
    if(el)el.style.display=t===name?'block':'none';
  });
  document.querySelectorAll('.tab').forEach((t,i)=>{
    t.classList.toggle('active',['chain','strategy','control','calc','ivsmile','ivcalc','histdata','mariposa','analisis','promedio','tutoriales'][i]===name);
  });
  if(name==='strategy'&&!ST.charts.pnl)loadPreset('bull_spread',document.querySelector('[data-preset="bull_spread"]'));
  if(name==='calc')setTimeout(runCalc,50);
  if(name==='ivsmile')setTimeout(renderIVSmile,50);
  if(name==='ivcalc')setTimeout(runIVCalc,50);
  if(name==='control'){ctrlPopulateExpiry();renderControl();}
  if(name==='histdata'){histPopulateStrikes();renderHistData();}
  if(name==='mariposa'){marPopulateExpiry();renderMariposa();}
  if(name==='analisis'){anaPopulateExpiry();renderAnalisis();}
  if(name==='tutoriales'){tutShow('cadena');}
}
function manualSpot(){
  const v=parseFloat(document.getElementById('spot-input').value);
  if(v>0){ST.spot=v;document.getElementById('spot-display').textContent='$ '+v.toLocaleString('es-AR');generateMockAndRender();}
}
function generateMockAndRender(){
  generateMockData();populateExpiries();renderChain();
  if(ST.charts.iv)renderIVSmile();
}
function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');
  clearTimeout(t._tid);t._tid=setTimeout(()=>t.classList.remove('show'),3000);
}

/* ===== DATOS HISTÓRICOS ===== */
const HIST={rows:[],charts:{rc:null,vi:null,st:null,varr:null,bb:null,ri:null}};

// Parse HMD — tall format: one row per instrument per date
// Key = type + canonicalStrike (col F). Col E = last price.
function parseHistRows(rows){
  if(!rows||rows.length<2)return;
  const headerRowIdx=(+document.getElementById('sh-header-row-hist')?.value||1)-1;
  const dataRows=rows.slice(headerRowIdx+1);

  const dateIdx    =colLetterToIndex(document.getElementById('hist-col-date')?.value||'A');
  const typeIdx    =colLetterToIndex(document.getElementById('hist-col-type')?.value||'C');
  const strikeIdx  =colLetterToIndex(document.getElementById('hist-col-strike')?.value||'F');  // col F = canonical
  const lastIdx    =colLetterToIndex(document.getElementById('hist-col-last')?.value||'E');

  const dateMap={};
  const colMap=new Map(); // "call_6902.9" → {type, strike, key}

  dataRows.forEach(r=>{
    if(!r||!r.length)return;
    const raw=(r[dateIdx]||'').toString().trim();
    const date=normalizeExpiry(raw)||raw;
    if(!date)return;
    const tipoRaw=(r[typeIdx]||'').toString().trim().toLowerCase();
    const strikeF=parseARSNum(r[strikeIdx]);
    const last=parseARSNum(r[lastIdx]);
    if(!dateMap[date])dateMap[date]={};

    if(tipoRaw==='suby'||tipoRaw==='subyacente'){
      dateMap[date].__suby__=isNaN(last)?null:last;
      return;
    }
    if(isNaN(strikeF)||strikeF<=0)return;
    const type=tipoRaw.includes('put')?'put':'call';
    const key=`${type}_${strikeF}`;
    if(!colMap.has(key))colMap.set(key,{key,type,strike:strikeF});
    dateMap[date][key]={price:isNaN(last)?null:last,strike:strikeF};
  });

  // HIST.cols — sorted by type then strike ascending
  HIST.cols=[...colMap.values()].sort((a,b)=>{
    if(a.type!==b.type)return a.type.localeCompare(b.type);
    return a.strike-b.strike;
  });

  // HIST.rows — sorted ascending by date
  HIST.rows=Object.entries(dateMap)
    .sort((a,b)=>a[0].localeCompare(b[0]))
    .map(([date,priceMap])=>({date,prices:priceMap,spot:priceMap.__suby__||null}));

  histPopulateStrikes();
}

function histPopulateStrikes(){
  const s1=document.getElementById('hist-strike1');
  const s2=document.getElementById('hist-strike2');
  if(!s1||!s2)return;
  if(!HIST.cols||!HIST.cols.length)return;

  // Unique strikes (regardless of type), sorted ascending
  const uniqueStrikes=[...new Set(HIST.cols.map(c=>c.strike))].sort((a,b)=>a-b);

  const cur1=parseFloat(s1.value)||0;
  const cur2=parseFloat(s2.value)||0;
  s1.innerHTML='';s2.innerHTML='';

  uniqueStrikes.forEach(s=>{
    const label=fmtStrike(s);
    const o1=document.createElement('option');
    o1.value=s;o1.textContent=label;
    if(Math.round(s*100)===Math.round(cur1*100))o1.selected=true;
    s1.appendChild(o1);
    const o2=document.createElement('option');
    o2.value=s;o2.textContent=label;
    if(Math.round(s*100)===Math.round(cur2*100))o2.selected=true;
    s2.appendChild(o2);
  });

  // Default: two ATM-closest strikes
  if(!cur1&&!cur2&&uniqueStrikes.length>=2){
    const S=ST.spot;
    const sorted=[...uniqueStrikes].sort((a,b)=>Math.abs(a-S)-Math.abs(b-S));
    s1.value=sorted[0];
    s2.value=sorted[1];
  }

  // Sync expiry
  const expiryEl=document.getElementById('hist-expiry');
  if(expiryEl&&!expiryEl.value&&ST.selExpiry)expiryEl.value=ST.selExpiry;
  const rEl=document.getElementById('hist-rate');
  if(rEl&&rEl.value==='')rEl.value='0';
}

function calcHistCalcs(p1,p2,T1,T2,r,q,K1,K2,spot,type1,type2){
  const iv1=(p1!=null&&p1>0&&T1>0)?impliedVol(spot,K1,T1,r,q,p1,type1)||null:null;
  const iv2=(p2!=null&&p2>0&&T2>0)?impliedVol(spot,K2,T2,r,q,p2,type2)||null:null;
  const viProm=(iv1&&iv2)?(iv1+iv2)/2:iv1||iv2||null;
  const rc=(p1!=null&&p1>0&&p2!=null&&p2>0)?p1/p2:null;
  const straddle=(p1!=null&&p2!=null)?p1+p2:null;
  return{iv1,iv2,viProm,rc,straddle};
}

function histToggleType(n){
  const hidden=document.getElementById('hist-type'+n);
  const btn=document.getElementById('hist-type'+n+'-btn');
  if(!hidden||!btn)return;
  const newVal=hidden.value==='call'?'put':'call';
  hidden.value=newVal;
  const isCall=newVal==='call';
  btn.textContent=isCall?'Call':'Put';
  btn.style.color=isCall?'var(--green)':'var(--red)';
  btn.style.borderColor=isCall?'var(--green)':'var(--red)';
  renderHistData();
}

function histSwapStrikes(){
  const s1=document.getElementById('hist-strike1');
  const s2=document.getElementById('hist-strike2');
  const t1=document.getElementById('hist-type1');
  const t2=document.getElementById('hist-type2');
  const b1=document.getElementById('hist-type1-btn');
  const b2=document.getElementById('hist-type2-btn');
  if(!s1||!s2)return;
  // Swap values
  const tmpS=s1.value;s1.value=s2.value;s2.value=tmpS;
  if(t1&&t2){
    const tmpT=t1.value;t1.value=t2.value;t2.value=tmpT;
    // Sync button appearances
    [1,2].forEach(n=>{
      const t=document.getElementById('hist-type'+n);
      const b=document.getElementById('hist-type'+n+'-btn');
      if(t&&b){
        const isCall=t.value==='call';
        b.textContent=isCall?'Call':'Put';
        b.style.color=isCall?'var(--green)':'var(--red)';
        b.style.borderColor=isCall?'var(--green)':'var(--red)';
      }
    });
  }
  renderHistData();
}

function renderHistData(){
  // baseKey from selectors
  const K1=parseFloat(document.getElementById('hist-strike1')?.value)||0;
  const K2=parseFloat(document.getElementById('hist-strike2')?.value)||0;
  const type1=document.getElementById('hist-type1')?.value||'call';
  const type2=document.getElementById('hist-type2')?.value||'call';
  const baseKey1=`${type1}_${K1}`;
  const baseKey2=`${type2}_${K2}`;
  const col1=HIST.cols.find(c=>c.key===baseKey1)||null;
  const col2=HIST.cols.find(c=>c.key===baseKey2)||null;
  const r=parseFloat(document.getElementById('hist-rate')?.value||'0')/100;
  const ri=Math.max(0.1,Math.min(4,parseFloat(document.getElementById('hist-ri')?.value)||1.0));
  const q=ST.q;
  const expiryStr=document.getElementById('hist-expiry')?.value||ST.selExpiry||'';
  const expiryMs=expiryStr?new Date(expiryStr+'T12:00:00').getTime():null;

  // Update headers
  // Column abbreviation from base col
  function colAbbr(col,fbType,fbK){
    const s=col?.strike||fbK||0;
    const t=col?.type||fbType||'call';
    const p=t==='call'?'C':'P';
    const digits=s>=10000?3:2;
    return`${p}${Math.floor(s).toString().slice(0,digits)}`;
  }

  const th1=document.getElementById('hist-th-s1');
  const th2=document.getElementById('hist-th-s2');
  const thvi1=document.getElementById('hist-th-vi1');
  const thvi2=document.getElementById('hist-th-vi2');
  const c1color=type1==='call'?'var(--green)':'var(--red)';
  const c2color=type2==='call'?'var(--green)':'var(--red)';
  if(th1){th1.textContent=colAbbr(col1,type1,K1);th1.style.color=c1color;}
  if(th2){th2.textContent=colAbbr(col2,type2,K2);th2.style.color=c2color;}
  if(thvi1){thvi1.textContent='VI '+colAbbr(col1,type1,K1);thvi1.style.color=c1color;}
  if(thvi2){thvi2.textContent='VI '+colAbbr(col2,type2,K2);thvi2.style.color=c2color;}

  // Update Bull/Bear header label based on types
  const bbLabel=type1==='call'&&type2==='call'?'Bull Call Spread':type1==='put'&&type2==='put'?'Bear Put Spread':'Bull/Bear';
  const bbTh=document.getElementById('hist-th-bb');
  if(bbTh)bbTh.textContent=bbLabel;
  const bbChartTitle=document.getElementById('hist-chart-bb-title');
  if(bbChartTitle)bbChartTitle.textContent=bbLabel;

  const source=HIST.rows.length?HIST.rows:[];
  if(!source.length){
    document.getElementById('hist-body').innerHTML=`<tr><td colspan="12" style="padding:24px;text-align:center;color:var(--muted)">Sin datos — presioná ⟳ Actualizar HMD</td></tr>`;
    return;
  }

  // Build calculated rows — ascending date order, use exact strike from each row for IV
  const calc=source.map(row=>{
    const spot=row.spot||ST.spot;
    const entry1=row.prices[baseKey1]||null;
    const entry2=row.prices[baseKey2]||null;
    const p1=entry1?.price??null;
    const p2=entry2?.price??null;
    const k1=entry1?.strike||K1;  // exact strike on this date
    const k2=entry2?.strike||K2;
    let T1=0,T2=0;
    if(expiryMs){
      const rowMs=new Date(row.date+'T12:00:00').getTime();
      const days=Math.max(0,(expiryMs-rowMs)/(1000*60*60*24));
      T1=T2=days/365;
    }
    // Bull/Bear = p1 - p2 (buy S1, sell S2 — net debit/credit)
    const bb=(p1!=null&&p2!=null)?p1-p2:null;
    // Costo RI = (p1 * -10) + p2 * ri * 10
    const riCost=(p1!=null&&p2!=null)?(-10*p1)+(p2*ri*10):null;
    return{date:row.date,p1,p2,spot,...calcHistCalcs(p1,p2,T1,T2,r,q,k1,k2,spot,type1,type2),bb,riCost};
  });

  // Add variation fields (% change vs previous row)
  calc.forEach((row,i)=>{
    if(i===0){row.varVI=null;row.varRC=null;row.varST=null;row.varBB=null;row.varRI=null;return;}
    const prev=calc[i-1];
    row.varVI=prev.viProm&&row.viProm?(row.viProm-prev.viProm)/prev.viProm:null;
    row.varRC=prev.rc&&row.rc?(row.rc-prev.rc)/prev.rc:null;
    row.varST=prev.straddle&&row.straddle?(row.straddle-prev.straddle)/prev.straddle:null;
    row.varBB=prev.bb!=null&&row.bb!=null&&prev.bb!==0?(row.bb-prev.bb)/Math.abs(prev.bb):null;
    row.varRI=prev.riCost!=null&&row.riCost!=null&&prev.riCost!==0?(row.riCost-prev.riCost)/Math.abs(prev.riCost):null;
  });

  // Render table
  const tb=document.getElementById('hist-body');
  tb.innerHTML='';
  calc.forEach(row=>{
    const tr=document.createElement('tr');
    tr.style.borderBottom='1px solid var(--border2)';
    const pct=v=>v==null?'--':(v>=0?'+':'')+((v*100).toFixed(2))+'%';
    const varColor=v=>v==null?'var(--muted)':v>0?'var(--green)':'var(--red)';
    tr.innerHTML=`
      <td style="padding:4px 8px;text-align:center;color:var(--muted);white-space:nowrap">${row.date||'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:var(--muted)">${row.spot!=null?fmtN(row.spot,0):'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:${c1color}">${row.p1!=null?fmtN(row.p1):'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:${c2color}">${row.p2!=null?fmtN(row.p2):'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:${c1color}">${row.iv1!=null?(row.iv1*100).toFixed(2)+'%':'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:${c2color}">${row.iv2!=null?(row.iv2*100).toFixed(2)+'%':'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:var(--amber)">${row.viProm!=null?(row.viProm*100).toFixed(2)+'%':'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:${varColor(row.varVI)}">${pct(row.varVI)}</td>
      <td style="padding:4px 8px;text-align:center;color:var(--amber)">${row.rc!=null?row.rc.toFixed(2):'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:${varColor(row.varRC)}">${pct(row.varRC)}</td>
      <td style="padding:4px 8px;text-align:center;color:var(--amber)">${row.straddle!=null?fmtN(row.straddle):'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:${varColor(row.varST)}">${pct(row.varST)}</td>
      <td style="padding:4px 8px;text-align:center;color:${row.bb!=null?(row.bb>=0?'var(--green)':'var(--red)'):'var(--muted)'}">${row.bb!=null?fmtN(row.bb):'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:${varColor(row.varBB)}">${pct(row.varBB)}</td>
      <td style="padding:4px 8px;text-align:center;color:${row.riCost!=null?(row.riCost>=0?'var(--green)':'var(--red)'):'var(--muted)'}">${row.riCost!=null?fmtN(row.riCost):'--'}</td>
      <td style="padding:4px 8px;text-align:center;color:${varColor(row.varRI)}">${pct(row.varRI)}</td>`;
    tb.appendChild(tr);
  });

  // Charts
  const labels=calc.map(r=>r.date||'');
  const chartOpts=(color,label,fmt)=>({
    responsive:true,maintainAspectRatio:false,animation:false,
    plugins:{
      legend:{display:false},
      tooltip:{backgroundColor:'#131920',borderColor:'#2a3444',borderWidth:1,titleColor:'#7a8fa6',bodyColor:'#d8e3ef',
        callbacks:{label:c=>` ${label}: ${fmt(c.raw)}`}}
    },
    scales:{
      x:{ticks:{color:'#7a8fa6',font:{size:8},maxRotation:45,minRotation:45,autoSkip:false,callback:(v,i,vals)=>{
          const d=labels[i];if(!d)return'';
          const p=d.split('-');return p.length>=3?p[2]+'-'+p[1]:d;
        }},grid:{color:'#1a2230'}},
      y:{ticks:{color:'#7a8fa6',font:{size:9},callback:v=>fmt(v)},grid:{color:'#1a2230'}}
    }
  });

  const makeChart=(id,key,color,label,fmt)=>{
    if(HIST.charts[key])HIST.charts[key].destroy();
    const ctx=document.getElementById(id)?.getContext('2d');
    if(!ctx)return;
    HIST.charts[key]=new Chart(ctx,{
      type:'line',
      data:{labels,datasets:[{data:calc.map(r=>r[key]!=null?parseFloat(r[key].toFixed(4)):null),
        borderColor:color,borderWidth:1.5,pointRadius:3,pointBackgroundColor:color,fill:false,spanGaps:true}]},
      options:chartOpts(color,label,fmt)
    });
  };

  makeChart('hist-chart-rc','rc','#e8b84b','RC',v=>v!=null?v.toFixed(2):'--');
  makeChart('hist-chart-vi','viProm','#5aabff','VI prom',v=>v!=null?(v*100).toFixed(1)+'%':'--');
  makeChart('hist-chart-st','straddle','#44c76a','Straddle',v=>v!=null?fmtN(v):'--');
  makeChart('hist-chart-bb','bb','#5aabff',bbLabel,v=>v!=null?fmtN(v):'--');
  makeChart('hist-chart-ri','riCost','#b088f0','Costo RI',v=>v!=null?fmtN(v):'--');

  // Variación chart — 3 series
  if(HIST.charts.varr)HIST.charts.varr.destroy();
  const ctxV=document.getElementById('hist-chart-var')?.getContext('2d');
  if(ctxV){
    HIST.charts.varr=new Chart(ctxV,{
      type:'line',
      data:{labels,datasets:[
        {label:'Var VI%',data:calc.map(r=>r.varVI!=null?parseFloat((r.varVI*100).toFixed(3)):null),borderColor:'#b088f0',borderWidth:1.5,pointRadius:3,fill:false,spanGaps:true},
        {label:'Var RC%',data:calc.map(r=>r.varRC!=null?parseFloat((r.varRC*100).toFixed(3)):null),borderColor:'#f05a5a',borderWidth:1.5,pointRadius:3,fill:false,spanGaps:true},
        {label:'Var ST%',data:calc.map(r=>r.varST!=null?parseFloat((r.varST*100).toFixed(3)):null),borderColor:'#e8b84b',borderWidth:1.5,pointRadius:0,fill:false,spanGaps:true}
      ]},
      options:{...chartOpts('','%',v=>v!=null?v.toFixed(2)+'%':'--'),
        plugins:{
          legend:{display:true,labels:{color:'#7a8fa6',font:{size:9},boxWidth:8,padding:8}},
          tooltip:{backgroundColor:'#131920',borderColor:'#2a3444',borderWidth:1,titleColor:'#7a8fa6',bodyColor:'#d8e3ef'}
        }
      }
    });
  }
}

async function fetchHistData(){
  const webAppUrl=document.getElementById('sh-webapp-url')?.value.trim();
  const sheet=document.getElementById('sh-sheetname-hist')?.value.trim()||'HMD';
  const statusEl=document.getElementById('hist-status');
  if(!webAppUrl){if(statusEl)statusEl.textContent='Sin URL configurada';return;}
  if(statusEl)statusEl.textContent='Cargando…';
  try{
    const res=await fetch(`${webAppUrl}?sheet=${encodeURIComponent(sheet)}`);
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const data=await res.json();
    if(data.error)throw new Error(data.error);
    const rows=data.values||data;
    if(!Array.isArray(rows)||rows.length<2)throw new Error('Sin datos');
    parseHistRows(rows);
    renderHistData();
    if(statusEl)statusEl.textContent=`${HIST.rows.length} registros cargados · ${new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}`;
    showToast(`Datos históricos (HMD) cargados — ${HIST.rows.length} filas`);
  }catch(e){
    if(statusEl)statusEl.textContent='Error: '+e.message;
    showToast('Error HMD: '+e.message);
    console.error('fetchHistData:',e);
  }
}


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

/* ===== MÓDULO ANÁLISIS DE ESTRATEGIAS ===== */

function anaPopulateExpiry(){
  const sel=document.getElementById('ana-expiry');
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

function anaGetChain(exp){
  if(!exp||!ST.chain[exp])return null;
  return [...ST.chain[exp]].sort((a,b)=>a.strike-b.strike);
}

function anaATM(rows){
  const S=ST.spot;
  return rows.reduce((p,r)=>Math.abs(r.strike-S)<Math.abs(p.strike-S)?r:p,rows[0]);
}

function anaRowByStrike(rows,K){
  return rows.find(r=>Math.round(r.strike*100)===Math.round(K*100))||null;
}

function anaNthOTM(rows,type,n){
  // n=1 → first OTM, n=2 → second OTM etc.
  const S=ST.spot;
  if(type==='call'){
    const above=rows.filter(r=>r.strike>S).sort((a,b)=>a.strike-b.strike);
    return above[n-1]||null;
  } else {
    const below=rows.filter(r=>r.strike<S).sort((a,b)=>b.strike-a.strike);
    return below[n-1]||null;
  }
}

function anaDays(exp){
  if(!exp)return 0;
  return Math.max(0,Math.round((new Date(exp+'T12:00:00')-Date.now())/(1000*60*60*24)));
}

// ---- Card builder ----
const BADGE={
  ALCISTA:  {label:'ALCISTA',   bg:'rgba(68,199,106,0.15)', color:'var(--green)',   border:'rgba(68,199,106,0.4)'},
  BAJISTA:  {label:'BAJISTA',   bg:'rgba(240,90,90,0.15)',  color:'var(--red)',     border:'rgba(240,90,90,0.4)'},
  NEUTRO:   {label:'NEUTRO',    bg:'rgba(122,143,166,0.15)',color:'var(--muted)',   border:'rgba(122,143,166,0.3)'},
  COBERTURA:{label:'COBERTURA', bg:'rgba(90,171,255,0.15)', color:'var(--blue)',    border:'rgba(90,171,255,0.4)'},
  VOLATILIDAD:{label:'VOLATILIDAD',bg:'rgba(232,184,75,0.15)',color:'var(--amber)', border:'rgba(232,184,75,0.4)'},
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
  if(!rows||!rows.length){
    grid.innerHTML='<div style="padding:30px;text-align:center;color:var(--muted)">Sin datos — cargá la cadena de opciones primero</div>';
    return;
  }

  const S=ST.spot;
  const days=anaDays(exp);
  const expLabel=fmtExpiry(exp);
  const atm=anaATM(rows);

  // helpers
  const c=r=>r?.callMid||0;
  const p=r=>r?.putMid||0;
  const fS=K=>fmtStrike(K);
  const fP=v=>`$${fmtN(v)}`;
  const pct=v=>`${v>=0?'+':''}${(v*100).toFixed(1)}%`;
  const ve=(r,type)=>{const v=type==='call'?r?.callLastVE:r?.putLastVE;return v!=null?(v*100).toFixed(2)+'%':'--';};

  // ATM call/put
  const atmCall=c(atm);
  const atmPut=p(atm);
  const atmK=atm.strike;

  // OTM strikes
  const otmCall1=anaNthOTM(rows,'call',1);
  const otmCall2=anaNthOTM(rows,'call',2);
  const otmPut1=anaNthOTM(rows,'put',1);
  const otmPut2=anaNthOTM(rows,'put',2);

  // Slightly ITM call for bull spread (ATM or 1st above)
  const bullLow=atm;
  const bullHigh=otmCall1;
  // Bear spread
  const bearHigh=atm;
  const bearLow=otmPut1;

  // ── 1. Bull Call Spread ──
  if(bullLow&&bullHigh){
    const debit=c(bullLow)-c(bullHigh);
    const maxProfit=(bullHigh.strike-bullLow.strike)*100-debit*100;
    const be=bullLow.strike+debit;
    const rr=maxProfit>0?((maxProfit/(debit*100))).toFixed(1):'--';
    grid.appendChild(anaCard({
      title:'Bull Call Spread',
      subtitle:`${fS(bullLow.strike)} / ${fS(bullHigh.strike)}`,
      badge:'ALCISTA',icon:'📈',
      desc:`Spread alcista limitado. Compra call ${fS(bullLow.strike)} y vende call ${fS(bullHigh.strike)}. Beneficio si el precio sube hacia ${fS(bullHigh.strike)}.`,
      metrics:[
        ['Débito neto',fP(debit*100),'var(--red)'],
        ['Break even',fS(be),'var(--amber)'],
        ['Máx. ganancia',fP(maxProfit),'var(--green)'],
        ['Risk/Reward',rr+'x','var(--text)'],
        ['VE compra',ve(bullLow,'call'),'var(--blue)'],
        ['VE venta',ve(bullHigh,'call'),'var(--blue)'],
        ['VTO',expLabel,'var(--muted)'],
        ['Días',days+'d','var(--muted)'],
      ],
      legs:[
        {side:'buy',label:`COMPRA call ${fS(bullLow.strike)}  prima ${fP(c(bullLow))}`},
        {side:'sell',label:`VENTA call ${fS(bullHigh.strike)}  prima ${fP(c(bullHigh))}`},
      ]
    }));
  }

  // ── 2. Bear Put Spread ──
  if(bearHigh&&bearLow){
    const debit=p(bearHigh)-p(bearLow);
    const maxProfit=(bearHigh.strike-bearLow.strike)*100-debit*100;
    const be=bearHigh.strike-debit;
    const rr=maxProfit>0?(maxProfit/(debit*100)).toFixed(1):'--';
    grid.appendChild(anaCard({
      title:'Bear Put Spread',
      subtitle:`${fS(bearLow.strike)} / ${fS(bearHigh.strike)}`,
      badge:'BAJISTA',icon:'📉',
      desc:`Spread bajista limitado. Compra put ${fS(bearHigh.strike)} y vende put ${fS(bearLow.strike)}. Beneficio si el precio cae hacia ${fS(bearLow.strike)}.`,
      metrics:[
        ['Débito neto',fP(debit*100),'var(--red)'],
        ['Break even',fS(be),'var(--amber)'],
        ['Máx. ganancia',fP(maxProfit),'var(--green)'],
        ['Risk/Reward',rr+'x','var(--text)'],
        ['VE compra',ve(bearHigh,'put'),'var(--blue)'],
        ['VE venta',ve(bearLow,'put'),'var(--blue)'],
        ['VTO',expLabel,'var(--muted)'],
        ['Días',days+'d','var(--muted)'],
      ],
      legs:[
        {side:'buy',label:`COMPRA put ${fS(bearHigh.strike)}  prima ${fP(p(bearHigh))}`},
        {side:'sell',label:`VENTA put ${fS(bearLow.strike)}  prima ${fP(p(bearLow))}`},
      ]
    }));
  }

  // ── 3. Covered Call ──
  if(otmCall1){
    const premium=c(otmCall1);
    const callK=otmCall1.strike;
    const maxProfit=(callK-costBasis)*shares+premium*100;
    const be=costBasis-premium;
    const retorno=premium/S;
    grid.appendChild(anaCard({
      title:'Covered Call',
      subtitle:`Venta call ${fS(callK)} · Ingreso sobre tenencia`,
      badge:'NEUTRO',icon:'🛡️',
      desc:`${fS(callK)} es el Call Wall — zona de máxima resistencia de gamma positiva. Ideal para vender si ya tenés acciones. El precio difícilmente supere ese nivel antes del vencimiento.`,
      metrics:[
        ['Prima cobrada',fP(premium*100),'var(--green)'],
        ['Break even',fS(be),'var(--amber)'],
        ['Máx. ganancia',fP(maxProfit),'var(--green)'],
        ['Retorno prima',pct(retorno),'var(--green)'],
        ['Last VE',ve(otmCall1,'call'),'var(--blue)'],
        ['VTO',expLabel,'var(--muted)'],
        ['Días',days+'d','var(--muted)'],
      ],
      legs:[
        {side:'buy',label:`TENENCIA ${shares} acc. GGAL @ ${fP(costBasis)}`},
        {side:'sell',label:`VENTA call ${fS(callK)}  prima ${fP(premium)}`},
      ]
    }));
  }

  // ── 4. Venta Put Cash Secured ──
  if(otmPut1){
    const putK=otmPut1.strike;
    const premium=p(otmPut1);
    const be=putK-premium;
    const ganancia=premium*100;
    const garantia=putK*100;
    grid.appendChild(anaCard({
      title:'Venta Put (Cash Secured)',
      subtitle:`Venta put ${fS(putK)} · Entrada con descuento`,
      badge:'ALCISTA',icon:'💰',
      desc:`Cobrás la prima ahora. Si el precio se mantiene sobre ${fS(putK)} al vencimiento, la put vence sin valor. Si baja, comprás acciones efectivamente a ${fS(be)} (BE).`,
      metrics:[
        ['Prima cobrada',fP(ganancia),'var(--green)'],
        ['Break even',fS(be),'var(--amber)'],
        ['Ganancia máx.',fP(ganancia),'var(--green)'],
        ['Strike vs Spot',pct((putK-S)/S),'var(--muted)'],
        ['Last VE',ve(otmPut1,'put'),'var(--blue)'],
        ['VTO',expLabel,'var(--muted)'],
        ['Días',days+'d','var(--muted)'],
      ],
      legs:[
        {side:'sell',label:`VENTA put ${fS(putK)}  prima ${fP(premium)}`},
        {side:'buy',label:`GARANTÍA efectivo ${fS(putK)} × lote`},
      ]
    }));
  }

  // ── 5. Straddle ATM ──
  const straddleCost=(atmCall+atmPut)*100;
  const beUp=atmK+atmCall+atmPut;
  const beDown=atmK-(atmCall+atmPut);
  if(atmCall>0&&atmPut>0){
    const T=rows[0]?.T||(days/365);
    const ivAtm=impliedVol(S,atmK,T,ST.rate,ST.q,atmCall,'call')||0;
    grid.appendChild(anaCard({
      title:'Straddle ATM',
      subtitle:`Compra call+put ${fS(atmK)} · Apuesta a volatilidad`,
      badge:'VOLATILIDAD',icon:'⚡',
      desc:`Ganás si el mercado se mueve bruscamente en cualquier dirección. Perdés la prima si el precio permanece cerca de ${fS(atmK)}.`,
      metrics:[
        ['Prima total',fP(straddleCost),'var(--red)'],
        ['BE arriba',fS(beUp),'var(--green)'],
        ['BE abajo',fS(beDown),'var(--green)'],
        ['VE call ATM',ve(atm,'call'),'var(--blue)'],
        ['VE put ATM',ve(atm,'put'),'var(--blue)'],
        ['VTO',expLabel,'var(--muted)'],
        ['Días',days+'d','var(--muted)'],
      ],
      legs:[
        {side:'buy',label:`COMPRA call ${fS(atmK)}  prima ${fP(atmCall)}`},
        {side:'buy',label:`COMPRA put ${fS(atmK)}  prima ${fP(atmPut)}`},
      ]
    }));
  }

  // ── 6. Strangle OTM ──
  if(otmCall1&&otmPut1){
    const cP=c(otmCall1),pP=p(otmPut1);
    const cost=(cP+pP)*100;
    const beUpS=otmCall1.strike+cP+pP;
    const beDnS=otmPut1.strike-(cP+pP);
    const savings=straddleCost-cost;
    grid.appendChild(anaCard({
      title:'Strangle OTM',
      subtitle:`${fS(otmPut1.strike)} / ${fS(otmCall1.strike)}`,
      badge:'VOLATILIDAD',icon:'🔀',
      desc:`Versión más barata del straddle. Necesita un movimiento mayor para ser rentable, pero el rango ${fS(otmPut1.strike)} – ${fS(otmCall1.strike)} es más amplio.`,
      metrics:[
        ['Prima total',fP(cost),'var(--red)'],
        ['BE arriba',fS(beUpS),'var(--green)'],
        ['BE abajo',fS(beDnS),'var(--green)'],
        ['Ahorro vs straddle',fP(savings),'var(--green)'],
        ['VE call',ve(otmCall1,'call'),'var(--blue)'],
        ['VE put',ve(otmPut1,'put'),'var(--blue)'],
        ['VTO',expLabel,'var(--muted)'],
        ['Días',days+'d','var(--muted)'],
      ],
      legs:[
        {side:'buy',label:`COMPRA call ${fS(otmCall1.strike)}  prima ${fP(cP)}`},
        {side:'buy',label:`COMPRA put ${fS(otmPut1.strike)}  prima ${fP(pP)}`},
      ]
    }));
  }

  // ── 7. Compra Call Directa ──
  if(otmCall1){
    const callK=otmCall1.strike;
    const premium=c(otmCall1);
    const be=callK+premium;
    const T=rows[0]?.T||(days/365);
    const greeks=bs(S,callK,T,ST.rate,ST.q,impliedVol(S,callK,T,ST.rate,ST.q,premium,'call')||0.5,'call');
    grid.appendChild(anaCard({
      title:'Compra Call Directa',
      subtitle:`Call ${fS(callK)} · Ruptura al alza`,
      badge:'ALCISTA',icon:'🚀',
      desc:`Compra especulativa. Si el precio supera ${fS(be)} antes del vencimiento la operación es ganadora. Delta ${greeks.delta.toFixed(2)} — cada punto que sube el spot, la prima sube ~${fmtN(greeks.delta)}.`,
      metrics:[
        ['Prima',fP(premium*100),'var(--red)'],
        ['Break even',fS(be),'var(--amber)'],
        ['Target',fS(callK+(callK-S)*1.5),'var(--green)'],
        ['Delta',greeks.delta.toFixed(2),'var(--text)'],
        ['Last VE',ve(otmCall1,'call'),'var(--blue)'],
        ['VTO',expLabel,'var(--muted)'],
        ['Días',days+'d','var(--muted)'],
      ],
      legs:[
        {side:'buy',label:`COMPRA call ${fS(callK)}  prima ${fP(premium)}`},
      ]
    }));
  }

  // ── 8. Compra Put Cobertura ──
  if(otmPut1){
    const putK=otmPut1.strike;
    const premium=p(otmPut1);
    const be=putK-premium;
    const T=rows[0]?.T||(days/365);
    const greeks=bs(S,putK,T,ST.rate,ST.q,impliedVol(S,putK,T,ST.rate,ST.q,premium,'put')||0.5,'put');
    grid.appendChild(anaCard({
      title:'Compra Put — Cobertura',
      subtitle:`Put ${fS(putK)} · Protección bajista`,
      badge:'COBERTURA',icon:'🔒',
      desc:`Seguro bajista sobre tu cartera. Si el precio cae bajo ${fS(be)} la put compensa las pérdidas. Delta ${greeks.delta.toFixed(2)}.`,
      metrics:[
        ['Prima',fP(premium*100),'var(--red)'],
        ['Break even',fS(be),'var(--amber)'],
        ['Target bajista',fS(putK-(S-putK)*1.5),'var(--red)'],
        ['Delta',greeks.delta.toFixed(2),'var(--text)'],
        ['Last VE',ve(otmPut1,'put'),'var(--blue)'],
        ['VTO',expLabel,'var(--muted)'],
        ['Días',days+'d','var(--muted)'],
      ],
      legs:[
        {side:'buy',label:`COMPRA put ${fS(putK)}  prima ${fP(premium)}`},
      ]
    }));
  }
}

/* ===== MÓDULO TUTORIALES ===== */
const TUT_PAGES={

cadena:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">📊 Cadena de opciones</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Visualización en tiempo real de calls y puts para el vencimiento seleccionado.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">¿Qué muestra?</h3>
<p>La cadena de opciones presenta todos los contratos disponibles para GGAL organizados por strike. Las <span style="color:var(--green)">calls</span> están a la izquierda y las <span style="color:var(--red)">puts</span> a la derecha, con el strike en el centro.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Columnas</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px">
  <tr style="background:var(--surface2)"><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Campo</th><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Descripción</th></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--green)">Delta</td><td style="padding:6px 10px;color:var(--muted)">Sensibilidad del precio de la opción ante movimientos del subyacente. Call: 0 a 1. Put: -1 a 0.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Vega</td><td style="padding:6px 10px;color:var(--muted)">Cuánto cambia la prima ante un cambio del 1% en volatilidad implícita.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Theta</td><td style="padding:6px 10px;color:var(--muted)">Decaimiento diario del valor de la opción por el paso del tiempo. Siempre negativo.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Bid / Ask</td><td style="padding:6px 10px;color:var(--muted)">Mejor precio de compra y venta disponible en el mercado.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--green)">Last</td><td style="padding:6px 10px;color:var(--muted)">Último precio operado. Es el valor que se usa para calcular la IV implícita.</td></tr>
  <tr><td style="padding:6px 10px;color:var(--amber)">IV</td><td style="padding:6px 10px;color:var(--muted)">Volatilidad implícita calculada con Black-Scholes a partir del Last.</td></tr>
</table>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Colores de filas</h3>
<ul style="color:var(--muted);padding-left:18px;margin:0">
  <li style="margin-bottom:6px"><span style="color:var(--green)">Verde</span> — Call ITM: el precio actual del subyacente está por encima del strike.</li>
  <li style="margin-bottom:6px"><span style="color:var(--red)">Rojo suave</span> — Put ITM: el precio actual está por debajo del strike.</li>
  <li><span style="color:var(--amber)">Ámbar</span> — Strikes ATM: los dos más cercanos al precio spot actual.</li>
</ul>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Barra Black-Scholes</h3>
<p style="color:var(--muted)">Permite ajustar el Spot, Tasa libre de riesgo, Dividendos y Días al vencimiento para recalcular la IV implícita de todos los contratos en tiempo real sin necesidad de recargar datos.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Greeks al hacer click</h3>
<p style="color:var(--muted)">Al hacer click en cualquier opción de la cadena se abre un panel con los 6 griegos completos: Delta, Gamma, Theta, Vega, Rho y el precio teórico BS.</p>
`,

control:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">🎛️ Control de estrategias</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Seguimiento del P&L de tus posiciones abiertas con precios actualizados de la cadena.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">¿Para qué sirve?</h3>
<p style="color:var(--muted)">Permite registrar las patas de tus estrategias con el precio al que las armaste, y compararlas con el precio actual del mercado para ver el resultado si las desarmaras hoy.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Columnas</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px">
  <tr style="background:var(--surface2)"><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Campo</th><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Descripción</th></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Lotes</td><td style="padding:6px 10px;color:var(--muted)">Cantidad de contratos. Positivo = compra, negativo = venta.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Precio</td><td style="padding:6px 10px;color:var(--muted)">Precio al que se armó la pata (precio de entrada).</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--amber)">Costo c/Comi</td><td style="padding:6px 10px;color:var(--muted)">Costo total de armar esa pata incluyendo comisión e IVA. Negativo = débito.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Precio Last</td><td style="padding:6px 10px;color:var(--muted)">Precio actual de la opción tomado de la cadena activa.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Precio Manual</td><td style="padding:6px 10px;color:var(--muted)">Si cargás un precio aquí, pisa el Last para ese cálculo (aparece badge "MAN").</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--amber)">Desarmado c/Comi</td><td style="padding:6px 10px;color:var(--muted)">Cuánto recibirías/pagarías al cerrar esa pata hoy.</td></tr>
  <tr><td style="padding:6px 10px">Dif Precio %</td><td style="padding:6px 10px;color:var(--muted)">Variación porcentual entre el precio de entrada y el precio actual.</td></tr>
</table>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Fórmulas de costo</h3>
<p style="color:var(--muted);font-family:var(--mono);font-size:11px;background:var(--surface2);padding:10px;border-radius:5px;border:1px solid var(--border2)">
Costo armado = -100 × lotes × precio × (1 + SIGN(lotes) × (com% + 0.2%) × IVA)<br>
Desarmado = 100 × lotes × precioLast × (1 - SIGN(lotes) × (com% + 0.2%) × IVA)
</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Pegado de datos (TSV)</h3>
<p style="color:var(--muted)">Podés pegar datos directamente desde Excel o el módulo Mariposa. El formato esperado es una fila por pata: <code style="background:var(--bg);padding:2px 6px;border-radius:3px">lotes ⇥ strike ⇥ precio</code></p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Persistencia</h3>
<p style="color:var(--muted)">Las estrategias se guardan automáticamente en el navegador (localStorage). Al reabrir la página se restauran solas. El botón <strong style="color:var(--red)">✕ Limpiar guardado</strong> elimina todo lo guardado.</p>
`,

ivsmile:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">📈 Smile de volatilidad</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Curva de volatilidad implícita por strike para cada vencimiento disponible.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">¿Qué muestra?</h3>
<p style="color:var(--muted)">El smile de volatilidad grafica la IV implícita de cada strike para los vencimientos disponibles. En mercados normales forma una "sonrisa" o "skew": las opciones OTM suelen tener mayor IV que las ATM.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Interpretación</h3>
<ul style="color:var(--muted);padding-left:18px;margin:0">
  <li style="margin-bottom:6px"><strong>Skew negativo (put skew)</strong>: las puts OTM tienen IV más alta que las calls OTM. Indica miedo bajista en el mercado.</li>
  <li style="margin-bottom:6px"><strong>Smile simétrico</strong>: IV alta en ambos extremos, mercado en equilibrio.</li>
  <li style="margin-bottom:6px"><strong>Curva plana</strong>: poca diferencia de IV entre strikes — mercado sin dirección clara.</li>
  <li><strong>Pico ATM</strong>: el mercado está pagando más por opciones cerca del precio actual.</li>
</ul>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Línea vertical</h3>
<p style="color:var(--muted)">La línea punteada vertical indica el precio spot actual del subyacente (GGAL). Los strikes a la izquierda son puts ITM / calls OTM, y los de la derecha son calls ITM / puts OTM.</p>
`,

histdata:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">🗂️ Datos históricos</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Evolución histórica de precios, IV y métricas de estrategia para dos strikes seleccionados.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Parámetros</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px">
  <tr style="background:var(--surface2)"><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Parámetro</th><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Descripción</th></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">S1 / S2</td><td style="padding:6px 10px;color:var(--muted)">Los dos strikes a comparar. Podés elegir si son Call o Put con el botón de tipo.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Tasa %</td><td style="padding:6px 10px;color:var(--muted)">Tasa libre de riesgo usada para calcular IV histórica. Default 0%.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Vencimiento</td><td style="padding:6px 10px;color:var(--muted)">Fecha de vencimiento de los contratos. Se usa para calcular el tiempo T en la IV de cada fila histórica.</td></tr>
  <tr><td style="padding:6px 10px">Relación RI</td><td style="padding:6px 10px;color:var(--muted)">Multiplicador para el Costo RI. Rango 0.1 – 4. Default 2.</td></tr>
</table>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Columnas calculadas</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px">
  <tr style="background:var(--surface2)"><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Columna</th><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Fórmula</th></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--amber)">VI S1 / VI S2</td><td style="padding:6px 10px;color:var(--muted)">IV implícita de cada strike calculada con Black-Scholes inverso (Newton-Raphson) usando el spot histórico del día.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--amber)">VI prom.</td><td style="padding:6px 10px;color:var(--muted)">(VI S1 + VI S2) / 2</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">RC</td><td style="padding:6px 10px;color:var(--muted)">Relación de costos = Precio S1 / Precio S2</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Straddle</td><td style="padding:6px 10px;color:var(--muted)">Precio S1 + Precio S2</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Bull/Bear</td><td style="padding:6px 10px;color:var(--muted)">Precio S1 − Precio S2. Si ambos son calls = Bull Call Spread. Si ambos puts = Bear Put Spread.</td></tr>
  <tr><td style="padding:6px 10px">Costo RI</td><td style="padding:6px 10px;color:var(--muted);font-family:var(--mono);font-size:11px">(S1 × -10) + S2 × RI × 10</td></tr>
</table>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Fuente de datos</h3>
<p style="color:var(--muted)">Los datos vienen de la hoja <strong>HMD</strong> de tu Google Sheet. El formato es "tall" (una fila por instrumento por fecha). La columna F contiene el strike canónico que agrupa las bases aunque el strike exacto cambie entre vencimientos.</p>
`,

mariposa:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">🦋 Mariposa</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Generador automático de combinaciones de estrategia mariposa desde la cadena activa.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">¿Qué es una mariposa?</h3>
<p style="color:var(--muted)">La mariposa es una estrategia de tres patas: compra de un strike bajo (SL), venta de un strike medio (SM) y compra de un strike alto (SH). Tiene ganancia máxima si el precio queda exactamente en SM al vencimiento, y pérdida limitada al costo inicial.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Tipos de mariposa</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px">
  <tr style="background:var(--surface2)"><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Tipo</th><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Descripción</th></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--green)">Estándar</td><td style="padding:6px 10px;color:var(--muted)">Ratio 1 × 2 × 1. Las alas son equidistantes en strikes. Se copia como 10 / -20 / 10 lotes.</td></tr>
  <tr><td style="padding:6px 10px;color:var(--blue)">Simétrica</td><td style="padding:6px 10px;color:var(--muted)">Ajusta el ala alta para que sea equidistante en <strong>$</strong> del SM. Ratio = (SM-SL)/(SH-SM). Se copia con lotes × 100 para evitar decimales.</td></tr>
</table>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Columnas</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px">
  <tr style="background:var(--surface2)"><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Columna</th><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Fórmula</th></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--amber)">Costo Bruto</td><td style="padding:6px 10px;color:var(--muted);font-family:var(--mono);font-size:11px">(pSL − 2×pSM + pSH) × 100</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--amber)">Costo Neto</td><td style="padding:6px 10px;color:var(--muted)">Costo Bruto más comisiones de las 3 patas.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--amber)">Costo Simétrico</td><td style="padding:6px 10px;color:var(--muted);font-family:var(--mono);font-size:11px">(pSL + r×pSH − (1+r)×pSM) × 100<br><span style="color:var(--dim)">donde r = (SM−SL)/(SH−SM)</span></td></tr>
  <tr><td style="padding:6px 10px">Ratio Simétrico</td><td style="padding:6px 10px;color:var(--muted)">Muestra los lotes relativos: 1 × (1+r) × r</td></tr>
</table>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Threshold de color</h3>
<p style="color:var(--muted)">Los costos se muestran en <span style="color:var(--green)">verde</span> si son ≤ 0 (crédito) o si su valor absoluto es menor al threshold configurado. En <span style="color:var(--red)">rojo</span> si superan ese umbral. Default: 5.000.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Botón Generar</h3>
<p style="color:var(--muted)">Cada fila tiene dos botones que copian la estrategia al portapapeles en formato TSV listo para pegar en <strong>Control de estrategias</strong>.</p>
`,

promedio:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">⚖️ Precio Promedio</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Calculadora de precio promedio ponderado de compras y ventas con comisiones e IVA.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">¿Para qué sirve?</h3>
<p style="color:var(--muted)">Cuando tenés varias compras y/o ventas del mismo instrumento a distintas primas, este módulo calcula el precio promedio real que pagaste o cobraste, ya con el impacto de comisiones e IVA incluido. Útil para saber exactamente cuál es tu costo base en una posición armada en múltiples tramos.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Cómo usarlo</h3>
<ol style="color:var(--muted);padding-left:18px;line-height:2">
  <li>Configurá Comisión % e IVA en la barra de parámetros (default 0.5% y 1.21)</li>
  <li>Copiá las filas desde Excel u otra fuente con el formato <code style="background:var(--bg);padding:2px 6px;border-radius:3px">CANT ⇥ BASE ⇥ PRIMA</code></li>
  <li>Pegalas en el área de texto — los resultados se calculan en tiempo real</li>
</ol>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Formato de entrada</h3>
<p style="color:var(--muted)">Tres columnas separadas por tab:</p>
<div style="font-family:var(--mono);font-size:11px;background:var(--surface2);padding:12px;border-radius:5px;border:1px solid var(--border2);color:var(--muted)">
10	7326,20	400,001<br>
-15	7926,20	198,999<br>
10	7326,20	510,000
</div>
<ul style="color:var(--muted);padding-left:18px;margin-top:10px">
  <li><strong>CANT</strong>: lotes. Positivo = compra, negativo = venta.</li>
  <li><strong>BASE</strong>: strike del contrato (informativo, no afecta el cálculo).</li>
  <li><strong>PRIMA</strong>: precio unitario de la opción.</li>
</ul>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Fórmulas</h3>
<div style="font-family:var(--mono);font-size:11px;background:var(--surface2);padding:12px;border-radius:5px;border:1px solid var(--border2);color:var(--muted)">
comFactor = (com% + 0.2%) × IVA<br><br>
Prima c/Comi (compra) = prima × (1 + comFactor)<br>
Prima c/Comi (venta)  = prima × (1 − comFactor)<br><br>
Costo total = cant × prima c/Comi × 100<br><br>
Promedio ponderado = Σ(|cant_i| × prima_i) / Σ|cant_i|
</div>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Resultados</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px">
  <tr style="background:var(--surface2)"><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Campo</th><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Descripción</th></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--green)">Prima promedio</td><td style="padding:6px 10px;color:var(--muted)">Promedio ponderado por lotes de la prima pura (sin comisión).</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--amber)">Prima prom. c/Comi</td><td style="padding:6px 10px;color:var(--muted)">Promedio ponderado ya con comisión e IVA incluidos. Es el costo real por contrato.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Costo total c/Comi</td><td style="padding:6px 10px;color:var(--muted)">Suma total en $ de todos los desembolsos o ingresos de ese lado.</td></tr>
  <tr><td style="padding:6px 10px;color:var(--amber)">Resultado neto</td><td style="padding:6px 10px;color:var(--muted)">Balance total de compras + ventas. Positivo = ganancia o crédito neto.</td></tr>
</table>
`,

config:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">⚙️ Configuración</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Cómo conectar el dashboard a tu Google Sheet.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Google Apps Script</h3>
<ol style="color:var(--muted);padding-left:18px;line-height:2">
  <li>Abrí tu Google Sheet y andá a <strong>Extensiones → Apps Script</strong></li>
  <li>Pegá el contenido del archivo <code style="background:var(--bg);padding:2px 6px;border-radius:3px">ggal_appscript.js</code></li>
  <li>Implementar → Nueva implementación → Tipo: <strong>Aplicación web</strong></li>
  <li>Ejecutar como: <strong>Yo</strong> · Acceso: <strong>Cualquier persona</strong></li>
  <li>Copiá la URL generada y pegala en el campo URL del panel de Configuración (ícono ⚙ arriba)</li>
</ol>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Hojas disponibles</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px">
  <tr style="background:var(--surface2)"><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Hoja</th><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Uso</th></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--amber)">DMD_Bot</td><td style="padding:6px 10px;color:var(--muted)">Datos de cotizaciones actualizados automáticamente por un bot.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--amber)">DMD_Sabro</td><td style="padding:6px 10px;color:var(--muted)">Hoja original de cotizaciones con datos ampliados (Last VE, etc.).</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--amber)">DMD_Mock</td><td style="padding:6px 10px;color:var(--muted)">Datos de prueba para testear sin afectar las hojas reales.</td></tr>
  <tr><td style="padding:6px 10px;color:var(--amber)">HMD</td><td style="padding:6px 10px;color:var(--muted)">Datos históricos diarios. Formato tall: una fila por instrumento por fecha.</td></tr>
</table>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Auto-actualización</h3>
<p style="color:var(--muted)">El panel de configuración tiene una opción para activar auto-refresh. Las opciones van de 1 a 10 segundos. Cuando está activo, el dashboard recarga los datos de la cadena de opciones automáticamente y actualiza todos los módulos.</p>
`,

formulas:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">🔢 Fórmulas y cálculos</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Referencia de los cálculos matemáticos usados en el dashboard.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Black-Scholes</h3>
<p style="color:var(--muted)">Todos los precios teóricos y griegos se calculan con el modelo Black-Scholes con dividendos continuos (modelo de Merton):</p>
<div style="font-family:var(--mono);font-size:11px;background:var(--surface2);padding:12px;border-radius:5px;border:1px solid var(--border2);color:var(--muted)">
d1 = (ln(S/K) + (r - q + σ²/2) × T) / (σ × √T)<br>
d2 = d1 − σ × √T<br>
Call = S × e⁻ᵍᵀ × N(d1) − K × e⁻ʳᵀ × N(d2)<br>
Put  = K × e⁻ʳᵀ × N(-d2) − S × e⁻ᵍᵀ × N(-d1)
</div>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Volatilidad implícita</h3>
<p style="color:var(--muted)">Se calcula por el método de Newton-Raphson: dado el precio de mercado, se busca iterativamente la volatilidad σ que hace que Black-Scholes devuelva ese precio. Converge en general en 5-15 iteraciones.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Griegos</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px">
  <tr style="background:var(--surface2)"><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Griego</th><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Definición</th></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Delta (Δ)</td><td style="padding:6px 10px;color:var(--muted)">∂V/∂S — sensibilidad al precio del subyacente</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Gamma (Γ)</td><td style="padding:6px 10px;color:var(--muted)">∂²V/∂S² — tasa de cambio del delta</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Theta (Θ)</td><td style="padding:6px 10px;color:var(--muted)">∂V/∂t — decaimiento por tiempo (por día)</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Vega (ν)</td><td style="padding:6px 10px;color:var(--muted)">∂V/∂σ — sensibilidad a la volatilidad</td></tr>
  <tr><td style="padding:6px 10px">Rho (ρ)</td><td style="padding:6px 10px;color:var(--muted)">∂V/∂r — sensibilidad a la tasa de interés</td></tr>
</table>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Valor extrínseco (Last VE)</h3>
<div style="font-family:var(--mono);font-size:11px;background:var(--surface2);padding:12px;border-radius:5px;border:1px solid var(--border2);color:var(--muted)">
VE = (Last − MAX(Spot − Strike, 0)) / Spot  [para calls]<br>
VE = (Last − MAX(Strike − Spot, 0)) / Spot  [para puts]
</div>
<p style="color:var(--muted);margin-top:8px">Expresa cuánto de la prima es "puro tiempo y volatilidad", como porcentaje del spot.</p>
`
};

function tutShow(page){
  // Update content
  const content=document.getElementById('tut-content');
  if(content)content.innerHTML=TUT_PAGES[page]||'<p style="color:var(--muted)">Contenido no disponible.</p>';

  // Update sidebar active state
  document.querySelectorAll('.tut-item').forEach(el=>{
    const isActive=el.id==='tut-nav-'+page;
    el.style.color=isActive?'var(--amber)':'var(--muted)';
    el.style.borderLeftColor=isActive?'var(--amber)':'transparent';
    el.style.background=isActive?'rgba(232,184,75,0.07)':'transparent';
  });
}

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

(async function init(){
  selectSource('sheets');
  document.getElementById('spot-input').value=ST.spot;
  document.getElementById('c-r').value=(ST.rate*100).toFixed(1);
  document.getElementById('iv-r').value=(ST.rate*100).toFixed(1);
  document.getElementById('risk-free-rate').value=(ST.rate*100).toFixed(1);

  // Restore saved strategies from localStorage
  if(ctrlLoad()){
    showToast(`${ctrlStrategies.length} estrategia${ctrlStrategies.length>1?'s':''} restaurada${ctrlStrategies.length>1?'s':''} ✓`);
  }

  // Show demo data immediately so the page isn't blank while loading
  generateMockData();populateExpiries();renderChain();syncBSBar();

  // Then try to fetch real Sheets data
  const webAppUrl=document.getElementById('sh-webapp-url').value.trim();
  const sheet=document.getElementById('sh-sheetname').value.trim()||'DMD_Sabro';
  if(!webAppUrl){
    showToast('Sin URL configurada — mostrando datos demo');
    return;
  }
  showToast('Cargando datos de Google Sheets…');
  try{
    const res=await fetch(`${webAppUrl}?sheet=${encodeURIComponent(sheet)}`);
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const data=await res.json();
    if(data.error)throw new Error(data.error);
    const rows=data.values||data;
    if(!Array.isArray(rows)||!rows.length)throw new Error('Sin datos en la hoja');
    parseSheetsRows(rows);
    document.getElementById('data-badge').textContent='live';
    document.getElementById('data-badge').className='badge badge-live';
    document.getElementById('hdr-time').textContent=new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    showToast('Datos cargados desde Google Sheets ✓');
  }catch(e){
    console.warn('Sheets auto-load failed:',e.message,'— usando datos demo');
    showToast('No se pudo conectar a Sheets — usando datos demo');
    generateMockAndRender();
    document.getElementById('data-badge').textContent='demo';
    document.getElementById('data-badge').className='badge badge-demo';
  }
  const histSheet=document.getElementById('sh-sheetname-hist')?.value.trim()||'HMD';
  if(webAppUrl){
    fetch(`${webAppUrl}?sheet=${encodeURIComponent(histSheet)}`)
      .then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();})
      .then(data=>{
        if(data.error)throw new Error(data.error);
        const rows=data.values||data;
        if(Array.isArray(rows)&&rows.length>=2){
          parseHistRows(rows);
          renderHistData();
          const statusEl=document.getElementById('hist-status');
          if(statusEl)statusEl.textContent=`${HIST.rows.length} registros · ${new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}`;
        }
      })
      .catch(e=>console.warn('HMD auto-load failed:',e.message));
  }
})();
