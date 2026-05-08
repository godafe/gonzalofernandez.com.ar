function bindPrimaryUIEvents(){
  if(typeof probInjectHTML==='function')probInjectHTML();
  // Inyectar tab + pane del Simulador en el DOM
  if(typeof simInjectHTML==='function')simInjectHTML();

  const refreshBtn=document.getElementById('btn-refresh');
  if(refreshBtn)refreshBtn.addEventListener('click',()=>fetchData());

  const siteCfgBtn=document.getElementById('btn-site-config');
  if(siteCfgBtn)siteCfgBtn.addEventListener('click',()=>toggleEl('site-config-wrap'));

  const apiCfgBtn=document.getElementById('btn-api-config');
  if(apiCfgBtn)apiCfgBtn.addEventListener('click',()=>toggleEl('api-config-wrap'));

  document.querySelectorAll('#tabs .tab[data-tab]').forEach(tab=>{
    tab.addEventListener('click',()=>showTab(tab.dataset.tab));
  });
}

const INIT_PERF={
  startedAtMs:0,
  steps:[],
  overlayTimer:null,
  final:false,
};

function initPerfNow(){
  return (typeof performance!=='undefined'&&typeof performance.now==='function')?performance.now():Date.now();
}

function initPerfEnsureUI(){
  if(document.getElementById('init-loader-overlay'))return;

  const overlay=document.createElement('div');
  overlay.id='init-loader-overlay';
  overlay.style.cssText='position:fixed;inset:0;z-index:10000;background:rgba(8,10,14,.72);backdrop-filter:blur(3px);display:none;align-items:center;justify-content:center;padding:24px';
  overlay.innerHTML=`
    <div style="width:min(540px,100%);background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:0 18px 40px rgba(0,0,0,.28);padding:20px 22px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:10px">
        <div>
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.7px">Inicializando dashboard</div>
          <div id="init-loader-message" style="font-family:var(--sans);font-size:18px;color:var(--text);font-weight:600;margin-top:4px">Preparando datos...</div>
        </div>
        <div id="init-loader-elapsed" style="font-family:var(--mono);font-size:22px;color:var(--amber);font-weight:600">0,0s</div>
      </div>
      <div style="height:8px;background:var(--bg);border:1px solid var(--border2);border-radius:999px;overflow:hidden">
        <div id="init-loader-bar" style="height:100%;width:18%;background:linear-gradient(90deg,var(--amber),#f4d27a);border-radius:999px;transition:width .18s ease"></div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:10px">
        <div id="init-loader-stage" style="font-size:11px;color:var(--muted)">Cargando datos desde Google Sheets...</div>
        <div id="init-loader-steps" style="font-family:var(--mono);font-size:11px;color:var(--dim)">0 pasos</div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const panel=document.createElement('div');
  panel.id='init-metrics-panel';
  panel.style.cssText='display:none;margin:10px 0 12px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px 12px';
  panel.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div>
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.7px">Init Performance</div>
        <div id="init-metrics-summary" style="font-family:var(--mono);font-size:12px;color:var(--text);margin-top:3px">Esperando inicio...</div>
      </div>
      <div id="init-metrics-badge" style="font-size:10px;color:var(--amber);text-transform:uppercase;letter-spacing:.7px">Cargando</div>
    </div>
    <div id="init-metrics-list" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-top:10px"></div>`;
  document.getElementById('tabs')?.insertAdjacentElement('beforebegin',panel);
}

