export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'POST required' });
  }

  return res.status(503).json({
    ok: false,
    stored: false,
    error: 'Telemetry ingest temporarily paused',
  });
}
