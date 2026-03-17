/* ===== CONTROL DE ESTRATEGIAS ===== */
// ctrlStrategies: array of strategies, each strategy = array of row objects
const CTRL_STORAGE_KEY='ggal_ctrl_strategies_v1';

function ctrlSave(){
  try{
    localStorage.setItem(CTRL_STORAGE_KEY, JSON.stringify(ctrlStrategies));
  }catch(e){console.warn('ctrlSave error:',e);}
}

function ctrlLoad(){
  try{
    const raw=localStorage.getItem(CTRL_STORAGE_KEY);
    if(!raw)return false;
    const parsed=JSON.parse(raw);
    if(!Array.isArray(parsed)||!parsed.length)return false;
    ctrlStrategies=parsed;
    return true;
  }catch(e){
    console.warn('ctrlLoad error:',e);
    return false;
  }
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
  return {lotes:1,type:'call',strike:mid,precio:0,precioManual:''};
}

function addCtrlStrategy(){
  const n=ctrlStrategies.length+1;
  ctrlStrategies.push({name:`Estrategia ${n}`,rows:[ctrlDefaultRow(),ctrlDefaultRow()]});
  ctrlSave();renderControl();
}

function removeCtrlStrategy(si){
  ctrlStrategies.splice(si,1);
  ctrlSave();renderControl();
}

function addCtrlRowToStrategy(si){
  ctrlStrategies[si].rows.push(ctrlDefaultRow());
  ctrlSave();renderControl();
}

function removeCtrlRow(si,ri){
  ctrlStrategies[si].rows.splice(ri,1);
  ctrlSave();renderControl();
}

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
    return `${lotes}\t${strike}\t${precio}`;
  }).join('\n');
  navigator.clipboard.writeText(tsv).then(()=>{
    showToast(`Estrategia "${ctrlStrategies[si].name}" copiada al portapapeles`);
  }).catch(()=>{
    // Fallback for browsers that block clipboard
    const ta=document.createElement('textarea');
    ta.value=tsv;
    ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(`Estrategia "${ctrlStrategies[si].name}" copiada al portapapeles`);
  });
}

function ctrlPopulateExpiry(){
  const sel=document.getElementById('ctrl-expiry');
  if(!sel)return;
  const cur=sel.value;
  sel.innerHTML='';
  ST.expirations.forEach(e=>{
    const o=document.createElement('option');
    o.value=e;o.textContent=fmtExpiry(e);
    if(e===cur)o.selected=true;
    sel.appendChild(o);
  });
  if(!sel.value&&ST.selExpiry)sel.value=ST.selExpiry;
}

