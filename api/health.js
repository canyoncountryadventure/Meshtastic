import { getSql } from './db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false });
  }

  try {
    const sql = getSql();
    const rows = await sql`
      SELECT observed_at, station_name, telemetry_type, temperature_c, metrics
      FROM telemetry_readings
      ORDER BY observed_at DESC
      LIMIT 1
    `;

    return res.status(200).json({
      ok: true,
      database: true,
      ingest_key_configured: Boolean(process.env.INGEST_KEY),
      latest: rows[0] ?? null,
    });
  } catch (error) {
    console.error('Health check failed', error);
    return res.status(500).json({
      ok: false,
      database: false,
      ingest_key_configured: Boolean(process.env.INGEST_KEY),
    });
  }
}
