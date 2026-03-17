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
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Calculadora de precio promedio ponderado de compras y ventas con comisiones e IVA.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">¿Para qué sirve?</h3>
<p style="color:var(--muted)">Cuando tenés varias compras y/o ventas del mismo instrumento a distintas primas, este módulo calcula el precio promedio real que pagaste o cobraste, ya con el impacto de comisiones e IVA incluido. Útil para saber exactamente cuál es tu costo base en una posición armada en múltiples tramos.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Cómo usarlo</h3>
<ol style="color:var(--muted);padding-left:18px;line-height:2">
  <li>Configurá Comisión % e IVA en la barra de parámetros (default 0.5% y 1.21)</li>
  <li>Copiá las filas desde Excel u otra fuente con el formato <code style="background:var(--bg);padding:2px 6px;border-radius:3px">CANT ⇥ BASE ⇥ PRIMA</code></li>
  <li>Pegalas en el área de texto — los resultados se calculan en tiempo real</li>
</ol>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Formato de entrada</h3>
<p style="color:var(--muted)">Tres columnas separadas por tab:</p>
<div style="font-family:var(--mono);font-size:11px;background:var(--surface2);padding:12px;border-radius:5px;border:1px solid var(--border2);color:var(--muted)">
10	7326,20	400,001<br>
-15	7926,20	198,999<br>
10	7326,20	510,000
</div>
<ul style="color:var(--muted);padding-left:18px;margin-top:10px">
  <li><strong>CANT</strong>: lotes. Positivo = compra, negativo = venta.</li>
  <li><strong>BASE</strong>: strike del contrato (informativo, no afecta el cálculo).</li>
  <li><strong>PRIMA</strong>: precio unitario de la opción.</li>
</ul>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Fórmulas</h3>
<div style="font-family:var(--mono);font-size:11px;background:var(--surface2);padding:12px;border-radius:5px;border:1px solid var(--border2);color:var(--muted)">
comFactor = (com% + 0.2%) × IVA<br><br>
Prima c/Comi (compra) = prima × (1 + comFactor)<br>
Prima c/Comi (venta)  = prima × (1 − comFactor)<br><br>
Costo total = cant × prima c/Comi × 100<br><br>
Promedio ponderado = Σ(|cant_i| × prima_i) / Σ|cant_i|
</div>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Resultados</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px">
  <tr style="background:var(--surface2)"><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Campo</th><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Descripción</th></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--green)">Prima promedio</td><td style="padding:6px 10px;color:var(--muted)">Promedio ponderado por lotes de la prima pura (sin comisión).</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--amber)">Prima prom. c/Comi</td><td style="padding:6px 10px;color:var(--muted)">Promedio ponderado ya con comisión e IVA incluidos. Es el costo real por contrato.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Costo total c/Comi</td><td style="padding:6px 10px;color:var(--muted)">Suma total en $ de todos los desembolsos o ingresos de ese lado.</td></tr>
  <tr><td style="padding:6px 10px;color:var(--amber)">Resultado neto</td><td style="padding:6px 10px;color:var(--muted)">Balance total de compras + ventas. Positivo = ganancia o crédito neto.</td></tr>
</table>
`,

config:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">⚙️ Configuración</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Cómo conectar el dashboard a tu Google Sheet.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Google Apps Script</h3>
<ol style="color:var(--muted);padding-left:18px;line-height:2">
  <li>Abrí tu Google Sheet y andá a <strong>Extensiones → Apps Script</strong></li>
  <li>Pegá el contenido del archivo <code style="background:var(--bg);padding:2px 6px;border-radius:3px">ggal_appscript.js</code></li>
  <li>Implementar → Nueva implementación → Tipo: <strong>Aplicación web</strong></li>
  <li>Ejecutar como: <strong>Yo</strong> · Acceso: <strong>Cualquier persona</strong></li>
  <li>Copiá la URL generada y pegala en el campo URL del panel de Configuración (ícono ⚙ arriba)</li>
</ol>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Hojas disponibles</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px">
  <tr style="background:var(--surface2)"><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Hoja</th><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Uso</th></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--amber)">DMD_Bot</td><td style="padding:6px 10px;color:var(--muted)">Datos de cotizaciones actualizados automáticamente por un bot.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--amber)">DMD_Sabro</td><td style="padding:6px 10px;color:var(--muted)">Hoja original de cotizaciones con datos ampliados (Last VE, etc.).</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px;color:var(--amber)">DMD_Mock</td><td style="padding:6px 10px;color:var(--muted)">Datos de prueba para testear sin afectar las hojas reales.</td></tr>
  <tr><td style="padding:6px 10px;color:var(--amber)">HMD</td><td style="padding:6px 10px;color:var(--muted)">Datos históricos diarios. Formato tall: una fila por instrumento por fecha.</td></tr>
</table>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Auto-actualización</h3>
<p style="color:var(--muted)">El panel de configuración tiene una opción para activar auto-refresh. Las opciones van de 1 a 10 segundos. Cuando está activo, el dashboard recarga los datos de la cadena de opciones automáticamente y actualiza todos los módulos.</p>
`,

formulas:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">🔢 Fórmulas y cálculos</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Referencia de los cálculos matemáticos usados en el dashboard.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Black-Scholes</h3>
<p style="color:var(--muted)">Todos los precios teóricos y griegos se calculan con el modelo Black-Scholes con dividendos continuos (modelo de Merton):</p>
<div style="font-family:var(--mono);font-size:11px;background:var(--surface2);padding:12px;border-radius:5px;border:1px solid var(--border2);color:var(--muted)">
d1 = (ln(S/K) + (r - q + σ²/2) × T) / (σ × √T)<br>
d2 = d1 − σ × √T<br>
Call = S × e⁻ᵍᵀ × N(d1) − K × e⁻ʳᵀ × N(d2)<br>
Put  = K × e⁻ʳᵀ × N(-d2) − S × e⁻ᵍᵀ × N(-d1)
</div>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Volatilidad implícita</h3>
<p style="color:var(--muted)">Se calcula por el método de Newton-Raphson: dado el precio de mercado, se busca iterativamente la volatilidad σ que hace que Black-Scholes devuelva ese precio. Converge en general en 5-15 iteraciones.</p>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Griegos</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px">
  <tr style="background:var(--surface2)"><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Griego</th><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Definición</th></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Delta (Δ)</td><td style="padding:6px 10px;color:var(--muted)">∂V/∂S — sensibilidad al precio del subyacente</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Gamma (Γ)</td><td style="padding:6px 10px;color:var(--muted)">∂²V/∂S² — tasa de cambio del delta</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Theta (Θ)</td><td style="padding:6px 10px;color:var(--muted)">∂V/∂t — decaimiento por tiempo (por día)</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Vega (ν)</td><td style="padding:6px 10px;color:var(--muted)">∂V/∂σ — sensibilidad a la volatilidad</td></tr>
  <tr><td style="padding:6px 10px">Rho (ρ)</td><td style="padding:6px 10px;color:var(--muted)">∂V/∂r — sensibilidad a la tasa de interés</td></tr>
</table>

<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Valor extrínseco (Last VE)</h3>
<div style="font-family:var(--mono);font-size:11px;background:var(--surface2);padding:12px;border-radius:5px;border:1px solid var(--border2);color:var(--muted)">
VE = (Last − MAX(Spot − Strike, 0)) / Spot  [para calls]<br>
VE = (Last − MAX(Strike − Spot, 0)) / Spot  [para puts]
</div>
<p style="color:var(--muted);margin-top:8px">Expresa cuánto de la prima es "puro tiempo y volatilidad", como porcentaje del spot.</p>
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

