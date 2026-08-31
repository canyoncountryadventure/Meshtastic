# Meshtastic Environmental Network

Production Vercel + Neon dashboard and station-health monitoring for three permanent temperature stations: **Hidden Valley Repeater**, **Heltec Home**, and **Fishlake Hightop**.

Production dashboard:

```text
https://meshtastic-ecru.vercel.app
```

## Permanent stations

### Hidden Valley Repeater

```text
Meshtastic name: Hidden Valley Repeater
Short name:      HVRP
Node number:     1436900584
Meshtastic ID:   !55a55ce8
Coordinates:     38.53880, -109.54090
Elevation:       5,800 ft
Mode:            automatic remote HOBO telemetry
Battery:         device/battery telemetry stored and graphed
```

### Heltec Home

```text
Meshtastic name: Heltec Home
Node number:     2740603892
Meshtastic ID:   !a35a4bf4
Hardware:        Heltec V4
Mode:            automatic local HOBO BLE read + internet gateway
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
Mode:            remote HOBO telemetry; Heltec can also trigger READ polling
Battery:         device/battery telemetry accepted and graphed when received
```

## Data paths

```text
Hidden Valley HOBO
    ↓ BLE
Hidden Valley RAK
    ↓ LoRa / Meshtastic

Fishlake HOBO
    ↓ BLE
Fishlake Hightop RAK
    ↓ LoRa / Meshtastic

Home HOBO
    ↓ BLE
Heltec Home

remote mesh packets + local Home reading
    ↓
Heltec Home gateway
    ↓ HTTPS
Vercel /api/ingest
    ↓
Neon PostgreSQL
    ↓
Vercel dashboard + station-health endpoint
```

## Dashboard measurements

The production dashboard compares all three permanent stations and includes temperature history, 12-hour trends, selected-window high/low/average, packet reliability, recent readings, RSSI/SNR and route metadata for remote stations, and an interactive map.

The map includes:

- Hidden Valley at 38.53880, -109.54090 · 5,800 ft
- Fishlake Hightop at 38.60727, -111.73972 · 11,600 ft
- approximate Heltec Home location

Hidden Valley and Fishlake both support battery/device telemetry. Their battery views include latest battery state, voltage history, voltage change, and estimated solar activity when enough voltage samples are available.

## Monitoring / missed-reading alert

`GET /api/station-health` monitors permanent remote station freshness. Fishlake and Hidden Valley are expected to report on their configured telemetry cadence; stale/missed-reading status is exposed through the production health endpoint.

## Cloud filtering and row model

Production ingest accepts only configured permanent station nodes and ignores unrelated public Meshtastic telemetry.

Configured nodes:

```text
1436900584  Hidden Valley Repeater
2740603892  Heltec Home
1577197109  Fishlake Hightop
```

Temperature is the primary environmental record. Remote-station device/battery telemetry is merged with the nearby environmental cycle when possible so temperature, battery, voltage, and radio metadata can be presented together.

Neon:

```text
Project: MeshtasticDB
Database: neondb
Table: public.telemetry_readings
```

## Rock-moisture experiment separation

The Navajo sandstone moisture experiment is **not part of production `main`**. Its final pre-repurpose state is preserved on:

```text
archive/rock-moisture-2026-08-27
```

Rock calibration/runtime files remain separate from the permanent environmental network.

## Firmware separation

Remote station firmware and the home Heltec gateway firmware are maintained in `canyoncountryadventure/firmware`.

Current Home gateway work uses:

```text
cca-heltec-sensor-gateway
```

Current RAK HOBO mesh work uses:

```text
hobo-mx2001-mx2201-mx2203-rak4631
```
