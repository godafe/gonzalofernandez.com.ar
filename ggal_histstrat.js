/* ===== HISTORICOS Â· STRAT ===== */
const HSTRAT={
  rows:[],
  charts:{main:null,ratio:null},
  storageKey:'ggal_histstrat_state_v1',
  compareLegs:[],
  initialized:false,
  activeSeriesId:'',
  expandedSeriesIds:[],
  lastSeriesList:[],
  lastPointClick:null,
  linkSelection:null,
  hoverPoint:null,
};

const HSTRAT_SERIES_PALETTE=['#5aabff','#44c76a','#f05a5a','#e8b84b','#b088f0','#58d1c9','#f29d50','#a3e635'];

function histStratDestroyMainChart(){
  if(HSTRAT.charts.main){
    HSTRAT.charts.main.destroy();
    HSTRAT.charts.main=null;
  }
  if(HSTRAT.charts.ratio){
    HSTRAT.charts.ratio.destroy();
    HSTRAT.charts.ratio=null;
  }
}

function histStratReadSavedValue(key){
  try{
    const raw=localStorage.getItem(CFG_KEY);
    if(!raw)return '';
    const cfg=JSON.parse(raw);
    const value=cfg?.[key];
    return value==null?'':String(value);
  }catch(_){
    return '';
  }
}

function histStratReadState(){
  try{
    const raw=localStorage.getItem(HSTRAT.storageKey);
    if(!raw)return {};
    const parsed=JSON.parse(raw);
    return parsed&&typeof parsed==='object'?parsed:{};
  }catch(_){
    return {};
  }
}

function histStratWriteState(){
  try{
    const payload={
      type1:document.getElementById('st-type1')?.value||'call',
      strike1:document.getElementById('st-strike1')?.value||'',
      type2:document.getElementById('st-type2')?.value||'call',
      strike2:document.getElementById('st-strike2')?.value||'',
      ri:document.getElementById('st-ri')?.value||'2.00',
      lots:document.getElementById('st-lots')?.value||'100',
      dateFrom:document.getElementById('st-date-from')?.value||'',
      dateTo:document.getElementById('st-date-to')?.value||'',
      compareLegs:Array.isArray(HSTRAT.compareLegs)?HSTRAT.compareLegs:[],
      activeSeriesId:HSTRAT.activeSeriesId||'',
      expandedSeriesIds:Array.isArray(HSTRAT.expandedSeriesIds)?HSTRAT.expandedSeriesIds:[],
    };
    localStorage.setItem(HSTRAT.storageKey,JSON.stringify(payload));
  }catch(_){}
}

function histStratEnsureState(){
  if(HSTRAT.initialized)return;
  const state=histStratReadState();
  HSTRAT.compareLegs=Array.isArray(state.compareLegs)
    ? state.compareLegs
        .filter(item=>item&&item.type&&item.strike)
        .map(item=>({
          type:item.type,
          strike:item.strike,
          visible:item.visible!==false,
        }))
    : [];
  HSTRAT.activeSeriesId=typeof state.activeSeriesId==='string'?state.activeSeriesId:'';
  HSTRAT.expandedSeriesIds=Array.isArray(state.expandedSeriesIds)?state.expandedSeriesIds.filter(v=>typeof v==='string'):[];
  HSTRAT.initialized=true;
}

function histStratLegId(type,strike){
  return `${type}_${strike}`;
}

function histStratLegLabel(leg){
  if(!leg)return '--';
  return `${leg.type==='call'?'C':'P'} ${fmtStrike(parseFloat(leg.strike)||0)}`;
}

function histStratSortCompareLegs(list){
  return (list||[]).slice().sort((a,b)=>{
    const typeCmp=String(a?.type||'').localeCompare(String(b?.type||''));
    if(typeCmp!==0)return typeCmp;
    return (parseFloat(a?.strike)||0)-(parseFloat(b?.strike)||0);
  });
}

function histStratSameLeg(aType,aStrike,bType,bStrike){
  return String(aType||'')===String(bType||'')
    && Math.round((parseFloat(aStrike)||0)*100)===Math.round((parseFloat(bStrike)||0)*100);
}

function histStratSanitizeCompareLegs(baseType,baseStrike){
  const seen=new Set();
  HSTRAT.compareLegs=(HSTRAT.compareLegs||[]).filter(leg=>{
    const type=leg?.type||'';
    const strike=parseFloat(leg?.strike)||0;
    if(!type||!strike||!isFinite(strike))return false;
    if(histStratSameLeg(type,strike,baseType,baseStrike))return false;
    const id=histStratLegId(type,strike);
    if(seen.has(id))return false;
    seen.add(id);
    return true;
  });
  HSTRAT.compareLegs=histStratSortCompareLegs(HSTRAT.compareLegs);
  if(HSTRAT.activeSeriesId&&!seen.has(HSTRAT.activeSeriesId))HSTRAT.activeSeriesId='';
  HSTRAT.expandedSeriesIds=(HSTRAT.expandedSeriesIds||[]).filter(id=>seen.has(id));
}

function histStratVisibleLegs(){
  return (HSTRAT.compareLegs||[]).filter(leg=>leg.visible!==false);
}

function histStratSetActiveSeries(id){
  HSTRAT.activeSeriesId=id||'';
  HSTRAT.expandedSeriesIds=id?[id]:[];
  histStratWriteState();
  renderHistStrat();
}

function histStratGetPointDetail(chartType,chart,point){
  if(!chart||!point)return;
  const ds=chart.data?.datasets?.[point.datasetIndex];
  const seriesId=ds?.seriesId||'';
  const pointIndex=Number(point.index);
  const label=chart.data?.labels?.[pointIndex]||'';
  const value=Array.isArray(ds?.data)?ds.data[pointIndex]:null;
  const series=(HSTRAT.lastSeriesList||[]).find(item=>item.id===seriesId)||null;
  const row=series?.rows?.find(item=>item.date===label)||null;
  const detail={
    chartType,
    seriesId,
    seriesLabel:ds?.label||'',
    datasetIndex:Number(point.datasetIndex),
    pointIndex,
    date:label,
    value:value==null?null:Number(value),
    row,
    color:ds?.borderColor||'#5aabff',
  };
  return detail;
}

