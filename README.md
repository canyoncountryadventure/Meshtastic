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
  -> laptop Python bridge today; Heltec V4 Wi-Fi gateway planned
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

The production dashboard currently supports all three stations:

- CCS1 — MX2001 water level + temperature
- CCS2 — MX2201 water temperature
- CCS3 — MX2201 water temperature

Each station has its own current status, recent readings, history charts, LoRa RSSI/SNR, hop information, and station-specific query path. CCS1 also shows MX2001 water level and BLE RSSI.

> **Temporary frontend:** the current CCS1/CCS2/CCS3 dashboard layout is only a bench/testing interface. It will be redesigned once the permanent radio locations, station names, deployment roles, and monitoring sites are decided. Do not treat the current visual layout or station presentation as the final field dashboard design.

## Windows / VS Code live gateway

The universal firmware repository contains:

`C:\Meshtastic-HOBO\firmware\tools\hobo_cloud_gateway.py`

VS Code itself is not the modem or server. The **RAK connected on COM11 is the Meshtastic radio modem**, and the **Python process running on the Windows laptop is the serial-to-HTTPS cloud bridge**. It listens to packets received by the RAK and POSTs supported HOBO telemetry to Vercel.

The bridge accepts both:

- MX2001 `PRIVATE_APP` packets on Meshtastic port 256
- MX2201/MX2203 standard `TELEMETRY_APP` packets on port 67

### Start the laptop cloud bridge

Open a PowerShell terminal in VS Code or Windows Terminal and run:

```powershell
cd C:\Meshtastic-HOBO\firmware\tools
py .\hobo_cloud_gateway.py --port COM11 --gateway-name "Slickrock Hydro"
```

Expected startup includes:

```text
UNIVERSAL HOBO MESHTASTIC CLOUD GATEWAY
Serial radio: COM11
Cloud:        https://meshtastic-ecru.vercel.app/api/ingest
Gateway:      Slickrock Hydro
Accepts:      MX2001 PRIVATE_APP + MX2201/MX2203 TELEMETRY_APP
```

If the script prompts for the Vercel ingest key, enter the existing `INGEST_KEY`. Do not store the key in this repository.

### Find the COM port

```powershell
py -m serial.tools.list_ports
```

Current bench mapping during validation:

- COM11 — Slickrock Hydro RAK gateway used by `hobo_cloud_gateway.py`
- COM7 — CCS1 bench USB serial connection during troubleshooting

Only one process can own a COM port at a time.

### Stop the cloud bridge

Press:

```text
Ctrl+C
```

Stopping `hobo_cloud_gateway.py` only stops the laptop-to-Vercel upload path. The HOBO loggers continue logging and the Meshtastic radios continue operating over LoRa. No new cloud rows will be created from the COM11 laptop bridge until the script is restarted.

The laptop bridge is temporary. The planned permanent gateway is a Heltec V4 using Wi-Fi so the Windows computer and continuously running Python process are no longer required.

## Critical Meshtastic rebroadcast setting

A bench failure on 2026-08-19 was caused by the Slickrock Hydro RAK being configured as:

```text
device.rebroadcast_mode = 5
CORE_PORTNUMS_ONLY
```

CCS2 and CCS3 still worked because their MX2201 data uses standard Meshtastic `TELEMETRY_APP` port 67. CCS1 appeared broken because MX2001 uses custom/private port 256, which was filtered by `CORE_PORTNUMS_ONLY` before the laptop gateway could receive it.

CCS1 itself was functioning correctly: it detected the MX2001 record boundary, read the logger, created the packet, and transmitted it over LoRa. The failure was downstream at the gateway rebroadcast setting.

### Check the gateway setting

Stop any program currently using COM11, then run:

```powershell
py -m meshtastic --port COM11 --get device.rebroadcast_mode
```

The failing value was:

```text
device.rebroadcast_mode: 5
```

### Correct it

```powershell
py -m meshtastic --port COM11 --set device.rebroadcast_mode ALL
```

Verify:

```powershell
py -m meshtastic --port COM11 --get device.rebroadcast_mode
```

Correct result:

```text
device.rebroadcast_mode: 0
```

For this mixed environmental network, infrastructure nodes that may need to relay MX2001 private-port traffic should use:

```text
Rebroadcast Mode = ALL
```

This includes Slickrock Hydro, future intermediate relays that carry CCS1 traffic, and the planned Heltec V4 gateway. A relay left on `CORE_PORTNUMS_ONLY` can block MX2001 traffic even when the final gateway is configured correctly.

## Serial troubleshooting commands

To monitor a USB-connected field node without loading the Meshtastic PlatformIO project configuration:

```powershell
cd C:\
& "$env:USERPROFILE\.platformio\penv\Scripts\platformio.exe" device monitor -p COM7 -b 115200
```

Alternative:

```powershell
py -m serial.tools.miniterm COM7 115200
```

This was used to prove CCS1/MX2001 automatic operation independently of the cloud path.

## Vercel project

Production project: `meshtastic`

Production dashboard:

`https://meshtastic-ecru.vercel.app`

Required environment variables:

- `DATABASE_URL` - Neon Postgres connection string
- `INGEST_KEY` - secret required by `/api/ingest`
- `STATION_NAME` - optional fallback station label for standard telemetry

### Current Vercel/backend edits

The August 19 multi-station bench update changed the frontend and reading API so the same deployment can display CCS1, CCS2, and CCS3.

Files changed:

- `index.html`
  - changed the single-MX2001 page into a selectable three-station shell
  - added CCS1/CCS2/CCS3 station cards and shared station/status panels
- `dashboard.css`
  - added the current temporary multi-station styling and responsive layout
- `dashboard.js`
  - added explicit station definitions for CCS1, CCS2, and CCS3
  - CCS1 renders MX2001 water level + temperature + BLE RSSI
  - CCS2 and CCS3 render MX2201 temperature plus LoRa/network information
  - selecting a station reloads data specifically for that node
  - added per-station status thresholds based on expected logger interval
  - added station-specific trend/history rendering
- `api/readings.js`
  - added `node` filtering so the frontend can request one station directly
  - added `bucket_minutes` support for longer history windows
  - longer histories are sampled/bucketed so CCS2's fast logging rate does not crowd CCS1/CCS3 out of a fixed-size response
  - retained the same Neon `telemetry_readings` table and existing ingest architecture

The live frontend currently uses station-specific queries rather than downloading a mixed set of thousands of rows and filtering all stations only in the browser.

The production deployment was updated from GitHub `main` after the multi-station preview was tested.

### Current station IDs used by the temporary frontend

```text
CCS1 node_num = 3257761772   MX2001
CCS2 node_num =   87724616   MX2201
CCS3 node_num = 1527161333   MX2201
```

These labels and the current UI are expected to change when permanent field sites are chosen.

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
