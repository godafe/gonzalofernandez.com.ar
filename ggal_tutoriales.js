/* ===== MÓDULO TUTORIALES ===== */
const TUT_PAGES={

cadena:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">📊 Cadena de opciones</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Visualización en tiempo real de calls y puts para el vencimiento seleccionado.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">¿Qué muestra?</h3>
<p>La cadena de opciones presenta todos los contratos disponibles para GGAL organizados por strike. Las <span style="color:var(--green)">calls</span> están a la izquierda y las <span style="color:var(--red)">puts</span> a la derecha, con el strike en el centro.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Columnas</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px">
  <tr style="background:var(--surface2)"><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Campo</th><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Descripción</th></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--green)">Delta</td><td style="padding:6px 10px;color:var(--muted)">Sensibilidad del precio de la opción ante movimientos del subyacente. Call: 0 a 1. Put: -1 a 0.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Vega</td><td style="padding:6px 10px;color:var(--muted)">Cuánto cambia la prima ante un cambio del 1% en volatilidad implícita.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Theta</td><td style="padding:6px 10px;color:var(--muted)">Decaimiento diario del valor de la opción por el paso del tiempo. Siempre negativo.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Bid / Ask</td><td style="padding:6px 10px;color:var(--muted)">Mejor precio de compra y venta disponible en el mercado.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--green)">Last</td><td style="padding:6px 10px;color:var(--muted)">Último precio operado. Es el valor que se usa para calcular la IV implícita.</td></tr>
  <tr><td style="padding:6px 10px;color:var(--amber)">IV</td><td style="padding:6px 10px;color:var(--muted)">Volatilidad implícita calculada con Black-Scholes a partir del Last.</td></tr>
</table>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Colores de filas</h3>
<ul style="color:var(--muted);padding-left:18px;margin:0">
  <li style="margin-bottom:6px"><span style="color:var(--green)">Verde</span> — Call ITM: el precio actual del subyacente está por encima del strike.</li>
  <li style="margin-bottom:6px"><span style="color:var(--red)">Rojo suave</span> — Put ITM: el precio actual está por debajo del strike.</li>
  <li><span style="color:var(--amber)">Ámbar</span> — Strikes ATM: los dos más cercanos al precio spot actual.</li>
</ul>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Barra Black-Scholes</h3>
<p style="color:var(--muted)">Permite ajustar el Spot, Tasa libre de riesgo, Dividendos y Días al vencimiento para recalcular la IV implícita de todos los contratos en tiempo real sin necesidad de recargar datos.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Greeks al hacer click</h3>
<p style="color:var(--muted)">Al hacer click en cualquier opción de la cadena se abre un panel con los 6 griegos completos: Delta, Gamma, Theta, Vega, Rho y el precio teórico BS.</p>
`,

control:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">🎛️ Control de estrategias</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Seguimiento del P&L de tus posiciones abiertas con precios actualizados de la cadena.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">¿Para qué sirve?</h3>
<p style="color:var(--muted)">Permite registrar las patas de tus estrategias con el precio al que las armaste, y compararlas con el precio actual del mercado para ver el resultado si las desarmaras hoy.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Columnas</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px">
  <tr style="background:var(--surface2)"><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Campo</th><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Descripción</th></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Lotes</td><td style="padding:6px 10px;color:var(--muted)">Cantidad de contratos. Positivo = compra, negativo = venta.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Precio</td><td style="padding:6px 10px;color:var(--muted)">Precio al que se armó la pata (precio de entrada).</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--amber)">Costo c/Comi</td><td style="padding:6px 10px;color:var(--muted)">Costo total de armar esa pata incluyendo comisión e IVA. Negativo = débito.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Precio Last</td><td style="padding:6px 10px;color:var(--muted)">Precio actual de la opción tomado de la cadena activa.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Precio Manual</td><td style="padding:6px 10px;color:var(--muted)">Si cargás un precio aquí, pisa el Last para ese cálculo (aparece badge "MAN").</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--amber)">Desarmado c/Comi</td><td style="padding:6px 10px;color:var(--muted)">Cuánto recibirías/pagarías al cerrar esa pata hoy.</td></tr>
  <tr><td style="padding:6px 10px">Dif Precio %</td><td style="padding:6px 10px;color:var(--muted)">Variación porcentual entre el precio de entrada y el precio actual.</td></tr>
</table>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Fórmulas de costo</h3>
<p style="color:var(--muted);font-family:var(--mono);font-size:11px;background:var(--surface2);padding:10px;border-radius:5px;border:1px solid var(--border2)">
Costo armado = -100 × lotes × precio × (1 + SIGN(lotes) × (com% + 0.2%) × IVA)<br>
Desarmado = 100 × lotes × precioLast × (1 - SIGN(lotes) × (com% + 0.2%) × IVA)
</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Pegado de datos (TSV)</h3>
<p style="color:var(--muted)">Podés pegar datos directamente desde Excel o el módulo Mariposa. El formato esperado es una fila por pata: <code style="background:var(--bg);padding:2px 6px;border-radius:3px">lotes ⇥ strike ⇥ precio</code></p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Persistencia</h3>
<p style="color:var(--muted)">Las estrategias se guardan automáticamente en el navegador (localStorage). Al reabrir la página se restauran solas. El botón <strong style="color:var(--red)">✕ Limpiar guardado</strong> elimina todo lo guardado.</p>
`,

