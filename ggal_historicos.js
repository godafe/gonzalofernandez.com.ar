/* ===== MÓDULO HISTÓRICOS (ORQUESTADOR HMD) ===== */
const HISTORICOS={
  mode:'costos',
  mounted:false,
  storageKey:'ggal_historicos_mode',
  cacheDbName:'ggal_hmd_cache_v1',
  cacheStore:'hmd_cache',
  loading:false,
  loaderStartedAt:0,
  loaderTimer:null,
  views:{
    costos:{
      panelId:'tab-histdata',
      hostId:'historicos-view-costos',
      buttonId:'historicos-mode-costos',
      render(){
        histPopulateStrikes?.();
        renderHistData?.();
      },
    },
    analisis:{
      panelId:'tab-analhist',
      hostId:'historicos-view-analisis',
      buttonId:'historicos-mode-analisis',
      render(){
        ahPopulateStrikes?.();
        renderAnalHist?.();
      },
    },
    probabilidades:{
      panelId:'tab-probabilidades',
      hostId:'historicos-view-probabilidades',
      buttonId:'historicos-mode-probabilidades',
      render(){
        renderProbabilidades?.();
      },
    },
  },
};

function historicosModes(){
  return Object.keys(HISTORICOS.views);
}

function historicosNormalizeMode(mode){
  return historicosModes().includes(mode)?mode:'costos';
}

function historicosReadStoredMode(){
  try{
    return historicosNormalizeMode(localStorage.getItem(HISTORICOS.storageKey)||'costos');
  }catch{
    return 'costos';
  }
}

function historicosWriteStoredMode(mode){
  try{
    localStorage.setItem(HISTORICOS.storageKey,mode);
  }catch{}
}

function historicosLog(event,details={}){
  const now=new Date();
  const stamp=now.toLocaleTimeString('es-AR',{hour12:false});
  console.info(`[historicos ${stamp}] ${event}`,details);
}

function historicosCacheKey(webAppUrl,sheet){
  return `${webAppUrl||''}::${sheet||'HMD'}`;
}

function historicosOpenDb(){
  if(HISTORICOS.dbPromise)return HISTORICOS.dbPromise;
  HISTORICOS.dbPromise=new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){
      reject(new Error('IndexedDB no disponible'));
      return;
    }
    const req=indexedDB.open(HISTORICOS.cacheDbName,1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(HISTORICOS.cacheStore)){
        db.createObjectStore(HISTORICOS.cacheStore,{keyPath:'cacheKey'});
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('No se pudo abrir IndexedDB'));
  });
  return HISTORICOS.dbPromise;
}

async function historicosDbLoad(webAppUrl,sheet){
  const db=await historicosOpenDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(HISTORICOS.cacheStore,'readonly');
    const store=tx.objectStore(HISTORICOS.cacheStore);
    const req=store.get(historicosCacheKey(webAppUrl,sheet));
    req.onsuccess=()=>resolve(req.result||null);
    req.onerror=()=>reject(req.error||new Error('No se pudo leer HMD desde IndexedDB'));
  });
}

async function historicosDbSave(webAppUrl,sheet,rows){
  const db=await historicosOpenDb();
  const payload={
    cacheKey:historicosCacheKey(webAppUrl,sheet),
    sheet,
    webAppUrl,
    rows,
    signature:sheetRowsSignature(rows),
    fetchedAt:Date.now(),
    rowCount:Array.isArray(rows)?rows.length:0,
  };
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(HISTORICOS.cacheStore,'readwrite');
    const store=tx.objectStore(HISTORICOS.cacheStore);
    const req=store.put(payload);
    req.onsuccess=()=>resolve(payload);
    req.onerror=()=>reject(req.error||new Error('No se pudo guardar HMD en IndexedDB'));
  });
}

async function historicosDbClear(webAppUrl,sheet){
  const db=await historicosOpenDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(HISTORICOS.cacheStore,'readwrite');
    const store=tx.objectStore(HISTORICOS.cacheStore);
    const req=store.delete(historicosCacheKey(webAppUrl,sheet));
    req.onsuccess=()=>resolve(true);
    req.onerror=()=>reject(req.error||new Error('No se pudo limpiar HMD en IndexedDB'));
  });
}

