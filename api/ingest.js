import { getSql } from './db.js';

const KNOWN_STATIONS = new Map([
  [3044869407, 'Hidden Valley'],
  [2740603892, 'Heltec Home'],
  [1577197109, 'Fishlake Hightop'],
  [1949224949, "It's a Swell Day"],
]);

const ACCEPTED_TYPES = new Set(['telemetry', 'device', 'mx2001', 'rock_test']);
const MAX_BATCH_SIZE = 64;

function parseJson(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function normalizeBodies(input) {
  const parsed = parseJson(input);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.batch)) return parsed.batch;
  return [parsed];
}

function readIngestKey(req) {
  const direct = req.headers['x-ingest-key'];
  if (typeof direct === 'string') return direct;
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7);
  return '';
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function nodeNumber(body) {
  const direct = finiteOrNull(body?.from ?? body?.node_num);
  if (direct !== null) return Math.trunc(direct);

  const source = body?.sender ?? body?.mesh_source;
  if (typeof source === 'string' && /^![0-9a-f]{8}$/i.test(source)) {
    return Number.parseInt(source.slice(1), 16);
  }
  return null;
}

function observedIso(body) {
  const seconds = finiteOrNull(body?.timestamp);
  if (seconds !== null && seconds > 0) {
    const d = new Date(seconds * 1000);
    if (Number.isFinite(d.getTime())) return d.toISOString();
  }

  if (typeof body?.observed_at === 'string') {
    const d = new Date(body.observed_at);
    if (Number.isFinite(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

function stationName(body, nodeNum) {
  if (KNOWN_STATIONS.has(nodeNum)) return KNOWN_STATIONS.get(nodeNum);
  if (typeof body?.station_name === 'string' && body.station_name.trim()) return body.station_name.trim();
  return nodeNum === null ? 'Unknown node' : `Node ${nodeNum.toString(16).padStart(8, '0')}`;
}

function telemetryType(body) {
  if (body.type === 'device') return 'device';
  if (body.type === 'mx2001') return 'mx2001';
  if (body.type === 'rock_test') return 'rock_test';
  return 'environment';
}

function temperatureC(body) {
  const p = body?.payload && typeof body.payload === 'object' ? body.payload : {};
  return finiteOrNull(p.temperature_c ?? p.temperature);
}

function radioObject(body) {
  const nested = body?.radio && typeof body.radio === 'object' ? body.radio : {};
  return {
    rssi: finiteOrNull(body?.rssi ?? nested.rssi),
    snr: finiteOrNull(body?.snr ?? nested.snr),
    hop_start: finiteOrNull(body?.hop_start ?? nested.hop_start),
    hop_limit: finiteOrNull(body?.hop_limit ?? nested.hop_limit),
    hops_away: finiteOrNull(body?.hops_away ?? body?.hops_used ?? nested.hops_away ?? nested.hops_used),
    relay_node: body?.relay_node ?? nested.relay_node ?? null,
    relay_id: body?.relay_id ?? nested.relay_id ?? null,
    relay_name: body?.relay_name ?? nested.relay_name ?? null,
    channel: finiteOrNull(body?.channel ?? nested.channel),
    gateway: body?.gateway ?? body?.sender ?? body?.mesh_source ?? nested.gateway ?? null,
  };
}

function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Expected a JSON object');
  }
  if (!ACCEPTED_TYPES.has(body.type)) {
    throw new Error(`Unsupported type: ${String(body.type)}`);
  }
  if (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
    throw new Error('payload must be an object');
  }

  const nodeNum = nodeNumber(body);
  if (nodeNum === null) throw new Error('Missing node number/from');

  if (body.type === 'telemetry' && temperatureC(body) === null) {
    throw new Error('Telemetry packet has no temperature');
  }

  return nodeNum;
}

async function insertReading(sql, body) {
  const nodeNum = validate(body);
  const observedAt = observedIso(body);
  const name = stationName(body, nodeNum);
  const type = telemetryType(body);
  const tempC = temperatureC(body);
  const metrics = JSON.stringify(body.payload);
  const radio = JSON.stringify(radioObject(body));
  const raw = JSON.stringify(body);

  const rows = await sql`
    INSERT INTO telemetry_readings
      (observed_at, node_num, station_name, telemetry_type, temperature_c, metrics, radio, raw)
    VALUES
      (${observedAt}, ${nodeNum}, ${name}, ${type}, ${tempC},
       ${metrics}::jsonb, ${radio}::jsonb, ${raw}::jsonb)
    RETURNING id, received_at, observed_at, node_num, station_name, telemetry_type, temperature_c
  `;

  return rows[0];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'POST required' });
  }

  const expectedKey = process.env.INGEST_KEY;
  if (!expectedKey) return res.status(500).json({ ok: false, error: 'INGEST_KEY is not configured' });
  if (readIngestKey(req) !== expectedKey) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const bodies = normalizeBodies(req.body);
  if (!bodies.length) return res.status(400).json({ ok: false, error: 'Empty request' });
  if (bodies.length > MAX_BATCH_SIZE) return res.status(413).json({ ok: false, error: `Maximum ${MAX_BATCH_SIZE} readings` });

  try {
    const sql = getSql();
    const readings = [];
    for (const body of bodies) {
      readings.push(await insertReading(sql, parseJson(body)));
    }

    return res.status(201).json({
      ok: true,
      stored: readings.length,
      reading: readings.length === 1 ? readings[0] : undefined,
      readings: readings.length > 1 ? readings : undefined,
    });
  } catch (error) {
    console.error('Telemetry ingest failed', error);
    return res.status(400).json({ ok: false, error: error?.message || 'Telemetry ingest failed' });
  }
}
