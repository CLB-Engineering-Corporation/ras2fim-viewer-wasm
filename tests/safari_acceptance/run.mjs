// Long-session acceptance on macOS: the adoption driver's design, unchanged,
// against Playwright WebKit and real Safari (and optionally Mobile Safari in an
// iOS Simulator). Usage:
//   ENGINES=webkit,safari node tests/safari_acceptance/run.mjs NEW_OUTPUT_DIRECTORY
// Environment: ADOPTION_SITE, VIEWER_ROOT (fixtures under .terrio-validation/),
// PLAYWRIGHT_MODULE, IOS_DEVICE_UDID for ios-simulator.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import assert from 'node:assert/strict';
import {runAcceptance} from '../adoption_acceptance/driver.mjs';

const out = process.argv[2];
assert.ok(out, 'usage: node run.mjs NEW_OUTPUT_DIRECTORY');
mkdirSync(dirname(resolve(out)), {recursive: true});
mkdirSync(out); // refuse overwriting prior evidence
const engines = (process.env.ENGINES || 'webkit,safari').split(',');
const n = (name, fallback) => Number(process.env[name] || fallback);
const config = {
  engines, decoders: ['h5wasm', 'terrio-slices'], trials: n('TRIALS', 3), cycles: n('CYCLES', 80),
  stressIterations: n('STRESS', 20), scenarios: ['cancel-fetch', 'cancel-prepare', 'malformed'],
  expectedPins: JSON.parse(readFileSync(new URL('candidate-pins.json', import.meta.url))),
  out: resolve(out), verify: true,
  iosCapabilities: {platformName: 'iOS', browserName: 'Safari', 'safari:useSimulator': true,
    ...(process.env.IOS_DEVICE_UDID ? {'safari:deviceUDID': process.env.IOS_DEVICE_UDID} : {'safari:deviceType': 'iPhone'})},
};
writeFileSync(resolve(out, 'config.json'), JSON.stringify({...config, expectedPins: undefined}, null, 2) + '\n');
await runAcceptance(config); // checkpoints raw.json itself, including on failure
console.log('run completed; audit with: node tests/safari_acceptance/evaluate.mjs', resolve(out, 'raw.json'), engines.join(','));
