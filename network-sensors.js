/* Additional production sensor nodes. Identity and labels live here, not in the Heltec. */
(() => {
  'use strict';

  const EXTRA = {
    soil: { node: 2004386937, name: 'Rock Moisture', id: '!77788479', color: '#d9b873' },
    rockTemp: { node: 2004386937, name: 'Soil Temperature', color: '#8ecae6' },
  };
  const TEMPERATURE_TYPES = new Set(['environment', 'mx2001']);
  const ROCK_MOISTURE_INSTALLED_AT = Date.parse('2026-09-28T22:41:25.000Z'); // first persisted rock-moisture sample · 4:41:25 PM MDT
  const ROCK_PRECIP_BANDS = [
    {start:Date.parse('2026-09-29T08:15:00.000Z'),end:Date.parse('2026-09-29T08:50:00.000Z'),label:'RAIN · 2:15–2:50 AM',fill:'rgba(102,185,255,.20)',stroke:'#66b9ff'},
    {start:Date.parse('2026-09-29T09:30:00.000Z'),end:Date.parse('2026-09-29T11:40:00.000Z'),label:'RAIN · 3:30–5:40 AM',fill:'rgba(102,185,255,.20)',stroke:'#66b9ff'}
  ];
  const selectedAirTemperatureNodes = new Set([
    STATIONS.hv?.node,
    STATIONS.home?.node,
    STATIONS.fl?.node,
  ].filter(v => Number.isFinite(Number(v))).map(Number));
  const sameNode = (r, node) => Number(r && r.node_num) === node;
  const byTime = (a, b) => new Date(b.observed_at) - new Date(a.observed_at);
  const rowsFor = node => state.readings.filter(r => sameNode(r, node)).sort(byTime);
  const hasTemperature = r => r && TEMPERATURE_TYPES.has(r.telemetry_type) && tempF(r) !== null;
  const temperatureRows = node => {
    const site = Object.values(STATIONS).find(s=>Number(s.node)===node);
    return rowsFor(node).filter(r=>hasTemperature(r) && (!site?.since || Date.parse(r.observed_at)>=site.since));
  };
  const soilRows = () => rowsFor(EXTRA.soil.node).filter(r => r.telemetry_type === 'soil');
  const rockTemperatureRows = () => rowsFor(EXTRA.soil.node).filter(r =>
    hasTemperature(r) && Date.parse(r.observed_at) >= ROCK_MOISTURE_INSTALLED_AT);
  const rockHourlyRows = () => {
    const buckets = new Map();
    soilRows().forEach(r => {
      const adc = Number(metric(r, 'soil_adc10'));
      if (!Number.isFinite(adc)) return;
      const hour = Math.floor(new Date(r.observed_at).getTime() / 3600000);
      if (!buckets.has(hour)) buckets.set(hour, r);
    });
    return [...buckets.values()].sort(byTime);
  };
  const rockMoistureInterpolationSeries = measuredPoints => {
    const sorted=[...measuredPoints].sort((a,b)=>a.x-b.x);
    const out=[];
    for(let i=1;i<sorted.length;i++){
      const a=sorted[i-1], b=sorted[i];
      const gap=b.x-a.x;
      if(gap<=90*60*1000) continue;
      const pts=[{...a,estimatedBridge:true}];
      for(let t=a.x+60*60*1000;t<b.x;t+=60*60*1000){
        const frac=(t-a.x)/gap;
        pts.push({
          x:t,
          y:a.y+(b.y-a.y)*frac,
          iso:new Date(t).toISOString(),
          estimated:true,
          gapHours:gap/3600000
        });
      }
      pts.push({...b,estimatedBridge:true});
      out.push({
        name:'Interpolated moisture gap',
        color:'#ff9a67',
        points:pts,
        dash:'7 6',
        strokeWidth:2.5,
        pointRadius:1.8
      });
    }
    return out;
  };
  const asPercent = r => r ? Math.round(Number(metric(r, 'soil_moisture_percent'))) + '%' : '—';
  const soilCondition = r => {
    if (!r) return '—';
    const adc = Number(metric(r, 'soil_adc10'));
    if (Number.isFinite(adc)) {
      if (adc <= 425) return 'SOAKED';
      if (adc <= 525) return 'WET';
      if (adc <= 625) return 'GOOD';
      if (adc <= 690) return 'GETTING DRY';
      if (adc <= 750) return 'WATER SOON';
      return 'DRY/VERY DRY';
    }
    const pct = Number(metric(r, 'soil_moisture_percent'));
    if (!Number.isFinite(pct)) return '—';
    if (pct >= 83) return 'SOAKED';
    if (pct >= 61) return 'WET';
    if (pct >= 39) return 'GOOD';
    if (pct >= 24) return 'GETTING DRY';
    if (pct >= 11) return 'WATER SOON';
    return 'DRY/VERY DRY';
  };
  const soilDisplay = r => r ? asPercent(r) + ' · ' + soilCondition(r) : '—';
  const freshness = r => r ? 'Updated ' + ageText(r.observed_at) : 'Waiting for readings';
  const deviceRows = node => rowsFor(node).filter(r => r.telemetry_type === 'device' &&
    (batteryPct(r) !== null || batteryV(r) !== null));
  const cardBatteryText = r => {
    if (!r) return 'Battery —';
    const pct = batteryPct(r), volts = batteryV(r);
    if (pct === 101) return 'External power';
    if (pct !== null) return 'Battery ' + Math.round(pct) + '%';
    return volts !== null && volts > 0 ? volts.toFixed(3) + ' V' : 'Battery —';
  };
  const addStatus = (el, r, requirementsMet = true) => {
    if (!el) return;
    const fresh = r && ageHours(r.observed_at) <= STALE_AFTER_HOURS;
    el.className = 'station-state ' + (fresh && requirementsMet ? 'online' : r ? 'stale' : 'offline');
    el.textContent = !r ? 'No readings yet' : !requirementsMet ? 'Awaiting current temperature and stage' :
      fresh ? 'Reporting normally' : 'Stale · ' + ageText(r.observed_at);
  };

  const css = document.createElement('style');
  css.textContent = `
    .station-hero-grid{grid-template-columns:repeat(auto-fit,minmax(215px,1fr))}
    .extra-station{border-top:3px solid var(--accent,#66b9ff)}
    .extra-reading{font-size:clamp(35px,4vw,60px);font-weight:800;letter-spacing:-.04em;margin:12px 0 8px}
    .extra-secondary{font-size:15px;color:#c1d7df;margin-bottom:10px}
    .sensor-details{margin-top:14px;border-top:1px solid var(--line);padding-top:10px}
    .sensor-details summary{cursor:pointer;color:#bcd2da;font-size:13px;font-weight:700;list-style:none}
    .sensor-details summary::-webkit-details-marker{display:none}
    .sensor-details summary:after{content:" +";color:var(--muted)}
    .sensor-details[open] summary:after{content:" −"}
    .sensor-details-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
    .sensor-details-block{background:#0a1b23;border:1px solid var(--line);border-radius:10px;padding:11px}
    .sensor-details-block strong{display:block;font-size:13px;margin-bottom:8px}
    .sensor-details-row{display:flex;justify-content:space-between;gap:12px;font-size:12px;color:var(--muted);margin:5px 0;min-width:0}
    .sensor-details-row span,.sensor-details-row b{min-width:0}
    .sensor-details-row b{color:#dcebef;font-weight:700;text-align:right}
    .sensor-equation-row{display:grid;grid-template-columns:auto;gap:3px;margin-top:7px}
    .sensor-equation-row b{text-align:left;font-size:11.5px;line-height:1.35;white-space:normal;overflow-wrap:normal}
    .sensor-comparison{grid-column:1/-1}
    .sensor-agreement{font-weight:800}
    .sensor-agreement.excellent{color:#55d9b7}
    .sensor-agreement.good{color:#86d7e8}
    .sensor-agreement.watch{color:#f3c969}
    .sensor-agreement.investigate{color:#ff8f80}
    .primary-monitor-panel{overflow:hidden}
    .primary-monitor-panel .chart.xlarge{height:440px}
    .monitor-head{align-items:flex-end}
    .monitor-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
    .compact-tabs{gap:4px}.compact-tabs button{padding:7px 9px;font-size:12px}
    .monitor-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:12px}
    .monitor-summary>div{background:#091a20;border:1px solid #1b3740;border-radius:11px;padding:12px}
    .monitor-summary span{display:block;color:#88a4aa;font-size:11px;text-transform:uppercase;letter-spacing:.1em;font-weight:800}
    .monitor-summary strong{display:block;font-size:22px;margin-top:6px}
    .monitor-summary small{display:block;color:var(--muted);margin-top:5px}
    .soil-monitor-panel{border-color:rgba(217,184,115,.28)}
    .reading-kicker{margin-top:12px;color:#86a4ab;font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.11em}
    .temp-station-filter{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:0 2px 12px}
    .temp-filter-btn{display:inline-flex;align-items:center;gap:7px;border:1px solid #24434d;background:#0a1a20;color:#8ea8ae;border-radius:999px;padding:8px 11px;cursor:pointer;font-size:12px;font-weight:750;transition:.15s ease}
    .temp-filter-btn:hover{border-color:#4e7884;color:#e5f2f3}
    .temp-filter-btn[aria-pressed="true"]{background:#17343e;border-color:#5b8e9b;color:#fff}
    .temp-filter-dot{width:9px;height:9px;border-radius:50%;display:inline-block;box-shadow:0 0 12px currentColor}
    @media(max-width:1000px){.monitor-summary{grid-template-columns:1fr 1fr}.monitor-head{align-items:flex-start;flex-direction:column}.monitor-actions{justify-content:flex-start}.primary-monitor-panel .chart.xlarge{height:380px}}
    @media(max-width:680px){.station-hero-grid{grid-template-columns:1fr}.sensor-details-grid{grid-template-columns:1fr}.monitor-summary{grid-template-columns:1fr 1fr}.primary-monitor-panel .chart.xlarge{height:330px}}
  `;
  document.head.appendChild(css);

  const hero = document.querySelector('.station-hero-grid');
  if (hero) hero.insertAdjacentHTML('afterbegin',
    '<article class="station-hero extra-station" style="--accent:#d9b873">' +
      '<div class="station-heading"><span class="station-dot" style="background:#d9b873"></span><div>' +
      '<strong>Rock Moisture (experimental phase)</strong><small>RAK4631 · Firmware V4 · !77788479 · raw ADC10</small></div></div>' +
      '<div class="extra-reading" id="soilMoisture">—</div><div class="extra-secondary" id="soilAdc">ADC —</div>' +
      '<div class="station-meta"><span id="soilUpdated">Waiting for readings</span><span id="soilHeroBattery">Battery —</span></div><div class="station-state offline" id="soilState">No readings yet</div></article>');

  function renderSoilChart(target=document.getElementById('soilMoistureChart')){
    if(!target)return;
    const moisturePoints=rockHourlyRows().map(r=>({
      x:new Date(r.observed_at).getTime(),
      y:Number(metric(r,'soil_adc10')),
      iso:r.observed_at,
      firmwarePct:metric(r,'soil_moisture_percent')
    })).reverse();
    const interpolationSeries=rockMoistureInterpolationSeries(moisturePoints);
    const tempPoints=rockTemperatureRows().map(r=>({
      x:new Date(r.observed_at).getTime(),
      y:tempF(r),
      iso:r.observed_at,
      tempSource:r.rock_temp_source||'Rock temperature'
    })).reverse();

    renderLineChart(target,[
      {name:'Measured rock moisture',color:EXTRA.soil.color,points:moisturePoints,maxGapMs:90*60*1000,strokeWidth:3.5,pointRadius:3.4},
      ...interpolationSeries,
      {name:'Rock temperature',color:EXTRA.rockTemp.color,points:tempPoints,maxGapMs:100*60*1000,axis:'right',strokeWidth:2.3,pointRadius:2.4}
    ],{
      axisLabel:'ADC10 · lower = wetter',
      rightAxisLabel:'Rock temperature °F',
      rightAxisColor:EXTRA.rockTemp.color,
      yFormat:v=>Math.round(v).toString(),
      rightYFormat:v=>v.toFixed(0)+'°',
      tooltipValue:(v,p,series)=>{
        if(series?.axis==='right') return v.toFixed(1)+' °F · '+(p?.tempSource||'rock temperature');
        if(series?.name==='Interpolated moisture gap') return 'Estimated ADC10 '+Math.round(v)+' · linear interpolation';
        return 'ADC10 '+Math.round(v)+(p?.firmwarePct!=null?' · firmware soil index '+Math.round(Number(p.firmwarePct))+'%':'');
      },
      bands:ROCK_PRECIP_BANDS,
      empty:'Waiting for rock-moisture telemetry.'
    });

    const gapCount=interpolationSeries.length;
    setText('soilChartCount',moisturePoints.length
      ? moisturePoints.length+' measured moisture · '+tempPoints.length+' temperature · '+gapCount+' interpolated gap'+(gapCount===1?'':'s')
      : 'Waiting for rock-moisture readings');
  }


  function openExpanded(titleText,renderer,sourceId){
    const dialog=document.getElementById('expandDialog'),title=document.getElementById('expandTitle'),chart=document.getElementById('expandedChart'),mapEl=document.getElementById('expandedMap');
    if(!dialog||!title||!chart||!mapEl)return;
    title.textContent=titleText;mapEl.hidden=true;chart.hidden=false;chart.dataset.rangeSource=sourceId||'';dialog.showModal();
    setTimeout(()=>renderer(chart),40);
  }

  document.getElementById('soilChartExpand')?.addEventListener('click',()=>openExpanded('Rock Moisture (experimental phase) + Rain',renderSoilChart,'soilMoistureChart'));

  const earlierSummary = renderSummary;
  renderSummary = function() {
    earlierSummary();
    const sm = soilRows()[0] || null;
    const rockTemp = rockTemperatureRows()[0] || null;
    const soilDevice = deviceRows(EXTRA.soil.node)[0] || null;

    setText('soilMoisture', sm && metric(sm, 'soil_adc10') != null ? 'ADC10 ' + metric(sm, 'soil_adc10') : '—');
    setText('soilAdc', sm && metric(sm, 'soil_adc10') != null ? 'ADC10 ' + metric(sm, 'soil_adc10') : 'ADC —');
    setText('soilUpdated', freshness(sm));
    setText('soilHeroBattery', cardBatteryText(soilDevice));
    addStatus(document.getElementById('soilState'), sm);


    setText('soilMoistureDetail', sm && metric(sm, 'soil_adc10') != null ? String(metric(sm, 'soil_adc10')) : '—');
    setText('soilAdcDetail', rockTemp ? tempF(rockTemp).toFixed(1) + ' °F' : '—');
    setText('soilConditionDetail', sm && metric(sm, 'soil_moisture_percent') != null ? Math.round(Number(metric(sm, 'soil_moisture_percent'))) + '%' : '—');
    setText('soilAgeDetail', sm ? ageText(sm.observed_at) : '—');
    setText('soilMoistureTime', freshness(sm));

    renderSoilChart();

    const tempStations = airTemperatureStations().map(s => ({
      name:s.name, reading:s.rows[0] || null
    })).filter(s => s.reading && ageHours(s.reading.observed_at) <= STALE_AFTER_HOURS);

    if (tempStations.length >= 2) {
      const sorted = tempStations.map(s => ({name:s.name,value:tempF(s.reading)})).sort((a,b)=>a.value-b.value);
      setText('tempSpread',(sorted[sorted.length-1].value-sorted[0].value).toFixed(1)+'°F');
      setText('tempSpreadDetail',sorted[0].name+' → '+sorted[sorted.length-1].name);
      setText('warmestStation',sorted[sorted.length-1].name);
      setText('warmestDetail',sorted[sorted.length-1].value.toFixed(1)+'°F now');
    } else {
      setText('tempSpread','—');
      setText('tempSpreadDetail','Need two current temperatures');
      setText('warmestStation',tempStations.length ? tempStations[0].name : '—');
      setText('warmestDetail',tempStations.length ? 'Only station currently reporting' : 'Waiting for temperatures');
    }

    const active = tempStations
      .concat(sm && ageHours(sm.observed_at) <= STALE_AFTER_HOURS ? [{name:EXTRA.soil.name,reading:sm}] : [])
    if (active.length) {
      const freshest = active.sort((a,b)=>new Date(b.reading.observed_at)-new Date(a.reading.observed_at))[0];
      setText('freshestStation',freshest.name);
      setText('freshestDetail',ageText(freshest.reading.observed_at));
    } else {
      setText('freshestStation','—');
      setText('freshestDetail','No current station readings');
    }

    const healthy = tempStations.length +
      (sm && ageHours(sm.observed_at) <= STALE_AFTER_HOURS ? 1 : 0);
    setText('stationsReporting',healthy+' / 6');
    const n=document.getElementById('networkStatus');
    if(n){
      n.className='live-pill '+(healthy===6?'online':healthy?'partial':'offline');
      setText('networkStatusText',healthy===6?'All 6 stations reporting':healthy?healthy+' of 6 stations reporting':'No current station telemetry');
    }
  };

  function airTemperatureStations() {
    const stations = Object.values(STATIONS).map(s => ({
      node:Number(s.node),name:s.name,color:s.color,rows:temperatureRows(s.node)
    }));
    return stations.filter((s,index,all) => Number.isFinite(s.node) &&
      all.findIndex(other => other.node === s.node) === index);
  }

  function renderAirTemperatureFilters() {
    const filter = document.getElementById('airTempStationFilter') ||
      document.querySelector('.temp-comparison-panel .legend');
    if (!filter) return;
    const stations = airTemperatureStations();
    filter.classList.add('temp-station-filter');
    filter.innerHTML = stations.map(s =>
      '<button type="button" class="temp-filter-btn" data-air-node="' + s.node +
      '" aria-pressed="' + (selectedAirTemperatureNodes.has(s.node) ? 'true' : 'false') + '">' +
      '<i class="temp-filter-dot" style="background:' + esc(s.color || '#8aa7ad') + '"></i>' +
      esc(s.name) + '</button>'
    ).join('');
    filter.querySelectorAll('[data-air-node]').forEach(button => button.addEventListener('click', () => {
      const node = Number(button.dataset.airNode);
      if (selectedAirTemperatureNodes.has(node)) selectedAirTemperatureNodes.delete(node);
      else selectedAirTemperatureNodes.add(node);
      button.setAttribute('aria-pressed', selectedAirTemperatureNodes.has(node) ? 'true' : 'false');
      renderTemperatureChart();
      const dialog = document.getElementById('expandDialog');
      const title = document.getElementById('expandTitle');
      const expanded = document.getElementById('expandedChart');
      if (dialog?.open && expanded && title?.textContent === 'Air temperature') renderTemperatureChart(expanded);
    }));
  }

  renderTemperatureChart = function(target = document.getElementById('tempChart')) {
    if (!target) return;
    const selected = airTemperatureStations().filter(s => selectedAirTemperatureNodes.has(s.node));
    renderLineChart(target,selected.map(s => ({
      name:s.name,color:s.color,points:s.rows.map(r => ({
        x:new Date(r.observed_at).getTime(),y:tempF(r),iso:r.observed_at
      }))
    })),{axisLabel:'Air temperature °F',tooltipValue:v=>v.toFixed(1)+' °F',
      strokeWidth:3.3,pointRadius:3.5,
      empty:selected.length ? 'Waiting for air-temperature telemetry.' : 'Select at least one air-temperature station.'});
    setText('tempChartCount',selected.length
      ? selected.map(s=>s.rows.length+' '+s.name).join(' · ')+' air-temperature readings'
      : 'No air-temperature stations selected');
  };

  renderRecent = function() {
    const airStations = airTemperatureStations();
    const names = new Map(airStations.map(s=>[s.node,s.name]));
    const rows = state.readings.filter(r => names.has(Number(r.node_num)) && hasTemperature(r))
      .sort(byTime).slice(0,50);
    const tbody=document.getElementById('recent');
    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML='<tr><td colspan="6">Waiting for air-temperature telemetry.</td></tr>';
      return;
    }
    tbody.innerHTML=rows.map(r => {
      const remote=Number(r.node_num)!==STATIONS.home.node;
      const rv=remote?rssi(r):null,sv=remote?snr(r):null,h=remote?hops(r):null;
      return '<tr><td>'+esc(fmtTime(r.observed_at))+'</td><td>'+esc(names.get(Number(r.node_num)))+
        '</td><td class="right">'+tempF(r).toFixed(1)+'</td><td class="right">'+
        (rv===null?'—':Math.round(rv))+'</td><td class="right">'+
        (sv===null?'—':sv.toFixed(1))+'</td><td class="right">'+
        (h===null?'—':Math.round(h))+'</td></tr>';
    }).join('');
  };

  const recentDescription = document.querySelector('.recent-panel .panel-head p');
  if (recentDescription) recentDescription.textContent =
    'Air-temperature history from monitored air stations.';
  renderAirTemperatureFilters();
  document.querySelectorAll('.station-hero .station-heading').forEach(heading => {
    const name = heading.querySelector('strong')?.textContent?.trim();
    const small = heading.querySelector('small');
    if (!small || !name || name === 'Rock Moisture') return;
    if (!/air temperature/i.test(small.textContent) && ['Hidden Valley','Moab','Fishlake Hightop',"Pack Creek"].includes(name)) {
      small.textContent += ' · air temperature';
    }
  });
  const footer = document.querySelector('footer > span:first-child');
  if (footer) footer.textContent =
    'Meshtastic environmental network · Hidden Valley · Rock Moisture · Moab · Fishlake · Pack Creek';
  document.querySelectorAll('.path-note span').forEach(el => {
    if (el.textContent.includes('synchronized cloud batch'))
      el.textContent = el.textContent.replace('synchronized cloud batch','HTTPS ingest');
    if (el.textContent.includes('Home reading flushes held permanent-station data'))
      el.textContent = 'Local HOBO temperature → Heltec BLE → immediate HTTPS ingest to Vercel / Neon';
    if (el.textContent.includes('70 min safety fallback'))
      el.textContent = el.textContent.replace('70 min safety fallback','immediate HTTPS forwarding');
  });
  const mapDescription = document.querySelector('.map-panel .panel-head p');
  if (mapDescription) mapDescription.textContent =
    'Mapped locations are shown where coordinates are confirmed. Rock Moisture is not positioned until its site coordinates are supplied.';

  // The original five-station scripts load on startup before this extension.
  // Refresh once so the added stations render immediately with the same API data.
  loadData();
})();

