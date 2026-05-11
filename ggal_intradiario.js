const INTRA={
  allRows:[],
  rows:[],
  strikes:[],
  tickers:[],
  rawHours:[],
  hours:[],
  fetchedAt:null,
  lastSignature:'',
  loading:false,
  selectedHour:'',
  selectedComparisons:[],
  selectedCrosses:[],
  crossGroupPrefs:{},
  pendingCrossSourceId:'',
  selectionsLoaded:false,
  dragSelectionId:'',
  charts:{last:null,strategy:null},
};

const INTRA_SERIAL_EPOCH_UTC=Date.UTC(1899,11,30);
const INTRA_DB_NAME='ggal_intradiario_cache_v2';
const INTRA_DB_META_STORE='intradiario_cache_meta';
const INTRA_DB_ROWS_STORE='intradiario_cache_rows';
let intraLoaderTimer=null;
let intraLoaderStartedAt=0;

function intraCacheKey(webAppUrl,sheet){
  return `${webAppUrl||''}::${sheet||''}`;
}

function intraDbOpen(){
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){
      reject(new Error('IndexedDB no disponible'));
      return;
    }
    const request=indexedDB.open(INTRA_DB_NAME,1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(INTRA_DB_META_STORE)){
        db.createObjectStore(INTRA_DB_META_STORE,{keyPath:'id'});
      }
      if(!db.objectStoreNames.contains(INTRA_DB_ROWS_STORE)){
        const rowsStore=db.createObjectStore(INTRA_DB_ROWS_STORE,{keyPath:'id'});
        rowsStore.createIndex('cacheKey','cacheKey',{unique:false});
        rowsStore.createIndex('sheet','sheet',{unique:false});
        rowsStore.createIndex('time','time',{unique:false});
        rowsStore.createIndex('type','type',{unique:false});
        rowsStore.createIndex('ticker','ticker',{unique:false});
      }
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('No se pudo abrir IndexedDB'));
  });
}

function intraDbRead(webAppUrl,sheet){
  return new Promise((resolve,reject)=>{
    intraDbOpen().then(db=>{
      const cacheKey=intraCacheKey(webAppUrl,sheet);
      const tx=db.transaction([INTRA_DB_META_STORE,INTRA_DB_ROWS_STORE],'readonly');
      const metaStore=tx.objectStore(INTRA_DB_META_STORE);
      const rowsStore=tx.objectStore(INTRA_DB_ROWS_STORE);
      const metaReq=metaStore.get(cacheKey);
      const rowsReq=rowsStore.index('cacheKey').getAll(cacheKey);
      tx.oncomplete=()=>{
        db.close();
        const meta=metaReq.result||null;
        const rows=(rowsReq.result||[]).sort((a,b)=>(a.rowNumber||0)-(b.rowNumber||0));
        if(!meta||!rows.length){
          resolve(null);
          return;
        }
        resolve({
          ...meta,
          rows:rows.map(entry=>entry.data),
        });
      };
      tx.onerror=()=>reject(tx.error||new Error('Transaccion IndexedDB fallida'));
      metaReq.onerror=()=>reject(metaReq.error||new Error('No se pudo leer metadata de IndexedDB'));
      rowsReq.onerror=()=>reject(rowsReq.error||new Error('No se pudo leer filas de IndexedDB'));
    }).catch(reject);
  });
}

function intraDbWrite(webAppUrl,sheet,rows,signature=''){
  return new Promise((resolve,reject)=>{
    intraDbOpen().then(db=>{
      const cacheKey=intraCacheKey(webAppUrl,sheet);
      const tx=db.transaction([INTRA_DB_META_STORE,INTRA_DB_ROWS_STORE],'readwrite');
      const metaStore=tx.objectStore(INTRA_DB_META_STORE);
      const rowsStore=tx.objectStore(INTRA_DB_ROWS_STORE);
      metaStore.put({
        id:cacheKey,
        sheet,
        webAppUrl,
        signature,
        fetchedAt:Date.now(),
        rowCount:Array.isArray(rows)?rows.length:0,
      });
      (rows||[]).forEach((row,rowNumber)=>{
        rowsStore.put({
          id:`${cacheKey}::${rowNumber}`,
          cacheKey,
          sheet,
          time:row.time||'',
          type:row.type||'',
          ticker:row.ticker||'',
          rowNumber,
          data:row,
        });
      });
      tx.oncomplete=()=>{ db.close(); resolve(true); };
      tx.onerror=()=>reject(tx.error||new Error('No se pudo guardar en IndexedDB'));
      tx.onabort=()=>reject(tx.error||new Error('Guardado en IndexedDB abortado'));
    }).catch(reject);
  });
}

function intraDbDelete(webAppUrl,sheet){
  return new Promise((resolve,reject)=>{
    intraDbOpen().then(db=>{
      const cacheKey=intraCacheKey(webAppUrl,sheet);
      const tx=db.transaction([INTRA_DB_META_STORE,INTRA_DB_ROWS_STORE],'readwrite');
      const metaStore=tx.objectStore(INTRA_DB_META_STORE);
      const rowsStore=tx.objectStore(INTRA_DB_ROWS_STORE);
      metaStore.delete(cacheKey);
      const range=IDBKeyRange.only(cacheKey);
      const cursorReq=rowsStore.index('cacheKey').openKeyCursor(range);
      cursorReq.onsuccess=event=>{
        const cursor=event.target.result;
        if(!cursor)return;
        rowsStore.delete(cursor.primaryKey);
        cursor.continue();
      };
      cursorReq.onerror=()=>reject(cursorReq.error||new Error('No se pudo limpiar filas de IndexedDB'));
      tx.oncomplete=()=>{ db.close(); resolve(true); };
      tx.onerror=()=>reject(tx.error||new Error('No se pudo limpiar IndexedDB'));
      tx.onabort=()=>reject(tx.error||new Error('Limpieza IndexedDB abortada'));
    }).catch(reject);
  });
}

function intraHydrateRows(rows){
  const parsed=Array.isArray(rows)?rows.slice():[];
  const hourSet=new Set();
  parsed.forEach(row=>{
    if(row?.time)hourSet.add(row.time);
  });
  INTRA.allRows=parsed;
  INTRA.rawHours=[...hourSet].map(intraNormalizeTime).filter(Boolean).sort((a,b)=>a.localeCompare(b));
  if(!INTRA.selectedHour||(!INTRA.rawHours.includes(INTRA.selectedHour)&&INTRA.selectedHour!=='__all__')){
    INTRA.selectedHour='__all__';
  }
  intraRefreshHours();
  intraApplyScope();
}

function intraRowsLookParsed(rows){
  if(!Array.isArray(rows)||!rows.length)return false;
  const sample=rows[0];
  return !!(sample&&typeof sample==='object'&&(
    'ticker' in sample ||
    'type' in sample ||
    'time' in sample ||
    'last' in sample
  ));
}

async function intraLoadFromCache(){
  const webAppUrl=document.getElementById('sh-webapp-url')?.value.trim();
  const sheet=intraSheetName();
  if(!webAppUrl){
    intraLog('indexeddb skipped',{sheet,reason:'missing webAppUrl'});
    return false;
  }
  let cached=null;
  try{
    cached=await intraDbRead(webAppUrl,sheet);
  }catch(error){
    intraLog('indexeddb read failed',{sheet,message:error?.message||String(error)});
    return false;
  }
  if(!cached?.rows?.length){
    intraLog('indexeddb miss',{sheet});
    return false;
  }
  if(!intraRowsLookParsed(cached.rows)){
    intraLog('indexeddb incompatible cache ignored',{sheet,reason:'rows are not parsed objects'});
    await intraClearCache();
    return false;
  }
  intraHydrateRows(cached.rows);
  INTRA.fetchedAt=cached.fetchedAt?new Date(cached.fetchedAt):null;
  const status=document.getElementById('intra-status');
  if(status){
    const stamp=INTRA.fetchedAt
      ? INTRA.fetchedAt.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})
      : '--';
    status.textContent=`${INTRA.rows.length} registros en alcance | cache IndexedDB | ${stamp}`;
  }
  intraLog('indexeddb restored',{
    sheet,
    cachedRows:INTRA.allRows.length,
    scopedRows:INTRA.rows.length,
    fetchedAt:cached.fetchedAt||null
  });
  return true;
}

async function intraClearCache(){
  const webAppUrl=document.getElementById('sh-webapp-url')?.value.trim();
  const sheet=intraSheetName();
  if(!webAppUrl)return;
  try{
    await intraDbDelete(webAppUrl,sheet);
    intraLog('indexeddb cleared',{sheet});
  }catch(error){
    intraLog('indexeddb clear failed',{sheet,message:error?.message||String(error)});
  }
}

function intraSheetName(){
  return document.getElementById('sh-sheetname-intra')?.value.trim()||'Intradiario';
}

function intraColIndex(id,fallback){
  return colLetterToIndex(document.getElementById(id)?.value||fallback);
}

function intraLog(event,details={}){
  const now=new Date();
  const stamp=now.toLocaleTimeString('es-AR',{hour12:false});
  console.info(`[intradiario ${stamp}] ${event}`,details);
}

function intraGetMode(){
  const v=(localStorage.getItem('intra_mode')||'').trim();
  return v==='charts'?'charts':'table';
}

function intraSetMode(mode){
  const next=mode==='charts'?'charts':'table';
  localStorage.setItem('intra_mode',next);
  intraApplyMode();
}

function intraSelectionsStorageKey(){
  return 'intra_compare_selections';
}

function intraCreateSelectionId(){
  return `cmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
}

function intraCrossPairKey(leftId,rightId){
  return [leftId||'',rightId||''].sort().join('::');
}

function intraSelectionDisplay(selection){
  if(!selection)return '--';
  if(selection.useTicker)return `${intraTypeLabel(selection.type)} · ${selection.asset}`;
  const parsed=parseFloat(selection.asset);
  return `${intraTypeLabel(selection.type)} · ${Number.isFinite(parsed)?fmtStrike(parsed):selection.asset}`;
}

function intraFindSelection(id){
  return (INTRA.selectedComparisons||[]).find(item=>item.id===id)||null;
}

function intraFindSelectionByComparable(type,asset){
  return (INTRA.selectedComparisons||[]).find(item=>item.type===type&&item.asset===asset)||null;
}

function intraSelectionLegend(selection,selections){
  const base=intraSelectionDisplay(selection);
  const matches=(selections||[]).filter(item=>intraSelectionDisplay(item)===base);
  if(matches.length<=1)return base;
  const ordinal=matches.findIndex(item=>item.id===selection.id)+1;
  return `${base} #${ordinal}`;
}

