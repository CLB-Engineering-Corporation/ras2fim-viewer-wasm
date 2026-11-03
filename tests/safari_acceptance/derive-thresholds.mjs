// Derive the macOS/Safari limits from baseline.json BEFORE any Safari run.
// No new method and no new margin: these are the adoption harness's own WebKit
// rows. Timing: baseline WebKit quiet p95 * 1.5 + 100 ms. Working set: the
// historical long WebKit sampled maximum * 1.25 + 128 MiB -- the same limit the
// accepted Windows WebKit run was held to. Safari and Mobile Safari are WebKit;
// the WebKit baseline is the only one that describes that engine family.
//
//   node tests/safari_acceptance/derive-thresholds.mjs > tests/safari_acceptance/thresholds.json
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const path = new URL('../adoption_acceptance/baseline.json', import.meta.url);
const bytes = readFileSync(path);
const baseline = JSON.parse(bytes);
assert.deepEqual(baseline.margins, {timingFactor: 1.5, timingAddMs: 100, rssFactor: 1.25, rssAddMiB: 128});
const rows = [];
for (const engine of ['webkit', 'safari', 'ios-simulator']) for (const decoder of ['h5wasm', 'terrio-slices']) {
  const quiet = baseline.thresholds.find(t => t.engine === 'webkit' && t.decoder === decoder);
  const long = baseline.webkitLong.find(t => t.decoder === decoder);
  assert.equal(long.limitBytes, Math.ceil(long.maxBytes * 1.25 + 128 * 1048576));
  for (const v of Object.values(quiet.timings)) assert.equal(v.limitMs, Math.ceil(v.baselineP95 * 1.5 + 100));
  rows.push({engine, decoder, baselineEngine: 'webkit (Windows, Playwright)', timings: quiet.timings,
    rssBaselineMaxBytes: long.maxBytes, rssLimitBytes: long.limitBytes});
}
console.log(JSON.stringify({
  schema: 1,
  derivedFrom: {file: 'tests/adoption_acceptance/baseline.json', sha256: createHash('sha256').update(bytes).digest('hex'), provenance: baseline.provenance},
  method: 'timing p95 <= ceil(WebKit quiet p95*1.5+100ms); sampled working-set max <= ceil(WebKit long max*1.25+128MiB)',
  gates: 'Every row is a gate. Any exceedance fails the run and is reported as measured; limits are never changed after a run.',
  comparability: 'The baseline is Windows WorkingSet64 of Playwright WebKit; macOS rows are ps RSS of Safari/WebKit processes on a GitHub-hosted VM. Same engine family, different OS, measure and hardware. A pass is bounded regression evidence, not a device RAM budget.',
  thresholds: rows,
}, null, 2));
