import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const text=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('public and private monitoring remain uncached',()=>{
 const handler=text('watersheds/api/watershed-readings.js');
 assert.match(handler,/private, no-store/);
 assert.match(handler,/Vercel-CDN-Cache-Control','no-store'/);
 assert.match(text('watersheds/watershed-sensors-20261026-v27.js'),/cache:'no-store'/);
});
test('monitoring queries scope sensor data to node, retaining since inception',()=>{
 const handler=text('watersheds/api/watershed-readings.js');
 const store=text('watersheds/lib/watershed-store.js');
 assert.match(handler,/readCreekData\(watershedSql\(\),hours,node\)/);
 assert.match(store,/export async function readCreekData\(sql,hours,node=null\)/);
 assert.match(store,/o\.node_num=\$\{node\}/);
 assert.match(store,/p\.node_num=\$\{node\}/);
 assert.match(text('watersheds/index.html'),/data-hours="1000000"/);
 assert.match(text('watersheds/watershed-sensors-20261026-v27.js'),/hours:168/);
 assert.match(text('watersheds/watershed-sensors-20261026-v27.js'),/state\.hours=720;state\.metric='elevation'/);
});
test('manual Refresh still retrieves real readings',()=>{
 const frontend=text('watersheds/watershed-sensors-20261026-v27.js');
 assert.match(frontend,/\$\('refresh'\)\.addEventListener\('click',load\)/);
 assert.match(frontend,/async function load\(\)/);
});
test('legacy CC01 cloud control and failed-DM event API removed',()=>{
 assert.doesNotMatch(text('api/ingest.js'),/cc01ControlHandler|control===['"]cc01['"]/);
 assert.doesNotMatch(text('api/watershed-alerts.js'),/cc01_gateway_control|save_gateway_control/);
 assert.doesNotMatch(text('watersheds/lib/watershed-store.js'),/FROM cc01_gateway_control|FROM cc01_sensor_events/);
 assert.doesNotMatch(text('watersheds/notifications.html'),/gatewayControlPanel|gatewayForm/);
 assert.match(text('watersheds/watershed-alerts.js'),/AUTO DM /);
});
test('hourly offline jobs and per-packet duplication removed',()=>{
 for(const job of ['mesh-heartbeat','watershed-heartbeat','telemetry-backfill']){
   const yaml=text('.github/workflows/'+job+'.yml');
   assert.match(yaml,/cron: '0 \* \* \* \*'/);
 }
 for(const store of ['lib/watershed-store.js','watersheds/lib/watershed-store.js']){
   assert.doesNotMatch(text(store),/await evaluateOfflineRules\(sql\)/);
 }
 const ingest=text('api/ingest.js');
 assert.match(ingest,/const mainReadings = readings\.filter/);
 assert.match(ingest,/if \(mainReadings\.length\)/);
 assert.match(ingest,/processWatershedAlerts\(creekSql, creekReadings/);
});
