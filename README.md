# Hidden Valley Meshtastic Temperature Station

Production Vercel + Neon dashboard and station-health monitoring for the **Hidden Valley Repeater (HVRP)** and its HOBO **MX2201** temperature logger.

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
Vercel dashboard + station-health endpoint
```

## Dashboard measurements

The production dashboard is dedicated to Hidden Valley and shows:

- latest MX2201 temperature;
- temperature history and selected-window high, low and average;
- temperature trend;
- packet age and hourly packet-delivery reliability;
- LoRa RSSI and SNR;
- hop count and average hops;
- node battery voltage and percent when device telemetry is received;
- battery history and battery change;
- estimated solar-charging behavior inferred from battery-voltage increases;
- longest telemetry gap and packet count.

The MX2201 logger is configured for a **1-hour logging interval**, so the dashboard expects one temperature reading per hour.

## Monitoring / missed-reading alert

The station-health endpoint is:

```text
GET /api/station-health
```

It evaluates the newest Hidden Valley temperature reading against the hourly logger cadence. The station becomes alerting when the latest reading is **3 hours 15 minutes old**, representing three consecutive expected hourly readings missed plus a 15-minute grace period.

The endpoint returns the latest temperature, battery/voltage when available, RSSI, SNR, hop count, packet age, estimated missed-reading count, and an `alert` boolean.

Email alerting is handled outside the ingest path so a notification failure cannot interfere with telemetry storage.

## Cloud filtering and row model

The production ingest path is intentionally restricted to Hidden Valley node `1436900584`. Unrelated public Meshtastic telemetry is ignored.

Environmental temperature is the primary hourly record. HVRP device telemetry (battery, voltage, uptime and utilization) is merged into the nearby temperature row rather than stored as a duplicate standalone dashboard row.

Neon:

```text
Project: MeshtasticDB
Database: neondb
Table: public.telemetry_readings
```

## Rock-moisture experiment separation

The Navajo sandstone moisture experiment is **not part of production `main`**. Its final pre-repurpose state is preserved separately on:

```text
archive/rock-moisture-2026-08-27
```

Rock calibration and override files should remain on that archive branch and should not be reintroduced into the Hidden Valley production branch.

## Ingest API

```text
POST /api/ingest
X-Ingest-Key: <INGEST_KEY>
```

Read endpoint:

```text
GET /api/readings
```

The database keeps flexible `metrics` and `radio` JSON so temperature, battery and RF-link statistics can share the same time-series row.

## Firmware separation

Remote HVRP HOBO firmware:

```text
Repository: canyoncountryadventure/firmware
Branch:     hobo-mx2001-mx2201-mx2203
```

Home Heltec HTTP gateway firmware:

```text
Repository: canyoncountryadventure/firmware
Branch:     heltec-home-http-gateway-hidden-valley
```

The older `heltec-home-http-gateway-rock` branch is historical. New Hidden Valley gateway work should use the clean Hidden Valley branch above.
