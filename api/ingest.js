import { getSql } from './db.js';

const MX2001_STATIONS = {
  'F1:0D:9D:29:C3:2D': 'Mill Creek Field Test',
};

function parsePossibleJson(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function unwrapBody(input) {
  let body = parsePossibleJson(input);

  for (let i = 0; i < 4; i += 1) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) break;

    if ((body.type === 'telemetry' || body.type === 'mx2001') && body.payload && typeof body.payload === 'object') {
      return body;
    }

    const candidates = [body.payload, body.body, body.message, body.data];
    const next = candidates.map(parsePossibleJson).find(
      (value) => value && typeof value === 'object' && !Array.isArray(value),
    );

    if (!next || next === body) break;
    body = next;
  }

  return body;
}

function nodeHex(nodeNum) {
  if (!Number.isFinite(nodeNum)) return 'unknown';
  return Math.trunc(nodeNum).toString(16).padStart(8, '0');
}

function stationNameFor(body, nodeNum, metrics) {
  const loggerMac = typeof metrics?.logger_mac === 'string' ? metrics.logger_mac.toUpperCase() : '';
  if (body.type === 'mx2001' && MX2001_STATIONS[loggerMac]) {
    return MX2001_STATIONS[loggerMac];
  }

  const supplied = body.station_name || body.station || body.sender_name;
  if (typeof supplied === 'string' && supplied.trim()) return supplied.trim();

  if (body.type === 'mx2001' && loggerMac) {
    return `MX2001 ${loggerMac}`;
  }

  const configuredName = process.env.STATION_NAME?.trim();
  if (configuredName) return configuredName;

  return `Node ${nodeHex(nodeNum)}`;
}

function readIngestKey(req) {
  const headerValue = req.headers['x-ingest-key'];
  if (typeof headerValue === 'string') return headerValue;

  const authorization = req.headers.authorization;
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    return authorization.slice(7);
  }

  return '';
}

function finiteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function nodeNumber(body) {
  const direct = Number(body.from);
  if (Number.isFinite(direct)) return Math.trunc(direct);

  const explicit = Number(body.node_num);
  if (Number.isFinite(explicit)) return Math.trunc(explicit);

  const source = body.sender || body.mesh_source;
  if (typeof source === 'string' && /^![0-9a-f]{8}$/i.test(source)) {
    return Number.parseInt(source.slice(1), 16);
  }

  return null;
}

function observedAtFor(body) {
  const timestampSeconds = Number(body.timestamp);
  if (Number.isFinite(timestampSeconds) && timestampSeconds > 0) {
    return new Date(timestampSeconds * 1000);
  }

  if (typeof body.observed_at === 'string') {
    const parsed = new Date(body.observed_at);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }

  return new Date();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'POST required' });
  }

  const expectedKey = process.env.INGEST_KEY;
  if (!expectedKey) {
    return res.status(500).json({ ok: false, error: 'INGEST_KEY is not configured' });
  }

  if (readIngestKey(req) !== expectedKey) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const body = unwrapBody(req.body);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ ok: false, error: 'Expected a JSON object' });
  }

  if (body.type !== 'telemetry' && body.type !== 'mx2001') {
    return res.status(202).json({ ok: true, stored: false, reason: 'Unsupported telemetry type' });
  }

  const metrics = body.payload;
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
    return res.status(202).json({ ok: true, stored: false, reason: 'Telemetry has no metrics payload' });
  }

  let telemetryType = 'environment';
  let temperatureC = null;

  if (body.type === 'mx2001') {
    telemetryType = 'mx2001';
    temperatureC = finiteOrNull(metrics.temperature_c);

    const waterLevelFt = finiteOrNull(metrics.water_level_ft);
    if (waterLevelFt === null && temperatureC === null) {
      return res.status(202).json({ ok: true, stored: false, reason: 'MX2001 payload has no water level or temperature' });
    }
  } else {
    temperatureC = finiteOrNull(metrics.temperature);
    if (temperatureC === null) {
      return res.status(202).json({ ok: true, stored: false, reason: 'No temperature in telemetry payload' });
    }
  }

  const nodeNum = nodeNumber(body);
  const observedAt = observedAtFor(body);
  const stationName = stationNameFor(body, nodeNum, metrics);

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

  try {
    const sql = getSql();
    const rows = await sql`
      INSERT INTO telemetry_readings (
        observed_at,
        node_num,
        station_name,
        telemetry_type,
        temperature_c,
        metrics,
        radio,
        raw
      ) VALUES (
        ${observedAt.toISOString()},
        ${nodeNum},
        ${stationName},
        ${telemetryType},
        ${temperatureC},
        ${JSON.stringify(metrics)}::jsonb,
        ${JSON.stringify(radio)}::jsonb,
        ${JSON.stringify(body)}::jsonb
      )
      RETURNING id, observed_at, station_name, telemetry_type, temperature_c, metrics, radio
    `;

    return res.status(201).json({ ok: true, stored: true, reading: rows[0] });
  } catch (error) {
    console.error('Telemetry ingest failed', error);
    return res.status(500).json({ ok: false, error: 'Database insert failed' });
  }
}
