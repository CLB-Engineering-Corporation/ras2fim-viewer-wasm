import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {adoptionAudit} from './audit.mjs';
// The coordinator supplies the integrated viewer driver. No source rewriting here.
const [driverPath,pinsPath,out]=process.argv.slice(2);
assert.ok(driverPath&&pinsPath&&out,'usage: node run.mjs DRIVER_MODULE CANDIDATE_PINS_JSON NEW_OUTPUT_DIRECTORY');
mkdirSync(out); // refuse overwriting prior evidence
const expectedPins=JSON.parse(readFileSync(pinsPath));
const baseline=JSON.parse(readFileSync(new URL('./baseline.json',import.meta.url)));
const driver=await import(pathToFileURL(resolve(driverPath)).href);
assert.equal(typeof driver.runAcceptance,'function','driver must export runAcceptance');
const report=await driver.runAcceptance({engines:['chromium','firefox','webkit'],decoders:['h5wasm','terrio-slices'],trials:3,cycles:80,stressIterations:20,scenarios:['cancel-fetch','cancel-prepare','malformed'],expectedPins,out:resolve(out),verify:true});
writeFileSync(resolve(out,'raw.json'),JSON.stringify(report,null,2)+'\n');
const summary=adoptionAudit(report,baseline,expectedPins);
writeFileSync(resolve(out,'audit.json'),JSON.stringify(summary,null,2)+'\n');
console.log('Acceptance audit passed');
