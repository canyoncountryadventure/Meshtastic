/* Automated exploratory QA/QC only. Raw observations are never changed. */
const finite = v => v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
const median = values => {
  const a=values.filter(Number.isFinite).sort((x,y)=>x-y);
  return a.length ? (a[Math.floor((a.length-1)/2)] + a[Math.floor(a.length/2)])/2 : null;
};
const deviation = values => { const m=median(values); return m===null ? 0 : 1.4826*(median(values.map(v=>Math.abs(v-m)))||0); };
const standardDeviation = values => { const a=values.filter(Number.isFinite),mean=a.reduce((s,v)=>s+v,0)/Math.max(1,a.length); return a.length>1?Math.sqrt(a.reduce((s,v)=>s+(v-mean)**2,0)/(a.length-1)):0; };
export const DEFAULT_CHECKS=Object.freeze({spike:true,step:true,gap:true,flatline:false,peer:true});
export function analyzeSeries(raw, peerRaw=[], options={}) {
  const p=raw.filter(x=>finite(x.value)!==null&&Number.isFinite(Date.parse(x.observed_at)))
    .map(x=>({...x,id:Number(x.id),value:Number(x.value),at:Date.parse(x.observed_at)}))
    .sort((a,b)=>a.at-b.at||a.id-b.id);
  const check={...DEFAULT_CHECKS,...(options.checks||{})};
  const sigma=Math.max(2,Math.min(8,Number(options.sigma)||4));
  const sensitivity=Math.max(0.5,Math.min(2.5,Number(options.sensitivity)||1));
  const metric=String(options.metric||'stage_ft');
  const isStage=metric==='stage_ft',isTemp=metric==='temperature_f',isFlow=metric==='discharge_cfs';
  const absFloor=(isStage?0.035:isTemp?1.5:1.25)*sensitivity;
  const stepFloor=(isStage?0.075:isTemp?4:2.5)*sensitivity;
  const interval=p.slice(1).map((v,i)=>(v.at-p[i].at)/60000).filter(v=>v>=1&&v<=360);
  const expected=median(interval)||null;
  const flags=new Map();
  const add=(x,code,message,weight=1)=>{
    let f=flags.get(x.id);if(!f){f={id:x.id,observed_at:x.observed_at,value:x.value,types:[],reasons:[],score:0};flags.set(x.id,f);}
    if(!f.types.includes(code)){f.types.push(code);f.reasons.push(message);f.score=Math.max(f.score,weight);}
  };
  for(let i=0;i<p.length;i++){
    const current=p[i],prev=p[i-1],next=p[i+1];
    const neighbors=p.slice(Math.max(0,i-4),i).concat(p.slice(i+1,i+5));
    const local=neighbors.map(x=>x.value), baseline=median(local);
    const spread=deviation(local),sd=standardDeviation(local);
    const sdZ=baseline===null?0:Math.abs(current.value-baseline)/Math.max(sd,absFloor*0.15);
    const robustZ=baseline===null?0:Math.abs(current.value-baseline)/Math.max(spread,absFloor*0.15);
    const relative=isFlow&&baseline!==null?0.13*Math.max(0,Math.abs(baseline)):0;
    const noise=Math.max(absFloor, relative, spread*sigma*sensitivity);
    if(check.spike&&prev&&next&&baseline!==null&&neighbors.length>=4){
      const span=(next.at-prev.at)/60000, agree=Math.abs(prev.value-next.value);
      if(span>0&&span<=Math.max(150,(expected||15)*5)&&Math.abs(current.value-baseline)>noise&&
        agree<Math.max(noise*0.8,absFloor*2)&&
        Math.sign(current.value-prev.value)!==Math.sign(next.value-current.value)){
         add(current,'spike','Isolated departure (rolling SD z='+sdZ.toFixed(1)+', robust MAD z='+robustZ.toFixed(1)+'); confirm with adjacent sensors',3);
      }
    }
    if(check.step&&prev){
      const minutes=(current.at-prev.at)/60000, change=Math.abs(current.value-prev.value);
      const rel=isFlow?Math.max(stepFloor,Math.abs(prev.value)*0.30*sensitivity):stepFloor;
      if(minutes>0&&minutes<=Math.max(90,(expected||15)*3)&&change>rel){
        add(current,'step', 'Abrupt change of '+change.toFixed(isStage?3:1)+' '+(isStage?'ft':isTemp?'°F':'cfs')+' over '+Math.round(minutes)+' min; verify against hydrograph',2);
      }
    }
    if(check.gap&&prev&&expected!==null){
      const minutes=(current.at-prev.at)/60000;
      if(minutes>Math.max(90,expected*3.25)){
        add(current,'gap','Telemetry gap of '+(minutes/60).toFixed(1)+' h (typical '+expected.toFixed(0)+' min)',1);
      }
    }
  }
  if(check.flatline&&p.length>6){
    let run=1;
    for(let i=1;i<p.length;i++){
      run=Math.abs(p[i].value-p[i-1].value)<0.00001?run+1:1;
      if(run===8)add(p[i],'flatline','Eight consecutive identical measurements: check logger resolution and sensor',1);
    }
  }
  if(check.peer&&isStage&&peerRaw.length){
    const peers=peerRaw.filter(x=>finite(x.value)!==null&&Number.isFinite(Date.parse(x.observed_at)))
      .map(x=>({...x,value:Number(x.value),at:Date.parse(x.observed_at)})).sort((a,b)=>a.at-b.at);
    const pairs=[];let j=0;
    for(const x of p){
      while(j+1<peers.length&&Math.abs(peers[j+1].at-x.at)<=Math.abs(peers[j].at-x.at))j++;
      if(peers[j]&&Math.abs(peers[j].at-x.at)<=40*60000)pairs.push({x,offset:x.value-peers[j].value});
    }
    const baseline=median(pairs.map(x=>x.offset));
    const mad=deviation(pairs.map(x=>x.offset));
    if(pairs.length>=7&&baseline!==null)for(const pair of pairs){
      if(Math.abs(pair.offset-baseline)>Math.max(0.10*sensitivity,4*mad*sensitivity)){
        add(pair.x,'peer','Stage offset from other sensor departed from its usual difference; compare datums, blockage, and placement',2);
      }
    }
  }
  const flagged=[...flags.values()].sort((a,b)=>b.score-a.score||Date.parse(b.observed_at)-Date.parse(a.observed_at));
  return {points:p,flags:flagged,expectedMinutes:expected,flaggedCount:flagged.length,coverage:p.length,
    lastObserved:p.length?p[p.length-1].observed_at:null};
}
