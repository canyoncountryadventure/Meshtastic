# Moab Watersheds

Creek-only monitoring site at https://seutahwatersheds.vercel.app.

Registered stations: Pack Creek (1949224949), Cottonwood Creek (1695962694), and Cottonwood Relay (2425602407). The relay is the explicitly requested air-temperature station; other temperature-only mesh stations remain excluded. Uses a separate Postgres database **moab_watersheds**, with its own creek_stations, creek_observations, and creek_sync_state tables. This database shares the existing Neon compute/project but is a distinct database from Meshtastic's neondb.

Production hosts use the server-only WATERSHED_DATABASE_URL. The Meshtastic gateway routes Pack Creek, Cottonwood Creek (CC01), and Cottonwood Relay (CC02) telemetry directly into moab_watersheds.creek_observations. Other nodes write to neondb.telemetry_readings. There is no mirror or background reconciler, so only one original observation is stored per incoming creek packet. The watershed host reads moab_watersheds directly. The Meshtastic host routes explicitly requested creek histories/health through a compatible read-only telemetry_readings view in moab_watersheds.

Schema: ../migrations/20261014_moab_watersheds.sql. New creek stations must be explicitly registered in creek_stations and connected to ingest; they are not inferred from temperature telemetry. Frontend provides station selection and distinguishes creek water temperature from relay air temperature.

UI source: repository-root watershed.html, watershed.css, watershed.js. Run node tools/prepare-watersheds.mjs from the repository root after source edits to refresh the standalone deployment folder. Deploy Vercel project seutahwatersheds from this folder. Existing Meshtastic /watershed serves the same interface.

Observation cards keep independent sensor timestamps. Streamflow comes from calibrated SEN0313 stage and the copied rating curve. HOBO MX2001 temperature and reference stage remain independent. Charts have 24-hour, 7-day and 30-day windows, break at gaps longer than three hours, and CSV exports include UTC, Mountain Time, sensor and rating status. No simulated measurements or fabricated station coordinates.

## Dedicated email notifications

The /notifications page manages only Moab Watersheds rules, recipients and email history in moab_watersheds. It uses the existing owner password with a separate scoped session cookie. The standalone API forwards only to Meshtastic /api/watershed-alerts; the gateway owns authentication and uses the configured sending service without copying its credentials. Watershed deliveries use their own provider idempotency prefix. Gateway ingest stores supported watershed measurements directly in moab_watersheds, evaluates watershed rules independently and queues/sends watershed alerts. No existing recipients are copied. Temperature rule entry and email content use Fahrenheit; stored evaluation uses Celsius. Relay rules permit only air temperature; Cottonwood Creek permits stage and water temperature; Pack Creek additionally permits estimated discharge.

Apply migrations/20261015_watershed_stations_alerts.sql to moab_watersheds before deploying this revision. Refresh standalone source with node tools/prepare-watersheds.mjs.

Battery percentage alerts use device telemetry (0–100%). Apply `migrations/20261015_watershed_battery.sql` to the dedicated database. The recovery value is the reading that must be passed before the next threshold crossing can send another alert.

The Water quality tab stores monthly grab samples in the same dedicated `moab_watersheds` database, but in separate `water_quality_sites` and `water_quality_samples` tables. Apply `migrations/20261017_water_quality.sql` before deployment. Five reported parameters are supported: E. coli, water temperature, specific conductivity, pH, and dissolved oxygen.

The initial two-year backfill contains accepted Utah DWQ results distributed through WQX and the Water Quality Portal. Source provider, station ID, activity IDs, coordinates, sample depth, and reporting qualifiers are retained in each record and CSV export. Concurrent E. coli replicates are summarized with a geometric mean. Ken's Lake field values use the shallowest reported profile depth, while E. coli uses the official South Beach station. Apply `migrations/20261017_water_quality_provenance.sql` to an existing installation before importing the backfill.

The complete Southeast Utah workbook supersedes the limited public-data view. Apply `migrations/20261018_water_quality_workbook.sql`, then import the workbook with `tools/build-water-quality-import.py`. Stations are keyed by MLID and have cleaned public names and map coordinates. The generalized record table stores all 33 workbook parameters in JSONB without inventing units missing from the source. The public page provides a street map, grouped parameter selector, time-series chart and complete CSV export.

## Direct telemetry storage cutover (2026-10-18)

Apply `migrations/20261018_watershed_direct_ingest.sql` to `moab_watersheds`. It creates a dedicated source-ID sequence (starting at 1,000,000,000,000 to avoid historical Meshtastic IDs), adds complete raw packet JSON, and exposes a read-only `telemetry_readings` view for the gateway health/history endpoints. Historical Pack Creek readings must be fully backfilled and audited before deleting them from neondb. Preserve pre-existing station settings, water quality, curves, and alerts. No radio reflashing or gateway changes are required.
