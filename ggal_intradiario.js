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
  charts:{last:null},
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
  renderIntradiario();
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
  const type=document.getElementById('intra-filter-type')?.value||'all';
  const strikeRaw=document.getElementById('intra-filter-strike')?.value||'';
  const useTicker=type==='future'||type==='underlying'||type==='caucion';
  return INTRA.rows.filter(row=>{
    if(type!=='all'&&row.type!==type)return false;
    if(strikeRaw){
      if(useTicker){
        if((row.ticker||'')!==strikeRaw)return false;
      }else{
        const strikeFilter=parseFloat(strikeRaw);
        if(!Number.isFinite(strikeFilter)||row.strike!==strikeFilter)return false;
      }
    }
    return true;
  });
}

function intraGraphRows(){
  const type=document.getElementById('intra-filter-type')?.value||'all';
  const asset=document.getElementById('intra-filter-strike')?.value||'';
  const status=document.getElementById('intra-chart-status');
  const frame=intraGetTimeframe();
  if(type==='all'){
    if(status)status.textContent='Elegí un Tipo especifico para habilitar los graficos.';
    return null;
  }
  if(!asset){
    if(status)status.textContent='Elegí un Subtipo especifico para habilitar los graficos.';
    return null;
  }
  const useTicker=type==='future'||type==='underlying'||type==='caucion';
  const rows=INTRA.allRows
    .filter(row=>intraTimeMatchesFrame(row.time,frame))
    .filter(row=>row.type===type)
    .filter(row=>useTicker?(row.ticker===asset):(row.strike===parseFloat(asset)))
    .filter(row=>row.last!=null&&isFinite(row.last))
    .slice()
    .sort((a,b)=>{
      const ka=`${a.date||''} ${a.time||''}`;
      const kb=`${b.date||''} ${b.time||''}`;
      return ka.localeCompare(kb);
    });
  if(!rows.length){
    if(status)status.textContent='No hay datos con LAST disponible para el filtro seleccionado.';
    return null;
  }
  if(status){
    const subtypeLabel=useTicker?asset:fmtStrike(parseFloat(asset));
    status.textContent=`Serie de Last para ${intraTypeLabel(type)} · ${subtypeLabel}`;
  }
  return rows;
}

function renderIntradiarioCharts(){
  const rows=intraGraphRows();
  const canvas=document.getElementById('intra-chart-last');
  if(!canvas)return;
  if(!rows){
    if(INTRA.charts.last){
      INTRA.charts.last.destroy();
      INTRA.charts.last=null;
    }
    return;
  }
  const labels=rows.map(row=>row.time||'--');
  const data=rows.map(row=>row.last);
  createLineChart(
    INTRA.charts,
    'last',
    'intra-chart-last',
    labels,
    data,
    '#e8b84b',
    'Last',
    v=>v!=null?fmtN(v):'--',
    {dense:true}
  );
}

function renderIntradiario(){
  const body=document.getElementById('intra-body');
  const summary=document.getElementById('intra-summary');
  const status=document.getElementById('intra-status');
  if(!body||!summary||!status)return;
  intraApplyMode();
  intraUpdateAssetVisibility();

  if(!INTRA.allRows.length){
    body.innerHTML='<tr><td colspan="12" style="padding:24px;text-align:center;color:var(--muted)">Usá "Actualizar intradiario" para cargar datos</td></tr>';
    summary.innerHTML='';
    status.textContent=INTRA.loading?'Cargando...':'Sin datos';
    const chartStatus=document.getElementById('intra-chart-status');
    if(chartStatus)chartStatus.textContent='Cargá datos intradiarios para habilitar los graficos.';
    return;
  }

  const visible=intraFilteredRows();
  const calls=visible.filter(row=>row.type==='call').length;
  const puts=visible.filter(row=>row.type==='put').length;
  const futures=visible.filter(row=>row.type==='future').length;
  const underlyings=visible.filter(row=>row.type==='underlying').length;
  const cauciones=visible.filter(row=>row.type==='caucion').length;
  const latestTs=visible[0]?.tsLabel||INTRA.rows[0]?.tsLabel||'--';
  const withVolume=visible.filter(row=>Number.isFinite(row.volume)).reduce((acc,row)=>acc+(row.volume||0),0);
  const scopeLabel=INTRA.selectedHour==='__all__'?'Todos':(INTRA.selectedHour||'Sin hora');
  const frameLabel=`${intraGetTimeframe()}m`;
  const selectedType=document.getElementById('intra-filter-type')?.value||'all';
  const selectedAsset=document.getElementById('intra-filter-strike')?.value||'';
  const subtypeReady=selectedType!=='all'&&!!selectedAsset;
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
    body.innerHTML='<tr><td colspan="12" style="padding:24px;text-align:center;color:var(--muted)">No hay filas para el filtro seleccionado</td></tr>';
    status.textContent=`${INTRA.rows.length} registros en alcance | ${INTRA.allRows.length} totales`;
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

  const stamp=INTRA.fetchedAt
    ? INTRA.fetchedAt.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})
    : '--';
  status.textContent=`${visible.length} visibles | ${INTRA.rows.length} en alcance | ${INTRA.allRows.length} totales | ${stamp}`;
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
