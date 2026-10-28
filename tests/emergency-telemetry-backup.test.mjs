import test from 'node:test';
import assert from 'node:assert/strict';
import { backupRow, stablePacketId } from '../lib/google-sheets-backup.js';

test('stable backup identity survives key-order changes and preserves raw payload', () => {
  const first = { type: 'water_distance', from: 1949224949, timestamp: 1793188800, payload: { water_level_ft: 1.23456789, battery_voltage: 3.718 } };
  const reordered = { payload: { battery_voltage: 3.718, water_level_ft: 1.23456789 }, timestamp: 1793188800, from: 1949224949, type: 'water_distance' };
  assert.equal(stablePacketId(first), stablePacketId(reordered));
  const packetId = stablePacketId(first);
  const row = backupRow({ body: first, packetId, nodeNum: 1949224949, stationName: 'Pack Creek', observedAt: '2026-10-28T00:00:00.000Z', destination: 'moab_watersheds' });
  assert.equal(row.length, 21);
  assert.equal(row[0], packetId);
  assert.equal(row[1], 'pending');
  assert.equal(row[2], 'moab_watersheds');
  assert.equal(row[8], '1.23456789');
  assert.equal(JSON.parse(row[17]).payload.battery_voltage, 3.718);
});

test('explicit radio packet IDs take precedence over a content hash', () => {
  const packet = { type: 'telemetry', from: 2740603892, packet_id: 42, payload: { temperature_c: 8.1 } };
  assert.equal(stablePacketId(packet), 'mesh:2740603892:42');
});
