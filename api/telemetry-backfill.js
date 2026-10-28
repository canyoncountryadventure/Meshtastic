import { timingSafeEqual } from 'node:crypto';
import { markEmergencyBackup, pendingEmergencyBackups, isGoogleSheetsBackupConfigured } from '../lib/google-sheets-backup.js';
import { verifyGitHubHeartbeat } from '../lib/github-oidc-heartbeat.js';

const BACKFILL_SCOPE = {
  audience: 'meshtastic-telemetry-backfill',
  workflow: 'canyoncountryadventure/Meshtastic/.github/workflows/telemetry-backfill.yml@refs/heads/main',
};

async function authorized(req) {
  const expected = process.env.CRON_SECRET || '';
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  return (expected.length >= 16 && a.length === b.length && timingSafeEqual(a, b)) ||
    verifyGitHubHeartbeat(supplied, fetch, BACKFILL_SCOPE);
}

function sameOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ ok: false, error: 'GET or POST required' });
  if (!await authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  if (!isGoogleSheetsBackupConfigured()) return res.status(503).json({ ok: false, error: 'Google Sheets backup is not configured' });

  const requested = Number(req.query?.limit || 50);
  const limit = Number.isInteger(requested) ? Math.max(1, Math.min(100, requested)) : 50;
  const rows = await pendingEmergencyBackups(limit);
  const result = { ok: true, checked: rows.length, synchronized: 0, deferred: 0, failed: 0 };
  for (const item of rows) {
    const attempts = Number(item.row[19] || 0) + 1;
    let raw;
    try { raw = JSON.parse(item.row[17]); }
    catch {
      await markEmergencyBackup(item.rowNumber, { status: 'error', attempts, error: 'Original JSON is invalid' });
      result.failed++;
      continue;
    }
    try {
      const response = await fetch(`${sameOrigin(req)}/api/ingest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-ingest-key': process.env.INGEST_KEY || '' },
        body: JSON.stringify(raw), signal: AbortSignal.timeout(20000),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `Ingest returned ${response.status}`);
      if (Number(body.backed_up || 0) > 0) {
        await markEmergencyBackup(item.rowNumber, { status: 'retry', attempts, error: 'Neon remains unavailable' });
        result.deferred++;
        break; // avoid consuming the whole serverless budget while Neon is still down
      } else {
        await markEmergencyBackup(item.rowNumber, { status: 'synced', syncedAt: new Date().toISOString(), attempts, error: '' });
        result.synchronized++;
      }
    } catch (error) {
      await markEmergencyBackup(item.rowNumber, { status: 'retry', attempts, error: String(error?.message || error).slice(0, 500) });
      result.failed++;
      break;
    }
  }
  return res.status(200).json(result);
}
