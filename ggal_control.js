/* ===== CONTROL DE ESTRATEGIAS ===== */
// NOTE: parseARSNum was previously defined here but has been moved to ggal_core.js
//       to avoid implicit cross-module dependency with ggal_histdata.js / ggal_promedio.js

const CTRL_STORAGE_KEY='ggal_ctrl_strategies_v1';

function ctrlSave(){
  try{localStorage.setItem(CTRL_STORAGE_KEY,JSON.stringify(ctrlStrategies));}
  catch(e){console.warn('ctrlSave error:',e);}
}

function ctrlLoad(){
  try{
    const raw=localStorage.getItem(CTRL_STORAGE_KEY);
    if(!raw)return false;
    const parsed=JSON.parse(raw);
    if(!Array.isArray(parsed)||!parsed.length)return false;
    ctrlStrategies=parsed;
    return true;
  }catch(e){console.warn('ctrlLoad error:',e);return false;}
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
  return{lotes:1,type:'call',strike:mid,precio:0,precioManual:''};
}

function addCtrlStrategy(){
  const n=ctrlStrategies.length+1;
  ctrlStrategies.push({name:`Estrategia ${n}`,rows:[ctrlDefaultRow(),ctrlDefaultRow()]});
  ctrlSave();renderControl();
}

function removeCtrlStrategy(si){ctrlStrategies.splice(si,1);ctrlSave();renderControl();}
function addCtrlRowToStrategy(si){ctrlStrategies[si].rows.push(ctrlDefaultRow());ctrlSave();renderControl();}
function removeCtrlRow(si,ri){ctrlStrategies[si].rows.splice(ri,1);ctrlSave();renderControl();}

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
    return`${lotes}\t${strike}\t${precio}`;
  }).join('\n');
  const fallback=()=>{
    const ta=document.createElement('textarea');
    ta.value=tsv; ta.style.cssText='position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
  };
  navigator.clipboard.writeText(tsv).then(
    ()=>showToast(`Estrategia "${ctrlStrategies[si].name}" copiada al portapapeles`),
    ()=>{fallback();showToast(`Estrategia "${ctrlStrategies[si].name}" copiada al portapapeles`);}
  );
}

function ctrlViewInSimulator(si){
  const strategy=ctrlStrategies[si];
  if(!strategy){showToast('No se encontro la estrategia seleccionada');return;}
  if(typeof simLoadControlStrategy!=='function'){
    showToast('El Simulador no esta disponible');
    return;
  }
  simLoadControlStrategy(strategy,{openTab:true,selectValue:`control:${si}`,name:strategy.name});
}

function ctrlPopulateExpiry(){
  // Expiry driven by ST.selExpiry (set from chain tab)
}

