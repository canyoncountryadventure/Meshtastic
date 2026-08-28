# Archived Sensor Calibration Values

Archived before the Meshtastic dashboard was repurposed for the Hidden Valley MX2201 temperature station.

**Archive date:** 2026-08-27  
**Source:** production `dashboard.js` in this repository / Vercel deployment

## Sandstone moisture calibration

The production dashboard used the following reference points:

| Reference | ADC |
|---|---:|
| Dry reference | **2303** |
| Water reference | **1386** |

When a packet did not provide its own calibration values, relative wetness was calculated as:

```text
wetness % = (dry_adc - current_adc) * 100 / (dry_adc - wet_adc)
```

using `dry_adc = 2303` and `wet_adc = 1386`, clamped to 0–100%.

Lower ADC values were interpreted as wetter sandstone.

## Moisture-state thresholds

| State | ADC rule |
|---|---|
| DRY | `ADC >= 2303` |
| TRANSITION | `2000 <= ADC < 2303` |
| DAMP | `1713 <= ADC < 2000` |
| WET | `1600 <= ADC < 1713` |
| SOAKED | `1451 <= ADC < 1600` |
| WATER | `ADC < 1451` |

## Wetting / drying trend calibration

The production dashboard also overrode the instantaneous moisture band when a sustained trend was detected.

| Parameter | Value |
|---|---:|
| Trend window | **10 minutes** |
| Minimum span required | **9 minutes** |
| Minimum absolute ADC change | **8 ADC** |
| Minimum slope magnitude | **0.8 ADC/minute** |

Interpretation:

- **WETTING:** slope `<= -0.8 ADC/min` and total change `<= -8 ADC`
- **DRYING:** slope `>= +0.8 ADC/min` and total change `>= +8 ADC`

## Original production constants

```js
const TEMP_DRY_ADC=2303;
const TEMP_WATER_ADC=1386;
const TREND_WINDOW_MS=10*60*1000;
const TREND_MIN_SPAN_MS=9*60*1000;
const TREND_MIN_ABS_CHANGE=8;
const TREND_MIN_SLOPE_ADC_PER_MIN=0.8;
```

These values are preserved here so the prior sandstone calibration can be recovered even though the live Vercel dashboard is being replaced.