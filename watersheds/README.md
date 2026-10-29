# Southeastern Utah Watersheds

Production monitoring site: https://seutahwatersheds.vercel.app.

## Unified telemetry (October 28, 2026)

The canonical Postgres telemetry database is **moab_watersheds** in Neon project **MeshtasticDB**. The Heltec gateway now writes each approved station packet once to `moab_watersheds.creek_observations`. The old `neondb.telemetry_readings` database is retained read-only as a safety copy, not as a second telemetry destination.

On October 28, 2026, all **5,604** historical records in `neondb.telemetry_readings` were copied to `moab_watersheds.creek_observations`. The import verified 5,604 unique archive packet keys, preserved observed/received timestamps, raw payloads and station names, and kept old historical names for reused radios. The root gateway and standalone dashboard were deployed to Vercel. New Moab packets were verified arriving directly into `moab_watersheds` after cutover.

Active stations: Pack Creek, South Cottonwood, Cottonwood Relay, Cottonwood Relay 2 (!48d70845), Mini Me (!fccdcc93, formerly SMLA), Matheson Groundwater, Mill Creek (Power Dam), Hidden Valley, Fishlake Hightop, Moab, Seed Relay 1, and Thousand Lake Mountain. Three retired/historical radio IDs are retained for historical inspection without enabling offline alarms. Historical station identities Rock Moisture, Wingate Moisture and Revived are retained on individual observation records even where a radio node number was later reused.

Database migration: `../migrations/20261029_unified_se_utah_telemetry.sql`. It adds `packet_id` and per-observation `station_name`, registers the station roster, and updates the read-only compatibility view. A permanent unique packet-ID index guards against duplicated new deliveries. The migration is intentionally non-destructive; legacy backfill is separately executed using `archive:neondb:<original id>` keys.

The standalone site's current source is directly under `/watersheds`, not the outdated repository-root watershed asset versions. `node tools/prepare-watersheds.mjs` is now validation-only so it cannot overwrite newer production pages. The Vercel project `seutahwatersheds` is deployed from GitHub `canyoncountryadventure/Meshtastic` using root directory `watersheds`.

Observation cards retain independent sensor timestamps. Only Pack Creek has an established discharge rating curve; Mill Creek and South Cottonwood stage is shown without invented discharge. Gateway control, alarms, public email permissions, and water-quality records remain in their existing watershed tables.

## Private stations
Moab, Seed Relay 1, Thousand Lake Mountain and Mini Me (!fccdcc93) appear only under the discreet PS login at the bottom of the monitoring page. Signed, short-lived owner sessions authorize data; public reading endpoints must not return these stations, even when directly queried by node number. Ingest, historical observations and owner-only battery/notification administration remain intact.

## Dedicated email notifications

The /notifications page manages only Moab Watersheds rules, recipients and email history in moab_watersheds. It uses the existing owner password with a separate scoped session cookie. The standalone API forwards only to Meshtastic /api/watershed-alerts; the gateway owns authentication and uses the configured sending service without copying its credentials. Watershed deliveries use their own provider idempotency prefix. Gateway ingest stores supported watershed measurements directly in moab_watersheds, evaluates watershed rules independently and queues/sends watershed alerts. No existing recipients are copied. Temperature rule entry and email content use Fahrenheit; stored evaluation uses Celsius. Relay rules permit air temperature, battery, and offline-duration alerts; Cottonwood Creek permits stage and water temperature; Pack Creek additionally permits estimated discharge.

Apply migrations/20261015_watershed_stations_alerts.sql to moab_watersheds before deploying this revision. Refresh standalone source with node tools/prepare-watersheds.mjs.

Battery percentage alerts use device telemetry (0–100%). Apply `migrations/20261015_watershed_battery.sql` to the dedicated database. The recovery value is the reading that must be passed before the next threshold crossing can send another alert.

The Water quality tab stores monthly grab samples in the same dedicated `moab_watersheds` database, but in separate `water_quality_sites` and `water_quality_samples` tables. Apply `migrations/20261017_water_quality.sql` before deployment. Five reported parameters are supported: E. coli, water temperature, specific conductivity, pH, and dissolved oxygen.

The initial two-year backfill contains accepted Utah DWQ results distributed through WQX and the Water Quality Portal. Source provider, station ID, activity IDs, coordinates, sample depth, and reporting qualifiers are retained in each record and CSV export. Concurrent E. coli replicates are summarized with a geometric mean. Ken's Lake field values use the shallowest reported profile depth, while E. coli uses the official South Beach station. Apply `migrations/20261017_water_quality_provenance.sql` to an existing installation before importing the backfill.

The complete Southeast Utah workbook supersedes the limited public-data view. Apply `migrations/20261018_water_quality_workbook.sql`, then import the workbook with `tools/build-water-quality-import.py`. Stations are keyed by MLID and have cleaned public names and map coordinates. The generalized record table stores all 33 workbook parameters in JSONB without inventing units missing from the source. The public page provides a street map, grouped parameter selector, time-series chart and complete CSV export.

## Direct telemetry storage cutover (2026-10-18)

Apply `migrations/20261018_watershed_direct_ingest.sql` to `moab_watersheds`. It creates a dedicated source-ID sequence (starting at 1,000,000,000,000 to avoid historical Meshtastic IDs), adds complete raw packet JSON, and exposes a read-only `telemetry_readings` view for the gateway health/history endpoints. The October 18 cutover backfilled and verified all 1,354 remaining watershed telemetry source records (1,353 Pack Creek and 1 CC02) before deleting them from neondb. New direct observation IDs use the dedicated sequence. Apply `migrations/20261018_neondb_watershed_exclusion.sql` to neondb only after completing and verifying the data transfer. Both website read APIs continue serving watershed station data without duplicate writes. Preserve pre-existing station settings, water quality, curves, and alerts. No radio reflashing or gateway changes are required.

## Public alerts and offline watchdog (October 20, 2026)

Apply `migrations/20261020_public_offline_alerts.sql` only in `moab_watersheds`. The owner page at `/notifications` retains password-protected access to every rule, recipient and email history. The public sign-in form requests a one-use verification email (20-minute expiry). Successful verification issues a signed, HttpOnly, same-site cookie for 30 days. Public users can create/edit/delete up to eight enabled or disabled notification rules, but the public API filters every rule lookup and mutation to `owner_email = verified_email`; it never returns admin rules or delivery history. Sending verification emails is throttled per recipient (10 minutes) and globally (60/hour). Reusing another person's numeric rule ID must not work.

Parameter `offline_hours` accepts 1–168 hours since the *last received packet* from that station, not the last plotted sensor point. One notification is queued on entering the offline state; it rearms only after fresh telemetry arrives. Trigger checks opportunistically during ingest, on the GitHub Actions authenticated 30-minute schedule (`.github/workflows/watershed-heartbeat.yml`), and on the authenticated daily Vercel fallback cron. GitHub OIDC bearer tokens are checked against the official signed JWKS and restricted to the project's exact main-branch workflow. Vercel `CRON_SECRET` is stored as a protected production environment variable. GitHub scheduled workflows can be delayed; exact-minute outage notifications are not guaranteed. The Meshtastic Vercel project is on Hobby, so hourly Vercel cron expressions are rejected.

Production deployments require both root (`meshtastic`) and nested (`seutahwatersheds`) projects at matching Git commits. The standalone `/api/watershed-public` forwards only the public subscription session cookie and never the admin cookie. Never expose the owner GET rule/history payload to anonymous or public-session users. Verify public login, rule isolation, and a recovery/outage lifecycle before considering the alert path operational. No historical stage/temperature graphs or sensor readings were modified for this alert feature.
