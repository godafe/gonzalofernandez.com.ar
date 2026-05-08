/* ===== SOURCE SELECTOR ===== */
let currentSource='sheets';
const SHEET_CACHE_PREFIX='ggal_sheet_cache_v1';

function sheetCacheKey(webAppUrl,sheet){
  return `${SHEET_CACHE_PREFIX}:${webAppUrl||''}:${sheet||''}`;
}

function sheetRowsSignature(rows){
  try{
    const src=JSON.stringify(rows||[]);
    let h1=0x811c9dc5;
    for(let i=0;i<src.length;i++){
      h1^=src.charCodeAt(i);
      h1=Math.imul(h1,0x01000193);
    }
    return `${src.length.toString(36)}:${(h1>>>0).toString(36)}`;
  }catch(_){
    return `na:${Date.now().toString(36)}`;
  }
}

function sheetCacheLoad(webAppUrl,sheet){
  try{
    const raw=localStorage.getItem(sheetCacheKey(webAppUrl,sheet));
    if(!raw)return null;
    const parsed=JSON.parse(raw);
    if(!parsed||!Array.isArray(parsed.rows))return null;
    return parsed;
  }catch(_){
    return null;
  }
}

function sheetCacheSave(webAppUrl,sheet,rows){
  try{
    const payload={
      rows,
      signature:sheetRowsSignature(rows),
      fetchedAt:Date.now(),
      rowCount:Array.isArray(rows)?rows.length:0,
    };
    localStorage.setItem(sheetCacheKey(webAppUrl,sheet),JSON.stringify(payload));
    return payload;
  }catch(_){
    return null;
  }
}

function sheetResolveEndpoint(sheet){
  const name=(sheet||'').toString().trim();
  if(/^HMD$/i.test(name))return 'history';
  if(/intra/i.test(name))return 'intraday';
  return 'live';
}

async function sheetFetchRows(webAppUrl,sheet,{signal,endpoint}={}){
  const resolvedEndpoint=(endpoint||sheetResolveEndpoint(sheet)||'live').trim();
  const url=`${webAppUrl}?endpoint=${encodeURIComponent(resolvedEndpoint)}&sheet=${encodeURIComponent(sheet)}`;
  const res=await fetch(url,{signal});
  if(!res.ok)throw new Error(`HTTP ${res.status}`);
  const data=await res.json();
  if(data.error)throw new Error(data.error);
  const rows=data.values||data;
  if(!Array.isArray(rows)||!rows.length)throw new Error('Sin datos en la hoja');
  return {rows,signature:sheetRowsSignature(rows)};
}

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

/* ===== BS PARAMS BAR ===== */
function setHdrTime(d = new Date()) {
  const el = document.getElementById('hdr-time');
  if (!el) return;
  const pad2 = (n) => String(n).padStart(2, '0');
  const dd = pad2(d.getDate());
  const mm = pad2(d.getMonth() + 1);
  const yy = String(d.getFullYear()).slice(-2);
  const hh = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  el.textContent = `${dd}/${mm}/${yy} ${hh}:${mi}:${ss}`;
}
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
  const daysEl=document.getElementById('bs-days');
  const days=parseFloat(daysEl.value);
  if(!isNaN(days)&&days>0&&ST.selExpiry&&ST.chain[ST.selExpiry]){
    ST.chain[ST.selExpiry].forEach(r=>r.T=days/365);
  }
  renderChain();
  syncBullBearView();
  showToast(`Recalculado - Spot $${spot||ST.spot} - Tasa ${(ST.rate*100).toFixed(1)}%`);
}

function syncBSBar(){
  document.getElementById('bs-spot').value=ST.spot;
  document.getElementById('bs-rate').value=(ST.rate*100).toFixed(1);
  document.getElementById('bs-q').value=(ST.q*100).toFixed(1);
  if(ST.selExpiry){
    const T=(new Date(ST.selExpiry+'T12:00:00')-new Date())/(365*24*3600*1000);
    document.getElementById('bs-days').value=Math.max(1,Math.round(T*365));
  }
}

function refreshLog(event, details={}){
  const now=new Date();
  const stamp=now.toLocaleTimeString('es-AR',{hour12:false});
  console.info(`[refresh ${stamp}] ${event}`, details);
}

/* ===== AUTO-REFRESH ===== */
let autoRefreshTimer=null;
let fetchInFlight=false;
let fetchAbortController=null;
let fetchSeq=0;
let lastAppliedFetchSeq=0;
let fetchStartedAtMs=0;

function toggleAutoRefresh(){
  const chk=document.getElementById('auto-refresh-chk');
  const interval=+document.getElementById('auto-refresh-interval').value;
  clearInterval(autoRefreshTimer); autoRefreshTimer=null;
  if(chk.checked){
    refreshLog('auto-refresh enabled',{intervalMs:interval,source:currentSource});
    autoRefreshTimer=setInterval(()=>{
      refreshLog('auto-refresh tick',{intervalMs:interval,source:currentSource});
      fetchData(true);
    },interval);
    document.getElementById('refresh-status').textContent='Prox. actualizacion en '+interval/1000+'s';
  }else{
    refreshLog('auto-refresh disabled',{source:currentSource});
    document.getElementById('refresh-status').textContent='';
  }
}

