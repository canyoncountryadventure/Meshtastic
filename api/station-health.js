import { getSql } from './db.js';

const HIDDEN_VALLEY_NODE_NUM = 1436900584;
const EXPECTED_INTERVAL_MINUTES = 60;
const ALERT_AFTER_MINUTES = 195; // 3 expected hourly readings + 15-minute grace period

function metric(row, ...keys) {
  for (const key of keys) {
    const value = row?.metrics?.[key];
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'GET required' });
  }

  try {
    const sql = getSql();
    const rows = await sql`
      SELECT id, observed_at, received_at, temperature_c, metrics, radio
      FROM telemetry_readings
      WHERE node_num = ${HIDDEN_VALLEY_NODE_NUM}
        AND telemetry_type = 'environment'
        AND temperature_c IS NOT NULL
      ORDER BY observed_at DESC
      LIMIT 1
    `;

    const latest = rows[0] || null;
    if (!latest) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        ok: true,
        station: 'Hidden Valley Repeater',
        node_num: HIDDEN_VALLEY_NODE_NUM,
        healthy: false,
        alert: true,
        reason: 'no_temperature_reading',
        expected_interval_minutes: EXPECTED_INTERVAL_MINUTES,
        alert_after_minutes: ALERT_AFTER_MINUTES,
        consecutive_expected_readings_missed: null,
        latest: null,
      });
    }

    const observedMs = new Date(latest.observed_at).getTime();
    const ageMinutes = Math.max(0, (Date.now() - observedMs) / 60000);
    const missed = Math.floor(ageMinutes / EXPECTED_INTERVAL_MINUTES);
    const alert = ageMinutes >= ALERT_AFTER_MINUTES;
    const temperatureF = latest.temperature_c === null ? null : latest.temperature_c * 9 / 5 + 32;
    const deviceObservedAt = metric(latest, 'device_observed_at');

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      station: 'Hidden Valley Repeater',
      node_num: HIDDEN_VALLEY_NODE_NUM,
      healthy: !alert,
      alert,
      reason: alert ? 'three_hourly_readings_missed' : 'reporting_normally',
      expected_interval_minutes: EXPECTED_INTERVAL_MINUTES,
      alert_after_minutes: ALERT_AFTER_MINUTES,
      age_minutes: Number(ageMinutes.toFixed(1)),
      consecutive_expected_readings_missed: missed,
      latest: {
        id: latest.id,
        observed_at: latest.observed_at,
        received_at: latest.received_at,
        temperature_f: temperatureF === null ? null : Number(temperatureF.toFixed(1)),
        battery_percent: metric(latest, 'battery_level', 'battery_percent', 'battery_pct'),
        voltage: metric(latest, 'voltage', 'battery_voltage', 'battery_voltage_v'),
        device_observed_at: deviceObservedAt,
        rssi: latest.radio?.rssi ?? null,
        snr: latest.radio?.snr ?? null,
        hops_away: latest.radio?.hops_away ?? null,
      },
    });
  } catch (error) {
    console.error('Station health query failed', error);
    return res.status(500).json({ ok: false, error: 'Station health query failed' });
  }
}
