import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generateKeyPairSync,sign} from 'node:crypto';
import {MESH_STATIONS,MESH_PARAMETER_CHOICES,isMeshRule,validateMeshRule,meshReadingValue} from '../lib/mesh-alert-values.js';
import {isStationDelayed,evaluateMeshOfflineRules} from '../lib/mesh-offline.js';
import {verifyGitHubHeartbeat} from '../lib/github-oidc-heartbeat.js';
import heartbeat from '../api/alerts.js';

const ids=MESH_STATIONS.map(([id])=>id);
const battery={enabled:true,direction:'below',threshold:25,reset_value:30,parameter:'battery_percent'};
test('only the four stations shown on Meshtastic can be configured',()=>{
 assert.deepEqual(ids,[3044869407,2740603892,1577197109,4241345683]);
 ids.forEach(node_num=>assert.equal(validateMeshRule({...battery,node_num}).node_num,node_num));
 for(const node_num of [1949224949,1695962694,2425602407,2004386937,2650172798,1252758033])
   assert.throws(()=>validateMeshRule({...battery,node_num}));
 ids.forEach(node_num=>{
   for(const parameter of ['discharge_cfs','water_level_ft','soil_moisture_percent'])
     assert.throws(()=>validateMeshRule({...battery,node_num,parameter}));
 });
 assert(!MESH_PARAMETER_CHOICES[String(2740603892)].includes('rssi_dbm'));
 assert(isMeshRule({node_num:1577197109,parameter:'rssi_dbm'}));
 assert(!isMeshRule({node_num:2425602407,parameter:'temperature_c'}));
});
test('delayed station rules are independent of threshold recovery values',()=>{
 for(const node_num of ids){
   for(const threshold of [1,3,24,168]){
     const r=validateMeshRule({node_num,parameter:'offline_hours',threshold,enabled:true});
     assert.equal(r.direction,'above');assert.equal(r.reset_value,0);
   }
   for(const threshold of [-1,0,0.5,169,Infinity])
     assert.throws(()=>validateMeshRule({node_num,parameter:'offline_hours',threshold}));
 }
});
test('sensor packets only drive measurements actually displayed for their station',()=>{
 const environment={node_num:3044869407,telemetry_type:'environment',temperature_c:22,
   metrics:{battery_level:15,voltage:3.6},radio:{rssi:-98,snr:5}};
 const device={...environment,telemetry_type:'device'};
 assert.equal(meshReadingValue(environment,'temperature_c'),22);
 assert.equal(meshReadingValue(device,'temperature_c'),null);
 assert.equal(meshReadingValue(device,'battery_percent'),15);
 assert.equal(meshReadingValue(environment,'battery_percent'),null);
 assert.equal(meshReadingValue(device,'voltage'),3.6);
 assert.equal(meshReadingValue(environment,'voltage'),null);
 assert.equal(meshReadingValue(environment,'rssi_dbm'),-98);
 assert.equal(meshReadingValue(environment,'snr_db'),5);
 assert.equal(meshReadingValue(device,'rssi_dbm'),null);
 assert.equal(meshReadingValue({...environment,node_num:2740603892},'snr_db'),null);
 assert.equal(meshReadingValue(environment,'offline_hours'),null);
 assert.equal(meshReadingValue({...environment,node_num:2425602407},'temperature_c'),null);
});
test('heartbeat compares actual packet age, not sensor sample interval, and queues once',async()=>{
 const now=Date.parse('2026-10-23T18:00:00Z');
 assert.equal(isStationDelayed('2026-10-23T15:00:00Z',3,now),true);
 assert.equal(isStationDelayed('2026-10-23T15:00:01Z',3,now),false);
 assert.equal(isStationDelayed('2026-10-23T17:00:00Z',3,now),false);
 const queries=[];
 const sql=async(parts,...args)=>{
   const q=parts.join('?');queries.push({q,args});
   if(q.startsWith('SELECT r.id'))return [{id:7,node_num:3044869407,station_name:'Hidden Valley',
     threshold:3,active:false,revision:1,recipients:['one@example.com'],
     last_received:'2026-10-23T14:00:00Z'}];
   if(q.includes('RETURNING id'))return [{id:17}];
   return [];
 };
 const result=await evaluateMeshOfflineRules(sql,now);
 assert.deepEqual(result,{checked:1,newDeliveries:1});
 assert.match(queries[0].q,/r.node_num IN \(3044869407,2740603892,1577197109,4241345683\)/);
 assert.match(queries[1].q,/AND NOT l.active/);
 assert(queries[1].args.some(x=>typeof x==='string'&&x.includes('meshtastic-ecru.vercel.app')));
});
const encode=data=>Buffer.from(JSON.stringify(data)).toString('base64url');
test('scheduler authentication cannot be spoofed with watershed token',async()=>{
 const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},
   status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}};
 const old=process.env.CRON_SECRET;delete process.env.CRON_SECRET;
 try{await heartbeat({method:'GET',url:'/api/alerts?heartbeat=mesh',headers:{}},res);assert.equal(res.statusCode,401);}
 finally{if(old===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=old;}
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const jwk=publicKey.export({format:'jwk'});jwk.kid='test-key';
 const now=Math.floor(Date.now()/1000);
 const claims={iss:'https://token.actions.githubusercontent.com',aud:'meshtastic-station-heartbeat',
   repository:'canyoncountryadventure/Meshtastic',ref:'refs/heads/main',
   workflow_ref:'canyoncountryadventure/Meshtastic/.github/workflows/mesh-heartbeat.yml@refs/heads/main',
   event_name:'schedule',iat:now,exp:now+300};
 const signToken=payload=>{const start=encode({alg:'RS256',kid:'test-key'})+'.'+encode(payload);
   return start+'.'+sign('RSA-SHA256',Buffer.from(start),privateKey).toString('base64url');};
 const jwks=async()=>({ok:true,json:async()=>({keys:[jwk]})});
 const scope={audience:claims.aud,workflow:claims.workflow_ref};
 assert.equal(await verifyGitHubHeartbeat(signToken(claims),jwks,scope),true);
 assert.equal(await verifyGitHubHeartbeat(signToken({...claims,aud:'moab-watershed-heartbeat'}),jwks,scope),false);
 assert.equal(await verifyGitHubHeartbeat(signToken({...claims,workflow_ref:claims.workflow_ref.replace('mesh-heartbeat','watershed-heartbeat')}),jwks,scope),false);
});
test('Meshtastic interface and schedule remain separate from watershed',()=>{
 const api=fs.readFileSync(new URL('../api/alerts.js',import.meta.url),'utf8');
 const page=fs.readFileSync(new URL('../alerts.html',import.meta.url),'utf8');
 const cron=fs.readFileSync(new URL('../.github/workflows/mesh-heartbeat.yml',import.meta.url),'utf8');
 assert.match(api,/validateMeshRule/);assert.match(api,/MESH_PARAMETER_CHOICES/);
 assert.match(page,/Moab Watersheds notifications/);
 assert.match(cron,/meshtastic-station-heartbeat/);assert.match(cron,/api\/alerts\?heartbeat=mesh/);
 assert.doesNotMatch(cron,/api\/watershed-heartbeat/);
});
