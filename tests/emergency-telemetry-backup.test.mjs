import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { backupRow, readWatershedEmergencyBackups, stablePacketId } from '../lib/google-sheets-backup.js';

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

test('backup rows retain the raw creek payload needed for outage rendering', () => {
  const body = { type: 'mx2001', from: 1695962694, timestamp: 1793188800, payload: { water_level_ft: 2.3456789, temperature_c: 7.123456 }, radio: { rssi: -103, snr: 4.25 } };
  const row = backupRow({ body, packetId: stablePacketId(body), nodeNum: body.from, stationName: 'Cottonwood Creek', observedAt: '2026-10-28T00:00:00.000Z', destination: 'moab_watersheds' });
  assert.equal(row[2], 'moab_watersheds');
  assert.equal(JSON.parse(row[17]).payload.water_level_ft, 2.3456789);
  assert.equal(JSON.parse(row[15]).rssi, -103);
});

test('pending creek backups can be rendered without treating them as Neon data', async () => {
  const originalFetch = global.fetch;
  const originalCredentials = [process.env.GOOGLE_SERVICE_ACCOUNT_JSON, process.env.GOOGLE_SHEETS_ID];
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: 'backup-test@example.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
  process.env.GOOGLE_SHEETS_ID = 'backup-test-sheet';
  const body = { type: 'water_distance', from: 1949224949, timestamp: Math.floor(Date.now() / 1000), payload: { water_level_ft: 1.23456789 }, radio: { rssi: -104, snr: 5.5 } };
  const row = backupRow({ body, packetId: stablePacketId(body), nodeNum: body.from, stationName: 'Pack Creek', observedAt: new Date(body.timestamp * 1000).toISOString(), destination: 'moab_watersheds' });
  global.fetch = async url => String(url).includes('oauth2.googleapis.com')
    ? { ok: true, json: async () => ({ access_token: 'test-token', expires_in: 3600 }) }
    : { ok: true, text: async () => JSON.stringify({ values: [row] }) };
  try {
    const data = await readWatershedEmergencyBackups(6);
    assert.equal(data.readings.length, 1);
    assert.equal(data.latest[0].backup_source, 'google_sheets');
    assert.equal(data.readings[0].metrics.water_level_ft, 1.23456789);
    assert.equal(data.readings[0].radio.rssi, -104);
    assert.equal(data.readings[0].observed_at, row[5]);
  } finally {
    global.fetch = originalFetch;
    [process.env.GOOGLE_SERVICE_ACCOUNT_JSON, process.env.GOOGLE_SHEETS_ID] = originalCredentials;
  }
});