function intraLoadSelections(){
  if(INTRA.selectionsLoaded)return;
  INTRA.selectionsLoaded=true;
  try{
    const raw=localStorage.getItem(intraSelectionsStorageKey());
    const parsed=JSON.parse(raw||'[]');
    if(Array.isArray(parsed)){
      INTRA.selectedComparisons=parsed
        .filter(item=>item&&typeof item==='object'&&item.type&&item.asset)
        .map(item=>({
          type:String(item.type),
          asset:String(item.asset),
          useTicker:!!item.useTicker,
          visible:item.visible!==false,
          id:String(item.id||intraCreateSelectionId()),
        }));
      INTRA.selectedCrosses=[];
      INTRA.crossGroupPrefs={};
      return;
    }
    if(!parsed||typeof parsed!=='object'){
      INTRA.selectedComparisons=[];
      INTRA.selectedCrosses=[];
      INTRA.crossGroupPrefs={};
      return;
    }
    INTRA.selectedComparisons=(Array.isArray(parsed.comparisons)?parsed.comparisons:[])
      .filter(item=>item&&typeof item==='object'&&item.type&&item.asset)
      .map(item=>({
        type:String(item.type),
        asset:String(item.asset),
        useTicker:!!item.useTicker,
        visible:item.visible!==false,
        id:String(item.id||intraCreateSelectionId()),
      }));
    const validIds=new Set(INTRA.selectedComparisons.map(item=>item.id));
    INTRA.selectedCrosses=(Array.isArray(parsed.crosses)?parsed.crosses:[])
      .filter(item=>item&&typeof item==='object'&&item.leftId&&item.rightId)
      .map(item=>({
        id:String(item.id||`cross_${intraCrossPairKey(item.leftId,item.rightId)}`),
        leftId:String(item.leftId),
        rightId:String(item.rightId),
        visible:item.visible!==false,
      }))
      .filter(item=>item.leftId!==item.rightId&&validIds.has(item.leftId)&&validIds.has(item.rightId));
    INTRA.crossGroupPrefs=(parsed.groupPrefs&&typeof parsed.groupPrefs==='object')?parsed.groupPrefs:{};
  }catch{
    INTRA.selectedComparisons=[];
    INTRA.selectedCrosses=[];
    INTRA.crossGroupPrefs={};
  }
}

function intraSaveSelections(){
  try{
    localStorage.setItem(intraSelectionsStorageKey(),JSON.stringify(
      {
        comparisons:INTRA.selectedComparisons.map(item=>({
          id:item.id,
          type:item.type,
          asset:item.asset,
          useTicker:!!item.useTicker,
          visible:item.visible!==false,
        })),
        crosses:INTRA.selectedCrosses.map(item=>({
          id:item.id,
          leftId:item.leftId,
          rightId:item.rightId,
          visible:item.visible!==false,
        })),
        groupPrefs:INTRA.crossGroupPrefs,
      }
    ));
  }catch{}
}

function intraHasSelections(){
  return Array.isArray(INTRA.selectedComparisons)&&INTRA.selectedComparisons.length>0;
}

function intraVisibleSelections(){
  return (INTRA.selectedComparisons||[]).filter(item=>item.visible!==false);
}

function intraVisibleCrosses(){
  const visibleIds=new Set(intraVisibleSelections().map(item=>item.id));
  return (INTRA.selectedCrosses||[]).filter(item=>item.visible!==false&&visibleIds.has(item.leftId)&&visibleIds.has(item.rightId));
}

function intraHasCrosses(){
  return intraVisibleCrosses().length>0;
}

function intraActiveSelectionIds(){
  const ids=new Set();
  intraVisibleCrosses().forEach(cross=>{
    ids.add(cross.leftId);
    ids.add(cross.rightId);
  });
  return ids;
}

function intraActiveSelections(){
  const ids=intraActiveSelectionIds();
  return (INTRA.selectedComparisons||[]).filter(item=>ids.has(item.id));
}

function intraCrossGroupPref(leftId){
  const raw=(INTRA.crossGroupPrefs&&INTRA.crossGroupPrefs[leftId])||{};
  return {
    generated:raw.generated===true,
    visible:raw.visible!==false,
    kind:['price','bull','bear','rc','ri','straddle'].includes(raw.kind)?raw.kind:'price',
  };
}

function intraSetCrossGroupPref(leftId,patch){
  if(!leftId)return;
  const current=intraCrossGroupPref(leftId);
  INTRA.crossGroupPrefs={
    ...(INTRA.crossGroupPrefs||{}),
    [leftId]:{...current,...patch}
  };
}

function intraGetStrategyKind(){
  const raw=(document.getElementById('intra-strategy-kind')?.value||'bull').trim().toLowerCase();
  return ['bull','bear','rc','ri','straddle'].includes(raw)?raw:'bull';
}

function intraStrategyLabel(kind){
  return kind==='bear'?'Bear'
    :kind==='rc'?'RC'
    :kind==='ri'?'RI'
    :kind==='straddle'?'Straddle'
    :'Bull';
}

function intraStrategyCompute(kind,s1,s2){
  if(s1==null||s2==null||!isFinite(s1)||!isFinite(s2))return null;
  if(kind==='bear')return s2-s1;
  if(kind==='rc')return s2===0?null:s1/s2;
  if(kind==='ri')return s1===0?null:s2/s1;
  if(kind==='straddle')return s1+s2;
  return s1-s2;
}

function intraSelectionMatchesRow(selection,row){
  if(!selection||!row)return false;
  if(row.type!==selection.type)return false;
  if(selection.useTicker)return (row.ticker||'')===selection.asset;
  const strikeFilter=parseFloat(selection.asset);
  return Number.isFinite(strikeFilter)&&row.strike===strikeFilter;
}

function intraSelectedRows(sourceRows=INTRA.rows){
  const activeSelections=intraActiveSelections();
  if(!activeSelections.length)return [];
  return (sourceRows||[]).filter(row=>activeSelections.some(selection=>intraSelectionMatchesRow(selection,row)));
}

function intraRenderSelections(){
  intraLoadSelections();
  const panel=document.getElementById('intra-selection-panel');
  const list=document.getElementById('intra-selection-list');
  const crossWrap=document.getElementById('intra-cross-list-wrap');
  const crossList=document.getElementById('intra-cross-list');
  const clearBtn=document.getElementById('intra-clear-selections-btn');
  if(!panel||!list||!crossWrap||!crossList||!clearBtn)return;
  if(!INTRA.selectedComparisons.length){
    panel.style.display='none';
    list.innerHTML='';
    crossWrap.style.display='none';
    crossList.innerHTML='';
    return;
  }
  panel.style.display='block';
  clearBtn.disabled=!INTRA.selectedComparisons.length;
  clearBtn.style.opacity=clearBtn.disabled?'0.6':'1';
  clearBtn.style.cursor=clearBtn.disabled?'not-allowed':'pointer';
  list.innerHTML=INTRA.selectedComparisons.map((selection)=>`
    <div
      draggable="true"
      ondragstart="intraOnSelectionDragStart('${selection.id.replace(/'/g,"\\'")}',event)"
      ondragover="intraOnSelectionDragOver(event)"
      ondrop="intraOnSelectionDrop('${selection.id.replace(/'/g,"\\'")}',event)"
      ondragend="intraOnSelectionDragEnd()"
      style="display:flex;align-items:center;gap:8px;background:${selection.visible===false?'rgba(25,31,40,.65)':'var(--surface2)'};border:1px solid ${selection.visible===false?'var(--border)':'var(--border2)'};border-radius:999px;padding:6px 10px;cursor:grab"
    >
      <span title="Arrastrar para reordenar" style="font-size:12px;color:var(--dim);letter-spacing:-1px;user-select:none">⋮⋮</span>
      <span style="font-family:var(--mono);font-size:11px;color:var(--text)"><span style="color:${intraTypeColor(selection.type)};font-weight:700">${intraTypeLabel(selection.type)}</span> · ${selection.useTicker?selection.asset:(Number.isFinite(parseFloat(selection.asset))?fmtStrike(parseFloat(selection.asset)):selection.asset)}</span>
      <button type="button" onclick="intraToggleSelectionVisibility('${selection.id.replace(/'/g,"\\'")}')" style="border:1px solid ${selection.visible===false?'var(--border)':'rgba(255,215,90,.35)'};background:${selection.visible===false?'transparent':'rgba(255,215,90,.10)'};color:${selection.visible===false?'var(--dim)':'var(--amber)'};border-radius:999px;padding:1px 8px;cursor:pointer;font-size:10px;line-height:18px">${selection.visible===false?'No visible':'Visible'}</button>
      <button type="button" onclick="intraRemoveSelection('${selection.id.replace(/'/g,"\\'")}')" style="border:1px solid var(--border);background:transparent;color:var(--dim);border-radius:999px;padding:0 7px;cursor:pointer;font-size:11px;line-height:18px">×</button>
    </div>`).join('');
  if(!INTRA.selectedCrosses.length){
    crossWrap.style.display='none';
    crossList.innerHTML='';
    return;
  }
  crossWrap.style.display='block';
  crossList.innerHTML=INTRA.selectedCrosses.map((cross)=>{
    const left=intraFindSelection(cross.leftId);
    const right=intraFindSelection(cross.rightId);
    if(!left||!right)return '';
    const active=left.visible!==false&&right.visible!==false;
    return `
      <div style="display:flex;align-items:center;gap:8px;background:${active?'rgba(255,215,90,.08)':'rgba(25,31,40,.65)'};border:1px solid ${active?'rgba(255,215,90,.22)':'var(--border)'};border-radius:999px;padding:6px 10px">
        <span style="font-family:var(--mono);font-size:11px;color:${active?'var(--text)':'var(--dim)'}">${intraSelectionDisplay(left)} -> ${intraSelectionDisplay(right)}</span>
        <button type="button" onclick="intraRemoveCross('${cross.id.replace(/'/g,"\\'")}')" style="border:1px solid var(--border);background:transparent;color:var(--dim);border-radius:999px;padding:0 7px;cursor:pointer;font-size:11px;line-height:18px">Ã—</button>
      </div>`;
  }).join('');
}