function histStratEmitPointClick(chartType,chart,point){
  const detail=histStratGetPointDetail(chartType,chart,point);
  if(!detail)return;
  HSTRAT.lastPointClick=detail;
  try{
    window.dispatchEvent(new CustomEvent('histstrat:point-click',{detail}));
    window.dispatchEvent(new CustomEvent(`histstrat:${chartType}-point-click`,{detail}));
  }catch(_){}
}

function histStratFormatClipboardStrike(strike){
  return fmtStrike(parseFloat(strike)||0).replace(/\./g,'');
}

function histStratFormatClipboardPrice(price){
  const value=parseFloat(price);
  if(!isFinite(value))return '0,000';
  return value.toFixed(3).replace('.',',');
}

function histStratFormatClipboardLots(lots){
  const value=parseFloat(lots);
  if(!isFinite(value))return '0';
  return String(value).replace('.',',');
}

function histStratSignedLots(lots,isNegative){
  return `${isNegative?'-':''}${lots}`;
}

function histStratCopyPairToClipboard(firstDetail,secondDetail){
  const lotsNum=Math.max(1,parseFloat(document.getElementById('st-lots')?.value||'100')||100);
  const riNum=Math.max(1,Math.min(5,parseFloat(document.getElementById('st-ri')?.value||'2')||2));
  const chartType=secondDetail?.chartType||firstDetail?.chartType||'bull';
  const lots=histStratFormatClipboardLots(lotsNum);
  const seriesLots=histStratFormatClipboardLots(chartType==='ratio'?(lotsNum*riNum):lotsNum);
  const baseStrike=histStratFormatClipboardStrike(document.getElementById('st-strike1')?.value||0);
  const seriesStrike=histStratFormatClipboardStrike(secondDetail?.row?.compareStrike||firstDetail?.row?.compareStrike||0);
  const firstRow=firstDetail?.row||{};
  const secondRow=secondDetail?.row||{};
  const initialValue=parseFloat(firstDetail?.value);
  const finalValue=parseFloat(secondDetail?.value);
  const initialIsPositive=isFinite(initialValue)&&initialValue>0;
  const initialIsNegative=isFinite(initialValue)&&initialValue<0;
  const finalIsPositive=isFinite(finalValue)&&finalValue>0;
  const finalIsNegative=isFinite(finalValue)&&finalValue<0;
  const row1LotsBase=histStratSignedLots(lots,initialIsPositive);
  const row1LotsSeries=histStratSignedLots(seriesLots,initialIsNegative);
  const row2LotsBase=histStratSignedLots(lots,finalIsPositive);
  const row2LotsSeries=histStratSignedLots(seriesLots,finalIsNegative);
  const tsv=[
    [row1LotsBase,baseStrike,histStratFormatClipboardPrice(firstRow.base1)].join('\t'),
    [row1LotsSeries,seriesStrike,histStratFormatClipboardPrice(firstRow.base2)].join('\t'),
    [row2LotsBase,baseStrike,histStratFormatClipboardPrice(secondRow.base1)].join('\t'),
    [row2LotsSeries,seriesStrike,histStratFormatClipboardPrice(secondRow.base2)].join('\t'),
  ].join('\n');
  const fallback=()=>{
    const ta=document.createElement('textarea');
    ta.value=tsv;
    ta.style.cssText='position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  };
  navigator.clipboard.writeText(tsv).then(
    ()=>showToast(`Serie ${secondDetail?.seriesLabel||''} copiada al portapapeles`),
    ()=>{fallback();showToast(`Serie ${secondDetail?.seriesLabel||''} copiada al portapapeles`);}
  );
}

function histStratClearLinkSelection(chart){
  HSTRAT.linkSelection=null;
  HSTRAT.hoverPoint=null;
  chart?.draw?.();
  HSTRAT.charts.main?.draw?.();
  HSTRAT.charts.ratio?.draw?.();
}

function histStratHandleLinkedPointClick(chartType,chart,point){
  const detail=histStratGetPointDetail(chartType,chart,point);
  if(!detail||!detail.row)return;
  const current=HSTRAT.linkSelection;
  if(!current){
    HSTRAT.linkSelection=detail;
    HSTRAT.hoverPoint={chartType,x:point.element?.x??null,y:point.element?.y??null};
    chart.draw();
    showToast(`Punto inicial seleccionado: ${detail.seriesLabel} ${probFmtDate(detail.date)}`);
    return;
  }
  if(current.seriesId!==detail.seriesId){
    HSTRAT.linkSelection=detail;
    HSTRAT.hoverPoint={chartType,x:point.element?.x??null,y:point.element?.y??null};
    chart.draw();
    showToast('La union debe hacerse dentro de la misma serie. Punto inicial actualizado.');
    return;
  }
  if(current.chartType!==chartType){
    HSTRAT.linkSelection=detail;
    HSTRAT.hoverPoint={chartType,x:point.element?.x??null,y:point.element?.y??null};
    chart.draw();
    showToast('La union debe hacerse dentro del mismo grafico. Punto inicial actualizado.');
    return;
  }
  if(current.pointIndex===detail.pointIndex){
    histStratClearLinkSelection(chart);
    showToast('Seleccion cancelada');
    return;
  }
  histStratCopyPairToClipboard(current,detail);
  histStratClearLinkSelection(chart);
}

function histStratToggleSeriesExpanded(id){
  const expanded=new Set(HSTRAT.expandedSeriesIds||[]);
  if(expanded.has(id))expanded.delete(id);
  else expanded.add(id);
  HSTRAT.expandedSeriesIds=[...expanded];
  histStratWriteState();
  renderHistStrat();
}

function histStratHeroCardsForMetric(series,metricKey,title){
  const latest=series.rows[series.rows.length-1];
  const values=series.rows.map(row=>row?.[metricKey]).filter(v=>v!=null&&isFinite(v));
  const maxVal=values.length?Math.max(...values):null;
  const minVal=values.length?Math.min(...values):null;
  const posCount=values.filter(v=>v>0).length;
  const negCount=values.filter(v=>v<0).length;
  return [
    ['Serie',series.leg?histStratLegLabel(series.leg):'--','var(--text)'],
    [title,latest?.[metricKey]!=null?fmtN(latest[metricKey]):'--',histStratBullColor(latest?.[metricKey])],
    ['Maximo',maxVal!=null?fmtN(maxVal):'--','var(--green)'],
    ['Minimo',minVal!=null?fmtN(minVal):'--','var(--red)'],
    ['Positivos',String(posCount),'var(--amber)'],
    ['Negativos',String(negCount),'var(--red)'],
  ];
}

function histStratMetricColor(v){
  if(v==null||!isFinite(v))return 'var(--muted)';
  if(v>0)return 'var(--green)';
  if(v<0)return 'var(--red)';
  return 'var(--text)';
}

function histStratSeriesColor(index){
  return HSTRAT_SERIES_PALETTE[index%HSTRAT_SERIES_PALETTE.length];
}

function histStratRenderCompareList(){
  const wrap=document.getElementById('st-compare-list');
  if(!wrap)return;
  if(!HSTRAT.compareLegs.length){
    wrap.innerHTML=`<span style="font-size:11px;color:var(--dim)">Sin comparables agregados. Usa el selector "Comparar" y presiona +.</span>`;
    return;
  }
  wrap.innerHTML=HSTRAT.compareLegs.map(leg=>`
    <div style="display:flex;align-items:center;gap:8px;background:var(--surface2);border:1px solid var(--border2);border-radius:999px;padding:6px 10px">
      <button
        type="button"
        onclick="histStratToggleCompareVisibility('${histStratLegId(leg.type,leg.strike)}')"
        title="${leg.visible===false?'Mostrar serie':'Ocultar serie'}"
        style="border:1px solid ${leg.visible===false?'var(--border)':'rgba(255,215,90,.35)'};background:${leg.visible===false?'transparent':'rgba(255,215,90,.10)'};color:${leg.visible===false?'var(--dim)':'var(--amber)'};border-radius:999px;padding:1px 8px;cursor:pointer;font-size:12px;font-weight:700;line-height:18px"
      >${leg.visible===false?'—':'👁️'}</button>
      <span style="font-family:var(--mono);font-size:11px;color:var(--text)">${histStratLegLabel(leg)}</span>
      <button type="button" onclick="histStratRemoveCompare('${histStratLegId(leg.type,leg.strike)}')" style="border:1px solid var(--border);background:transparent;color:var(--dim);border-radius:999px;padding:0 7px;cursor:pointer;font-size:11px;line-height:18px">&times;</button>
    </div>`).join('')+`
    <button type="button" onclick="histStratClearCompares()" style="padding:4px 10px;border-radius:999px;border:1px solid var(--border);background:transparent;color:var(--dim);cursor:pointer;font-size:11px">Limpiar</button>`;
}

function histStratPopulateStrikes(){
  histStratEnsureState();
  if(!HIST.cols?.length)return;
  const strikes=[...new Set(HIST.cols.map(c=>c.strike))].sort((a,b)=>a-b);
  const s1=document.getElementById('st-strike1');
  const s2=document.getElementById('st-strike2');
  if(!s1||!s2)return;

  const savedState=histStratReadState();
  const current1=s1.value||savedState.strike1||histStratReadSavedValue('st-strike1');
  const current2=s2.value||savedState.strike2||histStratReadSavedValue('st-strike2');
  const num1=parseFloat(current1)||0;
  const num2=parseFloat(current2)||0;

  [s1,s2].forEach((sel,i)=>{
    const current=i===0?num1:num2;
    sel.innerHTML='';
    strikes.forEach(strike=>{
      const option=document.createElement('option');
      option.value=strike;
      option.textContent=fmtStrike(strike);
      if(Math.round(strike*100)===Math.round(current*100))option.selected=true;
      sel.appendChild(option);
    });
  });

  const has1=num1&&strikes.some(strike=>Math.round(strike*100)===Math.round(num1*100));
  const has2=num2&&strikes.some(strike=>Math.round(strike*100)===Math.round(num2*100));
  if(!has1||!has2){
    const sorted=[...strikes].sort((a,b)=>Math.abs(a-ST.spot)-Math.abs(b-ST.spot));
    if(!has1&&sorted[0]!=null)s1.value=String(sorted[0]);
    if(!has2&&sorted[1]!=null)s2.value=String(sorted[1]??sorted[0]);
  }
}

function histStratSyncDefaults(){
  histStratEnsureState();
  const state=histStratReadState();
  const type1El=document.getElementById('st-type1');
  const type2El=document.getElementById('st-type2');
  const lotsEl=document.getElementById('st-lots');
  const riEl=document.getElementById('st-ri');
  const dateFromEl=document.getElementById('st-date-from');
  const dateToEl=document.getElementById('st-date-to');

  if(type1El&&!type1El.dataset.hydrated){
    if(!type1El.value&&state.type1)type1El.value=state.type1;
    type1El.dataset.hydrated='1';
  }
  if(type2El&&!type2El.dataset.hydrated){
    if(!type2El.value&&state.type2)type2El.value=state.type2;
    type2El.dataset.hydrated='1';
  }
  if(riEl&&!riEl.dataset.hydrated){
    if(!riEl.value&&state.ri)riEl.value=state.ri;
    riEl.dataset.hydrated='1';
  }
  if(lotsEl&&!lotsEl.dataset.hydrated){
    if(!lotsEl.value&&state.lots)lotsEl.value=state.lots;
    lotsEl.dataset.hydrated='1';
  }
  if(dateFromEl&&!dateFromEl.dataset.hydrated){
    if(state.dateFrom!=null&&!dateFromEl.value)dateFromEl.value=state.dateFrom;
    dateFromEl.dataset.hydrated='1';
  }
  if(dateToEl&&!dateToEl.dataset.hydrated){
    if(state.dateTo!=null&&!dateToEl.value)dateToEl.value=state.dateTo;
    dateToEl.dataset.hydrated='1';
  }

  if(lotsEl&&(!lotsEl.value||+lotsEl.value<=0))lotsEl.value='100';
  if(riEl&&(!riEl.value||+riEl.value<1))riEl.value='2.00';
}

function histStratClearDate(which){
  const input=document.getElementById(which==='from'?'st-date-from':'st-date-to');
  if(!input)return;
  input.value='';
  input.dataset.hydrated='1';
  histStratWriteState();
  renderHistStrat();
}

function histStratNormalizeInputs(){
  const riEl=document.getElementById('st-ri');
  const lotsEl=document.getElementById('st-lots');
  const ri=Math.max(1,Math.min(5,parseFloat(riEl?.value||'2')||2));
  const lots=Math.max(1,Math.round(parseFloat(lotsEl?.value||'100')||100));
  if(riEl)riEl.value=ri.toFixed(2);
  if(lotsEl)lotsEl.value=String(lots);
  return {ri,lots};
}

function histStratTodayDate(){
  const now=new Date();
  const yyyy=now.getFullYear();
  const mm=String(now.getMonth()+1).padStart(2,'0');
  const dd=String(now.getDate()).padStart(2,'0');
  return `${yyyy}-${mm}-${dd}`;
}

function histStratLiveExpiry(){
  return document.getElementById('expiry-sel')?.value||ST.selExpiry||'';
}

function histStratBuildLiveExtraRow(sourceRows){
  if(!Array.isArray(sourceRows)||!sourceRows.length)return null;
  const today=histStratTodayDate();
  if(sourceRows.some(row=>row?.date===today))return null;
  const expiry=histStratLiveExpiry();
  const chainRows=expiry&&ST.chain?.[expiry];
  if(!Array.isArray(chainRows)||!chainRows.length)return null;
  const prices={__suby__:ST.spot||null};
  let added=0;
  chainRows.forEach(row=>{
    const strike=parseFloat(row?.strike);
    if(!isFinite(strike)||strike<=0)return;
    const callPrice=parseFloat(row?.callMid);
    const putPrice=parseFloat(row?.putMid);
    if(isFinite(callPrice)&&callPrice>0){
      prices[`call_${strike}`]={price:callPrice,strike};
      added++;
    }
    if(isFinite(putPrice)&&putPrice>0){
      prices[`put_${strike}`]={price:putPrice,strike};
      added++;
    }
  });
  if(!added)return null;
  return {
    date:today,
    prices,
    spot:ST.spot||null,
    isLiveExtra:true,
  };
}

function histStratSourceRows(){
  const source=Array.isArray(HIST.rows)?HIST.rows.slice():[];
  const liveExtra=histStratBuildLiveExtraRow(source);
  if(liveExtra)source.push(liveExtra);
  return source;
}

function histStratOnHmdUpdated(){
  histStratEnsureState();
  HSTRAT.rows=[];
  HSTRAT.lastSeriesList=[];
  HSTRAT.lastPointClick=null;
  HSTRAT.linkSelection=null;
  HSTRAT.hoverPoint=null;
  histStratPopulateStrikes();
  const baseType=document.getElementById('st-type1')?.value||'call';
  const baseStrike=parseFloat(document.getElementById('st-strike1')?.value||'0')||0;
  histStratSanitizeCompareLegs(baseType,baseStrike);
  histStratWriteState();
  renderHistStrat();
}

function histStratToggleType(n){
  toggleOptionType('st-type'+n,'st-type'+n+'-btn',renderHistStrat);
  cfgSave?.();
  histStratWriteState();
}

function histStratAddCompare(){
  histStratEnsureState();
  const type=document.getElementById('st-type2')?.value||'call';
  const strike=parseFloat(document.getElementById('st-strike2')?.value||'0');
  const baseType=document.getElementById('st-type1')?.value||'call';
  const baseStrike=parseFloat(document.getElementById('st-strike1')?.value||'0');
  if(!strike||!isFinite(strike))return;
  if(histStratSameLeg(type,strike,baseType,baseStrike)){
    histStratSanitizeCompareLegs(baseType,baseStrike);
    histStratWriteState();
    renderHistStrat();
    return;
  }
  const id=histStratLegId(type,strike);
  if(HSTRAT.compareLegs.some(leg=>histStratLegId(leg.type,leg.strike)===id)){
    histStratWriteState();
    renderHistStrat();
    return;
  }
  HSTRAT.compareLegs=histStratSortCompareLegs([...HSTRAT.compareLegs,{type,strike,visible:true}]);
  HSTRAT.activeSeriesId=id;
  histStratWriteState();
  cfgSave?.();
  renderHistStrat();
}

function histStratToggleCompareVisibility(id){
  HSTRAT.compareLegs=(HSTRAT.compareLegs||[]).map(leg=>{
    if(histStratLegId(leg.type,leg.strike)!==id)return leg;
    return {...leg,visible:leg.visible===false};
  });
  const visibleIds=new Set(histStratVisibleLegs().map(leg=>histStratLegId(leg.type,leg.strike)));
  if(HSTRAT.activeSeriesId&&!visibleIds.has(HSTRAT.activeSeriesId)){
    HSTRAT.activeSeriesId='';
  }
  HSTRAT.expandedSeriesIds=(HSTRAT.expandedSeriesIds||[]).filter(id=>visibleIds.has(id));
  histStratWriteState();
  renderHistStrat();
}

function histStratRemoveCompare(id){
  HSTRAT.compareLegs=HSTRAT.compareLegs.filter(leg=>histStratLegId(leg.type,leg.strike)!==id);
  if(HSTRAT.activeSeriesId===id)HSTRAT.activeSeriesId='';
  HSTRAT.expandedSeriesIds=(HSTRAT.expandedSeriesIds||[]).filter(expandedId=>expandedId!==id);
  histStratWriteState();
  renderHistStrat();
}

function histStratClearCompares(){
  HSTRAT.compareLegs=[];
  HSTRAT.activeSeriesId='';
  HSTRAT.expandedSeriesIds=[];
  histStratWriteState();
  renderHistStrat();
}

function histStratBullColor(v){
  if(v==null||!isFinite(v))return 'var(--muted)';
  if(v>0)return 'var(--green)';
  if(v<0)return 'var(--red)';
  return 'var(--text)';
}

function histStratChartConfig(series,label){
  return {
    type:'line',
    data:{
      labels:series.map(row=>row.date),
      datasets:[{
        label,
        data:series.map(row=>row.bullStrat!=null?parseFloat(row.bullStrat.toFixed(4)):null),
        borderColor:'#5aabff',
        borderWidth:1.8,
        pointRadius:3,
        pointBackgroundColor:'#5aabff',
        fill:false,
        spanGaps:true,
      }],
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      animation:false,
      onHover:(event,elements,chart)=>{
        if(!HSTRAT.linkSelection||HSTRAT.linkSelection.chartType!==chart?.canvas?.dataset?.chartType)return;
        const x=event?.x;
        const y=event?.y;
        HSTRAT.hoverPoint=(x!=null&&y!=null)?{chartType:HSTRAT.linkSelection.chartType,x,y}:null;
        chart.draw();
      },
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:'#131920',
          borderColor:'#2a3444',
          borderWidth:1,
          titleColor:'#7a8fa6',
          bodyColor:'#d8e3ef',
          callbacks:{
            title(items){
              const rawDate=items?.[0]?.label||'';
              return `Fecha: ${rawDate?probFmtDate(rawDate):'--'}`;
            },
            label(c){
              const strike=c?.dataset?.label||'--';
              const value=c?.raw!=null?fmtN(c.raw):'--';
              return [`Strike: ${strike}`, `Valor: ${value}`];
            },
          },
        },
      },
      scales:{
        x:{
          ticks:{
            color:'#7a8fa6',
            font:{size:9},
            maxRotation:45,
            minRotation:45,
            autoSkip:false,
            callback:(v,i)=>{
              const d=series[i]?.date||'';
              const p=d.split('-');
              return p.length>=3?`${p[2]}-${p[1]}`:d;
            },
          },
          grid:{color:'#1a2230'},
        },
        y:{
          ticks:{
            color:'#7a8fa6',
            font:{size:9},
            callback:v=>v!=null?fmtN(v):'--',
          },
          grid:{
            color:ctx=>ctx?.tick?.value===0?'rgba(255,255,255,.9)':'#1a2230',
            lineWidth:1,
          },
        },
      },
    },
    plugins:[{
      id:'histstrat-link-preview',
      afterDatasetsDraw(chart){
        const current=HSTRAT.linkSelection;
        const hover=HSTRAT.hoverPoint;
        if(!current||!hover)return;
        const chartType=chart?.canvas?.dataset?.chartType||'';
        if(current.chartType!==chartType||hover.chartType!==chartType)return;
        const meta=chart.getDatasetMeta(current.datasetIndex);
        const pointEl=meta?.data?.[current.pointIndex];
        const x1=pointEl?.x;
        const y1=pointEl?.y;
        const x2=hover.x;
        const y2=hover.y;
        if([x1,y1,x2,y2].some(v=>typeof v!=='number'||!isFinite(v)))return;
        const ctx=chart.ctx;
        ctx.save();
        ctx.strokeStyle=current.color||'#5aabff';
        ctx.lineWidth=2.2;
        ctx.lineCap='round';
        ctx.setLineDash([2,0]);
        ctx.beginPath();
        ctx.moveTo(x1,y1);
        ctx.lineTo(x2,y2);
        ctx.stroke();
        ctx.restore();
      },
    }],
  };
}

