import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const script=fs.readFileSync(new URL('../watersheds/watershed-alerts.js',import.meta.url),'utf8');
const source=script.slice(script.indexOf('const hexNode='),script.indexOf('function renderPollCommand'));
const {parseNodeId,commandForPoll}=vm.runInNewContext(source+';({parseNodeId,commandForPoll})');
test('Authorized sender supports hex and decimal Meshtastic node IDs',()=>{
 assert.equal(parseNodeId('!c22d7fec'),3257761772);
 assert.equal(parseNodeId('3257761772'),3257761772);
 assert.equal(parseNodeId('!4aab9211'),1252758033);
 assert.equal(parseNodeId('garbage'),null);
});
test('DM polling commands support dedicated and custom nodes',()=>{
 assert.equal(commandForPoll({node:2004386937,action:'schedule',minutes:60,mode:'READ'}).command,'POLL MATHESON 60');
 assert.equal(commandForPoll({node:1695962694,action:'schedule',minutes:60,mode:'WATER'}).command,'POLL COTTONWOOD 60');
 assert.equal(commandForPoll({node:1683604927,action:'schedule',minutes:60,mode:'READ'}).command,'POLL MILL CREEK 60 READ');
 assert.equal(commandForPoll({node:1252758033,action:'schedule',minutes:60,mode:'READ'}).command,'POLL !4AAB9211 60 READ');
 assert.equal(commandForPoll({node:1252758033,action:'off',minutes:60,mode:'READ'}).command,'POLL !4AAB9211 OFF');
 assert.equal(commandForPoll({node:1252758033,action:'once',minutes:60,mode:'WATER'}).command,'POLL !4AAB9211 WATER');
 assert.equal(commandForPoll({node:2004386937,action:'off',minutes:60,mode:'READ'}).command,'');
});

test('Website supports actual authenticated cloud queue, gateway delivery, and ack',()=>{
 const page=fs.readFileSync(new URL('../watersheds/notifications.html',import.meta.url),'utf8');
 const client=fs.readFileSync(new URL('../watersheds/watershed-alerts.js',import.meta.url),'utf8');
 const admin=fs.readFileSync(new URL('../api/watershed-alerts.js',import.meta.url),'utf8');
 const ingest=fs.readFileSync(new URL('../api/ingest.js',import.meta.url),'utf8');
 assert.match(page,/Apply from website/);
 assert.match(page,/20261030-cloud-poll-control/);
 assert.match(client,/action:'queue_gateway_poll'/);
 assert.match(client,/PENDING|pending/);
 assert.match(admin,/validatedPollCommand/);
 assert.match(admin,/gateway_poll_commands/);
 assert.match(ingest,/body.type==='poll_ack'/);
 assert.match(ingest,/poll_command:pending\[0\]\|\|null/);
});
