/** Additive, resumable SVT import. Never replaces the original twenty-page capture. */
import {readFile,writeFile} from 'node:fs/promises';
import {getPool,closeDatabase} from '../server/database.mjs';
import {verifiedManifest,articleHistories} from './input.mjs';
import {prepare} from './score-v1.mjs';
const input=process.argv[2]||'.local/m-atlas.jsonl',capture='m-2026-10-atlas';
const manifest=await verifiedManifest(input),pool=await getPool();
if(!pool)throw Error('MariaDB must be configured for the atlas import');
const connection=await pool.getConnection();
function sqlTime(time){return new Date(time).toISOString().slice(0,-1).replace('T',' ');}
function microTime(micro){return new Date(Number(micro/1000n)).toISOString().slice(0,19).replace('T',' ')+'.'+String(micro%1000000n).padStart(6,'0');}
try{
 await connection.query("SET time_zone='+00:00'");
 if(Number((await connection.query("SELECT GET_LOCK('wikilens-atlas-import',5) AS acquired"))[0].acquired)!==1)throw Error('Another atlas import is running');
 for(const sql of (await readFile(new URL('../db/conflict.sql',import.meta.url),'utf8')).replace(/^--.*$/gm,'').split(';').filter(s=>s.trim()))await connection.query(sql);
 await connection.query('CREATE TABLE IF NOT EXISTS m_atlas_captures (capture VARCHAR(40) PRIMARY KEY, export_sha256 CHAR(64) NOT NULL, manifest JSON NOT NULL, completed BOOLEAN NOT NULL DEFAULT 0) ENGINE=InnoDB');
 await connection.query('CREATE TABLE IF NOT EXISTS m_atlas_pages (capture VARCHAR(40), page_id BIGINT UNSIGNED, revision_count INT UNSIGNED NOT NULL, PRIMARY KEY(capture,page_id)) ENGINE=InnoDB');
 const prior=await connection.query('SELECT export_sha256 FROM m_atlas_captures WHERE capture=?',[capture]);
 if(prior.length&&prior[0].export_sha256!==manifest.exportSha256)throw Error('Capture is immutable: source export differs');
 if(!prior.length)await connection.query('INSERT INTO m_atlas_captures(capture,export_sha256,manifest) VALUES (?,?,?)',[capture,manifest.exportSha256,JSON.stringify(manifest)]);
 const done=new Map((await connection.query('SELECT page_id,revision_count FROM m_atlas_pages WHERE capture=?',[capture])).map(r=>[r.page_id,r.revision_count]));
 let pages=0,total=0;
 for await(const inputRows of articleHistories(input,manifest)){
  const {revisions:rows,duplicates}=prepare(inputRows);if(duplicates)throw Error('Duplicate source revisions');
  const pageId=rows[0].page_id;
  if(done.has(pageId)){if(done.get(pageId)!==rows.length)throw Error('Checkpoint count mismatch');pages++;total+=rows.length;continue;}
  await connection.beginTransaction();await connection.query('SET SESSION system_versioning_insert_history=1');
  let last=-1n;const starts=rows.map(r=>{const exact=BigInt(r.time)*1000n;last=exact>last?exact:last+1n;return microTime(last);});
  const columns='dataset,page_id,title,rev_id,parent_id,revision_time,editor,anonymous,edit_comment,minor,sha1,byte_length,wikitext,row_start';
  let batch=[],bytes=0;
  const insert=`INSERT INTO m_article_versions (${columns},row_end) VALUES (${Array(15).fill('?').join(',')})`;
  async function flush(){if(batch.length){await connection.batch(insert,batch);batch=[];bytes=0;}}
  for(let i=0;i<rows.length;i++){
   const r=rows[i],values=[capture,pageId,r.title,r.rev_id,r.parent_id,sqlTime(r.timestamp),r.user,Boolean(r.anonymous),r.comment||'',Boolean(r.minor),r.sha1,r.bytes??null,r.text??null,starts[i]];
   if(i===rows.length-1){await flush();await connection.query(`INSERT INTO m_article_versions (${columns}) VALUES (${Array(14).fill('?').join(',')})`,values);}
   else{values.push(starts[i+1]);const n=Buffer.byteLength(r.text||'');if(bytes+n>3*1024*1024||batch.length>=50)await flush();batch.push(values);bytes+=n;}
  }
  await connection.query('INSERT INTO m_atlas_pages(capture,page_id,revision_count) VALUES (?,?,?)',[capture,pageId,rows.length]);
  await connection.commit();pages++;total+=rows.length;
  if(pages%100===0){const progress={capture,pages,revisions:total,totalPages:manifest.selected.length,updatedAt:new Date().toISOString()};await writeFile('.local/atlas-import-status.json',JSON.stringify(progress));console.log(JSON.stringify(progress));}
 }
 const counted=await connection.query('SELECT COUNT(*) AS revisions,COUNT(DISTINCT page_id) AS pages FROM m_article_versions FOR SYSTEM_TIME ALL WHERE dataset=?',[capture]);
 if(Number(counted[0].revisions)!==total||Number(counted[0].pages)!==pages)throw Error('Database readback count mismatch');
 await connection.query('UPDATE m_atlas_captures SET completed=1 WHERE capture=?',[capture]);
 const progress={capture,pages,revisions:total,completed:true,updatedAt:new Date().toISOString()};await writeFile('.local/atlas-import-status.json',JSON.stringify(progress));console.log(JSON.stringify(progress));
}catch(e){await connection.rollback().catch(()=>{});throw e;}
finally{await connection.query('SET SESSION system_versioning_insert_history=0').catch(()=>{});await connection.query("SELECT RELEASE_LOCK('wikilens-atlas-import')").catch(()=>{});connection.release();await closeDatabase();}
