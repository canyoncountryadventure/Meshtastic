function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function calculateDischarge(stageValue, curve) {
  const stage = finite(stageValue);
  const a = finite(curve?.coefficient_a);
  const offset = finite(curve?.stage_offset_ft);
  const exponent = finite(curve?.exponent_b);
  if (stage === null || a === null || offset === null || exponent === null) return null;
  if (stage <= offset) return 0;
  const result = a * Math.pow(stage - offset, exponent);
  return Number.isFinite(result) ? Number(result.toFixed(3)) : null;
}

export function rateReading(reading, curve) {
  if (!reading || !['water_distance', 'mx2001'].includes(reading.telemetry_type) || !curve) return reading;
  if (reading.metrics?.stage_calibrated === false) return reading;
  const stage = finite(reading.metrics?.water_level_ft);
  const discharge = calculateDischarge(stage, curve);
  if (stage === null || discharge === null) return reading;

  const minimum = finite(curve.valid_stage_min_ft);
  const maximum = finite(curve.valid_stage_max_ft);
  const status = minimum !== null && stage < minimum ? 'extrapolated_low' :
    maximum !== null && stage > maximum ? 'extrapolated_high' : 'within_measured_range';

  return {
    ...reading,
    discharge_cfs: discharge,
    discharge_rating_status: status,
    rating_curve_version: Number(curve.curve_version),
  };
}

export function rateReadings(readings, curves) {
  const byNode = new Map((curves || []).map(curve => [Number(curve.node_num), curve]));
  return (readings || []).map(reading => rateReading(reading, byNode.get(Number(reading.node_num))));
}
