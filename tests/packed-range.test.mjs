import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {test} from 'node:test';
import {readPackedRung} from '../src/viewer-2d/packed-stack.mjs';
test('offsets beyond 2 GiB use a single checksum-verified range and preserve CF packing',async()=>{
 const bytes=deflateSync(Buffer.from([1,0,255,255,2,0]));
 const offset=2**31+123;
 const index={schema:'fim-packed-stack-ranges/v1',sha256:'a'.repeat(64),bytes:offset+bytes.length,shape:[1,1,3],dtype:'uint16',byteorder:'little',scale_factor:Math.fround(.01),add_offset:0,fill_value:65535,packing_arithmetic:'float32_multiply_then_float32_add',filters:[{id:1,parameters:[4]}],chunks:[{offset,length:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]};
 const fetcher=async(url,options)=>{assert.equal(options.headers.Range,`bytes=${offset}-${offset+bytes.length-1}`);return new Response(bytes,{status:206,headers:{'Content-Range':`bytes ${offset}-${offset+bytes.length-1}/${index.bytes}`,'Content-Length':String(bytes.length)}})};
 const p=await readPackedRung('https://example.test/','depth.nc',index,0,{fetcher});
 assert.deepEqual([...p.dry],[0,1,0]);assert.equal(p.depths[2],Math.fround(.02));
 await assert.rejects(readPackedRung('https://example.test/','depth.nc',index,0,{fetcher:async()=>new Response(bytes)}));
});
