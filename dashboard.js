const STATIONS = {
  hv: {
    key: 'hv', node: 1436900584, name: 'Hidden Valley', fullName: 'Hidden Valley Repeater', short: 'HVRP',
    color: '#55d9b7', coords: [38.53880, -109.54090], elevationFt: 5800, battery: true,
  },
  home: {
    key: 'home', node: 2740603892, name: 'Heltec Home', fullName: 'Heltec Home', short: 'Home',
    color: '#ff9a67', coords: [38.54898, -109.52236], elevationFt: 4080, battery: false,
  },
};
const EXPECTED_INTERVAL_HOURS = 1;
const STALE_AFTER_HOURS = 3.25;
const state = { hours: 24, readings: [], map: null, baseLayer: null, mapKind: 'topo', expandedMap: null, lastChart: null };
const $ = id => document.getElementById(id);

const num = v => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const metric = (r, ...keys) => {
  for (const k of keys) if (r?.metrics?.[k] !== undefined && r?.metrics?.[k] !== null) return r.metrics[k];
  return null;
};
const tempC = r => num(r?.temperature_c) ?? num(metric(r, 'temperature_c', 'temperature'));
const tempF = r => { const c = tempC(r); return c === null ? null : c * 9 / 5 + 32; };
const batteryV = r => num(metric(r, 'voltage', 'battery_voltage', 'battery_voltage_v'));
const batteryPct = r => num(metric(r, 'battery_level', 'battery_percent', 'battery_pct'));
const batteryTime = r => metric(r, 'device_observed_at') || r?.observed_at;
const rssi = r => num(r?.radio?.rssi);
const snr = r => num(r?.radio?.snr);
const hops = r => num(r?.radio?.hops_away);
const mean = xs => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
const ageMs = iso => Math.max(0, Date.now() - new Date(iso).getTime());
const ageHours = iso => ageMs(iso) / 3600000;
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function ageText(iso){
  if(!iso) return '—';
  const s=ageMs(iso)/1000;
  if(s<60) return `${Math.round(s)} sec ago`;
  if(s<3600) return `${Math.round(s/60)} min ago`;
  if(s<86400) return `${(s/3600).toFixed(1)} hr ago`;
  return `${(s/86400).toFixed(1)} d ago`;
}
function fmtTime(iso){return new Date(iso).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
function fmtAxis(ms,span){const d=new Date(ms);return span>3*86400000?d.toLocaleDateString([],{month:'short',day:'numeric'}):d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});}
function stationRows(key){const s=STATIONS[key];return state.readings.filter(r=>num(r?.node_num)===s.node);}
function tempRows(key){return stationRows(key).filter(r=>tempF(r)!==null && r.telemetry_type==='environment').sort((a,b)=>new Date(b.observed_at)-new Date(a.observed_at));}
function hvDeviceRows(){return stationRows('hv').filter(r=>batteryV(r)!==null||batteryPct(r)!==null).sort((a,b)=>new Date(batteryTime(b))-new Date(batteryTime(a)));}
function latestTemp(key){return tempRows(key)[0]||null;}

