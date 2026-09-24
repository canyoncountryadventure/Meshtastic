import { getSql } from './db.js';

const STATIONS = [
  { node: 1252758033, name: 'Hidden Valley', battery: true },
  { node: 2740603892, name: 'Moab', battery: false },
  { node: 1577197109, name: 'Fishlake Hightop', battery: true },
  { node: 1949224949, name: "It's a Swell Day", battery: true },
  { node: 2650172798, name: 'Thousand Lake Mountain', battery: true },
  { node: 4241345683, name: 'Pack Creek', battery: true, stage: true },
  { node: 2004386937, name: 'Wingate Moisture', battery: true, measure: 'soil' },
  { node: 3388602087, name: 'Cliff Sensor', battery: true },
];

const EXPECTED_INTERVAL_MINUTES = 60;
const ALERT_AFTER_MINUTES = 195;

function metric(row, ...keys) {
  for (const key of keys) {
    const value = row?.metrics?.[key];
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

function batteryFields(device) {
  if (!device) return {
    battery_percent: null,
    voltage: null,
    device_observed_at: null,
    device_received_at: null,
  };
  return {
    battery_percent: metric(device, 'battery_level', 'battery_percent', 'battery_pct'),
    voltage: metric(device, 'voltage', 'battery_voltage', 'battery_voltage_v'),
    device_observed_at: device.observed_at,
    device_received_at: device.received_at,
  };
}

function resultFor(station, environment, device, stage) {
  const stageFields = station.stage ? {
    water_level_ft: stage?.metrics?.water_level_ft ?? null,
    stage_observed_at: stage?.observed_at ?? null,
    stage_calibrated: stage?.metrics?.stage_calibrated ?? (stage?.telemetry_type === 'mx2001' ? true : null),
  } : {};
  if (!environment) {
    const latest = station.battery && device ? {
      id: null,
      observed_at: null,
      received_at: null,
      temperature_f: null,
      ...batteryFields(device),
      ...stageFields,
      rssi: device.radio?.rssi ?? null,
      snr: device.radio?.snr ?? null,
      hops_away: device.radio?.hops_away ?? null,
    } : null;
    return {
      station: station.name,
      node_num: station.node,
      healthy: false,
      alert: true,
      reason: station.measure === 'soil' ? 'no_soil_reading' : 'no_temperature_reading',
      expected_interval_minutes: EXPECTED_INTERVAL_MINUTES,
      alert_after_minutes: ALERT_AFTER_MINUTES,
      latest,
    };
  }

  const ageMinutes = Math.max(0, (Date.now() - new Date(environment.observed_at).getTime()) / 60000);
  const alert = ageMinutes >= ALERT_AFTER_MINUTES;
  const latest = {
    id: environment.id,
    observed_at: environment.observed_at,
    received_at: environment.received_at,
    temperature_f: environment.temperature_c === null ? null : Number((environment.temperature_c * 9 / 5 + 32).toFixed(1)),
    ...(station.measure === 'soil' ? { soil_moisture_percent: metric(environment, 'soil_moisture_percent') } : {}),
    ...stageFields,
  };

  if (station.battery) {
    Object.assign(latest, batteryFields(device));
    latest.rssi = environment.radio?.rssi ?? device?.radio?.rssi ?? null;
    latest.snr = environment.radio?.snr ?? device?.radio?.snr ?? null;
    latest.hops_away = environment.radio?.hops_away ?? device?.radio?.hops_away ?? null;
  }

  return {
    station: station.name,
    node_num: station.node,
    healthy: !alert,
    alert,
    reason: alert ? 'three_hourly_readings_missed' : 'reporting_normally',
    expected_interval_minutes: EXPECTED_INTERVAL_MINUTES,
    alert_after_minutes: ALERT_AFTER_MINUTES,
    age_minutes: Number(ageMinutes.toFixed(1)),
    consecutive_expected_readings_missed: Math.floor(ageMinutes / EXPECTED_INTERVAL_MINUTES),
    latest,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'GET required' });
  }

  try {
    const sql = getSql();
    const wanted = req.query.node ? Number(req.query.node) : null;
    const configs = Number.isFinite(wanted) ? STATIONS.filter(s => s.node === wanted) : STATIONS;
    if (!configs.length) return res.status(404).json({ ok: false, error: 'Unknown station' });

    const results = [];
    for (const station of configs) {
      const environmentRows = await sql`
        SELECT id, observed_at, received_at, temperature_c, metrics, radio
        FROM telemetry_readings
        WHERE node_num=${station.node}
          AND telemetry_type=${station.measure || 'environment'}
          AND ((${station.measure === 'soil'} AND metrics ? 'soil_moisture_percent')
            OR (${station.measure !== 'soil'} AND temperature_c IS NOT NULL))
        ORDER BY observed_at DESC
        LIMIT 1
      `;

      let device = null;
      if (station.battery) {
        const deviceRows = await sql`
          SELECT id, observed_at, received_at, metrics, radio
          FROM telemetry_readings
          WHERE node_num=${station.node}
            AND telemetry_type='device'
          ORDER BY observed_at DESC
          LIMIT 1
        `;
        device = deviceRows[0] || null;
      }

      let stage = null;
      if (station.stage) {
        const stageRows = await sql`
          SELECT observed_at, telemetry_type, metrics
          FROM telemetry_readings
          WHERE node_num=${station.node}
            AND telemetry_type IN ('water_distance', 'mx2001')
            AND (metrics ? 'water_level_ft')
          ORDER BY observed_at DESC
          LIMIT 1
        `;
        stage = stageRows[0] || null;
      }
      results.push(resultFor(station, environmentRows[0] || null, device, stage));
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, stations: results, ...(results.length === 1 ? results[0] : {}) });
  } catch (error) {
    console.error('Station health query failed', error);
    return res.status(500).json({ ok: false, error: 'Station health query failed' });
  }
}
