/* Cottonwood water measurements and relay status. */
(() => {
  'use strict';
  const creek = {node:1695962694, name:'Cottonwood Creek', id:'!65165646', short:'CC01', color:'#b49cff'};
  const relay = {node:2425602407, name:'Cottonwood Relay', id:'!9093c167', short:'CC02', color:'#ffb36b'};
  const enabled = {'mb-stage':true, 'mx-stage':true, 'mx-temp':false};
  const rows = node => state.readings.filter(r=>Number(r.node_num)===node)
    .sort((a,b)=>Date.parse(b.observed_at)-Date.parse(a.observed_at));
  const stageValue = r => r.telemetry_type==='water_distance' &&
    (metric(r,'stage_calibrated')===false || metric(r,'distance_valid')===false)
    ? null : num(metric(r,'water_level_ft'));
  for (const site of [creek,relay]) {
    document.querySelector('.station-hero-grid')?.insertAdjacentHTML('beforeend',
      `<article class="station-hero extra-station" style="--accent:${site.color}"><div class="station-heading"><span class="station-dot" style="background:${site.color}"></span><div><strong>${site.name}</strong><small>${site.short} · ${site.id}</small></div></div><div class="extra-reading" id="ccReading${site.node}">—</div><div class="combined-card-metrics" id="ccMetrics${site.node}"></div><div class="station-meta"><span id="ccAge${site.node}">Waiting for telemetry</span></div><div class="station-state offline" id="ccState${site.node}">No telemetry</div></article>`);
  }
  document.querySelector('.sw-water-panel')?.insertAdjacentHTML('afterend',
    `<section class="panel primary-monitor-panel" id="cottonwoodWaterPanel"><div class="panel-head monitor-head"><div><span class="eyebrow">CC01 · ${creek.id}</span><h2>Cottonwood Creek Water Stage &amp; Temperature</h2><p id="ccWaterCount">Waiting for measurements</p></div><button type="button" class="expand-btn" id="ccWaterExpand">Expand</button></div><div class="combined-options" id="ccSensorControls" style="padding:0 20px 12px;gap:16px"><label><input type="checkbox" data-cc-series="mb-stage" checked> MB stage</label><label><input type="checkbox" data-cc-series="mx-stage" checked> MX2001 stage</label><label><input type="checkbox" data-cc-series="mx-temp"> MX2001 temperature</label></div><div class="chart-note">Stage in feet; temperature in °F on a separate scale. MB stage requires field calibration. Missing readings stay missing.</div><div class="chart xlarge" id="ccWaterChart"></div><div class="chart xlarge" id="ccWaterTempChart" style="display:none"></div></section>`);
  function points(type, converter) {
    return rows(creek.node).filter(r=>r.telemetry_type===type).map(r=>({
      x:Date.parse(r.observed_at), y:converter(r), iso:r.observed_at
    })).filter(p=>Number.isFinite(p.x) && p.y!==null && Number.isFinite(p.y)).sort((a,b)=>a.x-b.x);
  }
  function renderWater(target=document.getElementById('ccWaterChart')) {
    if (!target) return;
    const mb=points('water_distance',stageValue), mx=points('mx2001',stageValue), temps=points('mx2001',tempF);
    const series=[];
    if(enabled['mb-stage'])series.push({name:'MB stage',color:creek.color,points:mb,maxGapMs:3*3600000});
    if(enabled['mx-stage'])series.push({name:'MX2001 stage',color:'#57b7ff',points:mx,maxGapMs:3*3600000});
    renderLineChart(target,series,{axisLabel:'Stage ft',tooltipValue:v=>`${v.toFixed(3)} ft`,
      empty:series.length?'Waiting for selected Cottonwood stage measurements.':'Select a stage sensor above.',pointRadius:3.4});
    const tempTarget=document.getElementById('ccWaterTempChart');
    tempTarget.style.display=enabled['mx-temp']?'':'none';
    if(enabled['mx-temp'])renderLineChart(tempTarget,[{name:'MX2001 temperature',color:'#f3c969',points:temps,maxGapMs:3*3600000}],
      {axisLabel:'Temperature °F',tooltipValue:v=>`${v.toFixed(1)} °F`,empty:'Waiting for Cottonwood MX2001 temperature.'});
    setText('ccWaterCount',`${mb.length} MB stage · ${mx.length} MX2001 stage · ${temps.length} MX2001 temperature samples`);
  }
  function renderCards() {
    for(const site of [creek,relay]) {
      const readings=rows(site.node),latest=readings[0],device=readings.find(r=>r.telemetry_type==='device');
      const voltage=device?batteryV(device):null,pct=device?batteryPct(device):null;
      const battery=voltage!==null?`${voltage.toFixed(3)} V`:pct!==null?`${Math.round(pct)}%`:'Battery —';
      const fields=[];
      if(site===creek) {
        const mb=readings.find(r=>r.telemetry_type==='water_distance' && stageValue(r)!==null);
        const mx=readings.find(r=>r.telemetry_type==='mx2001' && stageValue(r)!==null);
        const temp=readings.find(r=>r.telemetry_type==='mx2001' && tempF(r)!==null);
        setText('ccReading'+site.node,mb?`${stageValue(mb).toFixed(3)} ft · MB`:mx?`${stageValue(mx).toFixed(3)} ft · MX2001`:'Stage —');
        fields.push(mx?`MX2001 ${stageValue(mx).toFixed(3)} ft`:'MX2001 stage —',temp?`${tempF(temp).toFixed(1)} °F`:'Temperature —',battery);
      } else {
        setText('ccReading'+site.node,battery);
        const link=readings.find(r=>rssi(r)!==null || snr(r)!==null);
        fields.push(link && rssi(link)!==null?`${Math.round(rssi(link))} dBm`:'RSSI —',link && snr(link)!==null?`${snr(link).toFixed(1)} dB SNR`:'SNR —');
      }
      document.getElementById('ccMetrics'+site.node).textContent=fields.join(' · ');
      setText('ccAge'+site.node,latest?`Updated ${ageText(latest.observed_at)}`:'Waiting for telemetry');
      const fresh=latest && ageHours(latest.observed_at)<=STALE_AFTER_HOURS;
      const badge=document.getElementById('ccState'+site.node);
      badge.className='station-state '+(fresh?'online':'offline');
      badge.textContent=fresh?'Reporting':latest?'Stale':'No telemetry';
    }
  }
  document.querySelectorAll('#ccSensorControls input').forEach(input=>input.addEventListener('change',()=>{
    enabled[input.dataset.ccSeries]=input.checked;
    renderWater();
    if(document.getElementById('expandDialog')?.open && document.getElementById('expandedChart')?.dataset.rangeSource==='ccWaterChart')renderWater(document.getElementById('expandedChart'));
  }));
  document.getElementById('ccWaterExpand').addEventListener('click',()=>{
    const dialog=document.getElementById('expandDialog'),target=document.getElementById('expandedChart');
    setText('expandTitle','Cottonwood Creek Water Stage');document.getElementById('expandedMap').hidden=true;target.hidden=false;
    target.dataset.rangeSource='ccWaterChart';dialog.showModal();setTimeout(()=>renderWater(target),40);
  });
  const previousRenderAll=renderAll;
  renderAll=function(){previousRenderAll();renderCards();renderWater();
    if(document.getElementById('expandDialog')?.open && document.getElementById('expandedChart')?.dataset.rangeSource==='ccWaterChart')renderWater(document.getElementById('expandedChart'));
  };
  renderAll();
})();
