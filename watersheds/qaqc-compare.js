import {measureSeries,alignSeries,rankSensors} from './qaqc-statistics.js';

const el=id=>document.getElementById(id), COLORS=['#176888','#c66b32','#7153a2','#14836d','#ae466a','#8a7426'];
const state={catalog:[],data:null,results:[],busy:false,selected:[],opened:false};
const units={stage_ft:'ft',temperature_f:'°F',discharge_cfs:'cfs'};
const nice=v=>v==null||!Number.isFinite(v)?'—':Number(v).toLocaleString('en-US',{maximumFractionDigits:Math.abs(v)<1?4:2,minimumFractionDigits:0});
const pc=v=>v==null||!Number.isFinite(v)?'—':(v*100).toFixed(0)+'%';
const date=t=>new Date(t).toLocaleString('en-US',{timeZone:'America/Denver',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const status=(message,error=false)=>{el('qcCompareStatus').textContent=message;el('qcCompareStatus').classList.toggle('qa-error',error);};
const key=x=>Number(x.node_num)+'::'+String(x.series_key);
async function api(params=null,body=null){
 const url='/api/qaqc'+(params?'?'+new URLSearchParams(params):'');
 const response=await fetch(url,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',
   headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||'Comparison request failed (HTTP '+response.status+')');
 return data;
}
function group(){
 return state.catalog.filter(s=>s.series_key.endsWith('|'+el('qcCompareMetric').value))
   .sort((a,b)=>a.station_name.localeCompare(b.station_name)||a.series_key.localeCompare(b.series_key));
}
function defaults(options){
 const metric=el('qcCompareMetric').value;
 const wanted=metric==='temperature_f'
   ?['1949224949::mx2001|temperature_f','1683604927::mx2001|temperature_f','1577197109::environment|temperature_f']
   :metric==='discharge_cfs'
   ?['1949224949::water_distance|discharge_cfs','1949224949::mx2001|discharge_cfs','1683604927::mx2001|discharge_cfs']
   :['1949224949::mx2001|stage_ft','1949224949::water_distance|stage_ft','1683604927::mx2001|stage_ft'];
 const desired=wanted.filter(k=>options.some(x=>key(x)===k));
 return desired.length>=2?desired:options.slice(0,3).map(key);
}
function renderPicker(reset=true){
 const options=group(),existing=reset?defaults(options):state.selected.filter(k=>options.some(x=>key(x)===k));
 if(existing.length<2&&options.length>=2)existing.push(...defaults(options).filter(k=>!existing.includes(k)).slice(0,2-existing.length));
 state.selected=existing.slice(0,16);
 const root=el('qcCompareSeries');root.replaceChildren();
 for(const item of options){
  const id=key(item),label=document.createElement('label');label.className='qa-compare-check';
  const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=state.selected.includes(id);
  checkbox.setAttribute('aria-label','Include '+item.station_name+' '+item.series_key);
  checkbox.onchange=()=>{
    if(checkbox.checked&&!state.selected.includes(id)){
      if(state.selected.length===16){checkbox.checked=false;status('Compare up to sixteen series in one network scan.',true);return;}
      state.selected.push(id);
    }else if(!checkbox.checked)state.selected=state.selected.filter(k=>k!==id);
    updateSelectionLabel();
  };
  const txt=document.createElement('span'),name=document.createElement('strong');name.textContent=item.station_name;
  const details=document.createElement('small');details.textContent=item.label.replace(' · ',' / ');
  txt.append(name,details);label.append(checkbox,txt);root.append(label);
 }
 updateSelectionLabel();
}
function updateSelectionLabel(){el('qcCompareCount').textContent=state.selected.length+' selected (16 max)';}
async function loadCatalog(){
 const response=await api({op:'catalog'});
 state.catalog=response.series||[];
 renderPicker();
 if(!state.catalog.length)status('No eligible sensor series have been received in the last 180 days.',true);
}
function selections(){
 const options=group();
 return state.selected.map(k=>options.find(x=>key(x)===k)).filter(Boolean)
   .map(x=>({node_num:x.node_num,series_key:x.series_key}));
}
function settings(){
 return {stepMinutes:Number(el('qcCompareInterval').value),excludeRejected:el('qcCompareExcludeRejected').checked};
}
async function runComparison(){
 const picked=selections();
 if(picked.length<2||picked.length>16){status('Select 2–16 sensor series measuring the same parameter.',true);return;}
 state.busy=true;el('qcCompareRun').disabled=true;
 status('Reading raw measurements and calculating matched-interval statistics…');
 try{
  const data=await api(null,{action:'compare',series:picked,hours:Number(el('qcCompareWindow').value)});
  state.data=data;
  state.results=(data.series||[]).map((item,i)=>{
    const stats=measureSeries(item.points||[],{...settings(),metric:data.metric,start:data.start,end:data.end});
    return {...item,stats,color:COLORS[i],label:(item.station_name||'Unknown')+' · '+String(item.series_key).split('|')[0]};
  });
  renderAll();
 }catch(error){status(error.message,true);}
 finally{state.busy=false;el('qcCompareRun').disabled=false;}
}
function renderAll(){
 if(!state.data)return;
 const {metric}=state.data,order=el('qcCompareRank').value;
 state.results=state.results.map((r,i)=>({
   ...r,stats:measureSeries(r.points||[],{...settings(),metric:state.data.metric,start:state.data.start,end:state.data.end})
 }));
 const ranked=rankSensors(state.results,order);
 state.results.forEach(x=>{x.plotColor=null;});
 ranked.slice(0,6).forEach((x,i)=>{x.plotColor=COLORS[i];});
 const sufficient=ranked.filter(x=>x.stats.bins.length>=6);
 const top=sufficient.find(x=>Number.isFinite(x.stats[order]));
 status('Compared '+state.results.length+' series over '+state.data.hours+' hours · interval '+settings().stepMinutes+
  ' min · '+(el('qcCompareExcludeRejected').checked?'manually rejected points excluded':'all original measurements included')+
  '. '+(state.results.some(x=>x.truncated)?'At least one source hit its 5,500-reading cap: use a shorter window.':''));
 renderOverview(top);
 renderTable(ranked);
 renderChart();
 buildPairSelectors();
 comparePair();
 el('qcCompareExports').hidden=false;
}
function renderOverview(top){
 const root=el('qcCompareSummary');root.replaceChildren();
 const metric=state.data.metric,unit=units[metric];
 const cards=[
   ['Series compared',String(state.results.length)],
   ['Metric',metric==='temperature_f'?'Temperature':metric==='stage_ft'?'Stage':'Rated discharge'],
   ['Selected window',String(state.data.hours/24)+' days'],
   ['Most variability',top?top.station_name+' / '+top.series_key.split('|')[0]:'Insufficient data']
 ];
 for(const [name,value] of cards){
  const wrap=document.createElement('div');wrap.className='qa-stat';
  const small=document.createElement('small');small.textContent=name;
  const strong=document.createElement('strong');strong.textContent=value; if(name==='Most variability')strong.className='qa-small-value';
  wrap.append(small,strong);root.append(wrap);
 }
 const note=el('qcCompareInterpret');
 note.textContent='Standard deviation (SD) measures observed spread, including true environmental changes. The detrended SD '+
 'is the residual scatter around a local 5-bin linear trend, useful for examining jagged sensor behavior. '+
 'Neither is a calibrated accuracy estimate. Compare sensors using the same parameter and time interval. '+
 (metric==='stage_ft'?'Different sites/sensors have different stage datums; median-centered plots remove each series’ vertical offset.':
 metric==='temperature_f'?'°F values are not ratio-scale; coefficient of variation is intentionally omitted.':
 'Rated discharge depends on each station’s rating curve, which may be provisional.');
}
function headRow(headers){
 const tr=document.createElement('tr');for(const h of headers){const th=document.createElement('th');th.textContent=h;tr.append(th);}return tr;
}
function renderTable(ranked){
 const table=el('qcCompareTable');table.replaceChildren();
 const thead=document.createElement('thead');
 thead.append(headRow(['Station / sensor','Readings','Mean','Sample SD','Robust MAD','Range','Detrended SD','Noise / SD','Median step','CV % (flow)','Bin coverage','Long gaps']));
 table.append(thead);
 const tbody=document.createElement('tbody');
 const unit=units[state.data.metric];
 for(const item of ranked){
  const s=item.stats,tr=document.createElement('tr');
  const name=document.createElement('td'),d=document.createElement('span');
  d.className='qa-series-dot';d.style.background=item.plotColor||'#b9c5cc';
  name.append(d,document.createTextNode(item.label));
  const sub=document.createElement('small');sub.textContent=' ('+s.coveredBins+'/'+s.totalBins+' bins'+(item.truncated?', truncated':'')+')';name.append(sub);
  tr.append(name);
  const values=[s.usedCount,nice(s.mean),nice(s.sd),nice(s.mad),nice(s.range),
     s.residualCount>=5?nice(s.noiseSd):'insufficient',s.noiseFraction===null?'—':pc(s.noiseFraction),nice(s.medianAbsStep),s.cvPercent===null?'—':nice(s.cvPercent),pc(s.coverage),String(s.gaps)];
  for(let i=0;i<values.length;i++){const td=document.createElement('td');td.textContent=String(values[i]);tr.append(td);}
  tbody.append(tr);
 }
 table.append(tbody);
 const top=ranked.filter(x=>Number.isFinite(x.stats.noiseSd)&&x.stats.coveredBins>=6);
 const line=el('qcCompareRankNote');
 line.textContent=(top.length?'Highest detrended SD in this selection: '+rankSensors(top,'noiseSd')[0].label+' ('+nice(rankSensors(top,'noiseSd')[0].stats.noiseSd)+' '+unit+'). ':'')+
  'Ranked by '+({noiseSd:'detrended SD',sd:'raw SD',mad:'robust MAD',range:'raw range',firstDiffSd:'successive-step SD',noiseFraction:'normalized high-frequency scatter',coverage:'bin coverage'}[el('qcCompareRank').value]||'metric')+
  '. “Long gaps” means gaps beyond the greater of 90 min, three sample intervals, or three chart bins.';
}
function normalize(item,point,mode){
 const base=item.stats.regular;
 if(mode==='centered')return point.value-(base.median??0);
 if(mode==='zscore')return base.sd>1e-8?(point.value-base.mean)/base.sd:null;
 return point.value;
}
function svgEl(svg,tag,attrs,content){
 const e=document.createElementNS('http://www.w3.org/2000/svg',tag);
 for(const [k,v] of Object.entries(attrs||{}))e.setAttribute(k,String(v));
 if(content!==undefined)e.textContent=content;
 svg.append(e);return e;
}
function renderChart(){
 const svg=el('qcCompareChart');svg.replaceChildren();
 if(!state.results.length)return;
 const mode=el('qcCompareScale').value,WIDTH=1100,HEIGHT=345,left=67,right=22,top=26,bottom=50;
 const start=Date.parse(state.data.start),end=Date.parse(state.data.end);
 const tracks=state.results.filter(item=>item.plotColor).map(item=>({item,points:item.stats.bins.map(point=>({
   ...point,scaled:normalize(item,point,mode)
 })).filter(p=>Number.isFinite(p.scaled))}));
 const values=tracks.flatMap(x=>x.points.map(p=>p.scaled));
 const lo=Math.min(...values),hi=Math.max(...values);
 if(!values.length){el('qcCompareChartCaption').textContent='No observations in the selected window.';return;}
 const pad=Math.max((hi-lo)*0.08,Math.abs(hi+lo)*0.005,0.005),ymin=lo-pad,ymax=hi+pad;
 const x=t=>left+((t-start)/(end-start))*(WIDTH-left-right),y=v=>top+(ymax-v)/(ymax-ymin)*(HEIGHT-top-bottom);
 for(let i=0;i<=4;i++){
  const val=ymin+(ymax-ymin)*i/4,p=y(val);
  svgEl(svg,'line',{x1:left,x2:WIDTH-right,y1:p,y2:p,stroke:'#dce5eb','stroke-width':1});
  svgEl(svg,'text',{x:left-8,y:p+4,'text-anchor':'end','font-size':13,fill:'#526c7a'},nice(val));
 }
 if(mode!=='raw'&&ymin<=0&&ymax>=0)svgEl(svg,'line',{x1:left,x2:WIDTH-right,y1:y(0),y2:y(0),stroke:'#7892a0','stroke-width':1.5,'stroke-dasharray':'3 4'});
 const ms=settings().stepMinutes*60000;
 for(const track of tracks){
  const segments=[];let segment=[],lastAt=null;
  for(const p of track.points){
   if(lastAt!==null&&p.at-lastAt>ms*1.5){if(segment.length)segments.push(segment);segment=[];}
   segment.push(p);lastAt=p.at;
  }
  if(segment.length)segments.push(segment);
  for(const seg of segments){
   if(seg.length<2)continue;
   const poly=svgEl(svg,'polyline',{points:seg.map(p=>x(p.at).toFixed(1)+','+y(p.scaled).toFixed(1)).join(' '),
      fill:'none',stroke:track.item.plotColor,'stroke-width':2.2,'stroke-linejoin':'round','stroke-linecap':'round'});
   const title=document.createElementNS('http://www.w3.org/2000/svg','title');
   title.textContent=track.item.label;poly.append(title);
  }
  for(const p of track.points){
   const mark=svgEl(svg,'circle',{cx:x(p.at).toFixed(1),cy:y(p.scaled).toFixed(1),r:2.3,fill:track.item.plotColor});
   const title=document.createElementNS('http://www.w3.org/2000/svg','title');
   title.textContent=track.item.label+' · '+date(p.at)+' · '+nice(p.value)+' '+units[state.data.metric];
   mark.append(title);
  }
 }
 for(let i=0;i<=4;i++){const at=start+(end-start)*i/4;
  svgEl(svg,'text',{x:x(at),y:HEIGHT-13,'font-size':12,fill:'#526c7a','text-anchor':i===0?'start':i===4?'end':'middle'},
   new Date(at).toLocaleDateString('en-US',{timeZone:'America/Denver',month:'short',day:'numeric',hour:'numeric'}));
 }
 const legend=el('qcCompareLegend');legend.replaceChildren();
 for(const t of tracks){
  const label=document.createElement('span');label.className='qa-compare-legend';
  const dot=document.createElement('i');dot.style.background=t.item.plotColor;label.append(dot,document.createTextNode(t.item.label));legend.append(label);
 }
 el('qcCompareChartCaption').textContent='Time-binned median measurements; gaps are not connected. '+
 (mode==='centered'?'Each curve is shifted by its own median, preserving differences in variation.':
 mode==='zscore'?'Each curve is expressed in its own standard deviations from its mean (relative shape only).':
 'Actual recorded units are shown. Different sensor datums may place curves far apart.')+
 ' No interpolation. '+(state.results.length>6?'Chart shows the six highest-ranked series; the table includes all '+state.results.length+'.':'');
}
function buildPairSelectors(){
 const selectA=el('qcComparePairA'),selectB=el('qcComparePairB');
 const oldA=selectA.value,oldB=selectB.value;
 const options=state.results.map(x=>({value:key(x),label:x.label}));
 const fill=select=>{
  select.replaceChildren(...options.map(o=>new Option(o.label,o.value)));
 };
 fill(selectA);fill(selectB);
 selectA.value=options.some(o=>o.value===oldA)?oldA:options[0]?.value||'';
 selectB.value=options.some(o=>o.value===oldB)?oldB:options[1]?.value||'';
}
function comparePair(){
 if(!state.data)return;
 const A=state.results.find(x=>key(x)===el('qcComparePairA').value);
 const B=state.results.find(x=>key(x)===el('qcComparePairB').value);
 const box=el('qcComparePairResult');box.replaceChildren();
 if(!A||!B||A===B){box.textContent='Select two distinct sensor series.';return;}
 const stats=alignSeries(A.stats.bins,B.stats.bins,{maxLagMinutes:settings().stepMinutes/2}),metric=state.data.metric,unit=units[metric];
 if(stats.n<4){box.textContent='Only '+stats.n+' synchronized bins. At least four overlapping bins are required to calculate agreement. Try a wider period or larger bin size.';return;}
 const sameStation=Number(A.node_num)===Number(B.node_num);
 const fields=[
   ['Overlapping intervals',String(stats.n)],
   ['Maximum time lag',nice(settings().stepMinutes/2)+' min'],
   ['Pearson correlation (r)',nice(stats.correlation)],
   ['Median A − B offset',nice(stats.medianOffset)+' '+unit],
   ['Offset-corrected RMSE',nice(stats.adjustedRmse)+' '+unit],
   ['Difference SD',nice(stats.spreadSd)+' '+unit],
   ['Difference drift / day',stats.driftPerBin===null?'—':nice(stats.driftPerBin*(1440/settings().stepMinutes))+' '+unit+'/day']
 ];
 for(const [name,value] of fields){
  const wrap=document.createElement('div');wrap.className='qa-stat';
  const nameNode=document.createElement('small');nameNode.textContent=name;
  const valueNode=document.createElement('strong');valueNode.textContent=value;
  wrap.append(nameNode,valueNode);box.append(wrap);
 }
 el('qcComparePairGuidance').textContent=sameStation?
  'Same-station sensor agreement: median offset accommodates different stage datums. Offset-corrected RMSE and difference SD quantify disagreement, not absolute sensor accuracy. Verify both sensors reference the same physical water body.':
  'Cross-station comparison: correlation indicates synchronous changes, not measurement accuracy. Different stations have different hydrology, datums, and temperature regimes; offset-corrected RMSE is descriptive only.';
}
function csvDownload(name,rows){
 const quote=x=>'"'+String(x??'').replaceAll('"','""')+'"';
 const text=rows.map(row=>row.map(quote).join(',')).join('\r\n');
 const blob=new Blob([text],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1200);
}
function exportSummary(){
 if(!state.data)return;
 const columns=['station','node_id','sensor','metric','raw_n','used_n','mean','median','min','max','sample_sd','robust_mad','iqr','range','regular_sd','cv_percent',
 'detrended_sd','detrended_rms','noise_to_sd_ratio','detrend_window_count','median_abs_step','first_difference_sd','time_bin_coverage_pct','long_gaps','longest_gap_min','rejected_readings','truncated'];
 const rows=[columns];
 for(const item of state.results){const s=item.stats;
 rows.push([item.station_name,item.node_num,item.series_key,state.data.metric,s.rawCount,s.usedCount,s.mean,s.median,s.min,s.max,s.sd,s.mad,s.iqr,s.range,s.regular.sd,s.cvPercent,
 s.noiseSd,s.noiseRms,s.noiseFraction,s.residualCount,s.medianAbsStep,s.firstDiffSd,s.coverage*100,s.gaps,s.longestGapMinutes,s.rejectedCount,item.truncated]);}
 csvDownload('watershed-sensor-statistics-'+state.data.metric+'-'+state.data.hours+'h.csv',rows);
}
function exportBinned(){
 if(!state.data)return;
 const rows=[['station','node_id','series','metric','bin_center_mountain_time','bin_center_utc','median_observation_utc','value','original_readings_in_bin','manual_rejections_excluded']];
 for(const item of state.results)for(const p of item.stats.bins)rows.push([
  item.station_name,item.node_num,item.series_key,state.data.metric,date(p.at),new Date(p.at).toISOString(),new Date(p.observedAt).toISOString(),
  p.value,p.n,settings().excludeRejected]);
 csvDownload('watershed-matched-sensor-time-series-'+state.data.metric+'-'+state.data.hours+'h.csv',rows);
}
el('qaqcComparePanel').addEventListener('toggle',async()=>{
 if(!el('qaqcComparePanel').open||state.opened)return;
 state.opened=true;
 try{await loadCatalog();status('Select sensors and run a comparison. Nothing has been changed in the raw database.');}
 catch(e){state.opened=false;status(e.message,true);}
});
el('qcCompareMetric').addEventListener('change',()=>{renderPicker(true);state.data=null;});
el('qcCompareRun').addEventListener('click',runComparison);
el('qcCompareSelectDefaults').addEventListener('click',()=>renderPicker(true));
el('qcCompareSelectAll').addEventListener('click',()=>{
 state.selected=group().slice(0,16).map(key);
 renderPicker(false);runComparison();
});
el('qcCompareRank').addEventListener('change',()=>{if(state.data)renderAll();});
el('qcCompareScale').addEventListener('change',()=>{if(state.data)renderChart();});
el('qcCompareInterval').addEventListener('change',()=>{if(state.data)renderAll();});
el('qcCompareExcludeRejected').addEventListener('change',()=>{if(state.data)renderAll();});
el('qcComparePairA').addEventListener('change',comparePair);
el('qcComparePairB').addEventListener('change',comparePair);
el('qcCompareSummaryExport').addEventListener('click',exportSummary);
el('qcCompareDataExport').addEventListener('click',exportBinned);
