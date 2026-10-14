import { rateReading } from '../api/rating-curves.js';

export const STATIONS = [
  [1949224949, 'Pack Creek'], [1695962694, 'Cottonwood Creek'],
  [1577197109, 'Fishlake Hightop'], [1252758033, 'Hidden Valley'],
  [2740603892, 'Moab'], [2425602407, 'Cottonwood Relay'],
  [2650172798, 'Thousand Lake Mountain'], [4241345683, 'SMLA'],
  [2004386937, 'Rock Moisture'], [3044869407, 'Revived'],
];
export const PARAMETERS = {
  discharge_cfs: 'Discharge (cfs)', water_level_ft: 'Stage (ft)',
  temperature_c: 'Temperature (°C)', voltage: 'Battery voltage (V)',
  soil_moisture_percent: 'Soil moisture (%)',
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
  if (body.direction === 'above' ? reset >= threshold : reset <= threshold) throw new Error('Reset must be below an above-threshold rule, or above a below-threshold rule');
  if (['discharge_cfs', 'water_level_ft'].includes(body.parameter) && ![1949224949,1695962694].includes(node)) throw new Error('Stage and discharge require a water station');
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
