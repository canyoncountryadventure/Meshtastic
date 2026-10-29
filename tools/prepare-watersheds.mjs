// SE Utah Watersheds is a separately maintained production app in /watersheds.
// Earlier versions of this script copied obsolete root-level dashboard files
// and could silently overwrite newer station configuration. Do not do that.
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const required=[
 'watersheds/index.html',
 'watersheds/api/watershed-readings.js',
 'watersheds/lib/watershed-store.js',
 'watersheds/watershed-sensors-20261026-v27.js',
 'watersheds/vercel.json',
];
for(const file of required) await access(path.join(root,file));
console.log('SE Utah Watersheds standalone assets verified. No outdated files were overwritten.');
console.log('Edit /watersheds files directly; deploy the Vercel seutahwatersheds project from that directory.');