/* ===== API ===== */
async function fetchData(silent=false){
  const reqSeq=fetchSeq+1;
  refreshLog('fetch requested',{reqSeq,silent,source:currentSource,inFlight:fetchInFlight});
  if(currentSource==='demo'){
    refreshLog('fetch skipped (demo source)',{reqSeq});
    generateMockAndRender();
    return;
  }
  if(fetchInFlight&&silent){
    refreshLog('fetch skipped (already in flight)',{reqSeq,silent});
    return;
  }
  if(fetchInFlight&&fetchAbortController){
    refreshLog('aborting previous fetch',{activeReqSeq:fetchSeq,nextReqSeq:reqSeq});
    fetchAbortController.abort();
  }
  fetchSeq=reqSeq;
  fetchStartedAtMs=Date.now();
  fetchAbortController=new AbortController();
  fetchInFlight=true;
  if(currentSource==='sheets'){
    try{
      refreshLog('fetch start',{reqSeq,source:'sheets'});
      await fetchSheets(silent,{signal:fetchAbortController.signal,reqSeq});
    }finally{
      if(reqSeq===fetchSeq)fetchInFlight=false;
    }
    return;
  }
  const url=document.getElementById('api-url').value.trim();
  const token=document.getElementById('api-token').value.trim();
  if(!url){
    fetchInFlight=false;
    refreshLog('fetch fallback to demo (missing URL)',{reqSeq});
    showToast('Sin URL configurada - usando datos demo');
    generateMockAndRender();
    return;
  }
  if(!silent)showToast('Conectando al servidor Python...');
  try{
    refreshLog('fetch start',{reqSeq,source:'python',url});
    const ticker=document.getElementById('api-ticker').value||'GGAL';
    const res=await fetch(`${url}/options?ticker=${ticker}`,{
      signal:fetchAbortController.signal,
      headers:token?{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}:{}
    });
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const data=await res.json();
    if(reqSeq<lastAppliedFetchSeq){
      refreshLog('fetch ignored (stale response)',{reqSeq,lastAppliedFetchSeq});
      return;
    }
    lastAppliedFetchSeq=reqSeq;
    parseApiData(data);
    document.getElementById('data-badge').textContent='live';
    document.getElementById('data-badge').className='badge badge-live';
    setHdrTime();
    refreshLog('fetch applied',{
      reqSeq,
      source:'python',
      elapsedMs:Date.now()-fetchStartedAtMs,
      expiries:ST.expirations?.length||0,
      spot:ST.spot
    });
    if(!silent)showToast('Datos Python actualizados OK');
  }catch(e){
    if(e?.name==='AbortError'){
      refreshLog('fetch aborted',{reqSeq,source:'python',elapsedMs:Date.now()-fetchStartedAtMs});
      return;
    }
    refreshLog('fetch error',{
      reqSeq,
      source:'python',
      elapsedMs:Date.now()-fetchStartedAtMs,
      message:e?.message||String(e)
    });
    showToast('Error servidor Python: '+e.message);
  }finally{
    if(reqSeq===fetchSeq)fetchInFlight=false;
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

async function fetchSheets(silent=false,{signal,reqSeq}={}){
  const webAppUrl=document.getElementById('sh-webapp-url').value.trim();
  if(!webAppUrl){showToast('Pega la URL del Apps Script web app');return;}
  const sheet=document.getElementById('sh-sheetname').value.trim()||'DMD_Sabro';
  if(!silent)showToast('Conectando a Google Sheets...');
  try{
    const cached=sheetCacheLoad(webAppUrl,sheet);
    const {rows,signature}=await sheetFetchRows(webAppUrl,sheet,{signal});
    if(!Array.isArray(rows)||!rows.length)throw new Error('Sin datos - verifica el nombre de la pestana');
    if(reqSeq&&reqSeq<lastAppliedFetchSeq){
      refreshLog('fetch ignored (stale sheet response)',{reqSeq,lastAppliedFetchSeq,sheet});
      return;
    }
    if(reqSeq)lastAppliedFetchSeq=reqSeq;
    const unchanged=!!(cached?.signature&&cached.signature===signature);
    if(!unchanged){
      parseSheetsRows(rows);
      sheetCacheSave(webAppUrl,sheet,rows);
    }
    const sheetName=document.getElementById('sh-sheetname')?.value.trim()||'';
    const badgeEl=document.getElementById('data-badge');
    if(badgeEl){
      if(sheetName==='DMD_Bot'){badgeEl.textContent='LIVE BOT';badgeEl.className='badge badge-live';}
      else if(sheetName==='DMD_Mock'){badgeEl.textContent='DEMO';badgeEl.className='badge badge-demo';}
      else{badgeEl.textContent='LIVE SHEET';badgeEl.className='badge badge-live';}
    }
    setHdrTime();
    refreshLog('fetch applied',{
      reqSeq,
      source:'sheets',
      sheet:sheetName||sheet,
      elapsedMs:Date.now()-fetchStartedAtMs,
      rows:rows.length,
      unchanged,
      expiries:ST.expirations?.length||0,
      spot:ST.spot
    });
    if(!silent)showToast(unchanged?'Google Sheets sin cambios':'Google Sheets cargado OK');
  }catch(e){
    if(e?.name==='AbortError'){
      refreshLog('fetch aborted',{reqSeq,source:'sheets',sheet,elapsedMs:Date.now()-fetchStartedAtMs});
      return;
    }
    refreshLog('fetch error',{
      reqSeq,
      source:'sheets',
      sheet,
      elapsedMs:Date.now()-fetchStartedAtMs,
      message:e?.message||String(e)
    });
    showToast('Error Sheets: '+e.message);
    console.error('Apps Script error:',e);
  }
}

function parseSheetsRows(rows){
  if(!rows?.length){showToast('La hoja no tiene datos');return;}
  const headerRowIdx=(+document.getElementById('sh-header-row').value||1)-1;
  const headerRow=rows[headerRowIdx]||[];
  const dataRows=rows.slice(headerRowIdx+1);
  const autoMap={};
  const synonyms={
    symbol:['symbol','simbolo','ticker','contract','contrato','especie'],
    strike:['strike','strikes','ejercicio','k'],
    // NOTE: Do NOT auto-map expiry from a generic "fecha" header, it often refers to trade date.
    // Use explicit "vencimiento"/"vcto"/"expiry" style headers; otherwise fallback to the configured column letter.
    expiry:['expiry','expiracion','vencimiento','vcto','venc','fecha_vto','fecha_venc','fecha_vencimiento'],
    type:['tipo','type','call_put','cp'],
    bid:['bid','compra'],
    ask:['ask','venta'],
    last:['last','ultimo','cierre','precio','spot','subyacente','ggal'],
    chg:['chg','change'],
  };
  headerRow.forEach((h,i)=>{
    const norm=(h||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,'_');
    Object.entries(synonyms).forEach(([field,syns])=>{
      if(syns.some(s=>norm===s||norm.startsWith(s)))autoMap[field]=i;
    });
  });
  const ci={
    symbol: autoMap.symbol??-1,
    strike: autoMap.strike??colLetterToIndex(document.getElementById('sh-col-strike').value),
    expiry: autoMap.expiry??colLetterToIndex(document.getElementById('sh-col-expiry').value),
    type:   autoMap.type  ??colLetterToIndex(document.getElementById('sh-col-type').value),
    bid:    autoMap.bid   ??colLetterToIndex(document.getElementById('sh-col-bid').value),
    ask:    autoMap.ask   ??colLetterToIndex(document.getElementById('sh-col-ask').value),
    last:   autoMap.last  ??colLetterToIndex(document.getElementById('sh-col-last').value),
    lastve: colLetterToIndex(document.getElementById('sh-col-lastve')?.value||'G'),
    chg:    autoMap.chg??colLetterToIndex(document.getElementById('sh-col-chg')?.value||'F'),
  };
  let spot=null, spotChg=null;
  const futures={}; // { [ticker]: { last:number, chg:number|null } }
  const opts=[];
  let skipped=0;

  dataRows.forEach(cols=>{
    if(!cols?.length)return;
    const rawStrike=(cols[ci.strike]||'').toString().trim();
    const rawType=(cols[ci.type]||'').toString().trim().toUpperCase();
    const symbol=ci.symbol>=0?(cols[ci.symbol]||'').toString().trim():'';

    // Futuro (solo algunas fuentes lo traen, ej: DMD_Bot). Si no viene, queda en 0.
    if(rawType==='FUT'||rawType==='FUTURO'||rawType==='FWD'){
      let futTicker=(symbol||rawStrike||'').toString().trim();
      if(!futTicker){
        // Fallback: algunas hojas no tienen "symbol" mapeado; buscamos un string tipo "GGAL/ABR26"
        const found=(cols||[]).find(v=>typeof v==='string'&&v.includes('/')&&v.toUpperCase().includes('GGAL'));
        if(found) futTicker=found.trim();
      }
      if(futTicker){
        const t=futTicker.toUpperCase();
        // Normalizar la clave esperada por el modulo Sinteticas
        if(t.includes('GGAL/ABR26')) futTicker='GGAL/ABR26';
      }
      const last=parseARSNum(cols[ci.last]);
      const chg=parseARSNum(cols[ci.chg]);
      if(futTicker){
        futures[futTicker]={
          last:(!isNaN(last)&&last>0)?last:0,
          chg:isNaN(chg)?null:chg,
        };
      }
      return;
    }
    if(rawType==='SUBY'){
      const isGGAL=rawStrike.toUpperCase()==='GGAL'||rawStrike==='';
      if(isGGAL){
        const s=parseARSNum(cols[ci.last]);
        if(!isNaN(s)&&s>0){spot=s;}
        const c=parseARSNum(cols[ci.chg]);
        if(!isNaN(c))spotChg=c;
      }
      return;
    }
    if(rawStrike.toUpperCase()==='GGAL'){
      const s=parseARSNum(cols[ci.last]);
      if(!isNaN(s)&&s>0)spot=s;
      const c=parseARSNum(cols[ci.chg]);
      if(!isNaN(c))spotChg=c;
      return;
    }
    const K=parseARSNum(rawStrike);
    const exp=normalizeExpiry((cols[ci.expiry]||'').toString().trim());
    const tp=rawType.toLowerCase();
    // Option quotes: parse with price-aware parser (dot may be decimal in some exports)
    const bid=parseARSPrice(cols[ci.bid]);
    const ask=parseARSPrice(cols[ci.ask]);
    const last=parseARSPrice(cols[ci.last]);
    const lastve=parseARSPrice(cols[ci.lastve]);
    const chg=parseARSPrice(cols[ci.chg]);
    if(isNaN(K)||K<=0||!exp){skipped++;return;}
    opts.push({
      strike:K, expiry:exp,
      optionType:tp.includes('put')||tp==='p'?'put':'call',
      ticker:symbol,
      bid:isNaN(bid)?0:bid, ask:isNaN(ask)?0:ask,
      mid:(!isNaN(last)&&last>0)?last:0,
      lastve:isNaN(lastve)?null:lastve,
      chg:isNaN(chg)?null:chg,
    });
  });
  if(!opts.length){showToast(`Sin opciones validas. ${skipped} filas salteadas - revisa columnas.`);return;}
  if(spot&&spot>0){
    ST.spot=spot;
    document.getElementById('spot-input').value=spot;
  }
  // Siempre refrescar futures: si la fuente no lo trae (no es DMD_Bot), queda 0.
  ST.futures=futures;
  if(!ST.futures['GGAL/ABR26']) ST.futures['GGAL/ABR26']={last:0, chg:null};
  if(spotChg!=null)ST.spotChg=spotChg;
  updateSpotHeaderDisplay(ST.spot,spotChg);
  parseApiData({last:ST.spot,options:opts});
  // Mantener Sinteticas sincronizado aunque el tab no este visible aun.
  window.synScheduleRender?.();
}

function normalizeExpiry(s){
  if(!s)return s;
  s=s.trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  const parts=s.split(/[\/\-]/);
  if(parts.length===3){
    if(parts[0].length===4)return `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
    return `${parts[2].padStart(4,'20')}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
  }
  return s;
}

function updateSpotHeaderDisplay(spot, spotChg){
  const spotEl=document.getElementById('spot-display');
  if(spotEl&&isFinite(spot)&&spot>0){
    spotEl.textContent='$ '+spot.toLocaleString('es-AR');
    spotEl.classList.remove('pos','neg','amber');
    if(isFinite(spotChg)) spotEl.classList.add(spotChg>=0?'pos':'neg');
    else spotEl.classList.add('amber');
  }
  const pctEl=document.getElementById('pct-display');
  if(pctEl&&isFinite(spotChg)){
    pctEl.textContent=(spotChg>=0?'+':'')+spotChg.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
    pctEl.className='pct-change '+(spotChg>=0?'pos':'neg');
  }
}

function extractOptionTicker(src){
  if(!src||typeof src!=='object')return'';
  const directKeys=[
    'ticker','symbol','simbolo','contract','contrato','especie','code','codigo',
    'opcion','optionSymbol','option_symbol','fullSymbol','full_symbol',
    'instrument','instrumentId','instrument_id','security','securitySymbol','security_symbol'
  ];
  for(const key of directKeys){
    const val=src[key];
    if(typeof val==='string'&&val.trim())return val.trim();
  }
  const nestedCandidates=[
    src.symbolInfo,src.instrument,src.security,src.option,src.contractData
  ].filter(Boolean);
  for(const obj of nestedCandidates){
    if(typeof obj!=='object')continue;
    const nested=extractOptionTicker(obj);
    if(nested)return nested;
  }
  return'';
}

function parseApiData(data){
  const sf=document.getElementById('map-spot').value;
  const kf=document.getElementById('map-strike').value;
  const bf=document.getElementById('map-bid').value;
  const af=document.getElementById('map-ask').value;
  const tf=document.getElementById('map-type').value;
  const ef=document.getElementById('map-expiry').value;
  if(data[sf]){
    ST.spot=parseFloat(data[sf]);
    document.getElementById('spot-input').value=ST.spot;
    updateSpotHeaderDisplay(ST.spot, ST.spotChg);
  }
  const opts=data.options||data.data||data;
  if(!Array.isArray(opts)){generateMockAndRender();return;}
  const byExp={};
  opts.forEach(o=>{
    const e=normalizeExpiry((o[ef]||'').toString().trim());
    const strike=parseFloat(o[kf]);
    if(!e||!isFinite(strike)||strike<=0)return;
    if(!byExp[e])byExp[e]={calls:new Map(),puts:new Map(),strikes:new Set()};
    const bid=parseFloat(o[bf])||0, ask=parseFloat(o[af])||0;
    const mid=(parseFloat(o.mid)||0)>0?parseFloat(o.mid):0;
    const typeRaw=(o[tf]||'').toString().toLowerCase();
    const kind=(typeRaw.includes('put')||typeRaw==='p')?'puts':'calls';
    const ticker=extractOptionTicker(o);
    byExp[e][kind].set(strike,{bid,ask,mid,lastve:o.lastve??null,chg:o.chg??null,ticker});
    byExp[e].strikes.add(strike);
  });
  ST.expirations=Object.keys(byExp).sort(); ST.chain={};
  ST.expirations.forEach(exp=>{
    const T=(new Date(exp+'T12:00:00')-new Date())/(365*24*3600*1000);
    const calls=byExp[exp].calls;
    const puts =byExp[exp].puts;
    const strikes=[...byExp[exp].strikes].sort((a,b)=>a-b);
    ST.chain[exp]=strikes.map(K=>{
      const c=calls.get(K)||{};
      const p=puts.get(K)||{};
      const iv=impliedVol(ST.spot,K,T,ST.rate,ST.q,c.mid||p.mid||1,c.mid?'call':'put')||0.70;
      return{strike:K,expiry:exp,T,iv,
        callBid:c.bid||0,callAsk:c.ask||0,callMid:c.mid||0,callLastVE:c.lastve??null,callChg:c.chg??null,callTicker:c.ticker||'',
        putBid:p.bid||0,putAsk:p.ask||0,putMid:p.mid||0,putLastVE:p.lastve??null,putChg:p.chg??null,putTicker:p.ticker||'',
        callOI:0,putOI:0};
    });
  });
  populateExpiries();renderChain();renderIVSmile();syncBSBar();ctrlPopulateExpiry();renderControl();
  syncBullBearView();
  if(document.getElementById('tab-sinteticas')?.style.display!=='none')window.renderSinteticas?.();
}

function syncBullBearView(){
  if(document.getElementById('tab-bullbear')?.style.display==='none')return;
  if(typeof window.bbApplyMode==='function'){
    window.bbApplyMode();
    return;
  }
  if(typeof window.renderBullBear==='function')window.renderBullBear();
}

function applyConfig(){
  ST.rate=siteRate()/100;
  ST.q=siteDivYield()/100;
  const rEl=document.getElementById('risk-free-rate'), dEl=document.getElementById('div-yield');
  if(rEl)rEl.value=siteRate();
  if(dEl)dEl.value=siteDivYield();
  const hdrRate=document.getElementById('hdr-rate');
  if(hdrRate)hdrRate.textContent=(ST.rate*100).toFixed(1)+'%';
  const ivR=document.getElementById('iv-r'), cR=document.getElementById('c-r');
  if(ivR)ivR.value=(ST.rate*100).toFixed(1);
  if(cR)cR.value=(ST.rate*100).toFixed(1);
  syncBSBar();
}

/* ===== SITE CONFIG ===== */
function siteComision(){ return parseFloat(document.getElementById('site-comision')?.value||'0.500')||0.500; }
function siteIva(){      return parseFloat(document.getElementById('site-iva')?.value||'1.21')||1.21; }
function siteRate(){     return parseFloat(document.getElementById('site-rate')?.value||'30')||30; }
function siteDivYield(){ return parseFloat(document.getElementById('site-dividends')?.value||'0')||0; }

function siteToggleTheme(){
  const isDark=document.body.classList.toggle('theme-dark');
  const btn=document.getElementById('site-theme-btn');
  if(btn)btn.textContent=isDark?'Oscuro':'Claro';
  localStorage.setItem('ggal_theme',isDark?'dark':'light');
}

function siteApplyTheme(){
  const saved=localStorage.getItem('ggal_theme');
  // Default theme = dark (if user has not chosen one yet)
  const isDark=(saved||'dark')==='dark';
  if(saved==null) localStorage.setItem('ggal_theme','dark');
  document.body.classList.toggle('theme-dark',isDark);
  const btn=document.getElementById('site-theme-btn');
  if(btn)btn.textContent=isDark?'Oscuro':'Claro';
}

function siteConfigChanged(){
  const rEl=document.getElementById('risk-free-rate'), dEl=document.getElementById('div-yield');
  if(rEl)rEl.value=siteRate();
  if(dEl)dEl.value=siteDivYield();
  applyConfig();
  cfgSave();
}

/* ===== CONFIG PERSISTENCE ===== */
const CFG_KEY='ggal_config_v1';
const DEFAULT_WEBAPP_URL='https://script.google.com/macros/s/AKfycbzYrpSs7-4n9hL7SK15DeaDVbP8apabGGXQLVVf5h_u2kb3WB2xY5WpBBiD_N0bBGvX/exec';
const LEGACY_WEBAPP_URLS=[
  'https://script.google.com/macros/s/AKfycbybyPULrUWjgu7XFMU2vkjnv8-AngRXKvDoH__MfcGE0e-LP1p9AhSA5enEDQyHkH1s/exec',
  'https://script.google.com/macros/s/AKfycbzK14QSqJxUp4p5KGWuBH3uzE-qlQhwcrap9SGNfZPITYoQGZiUWgHjDB0jwLbSvJXI/exec',
  'https://script.google.com/macros/s/AKfycbzK14QSqJxUp4p5KGWuBH3uzE-qlQhwcrap9SGNfZPITYoQGZiUWgHjDB0jwLbSvJXI/exec?sheet=DMD_Bot'
];
const CFG_FIELDS=[
  'site-comision','site-iva','site-rate','site-dividends',
  'sh-webapp-url','sh-sheetname','sh-header-row',
  'sh-col-strike','sh-col-expiry','sh-col-type','sh-col-bid','sh-col-ask','sh-col-last','sh-col-chg',
  'sh-sheetname-hist','sh-header-row-hist',
  'hist-col-date','hist-col-type','hist-col-strike','hist-col-last',
  'auto-refresh-chk','auto-refresh-interval',
  'spot-input','expiry-sel','chain-filter',
  'hist-strike1','hist-strike2','hist-type1','hist-type2','hist-rate','hist-ri','hist-date-from',
  'mar-wings','mar-threshold',
  'rat-expiry','rat-thresh-lo','rat-thresh-hi','rat-thresh-iv','rat-thresh-parity',
  'rat-hm-type','rat-only-opps','rat-base',
  'ah-strike1','ah-strike2','ah-type1','ah-type2','ah-rate','ah-ri','ah-date-from',
];

function cfgSave(){
  try{
    const cfg={};
    CFG_FIELDS.forEach(id=>{
      const el=document.getElementById(id);
      if(!el)return;
      cfg[id]=el.type==='checkbox'?el.checked:el.value;
    });
    localStorage.setItem(CFG_KEY,JSON.stringify(cfg));
  }catch(e){console.warn('cfgSave:',e);}
}

function cfgLoad(){
  try{
    const raw=localStorage.getItem(CFG_KEY);
    if(!raw)return;
    const cfg=JSON.parse(raw);
    if(typeof cfg['sh-webapp-url']==='string'){
      const savedUrl=cfg['sh-webapp-url'].trim();
      if(!savedUrl||LEGACY_WEBAPP_URLS.includes(savedUrl)){
        cfg['sh-webapp-url']=DEFAULT_WEBAPP_URL;
      }
    }
    CFG_FIELDS.forEach(id=>{
      if(!(id in cfg))return;
      const el=document.getElementById(id);
      if(!el)return;
      if(el.type==='checkbox')el.checked=cfg[id];
      else el.value=cfg[id];
    });
    const urlEl=document.getElementById('sh-webapp-url');
    if(urlEl&&(!urlEl.value||LEGACY_WEBAPP_URLS.includes(urlEl.value.trim())))urlEl.value=DEFAULT_WEBAPP_URL;
    localStorage.setItem(CFG_KEY,JSON.stringify(cfg));
    // Sync all type toggle buttons from their saved hidden values
    syncTypeBtns(['hist-type1','hist-type2','ah-type1','ah-type2','rat-hm-type']);
  }catch(e){console.warn('cfgLoad:',e);}
}

function cfgBindAutoSave(){
  CFG_FIELDS.forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    const evt=el.type==='checkbox'?'change':'input';
    el.addEventListener(evt,()=>cfgSave(),{passive:true});
    if(el.tagName==='SELECT')el.addEventListener('change',()=>cfgSave(),{passive:true});
  });
}

