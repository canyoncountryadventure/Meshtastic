(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const el=(tag,text)=>{const v=document.createElement(tag);if(text!==undefined)v.textContent=text;return v;};
 const stations=[[1949224949,'Pack Creek'],[1695962694,'Cottonwood Creek'],[2425602407,'Cottonwood Relay'],[4241345683,'Cottonwood Relay 2'],[2004386937,'Matheson Groundwater'],[1683604927,'Mill Creek'],[3044869407,'Hidden Valley'],[1577197109,'Fishlake Hightop'],[2740603892,'Moab'],[647393146,'Seed Relay 1'],[2650172798,'Thousand Lake Mountain']];
 const parameterLabels={offline_hours:'Station unresponsive (hours)',discharge_cfs:'Estimated discharge (cfs)',water_level_ft:'Stage (ft)',temperature_c:'Temperature (°F)',battery_percent:'Battery (%)'};
 const parameterLabel=(parameter,node)=>parameter==='water_level_ft'&&Number(node)===2004386937?'Water depth above logger (ft)':parameter==='temperature_c'&&Number(node)===2004386937?'Groundwater temperature (°F)':parameterLabels[parameter]||parameter;
 let state=null;
 const tell=text=>$('publicMessage').textContent=text;
 async function api(body){
  const res=await fetch('/api/watershed-public',body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'}:{cache:'no-store'});
  let json;try{json=await res.json();}catch{throw new Error('Subscription server did not return a valid response');}
  if(!res.ok){const err=new Error(json.error||'Subscription request failed');err.status=res.status;throw err;}
  return json;
 }
 function handle(fn){Promise.resolve().then(fn).catch(err=>tell(err.message));}
 function options(select,values,selected){select.replaceChildren(...values.map(([value,label])=>{const o=el('option',label);o.value=value;return o;}));select.value=String(selected??values[0][0]);}
 function fillParameters(selected){
  const node=Number($('publicStation').value);
  const choices=[2425602407,4241345683,3044869407,1577197109,2740603892,647393146,2650172798].includes(node)?['offline_hours','temperature_c','battery_percent']:[1695962694,2004386937,1683604927].includes(node)?['offline_hours','water_level_ft','temperature_c','battery_percent']:['offline_hours','discharge_cfs','water_level_ft','temperature_c','battery_percent'];
  options($('publicParameter'),choices.map(x=>[x,parameterLabel(x,node)]),choices.includes(selected)?selected:choices[0]);
  sync();
 }
 function sync(){
  const type=$('publicParameter').value,offline=type==='offline_hours';
  $('publicDirectionWrap').hidden=offline;$('publicResetWrap').hidden=offline;
  $('publicReset').required=!offline;
  if(offline){$('publicDirection').value='above';$('publicThreshold').step='1';$('publicThreshold').min='1';$('publicThreshold').max='168';$('publicThresholdUnit').textContent='(hours)';$('publicRuleHelp').textContent='Notify me when this station has not delivered any telemetry for the selected number of hours. One email per outage; resets after delivery resumes.';}
  else{$('publicThreshold').step='any';$('publicThreshold').min='';$('publicThreshold').max='';$('publicThresholdUnit').textContent='';
   $('publicRuleHelp').textContent='Receive one email when the measurement crosses your threshold. The reset value prevents repeats until the reading recovers.';}
 }
 function edit(rule){
  $('publicRuleId').value=rule?.id||'';
  options($('publicStation'),stations,rule?.node_num||1949224949);
  fillParameters(rule?.parameter||'offline_hours');
  $('publicDirection').value=rule?.direction||'above';
  $('publicThreshold').value=rule?.threshold??3;
  $('publicReset').value=rule?.reset_value??0;
  $('publicEnabled').checked=rule?.enabled??true;
  sync();
  $('publicEditorTitle').textContent=rule?'Edit my notification':'New notification';
  $('publicRuleForm').hidden=false;$('publicRuleForm').scrollIntoView({block:'nearest'});
 }
 function show(){
  const authenticated=!!state;
  $('publicRequestView').hidden=authenticated;$('publicSettings').hidden=!authenticated;
  if(!authenticated)return;
  $('publicWho').textContent='Signed in as '+state.email+'. Only rules for this email are visible below.';
  $('publicRules').replaceChildren();
  if(!state.rules.length)$('publicRules').append(el('p','No alerts yet. Add your first notification rule.'));
  for(const rule of state.rules){
   const card=el('article');card.className='rule-card';
   const info=el('div');
   const status=rule.parameter==='offline_hours'?'No telemetry for '+rule.threshold+' hours':rule.direction+' '+rule.threshold+' (reset '+rule.reset_value+')';
   info.append(el('h3',rule.station_name+' · '+parameterLabel(rule.parameter,rule.node_num)),el('p',status),el('p',rule.enabled?'Enabled':'Paused'));
   const actions=el('div');actions.className='actions';
   const editBtn=el('button','Edit');editBtn.type='button';editBtn.onclick=()=>edit(rule);
   const deleteBtn=el('button','Delete');deleteBtn.type='button';deleteBtn.onclick=()=>handle(async()=>{
    if(!confirm('Delete this notification?'))return;
    await api({action:'delete_rule',id:rule.id});await load();tell('Your alert was deleted.');
   });
   actions.append(editBtn,deleteBtn);card.append(info,actions);$('publicRules').append(card);
  }
 }
 async function load(){
  try{state=await api();}catch(err){if(err.status!==401)tell(err.message);state=null;}
  show();
 }
 $('publicStation').onchange=()=>fillParameters($('publicParameter').value);
 $('publicParameter').onchange=sync;
 $('publicRequestForm').onsubmit=event=>{event.preventDefault();handle(async()=>{
  await api({action:'request_link',email:$('publicEmail').value.trim()});tell('Check your inbox for a verification link. If you have just requested one, allow 10 minutes before trying again.');
 });};
 $('publicRuleForm').onsubmit=event=>{event.preventDefault();handle(async()=>{
  const offline=$('publicParameter').value==='offline_hours';
  await api({action:'save_rule',id:$('publicRuleId').value||undefined,node_num:Number($('publicStation').value),
   parameter:$('publicParameter').value,direction:offline?'above':$('publicDirection').value,
   threshold:Number($('publicThreshold').value),reset_value:offline?0:Number($('publicReset').value),
   enabled:$('publicEnabled').checked});
  $('publicRuleForm').hidden=true;await load();tell('Your notification was saved.');
 });};
 $('newPublicRule').onclick=()=>edit(null);
 $('publicCancel').onclick=()=>{$('publicRuleForm').hidden=true;};
 $('publicLogout').onclick=()=>handle(async()=>{await api({action:'logout'});state=null;$('publicRuleForm').hidden=true;show();tell('Signed out of public notifications.');});
 async function start(){
  const hash=window.location.hash||'';
  if(hash.startsWith('#verify=')){
   const token=decodeURIComponent(hash.slice('#verify='.length));
   window.history.replaceState(null,'',window.location.pathname+window.location.search);
   try{await api({action:'verify',token});tell('Your email is verified. Add a notification below.');}
   catch(err){tell(err.message);}
  }
  await load();
 }
 handle(start);
})();
