import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';

export async function verifiedManifest(input) {
 const manifest=JSON.parse(await readFile(`${input}.manifest.json`,'utf8'));
 if(manifest.dataset!=='m-2026-10'||!manifest.checksumsVerified||manifest.selected?.length!==20)throw new Error('A verified M manifest selecting exactly 20 articles is required');
 const hash=createHash('sha256');for await(const chunk of createReadStream(input))hash.update(chunk);
 if(hash.digest('hex')!==manifest.exportSha256)throw new Error('Revision export checksum mismatch');
 return manifest;
}
/** Source export must group complete histories by page; hold only one article in RAM. */
export async function* articleHistories(input,manifest) {
 const expected=new Map(manifest.selected.map(p=>[p.pageId,p.revisions])),seen=new Set();let current=null,rows=[];
 function validate(){if(!expected.has(current)||rows.length!==expected.get(current))throw new Error(`Revision count mismatch for article ${current}`);}
 for await(const line of createInterface({input:createReadStream(input),crlfDelay:Infinity})){
  if(!line.trim())continue;const row=JSON.parse(line);
  if(row.page_id!==current){
   if(current!==null){validate();yield rows;seen.add(current);}
   if(seen.has(row.page_id))throw new Error('Input is not grouped by article; refusing to score partial histories');
   current=row.page_id;rows=[];
  }
  rows.push(row);
 }
 if(current!==null){validate();yield rows;seen.add(current);}
 if(seen.size!==20)throw new Error(`Exactly 20 histories required; found ${seen.size}`);
}
