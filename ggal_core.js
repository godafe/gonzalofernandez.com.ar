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
  const wrap=document.getElementById('api-config-wrap');
  if(wrap)wrap.style.display='none';
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
  const hdrRateEl=document.getElementById('hdr-rate');
  if(hdrRateEl)hdrRateEl.textContent=(ST.rate*100).toFixed(1)+'%';
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
    const sheetName=document.getElementById('sh-sheetname')?.value.trim()||'';
    const badgeEl=document.getElementById('data-badge');
    if(badgeEl){
      if(sheetName==='DMD_Bot'){badgeEl.textContent='LIVE BOT';badgeEl.className='badge badge-live';}
      else if(sheetName==='DMD_Mock'){badgeEl.textContent='DEMO';badgeEl.className='badge badge-demo';}
      else{badgeEl.textContent='LIVE SHEET';badgeEl.className='badge badge-live';}
    }
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
    chg:    colLetterToIndex(document.getElementById('sh-col-chg')?.value||'G'),
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

  let spot=null, spotChg=null;
  const opts=[];
  let skipped=0;

  dataRows.forEach(cols=>{
    if(!cols||!cols.length)return;
    const rawStrike=(cols[ci.strike]||'').toString().trim();
    const rawType=(cols[ci.type]||'').toString().trim().toUpperCase();

    // ── Fila del subyacente (TYPE="SUBY") ──
    // Solo tomamos el precio como spot si el strike dice "GGAL" (o está vacío).
    // Filas SUBY de otros subyacentes (PAMP, etc.) se descartan sin modificar el spot.
    if(rawType==='SUBY'){
      const isGGAL=rawStrike.toUpperCase()==='GGAL'||rawStrike==='';
      if(isGGAL){
        const s=parseARS(cols[ci.last]);
        if(!isNaN(s)&&s>0){
          spot=s;
          console.log('Spot detectado de fila SUBY/GGAL:', spot);
        }
        const c=parseARS(cols[ci.chg]);
        if(!isNaN(c))spotChg=c;
      }
      return;
    }
    if(rawStrike.toUpperCase()==='GGAL'){
      const s=parseARS(cols[ci.last]);
      if(!isNaN(s)&&s>0){spot=s;console.log('Spot detectado de fila GGAL:', spot);}
      const c=parseARS(cols[ci.chg]);
      if(!isNaN(c))spotChg=c;
      return;
    }

    const K=parseARS(rawStrike);
    const exp=normalizeExpiry((cols[ci.expiry]||'').toString().trim());
    const tp=rawType.toLowerCase();
    const bid=parseARS(cols[ci.bid]);
    const ask=parseARS(cols[ci.ask]);
    const last=parseARS(cols[ci.last]);
    const lastve=parseARS(cols[ci.lastve]); // valor extrínseco % del spot
    const chg=parseARS(cols[ci.chg]);       // variación del día

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
      chg:isNaN(chg)?null:chg,
    });
  });

  console.log(`Sheets parseado: spot=${spot}, opciones=${opts.length}, salteadas=${skipped}`);

  if(!opts.length){
    showToast(`Sin opciones válidas. ${skipped} filas salteadas — revisá columnas.`);
    return;
  }
  if(spot&&spot>0){
    ST.spot=spot;
    document.getElementById('spot-display').textContent='$ '+spot.toLocaleString('es-AR');
    document.getElementById('spot-input').value=spot;
  }
  if(spotChg!=null){
    const pctEl=document.getElementById('pct-display');
    if(pctEl){
      pctEl.textContent=(spotChg>=0?'+':'')+spotChg.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
      pctEl.className='pct-change '+(spotChg>=0?'pos':'neg');
    }
  }
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
    byExp[e].push({strike:parseFloat(o[kf]),type:o[tf],bid,ask,mid,lastve:o.lastve??null,chg:o.chg??null});
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
        callBid:c.bid||0,callAsk:c.ask||0,callMid:c.mid||0,callLastVE:c.lastve??null,callChg:c.chg??null,
        putBid:p.bid||0,putAsk:p.ask||0,putMid:p.mid||0,putLastVE:p.lastve??null,putChg:p.chg??null,
        callOI:0,putOI:0};
    });
  });
  populateExpiries();renderChain();renderIVSmile();syncBSBar();ctrlPopulateExpiry();renderControl();
}

function applyConfig(){
  // Read from site config globals, hidden fields kept in sync by siteConfigChanged()
  ST.rate=siteRate()/100;
  ST.q=siteDivYield()/100;
  // Keep hidden compat fields in sync
  const rEl=document.getElementById('risk-free-rate');
  const dEl=document.getElementById('div-yield');
  if(rEl)rEl.value=siteRate();
  if(dEl)dEl.value=siteDivYield();
  const hdrRate=document.getElementById('hdr-rate');
  if(hdrRate)hdrRate.textContent=(ST.rate*100).toFixed(1)+'%';
  const ivR=document.getElementById('iv-r');
  if(ivR)ivR.value=(ST.rate*100).toFixed(1);
  const cR=document.getElementById('c-r');
  if(cR)cR.value=(ST.rate*100).toFixed(1);
  syncBSBar();
}

