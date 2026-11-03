import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {audit} from './oracle/audit.mjs';
const root=process.argv[2]; assert.ok(root,'usage: node baseline.mjs VIEWER_ROOT OUTPUT');
const inputs=[['quiet','render-final-pin-quiet/raw.json','30d6d0bdf196e6e339ed47b8acd3b9b2e1edc6046aca61af39f3cfd84a4608d5'],['stress','render-final-pin-long-webkit/raw.json','2a18e608e068a7693e6c54f313e673a12210047d65556367e75881ed89579a4c'],['retention','retention-final-pin-frozen/raw.json','d4eb5096c83096abaa7c053add42fa3ff847e313eb9fe6053b52b26d543a1c89']];
const reports={},provenance={};
for(const [name,path,hash] of inputs){const bytes=readFileSync(resolve(root,'.terrio-validation',path));assert.equal(createHash('sha256').update(bytes).digest('hex'),hash); reports[name]=JSON.parse(bytes);provenance[name]={path,sha256:hash};}
const quiet=audit(reports.quiet),stress=audit(reports.stress,'webkit-stress');
assert.equal(reports.retention.completed,true);assert.equal(reports.retention.forcedGC,false);
const thresholds=quiet.map(row=>({engine:row.engine,decoder:row.decoder,
 timings:Object.fromEntries(Object.entries(row.metrics).map(([key,v])=>[key,{baselineP95:v.p95,limitMs:Math.ceil(v.p95*1.5+100)}])),
 rss:{baselineMaxBytes:row.rssEndpointBytes.max,limitBytes:Math.ceil(row.rssEndpointBytes.max*1.25+128*1048576)}}));
const reuse=reports.retention.runs.filter(r=>r.mode==='reuse-decode').map(r=>({decoder:r.decoder,samples:r.samples.length,rss:r.rss}));
writeFileSync(process.argv[3],JSON.stringify({schema:1,provenance,baselineSourcePins:reports.quiet.sourcePins,margins:{timingFactor:1.5,timingAddMs:100,rssFactor:1.25,rssAddMiB:128},thresholds,webkitLong:stress.map(r=>({decoder:r.decoder,maxBytes:r.rssEndpointBytes.max,limitBytes:Math.ceil(r.rssEndpointBytes.max*1.25+128*1048576)})),retentionReuse:reuse},null,2)+'\n');
