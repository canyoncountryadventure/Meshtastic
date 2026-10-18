import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
test('water quality is a separate top-level program with the requested parameters and sites',()=>{
 const html=fs.readFileSync(new URL('../watershed.html',import.meta.url),'utf8');const js=fs.readFileSync(new URL('../water-quality.js',import.meta.url),'utf8');const base=fs.readFileSync(new URL('../migrations/20261017_water_quality.sql',import.meta.url),'utf8');const workbook=fs.readFileSync(new URL('../migrations/20261018_water_quality_workbook.sql',import.meta.url),'utf8');
 assert.match(html,/role="tab"[^>]*>Stream flow</);assert.match(html,/role="tab"[^>]*>Water quality</);assert.match(html,/id="qualityMetricSelect"/);assert.match(html,/id="qualityMap"/);assert.match(js,/openstreetmap\.org/);
 assert.match(base,/CREATE TABLE IF NOT EXISTS water_quality_samples/);assert.match(workbook,/CREATE TABLE IF NOT EXISTS water_quality_records/);assert.match(workbook,/\('uranium_238','Uranium-238'/);assert.match(workbook,/\('total_phosphorus','Total phosphorus'/);assert.match(workbook,/Mill Creek above Sheley Tunnel/);assert.match(workbook,/San Juan River at Mexican Hat/);assert.equal((workbook.match(/^  \('[A-Z0-9-]+','\d{7}'/gm)||[]).length,45);
});
test('station selection keeps relay air temperature separate from creek water measurements',async()=>{
 const nodes=new Map(),buttons=['flow','stage','temp','battery'].map(metric=>({dataset:{metric},setAttribute(){},addEventListener(event,fn){this[event]=fn;},hidden:false}));
 const element=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',value:'',hidden:false,addEventListener(event,fn){this[event]=fn;},querySelectorAll(){return [];}});return nodes.get(id);};
 const now=new Date().toISOString();const readings=[
 {id:1,node_num:1949224949,telemetry_type:'water_distance',observed_at:now,metrics:{water_level_ft:2,stage_calibrated:true},discharge_cfs:20},
 {id:2,node_num:1695962694,telemetry_type:'mx2001',observed_at:now,metrics:{water_level_ft:.4},temperature_c:10},
 {id:3,node_num:2425602407,telemetry_type:'environment',observed_at:now,metrics:{},temperature_c:20},
 ...[1949224949,1695962694,2425602407].flatMap((node_num,i)=>[
 {node_num,telemetry_type:'device',observed_at:now,metrics:{battery_level:60+i}},
 {node_num,telemetry_type:'device',observed_at:now,metrics:{battery_level:101}},
 {node_num,telemetry_type:'device',observed_at:now,metrics:{voltage:3.9}}]),
 {id:4,node_num:1252758033,telemetry_type:'environment',observed_at:now,metrics:{},temperature_c:99}];
 vm.runInNewContext(fs.readFileSync(new URL('../watershed.js',import.meta.url),'utf8'),{document:{getElementById:element,querySelectorAll:s=>s==='[data-metric]'?buttons:[]},fetch:async()=>({ok:true,json:async()=>({ok:true,readings,latest:readings})}),Date,Number,String,Blob,URL,setTimeout});
 await new Promise(r=>setTimeout(r,0));assert.equal(element('stationTitle').textContent,'Pack Creek');assert.equal(element('flow').textContent,'20.00');
 element('stationSelect').change({target:{value:'1695962694'}});assert.equal(element('stationTitle').textContent,'Cottonwood Creek');assert.equal(element('stage').textContent,'0.40');assert.equal(element('temp').textContent,'50.0');assert.equal(element('flowCard').hidden,true);assert.equal(element('temperatureLabel').textContent,'Water temperature');
 element('stationSelect').change({target:{value:'2425602407'}});assert.equal(element('temperatureLabel').textContent,'Air temperature');assert.equal(element('temp').textContent,'68.0');assert.equal(element('stageCard').hidden,true);assert.match(element('chart').innerHTML,/Cottonwood Relay Air temperature/);assert(!element('rows').innerHTML.includes('99'));
 buttons.find(b=>b.dataset.metric==='battery').click();
 for(const [i,node] of [1949224949,1695962694,2425602407].entries()){
  element('stationSelect').change({target:{value:String(node)}});
  const chart=element('chart').innerHTML;
  assert.match(chart,/Battery charge in %/);assert.match(chart,new RegExp((60+i)+' % · Device battery'));
  assert(!chart.includes('101 %'));assert(!chart.includes('NaN'));
  assert.match(element('sampleCount').textContent,/^1 observations/);
 }
});
