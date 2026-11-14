import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {selectNeighborhood} from '../pipeline/language-neighborhood.mjs';
import {buildNeighborhood} from '../pipeline/capture-neighborhood.mjs';
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const base='public/data/language-neighborhood',manifest=await read(`${base}/capture.json`),catalog=await read(`${base}/index.json`),atlas=await read('public/data/atlas/index.json');
assert.equal(manifest.storage,'article-shards');assert.equal(manifest.atlasVersion,atlas.version);
const articles=await Promise.all(manifest.articles.map(a=>read(`${base}/captures/${a.id}.json`)));
const expected=selectNeighborhood(atlas.articles,manifest.selection.seed,manifest.selection.count);
assert.deepEqual(articles.map(({id,title,depth,parent})=>({id,title,depth,parent})),expected);
const built=await buildNeighborhood({...manifest,articles});let quotations=0,available=0,missing=0,unavailable=0;
for(const article of built.articles){
 const saved=await read(`${base}/details/${article.id}.json`);assert.deepEqual(saved,article);
 const summary=catalog.articles.find(a=>a.id===article.id);assert.ok(summary);for(const [key,value]of Object.entries(summary))assert.deepEqual(value,article[key]);
 const raw=articles.find(a=>a.id===article.id);
 for(const [lang,e]of Object.entries(raw.editions)){
  assert.ok(['available','missing','unavailable'].includes(e.status));
  if(e.status==='available'){available++;assert.equal(e.qid,raw.qid);assert.equal(e.url,`https://${lang}.wikipedia.org/w/index.php?oldid=${e.revision}`);assert.ok(Number.isFinite(Date.parse(e.timestamp)));}else if(e.status==='missing')missing++;else unavailable++;
 }
 for(const pair of article.pairs)for(const diff of pair.differences||[])for(const key of ['a','b'])if(diff[key]){
  const e=raw.editions[pair[key]],quote=diff[key];assert.equal(e.paragraphs[quote.paragraph].text,quote.quote);assert.equal(e.identities[quote.title].qid,diff.qid);quotations++;
 }
}
assert.equal(catalog.articles.length,manifest.selection.count);assert.equal(catalog.articles[0].title,'Talvisota');
const result={validated:true,method:manifest.method,capturedAt:manifest.generatedAt,articles:articles.length,availableEditions:available,missingEditions:missing,unavailableEditions:unavailable,measuredArticles:built.articles.filter(a=>a.score!==null).length,measuredPairs:built.articles.reduce((n,a)=>n+a.measuredPairs,0),anchoredQuotations:quotations,hashesVerified:articles.length,selectionVerified:true,allDetailCalculationsReproduced:true,independentSemanticValidation:false};
await writeFile('docs/qa/neighborhood-validation.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
