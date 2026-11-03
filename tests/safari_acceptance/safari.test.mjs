import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parsePs, select} from '../adoption_acceptance/processes.mjs';
import {CAPTURE} from '../adoption_acceptance/safari.mjs';

const root = new URL('../../', import.meta.url);
const sha = p => createHash('sha256').update(readFileSync(new URL(p, root))).digest('hex');

test('candidate pins are the committed sources and the locked Terrio assets', () => {
  const pins = JSON.parse(readFileSync(new URL('tests/safari_acceptance/candidate-pins.json', root)));
  for (const f of ['app.js', 'netcdf.js', 'netcdf-worker.js', 'terrio-adapter.js']) assert.equal(pins[f], sha('src/viewer-2d/' + f), f);
  const lock = JSON.parse(readFileSync(new URL('pipeline/common/terrio-assets.lock.json', root))).sha256;
  assert.equal(pins['vendor/terrio/terrio_bg.wasm'], lock['terrio_bg.wasm']);
  assert.equal(pins['vendor/terrio/terrio.js'], lock['terrio.js']);
  assert.match(pins['vendor/h5wasm.js'], /^[0-9a-f]{64}$/);
});

test('thresholds are exactly what derive-thresholds.mjs produces from baseline.json', () => {
  const script = fileURLToPath(new URL('tests/safari_acceptance/derive-thresholds.mjs', root));
  const derived = execFileSync(process.execPath, [script], {encoding: 'utf8'});
  assert.deepEqual(JSON.parse(derived), JSON.parse(readFileSync(new URL('tests/safari_acceptance/thresholds.json', root))));
});

test('macOS process attribution keeps engines apart', () => {
  const rows = parsePs([
    '10 1 2048 /Applications/Safari.app/Contents/MacOS/Safari',
    '11 1 1024 /System/Library/Frameworks/WebKit.framework/Versions/A/XPCServices/com.apple.WebKit.WebContent.xpc/Contents/MacOS/com.apple.WebKit.WebContent',
    '12 1 512 /Users/r/Library/Caches/ms-playwright/webkit-2200/pw_run.sh',
    '13 1 512 /Users/r/Library/Caches/ms-playwright/webkit-2200/WebKit.framework/XPCServices/com.apple.WebKit.WebContent.xpc/Contents/MacOS/com.apple.WebKit.WebContent',
    '14 1 256 /Library/Developer/CoreSimulator/Volumes/iOS/Applications/MobileSafari.app/MobileSafari',
    '15 1 256 /Library/Developer/CoreSimulator/Volumes/iOS/System/Library/Frameworks/WebKit.framework/XPCServices/com.apple.WebKit.WebContent.xpc/com.apple.WebKit.WebContent',
    '16 12 128 /usr/bin/helper',
    '17 1 64 /usr/sbin/unrelated',
  ].join('\n'));
  assert.deepEqual(select(rows, 'safari', 0).map(r => r.Id), [10, 11]);
  assert.deepEqual(select(rows, 'webkit', 12).map(r => r.Id).sort(), [12, 13, 16]);
  assert.deepEqual(select(rows, 'ios-simulator', 0).map(r => r.Id), [14, 15]);
  assert.equal(select(rows, 'safari', 0)[0].WorkingSet64, 2048 * 1024);
});

test('injected error capture parses', () => {
  assert.doesNotThrow(() => new Function(CAPTURE));
});
