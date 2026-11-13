import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// JSONL records end at LF. U+2028/U+2029 are valid characters inside JSON
// strings, but Node's readline also treats them as line boundaries.
export async function* jsonLines(chunks) {
 let pending='',lineNumber=0;
 function parse(line){
  lineNumber++;if(!line.trim())return null;
  try{return JSON.parse(line);}catch{throw new Error(`Invalid JSON at physical line ${lineNumber}`);}
 }
 for await(const chunk of chunks){
  pending+=chunk;let end;
  while((end=pending.indexOf('\n'))!==-1){
   const row=parse(pending.slice(0,end));pending=pending.slice(end+1);
   if(row!==null)yield row;
  }
 }
 if(pending.length){const row=parse(pending);if(row!==null)yield row;}
}

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
 for await(const row of jsonLines(createReadStream(input,{encoding:'utf8'}))){
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
