// Synthetic audit test data, derived from viewer acceptance test fixture.
import {streams} from './oracle/contracts.mjs';
const decoders=['h5wasm','terrio-slices'];
export function fixture() {
 const baseEvent={layer:true,sourceLoaded:true,painted:10};
 const engine=engine=>({engine,errors:[],summaries:{untrusted:'ignored'},rss:decoders.flatMap(decoder=>Array.from({length:80},(_,cycle)=>({decoder,trial:0,cycle,processes:[{Id:1,WorkingSet64:100}]}))),samples:decoders.flatMap(decoder=>[
 ...['cold','warm'].map(phase=>({decoder,trial:0,kind:'first-render',phase,ms:1,started:0,generation:1,max:17,done:{generation:1},state:{generation:1},event:{...baseEvent,at:1,revision:1,generation:1,index:0}})),
 ...Array.from({length:80},(_,i)=>streams[i%4]).map((stream,cycle)=>({decoder,trial:0,cycle,max:stream.max,generation:cycle+2,started:10+cycle*100,kind:'stream-render',stream:stream.id,done:{generation:cycle+2,timings:{wasmCapacityBytes:65536}},state:{generation:cycle+2,canvasRevision:10+cycle*4,sparseBytes:100},ms:2,event:{...baseEvent,at:12+cycle*100,revision:1+cycle*4,generation:cycle+2,index:0}})),
 ...Array.from({length:80},(_,i)=>streams[i%4]).flatMap((stream,cycle)=>[0,stream.max,Math.floor(stream.max/2)].map((index,slot)=>({decoder,trial:0,cycle,index,max:stream.max,generation:cycle+2,started:20+cycle*100+slot*5,kind:'slider-settled-render',stream:stream.id,event:{...baseEvent,index,at:23+cycle*100+slot*5,revision:2+cycle*4+slot,generation:cycle+2,painted:cycle%4===3&&index===0?0:10},ms:3})))])});
 return {completed:true,started:'2026-11-02T00:00:00Z',finished:'2026-11-02T00:01:00Z',trials:1,cycles:80,engines:['chromium','firefox','webkit'].map(engine)};
}