/* ===== HELPERS ===== */

function fmtN(n,dec=2){
  if(n===undefined||n===null||isNaN(n))return '--';
  return n.toLocaleString('es-AR',{minimumFractionDigits:dec,maximumFractionDigits:dec});
}

function fmtStrike(n){
  if(n===undefined||n===null||isNaN(n))return '--';
  return n.toLocaleString('es-AR',{minimumFractionDigits:n%1===0?0:2,maximumFractionDigits:n%1===0?0:2});
}

function fmtExpiry(s){
  const mn=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const d=new Date(s+'T12:00:00');
  return `${d.getDate()} ${mn[d.getMonth()]} ${d.getFullYear()}`;
}

// Parse numeros en formato argentino (1.234,56) o estandar (1234.56)
function parseARSNum(s){
  if(s===null||s===undefined||s==='')return NaN;
  s=String(s).trim();
  if(!s)return NaN;
  // Handle thousands separator without decimals: "6.845" => 6845 (common in es-AR)
  // Also supports multi-group: "1.234.567" => 1234567
  const neg = s.startsWith('-');
  const raw = neg ? s.slice(1) : s;
  if(!raw.includes(',') && raw.includes('.') && /^\d{1,3}(\.\d{3})+$/.test(raw)){
    const n = parseFloat(raw.replace(/\./g,''));
    return neg ? -n : n;
  }
  if(s.includes(',')&&s.includes('.'))return parseFloat(s.replace(/\./g,'').replace(',','.'));
  if(s.includes(','))return parseFloat(s.replace(',','.'));
  return parseFloat(s);
}

