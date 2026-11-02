import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const context=vm.createContext({self:{}});
vm.runInContext(readFileSync(new URL('../src/viewer-2d/netcdf.js',import.meta.url),'utf8'),context);
const R=context.self.R2F2D;
test('display Float32 bin contract has fixed independent expected RGBA bins',()=>{
 const stack={nx:8,ny:1,nFlow:1,mode:'depth',scale:1,offset:0,hasFill:false,
  wsel:new Float64Array([-1,0,0.2,0.4,0.6,0.8,1,NaN]),terrain:null};
 const ramp=new Uint8Array(1024);
 for(let i=0;i<256;i++)ramp.set([i,255-i,7,255],4*i);
 const dense={data:new Uint8ClampedArray(32)};
 R.paintDense(stack,0,dense,ramp,1);
 const sparse=new Uint8ClampedArray(32);
 R.paintSparse(new Uint32Array(sparse.buffer),R.buildIndex(stack,0),R.buildRampU32(ramp),1);
 const expected=[0,0,0,0,0,0,0,0,51,204,7,255,102,153,7,255,153,102,7,255,204,51,7,255,255,0,7,255,0,0,0,0];
 assert.deepEqual([...dense.data],expected);
 assert.deepEqual([...sparse],expected);
});
