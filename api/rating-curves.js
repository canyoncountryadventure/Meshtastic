const PACK_CREEK_NODE = 4241345683;
const PACK_CREEK_NAME = 'Pack Creek';
const PACK_CREEK_CURVE_VERSION = 1;
const PACK_CREEK_RESET_CUTOFF = '2026-09-25T21:43:23.000Z';
const PACK_CREEK_RESET_MIGRATION = '20260925_pack_creek_reset_v1';

let databaseReadyPromise;

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function prepareRatingCurveTables(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS app_migrations (
      migration_key TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      details JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS rating_curves (
      node_num BIGINT NOT NULL,
      station_name TEXT NOT NULL,
      curve_version INTEGER NOT NULL,
      equation_type TEXT NOT NULL,
      coefficient_a DOUBLE PRECISION NOT NULL,
      stage_offset_ft DOUBLE PRECISION NOT NULL,
      exponent_b DOUBLE PRECISION NOT NULL,
      valid_stage_min_ft DOUBLE PRECISION NOT NULL,
      valid_stage_max_ft DOUBLE PRECISION NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      source_notes TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (node_num, curve_version)
    )
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS rating_curves_one_active_per_node_idx
      ON rating_curves (node_num)
      WHERE active
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS rating_curve_points (
      node_num BIGINT NOT NULL,
      curve_version INTEGER NOT NULL,
      measurement_date DATE NOT NULL,
      measurement_time_local TEXT,
      stage_ft DOUBLE PRECISION NOT NULL,
      observed_discharge_cfs DOUBLE PRECISION,
      final_discharge_cfs DOUBLE PRECISION NOT NULL,
      point_type TEXT NOT NULL,
      included BOOLEAN NOT NULL DEFAULT TRUE,
      notes TEXT,
      PRIMARY KEY (node_num, curve_version, stage_ft),
      FOREIGN KEY (node_num, curve_version)
        REFERENCES rating_curves (node_num, curve_version)
        ON DELETE CASCADE
    )
  `;
}

async function storePackCreekCurve(sql) {
  await sql`
    UPDATE rating_curves
    SET active = FALSE, updated_at = NOW()
    WHERE node_num = ${PACK_CREEK_NODE}
      AND curve_version <> ${PACK_CREEK_CURVE_VERSION}
      AND active
  `;

  await sql`
    INSERT INTO rating_curves
      (node_num, station_name, curve_version, equation_type,
       coefficient_a, stage_offset_ft, exponent_b,
       valid_stage_min_ft, valid_stage_max_ft, active, source_notes)
    VALUES
      (${PACK_CREEK_NODE}, ${PACK_CREEK_NAME}, ${PACK_CREEK_CURVE_VERSION}, 'power_offset',
       6.07187614, 0.22259098, 1.04237977,
       0.2444, 0.6904, TRUE,
       'Five finalized Pack Creek Lower rating points; April 27 discharge modeled to 2.75 cfs while preserving the 2.3905 cfs field value.')
    ON CONFLICT (node_num, curve_version) DO UPDATE SET
      station_name = EXCLUDED.station_name,
      equation_type = EXCLUDED.equation_type,
      coefficient_a = EXCLUDED.coefficient_a,
      stage_offset_ft = EXCLUDED.stage_offset_ft,
      exponent_b = EXCLUDED.exponent_b,
      valid_stage_min_ft = EXCLUDED.valid_stage_min_ft,
      valid_stage_max_ft = EXCLUDED.valid_stage_max_ft,
      active = EXCLUDED.active,
      source_notes = EXCLUDED.source_notes,
      updated_at = NOW()
  `;

  await sql`
    INSERT INTO rating_curve_points
      (node_num, curve_version, measurement_date, measurement_time_local,
       stage_ft, observed_discharge_cfs, final_discharge_cfs,
       point_type, included, notes)
    VALUES
      (${PACK_CREEK_NODE}, ${PACK_CREEK_CURVE_VERSION}, '2026-04-27', '10:59 MDT',
       0.6904, 2.3905, 2.7500, 'modeled_adjustment', TRUE,
       'Observed discharge retained; final value modeled because the field value was inconsistent with the accepted stage-discharge pattern.'),
      (${PACK_CREEK_NODE}, ${PACK_CREEK_CURVE_VERSION}, '2026-05-19', '09:20 MDT',
       0.6849, 2.7163, 2.7163, 'observed', TRUE, 'Accepted Survey123 manual discharge.'),
      (${PACK_CREEK_NODE}, ${PACK_CREEK_CURVE_VERSION}, '2026-06-24', '17:15 MDT',
       0.2623, 0.1973, 0.1973, 'observed', TRUE, 'Accepted Survey123 manual discharge.'),
      (${PACK_CREEK_NODE}, ${PACK_CREEK_CURVE_VERSION}, '2026-07-29', '15:40 MDT',
       0.2444, 0.1235, 0.1235, 'observed', TRUE, 'Accepted Survey123 manual discharge.'),
      (${PACK_CREEK_NODE}, ${PACK_CREEK_CURVE_VERSION}, '2026-09-25', NULL,
       0.4500, 1.3000, 1.3000, 'observed', TRUE,
       'Initial permanent-station measurement; MX2001 stage 0.45 ft and manual discharge 1.3 cfs.')
    ON CONFLICT (node_num, curve_version, stage_ft) DO UPDATE SET
      measurement_date = EXCLUDED.measurement_date,
      measurement_time_local = EXCLUDED.measurement_time_local,
      observed_discharge_cfs = EXCLUDED.observed_discharge_cfs,
      final_discharge_cfs = EXCLUDED.final_discharge_cfs,
      point_type = EXCLUDED.point_type,
      included = EXCLUDED.included,
      notes = EXCLUDED.notes
  `;
}

async function resetPackCreekTestData(sql) {
  return sql`
    WITH claimed AS (
      INSERT INTO app_migrations (migration_key, details)
      VALUES (
        ${PACK_CREEK_RESET_MIGRATION},
        jsonb_build_object(
          'expected_deleted_rows', 59,
          'preserved_from_utc', ${PACK_CREEK_RESET_CUTOFF},
          'reason', 'Removed pre-installation Pack Creek test telemetry'
        )
      )
      ON CONFLICT (migration_key) DO NOTHING
      RETURNING migration_key
    ),
    deleted AS (
      DELETE FROM telemetry_readings
      WHERE (node_num = ${PACK_CREEK_NODE} OR station_name = ${PACK_CREEK_NAME})
        AND observed_at < ${PACK_CREEK_RESET_CUTOFF}::timestamptz
        AND EXISTS (SELECT 1 FROM claimed)
      RETURNING id
    )
    SELECT COUNT(*)::integer AS deleted_rows FROM deleted
  `;
}

async function prepareDatabase(sql) {
  await prepareRatingCurveTables(sql);
  await storePackCreekCurve(sql);
  await resetPackCreekTestData(sql);
}

export function ensureDatabaseReady(sql) {
  if (!databaseReadyPromise) {
    databaseReadyPromise = prepareDatabase(sql).catch(error => {
      databaseReadyPromise = null;
      throw error;
    });
  }
  return databaseReadyPromise;
}

export async function getActiveRatingCurves(sql, node = null) {
  if (node === null) {
    return sql`
      SELECT node_num, station_name, curve_version, equation_type,
             coefficient_a, stage_offset_ft, exponent_b,
             valid_stage_min_ft, valid_stage_max_ft
      FROM rating_curves
      WHERE active
    `;
  }
  return sql`
    SELECT node_num, station_name, curve_version, equation_type,
           coefficient_a, stage_offset_ft, exponent_b,
           valid_stage_min_ft, valid_stage_max_ft
    FROM rating_curves
    WHERE active AND node_num = ${node}
  `;
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
  if (!reading || reading.telemetry_type !== 'water_distance' || !curve) return reading;
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
