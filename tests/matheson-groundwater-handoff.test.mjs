import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const script=fs.readFileSync(new URL('../watersheds/watershed-sensors-20261022-v12.js',import.meta.url),'utf8');
const page=fs.readFileSync(new URL('../watersheds/index.html',import.meta.url),'utf8');

test('Matheson joins the Rugged TROLL and MX2001 on the top-of-casing reference',()=>{
 assert.match(script,/MATHESON_TROLL_SENSOR_DEPTH_TOC_FT=35\.30/);
 assert.match(script,/MATHESON_MX_FINAL_SENSOR_DEPTH_TOC_FT=18\.25/);
 assert.match(script,/MATHESON_MX_FINAL_INSTALLED_AT=Date\.parse\('2026-10-23T21:35:00Z'\)/);
 assert.match(script,/\['rugged_troll','mx2001'\]\.includes\(r\.telemetry_type\)/);
 assert.match(script,/type:'groundwater_handoff'/);
 assert.match(page,/historical In-Situ Rugged TROLL 100 and current HOBO MX2001 records are joined/);
});

test('field validation values use the surveyed MX2001 reference',()=>{
 assert.equal(Number((18.25-12.09).toFixed(2)),6.16);
 assert.equal(Number(Math.abs(6.16-6.15).toFixed(2)),0.01);
 assert.match(script,/Manual depth 6\.15 ft; MX2001 implied 6\.16 ft/);
});

test('Matheson public display leads with elevation and includes land surface and inception history',()=>{
 assert.doesNotMatch(page,/data-metric="depth"/);
 assert.doesNotMatch(page,/id="depthBelowCasingCard"/);
 assert.match(page,/data-metric="elevation"[^>]*>Water-surface elevation/);
 assert.match(page,/data-hours="1000000"[^>]*>Since inception/);
 assert.match(script,/MATHESON_LAND_SURFACE_ELEVATION_FT=3966\.78/);
 assert.match(script,/Land surface · 3,966\.78 ft/);
 assert.match(script,/highest in late winter and early spring/);
 assert.match(script,/warmest in winter and coolest in late spring to early summer/);
});

test('Matheson omits pre-installation MX telemetry without inventing a datum',()=>{
 assert.doesNotMatch(script,/MATHESON_MX_INITIAL_SENSOR_DEPTH_TOC_FT|26\.50/);
 assert.match(script,/r\.telemetry_type==='mx2001'&&new Date\(r\.observed_at\)\.getTime\(\)<MATHESON_MX_FINAL_INSTALLED_AT/);
 assert.match(script,/s\.type==='groundwater_handoff'&&prev\.r\.telemetry_type!==p\.r\.telemetry_type/);
 assert.match(script,/installation field reading/);
 assert.match(script,/data in this database begin Nov\. 25, 2025/);
});

test('Cottonwood Relay displays Elk Ridge on station detail',()=>{
 assert.match(script,/name:'Cottonwood Relay',detail:'Elk Ridge · 7,900 ft'/);
 assert.match(page,/<option value="2425602407">Cottonwood Relay<\/option>/);
});