function statsFor(key){
  const rows=tempRows(key); const now=Date.now();
  const last24=rows.filter(r=>now-new Date(r.observed_at).getTime()<=86400000);
  const vals=last24.map(tempF).filter(Number.isFinite);
  const sorted=[...rows].sort((a,b)=>new Date(a.observed_at)-new Date(b.observed_at));
  let longest=null;
  if(sorted.length>1){longest=0;for(let i=1;i<sorted.length;i++)longest=Math.max(longest,(new Date(sorted[i].observed_at)-new Date(sorted[i-1].observed_at))/3600000);}
  let reliability=null,expected=0;
  if(sorted.length){
    const first=new Date(sorted[0].observed_at).getTime(),last=new Date(sorted.at(-1).observed_at).getTime();
    expected=Math.max(1,Math.floor(((last-first)/3600000)/EXPECTED_INTERVAL_HOURS+.25)+1);
    reliability=Math.min(100,sorted.length/expected*100);
  }
  const cutoff=now-12*3600000; const recent=sorted.filter(r=>new Date(r.observed_at).getTime()>=cutoff);
  let trend=null;
  if(recent.length>=2){const a=recent[0],b=recent.at(-1),dt=(new Date(b.observed_at)-new Date(a.observed_at))/3600000;if(dt>0)trend={delta:tempF(b)-tempF(a),perHour:(tempF(b)-tempF(a))/dt,hours:dt};}
  return {rows,last24,high:vals.length?Math.max(...vals):null,low:vals.length?Math.min(...vals):null,avg:mean(vals),longest,reliability,expected,actual:sorted.length,trend};
}
function setText(id,val){const el=$(id);if(el)el.textContent=val;}
function setStationState(key,latest){
  const el=$(key==='hv'?'hvState':'homeState'); if(!el)return;
  if(!latest){el.className='station-state offline';el.textContent='No temperature yet';return;}
  const online=ageHours(latest.observed_at)<=STALE_AFTER_HOURS;
  el.className=`station-state ${online?'online':'stale'}`;
  el.textContent=online?'Reporting normally':`Stale · ${ageText(latest.observed_at)}`;
}
function fillStats(key,prefix){
  const s=statsFor(key);
  setText(`${prefix}High`,s.high===null?'—':`${s.high.toFixed(1)}°`);
  setText(`${prefix}Low`,s.low===null?'—':`${s.low.toFixed(1)}°`);
  setText(`${prefix}Avg`,s.avg===null?'—':`${s.avg.toFixed(1)}°`);
  if(s.trend){setText(`${prefix}Trend`,`${s.trend.delta>=0?'+':''}${s.trend.delta.toFixed(1)}°`);setText(`${prefix}TrendDetail`,`${s.trend.perHour>=0?'+':''}${s.trend.perHour.toFixed(2)}°/hr`);} else {setText(`${prefix}Trend`,'—');setText(`${prefix}TrendDetail`,'need 2 readings in 12h');}
  setText(`${prefix}Reliability`,s.reliability===null?'—':`${s.reliability.toFixed(0)}%`);
  setText(`${prefix}ReliabilityDetail`,s.actual?`${s.actual}/${s.expected} expected in selected window`:'no readings');
  setText(`${prefix}Gap`,s.longest===null?'—':`${s.longest.toFixed(1)} hr`);
}

function renderSummary(){
  const hv=latestTemp('hv'),home=latestTemp('home');
  setText('hvTemp',hv?tempF(hv).toFixed(1):'—'); setText('homeTemp',home?tempF(home).toFixed(1):'—');
  setText('hvUpdated',hv?`Updated ${ageText(hv.observed_at)}`:'Waiting for temperature');
  setText('homeUpdated',home?`Updated ${ageText(home.observed_at)}`:'Waiting for temperature');
  setStationState('hv',hv); setStationState('home',home);

  const dr=hvDeviceRows(),latestD=dr[0]||null;
  if(latestD){const p=batteryPct(latestD),v=batteryV(latestD);setText('hvHeroBattery',p!==null?`Battery ${Math.round(p)}%`:v!==null?`${v.toFixed(3)} V`:'Battery —');}
  else setText('hvHeroBattery','Battery —');

  if(hv&&home){const a=tempF(hv),b=tempF(home),spread=Math.abs(a-b),warmer=a>=b?STATIONS.hv:STATIONS.home;setText('tempSpread',`${spread.toFixed(1)}°F`);setText('tempSpreadDetail',`${warmer.name} is ${(spread).toFixed(1)}° warmer`);setText('warmestStation',warmer.name);setText('warmestDetail',`${Math.max(a,b).toFixed(1)}°F now`);}
  else {setText('tempSpread','—');setText('tempSpreadDetail','need both current readings');const only=hv?STATIONS.hv:home?STATIONS.home:null;setText('warmestStation',only?only.name:'—');setText('warmestDetail',only?'only station currently reporting':'latest readings');}
  const latests=[['hv',hv],['home',home]].filter(x=>x[1]).sort((a,b)=>new Date(b[1].observed_at)-new Date(a[1].observed_at));
  if(latests.length){setText('freshestStation',STATIONS[latests[0][0]].name);setText('freshestDetail',ageText(latests[0][1].observed_at));}else{setText('freshestStation','—');setText('freshestDetail','no telemetry');}
  const healthy=[hv,home].filter(r=>r&&ageHours(r.observed_at)<=STALE_AFTER_HOURS).length;setText('stationsReporting',`${healthy} / 2`);
  const n=$('networkStatus');if(n){n.className=`live-pill ${healthy===2?'online':healthy===1?'partial':'offline'}`;setText('networkStatusText',healthy===2?'Both stations reporting':healthy===1?'1 of 2 stations reporting':'No current station telemetry');}
  fillStats('hv','hv'); fillStats('home','home'); renderBattery(); renderRf();
}

