# CCA Meshtastic Environmental Telemetry

Vercel + Neon backend/dashboard for CCA environmental monitoring data transported over Meshtastic.

## Current architecture

```text
Field sensor / HOBO logger
    -> Seeed / Meshtastic field node
    -> LoRa mesh
    -> Heltec WiFi LoRa 32 V4 OLED
    -> Wi-Fi / HTTPS
    -> Vercel /api/ingest
    -> Neon PostgreSQL
    -> Vercel dashboard
```

The Heltec is now the permanent direct HTTP gateway. MQTT and a continuously running laptop bridge are not required for this path.

Production dashboard:

```text
https://meshtastic-ecru.vercel.app
```

Neon:

```text
Project: MeshtasticDB
Database: neondb
Table: public.telemetry_readings
```

## Monitoring paths

### MX2001 water level + temperature

The established MX2001 path uses a 19-byte `PRIVATE_APP` packet beginning with ASCII `MX` and stores:

- water level / stage;
- temperature F/C;
- raw temperature value;
- HOBO BLE MAC;
- measurement sequence;
- BLE RSSI;
- LoRa RSSI/SNR/hops/relay/channel metadata.

The production ingest source filter described below deliberately **does not restrict `mx2001` by CCS3 node number**, so the existing water-level monitoring architecture continues to work.

### CCS3 Navajo sandstone experiment

Current experiment node:

```text
CCS3 node_num = 1527161333
```

CCS3 sends:

- `rock_test` packets from the Grove capacitive probe on D0/A0;
- PIR state and motion count from D6;
- standard environmental temperature telemetry from the paired MX2201;
- battery voltage/percent after the corrected Seeed firmware is flashed;
- LoRa receive metadata added by the Heltec.

## Sandstone source filter

A 2026-08-26 audit found that the promiscuous Heltec correctly heard public environmental telemetry from unrelated Meshtastic nodes. Two unrelated temperature records entered Neon before filtering was added, including `Meshtastic 7421` (`!61f17421`, 45.69 C / 114.2 F).

`api/ingest.js` now restricts these experiment types to CCS3 (`1527161333`):

```text
telemetry
rock
rock_test
sandstone
motion
```

Other nodes receive an HTTP 202 / `stored:false` response and are not inserted into the experiment database stream.

`mx2001` remains exempt so the water-level pipeline is preserved.

The frontend independently filters its display to CCS3 as a second layer of protection.

## `LOCK` is not a database-source command

The Seeed DM command:

```text
LOCK
```

stores the currently identified **HOBO BLE MAC**. It prevents the field node from switching to another HOBO logger during discovery.

It does not control which Meshtastic nodes the Heltec hears or which nodes Vercel accepts. Cloud source filtering is enforced by `/api/ingest`.

## Temporary rock/moisture calibration

Until the Navajo sandstone calibration is complete, the dashboard uses the earlier bench/soil observations:

| Condition | Approx. ADC |
|---|---:|
| Really dry | 2303 |
| Dry / slightly damp | 1999 |
| Wet soil | 1712 |
| Pure water | 1386 |

Temporary classes:

```text
DRY      >= 2303
DRYING   2000–2302
DAMP     1713–1999
WET      1387–1712
WATER    <= 1386
```

Temporary relative wetness index:

```text
0%   = ADC 2303
100% = ADC 1386
```

This is a relative test index, not volumetric water content and not yet a climb/no-climb rule. It will be replaced by the actual Navajo sandstone dry/wet/climbability calibration.

### Validated water response

During the 2026-08-26 test, the probe was stable before immersion at approximately:

```text
ADC 2328–2351
1.876–1.895 V
```

After immersion it stabilized at:

```text
ADC 1407 / 1.134 V
ADC 1407 / 1.134 V
ADC 1406 / 1.133 V
```

The values were preserved correctly through Seeed -> LoRa -> Heltec -> Vercel -> Neon.

## Dashboard fixes — 2026-08-26

The original dashboard helper converted JavaScript `null` to zero because `Number(null) === 0`. That produced display-only false values such as:

```text
ADC 0
Wetness 0.0%
32.0 F
```

The corresponding Neon rows actually contained `NULL`/no measurement. The helper has been fixed so null, undefined, and empty values remain blank (`—`).

The current dashboard shows:

- rock condition;
- ADC;
- temporary wetness index;
- probe output voltage;
- MX2201 temperature;
- Motion Now;
- Last Motion age + timestamp;
- Last Clear age + timestamp;
- motion count;
- validated node battery voltage/percent;
- LoRa RSSI/SNR/hops;
- rock and temperature charts;
- CCS3-only experiment timeline.

### Motion timing

The updated Seeed rock firmware sends the normal 60-second RK packet plus an immediate RK packet on both PIR transitions:

```text
LOW -> HIGH = motion detected
HIGH -> LOW = motion clear
```

With the 100 ms PIR poll interval, the dashboard can derive Last Motion and Last Clear from actual state transitions instead of treating every periodic clear packet as a new clear event.

## Seeed battery bug and fix

Early rock rows showed impossible battery readings around 11–16 V / 100%.

Root cause: the rock module globally switched the nRF52840 ADC to 12-bit resolution, but the Seeed XIAO battery subsystem is calibrated for a 10-bit ADC. Battery voltage therefore read roughly four times too high.

Current firmware keeps the hardware ADC at the board's normal 10-bit setting and scales the averaged rock reading mathematically to the existing 0..4095 calibration scale. This preserves prior rock thresholds while leaving battery sensing correct.

The dashboard also rejects historical battery voltage values outside 2.5–5.0 V so known bad rows are not displayed as valid battery telemetry.

Firmware branch:

```text
CCA-MX-HOBO-PIR-ROCK-SEEED-v1
```

Key battery/motion fixes:

```text
501bd91d  initial ADC/battery correction
1021a453  eliminate ADC-resolution race
DC398892  immediate PIR detect/clear RK telemetry
```

A Seeed firmware reflash is required before corrected battery data and immediate PIR edge telemetry appear in new rows.

## Heltec gateway

Hardware:

```text
Heltec WiFi LoRa 32 V4 OLED
PlatformIO target: heltec-v4
```

The rock-capable gateway branch is:

```text
heltec-home-http-gateway-rock
```

The original MX2001-only branch remains:

```text
heltec-home-http-gateway
```

Both branches were corrected after a 2026-08-26 diagnostic found the HTTP gateway was mistakenly compile-gated to `HELTEC_V4_TFT` while the actual unit is the OLED V4.

## Heltec OTA / USB recovery reference

Normal Meshtastic TCP API:

```text
TCP 4403
```

Unified ESP32 OTA loader:

```text
TCP/UDP 3232
```

16 MB Heltec V4 partition locations used here:

```text
app0 = 0x10000   main Meshtastic application
app1 = 0x650000  Unified OTA loader
```

The OTA loader was repaired once over USB by writing `mt-esp32s3-ota.bin` only to `0x650000`. Do not use `erase_flash` for routine recovery because NVS contains the working Meshtastic/Wi-Fi configuration.

The Heltec local Vercel key belongs only in the git-ignored firmware file:

```text
src/modules/hobo_gateway_secrets.h
```

The key must match Vercel production `INGEST_KEY`.

## Ingest API

Endpoint:

```text
POST /api/ingest
```

Authentication:

```text
X-Ingest-Key: <INGEST_KEY>
```

Supported types currently include:

```text
telemetry
mx2001
rock
rock_test
sandstone
motion
```

The schema intentionally stores flexible `metrics`, `radio`, and `raw` JSON objects so new environmental sensors can use the same telemetry table without creating a separate table for each sensor family.
