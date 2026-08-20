# Meshtastic Water Telemetry

Vercel + Neon dashboard for water-monitoring telemetry carried over Meshtastic.

## Current working paths

### CCS1 — HOBO MX2001 water level + temperature

```text
HOBO MX2001
  -> BLE
CCS1 field node
  -> Meshtastic PRIVATE_APP / LoRa mesh
Slickrock Hydro gateway
  -> laptop bridge today; Heltec V4 Wi-Fi gateway planned
Vercel /api/ingest
  -> Neon MeshtasticDB
Vercel dashboard
```

The MX2001 integration stores:

- water level in feet
- temperature in F and C
- logger MAC
- measurement sequence
- BLE RSSI
- LoRa RSSI and SNR
- hop count when available
- last-relay metadata when available
- raw source metadata

### CCS2 and CCS3 — HOBO MX2201 temperature

CCS2 and CCS3 use standard Meshtastic environmental telemetry and feed the same `/api/ingest` endpoint and Neon table as CCS1.

The production dashboard supports all three stations:

- CCS1 — MX2001 water level + temperature
- CCS2 — MX2201 water temperature
- CCS3 — MX2201 water temperature

Each station has its own current status, recent readings, history charts, LoRa RSSI/SNR, hop information, and station-specific query path. CCS1 also shows MX2001 water level and BLE RSSI.

## Vercel project

Production project: `meshtastic`

Production dashboard:

`https://meshtastic-ecru.vercel.app`

Required environment variables:

- `DATABASE_URL` - Neon Postgres connection string
- `INGEST_KEY` - secret required by `/api/ingest`
- `STATION_NAME` - optional fallback station label for standard telemetry

## Database

Neon project: `MeshtasticDB`

Database: `neondb`

Primary table: `public.telemetry_readings`

The schema intentionally stores flexible `metrics`, `radio`, and `raw` JSONB objects so additional sensors can use the same ingestion path without creating a new table for every sensor type.

## MX2001 ingest format

`POST /api/ingest`

Authentication header:

```text
X-Ingest-Key: <INGEST_KEY>
```

Example:

```json
{
  "type": "mx2001",
  "from": 3257761772,
  "station_name": "CCS1",
  "payload": {
    "water_level_ft": 1.3,
    "temperature_f": 81.4,
    "temperature_c": 27.44,
    "logger_mac": "F1:0D:9D:29:C3:2D",
    "sequence": 13,
    "ble_rssi_dbm": -83
  },
  "radio": {
    "rssi": -25,
    "snr": 6.0,
    "hops_away": 0
  }
}
```

## Windows live gateway

The universal firmware branch contains:

`tools/hobo_cloud_gateway.py`

Current gateway command:

```powershell
py .\hobo_cloud_gateway.py --port COM11 --gateway-name "Slickrock Hydro"
```

The Windows gateway is the current development bridge. The planned permanent home gateway can perform the same internet uplink using the Heltec V4.