function svgEl(tag,attrs={}){const el=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));return el;}
function addText(svg,x,y,text,anchor='start',fill='#78949b',size=11){const t=svgEl('text',{x,y,'text-anchor':anchor,fill,'font-size':size,'font-family':'Inter,system-ui,sans-serif'});t.textContent=text;svg.appendChild(t);return t;}
function chartDimensions(container){const w=Math.max(520,container.clientWidth||900),h=Math.max(240,container.clientHeight||300);return {w,h,left:54,right:22,top:18,bottom:38,plotW:w-76,plotH:h-56};}
function renderLineChart(container,series,opts={}){
  container.innerHTML=''; const all=series.flatMap(s=>s.points).filter(p=>Number.isFinite(p.y)&&Number.isFinite(p.x));
  if(!all.length){container.innerHTML=`<div class="empty">${esc(opts.empty||'No data in this window.')}</div>`;return;}
  const d=chartDimensions(container); const xs=all.map(p=>p.x),ys=all.map(p=>p.y);let xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);if(xmax===xmin)xmax=xmin+3600000;const pad=(ymax-ymin||2)*.14;ymin-=pad;ymax+=pad;
  if(Number.isFinite(opts.yMin))ymin=opts.yMin;if(Number.isFinite(opts.yMax))ymax=opts.yMax;
  const x=v=>d.left+(v-xmin)/(xmax-xmin)*d.plotW,y=v=>d.top+(ymax-v)/(ymax-ymin)*d.plotH;
  const svg=svgEl('svg',{viewBox:`0 0 ${d.w} ${d.h}`,preserveAspectRatio:'none'});container.appendChild(svg);
  for(let i=0;i<=4;i++){const yy=d.top+d.plotH*i/4;svg.appendChild(svgEl('line',{x1:d.left,x2:d.left+d.plotW,y1:yy,y2:yy,stroke:'#17343d','stroke-width':1}));const val=ymax-(ymax-ymin)*i/4;addText(svg,d.left-8,yy+4,opts.yFormat?opts.yFormat(val):val.toFixed(1),'end');}
  const span=xmax-xmin;for(let i=0;i<=4;i++){const xx=d.left+d.plotW*i/4;svg.appendChild(svgEl('line',{x1:xx,x2:xx,y1:d.top,y2:d.top+d.plotH,stroke:'#102b33','stroke-width':1}));addText(svg,xx,d.h-12,fmtAxis(xmin+span*i/4,span),'middle');}
  series.forEach(s=>{
    const pts=[...s.points].filter(p=>Number.isFinite(p.y)).sort((a,b)=>a.x-b.x);if(!pts.length)return;
    const poly=pts.map(p=>`${x(p.x)},${y(p.y)}`).join(' ');svg.appendChild(svgEl('polyline',{points:poly,fill:'none',stroke:s.color,'stroke-width':opts.strokeWidth||3,'stroke-linecap':'round','stroke-linejoin':'round'}));
    pts.forEach(p=>{const c=svgEl('circle',{cx:x(p.x),cy:y(p.y),r:opts.pointRadius||3.1,fill:s.color,stroke:'#08171d','stroke-width':1.4});c.style.cursor='crosshair';c.addEventListener('mouseenter',ev=>showTooltip(container,ev,`${s.name}<br><strong>${opts.tooltipValue?opts.tooltipValue(p.y):p.y.toFixed(1)}</strong><br>${fmtTime(p.iso||new Date(p.x).toISOString())}`));c.addEventListener('mouseleave',()=>hideTooltip(container));svg.appendChild(c);});
  });
  if(opts.axisLabel)addText(svg,8,14,opts.axisLabel,'start','#90aab0',11);
}
function showTooltip(container,event,html){hideTooltip(container);const tip=document.createElement('div');tip.className='chart-tooltip';tip.innerHTML=html;const r=container.getBoundingClientRect();tip.style.left=`${event.clientX-r.left}px`;tip.style.top=`${event.clientY-r.top}px`;container.appendChild(tip);}
function hideTooltip(container){container.querySelector('.chart-tooltip')?.remove();}

