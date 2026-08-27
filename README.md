# CCA Meshtastic Environmental Telemetry

Vercel + Neon backend/dashboard for CCA environmental monitoring data transported over Meshtastic.

## Current architecture

```text
Field sensor / HOBO logger
    -> Seeed XIAO nRF52840 field node
    -> Meshtastic / LoRa mesh
    -> Heltec WiFi LoRa 32 V4 gateway
    -> Wi-Fi / HTTPS
    -> Vercel /api/ingest
    -> Neon PostgreSQL
    -> Vercel dashboard
```

The Heltec V4 is the permanent internet gateway. MQTT and a continuously running laptop bridge are not required for this path.

Production dashboard:

```text
https://meshtastic-ecru.vercel.app
```

For public no-login viewing, Vercel Deployment Protection should remain on **Standard Protection** rather than protecting production deployments.

Neon:

```text
Project: MeshtasticDB
Database: neondb
Table: public.telemetry_readings
```

## Current CCS3 sandstone experiment

Experiment node:

```text
Name: CCS3
node_num: 1527161333
Meshtastic ID: !5b0782f5
```

CCS3 currently provides:

- DFRobot/Grove-style capacitive rock moisture probe on D0/A0;
- SEN0171 PIR on D6;
- HOBO MX2201 temperature over BLE;
- battery voltage and percent;
- LoRa RSSI/SNR/hop metadata supplied by the Heltec gateway.

The field firmware sends normal rock telemetry about every 60 seconds. The cloud intentionally stores less often.

## Five-minute cloud sampling

As of 2026-08-26, CCS3 experiment telemetry is retained in Neon at **5-minute intervals**.

`api/ingest.js` keeps at most:

```text
1 rock/rock_test record per 5-minute bucket
1 environment/MX2201 temperature record per 5-minute bucket
```

The radio may continue transmitting every minute; Vercel returns `202 stored:false` for extra CCS3 packets that fall inside an already-filled 5-minute bucket.

`/api/readings` also defaults to a 5-minute sampling view. Existing higher-frequency records collected before this change are preserved.

This throttling applies to the CCS3 sandstone experiment. The established `mx2001` water-level path remains exempt.

## Source filtering

The Heltec can hear public Meshtastic telemetry from unrelated nodes, so the ingest endpoint filters experiment data before database insertion.

These experiment types are accepted only from CCS3 (`1527161333`):

```text
telemetry
rock
rock_test
sandstone
motion
```

Other nodes receive HTTP 202 / `stored:false` for those experiment types.

`mx2001` remains exempt so the existing water-level monitoring pipeline continues to work.

The dashboard independently filters its display to CCS3 as a second layer.

## Current Navajo sandstone moisture bands

The Vercel dashboard uses the current field-test bands below:

| State | ADC |
|---|---:|
| **DRY** | **2300 and above** |
| **DAMP** | **1850–2299** |
| **WET** | **1700–1849** |
| **SOAKED** | **1699 and below** |

Lower ADC means wetter rock.

### Direction labels

The dashboard separately evaluates recent ADC direction. A sustained falling ADC is labeled **WETTING** and a sustained rising ADC is labeled **DRYING**. Direction can temporarily override the static band in the headline.

The current direction override uses approximately a 10-minute window and requires a meaningful net ADC change to avoid reacting to normal sensor jitter.

### Important firmware/web distinction

The current Seeed firmware still contains older temporary `ROCK STATE` / `ROCK BANDS` thresholds. Those device-side labels have **not** yet been changed to the web thresholds above.

For the current sandstone experiment:

```text
Raw ADC = primary measurement
Vercel bands = current sandstone interpretation
Firmware ROCK STATE label = legacy temporary interpretation
```

Do not treat a differing firmware text label as a cloud-data error.

## Calibration references

Earlier bench/soil observations with the same sensor were approximately:

| Condition | Approx. ADC |
|---|---:|
| Air | ~2338 |
| Really dry soil | ~2303 |
| Dry / slightly damp soil | ~1999 |
| Wet soil | ~1712 |
| Pure water | ~1386 |