function initPerfRender(){
  const totalMs=Math.max(0,Date.now()-INIT_PERF.startedAtMs);
  const summaryEl=document.getElementById('init-metrics-summary');
  const badgeEl=document.getElementById('init-metrics-badge');
  const listEl=document.getElementById('init-metrics-list');
  if(summaryEl){
    const slowest=INIT_PERF.steps.slice().sort((a,b)=>b.elapsedMs-a.elapsedMs)[0];
    summaryEl.textContent=slowest
      ? `Total ${initPerfFormatMs(totalMs)} | Más lento: ${slowest.name} (${initPerfFormatMs(slowest.elapsedMs)})`
      : `Total ${initPerfFormatMs(totalMs)} | Sin métricas todavía`;
  }
  if(badgeEl){
    badgeEl.textContent=INIT_PERF.final?'Listo':'Cargando';
    badgeEl.style.color=INIT_PERF.final?'var(--green)':'var(--amber)';
  }
  if(listEl){
    const top=INIT_PERF.steps.slice().sort((a,b)=>b.elapsedMs-a.elapsedMs).slice(0,8);
    listEl.innerHTML=top.map(step=>`
      <div style="background:var(--surface2);border:1px solid var(--border2);border-radius:8px;padding:8px 10px">
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">${step.group||'init'}</div>
        <div style="font-family:var(--sans);font-size:12px;color:var(--text);font-weight:600;margin-top:4px">${step.name}</div>
        <div style="font-family:var(--mono);font-size:14px;color:${step.status==='error'?'var(--red)':'var(--amber)'};margin-top:4px">${initPerfFormatMs(step.elapsedMs)}</div>
      </div>`).join('');
  }
}

function initPerfFormatMs(ms){
  if(ms>=1000)return `${(ms/1000).toFixed(2).replace('.',',')}s`;
  return `${Math.round(ms)}ms`;
}

function initPerfSetLoading(active,message=''){
  initPerfEnsureUI();
  const overlay=document.getElementById('init-loader-overlay');
  const main=document.getElementById('main');
  const tabs=document.getElementById('tabs');
  if(overlay)overlay.style.display=active?'flex':'none';
  if(main)main.style.pointerEvents=active?'none':'';
  if(tabs)tabs.style.pointerEvents=active?'none':'';
  document.body.style.overflow=active?'hidden':'';
  if(active){
    initPerfSetMessage(message||'Inicializando...');
    if(!INIT_PERF.overlayTimer){
      INIT_PERF.overlayTimer=setInterval(()=>{
        const elapsedMs=Math.max(0,Date.now()-INIT_PERF.startedAtMs);
        const elapsedEl=document.getElementById('init-loader-elapsed');
        const barEl=document.getElementById('init-loader-bar');
        const stepsEl=document.getElementById('init-loader-steps');
        if(elapsedEl)elapsedEl.textContent=initPerfFormatMs(elapsedMs);
        if(barEl){
          const base=Math.min(92,18+INIT_PERF.steps.length*6);
          barEl.style.width=`${INIT_PERF.final?100:base}%`;
        }
        if(stepsEl)stepsEl.textContent=`${INIT_PERF.steps.length} pasos`;
        initPerfRender();
      },100);
    }
    return;
  }
  if(INIT_PERF.overlayTimer){
    clearInterval(INIT_PERF.overlayTimer);
    INIT_PERF.overlayTimer=null;
  }
  const barEl=document.getElementById('init-loader-bar');
  if(barEl)barEl.style.width='100%';
  initPerfRender();
}

function initPerfSetMessage(message,stage){
  const messageEl=document.getElementById('init-loader-message');
  const stageEl=document.getElementById('init-loader-stage');
  if(messageEl)messageEl.textContent=message||'Inicializando...';
  if(stageEl)stageEl.textContent=stage||message||'Inicializando...';
}

function initPerfRecord(name,startedAt,details={}){
  const elapsedMs=Math.max(0,Math.round(initPerfNow()-startedAt));
  INIT_PERF.steps.push({name,elapsedMs,...details});
  initPerfRender();
  return elapsedMs;
}

async function initPerfStep(name,fn,{message,stage,group='init'}={}){
  const startedAt=initPerfNow();
  initPerfSetMessage(message||name,stage||message||name);
  try{
    const result=await fn();
    initPerfRecord(name,startedAt,{group,status:'ok'});
    return result;
  }catch(error){
    initPerfRecord(name,startedAt,{group,status:'error',error:error?.message||String(error)});
    throw error;
  }
}

function initPerfDelay(ms=0){
  return new Promise(resolve=>setTimeout(resolve,ms));
}

