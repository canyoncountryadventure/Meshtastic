(() => {
  const FISHLAKE = {
    node: 1577197109,
    id: '!5e021e35',
    name: 'Fishlake Hightop',
    short: 'FLHT',
    color: '#b58cff',
    battery: true,
  };

  const style = document.createElement('style');
  style.textContent = `
    :root{--fl:#b58cff;--fl-soft:rgba(181,140,255,.14)}
    .station-hero-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
    .fl-card{border-color:rgba(181,140,255,.42);background:linear-gradient(160deg,rgba(181,140,255,.16),rgba(13,34,42,.95) 55%)}
    .fl-card:after{background:var(--fl)}
    .station-dot.fl,.legend-swatch.fl{background:var(--fl);box-shadow:0 0 18px rgba(181,140,255,.68)}
    .fl-detail{border-color:rgba(181,140,255,.3)}
    .station-badge.fl{background:var(--fl-soft);color:#dcc9ff}
    .station-detail-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
    @media(max-width:1000px){.station-hero-grid{grid-template-columns:1fr 1fr}.station-detail-grid{grid-template-columns:1fr}}
    @media(max-width:680px){.station-hero-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  const heroGrid = document.querySelector('.station-hero-grid');
  if (heroGrid && !document.getElementById('flTemp')) {
    heroGrid.insertAdjacentHTML('beforeend', `
      <article class="station-hero fl-card">
        <div class="station-heading"><span class="station-dot fl"></span><div><strong>Fishlake Hightop</strong><small>RAK4631 · FLHT · !5e021e35</small></div></div>
        <div class="big-temp"><span id="flTemp">—</span><small>°F</small></div>
        <div class="station-meta"><span id="flUpdated">Waiting for temperature</span><span id="flHeroBattery">Battery —</span></div>
        <div class="station-state offline" id="flState">No temperature yet</div>
      </article>`);
  }

  const detailGrid = document.querySelector('.station-detail-grid');
  if (detailGrid && !document.getElementById('flHigh')) {
    detailGrid.insertAdjacentHTML('beforeend', `
      <article class="panel station-detail fl-detail">
        <div class="panel-head station-panel-head"><div><span class="eyebrow">Remote mesh station</span><h2>Fishlake Hightop</h2><p>RAK WisBlock 4631 · deployment coordinates not yet configured</p></div><span class="station-badge fl">FLHT</span></div>
        <div class="detail-metrics">
          <div><span>24h high</span><strong id="flHigh">—</strong></div>
          <div><span>24h low</span><strong id="flLow">—</strong></div>
          <div><span>24h average</span><strong id="flAvg">—</strong></div>
          <div><span>12h trend</span><strong id="flTrend">—</strong><small id="flTrendDetail">—</small></div>
          <div><span>Packet reliability</span><strong id="flReliability">—</strong><small id="flReliabilityDetail">—</small></div>
          <div><span>Longest gap</span><strong id="flGap">—</strong></div>
        </div>
        <div class="path-note"><strong>Sensor path</strong><span>HOBO → BLE → Fishlake Hightop RAK → LoRa mesh → Heltec Home → internet</span></div>
      </article>`);
  }

  const legend = document.querySelector('.temp-comparison-panel .legend');
  if (legend && !legend.querySelector('.legend-swatch.fl')) {
    legend.insertAdjacentHTML('beforeend', '<span><i class="legend-swatch fl"></i>Fishlake Hightop</span>');
  }

  const heroTitle = document.querySelector('.hero-intro h1');
  if (heroTitle) heroTitle.textContent = 'Three permanent temperature stations. One view.';
  const heroText = document.querySelector('.hero-intro p');
  if (heroText) heroText.textContent = 'Hidden Valley and Fishlake Hightop report through the LoRa mesh. Heltec Home reads its local HOBO directly over BLE. All three streams land in Neon and are plotted together here.';
  const reporting = document.getElementById('stationsReporting');
  if (reporting && reporting.textContent.trim() === '0 / 2') reporting.textContent = '0 / 3';
  const mapText = document.querySelector('.map-panel .panel-head p');
  if (mapText) mapText.textContent = 'Hidden Valley and approximate Heltec Home locations · Fishlake coordinates pending';
  const recentText = document.querySelector('.recent-panel .panel-head p');
  if (recentText) recentText.textContent = 'Combined history from all three permanent temperature stations.';
  const footer = document.querySelector('footer span:first-child');
  if (footer) footer.textContent = 'Meshtastic environmental network · Hidden Valley + Heltec Home + Fishlake Hightop · refreshes only on demand to conserve Neon compute';

  const flRows = () => state.readings.filter(r => num(r?.node_num) === FISHLAKE.node);
  const flTempRows = () => flRows().filter(r => tempF(r) !== null && r.telemetry_type === 'environment').sort((a,b) => new Date(b.observed_at) - new Date(a.observed_at));
  const flLatest = () => flTempRows()[0] || null;
  const flDeviceRows = () => flRows().filter(r => batteryV(r) !== null || batteryPct(r) !== null).sort((a,b) => new Date(batteryTime(b)) - new Date(batteryTime(a)));

  function fillFishlakeStats() {
    const rows = flTempRows();
    const now = Date.now();
    const last24 = rows.filter(r => now - new Date(r.observed_at).getTime() <= 86400000);
    const vals = last24.map(tempF).filter(Number.isFinite);
    const sorted = [...rows].sort((a,b) => new Date(a.observed_at) - new Date(b.observed_at));
    let longest = null;
    if (sorted.length > 1) {
      longest = 0;
      for (let i = 1; i < sorted.length; i++) longest = Math.max(longest, (new Date(sorted[i].observed_at) - new Date(sorted[i-1].observed_at)) / 3600000);
    }
    let reliability = null;
    let expected = 0;
    if (sorted.length) {
      const first = new Date(sorted[0].observed_at).getTime();
      const last = new Date(sorted.at(-1).observed_at).getTime();
      expected = Math.max(1, Math.floor(((last - first) / 3600000) / EXPECTED_INTERVAL_HOURS + .25) + 1);
      reliability = Math.min(100, sorted.length / expected * 100);
    }
    const recent = sorted.filter(r => new Date(r.observed_at).getTime() >= now - 12 * 3600000);
    let trend = null;
    if (recent.length >= 2) {
      const a = recent[0], b = recent.at(-1);
      const dt = (new Date(b.observed_at) - new Date(a.observed_at)) / 3600000;
      if (dt > 0) trend = { delta: tempF(b) - tempF(a), perHour: (tempF(b) - tempF(a)) / dt };
    }
    setText('flHigh', vals.length ? `${Math.max(...vals).toFixed(1)}°` : '—');
    setText('flLow', vals.length ? `${Math.min(...vals).toFixed(1)}°` : '—');
    setText('flAvg', vals.length ? `${mean(vals).toFixed(1)}°` : '—');
    setText('flTrend', trend ? `${trend.delta >= 0 ? '+' : ''}${trend.delta.toFixed(1)}°` : '—');
    setText('flTrendDetail', trend ? `${trend.perHour >= 0 ? '+' : ''}${trend.perHour.toFixed(2)}°/hr` : 'need 2 readings in 12h');
    setText('flReliability', reliability === null ? '—' : `${reliability.toFixed(0)}%`);
    setText('flReliabilityDetail', sorted.length ? `${sorted.length}/${expected} expected in selected window` : 'no readings');
    setText('flGap', longest === null ? '—' : `${longest.toFixed(1)} hr`);
  }

  const originalRenderSummary = renderSummary;
  renderSummary = function() {
    originalRenderSummary();
    const fl = flLatest();
    setText('flTemp', fl ? tempF(fl).toFixed(1) : '—');
    setText('flUpdated', fl ? `Updated ${ageText(fl.observed_at)}` : 'Waiting for temperature');
    const flState = document.getElementById('flState');
    if (flState) {
      if (!fl) {
        flState.className = 'station-state offline';
        flState.textContent = 'No temperature yet';
      } else {
        const online = ageHours(fl.observed_at) <= STALE_AFTER_HOURS;
        flState.className = `station-state ${online ? 'online' : 'stale'}`;
        flState.textContent = online ? 'Reporting normally' : `Stale · ${ageText(fl.observed_at)}`;
      }
    }
    const flDevice = flDeviceRows()[0] || null;
    if (flDevice) {
      const p = batteryPct(flDevice), v = batteryV(flDevice);
      setText('flHeroBattery', p !== null ? `Battery ${Math.round(p)}%` : v !== null ? `${v.toFixed(3)} V` : 'Battery —');
    } else setText('flHeroBattery', 'Battery —');
    fillFishlakeStats();

    const current = [
      { station: STATIONS.hv, reading: latestTemp('hv') },
      { station: STATIONS.home, reading: latestTemp('home') },
      { station: FISHLAKE, reading: fl },
    ].filter(x => x.reading);
    if (current.length >= 2) {
      const ordered = current.map(x => ({...x, value: tempF(x.reading)})).sort((a,b) => a.value - b.value);
      const cool = ordered[0], warm = ordered.at(-1), spread = warm.value - cool.value;
      setText('tempSpread', `${spread.toFixed(1)}°F`);
      setText('tempSpreadDetail', `${cool.station.name} → ${warm.station.name}`);
      setText('warmestStation', warm.station.name);
      setText('warmestDetail', `${warm.value.toFixed(1)}°F now`);
    } else if (current.length === 1) {
      setText('tempSpread', '—');
      setText('tempSpreadDetail', 'need at least 2 current readings');
      setText('warmestStation', current[0].station.name);
      setText('warmestDetail', 'only station currently reporting');
    } else {
      setText('tempSpread', '—');
      setText('tempSpreadDetail', 'need current readings');
      setText('warmestStation', '—');
      setText('warmestDetail', 'latest readings');
    }

    const latests = current.sort((a,b) => new Date(b.reading.observed_at) - new Date(a.reading.observed_at));
    if (latests.length) {
      setText('freshestStation', latests[0].station.name);
      setText('freshestDetail', ageText(latests[0].reading.observed_at));
    }
    const healthy = current.filter(x => ageHours(x.reading.observed_at) <= STALE_AFTER_HOURS).length;
    setText('stationsReporting', `${healthy} / 3`);
    const n = document.getElementById('networkStatus');
    if (n) {
      n.className = `live-pill ${healthy === 3 ? 'online' : healthy > 0 ? 'partial' : 'offline'}`;
      setText('networkStatusText', healthy === 3 ? 'All 3 stations reporting' : healthy > 0 ? `${healthy} of 3 stations reporting` : 'No current station telemetry');
    }
  };

  renderTemperatureChart = function(target = document.getElementById('tempChart')) {
    const hv = tempRows('hv').map(r => ({x:new Date(r.observed_at).getTime(), y:tempF(r), iso:r.observed_at}));
    const home = tempRows('home').map(r => ({x:new Date(r.observed_at).getTime(), y:tempF(r), iso:r.observed_at}));
    const fl = flTempRows().map(r => ({x:new Date(r.observed_at).getTime(), y:tempF(r), iso:r.observed_at}));
    renderLineChart(target, [
      {name:'Hidden Valley', color:STATIONS.hv.color, points:hv},
      {name:'Heltec Home', color:STATIONS.home.color, points:home},
      {name:FISHLAKE.name, color:FISHLAKE.color, points:fl},
    ], {axisLabel:'Temperature °F', tooltipValue:v=>`${v.toFixed(1)} °F`, strokeWidth:3.3, pointRadius:3.5, empty:'Waiting for temperature telemetry.'});
    setText('tempChartCount', `${hv.length} Hidden Valley · ${home.length} Heltec Home · ${fl.length} Fishlake readings`);
  };

  renderRecent = function() {
    const allowed = new Set([STATIONS.hv.node, STATIONS.home.node, FISHLAKE.node]);
    const rows = state.readings.filter(r => r.telemetry_type === 'environment' && tempF(r) !== null && allowed.has(num(r.node_num))).sort((a,b) => new Date(b.observed_at) - new Date(a.observed_at)).slice(0, 50);
    const tbody = document.getElementById('recent');
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="8">Waiting for telemetry.</td></tr>'; return; }
    tbody.innerHTML = rows.map(r => {
      const node = num(r.node_num);
      const key = node === STATIONS.hv.node ? 'hv' : node === STATIONS.home.node ? 'home' : 'fl';
      const station = key === 'hv' ? STATIONS.hv : key === 'home' ? STATIONS.home : FISHLAKE;
      const remote = key !== 'home';
      const p = remote ? batteryPct(r) : null, v = remote ? batteryV(r) : null, rv = remote ? rssi(r) : null, sv = remote ? snr(r) : null, h = remote ? hops(r) : null;
      return `<tr><td>${esc(fmtTime(r.observed_at))}</td><td><span class="station-cell"><i class="legend-swatch ${key}"></i>${esc(station.name)}</span></td><td class="right">${tempF(r).toFixed(1)}</td><td class="right">${p===null?'—':Math.round(p)+'%'}</td><td class="right">${v===null?'—':v.toFixed(3)}</td><td class="right">${rv===null?'—':Math.round(rv)}</td><td class="right">${sv===null?'—':sv.toFixed(1)}</td><td class="right">${h===null?'—':Math.round(h)}</td></tr>`;
    }).join('');
  };

  loadData();
})();