// Parse prices for option quotes (bid/ask/last). Some sheets export prices like "6.602" meaning 6.602 (dot as decimal),
// while spot/strikes often use dots as thousands (e.g. "6.845" meaning 6845). Keep this parser only for option prices.
function parseARSPrice(s){
  if(s===null||s===undefined||s==='')return NaN;
  s=String(s).trim();
  if(!s)return NaN;
  // Standard es-AR with decimals comma (and optional thousands dot)
  if(s.includes(',')&&s.includes('.'))return parseFloat(s.replace(/\./g,'').replace(',','.'));
  if(s.includes(','))return parseFloat(s.replace(',','.'));
  // Dot-only: treat as decimal separator for prices (common export: 6.602)
  const raw=s.startsWith('-')?s.slice(1):s;
  if((raw.match(/\./g)||[]).length>1){
    // Multi-dot likely thousands grouping: 1.234.567 -> 1234567
    const n=parseFloat(raw.replace(/\./g,''));
    return s.startsWith('-')?-n:n;
  }
  return parseFloat(s);
}

function toggleEl(id){const e=document.getElementById(id);if(e)e.style.display=e.style.display==='none'?'block':'none';}

function getAvailableStrikes(){
  const exp=ST.selExpiry||ST.expirations[0];
  if(exp&&ST.chain[exp])return ST.chain[exp].map(r=>r.strike);
  return [];
}

