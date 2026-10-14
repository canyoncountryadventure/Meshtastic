(() => {
'use strict';
const NODE=1949224949, $=id=>document.getElementById(id);
const state={hours:168,metric:'flow',readings:[],latest:[],busy:false};
const n=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
const valid=r=>Number(r.node_num)===NODE&&['water_distance','mx2001'].includes(r.telemetry_type);
const stage=r=>r?.metrics?.stage_calibrated===false||r?.metrics?.distance_valid===false?null:n(r?.metrics?.water_level_ft);
const temp=r=>r?.telemetry_type==='mx2001'&&n(r.temperature_c)!==null?n(r.temperature_c)*9/5+32:null;
const flow=r=>stage(r)!==null?n(r?.discharge_cfs):null;
const date=iso=>new Date(iso).toLocaleString('en-US',{timeZone:'America/Denver',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
const shortDate=ms=>new Date(ms).toLocaleString('en-US',{timeZone:'America/Denver',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const value=(v,d=2)=>v===null?'—':v.toFixed(d);
const metrics={flow:{label:'Estimated streamflow',unit:'cfs',convert:flow,color:'#2c7e70',decimals:2},stage:{label:'Creek stage',unit:'ft',convert:stage,color:'#2c7e70',decimals:2},temp:{label:'Water temperature',unit:'°F',convert:temp,color:'#a26743',decimals:1}};
function latest(type,convert){return state.latest.find(r=>r.telemetry_type===type&&convert(r)!==null);}
function renderConditions(){
 const water=latest('water_distance',stage), rated=latest('water_distance',flow), hobo=latest('mx2001',temp), hs=latest('mx2001',stage);
 $('stage').textContent=value(water?stage(water):null);$('flow').textContent=value(rated?flow(rated):null);$('temp').textContent=value(hobo?temp(hobo):null,1);
 $('stageTime').textContent=water?'Observed '+date(water.observed_at):'No calibrated ultrasonic stage available';
 $('flowTime').textContent=rated?'Observed '+date(rated.observed_at):'No rated ultrasonic stage available';
 $('tempTime').textContent=hobo?'Observed '+date(hobo.observed_at):'No HOBO temperature observation available';
 $('hoboStage').textContent=hs?value(stage(hs))+' ft':'No HOBO stage observation available';$('hoboTime').textContent=hs?date(hs.observed_at):'No observation available';
 $('ratingNote').textContent=rated?.discharge_rating_status?.startsWith('extrapolated')?'Rating estimate · extrapolated '+(rated.discharge_rating_status.endsWith('high')?'above':'below')+' the measured rating range.':'Calculated from the station’s stage–discharge rating.';
 const newest=state.latest[0];$('observationStatus').textContent=newest?'Latest creek observation · '+date(newest.observed_at):'No Pack Creek water observations available';
}
function series(){const m=metrics[state.metric];return (state.metric==='stage'?['water_distance','mx2001']:[state.metric==='temp'?'mx2001':'water_distance']).map(type=>({type,color:type==='mx2001'&&state.metric==='stage'?'#b47b4e':m.color,points:state.readings.filter(r=>r.telemetry_type===type&&m.convert(r)!==null).map(r=>({x:new Date(r.observed_at).getTime(),y:m.convert(r),r})).sort((a,b)=>a.x-b.x)}));}
function renderChart(){
 const m=metrics[state.metric],data=series(),pts=data.flatMap(s=>s.points);$('sampleCount').textContent=pts.length+' observations · '+(state.hours===24?'24 hours':state.hours/24+' days');
 $('chartLegend').textContent=state.metric==='stage'?'SEN0313 stage (teal) · HOBO MX2001 stage (clay)':state.metric==='flow'?'Estimated discharge · SEN0313 stage':'Water temperature · HOBO MX2001';
 $('chartReadout').textContent='Point to an observation to inspect its value.';
 if(!pts.length){$('chart').innerHTML='<div class="empty">No '+m.label.toLowerCase()+' observations in this period. Try a longer time range.</div>';return;}
 const end=Date.now(),start=end-state.hours*3600000,W=1100,H=300,L=65,R=22,T=20,B=42;
 const vals=pts.map(p=>p.y),lo=Math.min(...vals),hi=Math.max(...vals),pad=Math.max((hi-lo)*.15,m.unit==='cfs'?.5:m.unit==='ft'?.05:.5),min=m.unit==='cfs'?Math.max(0,lo-pad):lo-pad,max=hi+pad;
 const x=v=>L+(v-start)/(end-start)*(W-L-R),y=v=>T+(max-v)/(max-min)*(H-T-B);
 let svg='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Pack Creek '+m.label+' in '+m.unit+'"><text class="axis-label" x="'+L+'" y="12">'+m.unit+'</text>';
 for(let i=0;i<=4;i++){const v=max-i*(max-min)/4,yy=y(v);svg+='<line class="grid-line" x1="'+L+'" x2="'+(W-R)+'" y1="'+yy+'" y2="'+yy+'"/><text class="axis-label" x="'+(L-9)+'" y="'+(yy+4)+'" text-anchor="end">'+v.toFixed(m.decimals)+'</text>';}
 for(let i=0;i<=4;i++){const xx=L+i*(W-L-R)/4;svg+='<text class="axis-label" x="'+xx+'" y="'+(H-10)+'" text-anchor="'+(i===0?'start':i===4?'end':'middle')+'">'+shortDate(start+i*(end-start)/4)+'</text>';}
 data.forEach((s,si)=>{let d='';s.points.forEach((p,i)=>{d+=(i===0||p.x-s.points[i-1].x>3*3600000?'M':'L')+x(p.x).toFixed(2)+','+y(p.y).toFixed(2)+' ';});svg+='<path class="chart-line" stroke="'+s.color+'" d="'+d+'"/>';s.points.forEach((p,i)=>{const label=date(p.r.observed_at)+' · '+p.y.toFixed(m.decimals)+' '+m.unit+' · '+(s.type==='mx2001'?'HOBO MX2001':'SEN0313')+(state.metric==='flow'&&p.r.discharge_rating_status?.startsWith('extrapolated')?' · extrapolated':'');svg+='<circle class="chart-dot" cx="'+x(p.x).toFixed(2)+'" cy="'+y(p.y).toFixed(2)+'" r="3.5" fill="'+s.color+'" tabindex="0" data-series="'+si+'" data-point="'+i+'" aria-label="'+label+'"><title>'+label+'</title></circle>';});});
 $('chart').innerHTML=svg+'</svg>';
 $('chart').querySelectorAll('.chart-dot').forEach(dot=>{const show=()=>{$('chartReadout').textContent=dot.getAttribute('aria-label');};dot.addEventListener('pointerenter',show);dot.addEventListener('focus',show);dot.addEventListener('click',show);});
}
function renderRows(){
 $('rows').innerHTML=state.readings.slice(0,12).map(r=>'<tr><td>'+date(r.observed_at)+'</td><td>'+(r.telemetry_type==='mx2001'?'HOBO MX2001':'SEN0313')+'</td><td>'+value(stage(r))+'</td><td>'+value(flow(r))+(r.discharge_rating_status?.startsWith('extrapolated')?'*':'')+'</td><td>'+value(temp(r),1)+'</td></tr>').join('')||'<tr><td colspan="5">No water observations in the selected period.</td></tr>';
 $('export').disabled=!state.readings.length;
}
async function load(){
 if(state.busy)return;state.busy=true;$('refresh').disabled=true;$('refresh').textContent='↻ Loading…';$('error').hidden=true;
 document.querySelectorAll('[data-hours]').forEach(b=>b.disabled=true);
 try{
 const response=await fetch('/api/watershed-readings?hours='+state.hours);if(!response.ok)throw new Error('Request failed');const data=await response.json();if(!data.ok||!Array.isArray(data.readings)||!Array.isArray(data.latest))throw new Error('Invalid response');
 state.latest=data.latest.filter(valid).sort((a,b)=>new Date(b.observed_at)-new Date(a.observed_at));state.readings=data.readings.filter(valid).sort((a,b)=>new Date(b.observed_at)-new Date(a.observed_at));renderConditions();renderChart();renderRows();
 }catch{ $('error').textContent='Could not refresh Pack Creek readings. '+(state.latest.length?'Previously loaded observations remain displayed. ':'')+'Use Refresh readings to try again.';$('error').hidden=false;if(!state.latest.length){$('observationStatus').textContent='Creek observations unavailable';$('chart').innerHTML='<div class="empty">Observations are temporarily unavailable.</div>';$('rows').innerHTML='<tr><td colspan="5">Observations unavailable.</td></tr>';}}
 finally{state.busy=false;$('refresh').disabled=false;$('refresh').textContent='↻ Refresh readings';document.querySelectorAll('[data-hours]').forEach(b=>b.disabled=false);}
}
$('refresh').addEventListener('click',load);
document.querySelectorAll('[data-hours]').forEach(b=>b.addEventListener('click',()=>{state.hours=Number(b.dataset.hours);document.querySelectorAll('[data-hours]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));load();}));
document.querySelectorAll('[data-metric]').forEach(b=>b.addEventListener('click',()=>{state.metric=b.dataset.metric;document.querySelectorAll('[data-metric]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderChart();}));
$('export').addEventListener('click',()=>{const head=['observed_at_UTC','observed_at_Mountain_Time','station','sensor','stage_ft','estimated_discharge_cfs','rating_status','water_temperature_F'];const rows=state.readings.map(r=>[r.observed_at,date(r.observed_at),'Pack Creek',r.telemetry_type,stage(r),flow(r),r.discharge_rating_status||'',temp(r)]);const csv=[head,...rows].map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='pack-creek-'+state.hours+'h.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
load();
})();
