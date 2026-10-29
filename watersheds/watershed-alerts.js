(()=>{
'use strict';
const $=id=>document.getElementById(id),el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
let data,recipients=[];
const batteryStations=[
 {id:1949224949,name:'Pack Creek',color:'#20786d'},
 {id:1695962694,name:'South Cottonwood',color:'#b36b35'},
 {id:1683604927,name:'Mill Creek',color:'#346f9b',external:true},
 {id:2004386937,name:'Matheson Groundwater',color:'#76558f'},
 {id:2425602407,name:'Cottonwood Relay',color:'#b08a24'},
 {id:3044869407,name:'Hidden Valley',color:'#bd4f64',external:true},
 {id:1577197109,name:'Fishlake Hightop',color:'#4f6f32',external:true},
 {id:647393146,name:'Seed Relay 1',color:'#2d8b8b',external:true},
 {id:2650172798,name:'Thousand Lake Mountain',color:'#9a6a42',external:true},
 {id:4241345683,name:'Cottonwood Relay 2',color:'#8a8a55',external:true}
];
const batteryState={hours:168,rows:[],enabled:new Set(batteryStations.map(s=>s.id)),loading:false};
const message=t=>$('message').textContent=t;
async function api(body){const r=await fetch('/api/watershed-alerts',body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const d=await r.json();if(!r.ok){if(r.status===401){$('settings').hidden=true;$('loginPanel').hidden=false;$('logout').hidden=true;}throw new Error(d.error||'Request failed');}return d;}
async function run(fn){try{await fn();}catch(e){message(e.message);}}
const batteryValue=r=>{if(r?.telemetry_type!=='device')return null;const value=Number(r?.metrics?.battery_level??r?.metrics?.battery_percent??r?.metrics?.battery_pct);return Number.isFinite(value)&&value>=0&&value<=100?value:null;};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderBatteryToggles(){
 const wrap=$('batteryStationToggles');if(!wrap)return;wrap.replaceChildren();
 for(const station of batteryStations){const label=el('label'),input=document.createElement('input'),dot=el('i'),text=el('span',station.name);input.type='checkbox';input.checked=batteryState.enabled.has(station.id);input.onchange=()=>{input.checked?batteryState.enabled.add(station.id):batteryState.enabled.delete(station.id);renderBatteryChart();};dot.style.background=station.color;label.append(input,dot,text);wrap.append(label);}
}
function renderBatteryChart(){
 const target=$('adminBatteryChart');if(!target)return;
 const series=batteryStations.map(station=>({station,points:batteryState.rows.filter(r=>Number(r.node_num)===station.id&&batteryValue(r)!==null).map(r=>({x:Date.parse(r.observed_at),y:batteryValue(r)})).filter(p=>Number.isFinite(p.x)).sort((a,b)=>a.x-b.x)})).filter(s=>batteryState.enabled.has(s.station.id)&&s.points.length);
 const count=series.reduce((sum,s)=>sum+s.points.length,0);$('adminBatteryStatus').textContent=count?count+' battery reading'+(count===1?'':'s')+' shown · '+series.length+' station'+(series.length===1?'':'s'):'No battery percentage readings in this period.';
 if(!count){target.innerHTML='<div class="empty">No battery percentage readings for the selected stations and period.</div>';return;}
 const w=920,h=300,p={l:48,r:16,t:14,b:34},now=Date.now(),start=now-batteryState.hours*3600000,x=t=>p.l+(t-start)/(now-start)*(w-p.l-p.r),y=v=>p.t+(100-v)/100*(h-p.t-p.b);
 let svg='<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Station battery percentage history">';
 for(const level of [0,25,50,75,100])svg+='<line class="grid" x1="'+p.l+'" y1="'+y(level)+'" x2="'+(w-p.r)+'" y2="'+y(level)+'"></line><text class="axis-label" x="'+(p.l-8)+'" y="'+(y(level)+4)+'" text-anchor="end">'+level+'%</text>';
 for(let i=0;i<=4;i++){const t=start+(now-start)*i/4;svg+='<text class="axis-label" x="'+x(t)+'" y="'+(h-9)+'" text-anchor="middle">'+esc(new Date(t).toLocaleDateString('en-US',{timeZone:'America/Denver',month:'short',day:'numeric'}))+'</text>';}
 for(const s of series){const path=s.points.map((point,i)=>(i?'L':'M')+x(point.x).toFixed(1)+' '+y(point.y).toFixed(1)).join(' ');svg+='<path class="battery-line" stroke="'+s.station.color+'" d="'+path+'"></path>';for(const point of s.points){const label=s.station.name+' · '+point.y.toFixed(0)+'% · '+new Date(point.x).toLocaleString('en-US',{timeZone:'America/Denver',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});svg+='<circle class="battery-dot" cx="'+x(point.x).toFixed(1)+'" cy="'+y(point.y).toFixed(1)+'" r="3.5" fill="'+s.station.color+'" tabindex="0" aria-label="'+esc(label)+'"><title>'+esc(label)+'</title></circle>';}}
 target.innerHTML=svg+'</svg>';target.querySelectorAll('.battery-dot').forEach(dot=>{const show=()=>{$('adminBatteryReadout').textContent=dot.getAttribute('aria-label');};dot.addEventListener('pointerenter',show);dot.addEventListener('focus',show);dot.addEventListener('click',show);});
}
async function loadBatteryHistory(){
 if(batteryState.loading)return;batteryState.loading=true;$('adminBatteryStatus').textContent='Loading battery history…';
 try{const base='/api/watershed-readings?hours='+batteryState.hours;const requests=[fetch(base,{cache:'no-store'})];const payloads=await Promise.all(requests.map(async request=>{const response=await request;if(!response.ok)throw new Error('Battery history request failed');return response.json();}));batteryState.rows=payloads.flatMap(payload=>Array.isArray(payload.readings)?payload.readings:[]);renderBatteryChart();}
 catch{$('adminBatteryStatus').textContent='Battery history is temporarily unavailable.';$('adminBatteryChart').innerHTML='<div class="empty">Could not load battery history. Try again shortly.</div>';}
 finally{batteryState.loading=false;}
}
function label(parameter,node){return parameter==='temperature_c'?([2425602407,4241345683,3044869407,1577197109,2740603892,647393146,2650172798].includes(Number(node))?'Air temperature (°F)':Number(node)===2004386937?'Groundwater temperature (°F)':'Water temperature (°F)'):parameter==='water_level_ft'&&Number(node)===2004386937?'Water depth above logger (ft)':data.parameters[parameter];}
function parameterOptions(selected){const node=Number($('station').value),airNodes=[2425602407,4241345683,3044869407,1577197109,2740603892,647393146,2650172798],choices=airNodes.includes(node)?['offline_hours','temperature_c','battery_percent']:[1695962694,2004386937,1683604927].includes(node)?['offline_hours','water_level_ft','temperature_c','battery_percent']:['offline_hours','discharge_cfs','water_level_ft','temperature_c','battery_percent'];$('parameter').replaceChildren(...choices.map(p=>{const o=el('option',label(p,node));o.value=p;return o;}));$('parameter').value=choices.includes(selected)?selected:choices[0];}
async function load(){data=await api();$('settings').hidden=false;$('loginPanel').hidden=true;$('logout').hidden=false;$('station').replaceChildren(...data.stations.map(([id,name])=>{const o=el('option',name);o.value=id;return o;}));parameterOptions();renderGatewayControl();renderBatteryToggles();loadBatteryHistory();$('serviceStatus').textContent=data.email.configured?'Email delivery connected. Add recipients to a rule to enable notifications.':'Email delivery is not configured.';
 $('rules').replaceChildren();for(const rule of data.rules){const card=el('article');card.className='rule-card';const info=el('div');info.append(el('h3',rule.station_name+' · '+label(rule.parameter,rule.node_num)),el('p',rule.parameter==='offline_hours'?'Email after '+rule.threshold+' hours without telemetry':rule.direction+' '+rule.threshold+' · allow another alert after going '+(rule.direction==='above'?'below ':'above ')+rule.reset_value),el('p',rule.recipients.length?rule.recipients.join(', '):'No recipients'),el('p',!rule.enabled?'Paused':!rule.recipients.length?'Add recipients':rule.active?'Threshold active':'Ready'));const actions=el('div');actions.className='actions';for(const [title,fn] of [['Edit / emails',()=>edit(rule)],['Send test',()=>run(async()=>{const d=await api({action:'test',id:rule.id});await load();message(d.sent+' test email(s) accepted.');})],['Delete',()=>run(async()=>{if(!confirm('Delete this notification rule?'))return;await api({action:'delete_rule',id:rule.id});await load();message('Rule deleted.');})]]){const b=el('button',title);b.onclick=fn;if(title==='Send test')b.disabled=!data.email.configured||!rule.recipients.length;actions.append(b);}card.append(info,actions);$('rules').append(card);}
 $('history').replaceChildren();if(!data.history.length){const row=el('tr'),cell=el('td','No emails yet.');cell.colSpan=4;row.append(cell);$('history').append(row);}for(const item of data.history){const row=el('tr');row.append(el('td',new Date(item.created_at).toLocaleString('en-US',{timeZone:'America/Denver'})),el('td',item.recipient),el('td',item.subject),el('td',item.status));$('history').append(row);}}
function renderGatewayControl(){
 const c=data.gateway_control;if(!c)return;
 $('gatewayWater').checked=c.water_enabled;$('gatewayHobo').checked=c.hobo_enabled;
 $('gatewayAdminNode').value=String(c.authorized_admin_node||0);
 const desired='Requested: WATER '+(c.water_enabled?'on':'paused')+', HOBO '+(c.hobo_enabled?'on':'paused');
 const applied=c.applied_at?'Applied: WATER '+(c.applied_water_enabled?'on':'paused')+', HOBO '+(c.applied_hobo_enabled?'on':'paused')+' · '+new Date(c.applied_at).toLocaleString('en-US',{timeZone:'America/Denver'}):'Heltec has not yet reported applying any control settings.';
 const mismatch=c.applied_version===null||Number(c.applied_version)!==Number(c.version)||
   c.applied_water_enabled!==c.water_enabled||c.applied_hobo_enabled!==c.hobo_enabled;
 $('gatewayApplied').textContent=desired+' · '+applied+(mismatch?' · Not matching requested controls yet':' · Confirmed');
}
$('gatewayForm').onsubmit=e=>{e.preventDefault();run(async()=>{
 await api({action:'save_gateway_control',water_enabled:$('gatewayWater').checked,
 hobo_enabled:$('gatewayHobo').checked,authorized_admin_node:Number($('gatewayAdminNode').value)});
 await load();message('Control saved to Neon. Waiting for Heltec to confirm.');
});};
document.querySelectorAll('[data-battery-hours]').forEach(button=>button.addEventListener('click',()=>{batteryState.hours=Number(button.dataset.batteryHours);document.querySelectorAll('[data-battery-hours]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));loadBatteryHistory();}));
function renderRecipients(){$('recipients').replaceChildren();recipients.forEach((email,i)=>{const row=el('div'),b=el('button','Remove');row.className='recipient';b.type='button';b.onclick=()=>{recipients.splice(i,1);renderRecipients();};row.append(el('span',email),b);$('recipients').append(row);});}
function edit(rule={node_num:1949224949,parameter:'discharge_cfs',direction:'above',threshold:10,reset_value:9,enabled:true,recipients:[]}){$('ruleId').value=rule.id||'';$('station').value=rule.node_num;parameterOptions(rule.parameter);$('direction').value=rule.direction;$('threshold').value=rule.threshold;$('reset').value=rule.reset_value;$('enabled').checked=rule.enabled;recipients=[...rule.recipients];renderRecipients();recoveryHelp();$('editorPanel').hidden=false;$('editorPanel').scrollIntoView({block:'start'});}
function addEmail(){const input=$('newEmail');if(!input.value||!input.reportValidity())return;if(recipients.length>=20){message('Use up to 20 email addresses.');return;}const address=input.value.trim().toLowerCase();if(!recipients.includes(address))recipients.push(address);input.value='';renderRecipients();}
$('station').onchange=()=>{parameterOptions($('parameter').value);recoveryHelp();};
function recoveryHelp(){
 const offline=$('parameter').value==='offline_hours';
 $('directionWrap').hidden=offline;$('resetWrap').hidden=offline;
 $('direction').value=offline?'above':$('direction').value;
 $('reset').required=!offline;
 $('threshold').step=offline?'1':'any';$('threshold').min=offline?'1':'';$('threshold').max=offline?'168':'';
 if(offline){$('thresholdWrap').firstChild.textContent='Unresponsive for (hours)';$('recoveryHelp').textContent='A notification is sent if no packet arrives for this many hours. Another notification is allowed only after the station resumes transmitting.';return;}
 $('thresholdWrap').firstChild.textContent='Threshold';
 const above=$('direction').value==='above',unit=$('parameter').value==='battery_percent'?'%':$('parameter').value==='temperature_c'?' °F':$('parameter').value==='discharge_cfs'?' cfs':' ft';$('recoveryLabel').textContent='Allow another alert when '+(above?'below':'above');$('recoveryHelp').textContent=`Email when the reading goes ${above?'above':'below'} ${$('threshold').value}${unit}. Then wait until it goes ${above?'below':'above'} ${$('reset').value}${unit} before another crossing can send an email. This prevents repeated emails near the threshold.`;}
for(const id of ['direction','parameter','threshold','reset'])$(id).addEventListener('input',recoveryHelp);$('addEmail').onclick=addEmail;$('newEmail').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();addEmail();}};$('newRule').onclick=()=>edit();$('cancelEdit').onclick=()=>{$('editorPanel').hidden=true;};$('refresh').onclick=()=>run(load);
$('loginForm').onsubmit=e=>{e.preventDefault();run(async()=>{await api({action:'login',password:$('password').value});$('password').value='';await load();message('Signed in.');});};
$('logout').onclick=()=>run(async()=>{await api({action:'logout'});$('settings').hidden=true;$('loginPanel').hidden=false;$('logout').hidden=true;data=null;recipients=[];message('Signed out.');});
$('ruleForm').onsubmit=e=>{e.preventDefault();run(async()=>{if($('newEmail').value){addEmail();if($('newEmail').value)throw new Error('Fix the recipient address before saving.');}await api({action:'save_rule',id:$('ruleId').value||undefined,node_num:Number($('station').value),parameter:$('parameter').value,direction:$('direction').value,threshold:Number($('threshold').value),reset_value:$('parameter').value==='offline_hours'?0:Number($('reset').value),enabled:$('enabled').checked,recipients});$('editorPanel').hidden=true;await load();message('Notification rule saved.');});};
run(load);
})();
