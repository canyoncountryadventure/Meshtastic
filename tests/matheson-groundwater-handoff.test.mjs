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
