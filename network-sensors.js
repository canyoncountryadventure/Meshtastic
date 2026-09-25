/* Additional production sensor nodes. Identity and labels live here, not in the Heltec. */
(() => {
  'use strict';

  const EXTRA = {
    pack: { node: 4241345683, name: 'Pack Creek', id: '!fccdcc93', color: '#66b9ff' },
    soil: { node: 2004386937, name: 'Wingate Moisture', id: '!77788479', color: '#d9b873' },
    cliff: { node: 3388602087, name: 'Cliff Sensor', id: '!c9f9f6e7', color: '#c3a0fb' },
  };
  const TEMPERATURE_TYPES = new Set(['environment', 'mx2001']);
  const sameNode = (r, node) => Number(r && r.node_num) === node;
  const byTime = (a, b) => new Date(b.observed_at) - new Date(a.observed_at);
  const rowsFor = node => state.readings.filter(r => sameNode(r, node)).sort(byTime);
  const hasTemperature = r => r && TEMPERATURE_TYPES.has(r.telemetry_type) && tempF(r) !== null;
  const temperatureRows = node => rowsFor(node).filter(hasTemperature);
  const packTemperatureRows = () => rowsFor(EXTRA.pack.node).filter(r =>
    r.telemetry_type === 'mx2001' && tempF(r) !== null);
  const soilRows = () => rowsFor(EXTRA.soil.node).filter(r => r.telemetry_type === 'soil' &&
    Number.isFinite(Number(metric(r, 'soil_moisture_percent'))));
  const stageRows = () => rowsFor(EXTRA.pack.node).filter(r =>
    r.telemetry_type === 'water_distance' &&
    Number.isFinite(Number(metric(r, 'water_level_ft'))) &&
    metric(r, 'water_level_ft') !== null &&
    metric(r, 'stage_calibrated') !== false);
  const hoboStageRows = () => rowsFor(EXTRA.pack.node).filter(r =>
    r.telemetry_type === 'mx2001' &&
    Number.isFinite(Number(metric(r, 'water_level_ft'))) &&
    metric(r, 'water_level_ft') !== null);
  const asPercent = r => r ? Math.round(Number(metric(r, 'soil_moisture_percent'))) + '%' : '—';
  const asStage = r => r ? Number(metric(r, 'water_level_ft')).toFixed(2) + ' ft' : '—';
  const asDischarge = r => r && Number.isFinite(Number(r.discharge_cfs)) ?
    Number(r.discharge_cfs).toFixed(2) + ' cfs' : '—';
  const asTemp = r => r ? tempF(r).toFixed(1) + ' °F' : '—';
  const freshness = r => r ? 'Updated ' + ageText(r.observed_at) : 'Waiting for readings';
  const addStatus = (el, r, requirementsMet = true) => {
    if (!el) return;
    const fresh = r && ageHours(r.observed_at) <= STALE_AFTER_HOURS;
    el.className = 'station-state ' + (fresh && requirementsMet ? 'online' : r ? 'stale' : 'offline');
    el.textContent = !r ? 'No readings yet' : !requirementsMet ? 'Awaiting current temperature and stage' :
      fresh ? 'Reporting normally' : 'Stale · ' + ageText(r.observed_at);
  };

  const css = document.createElement('style');
  css.textContent =
    '.station-hero-grid{grid-template-columns:repeat(auto-fit,minmax(215px,1fr))}' +
    '.extra-station{border-top:3px solid var(--accent,#66b9ff)}' +
    '.extra-reading{font-size:clamp(35px,4vw,60px);font-weight:800;letter-spacing:-.04em;margin:12px 0 8px}' +
    '.extra-secondary{font-size:15px;color:#c1d7df;margin-bottom:10px}' +
    '.extra-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-top:16px}' +
    '.extra-metric{padding:18px;border:1px solid var(--line);border-radius:14px;background:#0c2029}' +
    '.extra-metric h3{font-size:17px;margin:0 0 8px}.extra-metric strong{font-size:32px}' +
    '.extra-metric p{color:var(--muted);font-size:13px;margin:8px 0}' +
    '.extra-chart{height:240px;margin-top:12px;position:relative;overflow:hidden}' +
    '.sensor-details{margin-top:14px;border-top:1px solid var(--line);padding-top:10px}' +
    '.sensor-details summary{cursor:pointer;color:#bcd2da;font-size:13px;font-weight:700;list-style:none}' +
    '.sensor-details summary::-webkit-details-marker{display:none}' +
    '.sensor-details summary:after{content:" +";color:var(--muted)}' +
    '.sensor-details[open] summary:after{content:" −"}' +
    '.sensor-details-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}' +
    '.sensor-details-block{background:#0a1b23;border:1px solid var(--line);border-radius:10px;padding:11px}' +
    '.sensor-details-block strong{display:block;font-size:13px;margin-bottom:8px}' +
    '.sensor-details-row{display:flex;justify-content:space-between;gap:12px;font-size:12px;color:var(--muted);margin:5px 0}' +
    '.sensor-details-row b{color:#dcebef;font-weight:700;text-align:right}' +
    '.sensor-comparison{grid-column:1/-1}' +
    '@media(max-width:680px){.station-hero-grid{grid-template-columns:1fr}.extra-grid{grid-template-columns:1fr}.sensor-details-grid{grid-template-columns:1fr}}';
  document.head.appendChild(css);

  const hero = document.querySelector('.station-hero-grid');
  if (hero) hero.insertAdjacentHTML('beforeend',
    '<article class="station-hero extra-station" style="--accent:#66b9ff">' +
      '<div class="station-heading"><span class="station-dot" style="background:#66b9ff"></span><div>' +
      '<strong>Pack Creek</strong><small>PC1 · !fccdcc93 · temperature and stage</small></div></div>' +
      '<div class="extra-reading" id="packTemp">—</div><div class="extra-secondary">Water level: <strong id="packStage">—</strong> · Flow: <strong id="packFlow">—</strong> <span style="color:var(--muted);font-size:12px">SEN0313</span></div>' +
      '<div class="station-meta" id="packUpdated">Waiting for readings</div><div class="station-state offline" id="packState">No readings yet</div>' +
      '<details class="sensor-details"><summary>Sensor details</summary><div class="sensor-details-grid">' +
        '<div class="sensor-details-block"><strong>Primary Stage Sensor — SEN0313</strong>' +
          '<div class="sensor-details-row"><span>Stage</span><b id="packDetailStage">—</b></div>' +
          '<div class="sensor-details-row"><span>Distance</span><b id="packDetailDistance">—</b></div>' +
          '<div class="sensor-details-row"><span>Status</span><b id="packDetailCal">—</b></div></div>' +
        '<div class="sensor-details-block"><strong>HOBO MX2001</strong>' +
          '<div class="sensor-details-row"><span>Temperature</span><b id="packDetailTemp">—</b></div>' +
          '<div class="sensor-details-row"><span>Stage</span><b id="packDetailHoboStage">—</b></div>' +
          '<div class="sensor-details-row"><span>BLE RSSI</span><b id="packDetailBle">—</b></div></div>' +
        '<div class="sensor-details-block sensor-comparison"><strong>Sensor Comparison</strong>' +
          '<div class="sensor-details-row"><span>Stage difference</span><b id="packDetailDifference">—</b></div></div>' +
      '</div></details></article>' +
    '<article class="station-hero extra-station" style="--accent:#d9b873">' +
      '<div class="station-heading"><span class="station-dot" style="background:#d9b873"></span><div>' +
      '<strong>Wingate Moisture</strong><small>Soil · !77788479 · soil moisture only</small></div></div>' +
      '<div class="extra-reading" id="soilMoisture">—</div><div class="extra-secondary" id="soilAdc">ADC —</div>' +
      '<div class="station-meta" id="soilUpdated">Waiting for readings</div><div class="station-state offline" id="soilState">No readings yet</div></article>' +
    '<article class="station-hero extra-station" style="--accent:#c3a0fb">' +
      '<div class="station-heading"><span class="station-dot" style="background:#c3a0fb"></span><div>' +
      '<strong>Cliff Sensor</strong><small>CCAT · !c9f9f6e7 · temperature</small></div></div>' +
      '<div class="extra-reading" id="cliffTemp">—</div><div class="extra-secondary">HOBO temperature</div>' +
      '<div class="station-meta" id="cliffUpdated">Waiting for readings</div><div class="station-state offline" id="cliffState">No readings yet</div></article>');

  const detail = document.querySelector('.station-detail-grid');
  if (detail) detail.insertAdjacentHTML('afterend',
    '<section class="panel" id="extraSensorPanel" style="margin-top:16px">' +
      '<div class="panel-head"><div><h2>Creek stage and soil moisture</h2>' +
      '<p>Live values and selected-window history; unavailable or uncalibrated stage is not shown as zero.</p></div></div>' +
      '<div class="extra-grid">' +
        '<article class="extra-metric"><h3>Pack Creek · stage and discharge</h3><strong id="packStageDetail">—</strong>' +
          '<div class="extra-secondary">Flow: <strong id="packFlowDetail">—</strong></div>' +
          '<p id="packStageTime">Waiting for calibrated stage</p><div class="extra-chart chart" id="packStageChart"></div></article>' +
        '<article class="extra-metric"><h3>Wingate Moisture · soil moisture</h3><strong id="soilMoistureDetail">—</strong>' +
          '<p id="soilMoistureTime">Waiting for soil readings</p><div class="extra-chart chart" id="soilMoistureChart"></div></article>' +
        '<article class="extra-metric"><h3>Cliff Sensor · temperature</h3><strong id="cliffTempDetail">—</strong>' +
          '<p id="cliffTempTime">Waiting for temperature</p><div class="extra-chart chart" id="cliffTempChart"></div></article>' +
      '</div></section>');

  // Existing scripts implement the five earlier stations; keep their graphs and
  // add only the new data families here, using the same /api/readings history.
  const earlierSummary = renderSummary;
  renderSummary = function() {
    earlierSummary();
    const pt = packTemperatureRows()[0] || null;
    const ps = stageRows()[0] || null;
    const hs = hoboStageRows()[0] || null;
    const sm = soilRows()[0] || null;
    const ct = temperatureRows(EXTRA.cliff.node)[0] || null;
    setText('packTemp', asTemp(pt));
    setText('packStage', asStage(ps));
    setText('packFlow', asDischarge(ps));
    setText('packUpdated', pt && ps ? 'Temp ' + ageText(pt.observed_at) + ' · Stage ' + ageText(ps.observed_at) : freshness(pt || ps));
    addStatus(document.getElementById('packState'), pt || ps, Boolean(pt && ps &&
      ageHours(pt.observed_at) <= STALE_AFTER_HOURS && ageHours(ps.observed_at) <= STALE_AFTER_HOURS));
    setText('soilMoisture', asPercent(sm));
    setText('soilAdc', sm && metric(sm, 'soil_adc10') != null ? 'ADC10 ' + metric(sm, 'soil_adc10') : 'ADC —');
    setText('soilUpdated', freshness(sm));
    addStatus(document.getElementById('soilState'), sm);
    setText('cliffTemp', asTemp(ct));
    setText('cliffUpdated', freshness(ct));
    addStatus(document.getElementById('cliffState'), ct);

    setText('packStageDetail', asStage(ps));
    setText('packFlowDetail', asDischarge(ps));
    setText('packStageTime', ps ? freshness(ps) + ' · authoritative SEN0313 stage' : 'Waiting for calibrated SEN0313 stage');
    setText('packDetailStage', asStage(ps));
    setText('packDetailDistance', ps && Number.isFinite(Number(metric(ps, 'distance_mm'))) ?
      (Number(metric(ps, 'distance_mm')) / 304.8).toFixed(2) + ' ft' : '—');
    setText('packDetailCal', ps ? (metric(ps, 'stage_calibrated') === false ? 'Not calibrated' : 'Calibrated') : '—');
    setText('packDetailTemp', asTemp(pt));
    setText('packDetailHoboStage', asStage(hs));
    setText('packDetailBle', hs && Number.isFinite(Number(metric(hs, 'ble_rssi_dbm'))) ?
      Math.round(Number(metric(hs, 'ble_rssi_dbm'))) + ' dBm' : '—');
    const primaryStage = ps ? Number(metric(ps, 'water_level_ft')) : null;
    const hoboStage = hs ? Number(metric(hs, 'water_level_ft')) : null;
    setText('packDetailDifference', Number.isFinite(primaryStage) && Number.isFinite(hoboStage) ?
      Math.abs(primaryStage - hoboStage).toFixed(2) + ' ft' : '—');
    setText('soilMoistureDetail', asPercent(sm));
    setText('soilMoistureTime', freshness(sm));
    setText('cliffTempDetail', asTemp(ct));
    setText('cliffTempTime', freshness(ct));
    const stage = stageRows().map(r => ({x:new Date(r.observed_at).getTime(),
      y:Number(metric(r,'water_level_ft')),iso:r.observed_at}));
    const soil = soilRows().map(r => ({x:new Date(r.observed_at).getTime(),
      y:Number(metric(r,'soil_moisture_percent')),iso:r.observed_at}));
    const cliff = temperatureRows(EXTRA.cliff.node).map(r => ({x:new Date(r.observed_at).getTime(),
      y:tempF(r),iso:r.observed_at}));
    const packChart = document.getElementById('packStageChart');
    const soilChart = document.getElementById('soilMoistureChart');
    const cliffChart = document.getElementById('cliffTempChart');
    if (packChart) renderLineChart(packChart,[{name:'Pack Creek stage',color:EXTRA.pack.color,points:stage}],
      {axisLabel:'Water level (ft)',empty:'Waiting for calibrated water level.'});
    if (soilChart) renderLineChart(soilChart,[{name:'Wingate moisture',color:EXTRA.soil.color,points:soil}],
      {axisLabel:'Soil moisture (%)',empty:'Waiting for soil readings.'});
    if (cliffChart) renderLineChart(cliffChart,[{name:'Cliff temperature',color:EXTRA.cliff.color,points:cliff}],
      {axisLabel:'Temperature (°F)',empty:'Waiting for temperature.'});

    const main = Object.values(STATIONS).map(s => ({
      name:s.name, reading:temperatureRows(s.node)[0] || null
    }));
    const tempStations = main.concat([
      {name:EXTRA.pack.name,reading:pt},{name:EXTRA.cliff.name,reading:ct}
    ]).filter(s => s.reading && ageHours(s.reading.observed_at) <= STALE_AFTER_HOURS);
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
    const active = tempStations.concat(sm && ageHours(sm.observed_at) <= STALE_AFTER_HOURS ?
      [{name:EXTRA.soil.name,reading:sm}] : []);
    if (active.length) {
      const freshest = active.sort((a,b)=>new Date(b.reading.observed_at)-new Date(a.reading.observed_at))[0];
      setText('freshestStation',freshest.name);
      setText('freshestDetail',ageText(freshest.reading.observed_at));
    } else {
      setText('freshestStation','—');
      setText('freshestDetail','No current station readings');
    }
    // Pack Creek requires both temperature and stage for its complete station status.
    const goodPack = pt && ps && ageHours(pt.observed_at) <= STALE_AFTER_HOURS &&
      ageHours(ps.observed_at) <= STALE_AFTER_HOURS;
    const healthy = Object.values(STATIONS).filter(s => {
      const latest=temperatureRows(s.node)[0];
      return latest && ageHours(latest.observed_at) <= STALE_AFTER_HOURS;
    }).length + (goodPack ? 1 : 0) +
      (sm && ageHours(sm.observed_at) <= STALE_AFTER_HOURS ? 1 : 0) +
      (ct && ageHours(ct.observed_at) <= STALE_AFTER_HOURS ? 1 : 0);
    setText('stationsReporting',healthy+' / 8');
    const n=document.getElementById('networkStatus');
    if(n){
      n.className='live-pill '+(healthy===8?'online':healthy?'partial':'offline');
      setText('networkStatusText',healthy===8?'All 8 stations reporting':healthy?healthy+' of 8 stations reporting':'No current station telemetry');
    }
  };

  renderTemperatureChart = function(target = document.getElementById('tempChart')) {
    if (!target) return;
    const stations = Object.values(STATIONS).map(s => ({
      name:s.name,color:s.color,rows:temperatureRows(s.node)
    })).concat([
      {name:EXTRA.pack.name,color:EXTRA.pack.color,rows:packTemperatureRows()},
      {name:EXTRA.cliff.name,color:EXTRA.cliff.color,rows:temperatureRows(EXTRA.cliff.node)}
    ]);
    renderLineChart(target,stations.map(s => ({
      name:s.name,color:s.color,points:s.rows.map(r => ({
        x:new Date(r.observed_at).getTime(),y:tempF(r),iso:r.observed_at
      }))
    })),{axisLabel:'Temperature °F',tooltipValue:v=>v.toFixed(1)+' °F',
      strokeWidth:3.3,pointRadius:3.5,empty:'Waiting for temperature telemetry.'});
    setText('tempChartCount',stations.map(s=>s.rows.length+' '+s.name).join(' · ')+' readings');
  };

  renderRecent = function() {
    const names = new Map(Object.values(STATIONS).map(s=>[s.node,s.name]));
    names.set(EXTRA.pack.node,EXTRA.pack.name);
    names.set(EXTRA.cliff.node,EXTRA.cliff.name);
    const rows = state.readings.filter(r => names.has(Number(r.node_num)) && hasTemperature(r) &&
      (Number(r.node_num) !== EXTRA.pack.node || r.telemetry_type === 'mx2001'))
      .sort(byTime).slice(0,50);
    const tbody=document.getElementById('recent');
    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML='<tr><td colspan="8">Waiting for temperature telemetry.</td></tr>';
      return;
    }
    tbody.innerHTML=rows.map(r => {
      const remote=Number(r.node_num)!==STATIONS.home.node;
      const p=remote?batteryPct(r):null,v=remote?batteryV(r):null;
      const rv=remote?rssi(r):null,sv=remote?snr(r):null,h=remote?hops(r):null;
      return '<tr><td>'+esc(fmtTime(r.observed_at))+'</td><td>'+esc(names.get(Number(r.node_num)))+
        '</td><td class="right">'+tempF(r).toFixed(1)+'</td><td class="right">'+
        (p===null?'—':Math.round(p)+'%')+'</td><td class="right">'+
        (v===null?'—':v.toFixed(3))+'</td><td class="right">'+
        (rv===null?'—':Math.round(rv))+'</td><td class="right">'+
        (sv===null?'—':sv.toFixed(1))+'</td><td class="right">'+
        (h===null?'—':Math.round(h))+'</td></tr>';
    }).join('');
  };

  const recentDescription = document.querySelector('.recent-panel .panel-head p');
  if (recentDescription) recentDescription.textContent =
    'Temperature history from seven stations. Creek stage and Wingate soil moisture appear in their dedicated graphs.';
  const legend = document.querySelector('.temp-comparison-panel .legend');
  if (legend) legend.insertAdjacentHTML('beforeend',
    '<span><i class="legend-swatch" style="background:#66b9ff"></i>Pack Creek</span>' +
    '<span><i class="legend-swatch" style="background:#c3a0fb"></i>Cliff Sensor</span>');
  const footer = document.querySelector('footer > span:first-child');
  if (footer) footer.textContent =
    'Meshtastic environmental network · Hidden Valley · Pack Creek · Wingate Moisture · Cliff Sensor · Moab · Fishlake · Swell · Thousand Lake Mountain';
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
    'Mapped locations are shown where coordinates are confirmed. Pack Creek, Wingate Moisture and Cliff Sensor are not positioned until their site coordinates are supplied.';

  // The original five-station scripts load on startup before this extension.
  // Refresh once so the added stations render immediately with the same API data.
  loadData();
})();
