(()=>{
const $=id=>document.getElementById(id);
const state={sites:[],samples:[],drainage:'all',site:'all',metric:'e_coli_mpn_100ml'};
const metrics={
 e_coli_mpn_100ml:{label:'E. coli',unit:'MPN / 100 mL',decimals:0,color:'#8a643f'},
 water_temperature_c:{label:'Water temperature',unit:'°C',decimals:1,color:'#a26743'},
 specific_conductivity_us_cm:{label:'Specific conductivity',unit:'µS / cm',decimals:0,color:'#5d7181'},
 ph:{label:'pH',unit:'standard units',decimals:2,color:'#657759'},
 dissolved_oxygen_mg_l:{label:'Dissolved oxygen',unit:'mg / L',decimals:2,color:'#285e78'}
};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>value===null||value===undefined||value===''?null:Number(value);
const date=value=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value));
const format=(value,metric)=>{const n=number(value);return Number.isFinite(n)?n.toFixed(metrics[metric].decimals):'—';};
function setProgram(program,updateHash=true){
 const quality=program==='quality';$('streamPanel').hidden=quality;$('qualityPanel').hidden=!quality;$('streamTab').setAttribute('aria-selected',String(!quality));$('qualityTab').setAttribute('aria-selected',String(quality));
 const label=document.querySelector('.network-label');if(label)label.textContent=quality?'WATER QUALITY MONITORING':'STREAM MONITORING';
 if(updateHash&&history.replaceState)history.replaceState(null,'',quality?'#water-quality':location.pathname+location.search);
}
function visibleSites(){return state.drainage==='all'?state.sites:state.sites.filter(site=>site.drainage===state.drainage);}
function visibleSamples(){return state.samples.filter(sample=>(state.drainage==='all'||sample.drainage===state.drainage)&&(state.site==='all'||String(sample.site_id)===state.site));}
function fillFilters(){
 const drainages=[...new Set(state.sites.map(site=>site.drainage))];$('drainageSelect').innerHTML='<option value="all">All drainages</option>'+drainages.map(d=>'<option value="'+esc(d)+'">'+esc(d)+'</option>').join('');$('drainageSelect').value=state.drainage;
 const sites=visibleSites();$('qualitySiteSelect').innerHTML='<option value="all">All locations</option>'+sites.map(site=>'<option value="'+site.site_id+'">'+esc(site.site_name)+'</option>').join('');if(!sites.some(site=>String(site.site_id)===state.site))state.site='all';$('qualitySiteSelect').value=state.site;
}
function renderDirectory(){
 const groups=new Map();state.sites.forEach(site=>{if(!groups.has(site.drainage))groups.set(site.drainage,[]);groups.get(site.drainage).push(site);});
 $('qualitySiteDirectory').innerHTML=[...groups].map(([name,sites])=>'<section class="site-group"><h3>'+esc(name)+'</h3><ul>'+sites.map(site=>'<li>'+esc(site.site_name)+'</li>').join('')+'</ul></section>').join('');
}
function renderLatest(samples){
 const selected=state.site==='all'?null:state.sites.find(site=>String(site.site_id)===state.site);const latest=selected?samples[0]:null;
 const latestFor=metric=>selected?samples.find(row=>number(row[metric])!==null):null;
 const setLatest=(metric,valueId,timeId)=>{const row=latestFor(metric);$(valueId).textContent=row?(metric==='e_coli_mpn_100ml'?(row.e_coli_qualifier||''):'')+format(row[metric],metric):'—';$(timeId).textContent=row?date(row.sampled_at):'No result';};
 $('qualitySiteTitle').textContent=selected?selected.site_name:(state.drainage==='all'?'All monitoring locations':state.drainage);
 setLatest('e_coli_mpn_100ml','qualityEcoli','qualityEcoliTime');setLatest('water_temperature_c','qualityTemp','qualityTempTime');setLatest('specific_conductivity_us_cm','qualityConductivity','qualityConductivityTime');setLatest('ph','qualityPh','qualityPhTime');setLatest('dissolved_oxygen_mg_l','qualityDo','qualityDoTime');
 $('qualityStatus').textContent=latest?'Latest sample · '+date(latest.sampled_at):samples.length?samples.length+' sampling events in view':'No samples recorded for this selection';
}
function renderTable(samples){
 $('qualityRows').innerHTML=samples.length?samples.slice(0,100).map(row=>{const source=[row.source_site_name,row.source_station_id,row.sample_depth_m===null||row.sample_depth_m===undefined?'':row.sample_depth_m+' m depth'].filter(Boolean).join(' · ');return '<tr><td>'+esc(date(row.sampled_at))+'</td><td>'+esc(row.site_name)+(source?'<small class="quality-source">'+esc(source)+'</small>':'')+'</td><td>'+esc((row.e_coli_qualifier||'')+format(row.e_coli_mpn_100ml,'e_coli_mpn_100ml'))+'</td><td>'+format(row.water_temperature_c,'water_temperature_c')+'</td><td>'+format(row.specific_conductivity_us_cm,'specific_conductivity_us_cm')+'</td><td>'+format(row.ph,'ph')+'</td><td>'+format(row.dissolved_oxygen_mg_l,'dissolved_oxygen_mg_l')+'</td></tr>';}).join(''):'<tr><td colspan="7">No samples recorded for this selection.</td></tr>';$('qualityExport').disabled=!samples.length;
}
function renderChart(samples){
 const m=metrics[state.metric];$('qualityChartLabel').textContent=m.label+' · '+m.unit;document.querySelectorAll('[data-quality-metric]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.qualityMetric===state.metric)));
 if(state.site==='all'){$('qualitySampleCount').textContent=samples.length+' sampling events';$('qualityChart').innerHTML='<div class="empty">Choose one monitoring location to plot a time series.</div>';return;}
 const points=samples.map(row=>({row,x:new Date(row.sampled_at).getTime(),y:number(row[state.metric])})).filter(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)).sort((a,b)=>a.x-b.x);$('qualitySampleCount').textContent=points.length+' reported values';
 if(!points.length){$('qualityChart').innerHTML='<div class="empty">No '+esc(m.label.toLowerCase())+' results recorded for this location.</div>';return;}
 const width=1000,height=270,pad={left:66,right:20,top:18,bottom:39};let minX=points[0].x,maxX=points.at(-1).x;if(minX===maxX){minX-=86400000*15;maxX+=86400000*15;}let minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));if(minY===maxY){const spread=Math.max(Math.abs(minY)*.1,1);minY-=spread;maxY+=spread;}else{const spread=(maxY-minY)*.12;minY=Math.max(0,minY-spread);maxY+=spread;}const x=v=>pad.left+(v-minX)/(maxX-minX)*(width-pad.left-pad.right),y=v=>pad.top+(maxY-v)/(maxY-minY)*(height-pad.top-pad.bottom);
 let svg='<svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="'+esc(m.label)+' time series">';for(let i=0;i<5;i++){const value=minY+(maxY-minY)*i/4,py=y(value);svg+='<line class="grid-line" x1="'+pad.left+'" y1="'+py+'" x2="'+(width-pad.right)+'" y2="'+py+'"/><text class="axis-label" x="'+(pad.left-9)+'" y="'+(py+4)+'" text-anchor="end">'+value.toFixed(m.decimals)+'</text>';}
 const path=points.map((p,i)=>(i?'L':'M')+x(p.x).toFixed(2)+','+y(p.y).toFixed(2)).join(' ');svg+='<path class="chart-line" stroke="'+m.color+'" d="'+path+'"/>';points.forEach(point=>{const label=date(point.row.sampled_at)+' · '+format(point.y,state.metric)+' '+m.unit;svg+='<circle class="chart-dot" cx="'+x(point.x).toFixed(2)+'" cy="'+y(point.y).toFixed(2)+'" r="4" fill="'+m.color+'"><title>'+esc(label)+'</title></circle>';});
 for(let i=0;i<Math.min(5,points.length);i++){const when=minX+(maxX-minX)*(points.length===1?.5:i/(Math.min(5,points.length)-1)),px=x(when);svg+='<text class="axis-label" x="'+px+'" y="'+(height-10)+'" text-anchor="middle">'+new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',month:'short',year:'2-digit'}).format(new Date(when))+'</text>';}$('qualityChart').innerHTML=svg+'</svg>';
}
function render(){const samples=visibleSamples();renderLatest(samples);renderTable(samples);renderChart(samples);}
async function load(){
 $('qualityRefresh').disabled=true;$('qualityError').hidden=true;
 try{const response=await fetch('/api/water-quality');if(!response.ok)throw new Error('Request failed');const data=await response.json();if(!data.ok||!Array.isArray(data.sites)||!Array.isArray(data.samples))throw new Error('Invalid response');state.sites=data.sites;state.samples=data.samples;fillFilters();renderDirectory();render();}
 catch{$('qualityError').textContent='Could not load water-quality records. Use Refresh samples to try again.';$('qualityError').hidden=false;$('qualityStatus').textContent='Water-quality records unavailable';}
 finally{$('qualityRefresh').disabled=false;}
}
$('streamTab').addEventListener('click',()=>setProgram('stream'));$('qualityTab').addEventListener('click',()=>setProgram('quality'));$('qualityRefresh').addEventListener('click',load);
$('drainageSelect').addEventListener('change',event=>{state.drainage=event.target.value;state.site='all';fillFilters();render();});$('qualitySiteSelect').addEventListener('change',event=>{state.site=event.target.value;render();});document.querySelectorAll('[data-quality-metric]').forEach(button=>button.addEventListener('click',()=>{state.metric=button.dataset.qualityMetric;renderChart(visibleSamples());}));
$('qualityExport').addEventListener('click',()=>{const rows=visibleSamples(),head=['sampled_at_UTC','sampled_at_Mountain_Time','site_code','drainage','location','e_coli_mpn_100ml','e_coli_qualifier','water_temperature_C','specific_conductivity_uS_cm','pH','dissolved_oxygen_mg_L','collected_by','notes','source_provider','source_station_id','source_site_name','source_activity_ids','sample_depth_m','source_latitude','source_longitude'];const body=rows.map(row=>[row.sampled_at,date(row.sampled_at),row.site_code,row.drainage,row.site_name,row.e_coli_mpn_100ml,row.e_coli_qualifier,row.water_temperature_c,row.specific_conductivity_us_cm,row.ph,row.dissolved_oxygen_mg_l,row.collected_by,row.notes,row.source_provider,row.source_station_id,row.source_site_name,(row.source_activity_ids||[]).join('|'),row.sample_depth_m,row.source_latitude,row.source_longitude]);const csv=[head,...body].map(row=>row.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='moab-water-quality.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
setProgram(location.hash==='#water-quality'||location.hash==='#quality'?'quality':'stream',false);addEventListener('hashchange',()=>setProgram(location.hash==='#water-quality'||location.hash==='#quality'?'quality':'stream',false));load();
})();