/* ===== SHARED UI HELPERS ===== */

// Sync a Call/Put toggle button appearance to the given state
function syncTypeBtn(btn, isCall){
  btn.textContent=isCall?'Call':'Put';
  btn.style.color=isCall?'var(--green)':'var(--red)';
  btn.style.borderColor=isCall?'var(--green)':'var(--red)';
}

// Sync multiple type buttons by reading their hidden input partners
function syncTypeBtns(ids){
  ids.forEach(id=>{
    const hidden=document.getElementById(id);
    const btn=document.getElementById(id+'-btn');
    if(hidden&&btn)syncTypeBtn(btn, hidden.value==='call');
  });
}

// Generic call/put toggle for hidden+button pairs
function toggleOptionType(hiddenId, btnId, renderFn){
  const hidden=document.getElementById(hiddenId);
  const btn=document.getElementById(btnId);
  if(!hidden||!btn)return;
  hidden.value=hidden.value==='call'?'put':'call';
  syncTypeBtn(btn, hidden.value==='call');
  renderFn?.();
}

// Generic swap for two strike+type selector pairs
function swapStrikeSelectors(s1Id, s2Id, t1Id, t2Id, renderFn){
  const s1=document.getElementById(s1Id), s2=document.getElementById(s2Id);
  if(!s1||!s2)return;
  [s1.value, s2.value]=[s2.value, s1.value];
  const t1=document.getElementById(t1Id), t2=document.getElementById(t2Id);
  if(t1&&t2){
    [t1.value, t2.value]=[t2.value, t1.value];
    syncTypeBtns([t1Id, t2Id]);
  }
  renderFn?.();
}

