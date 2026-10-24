const $=id=>document.getElementById(id);
let data,recipients=[];
function message(text){$('message').textContent=text;}
function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function parameterOptions(selected){
  const options=data.parameter_choices?.[String($('station').value)]||[];
  $('parameter').replaceChildren(...options.map(id=>{const option=el('option',data.parameters[id]);option.value=id;return option;}));
  $('parameter').value=options.includes(selected)?selected:options[0]||'';
}
async function api(body){const response=await fetch('/api/alerts',body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const result=await response.json();if(!response.ok){if(response.status===401){$('settings').hidden=true;$('loginPanel').hidden=false;$('logout').hidden=true;}throw new Error(result.error || 'Request failed');}return result;}
async function run(action){try{await action();}catch(error){message(error.message);}}
async function load(){data=await api();$('settings').hidden=false;$('loginPanel').hidden=true;$('logout').hidden=false;
  $('station').replaceChildren(...data.stations.map(([id,name])=>{const o=el('option',name);o.value=id;return o;}));
  parameterOptions();
  $('deliveryStatus').textContent=data.email.configured?'Email service connected. Add recipients to activate delivery.':'Email sending is inactive. Connect the email service below, then add recipients to your rule.';
  $('deliveryStatus').classList.toggle('ready',data.email.configured);$('providerState').textContent=data.email.configured?`Connected sender: ${data.email.sender}`:'No email service connected yet.';$('sender').value=data.email.sender;
  $('rules').replaceChildren();for(const rule of data.rules){const card=el('article',undefined,'rule-card'),info=el('div');info.append(el('h3',`${rule.station_name} · ${data.parameters[rule.parameter]}`),el('p',rule.parameter==='offline_hours'?`Email after ${rule.threshold} hours with no station telemetry. Rearms when packets resume.`:`${rule.direction} ${rule.threshold} · allow another alert after going ${rule.direction==='above'?'below':'above'} ${rule.reset_value}`),el('p',rule.recipients.length?rule.recipients.join(', '):'No recipients — add an email to receive alerts.'),el('span',!rule.enabled?'Paused':!rule.recipients.length?'Needs recipients':!data.email.configured?'Needs email service':rule.active?(rule.parameter==='offline_hours'?'Station delayed':'Threshold active'):'Ready','badge'));
    const actions=el('div',undefined,'actions');for(const [label,fn] of [['Edit / emails',()=>edit(rule)],['Send test',()=>run(async()=>{const result=await api({action:'test',id:rule.id});await load();message(`${result.sent} test email(s) accepted; check history for pending or failed sends.`);})],['Delete',()=>run(async()=>{if(!confirm(`Delete ${rule.station_name} alert rule?`))return;await api({action:'delete_rule',id:rule.id});await load();message('Rule deleted.');})]]){const b=el('button',label);b.onclick=fn;if(label==='Send test')b.disabled=!data.email.configured || !rule.recipients.length;actions.append(b);}card.append(info,actions);$('rules').append(card);}
  $('history').replaceChildren();if(!data.history.length){const row=el('tr'),cell=el('td','No emails yet.');cell.colSpan=4;row.append(cell);$('history').append(row);}for(const item of data.history){const row=el('tr');row.append(el('td',new Date(item.created_at).toLocaleString()),el('td',item.recipient),el('td',item.subject),el('td',`${item.status}${item.error?` — ${item.error}`:''}`));$('history').append(row);}
}
function renderRecipients(){$('recipients').replaceChildren();recipients.forEach((email,i)=>{const chip=el('div',undefined,'recipient'),b=el('button','Remove');b.type='button';b.setAttribute('aria-label',`Remove ${email}`);b.onclick=()=>{recipients.splice(i,1);renderRecipients();};chip.append(el('span',email),b);$('recipients').append(chip);});}
function edit(rule={node_num:3044869407,parameter:'offline_hours',direction:'above',threshold:4,reset_value:0,enabled:true,recipients:[]}){$('editorPanel').hidden=false;$('editorTitle').textContent=rule.id?'Edit rule and recipients':'New alert rule';$('ruleId').value=rule.id || '';$('station').value=rule.node_num;parameterOptions(rule.parameter);$('direction').value=rule.direction;$('threshold').value=rule.threshold;$('reset').value=rule.reset_value;$('enabled').checked=rule.enabled;recipients=[...rule.recipients];renderRecipients();recoveryHelp();$('editorPanel').scrollIntoView({behavior:'smooth',block:'start'});}
function addEmail(){const input=$('newEmail');if(!input.value || !input.reportValidity())return;const email=input.value.trim().toLowerCase();if(recipients.length>=20){message('Maximum 20 recipients per rule.');return;}if(!recipients.includes(email))recipients.push(email);input.value='';renderRecipients();}
function recoveryHelp(){
 const offline=$('parameter').value==='offline_hours';
 $('directionWrap').hidden=offline;$('resetWrap').hidden=offline;$('reset').required=!offline;
 $('threshold').step=offline?'1':'any';$('threshold').min=offline?'1':'';$('threshold').max=offline?'168':'';
 $('thresholdLabel').textContent=offline?'No packets for (hours)':'Threshold';
 if(offline){$('direction').value='above';$('recoveryHelp').textContent='Checks run approximately every 30 minutes. The alert fires once after the station stops reporting for this long and rearms when a new packet arrives.';return;}
 const above=$('direction').value==='above';$('recoveryLabel').textContent='Allow another alert when '+(above?'below':'above');$('recoveryHelp').textContent=`Email when the reading goes ${above?'above':'below'} ${$('threshold').value}. Then wait until it goes ${above?'below':'above'} ${$('reset').value} before another crossing can send an email. This prevents repeated emails near the threshold.`;
}
for(const id of ['direction','parameter','threshold','reset'])$(id).addEventListener('input',recoveryHelp);
$('station').addEventListener('change',()=>{parameterOptions($('parameter').value);recoveryHelp();});
$('addEmail').onclick=addEmail;$('newEmail').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();addEmail();}};
$('newRule').onclick=()=>edit();$('cancelEdit').onclick=()=>{$('editorPanel').hidden=true;};$('refresh').onclick=()=>run(load);
$('loginForm').onsubmit=e=>{e.preventDefault();run(async()=>{await api({action:'login',password:$('password').value});$('password').value='';await load();message('Signed in.');});};
$('logout').onclick=()=>run(async()=>{await api({action:'logout'});$('settings').hidden=true;$('loginPanel').hidden=false;$('logout').hidden=true;data=null;recipients=[];message('Signed out.');});
$('ruleForm').onsubmit=e=>{e.preventDefault();run(async()=>{if($('newEmail').value){addEmail();if($('newEmail').value)throw new Error('Fix the recipient address before saving');}await api({action:'save_rule',id:$('ruleId').value || undefined,node_num:Number($('station').value),parameter:$('parameter').value,direction:$('direction').value,threshold:Number($('threshold').value),reset_value:$('parameter').value==='offline_hours'?0:Number($('reset').value),enabled:$('enabled').checked,recipients});$('editorPanel').hidden=true;await load();message('Rule saved. Measurement alerts check new packets; delayed-station alerts are checked on a schedule.');});};
$('providerForm').onsubmit=e=>{e.preventDefault();run(async()=>{await api({action:'save_email',sender:$('sender').value,key:$('providerKey').value.trim()});$('providerKey').value='';await load();message('Email service saved. Use Send test to verify delivery.');});};
run(load);
