import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isWatershedNode } from '../lib/watershed-nodes.js';
const source = file => readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('only the three creek-network nodes are routed to moab_watersheds',()=>{
 for(const n of [1949224949,1695962694,2425602407])assert.equal(isWatershedNode(n),true);
 for(const n of [2740603892,1577197109,3044869407,3388602087])assert.equal(isWatershedNode(n),false);
});
test('ingest routes creek packets directly; never mirrors them',()=>{
 const s=source('api/ingest.js');
 assert.match(s,/isWatershedNode\(nodeNumber\(body\)\)/);
 assert.match(s,/insertDirectCreekReading\(creekSql/);
 assert.doesNotMatch(s,/mirrorCreekReadings|reconcileCreekReadings/);
 assert.match(s,/readings\.push\(await insertReading\(sql, body\)\)/);
});
test('watershed API no longer copies from neondb',()=>{
 for(const p of ['api/watershed-readings.js','watersheds/api/watershed-readings.js']){
  const s=source(p);
  assert.doesNotMatch(s,/getSql|reconcileCreekReadings|mirrorCreekReadings/);
 }
});
test('main history and station health read creek-only rows from watershed connection',()=>{
 for(const p of ['api/readings.js','api/station-health.js']){
  const s=source(p);assert.match(s,/isWatershedNode/);assert.match(s,/watershedSql/);
 }
});
test('standalone watershed code mirrors the repository implementation',()=>{
 assert.equal(source('lib/watershed-store.js'),source('watersheds/lib/watershed-store.js'));
});