function intraUpdateAddButton(){
  const btn=document.getElementById('intra-add-btn');
  const atmBtn=document.getElementById('intra-add-atm-btn');
  const type=document.getElementById('intra-filter-type')?.value||'all';
  const asset=document.getElementById('intra-filter-strike')?.value||'';
  if(!btn)return;
  btn.disabled=!(type!=='all'&&asset);
  btn.style.opacity=btn.disabled?'0.6':'1';
  btn.style.cursor=btn.disabled?'not-allowed':'pointer';
  if(atmBtn){
    const enabled=intraAtmStrikeCandidates().length>0;
    atmBtn.disabled=!enabled;
    atmBtn.style.opacity=enabled?'1':'0.6';
    atmBtn.style.cursor=enabled?'pointer':'not-allowed';
  }
}

function intraOnBuilderChange(){
  intraUpdateAddButton();
}

function intraAddSelection(){
  intraLoadSelections();
  const type=document.getElementById('intra-filter-type')?.value||'all';
  const asset=document.getElementById('intra-filter-strike')?.value||'';
  if(type==='all'||!asset)return;
  const useTicker=type==='future'||type==='underlying'||type==='caucion';
  const id=intraCreateSelectionId();
  if(false&&INTRA.selectedComparisons.some(item=>item.id===id)){
    showToast('Ese subtipo ya está agregado');
    return;
  }
  INTRA.selectedComparisons.push({type,asset,useTicker,visible:true,id});
  intraSaveSelections();
  intraRenderSelections();
  intraUpdateAddButton();
  renderIntradiario();
}

function intraToggleSelectionVisibility(id){
  intraLoadSelections();
  INTRA.selectedComparisons=INTRA.selectedComparisons.map(item=>item.id===id?{...item,visible:item.visible===false}:item);
  intraSaveSelections();
  intraRenderSelections();
  renderIntradiario();
}

function intraCreateOrUpdateCross(sourceId,targetId){
  intraLoadSelections();
  if(!sourceId||!targetId||sourceId===targetId)return;
  if(!intraFindSelection(sourceId)||!intraFindSelection(targetId))return;
  const pairKey=intraCrossPairKey(sourceId,targetId);
  const existingIndex=INTRA.selectedCrosses.findIndex(item=>intraCrossPairKey(item.leftId,item.rightId)===pairKey);
  if(existingIndex>=0){
    INTRA.selectedCrosses[existingIndex]={
      ...INTRA.selectedCrosses[existingIndex],
      leftId:sourceId,
      rightId:targetId,
    };
  }else{
    INTRA.selectedCrosses.push({
      id:`cross_${pairKey}`,
      leftId:sourceId,
      rightId:targetId,
    });
  }
  intraSaveSelections();
  intraRenderSelections();
  renderIntradiario();
}

function intraRemoveCross(id){
  intraLoadSelections();
  INTRA.selectedCrosses=INTRA.selectedCrosses.filter(item=>item.id!==id);
  intraSaveSelections();
  intraRenderSelections();
  renderIntradiario();
}

function intraClearSelections(){
  intraLoadSelections();
  INTRA.selectedComparisons=[];
  INTRA.selectedCrosses=[];
  intraSaveSelections();
  intraRenderSelections();
  renderIntradiario();
}

function intraOnSelectionDragStart(id,event){
  INTRA.dragSelectionId=id;
  if(event?.dataTransfer){
    event.dataTransfer.effectAllowed='copyMove';
    event.dataTransfer.setData('text/plain',id);
  }
}

function intraOnSelectionDragOver(event){
  event.preventDefault();
  if(event?.dataTransfer)event.dataTransfer.dropEffect='copy';
}

function intraOnSelectionDrop(targetId,event){
  event.preventDefault();
  const sourceId=INTRA.dragSelectionId||(event?.dataTransfer?.getData('text/plain')||'');
  intraCreateOrUpdateCross(sourceId,targetId);
  INTRA.dragSelectionId='';
}

function intraOnSelectionDragEnd(){
  INTRA.dragSelectionId='';
}

function intraRemoveSelection(id){
  intraLoadSelections();
  INTRA.selectedComparisons=INTRA.selectedComparisons.filter(item=>item.id!==id);
  INTRA.selectedCrosses=INTRA.selectedCrosses.filter(item=>item.leftId!==id&&item.rightId!==id);
  if(INTRA.pendingCrossSourceId===id)INTRA.pendingCrossSourceId='';
  intraSaveSelections();
  intraRenderSelections();
  renderIntradiario();
}

function intraOnSelectionDragStart(){ return; }
function intraOnSelectionDragOver(event){ if(event)event.preventDefault(); }
function intraOnSelectionDrop(){ return; }
function intraOnSelectionDragEnd(){ return; }

function intraToggleCrossBuilderSelection(id){
  intraLoadSelections();
  const selection=intraFindSelection(id);
  if(!selection)return;
  if(INTRA.pendingCrossSourceId&&INTRA.pendingCrossSourceId!==id){
    intraCreateOrUpdateCross(INTRA.pendingCrossSourceId,id);
    return;
  }
  INTRA.pendingCrossSourceId=INTRA.pendingCrossSourceId===id?'':id;
  intraRenderSelections();
}

function intraAddComparableSelection(type,asset,useTicker=false){
  intraLoadSelections();
  if(!type||type==='all'||!asset)return false;
  if(intraFindSelectionByComparable(type,String(asset))){
    return false;
  }
  INTRA.selectedComparisons.push({
    type,
    asset:String(asset),
    useTicker:!!useTicker,
    visible:true,
    id:intraCreateSelectionId()
  });
  return true;
}

function intraAddSelection(){
  intraLoadSelections();
  const type=document.getElementById('intra-filter-type')?.value||'all';
  const asset=document.getElementById('intra-filter-strike')?.value||'';
  if(type==='all'||!asset)return;
  if(intraFindSelectionByComparable(type,asset)){
    showToast('Ese comparable ya esta agregado');
    return;
  }
  const useTicker=type==='future'||type==='underlying'||type==='caucion';
  intraAddComparableSelection(type,asset,useTicker);
  intraSaveSelections();
  intraRenderSelections();
  intraUpdateAddButton();
  renderIntradiario();
}

function intraAddAtmSelections(){
  intraLoadSelections();
  const strikes=intraAtmStrikeCandidates();
  if(!strikes.length){
    showToast('No pude determinar strikes ATM con los datos actuales');
    return;
  }
  let added=0;
  strikes.forEach(strike=>{
    if(intraAddComparableSelection('call',String(strike),false))added+=1;
    if(intraAddComparableSelection('put',String(strike),false))added+=1;
  });
  if(!added){
    showToast('Las bases ATM ya estaban agregadas');
    return;
  }
  intraSaveSelections();
  intraRenderSelections();
  intraUpdateAddButton();
  renderIntradiario();
  showToast(`ATM agregado: ${added} comparable(s)`);
}

function intraCreateOrUpdateCross(sourceId,targetId){
  intraLoadSelections();
  INTRA.pendingCrossSourceId='';
  if(!sourceId||!targetId||sourceId===targetId)return;
  const left=intraFindSelection(sourceId);
  const right=intraFindSelection(targetId);
  if(!left||!right)return;
  const pairKey=intraCrossPairKey(sourceId,targetId);
  const exists=INTRA.selectedCrosses.some(item=>intraCrossPairKey(item.leftId,item.rightId)===pairKey);
  if(exists){
    showToast('Ese cruce ya existe');
    intraRenderSelections();
    return;
  }
  INTRA.selectedCrosses.push({
    id:`cross_${pairKey}`,
    leftId:sourceId,
    rightId:targetId,
    visible:true,
  });
  intraSaveSelections();
  intraRenderSelections();
  renderIntradiario();
}

function intraRemoveCross(id){
  intraLoadSelections();
  INTRA.selectedCrosses=INTRA.selectedCrosses.filter(item=>item.id!==id);
  intraSaveSelections();
  intraRenderSelections();
  renderIntradiario();
}

function intraClearSelections(){
  intraLoadSelections();
  INTRA.selectedComparisons=[];
  INTRA.selectedCrosses=[];
  INTRA.pendingCrossSourceId='';
  intraSaveSelections();
  intraRenderSelections();
  renderIntradiario();
}

function intraClearComparables(){
  intraClearSelections();
}

function intraClearCrosses(){
  intraLoadSelections();
  INTRA.selectedCrosses=[];
  INTRA.crossGroupPrefs={};
  INTRA.pendingCrossSourceId='';
  intraSaveSelections();
  intraRenderSelections();
  renderIntradiario();
}

function intraRemoveCrossGroup(leftId){
  intraLoadSelections();
  INTRA.selectedCrosses=INTRA.selectedCrosses.filter(item=>item.leftId!==leftId);
  if(INTRA.crossGroupPrefs&&INTRA.crossGroupPrefs[leftId]){
    const next={...(INTRA.crossGroupPrefs||{})};
    delete next[leftId];
    INTRA.crossGroupPrefs=next;
  }
  if(INTRA.pendingCrossSourceId===leftId)INTRA.pendingCrossSourceId='';
  intraSaveSelections();
  intraRenderSelections();
  renderIntradiario();
}

function intraToggleCrossGroupVisibility(leftId){
  intraLoadSelections();
  const group=intraVisibleCrosses().filter(item=>item.leftId===leftId);
  if(!group.length&&!(INTRA.selectedCrosses||[]).some(item=>item.leftId===leftId))return;
  const pref=intraCrossGroupPref(leftId);
  intraSetCrossGroupPref(leftId,{visible:!pref.visible});
  intraSaveSelections();
  intraRenderSelections();
  renderIntradiario();
}

function intraGenerateCrossGroupChart(leftId){
  intraLoadSelections();
  if(!(INTRA.selectedCrosses||[]).some(item=>item.leftId===leftId))return;
  intraSetCrossGroupPref(leftId,{generated:true});
  intraSaveSelections();
  intraRenderSelections();
  renderIntradiario();
}

function intraRemoveSelection(id){
  intraLoadSelections();
  INTRA.selectedComparisons=INTRA.selectedComparisons.filter(item=>item.id!==id);
  INTRA.selectedCrosses=INTRA.selectedCrosses.filter(item=>item.leftId!==id&&item.rightId!==id);
  if(INTRA.pendingCrossSourceId===id)INTRA.pendingCrossSourceId='';
  intraSaveSelections();
  intraRenderSelections();
  renderIntradiario();
}

