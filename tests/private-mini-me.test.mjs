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

test('Notifications admin battery chart includes Spare RAK and uses authenticated history',()=>{
 const page=fs.readFileSync(new URL('../watersheds/notifications.html',import.meta.url),'utf8');
 const graph=fs.readFileSync(new URL('../watersheds/watershed-alerts.js',import.meta.url),'utf8');
 const api=fs.readFileSync(new URL('../api/watershed-alerts.js',import.meta.url),'utf8');
 const history=fs.readFileSync(new URL('../lib/watershed-battery-history.js',import.meta.url),'utf8');
 assert.match(page,/20261030-battery-default-off/);
 assert.match(graph,/\{id:1252758033,name:'Spare RAK'/);
 assert.match(graph,/action:'battery_history_hours'/);
 assert.doesNotMatch(graph,/fetch\(base,\{cache:'no-store'\}\)/);
 assert.match(api,/body.action==='battery_history_hours'/);
 assert.match(history,/BATTERY_HISTORY_HOURS=Object.freeze\(\[24,168,720,2160\]\)/);
 assert.match(history,/SPARE_RAK_CUTOVER_MS/);
});

test('Owner battery history uses a single bound bucket expression for sampled rows',()=>{
 const source=fs.readFileSync(new URL('../lib/watershed-battery-history.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/SELECT DISTINCT ON/);
 assert.equal((source.match(/ROW_NUMBER\(\) OVER/g)||[]).length,2);
 assert.equal((source.match(/WHERE bucket_rank=1/g)||[]).length,2);
});

test('Heltec polling admin is all-node, credentialed, and preserves on-air DM delivery',()=>{
 const html=fs.readFileSync(new URL('../watersheds/notifications.html',import.meta.url),'utf8');
 const js=fs.readFileSync(new URL('../watersheds/watershed-alerts.js',import.meta.url),'utf8');
 const api=fs.readFileSync(new URL('../api/watershed-alerts.js',import.meta.url),'utf8');
 assert.match(html,/Heltec V7 · Mesh polling control/);
 assert.match(html,/id="gatewayAdminNode"/);
 assert.match(html,/id="gatewayPollCustom"/);
 assert.match(html,/id="gatewayPollMode"/);
 assert.match(js,/function commandForPoll/);
 assert.match(js,/POLL STATUS/);
 assert.match(js,/navigator.clipboard.writeText/);
 assert.match(js,/authorized_admin_node:adminNode/);
 assert.match(api,/authorized_admin_node=\$\{adminNode\}/);
 assert.doesNotMatch(html,/Heltec V7 · South Cottonwood MB7388 polling/);
});

test('Every station recent-measurements table includes transmission provenance',()=>{
 const script=fs.readFileSync(new URL('../watersheds/watershed-sensors-20261026-v27.js',import.meta.url),'utf8');
 const page=fs.readFileSync(new URL('../watersheds/index.html',import.meta.url),'utf8');
 assert.match(page,/20261030-unified-transmission-source/);
 assert.match(script,/label:'Source',cell:r=>transmissionLabel\(r\)/);
 assert.equal((script.match(/label:'Source',cell:r=>transmissionLabel\(r\)/g)||[]).length,1);
 assert.match(script,/radioOnly\?\['observed_at_UTC'.*'transmission_source'\]/);
 const source=script.slice(script.indexOf('function transmissionLabel(r)'),script.indexOf('const transmissionDetail='));
 const label=new Function(source+';return transmissionLabel;')();
 assert.equal(label({node_num:2004386937,telemetry_type:'mx2001',metrics:{source:'heltec_dm'},radio:{gateway:'Heltec Hub'}}),'DM');
 assert.equal(label({node_num:1949224949,telemetry_type:'water_distance',metrics:{},radio:{gateway:'Heltec Hub'}}),'AUTO');
 assert.equal(label({node_num:1222051909,telemetry_type:'device',metrics:{battery_level:96}}),'AUTO');
 assert.equal(label({telemetry_type:'environment',metrics:{source:'heltec_ble'}}),'BLE');
 assert.equal(label({telemetry_type:'environment',metrics:{source:'hobo_manual_backfill'}}),'IMPORTED');
 assert.equal(label({telemetry_type:'rugged_troll',metrics:{},raw:{source_file:'troll.csv'}}),'IMPORTED');
 assert.equal(label({telemetry_type:'mx2001',metrics:{source:'field_installation_reading'}}),'FIELD');
 assert.equal(label({telemetry_type:'mx2001',metrics:{},radio:{}}),'UNKNOWN');
});

test('Battery history starts with all stations unselected and preserves manual toggles',()=>{
 const script=fs.readFileSync(new URL('../watersheds/watershed-alerts.js',import.meta.url),'utf8');
 const page=fs.readFileSync(new URL('../watersheds/notifications.html',import.meta.url),'utf8');
 assert.match(script,/const batteryState=\{hours:168,rows:\[\],enabled:new Set\(\),loading:false\}/);
 assert.doesNotMatch(script,/enabled:new Set\(batteryStations\.map/);
 assert.match(script,/if\(!batteryState\.enabled\.size\)/);
 assert.match(script,/Select one or more stations above to display battery history/);
 assert.match(script,/input\.checked=batteryState\.enabled\.has\(station\.id\)/);
 assert.match(page,/All stations start unchecked/);
});
