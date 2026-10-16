import { mkdir,copyFile,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'watersheds');
for(const d of ['api','lib'])await mkdir(path.join(out,d),{recursive:true});
for(const [src,dst] of [['watershed.html','index.html'],['watershed.css','watershed.css'],['watershed.js','watershed.js'],['api/watershed-readings.js','api/watershed-readings.js'],['api/db.js','api/db.js'],['lib/watershed-store.js','lib/watershed-store.js'],['lib/watershed-rating.js','lib/watershed-rating.js'],['watershed-alerts.html','notifications.html'],['watershed-alerts.css','watershed-alerts.css'],['watershed-alerts.js','watershed-alerts.js'],['lib/watershed-alerts-proxy.js','api/watershed-alerts.js'],['lib/alerts.js','lib/alerts.js'],['lib/alert-values.js','lib/alert-values.js'],['api/rating-curves.js','api/rating-curves.js'],['package.json','package.json'],['package-lock.json','package-lock.json']])await copyFile(path.join(root,src),path.join(out,dst));
await writeFile(path.join(out,'vercel.json'),JSON.stringify({rewrites:[{source:'/watershed',destination:'/index.html'},{source:'/notifications',destination:'/notifications.html'}],functions:{'api/*.js':{maxDuration:30}}},null,2)+'\n');