ivsmile:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">📈 Smile de volatilidad</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Curva de volatilidad implícita por strike para cada vencimiento disponible.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">¿Qué muestra?</h3>
<p style="color:var(--muted)">El smile de volatilidad grafica la IV implícita de cada strike para los vencimientos disponibles. En mercados normales forma una "sonrisa" o "skew": las opciones OTM suelen tener mayor IV que las ATM.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Interpretación</h3>
<ul style="color:var(--muted);padding-left:18px;margin:0">
  <li style="margin-bottom:6px"><strong>Skew negativo (put skew)</strong>: las puts OTM tienen IV más alta que las calls OTM. Indica miedo bajista en el mercado.</li>
  <li style="margin-bottom:6px"><strong>Smile simétrico</strong>: IV alta en ambos extremos, mercado en equilibrio.</li>
  <li style="margin-bottom:6px"><strong>Curva plana</strong>: poca diferencia de IV entre strikes — mercado sin dirección clara.</li>
  <li><strong>Pico ATM</strong>: el mercado está pagando más por opciones cerca del precio actual.</li>
</ul>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Línea vertical</h3>
<p style="color:var(--muted)">La línea punteada vertical indica el precio spot actual del subyacente (GGAL). Los strikes a la izquierda son puts ITM / calls OTM, y los de la derecha son calls ITM / puts OTM.</p>
`,

histdata:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">🗂️ Datos históricos</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Evolución histórica de precios, IV y métricas de estrategia para dos strikes seleccionados.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Parámetros</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px">
  <tr style="background:var(--surface2)"><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Parámetro</th><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Descripción</th></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">S1 / S2</td><td style="padding:6px 10px;color:var(--muted)">Los dos strikes a comparar. Podés elegir si son Call o Put con el botón de tipo.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Tasa %</td><td style="padding:6px 10px;color:var(--muted)">Tasa libre de riesgo usada para calcular IV histórica. Default 0%.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Vencimiento</td><td style="padding:6px 10px;color:var(--muted)">Fecha de vencimiento de los contratos. Se usa para calcular el tiempo T en la IV de cada fila histórica.</td></tr>
  <tr><td style="padding:6px 10px">Relación RI</td><td style="padding:6px 10px;color:var(--muted)">Multiplicador para el Costo RI. Rango 0.1 – 4. Default 2.</td></tr>
</table>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Columnas calculadas</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px">
  <tr style="background:var(--surface2)"><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Columna</th><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Fórmula</th></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--amber)">VI S1 / VI S2</td><td style="padding:6px 10px;color:var(--muted)">IV implícita de cada strike calculada con Black-Scholes inverso (Newton-Raphson) usando el spot histórico del día.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--amber)">VI prom.</td><td style="padding:6px 10px;color:var(--muted)">(VI S1 + VI S2) / 2</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">RC</td><td style="padding:6px 10px;color:var(--muted)">Relación de costos = Precio S1 / Precio S2</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Straddle</td><td style="padding:6px 10px;color:var(--muted)">Precio S1 + Precio S2</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Bull/Bear</td><td style="padding:6px 10px;color:var(--muted)">Precio S1 − Precio S2. Si ambos son calls = Bull Call Spread. Si ambos puts = Bear Put Spread.</td></tr>
  <tr><td style="padding:6px 10px">Costo RI</td><td style="padding:6px 10px;color:var(--muted);font-family:var(--mono);font-size:11px">(S1 × -10) + S2 × RI × 10</td></tr>
</table>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Fuente de datos</h3>
<p style="color:var(--muted)">Los datos vienen de la hoja <strong>HMD</strong> de tu Google Sheet. El formato es "tall" (una fila por instrumento por fecha). La columna F contiene el strike canónico que agrupa las bases aunque el strike exacto cambie entre vencimientos.</p>
`,

