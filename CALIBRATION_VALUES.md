# Archived Sensor Calibration Values

Archived before the Meshtastic dashboard was repurposed for the Hidden Valley MX2201 temperature station.

**Archive date:** 2026-08-27  
**Source:** production `dashboard.js`, `band-fix.js`, `trend-fix.js`, and `index.html` from the Vercel-connected `main` branch.

> Important: `band-fix.js` and `trend-fix.js` loaded after `dashboard.js` and overrode the older provisional calibration functions. The values below are the **final live production values** immediately before the dashboard reset.

## Final Navajo sandstone wetness calibration

Lower ADC = wetter sandstone.

### Calibration anchors

| Reference | ADC |
|---|---:|
| Dry baseline / 0% wetness | **2303** |
| Brief wetting / passing shower reference | **~2232** |
| Surface-wet cluster | **~2032 to ~2009** |
| Mostly soaked / prolonged penetration reference | **~1850** |
| Extreme saturation / 100% wetness | **1484** |

The live Sandstone Wetness Index was linear between the final dry and saturated anchors:

```text
wetness % = (2303 - current_adc) * 100 / (2303 - 1484)
```

The result was clamped to 0–100%.

This was explicitly a **relative Sandstone Wetness Index**, not volumetric water content.

## Final live moisture-state thresholds

These were the thresholds actually applied by `band-fix.js` on the production Vercel page:

| State | ADC rule |
|---|---|
| DRY | `ADC >= 2268` |
| BRIEF WETTING | `2126 <= ADC < 2268` |
| WET | `1935 <= ADC < 2126` |
| MOSTLY SOAKED | `1667 <= ADC < 1935` |
| EXTREMELY SATURATED | `ADC < 1667` |

## Final live wetting / drying trend logic

`trend-fix.js` replaced the older provisional slope threshold logic.

| Parameter | Final value |
|---|---:|
| Trend window | **10 minutes** |
| Minimum time span | **9 minutes** |
| Minimum net ADC change | **4 ADC** |

Interpretation:

- **WETTING:** ADC change over the qualifying window `<= -4`
- **DRYING:** ADC change over the qualifying window `>= +4`
- Otherwise no directional trend was reported.

The final override calculated slope for display, but **did not require a minimum slope magnitude** after the `trend-fix.js` override.

## Final production constants

From `band-fix.js`:

```js
const DRY_ADC = 2303;
const SATURATED_ADC = 1484;

if (adc >= 2268) return 'DRY';
if (adc >= 2126) return 'BRIEF WETTING';
if (adc >= 1935) return 'WET';
if (adc >= 1667) return 'MOSTLY SOAKED';
return 'EXTREMELY SATURATED';
```

From `trend-fix.js`:

```js
const WINDOW_MS = 10 * 60 * 1000;
const MIN_SPAN_MS = 9 * 60 * 1000;
const MIN_NET_CHANGE = 4;
```

## Superseded provisional values

The base `dashboard.js` still contained older fallback/provisional constants (`2303/1386`, older band cutoffs, and an 8-ADC / 0.8-ADC-per-minute trend threshold). Those values were **not the final displayed production calibration** because the two override scripts loaded afterward.

This file preserves the final field calibration so it can be recovered after the live dashboard is repurposed.