// Populate two strike <select> elements from an array of strike values.
// Preserves current selections; defaults to two ATM-closest strikes.
function populateStrikeDropdowns(sel1Id, sel2Id, strikes){
  const s1=document.getElementById(sel1Id), s2=document.getElementById(sel2Id);
  if(!s1||!s2||!strikes.length)return;
  const cur1=parseFloat(s1.value)||0, cur2=parseFloat(s2.value)||0;
  [s1, s2].forEach((sel, i)=>{
    const cur=i===0?cur1:cur2;
    sel.innerHTML='';
    strikes.forEach(s=>{
      const o=document.createElement('option');
      o.value=s; o.textContent=fmtStrike(s);
      if(Math.round(s*100)===Math.round(cur*100))o.selected=true;
      sel.appendChild(o);
    });
  });
  if(!cur1&&!cur2&&strikes.length>=2){
    const sorted=[...strikes].sort((a,b)=>Math.abs(a-ST.spot)-Math.abs(b-ST.spot));
    s1.value=sorted[0]; s2.value=sorted[1];
  }
}

// Generic line chart factory. Updates existing charts when possible.
// opts.dense=true -> rotated x ticks, no autoSkip (for dense date series)
function createLineChart(chartsObj, key, canvasId, labels, data, color, tooltipLabel, fmtFn, opts={}){
  const ctx=document.getElementById(canvasId)?.getContext('2d');
  if(!ctx)return;
  const dense=opts.dense||false;
  const chartData={labels, datasets:[{
    label:tooltipLabel,
    data: data.map(v=>v!=null?parseFloat(v.toFixed(4)):null),
    borderColor:color, borderWidth:1.5, pointRadius:3,
    pointBackgroundColor:color, fill:false, spanGaps:true
  }]};
  const xTickCb=(v,i)=>{
    const d=labels[i]; if(!d)return'';
    const p=d.split('-');
    return p.length>=3?p[2]+'-'+p[1]:d;
  };
  const chartOpts={
    responsive:true, maintainAspectRatio:false, animation:false,
    plugins:{
      legend:{display:false},
      tooltip:{backgroundColor:'#131920',borderColor:'#2a3444',borderWidth:1,
        titleColor:'#7a8fa6',bodyColor:'#d8e3ef',
        callbacks:{label:c=>` ${tooltipLabel}: ${fmtFn(c.raw)}`}}
    },
    scales:{
      x:{
        ticks:{color:'#7a8fa6',font:{size:9},
          maxRotation:dense?45:0, minRotation:dense?45:0,
          autoSkip:!dense, maxTicksLimit:dense?9999:12,
          callback:xTickCb},
        grid:{color:'#1a2230'}
      },
      y:{ticks:{color:'#7a8fa6',font:{size:9},callback:fmtFn}, grid:{color:'#1a2230'}}
    }
  };
  if(chartsObj[key]){
    chartsObj[key].data=chartData;
    chartsObj[key].options=chartOpts;
    chartsObj[key].update('none');
    return;
  }
  chartsObj[key]=new Chart(ctx,{type:'line',data:chartData,options:chartOpts});
}

