import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { scoreArticle, METHOD } from './score-v1.mjs';
import { verifiedManifest, articleHistories } from './input.mjs';

const input = process.argv[2];
if (!input) throw new Error('Usage: node pipeline/build-pilot.mjs revisions.jsonl [output.json]');
const output = resolve(process.argv[3] || 'public/data/conflict-pilot.json');
const manifest=await verifiedManifest(input),articles=[];
for await(const rows of articleHistories(input,manifest))articles.push(scoreArticle(rows,{source:manifest.engine||'M m-2026-10 verified parquet export'}));
articles.sort((a,b)=>(b.score??-1)-(a.score??-1)||a.pageId-b.pageId);
const titles=new Map(articles.map(a=>[a.title,a.pageId]));
const edges=articles.flatMap(a=>a.links.filter(t=>titles.has(t)&&titles.get(t)!==a.pageId).map(t=>({source:`fi:${a.pageId}`,target:`fi:${titles.get(t)}`})));
const result={schemaVersion:1,method:METHOD,generatedAt:new Date().toISOString(),dataset:manifest.dataset,
  dataMode:'m-snapshot',calculatedVia:manifest.engine||'verified parquet export (no MariaDB execution)',source:manifest.source,selection:manifest.selection,sourceFiles:manifest.files,
  revisionCount:articles.reduce((n,a)=>n+a.revisions,0),articles,edges,
  graphScope:'Only direct links between the 20 selected articles, from each article’s last revision in the M snapshot. Redirect targets are not resolved.',
  interpretation:'0–100 heuristic index of repeated mutual full-text restores. Higher is more observed conflict, not lower factual reliability. No score means insufficient evidence.'};
await mkdir(dirname(output),{recursive:true});
await writeFile(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({output,articles:articles.length,revisions:result.revisionCount,edges:edges.length,rankings:articles.map(a=>({title:a.title,score:a.score,revisions:a.revisions}))},null,2));
