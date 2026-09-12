(() => {
  const SEED = {
    node: 2650172798,
    id: '!9df66d7e',
    name: 'Thousand Lake Mountain',
    fullName: 'Thousand Lake Mountain',
    short: 'TLRP',
    color: '#f5d05f',
    coords: [38.52008, -111.48206],
    elevationFt: 10600,
    battery: true,
  };

  STATIONS.seed = SEED;

  const style = document.createElement('style');
  style.textContent = `
    :root{--seed:#f5d05f;--seed-soft:rgba(245,208,95,.14)}
    .station-hero-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
    .seed-card{border-color:rgba(245,208,95,.44);background:linear-gradient(160deg,rgba(245,208,95,.16),rgba(13,34,42,.95) 55%)}
    .seed-card:after{background:var(--seed)}
    .station-dot.seed,.legend-swatch.seed{background:var(--seed);box-shadow:0 0 18px rgba(245,208,95,.68)}
    .seed-detail,.seed-battery-panel{border-color:rgba(245,208,95,.3)}
    .station-badge.seed{background:var(--seed-soft);color:#ffedaf}
    @media(max-width:1000px){.station-hero-grid{grid-template-columns:1fr 1fr}}
    @media(max-width:680px){.station-hero-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  const heroGrid = document.querySelector('.station-hero-grid');
  if (heroGrid && !document.getElementById('seedTemp')) {
    heroGrid.insertAdjacentHTML('beforeend', `
      <article class="station-hero seed-card">
        <div class="station-heading"><span class="station-dot seed"></span><div><strong>Thousand Lake Mountain</strong><small>XIAO nRF52 Kit · TLRP · !9df66d7e</small></div></div>
        <div class="big-temp"><span id="seedTemp">—</span><small>°F</small></div>
        <div class="station-meta"><span id="seedUpdated">Waiting for temperature</span><span id="seedHeroBattery">Battery —</span></div>
        <div class="station-state offline" id="seedState">No temperature yet</div>
      </article>`);
  }

  const detailGrid = document.querySelector('.station-detail-grid');
  if (detailGrid && !document.getElementById('seedHigh')) {
    detailGrid.insertAdjacentHTML('beforeend', `
      <article class="panel station-detail seed-detail">
        <div class="panel-head station-panel-head"><div><span class="eyebrow">Remote mesh station</span><h2>Thousand Lake Mountain</h2><p>38.52008, -111.48206 · 10,600 ft · XIAO nRF52840 + Wio-SX1262 · Temperature Sensor</p></div><span class="station-badge seed">TLRP</span></div>
        <div class="detail-metrics">
          <div><span>24h high</span><strong id="seedHigh">—</strong></div>
          <div><span>24h low</span><strong id="seedLow">—</strong></div>
          <div><span>24h average</span><strong id="seedAvg">—</strong></div>
          <div><span>12h trend</span><strong id="seedTrend">—</strong><small id="seedTrendDetail">—</small></div>
          <div><span>Packet reliability</span><strong id="seedReliability">—</strong><small id="seedReliabilityDetail">—</small></div>
          <div><span>Longest gap</span><strong id="seedGap">—</strong></div>
        </div>
        <div class="path-note"><strong>Sensor path</strong><span>Temperature Sensor → BLE → Thousand Lake Mountain XIAO → LoRa mesh → Moab → internet</span></div>
      </article>`);
  }

  const chartGrid = document.querySelector('.charts.two-col');
  if (chartGrid && !document.getElementById('seedBatteryChart')) {
    chartGrid.insertAdjacentHTML('beforeend', `
      <article class="panel seed-battery-panel">
        <div class="panel-head"><div><h2>Thousand Lake Mountain battery</h2><p id="seedBatteryChartCount">Battery telemetry pending</p></div><button type="button" class="expand-btn" id="seedBatteryExpand">Expand</button></div>
        <div class="battery-summary">
          <div><span>Latest</span><strong id="seedBatteryNow">—</strong><small id="seedBatteryNowDetail">—</small></div>
          <div><span>Voltage change</span><strong id="seedBatteryChange">—</strong><small id="seedBatteryChangeDetail">selected window</small></div>
          <div><span>Solar activity</span><strong id="seedSolarHours">—</strong><small id="seedSolarDetail">estimated from voltage rise</small></div>
        </div>
        <div class="chart" id="seedBatteryChart"><div class="empty">Waiting for Thousand Lake Mountain battery telemetry.</div></div>
      </article>`);
  }

  const legend = document.querySelector('.temp-comparison-panel .legend');
  if (legend && !legend.querySelector('.legend-swatch.seed')) {
    legend.insertAdjacentHTML('beforeend', '<span><i class="legend-swatch seed"></i>Thousand Lake Mountain</span>');
  }
  const recentText = document.querySelector('.recent-panel .panel-head p');
  if (recentText) recentText.textContent = 'Combined history from all five permanent temperature stations.';
  const mapText = document.querySelector('.map-panel .panel-head p');
  if (mapText) mapText.textContent = "Hidden Valley, Fishlake Hightop, It's a Swell Day, Thousand Lake Mountain, and approximate Moab locations";
  const footer = document.querySelector('footer span:first-child');
  if (footer) footer.textContent = "Meshtastic environmental network · Hidden Valley + Moab + Fishlake Hightop + It's a Swell Day + Thousand Lake Mountain";

  function addSeedMarkerToMainMap() {
    if (!window.L || !state.map || window.__seedMainMapMarker) return;
    const marker = L.circleMarker(SEED.coords, {radius:9,color:'#edf7f6',weight:2,fillColor:SEED.color,fillOpacity:1}).addTo(state.map);
    marker.bindPopup(`<strong>${esc(SEED.fullName)}</strong><br>${SEED.coords[0].toFixed(6)}, ${SEED.coords[1].toFixed(6)}<br>${SEED.elevationFt.toLocaleString()} ft elevation<br><span style="color:#91aab0">Remote station location</span>`);
    window.__seedMainMapMarker = marker;
    const bounds = Object.values(STATIONS).map(station => station?.coords).filter(coords => Array.isArray(coords) && coords.length === 2);
    if (bounds.length) state.map.fitBounds(bounds, {padding:[45,45],maxZoom:12});
    setText('mapStatus', `${state.mapKind === 'sat' ? 'Satellite imagery' : 'USGS topo'} · five station locations`);
    setTimeout(() => state.map?.invalidateSize(true), 100);
  }
  addSeedMarkerToMainMap();

  const previousSetMapKind = setMapKind;
  setMapKind = function(kind, map = state.map) {
    previousSetMapKind(kind, map);
    if (map === state.map) setText('mapStatus', `${kind === 'sat' ? 'Satellite imagery' : 'USGS topo'} · five station locations`);
  };

  const seedRows = () => state.readings.filter(r => num(r?.node_num) === SEED.node);
  const seedTempRows = () => seedRows().filter(r => r.telemetry_type === 'environment' && tempF(r) !== null).sort((a,b) => new Date(b.observed_at) - new Date(a.observed_at));
  const seedLatest = () => seedTempRows()[0] || null;
  const seedDeviceRows = () => seedRows().filter(r => r.telemetry_type === 'device' && (batteryV(r) !== null || batteryPct(r) !== null)).sort((a,b) => new Date(batteryTime(b)) - new Date(batteryTime(a)));

  function fillStats() {
    const rows = seedTempRows();
    const now = Date.now();
    const vals = rows.filter(r => now - new Date(r.observed_at).getTime() <= 86400000).map(tempF).filter(Number.isFinite);
    const sorted = [...rows].sort((a,b) => new Date(a.observed_at) - new Date(b.observed_at));
    let longest = null;
    if (sorted.length > 1) {
      longest = 0;
      for (let i = 1; i < sorted.length; i++) longest = Math.max(longest, (new Date(sorted[i].observed_at) - new Date(sorted[i-1].observed_at)) / 3600000);
    }
    let reliability = null, expected = 0;
    if (sorted.length) {
      const span = (new Date(sorted.at(-1).observed_at) - new Date(sorted[0].observed_at)) / 3600000;
      expected = Math.max(1, Math.floor(span / EXPECTED_INTERVAL_HOURS + .25) + 1);
      reliability = Math.min(100, sorted.length / expected * 100);
    }
    const recent = sorted.filter(r => new Date(r.observed_at).getTime() >= now - 12 * 3600000);
    let trend = null;
    if (recent.length >= 2) {
      const first = recent[0], last = recent.at(-1);
      const hours = (new Date(last.observed_at) - new Date(first.observed_at)) / 3600000;
      if (hours > 0) trend = {delta: tempF(last) - tempF(first), perHour: (tempF(last) - tempF(first)) / hours};
    }
    setText('seedHigh', vals.length ? `${Math.max(...vals).toFixed(1)}°` : '—');
    setText('seedLow', vals.length ? `${Math.min(...vals).toFixed(1)}°` : '—');
    setText('seedAvg', vals.length ? `${mean(vals).toFixed(1)}°` : '—');
    setText('seedTrend', trend ? `${trend.delta >= 0 ? '+' : ''}${trend.delta.toFixed(1)}°` : '—');
    setText('seedTrendDetail', trend ? `${trend.perHour >= 0 ? '+' : ''}${trend.perHour.toFixed(2)}°/hr` : 'need 2 readings in 12h');
    setText('seedReliability', reliability === null ? '—' : `${reliability.toFixed(0)}%`);
    setText('seedReliabilityDetail', sorted.length ? `${sorted.length}/${expected} expected in selected window` : 'no readings');
    setText('seedGap', longest === null ? '—' : `${longest.toFixed(1)} hr`);
  }

  function renderBattery(target = document.getElementById('seedBatteryChart')) {
    if (!target) return;
    const rows = seedDeviceRows();
    const latest = rows[0] || null;
    const p = latest ? batteryPct(latest) : null, v = latest ? batteryV(latest) : null;
    setText('seedBatteryNow', p !== null ? `${Math.round(p)}%` : v !== null ? `${v.toFixed(3)} V` : '—');
    setText('seedBatteryNowDetail', latest ? [v !== null ? `${v.toFixed(3)} V` : null, ageText(batteryTime(latest))].filter(Boolean).join(' · ') : 'battery telemetry pending');
    const volts = rows.filter(r => batteryV(r) !== null).sort((a,b) => new Date(batteryTime(a)) - new Date(batteryTime(b)));
    if (volts.length >= 2) {
      const first = batteryV(volts[0]), last = batteryV(volts.at(-1)), change = last - first;
      setText('seedBatteryChange', `${change >= 0 ? '+' : ''}${change.toFixed(3)} V`);
      setText('seedBatteryChangeDetail', `${first.toFixed(3)} → ${last.toFixed(3)} V`);
    } else {
      setText('seedBatteryChange', '—');
      setText('seedBatteryChangeDetail', 'need 2 voltage samples');
    }
    let solar = 0, rises = 0;
    for (let i = 1; i < volts.length; i++) {
      const hours = (new Date(batteryTime(volts[i])) - new Date(batteryTime(volts[i-1]))) / 3600000;
      if (hours > 0 && hours <= 3 && batteryV(volts[i]) - batteryV(volts[i-1]) >= .002) { solar += hours; rises++; }
    }
    setText('seedSolarHours', volts.length < 2 ? '—' : `${solar.toFixed(1)} hr`);
    setText('seedSolarDetail', volts.length < 2 ? 'need at least 2 readings' : rises ? `${rises} rising-voltage interval${rises === 1 ? '' : 's'}` : 'no clear voltage rise yet');
    setText('seedBatteryChartCount', volts.length ? `${volts.length} voltage samples · Thousand Lake Mountain` : 'Battery telemetry pending');
    renderLineChart(target, [{name:'Thousand Lake Mountain voltage', color:SEED.color, points:volts.map(r => ({x:new Date(batteryTime(r)).getTime(), y:batteryV(r), iso:batteryTime(r)}))}], {axisLabel:'Battery V', tooltipValue:v=>`${v.toFixed(3)} V`, empty:'Waiting for Thousand Lake Mountain battery telemetry.', pointRadius:3});
  }

  document.getElementById('seedBatteryExpand')?.addEventListener('click', () => {
    const dialog = document.getElementById('expandDialog'), title = document.getElementById('expandTitle');
    const chart = document.getElementById('expandedChart'), mapEl = document.getElementById('expandedMap');
    if (!dialog || !title || !chart || !mapEl) return;
    title.textContent = 'Thousand Lake Mountain battery'; mapEl.hidden = true; chart.hidden = false; dialog.showModal();
    setTimeout(() => renderBattery(chart), 40);
  });

  const previousSummary = renderSummary;
  renderSummary = function() {
    previousSummary();
    const reading = seedLatest();
    setText('seedTemp', reading ? tempF(reading).toFixed(1) : '—');
    setText('seedUpdated', reading ? `Updated ${ageText(reading.observed_at)}` : 'Waiting for temperature');
    const stateEl = document.getElementById('seedState');
    if (stateEl) {
      const online = reading && ageHours(reading.observed_at) <= STALE_AFTER_HOURS;
      stateEl.className = `station-state ${online ? 'online' : reading ? 'stale' : 'offline'}`;
      stateEl.textContent = online ? 'Reporting normally' : reading ? `Stale · ${ageText(reading.observed_at)}` : 'No temperature yet';
    }
    const device = seedDeviceRows()[0] || null;
    const p = device ? batteryPct(device) : null, v = device ? batteryV(device) : null;
    setText('seedHeroBattery', p !== null ? `Battery ${Math.round(p)}%` : v !== null ? `${v.toFixed(3)} V` : 'Battery —');
    fillStats(); renderBattery();

    const stations = [
      {station:STATIONS.hv,reading:latestTemp('hv')}, {station:STATIONS.home,reading:latestTemp('home')},
      {station:STATIONS.fl,reading:latestTemp('fl')},
      {station:{name:"It's a Swell Day",node:1949224949},reading:state.readings.filter(r=>num(r?.node_num)===1949224949&&r.telemetry_type==='environment'&&tempF(r)!==null).sort((a,b)=>new Date(b.observed_at)-new Date(a.observed_at))[0]||null},
      {station:SEED,reading},
    ].filter(x=>x.reading);
    if (stations.length >= 2) {
      const ordered = stations.map(x=>({...x,value:tempF(x.reading)})).sort((a,b)=>a.value-b.value), cool=ordered[0], warm=ordered.at(-1);
      setText('tempSpread', `${(warm.value-cool.value).toFixed(1)}°F`); setText('tempSpreadDetail', `${cool.station.name} → ${warm.station.name}`);
      setText('warmestStation', warm.station.name); setText('warmestDetail', `${warm.value.toFixed(1)}°F now`);
    }
    const latests = [...stations].sort((a,b)=>new Date(b.reading.observed_at)-new Date(a.reading.observed_at));
    if (latests.length) { setText('freshestStation', latests[0].station.name); setText('freshestDetail', ageText(latests[0].reading.observed_at)); }
    const healthy = stations.filter(x=>ageHours(x.reading.observed_at)<=STALE_AFTER_HOURS).length;
    setText('stationsReporting', `${healthy} / 5`);
    const n=document.getElementById('networkStatus'); if(n){n.className=`live-pill ${healthy===5?'online':healthy>0?'partial':'offline'}`;setText('networkStatusText',healthy===5?'All 5 stations reporting':healthy>0?`${healthy} of 5 stations reporting`:'No current station telemetry');}
  };

  renderTemperatureChart = function(target = document.getElementById('tempChart')) {
    const series = [
      {name:'Hidden Valley',color:STATIONS.hv.color,rows:tempRows('hv')}, {name:'Moab',color:STATIONS.home.color,rows:tempRows('home')},
      {name:'Fishlake Hightop',color:STATIONS.fl.color,rows:tempRows('fl')},
      {name:"It's a Swell Day",color:'#57b7ff',rows:state.readings.filter(r=>num(r?.node_num)===1949224949&&r.telemetry_type==='environment'&&tempF(r)!==null)},
      {name:'Thousand Lake Mountain',color:SEED.color,rows:seedTempRows()},
    ].map(s=>({...s,points:s.rows.map(r=>({x:new Date(r.observed_at).getTime(),y:tempF(r),iso:r.observed_at}))}));
    renderLineChart(target, series.map(({name,color,points})=>({name,color,points})), {axisLabel:'Temperature °F',tooltipValue:v=>`${v.toFixed(1)} °F`,strokeWidth:3.3,pointRadius:3.5,empty:'Waiting for temperature telemetry.'});
    setText('tempChartCount', series.map(s=>`${s.points.length} ${s.name}`).join(' · ')+' readings');
  };

  renderRecent = function() {
    const stations = new Map([[STATIONS.hv.node,['hv',STATIONS.hv]],[STATIONS.home.node,['home',STATIONS.home]],[STATIONS.fl.node,['fl',STATIONS.fl]],[1949224949,['sw',{name:"It's a Swell Day"}]],[SEED.node,['seed',SEED]]]);
    const rows=state.readings.filter(r=>r.telemetry_type==='environment'&&tempF(r)!==null&&stations.has(num(r.node_num))).sort((a,b)=>new Date(b.observed_at)-new Date(a.observed_at)).slice(0,50);
    const tbody=document.getElementById('recent'); if(!rows.length){tbody.innerHTML='<tr><td colspan="8">Waiting for telemetry.</td></tr>';return;}
    tbody.innerHTML=rows.map(r=>{const [key,station]=stations.get(num(r.node_num)),remote=key!=='home',p=remote?batteryPct(r):null,v=remote?batteryV(r):null,rv=remote?rssi(r):null,sv=remote?snr(r):null,h=remote?hops(r):null;return `<tr><td>${esc(fmtTime(r.observed_at))}</td><td><span class="station-cell"><i class="legend-swatch ${key}"></i>${esc(station.name)}</span></td><td class="right">${tempF(r).toFixed(1)}</td><td class="right">${p===null?'—':Math.round(p)+'%'}</td><td class="right">${v===null?'—':v.toFixed(3)}</td><td class="right">${rv===null?'—':Math.round(rv)}</td><td class="right">${sv===null?'—':sv.toFixed(1)}</td><td class="right">${h===null?'—':Math.round(h)}</td></tr>`;}).join('');
  };

  loadData();
})();