function upsertChart(chartsObj,key,canvasId,config){
  const ctx=document.getElementById(canvasId)?.getContext('2d');
  if(!ctx)return;
  if(chartsObj[key]){
    chartsObj[key].config.type=config.type;
    chartsObj[key].data=config.data;
    chartsObj[key].options=config.options;
    chartsObj[key].update('none');
    return;
  }
  chartsObj[key]=new Chart(ctx,config);
}

// Generic: populates any <select> with ST.expirations, preserving current selection
function populateExpirySelect(selId){
  const sel=document.getElementById(selId);
  if(!sel)return;
  const cur=sel.value;
  sel.innerHTML='';
  ST.expirations.forEach(e=>{
    const o=document.createElement('option');
    o.value=e; o.textContent=fmtExpiry(e);
    if(e===cur)o.selected=true;
    sel.appendChild(o);
  });
  if(!sel.value&&ST.selExpiry)sel.value=ST.selExpiry;
}

// Sync min/max attributes of a date-from picker from HIST.rows dates,
// and show the available range as a hint next to the input.
function syncDateFromPicker(inputId, rangeId){
  const input=document.getElementById(inputId);
  const rangeEl=document.getElementById(rangeId);
  if(!input)return;
  if(!window.HIST?.rows?.length){
    input.removeAttribute('min'); input.removeAttribute('max');
    if(rangeEl)rangeEl.textContent='';
    return;
  }
  const dates=HIST.rows.map(r=>r.date).filter(Boolean).sort();
  const minDate=dates[0], maxDate=dates[dates.length-1];
  input.min=minDate;
  input.max=maxDate;
  // If current value is outside range, clamp it
  if(input.value&&input.value<minDate) input.value=minDate;
  if(input.value&&input.value>maxDate) input.value='';
  if(rangeEl) rangeEl.textContent=`${minDate} - ${maxDate}`;
}

