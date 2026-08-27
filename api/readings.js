import { getSql } from './db.js';

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'GET required' });
  }

  const hours = clampInt(req.query.hours, 24, 1, 24 * 365);
  const limit = clampInt(req.query.limit, 5000, 1, 10000);
  const node = req.query.node === undefined ? null : clampInt(req.query.node, null, 1, 4294967295);
  const bucketMinutes = clampInt(req.query.bucket_minutes, 5, 0, 24 * 60);

  try {
    const sql = getSql();
    let rows;

    if (bucketMinutes > 0 && node !== null) {
      rows = await sql`
        SELECT id, observed_at, received_at, node_num, station_name,
               telemetry_type, temperature_c, metrics, radio
        FROM (
          SELECT id, observed_at, received_at, node_num, station_name,
                 telemetry_type, temperature_c, metrics, radio,
                 ROW_NUMBER() OVER (
                   PARTITION BY node_num, telemetry_type,
                                FLOOR(EXTRACT(EPOCH FROM observed_at) / (${bucketMinutes} * 60))
                   ORDER BY observed_at DESC
                 ) AS bucket_rank
          FROM telemetry_readings
          WHERE observed_at >= NOW() - (${hours} * INTERVAL '1 hour')
            AND node_num = ${node}
        ) sampled
        WHERE bucket_rank = 1
        ORDER BY observed_at DESC
        LIMIT ${limit}
      `;
    } else if (bucketMinutes > 0) {
      rows = await sql`
        SELECT id, observed_at, received_at, node_num, station_name,
               telemetry_type, temperature_c, metrics, radio
        FROM (
          SELECT id, observed_at, received_at, node_num, station_name,
                 telemetry_type, temperature_c, metrics, radio,
                 ROW_NUMBER() OVER (
                   PARTITION BY node_num, telemetry_type,
                                FLOOR(EXTRACT(EPOCH FROM observed_at) / (${bucketMinutes} * 60))
                   ORDER BY observed_at DESC
                 ) AS bucket_rank
          FROM telemetry_readings
          WHERE observed_at >= NOW() - (${hours} * INTERVAL '1 hour')
        ) sampled
        WHERE bucket_rank = 1
        ORDER BY observed_at DESC
        LIMIT ${limit}
      `;
    } else if (node !== null) {
      rows = await sql`
        SELECT id, observed_at, received_at, node_num, station_name,
               telemetry_type, temperature_c, metrics, radio
        FROM telemetry_readings
        WHERE observed_at >= NOW() - (${hours} * INTERVAL '1 hour')
          AND node_num = ${node}
        ORDER BY observed_at DESC
        LIMIT ${limit}
      `;
    } else {
      rows = await sql`
        SELECT id, observed_at, received_at, node_num, station_name,
               telemetry_type, temperature_c, metrics, radio
        FROM telemetry_readings
        WHERE observed_at >= NOW() - (${hours} * INTERVAL '1 hour')
        ORDER BY observed_at DESC
        LIMIT ${limit}
      `;
    }

    return res.status(200).json({ ok: true, hours, node, bucket_minutes: bucketMinutes, readings: rows });
  } catch (error) {
    console.error('Telemetry query failed', error);
    return res.status(500).json({ ok: false, error: 'Database query failed' });
  }
}
