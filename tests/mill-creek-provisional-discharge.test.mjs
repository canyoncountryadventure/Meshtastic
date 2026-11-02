import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {calculateDischarge,rateReading,rateReadings,stationRatingCurves} from '../watersheds/lib/watershed-rating.js';
const curve={active:true,provisional:true,method:'linear_two_point',curve_version:1,
  coefficient_a:39.04761904761905,stage_offset_ft:1.3463414634146342,exponent_b:1,valid_stage_min_ft:1.5,valid_stage_max_ft:2.55};
test('Mill Creek provisional linear equation fits both field observations',()=>{
  assert.equal(calculateDischarge(1.5,curve),6);
  assert.equal(calculateDischarge(2.55,curve),47);
  assert.equal(calculateDischarge(2.0,curve),25.524);
  assert.equal(calculateDischarge(0.5,curve),0);
  const sensor=h=>({node_num:1683604927,telemetry_type:'mx2001',metrics:{water_level_ft:h}});
  assert.equal(rateReading(sensor(1.0),curve).discharge_rating_status,'extrapolated_low');
  assert.equal(rateReading(sensor(2.0),curve).discharge_rating_status,'within_measured_range');
  assert.equal(rateReading(sensor(3.0),curve).discharge_rating_status,'extrapolated_high');
  assert.equal(rateReading({node_num:1683604927,telemetry_type:'device',metrics:{water_level_ft:1.5}},curve).discharge_cfs,undefined);
});
test('Mill Creek dashboard connects stage, provisional cfs and displayed caveat',()=>{
  const js=fs.readFileSync(new URL('../watersheds/watershed-sensors-20261026-v27.js',import.meta.url),'utf8');
  const html=fs.readFileSync(new URL('../watersheds/index.html',import.meta.url),'utf8');
  const store=fs.readFileSync(new URL('../watersheds/lib/watershed-store.js',import.meta.url),'utf8');
  assert.match(js,/mxOnly:true,flow:true/);
  assert.match(js,/rated=latest\(mxOnly\?'mx2001':'water_distance',flow\)/);
  assert.match(js,/site\(\)\.mxOnly&&\['stage','flow'\]\.includes\(state\.metric\)/);
  assert.match(js,/Est\. flow · cfs/);
  assert.match(js,/Provisional 2-point estimate · extrapolated/);
  assert.match(html,/id="flowLabel"/);
  assert.match(store,/provisional:rating_curve\.provisional===true/);
});

test('embedded Mill Creek and Pack Creek ratings map to the actual station ID',()=>{
 const pack={node_num:1949224949,rating_curve:{active:true,node_num:1949224949,curve_version:6,coefficient_a:7.294171554150527,stage_offset_ft:0.13555264889182062,exponent_b:1.6772014257965793,valid_stage_min_ft:0.2444,valid_stage_max_ft:2.894}};
 const mill={node_num:1683604927,rating_curve:{...curve}}; // no embedded node_num!
 const disabled={node_num:1111111111,rating_curve:{...curve,active:false}};
 const curves=stationRatingCurves([pack,mill,disabled]);
 assert.equal(curves.length,2);
 assert.deepEqual(curves.map(c=>c.node_num),[1949224949,1683604927]);
 const readings=[
   {node_num:1683604927,telemetry_type:'mx2001',metrics:{water_level_ft:2.52}},
   {node_num:1949224949,telemetry_type:'water_distance',metrics:{water_level_ft:2.894}}
 ];
 const rated=rateReadings(readings,curves);
 assert.equal(rated[0].discharge_cfs,45.829);
 assert.equal(rated[0].discharge_rating_status,'within_measured_range');
 assert.equal(rated[1].discharge_cfs,40.003);
});
test('Pack Creek rating records display fitted adjustment separately from raw observed Q',()=>{
 const html=fs.readFileSync(new URL('../watersheds/index.html',import.meta.url),'utf8');
 const js=fs.readFileSync(new URL('../watersheds/watershed-sensors-20261026-v27.js',import.meta.url),'utf8');
 const store=fs.readFileSync(new URL('../watersheds/lib/watershed-store.js',import.meta.url),'utf8');
 assert.match(html,/Observed Q \(cfs\)/);
 assert.match(html,/Fit Q \(cfs\)/);
 assert.match(js,/Excluded · model-derived estimate/);
 assert.match(js,/one excluded model-derived peak/);
 assert.match(store,/stationRatingCurves\(stations\)/);
 assert.match(store,/p\.observed_discharge_cfs/);
 assert.match(store,/p\.included_in_rating/);
});