function historicosSetLoading(active,text=''){
  const wrap=document.getElementById('historicos-loader');
  const textEl=document.getElementById('historicos-loader-text');
  const elapsedEl=document.getElementById('historicos-loader-elapsed');
  const barEl=document.getElementById('historicos-loader-bar');
  const btn=document.getElementById('historicos-refresh-btn');
  HISTORICOS.loading=!!active;
  if(wrap)wrap.style.display=active?'block':'none';
  if(textEl&&text)textEl.textContent=text;
  if(btn)btn.disabled=!!active;
  if(btn)btn.textContent=active?'Cargando...':'Actualizar HMD';
  if(active){
    HISTORICOS.loaderStartedAt=Date.now();
    if(elapsedEl)elapsedEl.textContent='0,0s';
    if(barEl)barEl.style.width='18%';
    if(HISTORICOS.loaderTimer)clearInterval(HISTORICOS.loaderTimer);
    HISTORICOS.loaderTimer=setInterval(()=>{
      const elapsedMs=Date.now()-HISTORICOS.loaderStartedAt;
      if(elapsedEl)elapsedEl.textContent=`${(elapsedMs/1000).toFixed(1).replace('.',',')}s`;
      if(barEl){
        const width=Math.min(92,18+Math.floor(elapsedMs/180));
        barEl.style.width=`${width}%`;
      }
    },100);
    return;
  }
  if(HISTORICOS.loaderTimer){
    clearInterval(HISTORICOS.loaderTimer);
    HISTORICOS.loaderTimer=null;
  }
  if(barEl)barEl.style.width='100%';
}

function historicosSetStatus(text,tone='muted'){
  const colorMap={
    muted:'var(--muted)',
    dim:'var(--dim)',
    amber:'var(--amber)',
    green:'var(--green)',
    red:'var(--red)',
  };
  const color=colorMap[tone]||colorMap.muted;
  [
    document.getElementById('historicos-shared-status'),
    document.getElementById('hist-status'),
    document.getElementById('ah-status'),
    document.getElementById('pr-status'),
  ].forEach(el=>{
    if(!el)return;
    el.textContent=text;
    el.style.color=color;
  });
}

function historicosApplyRows(rows,{source='network',fetchedAt=Date.now()}={}){
  parseHistRows(rows);
  histPopulateStrikes?.();
  ahPopulateStrikes?.();
  probPopulateStrikes?.();
  historicosRenderActiveMode();
  const stamp=new Date(fetchedAt||Date.now()).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
  const sourceLabel=source==='indexeddb'?'IndexedDB':'Google Sheets';
  historicosSetStatus(`${HIST.rows.length} registros · ${sourceLabel} · ${stamp}`,source==='indexeddb'?'dim':'muted');
}

function historicosEnsureMounted(){
  if(HISTORICOS.mounted)return true;
  const root=document.getElementById('tab-historicos');
  if(!root)return false;

  Object.values(HISTORICOS.views).forEach(view=>{
    const panel=document.getElementById(view.panelId);
    const host=document.getElementById(view.hostId);
    if(!panel||!host)return;
    if(panel.parentElement!==host)host.appendChild(panel);
    panel.style.display='none';
    host.style.display='none';
  });

  HISTORICOS.mode=historicosReadStoredMode();
  HISTORICOS.mounted=true;
  return true;
}

function historicosApplyButtonState(activeMode){
  Object.entries(HISTORICOS.views).forEach(([mode,view])=>{
    const btn=document.getElementById(view.buttonId);
    if(!btn)return;
    const active=mode===activeMode;
    btn.style.background=active?'rgba(232,184,75,.12)':'var(--surface2)';
    btn.style.borderColor=active?'var(--amber)':'var(--border)';
    btn.style.color=active?'var(--amber)':'var(--text)';
    btn.style.boxShadow=active?'inset 0 0 0 1px rgba(232,184,75,.18)':'none';
  });
}

function historicosRenderActiveMode(){
  HISTORICOS.views[HISTORICOS.mode]?.render?.();
}

