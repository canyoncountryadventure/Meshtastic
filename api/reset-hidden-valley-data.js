import { getSql } from './db.js';

const CONFIRM = 'HVRP_RESET_20260827';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'GET required' });
  }
  if (req.query.confirm !== CONFIRM) {
    return res.status(403).json({ ok: false, error: 'Confirmation token required' });
  }
  try {
    const sql = getSql();
    const before = await sql`SELECT COUNT(*)::int AS count FROM telemetry_readings`;
    await sql`DELETE FROM telemetry_readings`;
    const after = await sql`SELECT COUNT(*)::int AS count FROM telemetry_readings`;
    return res.status(200).json({ ok: true, deleted: before[0]?.count ?? null, remaining: after[0]?.count ?? null });
  } catch (error) {
    console.error('Reset failed', error);
    return res.status(500).json({ ok: false, error: 'Reset failed' });
  }
}
