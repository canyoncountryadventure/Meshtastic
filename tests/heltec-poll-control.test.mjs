import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('retired South Cottonwood polling controls are absent from Notifications',()=>{
 const html=fs.readFileSync(new URL('../watersheds/notifications.html',import.meta.url),'utf8');
 const script=fs.readFileSync(new URL('../watersheds/watershed-alerts.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/gatewayControlPanel|South Cottonwood · automatic WATER READ|Heltec V7 · Mesh polling control/);
 assert.doesNotMatch(script,/commandForPoll|renderGatewayControl|save_gateway_control/);
});
