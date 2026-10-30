import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WATERSHED_BATTERY_STATIONS } from '../lib/watershed-battery-history.js';
import {
  PRIVATE_STATION_IDS, isPrivateStation, filterPrivateTelemetry
} from '../lib/private-station-policy.js';
import {
  PRIVATE_STATIONS, isPrivateStation as standalonePrivate, hidePrivate
} from '../watersheds/lib/private-stations.js';

const node = 4241345683;
const payload = {
  stations:[{node_num:node,station_name:'Mini Me'},{node_num:1222051909,station_name:'Cottonwood Relay 2'},{node_num:1252758033,station_name:'Spare RAK'}],
  readings:[{node_num:node,metrics:{battery_level:5}},{node_num:1222051909,metrics:{battery_level:96}},{node_num:1252758033,metrics:{battery_level:94}}],
  latest:[{node_num:node},{node_num:1222051909},{node_num:1252758033}],
  recent:[{node_num:node},{node_num:1222051909},{node_num:1252758033}]
};
test('Mini Me, Cottonwood Relay 2, and Spare RAK are private stations in both API implementations',()=>{
 assert(PRIVATE_STATION_IDS.includes(node));
 assert(PRIVATE_STATION_IDS.includes(1222051909));
 assert(PRIVATE_STATION_IDS.includes(1252758033));
 assert(PRIVATE_STATIONS.includes(node));
 assert(PRIVATE_STATIONS.includes(1222051909));
 assert(PRIVATE_STATIONS.includes(1252758033));
 assert(isPrivateStation(node));
 assert(isPrivateStation(1222051909));
 assert(isPrivateStation(1252758033));
 assert(standalonePrivate(node));
 assert(standalonePrivate(1222051909));
 assert(standalonePrivate(1252758033));
 for(const filter of [filterPrivateTelemetry,hidePrivate]){
  const publicData=filter(payload,false);
  for(const key of ['stations','readings','latest','recent']){
   assert.deepEqual(publicData[key].map(x=>x.node_num),[],key);
   assert.equal(filter(payload,true)[key].length,3);
  }
 }
});
test('Private stations are absent from public selector and present after PS login',()=>{
 const html=fs.readFileSync(new URL('../watersheds/index.html',import.meta.url),'utf8');
 const dashboard=fs.readFileSync(new URL('../watersheds/watershed-sensors-20261026-v27.js',import.meta.url),'utf8');
 assert(!html.includes('<option value="4241345683">Mini Me</option>'));
 assert(!html.includes('<option value="1222051909">Cottonwood Relay 2</option>'));
 assert(!html.includes('<option value="1252758033">Spare RAK</option>'));
 assert(WATERSHED_BATTERY_STATIONS.some(s=>s.node_num===1252758033&&s.name==='Spare RAK'));
 assert(dashboard.includes('const PS_STATIONS=[2740603892,647393146,2650172798,4241345683,1222051909,1252758033]'));
 assert(dashboard.includes("radioOnly:true"));
 assert(dashboard.includes('psShowAccess(true)'));
 assert(dashboard.includes('psShowAccess(data.authenticated===true)'));
});
test('All public station read APIs reject Mini Me by node ID',()=>{
 const files=['api/watershed-readings.js','api/readings.js','api/station-health.js','watersheds/api/watershed-readings.js'];
 for(const name of files){
  const code=fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
  assert.match(code,/isPrivateStation/,name);
 }
 const publicAlerts=fs.readFileSync(new URL('../watersheds/watershed-public.js',import.meta.url),'utf8');
 assert(!publicAlerts.includes("[4241345683,'Mini Me']"));
});