function ctrlGetLast(strike,type){
  const exp=ST.selExpiry;
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
  const strikeOpts=strikes.map(s=>
    `<option value="${s}"${Math.round(s*100)===Math.round(row.strike*100)?' selected':''}>${fmtStrike(s)}</option>`
  ).join('');

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
  return{tr,costoArmado,desarmado};
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

function handleCtrlPaste(e,si){
  e.preventDefault();
  const raw=e.clipboardData.getData('text');
  if(!raw.trim())return;
  const allStrikes=getAvailableStrikes();
  const closest=strikeRaw=>allStrikes.length
    ?allStrikes.reduce((p,c)=>Math.abs(c-strikeRaw)<Math.abs(p-strikeRaw)?c:p,allStrikes[0])
    :strikeRaw;

  const parsed=raw.trim().split(/\r?\n/).filter(l=>l.trim()).map(line=>{
    const cols=line.split('\t').map(c=>c.trim());
    const lotes=parseARSNum(cols[0]);
    const strikeRaw=parseARSNum(cols[1]);
    const precio=parseARSNum(cols[2]);
    if(isNaN(lotes)||isNaN(strikeRaw))return null;
    return{lotes, strike:closest(strikeRaw), precio:isNaN(precio)?0:precio, type:'call', precioManual:''};
  }).filter(Boolean);

  if(!parsed.length){showToast('No se reconocieron datos en el formato esperado');return;}
  ctrlStrategies[si].rows=parsed;
  ctrlSave();
  const ta=document.getElementById('ctrl-paste-'+si);
  if(ta)ta.value='';
  renderControl();
  showToast(`${parsed.length} pata${parsed.length>1?'s':''} cargada${parsed.length>1?'s':''} en Estrategia ${si+1}`);
}

function renderControl(){
  ctrlPopulateExpiry();
  const com=siteComision(), iva=siteIva();
  const strikes=getAvailableStrikes();
  const container=document.getElementById('ctrl-strategies-container');
  if(!container)return;
  container.innerHTML='';

  if(!ctrlStrategies.length){
    container.innerHTML='<div style="padding:32px;text-align:center;color:var(--muted);font-size:12px">Presioná <b>+ Agregar estrategia</b> para comenzar</div>';
    return;
  }

  ctrlStrategies.forEach((strat,si)=>{
    let totalArmado=0, totalDesarmado=0;

    const wrap=document.createElement('div');
    wrap.style.cssText='margin-bottom:14px;border:1px solid var(--border);border-radius:8px;overflow:hidden';

    const hdr=document.createElement('div');
    hdr.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--surface2);border-bottom:1px solid var(--border);flex-wrap:wrap;gap:6px';
    hdr.innerHTML=`
      <div style="display:flex;align-items:center;gap:8px;min-width:240px">
        <input type="text" value="${strat.name}"
          style="font-family:var(--sans);font-size:12px;font-weight:500;color:var(--text);background:transparent;border:none;border-bottom:1px solid transparent;padding:1px 2px;width:220px;outline:none"
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
        <button onclick="ctrlViewInSimulator(${si})" style="padding:3px 10px;font-size:11px;background:var(--surface);border:1px solid var(--border);color:var(--amber);border-radius:4px;cursor:pointer" title="Cargar esta estrategia en el Simulador">Ver en Simulador</button>
        <button onclick="addCtrlRowToStrategy(${si})" style="padding:3px 10px;font-size:11px;background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:4px;cursor:pointer">+ Agregar pata</button>
        <button onclick="removeCtrlStrategy(${si})" style="padding:3px 8px;font-size:11px;background:var(--red-bg);border:1px solid var(--red);color:var(--red);border-radius:4px;cursor:pointer">✕ Eliminar</button>
      </div>`;
    wrap.appendChild(hdr);

    const tableWrap=document.createElement('div');
    tableWrap.style.overflowX='auto';
    const table=document.createElement('table');
    table.style.cssText='width:100%;border-collapse:collapse;font-family:var(--mono);font-size:12px';

    const thead=document.createElement('thead');
    thead.innerHTML=`<tr>${CTRL_TH}</tr>`;
    table.appendChild(thead);

    const tbody=document.createElement('tbody');
    strat.rows.forEach((row,ri)=>{
      const{tr,costoArmado,desarmado}=ctrlBuildRow(si,ri,row,strikes,com,iva);
      totalArmado+=costoArmado;
      totalDesarmado+=desarmado;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

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
            ${strat.rows.length?(resultado>=0?'+':'')+fmtN(resultado):'--'}
          </span>
        </td>
      </tr>`;
    table.appendChild(tfoot);
    tableWrap.appendChild(table);
    wrap.appendChild(tableWrap);
    container.appendChild(wrap);
  });
}

// ── Polynomial fit (degree 2 or 3) via weighted least-squares ──
// Returns coefficients [c0..cn] for y = c0*x^n + ... + cn  (highest power first)
// Weight: Gaussian kernel centered at mid-range, σ = range/3
function ivFitPoly(points, degree){
  const n=degree+1;
  if(points.length<n)return null;
  const xs=points.map(p=>p.x), ys=points.map(p=>p.y);
  const xMid=(Math.min(...xs)+Math.max(...xs))/2;
  const sigma=(Math.max(...xs)-Math.min(...xs))/3||1;
  const w=xs.map(x=>Math.exp(-0.5*((x-xMid)/sigma)**2));

  // Build (n×n) normal equations  A·c = b
  const A=Array.from({length:n},()=>new Array(n).fill(0));
  const bv=new Array(n).fill(0);
  for(let i=0;i<n;i++){
    for(let j=0;j<n;j++){
      A[i][j]=xs.reduce((s,x,k)=>s+w[k]*Math.pow(x,i+j),0);
    }
    bv[i]=xs.reduce((s,x,k)=>s+w[k]*Math.pow(x,i)*ys[k],0);
  }
  // Gaussian elimination with partial pivoting
  for(let col=0;col<n;col++){
    let maxR=col;
    for(let r=col+1;r<n;r++)if(Math.abs(A[r][col])>Math.abs(A[maxR][col]))maxR=r;
    [A[col],A[maxR]]=[A[maxR],A[col]];[bv[col],bv[maxR]]=[bv[maxR],bv[col]];
    if(Math.abs(A[col][col])<1e-14)return null;
    for(let r=col+1;r<n;r++){
      const f=A[r][col]/A[col][col];
      for(let k=col;k<n;k++)A[r][k]-=f*A[col][k];
      bv[r]-=f*bv[col];
    }
  }
  const res=new Array(n).fill(0);
  for(let r=n-1;r>=0;r--){
    res[r]=bv[r];
    for(let k=r+1;k<n;k++)res[r]-=A[r][k]*res[k];
    res[r]/=A[r][r];
  }
  // res[i] = coeff of x^i  →  return highest power first for clarity
  return res; // res[0]=const, res[1]=x, res[2]=x², res[3]=x³
}

function evalPoly(coefs, x){
  return coefs.reduce((s,c,i)=>s+c*Math.pow(x,i),0);
}

// ── SVI (Stochastic Volatility Inspired) calibration ──
// Model: w(k) = a + b*(ρ*(k-m) + sqrt((k-m)²+σ²))   where w=IV², k=ln(K/F)
// Returns {a,b,rho,m,sigma} or null if calibration fails
// Uses coordinate-descent + random restarts
function ivFitSVI(points, F){
  // Filter zeros and apply Huber-robust fitting to ignore deep-ITM spikes
  const pts=points.filter(p=>p.y>5);
  if(pts.length<5)return null;

  const ks=pts.map(p=>Math.log(p.x/F));
  const ws=pts.map(p=>(p.y/100)**2);

  const kMin=Math.min(...ks), kMax=Math.max(...ks), kRange=Math.max(kMax-kMin,0.05);
  const wMin=Math.min(...ws), wMax=Math.max(...ws);
  const iMin=ws.indexOf(wMin);
  const kAtMin=ks[iMin];

  const svi=(k,a,b,rho,m,sig)=>a+b*(rho*(k-m)+Math.sqrt((k-m)**2+sig*sig));

  // Huber loss — robust against deep-ITM spikes (delta ≈ 15pp IV in variance units)
  const dHub=((Math.sqrt(wMin)+0.15)**2-wMin);
  const huber=r=>Math.abs(r)<dHub?r*r*0.5:dHub*(Math.abs(r)-dHub*0.5);

  const loss=(a,b,rho,m,sig)=>{
    if(a<-1e-6||b<=0||Math.abs(rho)>=0.999||sig<=1e-4)return 1e10;
    if(a+b*sig*Math.sqrt(1-rho*rho)<-1e-6)return 1e10;
    if(sig>kRange*1.2)return 1e10;  // prevent linearization
    return ks.reduce((s,k,i)=>s+huber(svi(k,a,b,rho,m,sig)-ws[i]),0);
  };

  function clamp(v){
    v[2]=Math.max(-0.99,Math.min(0.99,v[2]));
    v[4]=Math.max(1e-4,Math.min(kRange*1.1,v[4]));
    return v;
  }

  function nelderMead(p0,maxIter=1500){
    const N=p0.length;
    let simplex=[p0.slice()];
    for(let i=0;i<N;i++){
      const v=p0.slice(); v[i]*=(i%2===0?1.25:0.80);
      simplex.push(clamp(v));
    }
    const f=v=>loss(...v);
    for(let iter=0;iter<maxIter;iter++){
      simplex.sort((a,b2)=>f(a)-f(b2));
      if(f(simplex[0])<1e-10)break;
      const cen=new Array(N).fill(0);
      for(let i=0;i<N;i++)for(let j=0;j<N;j++)cen[j]+=simplex[i][j]/N;
      const worst=simplex[N];
      const ref=clamp(cen.map((c,j)=>2*c-worst[j]));
      if(f(ref)<f(simplex[0])){
        const exp=clamp(cen.map((c,j)=>3*c-2*worst[j]));
        simplex[N]=f(exp)<f(ref)?exp:ref;
      } else if(f(ref)<f(simplex[N-1])){
        simplex[N]=ref;
      } else {
        const con=clamp(cen.map((c,j)=>0.5*(c+worst[j])));
        if(f(con)<f(worst)){
          simplex[N]=con;
        } else {
          for(let i=1;i<=N;i++)
            simplex[i]=clamp(simplex[i].map((v,j)=>0.5*(simplex[0][j]+v)));
        }
      }
    }
    simplex.sort((a,b2)=>f(a)-f(b2));
    return simplex[0];
  }

  // Data-driven inits: sigma always small (0.08–0.22 × kRange) to keep curvature
  const aG=wMin*0.85, bG=(wMax-wMin)/kRange*0.35;
  const s1=kRange*0.08, s2=kRange*0.15, s3=kRange*0.22;
  const inits=[
    [aG,   bG,    -0.3, kAtMin, s2],
    [aG,   bG,    -0.1, kAtMin, s1],
    [aG,   bG*1.4,-0.5, kAtMin, s2],
    [aG,   bG,     0.2, kAtMin, s3],
    [aG,   bG*0.6, 0.0, 0.0,   s1],
    [wMin*0.7,bG,  -0.4, kAtMin, s2],
  ];

  let best=null, bestLoss=1e12;
  for(const p0 of inits){
    try{
      const res=nelderMead(clamp(p0.slice()));
      const l=loss(...res);
      if(l<bestLoss&&res[1]>0&&Math.abs(res[2])<1&&res[4]>0){bestLoss=l;best=res;}
    }catch(e){}
  }
  if(!best)return null;
  const [a,b,rho,m,sig]=best;
  return{a,b,rho,m,sig,eval:(k)=>a+b*(rho*(k-m)+Math.sqrt((k-m)**2+sig*sig))};
}


// Weighted least-squares quadratic fit: returns [a,b,c] for y = a*x² + b*x + c
// Points near ATM get higher weight (Gaussian kernel, σ = range/3)
function ivFitQuad(points){
  const coefs=ivFitPoly(points,2);
  return coefs;  // [const, x, x²]
}


function renderIVSmile(){
  if(!ST.expirations.length)return;
  const S=ST.spot;
  const callColors=['#e8b84b','#5aabff','#44c76a'];
  const putColors= ['#f06060','#b088f0','#60c0a0'];
  const fitColors= ['#ff6b6b','#ff9f43','#ff4ddc'];

  const datasets=[];
  const allPointsForGlobalFit=[];  // combined calls+puts across all expirations

  ST.expirations.forEach((exp,i)=>{
    const rows=ST.chain[exp]||[];
    const T=rows[0]?.T||(30/365);

    const callPts=rows.filter(r=>r.callMid>0).map(r=>({x:r.strike,y:parseFloat((r.iv*100).toFixed(2))}));
    const putPts=rows.filter(r=>r.putMid>0).map(r=>{
      const iv=impliedVol(S,r.strike,T,ST.rate,ST.q,r.putMid,'put')||null;
      return iv?{x:r.strike,y:parseFloat((iv*100).toFixed(2))}:null;
    }).filter(Boolean);

    allPointsForGlobalFit.push(...callPts,...putPts);

    datasets.push({
      label:`${fmtExpiry(exp)} Call`,
      data:callPts,
      borderColor:callColors[i%3],borderWidth:2,pointRadius:3,fill:false,tension:0.3,
    });
    datasets.push({
      label:`${fmtExpiry(exp)} Put`,
      data:putPts,
      borderColor:putColors[i%3],borderWidth:2,pointRadius:3,fill:false,tension:0.3,borderDash:[4,3],
    });
  });

  // ── Polynomial fits (grado 2 and 3) ──
  // Exclude points with IV≤5% (options with no valid last price)
  const validPoints=allPointsForGlobalFit.filter(p=>p.y>5);
  const allStrikes=[...new Set(ST.expirations.flatMap(exp=>(ST.chain[exp]||[]).map(r=>r.strike)))].sort((a,b)=>a-b);
  const xMin=Math.min(...allStrikes), xMax=Math.max(...allStrikes);
  const steps=100;

  if(validPoints.length>=3){
    // Grado 2 (parábola)
    const c2=ivFitPoly(validPoints,2);
    if(c2){
      const fitData=Array.from({length:steps+1},(_,i)=>{
        const x=xMin+(xMax-xMin)*i/steps;
        const y=evalPoly(c2,x);
        return y>0?{x:parseFloat(x.toFixed(0)),y:parseFloat(y.toFixed(2))}:null;
      }).filter(Boolean);
      datasets.push({
        label:'Fit grado 2',
        data:fitData,
        borderColor:'#ff6b6b',borderWidth:2,pointRadius:0,fill:false,
        tension:0,borderDash:[6,4],
      });
    }
    // Grado 3 (cúbica — captura skew asimétrico)
    if(validPoints.length>=4){
      const c3=ivFitPoly(validPoints,3);
      if(c3){
        const fitData=Array.from({length:steps+1},(_,i)=>{
          const x=xMin+(xMax-xMin)*i/steps;
          const y=evalPoly(c3,x);
          return y>0?{x:parseFloat(x.toFixed(0)),y:parseFloat(y.toFixed(2))}:null;
        }).filter(Boolean);
        datasets.push({
          label:'Fit grado 3 (skew)',
          data:fitData,
          borderColor:'#44c76a',borderWidth:2,pointRadius:0,fill:false,
          tension:0,borderDash:[3,3],
        });
      }
    }
  }

  // ── SVI fit ──
  if(validPoints.length>=5){
    // Forward price ≈ spot (simplified; for precise use F = S*e^(r-q)*T)
    const F=S;
    const sviParams=ivFitSVI(validPoints,F);
    if(sviParams){
      const fitData=Array.from({length:steps+1},(_,i)=>{
        const x=xMin+(xMax-xMin)*i/steps;
        const k=Math.log(x/F);
        const w=sviParams.eval(k);
        if(w<=0)return null;
        const iv=Math.sqrt(w)*100;   // variance → IV%
        return iv>0&&iv<300?{x:parseFloat(x.toFixed(0)),y:parseFloat(iv.toFixed(2))}:null;
      }).filter(Boolean);
      if(fitData.length>5){
        datasets.push({
          label:'Fit SVI',
          data:fitData,
          borderColor:'#b088f0',borderWidth:2.5,pointRadius:0,fill:false,
          tension:0,borderDash:[],
        });
      }
    }
  }

  if(ST.charts.iv)ST.charts.iv.destroy();
  const ctx=document.getElementById('iv-chart')?.getContext('2d');
  if(!ctx)return;

  const abbrStrike=v=>v>=10000?Math.floor(v).toString().slice(0,3):Math.floor(v).toString().slice(0,2);

  ST.charts.iv=new Chart(ctx,{
    type:'line',
    data:{datasets},
    options:{
      responsive:true,maintainAspectRatio:false,animation:false,
      plugins:{
        legend:{display:true,labels:{color:'#7a8fa6',font:{size:11},boxWidth:10,padding:14}},
        tooltip:{backgroundColor:'#131920',borderColor:'#2a3444',borderWidth:1,titleColor:'#7a8fa6',bodyColor:'#d8e3ef',
          callbacks:{label:c=>` IV: ${c.raw.y}%`,title:c=>`Strike: ${fmtStrike(c[0].raw.x)}`}}
      },
      scales:{
        x:{type:'linear',
          ticks:{color:'#7a8fa6',font:{size:10},
            callback:v=>{const m=allStrikes.find(s=>Math.abs(s-v)<0.1);return m!=null?abbrStrike(m):null;},
            maxTicksLimit:allStrikes.length,autoSkip:false},
          afterBuildTicks:axis=>{axis.ticks=allStrikes.map(s=>({value:s}));},
          grid:{color:'#1a2230'},
          title:{display:true,text:'Strike',color:'#7a8fa6',font:{size:10}}
        },
        y:{ticks:{color:'#7a8fa6',font:{size:10},callback:v=>v+'%'},grid:{color:'#1a2230'},
          title:{display:true,text:'Volatilidad implícita (%)',color:'#7a8fa6',font:{size:10}}
        }
      }
    }
  });
}

