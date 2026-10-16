import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
test('station selection keeps relay air temperature separate from creek water measurements',async()=>{
 const nodes=new Map(),buttons=['flow','stage','temp'].map(metric=>({dataset:{metric},setAttribute(){},addEventListener(){},hidden:false}));
 const element=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',value:'',hidden:false,addEventListener(event,fn){this[event]=fn;},querySelectorAll(){return [];}});return nodes.get(id);};
 const now=new Date().toISOString();const readings=[
 {id:1,node_num:1949224949,telemetry_type:'water_distance',observed_at:now,metrics:{water_level_ft:2,stage_calibrated:true},discharge_cfs:20},
 {id:2,node_num:1695962694,telemetry_type:'mx2001',observed_at:now,metrics:{water_level_ft:.4},temperature_c:10},
 {id:3,node_num:2425602407,telemetry_type:'environment',observed_at:now,metrics:{},temperature_c:20},
 {id:4,node_num:1252758033,telemetry_type:'environment',observed_at:now,metrics:{},temperature_c:99}];
 vm.runInNewContext(fs.readFileSync(new URL('../watershed.js',import.meta.url),'utf8'),{document:{getElementById:element,querySelectorAll:s=>s==='[data-metric]'?buttons:[]},fetch:async()=>({ok:true,json:async()=>({ok:true,readings,latest:readings})}),Date,Number,String,Blob,URL,setTimeout});
 await new Promise(r=>setTimeout(r,0));assert.equal(element('stationTitle').textContent,'Pack Creek');assert.equal(element('flow').textContent,'20.00');
 element('stationSelect').change({target:{value:'1695962694'}});assert.equal(element('stationTitle').textContent,'Cottonwood Creek');assert.equal(element('stage').textContent,'0.40');assert.equal(element('temp').textContent,'50.0');assert.equal(element('flowCard').hidden,true);assert.equal(element('temperatureLabel').textContent,'Water temperature');
 element('stationSelect').change({target:{value:'2425602407'}});assert.equal(element('temperatureLabel').textContent,'Air temperature');assert.equal(element('temp').textContent,'68.0');assert.equal(element('stageCard').hidden,true);assert.match(element('chart').innerHTML,/Cottonwood Relay Air temperature/);assert(!element('rows').innerHTML.includes('99'));
});
