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

