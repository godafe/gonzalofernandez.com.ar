/* ===== CHART HELPERS ===== */
// Shared Chart.js base options (dark theme)
const CHART_COLORS={bg:'#131920',border:'#2a3444',title:'#7a8fa6',body:'#d8e3ef'};

function chartScales(xCb,yCb,xSize=10){
  return{
    x:{ticks:{color:'#7a8fa6',font:{size:xSize},callback:xCb,maxTicksLimit:6},grid:{color:'#1a2230'}},
    y:{ticks:{color:'#7a8fa6',font:{size:xSize},callback:yCb},grid:{color:'#1a2230'}}
  };
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

  const lo=S*0.65, hi=S*1.35;
  const sp=Array.from({length:60},(_,i)=>lo+(hi-lo)*i/59);
  const pr=sp.map(s=>bs(s,K,T,r,q,vol,type).price);
  const intr=sp.map(s=>type==='call'?Math.max(s-K,0):Math.max(K-s,0));

  if(ST.charts.sens)ST.charts.sens.destroy();
  const ctx=document.getElementById('sens-chart')?.getContext('2d');
  if(!ctx)return;
  ST.charts.sens=new Chart(ctx,{
    type:'line',
    data:{
      labels:sp.map(s=>s.toFixed(0)),
      datasets:[
        {label:'Prima BS',   data:pr,   borderColor:'#e8b84b',borderWidth:2,pointRadius:0,fill:false},
        {label:'Val. intríns.',data:intr,borderColor:'#3d4f63',borderWidth:1,borderDash:[4,4],pointRadius:0,fill:false}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,animation:false,
      plugins:{
        legend:{display:true,labels:{color:'#7a8fa6',font:{size:10},boxWidth:10,padding:12}},
        tooltip:{backgroundColor:CHART_COLORS.bg,borderColor:CHART_COLORS.border,borderWidth:1,
          titleColor:CHART_COLORS.title,bodyColor:CHART_COLORS.body,
          callbacks:{label:c=>` ${c.dataset.label}: $${c.raw.toFixed(2)}`}}
      },
      scales:chartScales(
        (v,i)=>'$'+(sp[i]/1000).toFixed(1)+'k',
        v=>'$'+v.toFixed(0)
      )
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

  const reset=()=>{resVal.textContent='--';gauge.style.width='0%';};

  if(!S||!K||!Td||!mkt){reset();resStatus.textContent='Completá todos los campos';clearIVGreeks();return;}
  const T=Td/365;
  const intrinsic=type==='call'?Math.max(S-K,0):Math.max(K-S,0);

  if(mkt<intrinsic-0.01){
    reset();
    resStatus.textContent='⚠ La prima es menor al valor intrínseco ('+fmtN(intrinsic)+')';
    clearIVGreeks();clearIVTable();return;
  }

  const iv=impliedVol(S,K,T,r,q,mkt,type);
  if(!iv||iv<0.001){
    reset();resStatus.textContent='No convergió — verificá los datos';
    clearIVGreeks();clearIVTable();return;
  }

  const ivPct=iv*100;
  const lvl=ivPct<30?'Baja':ivPct<60?'Normal':ivPct<100?'Elevada':ivPct<150?'Alta':'Muy alta';
  const lvlColor=ivPct<30?'var(--blue)':ivPct<60?'var(--green)':ivPct<100?'var(--amber)':'var(--red)';

  resVal.textContent=ivPct.toFixed(2);
  resVal.style.color=lvlColor;
  resStatus.textContent=`${lvl} — converge en Newton-Raphson`;
  resStatus.style.color=lvlColor;
  gauge.style.background=lvlColor;
  gauge.style.width=Math.min(ivPct/200*100,100)+'%';

  const g=bs(S,K,T,r,q,iv,type);
  const dEl=document.getElementById('iv-g-delta');
  dEl.textContent=g.delta.toFixed(4);
  dEl.style.color=g.delta>0?'var(--green)':'var(--red)';
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
  ['iv-g-delta','iv-g-gamma','iv-g-theta','iv-g-vega','iv-g-rho','iv-g-intr']
    .forEach(id=>{document.getElementById(id).textContent='--';});
  clearIVTable();
}

function clearIVTable(){
  document.getElementById('iv-sens-body').innerHTML='';
  if(ST.charts.ivSens){ST.charts.ivSens.destroy();ST.charts.ivSens=null;}
}

function buildIVSensTable(S,K,T,r,q,type,mktCenter,ivCenter){
  const steps=9;
  const lo=mktCenter*0.5, hi=mktCenter*1.5;
  const half=(hi-lo)/(steps*2);
  const rows=Array.from({length:steps},(_,i)=>{
    const p=lo+(hi-lo)*i/(steps-1);
    const iv=impliedVol(S,K,T,r,q,p,type);
    if(!iv)return null;
    const g=bs(S,K,T,r,q,iv,type);
    return{p,iv:iv*100,delta:g.delta,theta:g.theta,vega:g.vega,bsPrice:g.price,diff:g.price-p};
  }).filter(Boolean);

  const tb=document.getElementById('iv-sens-body');
  tb.innerHTML=rows.map(row=>{
    const cur=Math.abs(row.p-mktCenter)<half;
    const dif=row.diff;
    return`<tr${cur?' class="selected"':''}>
      <td style="font-weight:${cur?'500':'400'};color:${cur?'var(--amber)':'var(--text)'}">$${fmtN(row.p)}</td>
      <td class="amber" style="font-weight:${cur?'500':'400'}">${row.iv.toFixed(2)}%</td>
      <td style="color:${row.delta>0?'var(--green)':'var(--red)'}">${row.delta.toFixed(4)}</td>
      <td class="neg">${row.theta.toFixed(2)}</td>
      <td>${row.vega.toFixed(4)}</td>
      <td>$${fmtN(row.bsPrice)}</td>
      <td style="color:${Math.abs(dif)<1?'var(--muted)':dif>0?'var(--green)':'var(--red)'}">${dif>=0?'+':''}${fmtN(dif)}</td>
    </tr>`;
  }).join('');

  if(ST.charts.ivSens)ST.charts.ivSens.destroy();
  const ctx=document.getElementById('iv-sens-chart')?.getContext('2d');
  if(!ctx)return;
  ST.charts.ivSens=new Chart(ctx,{
    type:'line',
    data:{
      labels:rows.map(r=>'$'+r.p.toFixed(0)),
      datasets:[{
        label:'IV implícita (%)',
        data:rows.map(r=>parseFloat(r.iv.toFixed(2))),
        borderColor:'#e8b84b',borderWidth:2,pointRadius:3,
        pointBackgroundColor:rows.map(r=>Math.abs(r.p-mktCenter)<half?'#e8b84b':'transparent'),
        fill:false
      }]
    },
    options:{
      responsive:true,maintainAspectRatio:false,animation:false,
      plugins:{
        legend:{display:false},
        tooltip:{backgroundColor:CHART_COLORS.bg,borderColor:CHART_COLORS.border,borderWidth:1,
          titleColor:CHART_COLORS.title,bodyColor:CHART_COLORS.body,
          callbacks:{label:c=>` IV: ${c.raw}%`}}
      },
      scales:chartScales(undefined,v=>v+'%')
    }
  });
}
