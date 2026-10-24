(() => {
'use strict';
const DASHBOARD_BUILD = '20261024-matheson-groundwater-30d-trends-v22';
const $=id=>document.getElementById(id);
const SITES={1949224949:{name:'Pack Creek',detail:'Pack Creek above confluence with Mill Creek · 4,020 ft',kind:'creek',sensor:'SEN0313',flow:true},1695962694:{name:'South Cottonwood',detail:'S. Cottonwood at HWY 95 · 5,200 ft',kind:'creek',sensor:'MB7388',flow:false},2425602407:{name:'Cottonwood Relay',detail:'Elk Ridge · 7,900 ft',kind:'relay',sensor:'Air temperature sensor',flow:false},2004386937:{name:'Matheson Groundwater',detail:'U18 USGS Matheson Wetlands Well · Matheson Wetlands Preserve',kind:'groundwater',sensor:'HOBO MX2001',flow:false}};
const site=()=>SITES[state.node];
const state={node:1949224949,hours:12,metric:'flow',readings:[],latest:[],recent:[],allRecent:[],allReadings:[],allLatest:[],trendReadings:[],stationInfo:[],sampleIntervalHours:null,sensorEvents:[],cc01Polling:null,measurementPage:0,measurementPageSize:12,busy:false};
const n=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
const valid=r=>!(Number(r.node_num)===2004386937&&r.telemetry_type==='mx2001'&&new Date(r.observed_at).getTime()<MATHESON_MX_FINAL_INSTALLED_AT)&&Object.hasOwn(SITES,Number(r.node_num))&&(r.telemetry_type==='device'||(Number(r.node_num)===2425602407?r.telemetry_type==='environment':Number(r.node_num)===2004386937?['rugged_troll','mx2001','environment'].includes(r.telemetry_type):['water_distance','mx2001'].includes(r.telemetry_type)));
const stage=r=>r?.metrics?.stage_calibrated===false||r?.metrics?.distance_valid===false?null:n(r?.metrics?.water_level_ft);
const temp=r=>{if(!['rugged_troll','mx2001','environment'].includes(r?.telemetry_type))return null;const fahrenheit=n(r?.metrics?.temperature_f),celsius=n(r?.temperature_c??r?.metrics?.temperature_c);return fahrenheit!==null?fahrenheit:celsius!==null?celsius*9/5+32:null;};
const battery=r=>{const v=n(r?.metrics?.battery_level??r?.metrics?.battery_percent??r?.metrics?.battery_pct);return r?.telemetry_type==='device'&&v!==null&&v>=0&&v<=100?v:null;};
const batteryVoltage=r=>{const v=n(r?.metrics?.voltage??r?.metrics?.battery_voltage);return r?.telemetry_type==='device'&&v!==null&&v>0&&v<7?v:null;};
const sensorLabel=r=>r.telemetry_type==='device'?'Device battery':r.telemetry_type==='rugged_troll'?'In-Situ Rugged TROLL 100':r.telemetry_type==='mx2001'?(r?.metrics?.field_observation?'HOBO MX2001 · installation field reading':'HOBO MX2001'):r.telemetry_type==='environment'?(site().kind==='relay'?'Air temperature':'Water temperature'):site().sensor;
// CC01 Heltec V6 explicitly marks parsed DM replies. Existing unmarked MX/DS
// sensor packets are the automatic route; do not infer provenance by arrival time.
function transmissionLabel(r){
 if(Number(r?.node_num)!==1695962694||!['water_distance','mx2001'].includes(r?.telemetry_type))return null;
 const source=r?.metrics?.source;
 if(source==='heltec_dm')return 'Heltec DM';
 if(source===undefined||source===null||source==='')return 'Auto TX';
 return 'Unknown';
}
const transmissionDetail=r=>transmissionLabel(r)?' · '+transmissionLabel(r):'';
const flow=r=>stage(r)!==null?n(r?.discharge_cfs):null;
const date=iso=>new Date(iso).toLocaleString('en-US',{timeZone:'America/Denver',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
const shortDate=ms=>new Date(ms).toLocaleString('en-US',{timeZone:'America/Denver',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const value=(v,d=2)=>v===null?'—':v.toFixed(d);
// Format ultrasonic and HOBO stage for display only; never round the data before rating calculations or CSV export.
const displayStage=feet=>value(feet,2);
const MATHESON_TROLL_SENSOR_DEPTH_TOC_FT=35.30;
const MATHESON_MX_FINAL_SENSOR_DEPTH_TOC_FT=18.25;
const MATHESON_MX_FINAL_INSTALLED_AT=Date.parse('2026-10-23T21:35:00Z');
const MATHESON_TOC_ELEVATION_FT=3968.52;
const MATHESON_LAND_SURFACE_ELEVATION_FT=3966.78;
const SINCE_INCEPTION_HOURS=1000000;
const mathesonSensorDepth=r=>r?.telemetry_type==='rugged_troll'?MATHESON_TROLL_SENSOR_DEPTH_TOC_FT:r?.telemetry_type==='mx2001'&&new Date(r.observed_at).getTime()>=MATHESON_MX_FINAL_INSTALLED_AT?MATHESON_MX_FINAL_SENSOR_DEPTH_TOC_FT:null;
const mathesonDepth=r=>{const water=stage(r),sensorDepth=mathesonSensorDepth(r);return water===null||sensorDepth===null?null:sensorDepth-water;};
const mathesonElevation=r=>{const depth=mathesonDepth(r);return depth===null?null:MATHESON_TOC_ELEVATION_FT-depth;};
const metrics={flow:{label:'Estimated discharge',unit:'cfs',convert:flow,color:'#2c7e70',decimals:2},stage:{label:'Creek stage',unit:'ft',convert:stage,color:'#2c7e70',decimals:2},elevation:{label:'Water-surface elevation',unit:'ft',convert:mathesonElevation,color:'#486a8a',decimals:2},temp:{label:'Water temperature',unit:'°F',convert:temp,color:'#a26743',decimals:1},battery:{label:'Battery charge',unit:'%',convert:battery,color:'#65759b',decimals:0}};
function latest(type,convert){return state.latest.find(r=>r.telemetry_type===type&&convert(r)!==null);}

const KNOWN_RELAY_SUFFIXES={'33':'AF33 (Gold Knob)'};
const KNOWN_RELAY_NODES={
 '!b57d051f':'Hidden Valley',
 '!4d594874':'Nuka-Cola',
 '!742ecff5':'Pack Creek',
 '!65165646':'South Cottonwood',
 '!9093c167':'Cottonwood Relay',
 '!a35a4bf4':'Heltec / Moab'
};
const htmlSafe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const radio=r=>r?.radio&&typeof r.radio==='object'?r.radio:{};
function routeHops(r){
 const x=radio(r),reported=n(x.hops_away??x.hops_used);
 if(reported!==null&&Number.isInteger(reported)&&reported>=0)return reported;
 const start=n(x.hop_start),remaining=n(x.hop_limit);
 return start!==null&&remaining!==null&&start>=remaining&&remaining>=0?start-remaining:null;
}
function routeHasData(r){
 const x=radio(r);return routeHops(r)!==null||n(x.rssi)!==null||n(x.snr)!==null||
  x.relay_node!==null&&x.relay_node!==undefined||Boolean(x.relay_name||x.relay_id||x.gateway);
}
function routeRelay(r){
 const x=radio(r),h=routeHops(r);
 if(h===0)return 'Direct (no relay)';
 if(h===null)return 'Unknown';
 if(typeof x.relay_name==='string'&&x.relay_name.trim())return x.relay_name.trim()+' (reported)';
 const full=typeof x.relay_id==='string'?x.relay_id.toLowerCase():null;
 if(full&&KNOWN_RELAY_NODES[full])return KNOWN_RELAY_NODES[full]+' (full ID)';
 let last=n(x.relay_node);
 if(last===null&&typeof x.relay_node==='string'&&/^0x[0-9a-f]{1,2}$/i.test(x.relay_node))last=parseInt(x.relay_node,16);
 if(last===null||!Number.isInteger(last)||last<0||last>255)return 'Unknown';
 const suffix=last.toString(16).padStart(2,'0');
 const matches=Object.entries(KNOWN_RELAY_NODES).filter(([id])=>id.endsWith(suffix));
 return KNOWN_RELAY_SUFFIXES[suffix]||(matches.length===1?matches[0][1]+' (ID suffix only)':'0x'+suffix.toUpperCase()+' (unidentified)');
}
function routeGateway(r){
 const g=radio(r).gateway;
 if(g===null||g===undefined||!String(g).trim())return 'Not reported';
 const value=String(g).trim();
 if(value.toLowerCase()==='!'+Number(r.node_num).toString(16))return 'Not reported';
 return KNOWN_RELAY_NODES[value.toLowerCase()]||value;
}
function routeSignal(r){
 const x=radio(r),rssi=n(x.rssi),snr=n(x.snr),pieces=[];
 if(rssi!==null)pieces.push(rssi.toFixed(0)+' dBm');
 if(snr!==null)pieces.push(snr.toFixed(1)+' dB SNR');
 return pieces.join(' · ')||'Not reported';
}
function renderRoutes(){
 const packets=[...new Map([...state.recent,...state.readings].filter(routeHasData).map(r=>[String(r.id??r.observed_at+r.telemetry_type),r])).values()].sort((a,b)=>new Date(b.observed_at)-new Date(a.observed_at));
 const newest=[...state.latest,...state.readings].filter(routeHasData).sort((a,b)=>new Date(b.observed_at)-new Date(a.observed_at))[0];
 $('routeHopCount').textContent=newest?(routeHops(newest)===null?'Unknown':String(routeHops(newest))):'—';
 $('routeLastRelay').textContent=newest?routeRelay(newest):'—';
 $('routeGateway').textContent=newest?routeGateway(newest):'—';
 $('routeSignal').textContent=newest?routeSignal(newest):'—';
 $('routePacketTime').textContent=newest?'Packet observed '+date(newest.observed_at):'No radio metadata reported';
 const count=newest?routeHops(newest):null;
 $('routeSummary').textContent=!newest?'Route unknown. The gateway has not supplied radio metadata for this station.':
  count===0?'Latest reported packet reached the receiving gateway directly (0 relay hops).':
  count===null?'Relay count unavailable for this packet.':
  'Latest reported packet used '+count+' relay hop'+(count===1?'':'s')+'. Only the last relay identifier may be available.';
 const cutoff=Date.now()-24*3600000;
 const recent=packets.filter(r=>new Date(r.observed_at).getTime()>=cutoff).slice(0,12);
 $('routeRows').innerHTML=recent.map(r=>'<tr><td>'+htmlSafe(date(r.observed_at))+'</td><td>'+htmlSafe(sensorLabel(r)+transmissionDetail(r))+'</td><td>'+
  htmlSafe(routeHops(r)??'—')+'</td><td>'+htmlSafe(routeRelay(r))+'</td><td>'+htmlSafe(routeSignal(r))+'</td></tr>').join('')||
  '<tr><td colspan="5">No route metadata in the last 24 hours.</td></tr>';
}


function configuredRating(){
 const station=state.stationInfo.find(v=>Number(v.node_num)===state.node);
 const c=station?.rating_curve;
 return site().kind==='creek'&&c&&[c.coefficient_a,c.stage_offset_ft,c.exponent_b].every(v=>n(v)!==null)?c:null;
}
function showRatingEquation(){
 const box=$('ratingEquation'),curve=configuredRating();
 box.hidden=!curve;if(!curve){$('ratingFormula').textContent='';$('ratingRange').textContent='';return;}
 const fmt=x=>Number(n(x).toPrecision(6)).toString();
 const offset=n(curve.stage_offset_ft),sign=offset<0?'+':'−';
 $('ratingFormula').innerHTML='Q = <strong>'+fmt(curve.coefficient_a)+'</strong> × (h '+sign+' '+fmt(Math.abs(offset))+')<sup>'+fmt(curve.exponent_b)+'</sup>';
 $('ratingVersion').textContent='VERSION '+String(curve.curve_version??'—');
 const min=n(curve.valid_stage_min_ft),max=n(curve.valid_stage_max_ft);
 $('ratingRange').textContent='Q in cfs · h = calibrated stage in feet'+(min!==null&&max!==null?' · measured rating range '+min.toFixed(3)+'–'+max.toFixed(3)+' ft':'');
}
// Trends are short-term measured changes, not long-term statistical trend tests.
function shortTrend(type,convert,windowHours,minSpanHours,staleHours,baseThreshold,relativeThreshold){
 const candidates=(state.recent.length?state.recent:state.readings)
  .filter(r=>r.telemetry_type===type&&convert(r)!==null)
  .sort((a,b)=>new Date(a.observed_at)-new Date(b.observed_at));
 const newest=candidates.at(-1);if(!newest)return null;
 const end=new Date(newest.observed_at).getTime();
 if(!Number.isFinite(end)||end>Date.now()+60000||Date.now()-end>staleHours*3600000)return null;
 const older=candidates.find(r=>{const t=new Date(r.observed_at).getTime();return t>=end-windowHours*3600000&&t<end;});
 if(!older)return null;
 const span=(end-new Date(older.observed_at).getTime())/3600000;
 if(span<minSpanHours)return null;
 const startValue=convert(older),endValue=convert(newest),delta=endValue-startValue;
 const tolerance=Math.max(baseThreshold,Math.abs(startValue)*relativeThreshold);
 return {direction:delta>tolerance?'up':delta< -tolerance?'down':'flat',delta,span,windowHours};
}

// Groundwater responds on longer time scales than stream stage. Use a 30-day
// least-squares trend through daily medians so hourly barometric and thermal
// noise cannot control the direction indicator.
function median(values){
 const sorted=values.slice().sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);
 return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
}
function groundwaterTrend(convert,baseThreshold){
 const merged=[...state.trendReadings,...state.readings],seen=new Set();
 const candidates=merged.filter(r=>{
  if(!['rugged_troll','mx2001'].includes(r.telemetry_type)||convert(r)===null)return false;
  const key=String(r.source_id??r.id??(r.telemetry_type+'|'+r.observed_at));
  if(seen.has(key))return false;seen.add(key);return true;
 }).sort((a,b)=>new Date(a.observed_at)-new Date(b.observed_at));
 const newest=candidates.at(-1);if(!newest)return null;
 const end=Date.parse(newest.observed_at),dayMs=86400000,windowDays=30;
 if(!Number.isFinite(end)||end>Date.now()+60000||Date.now()-end>7*3600000)return null;
 const buckets=new Map();
 for(const r of candidates){
  const t=Date.parse(r.observed_at),v=convert(r);
  if(!Number.isFinite(t)||t<end-windowDays*dayMs||t>end||v===null)continue;
  const day=Math.floor(t/dayMs);
  if(!buckets.has(day))buckets.set(day,[]);
  buckets.get(day).push(v);
 }
 const daily=[...buckets].map(([day,values])=>({x:day,y:median(values)})).sort((a,b)=>a.x-b.x);
 if(daily.length<21)return null;
 const span=daily.at(-1).x-daily[0].x;
 if(span<21)return null;
 const meanX=daily.reduce((sum,p)=>sum+p.x,0)/daily.length;
 const meanY=daily.reduce((sum,p)=>sum+p.y,0)/daily.length;
 const denominator=daily.reduce((sum,p)=>sum+(p.x-meanX)**2,0);
 if(!denominator)return null;
 const slope=daily.reduce((sum,p)=>sum+(p.x-meanX)*(p.y-meanY),0)/denominator;
 const delta=slope*span;
 return {direction:delta>baseThreshold?'up':delta< -baseThreshold?'down':'flat',delta,span,windowDays,points:daily.length,method:'least-squares slope through daily medians'};
}

/* Flood evidence, not proof the HOBO was destroyed. Include rises that
   peaked and receded within the last three hours. */
function recentFloodRise(ultrasonic,hoboTime,measuredFlow,now){
 const convert=measuredFlow?flow:stage;
 let strongest=null;
 for(let i=0;i<ultrasonic.length-1;i++){
  const first=ultrasonic[i],firstTime=Date.parse(first.observed_at),firstValue=convert(first);
  if(firstValue===null||!Number.isFinite(firstValue))continue;
  for(let j=i+1;j<ultrasonic.length;j++){
   const crest=ultrasonic[j],crestTime=Date.parse(crest.observed_at),crestValue=convert(crest);
   if(crestValue===null||!Number.isFinite(crestValue))continue;
   if(crestTime-firstTime<30*60000||crestTime<now-3*3600000||
      crestTime<hoboTime-30*60000)continue;
   const rise=crestValue-firstValue;
   const threshold=measuredFlow?Math.max(0.25,Math.abs(firstValue)*0.10):
    Math.max(0.15,Math.abs(firstValue)*0.03);
   if(rise<threshold)continue;
   if(!strongest||rise>strongest.rise)strongest={rise,firstTime,crestTime};
  }
 }
 return strongest;
}
function hoboFloodEvidence(){
 if(site().kind!=='creek')return null;
 const now=Date.now(),hour=3600000;
 const hobo=state.latest.find(r=>r.telemetry_type==='mx2001'&&(stage(r)!==null||temp(r)!==null));
 if(!hobo)return null;
 const hoboTime=Date.parse(hobo.observed_at);
 if(!Number.isFinite(hoboTime)||hoboTime>now+60000||now-hoboTime<1*hour)return null;
 const ultrasonic=state.recent.filter(r=>r.telemetry_type==='water_distance'&&stage(r)!==null)
  .filter(r=>{const t=Date.parse(r.observed_at);return Number.isFinite(t)&&t<=now+60000&&t>=now-3*hour;})
  .sort((a,b)=>Date.parse(a.observed_at)-Date.parse(b.observed_at));
 if(ultrasonic.length<2||now-Date.parse(ultrasonic.at(-1).observed_at)>hour)return null;
 const afterHobo=ultrasonic.filter(r=>Date.parse(r.observed_at)>hoboTime);
 if(afterHobo.length<2||Date.parse(afterHobo.at(-1).observed_at)-Date.parse(afterHobo[0].observed_at)<20*60000)return null;
 const measuredFlow=site().flow,rise=recentFloodRise(ultrasonic,hoboTime,measuredFlow,now);
 if(!rise)return null;
 return {hoboHours:(now-hoboTime)/hour,measuredFlow,rise:rise.rise,
  riseSpanHours:(rise.crestTime-rise.firstTime)/hour};
}
function renderHoboFloodWarning(){
 const badge=$('hoboFloodWarning');
 if(!badge)return;
 const evidence=hoboFloodEvidence();
 badge.hidden=!evidence;badge.textContent='';
 if(!evidence)return;
 const title=document.createElement('strong');
 title.textContent='Likely destroyed in flash flood (unconfirmed)';
 const detail=document.createElement('span');
 detail.textContent=' No valid HOBO reading for '+evidence.hoboHours.toFixed(1)+' hours. Ultrasonic readings show '+(evidence.measuredFlow?'estimated discharge':'stage (discharge is not rated)')+' rose '+evidence.rise.toFixed(2)+(evidence.measuredFlow?' cfs':' ft')+' over '+evidence.riseSpanHours.toFixed(1)+' hours during the last 3 hours, even if now receding. Inspect the site: BLE, radio or power failure could also explain this.';
 badge.append(title,detail);
}

function setTrend(id,trend,unit){
 const el=$(id);if(!el)return;
 if(!trend){el.className='trend-indicator trend-unavailable';el.textContent='Trend unavailable · insufficient data for the selected trend period';el.title='';return;}
 const arrow={up:'↑',down:'↓',flat:'→'}[trend.direction];
 const word={up:'Rising',down:'Falling',flat:'Steady'}[trend.direction];
 const decimals=unit==='cfs'||unit==='ft'?2:1;
 const period=trend.windowDays?'over '+trend.windowDays+' days':'/ '+trend.span.toFixed(1)+'h';
 el.className='trend-indicator trend-'+trend.direction;
 el.innerHTML='<span class="trend-arrow" aria-hidden="true">'+arrow+'</span> '+word+' · '+(trend.delta>0?'+':'')+trend.delta.toFixed(decimals)+' '+unit+' '+period;
 el.title=trend.windowDays?trend.windowDays+'-day trend · '+trend.method+' · '+trend.points+' daily medians':trend.windowHours+'h observation window · comparison of measured values';
}
function renderTrends(){
 const groundwater=site().kind==='groundwater';
 setTrend('flowTrend',site().flow?shortTrend('water_distance',flow,3,0.75,1.5,0.10,0.025):null,'cfs');
 setTrend('waterElevationTrend',groundwater?groundwaterTrend(mathesonElevation,0.05):null,'ft');
 setTrend('tempTrend',groundwater?groundwaterTrend(temp,0.2):shortTrend(site().kind==='relay'?'environment':'mx2001',temp,6,2,3,0.5,0),'°F');
}

// Reconcile older HTML still open/cached in a browser with the current JS.
// Never fail an entire station refresh because a newer presentational ID
// was absent from the already-open page.
function ensureMeasurementMarkup(){
 const stageCard=$('stageCard');
 if(!$('stageLabel')&&stageCard){
  const heading=stageCard.querySelector('.eyebrow');
  if(heading)heading.id='stageLabel';
 }
 if(!$('waterElevationCard')&&stageCard){
  const card=document.createElement('article');card.className='reading';card.id='waterElevationCard';card.hidden=true;card.innerHTML='<p class="eyebrow">Water-surface elevation</p><div class="number"><strong id="waterElevation">—</strong><span>ft</span></div><p id="waterElevationTime" class="timestamp">Waiting for groundwater observations</p><div id="waterElevationTrend" class="trend-indicator trend-unavailable" aria-live="polite">Trend unavailable</div><div class="reading-foot">Calculated from the 3,968.52 ft top-of-casing reference elevation</div>';stageCard.insertAdjacentElement('afterend',card);
 }
 const groundwaterCard=$('waterElevationCard');
 if(groundwaterCard&&!$('waterElevationTrend')){
  const trend=document.createElement('div');trend.id='waterElevationTrend';trend.className='trend-indicator trend-unavailable';trend.setAttribute('aria-live','polite');trend.textContent='Trend unavailable';
  groundwaterCard.querySelector('.reading-foot')?.insertAdjacentElement('beforebegin',trend);
 }
 const metricTabs=document.querySelector('[data-metric="stage"]')?.parentElement;
 if(metricTabs&&!metricTabs.querySelector('[data-metric="elevation"]'))metricTabs.insertAdjacentHTML('afterbegin','<button data-metric="elevation" type="button" aria-pressed="false" hidden>Water-surface elevation</button>');
 if(!$('hoboStageCard')&&stageCard){
  const card=document.createElement('article');
  card.className='reading';
  card.id='hoboStageCard';
  card.hidden=true;
  card.innerHTML='<p class="eyebrow">HOBO MX2001 stage</p><div class="number"><strong id="hoboStageCurrent">—</strong><span>ft</span></div><p id="hoboStageTime" class="timestamp">Waiting for HOBO stage</p><div class="reading-foot">Independent pressure-based stage · HOBO MX2001</div>';
  stageCard.insertAdjacentElement('afterend',card);
 }
 const table=$('rows')?.closest('table');
 if(table){
  table.classList.add('measurement-table');
  const header=table.querySelector('thead tr');
  if(header&&!header.id)header.id='measurementHead';
  if(!$('measurementPagination')){
   const pager=document.createElement('div');
   pager.id='measurementPagination';
   pager.className='measurement-pagination';
   pager.hidden=true;
   pager.innerHTML='<button id="measurementPrev" type="button">← Previous</button><span id="measurementPageStatus" aria-live="polite">Page 1 of 1</span><button id="measurementNext" type="button">Next →</button>';
   table.closest('.table-scroll')?.insertAdjacentElement('afterend',pager);
  }
 }
 if(!$('stationSubtitle')&&$('stationTitle')){
  const subtitle=document.createElement('p');
  subtitle.id='stationSubtitle';
  subtitle.className='station-location';
  $('stationTitle').insertAdjacentElement('afterend',subtitle);
 }
}
function renderSensorDiagnostics(){
 for(const [kind,type,ids] of [['water','water_distance',['cc01WaterWarning']],
     ['hobo','mx2001',['cc01HoboWarning','cc01TempWarning']]]){
   const last=state.sensorEvents.find(e=>Number(e.node_num)===1695962694&&e.sensor===kind);
   const latest=state.allLatest.find(r=>Number(r.node_num)===1695962694&&r.telemetry_type===type &&
       (type==='mx2001'?temp(r)!==null:stage(r)!==null));
   const cleared=latest && last && new Date(latest.received_at).getTime()>new Date(last.received_at).getTime();
   const suspended=state.cc01Polling && (kind==='water'?state.cc01Polling.applied_water_enabled===false:state.cc01Polling.applied_hobo_enabled===false);
   const active=state.node===1695962694&&!!last&&!cleared&&!suspended;
   const label=kind==='water'?'Needs maintenance':last?.status==='ble_unavailable'?'BLE to HOBO unavailable':'HOBO read failed';
   for(const id of ids){const el=$(id);if(!el)continue;el.hidden=!active;
     if(active)el.textContent=label+' · reported '+date(last.received_at);
   }
 }
}
function renderConditions(){
 const station=site(),relay=station.kind==='relay',groundwater=station.kind==='groundwater',water=latest('water_distance',stage),hs=latest('mx2001',stage),troll=latest('rugged_troll',stage),level=groundwater?(hs||troll):(state.node===1695962694?water:(water||hs)),rated=latest('water_distance',flow),therm=groundwater?state.latest.find(r=>['environment','mx2001','rugged_troll'].includes(r.telemetry_type)&&temp(r)!==null):latest(relay?'environment':'mx2001',temp),device=state.latest.find(r=>r.telemetry_type==='device'&&(battery(r)!==null||batteryVoltage(r)!==null));
 const outage=$('cottonwoodOutage');if(outage)outage.hidden=state.node!==1695962694;
 $('stationTitle').textContent=station.name;if($('stationSubtitle'))$('stationSubtitle').textContent=station.detail;$('temperatureLabel').textContent=relay?'Air temperature':groundwater?'Groundwater temperature':state.node===1695962694?'HOBO MX2001 water temperature':'Water temperature';$('stageLabel').textContent=groundwater?'Water depth above logger':state.node===1695962694?'MB7388 ultrasonic stage':station.sensor+' stage';
 $('readingCards').className='readings '+(relay?'relay':station.flow?'':'creek')+(state.node===1695962694?' cottonwood':'');$('flowCard').hidden=!station.flow;$('stageCard').hidden=relay;$('hoboStageCard').hidden=relay||groundwater;$('waterElevationCard').hidden=!groundwater;
 $('batteryPct').textContent=value(device?battery(device):null,0);$('batteryVoltage').textContent=value(device?batteryVoltage(device):null,3);$('batteryTime').textContent=device?'Observed '+date(device.observed_at):'No battery telemetry available';
 $('stage').textContent=displayStage(level?stage(level):null);$('hoboStageCurrent').textContent=displayStage(hs?stage(hs):null);$('flow').textContent=value(rated?flow(rated):null);$('temp').textContent=value(therm?temp(therm):null,1);$('waterElevation').textContent=displayStage(level?mathesonElevation(level):null);
 $('stageSource').textContent=groundwater?(level?sensorLabel(level):station.sensor)+' · measured feet of water above the logger':(level?.telemetry_type==='mx2001'?'HOBO MX2001 pressure-based stage':station.sensor+' ultrasonic water-level sensor')+' · Display rounded to 0.01 ft';
 $('temperatureSource').textContent=relay?'Air-temperature telemetry · latest available observation':groundwater?'Groundwater sensor · latest available observation':'HOBO MX2001 · latest available observation';
 $('stageTime').textContent=level?'Observed '+date(level.observed_at)+transmissionDetail(level):groundwater?'No water-depth observation available':'No calibrated stage observation available';$('hoboStageTime').textContent=hs?'Observed '+date(hs.observed_at)+transmissionDetail(hs):'No HOBO stage observation available';
 $('waterElevationTime').textContent=level?'Observed '+date(level.observed_at)+transmissionDetail(level):'No groundwater observation available';
 $('flowTime').textContent=rated?'Observed '+date(rated.observed_at)+transmissionDetail(rated):'No rated ultrasonic stage available';
 $('tempTime').textContent=therm?'Observed '+date(therm.observed_at)+transmissionDetail(therm):relay?'Awaiting air-temperature readings':groundwater?'No groundwater-temperature observation available':'No HOBO water-temperature observation available';
 $('instrumentation').innerHTML=relay?'<h3>Instrumentation</h3><p class="muted">Cottonwood Relay reports air temperature when sensor telemetry is available. No stage or discharge is measured at this relay.</p>':groundwater?'<h3>U18 well reference</h3><dl><dt>Station</dt><dd>USGS Matheson Wetlands Well U18</dd><dt>Rugged TROLL 100 sensing port</dt><dd>35.30 ft below top of casing.</dd><dt>HOBO MX2001 sensing port</dt><dd>18.25 ft below casing, installed Oct. 23, 2026 at 3:35 PM MDT. Earlier MX2001 telemetry is excluded from the U18 hydrograph because it predates the verified installation datum.</dd><dt>Installation field reading</dt><dd>12.09 ft of water above the MX2001 at 3:35 PM MDT, entered as a documented field observation, not an automatic radio transmission.</dd><dt>Field validation</dt><dd>Manual depth 6.15 ft; MX2001 implied 6.16 ft at 3:35 PM MDT (0.01 ft difference).</dd><dt>Top-of-casing reference elevation</dt><dd>3,968.52 ft; vertical datum not verified.</dd><dt>Land-surface elevation</dt><dd>3,966.78 ft; shown as the brown reference line on the elevation graph.</dd><dt>Observed water-level pattern</dt><dd>During the available record, groundwater elevation was highest in late winter and early spring, declined through summer into early fall, and began recovering in October.</dd><dt>Observed temperature pattern</dt><dd>Groundwater temperature stayed near 60–62 °F. It was warmest in winter and coolest in late spring to early summer, reflecting the delayed and muted subsurface response to seasonal air temperature.</dd><dt>Trend method</dt><dd>Water-surface elevation and groundwater temperature use a 30-day least-squares trend through daily median values. This reduces hourly noise and reports the seasonal direction rather than a single-point jump.</dd><dt>Record limitation</dt><dd>Historical TROLL data in this database begin Nov. 25, 2025. Earlier observations were not included in the imported logger record. Seasonal patterns are preliminary, not a long-term baseline.</dd><dt>Coordinates</dt><dd>38.59645009, −109.5736423</dd><dt>Calculation</dt><dd>Water-surface elevation uses each instrument’s measured sensing-port depth and the common top-of-casing elevation. The TROLL and MX2001 records are joined without an artificial offset.</dd></dl>':'<h3>Instrumentation</h3><dl><dt>Ultrasonic stage</dt><dd>'+station.sensor+'; feet relative to the station datum.</dd><dt>Water temperature</dt><dd>HOBO MX2001; degrees Fahrenheit.</dd><dt>HOBO reference stage</dt><dd>'+ (hs?value(stage(hs))+' ft':'No observation available')+'</dd><dt>Reference observation time</dt><dd>'+(hs?date(hs.observed_at):'No observation available')+'</dd>'+(station.flow?'<dt>Discharge</dt><dd>Estimated from the Pack Creek rating curve.</dd>':'<dt>Discharge</dt><dd>No rating curve established.</dd>')+'</dl>';
 $('ratingNote').textContent=rated?.discharge_rating_status?.startsWith('extrapolated')?'Rating estimate · extrapolated '+(rated.discharge_rating_status.endsWith('high')?'above':'below')+' the measured rating range.':'Calculated from the station’s stage–discharge rating.';
 const newest=state.latest[0];$('observationStatus').textContent=newest?'Latest observation · '+date(newest.observed_at):'No '+station.name+' measurements available';
 renderTrends();renderHoboFloodWarning();renderSensorDiagnostics();
 document.querySelectorAll('[data-metric]').forEach(b=>{b.hidden=(b.dataset.metric==='flow'&&!station.flow)||(b.dataset.metric==='stage'&&relay)||(b.dataset.metric==='elevation'&&!groundwater);b.setAttribute('aria-pressed',String(b.dataset.metric===state.metric));if(b.dataset.metric==='temp')b.textContent=relay?'Air temperature':groundwater?'Groundwater temperature':'Water temperature';if(b.dataset.metric==='stage')b.textContent=groundwater?'Water depth above logger':'Creek stage';});
 metrics.stage.label=groundwater?'Water depth above logger':'Creek stage';metrics.temp.label=relay?'Air temperature':groundwater?'Groundwater temperature':'Water temperature';
}
function selectStation(){
 ensureMeasurementMarkup();
 state.readings=state.allReadings.filter(r=>Number(r.node_num)===state.node);state.latest=state.allLatest.filter(r=>Number(r.node_num)===state.node);state.recent=state.allRecent.filter(r=>Number(r.node_num)===state.node);state.measurementPage=0;
 if(site().kind==='relay'&&['flow','stage','elevation'].includes(state.metric))state.metric='temp';else if(state.metric==='elevation'&&site().kind!=='groundwater')state.metric=site().flow?'flow':'stage';else if(site().kind==='groundwater'&&['flow','stage'].includes(state.metric))state.metric='elevation';else if(state.metric==='flow'&&!site().flow)state.metric='stage';
 renderConditions();renderChart();showRatingEquation();renderRows();renderRoutes();
}
function series(){
 const m=metrics[state.metric];
 if(site().kind==='groundwater'&&state.metric==='elevation')return [{type:'groundwater_handoff',color:m.color,points:state.readings.filter(r=>['rugged_troll','mx2001'].includes(r.telemetry_type)&&m.convert(r)!==null).map(r=>({x:new Date(r.observed_at).getTime(),y:m.convert(r),r})).sort((a,b)=>a.x-b.x)}];
 return (state.metric==='stage'?(site().kind==='groundwater'?['rugged_troll','mx2001']:['water_distance','mx2001']):[state.metric==='battery'?'device':state.metric==='temp'?(site().kind==='relay'?['environment']:(site().kind==='groundwater'?['rugged_troll','environment','mx2001']:['mx2001'])):['water_distance']]).flat().map(type=>({type,color:type==='mx2001'&&state.metric==='stage'&&site().kind!=='groundwater'?'#b47b4e':m.color,points:state.readings.filter(r=>r.telemetry_type===type&&m.convert(r)!==null).map(r=>({x:new Date(r.observed_at).getTime(),y:m.convert(r),r})).sort((a,b)=>a.x-b.x)}));
}
// Only Matheson U18's HOBO MX2001 logs every three hours. Allow 30 minutes
// for ordinary timestamp drift; a missed three-hour cycle still shows as a gap.
// The TROLL-to-HOBO instrument change is handled separately and remains dashed.
const MATHESON_MX_GAP_TOLERANCE_HOURS=3.5;
const chartGapThresholdHours=(nodeNum,previous,current,standardHours)=>nodeNum===2004386937&&previous?.r?.telemetry_type==='mx2001'&&current?.r?.telemetry_type==='mx2001'?Math.max(standardHours,MATHESON_MX_GAP_TOLERANCE_HOURS):standardHours;
function renderChart(){
 const m=metrics[state.metric],data=series(),pts=data.flatMap(s=>s.points);$('sampleCount').textContent=pts.length+' observation'+(pts.length===1?'':'s')+' · '+(state.hours===SINCE_INCEPTION_HOURS?'since inception':state.hours===2160?'90 days':state.hours<=24?state.hours+' hours':state.hours/24+' days')+(state.sampleIntervalHours?' · sampled every '+state.sampleIntervalHours+'h':'');
 $('chartLegend').textContent=state.metric==='elevation'?'Water-surface elevation · joined TROLL + MX2001 record · brown line is land surface at 3,966.78 ft':state.metric==='battery'?'Battery percentage · device telemetry':state.metric==='stage'?(site().kind==='groundwater'?'Water above each logger · shown separately because instrument depths differ':site().sensor+' stage (teal) · HOBO MX2001 stage (clay)'):state.metric==='flow'?'Estimated discharge · SEN0313 stage':(site().kind==='relay'?'Air temperature · Cottonwood Relay':site().kind==='groundwater'?'Groundwater temperature':'Water temperature · HOBO MX2001');
 const gapHours=state.sampleIntervalHours?Math.max(3,2*state.sampleIntervalHours):3;
 $('gapLegend').innerHTML='<i aria-hidden="true"></i> Dashed amber: gaps over '+gapHours+'h'+(site().kind==='groundwater'&&gapHours<MATHESON_MX_GAP_TOLERANCE_HOURS?' (Matheson MX2001: over 3.5h)':'')+(site().kind==='groundwater'?'; TROLL-to-HOBO transition':'')+' · unmeasured intervals';
 $('chartReadout').textContent='Select an observation to view its time and value.';
 if(!pts.length){$('chart').innerHTML='<div class="empty">No '+m.label.toLowerCase()+' observations in this period. Try a longer time range.</div>';return;}
 const end=Date.now(),start=state.hours===SINCE_INCEPTION_HOURS?Math.min(...pts.map(p=>p.x)):end-state.hours*3600000,W=1100,H=300,L=65,R=22,T=20,B=42;
 const vals=pts.map(p=>p.y);if(state.metric==='elevation')vals.push(MATHESON_LAND_SURFACE_ELEVATION_FT);const lo=Math.min(...vals),hi=Math.max(...vals),pad=Math.max((hi-lo)*.15,m.unit==='cfs'?.5:m.unit==='ft'?.05:.5),min=m.unit==='%'?Math.max(0,lo-pad):m.unit==='cfs'?Math.max(0,lo-pad):lo-pad,max=m.unit==='%'?Math.min(100,hi+pad):hi+pad;
 const x=v=>L+(v-start)/(end-start)*(W-L-R),y=v=>T+(max-v)/(max-min)*(H-T-B);
 let svg='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+site().name+' '+m.label+' in '+m.unit+'"><text class="axis-label" x="'+L+'" y="12">'+m.unit+'</text>';
 for(let i=0;i<=4;i++){const v=max-i*(max-min)/4,yy=y(v);svg+='<line class="grid-line" x1="'+L+'" x2="'+(W-R)+'" y1="'+yy+'" y2="'+yy+'"/><text class="axis-label" x="'+(L-9)+'" y="'+(yy+4)+'" text-anchor="end">'+v.toFixed(m.decimals)+'</text>';}
 for(let i=0;i<=4;i++){const xx=L+i*(W-L-R)/4;svg+='<text class="axis-label" x="'+xx+'" y="'+(H-10)+'" text-anchor="'+(i===0?'start':i===4?'end':'middle')+'">'+shortDate(start+i*(end-start)/4)+'</text>';}
 if(state.metric==='elevation'){
   const landY=y(MATHESON_LAND_SURFACE_ELEVATION_FT);
   svg+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+landY+'" y2="'+landY+'" stroke="#7b4f2c" stroke-width="2"/><text x="'+(W-R-5)+'" y="'+(landY-6)+'" text-anchor="end" fill="#7b4f2c" font-size="13" font-weight="700">Land surface · 3,966.78 ft</text>';
 }

 data.forEach((s,si)=>{
   let measured='',segs=[],current=[],gaps=[];
   const point=p=>x(p.x).toFixed(2)+','+y(p.y).toFixed(2);
   for(let i=0;i<s.points.length;i++){
     const p=s.points[i],prev=s.points[i-1];
     if(i>0&&(p.x-prev.x>chartGapThresholdHours(state.node,prev,p,gapHours)*3600000||(s.type==='groundwater_handoff'&&prev.r.telemetry_type!==p.r.telemetry_type))){
       if(current.length)segs.push(current);
       current=[p];gaps.push([prev,p]);
     }else current.push(p);
   }
   if(current.length)segs.push(current);
   for(const segment of segs){
     if(segment.length<2)continue;
     measured='M'+segment.map(point).join(' L');
     svg+='<path class="chart-line" stroke="'+s.color+'" d="'+measured+'"/>';
   }
   for(const [a,b] of gaps){
     svg+='<path class="chart-gap" d="M'+point(a)+' L'+point(b)+'" aria-label="Interpolated gap; no measurements between these times"><title>Missing observations · dashed interpolation, not measured values</title></path>';
   }
   s.points.forEach((p,i)=>{
     const label=date(p.r.observed_at)+' · '+p.y.toFixed(m.decimals)+' '+m.unit+' · '+sensorLabel(p.r)+transmissionDetail(p.r)+(state.metric==='flow'&&p.r.discharge_rating_status?.startsWith('extrapolated')?' · extrapolated':'');
     svg+='<circle class="chart-dot" cx="'+x(p.x).toFixed(2)+'" cy="'+y(p.y).toFixed(2)+'" r="3.5" fill="'+s.color+'" tabindex="0" data-series="'+si+'" data-point="'+i+'" aria-label="'+htmlSafe(label)+'"><title>'+htmlSafe(label)+'</title></circle>';
   });
 });
 $('chart').innerHTML=svg+'</svg>';
 $('chart').querySelectorAll('.chart-dot').forEach(dot=>{const show=()=>{$('chartReadout').textContent=dot.getAttribute('aria-label');};dot.addEventListener('pointerenter',show);dot.addEventListener('focus',show);dot.addEventListener('click',show);});
}
function recentColumns(){
 const batteryColumns=[
  {label:'Battery · %',cell:r=>r.telemetry_type==='device'?value(battery(r),0):'—',cls:'measurement-value'},
  {label:'Battery · V',cell:r=>r.telemetry_type==='device'?value(batteryVoltage(r),3):'—',cls:'measurement-value'}
 ];
 const common=[
  {label:'Observed · MT',cell:r=>date(r.observed_at),cls:'measurement-time'},
  {label:'Sensor',cell:r=>sensorLabel(r),cls:'measurement-sensor'}
 ];
 if(state.node===1695962694)return [
  ...common,
  {label:'Transmission',cell:r=>transmissionLabel(r)||'—',cls:'measurement-source'},
  {label:'MB7388 stage · ft',cell:r=>r.telemetry_type==='water_distance'?displayStage(stage(r)):'—',cls:'measurement-value'},
  {label:'HOBO stage · ft',cell:r=>r.telemetry_type==='mx2001'?displayStage(stage(r)):'—',cls:'measurement-value'},
  {label:'HOBO water · °F',cell:r=>r.telemetry_type==='mx2001'?value(temp(r),1):'—',cls:'measurement-value'},
  ...batteryColumns
 ];
 if(site().kind==='groundwater')return [
  ...common,
  {label:'Water above logger · ft',cell:r=>['rugged_troll','mx2001'].includes(r.telemetry_type)?displayStage(stage(r)):'—',cls:'measurement-value'},
  {label:'Water elevation · ft',cell:r=>['rugged_troll','mx2001'].includes(r.telemetry_type)?displayStage(mathesonElevation(r)):'—',cls:'measurement-value'},
  {label:'Groundwater · °F',cell:r=>['rugged_troll','environment','mx2001'].includes(r.telemetry_type)?value(temp(r),1):'—',cls:'measurement-value'},
  ...batteryColumns
 ];
 if(site().kind==='relay')return [
  ...common,
  {label:'Air temp · °F',cell:r=>value(temp(r),1),cls:'measurement-value'},
  ...batteryColumns
 ];
 return [
  ...common,
  {label:site().sensor+' stage · ft',cell:r=>r.telemetry_type==='water_distance'?displayStage(stage(r)):'—',cls:'measurement-value'},
  {label:'HOBO stage · ft',cell:r=>r.telemetry_type==='mx2001'?displayStage(stage(r)):'—',cls:'measurement-value'},
  {label:'Flow · cfs',cell:r=>r.telemetry_type==='water_distance'?value(flow(r))+(r.discharge_rating_status?.startsWith('extrapolated')?'*':''):'—',cls:'measurement-value'},
  {label:'HOBO water · °F',cell:r=>r.telemetry_type==='mx2001'?value(temp(r),1):'—',cls:'measurement-value'},
  ...batteryColumns
 ];
}
function renderRows(){
 const columns=recentColumns();
 $('measurementHead').innerHTML=columns.map(col=>'<th scope="col">'+htmlSafe(col.label)+'</th>').join('');
 const observed=state.readings.filter(r=>r.telemetry_type!=='device'||battery(r)!==null||batteryVoltage(r)!==null);
 const pageCount=Math.max(1,Math.ceil(observed.length/state.measurementPageSize));
 state.measurementPage=Math.min(Math.max(0,state.measurementPage),pageCount-1);
 const start=state.measurementPage*state.measurementPageSize;
 const pageRows=observed.slice(start,start+state.measurementPageSize);
 $('rows').innerHTML=pageRows.map(r=>'<tr>'+columns.map(col=>'<td class="'+col.cls+'">'+htmlSafe(col.cell(r))+'</td>').join('')+'</tr>').join('')||'<tr><td colspan="'+columns.length+'">No observations in the selected period.</td></tr>';
 const pager=$('measurementPagination'),prev=$('measurementPrev'),next=$('measurementNext'),status=$('measurementPageStatus');
 if(pager)pager.hidden=observed.length<=state.measurementPageSize;
 if(prev)prev.disabled=state.measurementPage===0;
 if(next)next.disabled=state.measurementPage>=pageCount-1;
 if(status)status.textContent='Page '+(state.measurementPage+1)+' of '+pageCount+' · '+observed.length+' measurements';
 $('export').disabled=!state.readings.length;$('export').textContent=state.sampleIntervalHours?'Download sampled CSV ↓':'Download CSV ↓';
 $('samplingNotice').textContent=state.sampleIntervalHours?' · Long-range CSV includes sampled chart observations only.':'';
}
async function load(){
 if(state.busy)return;state.busy=true;$('refresh').disabled=true;$('refresh').textContent='↻ Loading…';$('error').hidden=true;
 document.querySelectorAll('[data-hours]').forEach(b=>b.disabled=true);
 try{
 const trendRequest=state.node===2004386937&&state.hours!==720?fetch('/api/watershed-readings?hours=720',{cache:'no-store'}).then(async r=>r.ok?await r.json():null).catch(()=>null):Promise.resolve(null);
 const response=await fetch('/api/watershed-readings?hours='+state.hours,{cache:'no-store'});if(!response.ok)throw new Error('Watershed API HTTP '+response.status);const data=await response.json();if(!data.ok||!Array.isArray(data.readings)||!Array.isArray(data.latest))throw new Error('Invalid response');
 const trendData=await trendRequest;
 state.allLatest=data.latest.filter(valid).sort((a,b)=>new Date(b.observed_at)-new Date(a.observed_at));state.allReadings=data.readings.filter(valid).sort((a,b)=>new Date(b.observed_at)-new Date(a.observed_at));
 if(state.node===2004386937)state.trendReadings=(trendData?.readings||data.readings).filter(valid).filter(r=>Number(r.node_num)===2004386937);
 else state.trendReadings=[];
 state.allRecent=Array.isArray(data.recent)?data.recent.filter(valid).sort((a,b)=>new Date(b.observed_at)-new Date(a.observed_at)):[];
 state.stationInfo=Array.isArray(data.stations)?data.stations:[];state.sampleIntervalHours=n(data.sample_interval_hours);state.sensorEvents=Array.isArray(data.sensor_events)?data.sensor_events:[];state.cc01Polling=data.cc01_polling||null;selectStation();
 }catch(error){ console.error('Watershed data or rendering error, build '+DASHBOARD_BUILD+':',error);const reason=error instanceof Error?error.message:'Unknown issue';$('error').textContent='Could not load measurements ('+reason+'). '+(state.latest.length?'Previously loaded readings may remain. ':'')+'Build: '+DASHBOARD_BUILD+'.';$('error').hidden=false;if(!state.latest.length){$('observationStatus').textContent='Creek observations unavailable';$('chart').innerHTML='<div class="empty">Observations are temporarily unavailable.</div>';$('rows').innerHTML='<tr><td colspan="'+recentColumns().length+'">Observations unavailable.</td></tr>';}}
 finally{state.busy=false;$('refresh').disabled=false;$('refresh').textContent='↻ Refresh readings';document.querySelectorAll('[data-hours]').forEach(b=>b.disabled=false);}
}
$('refresh').addEventListener('click',load);
$('stationSelect').addEventListener('change',e=>{state.node=Number(e.target.value);if(site().kind==='groundwater'){state.hours=SINCE_INCEPTION_HOURS;state.metric='elevation';}else if(state.hours===SINCE_INCEPTION_HOURS){state.hours=12;state.metric=site().kind==='relay'?'temp':site().flow?'flow':'stage';}document.querySelectorAll('[data-hours]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.hours)===state.hours)));document.querySelectorAll('[data-metric]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.metric===state.metric)));load();});
document.addEventListener('click',e=>{
 if(e.target?.id==='measurementPrev'&&state.measurementPage>0){state.measurementPage--;renderRows();}
 if(e.target?.id==='measurementNext'){const count=state.readings.filter(r=>r.telemetry_type!=='device'||battery(r)!==null||batteryVoltage(r)!==null).length;if((state.measurementPage+1)*state.measurementPageSize<count){state.measurementPage++;renderRows();}}
});
document.querySelectorAll('[data-hours]').forEach(b=>b.addEventListener('click',()=>{state.hours=Number(b.dataset.hours);document.querySelectorAll('[data-hours]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));load();}));
document.querySelectorAll('[data-metric]').forEach(b=>b.addEventListener('click',()=>{state.metric=b.dataset.metric;document.querySelectorAll('[data-metric]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderChart();}));
$('export').addEventListener('click',()=>{
 const groundwater=site().kind==='groundwater';
 const headers=groundwater?['observed_at_UTC','observed_at_Mountain_Time','station','sensor','sensor_depth_below_top_of_casing_ft','water_above_logger_ft','water_surface_elevation_ft','water_temperature_F','battery_percent','battery_voltage_v','mesh_hops','last_relay','receiving_gateway','rssi_dbm','snr_db','transmission_source']:['observed_at_UTC','observed_at_Mountain_Time','station','sensor','stage_ft','ultrasonic_stage_ft','hobo_stage_ft','estimated_discharge_cfs','rating_status',site().kind==='relay'?'air_temperature_F':'water_temperature_F','battery_percent','battery_voltage_v','mesh_hops','last_relay','receiving_gateway','rssi_dbm','snr_db','transmission_source'];
 const rows=groundwater?state.readings.map(r=>[r.observed_at,date(r.observed_at),site().name,r.telemetry_type,mathesonSensorDepth(r),stage(r),mathesonElevation(r),temp(r),battery(r),batteryVoltage(r),routeHops(r),routeHasData(r)?routeRelay(r):'',routeHasData(r)?routeGateway(r):'',n(radio(r).rssi),n(radio(r).snr),transmissionLabel(r)||'']):state.readings.map(r=>[r.observed_at,date(r.observed_at),site().name,r.telemetry_type,stage(r),r.telemetry_type==='water_distance'?stage(r):null,r.telemetry_type==='mx2001'?stage(r):null,flow(r),r.discharge_rating_status||'',temp(r),battery(r),batteryVoltage(r),routeHops(r),routeHasData(r)?routeRelay(r):'',routeHasData(r)?routeGateway(r):'',n(radio(r).rssi),n(radio(r).snr),transmissionLabel(r)||'']);
 const csv=[headers,...rows].map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=site().name.toLowerCase().replaceAll(' ','-')+'-'+(state.hours===SINCE_INCEPTION_HOURS?'since-inception':state.hours+'h')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
load();
})();
