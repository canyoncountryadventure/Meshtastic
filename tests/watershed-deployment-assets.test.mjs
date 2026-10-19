import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('each deployed watershed page references assets inside its own Vercel root', () => {
  for (const root of [repo, path.join(repo, 'watersheds')]) {
    const htmlFile = path.join(root, root === repo ? 'watershed.html' : 'index.html');
    const html = fs.readFileSync(htmlFile, 'utf8');
    for (const match of html.matchAll(/<(?:script|link)[^>]*(?:src|href)="(\/[^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)) {
      const asset = decodeURI(match[1].split('?')[0]);
      assert.ok(fs.existsSync(path.join(root, asset.slice(1))), htmlFile + ' references missing asset ' + asset);
    }
  }
});

test('deployed watershed script keeps independent stage, temperature, and source columns', () => {
  const js = fs.readFileSync(path.join(repo, 'watersheds', 'watershed-sensors-20261019-v4.js'), 'utf8');
  assert.match(js, /MB7388 stage/);
  assert.match(js, /HOBO stage/);
  assert.match(js, /HOBO water/);
  assert.match(js, /transmissionLabel/);
  new Function(js);
});