async function initPerfWarmupTabs(){
  const activeTab=document.querySelector('#tabs .tab.active')?.dataset.tab||'chain';
  const plan=[
    {tab:'chain',label:'Cadena',waitMs:20},
    {tab:'strategy',label:'Estrategias',waitMs:20},
    {tab:'control',label:'Control',waitMs:20},
    {tab:'calc',label:'Calculadora BS',waitMs:90},
    {tab:'ivcalc',label:'Volatilidad Implícita',waitMs:90},
    {tab:'bullbear',label:'Bull/Bear',waitMs:20},
    {tab:'ratios',label:'Ratios',waitMs:20},
    {tab:'mariposa',label:'Mariposa',waitMs:20},
    {tab:'sinteticas',label:'Sintéticas',waitMs:40},
    {tab:'promedio',label:'Precio Promedio',waitMs:10},
    {tab:'ivsmile',label:'Smile de Volatilidad',waitMs:80},
    {tab:'historicos',label:'Historicos',waitMs:20},
    {tab:'analisis',label:'Análisis',waitMs:20},
    {tab:'intradiario',label:'Intradiario',waitMs:20},
    {tab:'simulador',label:'Simulador',waitMs:40},
    {tab:'tutoriales',label:'Tutoriales',waitMs:10},
  ];

  for(const item of plan){
    const startedAt=initPerfNow();
    initPerfSetMessage(`Renderizando ${item.label}...`,`Warm-up de ${item.label}`);
    try{
      showTab(item.tab);
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(item.waitMs>0)await initPerfDelay(item.waitMs);
      initPerfRecord(item.label,startedAt,{group:'tabs',status:'ok'});
    }catch(error){
      console.warn(`Warm-up failed for ${item.tab}:`,error);
      initPerfRecord(item.label,startedAt,{group:'tabs',status:'error',error:error?.message||String(error)});
    }
  }
  showTab(activeTab);
}

function initLog(event, details={}){
  const now=new Date();
  const stamp=now.toLocaleTimeString('es-AR',{hour12:false});
  console.info(`[init ${stamp}] ${event}`, details);
}

