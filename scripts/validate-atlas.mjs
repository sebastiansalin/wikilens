import {readFile,writeFile,stat} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {summarizeMonths,atlasIndexes,eventHorizon} from '../src/atlas-model.mjs';
const bytes=await readFile('public/data/atlas/index.json'),data=JSON.parse(bytes),index=atlasIndexes(data.articles);
assert.equal(data.articleCount,19742);assert.equal(data.revisionCount,862076);assert.equal(index.byId.size,19742);assert.equal(data.databaseReadbackVerified,true);
let revisions=0,edges=0,episodes=0;const details=new Map();
for(let i=0;i<64;i++){const shard=JSON.parse(await readFile(`public${data.detailPath}/${i}.json`,'utf8'));for(const [id,d] of Object.entries(shard))details.set(Number(id),d);}
assert.equal(details.size,19742);
for(const a of data.articles){
 const summary=summarizeMonths(a.months);revisions+=summary.revisions;edges+=a.links.length;
 assert.equal(new Set(a.months.map(m=>m[0])).size,a.months.length);assert.ok(a.months.every(m=>/^\d{4}-\d{2}$/.test(m[0])&&m.slice(1).every(n=>Number.isInteger(n)&&n>=0)&&m[2]<=m[1]));
 assert.ok(a.links.every(id=>index.byId.has(id)&&id!==a.id));assert.equal(new Set(a.links).size,a.links.length);
 const detail=details.get(a.id);assert.ok(detail);episodes+=detail.episodes.length;
 for(const [category,key] of [['content','episodeCount'],['cleanup','cleanup'],['maintenance','maintenance'],['uncertain','uncertain']])assert.equal(detail.episodes.filter(e=>e.category===category).length,summary[key]);
 for(const e of detail.episodes){assert.ok(e.evidence.length>=2);assert.ok(e.evidence.every(v=>Number.isInteger(v.revision)&&Number.isInteger(v.parent)));assert.ok(e.qualifiedAt>=e.start&&e.qualifiedAt<=e.end);}
}
assert.equal(revisions,data.revisionCount);assert.equal(edges,data.edgeCount);
const talvi=data.articles.find(a=>a.title==='Talvisota'),horizon=eventHorizon(index,talvi.id,{limit:10000,rings:5});assert.equal(horizon.ids.length,160);
const findRevision=(page,rev)=>details.get(page).episodes.filter(e=>e.evidence.some(v=>v.revision===rev));
const known=[{case:'Nightwish genre partial reversals',page:14398,revision:3791251,expected:'content'},{case:'Sauli lead-name replacement',page:1137,revision:23674279,expected:'uncertain'},{case:'Ahtisaari bot language-link cycle',page:5901,revision:9843761,expected:'maintenance'},{case:'Jatkosota outcome wording',page:440,revision:14002301,expected:'content'}];
for(const c of known){c.observed=findRevision(c.page,c.revision).map(e=>e.category);assert.ok(c.observed.includes(c.expected),`Regression: ${c.case}`);}
const old=JSON.parse(await readFile('public/data/conflict-pilot.json','utf8'));
const comparison=old.articles.map(v1=>{const a=index.byId.get(v1.pageId),s=summarizeMonths(a.months),recent=summarizeMonths(a.months,'2021-10','2026-09');return {title:a.title,pageId:a.id,v1Index:v1.score,v2Index:a.eligible?s.score:null,contentCandidates:s.episodeCount,cleanup:s.cleanup,maintenance:s.maintenance,uncertain:s.uncertain,recentFiveYearCandidates:recent.episodeCount,recentFiveYearIndex:recent.score};});
const pack=JSON.parse(await readFile(`public${data.detailPath}/review.json`,'utf8')),pred=JSON.parse(await readFile('docs/qa/review-predictions.json','utf8'));assert.equal(pack.version,pred.version);assert.equal(pack.cases.length,data.reviewCases);assert.ok(pack.cases.every(c=>!('prediction'in c)&&pred.predictions[c.id]?.kind===c.kind));
const totalBytes=bytes.length+(await Promise.all(Array.from({length:64},(_,i)=>stat(`public${data.detailPath}/${i}.json`)))).reduce((n,s)=>n+s.size,0);
const report={version:data.version,validatedAt:new Date().toISOString(),articles:data.articleCount,revisions,edges,episodes,indexBytes:bytes.length,indexGzipBytes:gzipSync(bytes).length,indexAndEvidenceBytes:totalBytes,knownDevelopmentCases:known,comparison,reviewCases:pack.cases.length,independentReview:'pending',warning:'Known cases are development regressions, not blind accuracy validation; v1 and v2 scores have different scales.'};
await writeFile('docs/qa/atlas-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,comparison:comparison.slice(0,7)},null,2));
