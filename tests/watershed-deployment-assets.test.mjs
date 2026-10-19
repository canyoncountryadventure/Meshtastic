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

test('watershed telemetry graphs default to 12 hours in both deployment roots', () => {
  for (const root of [repo, path.join(repo, 'watersheds')]) {
    const html = fs.readFileSync(path.join(root, root === repo ? 'watershed.html' : 'index.html'), 'utf8');
    const selected = [...html.matchAll(/data-hours="(\d+)" type="button" aria-pressed="true"/g)];
    assert.equal(selected.length, 1, 'only one selected time range in ' + root);
    assert.equal(selected[0][1], '12', 'initial time range is 12h in ' + root);
    for (const name of ['watershed-sensors-20261019-v4.js', 'watershed.js']) {
      const js = fs.readFileSync(path.join(root, name), 'utf8');
      assert.match(js, /state=\{node:1949224949,hours:12,metric:'flow'/, name + ' must request 12h');
      new Function(js);
    }
  }
});
