# Meshtastic Water Telemetry

Vercel + Neon dashboard for water-monitoring telemetry carried over Meshtastic.

## Current working paths

### HOBO MX2001 water level + temperature

```text
HOBO MX2001
  -> BLE
RAK4631 field node
  -> Meshtastic PRIVATE_APP / LoRa mesh
Meshtastic gateway radio
  -> USB receiver today; Heltec V4 Wi-Fi gateway planned
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

The dashboard is stage-first and displays current water level, water temperature, packet freshness, mesh hops, LoRa signal, BLE signal, recent readings, and a water-level history graph.

### HOBO MX2201 legacy path

The earlier standard Meshtastic environmental-temperature path remains supported by `/api/ingest` and the same database table.

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
  "from": 3044869407,
  "sender": "!b57d051f",
  "station_name": "MX2001 Field Test",
  "payload": {
    "water_level_ft": 0.9,
    "temperature_f": 80.1,
    "temperature_c": 26.72,
    "logger_mac": "F1:0D:9D:29:C3:2D",
    "sequence": 125,
    "ble_rssi_dbm": -65
  },
  "radio": {
    "rssi": -111,
    "snr": -14.25,
    "hops_away": 2
  }
}
```

## Windows live gateway

The MX2001 firmware branch contains:

`tools/mx2001_receiver.py`

Normal local-only mode:

```powershell
py .\mx2001_receiver.py --port COM5
```

Cloud mode:

```powershell
py .\mx2001_receiver.py --port COM5 --cloud --station "MX2001 Field Test"
```

Cloud mode securely prompts for the existing Vercel `INGEST_KEY` unless `MESHTASTIC_INGEST_KEY` is already set in the environment.

The Windows gateway is a development bridge. The planned permanent home gateway can perform the same HTTP upload directly from a Wi-Fi-capable Meshtastic device such as the Heltec V4.
