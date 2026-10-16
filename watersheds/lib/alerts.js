import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { getActiveRatingCurves, rateReading } from '../api/rating-curves.js';
import { readingValue, finite, temperatureAlertText } from './alert-values.js';

function encryptionKey() {
  if (!process.env.ALERTS_ENCRYPTION_KEY) throw new Error('Email encryption is not configured');
  return createHash('sha256').update(process.env.ALERTS_ENCRYPTION_KEY).digest();
}
export function encryptKey(value) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}
function decryptKey(value) {
  const b = Buffer.from(value, 'base64'), cipher = createDecipheriv('aes-256-gcm', encryptionKey(), b.subarray(0,12));
  cipher.setAuthTag(b.subarray(12,28));
  return Buffer.concat([cipher.update(b.subarray(28)), cipher.final()]).toString('utf8');
}
export async function emailConfig(sql) {
  const rows = await sql`SELECT sender,encrypted_key FROM alert_email_config WHERE id=1`;
  if (!rows[0]) return null;
  return { sender: rows[0].sender, key: decryptKey(rows[0].encrypted_key) };
}
export async function evaluateReadings(sql, readings, options = {}) {
  const rules = await sql`SELECT * FROM alert_rules WHERE enabled AND jsonb_array_length(recipients)>0`;
  if (!rules.length) return;
  const curves = options.curves ?? await getActiveRatingCurves(sql);
  const byNode = new Map(curves.map(c => [Number(c.node_num), c]));
  for (const reading of [...readings].sort((a,b) => new Date(a.observed_at)-new Date(b.observed_at))) {
    const age = Date.now() - new Date(reading.observed_at).getTime();
    if (!Number.isFinite(age) || age > 3*60*60*1000 || age < -5*60*1000) continue;
    for (const rule of rules.filter(r => Number(r.node_num) === Number(reading.node_num))) {
      const curve = byNode.get(Number(reading.node_num));
      const value = readingValue(reading, rule.parameter, curve);
      if (value === null) continue;
      const rated = rateReading(reading, curve);
      let subject = `${rule.station_name} alert: ${rule.parameter} ${value} (${rule.direction} ${rule.threshold})`;
      const stage = finite(reading.metrics?.water_level_ft);
      let body = `${rule.station_name}\n${rule.parameter}: ${value}\nThreshold: ${rule.direction} ${rule.threshold}\nMeasured: ${new Date(reading.observed_at).toISOString()}\n${rule.parameter === 'discharge_cfs' ? `Stage: ${stage} ft\nRating curve: v${rated.rating_curve_version}; ${rated.discharge_rating_status}\nDischarge is estimated from stage.\n` : ''}Dashboard: https://meshtastic-ecru.vercel.app/\n`;
      if (rule.parameter === 'temperature_c') ({ subject, body } = temperatureAlertText(rule, value, reading.observed_at));
      if (options.subjectPrefix) subject=options.subjectPrefix+subject;
      if (options.dashboardUrl) body = body.replace('https://meshtastic-ecru.vercel.app/', options.dashboardUrl);
      // A row lock serializes evaluation across concurrent ingest requests. State and outbox
      // entries commit together; late/duplicate timestamps cannot reset a newer event.
      await sql`WITH locked AS MATERIALIZED (
        SELECT * FROM alert_rules WHERE id=${rule.id} AND enabled
          AND revision=${rule.revision}
          AND (last_observed_at IS NULL OR last_observed_at<${reading.observed_at}::timestamptz)
        FOR UPDATE
      ), changed AS (
        UPDATE alert_rules r SET last_observed_at=${reading.observed_at}::timestamptz,
          active=CASE WHEN l.direction='above' THEN
            CASE WHEN l.active THEN ${value}>=l.reset_value ELSE ${value}>l.threshold END
          ELSE CASE WHEN l.active THEN ${value}<=l.reset_value ELSE ${value}<l.threshold END END
        FROM locked l WHERE r.id=l.id RETURNING r.id,r.active,r.recipients
      ) INSERT INTO alert_deliveries(rule_id,reading_id,recipient,subject,body)
        SELECT c.id,${reading.id},email,${subject},${body} FROM changed c
        JOIN locked l ON l.id=c.id CROSS JOIN LATERAL jsonb_array_elements_text(c.recipients) email
        WHERE c.active AND NOT l.active ON CONFLICT DO NOTHING`;
    }
  }
}
export async function dispatchEmails(sql, limit=4, options = {}) {
  const config = options.config ?? await emailConfig(sql);
  if (!config) return { sent: 0, configured: false };
  let sent = 0;
  await sql`UPDATE alert_deliveries d SET status='cancelled',error='Rule disabled, deleted, or recipient removed'
    WHERE status IN ('pending','sending') AND NOT EXISTS (
      SELECT 1 FROM alert_rules r WHERE r.id=d.rule_id AND (r.enabled OR d.reading_id IS NULL)
        AND r.recipients ? d.recipient
    )`;
  // Each recipient is a separate delivery, preserving privacy and independent retries.
  for (let i=0; i<limit; i++) {
    const rows = await sql`WITH candidate AS (
      SELECT id FROM alert_deliveries WHERE status IN ('pending','sending') AND next_attempt_at<=NOW()
        ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE alert_deliveries d SET status='sending',attempts=attempts+1,next_attempt_at=NOW()+INTERVAL '2 minutes'
      FROM candidate c WHERE d.id=c.id RETURNING d.*`;
    const row = rows[0]; if (!row) break;
    if (Date.now()-new Date(row.created_at).getTime()>23*60*60*1000) {
      await sql`UPDATE alert_deliveries SET status='failed',error='Retry window expired; review before resending' WHERE id=${row.id}`;
      continue;
    }
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method:'POST', signal:AbortSignal.timeout(4000),
        headers:{ Authorization:`Bearer ${config.key}`, 'Content-Type':'application/json', 'Idempotency-Key':`${options.idempotencyPrefix || 'meshtastic-alert'}-${row.id}` },
        body:JSON.stringify({ from:config.sender,to:[row.recipient],subject:row.subject,text:row.body }),
      });
      const result = await response.json();
      if (!response.ok || !result.id) throw new Error(`Email service rejected send (HTTP ${response.status})`);
      await sql`UPDATE alert_deliveries SET status='sent',sent_at=NOW(),provider_id=${result.id},error=NULL WHERE id=${row.id}`;
      sent++;
    } catch (error) {
      await sql`UPDATE alert_deliveries SET status=${row.attempts>=10 ? 'failed':'pending'},
        error=${error.name === 'TimeoutError' ? 'Email service timed out' : 'Email send failed; check service credentials and sender'},
        next_attempt_at=NOW()+INTERVAL '5 minutes' WHERE id=${row.id}`;
    }
  }
  return { sent, configured: true };
}
