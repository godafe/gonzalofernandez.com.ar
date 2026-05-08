/* ===== MODULO TUTORIALES ===== */
const TUT_PAGES={
cadena:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">Cadena de opciones</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Vista principal de mercado. Muestra calls y puts por strike para el vencimiento activo, con Greeks, bid/ask, last e IV.</p>
<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Puntos clave</h3>
<ul style="color:var(--muted);padding-left:18px;margin:0">
  <li style="margin-bottom:6px">Calls a la izquierda, puts a la derecha y strike en el centro.</li>
  <li style="margin-bottom:6px">Las filas resaltan ITM y ATM para ubicar rápidamente el contexto del spot.</li>
  <li style="margin-bottom:6px">El click sobre una opción abre el detalle con Greeks completos y precio teórico BS.</li>
  <li>La barra de parámetros BS permite recalcular sensibilidad e IV sin volver a pedir datos.</li>
</ul>
`,

strategy:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">Constructor de estrategias</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Tab técnica hoy oculta por defecto. Sirve para armar estrategias combinando patas y evaluar payoff / P&amp;L con parámetros manuales.</p>
<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Uso esperado</h3>
<ul style="color:var(--muted);padding-left:18px;margin:0">
  <li style="margin-bottom:6px">Definir una estructura base para luego enviarla a Control o al Simulador.</li>
  <li style="margin-bottom:6px">Comparar escenarios de vencimiento y curvas de resultado.</li>
  <li>Probar presets de spreads sin tocar posiciones reales guardadas.</li>
</ul>
`,

control:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">Control de estrategias</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Seguimiento de posiciones abiertas con costo de armado, valor de desarme y P&amp;L usando la cadena activa.</p>
<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Qué hace</h3>
<ul style="color:var(--muted);padding-left:18px;margin:0">
  <li style="margin-bottom:6px">Guarda patas en el navegador y las restaura automáticamente.</li>
  <li style="margin-bottom:6px">Permite usar precio manual por pata para stress o mercado ilíquido.</li>
  <li style="margin-bottom:6px">Acepta pegado TSV desde Excel, Mariposa y otros módulos.</li>
  <li>Calcula costos con comisión e IVA aplicando signo según compra o venta.</li>
</ul>
`,

calc:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">Calculadora BS</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Tab técnica hoy oculta. Calcula primas teóricas y Greeks con Black-Scholes a partir de inputs manuales.</p>
<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Cuándo usarla</h3>
<ul style="color:var(--muted);padding-left:18px;margin:0">
  <li style="margin-bottom:6px">Validar precios teóricos fuera de la cadena.</li>
  <li style="margin-bottom:6px">Sensibilizar spot, tasa, dividendos o tiempo al vencimiento.</li>
  <li>Comparar mercado vs teoría en instrumentos puntuales.</li>
</ul>
`,

ivcalc:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">Calc. volatilidad implicita</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Tab técnica hoy oculta. Resuelve la IV implícita a partir de una prima observada y muestra cómo cambia si varía el precio.</p>
<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Para qué sirve</h3>
<ul style="color:var(--muted);padding-left:18px;margin:0">
  <li style="margin-bottom:6px">Inferir la volatilidad que está descontando el mercado.</li>
  <li style="margin-bottom:6px">Ver sensibilidad de IV frente a cambios pequeños de prima.</li>
  <li>Chequear consistencia entre diferentes bases o vencimientos.</li>
</ul>
`,

bullbear:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">Bull/Bear</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Explorador de spreads verticales. Hoy conviven distintos modos de vista dentro del mismo módulo.</p>
<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Qué podés hacer</h3>
<ul style="color:var(--muted);padding-left:18px;margin:0">
  <li style="margin-bottom:6px">Evaluar Bull Call Spreads y Bear Put Spreads sobre el vencimiento activo.</li>
  <li style="margin-bottom:6px">Comparar costo, % lleno, ROI, breakeven y Greeks netos.</li>
  <li>Crear la estrategia directamente en Control con un click.</li>
</ul>
`,

ratios:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">Ratios</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Mapa de calor y tablero de señales para relaciones entre primas, diferencias de IV y paridad put-call.</p>
<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Lectura rápida</h3>
<ul style="color:var(--muted);padding-left:18px;margin:0">
  <li style="margin-bottom:6px">RC: detecta ratios fuera de su rango normal.</li>
  <li style="margin-bottom:6px">ΔIV: marca desalineaciones relevantes de volatilidad implícita.</li>
  <li style="margin-bottom:6px">PC: marca violaciones de paridad put-call.</li>
  <li>Al hacer click en una celda se arma una estrategia relativa en Control.</li>
</ul>
`,

mariposa:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">Mariposa</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Generador de estructuras mariposa desde la cadena viva, con costos bruto/neto y copia lista para usar.</p>
<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Incluye</h3>
<ul style="color:var(--muted);padding-left:18px;margin:0">
  <li style="margin-bottom:6px">Mariposa estándar 1x2x1.</li>
  <li style="margin-bottom:6px">Variante simétrica ajustada por distancia monetaria entre alas.</li>
  <li>Botones para copiar en formato TSV y pegar directo en Control.</li>
</ul>
`,

sinteticas:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">Sinteticas</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Módulo para comparar relaciones sintéticas entre calls, puts y subyacente, buscando desvíos o coberturas equivalentes.</p>
<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Qué mirar</h3>
<ul style="color:var(--muted);padding-left:18px;margin:0">
  <li style="margin-bottom:6px">Equivalencias tipo call - put + strike descontado.</li>
  <li style="margin-bottom:6px">Desvíos relativos frente al spot y al carry implícito.</li>
  <li>Señales visuales para detectar arbitrajes o desalineaciones de pricing.</li>
</ul>
`,

promedio:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">Precio Promedio</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Calculadora de prima promedio ponderada por base, con impacto de comisiones e IVA.</p>
<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Formato de entrada</h3>
<p style="color:var(--muted)">Pega filas del estilo <code style="background:var(--bg);padding:2px 6px;border-radius:3px">CANT ⇥ BASE ⇥ PRIMA</code>. El módulo agrupa por strike y separa compras/ventas automáticamente.</p>
<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Resultados</h3>
<ul style="color:var(--muted);padding-left:18px;margin:0">
  <li style="margin-bottom:6px">Prima promedio simple.</li>
  <li style="margin-bottom:6px">Prima promedio con costos.</li>
  <li>Total general consolidado si cargás más de una base.</li>
</ul>
`,

ivsmile:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">Smile de volatilidad</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Curva de IV por strike y vencimiento para leer skew, zonas ATM y extremos OTM.</p>
<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Interpretación típica</h3>
<ul style="color:var(--muted);padding-left:18px;margin:0">
  <li style="margin-bottom:6px">Skew negativo: puts OTM más caras en IV.</li>
  <li style="margin-bottom:6px">Curva plana: poco sesgo direccional.</li>
  <li>Picos o quiebres: zonas donde el mercado está pagando más protección o convexidad.</li>
</ul>
`,

historicos:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">Historicos</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Nuevo módulo unificado de la hoja <strong>HMD</strong>. Agrupa en un solo lugar los modos <strong>Costos</strong>, <strong>Analisis</strong> y <strong>Probabilidades</strong>.</p>
<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Flujo de datos</h3>
<ul style="color:var(--muted);padding-left:18px;margin:0">
  <li style="margin-bottom:6px">Al abrir la página intenta restaurar HMD desde <strong>IndexedDB</strong>.</li>
  <li style="margin-bottom:6px">Si no hay cache local, descarga la hoja HMD una vez y la guarda.</li>
  <li style="margin-bottom:6px">El botón <strong>Actualizar HMD</strong> fuerza una descarga nueva y reemplaza el cache.</li>
  <li>Los tres modos consumen exactamente la misma base histórica local.</li>
</ul>
<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Modos</h3>
<table style="width:100%;border-collapse:collapse;font-size:12px">
  <tr style="background:var(--surface2)"><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Modo</th><th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);color:var(--muted)">Qué muestra</th></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Costos</td><td style="padding:6px 10px;color:var(--muted)">Series históricas de primas, IV, RC, straddle, Bull/Bear y costo RI entre dos strikes.</td></tr>
  <tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px 10px">Analisis</td><td style="padding:6px 10px;color:var(--muted)">Greeks históricos de dos strikes y métricas derivadas como ratio de vega, RC y costo relativo.</td></tr>
  <tr><td style="padding:6px 10px">Probabilidades</td><td style="padding:6px 10px;color:var(--muted)">Tablero estadístico con percentiles, ECDF y señales probabilísticas sobre la misma serie HMD.</td></tr>
</table>
`,

analisis:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">Analisis</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Tab técnica hoy oculta. Se usa para análisis puntual de estructuras y comparaciones fuera del flujo principal.</p>
<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Rol dentro del sitio</h3>
<p style="color:var(--muted)">Funciona como área auxiliar de cálculo. No reemplaza a <strong>Historicos</strong>, sino que complementa análisis más específicos o experimentales.</p>
`,

intradiario:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">Intradiario</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Módulo para cotizaciones intradiarias en vivo con cache local en <strong>IndexedDB</strong>, filtros por tiempo y doble vista tabla / gráficos.</p>
<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Flujo</h3>
<ul style="color:var(--muted);padding-left:18px;margin:0">
  <li style="margin-bottom:6px">No carga automáticamente al iniciar el sitio.</li>
  <li style="margin-bottom:6px">Al abrir la tab intenta restaurar la última descarga desde IndexedDB.</li>
  <li style="margin-bottom:6px">El botón <strong>Actualizar intradiario</strong> fuerza una nueva descarga y reemplaza el cache.</li>
  <li>Incluye loader propio con barra de progreso y tiempo transcurrido.</li>
</ul>
<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Filtros actuales</h3>
<ul style="color:var(--muted);padding-left:18px;margin:0">
  <li style="margin-bottom:6px"><strong>TF</strong>: 1m, 5m, 10m o 30m. Default 5m.</li>
  <li style="margin-bottom:6px"><strong>Hora</strong>: permite ver un minuto puntual o <strong>Todos</strong>.</li>
  <li style="margin-bottom:6px"><strong>Tipo</strong>: Calls, Puts, Futuros, Subyacente o Caucion.</li>
  <li><strong>Subtipo dinámico</strong>: usa Strike para opciones y Ticker para futuros / subyacente / caución.</li>
</ul>
<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Vista Graficos</h3>
<p style="color:var(--muted)">Hoy la primera tarjeta grafica <strong>Last vs Hora</strong> para el tipo + subtipo seleccionados. Los otros espacios quedaron listos como placeholders para gráficos futuros.</p>
`,

simulador:`
<h2 style="margin:0 0 6px;font-size:18px;color:var(--text)">Simulador</h2>
<p style="color:var(--muted);font-size:12px;margin:0 0 20px">Módulo de escenarios para proyectar P&amp;L y exposición de una estrategia a través de spot, días y tasa.</p>
<h3 style="font-size:13px;color:var(--amber);margin:20px 0 8px;text-transform:uppercase;letter-spacing:.5px">Qué incluye</h3>
<ul style="color:var(--muted);padding-left:18px;margin:0">
  <li style="margin-bottom:6px">Parámetros deslizables de spot simulado, DTE y tasa.</li>
  <li style="margin-bottom:6px">Recalibración de IV para reestimar escenarios.</li>
  <li style="margin-bottom:6px">Tabla de P&amp;L simulado y métricas consolidadas.</li>
  <li>Estructura pensada para importar estrategias y stress-testearlas sin tocar Control.</li>
</ul>
`
};

function tutShow(page){
  const content=document.getElementById('tut-content');
  if(content)content.innerHTML=TUT_PAGES[page]||'<p style="color:var(--muted)">Contenido no disponible.</p>';

  document.querySelectorAll('.tut-item').forEach(el=>{
    const isActive=el.id==='tut-nav-'+page;
    el.style.color=isActive?'var(--amber)':'var(--muted)';
    el.style.borderLeftColor=isActive?'var(--amber)':'transparent';
    el.style.background=isActive?'rgba(232,184,75,0.07)':'transparent';
  });
}