function ctrlGetLast(strike,type){
  const exp=document.getElementById('ctrl-expiry')?.value||ST.selExpiry;
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
  const strikeOpts=strikes.map(s=>`<option value="${s}"${Math.round(s*100)===Math.round(row.strike*100)?' selected':''}>${fmtStrike(s)}</option>`).join('');

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
  return {tr,costoArmado,desarmado};
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

function parseARSNum(s){
  // Handles: "296,13" "296.13" "1.234,56" "-30,00"
  if(!s&&s!==0)return NaN;
  s=String(s).trim();
  // If has comma and dot: "1.234,56" → ARS format
  if(s.includes(',')&&s.includes('.')){
    return parseFloat(s.replace(/\./g,'').replace(',','.'));
  }
  // Only comma: "296,13" → decimal comma
  if(s.includes(','))return parseFloat(s.replace(',','.'));
  // Only dot or plain number
  return parseFloat(s);
}

function handleCtrlPaste(e,si){
  e.preventDefault();
  const raw=e.clipboardData.getData('text');
  if(!raw.trim())return;

  const allStrikes=getAvailableStrikes();

  // Parse lines — split by newline, columns by tab
  const lines=raw.trim().split(/\r?\n/).filter(l=>l.trim());
  const parsed=lines.map(line=>{
    const cols=line.split('\t').map(c=>c.trim());
    const lotes=parseARSNum(cols[0]);
    const strikeRaw=parseARSNum(cols[1]);
    const precio=parseARSNum(cols[2]);
    if(isNaN(lotes)||isNaN(strikeRaw))return null;

    // Find nearest available strike — compare rounded to avoid float precision issues
    const roundTo2=(n)=>Math.round(n*100);
    const strike=allStrikes.length
      ?allStrikes.reduce((p,c)=>Math.abs(roundTo2(c)-roundTo2(strikeRaw))<Math.abs(roundTo2(p)-roundTo2(strikeRaw))?c:p,allStrikes[0])
      :strikeRaw;

    return{lotes,strike,precio:isNaN(precio)?0:precio,type:'call',precioManual:''};
  }).filter(Boolean);

  if(!parsed.length){showToast('No se reconocieron datos en el formato esperado');return;}

  // Replace strategy rows with parsed data
  ctrlStrategies[si].rows=parsed;
  ctrlSave();
  const ta=document.getElementById('ctrl-paste-'+si);
  if(ta)ta.value='';

  renderControl();
  showToast(`${parsed.length} pata${parsed.length>1?'s':''} cargada${parsed.length>1?'s':''} en Estrategia ${si+1}`);
}

function renderControl(){
  ctrlPopulateExpiry();
  const com=parseFloat(document.getElementById('ctrl-comision')?.value)||0.5;
  const iva=parseFloat(document.getElementById('ctrl-iva')?.value)||1.21;
  const strikes=getAvailableStrikes();
  const container=document.getElementById('ctrl-strategies-container');
  if(!container)return;
  container.innerHTML='';

  if(!ctrlStrategies.length){
    container.innerHTML='<div style="padding:32px;text-align:center;color:var(--muted);font-size:12px">Presioná <b>+ Agregar estrategia</b> para comenzar</div>';
    return;
  }

  ctrlStrategies.forEach((strat,si)=>{
    const stratRows=strat.rows;
    let totalArmado=0,totalDesarmado=0;

    // Build wrapper
    const wrap=document.createElement('div');
    wrap.style.cssText='margin-bottom:14px;border:1px solid var(--border);border-radius:8px;overflow:hidden';

    // Strategy header
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
        <button onclick="addCtrlRowToStrategy(${si})" style="padding:3px 10px;font-size:11px;background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:4px;cursor:pointer">+ Agregar pata</button>
        <button onclick="removeCtrlStrategy(${si})" style="padding:3px 8px;font-size:11px;background:var(--red-bg);border:1px solid var(--red);color:var(--red);border-radius:4px;cursor:pointer">✕ Eliminar</button>
      </div>`;
    wrap.appendChild(hdr);

    // Table
    const tableWrap=document.createElement('div');
    tableWrap.style.overflowX='auto';
    const table=document.createElement('table');
    table.style.cssText='width:100%;border-collapse:collapse;font-family:var(--mono);font-size:12px';

    // thead
    const thead=document.createElement('thead');
    thead.innerHTML=`<tr>${CTRL_TH}</tr>`;
    table.appendChild(thead);

    // tbody
    const tbody=document.createElement('tbody');
    stratRows.forEach((row,ri)=>{
      const {tr,costoArmado,desarmado}=ctrlBuildRow(si,ri,row,strikes,com,iva);
      totalArmado+=costoArmado;
      totalDesarmado+=desarmado;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    // tfoot
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
            ${stratRows.length?(resultado>=0?'+':'')+fmtN(resultado):'--'}
          </span>
        </td>
      </tr>`;
    table.appendChild(tfoot);
    tableWrap.appendChild(table);
    wrap.appendChild(tableWrap);
    container.appendChild(wrap);
  });
}


function renderIVSmile(){
  if(!ST.expirations.length)return;
  const S=ST.spot;
  const colors=['#e8b84b','#5aabff','#44c76a'];
  const datasets=ST.expirations.map((exp,i)=>{
    const rows=ST.chain[exp]||[];
    return{
      label:fmtExpiry(exp),
      data:rows.map(r=>({x:r.strike,y:parseFloat((r.iv*100).toFixed(2))})),
      borderColor:colors[i%3],borderWidth:2,pointRadius:3,fill:false,tension:0.3
    };
  });
  if(ST.charts.iv)ST.charts.iv.destroy();
  const ctx=document.getElementById('iv-chart').getContext('2d');
  ST.charts.iv=new Chart(ctx,{
    type:'line',
    data:{datasets},
    options:{
      responsive:true,maintainAspectRatio:false,animation:false,
      plugins:{
        legend:{display:true,labels:{color:'#7a8fa6',font:{size:11},boxWidth:10,padding:14}},
        tooltip:{backgroundColor:'#131920',borderColor:'#2a3444',borderWidth:1,titleColor:'#7a8fa6',bodyColor:'#d8e3ef',callbacks:{label:c=>` IV: ${c.raw.y}%`,title:c=>`Strike: $${c[0].raw.x}`}}
      },
      scales:{
        x:{type:'linear',ticks:{color:'#7a8fa6',font:{size:10},callback:v=>'$'+(v/1000).toFixed(1)+'k'},grid:{color:'#1a2230'},title:{display:true,text:'Strike',color:'#7a8fa6',font:{size:10}}},
        y:{ticks:{color:'#7a8fa6',font:{size:10},callback:v=>v+'%'},grid:{color:'#1a2230'},title:{display:true,text:'Volatilidad implícita (%)',color:'#7a8fa6',font:{size:10}}}
      }
    }
  });
}