These values established the sensor direction: **higher ADC = drier; lower ADC = wetter**. They are reference observations, not volumetric water content.

The dashboard's relative wetness percentage is a separate test index based on the historical dry/water references unless a real dry/wet calibration is supplied by the packet. It should not be confused with the current four condition bands.

## Navajo sandstone yard test — 2026-08-26

Installed dry-rock calibration and sprinkler test timing:

```text
Sprinkler ON:   19:27 MDT
0.5 inch:       19:36 MDT
1.0 inch:       19:47 MDT
Water OFF:      19:49 MDT
```

During irrigation the installed sandstone-probe ADC moved downward from roughly the low 2300s into the 2200s, confirming that the embedded probe responds to wetting in Navajo sandstone.

The MX2201 temperature also dropped sharply during sprinkler exposure, providing an independent environmental response signal.

## Rock packet

The Seeed firmware broadcasts a 16-byte `PRIVATE_APP` packet beginning with ASCII `RK`, schema 1:

```text
0..1   'R','K'
2      schema version
3      bit0 = current RF-filtered PIR motion
4..5   averaged rock ADC, scaled 0..4095
6..7   sensor output mV
8..11  validated PIR rising-edge count since boot
12..13 battery mV
14     battery percent
15     calibrated wetness 0..100, or 255 if unavailable
```

The rock ADC is sampled using the XIAO's normal 10-bit ADC and mathematically scaled to 0..4095. The firmware does not globally switch the nRF52840 ADC to 12-bit because doing so previously corrupted battery-voltage readings.

## PIR behavior

The SEN0171 can false-trigger from the node's own LoRa transmissions. Current firmware applies RF-aware filtering:

- D6 uses the nRF52840 internal pulldown;
- a new HIGH pulse beginning during local LoRa TX is suppressed;
- a new HIGH pulse beginning within 15 seconds after observed local TX is suppressed;
- a suppressed HIGH stays suppressed until the physical PIR output returns LOW;
- a legitimate HIGH that began before TX remains valid.

Rock packets remain on the normal 60-second schedule; PIR edges no longer trigger immediate rock transmissions. Motion counts are therefore useful for coarse activity/visit detection, not exact people counting.

## Dashboard

The current dashboard shows:

- current sandstone condition;
- WETTING/DRYING direction when detected;
- rock ADC and probe voltage;
- relative wetness index;
- MX2201 temperature;
- motion state/count;
- battery voltage/percent;
- LoRa RSSI/SNR/hops;
- rock and temperature charts;
- 5-minute CCS3 experiment timeline.

Missing/null telemetry remains blank rather than being converted to false zero values.

## Ingest API

Endpoint:

```text
POST /api/ingest
```

Authentication:

```text
X-Ingest-Key: <INGEST_KEY>
```

Supported types:

```text
telemetry
mx2001
rock
rock_test
sandstone
motion
```

Read endpoint:

```text
GET /api/readings
```

The schema intentionally stores flexible `metrics`, `radio`, and `raw` JSON objects so additional environmental sensors can share the same telemetry table.

## Heltec gateway

Hardware:

```text
Heltec WiFi LoRa 32 V4 OLED
PlatformIO target: heltec-v4
```

Rock-capable gateway branch:

```text
heltec-home-http-gateway-rock
```

Original MX2001 branch:

```text
heltec-home-http-gateway
```

The Vercel ingest key belongs only in the git-ignored Heltec firmware secrets file:

```text
src/modules/hobo_gateway_secrets.h
```

Do not commit the production ingest key.

## Field firmware

Repository/branch:

```text
canyoncountryadventure/firmware
CCA-MX-HOBO-PIR-ROCK-SEEED-v1
```

Current custom release documented for this system:

```text
CCA-MX-PIR-ROCK-1.0.7
Meshtastic base 2.7.26
```

The firmware README on that branch contains the full DM command set, persistent calibration details, PIR RF-filter behavior, packet schema, and flashing information.
