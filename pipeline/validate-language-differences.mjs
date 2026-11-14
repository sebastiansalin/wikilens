import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {digest,compareNeighborhoodArticle} from './language-neighborhood.mjs';
import {selectTopArticles} from './top-language-selection.mjs';
const root='public/data/language-differences',read=async path=>JSON.parse(await readFile(path,'utf8'));
const [index,manifest,atlas]=await Promise.all([read(`${root}/index.json`),read(`${root}/capture.json`),read('public/data/atlas/index.json')]);
const expected=selectTopArticles(atlas.articles,100);
assert.equal(index.articles.length,100);assert.equal(manifest.articles.length,100);assert.equal(index.atlasVersion,atlas.version);
assert.deepEqual(index.articles.map(({id,title,rank,editingScore})=>({id,title,rank,editingScore})),expected);
let quotes=0,measuredPairs=0,missingPairs=0;
for(const summary of index.articles){
 const raw=await read(`${root}/captures/${summary.id}.json`),detail=await read(`${root}/details/${summary.id}.json`);
 const {hash,...body}=raw;assert.equal(digest(body),hash);assert.equal(hash,summary.hash);assert.equal(hash,manifest.articles.find(a=>a.id===summary.id)?.hash);
 const {score,depth,parent,...rebuilt}=compareNeighborhoodArticle(raw);assert.deepEqual(detail,rebuilt);assert.equal(detail.measuredPairs,summary.measuredPairs);
 assert.equal('score' in detail,false);assert.equal('score' in summary,false);assert.equal(detail.pairs.length,6);
 for(const pair of detail.pairs){
  if(pair.score===null){missingPairs++;continue;}measuredPairs++;assert.ok(Number.isFinite(pair.score)&&pair.score>=0&&pair.score<=100);
  for(const concept of pair.differences)for(const side of ['a','b']){
   const evidence=concept[side];if(!evidence)continue;
   const edition=raw.editions[pair[side]],paragraph=edition.paragraphs[evidence.paragraph];
   assert.equal(evidence.quote,paragraph.text);assert.ok(paragraph.links.includes(evidence.title));assert.equal(edition.identities[evidence.title].qid,concept.qid);assert.equal(edition.qid,raw.qid);assert.ok(edition.url.endsWith(`oldid=${edition.revision}`));quotes++;
  }
 }
}
console.log(JSON.stringify({articles:100,selection:'exact all-history top 100',hashes:'verified',recomputedPairs:measuredPairs,missingPairs,anchoredQuotes:quotes,combinedScores:false}));
