import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

for(const dir of ['','watersheds/']){
 const page=dir?'watersheds/index.html':'watershed.html';
 const script=dir+'watershed.js';
 test('Stream Flow: long ranges, equations, gaps and trends ('+(dir||'main')+')',async()=>{
   const html=fs.readFileSync(new URL('../'+page,import.meta.url),'utf8');
   assert(html.indexOf('id="record"') < html.indexOf('class="mesh-route"'));
   assert(html.indexOf('class="mesh-route"') < html.indexOf('id="about"'));
   for(const hours of [2160,8760])assert(html.includes('data-hours="'+hours+'"'));
   assert.match(html,/id="ratingEquation"/);
   assert.match(html,/id="flowTrend"/);
   assert.match(html,/id="tempTrend"/);
   const nodes=new Map();
   const element=id=>{
     if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',className:'',hidden:false,disabled:false,
       addEventListener(event,fn){this[event]=fn;},setAttribute(){},querySelectorAll(){return [];}});
     return nodes.get(id);
   };
   const hours=[6,12,24,168,720,2160,8760].map(value=>({dataset:{hours:String(value)},setAttribute(){},addEventListener(event,fn){this[event]=fn;}}));
   const metrics=['flow','stage','temp','battery'].map(metric=>({dataset:{metric},setAttribute(){},addEventListener(event,fn){this[event]=fn;}}));
   const now=Date.now(),iso=h=>new Date(now-h*3600000).toISOString();
   const row=(id,node_num,telemetry_type,h,metrics,extra={})=>({id,node_num,telemetry_type,observed_at:iso(h),metrics,...extra});
   const readings=[
     row(1,1949224949,'water_distance',8,{water_level_ft:.9},{discharge_cfs:12}),
     row(2,1949224949,'water_distance',2.8,{water_level_ft:1.2},{discharge_cfs:15}),
     row(3,1949224949,'water_distance',.2,{water_level_ft:1.5},{discharge_cfs:18}),
     row(4,1949224949,'mx2001',5,{water_level_ft:1.1},{temperature_c:15}),
     row(5,1949224949,'mx2001',.4,{water_level_ft:1.2},{temperature_c:17}),
     row(6,1949224949,'device',7,{battery_level:70}),
     row(7,1949224949,'device',.5,{battery_level:75}),
     row(8,1695962694,'water_distance',8,{water_level_ft:.5}),
     row(9,1695962694,'water_distance',.3,{water_level_ft:.8}),
     row(10,2425602407,'environment',.2,{}, {temperature_c:22})
   ];
   const stations=[{node_num:1949224949,rating_curve:{
     coefficient_a:7.267920885,stage_offset_ft:.135110132,exponent_b:1.68049,
     curve_version:5,valid_stage_min_ft:.2444,valid_stage_max_ft:2.894
   }},{node_num:1695962694,rating_curve:null}];
   const mockFetch=async url=>({ok:true,json:async()=>({ok:true,readings,latest:readings,recent:readings,stations,
     sample_interval_hours:url.includes('8760')?24:url.includes('2160')?6:null})});
   const doc={getElementById:element,querySelectorAll:selector=>selector==='[data-metric]'?metrics:selector==='[data-hours]'?hours:[]};
   vm.runInNewContext(fs.readFileSync(new URL('../'+script,import.meta.url),'utf8'),{
     document:doc,fetch:mockFetch,Date,Number,String,Blob,URL,setTimeout
   });
   await new Promise(done=>setTimeout(done,0));
   assert.equal(element('flow').textContent,'18.00');
   assert.match(element('flowTrend').innerHTML,/↑.*Rising/);
   assert.match(element('tempTrend').innerHTML,/↑.*Rising/);
   assert.equal(element('ratingEquation').hidden,false);
   assert.match(element('ratingFormula').innerHTML,/Q = .*7\.26792.*0\.13511.*1\.68049/);
   assert.match(element('chart').innerHTML,/class="chart-gap"/);
   for(const name of ['stage','temp','battery']){
     metrics.find(b=>b.dataset.metric===name).click();
     assert.match(element('chart').innerHTML,/class="chart-gap"/,'missing dashed gap on '+name);
   }
   element('stationSelect').change({target:{value:'1695962694'}});
   assert.equal(element('ratingEquation').hidden,true);
   element('stationSelect').change({target:{value:'1949224949'}});
   hours.find(b=>b.dataset.hours==='2160').click();
   await new Promise(done=>setTimeout(done,0));
   assert.match(element('sampleCount').textContent,/90 days.*sampled every 6h/);
   hours.find(b=>b.dataset.hours==='8760').click();
   await new Promise(done=>setTimeout(done,0));
   assert.match(element('sampleCount').textContent,/1 year.*sampled every 24h/);
   assert.match(element('export').textContent,/sampled CSV/);
   assert.match(element('samplingNotice').textContent,/sampled chart/);
   assert.match(element('flowTrend').innerHTML,/Rising/,'trend should not depend on chart downsampling');
 });
}
test('long-range API and database stores support full year without truncating raw recent data',()=>{
 for(const p of ['api/watershed-readings.js','watersheds/api/watershed-readings.js']){
   const js=fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
   assert.match(js,/2160,8760/);
 }
 for(const p of ['lib/watershed-store.js','watersheds/lib/watershed-store.js']){
   const js=fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
   assert.match(js,/ROW_NUMBER\(\) OVER/);
   assert.match(js,/bucketSeconds=hours>=8760\?86400:hours>=2160\?21600/);
   assert.match(js,/recent:rateReadings\(recent,curves\)/);
   assert.match(js,/rating_curve:rating_curve\?\.active===true/);
 }
});
