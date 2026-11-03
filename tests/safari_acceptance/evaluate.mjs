// Structural/exactness audit (always asserting) plus every pre-declared limit
// comparison, written to audit.json before the verdict so a failing run keeps
// its full evidence. Limits come only from thresholds.json.
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {adoptionAudit} from '../adoption_acceptance/audit.mjs';
import {CONTENT_PROCESS} from '../adoption_acceptance/processes.mjs';

const here = new URL('./', import.meta.url);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const mib = bytes => +(bytes / 1048576).toFixed(1);

// Path attribution can only undercount; a sample with no WebContent process
// would pass any memory limit trivially, so it is a structural failure.
export function requireContentProcess(report) {
  for (const e of report.engines) {
    if (!['safari', 'ios-simulator'].includes(e.engine)) continue;
    for (const s of [...e.rss, ...e.contextClosed]) {
      if (!s.processes.some(p => CONTENT_PROCESS.test(p.ProcessName) || CONTENT_PROCESS.test(p.command || '')))
        throw Error(`${e.engine} sample without a content process: ${s.decoder}/${s.trial}/${s.cycle ?? 'closed'}`);
    }
  }
}

export function evaluate(report, expectedPins, thresholds, baseline, engines) {
  requireContentProcess(report);
  const limits = (engine, decoder) => {
    const row = thresholds.thresholds.find(t => t.engine === engine && t.decoder === decoder);
    if (!row) throw Error(`no pre-declared limit for ${engine}/${decoder}`);
    return {timings: row.timings, rssLimitBytes: row.rssLimitBytes};
  };
  const summary = adoptionAudit(report, baseline, expectedPins, {engines, limits, thresholds: 'report'});
  const memory = summary.results.map(r => ({
    engine: r.engine, decoder: r.decoder,
    sampledMaxMiB: mib(r.rssEndpointBytes.max), sampledMedianMiB: mib(r.rssEndpointBytes.median),
    firstMiB: mib(r.rssFirstBytes), lastMiB: mib(r.rssLastBytes),
    limitMiB: mib(limits(r.engine, r.decoder).rssLimitBytes),
    pass: r.rssEndpointBytes.max <= limits(r.engine, r.decoder).rssLimitBytes,
  }));
  const all = report.engines.flatMap(e => e.samples);
  return {...summary, engines, memory, host: report.host,
    versions: Object.fromEntries(report.engines.map(e => [e.engine, e.version])),
    counts: {
      switches: all.filter(s => s.kind === 'stream-render').length,
      sliders: all.filter(s => s.kind === 'slider-settled-render').length,
      firstRenders: all.filter(s => s.kind === 'first-render').length,
      recoveries: report.adoption.stress.length,
      rssEndpoints: report.engines.flatMap(e => e.rss).length,
      contextCloses: report.engines.flatMap(e => e.contextClosed).length,
    }};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [rawPath, engineList] = process.argv.slice(2);
  if (!rawPath || !engineList) throw Error('usage: node evaluate.mjs RAW_JSON ENGINES(comma-separated)');
  const raw = readFileSync(rawPath);
  const thresholdsBytes = readFileSync(new URL('thresholds.json', here));
  const out = resolve(dirname(rawPath), 'audit.json');
  let result;
  try {
    result = evaluate(JSON.parse(raw), JSON.parse(readFileSync(new URL('candidate-pins.json', here))),
    JSON.parse(thresholdsBytes), JSON.parse(readFileSync(new URL('../adoption_acceptance/baseline.json', here))),
    engineList.split(','));
  } catch (error) {
    // A structural failure is evidence too; record it before failing.
    writeFileSync(out, JSON.stringify({structuralFailure: String(error.stack || error), inputs: {rawSha256: sha(raw), thresholdsSha256: sha(thresholdsBytes)}}, null, 2) + '\n');
    throw error;
  }
  result.inputs = {rawSha256: sha(raw), thresholdsSha256: sha(thresholdsBytes)};
  writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  console.table(result.memory);
  console.table(result.checks.map(c => ({engine: c.engine, metric: c.metric, value: c.value, limit: c.limit, pass: c.pass})));
  console.log(JSON.stringify(result.counts));
  if (!result.thresholdsPassed) { console.error('Pre-declared limit exceeded; see audit.json'); process.exit(1); }
  console.log('Safari acceptance audit passed');
}