function historicosApplyMode(mode){
  if(!historicosEnsureMounted())return;

  const normalized=historicosNormalizeMode(mode||HISTORICOS.mode||historicosReadStoredMode());
  HISTORICOS.mode=normalized;
  historicosWriteStoredMode(normalized);

  Object.entries(HISTORICOS.views).forEach(([modeName,view])=>{
    const panel=document.getElementById(view.panelId);
    const host=document.getElementById(view.hostId);
    const active=modeName===normalized;
    if(host)host.style.display=active?'block':'none';
    if(panel)panel.style.display=active?'block':'none';
  });

  historicosApplyButtonState(normalized);
  historicosRenderActiveMode();
}

function historicosSetMode(mode){
  historicosApplyMode(mode);
}

async function historicosEnsureHmdData({webAppUrl,sheet='HMD'}={}){
  if(!webAppUrl){
    historicosSetStatus('Sin URL configurada','red');
    return false;
  }
  try{
    const cached=await historicosDbLoad(webAppUrl,sheet);
    if(cached?.rows?.length>=2){
      historicosApplyRows(cached.rows,{source:'indexeddb',fetchedAt:cached.fetchedAt});
      historicosLog('indexeddb restored',{sheet,cachedRows:cached.rows.length,fetchedAt:cached.fetchedAt});
      return true;
    }
    historicosLog('indexeddb miss',{sheet});
  }catch(error){
    historicosLog('indexeddb read failed',{sheet,reason:error?.message||String(error)});
  }
  await historicosRefreshHmd({webAppUrl,sheet,silentIfBusy:true});
  return HIST.rows.length>0;
}

async function historicosRefreshHmd({webAppUrl,sheet='HMD',silentIfBusy=false}={}){
  if(HISTORICOS.loading){
    if(!silentIfBusy)historicosLog('refresh skipped; already loading',{sheet});
    return false;
  }
  const resolvedUrl=(webAppUrl||document.getElementById('sh-webapp-url')?.value||'').trim();
  const resolvedSheet=(sheet||document.getElementById('sh-sheetname-hist')?.value||'HMD').trim()||'HMD';
  if(!resolvedUrl){
    historicosSetStatus('Sin URL configurada','red');
    return false;
  }

  historicosSetLoading(true,'Descargando HMD desde Google Sheets...');
  historicosSetStatus('Actualizando HMD...','amber');
  historicosLog('fetch start',{sheet:resolvedSheet});
  try{
    const {rows,signature}=await sheetFetchRows(resolvedUrl,resolvedSheet);
    if(!Array.isArray(rows)||rows.length<2)throw new Error('Sin datos');
    historicosSetLoading(true,'Procesando histórico HMD...');
    historicosApplyRows(rows,{source:'network',fetchedAt:Date.now()});
    let indexedDbSaved=true;
    try{
      await historicosDbClear(resolvedUrl,resolvedSheet);
      await historicosDbSave(resolvedUrl,resolvedSheet,rows);
    }catch(dbError){
      indexedDbSaved=false;
      historicosLog('indexeddb save failed',{sheet:resolvedSheet,reason:dbError?.message||String(dbError)});
    }
    historicosSetStatus(`${HIST.rows.length} registros · actualizado ${new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}`,'green');
    historicosLog('fetch applied',{sheet:resolvedSheet,rowCount:rows.length,parsedRows:HIST.rows.length,signature,indexedDbSaved});
    showToast(`HMD actualizado — ${HIST.rows.length} filas`);
    return true;
  }catch(error){
    historicosSetStatus(`Error HMD: ${error.message}`,'red');
    historicosLog('fetch failed',{sheet:resolvedSheet,reason:error?.message||String(error)});
    showToast('Error HMD: '+error.message);
    return false;
  }finally{
    historicosSetLoading(false);
  }
}

window.historicosEnsureMounted=historicosEnsureMounted;
window.historicosApplyMode=historicosApplyMode;
window.historicosSetMode=historicosSetMode;
window.historicosEnsureHmdData=historicosEnsureHmdData;
window.historicosRefreshHmd=historicosRefreshHmd;
