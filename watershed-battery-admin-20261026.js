/* Admin-only battery history. No requests until clicked; no scheduled polling. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const NS='http://www.w3.org/2000/svg';
const COLORS=['#2563eb','#bf5813','#00856d','#8a48ba','#ba385e','#0c8193','#927400','#5258bc','#b94d82','#466c21','#9546a7','#267d9f'];
const state={payload:null,selected:new Set(),loading:false};
const dom=(tag,txt)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;return e;};
const svgNode=(tag,attrs,text)=>{const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs||{}))e.setAttribute(k,String(v));if(text!==undefined)e.textContent=text;return e;};
const fmtTime=(value,withTime=false)=>{
 const d=new Date(value);
 return Number.isFinite(+d)?new Intl.DateTimeFormat('en-US',{timeZone:'America/Denver',month:'short',day:'numeric',...(withTime?{hour:'numeric',minute:'2-digit'}:{})}).format(d):'unknown time';
};
const color=i=>COLORS[i%COLORS.length];
function showEmpty(text){
 const target=$('batteryChart');target.replaceChildren(dom('p',text));target.querySelector('p').className='muted';
}
function renderToggles(){
 const target=$('batteryStations');target.replaceChildren();
 if(!state.payload)return;
 state.payload.series.forEach((series,i)=>{
  const label=dom('label');label.className='battery-station-toggle';
  const input=dom('input');input.type='checkbox';input.checked=state.selected.has(String(series.node_num));
  input.setAttribute('aria-label','Show '+series.name+' battery history');
  input.onchange=()=>{if(input.checked)state.selected.add(String(series.node_num));else state.selected.delete(String(series.node_num));renderGraph();};
  const dot=dom('i');dot.className='battery-series-dot';dot.style.backgroundColor=color(i);dot.setAttribute('aria-hidden','true');
  const desc=dom('span');desc.className='battery-station-name';desc.textContent=series.name;
  const latest=series.points.at(-1);
  const meta=dom('small',latest?latest.percent.toFixed(0)+'% · '+fmtTime(latest.at,true):'No percentage readings');
  label.append(input,dot,desc,meta);target.append(label);
 });
}
function renderGraph(){
 const target=$('batteryChart');target.replaceChildren();
 const payload=state.payload;if(!payload){showEmpty('Press Load battery history to view the stations.');return;}
 const displayed=payload.series.map((s,i)=>({...s,color:color(i)})).filter(s=>state.selected.has(String(s.node_num)));
 if(!displayed.length){showEmpty('Select one or more stations to compare.');return;}
 if(!displayed.some(s=>s.points.length)){showEmpty('No radio battery percentages recorded for the selected stations in this period.');return;}
 const width=940,height=330,margin={left:52,right:18,top:22,bottom:44};
 const spanX=width-margin.left-margin.right,spanY=height-margin.top-margin.bottom;
 const end=Date.parse(payload.generated_at),start=end-payload.days*86400000;
 const toX=t=>margin.left+(t-start)/(end-start)*spanX;
 const toY=p=>margin.top+(100-p)/100*spanY;
 const svg=svgNode('svg',{viewBox:'0 0 '+width+' '+height,role:'img','aria-label':'Radio battery percentage by station, zero to one hundred percent over the selected time range'});
 svg.classList.add('battery-history-svg');
 for(const pct of [0,25,50,75,100]){
  const y=toY(pct);
  svg.append(svgNode('line',{x1:margin.left,y1:y,x2:width-margin.right,y2:y,stroke:'#d9e1e7','stroke-width':1}));
  svg.append(svgNode('text',{x:margin.left-10,y:y+4,'text-anchor':'end',fill:'#52606b','font-size':12},pct+'%'));
 }
 for(let i=0;i<=4;i++){
  const x=margin.left+i*spanX/4,t=start+i*(end-start)/4;
  svg.append(svgNode('line',{x1:x,y1:margin.top,x2:x,y2:height-margin.bottom,stroke:'#ecf0f2','stroke-width':1}));
  svg.append(svgNode('text',{x,y:height-17,'text-anchor':'middle',fill:'#52606b','font-size':12},fmtTime(t)));
 }
 const gapMs=(payload.days===7?12:payload.days===30?36:72)*3600000;
 displayed.forEach(s=>{
  const pts=s.points.filter(p=>Number.isFinite(p.percent)&&p.percent>=0&&p.percent<=100&&Date.parse(p.at)>=start&&Date.parse(p.at)<=end);
  if(!pts.length)return;
  let path='',last=NaN;
  pts.forEach(p=>{
   const t=Date.parse(p.at),x=toX(t),y=toY(p.percent);
   path+=(Number.isFinite(last)&&t-last<=gapMs?'L':'M')+x.toFixed(2)+' '+y.toFixed(2)+' ';
   last=t;
  });
  svg.append(svgNode('path',{d:path.trim(),fill:'none',stroke:s.color,'stroke-width':2.6,'stroke-linecap':'round','stroke-linejoin':'round'}));
  pts.forEach(p=>{
   const dot=svgNode('circle',{cx:toX(Date.parse(p.at)),cy:toY(p.percent),r:2.7,fill:s.color,stroke:'#fff','stroke-width':0.6});
   dot.append(svgNode('title',{},s.name+' · '+p.percent.toFixed(0)+'% · '+fmtTime(p.at,true)));
   svg.append(dot);
  });
 });
 target.append(svg);
}
async function loadBattery(){
 if(state.loading)return;
 state.loading=true;const b=$('batteryLoad');b.disabled=true;
 $('batteryStatus').textContent='Loading sampled battery history from both monitoring databases…';
 try{
  const days=Number($('batteryRange').value);
  const response=await fetch('/api/watershed-alerts',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify({action:'battery_history',days})});
  const result=await response.json();
  if(!response.ok){
   if(response.status===401){$('settings').hidden=true;$('loginPanel').hidden=false;$('logout').hidden=true;}
   throw new Error(result.error||'Battery history could not be loaded');
  }
  if(!Array.isArray(result.series))throw new Error('Invalid battery history response');
  if(!state.payload)state.selected=new Set(result.series.map(s=>String(s.node_num)));
  state.payload=result;renderToggles();renderGraph();
  const count=result.series.reduce((n,s)=>n+s.points.length,0);
  $('batteryStatus').textContent='Radio-reported battery percentages · '+result.days+' days · '+result.sampled_hours+'-hour sampling · '+count+' points. Loaded on demand; no automatic polling.';
 }catch(err){$('batteryStatus').textContent=err.message;if(!state.payload)showEmpty('No battery history loaded.');}
 finally{state.loading=false;b.disabled=false;}
}
if(!$('batteryAdminPanel'))return;
$('batteryLoad').addEventListener('click',loadBattery);
$('batteryRange').addEventListener('change',()=>{if(state.payload)loadBattery();});
showEmpty('Select a period and press Load battery history. Data is fetched only when requested.');
})();