function renderHistStrat(){
  histStratSyncDefaults();
  syncDateFromPicker('st-date-from',null);
  syncDateFromPicker('st-date-to',null);
  const status=document.getElementById('st-status');
  const hero=document.getElementById('st-hero');
  const ratioHero=document.getElementById('st-hero-ratio');
  const body=document.getElementById('st-body');
  if(!status||!hero||!ratioHero||!body)return;

  histStratPopulateStrikes();
  syncTypeBtns(['st-type1','st-type2']);
  histStratRenderCompareList();
  histStratWriteState();

  if(!HIST.rows.length){
    hero.innerHTML='';
    ratioHero.innerHTML='';
    body.innerHTML=`<div style="padding:24px;text-align:center;color:var(--muted)">Sin HMD cargado. Usa "Actualizar HMD" para poblar el modulo.</div>`;
    histStratDestroyMainChart();
    status.textContent='Sin datos';
    return;
  }

  const K1=parseFloat(document.getElementById('st-strike1')?.value)||0;
  const type1=document.getElementById('st-type1')?.value||'call';
  const {ri,lots}=histStratNormalizeInputs();
  const dateFrom=document.getElementById('st-date-from')?.value.trim()||'';
  const dateTo=document.getElementById('st-date-to')?.value.trim()||'';
  histStratSanitizeCompareLegs(type1,K1);
  histStratWriteState();

  let source=histStratSourceRows();
  if(dateFrom)source=source.filter(row=>row.date>=dateFrom);
  if(dateTo)source=source.filter(row=>row.date<=dateTo);

  const compareLegs=histStratVisibleLegs();
  histStratRenderCompareList();
  histStratWriteState();

  if(!compareLegs.length){
    hero.innerHTML='';
    ratioHero.innerHTML='';
    body.innerHTML=`<div style="padding:24px;text-align:center;color:var(--muted)">No hay series visibles. Rehabilita un comparable para volver a graficar.</div>`;
    status.textContent='Sin series visibles';
    histStratDestroyMainChart();
    return;
  }

  const seriesList=compareLegs.map(leg=>{
    const rows=source.map(row=>{
      const e1=row.prices[`${type1}_${K1}`]||null;
      const e2=row.prices[`${leg.type}_${leg.strike}`]||null;
      const p1=e1?.price??null;
      const p2=e2?.price??null;
      const bull=(p1!=null&&p2!=null&&isFinite(p1)&&isFinite(p2))?(p1-p2)*lots:null;
      return{
        compareType:leg.type,
        compareStrike:leg.strike,
        compareLabel:histStratLegLabel(leg),
        date:row.date||'--',
        spot:row.spot||ST.spot||null,
        base1:p1,
        base2:p2,
        bull,
      };
    }).filter(row=>row.base1!=null&&row.base2!=null);
    const stratRows=rows.map((row,idx,arr)=>{
      const prev=idx>0?arr[idx-1]:null;
      return{
        ...row,
        prevDate:prev?.date||null,
        prevBase1:prev?.base1??null,
        prevBase2:prev?.base2??null,
        prevBull:prev?.bull??null,
        bullStrat:(prev?.bull!=null&&row.bull!=null)?(row.bull-prev.bull):null,
        ratioStrat:(prev?.base1!=null&&prev?.base2!=null&&row.base1!=null&&row.base2!=null)
          ? -(((prev.base1-row.base1)+(ri*(row.base2-prev.base2)))*lots)
          : null,
      };
    }).filter(row=>row.bullStrat!=null||row.ratioStrat!=null);
    return {id:histStratLegId(leg.type,leg.strike),leg,rows:stratRows};
  }).filter(series=>series.rows.length);

  if(!seriesList.length){
    hero.innerHTML='';
    ratioHero.innerHTML='';
    body.innerHTML=`<div style="padding:24px;text-align:center;color:var(--muted)">No se pudo calcular Bull Strat para los comparables agregados en el rango seleccionado.</div>`;
    histStratDestroyMainChart();
    status.textContent='Serie vacia';
    return;
  }

  HSTRAT.rows=seriesList
    .flatMap(series=>series.rows)
    .slice()
    .sort((a,b)=>
      `${a.compareLabel||''} ${a.date||''}`.localeCompare(`${b.compareLabel||''} ${b.date||''}`)
    );
  let focusSeries=seriesList.find(series=>series.id===HSTRAT.activeSeriesId)||seriesList[seriesList.length-1];
  HSTRAT.activeSeriesId=focusSeries?.id||'';
  histStratWriteState();

  hero.innerHTML=histStratHeroCardsForMetric(focusSeries,'bullStrat','Ultimo Bull Strat').map(([label,value,color])=>`
    <div style="padding:12px;background:var(--surface2);border:1px solid var(--border2);border-radius:8px">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:5px">${label}</div>
      <div style="font-family:var(--mono);font-size:18px;color:${color};font-weight:600">${value}</div>
    </div>`).join('');
  ratioHero.innerHTML=histStratHeroCardsForMetric(focusSeries,'ratioStrat','Ultimo Ratio Strat').map(([label,value,color])=>`
    <div style="padding:12px;background:var(--surface2);border:1px solid var(--border2);border-radius:8px">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:5px">${label}</div>
      <div style="font-family:var(--mono);font-size:18px;color:${color};font-weight:600">${value}</div>
    </div>`).join('');

  const label=`Base: ${type1==='call'?'C':'P'} ${fmtStrike(K1)}`;
  const base1Label=`${type1==='call'?'Call':'Put'} ${fmtStrike(K1)}`;
  const base2Label='Comparable';
  const seriesColorMap=new Map();
  const chartLabels=[...new Set(seriesList.flatMap(series=>series.rows.map(row=>row.date)))].sort((a,b)=>String(a).localeCompare(String(b)));
  HSTRAT.lastSeriesList=seriesList;
  const datasets=seriesList.map((series,index)=>{
    const byDate=new Map(series.rows.map(row=>[row.date,row]));
    const isActive=series.id===focusSeries.id;
    const color=histStratSeriesColor(index);
    seriesColorMap.set(series.id,color);
    return {
      label:`${histStratLegLabel(series.leg)}`,
      seriesId:series.id,
      data:chartLabels.map(date=>{
        const row=byDate.get(date);
        return row?.bullStrat!=null?parseFloat(row.bullStrat.toFixed(4)):null;
      }),
      borderColor:color,
      borderWidth:isActive?2.6:1.8,
      pointRadius:isActive?4:3,
      pointHitRadius:16,
      pointHoverRadius:6,
      pointBackgroundColor:color,
      fill:false,
      spanGaps:true,
      tension:0,
    };
  });
  const ratioDatasets=seriesList.map((series,index)=>{
    const byDate=new Map(series.rows.map(row=>[row.date,row]));
    const isActive=series.id===focusSeries.id;
    const color=seriesColorMap.get(series.id)||histStratSeriesColor(index);
    return {
      label:`${histStratLegLabel(series.leg)}`,
      seriesId:series.id,
      data:chartLabels.map(date=>{
        const row=byDate.get(date);
        return row?.ratioStrat!=null?parseFloat(row.ratioStrat.toFixed(4)):null;
      }),
      borderColor:color,
      borderWidth:isActive?2.6:1.8,
      pointRadius:isActive?4:3,
      pointHitRadius:16,
      pointHoverRadius:6,
      pointBackgroundColor:color,
      fill:false,
      spanGaps:true,
      tension:0,
    };
  });
  body.innerHTML=`
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="chart-wrap" style="padding:14px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:8px">Bull Strat</div>
        <div style="font-size:12px;color:var(--text);margin-bottom:12px">${label} · variacion de estrategia bull entre ruedas consecutivas · ${lots} lotes · ${seriesList.length} comparable(s)</div>
        <div style="position:relative;height:320px"><canvas id="st-chart-main"></canvas></div>
      </div>

      <div class="chart-wrap" style="padding:14px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:8px">Ratio Strat</div>
        <div style="font-size:12px;color:var(--text);margin-bottom:12px">${label} · formula con relacion RC/RI ${fmtN(ri,2)} · ${lots} lotes</div>
        <div style="position:relative;height:320px"><canvas id="st-chart-ratio"></canvas></div>
      </div>

      <div class="panel" style="padding:0;overflow:hidden">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted)">Detalle calculado</div>
            <div style="font-size:12px;color:var(--text)">Bases, costo bull y valor diario de Bull Strat para comparar con Excel</div>
          </div>
        </div>
        <div style="overflow:auto;max-height:420px">
          <table style="width:100%;border-collapse:collapse;font-family:var(--mono);font-size:11px">
            <thead style="position:sticky;top:0;z-index:2;background:var(--surface2)">
              <tr>
                <th style="padding:7px 8px;border-bottom:1px solid var(--border);text-align:center;color:var(--muted);font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.6px">Ver</th>
                <th style="padding:7px 8px;border-bottom:1px solid var(--border);text-align:center;color:var(--muted);font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.6px">Serie</th>
                <th style="padding:7px 8px;border-bottom:1px solid var(--border);text-align:center;color:var(--muted);font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.6px">Fecha</th>
                <th style="padding:7px 8px;border-bottom:1px solid var(--border);text-align:center;color:var(--green);font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.6px">${base1Label}</th>
                <th style="padding:7px 8px;border-bottom:1px solid var(--border);text-align:center;color:var(--red);font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.6px">${base2Label}</th>
                <th style="padding:7px 8px;border-bottom:1px solid var(--border);text-align:center;color:var(--amber);font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.6px">Costo Bull</th>
                <th style="padding:7px 8px;border-bottom:1px solid var(--border);text-align:center;color:var(--blue);font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.6px">Bull Strat</th>
              </tr>
            </thead>
            <tbody>
              ${seriesList.map(series=>{
                const expanded=(HSTRAT.expandedSeriesIds||[]).includes(series.id);
                const isActive=series.id===focusSeries.id;
                const latestRow=series.rows[series.rows.length-1];
                return `
                  <tr style="border-bottom:1px solid var(--border);background:${isActive?'rgba(255,215,90,.08)':'var(--surface2)'}">
                    <td style="padding:5px 8px;text-align:center">
                      <button
                        type="button"
                        onclick="histStratToggleSeriesExpanded('${series.id}')"
                        title="${expanded?'Colapsar':'Expandir'} serie"
                        style="padding:1px 8px;border-radius:999px;border:1px solid var(--border);background:var(--bg);color:var(--text);cursor:pointer;font-size:11px"
                      >${expanded?'-':'+'}</button>
                    </td>
                    <td style="padding:6px 8px;text-align:center;color:${seriesColorMap.get(series.id)||'var(--text)'};font-weight:${isActive?'700':'600'};white-space:nowrap">${series.rows[0]?.compareLabel||'--'}</td>
                    <td style="padding:6px 8px;text-align:center;color:var(--muted);white-space:nowrap">${latestRow?.date?probFmtDate(latestRow.date):'--'}</td>
                    <td style="padding:6px 8px;text-align:center;color:var(--green)">${latestRow?.base1!=null?fmtN(latestRow.base1):'--'}</td>
                    <td style="padding:6px 8px;text-align:center;color:var(--red)">${latestRow?.base2!=null?fmtN(latestRow.base2):'--'}</td>
                    <td style="padding:6px 8px;text-align:center;color:${histStratBullColor(latestRow?.bull)}">${latestRow?.bull!=null?fmtN(latestRow.bull):'--'}</td>
                    <td style="padding:6px 8px;text-align:center;color:${histStratBullColor(latestRow?.bullStrat)}">${latestRow?.bullStrat!=null?fmtN(latestRow.bullStrat):'--'}</td>
                  </tr>
                  ${expanded?series.rows.map(row=>`
                    <tr style="border-bottom:1px solid var(--border2)">
                      <td style="padding:5px 8px;text-align:center;color:var(--dim)">&middot;</td>
                      <td style="padding:5px 8px;text-align:center;color:${seriesColorMap.get(series.id)||'var(--text)'};white-space:nowrap">${row.compareLabel||'--'}</td>
                      <td style="padding:5px 8px;text-align:center;color:var(--muted);white-space:nowrap">${probFmtDate(row.date)}</td>
                      <td style="padding:5px 8px;text-align:center;color:var(--green)">${row.base1!=null?fmtN(row.base1):'--'}</td>
                      <td style="padding:5px 8px;text-align:center;color:var(--red)">${row.base2!=null?fmtN(row.base2):'--'}</td>
                      <td style="padding:5px 8px;text-align:center;color:${histStratBullColor(row.bull)}">${row.bull!=null?fmtN(row.bull):'--'}</td>
                      <td style="padding:5px 8px;text-align:center;color:${histStratBullColor(row.bullStrat)}">${row.bullStrat!=null?fmtN(row.bullStrat):'--'}</td>
                    </tr>`).join(''):''}
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel" style="padding:0;overflow:hidden">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted)">Detalle Ratio Strat</div>
            <div style="font-size:12px;color:var(--text)">Comparacion por serie con la formula de Ratio Strat para validar contra Excel</div>
          </div>
        </div>
        <div style="overflow:auto;max-height:420px">
          <table style="width:100%;border-collapse:collapse;font-family:var(--mono);font-size:11px">
            <thead style="position:sticky;top:0;z-index:2;background:var(--surface2)">
              <tr>
                <th style="padding:7px 8px;border-bottom:1px solid var(--border);text-align:center;color:var(--muted);font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.6px">Ver</th>
                <th style="padding:7px 8px;border-bottom:1px solid var(--border);text-align:center;color:var(--muted);font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.6px">Serie</th>
                <th style="padding:7px 8px;border-bottom:1px solid var(--border);text-align:center;color:var(--muted);font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.6px">Fecha</th>
                <th style="padding:7px 8px;border-bottom:1px solid var(--border);text-align:center;color:var(--green);font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.6px">${base1Label}</th>
                <th style="padding:7px 8px;border-bottom:1px solid var(--border);text-align:center;color:var(--red);font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.6px">${base2Label}</th>
                <th style="padding:7px 8px;border-bottom:1px solid var(--border);text-align:center;color:var(--blue);font-family:var(--sans);font-size:9px;text-transform:uppercase;letter-spacing:.6px">Ratio Strat</th>
              </tr>
            </thead>
            <tbody>
              ${seriesList.map(series=>{
                const expanded=(HSTRAT.expandedSeriesIds||[]).includes(series.id);
                const isActive=series.id===focusSeries.id;
                const latestRow=series.rows[series.rows.length-1];
                return `
                  <tr style="border-bottom:1px solid var(--border);background:${isActive?'rgba(255,215,90,.08)':'var(--surface2)'}">
                    <td style="padding:5px 8px;text-align:center">
                      <button
                        type="button"
                        onclick="histStratToggleSeriesExpanded('${series.id}')"
                        title="${expanded?'Colapsar':'Expandir'} serie"
                        style="padding:1px 8px;border-radius:999px;border:1px solid var(--border);background:var(--bg);color:var(--text);cursor:pointer;font-size:11px"
                      >${expanded?'-':'+'}</button>
                    </td>
                    <td style="padding:6px 8px;text-align:center;color:${seriesColorMap.get(series.id)||'var(--text)'};font-weight:${isActive?'700':'600'};white-space:nowrap">${series.rows[0]?.compareLabel||'--'}</td>
                    <td style="padding:6px 8px;text-align:center;color:var(--muted);white-space:nowrap">${latestRow?.date?probFmtDate(latestRow.date):'--'}</td>
                    <td style="padding:6px 8px;text-align:center;color:var(--green)">${latestRow?.base1!=null?fmtN(latestRow.base1):'--'}</td>
                    <td style="padding:6px 8px;text-align:center;color:var(--red)">${latestRow?.base2!=null?fmtN(latestRow.base2):'--'}</td>
                    <td style="padding:6px 8px;text-align:center;color:${histStratMetricColor(latestRow?.ratioStrat)}">${latestRow?.ratioStrat!=null?fmtN(latestRow.ratioStrat):'--'}</td>
                  </tr>
                  ${expanded?series.rows.map(row=>`
                    <tr style="border-bottom:1px solid var(--border2)">
                      <td style="padding:5px 8px;text-align:center;color:var(--dim)">&middot;</td>
                      <td style="padding:5px 8px;text-align:center;color:${seriesColorMap.get(series.id)||'var(--text)'};white-space:nowrap">${row.compareLabel||'--'}</td>
                      <td style="padding:5px 8px;text-align:center;color:var(--muted);white-space:nowrap">${probFmtDate(row.date)}</td>
                      <td style="padding:5px 8px;text-align:center;color:var(--green)">${row.base1!=null?fmtN(row.base1):'--'}</td>
                      <td style="padding:5px 8px;text-align:center;color:var(--red)">${row.base2!=null?fmtN(row.base2):'--'}</td>
                      <td style="padding:5px 8px;text-align:center;color:${histStratMetricColor(row.ratioStrat)}">${row.ratioStrat!=null?fmtN(row.ratioStrat):'--'}</td>
                    </tr>`).join(''):''}
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;

  histStratDestroyMainChart();
  const mainCanvas=document.getElementById('st-chart-main');
  if(mainCanvas)mainCanvas.dataset.chartType='bull';
  const ctx=mainCanvas?.getContext('2d');
  if(ctx){
    const baseCfg=histStratChartConfig(focusSeries.rows,label);
    HSTRAT.charts.main=new Chart(ctx,{
      ...baseCfg,
      data:{labels:chartLabels,datasets},
      options:{
        ...baseCfg.options,
        onClick:(event,elements,chart)=>{
          const points=chart.getElementsAtEventForMode(event,'nearest',{intersect:false},true);
          const point=points?.[0];
          const ds=point?chart.data.datasets?.[point.datasetIndex]:null;
          const nextId=ds?.seriesId||'';
          if(point)histStratEmitPointClick('bull',chart,point);
          if(point)histStratHandleLinkedPointClick('bull',chart,point);
          if(nextId)histStratSetActiveSeries(nextId);
        },
        plugins:{
          ...baseCfg.options.plugins,
          legend:{
            display:true,
            labels:{color:'#7a8fa6',font:{size:9},boxWidth:10,padding:10},
            onClick:(event,legendItem,legend)=>{
              const ds=legend?.chart?.data?.datasets?.[legendItem.datasetIndex];
              const nextId=ds?.seriesId||'';
              if(nextId)histStratSetActiveSeries(nextId);
            },
          },
        },
      },
    });
    mainCanvas?.addEventListener('mouseleave',()=>{
      if(HSTRAT.linkSelection?.chartType==='bull'){
        HSTRAT.hoverPoint=null;
        HSTRAT.charts.main?.draw?.();
      }
    });
  }
  const ratioCanvas=document.getElementById('st-chart-ratio');
  if(ratioCanvas)ratioCanvas.dataset.chartType='ratio';
  const ratioCtx=ratioCanvas?.getContext('2d');
  if(ratioCtx){
    const baseCfg=histStratChartConfig(focusSeries.rows,`${label} · Ratio Strat`);
    HSTRAT.charts.ratio?.destroy?.();
    HSTRAT.charts.ratio=new Chart(ratioCtx,{
      ...baseCfg,
      data:{labels:chartLabels,datasets:ratioDatasets},
      options:{
        ...baseCfg.options,
        onClick:(event,elements,chart)=>{
          const points=chart.getElementsAtEventForMode(event,'nearest',{intersect:false},true);
          const point=points?.[0];
          const ds=point?chart.data.datasets?.[point.datasetIndex]:null;
          const nextId=ds?.seriesId||'';
          if(point)histStratEmitPointClick('ratio',chart,point);
          if(point)histStratHandleLinkedPointClick('ratio',chart,point);
          if(nextId)histStratSetActiveSeries(nextId);
        },
        plugins:{
          ...baseCfg.options.plugins,
          legend:{
            display:true,
            labels:{color:'#7a8fa6',font:{size:9},boxWidth:10,padding:10},
            onClick:(event,legendItem,legend)=>{
              const ds=legend?.chart?.data?.datasets?.[legendItem.datasetIndex];
              const nextId=ds?.seriesId||'';
              if(nextId)histStratSetActiveSeries(nextId);
            },
          },
        },
      },
    });
    ratioCanvas?.addEventListener('mouseleave',()=>{
      if(HSTRAT.linkSelection?.chartType==='ratio'){
        HSTRAT.hoverPoint=null;
        HSTRAT.charts.ratio?.draw?.();
      }
    });
  }
  status.textContent=`${HSTRAT.rows.length} registros · ${seriesList.length} series`;
}

window.histStratPopulateStrikes=histStratPopulateStrikes;
window.histStratToggleType=histStratToggleType;
window.histStratAddCompare=histStratAddCompare;
window.histStratToggleCompareVisibility=histStratToggleCompareVisibility;
window.histStratToggleSeriesExpanded=histStratToggleSeriesExpanded;
window.histStratRemoveCompare=histStratRemoveCompare;
window.histStratClearCompares=histStratClearCompares;
window.histStratClearDate=histStratClearDate;
window.histStratSetActiveSeries=histStratSetActiveSeries;
window.histStratOnHmdUpdated=histStratOnHmdUpdated;
window.renderHistStrat=renderHistStrat;

