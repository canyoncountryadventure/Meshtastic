# Meshtastic Environmental Network

Production [dashboard](https://meshtastic-ecru.vercel.app/) and Vercel/Neon ingest for the authorized mesh sensor nodes. Device identity is the **unsigned Meshtastic node number**; the Heltec forwards only approved node IDs and packet types. Canonical public display names are assigned by the Vercel API and dashboard, not the field-node short name or Heltec firmware.

## Active station identities

| Display name | Node ID | Decimal node number | Data |
|---|---|---:|---|
| Hidden Valley | !4aab9211 | 1252758033 | HOBO temperature (MX2001; stage may be present in the source packet but is not displayed for this station) |
| Pack Creek | !fccdcc93 | 4241345683 | Temperature and water level/stage |
| Wingate Moisture | !77788479 | 2004386937 | Soil moisture (%) and ADC10; **not** temperature or PIR |
| Cliff Sensor | !c9f9f6e7 | 3388602087 | HOBO temperature |
| Moab (Heltec) | !a35a4bf4 | 2740603892 | Local HOBO BLE temperature and gateway |
| Fishlake Hightop | !5e021e35 | 1577197109 | HOBO temperature |
| It's a Swell Day | !742ecff5 | 1949224949 | HOBO temperature |
| Thousand Lake Mountain | !9df66d7e | 2650172798 | HOBO temperature |

The retired Hidden Valley **!b57d051f / 3044869407** is removed from the live Heltec allowlist, ingest allowlist, dashboard, and station-health checks. Existing historical rows are retained in Neon for audit purposes but are not merged into the replacement station's charts, battery statistics, or RF history.

## Packet path

Field-node measurements → Meshtastic LoRa mesh → Heltec Gateway v2 → HTTPS POST to \`/api/ingest\` → Neon \`telemetry_readings\` → \`/api/readings\` → dashboard. Pack Creek calibrated SEN0313 stage is converted to discharge with the active versioned rating curve stored in Neon.

The Heltec accepts these source packets **only from approved nodes**:

- HOBO standard environmental temperature (\`TELEMETRY_APP\`) and MX2001 custom \`MX\` stage/temperature packets.
- Device/battery telemetry.
- RAK SEN0308 soil raw \`SM\` version 1: 8 bytes, moisture %, ADC10, sequence. The soil firmware additionally broadcasts standard soil-moisture telemetry; the gateway stores the raw \`SM\` packet to avoid duplicating each measurement.
- Water-distance \`DS\` version 1: 24 bytes including raw distance, calibrated-stage validity, stage in millimeters, and sequence. **An uncalibrated or invalid stage is not presented as a measured creek level.**
- Legacy \`RK\` moisture/PIR packets from the previously approved nodes, where present.

The Heltec does not have to be renamed to track the field-node names. It uploads the numeric \`from\` identifier and sensor values; Vercel assigns \`station_name\` from its authoritative mapping.

The current Heltec branch is [Heltec-Gateway-v2](https://github.com/canyoncountryadventure/firmware/tree/Heltec-Gateway-v2). It is built by the GitHub Actions workflow [Build Heltec Gateway v2](https://github.com/canyoncountryadventure/firmware/actions/workflows/build_cca_heltec_gateway.yml). A completed successful run publishes \`downloads/Heltec-Gateway-v2.zip\` on the firmware repository's \`field-self-recovery\` branch. **Do not flash a binary from an older run** expecting it to have the new station allowlist.

The production gateway build injects \`HOBO_HTTP_GATEWAY_INGEST_KEY\` from the GitHub Actions secret. Keep that secret out of source control. For a normal Wi-Fi Unified OTA update, use the regular non-factory Heltec V4 application image; do not erase Meshtastic NVS and do not use the factory image.

## Dashboard behavior

The existing five stations remain visible, with the replacement Hidden Valley mapped exclusively to !4aab9211. Pack Creek has separate temperature, stage, and calculated discharge values, Wingate Moisture displays only soil moisture, and Cliff Sensor displays temperature. The temperature comparison includes the seven temperature-capable stations, while soil moisture and calibrated stage have dedicated graphs. The historical view depends on the selected time window. A reading that has not reached Neon is displayed as unavailable, not simulated or inferred.

Pack Creek rating curve version 1 is \`Q = 6.07187614 × (H − 0.22259098)^1.04237977\`, where \`H\` is calibrated stage in feet and \`Q\` is discharge in cubic feet per second. Its measured stage range is 0.2444–0.6904 ft; API responses identify values outside that range as extrapolated.

Known existing map coordinates are preserved. Precise locations for Pack Creek1, Wingate Moisture, and Cliff Sensor must be confirmed before they are added to the station map; no location is inferred from an informal node name.

The [watershed presentation page](https://meshtastic-ecru.vercel.app/watershed) is separate from the live telemetry dashboard; its example upper/lower creek dataset is not production sensor data.

## Verification

After installing the updated Heltec binary, check:

1. A new Hidden Valley measurement is accepted under !4aab9211; the retired ID is rejected.
2. Pack Creek temperature and calibrated stage reach \`/api/readings\` as \`environment\`/\`mx2001\` and \`water_distance\` as appropriate.
3. Soil's \`SM\` packet becomes a single \`soil\` record containing \`soil_moisture_percent\`; Cliff Sensor temperature becomes an \`environment\` or \`mx2001\` record.
4. \`/api/station-health\` shows the eight configured stations; the dashboard labels reflect those node IDs.
