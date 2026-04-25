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
  // Hybrid solver: Newton-Raphson with bisection fallback (more stable for deep ITM/OTM).
  const tol=0.01;         // price tolerance (same units as mktPrice)
  const maxIter=200;
  const lo0=0.001, hi0=5.0;

  const priceAt=(sig)=>bs(S,K,T,r,q,sig,type).price;
  let lo=lo0, hi=hi0;
  let plo=priceAt(lo)-mktPrice;
  let phi=priceAt(hi)-mktPrice;

  // Ensure we have a bracket; if not, widen hi a bit (up to 10) and try again.
  if(plo*phi>0){
    let hiTry=hi;
    for(let j=0;j<6&&plo*phi>0;j++){
      hiTry*=1.5;
      if(hiTry>10)break;
      hi=hiTry;
      phi=priceAt(hi)-mktPrice;
    }
  }

  let sig=0.50;
  // If bracket exists, start from midpoint.
  if(plo*phi<=0) sig=(lo+hi)/2;

  for(let i=0;i<maxIter;i++){
    const res=bs(S,K,T,r,q,sig,type);
    const diff=res.price-mktPrice;
    if(Math.abs(diff)<tol)return sig;

    // Update bracket if we have one.
    if(plo*phi<=0){
      if(diff>0){ hi=sig; phi=diff; }
      else{ lo=sig; plo=diff; }
    }

    const v=res.vega*100; // dPrice/dSigma (sigma in 1.0 units)
    let next=sig;
    if(Math.abs(v)>1e-10){
      next=sig-diff/v;
    }else if(plo*phi<=0){
      // Vega too small, fall back to bisection
      next=(lo+hi)/2;
    }

    // If Newton jumps outside bracket, clamp to midpoint.
    if(plo*phi<=0 && (next<=lo || next>=hi)) next=(lo+hi)/2;
    sig=Math.min(Math.max(next,lo0),hi);
  }

  // If we had a bracket, return the midpoint as best estimate.
  if(plo*phi<=0) return (lo+hi)/2;
  return sig;
}

/* ===== STATE ===== */
const ST={
  spot:8200,rate:0.30,q:0,
  expirations:[],chain:{},
  selExpiry:null,
  futures:{},
  legs:[],
  charts:{pnl:null,sens:null,iv:null,ivSens:null}
};

/* ===== MOCK DATA ===== */
function generateMockData(){
  const S=ST.spot,r=ST.rate,q=ST.q;
  const today=new Date();
  // Mock de futuro (para el modulo Sinteticas)
  ST.futures=ST.futures||{};
  ST.futures['GGAL/ABR26']={last:Math.max(1, S*(0.95+Math.random()*0.05)), chg:null};
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
  const atmVolEl=document.getElementById('hdr-atm-vol');
  if(atmVolEl)atmVolEl.textContent=(atmRow.iv*100).toFixed(1)+'%';
  if(typeof setHdrTime==='function')setHdrTime();
  else document.getElementById('hdr-time').textContent=new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
}

function populateExpiries(){
  const sel=document.getElementById('expiry-sel');
  if(!sel||!Array.isArray(ST.expirations)||!ST.expirations.length)return;

  // Pick nearest future expiry (avoid leaving the UI on an expired OPEX like 2026-04-17).
  const now=Date.now();
  let best=ST.expirations[ST.expirations.length-1];
  let bestDays=Infinity;
  ST.expirations.forEach(e=>{
    const d=new Date(e+'T12:00:00');
    if(!isFinite(d.getTime()))return;
    const days=Math.round((d.getTime()-now)/86400000);
    if(days>=1&&days<bestDays){bestDays=days;best=e;}
  });
  ST.selExpiry=best;

  sel.innerHTML='';
  ST.expirations.forEach(e=>{
    const o=document.createElement('option');
    o.value=e;o.textContent=fmtExpiry(e);sel.appendChild(o);
  });
  sel.value=best;
}
