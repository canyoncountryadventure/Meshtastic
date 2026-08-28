import { getSql } from './db.js';

const STATIONS = new Map([
  [1436900584, { name: 'Hidden Valley Repeater', acceptsDeviceTelemetry: true }], // !55a55ce8
  [2740603892, { name: 'Heltec Home', acceptsDeviceTelemetry: false }],          // !a35a4bf4
]);
const SUPPORTED = new Set(['telemetry', 'device']);
const MERGE_WINDOW_MINUTES = 50;

function parsePossibleJson(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}
function unwrapBody(input) {
  let body = parsePossibleJson(input);
  for (let i = 0; i < 4; i += 1) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) break;
    if (SUPPORTED.has(body.type) && body.payload && typeof body.payload === 'object') return body;
    const candidates = [body.payload, body.body, body.message, body.data];
    const next = candidates.map(parsePossibleJson).find(v => v && typeof v === 'object' && !Array.isArray(v));
    if (!next || next === body) break;
    body = next;
  }
  return body;
}
function readIngestKey(req) {
  const h = req.headers['x-ingest-key'];
  if (typeof h === 'string') return h;
  const a = req.headers.authorization;
  if (typeof a === 'string' && a.startsWith('Bearer ')) return a.slice(7);
  return '';
}
function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function nodeNumber(body) {
  const direct = finiteOrNull(body.from);
  if (direct !== null) return Math.trunc(direct);
  const explicit = finiteOrNull(body.node_num);
  if (explicit !== null) return Math.trunc(explicit);
  const source = body.sender || body.mesh_source;
  if (typeof source === 'string' && /^![0-9a-f]{8}$/i.test(source)) return Number.parseInt(source.slice(1), 16);
  return null;
}
function observedAtFor(body) {
  const sec = finiteOrNull(body.timestamp);
  if (sec !== null && sec > 0) return new Date(sec * 1000);
  if (typeof body.observed_at === 'string') {
    const d = new Date(body.observed_at);
    if (Number.isFinite(d.getTime())) return d;
  }
  return new Date();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'POST required' });
  }
  const expectedKey = process.env.INGEST_KEY;
  if (!expectedKey) return res.status(500).json({ ok: false, error: 'INGEST_KEY is not configured' });
  if (readIngestKey(req) !== expectedKey) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const body = unwrapBody(req.body);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ ok: false, error: 'Expected a JSON object' });
  if (!SUPPORTED.has(body.type)) return res.status(202).json({ ok: true, stored: false, reason: 'Unsupported telemetry type' });

  const nodeNum = nodeNumber(body);
  const station = STATIONS.get(nodeNum);
  if (!station) return res.status(202).json({ ok: true, stored: false, reason: 'Node is not a configured permanent station' });

  const metrics = body.payload;
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return res.status(202).json({ ok: true, stored: false, reason: 'Telemetry has no metrics payload' });

  let telemetryType;
  let temperatureC = null;
  if (body.type === 'telemetry') {
    temperatureC = finiteOrNull(metrics.temperature_c ?? metrics.temperature);
    if (temperatureC === null) return res.status(202).json({ ok: true, stored: false, reason: `${station.name} environmental packet has no temperature` });
    telemetryType = 'environment';
  } else {
    if (!station.acceptsDeviceTelemetry) return res.status(202).json({ ok: true, stored: false, reason: 'Device/battery telemetry is not stored for Heltec Home' });
    const batteryLevel = finiteOrNull(metrics.battery_level ?? metrics.battery_percent ?? metrics.battery_pct);
    const voltage = finiteOrNull(metrics.voltage ?? metrics.battery_voltage ?? metrics.battery_voltage_v);
    if (batteryLevel === null && voltage === null) return res.status(202).json({ ok: true, stored: false, reason: `${station.name} device packet has no battery measurement` });
    telemetryType = 'device';
  }

  const observedAt = observedAtFor(body);
  const observedIso = observedAt.toISOString();
  const nestedRadio = body.radio && typeof body.radio === 'object' ? body.radio : {};
  const radio = {
    rssi: finiteOrNull(body.rssi ?? nestedRadio.rssi),
    snr: finiteOrNull(body.snr ?? nestedRadio.snr),
    hop_start: finiteOrNull(body.hop_start ?? nestedRadio.hop_start),
    hop_limit: finiteOrNull(body.hop_limit ?? nestedRadio.hop_limit),
    hops_away: finiteOrNull(body.hops_away ?? body.hops_used ?? nestedRadio.hops_away ?? nestedRadio.hops_used),
    relay_node: body.relay_node ?? nestedRadio.relay_node ?? null,
    relay_id: body.relay_id ?? nestedRadio.relay_id ?? null,
    relay_name: body.relay_name ?? nestedRadio.relay_name ?? null,
    channel: finiteOrNull(body.channel ?? nestedRadio.channel),
    gateway: body.sender ?? body.mesh_source ?? nestedRadio.gateway ?? null,
  };
  const storedMetrics = telemetryType === 'device' ? { ...metrics, device_observed_at: observedIso } : { ...metrics };

  try {
    const sql = getSql();

    // Hidden Valley device telemetry arrives separately; merge it with the nearest temperature cycle.
    if (telemetryType === 'device') {
      const merged = await sql`
        UPDATE telemetry_readings
        SET metrics = telemetry_readings.metrics || ${JSON.stringify(storedMetrics)}::jsonb,
            raw = telemetry_readings.raw || jsonb_build_object('device_telemetry', ${JSON.stringify(body)}::jsonb),
            received_at = NOW()
        WHERE id = (
          SELECT id FROM telemetry_readings
          WHERE node_num = ${nodeNum}
            AND telemetry_type = 'environment'
            AND temperature_c IS NOT NULL
            AND observed_at <= ${observedIso}
            AND observed_at >= ${observedIso}::timestamptz - (${MERGE_WINDOW_MINUTES} * INTERVAL '1 minute')
          ORDER BY observed_at DESC LIMIT 1
        )
        RETURNING id, observed_at, station_name, telemetry_type, temperature_c, metrics, radio
      `;
      if (merged.length) return res.status(200).json({ ok: true, stored: true, merged: true, reading: merged[0] });
    }

    if (telemetryType === 'environment' && station.acceptsDeviceTelemetry) {
      const merged = await sql`
        UPDATE telemetry_readings
        SET observed_at = ${observedIso}, telemetry_type = 'environment', temperature_c = ${temperatureC},
            metrics = telemetry_readings.metrics || ${JSON.stringify(storedMetrics)}::jsonb,
            radio = ${JSON.stringify(radio)}::jsonb,
            raw = jsonb_build_object('environment_telemetry', ${JSON.stringify(body)}::jsonb, 'device_telemetry', telemetry_readings.raw),
            received_at = NOW()
        WHERE id = (
          SELECT id FROM telemetry_readings
          WHERE node_num = ${nodeNum}
            AND telemetry_type = 'device'
            AND observed_at <= ${observedIso}
            AND observed_at >= ${observedIso}::timestamptz - (${MERGE_WINDOW_MINUTES} * INTERVAL '1 minute')
          ORDER BY observed_at DESC LIMIT 1
        )
        RETURNING id, observed_at, station_name, telemetry_type, temperature_c, metrics, radio
      `;
      if (merged.length) return res.status(200).json({ ok: true, stored: true, merged: true, reading: merged[0] });
    }

    const rows = await sql`
      INSERT INTO telemetry_readings
        (observed_at, node_num, station_name, telemetry_type, temperature_c, metrics, radio, raw)
      VALUES
        (${observedIso}, ${nodeNum}, ${station.name}, ${telemetryType}, ${temperatureC},
         ${JSON.stringify(storedMetrics)}::jsonb, ${JSON.stringify(radio)}::jsonb, ${JSON.stringify(body)}::jsonb)
      RETURNING id, observed_at, station_name, telemetry_type, temperature_c, metrics, radio
    `;
    return res.status(201).json({ ok: true, stored: true, merged: false, reading: rows[0] });
  } catch (error) {
    console.error('Telemetry ingest failed', error);
    return res.status(500).json({ ok: false, error: 'Database insert failed' });
  }
}