mariposa:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">🦋 Mariposa</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Generador automático de combinaciones de estrategia mariposa desde la cadena activa.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">¿Qué es una mariposa?</h3>
<p style="color:var(--muted)">La mariposa es una estrategia de tres patas: compra de un strike bajo (SL), venta de un strike medio (SM) y compra de un strike alto (SH). Tiene ganancia máxima si el precio queda exactamente en SM al vencimiento, y pérdida limitada al costo inicial.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Tipos de mariposa</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px">
  <tr style="background:var(--surface2)"><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Tipo</th><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Descripción</th></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--green)">Estándar</td><td style="padding:6px 10px;color:var(--muted)">Ratio 1 × 2 × 1. Las alas son equidistantes en strikes. Se copia como 10 / -20 / 10 lotes.</td></tr>
  <tr><td style="padding:6px 10px;color:var(--blue)">Simétrica</td><td style="padding:6px 10px;color:var(--muted)">Ajusta el ala alta para que sea equidistante en <strong>$</strong> del SM. Ratio = (SM-SL)/(SH-SM). Se copia con lotes × 100 para evitar decimales.</td></tr>
</table>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Columnas</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px">
  <tr style="background:var(--surface2)"><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Columna</th><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Fórmula</th></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--amber)">Costo Bruto</td><td style="padding:6px 10px;color:var(--muted);font-family:var(--mono);font-size:11px">(pSL − 2×pSM + pSH) × 100</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--amber)">Costo Neto</td><td style="padding:6px 10px;color:var(--muted)">Costo Bruto más comisiones de las 3 patas.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--amber)">Costo Simétrico</td><td style="padding:6px 10px;color:var(--muted);font-family:var(--mono);font-size:11px">(pSL + r×pSH − (1+r)×pSM) × 100<br><span style="color:var(--dim)">donde r = (SM−SL)/(SH−SM)</span></td></tr>
  <tr><td style="padding:6px 10px">Ratio Simétrico</td><td style="padding:6px 10px;color:var(--muted)">Muestra los lotes relativos: 1 × (1+r) × r</td></tr>
</table>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Threshold de color</h3>
<p style="color:var(--muted)">Los costos se muestran en <span style="color:var(--green)">verde</span> si son ≤ 0 (crédito) o si su valor absoluto es menor al threshold configurado. En <span style="color:var(--red)">rojo</span> si superan ese umbral. Default: 5.000.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Botón Generar</h3>
<p style="color:var(--muted)">Cada fila tiene dos botones que copian la estrategia al portapapeles en formato TSV listo para pegar en <strong>Control de estrategias</strong>.</p>
`,

promedio:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">⚖️ Precio Promedio</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Calculadora de precio promedio ponderado por strike, con comisiones e IVA. Las operaciones se agrupan automáticamente por base.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">¿Para qué sirve?</h3>
<p style="color:var(--muted)">Cuando tenés varias compras y/o ventas de distintos strikes, este módulo calcula el precio promedio real de cada base por separado — con el impacto de comisiones e IVA incluido.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Cómo usarlo</h3>
<ol style="color:var(--muted);padding-left:18px;line-height:2">
  <li>Configurá Comisión % e IVA en <strong>Config Sitio</strong></li>
  <li>Pegá filas en formato <code style="background:var(--bg);padding:2px 6px;border-radius:3px">CANT ⇥ BASE ⇥ PRIMA</code></li>
  <li>Las tarjetas se agrupan automáticamente por strike — podés mezclar distintas bases en el mismo pegado</li>
</ol>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Formato</h3>
<div style="font-family:var(--mono);font-size:11px;background:var(--surface2);padding:12px;border-radius:5px;border:1px solid var(--border2);color:var(--muted)">
10	6374,70	306,60<br>5	6374,70	284,82<br>-7	6774,70	155,85
</div>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Resultados por strike</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px">
  <tr style="background:var(--surface2)"><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Campo</th><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Descripción</th></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--green)">Prima promedio</td><td style="padding:6px 10px;color:var(--muted)">Promedio ponderado por lotes, sin comisión.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--amber)">Prima prom. c/Comi</td><td style="padding:6px 10px;color:var(--muted)">Promedio con comisión e IVA incluidos.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Total c/Comi</td><td style="padding:6px 10px;color:var(--muted)">Suma total en $ de ese lado (compras o ventas).</td></tr>
  <tr><td style="padding:6px 10px;color:var(--amber)">Total general</td><td style="padding:6px 10px;color:var(--muted)">Aparece arriba cuando hay más de un strike. Suma el neto de todos.</td></tr>
</table>
`,