function renderTemperatureChart(target=$('tempChart')){
  const hv=tempRows('hv').map(r=>({x:new Date(r.observed_at).getTime(),y:tempF(r),iso:r.observed_at}));
  const home=tempRows('home').map(r=>({x:new Date(r.observed_at).getTime(),y:tempF(r),iso:r.observed_at}));
  renderLineChart(target,[{name:'Hidden Valley',color:STATIONS.hv.color,points:hv},{name:'Heltec Home',color:STATIONS.home.color,points:home}],{axisLabel:'Temperature °F',tooltipValue:v=>`${v.toFixed(1)} °F`,strokeWidth:3.3,pointRadius:3.5,empty:'Waiting for temperature telemetry.'});
  setText('tempChartCount',`${hv.length} Hidden Valley · ${home.length} Heltec Home readings`);
}
function renderBattery(target=$('batteryChart')){
  const dr=hvDeviceRows(),latest=dr[0]||null;
  if(latest){const p=batteryPct(latest),v=batteryV(latest);setText('batteryNow',p!==null?`${Math.round(p)}%`:v!==null?`${v.toFixed(3)} V`:'—');setText('batteryNowDetail',[v!==null?`${v.toFixed(3)} V`:null,ageText(batteryTime(latest))].filter(Boolean).join(' · '));}else{setText('batteryNow','—');setText('batteryNowDetail','battery telemetry pending');}
  const vals=dr.filter(r=>batteryV(r)!==null).sort((a,b)=>new Date(batteryTime(a))-new Date(batteryTime(b)));
  if(vals.length>=2){const a=batteryV(vals[0]),b=batteryV(vals.at(-1)),change=b-a;setText('batteryChange',`${change>=0?'+':''}${change.toFixed(3)} V`);setText('batteryChangeDetail',`${a.toFixed(3)} → ${b.toFixed(3)} V`);}else{setText('batteryChange','—');setText('batteryChangeDetail','need 2 voltage samples');}
  let solar=0,rises=0;for(let i=1;i<vals.length;i++){const dt=(new Date(batteryTime(vals[i]))-new Date(batteryTime(vals[i-1])))/3600000,dv=batteryV(vals[i])-batteryV(vals[i-1]);if(dt>0&&dt<=3&&dv>=.002){solar+=dt;rises++;}}
  if(vals.length<2){setText('solarHours','—');setText('solarDetail','need at least 2 readings');}else{setText('solarHours',`${solar.toFixed(1)} hr`);setText('solarDetail',rises?`${rises} rising-voltage interval${rises===1?'':'s'}`:'no clear voltage rise yet');}
  setText('batteryChartCount',vals.length?`${vals.length} voltage samples · Hidden Valley only`:'Battery telemetry pending');
  const points=vals.map(r=>({x:new Date(batteryTime(r)).getTime(),y:batteryV(r),iso:batteryTime(r)}));renderLineChart(target,[{name:'Hidden Valley voltage',color:'#f3c969',points}],{axisLabel:'Battery V',tooltipValue:v=>`${v.toFixed(3)} V`,empty:'Waiting for Hidden Valley battery telemetry.',pointRadius:3});
}
function rfClass(v){if(!Number.isFinite(v))return'';if(v>=-110)return'rf-strong';if(v>=-122)return'rf-fair';return'rf-weak';}
function applyRf(id,v){const el=$(id);if(!el)return;el.classList.remove('rf-strong','rf-fair','rf-weak');const c=rfClass(v);if(c)el.classList.add(c);}
function renderRf(target=$('rfChart')){
  const rows=tempRows('hv').filter(r=>rssi(r)!==null);const latest=rows[0]||null;const vals=rows.map(rssi).filter(Number.isFinite);const avg=mean(vals),best=vals.length?Math.max(...vals):null;
  if(latest){const rv=rssi(latest),sv=snr(latest),hp=hops(latest);setText('latestRssi',`${Math.round(rv)} dBm`);applyRf('latestRssi',rv);setText('latestSnr',`SNR ${sv===null?'—':sv.toFixed(1)+' dB'}`);setText('routeNow',hp===0?'Direct':hp===1?'1 relay':hp!==null?`${Math.round(hp)} relays`:'—');setText('routeDetail',hp===null?'hop metadata unavailable':`${Math.round(hp)} hop${hp===1?'':'s'} away`);}else{setText('latestRssi','—');setText('latestSnr','SNR —');setText('routeNow','—');setText('routeDetail','hop metadata');}
  setText('avgRssi',avg===null?'—':`${avg.toFixed(0)} dBm`);applyRf('avgRssi',avg);setText('bestRssi',best===null?'best —':`best ${best.toFixed(0)} dBm`);setText('rfChartCount',rows.length?`${rows.length} Hidden Valley RF samples`:'RF metadata pending');
  const points=[...rows].reverse().map(r=>({x:new Date(r.observed_at).getTime(),y:rssi(r),iso:r.observed_at}));renderLineChart(target,[{name:'RSSI',color:'#63b7ff',points}],{axisLabel:'RSSI dBm',tooltipValue:v=>`${Math.round(v)} dBm`,empty:'Waiting for Hidden Valley RF metadata.',pointRadius:3});
}

