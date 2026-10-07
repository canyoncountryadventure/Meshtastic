/* One comparison chart for all visible sites except Fishlake. */
(() => {
  'use strict';
  const REPURPOSED_AT = Date.parse('2026-10-05T00:00:00Z');
  const sites = [
    {node:1252758033,name:'Hidden Valley',color:'#55d9b7'},
    {node:2740603892,name:'Moab',color:'#ff9a67'},
    {node:3388602087,name:'Pack Creek (paused)',paused:true,color:'#c3a0fb'},
    {node:2004386937,name:'Rock Moisture (experimental phase)',color:'#d9b873'},
    {node:1949224949,name:"It's a Swell Day",color:'#57b7ff'},
    {node:4241345683,name:'SMLA',short:'SMLA',id:'!fccdcc93',color:'#f5d05f',since:REPURPOSED_AT},
    {node:3044869407,name:'Revived',short:'RVV1',id:'!b57d051f',color:'#fa86ac',since:REPURPOSED_AT},
  ];
  const metricDefs = [
    {key:'voltage',name:'Battery voltage',unit:'V',dash:'',precision:3},
    {key:'temperature',name:'Temperature',unit:'°F',dash:'7 4',precision:1},
    {key:'moisture',name:'Moisture',unit:'ADC10',dash:'2 4',precision:0},
  ];
  const selectedSites = new Set(sites.map(s=>s.node));
  const selectedMetrics = new Set(metricDefs.map(m=>m.key));
  const seriesRows = site => state.readings.filter(r => Number(r.node_num)===site.node &&
    (!site.since || Date.parse(r.observed_at)>=site.since));
  const temperatureTypes = new Set(['environment','mx2001','rock_test']);
  const valueFor = (r,key) => {
    if(key==='voltage'){
      const value=batteryV(r);
      return r.telemetry_type==='device' && value!==null && value>0 ? {value,unit:'V'} : null;
    }
    if(key==='temperature'){
      const value=tempF(r);
      return temperatureTypes.has(r.telemetry_type) && value!==null ? {value,unit:'°F'} : null;
    }
    if(r.telemetry_type!=='soil')return null;
    const adc=num(metric(r,'soil_adc10'));
    if(adc!==null && adc>=0 && adc<=1023)return {value:adc,unit:'ADC10'};
    const pct=num(metric(r,'soil_moisture_percent'));
    return pct!==null && pct>=0 && pct<=100 ? {value:pct,unit:'% index'} : null;
  };
  function collectSeries(){
    const series=[];
    for(const site of sites.filter(s=>selectedSites.has(s.node))){
      for(const definition of metricDefs.filter(m=>selectedMetrics.has(m.key))){
        const groups=new Map();
        for(const row of seriesRows(site)){
          const result=valueFor(row,definition.key),time=Date.parse(definition.key==='voltage'?batteryTime(row):row.observed_at);
          if(!result||!Number.isFinite(time))continue;
          if(!groups.has(result.unit))groups.set(result.unit,[]);
          groups.get(result.unit).push({x:time,y:result.value,iso:row.observed_at});
        }
        for(const [unit,points] of groups)series.push({site,definition,unit,points:points.sort((a,b)=>a.x-b.x)});
      }
    }
    return series;
  }
  const css=document.createElement('style');
  css.textContent=`
    .combined-controls{display:grid;gap:12px;margin:12px 0}.combined-controls fieldset{border:1px solid #24434d;border-radius:12px;padding:12px}.combined-controls legend{color:#90aab0;font-size:12px;padding:0 6px}.combined-options{display:flex;flex-wrap:wrap;gap:8px}.combined-choice{display:inline-flex;align-items:center;gap:8px;border:1px solid #29464e;border-radius:9px;padding:10px 12px;color:#e4f0f1;background:#0a1a20;cursor:pointer;font-size:13px}.combined-choice input{accent-color:var(--choice-color,#55d9b7);width:17px;height:17px;margin:0}.combined-legend{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:12px;color:#b6c9ce;margin:15px 0}.combined-line{display:inline-block;width:24px;border-top:3px solid;margin-right:7px;vertical-align:middle}.combined-line.temperature{border-top-style:dashed}.combined-line.moisture{border-top-style:dotted}.combined-series-empty{opacity:.6}.combined-chart-note{color:#a9bfc5;font-size:12px;margin:8px 0}.combined-new-card .extra-reading{font-size:26px}.combined-card-metrics{display:flex;flex-wrap:wrap;gap:10px;color:#b7cdd2;font-size:13px}.combined-monitor-panel .chart.xlarge{height:460px}@media(max-width:680px){.combined-monitor-panel .chart.xlarge{height:380px}.combined-choice{padding:10px;font-size:12px}}
  `;
  document.head.appendChild(css);
  const controls=document.getElementById('combinedControls');
  document.getElementById('combinedMetricControls').innerHTML=metricDefs.map(m=>
    `<label class="combined-choice"><input type="checkbox" data-combined-metric="${m.key}" checked>${esc(m.name)}</label>`).join('');
  document.getElementById('combinedSiteControls').innerHTML=sites.map(s=>
    `<label class="combined-choice" style="--choice-color:${s.color}"><input type="checkbox" data-combined-site="${s.node}" checked>${esc(s.name)}</label>`).join('');
  controls.addEventListener('change',event=>{
    const input=event.target;
    if(input.dataset.combinedMetric){const key=input.dataset.combinedMetric;input.checked?selectedMetrics.add(key):selectedMetrics.delete(key);}
    if(input.dataset.combinedSite){const key=Number(input.dataset.combinedSite);input.checked?selectedSites.add(key):selectedSites.delete(key);}
    renderCombined();
    if(document.getElementById('expandDialog')?.open && document.getElementById('expandedChart')?.dataset.rangeSource==='combinedChart')renderCombined(document.getElementById('expandedChart'));
  });
  for(const site of sites.filter(s=>s.since)){
    STATIONS[site.short.toLowerCase()]={...site,key:site.short.toLowerCase(),battery:true};
    document.querySelector('.station-hero-grid')?.insertAdjacentHTML('beforeend',
      `<article class="station-hero extra-station combined-new-card" style="--accent:${site.color}"><div class="station-heading"><span class="station-dot" style="background:${site.color}"></span><div><strong>${esc(site.name)}</strong><small>${esc(site.short)} · ${esc(site.id)}</small></div></div><div class="extra-reading" id="combinedTemp${site.node}">—</div><div class="combined-card-metrics"><span id="combinedBattery${site.node}">Battery —</span><span id="combinedMoisture${site.node}">Moisture —</span></div><div class="station-meta"><span id="combinedAge${site.node}">Waiting for new readings</span></div><div class="station-state offline" id="combinedState${site.node}">No new telemetry</div></article>`);
  }
  function renderCombined(target=document.getElementById('combinedChart')){
    if(!target)return;
    ensureChartRangeControl(target);
    const range=chartTimeWindow(target),series=collectSeries().map(s=>({...s,points:s.points.filter(p=>p.x>=range.xMin && p.x<=range.xMax)})).filter(s=>s.points.length);
    target.innerHTML='';
    const units=[...new Set(series.map(s=>s.unit))];
    const selectedCount=selectedSites.size;
    setText('combinedChartCount',`${selectedCount} sites selected · ${series.length} series with readings · ${range.hours} hours`);
    const unavailable=sites.filter(s=>selectedSites.has(s.node) && !series.some(line=>line.site.node===s.node));
    document.getElementById('combinedLegend').innerHTML=series.map(s=>
      `<span><i class="combined-line ${s.definition.key}" style="border-color:${s.site.color}"></i>${esc(s.site.name)} · ${esc(s.definition.name)} (${esc(s.unit)})</span>`).join('')+
      unavailable.map(s=>`<span class="combined-series-empty">${esc(s.name)} · no selected readings in this window</span>`).join('');
    if(!series.length){target.innerHTML=`<div class="empty">${selectedCount && selectedMetrics.size?'No selected measurements in this window.':'Select at least one site and measurement.'}</div>`;return;}
    const w=Math.max(620,target.clientWidth||900),h=Math.max(300,target.clientHeight||460),left=58,right=units.length>1?58+(units.length-2)*58:20,top=38,bottom=40,pw=w-left-right,ph=h-top-bottom;
    const x=t=>left+(t-range.xMin)/(range.xMax-range.xMin)*pw;
    const scales=new Map(units.map(unit=>{
      const values=series.filter(s=>s.unit===unit).flatMap(s=>s.points.map(p=>p.y));
      let min=Math.min(...values),max=Math.max(...values);const pad=(max-min||Math.max(1,Math.abs(max)*.1))*.12;min-=pad;max+=pad;
      if(unit==='ADC10'){min=Math.max(0,min);max=Math.min(1023,max);}if(unit==='% index'){min=Math.max(0,min);max=Math.min(100,max);}
      return [unit,{min,max,y:v=>top+(max-v)/(max-min)*ph}];
    }));
    const svg=svgEl('svg',{viewBox:`0 0 ${w} ${h}`,preserveAspectRatio:'none',role:'img','aria-label':'Site battery voltage, temperature and moisture comparison with independent unit scales'});target.appendChild(svg);
    for(let i=0;i<=4;i++){
      const yy=top+ph*i/4;svg.appendChild(svgEl('line',{x1:left,x2:left+pw,y1:yy,y2:yy,stroke:'#17343d','stroke-width':1}));
      units.forEach((unit,j)=>{const scale=scales.get(unit),value=scale.max-(scale.max-scale.min)*i/4;addText(svg,j===0?left-8:left+pw+8+(j-1)*58,yy+4,value.toFixed(unit==='V'?2:unit==='ADC10'?0:1),j===0?'end':'start','#a8c2c9',11);});
      const xx=left+pw*i/4;addText(svg,xx,h-12,fmtAxis(range.xMin+(range.xMax-range.xMin)*i/4,range.xMax-range.xMin),'middle');
    }
    units.forEach((unit,j)=>addText(svg,j===0?left-8:left+pw+8+(j-1)*58,22,unit,j===0?'end':'start','#e1eff1',11));
    for(const line of series){
      const y=scales.get(line.unit).y;let segment=[];
      const draw=()=>{if(segment.length)svg.appendChild(svgEl('polyline',{points:segment.map(p=>`${x(p.x)},${y(p.y)}`).join(' '),fill:'none',stroke:line.site.color,'stroke-width':2.6,'stroke-dasharray':line.definition.dash,'stroke-linejoin':'round'}));segment=[];};
      line.points.forEach((p,i)=>{if(i && p.x-line.points[i-1].x>3*3600000)draw();segment.push(p);});draw();
      for(const point of line.points){
        const circle=svgEl('circle',{cx:x(point.x),cy:y(point.y),r:2.6,fill:line.site.color,stroke:'#08171d','stroke-width':1});
        const tip=()=>`<strong>${esc(line.site.name)}</strong><br>${esc(line.definition.name)}: ${point.y.toFixed(line.definition.precision)} ${esc(line.unit)}<br>${esc(fmtTime(point.iso))}`;
        circle.addEventListener('mouseenter',ev=>showTooltip(target,ev,tip()));circle.addEventListener('mouseleave',()=>hideTooltip(target));circle.addEventListener('click',ev=>showTooltip(target,ev,tip()));
        const title=svgEl('title');title.textContent=`${line.site.name}: ${point.y.toFixed(line.definition.precision)} ${line.unit}`;circle.appendChild(title);svg.appendChild(circle);
      }
    }
  }
  document.getElementById('fishlakeHealthCharts')?.insertAdjacentHTML('beforeend',
    '<article class="panel primary-monitor-panel" style="grid-column:1 / -1"><div class="panel-head"><div><span class="eyebrow">Fishlake Hightop</span><h2>Temperature</h2><p id="fishlakeTempCount">Waiting for temperature readings</p></div><button type="button" class="expand-btn" id="fishlakeTempExpand">Expand</button></div><div class="chart xlarge" id="fishlakeTemperatureChart"></div></article>');
  function renderFishlakeTemperature(target=document.getElementById('fishlakeTemperatureChart')){
    if(!target)return;
    const points=state.readings.filter(r=>Number(r.node_num)===1577197109 && temperatureTypes.has(r.telemetry_type) && tempF(r)!==null)
      .map(r=>({x:Date.parse(r.observed_at),y:tempF(r),iso:r.observed_at}));
    renderLineChart(target,[{name:'Fishlake Hightop temperature',color:'#66b9ff',points,maxGapMs:3*3600000}],
      {axisLabel:'Temperature °F',tooltipValue:v=>v.toFixed(1)+' °F',empty:'Waiting for Fishlake temperature readings.'});
    setText('fishlakeTempCount',points.length+' temperature samples');
  }
  document.getElementById('fishlakeTempExpand')?.addEventListener('click',()=>{
    const dialog=document.getElementById('expandDialog'),target=document.getElementById('expandedChart');
    setText('expandTitle','Fishlake Hightop Temperature');document.getElementById('expandedMap').hidden=true;target.hidden=false;target.dataset.rangeSource='fishlakeTemperatureChart';dialog.showModal();setTimeout(()=>renderFishlakeTemperature(target),40);
  });
  function renderNewCards(){
    for(const site of sites.filter(s=>s.since)){
      const rows=seriesRows(site).sort((a,b)=>Date.parse(b.observed_at)-Date.parse(a.observed_at));
      const latest=rows[0],temperature=rows.find(r=>valueFor(r,'temperature')),voltage=rows.find(r=>valueFor(r,'voltage')),moisture=rows.find(r=>valueFor(r,'moisture'));
      setText('combinedTemp'+site.node,temperature?tempF(temperature).toFixed(1)+' °F':'Temperature —');
      setText('combinedBattery'+site.node,voltage?batteryV(voltage).toFixed(3)+' V':'Battery —');
      const moistureValue=moisture && valueFor(moisture,'moisture');setText('combinedMoisture'+site.node,moistureValue?Math.round(moistureValue.value)+' '+moistureValue.unit:'Moisture —');
      setText('combinedAge'+site.node,latest?'Updated '+ageText(latest.observed_at):'Waiting for new readings');
      const el=document.getElementById('combinedState'+site.node),fresh=latest && ageHours(latest.observed_at)<=STALE_AFTER_HOURS;
      if(el){el.className='station-state '+(fresh?'online':'offline');el.textContent=fresh?'Reporting':latest?'Stale':'No new telemetry';}
    }
    const packState=document.getElementById('cliffState');if(packState){packState.className='station-state stale';packState.textContent='Paused';}
    const allSites=[...sites.filter(site=>!site.paused),{node:1577197109,name:'Fishlake Hightop'}];
    const healthy=allSites.filter(site=>seriesRows(site).some(r=>ageHours(r.observed_at)<=STALE_AFTER_HOURS)).length;
    setText('stationsReporting',healthy+' / '+allSites.length);
    setText('networkStatusText',healthy===allSites.length?'All '+allSites.length+' stations reporting':healthy+' of '+allSites.length+' stations reporting · Pack Creek paused');
    const status=document.getElementById('networkStatus');if(status)status.className='live-pill '+(healthy===allSites.length?'online':healthy?'partial':'offline');
  }
  document.getElementById('combinedExpand')?.addEventListener('click',()=>{
    const dialog=document.getElementById('expandDialog'),target=document.getElementById('expandedChart');
    setText('expandTitle','Battery, Temperature & Moisture');document.getElementById('expandedMap').hidden=true;target.hidden=false;target.dataset.rangeSource='combinedChart';dialog.showModal();setTimeout(()=>renderCombined(target),40);
  });
  const earlierRenderAll=renderAll;
  renderAll=function(){earlierRenderAll();renderCombined();renderFishlakeTemperature();renderNewCards();if(document.getElementById('expandDialog')?.open && document.getElementById('expandedChart')?.dataset.rangeSource==='combinedChart')renderCombined(document.getElementById('expandedChart'));if(document.getElementById('expandDialog')?.open && document.getElementById('expandedChart')?.dataset.rangeSource==='fishlakeTemperatureChart')renderFishlakeTemperature(document.getElementById('expandedChart'));};
  const footer=document.querySelector('footer > span:first-child');if(footer)footer.textContent='Meshtastic environmental network · Hidden Valley · Rock Moisture · Pack Creek · Moab · Fishlake · Swell · SMLA · Revived';
  renderAll();
})();
