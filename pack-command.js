(() => {
  'use strict';

  const PACK_NODE = 4241345683;
  const PACK_RATING = { a: 6.07187614, offset: 0.22259098, b: 1.04237977 };
  const NODES = [
    {node:4241345683,name:'Pack Creek',short:'PC1'},
    {node:1252758033,name:'Hidden Valley',short:'9211'},
    {node:2740603892,name:'Moab',short:'HUB'},
    {node:1577197109,name:'Fishlake Hightop',short:'FLHT'},
    {node:1949224949,name:"It's a Swell Day",short:'SWRP'},
    {node:2650172798,name:'Thousand Lake Mountain',short:'TLRP'},
    {node:2004386937,name:'Wingate Moisture',short:'SOIL'},
    {node:3388602087,name:'Cliff Sensor',short:'CCAT'},
  ];
  const packetSeen = new Map();
  let playTimer = null;
  let playbackWindowEnd = Date.now();

  const style = document.createElement('style');
  style.textContent = `
    .pack-command-hero{margin-top:0;padding:22px;display:grid;grid-template-columns:minmax(340px,.9fr) minmax(520px,1.1fr);gap:18px;border-color:rgba(102,185,255,.42);background:radial-gradient(circle at 5% 0,rgba(102,185,255,.16),transparent 34%),linear-gradient(160deg,rgba(12,43,55,.97),rgba(7,24,31,.98))}
    .pack-command-copy h1{font-size:clamp(34px,5vw,66px);line-height:.95;margin:7px 0 12px;letter-spacing:-.055em}
    .pack-flow-line{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;margin:14px 0 8px}
    .pack-flow-big{font-size:clamp(58px,7vw,92px);font-weight:900;line-height:.82;letter-spacing:-.065em}
    .pack-flow-unit{font-size:20px;color:#86a7ae;font-weight:800;padding-bottom:8px}
    .pack-trend-badge{border:1px solid #315461;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:900;color:#cde7ec;background:#0a2029;margin-bottom:6px}
    .pack-trend-badge.rising{color:#8ef0d4;border-color:rgba(85,217,183,.5)}
    .pack-trend-badge.falling{color:#a9d6ff;border-color:rgba(102,185,255,.5)}
    .pack-story{color:#b9cdd2;line-height:1.55;margin:10px 0 14px;max-width:700px}
    .pack-hero-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:13px}
    .pack-hero-metrics>div,.pack-manual-card{background:#081a21;border:1px solid #1d3b45;border-radius:11px;padding:11px}
    .pack-hero-metrics span,.pack-manual-card span{display:block;color:#7fa1a9;text-transform:uppercase;letter-spacing:.09em;font-size:10px;font-weight:850}
    .pack-hero-metrics strong,.pack-manual-card strong{display:block;font-size:18px;margin-top:5px}
    .pack-manual-card{margin-top:9px}
    .pack-manual-card small{display:block;color:#78959c;margin-top:5px}
    .pack-command-side{display:grid;grid-template-rows:auto auto;gap:10px;min-width:0}
    .pack-side-card{background:#081a21;border:1px solid #1d3b45;border-radius:13px;padding:12px;min-width:0}
    .pack-side-head{display:flex;justify-content:space-between;gap:12px;align-items:baseline;margin-bottom:7px}
    .pack-side-head strong{font-size:13px}.pack-side-head small{color:#7e9aa1;font-size:10px}
    .rating-mini{height:235px;position:relative}.rating-mini svg{display:block;width:100%;height:100%}
    .packet-travel{position:relative;display:grid;grid-template-columns:repeat(4,1fr);align-items:center;gap:9px;padding:12px 4px 8px}
    .packet-travel:before{content:"";position:absolute;left:11%;right:11%;top:29px;height:2px;background:#244b58}
    .packet-node{position:relative;z-index:2;text-align:center}.packet-node i{display:block;width:15px;height:15px;border-radius:50%;margin:0 auto 7px;background:#31515b;border:2px solid #9cb8be}
    .packet-node b{display:block;font-size:10px}.packet-node small{display:block;font-size:9px;color:#76939a;margin-top:2px}
    .packet-pulse{display:none;position:absolute;z-index:3;top:22px;left:10%;width:9px;height:9px;border-radius:50%;background:#66b9ff;box-shadow:0 0 16px #66b9ff}
    .packet-travel.active .packet-pulse{display:block;animation:packetTravel 2.8s linear infinite}
    @keyframes packetTravel{0%{left:10%;opacity:.2}8%{opacity:1}100%{left:89%;opacity:.2}}
    .pack-route-meta{text-align:center;color:#8faab0;font-size:10px;margin-top:4px}
    .pack-command-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:14px;margin-top:14px}
    .pack-command-panel{margin-top:0}
    .playback-controls{display:grid;grid-template-columns:auto 1fr auto auto;gap:10px;align-items:center}
    .playback-controls input[type="range"]{width:100%;accent-color:#66b9ff}
    .playback-time{font-size:12px;font-weight:850;color:#d8eef1;min-width:120px}
    .playback-btn{border:1px solid #294a55;background:#0a1d25;color:#b9d0d5;border-radius:8px;padding:7px 9px;cursor:pointer;font-size:11px;font-weight:800}
    .playback-btn.active{border-color:#66b9ff;color:white}
    .playback-note{color:#78959c;font-size:10px;margin-top:8px}
    .event-list{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}
    .event-chip{border:1px solid #36525c;border-radius:999px;padding:6px 8px;font-size:10px;font-weight:800;color:#bcd0d5;background:#091a21}
    .event-chip.warn{border-color:rgba(243,201,105,.5);color:#f3d994}.event-chip.alert{border-color:rgba(240,116,116,.55);color:#ffabab}.event-chip.good{border-color:rgba(85,217,183,.42);color:#96ead5}
    .heartbeat-panel{grid-column:1/-1}.heartbeat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
    .heartbeat-card{background:#081a21;border:1px solid #1d3b45;border-radius:10px;padding:9px;display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:start}
    .heartbeat-dot{width:10px;height:10px;border-radius:50%;background:#647a80;margin-top:3px}.heartbeat-dot.online{background:#55d9b7;box-shadow:0 0 10px rgba(85,217,183,.55)}.heartbeat-dot.stale{background:#f3c969}.heartbeat-dot.packet-hit{animation:packetHit .8s ease-out}
    @keyframes packetHit{0%{transform:scale(1);box-shadow:0 0 0 0 rgba(85,217,183,.8)}50%{transform:scale(1.8);box-shadow:0 0 0 8px rgba(85,217,183,.12)}100%{transform:scale(1)}}
    .heartbeat-card strong{display:block;font-size:11px}.heartbeat-card small{display:block;color:#7e9ba2;font-size:9px;margin-top:2px}
    .playback-mode-badge{display:none;margin-left:8px;border-radius:999px;padding:4px 8px;background:rgba(99,183,255,.15);color:#a8d8ff;font-size:10px;font-weight:900}body.playback-active .playback-mode-badge{display:inline-block}
    .pack-event-marker{pointer-events:none}
    @media(max-width:1050px){.pack-command-hero{grid-template-columns:1fr}.pack-command-grid{grid-template-columns:1fr}.heartbeat-grid{grid-template-columns:repeat(2,1fr)}}
    @media(max-width:680px){.pack-hero-metrics{grid-template-columns:1fr 1fr}.heartbeat-grid{grid-template-columns:1fr}.playback-controls{grid-template-columns:1fr 1fr}.playback-controls input{grid-column:1/-1}.pack-command-hero{padding:16px}}
  `;
  document.head.appendChild(style);

  const topbar = document.querySelector('.topbar');
  const oldHero = document.querySelector('.comparison-hero');
  if (!topbar || !oldHero) return;

  const hero = document.createElement('section');
  hero.id = 'packCommandHero';
  hero.className = 'hero pack-command-hero';
  hero.innerHTML =
    '<div class="pack-command-copy"><div class="eyebrow">Pack Creek · live discharge command center</div><h1>Pack Creek Flow</h1>' +
    '<div class="pack-flow-line"><span class="pack-flow-big" id="packHeroFlowBig">—</span><span class="pack-flow-unit">CFS</span><span class="pack-trend-badge" id="packHeroTrend">Waiting for stage</span></div>' +
    '<div class="pack-story" id="packStory">Waiting for Pack Creek telemetry.</div>' +
    '<div class="pack-hero-metrics"><div><span>Gallons / minute</span><strong id="packVolumeGpm">—</strong></div><div><span>Gallons / day</span><strong id="packVolumeDay">—</strong></div><div><span>Acre-feet / day</span><strong id="packVolumeAcre">—</strong></div></div>' +
    '<div class="pack-manual-card"><span>Last manual discharge</span><strong id="packLastManual">—</strong><small id="packLastManualDetail">The newest field measurement will appear here automatically after it is added to the rating data.</small></div></div>' +
    '<div class="pack-command-side"><div class="pack-side-card"><div class="pack-side-head"><strong>Rating curve</strong><small>Measured points + live position</small></div><div id="packRatingMini" class="rating-mini"></div></div>' +
    '<div class="pack-side-card"><div class="pack-side-head"><strong>Latest packet path</strong><small id="packPacketAge">Waiting for packet</small></div><div id="packPacketTravel" class="packet-travel"><span class="packet-pulse"></span>' +
    '<div class="packet-node"><i></i><b>Pack RAK</b><small>SEN0313 + HOBO</small></div><div class="packet-node"><i></i><b>LoRa mesh</b><small>relay path</small></div><div class="packet-node"><i></i><b>Moab</b><small>Heltec gateway</small></div><div class="packet-node"><i></i><b>Cloud</b><small>Vercel + Neon</small></div></div><div class="pack-route-meta" id="packPacketRoute">—</div></div></div>';
  topbar.insertAdjacentElement('afterend', hero);

  const packPanel = document.querySelector('.pack-monitor-panel');
  const controlPanel = document.querySelector('.control-panel');
  const airPanel = document.querySelector('.temp-comparison-panel');
  const quickGrid = document.querySelector('.quick-grid');
  if (packPanel) hero.insertAdjacentElement('afterend', packPanel);

  const ops = document.createElement('section');
  ops.className = 'pack-command-grid';
  ops.innerHTML =
    '<article class="panel pack-command-panel"><div class="panel-head"><div><span class="eyebrow">Time machine</span><h2>24-hour playback <span class="playback-mode-badge">PLAYBACK</span></h2><p>Drag or play through the last day. The dashboard rewinds to what the network knew at that moment.</p></div></div><div class="playback-controls"><span class="playback-time" id="packPlaybackLabel">LIVE</span><input id="packPlaybackRange" type="range" min="0" max="1440" step="15" value="1440"><button id="packPlaybackPlay" class="playback-btn" type="button">Play 24h</button><button id="packPlaybackLive" class="playback-btn active" type="button">Live</button></div><div class="playback-note">Playback changes Pack Creek, temperatures, soil moisture, station freshness, RF history, and heartbeat status without changing stored data.</div></article>' +
    '<article class="panel pack-command-panel"><div class="panel-head"><div><span class="eyebrow">Automatic QC</span><h2>Creek events</h2><p>Flags rapid stage changes, packet gaps, sensor disagreement, reboots, new highs, and rating extrapolation.</p></div></div><div id="packEventList" class="event-list"><span class="event-chip good">No active anomalies</span></div></article>' +
    '<article class="panel pack-command-panel heartbeat-panel"><div class="panel-head"><div><span class="eyebrow">Network heartbeat</span><h2>Station uptime & packet pulse</h2><p>A pulse means a newer packet appeared on the latest refresh. Uptime comes directly from device telemetry when available.</p></div></div><div class="heartbeat-grid" id="networkHeartbeatGrid"></div></article>';
  if (packPanel) packPanel.insertAdjacentElement('afterend', ops); else hero.insertAdjacentElement('afterend', ops);

  let anchor = ops;
  [controlPanel, airPanel, oldHero, quickGrid].forEach(el => { if (el) { anchor.insertAdjacentElement('afterend', el); anchor = el; } });
  const intro = oldHero.querySelector('.hero-intro');
  if (intro) {
    const eye=intro.querySelector('.eyebrow'),h1=intro.querySelector('h1'),p=intro.querySelector('p');
    if(eye)eye.textContent='Environmental network';if(h1)h1.textContent='Station conditions';if(p)p.textContent='Air-temperature stations and field-node status sit below the Pack Creek flow command center.';
  }
  if(packPanel){const h2=packPanel.querySelector('h2');if(h2)h2.textContent='Pack Creek discharge & stage';}

  const rowsForPack=()=>state.readings.filter(r=>Number(r.node_num)===PACK_NODE);
  const stageRowsAsc=()=>rowsForPack().filter(r=>r.telemetry_type==='water_distance'&&Number.isFinite(Number(metric(r,'water_level_ft')))&&metric(r,'stage_calibrated')!==false).sort((a,b)=>new Date(a.observed_at)-new Date(b.observed_at));
  const hoboRowsAsc=()=>rowsForPack().filter(r=>r.telemetry_type==='mx2001'&&Number.isFinite(Number(metric(r,'water_level_ft')))).sort((a,b)=>new Date(a.observed_at)-new Date(b.observed_at));
  const packDeviceRows=()=>rowsForPack().filter(r=>r.telemetry_type==='device').sort((a,b)=>new Date(a.observed_at)-new Date(b.observed_at));
  const nowMs=()=>typeof window.dashboardNow==='function'?window.dashboardNow():Date.now();

  function rateStage(stage){const h=Number(stage);if(!Number.isFinite(h)||h<=PACK_RATING.offset)return 0;return PACK_RATING.a*Math.pow(h-PACK_RATING.offset,PACK_RATING.b);}
  function compactNumber(v){if(!Number.isFinite(v))return '—';if(v>=1000000)return (v/1000000).toFixed(v>=10000000?1:2)+'M';if(v>=1000)return Math.round(v).toLocaleString();return v.toFixed(v<10?2:0);}
  function formatUptime(sec){const s=Number(sec);if(!Number.isFinite(s)||s<0)return 'Uptime —';const d=Math.floor(s/86400),h=Math.floor((s%86400)/3600),m=Math.floor((s%3600)/60);return d?'Uptime '+d+'d '+h+'h':h?'Uptime '+h+'h '+m+'m':'Uptime '+m+'m';}
  function currentPack(){const rows=stageRowsAsc(),row=rows.at(-1)||null;if(!row)return null;const stage=Number(metric(row,'water_level_ft')),flow=Number.isFinite(Number(row.discharge_cfs))?Number(row.discharge_cfs):rateStage(stage);return {row,stage,flow};}
  function trendInfo(){const rows=stageRowsAsc();if(rows.length<2)return {label:'Need more stage data',cls:'',delta:null,slope:null};const end=nowMs(),recent=rows.filter(r=>end-new Date(r.observed_at).getTime()<=2*3600000),use=recent.length>=2?recent:rows.slice(-Math.min(6,rows.length)),a=use[0],b=use.at(-1),av=Number(metric(a,'water_level_ft')),bv=Number(metric(b,'water_level_ft')),hours=(new Date(b.observed_at)-new Date(a.observed_at))/3600000,delta=bv-av,slope=hours>0?delta/hours:0;if(Math.abs(delta)<0.01||Math.abs(slope)<0.01)return {label:'→ Stable',cls:'',delta,slope,hours};return delta>0?{label:'↑ Rising',cls:'rising',delta,slope,hours}:{label:'↓ Falling',cls:'falling',delta,slope,hours};}
  function nearestHobo(timeMs){const rows=hoboRowsAsc();if(!rows.length)return null;let best=rows[0],bd=Math.abs(new Date(best.observed_at).getTime()-timeMs);for(const r of rows){const d=Math.abs(new Date(r.observed_at).getTime()-timeMs);if(d<bd){best=r;bd=d;}}return bd<=20*60*1000?best:null;}

  function buildEvents(){
    const end=nowMs(),start=end-24*3600000,stages=stageRowsAsc().filter(r=>new Date(r.observed_at).getTime()>=start),events=[];
    if(stages.length){
      const latest=stages.at(-1),latestStage=Number(metric(latest,'water_level_ft')),maxStage=Math.max(...stages.map(r=>Number(metric(r,'water_level_ft'))));
      if(stages.length>=4&&latestStage>=maxStage-0.005)events.push({time:new Date(latest.observed_at).getTime(),label:'New 24h high',level:'good'});
      if(stages.length>=2){const a=stages.at(-2),b=latest,dt=(new Date(b.observed_at)-new Date(a.observed_at))/3600000,slope=dt>0?(Number(metric(b,'water_level_ft'))-Number(metric(a,'water_level_ft')))/dt:0;if(slope>=0.05)events.push({time:new Date(b.observed_at).getTime(),label:'Rapid rise '+slope.toFixed(2)+' ft/hr',level:'warn'});if(slope<=-0.05)events.push({time:new Date(b.observed_at).getTime(),label:'Rapid fall '+Math.abs(slope).toFixed(2)+' ft/hr',level:'warn'});}
      let maxGap=0,gapTime=null;for(let i=1;i<stages.length;i++){const gap=(new Date(stages[i].observed_at)-new Date(stages[i-1].observed_at))/60000;if(gap>maxGap){maxGap=gap;gapTime=new Date(stages[i].observed_at).getTime();}}
      if(maxGap>45)events.push({time:gapTime,label:'Packet gap '+Math.round(maxGap)+' min',level:'warn'});
      const h=nearestHobo(new Date(latest.observed_at).getTime());if(h){const diff=Math.abs(latestStage-Number(metric(h,'water_level_ft')));if(diff>0.10)events.push({time:new Date(latest.observed_at).getTime(),label:'Sensor mismatch '+diff.toFixed(2)+' ft',level:'alert'});}
      if(latest.discharge_rating_status&&latest.discharge_rating_status!=='within_measured_range')events.push({time:new Date(latest.observed_at).getTime(),label:latest.discharge_rating_status==='extrapolated_high'?'Above measured rating range':'Below measured rating range',level:'alert'});
    }
    const dev=packDeviceRows().at(-1);if(dev){const uptime=Number(metric(dev,'uptime_seconds')),t=new Date(dev.observed_at).getTime();if(Number.isFinite(uptime)&&uptime<3600&&end-t<3*3600000)events.push({time:t,label:'Recent node reboot',level:'warn'});}
    return events;
  }

  function renderFlowAndStory(){
    const cur=currentPack(),trend=trendInfo(),trendEl=document.getElementById('packHeroTrend');
    if(!cur){setText('packHeroFlowBig','—');setText('packStory','Waiting for calibrated Pack Creek stage telemetry.');if(trendEl){trendEl.textContent='Waiting for stage';trendEl.className='pack-trend-badge';}return;}
    setText('packHeroFlowBig',cur.flow.toFixed(2));if(trendEl){trendEl.textContent=trend.label;trendEl.className='pack-trend-badge '+trend.cls;}
    setText('packVolumeGpm',compactNumber(cur.flow*448.831));setText('packVolumeDay',compactNumber(cur.flow*646316.883));setText('packVolumeAcre',(cur.flow*1.98347).toFixed(2));
    const end=nowMs(),start=end-24*3600000,rows=stageRowsAsc().filter(r=>new Date(r.observed_at).getTime()>=start);
    if(rows.length>=2){const first=Number(metric(rows[0],'water_level_ft')),delta=cur.stage-first,peak=Math.max(...rows.map(r=>Number.isFinite(Number(r.discharge_cfs))?Number(r.discharge_cfs):rateStage(Number(metric(r,'water_level_ft'))))),movement=Math.abs(delta)<0.01?'held essentially steady':delta>0?'rose '+delta.toFixed(2)+' ft':'fell '+Math.abs(delta).toFixed(2)+' ft';setText('packStory','Over the last 24 hours Pack Creek '+movement+', peaked near '+peak.toFixed(2)+' CFS, and is now '+trend.label.replace(/[↑↓→]\s*/,'').toLowerCase()+' at '+cur.flow.toFixed(2)+' CFS.');}
    else setText('packStory','Current stage is '+cur.stage.toFixed(2)+' ft and rated discharge is '+cur.flow.toFixed(2)+' CFS. More history is needed for the 24-hour creek story.');
  }

  function renderLastManual(){
    const pts=(state.ratingCurvePoints||[]).filter(p=>Number(p.node_num)===PACK_NODE&&p.included!==false);if(!pts.length){setText('packLastManual','—');return;}
    const observed=pts.filter(p=>p.point_type==='observed'),pool=observed.length?observed:pts;pool.sort((a,b)=>String(a.measurement_date).localeCompare(String(b.measurement_date)));const p=pool.at(-1),d=new Date(String(p.measurement_date).slice(0,10)+'T12:00:00'),date=Number.isNaN(d.getTime())?String(p.measurement_date):d.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'});
    setText('packLastManual',Number(p.final_discharge_cfs).toFixed(3)+' CFS @ '+Number(p.stage_ft).toFixed(3)+' ft');setText('packLastManualDetail',date+(p.measurement_time_local?' · '+p.measurement_time_local:'')+' · '+(p.notes||'Manual field measurement'));
  }

  function renderRatingCurve(){
    const target=document.getElementById('packRatingMini');if(!target)return;const pts=(state.ratingCurvePoints||[]).filter(p=>Number(p.node_num)===PACK_NODE&&p.included!==false&&Number.isFinite(Number(p.stage_ft))&&Number.isFinite(Number(p.final_discharge_cfs))),cur=currentPack();if(!pts.length){target.innerHTML='<div class="empty">Rating points unavailable.</div>';return;}target.innerHTML='';
    const w=560,h=235,L=46,R=15,T=12,B=34,stages=pts.map(p=>Number(p.stage_ft));if(cur)stages.push(cur.stage);let xmin=Math.min(...stages,0.20),xmax=Math.max(...stages,0.72);xmin=Math.max(0,xmin-0.025);xmax+=0.025;const curve=[];for(let i=0;i<=70;i++){const x=xmin+(xmax-xmin)*i/70;curve.push({x,y:rateStage(x)});}const yvals=pts.map(p=>Number(p.final_discharge_cfs)).concat(cur?[cur.flow]:[],curve.map(p=>p.y)),ymin=0,ymax=Math.max(0.5,...yvals)*1.12,sx=v=>L+(v-xmin)/(xmax-xmin)*(w-L-R),sy=v=>T+(ymax-v)/(ymax-ymin)*(h-T-B),svg=svgEl('svg',{viewBox:'0 0 '+w+' '+h,preserveAspectRatio:'none'});target.appendChild(svg);
    for(let i=0;i<=3;i++){const yy=T+(h-T-B)*i/3;svg.appendChild(svgEl('line',{x1:L,x2:w-R,y1:yy,y2:yy,stroke:'#17343d','stroke-width':1}));addText(svg,L-7,yy+4,(ymax-(ymax-ymin)*i/3).toFixed(1),'end','#77959c',10);}for(let i=0;i<=4;i++){const xx=L+(w-L-R)*i/4,val=xmin+(xmax-xmin)*i/4;addText(svg,xx,h-11,val.toFixed(2),'middle','#77959c',10);}
    svg.appendChild(svgEl('polyline',{points:curve.map(p=>sx(p.x)+','+sy(p.y)).join(' '),fill:'none',stroke:'#66b9ff','stroke-width':3,'stroke-linecap':'round'}));const newest=[...pts].sort((a,b)=>String(a.measurement_date).localeCompare(String(b.measurement_date))).at(-1);
    pts.forEach(p=>{const c=svgEl('circle',{cx:sx(Number(p.stage_ft)),cy:sy(Number(p.final_discharge_cfs)),r:p===newest?5.5:4,fill:p.point_type==='modeled_adjustment'?'#f3c969':'#eaf7f6',stroke:p===newest?'#f3c969':'#102a33','stroke-width':p===newest?3:2}),title=svgEl('title');title.textContent=String(p.measurement_date).slice(0,10)+' · '+Number(p.stage_ft).toFixed(4)+' ft · '+Number(p.final_discharge_cfs).toFixed(4)+' CFS';c.appendChild(title);svg.appendChild(c);});
    if(cur){const c=svgEl('circle',{cx:sx(cur.stage),cy:sy(cur.flow),r:7,fill:'#55d9b7',stroke:'#071319','stroke-width':2.5}),title=svgEl('title');title.textContent='LIVE · '+cur.stage.toFixed(3)+' ft · '+cur.flow.toFixed(3)+' CFS';c.appendChild(title);svg.appendChild(c);addText(svg,Math.min(w-R-25,sx(cur.stage)+10),Math.max(18,sy(cur.flow)-9),'LIVE','start','#8ef0d4',10);}addText(svg,7,12,'CFS','start','#8aa8af',10);addText(svg,w-R,h-11,'stage ft','end','#8aa8af',10);
  }

  function renderPacketPath(){const rows=rowsForPack().sort((a,b)=>new Date(b.observed_at)-new Date(a.observed_at)),r=rows[0]||null,box=document.getElementById('packPacketTravel');if(!r){setText('packPacketAge','Waiting for packet');setText('packPacketRoute','—');if(box)box.classList.remove('active');return;}const fresh=ageHours(r.observed_at)<=3.25;if(box)box.classList.toggle('active',fresh);setText('packPacketAge',ageText(r.observed_at));const rv=rssi(r),sv=snr(r),hp=hops(r),route=hp===0?'Direct to Moab':hp===1?'1 relay to Moab':Number.isFinite(hp)?Math.round(hp)+' relays to Moab':'Mesh route';setText('packPacketRoute',route+(rv!==null?' · RSSI '+Math.round(rv)+' dBm':'')+(sv!==null?' · SNR '+sv.toFixed(1)+' dB':''));}
  function renderEvents(){const events=buildEvents(),list=document.getElementById('packEventList');if(list)list.innerHTML=events.length?events.map(e=>'<span class="event-chip '+e.level+'">'+esc(e.label)+'</span>').join(''):'<span class="event-chip good">No active anomalies</span>';setTimeout(()=>overlayEventMarkers(events),0);}
  function overlayEventMarkers(events){const target=document.getElementById('packStageChart'),svg=target?.querySelector('svg');if(!target||!svg||!events.length)return;svg.querySelectorAll('.pack-event-marker').forEach(n=>n.remove());const pts=stageRowsAsc().map(r=>new Date(r.observed_at).getTime());if(pts.length<2)return;const xmin=Math.min(...pts),xmax=Math.max(...pts);if(xmax<=xmin)return;const d=chartDimensions(target);events.forEach((e,i)=>{if(!Number.isFinite(e.time)||e.time<xmin||e.time>xmax)return;const x=d.left+(e.time-xmin)/(xmax-xmin)*d.plotW,color=e.level==='alert'?'#f07474':e.level==='warn'?'#f3c969':'#55d9b7',line=svgEl('line',{x1:x,x2:x,y1:d.top,y2:d.top+d.plotH,stroke:color,'stroke-width':1.3,'stroke-dasharray':'4 5',opacity:.8,class:'pack-event-marker'}),title=svgEl('title');title.textContent=e.label;line.appendChild(title);svg.appendChild(line);svg.appendChild(svgEl('circle',{cx:x,cy:d.top+8+(i%3)*7,r:3.2,fill:color,class:'pack-event-marker'}));});}

  function renderHeartbeat(){
    const grid=document.getElementById('networkHeartbeatGrid');if(!grid)return;
    grid.innerHTML=NODES.map(s=>{const rows=state.readings.filter(r=>Number(r.node_num)===s.node).sort((a,b)=>new Date(b.observed_at)-new Date(a.observed_at)),latest=rows[0]||null,dev=rows.find(r=>r.telemetry_type==='device'&&Number.isFinite(Number(metric(r,'uptime_seconds'))))||null,age=latest?ageHours(latest.observed_at):Infinity,cls=age<=3.25?'online':latest?'stale':'',ts=latest?String(latest.observed_at):'',hit=packetSeen.has(s.node)&&packetSeen.get(s.node)!==ts;if(ts)packetSeen.set(s.node,ts);const sub=dev?formatUptime(metric(dev,'uptime_seconds')):(latest?'Last '+ageText(latest.observed_at):'No telemetry');return '<div class="heartbeat-card"><i class="heartbeat-dot '+cls+(hit?' packet-hit':'')+'"></i><div><strong>'+esc(s.name)+'</strong><small>'+esc(sub)+'</small></div></div>';}).join('');
  }

  function stopPlaybackTimer(){if(playTimer){clearInterval(playTimer);playTimer=null;}const b=document.getElementById('packPlaybackPlay');if(b)b.textContent='Play 24h';}
  function updatePlaybackLabel(){const label=document.getElementById('packPlaybackLabel'),slider=document.getElementById('packPlaybackRange'),t=typeof window.getPlaybackTime==='function'?window.getPlaybackTime():null;document.body.classList.toggle('playback-active',Number.isFinite(t));const live=document.getElementById('packPlaybackLive');if(live)live.classList.toggle('active',!Number.isFinite(t));if(!Number.isFinite(t)){if(label)label.textContent='LIVE';if(slider)slider.value='1440';return;}if(label)label.textContent=new Date(t).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});if(slider){const start=playbackWindowEnd-24*3600000;slider.value=String(Math.max(0,Math.min(1440,Math.round((t-start)/60000))));}}
  function bindPlayback(){
    const slider=document.getElementById('packPlaybackRange'),play=document.getElementById('packPlaybackPlay'),live=document.getElementById('packPlaybackLive');
    slider?.addEventListener('input',()=>{stopPlaybackTimer();const start=playbackWindowEnd-24*3600000,t=start+Number(slider.value)*60000;window.setPlaybackTime?.(t);updatePlaybackLabel();});
    live?.addEventListener('click',()=>{stopPlaybackTimer();playbackWindowEnd=Date.now();window.setPlaybackTime?.(null);updatePlaybackLabel();});
    play?.addEventListener('click',()=>{if(playTimer){stopPlaybackTimer();return;}playbackWindowEnd=Date.now();let minute=0;if(slider)slider.value='0';const start=playbackWindowEnd-24*3600000;window.setPlaybackTime?.(start);play.textContent='Pause';playTimer=setInterval(()=>{minute+=15;if(minute>1440){stopPlaybackTimer();return;}if(slider)slider.value=String(minute);window.setPlaybackTime?.(start+minute*60000);},350);});
  }

  function renderPackCommand(){renderFlowAndStory();renderLastManual();renderRatingCurve();renderPacketPath();renderEvents();renderHeartbeat();updatePlaybackLabel();}
  bindPlayback();
  ['packModeFlow','packModeStage','packSource313','packSource2001'].forEach(id=>document.getElementById(id)?.addEventListener('click',()=>setTimeout(()=>overlayEventMarkers(buildEvents()),20)));
  const previousRenderSummary=renderSummary;
  renderSummary=function(){previousRenderSummary();renderPackCommand();};
  renderPackCommand();
})();