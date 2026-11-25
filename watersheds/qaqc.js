import { analyzeSeries,DEFAULT_CHECKS } from './qaqc-engine.js';
const $=id=>document.getElementById(id);
const state={catalog:[],data:null,results:null,expanded:false,busy:false};
const fmtDate=value=>{const d=new Date(value);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).format(d)+' MT':'—';};
const metricUnit=key=>key.endsWith('|temperature_f')?'°F':key.endsWith('|discharge_cfs')?'cfs':'ft';
function setStatus(message,error=false){$('qaqcStatus').textContent=message;$('qaqcStatus').classList.toggle('qa-error',error);}
async function api(query,body){
 const response=await fetch('/api/qaqc'+(query?'?'+new URLSearchParams(query).toString():''),body?{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify(body)}:{credentials:'same-origin',cache:'no-store'});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||'QA/QC request failed');
 return data;
}
function selected(){
 const node=Number($('qaqcStation').value);
 return {node_num:node,series_key:$('qaqcMetric').value};
}
function setupMetric(){
 const node=Number($('qaqcStation').value),prior=$('qaqcMetric').value;
 const options=state.catalog.filter(s=>s.node_num===node);
 $('qaqcMetric').replaceChildren(...options.map(s=>{const o=new Option(s.label,s.series_key);return o;}));
 if(options.some(s=>s.series_key===prior))$('qaqcMetric').value=prior;
 else if(options.some(s=>s.series_key==='mx2001|stage_ft'))$('qaqcMetric').value='mx2001|stage_ft';
 else if(options.some(s=>s.series_key==='water_distance|discharge_cfs'))$('qaqcMetric').value='water_distance|discharge_cfs';
}
async function loadCatalog(){
 if(state.catalog.length)return;
 const data=await api({op:'catalog'});
 state.catalog=data.series||[];
 const names=[...new Map(state.catalog.map(s=>[s.node_num,s.station_name])).entries()]
   .sort((a,b)=>a[1].localeCompare(b[1]));
 $('qaqcStation').replaceChildren(...names.map(([num,name])=>new Option(name,String(num))));
 if(names.some(n=>n[0]===1949224949))$('qaqcStation').value='1949224949';
 setupMetric();
 if(!names.length)setStatus('No temperature or water-level series have been received in the last 180 days.');
}
function settings(){
 return {checks:Object.fromEntries(['spike','step','gap','flatline','peer'].map(key=>[key,$('qaqcCheck'+key).checked])),
 sigma:Number($('qaqcSigma').value),sensitivity:Number($('qaqcSensitivity').value)};
}
function applySettings(s){
 const checks={...DEFAULT_CHECKS,...(s?.checks||{})};
 for(const key of Object.keys(DEFAULT_CHECKS))$('qaqcCheck'+key).checked=Boolean(checks[key]);
 $('qaqcSigma').value=String(s?.sigma??4);
 $('qaqcSensitivity').value=String(s?.sensitivity??1);
 if(!$('qaqcSigma').value)$('qaqcSigma').value='4';
 if(!$('qaqcSensitivity').value)$('qaqcSensitivity').value='1';
}
async function loadSeries(){
 if(!state.catalog.length)await loadCatalog();
 if(!$('qaqcMetric').value)return;
 state.busy=true;$('qaqcLoad').disabled=true;
 const {node_num,series_key}=selected();
 setStatus('Analyzing original observations and saved review decisions…');
 try{
   state.data=await api({op:'series',node:node_num,series:series_key,hours:Number($('qaqcWindow').value)});
   applySettings(state.data.settings);
   state.expanded=false;
   render();
 }catch(error){setStatus(error.message,true);}
 finally{state.busy=false;$('qaqcLoad').disabled=false;}
}
function render(){
 if(!state.data)return;
 const data=state.data;
 state.results=analyzeSeries(data.points,data.peer,{...settings(),metric:data.series_key.split('|')[1]});
 const {points,flags,expectedMinutes}=state.results;
 const review=new Map(data.reviews.map(r=>[Number(r.observation_id),r]));
 const rejected=data.reviews.filter(r=>r.decision==='rejected').length;
 const relevant=flags.filter(f=>!review.has(f.id)||review.get(f.id).decision==='needs_review');
 const gap=flags.filter(f=>f.types.includes('gap')).length;
 $('qaqcStats').replaceChildren();
 for(const [title,value] of [['Observed',String(points.length)],['Needs review',String(relevant.length)],['Gaps',String(gap)],['Rejected',String(rejected)],['Typical interval',expectedMinutes===null?'—':Math.round(expectedMinutes)+' min']]){
   const el=document.createElement('div');el.className='qa-stat';
   const label=document.createElement('small');label.textContent=title;
   const strong=document.createElement('strong');strong.textContent=value;el.append(label,strong);$('qaqcStats').append(el);
 }
 setStatus(data.station_name+' · '+data.series_key.replace('|',' / ')+' · '+Number(data.hours)+' hours. '+(data.limit_reached?'Sample cap reached; narrow the window.':'Raw data retained; flags are advisory.'));
 drawPlot(points,flags,review);
 renderIssues(flags,review);
 renderAudit(data.history||[]);
 $('qaqcCaveat').textContent='Automated flags are screening results, not verified errors. Manual rejection does not delete raw data or silently alter public charts, ratings, or emails.';
}
function drawPlot(points,flags,reviews){
 const svg=$('qaqcPlot');svg.replaceChildren();
 const ns='http://www.w3.org/2000/svg',width=1000,height=285,L=52,R=18,T=23,B=37;
 if(!points.length){$('qaqcPlotCaption').textContent='No reported measurements in this window.';return;}
 let lo=Math.min(...points.map(p=>p.value)),hi=Math.max(...points.map(p=>p.value));
 if(lo===hi){lo-=1;hi+=1;}else{const d=(hi-lo)*0.08;lo-=d;hi+=d;}
 const minT=Date.parse(points[0].observed_at),maxT=Date.parse(points[points.length-1].observed_at);
 const x=p=>L+(maxT===minT?0.5:(Date.parse(p.observed_at)-minT)/(maxT-minT))*(width-L-R);
 const y=p=>T+(hi-p.value)/(hi-lo)*(height-T-B);
 const make=(tag,attrs,text)=>{const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs||{}))el.setAttribute(k,String(v));if(text!==undefined)el.textContent=text;svg.append(el);return el;};
 for(let i=0;i<=4;i++){
   const val=lo+(hi-lo)*i/4,pos=T+(height-T-B)*(1-i/4);
   make('line',{x1:L,y1:pos,x2:width-R,y2:pos,stroke:'#dde6ec','stroke-width':1});
   make('text',{x:4,y:pos+4,fill:'#5f7180','font-size':13},val.toFixed(Math.abs(hi-lo)<1?3:1));
 }
 make('polyline',{points:points.map(p=>x(p).toFixed(1)+','+y(p).toFixed(1)).join(' '),fill:'none',stroke:'#31658a','stroke-width':2,'stroke-linecap':'round','stroke-linejoin':'round'});
 if($('qaqcSmooth').checked&&points.length>2){
   const med=a=>{const s=a.map(v=>v.value).sort((a,b)=>a-b);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;};
   const trend=points.map((p,i)=>({...p,value:med(points.slice(Math.max(0,i-2),Math.min(points.length,i+3)))}));
   make('polyline',{points:trend.map(p=>x(p).toFixed(1)+','+y(p).toFixed(1)).join(' '),fill:'none',stroke:'#158473','stroke-width':2,'stroke-dasharray':'6 4'});
 }
 if($('qaqcClean').checked){
   const clean=points.filter(p=>reviews.get(p.id)?.decision!=='rejected');
   if(clean.length>1)make('polyline',{points:clean.map(p=>x(p).toFixed(1)+','+y(p).toFixed(1)).join(' '),fill:'none',stroke:'#348953','stroke-width':2.5});
 }
 const lookup=new Map(points.map(p=>[p.id,p])),seen=new Set();
 for(const f of flags){
   const p=lookup.get(f.id);if(!p)continue;seen.add(p.id);
   const review=reviews.get(p.id),color=review?.decision==='rejected'?'#bd392c':review?.decision==='accepted'?'#2c825e':'#e09a29';
   const mark=make('circle',{cx:x(p).toFixed(1),cy:y(p).toFixed(1),r:5.2,fill:color,stroke:'#fff','stroke-width':1.2,tabindex:0,role:'button'});
   mark.appendChild(document.createElementNS(ns,'title')).textContent=fmtDate(p.observed_at)+' · '+p.value+' '+metricUnit(state.data.series_key)+' · '+f.types.join(', ');
   const hover=()=>$('qaqcPlotCaption').textContent=fmtDate(p.observed_at)+' | '+p.value+' '+metricUnit(state.data.series_key)+' | '+f.reasons.join('; ');
   mark.addEventListener('mouseenter',hover);mark.addEventListener('focus',hover);mark.addEventListener('click',()=>document.getElementById('qaqcIssue'+p.id)?.scrollIntoView({behavior:'smooth',block:'center'}));
 }
 for(const r of reviews.values()){
   if(seen.has(Number(r.observation_id)))continue;
   const p=lookup.get(Number(r.observation_id));if(!p)continue;
   make('circle',{cx:x(p).toFixed(1),cy:y(p).toFixed(1),r:4.3,fill:r.decision==='rejected'?'#bd392c':'#2c825e',stroke:'#fff'});
 }
 make('text',{x:L,y:height-7,fill:'#5f7180','font-size':12},fmtDate(points[0].observed_at));
 make('text',{x:width-R,y:height-7,'text-anchor':'end',fill:'#5f7180','font-size':12},fmtDate(points[points.length-1].observed_at));
 $('qaqcPlotCaption').textContent='Blue = raw values; dashed teal = 5-sample median; solid green = rejected-excluded preview (if enabled). Amber = screening flag, red = rejected. Raw and public data remain unchanged.';
}
function renderIssues(flags,reviews){
 const root=$('qaqcIssues');root.replaceChildren();
 const items=state.expanded?flags:flags.slice(0,24);
 if(!flags.length){const p=document.createElement('p');p.textContent='No candidate errors with current detection settings. This does not certify the data.';root.append(p);return;}
 for(const f of items){
   const row=document.createElement('article');row.className='qa-issue';row.id='qaqcIssue'+f.id;
   const top=document.createElement('div');top.className='qa-issue-head';
   const strong=document.createElement('strong');strong.textContent=fmtDate(f.observed_at)+' · '+f.value+' '+metricUnit(state.data.series_key);
   const tag=document.createElement('span');tag.className='qa-tag';tag.textContent=(reviews.get(f.id)?.decision||f.types.join(' + ')).replaceAll('_',' ');
   top.append(strong,tag);
   const why=document.createElement('p');why.textContent=f.reasons.join(' · ');
   const note=document.createElement('input');note.type='text';note.maxLength=1000;note.placeholder='Evidence / field note (required to reject)';
   note.value=reviews.get(f.id)?.note||'';
   note.setAttribute('aria-label','Review note for '+fmtDate(f.observed_at));
   const actions=document.createElement('div');actions.className='qa-actions';
   for(const [label,decision] of [['Accept','accepted'],['Needs review','needs_review'],['Reject','rejected'],['Clear','clear']]){
     const button=document.createElement('button');button.type='button';button.textContent=label;
     button.onclick=async()=>{
       if(decision==='rejected'&&note.value.trim().length<6){note.focus();setStatus('Add a specific reason before rejecting this observation.',true);return;}
       button.disabled=true;
       try{await api(null,{action:'review',...selected(),observation_id:f.id,decision,note:note.value.trim()});
         await loadSeries();setStatus('Review saved. Raw sensor observations were not modified.');
       }catch(error){setStatus(error.message,true);button.disabled=false;}
     };
     actions.append(button);
   }
   row.append(top,why,note,actions);root.append(row);
 }
 if(flags.length>24){
   const button=document.createElement('button');button.textContent=state.expanded?'Show first 24':'Show all '+flags.length+' flagged measurements';
   button.onclick=()=>{state.expanded=!state.expanded;renderIssues(flags,reviews);};
   root.append(button);
 }
}
function renderAudit(events){
 const root=$('qaqcAudit');root.replaceChildren();
 if(!events.length){root.textContent='No manual review decisions yet.';return;}
 const table=document.createElement('table');
 const thead=document.createElement('thead');thead.innerHTML='<tr><th>Time</th><th>Observation ID</th><th>Change</th><th>Note</th></tr>';table.append(thead);
 const tbody=document.createElement('tbody');
 for(const event of events){
   const tr=document.createElement('tr');
   for(const text of [fmtDate(event.changed_at),String(event.observation_id),(event.previous_decision||'unreviewed')+' → '+event.new_decision,event.note||'—']){
     const td=document.createElement('td');td.textContent=text;tr.append(td);
   }tbody.append(tr);
 }
 table.append(tbody);root.append(table);
}
function downloadCsv(){
 if(!state.results)return;
 const flags=new Map(state.results.flags.map(f=>[f.id,f])),reviews=new Map(state.data.reviews.map(r=>[Number(r.observation_id),r]));
 const quote=s=>'"'+String(s??'').replaceAll('"','""')+'"';
 const lines=[['observation_id','observed_at','value','unit','auto_flags','review','review_note','raw_quality','rssi','snr','hops'].join(',')];
 for(const p of state.results.points){
   const review=reviews.get(p.id);
   const values=[p.id,p.observed_at,p.value,metricUnit(state.data.series_key),flags.get(p.id)?.types.join('|')||'',review?.decision||'',review?.note||'',p.quality,p.rssi??'',p.snr??'',p.hops??''];
   lines.push(values.map(quote).join(','));
 }
 const blob=new Blob([lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
 const href=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=href;a.download='station-qaqc-'+state.data.node_num+'-'+state.data.series_key.replace('|','-')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(href),2000);
}
$('qaqcPanel').addEventListener('toggle',()=>{if($('qaqcPanel').open&&!state.catalog.length)loadSeries().catch(error=>setStatus(error.message,true));});
$('qaqcStation').addEventListener('change',()=>{setupMetric();loadSeries();});
$('qaqcMetric').addEventListener('change',loadSeries);
$('qaqcWindow').addEventListener('change',loadSeries);
$('qaqcLoad').addEventListener('click',loadSeries);
for(const key of Object.keys(DEFAULT_CHECKS))$('qaqcCheck'+key).addEventListener('change',render);
$('qaqcSigma').addEventListener('change',render);
$('qaqcSensitivity').addEventListener('change',render);
$('qaqcSaveSettings').addEventListener('click',async()=>{if(!state.data)return;
 try{await api(null,{action:'save_settings',...selected(),...settings()});setStatus('QA settings saved for this station and measurement series.');}
 catch(error){setStatus(error.message,true);}
});
$('qaqcSmooth').addEventListener('change',render);
$('qaqcClean').addEventListener('change',render);
$('qaqcCsv').addEventListener('click',downloadCsv);
$('qaqcReloadAudit').addEventListener('click',async()=>{if(!state.data)return;
 try{const d=await api({op:'audit',node:state.data.node_num,series:state.data.series_key});state.data.history=d.history;renderAudit(d.history);}
 catch(error){setStatus(error.message,true);}
});