bullbear:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">📈 Bull/Bear Spreads</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Explorador de spreads verticales — Bull Call Spread y Bear Put Spread — con métricas de riesgo/retorno para cada combinación posible.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">¿Qué es un Spread Vertical?</h3>
<p style="color:var(--muted)">Comprás una opción y vendés otra del mismo tipo y vencimiento pero distinto strike. El costo máximo y la ganancia máxima están ambos limitados.</p>
<ul style="color:var(--muted);padding-left:18px;margin-top:8px">
  <li><strong>Bull Call Spread</strong> — comprás la call base (ATM/ITM) y vendés una call superior (OTM). Apostás a subida hasta el strike vendido.</li>
  <li><strong>Bear Put Spread</strong> — comprás el put base (mayor strike) y vendés un put inferior. Apostás a bajada.</li>
</ul>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Métricas de cada card</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px">
  <tr style="background:var(--surface2)"><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Métrica</th><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Descripción</th></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--amber)">% Lleno</td><td style="padding:6px 10px;color:var(--muted)">Débito / Dif.strikes. Verde &lt;33%, ámbar &lt;60%, rojo &gt;60%. Menos es mejor.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Costo neto</td><td style="padding:6px 10px;color:var(--muted)">Prima S1 − Prima S2. Lo que pagás por contrato.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Max profit</td><td style="padding:6px 10px;color:var(--muted)">(Dif.strikes − Costo) × 100 × lotes.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Breakeven / BE %</td><td style="padding:6px 10px;color:var(--muted)">Precio al vencimiento donde el resultado es cero y cuánto % tiene que moverse desde el spot.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--amber)">ROI</td><td style="padding:6px 10px;color:var(--muted)">Max profit / Costo × 100. Retorno si vence en el máximo.</td></tr>
  <tr><td style="padding:6px 10px">Delta / Theta / Vega</td><td style="padding:6px 10px;color:var(--muted)">Greeks netos del spread (compra − venta).</td></tr>
</table>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Parámetros</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px">
  <tr style="background:var(--surface2)"><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Parámetro</th><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Descripción</th></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Strike Base</td><td style="padding:6px 10px;color:var(--muted)">Strike que comprás. El módulo muestra todos los spreads posibles contra cada strike del otro lado.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Tipo</td><td style="padding:6px 10px;color:var(--muted)">Call = Bull Call Spread · Put = Bear Put Spread.</td></tr>
  <tr><td style="padding:6px 10px">Lotes</td><td style="padding:6px 10px;color:var(--muted)">Cantidad para calcular costos y ganancias totales. Default 10.</td></tr>
