# Meshtastic Environmental Network

Production Vercel + Neon dashboard for five permanent temperature stations: **Hidden Valley Repeater**, **Heltec Home**, **Fishlake Hightop**, **It's a Swell Day**, and **Seed (aka Moab)**.

Production dashboard:

```text
https://meshtastic-ecru.vercel.app
```

## Permanent stations

### Hidden Valley Repeater

```text
Meshtastic name: Hidden Valley Repeater
Short name:      HVRP
Node number:     3044869407
Meshtastic ID:   !b57d051f
Hardware:        RAK WisBlock 4631
Sensor:          HOBO MX2201 over BLE
Coordinates:     38.53880, -109.54090
Elevation:       5,800 ft
Mode:            automatic remote HOBO telemetry
HOBO interval:   3600 sec at last field check
Battery:         device/battery telemetry stored and graphed
```

**Identity warning:** `!55a55ce8 / 1436900584` is not Hidden Valley and is not accepted as a production live station. A historical manual HOBO workbook backfill was previously stored under that old number before the identity error was discovered. The dashboard recognizes only those verified manual-backfill rows when reconstructing Hidden Valley temperature history; it does not attribute RF or battery metadata from that node to Hidden Valley.

### Heltec Home

```text
Meshtastic name: Heltec Home
Node number:     2740603892
Meshtastic ID:   !a35a4bf4
Hardware:        Heltec V4 OLED
Mode:            automatic local HOBO BLE read + internet gateway
Cloud role:      normal synchronized batch trigger
Battery:         not used for station battery analytics
```

### Fishlake Hightop

```text
Meshtastic name: Fishlake Hightop
Short name:      FLHT
Node number:     1577197109
Meshtastic ID:   !5e021e35
Hardware:        RAK4631 / WisBlock
Coordinates:     38.60727, -111.73972
Elevation:       11,600 ft
Mode:            Heltec-triggered remote HOBO READ polling
Battery:         device/battery telemetry accepted and graphed when received
```

### It's a Swell Day

```text
Meshtastic name: It's a Swell Day
Short name:      SWRP
Node number:     1949224949
Meshtastic ID:   !742ecff5
Hardware:        RAK WisBlock 4631
Sensor:          HOBO over BLE
Coordinates:     38.54279, -110.49269
Elevation:       6,000 ft
Mode:            automatic remote HOBO telemetry
Battery:         device/battery telemetry accepted and graphed when received
```

### Seed (aka Moab)

```text
Meshtastic name: Seed
Short name:      SEED
Node number:     2650172798
Meshtastic ID:   !9df66d7e
Hardware:        Seeed XIAO nRF52840 + Wio-SX1262 (XIAO_NRF52_KIT)
Sensor:          HOBO MX2201 over BLE
Coordinates:     38.553861, -109.524222
Elevation:       5,100 ft
Mode:            automatic remote HOBO telemetry
Battery:         device/battery telemetry accepted and graphed when received
```

## Messaging channels

Production channel order is:

```text
channel 0: LayMesh
channel 1: LongFast
```

Logical Meshtastic channel index and the underlying LoRa RF slot/frequency are separate settings. Matching LayMesh/LongFast channel order and PSKs does not by itself prove two radios are tuned to the same RF frequency.

## Data and batching path

```text
Hidden Valley telemetry ---------> held remote queue --+
It's a Swell Day telemetry ------> held remote queue --+
Seed telemetry -------------------> held remote queue --+
Fishlake timed READ result ------> held remote queue --+
remote device/battery telemetry -> held remote queue --+
                                                        |
Home HOBO -> BLE -> Heltec Home -----------------------+--> one HTTPS batch
                                                             |
                                                             v
                                                        Vercel /api/ingest
                                                             |
                                                             v
                                                        Neon PostgreSQL
                                                             |
                                                             v
                                                           dashboard
```

The **local Home HOBO environmental reading is the normal cloud batch trigger**. No remote station is a required trigger for another station.

If Home does not generate a successful trigger, the gateway performs a **70-minute safety flush** of held readings so Hidden Valley, Swell, Fishlake, and Seed cannot become stranded behind a failed local sensor. Failed batches are retried and remote observation timestamps/RF metadata are retained.

The gateway remote hold queue is 48 readings. The Vercel ingest endpoint accepts batches up to 64 readings so a full hold queue plus the Home trigger fits safely.

## Dashboard behavior

The production dashboard compares all five permanent stations and includes temperature history, 12-hour trends, selected-window high/low/average, packet reliability, recent readings, RSSI/SNR and route metadata for remote stations, battery/device telemetry, and an interactive map.

The default history window is **30 days**, rather than 24 hours, so a temporary ingest outage or an older Fishlake reading does not make existing station history appear deleted. The current-health badges still use the latest observation time and mark stale stations appropriately.

The map currently includes:

- Hidden Valley at 38.53880, -109.54090 · 5,800 ft
- Fishlake Hightop at 38.60727, -111.73972 · 11,600 ft
- It's a Swell Day at 38.54279, -110.49269 · 6,000 ft
- Seed (aka Moab) at 38.553861, -109.524222 · 5,100 ft
- approximate Heltec Home location

## Cloud filtering and row model

Production ingest accepts only configured permanent station nodes and ignores unrelated public Meshtastic environmental/device telemetry before database work.

Configured live nodes:

```text
3044869407  Hidden Valley Repeater  !b57d051f
2740603892  Heltec Home             !a35a4bf4
1577197109  Fishlake Hightop        !5e021e35
1949224949  It's a Swell Day        !742ecff5
2650172798  Seed (aka Moab)         !9df66d7e
```

Temperature is the primary environmental record. Remote-station device/battery telemetry is merged with the nearby environmental cycle when possible so temperature, battery, voltage, and radio metadata can be presented together.

Neon:

```text
Project: MeshtasticDB
Database: neondb
Table: public.telemetry_readings
```

## Firmware

Gateway and field-node firmware are maintained in `canyoncountryadventure/firmware`.

Current Heltec gateway branch:

```text
cca-heltec-sensor-gateway
```

Current universal RAK/Seeed HOBO branch:

```text
hobo-mx2001-mx2201-mx2203
```

The Heltec V4 production build preserves Wi-Fi Unified OTA. Routine updates use the regular `firmware-heltec-v4-*.bin`; do not use a factory image and do not erase NVS/configuration for a normal OTA update.

## Rock-moisture experiment separation

The Navajo sandstone moisture experiment is **not part of production `main`**. Its final pre-repurpose state is preserved on:

```text
archive/rock-moisture-2026-08-27
```

Rock calibration/runtime files remain separate from the permanent environmental network.