function renderRecent(){
  const rows=state.readings.filter(r=>r.telemetry_type==='environment'&&tempF(r)!==null&&(num(r.node_num)===STATIONS.hv.node||num(r.node_num)===STATIONS.home.node)).sort((a,b)=>new Date(b.observed_at)-new Date(a.observed_at)).slice(0,40);
  const tbody=$('recent');if(!rows.length){tbody.innerHTML='<tr><td colspan="8">Waiting for telemetry.</td></tr>';return;}
  tbody.innerHTML=rows.map(r=>{const key=num(r.node_num)===STATIONS.hv.node?'hv':'home',s=STATIONS[key],p=key==='hv'?batteryPct(r):null,v=key==='hv'?batteryV(r):null,rv=key==='hv'?rssi(r):null,sv=key==='hv'?snr(r):null,h=key==='hv'?hops(r):null;return `<tr><td>${esc(fmtTime(r.observed_at))}</td><td><span class="station-cell"><i class="legend-swatch ${key}"></i>${esc(s.name)}</span></td><td class="right">${tempF(r).toFixed(1)}</td><td class="right">${p===null?'—':Math.round(p)+'%'}</td><td class="right">${v===null?'—':v.toFixed(3)}</td><td class="right">${rv===null?'—':Math.round(rv)}</td><td class="right">${sv===null?'—':sv.toFixed(1)}</td><td class="right">${h===null?'—':Math.round(h)}</td></tr>`;}).join('');
}

