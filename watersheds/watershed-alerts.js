(()=>{
'use strict';
const $=id=>document.getElementById(id),el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
let data,recipients=[];
const message=t=>$('message').textContent=t;
async function api(body){const r=await fetch('/api/watershed-alerts',body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const d=await r.json();if(!r.ok){if(r.status===401){$('settings').hidden=true;$('loginPanel').hidden=false;$('logout').hidden=true;}throw new Error(d.error||'Request failed');}return d;}
async function run(fn){try{await fn();}catch(e){message(e.message);}}
function label(parameter,node){return parameter==='temperature_c'?(Number(node)===2425602407?'Air temperature (°F)':'Water temperature (°F)'):data.parameters[parameter];}
function parameterOptions(selected){const node=Number($('station').value),choices=node===2425602407?['offline_hours','temperature_c','battery_percent']:node===1695962694?['offline_hours','water_level_ft','temperature_c','battery_percent']:['offline_hours','discharge_cfs','water_level_ft','temperature_c','battery_percent'];$('parameter').replaceChildren(...choices.map(p=>{const o=el('option',label(p,node));o.value=p;return o;}));$('parameter').value=choices.includes(selected)?selected:choices[0];}
async function load(){data=await api();$('settings').hidden=false;$('loginPanel').hidden=true;$('logout').hidden=false;$('station').replaceChildren(...data.stations.map(([id,name])=>{const o=el('option',name);o.value=id;return o;}));parameterOptions();renderGatewayControl();$('serviceStatus').textContent=data.email.configured?'Email delivery connected. Add recipients to a rule to enable notifications.':'Email delivery is not configured.';
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
 $('gatewayApplied').textContent=desired+' · '+applied+(mismatch?' · Waiting for gateway confirmation':' · Confirmed');
}
$('gatewayForm').onsubmit=e=>{e.preventDefault();run(async()=>{
 await api({action:'save_gateway_control',water_enabled:$('gatewayWater').checked,
 hobo_enabled:$('gatewayHobo').checked,authorized_admin_node:Number($('gatewayAdminNode').value)});
 await load();message('Control saved to Neon. Waiting for Heltec to confirm.');
});};
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
