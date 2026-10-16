import test from 'node:test';
import assert from 'node:assert/strict';
import { readingValue, nextActive, validateRule, normalizeEmails, displayRule, storedRule, temperatureAlertText } from '../lib/alert-values.js';
import handler from '../api/alerts.js';

test('strict crossing and hysteresis in both directions',()=>{
  const above={direction:'above',threshold:10,reset_value:9,active:false};
  assert.equal(nextActive(above,10),false); assert.equal(nextActive(above,10.01),true);
  assert.equal(nextActive({...above,active:true},9),true); assert.equal(nextActive({...above,active:true},8.99),false);
  const below={direction:'below',threshold:3.4,reset_value:3.6,active:false};
  assert.equal(nextActive(below,3.4),false);assert.equal(nextActive(below,3.39),true);
  assert.equal(nextActive({...below,active:true},3.6),true);assert.equal(nextActive({...below,active:true},3.61),false);
});
test('missing, uncalibrated, and unrelated packets cannot trip discharge',()=>{
  const curve={coefficient_a:10,stage_offset_ft:0,exponent_b:1};
  for(const metrics of [{},{water_level_ft:null},{water_level_ft:2,stage_calibrated:false}]) {
    assert.equal(readingValue({telemetry_type:'mx2001',metrics},'discharge_cfs',curve),null);
  }
  assert.equal(readingValue({telemetry_type:'device',metrics:{water_level_ft:2}},'discharge_cfs',curve),null);
  assert.equal(readingValue({telemetry_type:'water_distance',metrics:{water_level_ft:2}},'discharge_cfs',curve),null);
  assert.equal(readingValue({telemetry_type:'mx2001',metrics:{water_level_ft:2}},'discharge_cfs',curve),20);
});
test('recipient validation and unavailable rating curves',()=>{
  assert.deepEqual(normalizeEmails(['A@example.com','a@example.com']),['a@example.com']);
  assert.throws(()=>normalizeEmails(['a@example.com,b@example.com']));
  assert.throws(()=>validateRule({node_num:1695962694,parameter:'discharge_cfs',direction:'above',threshold:10,reset_value:9}));
});
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(value){this.body=value;return this;}};}
test('owner access rejects anonymous and cross-origin writes; login creates secure cookie',async()=>{
  process.env.ALERTS_ADMIN_KEY='test-owner-password-with-enough-entropy';
  const anonymous=response();await handler({method:'GET',headers:{}},anonymous);assert.equal(anonymous.statusCode,401);
  const cross=response();await handler({method:'POST',headers:{host:'dashboard.example',origin:'https://other.example'},body:{action:'login'}},cross);assert.equal(cross.statusCode,403);
  const login=response();await handler({method:'POST',headers:{},body:{action:'login',password:process.env.ALERTS_ADMIN_KEY}},login);
  assert.equal(login.statusCode,200);assert.match(login.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Strict/);
  const logout=response();await handler({method:'POST',headers:{cookie:login.headers['Set-Cookie'].split(';')[0]},body:{action:'logout'}},logout);
  assert.equal(logout.statusCode,200);
});

test('Fahrenheit alert editing preserves Celsius thresholds and crossing behavior',()=>{
  const saved={node_num:1949224949,parameter:'temperature_c',direction:'below',threshold:0,reset_value:2,active:false};
  const display=displayRule(saved);
  assert.equal(display.threshold,32); assert.equal(display.reset_value,35.6);
  const restored=storedRule(display);
  assert.equal(restored.threshold,0); assert(Math.abs(restored.reset_value-2)<1e-10);
  const edited=validateRule(storedRule({...display,threshold:50,reset_value:53.6}));
  assert.equal(edited.threshold,10); assert(Math.abs(edited.reset_value-12)<1e-10);
  assert.equal(nextActive({...edited,active:false},10),false);
  assert.equal(nextActive({...edited,active:false},9.9),true);
  const flow={parameter:'discharge_cfs',threshold:10,reset_value:9};
  assert.deepEqual(displayRule(flow),flow); assert.deepEqual(storedRule(flow),flow);
});
test('temperature email shows converted Fahrenheit reading and threshold',()=>{
  const text=temperatureAlertText({station_name:'Pack Creek',direction:'above',threshold:20},25,'2026-10-16T03:00:00Z');
  assert.match(text.subject,/77.0 °F/); assert.match(text.subject,/above 68.0 °F/);
  assert.match(text.body,/Temperature: 77.0 °F/); assert.match(text.body,/Threshold: above 68.0 °F/);
  assert(!text.body.includes('temperature_c')); assert(!text.body.includes('°C'));
});
