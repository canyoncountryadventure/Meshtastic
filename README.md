# Hidden Valley Meshtastic Temperature Station

Production Vercel + Neon dashboard and station-health monitoring for the **Hidden Valley Repeater (HVRP)** and its temperature sensor.

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
Temperature sensor interval: approximately 1 hour
Site coordinates: 38.53880, -109.5409
Site elevation: 5,800 ft
```

The repeater reads the temperature sensor over BLE and broadcasts temperature over Meshtastic. The home Heltec gateway receives the packet and forwards it to Vercel/Neon.

```text
Temperature sensor
    ↓ BLE
Hidden Valley Repeater / HVRP
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

The production dashboard is dedicated to Hidden Valley and shows temperature history, a 12-hour trend, selected-window high/low/average, packet reliability, RSSI/SNR, mesh routing, repeater battery/voltage, estimated solar charging behavior, interactive charts, and an interactive site map with topographic/satellite layers and a RAK4631 planning overlay.

## Monitoring / missed-reading alert

`GET /api/station-health` evaluates the newest Hidden Valley temperature reading. The station becomes alerting when the latest reading is **3 hours 15 minutes old**, representing three expected hourly readings missed plus a 15-minute grace period.

## Cloud filtering and row model

The production ingest path is intentionally restricted to Hidden Valley node `1436900584`. Unrelated public Meshtastic telemetry is ignored. Temperature is the primary record; HVRP battery/device telemetry is merged into the nearby temperature row.

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

Rock calibration/runtime files must remain off the Hidden Valley production branch.

## Firmware separation

Remote repeater sensor firmware and the home Heltec HTTP gateway firmware are maintained separately in `canyoncountryadventure/firmware`. New home-gateway work should use:

```text
heltec-home-http-gateway-hidden-valley
```

The older rock-named home-gateway branch is historical.
