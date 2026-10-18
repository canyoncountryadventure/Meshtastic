(()=>{
const $=id=>document.getElementById(id);
const state={sites:[],parameters:[],samples:[],drainage:'all',site:'all',metric:'e_coli_mpn_100ml',map:null,markers:null};
const core=[['e_coli_mpn_100ml','qualityEcoli','qualityEcoliTime'],['water_temperature_c','qualityTemp','qualityTempTime'],['specific_conductivity_us_cm','qualityConductivity','qualityConductivityTime'],['ph','qualityPh','qualityPhTime'],['dissolved_oxygen_mg_l','qualityDo','qualityDoTime']];
const categoryColors={Field:'#285e78',Bacteria:'#8a643f',Flow:'#496b55',Nutrients:'#7b7042','Major ions':'#657759',Metals:'#76566c',Radiological:'#8b5a49'};
const mapColors=['#285e78','#8a643f','#496b55','#76566c','#657759','#815634','#476b72','#745f3f'];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>value===null||value===undefined||value===''?null:Number(value);
const date=value=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Phoenix',year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value));
const parameter=code=>state.parameters.find(item=>item.parameter_code===code)||{parameter_code:code,parameter_name:code,unit:null,category:'Field',decimals:2};
const measurement=(row,code)=>number(row.measurements?.[code]);
const format=(value,code)=>{const n=number(value),p=parameter(code);if(!Number.isFinite(n))return '—';return n.toLocaleString('en-US',{maximumFractionDigits:p.decimals,minimumFractionDigits:0});};
function setProgram(program,updateHash=true){
 const quality=program==='quality';$('streamPanel').hidden=quality;$('qualityPanel').hidden=!quality;$('streamTab').setAttribute('aria-selected',String(!quality));$('qualityTab').setAttribute('aria-selected',String(quality));
 const label=document.querySelector('.network-label');if(label)label.textContent=quality?'WATER QUALITY MONITORING':'STREAM MONITORING';
 if(updateHash&&history.replaceState)history.replaceState(null,'',quality?'#water-quality':location.pathname+location.search);
 if(quality&&state.map)setTimeout(()=>state.map.invalidateSize(),0);
}
function visibleSites(){return state.drainage==='all'?state.sites:state.sites.filter(site=>site.drainage===state.drainage);}
function visibleSamples(){return state.samples.filter(sample=>(state.drainage==='all'||sample.drainage===state.drainage)&&(state.site==='all'||String(sample.site_id)===state.site));}
function fillFilters(){
 const drainages=[...new Set(state.sites.map(site=>site.drainage))];$('drainageSelect').innerHTML='<option value="all">All drainages</option>'+drainages.map(d=>'<option value="'+esc(d)+'">'+esc(d)+'</option>').join('');$('drainageSelect').value=state.drainage;
 const sites=visibleSites();$('qualitySiteSelect').innerHTML='<option value="all">All locations</option>'+sites.map(site=>'<option value="'+site.site_id+'">'+esc(site.site_name)+' · MLID '+esc(site.mlid)+'</option>').join('');if(!sites.some(site=>String(site.site_id)===state.site))state.site='all';$('qualitySiteSelect').value=state.site;
 const groups=new Map();state.parameters.forEach(p=>{if(!groups.has(p.category))groups.set(p.category,[]);groups.get(p.category).push(p);});$('qualityMetricSelect').innerHTML=[...groups].map(([group,items])=>'<optgroup label="'+esc(group)+'">'+items.map(p=>'<option value="'+esc(p.parameter_code)+'">'+esc(p.parameter_name)+(p.unit?' · '+esc(p.unit):'')+'</option>').join('')+'</optgroup>').join('');if(!state.parameters.some(p=>p.parameter_code===state.metric))state.metric=state.parameters[0]?.parameter_code||'';$('qualityMetricSelect').value=state.metric;
 $('qualityParameterGroups').innerHTML=[...groups].map(([group,items])=>'<dt>'+esc(group)+'</dt><dd>'+items.length+' parameter'+(items.length===1?'':'s')+'</dd>').join('');
}
function renderDirectory(){
 const groups=new Map();state.sites.forEach(site=>{if(!groups.has(site.drainage))groups.set(site.drainage,[]);groups.get(site.drainage).push(site);});
 $('qualitySiteDirectory').innerHTML=[...groups].map(([name,sites])=>'<section class="site-group"><h3>'+esc(name)+'</h3><ul>'+sites.map(site=>'<li><button type="button" data-quality-site="'+site.site_id+'">'+esc(site.site_name)+'<small>MLID '+esc(site.mlid)+'</small></button></li>').join('')+'</ul></section>').join('');
 $('qualitySiteDirectory').querySelectorAll('[data-quality-site]').forEach(button=>button.addEventListener('click',()=>selectSite(button.dataset.qualitySite,true)));
}
function renderLatest(samples){
 const selected=state.site==='all'?null:state.sites.find(site=>String(site.site_id)===state.site);const latest=selected?samples[0]:null;
 const latestFor=metric=>selected?samples.find(row=>measurement(row,metric)!==null):null;
 core.forEach(([metric,valueId,timeId])=>{const row=latestFor(metric);$(valueId).textContent=row?format(measurement(row,metric),metric):'—';$(timeId).textContent=row?date(row.sampled_at):'No result';});
 $('qualitySiteTitle').textContent=selected?selected.site_name:(state.drainage==='all'?'All monitoring locations':state.drainage);
 $('qualityStatus').textContent=latest?'Latest record · '+date(latest.sampled_at):samples.length?samples.length.toLocaleString()+' records in view':'No records for this selection';
}
function metricRows(samples){return samples.filter(row=>Number.isFinite(measurement(row,state.metric)));}
function renderTable(samples){
 const p=parameter(state.metric),rows=metricRows(samples);$('qualityRows').innerHTML=rows.length?rows.slice(0,100).map(row=>'<tr><td>'+esc(date(row.sampled_at))+'</td><td>'+esc(row.site_name)+'<small class="quality-source">MLID '+esc(row.mlid)+(row.notes?' · '+esc(row.notes):'')+'</small></td><td>'+format(measurement(row,state.metric),state.metric)+'</td><td>'+esc(p.unit||'Unit not supplied')+'</td><td>'+esc(row.trip_id||'—')+'</td></tr>').join(''):'<tr><td colspan="5">No '+esc(p.parameter_name.toLowerCase())+' results for this selection.</td></tr>';$('qualityExport').disabled=!samples.length;
}
function renderChart(samples){
 const p=parameter(state.metric),unit=p.unit?' · '+p.unit:'';$('qualityChartLabel').textContent=p.parameter_name+unit;const rows=metricRows(samples);
 if(state.site==='all'){$('qualitySampleCount').textContent=rows.length.toLocaleString()+' reported values';$('qualityChart').innerHTML='<div class="empty">Choose one monitoring location to plot a time series.</div>';return;}
 const points=rows.map(row=>({row,x:new Date(row.sampled_at).getTime(),y:measurement(row,state.metric)})).filter(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)).sort((a,b)=>a.x-b.x);$('qualitySampleCount').textContent=points.length.toLocaleString()+' reported values';
 if(!points.length){$('qualityChart').innerHTML='<div class="empty">No '+esc(p.parameter_name.toLowerCase())+' results recorded for this location.</div>';return;}
 const width=1000,height=270,pad={left:72,right:20,top:18,bottom:39};let minX=points[0].x,maxX=points.at(-1).x;if(minX===maxX){minX-=86400000*15;maxX+=86400000*15;}let minY=Math.min(...points.map(q=>q.y)),maxY=Math.max(...points.map(q=>q.y));if(minY===maxY){const spread=Math.max(Math.abs(minY)*.1,1);minY-=spread;maxY+=spread;}else{const spread=(maxY-minY)*.12;minY=Math.max(0,minY-spread);maxY+=spread;}const x=v=>pad.left+(v-minX)/(maxX-minX)*(width-pad.left-pad.right),y=v=>pad.top+(maxY-v)/(maxY-minY)*(height-pad.top-pad.bottom);
 let svg='<svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="'+esc(p.parameter_name)+' time series">';for(let i=0;i<5;i++){const value=minY+(maxY-minY)*i/4,py=y(value);svg+='<line class="grid-line" x1="'+pad.left+'" y1="'+py+'" x2="'+(width-pad.right)+'" y2="'+py+'"/><text class="axis-label" x="'+(pad.left-9)+'" y="'+(py+4)+'" text-anchor="end">'+esc(format(value,state.metric))+'</text>';}
 const color=categoryColors[p.category]||'#285e78',path=points.map((q,i)=>(i?'L':'M')+x(q.x).toFixed(2)+','+y(q.y).toFixed(2)).join(' ');svg+='<path class="chart-line" stroke="'+color+'" d="'+path+'"/>';points.forEach(point=>{const label=date(point.row.sampled_at)+' · '+format(point.y,state.metric)+(p.unit?' '+p.unit:'');svg+='<circle class="chart-dot" cx="'+x(point.x).toFixed(2)+'" cy="'+y(point.y).toFixed(2)+'" r="4" fill="'+color+'"><title>'+esc(label)+'</title></circle>';});
 for(let i=0;i<5;i++){const when=minX+(maxX-minX)*i/4,px=x(when);svg+='<text class="axis-label" x="'+px+'" y="'+(height-10)+'" text-anchor="middle">'+new Intl.DateTimeFormat('en-US',{timeZone:'America/Phoenix',month:'short',year:'2-digit'}).format(new Date(when))+'</text>';}$('qualityChart').innerHTML=svg+'</svg>';
}
function renderMap(){
 const mapped=state.sites.filter(site=>Number.isFinite(number(site.latitude))&&Number.isFinite(number(site.longitude)));$('qualityMapCount').textContent=mapped.length+' mapped locations';
 if(!window.L){$('qualityMap').innerHTML='<div class="empty">Map library unavailable. Locations remain listed below.</div>';return;}
 if(state.map){state.markers.clearLayers();}else{state.map=L.map('qualityMap',{scrollWheelZoom:false});L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(state.map);state.markers=L.layerGroup().addTo(state.map);}
 const drains=[...new Set(state.sites.map(s=>s.drainage))],bounds=[];mapped.forEach(site=>{const color=mapColors[drains.indexOf(site.drainage)%mapColors.length],lat=number(site.latitude),lon=number(site.longitude);const marker=L.circleMarker([lat,lon],{radius:6,color:'#fff',weight:1.5,fillColor:color,fillOpacity:.95}).addTo(state.markers);marker.bindTooltip('<strong>'+esc(site.site_name)+'</strong><br>'+esc(site.drainage)+' · MLID '+esc(site.mlid));marker.on('click',()=>selectSite(String(site.site_id),true));bounds.push([lat,lon]);});if(bounds.length)state.map.fitBounds(bounds,{padding:[18,18]});
}
function selectSite(siteId,scroll=false){state.site=String(siteId);const site=state.sites.find(s=>String(s.site_id)===state.site);if(site){state.drainage=site.drainage;fillFilters();$('drainageSelect').value=state.drainage;$('qualitySiteSelect').value=state.site;}render();if(scroll)$('qualitySiteTitle').scrollIntoView({behavior:'smooth',block:'center'});}
function render(){const samples=visibleSamples();renderLatest(samples);renderTable(samples);renderChart(samples);}
async function load(){
 $('qualityRefresh').disabled=true;$('qualityError').hidden=true;
 try{const response=await fetch('/api/water-quality');if(!response.ok)throw new Error('Request failed');const data=await response.json();if(!data.ok||!Array.isArray(data.sites)||!Array.isArray(data.parameters)||!Array.isArray(data.samples))throw new Error('Invalid response');state.sites=data.sites;state.parameters=data.parameters;state.samples=data.samples;fillFilters();renderDirectory();renderMap();render();}
 catch{$('qualityError').textContent='Could not load water-quality records. Use Refresh samples to try again.';$('qualityError').hidden=false;$('qualityStatus').textContent='Water-quality records unavailable';}
 finally{$('qualityRefresh').disabled=false;}
}
$('streamTab').addEventListener('click',()=>setProgram('stream'));$('qualityTab').addEventListener('click',()=>setProgram('quality'));$('qualityRefresh').addEventListener('click',load);
$('drainageSelect').addEventListener('change',event=>{state.drainage=event.target.value;state.site='all';fillFilters();render();});$('qualitySiteSelect').addEventListener('change',event=>{state.site=event.target.value;render();});$('qualityMetricSelect').addEventListener('change',event=>{state.metric=event.target.value;render();});
$('qualityExport').addEventListener('click',()=>{const rows=visibleSamples(),head=['sampled_at','sampled_at_MST','mlid','site_code','drainage','location','trip_id','source_site_name','notes','source_document','source_row_number',...state.parameters.map(p=>p.parameter_code)];const body=rows.map(row=>[row.sampled_at,date(row.sampled_at),row.mlid,row.site_code,row.drainage,row.site_name,row.trip_id,row.source_site_name,row.notes,row.source_document,row.source_row_number,...state.parameters.map(p=>row.measurements?.[p.parameter_code])]);const csv=[head,...body].map(row=>row.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='southeast-utah-water-quality.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
setProgram(location.hash==='#water-quality'||location.hash==='#quality'?'quality':'stream',false);addEventListener('hashchange',()=>setProgram(location.hash==='#water-quality'||location.hash==='#quality'?'quality':'stream',false));load();
})();
