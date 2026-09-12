(() => {
  const SWELL = {
    node: 1949224949,
    id: '!742ecff5',
    name: "It's a Swell Day",
    short: 'SWRP',
    color: '#57b7ff',
    battery: true,
  };

  const style = document.createElement('style');
  style.textContent = `
    :root{--sw:#57b7ff;--sw-soft:rgba(87,183,255,.14)}
    .sw-card{border-color:rgba(87,183,255,.42);background:linear-gradient(160deg,rgba(87,183,255,.15),rgba(13,34,42,.95) 55%)}
    .sw-card:after{background:var(--sw)}
    .station-dot.sw,.legend-swatch.sw{background:var(--sw);box-shadow:0 0 18px rgba(87,183,255,.64)}
    .sw-detail,.sw-battery-panel{border-color:rgba(87,183,255,.3)}
    .station-badge.sw{background:var(--sw-soft);color:#c9e8ff}
  `;
  document.head.appendChild(style);

  const heroGrid = document.querySelector('.station-hero-grid');
  if (heroGrid && !document.getElementById('swTemp')) {
    heroGrid.insertAdjacentHTML('beforeend', `
      <article class="station-hero sw-card">
        <div class="station-heading"><span class="station-dot sw"></span><div><strong>It's a Swell Day</strong><small>RAK4631 · SWRP · !742ecff5</small></div></div>
        <div class="big-temp"><span id="swTemp">—</span><small>°F</small></div>
        <div class="station-meta"><span id="swUpdated">Waiting for temperature</span><span id="swHeroBattery">Battery —</span></div>
        <div class="station-state offline" id="swState">No temperature yet</div>
      </article>`);
  }

  const detailGrid = document.querySelector('.station-detail-grid');
  if (detailGrid && !document.getElementById('swHigh')) {
    detailGrid.insertAdjacentHTML('beforeend', `
      <article class="panel station-detail sw-detail">
        <div class="panel-head station-panel-head"><div><span class="eyebrow">Remote mesh station</span><h2>It's a Swell Day</h2><p>RAK WisBlock 4631 · MX2201 · location pending</p></div><span class="station-badge sw">SWRP</span></div>
        <div class="detail-metrics">
          <div><span>24h high</span><strong id="swHigh">—</strong></div>
          <div><span>24h low</span><strong id="swLow">—</strong></div>
          <div><span>24h average</span><strong id="swAvg">—</strong></div>
          <div><span>12h trend</span><strong id="swTrend">—</strong><small id="swTrendDetail">—</small></div>
          <div><span>Packet reliability</span><strong id="swReliability">—</strong><small id="swReliabilityDetail">—</small></div>
          <div><span>Longest gap</span><strong id="swGap">—</strong></div>
        </div>
        <div class="path-note"><strong>Sensor path</strong><span>MX2201 → BLE → It's a Swell Day RAK → LoRa mesh → Moab → internet</span></div>
      </article>`);
  }

  const chartGrid = document.querySelector('.charts.two-col');
  if (chartGrid && !document.getElementById('swBatteryChart')) {
    chartGrid.insertAdjacentHTML('beforeend', `
      <article class="panel sw-battery-panel">
        <div class="panel-head"><div><h2>It's a Swell Day battery</h2><p id="swBatteryChartCount">Battery telemetry pending</p></div><button type="button" class="expand-btn" id="swBatteryExpand">Expand</button></div>
        <div class="battery-summary">
          <div><span>Latest</span><strong id="swBatteryNow">—</strong><small id="swBatteryNowDetail">—</small></div>
          <div><span>Voltage change</span><strong id="swBatteryChange">—</strong><small id="swBatteryChangeDetail">selected window</small></div>
          <div><span>Solar activity</span><strong id="swSolarHours">—</strong><small id="swSolarDetail">estimated from voltage rise</small></div>
        </div>
        <div class="chart" id="swBatteryChart"><div class="empty">Waiting for It's a Swell Day battery telemetry.</div></div>
      </article>`);
  }

  const legend = document.querySelector('.temp-comparison-panel .legend');
  if (legend && !legend.querySelector('.legend-swatch.sw')) {
    legend.insertAdjacentHTML('beforeend', '<span><i class="legend-swatch sw"></i>It\'s a Swell Day</span>');
  }

  // Introductory copy is owned by index.html; station modules must not overwrite it.
  const mapText = document.querySelector('.map-panel .panel-head p');
  if (mapText) mapText.textContent = "Hidden Valley, Fishlake Hightop, and approximate Moab locations · It's a Swell Day location pending";
  const recentText = document.querySelector('.recent-panel .panel-head p');
  if (recentText) recentText.textContent = 'Combined history from the permanent temperature stations.';
  const footer = document.querySelector('footer span:first-child');
  if (footer) footer.textContent = "Meshtastic environmental network · Hidden Valley + Moab + Fishlake Hightop + It's a Swell Day · refreshes only on demand to conserve Neon compute";

  const swRows = () => state.readings.filter(r => num(r?.node_num) === SWELL.node);
  const swTempRows = () => swRows().filter(r => tempF(r) !== null && r.telemetry_type === 'environment').sort((a,b) => new Date(b.observed_at) - new Date(a.observed_at));
  const swLatest = () => swTempRows()[0] || null;
  const swDeviceRows = () => swRows().filter(r => batteryV(r) !== null || batteryPct(r) !== null).sort((a,b) => new Date(batteryTime(b)) - new Date(batteryTime(a)));

  function fillSwellStats() {
    const rows = swTempRows();
    const now = Date.now();
    const last24 = rows.filter(r => now - new Date(r.observed_at).getTime() <= 86400000);
    const vals = last24.map(tempF).filter(Number.isFinite);
    const sorted = [...rows].sort((a,b) => new Date(a.observed_at) - new Date(b.observed_at));
    let longest = null;
    if (sorted.length > 1) {
      longest = 0;
      for (let i = 1; i < sorted.length; i++) longest = Math.max(longest, (new Date(sorted[i].observed_at) - new Date(sorted[i-1].observed_at)) / 3600000);
    }
    let reliability = null, expected = 0;
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
    setText('swHigh', vals.length ? `${Math.max(...vals).toFixed(1)}°` : '—');
    setText('swLow', vals.length ? `${Math.min(...vals).toFixed(1)}°` : '—');
    setText('swAvg', vals.length ? `${mean(vals).toFixed(1)}°` : '—');
    setText('swTrend', trend ? `${trend.delta >= 0 ? '+' : ''}${trend.delta.toFixed(1)}°` : '—');
    setText('swTrendDetail', trend ? `${trend.perHour >= 0 ? '+' : ''}${trend.perHour.toFixed(2)}°/hr` : 'need 2 readings in 12h');
    setText('swReliability', reliability === null ? '—' : `${reliability.toFixed(0)}%`);
    setText('swReliabilityDetail', sorted.length ? `${sorted.length}/${expected} expected in selected window` : 'no readings');
    setText('swGap', longest === null ? '—' : `${longest.toFixed(1)} hr`);
  }

  function renderSwellBattery(target = document.getElementById('swBatteryChart')) {
    if (!target) return;
    const dr = swDeviceRows();
    const latest = dr[0] || null;
    if (latest) {
      const p = batteryPct(latest), v = batteryV(latest);
      setText('swBatteryNow', p !== null ? `${Math.round(p)}%` : v !== null ? `${v.toFixed(3)} V` : '—');
      setText('swBatteryNowDetail', [v !== null ? `${v.toFixed(3)} V` : null, ageText(batteryTime(latest))].filter(Boolean).join(' · '));
    } else {
      setText('swBatteryNow', '—');
      setText('swBatteryNowDetail', 'battery telemetry pending');
    }

    const vals = dr.filter(r => batteryV(r) !== null).sort((a,b) => new Date(batteryTime(a)) - new Date(batteryTime(b)));
    if (vals.length >= 2) {
      const a = batteryV(vals[0]), b = batteryV(vals.at(-1)), change = b - a;
      setText('swBatteryChange', `${change >= 0 ? '+' : ''}${change.toFixed(3)} V`);
      setText('swBatteryChangeDetail', `${a.toFixed(3)} → ${b.toFixed(3)} V`);
    } else {
      setText('swBatteryChange', '—');
      setText('swBatteryChangeDetail', 'need 2 voltage samples');
    }

    let solar = 0, rises = 0;
    for (let i = 1; i < vals.length; i++) {
      const dt = (new Date(batteryTime(vals[i])) - new Date(batteryTime(vals[i-1]))) / 3600000;
      const dv = batteryV(vals[i]) - batteryV(vals[i-1]);
      if (dt > 0 && dt <= 3 && dv >= .002) { solar += dt; rises++; }
    }
    if (vals.length < 2) {
      setText('swSolarHours', '—');
      setText('swSolarDetail', 'need at least 2 readings');
    } else {
      setText('swSolarHours', `${solar.toFixed(1)} hr`);
      setText('swSolarDetail', rises ? `${rises} rising-voltage interval${rises === 1 ? '' : 's'}` : 'no clear voltage rise yet');
    }

    setText('swBatteryChartCount', vals.length ? `${vals.length} voltage samples · It's a Swell Day` : 'Battery telemetry pending');
    const points = vals.map(r => ({x:new Date(batteryTime(r)).getTime(), y:batteryV(r), iso:batteryTime(r)}));
    renderLineChart(target, [{name:"It's a Swell Day voltage", color:SWELL.color, points}], {
      axisLabel:'Battery V', tooltipValue:v=>`${v.toFixed(3)} V`, empty:"Waiting for It's a Swell Day battery telemetry.", pointRadius:3,
    });
  }

  document.getElementById('swBatteryExpand')?.addEventListener('click', () => {
    const dialog = document.getElementById('expandDialog');
    const title = document.getElementById('expandTitle');
    const chart = document.getElementById('expandedChart');
    const mapEl = document.getElementById('expandedMap');
    if (!dialog || !title || !chart || !mapEl) return;
    title.textContent = "It's a Swell Day battery";
    mapEl.hidden = true;
    chart.hidden = false;
    dialog.showModal();
    setTimeout(() => renderSwellBattery(chart), 40);
  });

  const originalRenderSummary = renderSummary;
  renderSummary = function() {
    originalRenderSummary();
    const sw = swLatest();
    setText('swTemp', sw ? tempF(sw).toFixed(1) : '—');
    setText('swUpdated', sw ? `Updated ${ageText(sw.observed_at)}` : 'Waiting for temperature');
    const stateEl = document.getElementById('swState');
    if (stateEl) {
      if (!sw) {
        stateEl.className = 'station-state offline';
        stateEl.textContent = 'No temperature yet';
      } else {
        const online = ageHours(sw.observed_at) <= STALE_AFTER_HOURS;
        stateEl.className = `station-state ${online ? 'online' : 'stale'}`;
        stateEl.textContent = online ? 'Reporting normally' : `Stale · ${ageText(sw.observed_at)}`;
      }
    }

    const device = swDeviceRows()[0] || null;
    if (device) {
      const p = batteryPct(device), v = batteryV(device);
      setText('swHeroBattery', p !== null ? `Battery ${Math.round(p)}%` : v !== null ? `${v.toFixed(3)} V` : 'Battery —');
    } else setText('swHeroBattery', 'Battery —');
    fillSwellStats();
    renderSwellBattery();

    const current = [
      { station: STATIONS.hv, reading: latestTemp('hv') },
      { station: STATIONS.home, reading: latestTemp('home') },
      { station: STATIONS.fl, reading: latestTemp('fl') },
      { station: SWELL, reading: sw },
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

    const latests = [...current].sort((a,b) => new Date(b.reading.observed_at) - new Date(a.reading.observed_at));
    if (latests.length) {
      setText('freshestStation', latests[0].station.name);
      setText('freshestDetail', ageText(latests[0].reading.observed_at));
    }
    const healthy = current.filter(x => ageHours(x.reading.observed_at) <= STALE_AFTER_HOURS).length;
    setText('stationsReporting', `${healthy} / 5`);
    const n = document.getElementById('networkStatus');
    if (n) {
      n.className = `live-pill ${healthy === 5 ? 'online' : healthy > 0 ? 'partial' : 'offline'}`;
      setText('networkStatusText', healthy === 5 ? 'All 5 stations reporting' : healthy > 0 ? `${healthy} of 5 stations reporting` : 'No current station telemetry');
    }
  };

  renderTemperatureChart = function(target = document.getElementById('tempChart')) {
    const hv = tempRows('hv').map(r => ({x:new Date(r.observed_at).getTime(), y:tempF(r), iso:r.observed_at}));
    const home = tempRows('home').map(r => ({x:new Date(r.observed_at).getTime(), y:tempF(r), iso:r.observed_at}));
    const fl = tempRows('fl').map(r => ({x:new Date(r.observed_at).getTime(), y:tempF(r), iso:r.observed_at}));
    const sw = swTempRows().map(r => ({x:new Date(r.observed_at).getTime(), y:tempF(r), iso:r.observed_at}));
    renderLineChart(target, [
      {name:'Hidden Valley', color:STATIONS.hv.color, points:hv},
      {name:'Moab', color:STATIONS.home.color, points:home},
      {name:'Fishlake Hightop', color:STATIONS.fl.color, points:fl},
      {name:SWELL.name, color:SWELL.color, points:sw},
    ], {axisLabel:'Temperature °F', tooltipValue:v=>`${v.toFixed(1)} °F`, strokeWidth:3.3, pointRadius:3.5, empty:'Waiting for temperature telemetry.'});
    setText('tempChartCount', `${hv.length} Hidden Valley · ${home.length} Moab · ${fl.length} Fishlake · ${sw.length} Swell readings`);
  };

  renderRecent = function() {
    const allowed = new Set([STATIONS.hv.node, STATIONS.home.node, STATIONS.fl.node, SWELL.node]);
    const rows = state.readings.filter(r => r.telemetry_type === 'environment' && tempF(r) !== null && allowed.has(num(r.node_num))).sort((a,b) => new Date(b.observed_at) - new Date(a.observed_at)).slice(0, 50);
    const tbody = document.getElementById('recent');
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="8">Waiting for telemetry.</td></tr>'; return; }
    tbody.innerHTML = rows.map(r => {
      const node = num(r.node_num);
      let key, station;
      if (node === STATIONS.hv.node) { key = 'hv'; station = STATIONS.hv; }
      else if (node === STATIONS.home.node) { key = 'home'; station = STATIONS.home; }
      else if (node === STATIONS.fl.node) { key = 'fl'; station = STATIONS.fl; }
      else { key = 'sw'; station = SWELL; }
      const remote = key !== 'home';
      const p = remote ? batteryPct(r) : null, v = remote ? batteryV(r) : null, rv = remote ? rssi(r) : null, sv = remote ? snr(r) : null, h = remote ? hops(r) : null;
      return `<tr><td>${esc(fmtTime(r.observed_at))}</td><td><span class="station-cell"><i class="legend-swatch ${key}"></i>${esc(station.name)}</span></td><td class="right">${tempF(r).toFixed(1)}</td><td class="right">${p===null?'—':Math.round(p)+'%'}</td><td class="right">${v===null?'—':v.toFixed(3)}</td><td class="right">${rv===null?'—':Math.round(rv)}</td><td class="right">${sv===null?'—':sv.toFixed(1)}</td><td class="right">${h===null?'—':Math.round(h)}</td></tr>`;
    }).join('');
  };

  loadData();
})();