(async function init(){
  const initStartedAtMs=Date.now();
  INIT_PERF.startedAtMs=initStartedAtMs;
  initPerfEnsureUI();
  initPerfSetLoading(true,'Preparando dashboard...');
  initLog('page init start');
  try{
    await initPerfStep('Preparación base',async()=>{
      selectSource('sheets');
      document.getElementById('spot-input').value=ST.spot;
      document.getElementById('c-r').value=(ST.rate*100).toFixed(1);
      document.getElementById('iv-r').value=(ST.rate*100).toFixed(1);
      document.getElementById('risk-free-rate').value=(ST.rate*100).toFixed(1);
      bindPrimaryUIEvents();
      siteApplyTheme();
    },{message:'Montando interfaz...',group:'boot'});

    await initPerfStep('Restaurar estado local',async()=>{
      if(ctrlLoad()){
        showToast(
          ctrlStrategies.length+' estrategia'+(ctrlStrategies.length>1?'s':'')+
          ' restaurada'+(ctrlStrategies.length>1?'s':'')+' OK'
        );
      }
      cfgLoad();
      cfgBindAutoSave();
      siteConfigChanged();
      ['hist-rate','ah-rate'].forEach(id=>{
        const el=document.getElementById(id);
        if(el&&(el.value===''||el.value==='0'))el.value=siteRate();
      });
    },{message:'Restaurando configuración guardada...',group:'boot'});

    await initPerfStep('Bootstrap demo',async()=>{
      generateMockData();
      populateExpiries();
      renderChain();
      syncBSBar();
      if(typeof simResetParams==='function')simResetParams();
      initLog('demo bootstrap applied',{elapsedMs:Date.now()-initStartedAtMs});
    },{message:'Preparando vista inicial...',group:'boot'});

    const webAppUrl=document.getElementById('sh-webapp-url').value.trim();
    const sheet=document.getElementById('sh-sheetname').value.trim()||'DMD_Sabro';
    const histSheet=document.getElementById('sh-sheetname-hist')?.value.trim()||'HMD';
    const intraSheet=document.getElementById('sh-sheetname-intra')?.value.trim()||'Intradiario';
    initLog('webapp url resolved',{webAppUrl});

    if(!webAppUrl){
      initLog('page init without live URL',{elapsedMs:Date.now()-initStartedAtMs});
      showToast('Sin URL configurada - mostrando datos demo');
    }else{
      const quoteCache=sheetCacheLoad(webAppUrl,sheet);
      if(quoteCache?.rows?.length){
        await initPerfStep(`Cache local: ${sheet}`,async()=>{
          parseSheetsRows(quoteCache.rows);
          if(typeof simResetParams==='function')simResetParams();
          document.getElementById('data-badge').textContent='cache';
          document.getElementById('data-badge').className='badge badge-demo';
          if(typeof setHdrTime==='function'&&quoteCache.fetchedAt)setHdrTime(new Date(quoteCache.fetchedAt));
        },{message:`Cargando cache local de ${sheet}...`,group:'cache'});
      }

      showToast('Cargando datos de Google Sheets...');
      const liveStartedAtMs=Date.now();
      try{
        initLog('live load start',{sheet});
        const {rows,signature}=await initPerfStep(`Google Sheets: ${sheet}`,async()=>{
          return sheetFetchRows(webAppUrl,sheet);
        },{message:`Descargando ${sheet} desde Google Sheets...`,group:'network'});
        const sameAsCache=quoteCache?.signature&&quoteCache.signature===signature;
        if(!sameAsCache){
          await initPerfStep(`Aplicar ${sheet}`,async()=>{
            parseSheetsRows(rows);
            if(typeof simResetParams==='function')simResetParams();
            sheetCacheSave(webAppUrl,sheet,rows);
          },{message:`Procesando ${sheet}...`,group:'parse'});
        }else{
          initLog('live load unchanged',{sheet,rows:rows.length,elapsedMs:Date.now()-liveStartedAtMs});
        }
        document.getElementById('data-badge').textContent='live';
        document.getElementById('data-badge').className='badge badge-live';
        if(typeof setHdrTime==='function')setHdrTime();
        else document.getElementById('hdr-time').textContent=new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
        showToast('Datos cargados desde Google Sheets OK');
        initLog('live load applied',{
          sheet,
          rows:rows.length,
          expiries:Object.keys(ST.chain||{}).length,
          spot:ST.spot,
          elapsedMs:Date.now()-liveStartedAtMs,
          unchanged:!!sameAsCache
        });
      }catch(e){
        console.warn('Sheets auto-load failed:',e.message,'- usando datos demo');
        showToast('No se pudo conectar a Sheets - usando datos demo');
        await initPerfStep('Fallback demo',async()=>{
          generateMockAndRender();
          if(typeof simResetParams==='function')simResetParams();
          document.getElementById('data-badge').textContent='demo';
          document.getElementById('data-badge').className='badge badge-demo';
        },{message:'Usando datos demo por error de Sheets...',group:'fallback'});
        initLog('live load failed',{
          sheet,
          error:e.message,
          elapsedMs:Date.now()-liveStartedAtMs
        });
      }

      const histStartedAtMs=Date.now();
      try{
        initLog('history load start',{sheet:histSheet,source:'indexeddb-first'});
        await initPerfStep(`HMD cache/init: ${histSheet}`,async()=>{
          await window.historicosEnsureHmdData?.({webAppUrl,sheet:histSheet});
        },{message:`Preparando ${histSheet} desde IndexedDB...`,group:'cache'});
        initLog('history load applied',{
          sheet:histSheet,
          parsedRows:HIST.rows.length,
          elapsedMs:Date.now()-histStartedAtMs
        });
      }catch(e){
        console.warn('HMD auto-load failed:',e.message);
        initLog('history load failed',{
          sheet:histSheet,
          error:e.message,
          elapsedMs:Date.now()-histStartedAtMs
        });
      }

    }

    await initPerfStep('Warm-up de módulos',async()=>{
      await initPerfWarmupTabs();
    },{message:'Midiendo tiempo de carga por módulo...',group:'warmup'});

    INIT_PERF.final=true;
    initPerfSetMessage('Page Init Complete','Todos los módulos medidos');
    initPerfRender();
    initLog('page init complete',{elapsedMs:Date.now()-initStartedAtMs,steps:INIT_PERF.steps.length});
  }finally{
    initPerfSetLoading(false);
  }
})();