/* ===== HELPERS ===== */

/* ===== SITE CONFIG ===== */
function siteComision(){ return parseFloat(document.getElementById('site-comision')?.value||'0.500')||0.500; }
function siteIva(){      return parseFloat(document.getElementById('site-iva')?.value||'1.21')||1.21; }
function siteRate(){     return parseFloat(document.getElementById('site-rate')?.value||'30')||30; }
function siteDivYield(){ return parseFloat(document.getElementById('site-dividends')?.value||'0')||0; }

function siteConfigChanged(){
  // Sync risk-free-rate and div-yield hidden fields that the BS engine reads
  const rEl=document.getElementById('risk-free-rate');
  const dEl=document.getElementById('div-yield');
  if(rEl)rEl.value=siteRate();
  if(dEl)dEl.value=siteDivYield();
  applyConfig();
  cfgSave();
}


const CFG_KEY = 'ggal_config_v1';

// Fields to persist — grouped by module
const CFG_FIELDS = [
  // Site config
  'site-comision','site-iva','site-rate','site-dividends',
  // API / Config
  'sh-webapp-url','sh-sheetname','sh-header-row',
  'sh-col-strike','sh-col-expiry','sh-col-type','sh-col-bid','sh-col-ask','sh-col-last','sh-col-lastve','sh-col-chg',
  'sh-sheetname-hist','sh-header-row-hist',
  'hist-col-date','hist-col-type','hist-col-strike','hist-col-last',
  'auto-refresh-chk','auto-refresh-interval',
  // Chain
  'spot-input','expiry-sel','chain-filter',
  // Hist data
  'hist-strike1','hist-strike2','hist-type1','hist-type2',
  'hist-rate','hist-expiry','hist-ri',
  // Mariposa
  'mar-wings','mar-threshold',
  // Ratios
  'rat-expiry','rat-thresh-lo','rat-thresh-hi','rat-thresh-iv','rat-thresh-parity',
  'rat-hm-type','rat-only-opps','rat-base',
  // Análisis histórico
  'ah-strike1','ah-strike2','ah-type1','ah-type2',
  'ah-rate','ah-expiry','ah-ri',
];

function cfgSave(){
  try{
    const cfg={};
    CFG_FIELDS.forEach(id=>{
      const el=document.getElementById(id);
      if(!el)return;
      if(el.type==='checkbox')cfg[id]=el.checked;
      else cfg[id]=el.value;
    });
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  }catch(e){console.warn('cfgSave:',e);}
}

function cfgLoad(){
  try{
    const raw=localStorage.getItem(CFG_KEY);
    if(!raw)return;
    const cfg=JSON.parse(raw);
    CFG_FIELDS.forEach(id=>{
      if(!(id in cfg))return;
      const el=document.getElementById(id);
      if(!el)return;
      if(el.type==='checkbox')el.checked=cfg[id];
      else el.value=cfg[id];
    });
    // Re-sync type buttons that have a hidden input partner
    ['hist-type1','hist-type2','ah-type1','ah-type2','rat-hm-type'].forEach(id=>{
      const hidden=document.getElementById(id);
      const btn=document.getElementById(id+'-btn');
      if(!hidden||!btn)return;
      const isCall=hidden.value==='call';
      btn.textContent=isCall?'Call':'Put';
      btn.style.color=isCall?'var(--green)':'var(--red)';
      btn.style.borderColor=isCall?'var(--green)':'var(--red)';
    });
  }catch(e){console.warn('cfgLoad:',e);}
}

// Auto-save on any input change inside the page
function cfgBindAutoSave(){
  CFG_FIELDS.forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    const evt=el.type==='checkbox'?'change':'input';
    el.addEventListener(evt,()=>cfgSave(),{passive:true});
    // Also on change for selects
    if(el.tagName==='SELECT')el.addEventListener('change',()=>cfgSave(),{passive:true});
  });
}


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
function toggleEl(id){const e=document.getElementById(id);if(e)e.style.display=e.style.display==='none'?'block':'none';}
function getAvailableStrikes(){
  // Pull strikes from current chain data if available, else empty
  const exp=ST.selExpiry||ST.expirations[0];
  if(exp&&ST.chain[exp])return ST.chain[exp].map(r=>r.strike);
  return [];
}

function showTab(name){
  ['chain','strategy','control','calc','ivcalc','bullbear','ratios','mariposa','promedio','ivsmile','histdata','analisis','analhist','tutoriales'].forEach(t=>{
    const el=document.getElementById('tab-'+t);
    if(el)el.style.display=t===name?'block':'none';
  });
  document.querySelectorAll('.tab').forEach((t,i)=>{
    t.classList.toggle('active',['chain','strategy','control','calc','ivcalc','bullbear','ratios','mariposa','promedio','ivsmile','histdata','analisis','analhist','tutoriales'][i]===name);
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
  if(name==='ratios'){ratPopulateExpiry();renderRatios();}
  if(name==='bullbear'){bbPopulateExpiry();renderBullBear();}
  if(name==='analhist'){ahPopulateStrikes();renderAnalHist();}
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

