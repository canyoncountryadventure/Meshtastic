import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import handler from '../api/watershed-alerts.js';
import proxy from '../lib/watershed-alerts-proxy.js';
import { validateRule,displayRule,storedRule } from '../lib/watershed-alert-values.js';
import { readingValue,nextActive } from '../lib/alert-values.js';
import { evaluateReadings,dispatchEmails } from '../lib/alerts.js';
const response=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}});
test('watershed rules allow only the requested stations and measurements',()=>{
 const base={direction:'above',threshold:60,reset_value:58,enabled:true};
 assert.equal(validateRule({...base,node_num:2425602407,parameter:'temperature_c'}).station_name,'Cottonwood Relay');
 assert.throws(()=>validateRule({...base,node_num:2425602407,parameter:'water_level_ft'}));
 assert.throws(()=>validateRule({...base,node_num:1252758033,parameter:'temperature_c'}));
 assert.throws(()=>validateRule({...base,node_num:1695962694,parameter:'discharge_cfs'}));
 assert.equal(validateRule({...base,node_num:1695962694,parameter:'water_level_ft'}).parameter,'water_level_ft');
 const temp={...base,parameter:'temperature_c',threshold:0,reset_value:-1};
 assert.equal(displayRule(temp).threshold,32);assert.equal(storedRule({...temp,threshold:32}).threshold,0);
});
test('watershed authentication uses a separate cookie and signature',async()=>{
 process.env.ALERTS_ADMIN_KEY='watershed-test-owner-key';
 const login=response();await handler({method:'POST',headers:{},body:{action:'login',password:process.env.ALERTS_ADMIN_KEY}},login);
 assert.equal(login.statusCode,200);assert.match(login.headers['Set-Cookie'],/^watershed_alerts_session=/);assert.match(login.headers['Set-Cookie'],/Path=\/api\/watershed-alerts/);
 const expiry=String(Date.now()+10000),oldSignature=createHmac('sha256',process.env.ALERTS_ADMIN_KEY).update(expiry).digest('hex');
 const crossed=response();await handler({method:'GET',headers:{cookie:`watershed_alerts_session=${expiry}.${oldSignature}`}},crossed);assert.equal(crossed.statusCode,401);
 const logout=response();await handler({method:'POST',headers:{cookie:login.headers['Set-Cookie'].split(';')[0]},body:{action:'logout'}},logout);assert.equal(logout.statusCode,200);
});
test('standalone alerts proxy blocks foreign origins and forwards only its session cookie',async()=>{
 const realFetch=globalThis.fetch;let called=false;
 globalThis.fetch=async(url,options)=>{called=true;assert.equal(url,'https://meshtastic-ecru.vercel.app/api/watershed-alerts?v=2');assert.equal(options.cache,'no-store');assert.equal(options.headers.Cookie,'watershed_alerts_session=own');return {status:200,headers:{get:()=>null},json:async()=>({ok:true})};};
 try{
  const blocked=response();await proxy({method:'POST',headers:{host:'seutahwatersheds.vercel.app',origin:'https://other.example'},body:{}},blocked);assert.equal(blocked.statusCode,403);assert.equal(called,false);
  const good=response();await proxy({method:'GET',headers:{cookie:'alerts_session=other; watershed_alerts_session=own'}},good);assert.equal(good.statusCode,200);assert.equal(called,true);
 }finally{globalThis.fetch=realFetch;}
});
test('watershed evaluation uses its own rules and dashboard link',async()=>{
 const captured=[];const sql=async(parts,...args)=>{const query=parts.join('?');if(query.startsWith('SELECT * FROM alert_rules'))return [{id:1,node_num:2425602407,station_name:'Cottonwood Relay',parameter:'temperature_c',direction:'above',threshold:20,reset_value:19,revision:1,recipients:['example@example.com']}];captured.push({query,args});return [];};
 await evaluateReadings(sql,[{id:3,node_num:2425602407,telemetry_type:'environment',observed_at:new Date().toISOString(),temperature_c:25,metrics:{}}],{curves:[],dashboardUrl:'https://seutahwatersheds.vercel.app/',subjectPrefix:'Moab Watersheds: '});
 const insertion=captured.find(q=>q.query.includes('INSERT INTO alert_deliveries'));assert(insertion);assert(insertion.args.some(v=>typeof v==='string'&&v.includes('77.0 °F')));assert(insertion.args.some(v=>typeof v==='string'&&v.includes('Dashboard: https://seutahwatersheds.vercel.app/')));
});
test('watershed delivery uses a distinct provider idempotency key without real email',async()=>{
 const realFetch=globalThis.fetch,calls=[];let selected=false;
 const sql=async(parts,...args)=>{const q=parts.join('?');if(q.includes('RETURNING d.*')&&!selected){selected=true;return [{id:1,recipient:'example@example.com',subject:'Test',body:'Test',created_at:new Date().toISOString(),attempts:1}];}return [];};
 globalThis.fetch=async(url,opts)=>{calls.push(opts);return {ok:true,json:async()=>({id:'mock'})};};
 try{assert.equal((await dispatchEmails(sql,1,{config:{sender:'alerts@example.com',key:'mock'},idempotencyPrefix:'watershed-alert'})).sent,1);assert.equal(calls[0].headers['Idempotency-Key'],'watershed-alert-1');}finally{globalThis.fetch=realFetch;}
});

test('battery alerts accept reported percentages only and recover before a new event',()=>{
 const rule={node_num:2425602407,parameter:'battery_percent',direction:'below',threshold:20,reset_value:30,enabled:true};
 assert.equal(validateRule(rule).parameter,'battery_percent');
 assert.throws(()=>validateRule({...rule,reset_value:101}));
 for(const value of [0,20,100])assert.equal(readingValue({telemetry_type:'device',metrics:{battery_level:value}},'battery_percent'),value);
 for(const value of [-1,101,null])assert.equal(readingValue({telemetry_type:'device',metrics:{battery_level:value}},'battery_percent'),null);
 assert.equal(readingValue({telemetry_type:'environment',metrics:{battery_level:10}},'battery_percent'),null);
 assert.equal(readingValue({telemetry_type:'device',metrics:{voltage:3.7}},'battery_percent'),null);
 let active=false;const results=[19,21,30,31,19].map(value=>active=nextActive({...rule,active},value));
 assert.deepEqual(results,[true,true,true,false,true]);
});
