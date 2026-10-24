# Meshtastic Environmental Network

Production [dashboard](https://meshtastic-ecru.vercel.app/) and Vercel/Neon ingest for the authorized mesh sensor nodes. Device identity is the **unsigned Meshtastic node number**; the Heltec forwards only approved node IDs and packet types. Canonical public display names are assigned by the Vercel API and dashboard, not the field-node short name or Heltec firmware.

## Email alerts

Open [Email alerts](https://meshtastic-ecru.vercel.app/alerts) from the dashboard header. Owner access uses the dedicated `ALERTS_ADMIN_KEY` environment variable, not the radio's ingest credential. Sessions last eight hours in a Secure, HttpOnly, SameSite cookie. `ALERTS_ENCRYPTION_KEY` encrypts the email provider credential in Neon; preserve it when redeploying.

The Meshtastic notification page is scoped to **Hidden Valley, Moab, Fishlake Hightop, and SMLA**, with station-specific temperature, battery, radio-signal, and delayed-station options. Creek and relay alerts are configured separately through [Moab Watersheds notifications](https://seutahwatersheds.vercel.app/notifications). Older Pack Creek defaults in the historical 20261014 migration no longer appear in the Meshtastic alert interface. Connect Resend using a sending API key and a verified sender email in the Email service section, then use Send test. Credentials never appear in the public page, GET response, or repository. No emails are sent until a provider and recipients are configured.

Each successful ingest evaluates fresh, calibrated measurements using the existing active rating curve, and atomically records a threshold crossing plus one queued email per recipient. Exactly 10 cfs does not trigger. A reading must fall below 9 cfs before another high-flow alert. Missing values, uncalibrated ultrasonic measurements, readings over three hours old, future timestamps beyond five minutes, and readings at or before the last evaluated timestamp are ignored. Discharge emails include the stage, rating version and extrapolation status. Saving settings rearms that rule for the next measurement observed after the save.

Email delivery uses a durable outbox, row locking, independent recipient retries and Resend idempotency keys. Up to four queued deliveries are attempted on each ingest or test request. Failed deliveries retry on subsequent telemetry after five minutes, with at most ten attempts and a 23-hour expiry to stay inside provider deduplication limits. Delivery does not depend on someone opening the dashboard. Meshtastic has its own 30-minute authenticated GitHub Actions station heartbeat to check no-packet rules and dispatch pending email. It reuses the existing /api/alerts serverless endpoint to stay within the Vercel Hobby function limit. This scheduler uses only neondb and does not modify the separate Moab Watersheds station rules. History labels `sent` as accepted by the provider, not confirmation of inbox delivery. Disabled/deleted rules or removed recipients cancel unsent messages. Alert errors do not reject stored telemetry.

Apply `migrations/20261014-email-alerts.sql` before deploying this feature. Run `node --test tests/alerts.test.mjs` for validation and auth checks. Run `ALERT_TEST_DATABASE_URL=<isolated branch URL> node tests/alerts-integration.mjs` only on a disposable Neon branch: it changes alert tables in that branch and mocks outbound email. It tests the real rating curve, strict crossing, concurrency, hysteresis, stale packets, encryption, delivery retry and cancellation.

## Active station identities

| Display name | Node ID | Decimal node number | Data |
|---|---|---:|---|
| SMLA | !fccdcc93 | 4241345683 | Temperature and device telemetry |
| Hidden Valley | !b57d051f | 3044869407 | Formerly Revived; temperature (°F) and battery (%) card |
| Moab (Heltec) | !a35a4bf4 | 2740603892 | Local HOBO BLE temperature and gateway |
| Fishlake Hightop | !5e021e35 | 1577197109 | HOBO temperature |
| It's a Swell Day | !742ecff5 | 1949224949 | MX2001 stage/temperature and SEN0313 stage |
| Cottonwood Creek (CC01) | !65165646 | 1695962694 | MB water stage and MX2001 stage/temperature |
| Cottonwood Relay (CC02) | !9093c167 | 2425602407 | Device battery and radio-link telemetry |
| Thousand Lake Mountain | !9df66d7e | 2650172798 | HOBO temperature |

The former Soil Moisture / Rock Moisture radio `!77788479` has been repurposed as **Matheson Groundwater** on Moab Watersheds. The main Meshtastic dashboard no longer shows its old soil-moisture card or comparison option. This UI change does not modify historical observations, ingestion routing, or Matheson Groundwater data.

Pack Creek telemetry is retired. Its node `!c9f9f6e7` is acknowledged without storing new readings. Historical Pack Creek telemetry is deleted, while the stage–discharge curve and five rating points remain in `rating_curves` and `rating_curve_points`. SMLA's repurposed-node readings are retained. The former Revived radio is now Hidden Valley; the old Hidden Valley `!4aab9211` is hidden from the dashboard while stored history is retained. Readings before its October 5 repurposing are excluded from current health checks.

## Packet path

Field-node measurements → Meshtastic LoRa mesh → Heltec Gateway v4 → HTTPS POST to \`/api/ingest\` → Neon, based on the source node number:

- **Pack Creek** (1949224949), **Cottonwood Creek / CC01** (1695962694), and **Cottonwood Relay / CC02** (2425602407) write **only to \`moab_watersheds.creek_observations\`**. This table preserves original raw packets, sensor and radio metadata; the site reads it directly. The main Meshtastic history and station-health APIs use a read-only compatibility view in \`moab_watersheds\` for explicitly requested creek stations.
- **All other authorized radios** write to **\`neondb.telemetry_readings\`**.

The two databases belong to the same Neon project. There is no telemetry mirroring or background reconciliation. A database CHECK constraint prevents accidentally writing the three watershed nodes into \`neondb.telemetry_readings\`. Watershed-specific alerts, station settings and water-quality results remain in \`moab_watersheds\`. Main alert/rating **configuration** is preserved; it is not a second copy of sensor measurements. Swell Day MX2001 and SEN0313 readings are kept as separate sensor series. Pack Creek rating records remain available for future use.

The Heltec accepts these source packets **only from approved nodes**:

- HOBO standard environmental temperature (\`TELEMETRY_APP\`) and MX2001 custom \`MX\` stage/temperature packets.
- Device/battery telemetry.
- RAK SEN0308 soil raw \`SM\` version 1: 8 bytes, moisture %, ADC10, sequence. The soil firmware additionally broadcasts standard soil-moisture telemetry; the gateway stores the raw \`SM\` packet to avoid duplicating each measurement.
- Water-distance \`DS\` version 1: 24 bytes including raw distance, calibrated-stage validity, stage in millimeters, and sequence. **An uncalibrated or invalid stage is not presented as a measured creek level.**
- Legacy \`RK\` moisture/PIR packets from the previously approved nodes, where present.

The Heltec does not have to be renamed to track the field-node names. It uploads the numeric \`from\` identifier and sensor values; Vercel assigns \`station_name\` from its authoritative mapping.

The current Heltec branch is [Heltec-Gateway-v4](https://github.com/canyoncountryadventure/firmware/tree/Heltec-Gateway-v4). It is built by the GitHub Actions workflow [Build Heltec Gateway v4](https://github.com/canyoncountryadventure/firmware/actions/workflows/build_cca_heltec_gateway.yml). A completed successful run publishes \`downloads/Heltec-Gateway-v4.zip\` on the firmware repository's \`field-self-recovery\` branch. **Do not flash a binary from an older run** expecting it to have the new station allowlist.

The production gateway build injects \`HOBO_HTTP_GATEWAY_INGEST_KEY\` from the GitHub Actions secret. Keep that secret out of source control. For a normal Wi-Fi Unified OTA update, use the regular non-factory Heltec V4 application image; do not erase Meshtastic NVS and do not use the factory image.

## Dashboard behavior

Cottonwood Creek and Swell Day each have independent ultrasonic stage, MX2001 stage, and MX2001 temperature controls. The comparison graph keeps sensor stage series separate. Cottonwood Relay displays battery and radio-link status without requiring a temperature logger. Pack Creek has no live telemetry card; its rating records are retained. The former Soil Moisture card was removed after its radio was repurposed as Matheson Groundwater on Moab Watersheds.

Pack Creek rating curve version 1 is \`Q = 6.07187614 × (H − 0.22259098)^1.04237977\`, where \`H\` is calibrated stage in feet and \`Q\` is discharge in cubic feet per second. Its measured stage range is 0.2444–0.6904 ft; API responses identify values outside that range as extrapolated.

Known existing map coordinates are preserved. Precise locations for Pack Creek1, Wingate Moisture, and Cliff Sensor must be confirmed before they are added to the station map; no location is inferred from an informal node name.

The [watershed presentation page](https://meshtastic-ecru.vercel.app/watershed) is separate from the live telemetry dashboard; its example upper/lower creek dataset is not production sensor data.

## Verification

After installing the updated Heltec binary, check:

1. Hidden Valley uses !b57d051f (formerly Revived); !4aab9211 is excluded from dashboard cards and comparisons.
2. Cottonwood Creek and Swell Day temperature and calibrated stage reach \`/api/readings\` as \`environment\`/\`mx2001\` and \`water_distance\` as appropriate.
3. Soil's \`SM\` packet becomes a single \`soil\` record containing \`soil_moisture_percent\`; approved HOBO temperature becomes an \`environment\` or \`mx2001\` record.
4. \`/api/station-health\` shows the ten configured stations; the dashboard labels reflect those node IDs.
