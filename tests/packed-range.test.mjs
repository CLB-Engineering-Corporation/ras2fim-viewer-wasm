import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {test} from 'node:test';
import {readPackedRung,validatePackedIndex} from '../src/viewer-2d/packed-stack.mjs';
test('offsets beyond 2 GiB use a single checksum-verified range and preserve CF packing',async()=>{
 const bytes=deflateSync(Buffer.from([1,0,255,255,2,0]));
 const offset=2**31+123;
 const index={schema:'fim-packed-stack-ranges/v1',sha256:'a'.repeat(64),bytes:offset+bytes.length,shape:[1,1,3],dtype:'uint16',byteorder:'little',scale_factor:Math.fround(.01),add_offset:0,fill_value:65535,packing_arithmetic:'float32_multiply_then_float32_add',filters:[{id:1,parameters:[4]}],chunks:[{offset,length:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]};
 const fetcher=async(url,options)=>{assert.equal(options.headers.Range,`bytes=${offset}-${offset+bytes.length-1}`);return new Response(bytes,{status:206,headers:{'Content-Range':`bytes ${offset}-${offset+bytes.length-1}/${index.bytes}`,'Content-Length':String(bytes.length)}})};
 const p=await readPackedRung('https://example.test/','depth.nc',index,0,{fetcher});
 assert.deepEqual([...p.dry],[0,1,0]);assert.equal(p.depths[2],Math.fround(.02));
 await assert.rejects(readPackedRung('https://example.test/','depth.nc',index,0,{fetcher:async()=>new Response(bytes)}));
});

test('tiled rungs stitch padded edge tiles and reject missing coverage',async()=>{
 const tiles=[[1,2,4,5],[3,99,6,99]].map(values=>{
  const raw=Buffer.alloc(8);values.forEach((v,i)=>raw.writeUInt16LE(v,i*2));return deflateSync(raw);
 });
 let offset=100;
 const chunks=tiles.map((b,i)=>{const c={offset,length:b.length,sha256:createHash('sha256').update(b).digest('hex'),rung:0,row:0,col:i*2};offset+=b.length;return c;});
 const index={schema:'fim-packed-stack-ranges/v2',sha256:'a'.repeat(64),bytes:offset,shape:[1,2,3],tile_shape:[2,2],dtype:'uint16',byteorder:'little',scale_factor:1,add_offset:0,fill_value:65535,packing_arithmetic:'float32_multiply_then_float32_add',filters:[{id:1,parameters:[4]}],chunks};
 let requests=0;
 const fetcher=async(url,options)=>{
  const i=chunks.findIndex(c=>options.headers.Range===`bytes=${c.offset}-${c.offset+c.length-1}`);
  requests++;const c=chunks[i];return new Response(tiles[i],{status:206,headers:{'Content-Range':`bytes ${c.offset}-${c.offset+c.length-1}/${index.bytes}`,'Content-Length':String(c.length)}});
 };
 const p=await readPackedRung('https://example.test/','depth.nc',index,0,{fetcher});
 assert.deepEqual([...p.depths],[1,2,3,4,5,6]);assert.equal(requests,2);
 assert.throws(()=>validatePackedIndex({...index,chunks:chunks.slice(1)}),/coverage/);
 assert.throws(()=>validatePackedIndex({...index,chunks:[chunks[0],chunks[0]]}),/duplicate/);
});
