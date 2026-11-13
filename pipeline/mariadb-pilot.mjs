/** Import the verified selected M histories into SVT, then export rows read back from MariaDB. */
import { existsSync } from 'node:fs';
import { readFile, writeFile, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { getPool, closeDatabase } from '../server/database.mjs';
import { scoreArticle } from './score.mjs';
import { verifiedManifest, articleHistories } from './input.mjs';
if(existsSync('.env'))loadEnvFile('.env');
const input=process.argv[2],output=process.argv[3]||'.local/m-pilot-from-db.jsonl';
if(!input)throw new Error('Usage: node pipeline/mariadb-pilot.mjs verified.jsonl [output.jsonl]');
const manifest=await verifiedManifest(input);
for await(const rows of articleHistories(input,manifest))scoreArticle(rows); // Validate before any database write.
function sqlTime(time){return new Date(time).toISOString().slice(0,-1).replace('T',' ');}
function microTime(micro){return new Date(Number(micro/1000n)).toISOString().slice(0,19).replace('T',' ')+'.'+String(micro%1000000n).padStart(6,'0');}
const pool=await getPool();
if(!pool)throw new Error('MariaDB is not configured; no database results were generated');
let connection;
try {
 connection=await pool.getConnection();await connection.query("SET time_zone='+00:00'");
 for(const sql of (await readFile(new URL('../db/conflict.sql',import.meta.url),'utf8')).replace(/^--.*$/gm,'').split(';').filter(s=>s.trim()))await connection.query(sql);
 const lock=await connection.query("SELECT GET_LOCK('wikilens-m-pilot-import',10) AS acquired");
 if(Number(lock[0]?.acquired)!==1)throw new Error('Another M import is active');
 const existing=await connection.query('SELECT export_sha256 FROM m_conflict_imports WHERE dataset=?',[manifest.dataset]);
 if(existing.length && existing[0].export_sha256!==manifest.exportSha256)throw new Error('Different immutable M capture exists; refusing to overwrite it');
 if(!existing.length){
  await connection.beginTransaction();await connection.query('SET SESSION system_versioning_insert_history=1');
  for await(const rows of articleHistories(input,manifest)){
   rows.sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp)||a.rev_id-b.rev_id);
   let last=-1n;const starts=rows.map(r=>{const exact=BigInt(Date.parse(r.timestamp))*1000n;last=exact>last?exact:last+1n;return microTime(last);});
   for(let i=0;i<rows.length;i++){
    const r=rows[i],values=[manifest.dataset,r.page_id,r.title,r.rev_id,r.parent_id||0,sqlTime(r.timestamp),r.user||null,Boolean(r.anonymous),r.comment||'',Boolean(r.minor),r.sha1||null,r.bytes??null,r.text??null,starts[i]];
    const columns='dataset,page_id,title,rev_id,parent_id,revision_time,editor,anonymous,edit_comment,minor,sha1,byte_length,wikitext,row_start';
    if(i+1<rows.length){values.push(starts[i+1]);await connection.query(`INSERT INTO m_article_versions (${columns},row_end) VALUES (${values.map(()=>'?').join(',')})`,values);}
    else await connection.query(`INSERT INTO m_article_versions (${columns}) VALUES (${values.map(()=>'?').join(',')})`,values);
   }
  }
  await connection.query('INSERT INTO m_conflict_imports(dataset,export_sha256,manifest) VALUES (?,?,?)',[manifest.dataset,manifest.exportSha256,JSON.stringify(manifest)]);
  await connection.commit();await connection.query('SET SESSION system_versioning_insert_history=0');
 }
 const sink=await open(output,'w'),hash=createHash('sha256');let revisionCount=0;
 try {for(const page of manifest.selected){
  const pageId=page.pageId;
  const rows=await connection.query('SELECT page_id,title,rev_id,parent_id,revision_time,editor AS user,anonymous,edit_comment AS comment,minor,sha1,byte_length AS bytes,wikitext AS text FROM m_article_versions FOR SYSTEM_TIME ALL WHERE dataset=? AND page_id=? ORDER BY revision_time,rev_id',[manifest.dataset,pageId]);
  if(rows.length!==page.revisions)throw new Error(`Database row count mismatch for page ${pageId}`);
  for(const row of rows){row.timestamp=String(row.revision_time).replace(' ','T')+'Z';delete row.revision_time;const line=JSON.stringify(row)+'\n';hash.update(line);await sink.write(line);revisionCount++;}
 }}finally{await sink.close();}
 await writeFile(`${output}.manifest.json`,JSON.stringify({...manifest,engine:'MariaDB FOR SYSTEM_TIME ALL',upstreamExportSha256:manifest.exportSha256,exportSha256:hash.digest('hex')},null,2)+'\n');
 console.log(JSON.stringify({output,pages:manifest.selected.length,revisions:revisionCount,engine:'MariaDB FOR SYSTEM_TIME ALL'}));
} catch(error){if(connection)await connection.rollback().catch(()=>{});throw error;}
finally {if(connection){await connection.query('SET SESSION system_versioning_insert_history=0').catch(()=>{});await connection.query("SELECT RELEASE_LOCK('wikilens-m-pilot-import')").catch(()=>{});connection.release();}await closeDatabase();}
