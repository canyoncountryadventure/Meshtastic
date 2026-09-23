const STATIONS = [
  {id:'pack-upper', creek:'pack', creekName:'Pack Creek', reach:'Upper', site:'PC-01', elev:7150, coords:[38.474,-109.333], color:'#52d6b0', stage:1.18, temp:52.7, ph:8.12, ec:438, do:9.1, delta:0.02},
  {id:'pack-lower', creek:'pack', creekName:'Pack Creek', reach:'Lower', site:'PC-02', elev:4250, coords:[38.515,-109.488], color:'#4c9ce8', stage:1.42, temp:59.4, ph:8.24, ec:612, do:8.3, delta:-0.01},
  {id:'mill-upper', creek:'mill', creekName:'Mill Creek', reach:'Upper', site:'MC-01', elev:6820, coords:[38.530,-109.384], color:'#52d6b0', stage:1.09, temp:50.8, ph:7.96, ec:356, do:9.5, delta:0.01},
  {id:'mill-lower', creek:'mill', creekName:'Mill Creek', reach:'Lower', site:'MC-02', elev:4100, coords:[38.568,-109.536], color:'#4c9ce8', stage:1.36, temp:57.9, ph:8.18, ec:528, do:8.6, delta:0.03},
  {id:'castle-upper', creek:'castle', creekName:'Castle Creek', reach:'Upper', site:'CC-01', elev:7480, coords:[38.583,-109.278], color:'#52d6b0', stage:0.94, temp:48.6, ph:7.88, ec:294, do:9.8, delta:-0.01},
  {id:'castle-lower', creek:'castle', creekName:'Castle Creek', reach:'Lower', site:'CC-02', elev:4210, coords:[38.648,-109.397], color:'#4c9ce8', stage:1.27, temp:56.2, ph:8.06, ec:471, do:8.9, delta:0.01},
];

const METRICS = {
  stage:{label:'Stage',unit:'ft',decimals:2},
  temp:{label:'Water temperature',unit:'°F',decimals:1},
  ph:{label:'pH',unit:'',decimals:2},
  ec:{label:'Specific conductance',unit:'µS/cm',decimals:0},
  do:{label:'Dissolved oxygen',unit:'mg/L',decimals:1},
};

const state={filter:'all',creek:'pack',metric:'stage',map:null};
const $=id=>document.getElementById(id);
const now=()=>new Date();
const timeOptions={hour:'numeric',minute:'2-digit',timeZone:'America/Denver'};
const formatObserved=(offset=0)=>new Date(Date.now()-offset*60000).toLocaleTimeString([],{...timeOptions});
const formatValue=(s,key)=>`${s[key].toFixed(METRICS[key].decimals)}${METRICS[key].unit?` ${METRICS[key].unit}`:''}`;

function updateClock(){
  $('networkUpdate').textContent=now().toLocaleTimeString([],{...timeOptions});
  const top=[...STATIONS].sort((a,b)=>b.stage-a.stage)[0];
  $('highestStage').textContent=`${top.stage.toFixed(2)} ft`;
  $('highestStageSite').textContent=`${top.creekName} · ${top.reach}`;
}

function sparkline(station){
  const values=seriesFor(station,'stage',13);
  const min=Math.min(...values),max=Math.max(...values),range=max-min||1;
  const points=values.map((v,i)=>`${(i/(values.length-1)*116).toFixed(1)},${(39-(v-min)/range*32).toFixed(1)}`).join(' ');
  const area=`M ${points.split(' ').join(' L ')} L 116 42 L 0 42 Z`;
  return `<svg class="spark" viewBox="0 0 116 42" aria-hidden="true"><path class="area" d="${area}" fill="${station.color}"/><polyline class="line" points="${points}" stroke="${station.color}"/></svg>`;
}

function seriesFor(station,key,count=25){
  const seed=STATIONS.indexOf(station)+1;
  const amp={stage:.075,temp:2.1,ph:.055,ec:10,do:.22}[key];
  return Array.from({length:count},(_,i)=>{
    const daily=Math.sin((i/(count-1))*Math.PI*2-1.35+seed*.28);
    const secondary=Math.sin(i*.72+seed)*.22;
    const downstream=station.reach==='Lower'&&key==='temp'?Math.sin((i/(count-1))*Math.PI*2-1.1)*.55:0;
    return station[key]+amp*(daily*.72+secondary)+downstream;
  });
}

function stationCard(s,index){
  const delta=s.delta;
  return `<article class="station-card" data-creek="${s.creek}">
    <div class="station-card-top"><div class="station-card-title"><i style="background:${s.color};box-shadow:0 0 12px ${s.color}77"></i><div><h3>${s.creekName} <span>· ${s.reach}</span></h3><small>${s.site} · ${s.elev.toLocaleString()} ft elevation</small></div></div><span class="station-health">Reporting</span></div>
    <div class="primary-reading"><div class="stage-reading"><span>Stage</span><strong>${s.stage.toFixed(2)}<small>ft</small></strong></div>${sparkline(s)}</div>
    <div class="metric-grid"><div><small>Temp</small><strong>${s.temp.toFixed(1)} °F</strong></div><div><small>pH</small><strong>${s.ph.toFixed(2)}</strong></div><div><small>EC</small><strong>${s.ec} <small>µS/cm</small></strong></div><div><small>DO</small><strong>${s.do.toFixed(1)} <small>mg/L</small></strong></div></div>
    <div class="station-card-foot"><span>Updated ${index%3+1} min ago</span><span>Stage ${delta>=0?'↑':'↓'} ${Math.abs(delta).toFixed(2)} ft / 1 hr</span></div>
  </article>`;
}

function renderStations(){
  $('stationGrid').innerHTML=STATIONS.map(stationCard).join('');
  applyFilter();
}

