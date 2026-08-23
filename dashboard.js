const STATION={
  id:'Pack Creek',
  node:3257761772,
  model:'MX2001',
  kind:'mx2001',
  interval:900,
  loggerMac:'F1:0D:9D:29:C3:2D',
  description:'Water level + temperature'
};

const state={hours:24,readings:[],latest:null,history:[]};
const $=id=>document.getElementById(id);
const els={
  status:$('status'),statusText:$('statusText'),stationStrip:$('stationStrip'),station:$('station'),logger:$('logger'),node:$('node'),sequence:$('sequence'),
  metric1Label:$('metric1Label'),metric1:$('metric1'),metric1Unit:$('metric1Unit'),metric2Label:$('metric2Label'),metric2:$('metric2'),metric2Unit:$('metric2Unit'),
  pipelineModel:$('pipelineModel'),pipelineNode:$('pipelineNode'),loggerStatus:$('loggerStatus'),loggerStatusDetail:$('loggerStatusDetail'),age:$('age'),packetTime:$('packetTime'),
  hops:$('hops'),relay:$('relay'),rssi:$('rssi'),snr:$('snr'),ble:$('ble'),bleDetail:$('bleDetail'),trendTitle:$('trendTitle'),trendSub:$('trendSub'),
  trend1:$('trend1'),trend1Detail:$('trend1Detail'),trend6:$('trend6'),trend6Detail:$('trend6Detail'),trend12:$('trend12'),trend12Detail:$('trend12Detail'),
  chart1Title:$('chart1Title'),chart1Count:$('chart1Count'),chart1:$('chart1'),chart2Title:$('chart2Title'),chart2Count:$('chart2Count'),chart2:$('chart2'),
  recentTitle:$('recentTitle'),recent:$('recent'),loggerList:$('loggerList'),networkSub:$('networkSub'),quality:$('quality'),sourceDetail:$('sourceDetail'),
  gatewayDetail:$('gatewayDetail'),relayDetail:$('relayDetail'),loggingInterval:$('loggingInterval'),updated:$('updated')
};

const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
const fFromC=c=>num(c)===null?null:Number(c)*9/5+32;
const temperatureF=r=>num(r?.metrics?.temperature_f)??fFromC(r?.temperature_c);
const levelFt=r=>num(r?.metrics?.water_level_ft);

function ageSeconds(iso){return Math.max(0,(Date.now()-new Date(iso).getTime())/1000)}
function ageText(iso){
  const sec=ageSeconds(iso);
  if(sec<60)return `${Math.round(sec)} sec`;
  if(sec<3600)return `${Math.round(sec/60)} min`;
  if(sec<86400)return `${(sec/3600).toFixed(1)} hr`;
  return `${(sec/86400).toFixed(1)} d`;
}
function stationState(reading=state.latest){
  if(!reading)return'offline';
  const sec=ageSeconds(reading.observed_at);
  if(sec<=STATION.interval*2)return'online';
  if(sec<=STATION.interval*4)return'stale';
  return'offline';
}
function loraSignal(rssi){
  if(rssi===null)return{label:'Unknown',cls:''};
  if(rssi>=-85)return{label:'Strong',cls:'signal-strong'};
  if(rssi>=-100)return{label:'Good',cls:'signal-good'};
  if(rssi>=-115)return{label:'Weak',cls:'signal-weak'};
  if(rssi>=-125)return{label:'Marginal',cls:'signal-marginal'};
  return{label:'Very weak',cls:'signal-bad'};
}
function bleSignal(rssi){
  if(rssi===null)return{label:'Not reported',cls:''};
  if(rssi>=-60)return{label:'Strong',cls:'signal-strong'};
  if(rssi>=-75)return{label:'Good',cls:'signal-good'};
  if(rssi>=-90)return{label:'Weak',cls:'signal-weak'};
  return{label:'Very weak',cls:'signal-bad'};
}
function relayLabel(radio){
  if(radio?.relay_name)return radio.relay_name;
  if(radio?.relay_id)return radio.relay_id;
  const n=num(radio?.relay_node);
  if(n!==null)return `relay …${Math.trunc(n).toString(16).padStart(2,'0')}`;
  return null;
}
function packetRoute(reading){
  if(!reading)return'No packet received';
  const radio=reading.radio||{};
  const hops=num(radio.hops_away);
  const gateway=radio.gateway||'gateway';
  const relay=relayLabel(radio);
  if(hops===0)return `${STATION.id} → ${gateway} (direct)`;
  if(hops===1&&relay)return `${STATION.id} → ${relay} → ${gateway}`;
  if(hops!==null&&relay)return `${STATION.id} → ${hops} hops (last ${relay}) → ${gateway}`;
  if(hops!==null)return `${STATION.id} → ${hops} hops → ${gateway}`;
  return `${STATION.id} → ${gateway}`;
}

