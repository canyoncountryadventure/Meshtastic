(() => {
'use strict';
const $=id=>document.getElementById(id);
const SITES={1949224949:{name:'Pack Creek',kind:'creek',sensor:'SEN0313',flow:true},1695962694:{name:'Cottonwood Creek',kind:'creek',sensor:'MB7388',flow:false},2425602407:{name:'Cottonwood Relay',kind:'relay',sensor:'Air temperature sensor',flow:false}};
const site=()=>SITES[state.node];
const state={node:1949224949,hours:168,metric:'flow',readings:[],latest:[],allReadings:[],allLatest:[],busy:false};
const n=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
const valid=r=>Object.hasOwn(SITES,Number(r.node_num))&&(r.telemetry_type==='device'||(Number(r.node_num)===2425602407?r.telemetry_type==='environment':['water_distance','mx2001'].includes(r.telemetry_type)));
const stage=r=>r?.metrics?.stage_calibrated===false||r?.metrics?.distance_valid===false?null:n(r?.metrics?.water_level_ft);
const temp=r=>['mx2001','environment'].includes(r?.telemetry_type)&&n(r.temperature_c)!==null?n(r.temperature_c)*9/5+32:null;
const battery=r=>{const v=n(r?.metrics?.battery_level??r?.metrics?.battery_percent??r?.metrics?.battery_pct);return r?.telemetry_type==='device'&&v!==null&&v>=0&&v<=100?v:null;};
const sensorLabel=r=>r.telemetry_type==='device'?'Device battery':r.telemetry_type==='mx2001'?'HOBO MX2001':r.telemetry_type==='environment'?'Air temperature':site().sensor;
const flow=r=>stage(r)!==null?n(r?.discharge_cfs):null;
const date=iso=>new Date(iso).toLocaleString('en-US',{timeZone:'America/Denver',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
const shortDate=ms=>new Date(ms).toLocaleString('en-US',{timeZone:'America/Denver',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const value=(v,d=2)=>v===null?'—':v.toFixed(d);
const metrics={flow:{label:'Estimated discharge',unit:'cfs',convert:flow,color:'#2c7e70',decimals:2},stage:{label:'Creek stage',unit:'ft',convert:stage,color:'#2c7e70',decimals:2},temp:{label:'Water temperature',unit:'°F',convert:temp,color:'#a26743',decimals:1},battery:{label:'Battery charge',unit:'%',convert:battery,color:'#65759b',decimals:0}};
function latest(type,convert){return state.latest.find(r=>r.telemetry_type===type&&convert(r)!==null);}

const KNOWN_RELAY_NODES={
 '!b57d051f':'Hidden Valley',
 '!742ecff5':'Pack Creek',
 '!65165646':'Cottonwood Creek',
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
 return matches.length===1?matches[0][1]+' (ID suffix only)':'0x'+suffix.toUpperCase()+' (unidentified)';
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
 const packets=state.readings.filter(routeHasData);
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
 $('routeRows').innerHTML=recent.map(r=>'<tr><td>'+htmlSafe(date(r.observed_at))+'</td><td>'+htmlSafe(sensorLabel(r))+'</td><td>'+
  htmlSafe(routeHops(r)??'—')+'</td><td>'+htmlSafe(routeRelay(r))+'</td><td>'+htmlSafe(routeSignal(r))+'</td></tr>').join('')||
  '<tr><td colspan="5">No route metadata in the last 24 hours.</td></tr>';
}

function renderConditions(){
 const station=site(),relay=station.kind==='relay',water=latest('water_distance',stage),hs=latest('mx2001',stage),level=water||hs,rated=latest('water_distance',flow),therm=latest(relay?'environment':'mx2001',temp);
 $('stationTitle').textContent=station.name;$('temperatureLabel').textContent=relay?'Air temperature':'Water temperature';$('temperatureColumn').textContent=relay?'Air · °F':'Water · °F';
 $('readingCards').className='readings '+(relay?'relay':station.flow?'':'creek');$('flowCard').hidden=!station.flow;$('stageCard').hidden=relay;
 $('stage').textContent=value(level?stage(level):null);$('flow').textContent=value(rated?flow(rated):null);$('temp').textContent=value(therm?temp(therm):null,1);
 $('stageSource').textContent=level?.telemetry_type==='mx2001'?'HOBO MX2001 pressure-based stage':station.sensor+' ultrasonic water-level sensor';
 $('temperatureSource').textContent=relay?'Air-temperature telemetry · latest available observation':'HOBO MX2001 · latest available observation';
 $('stageTime').textContent=level?'Observed '+date(level.observed_at):'No calibrated stage observation available';
 $('flowTime').textContent=rated?'Observed '+date(rated.observed_at):'No rated ultrasonic stage available';
 $('tempTime').textContent=therm?'Observed '+date(therm.observed_at):relay?'Awaiting air-temperature readings':'No HOBO water-temperature observation available';
 $('instrumentation').innerHTML=relay?'<h3>Instrumentation</h3><p class="muted">Cottonwood Relay reports air temperature when sensor telemetry is available. No stage or discharge is measured at this relay.</p>':'<h3>Instrumentation</h3><dl><dt>Ultrasonic stage</dt><dd>'+station.sensor+'; feet relative to the station datum.</dd><dt>Water temperature</dt><dd>HOBO MX2001; degrees Fahrenheit.</dd><dt>HOBO reference stage</dt><dd>'+ (hs?value(stage(hs))+' ft':'No observation available')+'</dd><dt>Reference observation time</dt><dd>'+(hs?date(hs.observed_at):'No observation available')+'</dd>'+(station.flow?'<dt>Discharge</dt><dd>Estimated from the Pack Creek rating curve.</dd>':'<dt>Discharge</dt><dd>No rating curve established.</dd>')+'</dl>';
 $('ratingNote').textContent=rated?.discharge_rating_status?.startsWith('extrapolated')?'Rating estimate · extrapolated '+(rated.discharge_rating_status.endsWith('high')?'above':'below')+' the measured rating range.':'Calculated from the station’s stage–discharge rating.';
 const newest=state.latest[0];$('observationStatus').textContent=newest?'Latest observation · '+date(newest.observed_at):'No '+station.name+' measurements available';
 document.querySelectorAll('[data-metric]').forEach(b=>{b.hidden=(b.dataset.metric==='flow'&&!station.flow)||(b.dataset.metric==='stage'&&relay);b.setAttribute('aria-pressed',String(b.dataset.metric===state.metric));if(b.dataset.metric==='temp')b.textContent=relay?'Air temperature':'Water temperature';});
 metrics.temp.label=relay?'Air temperature':'Water temperature';
}
function selectStation(){
 state.readings=state.allReadings.filter(r=>Number(r.node_num)===state.node);state.latest=state.allLatest.filter(r=>Number(r.node_num)===state.node);
 if(site().kind==='relay'&&['flow','stage'].includes(state.metric))state.metric='temp';else if(state.metric==='flow'&&!site().flow)state.metric='stage';
 renderConditions();renderChart();renderRows();renderRoutes();
}
function series(){const m=metrics[state.metric];return (state.metric==='stage'?['water_distance','mx2001']:[state.metric==='battery'?'device':state.metric==='temp'?(site().kind==='relay'?'environment':'mx2001'):'water_distance']).map(type=>({type,color:type==='mx2001'&&state.metric==='stage'?'#b47b4e':m.color,points:state.readings.filter(r=>r.telemetry_type===type&&m.convert(r)!==null).map(r=>({x:new Date(r.observed_at).getTime(),y:m.convert(r),r})).sort((a,b)=>a.x-b.x)}));}
function renderChart(){
 const m=metrics[state.metric],data=series(),pts=data.flatMap(s=>s.points);$('sampleCount').textContent=pts.length+' observations · '+(state.hours<=24?state.hours+' hours':state.hours/24+' days');
 $('chartLegend').textContent=state.metric==='battery'?'Battery percentage · device telemetry':state.metric==='stage'?site().sensor+' stage (teal) · HOBO MX2001 stage (clay)':state.metric==='flow'?'Estimated discharge · SEN0313 stage':(site().kind==='relay'?'Air temperature · Cottonwood Relay':'Water temperature · HOBO MX2001');
 $('chartReadout').textContent='Select an observation to view its time and value.';
 if(!pts.length){$('chart').innerHTML='<div class="empty">No '+m.label.toLowerCase()+' observations in this period. Try a longer time range.</div>';return;}
 const end=Date.now(),start=end-state.hours*3600000,W=1100,H=300,L=65,R=22,T=20,B=42;
 const vals=pts.map(p=>p.y),lo=Math.min(...vals),hi=Math.max(...vals),pad=Math.max((hi-lo)*.15,m.unit==='cfs'?.5:m.unit==='ft'?.05:.5),min=m.unit==='%'?Math.max(0,lo-pad):m.unit==='cfs'?Math.max(0,lo-pad):lo-pad,max=m.unit==='%'?Math.min(100,hi+pad):hi+pad;
 const x=v=>L+(v-start)/(end-start)*(W-L-R),y=v=>T+(max-v)/(max-min)*(H-T-B);
 let svg='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+site().name+' '+m.label+' in '+m.unit+'"><text class="axis-label" x="'+L+'" y="12">'+m.unit+'</text>';
 for(let i=0;i<=4;i++){const v=max-i*(max-min)/4,yy=y(v);svg+='<line class="grid-line" x1="'+L+'" x2="'+(W-R)+'" y1="'+yy+'" y2="'+yy+'"/><text class="axis-label" x="'+(L-9)+'" y="'+(yy+4)+'" text-anchor="end">'+v.toFixed(m.decimals)+'</text>';}
 for(let i=0;i<=4;i++){const xx=L+i*(W-L-R)/4;svg+='<text class="axis-label" x="'+xx+'" y="'+(H-10)+'" text-anchor="'+(i===0?'start':i===4?'end':'middle')+'">'+shortDate(start+i*(end-start)/4)+'</text>';}
 data.forEach((s,si)=>{let d='';s.points.forEach((p,i)=>{d+=(i===0||p.x-s.points[i-1].x>3*3600000?'M':'L')+x(p.x).toFixed(2)+','+y(p.y).toFixed(2)+' ';});svg+='<path class="chart-line" stroke="'+s.color+'" d="'+d+'"/>';s.points.forEach((p,i)=>{const label=date(p.r.observed_at)+' · '+p.y.toFixed(m.decimals)+' '+m.unit+' · '+sensorLabel(p.r)+(state.metric==='flow'&&p.r.discharge_rating_status?.startsWith('extrapolated')?' · extrapolated':'');svg+='<circle class="chart-dot" cx="'+x(p.x).toFixed(2)+'" cy="'+y(p.y).toFixed(2)+'" r="3.5" fill="'+s.color+'" tabindex="0" data-series="'+si+'" data-point="'+i+'" aria-label="'+label+'"><title>'+label+'</title></circle>';});});
 $('chart').innerHTML=svg+'</svg>';
 $('chart').querySelectorAll('.chart-dot').forEach(dot=>{const show=()=>{$('chartReadout').textContent=dot.getAttribute('aria-label');};dot.addEventListener('pointerenter',show);dot.addEventListener('focus',show);dot.addEventListener('click',show);});
}
function renderRows(){
 $('rows').innerHTML=state.readings.filter(r=>r.telemetry_type!=='device').slice(0,12).map(r=>'<tr><td>'+date(r.observed_at)+'</td><td>'+(r.telemetry_type==='mx2001'?'HOBO MX2001':r.telemetry_type==='environment'?'Air temperature':site().sensor)+'</td><td>'+value(stage(r))+'</td><td>'+value(flow(r))+(r.discharge_rating_status?.startsWith('extrapolated')?'*':'')+'</td><td>'+value(temp(r),1)+'</td></tr>').join('')||'<tr><td colspan="5">No observations in the selected period.</td></tr>';
 $('export').disabled=!state.readings.length;
}
async function load(){
 if(state.busy)return;state.busy=true;$('refresh').disabled=true;$('refresh').textContent='↻ Loading…';$('error').hidden=true;
 document.querySelectorAll('[data-hours]').forEach(b=>b.disabled=true);
 try{
 const response=await fetch('/api/watershed-readings?hours='+state.hours);if(!response.ok)throw new Error('Request failed');const data=await response.json();if(!data.ok||!Array.isArray(data.readings)||!Array.isArray(data.latest))throw new Error('Invalid response');
 state.allLatest=data.latest.filter(valid).sort((a,b)=>new Date(b.observed_at)-new Date(a.observed_at));state.allReadings=data.readings.filter(valid).sort((a,b)=>new Date(b.observed_at)-new Date(a.observed_at));selectStation();
 }catch{ $('error').textContent='Could not refresh station readings. '+(state.latest.length?'Previously loaded observations remain displayed. ':'')+'Use Refresh readings to try again.';$('error').hidden=false;if(!state.latest.length){$('observationStatus').textContent='Creek observations unavailable';$('chart').innerHTML='<div class="empty">Observations are temporarily unavailable.</div>';$('rows').innerHTML='<tr><td colspan="5">Observations unavailable.</td></tr>';}}
 finally{state.busy=false;$('refresh').disabled=false;$('refresh').textContent='↻ Refresh readings';document.querySelectorAll('[data-hours]').forEach(b=>b.disabled=false);}
}
$('refresh').addEventListener('click',load);
$('stationSelect').addEventListener('change',e=>{state.node=Number(e.target.value);selectStation();});
document.querySelectorAll('[data-hours]').forEach(b=>b.addEventListener('click',()=>{state.hours=Number(b.dataset.hours);document.querySelectorAll('[data-hours]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));load();}));
document.querySelectorAll('[data-metric]').forEach(b=>b.addEventListener('click',()=>{state.metric=b.dataset.metric;document.querySelectorAll('[data-metric]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderChart();}));
$('export').addEventListener('click',()=>{const head=['observed_at_UTC','observed_at_Mountain_Time','station','sensor','stage_ft','estimated_discharge_cfs','rating_status',site().kind==='relay'?'air_temperature_F':'water_temperature_F','battery_percent','mesh_hops','last_relay','receiving_gateway','rssi_dbm','snr_db'];const rows=state.readings.map(r=>[r.observed_at,date(r.observed_at),site().name,r.telemetry_type,stage(r),flow(r),r.discharge_rating_status||'',temp(r),battery(r),routeHops(r),routeHasData(r)?routeRelay(r):'',routeHasData(r)?routeGateway(r):'',n(radio(r).rssi),n(radio(r).snr)]);const csv=[head,...rows].map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=site().name.toLowerCase().replaceAll(' ','-')+'-'+state.hours+'h.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
load();
})();
