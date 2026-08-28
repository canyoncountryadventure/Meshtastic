# Hidden Valley Meshtastic Temperature Station

Production Vercel + Neon dashboard for the **Hidden Valley Repeater (HVRP)** and its HOBO **MX2201** temperature logger.

Production dashboard:

```text
https://meshtastic-ecru.vercel.app
```

## Current field station

```text
Meshtastic name: Hidden Valley Repeater
Short name:      HVRP
Node number:     1436900584
Meshtastic ID:   !55a55ce8
HOBO model:      MX2201
Logger MAC:      E4:27:8C:B9:F4:B8
Logger interval: 1 hour
```

The mountaintop RAK reads the MX2201 over BLE and broadcasts the temperature over Meshtastic. The home Heltec gateway receives the packet and forwards it to Vercel/Neon.

```text
HOBO MX2201
    ↓ BLE
Hidden Valley RAK / HVRP
    ↓ LoRa / Meshtastic
mesh / relays as needed
    ↓
Heltec Hub at home
    ↓ HTTPS
Vercel /api/ingest
    ↓
Neon PostgreSQL
    ↓
Vercel dashboard
```

## Dashboard measurements

The current dashboard is dedicated to Hidden Valley and is designed to show:

- latest MX2201 temperature;
- temperature history and 24-hour / selected-window high, low and average;
- temperature trend;
- packet age and hourly packet-delivery reliability;
- LoRa RSSI and SNR;
- hop count and average hops;
- strongest/weakest observed link;
- node battery voltage and percent when device telemetry is received;
- battery history and 24-hour battery change;
- an **estimated solar-charging-hours** statistic inferred from sustained battery-voltage increases (not a direct solar irradiance measurement);
- longest telemetry gap and packet count.

The MX2201 logger itself is configured for a **1-hour logging interval**, so the dashboard treats one temperature reading per hour as the expected cadence.

## Cloud filtering

The production ingest path is intentionally restricted to the Hidden Valley node (`1436900584`). Standard MX2201 environmental telemetry and Hidden Valley device/battery telemetry are retained; unrelated public Meshtastic telemetry is ignored.

Neon:

```text
Project: MeshtasticDB
Database: neondb
Table: public.telemetry_readings
```

## Archived sandstone calibration

The previous Navajo sandstone moisture experiment calibration was preserved before the dashboard was repurposed.

**See:** [`CALIBRATION_VALUES.md`](./CALIBRATION_VALUES.md)

That file contains the final live production calibration anchors, moisture bands, wetness-index formula, and wetting/drying trend logic. It should be treated as the recovery/reference record for that experiment.

## Ingest API

```text
POST /api/ingest
X-Ingest-Key: <INGEST_KEY>
```

Read endpoint:

```text
GET /api/readings
```

The database keeps flexible `metrics` and `radio` JSON so temperature, battery, and RF-link statistics can share the same time-series table without another schema migration.

## Gateway source

The universal HOBO gateway is maintained in:

```text
Repository: canyoncountryadventure/firmware
Branch:     hobo-mx2001-mx2201-mx2203
File:       tools/hobo_cloud_gateway.py
```

It handles MX2001 private packets plus MX2201/MX2203 environmental telemetry. The Hidden Valley dashboard also supports device telemetry from HVRP so battery and solar-trend statistics can be stored when the gateway forwards those packets.
