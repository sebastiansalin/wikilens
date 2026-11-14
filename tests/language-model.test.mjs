import test from 'node:test';
import assert from 'node:assert/strict';
import {LANGUAGES,PAIRS,leadParagraphs,scoreLanguageArticle} from '../pipeline/language-model.mjs';
import fs from 'node:fs/promises';
import {buildLanguages} from '../pipeline/build-languages.mjs';
import {captureLanguages} from '../pipeline/capture-languages.mjs';

test('lead extraction excludes nested infoboxes, references, scripts and decodes text',()=>{
  assert.deepEqual(leadParagraphs('<table><tr><td><p>Excluded long infobox description here.</p><table><tr><td>nested</td></tr></table></td></tr></table><p>Finland &amp; Sweden are separate countries.<sup>[1]</sup></p><script><p>untrusted code</p></script>'),['Finland & Sweden are separate countries.']);
});
const capture={id:1,title:'Test',hash:'capture-1',editions:Object.fromEntries(LANGUAGES.map(lang=>[lang,{status:'available',paragraphs:['Anchored example statement.']}]))};
function assessment(){return {captureHash:'capture-1',author:'test fixture',claims:Array.from({length:4},(_,i)=>({id:`c${i}`,statements:Object.fromEntries(LANGUAGES.map(lang=>[lang,{summary:'Example',quote:'Anchored example'}])),comparisons:PAIRS.map(([a,b])=>({a,b,relation:i===0?'different-framing':'compatible',reason:'Fixture'}))}))};}
test('six pairwise scores and equal-pair aggregate use comparable claim counts',()=>{const a=scoreLanguageArticle(capture,assessment());assert.equal(a.score,25);assert.equal(a.measuredPairs,6);assert.ok(a.pairs.every(p=>p.score===25&&p.comparable===4));});
test('omission and uncertainty are excluded, never treated as disagreement',()=>{const a=assessment();a.claims[0].comparisons.forEach(p=>p.relation='not-comparable');assert.equal(scoreLanguageArticle(capture,a).score,0);a.claims[1].comparisons.forEach(p=>p.relation='uncertain');assert.equal(scoreLanguageArticle(capture,a).score,null);});
test('missing editions and missing assessments remain unknown',()=>{assert.equal(scoreLanguageArticle(capture,null).score,null);const c=structuredClone(capture);delete c.editions.ru;const a=assessment();a.claims.forEach(claim=>{delete claim.statements.ru;claim.comparisons=claim.comparisons.filter(p=>p.b!=='ru');});const r=scoreLanguageArticle(c,a);assert.equal(r.measuredPairs,3);assert.ok(r.pairs.filter(p=>p.b==='ru').every(p=>p.score===null));});
test('stale captures, invented quotes and unanchored pair claims fail closed',()=>{const a=assessment();assert.throws(()=>scoreLanguageArticle({...capture,hash:'new'},a),/stale/);a.claims[0].statements.fi.quote='fabricated quote';assert.throws(()=>scoreLanguageArticle(capture,a),/Unanchored/);});

test('committed demo is reproducible, source-anchored and keeps sparse comparisons unknown',async()=>{
 const source=JSON.parse(await fs.readFile('public/data/languages/capture.json','utf8'));
 const built=buildLanguages(source),published=JSON.parse(await fs.readFile('public/data/languages/index.json','utf8'));
 assert.deepEqual(built,published);
 assert.equal(built.articles.length,8);
 assert.ok(built.articles.every(a=>a.pairs.length===6&&Object.values(a.editions).every(e=>e.status==='available'&&e.url.endsWith(String(e.revision)))));
 const sparse=built.articles.find(a=>a.id===1275);assert.equal(sparse.score,null);assert.equal(sparse.measuredPairs,1);
 const winter=built.articles.find(a=>a.id===1256);const pair=winter.pairs.find(p=>p.a==='fi'&&p.b==='ru');assert.equal(pair.framing,1);assert.equal(pair.conflicts,1);assert.equal(pair.comparable,6);
 source.articles[0].editions.fi.paragraphs[0]+=' tampered';assert.throws(()=>buildLanguages(source),/integrity/);
});

test('capture follows readership continuation and rejects mismatched edition identity',async()=>{
 let continuations=0,parsedRussian=false;
 const request=async(lang,p)=>{
  if(p.pageids){const ids=p.pageids.split('|').map(Number);if(!p.pvicontinue)return {query:{pages:ids.map(pageid=>({pageid,pageprops:{wikibase_item:'Q'+pageid},pageviews:{'2026-10-01':1}}))},continue:{pvicontinue:'next'}};
   continuations++;return {query:{pages:ids.map(pageid=>({pageid,pageviews:Object.fromEntries(Array.from({length:28},(_,i)=>[`2026-10-${String(i+2).padStart(2,'0')}`,1]))}))}};
  }
  if(p.titles){const id=Number(p.titles.slice(1));return {query:{pages:[{pageid:id,ns:0,title:p.titles,pageprops:{wikibase_item:lang==='ru'?'Qwrong':'Q'+id},revisions:[{revid:id,timestamp:'2026-11-14T00:00:00Z'}]}]}};}
  if(lang==='ru')parsedRussian=true;
  return {parse:{revid:Number(p.oldid),text:'<p>A sufficiently long captured introduction for this test.</p>'}};
 };
 const result=await captureLanguages({count:1,request,sitelinksFor:async qid=>Object.fromEntries(LANGUAGES.filter(l=>l!=='uk').map(l=>[l+'wiki',{title:qid}]))});
 assert.equal(continuations,3);assert.equal(result.articles[0].readership.days,29);
 assert.equal(result.articles[0].editions.uk.status,'missing');assert.equal(result.articles[0].editions.ru.status,'unavailable');assert.match(result.articles[0].editions.ru.reason,/identity/);assert.equal(parsedRussian,false);
});