function intraRenderSelections(){
  intraLoadSelections();
  const panel=document.getElementById('intra-selection-panel');
  const list=document.getElementById('intra-selection-list');
  const crossWrap=document.getElementById('intra-cross-list-wrap');
  const crossList=document.getElementById('intra-cross-list');
  const clearComparablesBtn=document.getElementById('intra-clear-comparables-btn');
  const clearCrossesBtn=document.getElementById('intra-clear-crosses-btn');
  const builderStatus=document.getElementById('intra-cross-builder-status');
  if(!panel||!list||!crossWrap||!crossList||!clearComparablesBtn||!clearCrossesBtn||!builderStatus)return;
  if(!INTRA.selectedComparisons.length){
    panel.style.display='none';
    list.innerHTML='';
    crossWrap.style.display='none';
    crossList.innerHTML='';
    builderStatus.textContent='';
    return;
  }
  panel.style.display='block';
  clearComparablesBtn.disabled=!INTRA.selectedComparisons.length;
  clearComparablesBtn.style.opacity=clearComparablesBtn.disabled?'0.6':'1';
  clearComparablesBtn.style.cursor=clearComparablesBtn.disabled?'not-allowed':'pointer';
  clearCrossesBtn.disabled=!INTRA.selectedCrosses.length;
  clearCrossesBtn.style.opacity=clearCrossesBtn.disabled?'0.6':'1';
  clearCrossesBtn.style.cursor=clearCrossesBtn.disabled?'not-allowed':'pointer';
  const pendingSelection=INTRA.pendingCrossSourceId?intraFindSelection(INTRA.pendingCrossSourceId):null;
  builderStatus.textContent=pendingSelection
    ? `Seleccionado: ${intraSelectionDisplay(pendingSelection)}. Hacé click en otra pata para crear el cruce.`
    : 'Hacé click en una pata y luego en otra para crear un cruce.';
  list.innerHTML=INTRA.selectedComparisons.map((selection)=>`
    <div
      onclick="intraToggleCrossBuilderSelection('${selection.id.replace(/'/g,"\\'")}')"
      style="display:flex;align-items:center;gap:8px;background:${selection.visible===false?'rgba(25,31,40,.65)':(INTRA.pendingCrossSourceId===selection.id?'rgba(255,215,90,.12)':'var(--surface2)')};border:1px solid ${INTRA.pendingCrossSourceId===selection.id?'rgba(255,215,90,.65)':(selection.visible===false?'var(--border)':'var(--border2)')};box-shadow:${INTRA.pendingCrossSourceId===selection.id?'0 0 0 1px rgba(255,215,90,.22) inset, 0 0 18px rgba(255,215,90,.10)':'none'};transform:${INTRA.pendingCrossSourceId===selection.id?'translateY(-1px)':'none'};border-radius:999px;padding:6px 10px;cursor:pointer"
    >
      <span title="Click para elegir y cruzar con otro comparable" style="font-size:13px;font-weight:700;color:var(--amber);user-select:none;text-shadow:0 0 8px rgba(255,215,90,.18)">+</span>
      <span style="font-family:var(--mono);font-size:11px;color:${selection.visible===false?'var(--dim)':intraTypeColor(selection.type)}">${intraSelectionDisplay(selection)}</span>
      <button type="button" title="${selection.visible===false?'No visible':'Visible'}" onclick="event.stopPropagation();intraToggleSelectionVisibility('${selection.id.replace(/'/g,"\\'")}')" style="border:1px solid ${selection.visible===false?'var(--border)':'rgba(255,215,90,.35)'};background:${selection.visible===false?'transparent':'rgba(255,215,90,.10)'};color:${selection.visible===false?'var(--dim)':'var(--amber)'};border-radius:999px;padding:1px 8px;cursor:pointer;font-size:12px;font-weight:700;line-height:18px">${selection.visible===false?'—':'👁️'}</button>
      <button type="button" onclick="event.stopPropagation();intraRemoveSelection('${selection.id.replace(/'/g,"\\'")}')" style="border:1px solid var(--border);background:transparent;color:var(--dim);border-radius:999px;padding:0 7px;cursor:pointer;font-size:11px;line-height:18px">&times;</button>
    </div>`).join('');
  if(!INTRA.selectedCrosses.length){
    crossWrap.style.display='none';
    crossList.innerHTML='';
    return;
  }
  crossWrap.style.display='block';
  const grouped=new Map();
  INTRA.selectedCrosses.forEach(cross=>{
    const left=intraFindSelection(cross.leftId);
    const right=intraFindSelection(cross.rightId);
    if(!left||!right)return;
    const key=left.id;
    if(!grouped.has(key))grouped.set(key,{left,crosses:[]});
    grouped.get(key).crosses.push({cross,right});
  });
  crossList.innerHTML=[...grouped.values()].map(group=>{
    const left=group.left;
    const prefs=intraCrossGroupPref(left.id);
    const groupVisible=prefs.visible!==false;
    const rows=group.crosses.map(({cross,right})=>{
      const active=cross.visible!==false&&left.visible!==false&&right.visible!==false;
      return `
        <div style="display:flex;align-items:center;gap:8px;background:${active?'rgba(255,215,90,.08)':'rgba(25,31,40,.65)'};border:1px solid ${active?'rgba(255,215,90,.22)':'var(--border)'};border-radius:999px;padding:6px 10px">
          <span style="font-family:var(--mono);font-size:11px;color:${active?'var(--text)':'var(--dim)'}"><span style="color:${active?intraTypeColor(right.type):'var(--dim)'};font-weight:700">${intraTypeLabel(right.type)}</span> · ${right.useTicker?right.asset:(Number.isFinite(parseFloat(right.asset))?fmtStrike(parseFloat(right.asset)):right.asset)}</span>
          <button type="button" onclick="intraRemoveCross('${cross.id.replace(/'/g,"\\'")}')" style="border:1px solid var(--border);background:transparent;color:var(--dim);border-radius:999px;padding:0 7px;cursor:pointer;font-size:11px;line-height:18px">&times;</button>
        </div>`;
    }).join('');
    return `
      <div style="display:flex;flex-direction:column;gap:8px;min-width:260px;padding:10px 12px;border:1px solid ${groupVisible?'var(--border2)':'var(--border)'};border-radius:12px;background:${groupVisible?'rgba(19,25,32,.45)':'rgba(19,25,32,.30)'};opacity:${groupVisible?'1':'0.78'}">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)">Origen</div>
          <div style="display:flex;align-items:center;gap:6px">
            ${prefs.generated
              ? `<button type="button" title="${groupVisible?'Visible':'No visible'}" onclick="intraToggleCrossGroupVisibility('${left.id.replace(/'/g,"\\'")}')" style="border:1px solid ${groupVisible?'rgba(255,215,90,.35)':'var(--border)'};background:${groupVisible?'rgba(255,215,90,.10)':'transparent'};color:${groupVisible?'var(--amber)':'var(--dim)'};border-radius:999px;padding:1px 8px;cursor:pointer;font-size:12px;font-weight:700;line-height:18px">${groupVisible?'👁️':'—'}</button>`
              : `<button type="button" title="Generar gráfico para este origen" onclick="intraGenerateCrossGroupChart('${left.id.replace(/'/g,"\\'")}')" style="border:1px solid rgba(255,215,90,.35);background:transparent;color:var(--amber);border-radius:999px;padding:1px 10px;cursor:pointer;font-size:10px;font-weight:700;line-height:18px">Generar</button>`
            }
            <button type="button" title="Quitar todos los cruces de este origen" onclick="intraRemoveCrossGroup('${left.id.replace(/'/g,"\\'")}')" style="border:1px solid var(--border);background:transparent;color:var(--dim);border-radius:999px;padding:0 7px;cursor:pointer;font-size:11px;line-height:18px">&times;</button>
          </div>
        </div>
        <div style="display:inline-flex;align-items:center;gap:8px;width:fit-content;background:rgba(255,215,90,.10);border:1px solid rgba(255,215,90,.22);border-radius:999px;padding:6px 10px">
          <span style="font-family:var(--mono);font-size:11px;color:var(--text)"><span style="color:${intraTypeColor(left.type)};font-weight:700">${intraTypeLabel(left.type)}</span> · ${left.useTicker?left.asset:(Number.isFinite(parseFloat(left.asset))?fmtStrike(parseFloat(left.asset)):left.asset)}</span>
        </div>
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-top:2px">Cruza con</div>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,max-content));gap:8px;align-content:start">${rows}</div>
      </div>`;
  }).join('');
}

function intraApplyMode(){
  const mode=intraGetMode();
  const btnTable=document.getElementById('intra-mode-table');
  const btnCharts=document.getElementById('intra-mode-charts');
  const tableView=document.getElementById('intra-table-view');
  const chartsView=document.getElementById('intra-charts-view');
  const activeStyle=(active)=>active
    ? 'background:rgba(255,215,90,.14);border-color:rgba(255,215,90,.55);color:var(--amber)'
    : 'background:var(--surface2);border-color:var(--border);color:var(--text)';
  if(btnTable)btnTable.style.cssText=btnTable.style.cssText.replace(/background:[^;]+;?/g,'').replace(/border-color:[^;]+;?/g,'').replace(/color:[^;]+;?/g,'')+';'+activeStyle(mode==='table');
  if(btnCharts)btnCharts.style.cssText=btnCharts.style.cssText.replace(/background:[^;]+;?/g,'').replace(/border-color:[^;]+;?/g,'').replace(/color:[^;]+;?/g,'')+';'+activeStyle(mode==='charts');
  if(tableView)tableView.style.display=mode==='table'?'block':'none';
  if(chartsView)chartsView.style.display=mode==='charts'?'flex':'none';
  if(mode==='charts')renderIntradiarioCharts();
}

function intraToggleSection(sectionId,btn){
  const body=document.getElementById(sectionId);
  if(!body)return;
  const isOpen=body.style.display!=='none';
  body.style.display=isOpen?'none':'block';
  if(btn)btn.textContent=isOpen?'\u25B8':'\u25BE';
}

function intraBindCollapseCarets(root){
  const scope=root||document;
  const containers=Array.from(scope.querySelectorAll('[data-intra-collapsible="1"]'));
  containers.forEach(container=>{
    const header=container.querySelector('[data-intra-collapse-header]');
    if(!header)return;
    const body=container.querySelector('div[id^="intra-section-"]');
    if(!body||!body.id)return;
    const buttons=Array.from(header.querySelectorAll('button.btn-sm'));
    if(!buttons.length)return;
    const caretBtn=buttons[buttons.length-1];
    if(!caretBtn||caretBtn.dataset.intraCollapseBound==='1')return;
    caretBtn.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();
      intraToggleSection(body.id,caretBtn);
    });
    caretBtn.dataset.intraCollapseBound='1';
  });
}

function intraParsePercent(raw){
  const s=(raw??'').toString().trim();
  if(!s||s==='---')return null;
  const cleaned=s.replace('%','').replace(/\s+/g,'').replace(/\./g,'').replace(',', '.');
  const v=parseFloat(cleaned);
  return Number.isFinite(v)?v:null;
}

function intraFormatDateDisplay(dateIso){
  if(!dateIso)return '--';
  const parts=dateIso.split('-');
  if(parts.length!==3)return dateIso;
  return `${parts[2]}/${parts[1]}/${parts[0].slice(-2)}`;
}

function intraNormalizeTime(time){
  const src=(time||'').toString().trim();
  if(!src)return '';
  const m=src.match(/^(\d{1,2}):(\d{2})/);
  if(!m)return src;
  return `${String(parseInt(m[1],10)).padStart(2,'0')}:${m[2]}`;
}

function intraGetTimeframe(){
  const raw=parseInt(document.getElementById('intra-timeframe')?.value||'5',10);
  return [1,5,10,30].includes(raw)?raw:5;
}

function intraTimeMatchesFrame(time,frame){
  const norm=intraNormalizeTime(time);
  const m=norm.match(/^(\d{2}):(\d{2})$/);
  if(!m)return false;
  const total=parseInt(m[1],10)*60+parseInt(m[2],10);
  return frame<=1 ? true : (total%frame===0);
}

function intraParseTimestamp(raw){
  if(raw instanceof Date&&!Number.isNaN(raw.getTime())){
    const yyyy=raw.getFullYear();
    const mm=String(raw.getMonth()+1).padStart(2,'0');
    const dd=String(raw.getDate()).padStart(2,'0');
    const hh=String(raw.getHours()).padStart(2,'0');
    const mi=String(raw.getMinutes()).padStart(2,'0');
    const ss=String(raw.getSeconds()).padStart(2,'0');
    const date=`${yyyy}-${mm}-${dd}`;
    const time=ss!=='00'?`${hh}:${mi}:${ss}`:`${hh}:${mi}`;
    const dateDisplay=intraFormatDateDisplay(date);
    return {date,dateDisplay,time,label:[dateDisplay,time].filter(Boolean).join(' ')};
  }

  if(typeof raw==='number'&&Number.isFinite(raw)){
    const millis=Math.round(raw*86400000);
    const parsed=new Date(INTRA_SERIAL_EPOCH_UTC+millis);
    if(!Number.isNaN(parsed.getTime()))return intraParseTimestamp(parsed);
  }

  const src=(raw??'').toString().trim();
  if(!src)return {date:'',dateDisplay:'',time:'',label:''};

  const rawTimeMatch=src.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
  let rawTime=rawTimeMatch?rawTimeMatch[1]:'';
  const ampmMatch=src.match(/\b(AM|PM)\b/i);
  if(rawTime&&ampmMatch){
    const parts=rawTime.split(':');
    let hour=parseInt(parts[0],10);
    const suffix=ampmMatch[1].toUpperCase();
    if(suffix==='PM'&&hour<12)hour+=12;
    if(suffix==='AM'&&hour===12)hour=0;
    parts[0]=String(hour).padStart(2,'0');
    rawTime=parts.join(':');
  }
  const rawDateMatch=src.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/);
  let rawDate=rawDateMatch?rawDateMatch[1]:'';
  if(!rawDate){
    const parsedNative=new Date(src);
    if(!Number.isNaN(parsedNative.getTime()))return intraParseTimestamp(parsedNative);
    rawDate=src.split(/\s+/)[0]||'';
  }
  const date=normalizeExpiry(rawDate)||rawDate;
  const dateDisplay=intraFormatDateDisplay(date);

  return {
    date,
    dateDisplay,
    time:rawTime,
    label:[dateDisplay!=='--'?dateDisplay:'',rawTime].filter(Boolean).join(' '),
  };
}

function intraInferType(ticker){
  const t=(ticker||'').toUpperCase();
  if(t==='GGAL'||t==='PAMP')return 'underlying';
  if(t.includes('PESOS'))return 'caucion';
  if(t.includes('/'))return 'future';
  if(t.includes('GFGC'))return 'call';
  if(t.includes('GFGV'))return 'put';
  return 'future';
}

function intraTypeLabel(type){
  if(type==='call')return 'Call';
  if(type==='put')return 'Put';
  if(type==='future')return 'Futuro';
  if(type==='underlying')return 'Subyacente';
  if(type==='caucion')return 'Caucion';
  return type||'--';
}

function intraTypeColor(type){
  if(type==='call')return 'var(--green)';
  if(type==='put')return 'var(--red)';
  if(type==='future')return 'var(--blue)';
  if(type==='underlying')return 'var(--amber)';
  if(type==='caucion')return 'var(--text)';
  return 'var(--muted)';
}

function intraCurrentSpot(){
  if(typeof ST!=='undefined'&&ST&&Number.isFinite(ST.spot)&&ST.spot>0)return ST.spot;
  const scoped=INTRA.rows?.length?INTRA.rows:INTRA.allRows;
  const underlyingRow=(scoped||[]).find(row=>row.type==='underlying'&&Number.isFinite(row.last)&&row.last>0);
  return underlyingRow?.last||null;
}

function intraAtmStrikeCandidates(){
  const source=(INTRA.rows?.length?INTRA.rows:INTRA.allRows)||[];
  const strikes=[...new Set(source
    .filter(row=>(row.type==='call'||row.type==='put')&&Number.isFinite(row.strike)&&row.strike>0)
    .map(row=>row.strike))]
    .sort((a,b)=>a-b);
  const spot=intraCurrentSpot();
  if(!Number.isFinite(spot)||!strikes.length)return [];
  const below=[...strikes.filter(v=>v<=spot)].sort((a,b)=>b-a);
  const above=[...strikes.filter(v=>v>=spot)].sort((a,b)=>a-b);
  const picked=[];
  if(below[0]!=null)picked.push(below[0]);
  if(above[0]!=null&&!picked.includes(above[0]))picked.push(above[0]);
  if(above[1]!=null&&!picked.includes(above[1]))picked.push(above[1]);
  return picked;
}

function intraFmt(v,dec=2){
  return v==null||!isFinite(v)?'--':fmtN(v,dec);
}

function intraFmtPct(v){
  return v==null||!isFinite(v)?'--':`${v>=0?'+':''}${v.toFixed(2).replace('.',',')}%`;
}

function intraSummaryValueStyle(value=''){
  const len=String(value||'').trim().length;
  if(len>=18)return 'font-size:14px;line-height:1.25;word-break:break-word';
  if(len>=14)return 'font-size:16px;line-height:1.25;word-break:break-word';
  return 'font-size:20px;line-height:1.2';
}

function intraSetLoading(active,text=''){
  const wrap=document.getElementById('intra-loader');
  const textEl=document.getElementById('intra-loader-text');
  const elapsedEl=document.getElementById('intra-loader-elapsed');
  const barEl=document.getElementById('intra-loader-bar');
  const btn=document.getElementById('intra-refresh-btn');
  if(wrap)wrap.style.display=active?'block':'none';
  if(textEl&&text)textEl.textContent=text;
  if(btn)btn.disabled=!!active;
  if(btn)btn.textContent=active?'Cargando...':'Actualizar intradiario';
  if(active){
    intraLoaderStartedAt=Date.now();
    if(elapsedEl)elapsedEl.textContent='0,0s';
    if(barEl)barEl.style.width='18%';
    if(intraLoaderTimer)clearInterval(intraLoaderTimer);
    intraLoaderTimer=setInterval(()=>{
      const elapsedMs=Date.now()-intraLoaderStartedAt;
      if(elapsedEl)elapsedEl.textContent=`${(elapsedMs/1000).toFixed(1).replace('.',',')}s`;
      if(barEl){
        const width=Math.min(92,18+Math.floor(elapsedMs/180));
        barEl.style.width=`${width}%`;
      }
    },100);
    return;
  }
  if(intraLoaderTimer){
    clearInterval(intraLoaderTimer);
    intraLoaderTimer=null;
  }
  if(barEl)barEl.style.width='100%';
}

function intraPopulateHours(){
  const sel=document.getElementById('intra-filter-hour');
  if(!sel)return;
  const current=INTRA.selectedHour||sel.value||'__all__';
  sel.innerHTML='<option value="__all__">Todos</option>';
  INTRA.hours.forEach(hour=>{
    const opt=document.createElement('option');
    opt.value=hour;
    opt.textContent=hour;
    if(hour===current)opt.selected=true;
    sel.appendChild(opt);
  });
  if(!sel.value)sel.value=current||'__all__';
  INTRA.selectedHour=sel.value||'__all__';
  sel.disabled=!INTRA.hours.length;
}

function intraPopulateStrikes(){
  const sel=document.getElementById('intra-filter-strike');
  const label=document.getElementById('intra-filter-asset-label');
  if(!sel)return;
  const cur=sel.value;
  const type=document.getElementById('intra-filter-type')?.value||'all';
  const useTicker=type==='future'||type==='underlying'||type==='caucion';
  const values=useTicker?INTRA.tickers:INTRA.strikes;
  if(label)label.textContent=useTicker?'Ticker':'Strike';
  sel.innerHTML='<option value="">Todos</option>';
  values.forEach(value=>{
    const opt=document.createElement('option');
    opt.value=String(value);
    opt.textContent=useTicker?String(value):fmtStrike(value);
    if(String(value)===cur)opt.selected=true;
    sel.appendChild(opt);
  });
  if(cur&&!values.some(value=>String(value)===cur))sel.value='';
}

function intraUpdateAssetVisibility(){
  const wrap=document.getElementById('intra-filter-asset-wrap');
  const type=document.getElementById('intra-filter-type')?.value||'all';
  if(wrap)wrap.style.display=type==='all'?'none':'flex';
  intraUpdateAddButton();
}

function intraApplyScope(){
  const frame=intraGetTimeframe();
  const hour=document.getElementById('intra-filter-hour')?.value||INTRA.selectedHour||'__all__';
  INTRA.selectedHour=hour;
  let scoped=INTRA.allRows.filter(row=>intraTimeMatchesFrame(row.time,frame));
  scoped=hour==='__all__'||!hour
    ? scoped
    : scoped.filter(row=>intraNormalizeTime(row.time)===hour);
  INTRA.rows=scoped;
  intraRefreshAssetOptions();
  intraPopulateStrikes();
  intraUpdateAssetVisibility();
  const hourSel=document.getElementById('intra-filter-hour');
  if(hourSel)hourSel.disabled=!INTRA.hours.length;
}

function intraOnScopeChange(){
  intraApplyScope();
  renderIntradiario();
}

function intraOnTimeframeChange(){
  intraRefreshHours();
  intraApplyScope();
  renderIntradiario();
}

function intraOnTypeChange(){
  const sel=document.getElementById('intra-filter-strike');
  if(sel)sel.value='';
  intraRefreshAssetOptions();
  intraPopulateStrikes();
  intraUpdateAssetVisibility();
  intraOnBuilderChange();
}

function intraRefreshAssetOptions(){
  const type=document.getElementById('intra-filter-type')?.value||'all';
  const source=type==='all'
    ? INTRA.rows
    : INTRA.rows.filter(row=>row.type===type);
  INTRA.strikes=[...new Set(source.map(row=>row.strike).filter(v=>Number.isFinite(v)&&v>0))].sort((a,b)=>a-b);
  INTRA.tickers=[...new Set(source.map(row=>row.ticker).filter(v=>v&&v.trim()))].sort((a,b)=>a.localeCompare(b,'es'));
}

function intraRefreshHours(){
  const frame=intraGetTimeframe();
  INTRA.hours=(INTRA.rawHours||[]).filter(hour=>intraTimeMatchesFrame(hour,frame));
  if(INTRA.selectedHour!=='__all__'&&!INTRA.hours.includes(INTRA.selectedHour)){
    INTRA.selectedHour='__all__';
  }
  intraPopulateHours();
}

function parseIntradiarioRows(rows){
  if(!Array.isArray(rows)||rows.length<2){
    INTRA.allRows=[];
    INTRA.rows=[];
    INTRA.strikes=[];
    INTRA.tickers=[];
    INTRA.rawHours=[];
    INTRA.hours=[];
    INTRA.selectedHour='';
    intraPopulateHours();
    intraPopulateStrikes();
    return;
  }

  const headerRowIdx=(+document.getElementById('intra-header-row')?.value||1)-1;
  const dataRows=rows.slice(headerRowIdx+1);
  const ci={
    datetime:intraColIndex('intra-col-datetime','A'),
    ticker:intraColIndex('intra-col-ticker','B'),
    last:intraColIndex('intra-col-last','C'),
    strike:intraColIndex('intra-col-strike','D'),
    bid:intraColIndex('intra-col-bid','E'),
    ask:intraColIndex('intra-col-ask','F'),
    chg:intraColIndex('intra-col-chg','G'),
    high:intraColIndex('intra-col-high','H'),
    low:intraColIndex('intra-col-low','I'),
    volume:intraColIndex('intra-col-volume','J'),
  };

  const parsed=[];
  const hourSet=new Set();
  dataRows.forEach(cols=>{
    if(!cols?.length)return;
    const ticker=(cols[ci.ticker]||'').toString().trim();
    if(!ticker)return;

    const ts=intraParseTimestamp(cols[ci.datetime]);
    const type=intraInferType(ticker);
    const strike=parseARSNum(cols[ci.strike]);
    const last=parseARSPrice(cols[ci.last]);
    const bid=parseARSPrice(cols[ci.bid]);
    const ask=parseARSPrice(cols[ci.ask]);
    const high=parseARSPrice(cols[ci.high]);
    const low=parseARSPrice(cols[ci.low]);
    const chgPct=intraParsePercent(cols[ci.chg]);
    const volume=parseARSNum(cols[ci.volume]);
    const hasBid=Number.isFinite(bid)&&bid>0;
    const hasAsk=Number.isFinite(ask)&&ask>0;
    const mid=hasBid&&hasAsk?(bid+ask)/2:null;
    if(ts.time)hourSet.add(ts.time);

    parsed.push({
      tsLabel:ts.label,
      date:ts.date,
      dateDisplay:ts.dateDisplay,
      time:intraNormalizeTime(ts.time),
      ticker,
      type,
      typeLabel:intraTypeLabel(type),
      strike:Number.isFinite(strike)&&strike>0?strike:null,
      last:Number.isFinite(last)&&last>0?last:null,
      bid:hasBid?bid:null,
      ask:hasAsk?ask:null,
      mid,
      chgPct,
      high:Number.isFinite(high)&&high>0?high:null,
      low:Number.isFinite(low)&&low>0?low:null,
      volume:Number.isFinite(volume)&&volume>=0?volume:null,
    });
  });

  INTRA.allRows=parsed;
  INTRA.rawHours=[...hourSet].map(intraNormalizeTime).filter(Boolean).sort((a,b)=>a.localeCompare(b));
  if(!INTRA.selectedHour||(!INTRA.rawHours.includes(INTRA.selectedHour)&&INTRA.selectedHour!=='__all__')){
    INTRA.selectedHour='__all__';
  }
  intraRefreshHours();
  intraApplyScope();
}

function intraFilteredRows(){
  intraLoadSelections();
  const visibleSelections=intraVisibleSelections();
  if(!visibleSelections.length)return [];
  return (INTRA.rows||[]).filter(row=>visibleSelections.some(selection=>intraSelectionMatchesRow(selection,row)));
}

function intraGraphRows(){
  const status=document.getElementById('intra-chart-status');
  const frame=intraGetTimeframe();
  intraLoadSelections();
  if(!intraHasCrosses()){
    if(status)status.textContent='Elegí Tipo, Subtipo y presioná Agregar para comparar series.';
    return null;
  }
  const activeSelections=intraActiveSelections();
  const selectedHour=INTRA.selectedHour||'__all__';
  const rows=INTRA.allRows
    .filter(row=>intraTimeMatchesFrame(row.time,frame))
    .filter(row=>selectedHour==='__all__'||!selectedHour?true:(intraNormalizeTime(row.time)===selectedHour))
    .filter(row=>activeSelections.some(selection=>intraSelectionMatchesRow(selection,row)))
    .filter(row=>row.last!=null&&isFinite(row.last))
    .slice()
    .sort((a,b)=>{
      const ka=`${a.date||''} ${a.time||''}`;
      const kb=`${b.date||''} ${b.time||''}`;
      return ka.localeCompare(kb);
    });
  if(!rows.length){
    if(status)status.textContent='No hay datos con LAST disponible para los cruces activos.';
    return null;
  }
  const labels=[...new Set(rows.map(row=>row.time||'--'))];
  const palette=['#e8b84b','#5aabff','#44c76a','#f05a5a','#b088f0','#58d1c9','#f29d50','#a3e635'];
  const datasets=activeSelections.map((selection,index)=>{
    const selectionRows=rows.filter(row=>intraSelectionMatchesRow(selection,row));
    const map=new Map(selectionRows.map(row=>[row.time||'--',row.last]));
    const color=palette[index%palette.length];
    return {
      selectionId:selection.id,
      label:intraSelectionLegend(selection,activeSelections),
      data:labels.map(label=>map.has(label)?parseFloat(map.get(label).toFixed(4)):null),
      borderColor:color,
      borderWidth:1.8,
      pointRadius:3,
      pointBackgroundColor:color,
      fill:false,
      spanGaps:true,
    };
  }).filter(dataset=>dataset.data.some(v=>v!=null));
  if(!datasets.length){
    if(status)status.textContent='No hay series válidas para graficar con los comparables elegidos.';
    return null;
  }
  if(status)status.textContent=`Comparando ${datasets.length} serie(s) de Last activas por cruces visibles.`;
  return {labels,datasets};
}

function renderIntradiarioCharts(){
  const series=intraGraphRows();
  const canvas=document.getElementById('intra-chart-last');
  if(!canvas)return;
  if(!series){
    if(INTRA.charts.last){
      INTRA.charts.last.destroy();
      INTRA.charts.last=null;
    }
    if(INTRA.charts.strategy){
      INTRA.charts.strategy.destroy();
      INTRA.charts.strategy=null;
    }
    return;
  }
  upsertChart(INTRA.charts,'last','intra-chart-last',{
    type:'line',
    data:{labels:series.labels,datasets:series.datasets},
    options:{
      responsive:true,
      maintainAspectRatio:false,
      animation:false,
      plugins:{
        legend:{display:true,labels:{color:'#7a8fa6',font:{size:9},boxWidth:10,padding:10}},
        tooltip:{
          backgroundColor:'#131920',
          borderColor:'#2a3444',
          borderWidth:1,
          titleColor:'#7a8fa6',
          bodyColor:'#d8e3ef',
          callbacks:{label:c=>` ${c.dataset.label}: ${c.raw!=null?fmtN(c.raw):'--'}`},
        },
      },
      scales:{
        x:{ticks:{color:'#7a8fa6',font:{size:9},maxRotation:45,minRotation:45,autoSkip:false},grid:{color:'#1a2230'}},
        y:{ticks:{color:'#7a8fa6',font:{size:9},callback:v=>v!=null?fmtN(v):'--'},grid:{color:'#1a2230'}},
      },
    },
  });

  const strategyStatus=document.getElementById('intra-chart-strategy-status');
  const activeCrosses=intraVisibleCrosses();
  if(!activeCrosses.length){
    if(strategyStatus)strategyStatus.textContent='Agregá al menos 2 comparables visibles para generar estrategias derivadas.';
    if(INTRA.charts.strategy){
      INTRA.charts.strategy.destroy();
      INTRA.charts.strategy=null;
    }
    return;
  }

  const kind=intraGetStrategyKind();
  const palette=['#e8b84b','#5aabff','#44c76a','#f05a5a','#b088f0','#58d1c9'];
  const pairDatasets=[];
  for(let i=0;i<activeCrosses.length;i+=1){
    const cross=activeCrosses[i];
    const left=intraFindSelection(cross.leftId);
    const right=intraFindSelection(cross.rightId);
    if(!left||!right)continue;
    const leftSet=series.datasets.find(dataset=>dataset.selectionId===left.id);
    const rightSet=series.datasets.find(dataset=>dataset.selectionId===right.id);
    if(!leftSet||!rightSet)continue;
    const values=series.labels.map((_,idx)=>intraStrategyCompute(kind,leftSet.data[idx],rightSet.data[idx]));
    if(!values.some(v=>v!=null))continue;
    const color=palette[pairDatasets.length%palette.length];
    pairDatasets.push({
      label:`${intraStrategyLabel(kind)} ${pairDatasets.length+1}: ${intraSelectionDisplay(left)} / ${intraSelectionDisplay(right)}`,
      data:values.map(v=>v!=null?parseFloat(v.toFixed(4)):null),
      borderColor:color,
      borderWidth:1.8,
      pointRadius:3,
      pointBackgroundColor:color,
      fill:false,
      spanGaps:true,
    });
  }

  if(!pairDatasets.length){
    if(strategyStatus)strategyStatus.textContent='No hay cruces visibles completos para la estrategia elegida.';
    if(INTRA.charts.strategy){
      INTRA.charts.strategy.destroy();
      INTRA.charts.strategy=null;
    }
    return;
  }

  if(strategyStatus){
    strategyStatus.textContent=`Comparando ${pairDatasets.length} relación(es) ${intraStrategyLabel(kind)} a partir de pares visibles consecutivos.`;
  }

  upsertChart(INTRA.charts,'strategy','intra-chart-strategy',{
    type:'line',
    data:{labels:series.labels,datasets:pairDatasets},
    options:{
      responsive:true,
      maintainAspectRatio:false,
      animation:false,
      plugins:{
        legend:{display:true,labels:{color:'#7a8fa6',font:{size:9},boxWidth:10,padding:10}},
        tooltip:{
          backgroundColor:'#131920',
          borderColor:'#2a3444',
          borderWidth:1,
          titleColor:'#7a8fa6',
          bodyColor:'#d8e3ef',
          callbacks:{label:c=>` ${c.dataset.label}: ${c.raw!=null?fmtN(c.raw):'--'}`},
        },
      },
      scales:{
        x:{ticks:{color:'#7a8fa6',font:{size:9},maxRotation:45,minRotation:45,autoSkip:false},grid:{color:'#1a2230'}},
        y:{ticks:{color:'#7a8fa6',font:{size:9},callback:v=>v!=null?fmtN(v):'--'},grid:{color:'#1a2230'}},
      },
    },
  });
}

function intraCrossGroups(){
  const grouped=new Map();
  intraVisibleCrosses().forEach(cross=>{
    const left=intraFindSelection(cross.leftId);
    const right=intraFindSelection(cross.rightId);
    if(!left||!right)return;
    if(!grouped.has(left.id))grouped.set(left.id,{left,crosses:[]});
    grouped.get(left.id).crosses.push({cross,right});
  });
  return [...grouped.values()];
}

function intraRowsForSelectionIds(ids){
  const set=new Set(ids||[]);
  const frame=intraGetTimeframe();
  const selectedHour=INTRA.selectedHour||'__all__';
  return INTRA.allRows
    .filter(row=>intraTimeMatchesFrame(row.time,frame))
    .filter(row=>selectedHour==='__all__'||!selectedHour?true:(intraNormalizeTime(row.time)===selectedHour))
    .filter(row=>row.last!=null&&isFinite(row.last))
    .filter(row=>(INTRA.selectedComparisons||[]).some(selection=>set.has(selection.id)&&intraSelectionMatchesRow(selection,row)))
    .slice()
    .sort((a,b)=>`${a.date||''} ${a.time||''}`.localeCompare(`${b.date||''} ${b.time||''}`));
}

function intraBuildGroupChartSeries(group,kind){
  const selections=[group.left,...group.crosses.map(item=>item.right)];
  const rows=intraRowsForSelectionIds(selections.map(item=>item.id));
  if(!rows.length)return null;
  const labels=[...new Set(rows.map(row=>row.time||'--'))];
  const palette=['#e8b84b','#5aabff','#44c76a','#f05a5a','#b088f0','#58d1c9','#f29d50','#a3e635'];
  const maps=new Map(selections.map(selection=>{
    const selectionRows=rows.filter(row=>intraSelectionMatchesRow(selection,row));
    return [selection.id,new Map(selectionRows.map(row=>[row.time||'--',row.last]))];
  }));
  if(kind==='price'){
    const datasets=selections.map((selection,index)=>({
      selectionId:selection.id,
      label:intraSelectionLegend(selection,selections),
      data:labels.map(label=>maps.get(selection.id)?.has(label)?parseFloat(maps.get(selection.id).get(label).toFixed(4)):null),
      borderColor:palette[index%palette.length],
      borderWidth:1.8,
      pointRadius:3,
      pointBackgroundColor:palette[index%palette.length],
      fill:false,
      spanGaps:true,
    })).filter(dataset=>dataset.data.some(v=>v!=null));
    return datasets.length?{labels,datasets}:null;
  }
  const datasets=group.crosses.map((item,index)=>{
    const leftMap=maps.get(group.left.id);
    const rightMap=maps.get(item.right.id);
    const values=labels.map(label=>intraStrategyCompute(kind,leftMap?.get(label),rightMap?.get(label)));
    return {
      selectionId:item.cross.id,
      label:`${intraStrategyLabel(kind)}: ${intraSelectionDisplay(group.left)} / ${intraSelectionDisplay(item.right)}`,
      data:values.map(v=>v!=null?parseFloat(v.toFixed(4)):null),
      borderColor:palette[index%palette.length],
      borderWidth:1.8,
      pointRadius:3,
      pointBackgroundColor:palette[index%palette.length],
      fill:false,
      spanGaps:true,
    };
  }).filter(dataset=>dataset.data.some(v=>v!=null));
  return datasets.length?{labels,datasets}:null;
}

function intraChartConfig(series){
  return {
    type:'line',
    data:{labels:series.labels,datasets:series.datasets},
    options:{
      responsive:true,
      maintainAspectRatio:false,
      animation:false,
      plugins:{
        legend:{display:true,labels:{color:'#7a8fa6',font:{size:9},boxWidth:10,padding:10}},
        tooltip:{
          backgroundColor:'#131920',
          borderColor:'#2a3444',
          borderWidth:1,
          titleColor:'#7a8fa6',
          bodyColor:'#d8e3ef',
          callbacks:{label:c=>` ${c.dataset.label}: ${c.raw!=null?fmtN(c.raw):'--'}`},
        },
      },
      scales:{
        x:{ticks:{color:'#7a8fa6',font:{size:9},maxRotation:45,minRotation:45,autoSkip:false},grid:{color:'#1a2230'}},
        y:{ticks:{color:'#7a8fa6',font:{size:9},callback:v=>v!=null?fmtN(v):'--'},grid:{color:'#1a2230'}},
      },
    },
  };
}

function intraSetCrossGroupKind(leftId,kind){
  intraLoadSelections();
  intraSetCrossGroupPref(leftId,{kind});
  intraSaveSelections();
  renderIntradiarioCharts();
}

function renderIntradiarioCharts(){
  const status=document.getElementById('intra-chart-status');
  const wrap=document.getElementById('intra-dynamic-charts');
  if(!status||!wrap)return;
  Object.keys(INTRA.charts||{}).forEach(key=>{
    INTRA.charts[key]?.destroy?.();
    delete INTRA.charts[key];
  });
  const groups=intraCrossGroups();
  if(!groups.length){
    status.textContent='Crea cruces para habilitar la generación de gráficos.';
    wrap.innerHTML='';
    return;
  }
  const generatedGroups=groups
    .map(group=>({group,prefs:intraCrossGroupPref(group.left.id)}))
    .filter(item=>item.prefs.generated&&item.prefs.visible!==false);
  if(!generatedGroups.length){
    status.textContent='Todavía no hay gráficos generados. Usá "Generar" en alguno de los bloques de Origen.';
    wrap.innerHTML='';
    return;
  }
  status.textContent=`Mostrando ${generatedGroups.length} gráfico(s) generados desde los cruces.`;
  wrap.innerHTML=generatedGroups.map(({group,prefs},index)=>{
    const title=(prefs.kind==='price'?'Precio':intraStrategyLabel(prefs.kind))+' vs Hora';
    const subtitle=prefs.kind==='price'
      ? `${intraSelectionDisplay(group.left)} + ${group.crosses.length} destino(s)`
      : `${intraSelectionDisplay(group.left)} contra ${group.crosses.length} destino(s)`;
    const canvasId=`intra-dyn-chart-${group.left.id}`;
    return `
      <div class="chart-wrap" style="padding:14px" data-intra-collapsible="1">
        <div data-intra-collapse-header="1" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <div style="font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)">${title}</div>
            <div style="font-size:12px;color:var(--text)">${subtitle}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <select onchange="intraSetCrossGroupKind('${group.left.id.replace(/'/g,"\\'")}',this.value)" style="background:var(--surface);border:1px solid var(--border);color:var(--amber);font-family:var(--mono);font-size:12px;padding:3px 10px;border-radius:5px;min-width:120px;text-align:center;text-align-last:center">
              <option value="price" ${prefs.kind==='price'?'selected':''}>Precio</option>
              <option value="bull" ${prefs.kind==='bull'?'selected':''}>Bull</option>
              <option value="bear" ${prefs.kind==='bear'?'selected':''}>Bear</option>
              <option value="rc" ${prefs.kind==='rc'?'selected':''}>RC</option>
              <option value="ri" ${prefs.kind==='ri'?'selected':''}>RI</option>
              <option value="straddle" ${prefs.kind==='straddle'?'selected':''}>Straddle</option>
            </select>
            <button type="button" class="btn-sm" style="padding:2px 8px;min-width:30px">&#9662;</button>
          </div>
        </div>
        <div id="intra-section-chart-dyn-${index}" style="display:block">
          <div style="position:relative;height:280px"><canvas id="${canvasId}"></canvas></div>
        </div>
      </div>`;
  }).join('');
  intraBindCollapseCarets();
  generatedGroups.forEach(({group,prefs})=>{
    const series=intraBuildGroupChartSeries(group,prefs.kind);
    if(!series)return;
    upsertChart(INTRA.charts,`group_${group.left.id}`,`intra-dyn-chart-${group.left.id}`,intraChartConfig(series));
  });
}

function renderIntradiario(){
  const body=document.getElementById('intra-body');
  const summary=document.getElementById('intra-summary');
  const status=document.getElementById('intra-status');
  if(!body||!summary||!status)return;
  intraLoadSelections();
  intraApplyMode();
  intraUpdateAssetVisibility();
  intraRenderSelections();
  intraBindCollapseCarets();

  if(!INTRA.allRows.length){
    body.innerHTML='<tr><td colspan="12" style="padding:24px;text-align:center;color:var(--muted)">Usá "Actualizar intradiario" para cargar datos</td></tr>';
    summary.innerHTML='';
    status.textContent=INTRA.loading?'Cargando...':'Sin datos';
    const chartStatus=document.getElementById('intra-chart-status');
    if(chartStatus)chartStatus.textContent='Cargá datos intradiarios para habilitar los graficos.';
    return;
  }

  const visible=intraFilteredRows();
  const visibleSelections=intraVisibleSelections();
  const totalSelected=visibleSelections.length
    ? (INTRA.allRows||[]).filter(row=>visibleSelections.some(selection=>intraSelectionMatchesRow(selection,row))).length
    : 0;
  const calls=visible.filter(row=>row.type==='call').length;
  const puts=visible.filter(row=>row.type==='put').length;
  const futures=visible.filter(row=>row.type==='future').length;
  const underlyings=visible.filter(row=>row.type==='underlying').length;
  const cauciones=visible.filter(row=>row.type==='caucion').length;
  const fallbackSelectedTs=visibleSelections.length?(visible[0]?.tsLabel||((INTRA.rows||[]).find(row=>visibleSelections.some(selection=>intraSelectionMatchesRow(selection,row)))?.tsLabel||'--')):'--';
  const latestTs=visible[0]?.tsLabel||fallbackSelectedTs;
  const withVolume=visible.filter(row=>Number.isFinite(row.volume)).reduce((acc,row)=>acc+(row.volume||0),0);
  const scopeLabel=INTRA.selectedHour==='__all__'?'Todos':(INTRA.selectedHour||'Sin hora');
  const frameLabel=`${intraGetTimeframe()}m`;
  const subtypeReady=visibleSelections.length>0;
  const pricedRows=subtypeReady?visible.filter(row=>Number.isFinite(row.last)):[];
  const dayMax=pricedRows.length
    ? pricedRows.reduce((best,row)=>row.last>best.last?row:best)
    : null;
  const dayMin=pricedRows.length
    ? pricedRows.reduce((best,row)=>row.last<best.last?row:best)
    : null;

  summary.innerHTML=[
    ['Registros visibles', `${visible.length}`,'var(--text)',''],
    ['Carga aplicada', `${scopeLabel} · ${frameLabel}`,'var(--amber)',''],
    ['Ultimo timestamp', latestTs||'--','var(--amber)',''],
    ['Maximo del dia', dayMax?intraFmt(dayMax.last):'--','var(--green)',dayMax?.time||'--'],
    ['Minimo del dia', dayMin?intraFmt(dayMin.last):'--','var(--red)',dayMin?.time||'--'],
    ['Suby / Caucion', `${underlyings} / ${cauciones}`,'var(--text)',`${calls} calls · ${puts} puts · ${futures} futuros`],
    ['Volumen total', intraFmt(withVolume,0),'var(--text)',''],
  ].map(([label,value,color,detail])=>`
    <div class="panel" style="padding:12px">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:6px">${label}</div>
      <div style="font-family:var(--mono);color:${color};font-weight:600;${intraSummaryValueStyle(value)}">${value}</div>
      ${detail?`<div style="font-size:11px;color:var(--dim);margin-top:6px">${detail}</div>`:''}
    </div>`).join('');

  if(!visible.length){
    body.innerHTML=`<tr><td colspan="12" style="padding:24px;text-align:center;color:var(--muted)">${visibleSelections.length?'No hay filas para los comparables elegidos con el scope actual':'Agrega comparables para habilitar la tabla y crea cruces para los graficos'}</td></tr>`;
    status.textContent=`${visible.length} visibles | ${visibleSelections.length?totalSelected:INTRA.allRows.length} totales`;
    renderIntradiarioCharts();
    return;
  }

  body.innerHTML=visible.map(row=>{
    const typeColor=row.type==='call'?'var(--green)'
      :row.type==='put'?'var(--red)'
      :row.type==='future'?'var(--blue)'
      :row.type==='underlying'?'var(--amber)'
      :row.type==='caucion'?'var(--text)'
      :'var(--muted)';
    const chgColor=row.chgPct==null?'var(--muted)':row.chgPct>=0?'var(--green)':'var(--red)';
    return `
      <tr style="border-bottom:1px solid var(--border2)">
        <td style="padding:5px 8px;text-align:center;color:var(--muted);white-space:nowrap">${row.time||'--'}</td>
        <td style="padding:5px 8px;text-align:left;color:var(--text);white-space:nowrap">${row.ticker}</td>
        <td style="padding:5px 8px;text-align:center;color:${typeColor}">${row.typeLabel}</td>
        <td style="padding:5px 8px;text-align:center;color:var(--amber)">${row.strike!=null?fmtStrike(row.strike):'--'}</td>
        <td style="padding:5px 8px;text-align:center;color:var(--text)">${intraFmt(row.last)}</td>
        <td style="padding:5px 8px;text-align:center;color:var(--green)">${intraFmt(row.bid)}</td>
        <td style="padding:5px 8px;text-align:center;color:var(--red)">${intraFmt(row.ask)}</td>
        <td style="padding:5px 8px;text-align:center;color:var(--amber)">${intraFmt(row.mid)}</td>
        <td style="padding:5px 8px;text-align:center;color:${chgColor}">${intraFmtPct(row.chgPct)}</td>
        <td style="padding:5px 8px;text-align:center;color:var(--text)">${intraFmt(row.high)}</td>
        <td style="padding:5px 8px;text-align:center;color:var(--text)">${intraFmt(row.low)}</td>
        <td style="padding:5px 8px;text-align:center;color:var(--text)">${intraFmt(row.volume,0)}</td>
      </tr>`;
  }).join('');

  status.textContent=`${visible.length} visibles | ${totalSelected} totales`;
  renderIntradiarioCharts();
}

async function fetchIntradiario(silent=false){
  const webAppUrl=document.getElementById('sh-webapp-url')?.value.trim();
  const sheet=intraSheetName();
  const status=document.getElementById('intra-status');
  if(!webAppUrl){
    if(status)status.textContent='Sin URL configurada';
    return;
  }

  const startedAt=Date.now();
  INTRA.loading=true;
  intraSetLoading(true,'Descargando datos desde Google Sheets...');
  if(status)status.textContent='Cargando...';

  try{
    await intraClearCache();
    intraLog('fetch start',{
      sheet,
      selectedHour:document.getElementById('intra-filter-hour')?.value||INTRA.selectedHour||''
    });
    const {rows,signature}=await sheetFetchRows(webAppUrl,sheet);
    intraSetLoading(true,'Procesando filas intradiarias...');
    parseIntradiarioRows(rows);
    INTRA.lastSignature=signature;
    INTRA.fetchedAt=new Date();
    let indexedDbSaved=false;
    try{
      indexedDbSaved=await intraDbWrite(webAppUrl,sheet,INTRA.allRows,signature);
    }catch(error){
      indexedDbSaved=false;
      intraLog('indexeddb save failed',{
        sheet,
        parsedRows:INTRA.allRows.length,
        message:error?.message||String(error)
      });
    }
    renderIntradiario();
    intraLog('fetch applied',{
      sheet,
      rawRows:Array.isArray(rows)?rows.length:0,
      parsedRows:INTRA.allRows.length,
      scopedRows:INTRA.rows.length,
      hours:INTRA.hours.length,
      elapsedMs:Date.now()-startedAt,
      indexedDbSaved
    });
    if(typeof refreshLog==='function'){
      refreshLog('intradiario fetch applied',{
        sheet,
        rawRows:Array.isArray(rows)?rows.length:0,
        scopedRows:INTRA.rows.length,
        elapsedMs:Date.now()-startedAt,
        indexedDbSaved
      });
    }
    if(!silent)showToast(`Intradiario cargado - ${INTRA.rows.length} filas en alcance`);
  }catch(e){
    intraLog('fetch error',{
      sheet,
      elapsedMs:Date.now()-startedAt,
      message:e?.message||String(e)
    });
    if(status)status.textContent='Error: '+(e?.message||String(e));
    if(!silent)showToast('Error intradiario: '+(e?.message||String(e)));
  }finally{
    INTRA.loading=false;
    intraSetLoading(false);
    renderIntradiario();
  }
}

async function intraEnsureData(){
  if(INTRA.loading||INTRA.allRows.length)return;
  if(await intraLoadFromCache()){
    renderIntradiario();
    return;
  }
  intraLog('indexeddb unavailable; waiting for manual refresh',{sheet:intraSheetName()});
}

window.INTRA=INTRA;
window.fetchIntradiario=fetchIntradiario;
window.renderIntradiario=renderIntradiario;
window.intraEnsureData=intraEnsureData;
window.intraOnScopeChange=intraOnScopeChange;
window.intraOnTimeframeChange=intraOnTimeframeChange;
window.intraOnTypeChange=intraOnTypeChange;
window.intraOnBuilderChange=intraOnBuilderChange;
window.intraAddSelection=intraAddSelection;
window.intraAddAtmSelections=intraAddAtmSelections;
window.intraRemoveSelection=intraRemoveSelection;
window.intraRemoveCross=intraRemoveCross;
window.intraClearSelections=intraClearSelections;
window.intraClearComparables=intraClearComparables;
window.intraClearCrosses=intraClearCrosses;
window.intraRemoveCrossGroup=intraRemoveCrossGroup;
window.intraToggleCrossGroupVisibility=intraToggleCrossGroupVisibility;
window.intraGenerateCrossGroupChart=intraGenerateCrossGroupChart;
window.intraSetCrossGroupKind=intraSetCrossGroupKind;
window.intraToggleSelectionVisibility=intraToggleSelectionVisibility;
window.intraGetStrategyKind=intraGetStrategyKind;
window.intraOnSelectionDragStart=intraOnSelectionDragStart;
window.intraOnSelectionDragOver=intraOnSelectionDragOver;
window.intraOnSelectionDrop=intraOnSelectionDrop;
window.intraOnSelectionDragEnd=intraOnSelectionDragEnd;
