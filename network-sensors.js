/* Additional production sensor nodes. Identity and labels live here, not in the Heltec. */
(() => {
  'use strict';

  const EXTRA = {
    pack: { node: 4241345683, name: 'Pack Creek', id: '!fccdcc93', color: '#66b9ff' },
    soil: { node: 2004386937, name: 'Wingate Moisture', id: '!77788479', color: '#d9b873' },
    cliff: { node: 3388602087, name: 'Cliff Sensor', id: '!c9f9f6e7', color: '#c3a0fb' },
  };
  const TEMPERATURE_TYPES = new Set(['environment', 'mx2001']);
  let packChartMetric = 'flow';
  const packChartSources = new Set(['sen0313']);
  const PACK_RATING = { a: 6.07187614, offset: 0.22259098, b: 1.04237977 };
  const PACK_DIFF_MATCH_MS = 15 * 60 * 1000;
  let packDifference24h = [];
  let packDifferenceFetchedAt = 0;
  let packDifferenceFetchInFlight = false;
  const selectedAirTemperatureNodes = new Set([
    STATIONS.hv?.node,
    STATIONS.home?.node,
    STATIONS.fl?.node,
  ].filter(v => Number.isFinite(Number(v))).map(Number));
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
    .sensor-details-row{display:flex;justify-content:space-between;gap:12px;font-size:12px;color:var(--muted);margin:5px 0}
    .sensor-details-row b{color:#dcebef;font-weight:700;text-align:right}
    .sensor-comparison{grid-column:1/-1}
    .sensor-agreement{font-weight:800}
    .sensor-agreement.excellent{color:#55d9b7}
    .sensor-agreement.good{color:#86d7e8}
    .sensor-agreement.watch{color:#f3c969}
    .sensor-agreement.investigate{color:#ff8f80}
    .pack-diff-spark-wrap{margin-top:11px;padding-top:10px;border-top:1px solid #17343d}
    .pack-diff-spark-head{display:flex;justify-content:space-between;gap:10px;align-items:baseline;margin-bottom:7px}
    .pack-diff-spark-head span{font-size:11px;color:#88a4aa;font-weight:800;text-transform:uppercase;letter-spacing:.08em}
    .pack-diff-spark-head small{font-size:10px;color:var(--muted)}
    .pack-diff-sparkline{height:74px;width:100%;position:relative;overflow:hidden;border-radius:8px;background:#08171d}
    .pack-diff-sparkline svg{display:block;width:100%;height:100%}
    .pack-diff-spark-empty{height:74px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:11px}
    .primary-monitor-panel{overflow:hidden}
    .primary-monitor-panel .chart.xlarge{height:440px}
    .monitor-head{align-items:flex-end}
    .monitor-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
    .compact-tabs{gap:4px}.compact-tabs button{padding:7px 9px;font-size:12px}
    .pack-source-filter{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    .pack-source-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid #24434d;background:#0a1a20;color:#8ea8ae;border-radius:999px;padding:7px 10px;cursor:pointer;font-size:12px;font-weight:750}
    .pack-source-btn[aria-pressed="true"]{background:#17343e;border-color:#5b8e9b;color:#fff}
    .pack-source-dot{width:8px;height:8px;border-radius:50%;display:inline-block}
    .monitor-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:12px}
    .monitor-summary>div{background:#091a20;border:1px solid #1b3740;border-radius:11px;padding:12px}
    .monitor-summary span{display:block;color:#88a4aa;font-size:11px;text-transform:uppercase;letter-spacing:.1em;font-weight:800}
    .monitor-summary strong{display:block;font-size:22px;margin-top:6px}
    .monitor-summary small{display:block;color:var(--muted);margin-top:5px}
    .pack-monitor-panel{border-color:rgba(102,185,255,.28)}
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
    '<article class="station-hero extra-station" style="--accent:#66b9ff">' +
      '<div class="station-heading"><span class="station-dot" style="background:#66b9ff"></span><div>' +
      '<strong>Pack Creek</strong><small>PC1 · !fccdcc93 · water temperature + stage + flow</small></div></div>' +
      '<div class="reading-kicker">Water temperature</div><div class="extra-reading" id="packTemp">—</div><div class="extra-secondary">Stage: <strong id="packStage">—</strong> · Flow: <strong id="packFlow">—</strong></div>' +
      '<div class="station-meta"><span id="packUpdated">Waiting for readings</span><span id="packHeroBattery">Battery —</span></div><div class="station-state offline" id="packState">No readings yet</div>' +
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
          '<div class="sensor-details-row"><span>Stage difference</span><b id="packDetailDifference">—</b></div>' +
          '<div class="sensor-details-row"><span>Agreement</span><b id="packDetailAgreement" class="sensor-agreement">—</b></div>' +
          '<div class="sensor-details-row"><span>Authoritative sensor</span><b>SEN0313</b></div>' +
          '<div class="sensor-details-row"><span>Flow equation</span><b>Q = 6.072(H−0.2226)^1.0424</b></div>' +
          '<div class="pack-diff-spark-wrap"><div class="pack-diff-spark-head"><span>24h stage difference</span><small>313 stage − 2001 stage</small></div>' +
          '<div id="packDifferenceSparkline" class="pack-diff-sparkline"><div class="pack-diff-spark-empty">Loading 24h comparison…</div></div></div></div>' +
      '</div></details></article>' +
    '<article class="station-hero extra-station" style="--accent:#d9b873">' +
      '<div class="station-heading"><span class="station-dot" style="background:#d9b873"></span><div>' +
      '<strong>Wingate Moisture</strong><small>Soil · !77788479 · soil moisture only</small></div></div>' +
      '<div class="extra-reading" id="soilMoisture">—</div><div class="extra-secondary" id="soilAdc">ADC —</div>' +
      '<div class="station-meta"><span id="soilUpdated">Waiting for readings</span><span id="soilHeroBattery">Battery —</span></div><div class="station-state offline" id="soilState">No readings yet</div></article>' +
    '<article class="station-hero extra-station" style="--accent:#c3a0fb">' +
      '<div class="station-heading"><span class="station-dot" style="background:#c3a0fb"></span><div>' +
      '<strong>Cliff Sensor</strong><small>CCAT · !c9f9f6e7 · air temperature</small></div></div>' +
      '<div class="extra-reading" id="cliffTemp">—</div><div class="extra-secondary">HOBO temperature</div>' +
      '<div class="station-meta"><span id="cliffUpdated">Waiting for readings</span><span id="cliffHeroBattery">Battery —</span></div><div class="station-state offline" id="cliffState">No readings yet</div></article>');

  function packStageToFlow(stageFt){
    const h=Number(stageFt);
    if(!Number.isFinite(h) || h<=PACK_RATING.offset)return null;
    return PACK_RATING.a*Math.pow(h-PACK_RATING.offset,PACK_RATING.b);
  }

  function pack313Points(metricName){
    if(metricName==='stage'){
      return stageRows().map(r=>({x:new Date(r.observed_at).getTime(),y:Number(metric(r,'water_level_ft')),iso:r.observed_at}));
    }
    return stageRows().filter(r=>Number.isFinite(Number(r.discharge_cfs))).map(r=>({x:new Date(r.observed_at).getTime(),y:Number(r.discharge_cfs),iso:r.observed_at}));
  }

  function pack2001Points(metricName){
    return hoboStageRows().map(r=>{
      const stage=Number(metric(r,'water_level_ft'));
      const y=metricName==='stage'?stage:packStageToFlow(stage);
      return {x:new Date(r.observed_at).getTime(),y,iso:r.observed_at};
    }).filter(p=>Number.isFinite(p.y));
  }

  function packAgreement(absDiffFt){
    if(!Number.isFinite(absDiffFt)) return {label:'—',cls:''};
    if(absDiffFt<=0.02)return {label:'Excellent',cls:'excellent'};
    if(absDiffFt<=0.05)return {label:'Good',cls:'good'};
    if(absDiffFt<=0.10)return {label:'Watch',cls:'watch'};
    return {label:'Investigate',cls:'investigate'};
  }

  function pairPackStageDifferences(rows){
    const primary=rows.filter(r=>Number(r.node_num)===EXTRA.pack.node&&r.telemetry_type==='water_distance'&&
      Number.isFinite(Number(metric(r,'water_level_ft')))&&metric(r,'stage_calibrated')!==false)
      .map(r=>({t:new Date(r.observed_at).getTime(),stage:Number(metric(r,'water_level_ft')),iso:r.observed_at}))
      .filter(p=>Number.isFinite(p.t)).sort((a,b)=>a.t-b.t);
    const hobo=rows.filter(r=>Number(r.node_num)===EXTRA.pack.node&&r.telemetry_type==='mx2001'&&
      Number.isFinite(Number(metric(r,'water_level_ft'))))
      .map(r=>({t:new Date(r.observed_at).getTime(),stage:Number(metric(r,'water_level_ft')),iso:r.observed_at}))
      .filter(p=>Number.isFinite(p.t)).sort((a,b)=>a.t-b.t);
    if(!primary.length||!hobo.length)return [];
    const paired=[];
    let j=0;
    for(const p of primary){
      while(j+1<hobo.length&&Math.abs(hobo[j+1].t-p.t)<=Math.abs(hobo[j].t-p.t))j++;
      const h=hobo[j];
      if(h&&Math.abs(h.t-p.t)<=PACK_DIFF_MATCH_MS)paired.push({x:p.t,y:p.stage-h.stage,iso:p.iso});
    }
    return paired;
  }

  function renderPackDifferenceSparkline(){
    const target=document.getElementById('packDifferenceSparkline');
    if(!target)return;
    const points=packDifference24h.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)).sort((a,b)=>a.x-b.x);
    if(!points.length){
      target.innerHTML='<div class="pack-diff-spark-empty">No matched 24h stage pairs yet.</div>';
      return;
    }
    target.innerHTML='';
    const w=420,h=74,padX=5,padY=9;
    const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
    let xmin=Math.min(...xs),xmax=Math.max(...xs);
    let ymin=Math.min(...ys,0),ymax=Math.max(...ys,0);
    if(xmax===xmin)xmax=xmin+1;
    const yPad=Math.max(0.005,(ymax-ymin)*0.18);
    ymin-=yPad;ymax+=yPad;
    const x=v=>padX+(v-xmin)/(xmax-xmin)*(w-padX*2);
    const y=v=>padY+(ymax-v)/(ymax-ymin)*(h-padY*2);
    const svg=svgEl('svg',{viewBox:`0 0 ${w} ${h}`,preserveAspectRatio:'none','aria-label':'24 hour SEN0313 minus MX2001 stage difference'});
    svg.appendChild(svgEl('line',{x1:padX,x2:w-padX,y1:y(0),y2:y(0),stroke:'#31505a','stroke-width':1,'stroke-dasharray':'4 4'}));
    const poly=points.map(p=>`${x(p.x)},${y(p.y)}`).join(' ');
    svg.appendChild(svgEl('polyline',{points:poly,fill:'none',stroke:'#66b9ff','stroke-width':2.5,'stroke-linecap':'round','stroke-linejoin':'round'}));
    const last=points.at(-1);
    svg.appendChild(svgEl('circle',{cx:x(last.x),cy:y(last.y),r:3.2,fill:'#66b9ff',stroke:'#08171d','stroke-width':1.2}));
    target.appendChild(svg);
    target.title=`${points.length} matched readings · latest signed difference ${last.y>=0?'+':''}${last.y.toFixed(3)} ft`;
  }

  async function refreshPackDifference24h(force=false){
    const now=Date.now();
    if(packDifferenceFetchInFlight)return;
    if(!force&&packDifferenceFetchedAt&&now-packDifferenceFetchedAt<60000){
      renderPackDifferenceSparkline();
      return;
    }
    packDifferenceFetchInFlight=true;
    try{
      const res=await fetch(`/api/readings?hours=24&node=${EXTRA.pack.node}&limit=5000`,{cache:'no-store'});
      const data=await res.json();
      if(!res.ok||!data.ok)throw new Error(data.error||`HTTP ${res.status}`);
      packDifference24h=pairPackStageDifferences(Array.isArray(data.readings)?data.readings:[]);
      packDifferenceFetchedAt=Date.now();
      renderPackDifferenceSparkline();
    }catch(err){
      console.error('Pack Creek 24h difference fetch failed',err);
      const target=document.getElementById('packDifferenceSparkline');
      if(target&&!packDifference24h.length)target.innerHTML='<div class="pack-diff-spark-empty">24h comparison unavailable.</div>';
    }finally{
      packDifferenceFetchInFlight=false;
    }
  }

  function renderPackChart(target=document.getElementById('packStageChart')){
    if(!target)return;
    const flowMode=packChartMetric==='flow';
    const metricName=flowMode?'flow':'stage';
    const series=[];
    let total=0;
    if(packChartSources.has('sen0313')){
      const points=pack313Points(metricName); total+=points.length;
      series.push({name:flowMode?'SEN0313 rated flow':'SEN0313 stage',color:EXTRA.pack.color,points});
    }
    if(packChartSources.has('mx2001')){
      const points=pack2001Points(metricName); total+=points.length;
      series.push({name:flowMode?'MX2001 stage-derived flow':'MX2001 stage',color:'#ff9a67',points});
    }
    renderLineChart(target,series,
      flowMode
        ? {axisLabel:'Discharge (cfs)',tooltipValue:v=>v.toFixed(2)+' cfs',strokeWidth:3.3,pointRadius:3.5,empty:'Select a Pack Creek sensor source.'}
        : {axisLabel:'Water level (ft)',tooltipValue:v=>v.toFixed(3)+' ft',strokeWidth:3.3,pointRadius:3.5,empty:'Select a Pack Creek sensor source.'});
    const active=[];
    if(packChartSources.has('sen0313'))active.push('SEN0313');
    if(packChartSources.has('mx2001'))active.push('MX2001');
    setText('packChartCount',total?total+' '+(flowMode?'flow':'stage')+' samples · '+active.join(' + '):'Select at least one Pack Creek sensor');
  }

  function renderSoilChart(target=document.getElementById('soilMoistureChart')){
    if(!target)return;
    const points=soilRows().map(r=>({x:new Date(r.observed_at).getTime(),y:Number(metric(r,'soil_moisture_percent')),iso:r.observed_at}));
    renderLineChart(target,[{name:'Wingate soil moisture',color:EXTRA.soil.color,points}],
      {axisLabel:'Soil moisture (%)',tooltipValue:v=>v.toFixed(1)+'%',strokeWidth:3.3,pointRadius:3.5,yMin:0,yMax:100,empty:'Waiting for soil moisture telemetry.'});
    setText('soilChartCount',points.length?points.length+' soil moisture samples · selected window':'Waiting for soil readings');
  }

  function openExpanded(titleText,renderer){
    const dialog=document.getElementById('expandDialog'),title=document.getElementById('expandTitle'),chart=document.getElementById('expandedChart'),mapEl=document.getElementById('expandedMap');
    if(!dialog||!title||!chart||!mapEl)return;
    title.textContent=titleText;mapEl.hidden=true;chart.hidden=false;dialog.showModal();
    setTimeout(()=>renderer(chart),40);
  }

  document.getElementById('packModeFlow')?.addEventListener('click',()=>{
    packChartMetric='flow';
    document.getElementById('packModeFlow')?.classList.add('active');
    document.getElementById('packModeStage')?.classList.remove('active');
    renderPackChart();
  });
  document.getElementById('packModeStage')?.addEventListener('click',()=>{
    packChartMetric='stage';
    document.getElementById('packModeStage')?.classList.add('active');
    document.getElementById('packModeFlow')?.classList.remove('active');
    renderPackChart();
  });
  const setPackSource=(source,buttonId)=>{
    const button=document.getElementById(buttonId);
    if(!button)return;
    button.addEventListener('click',()=>{
      if(packChartSources.has(source))packChartSources.delete(source);else packChartSources.add(source);
      button.setAttribute('aria-pressed',packChartSources.has(source)?'true':'false');
      renderPackChart();
    });
  };
  setPackSource('sen0313','packSource313');
  setPackSource('mx2001','packSource2001');
  document.getElementById('packChartExpand')?.addEventListener('click',()=>openExpanded(packChartMetric==='flow'?'Pack Creek flow':'Pack Creek stage',renderPackChart));
  document.getElementById('soilChartExpand')?.addEventListener('click',()=>openExpanded('Wingate soil moisture',renderSoilChart));

  const earlierSummary = renderSummary;
  renderSummary = function() {
    earlierSummary();
    const pt = packTemperatureRows()[0] || null;
    const ps = stageRows()[0] || null;
    const hs = hoboStageRows()[0] || null;
    const sm = soilRows()[0] || null;
    const ct = temperatureRows(EXTRA.cliff.node)[0] || null;
    const packDevice = deviceRows(EXTRA.pack.node)[0] || null;
    const soilDevice = deviceRows(EXTRA.soil.node)[0] || null;
    const cliffDevice = deviceRows(EXTRA.cliff.node)[0] || null;
    setText('packTemp', asTemp(pt));
    setText('packStage', asStage(ps));
    setText('packFlow', asDischarge(ps));
    setText('packUpdated', pt && ps ? 'Temp ' + ageText(pt.observed_at) + ' · Stage ' + ageText(ps.observed_at) : freshness(pt || ps));
    setText('packHeroBattery', cardBatteryText(packDevice));
    addStatus(document.getElementById('packState'), pt || ps, Boolean(pt && ps &&
      ageHours(pt.observed_at) <= STALE_AFTER_HOURS && ageHours(ps.observed_at) <= STALE_AFTER_HOURS));
    setText('soilMoisture', asPercent(sm));
    setText('soilAdc', sm && metric(sm, 'soil_adc10') != null ? 'ADC10 ' + metric(sm, 'soil_adc10') : 'ADC —');
    setText('soilUpdated', freshness(sm));
    setText('soilHeroBattery', cardBatteryText(soilDevice));
    addStatus(document.getElementById('soilState'), sm);
    setText('cliffTemp', asTemp(ct));
    setText('cliffUpdated', freshness(ct));
    setText('cliffHeroBattery', cardBatteryText(cliffDevice));
    addStatus(document.getElementById('cliffState'), ct);

    setText('packStageDetail', asStage(ps));
    setText('packFlowDetail', asDischarge(ps));
    setText('packTempDetailMain', asTemp(pt));
    setText('packStageAge', ps ? ageText(ps.observed_at) : '—');
    setText('packRatingStatus', ps ? (ps.discharge_rating_status === 'within_measured_range' ? 'within measured rating range' : ps.discharge_rating_status === 'extrapolated_high' ? 'above measured rating range' : ps.discharge_rating_status === 'extrapolated_low' ? 'below measured rating range' : 'rating curve applied') : 'waiting for data');
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
    const stageDifferenceFt = Number.isFinite(primaryStage) && Number.isFinite(hoboStage) ?
      Math.abs(primaryStage - hoboStage) : null;
    setText('packDetailDifference', Number.isFinite(stageDifferenceFt) ?
      stageDifferenceFt.toFixed(2) + ' ft (' + (stageDifferenceFt * 12).toFixed(2) + ' in)' : '—');
    const agreement = packAgreement(stageDifferenceFt);
    setText('packDetailAgreement', agreement.label);
    const agreementEl=document.getElementById('packDetailAgreement');
    if(agreementEl)agreementEl.className='sensor-agreement '+agreement.cls;
    refreshPackDifference24h();
    setText('soilMoistureDetail', asPercent(sm));
    setText('soilAdcDetail', sm && metric(sm, 'soil_adc10') != null ? String(metric(sm, 'soil_adc10')) : '—');
    setText('soilAgeDetail', sm ? ageText(sm.observed_at) : '—');
    setText('soilMoistureTime', freshness(sm));
    renderPackChart();
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
    const packFreshest = [pt, ps].filter(Boolean).sort((a,b)=>new Date(b.observed_at)-new Date(a.observed_at))[0] || null;
    const active = tempStations
      .concat(packFreshest && ageHours(packFreshest.observed_at) <= STALE_AFTER_HOURS ? [{name:EXTRA.pack.name,reading:packFreshest}] : [])
      .concat(sm && ageHours(sm.observed_at) <= STALE_AFTER_HOURS ? [{name:EXTRA.soil.name,reading:sm}] : []);
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

  function airTemperatureStations() {
    const stations = Object.values(STATIONS).map(s => ({
      node:Number(s.node),name:s.name,color:s.color,rows:temperatureRows(s.node)
    }));
    stations.push({
      node:EXTRA.cliff.node,name:EXTRA.cliff.name,color:EXTRA.cliff.color,
      rows:temperatureRows(EXTRA.cliff.node)
    });
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
    'Air-temperature history from monitored air stations. Pack Creek water temperature stays in the Pack Creek monitor.';
  renderAirTemperatureFilters();
  document.querySelectorAll('.station-hero .station-heading').forEach(heading => {
    const name = heading.querySelector('strong')?.textContent?.trim();
    const small = heading.querySelector('small');
    if (!small || !name || name === 'Pack Creek' || name === 'Wingate Moisture') return;
    if (!/air temperature/i.test(small.textContent) && ['Hidden Valley','Moab','Fishlake Hightop',"It's a Swell Day",'Thousand Lake Mountain','Cliff Sensor'].includes(name)) {
      small.textContent += ' · air temperature';
    }
  });
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