const MAP_PROVIDERS={topo:{url:'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',attr:'USGS The National Map'},sat:{url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',attr:'Imagery © Esri'}};
function mapLayer(kind){const p=MAP_PROVIDERS[kind]||MAP_PROVIDERS.topo;return L.tileLayer(p.url,{maxZoom:20,attribution:p.attr,updateWhenIdle:true,keepBuffer:3});}
function addMarkers(map){
  Object.values(STATIONS).forEach(s=>{const marker=L.circleMarker(s.coords,{radius:9,color:'#edf7f6',weight:2,fillColor:s.color,fillOpacity:1}).addTo(map);const location=s.key==='home'?'Approx. Hollyoak Ln × Mill Creek Dr':`${s.coords[0].toFixed(5)}, ${s.coords[1].toFixed(5)}`;marker.bindPopup(`<strong>${esc(s.fullName)}</strong><br>${esc(location)}<br>${s.elevationFt.toLocaleString()} ft elevation<br><span style="color:#91aab0">${s.key==='home'?'Approximate display location':'Remote station location'}</span>`);});
}
function setMapKind(kind,map=state.map){if(!map||!window.L)return;state.mapKind=kind==='sat'?'sat':'topo';if(map===state.map&&state.baseLayer){try{map.removeLayer(state.baseLayer)}catch{}}const layer=mapLayer(state.mapKind).addTo(map);if(map===state.map){state.baseLayer=layer;$('mapTopoBtn')?.classList.toggle('active',state.mapKind==='topo');$('mapSatBtn')?.classList.toggle('active',state.mapKind==='sat');}setText('mapStatus',state.mapKind==='topo'?'USGS topo · two station locations':'Satellite imagery · two station locations');}
function initMap(){if(!window.L){setText('mapStatus','Map engine unavailable.');return;}const el=$('stationMap');if(!el)return;if(state.map){try{state.map.remove()}catch{}}state.map=L.map(el,{zoomControl:true,preferCanvas:true,minZoom:3,maxZoom:20});setMapKind('topo',state.map);addMarkers(state.map);state.map.fitBounds([STATIONS.hv.coords,STATIONS.home.coords],{padding:[45,45],maxZoom:12});setTimeout(()=>state.map.invalidateSize(true),120);$('mapTopoBtn')?.addEventListener('click',()=>setMapKind('topo'));$('mapSatBtn')?.addEventListener('click',()=>setMapKind('sat'));}

function bindExpand(){
  const dialog=$('expandDialog'),title=$('expandTitle'),chart=$('expandedChart'),mapEl=$('expandedMap');
  $('expandClose')?.addEventListener('click',()=>dialog.close());
  document.querySelectorAll('[data-expand]').forEach(btn=>btn.addEventListener('click',()=>{title.textContent=btn.dataset.title||'Chart';mapEl.hidden=true;chart.hidden=false;dialog.showModal();setTimeout(()=>{if(btn.dataset.expand==='tempChart')renderTemperatureChart(chart);else if(btn.dataset.expand==='batteryChart')renderBattery(chart);else if(btn.dataset.expand==='rfChart')renderRf(chart);},40);}));
  document.querySelectorAll('[data-expand-map]').forEach(btn=>btn.addEventListener('click',()=>{title.textContent=btn.dataset.title||'Station map';chart.hidden=true;mapEl.hidden=false;dialog.showModal();setTimeout(()=>{if(state.expandedMap){try{state.expandedMap.remove()}catch{}}mapEl.innerHTML='';state.expandedMap=L.map(mapEl,{preferCanvas:true,minZoom:3,maxZoom:20});mapLayer(state.mapKind).addTo(state.expandedMap);addMarkers(state.expandedMap);state.expandedMap.fitBounds([STATIONS.hv.coords,STATIONS.home.coords],{padding:[55,55],maxZoom:13});state.expandedMap.invalidateSize(true);},80);}));
  dialog?.addEventListener('close',()=>{if(state.expandedMap){try{state.expandedMap.remove()}catch{}state.expandedMap=null;}chart.innerHTML='';});
}
function renderAll(){renderSummary();renderTemperatureChart();renderRecent();setText('updated',`Refreshed ${new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit',second:'2-digit'})}`);}
async function loadData(){
  try{const res=await fetch(`/api/readings?hours=${state.hours}&limit=10000`,{cache:'no-store'});const data=await res.json();if(!res.ok||!data.ok)throw new Error(data.error||`HTTP ${res.status}`);state.readings=Array.isArray(data.readings)?data.readings:[];renderAll();}
  catch(err){console.error(err);setText('networkStatusText','Telemetry API unavailable');$('networkStatus').className='live-pill offline';setText('updated','Refresh failed');}
}
function bindTabs(){$('tabs')?.addEventListener('click',ev=>{const b=ev.target.closest('button[data-hours]');if(!b)return;state.hours=Number(b.dataset.hours)||24;$('tabs').querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));loadData();});}

bindTabs();bindExpand();initMap();loadData();setInterval(loadData,60000);
window.addEventListener('resize',()=>{state.map?.invalidateSize(false);state.expandedMap?.invalidateSize(false);});
