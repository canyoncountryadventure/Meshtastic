import { rateReading } from '../api/rating-curves.js';

export const STATIONS = [
  [1949224949, 'Pack Creek'], [1695962694, 'Cottonwood Creek'],
  [1577197109, 'Fishlake Hightop'],
  [2740603892, 'Moab'], [2425602407, 'Cottonwood Relay'],
  [2650172798, 'Thousand Lake Mountain'], [4241345683, 'Cottonwood Relay 2'],
  [2004386937, 'Matheson Groundwater'], [3044869407, 'Hidden Valley'],
  [1683604927, 'Mill Creek'], [647393146, 'Seed Relay 1'],
];
export const PARAMETERS = {
  discharge_cfs: 'Discharge (cfs)', water_level_ft: 'Stage (ft)',
  temperature_c: 'Temperature (°F)', voltage: 'Battery voltage (V)',
  soil_moisture_percent: 'Soil moisture (%)', battery_percent: 'Battery (%)',
};
export function finite(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const n = Number(value); return Number.isFinite(n) ? n : null;
}
export function readingValue(reading, parameter, curve) {
  const metrics = reading.metrics || {};
  if (['discharge_cfs', 'water_level_ft'].includes(parameter)) {
    if (!['mx2001', 'water_distance'].includes(reading.telemetry_type) || metrics.stage_calibrated === false) return null;
    // Ultrasonic packets need an explicit calibration flag; MX2001 has its own calibrated datum.
    if (reading.telemetry_type === 'water_distance' && metrics.stage_calibrated !== true) return null;
    return parameter === 'discharge_cfs' ? finite(rateReading(reading, curve).discharge_cfs) : finite(metrics.water_level_ft);
  }
  if (parameter === 'temperature_c') return finite(reading.temperature_c);
  if (parameter === 'battery_percent') {
    const value=finite(metrics.battery_level ?? metrics.battery_percent ?? metrics.battery_pct);
    return reading.telemetry_type==='device' && value!==null && value>=0 && value<=100 ? value : null;
  }
  if (parameter === 'voltage') return reading.telemetry_type === 'device' ? finite(metrics.voltage ?? metrics.battery_voltage ?? metrics.battery_voltage_v) : null;
  return reading.telemetry_type === 'soil' ? finite(metrics.soil_moisture_percent) : null;
}
export function nextActive(rule, value) {
  if (rule.direction === 'above') return rule.active ? value >= rule.reset_value : value > rule.threshold;
  return rule.active ? value <= rule.reset_value : value < rule.threshold;
}
export function validateRule(body) {
  const node = finite(body.node_num), threshold = finite(body.threshold), reset = finite(body.reset_value);
  if (!STATIONS.some(([n]) => n === node)) throw new Error('Choose a known station');
  if (!Object.hasOwn(PARAMETERS, body.parameter)) throw new Error('Choose a supported parameter');
  if (!['above', 'below'].includes(body.direction)) throw new Error('Choose above or below');
  if (threshold === null || reset === null) throw new Error('Threshold and reset must be numbers');
  if (body.parameter==='battery_percent' && (threshold<0 || threshold>100 || reset<0 || reset>100)) throw new Error('Threshold and recovery battery percentages must be between 0 and 100');
  if (body.direction === 'above' ? reset >= threshold : reset <= threshold) throw new Error('Choose a lower recovery value for an above alert, or a higher recovery value for a below alert');
  if (['discharge_cfs', 'water_level_ft'].includes(body.parameter) && ![1949224949,1695962694,2004386937,1683604927].includes(node)) throw new Error('Stage and discharge require a water station');
  if (body.parameter === 'discharge_cfs' && node !== 1949224949) throw new Error('Only Pack Creek currently has a discharge rating curve');
  return { node_num: node, station_name: STATIONS.find(([n]) => n === node)[1], parameter: body.parameter,
    direction: body.direction, threshold, reset_value: reset, enabled: body.enabled === true };
}
export function normalizeEmails(input) {
  if (!Array.isArray(input) || input.length > 20) throw new Error('Use up to 20 recipient addresses');
  const emails = [...new Set(input.map(e => String(e).trim().toLowerCase()))];
  if (emails.some(e => e.length > 254 || !/^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(e))) throw new Error('Enter valid email addresses');
  return emails;
}

// Storage and threshold evaluation remain in Celsius; the alert interface uses Fahrenheit.
export function displayRule(rule) {
  if (rule.parameter !== 'temperature_c') return rule;
  const fahrenheit = value => Number((Number(value) * 9 / 5 + 32).toFixed(8));
  return { ...rule, threshold: fahrenheit(rule.threshold), reset_value: fahrenheit(rule.reset_value) };
}
export function storedRule(rule) {
  if (rule.parameter !== 'temperature_c') return rule;
  const celsius = value => finite(value) === null ? value : (Number(value) - 32) * 5 / 9;
  return { ...rule, threshold: celsius(rule.threshold), reset_value: celsius(rule.reset_value) };
}
export function temperatureAlertText(rule, value, observedAt) {
  const f = c => (Number(c) * 9 / 5 + 32).toFixed(1) + ' °F';
  return {
    subject: `${rule.station_name} alert: Temperature ${f(value)} (${rule.direction} ${f(rule.threshold)})`,
    body: `${rule.station_name}\nTemperature: ${f(value)}\nThreshold: ${rule.direction} ${f(rule.threshold)}\nMeasured: ${new Date(observedAt).toISOString()}\nDashboard: https://meshtastic-ecru.vercel.app/\n`,
  };
}
