import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve,join,sep } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { verifiedManifest,articleHistories } from '../pipeline/input.mjs';

test('synthetic integration fixture: export 20 complete histories, retain genuine fixture links, reject tampering',async()=>{
 const root=resolve(tmpdir()),directory=await mkdtemp(join(root,'wikilens-test-'));
 try {
  const selected=Array.from({length:20},(_,i)=>({pageId:i+1,revisions:20,title:`TEST FIXTURE ${i+1}`}));
  const rows=selected.flatMap(p=>Array.from({length:20},(_,i)=>({page_id:p.pageId,title:p.title,rev_id:p.pageId*100+i+1,parent_id:i?p.pageId*100+i:0,
   timestamp:new Date(Date.UTC(2020,0,1,i)).toISOString(),user:'synthetic editor',sha1:`fixture-${p.pageId}-${i}`,text:`[[TEST FIXTURE ${p.pageId%20+1}]]`})));
  const input=join(directory,'fixture.jsonl'),output=join(directory,'result.json'),data=rows.map(r=>JSON.stringify(r)).join('\n')+'\n';
  await writeFile(input,data);
  const manifest={dataset:'m-2026-10',checksumsVerified:true,selected,selection:'SYNTHETIC TEST FIXTURE — NOT WIKIPEDIA DATA',source:'synthetic fixture',files:[],exportSha256:createHash('sha256').update(data).digest('hex')};
  await writeFile(input+'.manifest.json',JSON.stringify(manifest));
  execFileSync(process.execPath,['pipeline/build-pilot.mjs',input,output],{stdio:'pipe'});
  const result=JSON.parse(await readFile(output,'utf8'));
  assert.equal(result.articles.length,20);assert.equal(result.revisionCount,400);assert.equal(result.edges.length,20);
  assert.ok(result.articles.every(a=>a.score===0));assert.ok(result.calculatedVia.includes('no MariaDB'));
  await writeFile(input,data+' ');await assert.rejects(()=>verifiedManifest(input),/checksum mismatch/);
  await writeFile(input,rows.slice(1).map(r=>JSON.stringify(r)).join('\n'));
  await assert.rejects(async()=>{for await(const rows of articleHistories(input,manifest))void rows;},/count mismatch/);
 }finally{assert.ok(resolve(directory).startsWith(root+sep));await rm(directory,{recursive:true,force:true});}
});
