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

(async function init(){
  selectSource('sheets');
  document.getElementById('spot-input').value=ST.spot;
  document.getElementById('c-r').value=(ST.rate*100).toFixed(1);
  document.getElementById('iv-r').value=(ST.rate*100).toFixed(1);
  document.getElementById('risk-free-rate').value=(ST.rate*100).toFixed(1);
  bindPrimaryUIEvents();

  // Apply saved theme immediately
  siteApplyTheme();

  // Restore saved strategies from localStorage
  if(ctrlLoad()){
    showToast(
      ctrlStrategies.length+' estrategia'+(ctrlStrategies.length>1?'s':'')+
      ' restaurada'+(ctrlStrategies.length>1?'s':'')+' OK'
    );
  }

  // Restore all module config from localStorage
  cfgLoad();
  cfgBindAutoSave();
  siteConfigChanged(); // sync site config to BS engine

  // Pre-fill local rate fields with site rate if they have no saved value
  ['hist-rate','ah-rate'].forEach(id=>{
    const el=document.getElementById(id);
    if(el&&(el.value===''||el.value==='0'))el.value=siteRate();
  });

  // Show demo data immediately so the page isn't blank while loading
  generateMockData();populateExpiries();renderChain();syncBSBar();
  if(typeof simResetParams==='function')simResetParams();

  // Then try to fetch real Sheets data
  const webAppUrl=document.getElementById('sh-webapp-url').value.trim();
  const sheet=document.getElementById('sh-sheetname').value.trim()||'DMD_Sabro';
  if(!webAppUrl){
    showToast('Sin URL configurada - mostrando datos demo');
    return;
  }
  showToast('Cargando datos de Google Sheets...');
  try{
    const res=await fetch(`${webAppUrl}?sheet=${encodeURIComponent(sheet)}`);
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const data=await res.json();
    if(data.error)throw new Error(data.error);
    const rows=data.values||data;
    if(!Array.isArray(rows)||!rows.length)throw new Error('Sin datos en la hoja');
    parseSheetsRows(rows);
    if(typeof simResetParams==='function')simResetParams();
    document.getElementById('data-badge').textContent='live';
    document.getElementById('data-badge').className='badge badge-live';
    if(typeof setHdrTime==='function')setHdrTime(); else document.getElementById('hdr-time').textContent=new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
    showToast('Datos cargados desde Google Sheets OK');
  }catch(e){
    console.warn('Sheets auto-load failed:',e.message,'- usando datos demo');
    showToast('No se pudo conectar a Sheets - usando datos demo');
    generateMockAndRender();
    if(typeof simResetParams==='function')simResetParams();
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
          if(statusEl)statusEl.textContent=`${HIST.rows.length} registros - ${new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}`;
        }
      })
      .catch(e=>console.warn('HMD auto-load failed:',e.message));
  }
})();
