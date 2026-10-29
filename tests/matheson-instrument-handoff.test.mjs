import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync(new URL('../watersheds/watershed-sensors-20261026-v27.js',import.meta.url),'utf8');
const page=fs.readFileSync(new URL('../watersheds/index.html',import.meta.url),'utf8');

test('Matheson chart marks sensor change and uses independent temperature histories',()=>{
 assert.match(page,/id="mathesonInstrumentNote"/);
 assert.match(src,/MATHESON_MX_FINAL_INSTALLED_AT=Date.parse\('2026-10-23T21:35:00Z'\)/);
 assert.match(src,/class="instrument-handoff-marker"/);
 assert.match(src,/TROLL → MX2001/);
 assert.match(src,/independent records/);
 assert.match(src,/35\.30 vs 18\.25 ft/);
 assert.match(src,/!=='mx2001'\|\|Date.parse\(r.observed_at\)>=MATHESON_MX_FINAL_INSTALLED_AT/);
 assert.match(src,/\['rugged_troll','mx2001'\]\.map\(type/);
 assert.doesNotMatch(src,/\['rugged_troll','environment','mx2001'\]/);
});
test('Temperature trend cannot infer a jump from a sensor handoff',()=>{
 const start=src.indexOf('function median(values)'),end=src.indexOf('/* Flood evidence',start);
 assert(start>=0&&end>start);
 const code=src.slice(start,end);
 const day=86400000,now=Date.now();
 const rows=[];
 for(let i=29;i>=7;i--)rows.push({id:'T'+i,telemetry_type:'rugged_troll',observed_at:new Date(now-i*day).toISOString(),temperature_c:16.2});
 for(let i=6;i>=0;i--)rows.push({id:'H'+i,telemetry_type:'mx2001',observed_at:new Date(now-i*day).toISOString(),temperature_c:17.9});
 const context={state:{trendReadings:rows,readings:[]},Date,Math,Map,Set,Number,console};
 vm.createContext(context);
 vm.runInContext(code+'\nthis.testTrend=groundwaterTrend;',context);
 const convert=r=>r.temperature_c*9/5+32;
 assert.equal(context.testTrend(convert,0.2,'mx2001'),null,'only 7 MX2001 days is insufficient');
 assert.notEqual(context.testTrend(convert,0.2),null,'mixed instruments would misleadingly infer a trend');
});
