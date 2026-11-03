import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {instrumentWorker,instrumentAdapter,instrumentNetcdf,replaceOnce} from './driver-probes.mjs';
const root=process.env.VIEWER_ROOT || fileURLToPath(new URL('../../',import.meta.url));
test('response instrumentation matches current candidate and parses',()=>{
 for(const [name,fn] of [['netcdf-worker.js',instrumentWorker],['terrio-adapter.js',instrumentAdapter],['netcdf.js',instrumentNetcdf]]) {
  const original=readFileSync(root+'/src/viewer-2d/'+name,'utf8');
  const observed=fn(original);assert.notEqual(observed,original);new Script(observed,{filename:name});
 }
});
test('anchor drift fails closed',()=>{
 assert.throws(()=>replaceOnce('absent','x','y'));
 assert.throws(()=>replaceOnce('xx','x','y'));
});
test('driver exports without launching browsers',async()=>{
 assert.equal(typeof (await import('./driver.mjs')).runAcceptance,'function');
});