function applyFilter(){
  document.querySelectorAll('.station-card').forEach(card=>card.classList.toggle('hidden',state.filter!=='all'&&card.dataset.creek!==state.filter));
}

function renderConditions(){
  $('conditionList').innerHTML=STATIONS.map((s,i)=>`<div class="condition-row"><div class="condition-name"><i style="background:${s.color}"></i>${s.creekName} · ${s.reach}</div><span class="condition-time">${i%3+1} min ago</span><div class="condition-values"><div><small>Stage</small><strong>${s.stage.toFixed(2)} ft</strong></div><div><small>Temp</small><strong>${s.temp.toFixed(1)}°</strong></div><div><small>pH</small><strong>${s.ph.toFixed(2)}</strong></div><div><small>EC</small><strong>${s.ec}</strong></div><div><small>DO</small><strong>${s.do.toFixed(1)}</strong></div></div></div>`).join('');
}

function renderTable(){
  $('observationRows').innerHTML=STATIONS.map((s,i)=>`<tr><td>${s.creekName} · ${s.reach}</td><td>${formatObserved(i%3+1)}</td><td>${s.stage.toFixed(2)} ft</td><td>${s.temp.toFixed(1)} °F</td><td>${s.ph.toFixed(2)}</td><td>${s.ec} µS/cm</td><td>${s.do.toFixed(1)} mg/L</td><td><span class="status-normal">Normal</span></td></tr>`).join('');
}

function initMap(){
  if(!window.L)return;
  state.map=L.map('stationMap',{zoomControl:true,scrollWheelZoom:false}).setView([38.557,-109.42],11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap',maxZoom:18}).addTo(state.map);
  STATIONS.forEach(s=>{
    const icon=L.divIcon({className:`station-marker ${s.reach.toLowerCase()}`,html:'<span></span>',iconSize:[18,18],iconAnchor:[9,9]});
    L.marker(s.coords,{icon}).addTo(state.map).bindPopup(`<div class="map-popup"><strong>${s.creekName} · ${s.reach}</strong><span>${s.site} · ${s.elev.toLocaleString()} ft</span><span>Stage ${s.stage.toFixed(2)} ft · ${s.temp.toFixed(1)} °F</span></div>`);
  });
}

function renderChart(){
  const stations=STATIONS.filter(s=>s.creek===state.creek);
  const metric=METRICS[state.metric];
  const series=stations.map(s=>seriesFor(s,state.metric,25));
  const all=series.flat(), rawMin=Math.min(...all),rawMax=Math.max(...all),pad=Math.max((rawMax-rawMin)*.25,state.metric==='ph'?.03:state.metric==='ec'?5:.05),min=rawMin-pad,max=rawMax+pad;
  const W=1100,H=330,m={l:58,r:24,t:20,b:40},iw=W-m.l-m.r,ih=H-m.t-m.b;
  const x=i=>m.l+i/24*iw,y=v=>m.t+(max-v)/(max-min)*ih;
  let svg=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="24-hour ${metric.label} comparison">`;
  for(let i=0;i<=4;i++){const yy=m.t+i/4*ih,val=max-i/4*(max-min);svg+=`<line class="chart-grid" x1="${m.l}" y1="${yy}" x2="${W-m.r}" y2="${yy}"/><text class="chart-label" x="${m.l-10}" y="${yy+4}" text-anchor="end">${val.toFixed(metric.decimals)}</text>`;}
  ['24 hr','18 hr','12 hr','6 hr','Now'].forEach((label,i)=>{const xx=m.l+i/4*iw;svg+=`<text class="chart-label" x="${xx}" y="${H-14}" text-anchor="middle">${label}</text>`;});
  series.forEach((vals,j)=>{const color=stations[j].color,pts=vals.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');svg+=`<polyline class="chart-line" points="${pts}" stroke="${color}"/>`;vals.forEach((v,i)=>{if(i===24)svg+=`<circle class="chart-dot" cx="${x(i)}" cy="${y(v)}" r="4" fill="${color}"/>`;});});
  svg+='</svg>';
  $('trendChart').innerHTML=svg;
  const creek=stations[0].creekName;
  $('trendTitle').textContent=`${creek} · ${metric.label}`;
  $('trendSubtitle').textContent=`Upper and lower station comparison · ${metric.unit||'standard units'}`;
}

function bind(){
  document.querySelectorAll('.station-filters button').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.station-filters button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');state.filter=btn.dataset.filter;applyFilter();}));
  $('creekSelect').addEventListener('change',e=>{state.creek=e.target.value;renderChart();});
  $('metricTabs').addEventListener('click',e=>{const btn=e.target.closest('button[data-metric]');if(!btn)return;document.querySelectorAll('#metricTabs button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');state.metric=btn.dataset.metric;renderChart();});
  $('refreshButton').addEventListener('click',()=>{const b=$('refreshButton');b.classList.remove('spin');void b.offsetWidth;b.classList.add('spin');updateClock();renderConditions();renderTable();setTimeout(()=>b.classList.remove('spin'),700);});
  document.querySelector('.text-button').addEventListener('click',()=>{
    const head=['Station','Observed','Stage_ft','WaterTemp_F','pH','EC_uScm','DO_mgL'];
    const rows=STATIONS.map((s,i)=>[`${s.creekName} ${s.reach}`,formatObserved(i%3+1),s.stage,s.temp,s.ph,s.ec,s.do]);
    const blob=new Blob([[head,...rows].map(r=>r.join(',')).join('\n')],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='moab-watershed-observations.csv';a.click();URL.revokeObjectURL(a.href);
  });
}

updateClock();renderStations();renderConditions();renderTable();renderChart();initMap();bind();setInterval(updateClock,60000);
