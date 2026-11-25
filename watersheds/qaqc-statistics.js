/*
 * Station comparison mathematics. No new values are written to the telemetry database.
 * "Raw SD" is the sample SD of observations; "hourly/interval SD" uses equally spaced
 * bins; "detrended SD" removes a local linear fit across five adjacent bins, requiring
 * contiguous data. It estimates short-term scatter, not instrument accuracy.
 */
const isFiniteNumber=x=>typeof x==='number'&&Number.isFinite(x);
export function percentile(values,f){
 const s=values.filter(isFiniteNumber).sort((a,b)=>a-b);
 if(!s.length)return null;
 const p=Math.max(0,Math.min(1,f))*(s.length-1),lo=Math.floor(p),hi=Math.ceil(p);
 return s[lo]+(s[hi]-s[lo])*(p-lo);
}
export const median=v=>percentile(v,0.5);
export function descriptive(values){
 const v=values.filter(isFiniteNumber);
 if(!v.length)return {n:0,min:null,max:null,mean:null,median:null,sd:null,iqr:null,mad:null,range:null};
 const n=v.length,mean=v.reduce((a,b)=>a+b,0)/n,m=median(v);
 const min=Math.min(...v),max=Math.max(...v);
 return {n,mean,median:m,min,max,range:max-min,
   sd:n>1?Math.sqrt(v.reduce((sum,x)=>sum+(x-mean)**2,0)/(n-1)):null,
   iqr:n>1?percentile(v,0.75)-percentile(v,0.25):null,
   mad:n>1?1.4826*median(v.map(x=>Math.abs(x-m))):null};
}
function numberOf(point){const n=Number(point?.value);return point?.value===null||!Number.isFinite(n)?null:n;}
export function makeBins(points,{stepMinutes=60,start,end,excludeRejected=false}={}){
 const startMs=Date.parse(start),endMs=Date.parse(end),ms=stepMinutes*60000;
 if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||endMs<=startMs||!Number.isFinite(ms)||ms<60000)throw new Error('Invalid comparison window');
 const buckets=new Map(),effective=[];
 for(const item of points||[]){
   const at=Date.parse(item.observed_at),value=numberOf(item);
   if(value===null||!Number.isFinite(at)||at<startMs||at>endMs)continue;
   if(excludeRejected&&item.review==='rejected')continue;
   effective.push({at,value,id:item.id,review:item.review||null});
   const k=Math.floor((at-startMs)/ms);
   if(!buckets.has(k))buckets.set(k,[]);
   buckets.get(k).push(value);
 }
 effective.sort((a,b)=>a.at-b.at||Number(a.id)-Number(b.id));
 const bins=[...buckets].sort((a,b)=>a[0]-b[0]).map(([k,values])=>({index:k,at:startMs+(k+0.5)*ms,value:median(values),n:values.length}));
 const total=Math.ceil((endMs-startMs)/ms);
 return {effective,bins,totalBins:total,coverage:total>0?bins.length/total:null,intervalMinutes:stepMinutes};
}
export function localNoise(bins){
 const map=new Map(bins.map(b=>[b.index,b.value])), residuals=[],differences=[],changes=[];
 let monotonicCount=0, nAdjacent=0;
 for(const point of bins){
   const now=point.value,prev=map.get(point.index-1);
   if(prev!==undefined){
     const difference=now-prev;differences.push(difference);
     changes.push(Math.abs(difference));
     nAdjacent++;
   }
   const indices=[point.index-2,point.index-1,point.index,point.index+1,point.index+2];
   if(!indices.every(i=>map.has(i)))continue;
   // OLS 5-bin local linear regression; central fitted intercept equals 5-point mean.
   // Nonlinearity or real fast changes can increase residual SD.
   const window=indices.map(i=>map.get(i));
   const fit=window.reduce((sum,v)=>sum+v,0)/5;
   residuals.push(now-fit);
 }
 const d=descriptive(residuals),differenceStats=descriptive(differences);
 const noiseSd=d.sd,noiseRms=residuals.length?Math.sqrt(residuals.reduce((a,v)=>a+v*v,0)/residuals.length):null;
 return {noiseSd,noiseRms,residualCount:residuals.length,medianAbsStep:median(changes),
   firstDiffSd:differenceStats.sd,pairedSteps:nAdjacent};
}
export function measureSeries(points,settings){
 const all=(points||[]).filter(p=>numberOf(p)!==null&&Number.isFinite(Date.parse(p.observed_at)));
 const {effective,bins,totalBins,coverage}=makeBins(all,settings);
 const raw=descriptive(effective.map(p=>p.value));
 const regular=descriptive(bins.map(p=>p.value));
 const noise=localNoise(bins);
 const rawTimes=effective.map(p=>p.at);
 const rawMinutes=rawTimes.slice(1).map((at,i)=>(at-rawTimes[i])/60000).filter(n=>n>0&&Number.isFinite(n));
 const expected=median(rawMinutes.filter(m=>m<=240));
 const gapThreshold=Math.max(settings.stepMinutes*3,expected?expected*3:0,90);
 const gaps=rawMinutes.filter(m=>m>gapThreshold);
 const reliableNoise=noise.residualCount>=5; // Never rank a sensor on 1-2 residuals.
 const minSpread=settings.metric==='temperature_f'?0.2:settings.metric==='discharge_cfs'?0.1:0.01;
 const noiseFraction=reliableNoise&&regular.sd>minSpread?noise.noiseSd/regular.sd:null;
 const cv=settings.metric==='discharge_cfs'&&raw.mean>0.00001&&raw.sd!==null?100*raw.sd/raw.mean:null;
 return {...raw,raw,regular,...noise,
   noiseSd:reliableNoise?noise.noiseSd:null,noiseRms:reliableNoise?noise.noiseRms:null,
   noiseFraction,cvPercent:cv,totalBins,coveredBins:bins.length,coverage,rawCount:all.length,usedCount:effective.length,
   rejectedCount:all.filter(p=>p.review==='rejected').length,
   gaps:gaps.length,longestGapMinutes:gaps.length?Math.max(...gaps):null,typicalRawMinutes:expected,
   firstObserved:effective.length?new Date(effective[0].at).toISOString():null,
   lastObserved:effective.length?new Date(effective[effective.length-1].at).toISOString():null,
   dataSufficient:bins.length>=6,bins};
}
export function alignSeries(a,b){
 // Only truly coincident time bins are compared. No interpolation or fabricated values.
 const indexB=new Map((b||[]).map(v=>[v.index,v.value]));
 const pairs=(a||[]).filter(x=>indexB.has(x.index))
   .map(x=>({index:x.index,x:x.value,y:indexB.get(x.index),difference:x.value-indexB.get(x.index)}));
 if(pairs.length<4)return {n:pairs.length,correlation:null,bias:null,adjustedRmse:null,spreadSd:null,
    driftPerDay:null,medianOffset:null,matched:pairs};
 const xs=pairs.map(p=>p.x),ys=pairs.map(p=>p.y),dif=pairs.map(p=>p.difference);
 const mx=descriptive(xs),my=descriptive(ys),md=descriptive(dif);
 const cov=pairs.reduce((sum,p)=>sum+(p.x-mx.mean)*(p.y-my.mean),0)/(pairs.length-1);
 const corr=mx.sd>1e-12&&my.sd>1e-12?cov/(mx.sd*my.sd):null;
 const offset=median(dif);
 const residual=dif.map(x=>x-offset);
 const adjustedRmse=Math.sqrt(residual.reduce((a,x)=>a+x*x,0)/residual.length);
 // Slope of pairwise difference versus days, useful for co-located sensor drift.
 const t0=pairs[0].index,t=pairs.map(p=>p.index-t0),meanT=t.reduce((a,b)=>a+b,0)/t.length;
 const varT=t.reduce((a,x)=>a+(x-meanT)**2,0);
 const covT=pairs.reduce((a,p,i)=>a+(t[i]-meanT)*(p.difference-md.mean),0);
 return {n:pairs.length,correlation:corr===null?null:Math.max(-1,Math.min(1,corr)),bias:md.mean,
   medianOffset:offset,adjustedRmse,spreadSd:md.sd,
   driftPerBin:varT>0?covT/varT:null,matched:pairs};
}
export function rankSensors(items,metric='noiseSd'){
 return [...(items||[])].sort((a,b)=>{
  const av=a.stats?.[metric],bv=b.stats?.[metric];
  return av===null||av===undefined?1:bv===null||bv===undefined?-1:bv-av;
 });
}
