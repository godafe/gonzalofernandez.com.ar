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