function renderOverallStatus(){
  const st=stationState();
  els.status.classList.remove('online','offline');
  if(st==='online'){
    els.status.classList.add('online');
    els.statusText.textContent='Pack Creek online';
  }else if(st==='stale'){
    els.statusText.textContent='Pack Creek stale';
  }else{
    els.status.classList.add('offline');
    els.statusText.textContent='Pack Creek offline';
  }
}
function renderStationStrip(){
  const r=state.latest,st=stationState(r),tf=temperatureF(r),lv=levelFt(r);
  const primary=lv===null?'—':`${lv.toFixed(2)} ft`;
  const detail=r?`${tf===null?'No temperature':`${tf.toFixed(1)}°F`} · ${ageText(r.observed_at)} ago`:'No cloud data';
  els.stationStrip.innerHTML=`<div class="station-card active"><div><div class="station-card-top"><div><div class="station-card-name">${STATION.id}</div><div class="station-card-model">${STATION.model} · ${STATION.description}</div></div><div class="station-state ${st}">${st}</div></div></div><div><div class="station-card-reading">${primary}</div><div class="station-card-detail">${detail}</div></div></div>`;
}
function renderSummary(){
  const latest=state.latest,st=stationState(latest);
  els.station.textContent=STATION.id;
  els.logger.textContent=`${STATION.model} · ${STATION.loggerMac}`;
  els.node.textContent=`Node ${STATION.node}`;
  els.pipelineModel.textContent=STATION.model;
  els.pipelineNode.textContent='Pack Creek field node';
  els.loggingInterval.textContent='15 minutes';
  els.networkSub.textContent='Latest Pack Creek packet';
  els.loggerStatus.textContent=st==='online'?'Online':st==='stale'?'Stale':'Offline';
  els.loggerStatus.className=`card-value ${st==='online'?'signal-strong':st==='stale'?'signal-weak':'signal-bad'}`;
  els.loggerStatusDetail.textContent='MX2001 · 15 min logging';

  if(!latest){
    els.sequence.textContent='Packet —';els.metric1.textContent='—';els.metric2.textContent='—';els.age.textContent='—';els.packetTime.textContent='Waiting for data';
    els.hops.textContent='—';els.relay.textContent='No packet received';els.rssi.textContent='—';els.snr.textContent='RSSI / SNR unavailable';els.ble.textContent='—';
    els.bleDetail.textContent='Logger → field node';els.quality.textContent='—';els.sourceDetail.textContent=`${STATION.node}`;els.gatewayDetail.textContent='—';els.relayDetail.textContent='—';
    return;
  }

  const m=latest.metrics||{},radio=latest.radio||{},tf=temperatureF(latest),lv=levelFt(latest),rssi=num(radio.rssi),snr=num(radio.snr),ble=num(m.ble_rssi_dbm),hops=num(radio.hops_away),ls=loraSignal(rssi),bs=bleSignal(ble);
  els.sequence.textContent=`Sequence ${m.sequence??'—'}`;
  els.metric1Label.textContent='Water level';els.metric1.textContent=lv===null?'—':lv.toFixed(2);els.metric1Unit.textContent='feet · MX2001';
  els.metric2Label.textContent='Water temperature';els.metric2.textContent=tf===null?'—':tf.toFixed(1);els.metric2Unit.textContent='°F · MX2001';
  els.age.textContent=ageText(latest.observed_at);els.packetTime.textContent=new Date(latest.observed_at).toLocaleString();
  els.hops.textContent=hops===null?'—':`${hops} hop${hops===1?'':'s'}`;
  els.relay.textContent=packetRoute(latest);
  els.rssi.textContent=rssi===null?'—':`${rssi} dBm`;els.rssi.className=`card-value ${ls.cls}`;
  els.snr.textContent=`${ls.label}${snr===null?'':` · SNR ${snr.toFixed(2)} dB`}`;
  els.ble.textContent=ble===null?'Not sent':`${ble} dBm`;els.ble.className=`card-value ${bs.cls}`;
  els.bleDetail.textContent=ble===null?'MX2001 BLE RSSI not reported':`${bs.label} · logger → Pack Creek`;
  els.quality.textContent=ls.label;els.quality.className=`radio-big ${ls.cls}`;
  els.sourceDetail.textContent=`${latest.node_num}`;els.gatewayDetail.textContent=radio.gateway||'—';els.relayDetail.textContent=relayLabel(radio)||((hops===0)?'Direct':'—');
}
function renderLoggers(){
  const st=stationState(),r=state.latest;
  els.loggerList.innerHTML=`<div class="logger-item"><span class="logger-dot ${st}"></span><div><div class="logger-name">Pack Creek · MX2001</div><div class="logger-meta">Node ${STATION.node} · 15 min logging${r?` · last ${ageText(r.observed_at)} ago`:''}</div></div><div class="logger-state ${st}">${st}</div></div>`;
}
function trendAt(hours){
  const latest=state.latest,current=levelFt(latest);
  if(!latest||current===null)return null;
  const latestT=new Date(latest.observed_at).getTime(),target=latestT-hours*3600000;
  const rows=state.history.filter(r=>levelFt(r)!==null&&new Date(r.observed_at).getTime()<latestT-1000);
  let best=null,bestDiff=Infinity;
  for(const r of rows){const d=Math.abs(new Date(r.observed_at).getTime()-target);if(d<bestDiff){best=r;bestDiff=d}}
  const tolerance=Math.min(90*60*1000,Math.max(20*60*1000,hours*.25*3600000));
  if(!best||bestDiff>tolerance)return null;
  const prior=levelFt(best),elapsed=(latestT-new Date(best.observed_at).getTime())/3600000;
  return{delta:current-prior,prior,current,elapsed};
}
function setTrend(valueEl,detailEl,hours){
  const t=trendAt(hours);
  if(!t){valueEl.textContent='—';valueEl.className='trend-value';detailEl.textContent='Not enough history yet';return}
  const eps=.005,dir=t.delta>eps?'up':t.delta<-eps?'down':'flat',arrow=dir==='up'?'↑':dir==='down'?'↓':'→',sign=t.delta>eps?'+':'';
  valueEl.textContent=`${arrow} ${sign}${t.delta.toFixed(2)} ft`;valueEl.className=`trend-value trend-${dir}`;
  detailEl.textContent=`${t.prior.toFixed(2)} → ${t.current.toFixed(2)} ft · ${t.elapsed.toFixed(1)} hr`;
}
function renderTrends(){
  els.trendTitle.textContent='Water level trend';
  els.trendSub.textContent='Change in stage from the closest stored reading at each lookback';
  setTrend(els.trend1,els.trend1Detail,1);setTrend(els.trend6,els.trend6Detail,6);setTrend(els.trend12,els.trend12Detail,12);
}
function renderTable(){
  els.recentTitle.textContent='Recent Pack Creek readings';
  const rows=state.readings.slice(0,20);
  if(!rows.length){els.recent.innerHTML='<tr><td colspan="8">No readings in this time window.</td></tr>';return}
  els.recent.innerHTML=rows.map(r=>{const radio=r.radio||{},tf=temperatureF(r),lv=levelFt(r),rv=num(radio.rssi),sig=loraSignal(rv);return `<tr><td>${new Date(r.observed_at).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'})}</td><td>Pack Creek</td><td>MX2001</td><td class="right accent">${lv===null?'—':lv.toFixed(2)}</td><td class="right">${tf===null?'—':tf.toFixed(1)}</td><td class="right">${radio.hops_away??'—'}</td><td class="right mono ${sig.cls}">${radio.rssi??'—'}</td><td class="right mono">${radio.snr===null||radio.snr===undefined?'—':Number(radio.snr).toFixed(2)}</td></tr>`}).join('');
}
function windowLabel(hours){if(hours===1)return'1 hour';if(hours===6)return'6 hours';if(hours===12)return'12 hours';if(hours===24)return'24 hours';if(hours===168)return'7 days';return'30 days'}
function drawChart(target,rows,valueFn,opts){
  const points=rows.map(r=>({t:new Date(r.observed_at).getTime(),v:valueFn(r)})).filter(p=>Number.isFinite(p.v)).reverse();
  opts.count.textContent=`${points.length} reading${points.length===1?'':'s'} · ${windowLabel(state.hours)}`;
  if(points.length<2){target.innerHTML=`<div class="empty">${points.length?'One reading stored in this window.':'No telemetry in this window.'}</div>`;return}
  const W=1000,H=330,L=65,R=20,T=22,B=44,minT=Math.min(...points.map(p=>p.t)),maxT=Math.max(...points.map(p=>p.t));
  let minV=Math.min(...points.map(p=>p.v)),maxV=Math.max(...points.map(p=>p.v));
  if(maxV-minV<opts.minSpan){const mid=(minV+maxV)/2;minV=mid-opts.minSpan/2;maxV=mid+opts.minSpan/2}
  const pad=(maxV-minV)*.12;minV-=pad;maxV+=pad;
  const x=t=>L+((t-minT)/Math.max(1,maxT-minT))*(W-L-R),y=v=>T+(1-(v-minV)/(maxV-minV))*(H-T-B);
  const path=points.map((p,i)=>`${i?'L':'M'} ${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const ticks=Array.from({length:5},(_,i)=>minV+(maxV-minV)*i/4).map(v=>`<line x1="${L}" y1="${y(v)}" x2="${W-R}" y2="${y(v)}" stroke="rgba(163,211,226,.10)"/><text x="${L-10}" y="${y(v)+4}" text-anchor="end" fill="#78929c" font-size="12">${v.toFixed(opts.decimals)}${opts.unit}</text>`).join('');
  const start=new Date(minT).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}),end=new Date(maxT).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  target.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img"><g>${ticks}</g><path d="${path}" fill="none" stroke="currentColor" stroke-width="3"/><text x="${L}" y="${H-12}" fill="#78929c" font-size="12">${start}</text><text x="${W-R}" y="${H-12}" text-anchor="end" fill="#78929c" font-size="12">${end}</text></svg>`;
}
function renderCharts(){
  els.chart1Title.textContent='Water level';els.chart2Title.textContent='Water temperature';
  drawChart(els.chart1,state.readings,levelFt,{count:els.chart1Count,minSpan:.1,decimals:2,unit:' ft'});
  drawChart(els.chart2,state.readings,temperatureF,{count:els.chart2Count,minSpan:2,decimals:1,unit:'°F'});
}
async function getJson(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`${r.status} ${r.statusText}`);return r.json()}
function bucketFor(hours){if(hours<=24)return 0;if(hours<=168)return 15;return 60}
async function load(){
  try{
    const bucket=bucketFor(state.hours),suffix=bucket?`&bucket_minutes=${bucket}`:'';
    const [windowData,latestData,historyData]=await Promise.all([
      getJson(`/api/readings?hours=${state.hours}&limit=5000&node=${STATION.node}${suffix}`),
      getJson(`/api/readings?hours=8760&limit=1&node=${STATION.node}`),
      getJson(`/api/readings?hours=24&limit=5000&node=${STATION.node}`)
    ]);
    state.readings=windowData.readings||[];state.latest=(latestData.readings||[])[0]||state.readings[0]||null;state.history=historyData.readings||[];
    renderOverallStatus();renderStationStrip();renderSummary();renderLoggers();renderTrends();renderCharts();renderTable();
    els.updated.textContent=`Updated ${new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit',second:'2-digit'})}`;
  }catch(err){
    console.error(err);els.status.classList.add('offline');els.statusText.textContent='Cloud data unavailable';els.updated.textContent='Refresh failed';
  }
}

document.querySelectorAll('.shared-tabs button').forEach(btn=>btn.addEventListener('click',()=>{
  state.hours=Number(btn.dataset.hours);
  document.querySelectorAll('.shared-tabs button').forEach(b=>b.classList.toggle('active',Number(b.dataset.hours)===state.hours));
  load();
}));

load();
setInterval(load,60000);
