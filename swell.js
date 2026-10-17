(() => {
  const SWELL = {
    node: 1949224949,
    id: '!742ecff5',
    name: "Pack Creek",
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
    .sw-detail,.sw-battery-panel,.sw-water-panel{border-color:rgba(87,183,255,.3)}
    .sw-water-now{display:flex;align-items:baseline;gap:8px;margin:8px 0 2px;color:#d9efff}
    .sw-water-now span{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#88a4aa;font-weight:800}
    .sw-water-now strong{font-size:24px}
    .station-badge.sw{background:var(--sw-soft);color:#c9e8ff}
    .sw-mx-latest{display:flex;flex-wrap:wrap;align-items:center;gap:12px 20px;margin:10px 20px 12px;padding:12px 14px;border:1px solid rgba(87,183,255,.35);border-radius:10px;background:rgba(87,183,255,.07);font-size:13px;color:#bcd4da}
    .sw-mx-latest strong{color:#f0f8fa;font-size:16px;margin-left:5px}
    .sw-mx-latest .sw-mx-time{flex-basis:100%;font-size:12px;color:#94b5bf}
    .sw-mx-latest.stale .sw-mx-time{color:#e8bc78}
    .sw-mx-latest .sw-mx-label{font-weight:750;color:#57b7ff}
  `;
  document.head.appendChild(style);

  const heroGrid = document.querySelector('.station-hero-grid');
  if (heroGrid && !document.getElementById('swTemp')) {
    heroGrid.insertAdjacentHTML('beforeend', `
      <article class="station-hero sw-card">
        <div class="station-heading"><span class="station-dot sw"></span><div><strong>Pack Creek</strong><small>RAK4631 · Firmware V4 · SWRP · !742ecff5 · water temperature</small></div></div>
        <div class="big-temp"><span id="swTemp">—</span><small>°F</small></div>
        <div class="sw-water-now"><span>Water level</span><strong id="swWaterLevel">—</strong></div>
        <div class="sw-water-now"><span>Discharge</span><strong id="swDischarge">—</strong></div>
        <div class="station-meta"><span id="swUpdated">Waiting for temperature / water level</span><span id="swHeroBattery">Battery —</span></div>
        <div class="station-state offline" id="swState">No temperature or water level yet</div>
      </article>`);
  }

  const detailGrid = document.querySelector('.station-detail-grid');
  if (detailGrid && !document.getElementById('swHigh')) {
    detailGrid.insertAdjacentHTML('beforeend', `
      <article class="panel station-detail sw-detail">
        <div class="panel-head station-panel-head"><div><span class="eyebrow">Remote mesh station</span><h2>Pack Creek</h2><p>RAK WisBlock 4631 · Temperature Sensor · location pending</p></div><span class="station-badge sw">SWRP</span></div>
        <div class="detail-metrics">
          <div><span>24h high</span><strong id="swHigh">—</strong></div>
          <div><span>24h low</span><strong id="swLow">—</strong></div>
          <div><span>24h average</span><strong id="swAvg">—</strong></div>
          <div><span>12h trend</span><strong id="swTrend">—</strong><small id="swTrendDetail">—</small></div>
          <div><span>Packet reliability</span><strong id="swReliability">—</strong><small id="swReliabilityDetail">—</small></div>
          <div><span>Longest gap</span><strong id="swGap">—</strong></div>
        </div>
        <div class="path-note"><strong>Sensor path</strong><span>Temperature Sensor → BLE → Pack Creek RAK → LoRa mesh → Moab → internet</span></div>
      </article>`);
  }

  const chartGrid = document.querySelector('.charts.two-col');
  if (chartGrid && !document.getElementById('swBatteryChart')) {
    chartGrid.insertAdjacentHTML('beforeend', `
      <article class="panel sw-battery-panel">
        <div class="panel-head"><div><h2>Pack Creek battery</h2><p id="swBatteryChartCount">Battery telemetry pending</p></div><button type="button" class="expand-btn" id="swBatteryExpand">Expand</button></div>
        <div class="battery-summary">
          <div><span>Latest</span><strong id="swBatteryNow">—</strong><small id="swBatteryNowDetail">—</small></div>
          <div><span>Voltage change</span><strong id="swBatteryChange">—</strong><small id="swBatteryChangeDetail">selected window</small></div>
          <div><span>Solar activity</span><strong id="swSolarHours">—</strong><small id="swSolarDetail">estimated from voltage rise</small></div>
        </div>
        <div class="chart" id="swBatteryChart"><div class="empty">Waiting for Pack Creek battery telemetry.</div></div>
      </article>`);
  }

  const legend = document.querySelector('.temp-comparison-panel .legend');
  if (legend && !legend.querySelector('.legend-swatch.sw')) {
    legend.insertAdjacentHTML('beforeend', '<span><i class="legend-swatch sw"></i>Pack Creek</span>');
  }

  // Introductory copy is owned by index.html; station modules must not overwrite it.
  const mapText = document.querySelector('.map-panel .panel-head p');
  if (mapText) mapText.textContent = "Hidden Valley, Fishlake Hightop, and approximate Moab locations · Pack Creek location pending";
  const recentText = document.querySelector('.recent-panel .panel-head p');
  if (recentText) recentText.textContent = 'Combined history from the permanent temperature stations.';
  const footer = document.querySelector('footer span:first-child');
  if (footer) footer.textContent = "Meshtastic environmental network · Hidden Valley + Moab + Fishlake Hightop + Pack Creek · refreshes only on demand to conserve Neon compute";

  const swRows = () => state.readings.filter(r => num(r?.node_num) === SWELL.node);
  const swTempRows = () => swRows().filter(r => tempF(r) !== null && (r.telemetry_type === 'environment' || r.telemetry_type === 'mx2001')).sort((a,b) => new Date(b.observed_at) - new Date(a.observed_at));
  const swWaterRows = () => swRows().filter(r => (r.telemetry_type === 'mx2001' || r.telemetry_type === 'water_distance') && num(metric(r,'water_level_ft')) !== null).sort((a,b) => new Date(b.observed_at) - new Date(a.observed_at));
  const swLatest = () => swTempRows()[0] || null;
  const swWaterLatest = () => swWaterRows()[0] || null;
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

    setText('swBatteryChartCount', vals.length ? `${vals.length} voltage samples · Pack Creek` : 'Battery telemetry pending');
    const points = vals.map(r => ({x:new Date(batteryTime(r)).getTime(), y:batteryV(r), iso:batteryTime(r)}));
    renderLineChart(target, [{name:"Pack Creek voltage", color:SWELL.color, points}], {
      axisLabel:'Battery V', tooltipValue:v=>`${v.toFixed(3)} V`, empty:"Waiting for Pack Creek battery telemetry.", pointRadius:3,
    });
  }

  // Show both HOBO MX2001 measurements by default. The combined mesh graph
  // deliberately retains its independent, initially unchecked selectors.
  const swSeriesEnabled = { 'mx-stage': true, 'sen-stage': true, 'mx-temp': true, discharge: true };
  const mxTempToggle = document.querySelector('#swSensorControls input[data-sw-series="mx-temp"]');
  if (mxTempToggle) mxTempToggle.checked = true;
  const swPanelHead = document.querySelector('.sw-water-panel .panel-head');
  if (swPanelHead && !document.getElementById('swMxLatest')) {
    swPanelHead.insertAdjacentHTML('afterend', `
      <div class="sw-mx-latest" id="swMxLatest" aria-live="polite">
        <span class="sw-mx-label">HOBO MX2001</span>
        <span>Stage <strong id="swMxStageNow">—</strong></span>
        <span>Temperature <strong id="swMxTempNow">—</strong></span>
        <span>Rated discharge <strong id="swMxDischargeNow">—</strong></span>
        <span class="sw-mx-time" id="swMxLastSeen">Waiting for MX2001 telemetry</span>
      </div>`);
  }
  const swSensorRows = type => swRows().filter(r => r.telemetry_type === type).sort((a,b) => new Date(a.observed_at)-new Date(b.observed_at));
  const swPoints = (type, field, converter) => swSensorRows(type).map(r => ({
    x:new Date(r.observed_at).getTime(), y:converter(r,field), iso:r.observed_at
  })).filter(p => Number.isFinite(p.x) && p.y !== null && Number.isFinite(p.y));
  const swStageValue = (r,field) => num(metric(r,field));
  const swTempValue = r => tempF(r);
  function renderSwellWaterLevel(target = document.getElementById('swWaterLevelChart')) {
    if (!target) return;
    const mxLatest = swSensorRows('mx2001').at(-1) || null;
    const mxStage = mxLatest ? num(metric(mxLatest, 'water_level_ft')) : null;
    const mxTemp = mxLatest ? tempF(mxLatest) : null;
    setText('swMxDischargeNow', mxLatest?.discharge_cfs != null ? Number(mxLatest.discharge_cfs).toFixed(3) + ' cfs' : '—');
    setText('swMxStageNow', mxStage !== null ? mxStage.toFixed(3) + ' ft' : '—');
    setText('swMxTempNow', mxTemp !== null ? mxTemp.toFixed(1) + ' °F' : '—');
    const mxLastSeen = document.getElementById('swMxLastSeen');
    const mxLatestBox = document.getElementById('swMxLatest');
    if (mxLatestBox) mxLatestBox.classList.remove('stale');
    if (mxLastSeen) mxLastSeen.textContent = mxLatest
      ? 'Last MX2001 packet: ' + fmtTime(mxLatest.observed_at) + ' (' + ageText(mxLatest.observed_at) + ')' +
        ''
      : 'No MX2001 stage or temperature packets in the last 30 days';
    const mx = swPoints('mx2001','water_level_ft',swStageValue);
    const sen = swPoints('water_distance','water_level_ft',swStageValue);
    const series = [];
    if (swSeriesEnabled['mx-stage']) series.push({name:'MX2001 stage',color:'#57b7ff',points:mx,maxGapMs:3*3600000});
    if (swSeriesEnabled['sen-stage']) series.push({name:'SEN0313 stage',color:'#55d9b7',points:sen,maxGapMs:3*3600000});
    renderLineChart(target,series,{
      axisLabel:'Stage ft',tooltipValue:v=>`${v.toFixed(3)} ft`,
      empty:series.length?'No stage readings for selected sensors.':'Select a stage sensor above.',
      pointRadius:3.4,strokeWidth:3.2
    });
    const dischargeTarget = target.id === 'expandedChart' ? null : document.getElementById('swWaterDischargeChart');
    if (dischargeTarget) {
      dischargeTarget.style.display = swSeriesEnabled.discharge ? '' : 'none';
      if (swSeriesEnabled.discharge) renderLineChart(dischargeTarget,
        [{name:'MX2001 rated discharge',color:'#b99aff',points:swPoints('mx2001','discharge_cfs',r=>num(r.discharge_cfs)),maxGapMs:3*3600000},
         {name:'SEN0313 rated discharge',color:'#55d9b7',points:swPoints('water_distance','discharge_cfs',r=>num(r.discharge_cfs)),maxGapMs:3*3600000}],
        {axisLabel:'Discharge cfs',tooltipValue:v=>`${v.toFixed(3)} cfs`,empty:'Waiting for rated Pack Creek stage.',pointRadius:3.4,strokeWidth:3.2});
    }
    const temps = swPoints('mx2001','temperature',swTempValue);
    const tempTarget = target.id === 'expandedChart' ? null : document.getElementById('swWaterTempChart');
    if(tempTarget){
      tempTarget.style.display = swSeriesEnabled['mx-temp'] ? '' : 'none';
      if(swSeriesEnabled['mx-temp'])renderLineChart(tempTarget,[{name:'MX2001 temperature',color:'#f3c969',points:temps,maxGapMs:3*3600000}],{
        axisLabel:'Temperature °F',tooltipValue:v=>`${v.toFixed(1)} °F`,
        empty:'Waiting for MX2001 temperature readings.',pointRadius:3.4,strokeWidth:3.2
      });
    }
    setText('swWaterLevelChartCount',`${mx.length} MX2001 stage · ${sen.length} SEN0313 stage · ${temps.length} MX2001 temperature samples`);
  }
  document.querySelectorAll('#swSensorControls input[data-sw-series]').forEach(input=>{
    input.addEventListener('change',()=>{
      swSeriesEnabled[input.dataset.swSeries]=input.checked;
      renderSwellWaterLevel();
    });
  });

  document.getElementById('swWaterLevelExpand')?.addEventListener('click', () => {
    const dialog = document.getElementById('expandDialog');
    const title = document.getElementById('expandTitle');
    const chart = document.getElementById('expandedChart');
    const mapEl = document.getElementById('expandedMap');
    if (!dialog || !title || !chart || !mapEl) return;
    title.textContent = "Pack Creek water level";
    mapEl.hidden = true;
    chart.hidden = false;
    chart.dataset.rangeSource = 'swWaterLevelChart';
    dialog.showModal();
    setTimeout(() => renderSwellWaterLevel(chart), 40);
  });

  document.getElementById('swBatteryExpand')?.addEventListener('click', () => {
    const dialog = document.getElementById('expandDialog');
    const title = document.getElementById('expandTitle');
    const chart = document.getElementById('expandedChart');
    const mapEl = document.getElementById('expandedMap');
    if (!dialog || !title || !chart || !mapEl) return;
    title.textContent = "Pack Creek battery";
    mapEl.hidden = true;
    chart.hidden = false;
    dialog.showModal();
    setTimeout(() => renderSwellBattery(chart), 40);
  });

  const originalRenderSummary = renderSummary;
  renderSummary = function() {
    originalRenderSummary();
    const sw = swLatest();
    const water = swWaterLatest();
    setText('swTemp', sw ? tempF(sw).toFixed(1) : '—');
    setText('swWaterLevel', water ? num(metric(water,'water_level_ft')).toFixed(2) + ' ft' : '—');
    setText('swDischarge', water?.discharge_cfs != null ? Number(water.discharge_cfs).toFixed(2) + ' cfs' : '—');
    const freshest = [sw, water].filter(Boolean).sort((a,b) => new Date(b.observed_at) - new Date(a.observed_at))[0] || null;
    setText('swUpdated', freshest ? `Updated ${ageText(freshest.observed_at)}` : 'Waiting for temperature / water level');
    // Pack Creek card: suppress the status badge only; preserve telemetry and timestamps.
    const stateEl = document.getElementById('swState');
    if (stateEl) stateEl.style.display = 'none';

    const device = swDeviceRows()[0] || null;
    if (device) {
      const p = batteryPct(device), v = batteryV(device);
      const parts=[p===101?'External power':p!==null?Math.round(p)+'%':null,v!==null?v.toFixed(3)+' V':null].filter(Boolean);
      setText('swHeroBattery',parts.length?'Battery '+parts.join(' · '):'Battery —');
    } else setText('swHeroBattery', 'Battery —');
    fillSwellStats();
    renderSwellBattery();
    renderSwellWaterLevel();

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
    setText('tempChartCount', `${hv.length} Hidden Valley · ${home.length} Moab · ${fl.length} Fishlake · ${sw.length} Pack Creek readings`);
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