/* ===== NAVIGATION ===== */
function showTab(name){
  const historicosModeByLegacyTab={
    histdata:'costos',
    analhist:'analisis',
    probabilidades:'probabilidades',
  };
  if(historicosModeByLegacyTab[name]){
    window.historicosEnsureMounted?.();
    window.historicosSetMode?.(historicosModeByLegacyTab[name]);
    name='historicos';
  }

  ['chain','strategy','control','calc','ivcalc','bullbear','ratios','mariposa','sinteticas','promedio',
   'ivsmile','historicos','histdata','analisis','analhist','tutoriales','probabilidades','intradiario','simulador'].forEach(t=>{
    const el=document.getElementById('tab-'+t);
    if(el)el.style.display=t===name?'block':'none';
  });
  document.querySelectorAll('#tabs .tab').forEach(t=>{
    t.classList.toggle('active',t.dataset.tab===name);
  });
  if(name==='strategy'&&!ST.charts.pnl)loadPreset('bull_spread',document.querySelector('[data-preset="bull_spread"]'));
  if(name==='calc')setTimeout(runCalc,50);
  if(name==='ivsmile')setTimeout(renderIVSmile,50);
  if(name==='ivcalc')setTimeout(runIVCalc,50);
  if(name==='control'){ctrlPopulateExpiry();renderControl();}
  if(name==='historicos'){window.historicosApplyMode?.();}
  if(name==='histdata'){histPopulateStrikes();renderHistData();}
  if(name==='mariposa'){marPopulateExpiry();renderMariposa();}
  if(name==='sinteticas'){window.renderSinteticas?.();}
  if(name==='probabilidades'){renderProbabilidades?.();}
  if(name==='intradiario'){window.intraEnsureData?.(); window.renderIntradiario?.();}
  if(name==='analisis'){anaPopulateExpiry();renderAnalisis();}
  if(name==='tutoriales'){tutShow('cadena');}
  if(name==='ratios'){ratPopulateExpiry();renderRatios();}
  if(name==='bullbear'){
    bbPopulateExpiry();
    window.bb2PopulateExpiry?.();
    window.bbApplyMode?.(); // decides what to render (chain vs cards)
  }
  if(name==='analhist'){ahPopulateStrikes();renderAnalHist();}
  if(name==='simulador'){
    simRefreshImportSel?.();
    renderSimulador?.();
  }
}

function manualSpot(){
  const v=parseFloat(document.getElementById('spot-input').value);
  if(v>0){
    ST.spot=v;
    document.getElementById('spot-display').textContent='$ '+v.toLocaleString('es-AR');
    syncBSBar();
    renderChain();
    renderIVSmile();
    if(document.getElementById('tab-control')?.style.display!=='none')renderControl();
    if(document.getElementById('tab-histdata')?.style.display!=='none')renderHistData();
    if(document.getElementById('tab-ratios')?.style.display!=='none')renderRatios();
    syncBullBearView();
    if(document.getElementById('tab-analhist')?.style.display!=='none')renderAnalHist();
    if(document.getElementById('tab-probabilidades')?.style.display!=='none')renderProbabilidades?.();
    if(document.getElementById('tab-intradiario')?.style.display!=='none')renderIntradiario?.();
    if(document.getElementById('tab-simulador')?.style.display!=='none')renderSimulador?.();
  }
}

function generateMockAndRender(){
  generateMockData();populateExpiries();renderChain();
  syncBullBearView();
  if(ST.charts.iv)renderIVSmile();
}

function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  clearTimeout(t._tid); t._tid=setTimeout(()=>t.classList.remove('show'),3000);
}