</table>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Crear estrategia</h3>
<p style="color:var(--muted)">Cada card tiene un botón <strong>+ Crear en Control de estrategias</strong> que genera el spread con los lotes configurados, listo para calcular P&L.</p>
`,
ratios:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">📐 Ratios</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Análisis de relaciones entre primas de calls para detectar oportunidades de arbitraje relativo.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">¿Qué es el ratio?</h3>
<p style="color:var(--muted)">El ratio entre dos opciones es simplemente <strong>Prima S1 / Prima S2</strong>. Mide cuánto vale una call en relación a otra. Si históricamente ese ratio oscilaba entre 1.5 y 2.5 y hoy está en 4.0, podría indicar que S1 está cara o S2 está barata en términos relativos.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Mapa de calor</h3>
<p style="color:var(--muted)">Matriz de todas las combinaciones de strikes. Cada celda muestra el ratio <code style="background:var(--bg);padding:1px 5px;border-radius:3px">Prima(fila) / Prima(columna)</code>.</p>
<ul style="color:var(--muted);padding-left:18px;margin:8px 0">
  <li style="margin-bottom:5px"><span style="color:rgba(90,171,255,0.9)">■ Azul</span> — ratio bajo (menor al umbral inferior). Fila barata vs columna.</li>
  <li style="margin-bottom:5px"><span style="color:rgba(68,199,106,0.9)">■ Verde</span> — zona media-baja.</li>
  <li style="margin-bottom:5px"><span style="color:rgba(232,184,75,0.9)">■ Ámbar</span> — zona media-alta.</li>
  <li style="margin-bottom:5px"><span style="color:rgba(240,90,90,0.9)">■ Rojo</span> — ratio alto (mayor al umbral superior). Fila cara vs columna.</li>
</ul>
<p style="color:var(--muted)">La diagonal (negro) es el strike dividido por sí mismo = 1. La mitad inferior y superior son simétricas inversas.</p>
<p style="color:var(--muted)"><strong>Toggle Call/Put</strong>: cambia entre primas de calls o puts para el mapa.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Tres señales de oportunidad</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px">
  <tr style="background:var(--surface2)"><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Señal</th><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Qué detecta</th></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px"><span style="background:var(--red);color:#fff;padding:1px 6px;border-radius:3px;font-size:9px;font-weight:700">RC</span></td><td style="padding:6px 10px;color:var(--muted)">Ratio fuera del rango [umbral bajo, umbral alto]. El par está inusualmente barato o caro entre sí.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px"><span style="background:var(--green);color:#000;padding:1px 6px;border-radius:3px;font-size:9px;font-weight:700">ΔIV</span></td><td style="padding:6px 10px;color:var(--muted)">Diferencia de IV implícita entre los dos strikes mayor al umbral (%). Una diferencia grande puede indicar que el mercado está valuando distinto el riesgo en esas bases.</td></tr>
  <tr><td style="padding:6px 10px"><span style="background:var(--amber);color:#000;padding:1px 6px;border-radius:3px;font-size:9px;font-weight:700">PC</span></td><td style="padding:6px 10px;color:var(--muted)">Violación de paridad put-call: <code style="background:var(--bg);padding:1px 4px;border-radius:3px">|C - P - (S·e^-qT - K·e^-rT)|</code> mayor al umbral en $.</td></tr>
</table>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Click para crear estrategia</h3>
<p style="color:var(--muted)">Al hacer click en cualquier celda del mapa de calor, se crea automáticamente una estrategia en el módulo <strong>Control de estrategias</strong> con la relación de lotes correcta:</p>
<div style="font-family:var(--mono);font-size:11px;background:var(--surface2);padding:12px;border-radius:5px;border:1px solid var(--border2);color:var(--muted)">
+100 lotes Strike fila (S1)<br>
-round(ratio × 100) lotes Strike columna (S2)
</div>
<p style="color:var(--muted);margin-top:8px">El nombre de la estrategia sigue el patrón <strong>RC C65/C75</strong> (ratio ≥ 1) o <strong>RI C65/C75</strong> (ratio &lt; 1, "Ratio Invertido"), donde los números son los primeros 2 dígitos del strike (3 si el strike ≥ 10.000).</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Parámetros</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px">
  <tr style="background:var(--surface2)"><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Parámetro</th><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Descripción</th></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Umbral ratio bajo/alto</td><td style="padding:6px 10px;color:var(--muted)">Rango "normal" del ratio. Valores fuera disparan señal RC. Default 1,5 – 2,5.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Umbral Δ IV</td><td style="padding:6px 10px;color:var(--muted)">Diferencia mínima de IV (en %) para disparar señal ΔIV. Default 5%.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Umbral paridad</td><td style="padding:6px 10px;color:var(--muted)">Violación mínima de paridad put-call en $ para disparar señal PC. Default $10.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Heatmap Call/Put</td><td style="padding:6px 10px;color:var(--muted)">Cambia el mapa entre primas de calls (verde) o puts (rojo).</td></tr>
  <tr><td style="padding:6px 10px">Solo oportunidades</td><td style="padding:6px 10px;color:var(--muted)">Filtra la tabla mostrando solo pares con al menos una señal activa.</td></tr>
</table>
`
};

function tutShow(page){
  // Update content
  const content=document.getElementById('tut-content');
  if(content)content.innerHTML=TUT_PAGES[page]||'<p style="color:var(--muted)">Contenido no disponible.</p>';

  // Update sidebar active state
  document.querySelectorAll('.tut-item').forEach(el=>{
    const isActive=el.id==='tut-nav-'+page;
    el.style.color=isActive?'var(--amber)':'var(--muted)';
    el.style.borderLeftColor=isActive?'var(--amber)':'transparent';
    el.style.background=isActive?'rgba(232,184,75,0.07)':'transparent';
  });
}

