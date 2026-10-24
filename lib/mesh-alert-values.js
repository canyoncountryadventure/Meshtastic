import { finite, readingValue } from './alert-values.js';

// Only current station cards and comparison-series on the Meshtastic page.
export const MESH_STATIONS = [
  [3044869407, 'Hidden Valley'],
  [2740603892, 'Moab'],
  [1577197109, 'Fishlake Hightop'],
  [4241345683, 'SMLA'],
];
export const MESH_PARAMETERS = {
  offline_hours: 'Station delayed (hours)',
  temperature_c: 'Air temperature (°F)',
  battery_percent: 'Battery (%)',
  voltage: 'Battery voltage (V)',
  rssi_dbm: 'Radio signal RSSI (dBm)',
  snr_db: 'Radio signal SNR (dB)',
};
const BASIC = ['offline_hours','temperature_c','battery_percent','voltage'];
const RADIO = ['rssi_dbm','snr_db'];
export const MESH_PARAMETER_CHOICES = Object.fromEntries(
  MESH_STATIONS.map(([id])=>[String(id),id===2740603892?[...BASIC]:[...BASIC,...RADIO]])
);
const names = new Map(MESH_STATIONS);

export function isMeshRule(rule) {
  return Boolean(rule && names.has(Number(rule.node_num)) &&
    MESH_PARAMETER_CHOICES[String(rule.node_num)]?.includes(rule.parameter));
}

export function validateMeshRule(input) {
  const node=finite(input.node_num);
  if(!names.has(node)) throw new Error('Choose a station shown on the Meshtastic dashboard');
  if(!MESH_PARAMETER_CHOICES[String(node)].includes(input.parameter))
    throw new Error('Choose a parameter shown for this station');
  const threshold=finite(input.threshold),enabled=input.enabled===true;
  if(input.parameter==='offline_hours') {
    if(!Number.isInteger(threshold)||threshold<1||threshold>168)
      throw new Error('Choose a delayed-station duration from 1 to 168 whole hours');
    return {node_num:node,station_name:names.get(node),parameter:'offline_hours',
      direction:'above',threshold,reset_value:0,enabled};
  }
  if(!['above','below'].includes(input.direction)) throw new Error('Choose above or below');
  const reset=finite(input.reset_value);
  if(threshold===null||reset===null) throw new Error('Threshold and recovery must be numbers');
  if(input.parameter==='battery_percent' &&
      (threshold<0||threshold>100||reset<0||reset>100))
    throw new Error('Battery percentages must be between 0 and 100');
  if(input.direction==='above'?reset>=threshold:reset<=threshold)
    throw new Error('Choose a lower recovery value for above alerts, or a higher one for below alerts');
  return {node_num:node,station_name:names.get(node),parameter:input.parameter,
    direction:input.direction,threshold,reset_value:reset,enabled};
}

export function meshReadingValue(reading,parameter) {
  if(!reading||!isMeshRule({node_num:reading.node_num,parameter})) return null;
  if(parameter==='offline_hours') return null; // A scheduled check handles no-packet events.
  if(parameter==='rssi_dbm'||parameter==='snr_db') {
    // RF values shown in the dashboard are associated with measured packets.
    if(!['environment','mx2001','rock_test'].includes(reading.telemetry_type)) return null;
    return finite(reading.radio?.[parameter==='rssi_dbm'?'rssi':'snr']);
  }
  if(parameter==='temperature_c' &&
      !['environment','mx2001','rock_test'].includes(reading.telemetry_type)) return null;
  return readingValue(reading,parameter);
}
