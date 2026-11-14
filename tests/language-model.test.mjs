import test from 'node:test';
import assert from 'node:assert/strict';
import {LANGUAGES,PAIRS,leadParagraphs,scoreLanguageArticle} from '../pipeline/language-model.mjs';

test('lead extraction excludes nested infoboxes, references, scripts and decodes text',()=>{
  assert.deepEqual(leadParagraphs('<table><tr><td><p>Excluded long infobox description here.</p><table><tr><td>nested</td></tr></table></td></tr></table><p>Finland &amp; Sweden are separate countries.<sup>[1]</sup></p><script><p>untrusted code</p></script>'),['Finland & Sweden are separate countries.']);
});
const capture={id:1,title:'Test',hash:'capture-1',editions:Object.fromEntries(LANGUAGES.map(lang=>[lang,{status:'available',paragraphs:['Anchored example statement.']}]))};
function assessment(){return {captureHash:'capture-1',author:'test fixture',claims:Array.from({length:4},(_,i)=>({id:`c${i}`,statements:Object.fromEntries(LANGUAGES.map(lang=>[lang,{summary:'Example',quote:'Anchored example'}])),comparisons:PAIRS.map(([a,b])=>({a,b,relation:i===0?'different-framing':'compatible',reason:'Fixture'}))}))};}
test('six pairwise scores and equal-pair aggregate use comparable claim counts',()=>{const a=scoreLanguageArticle(capture,assessment());assert.equal(a.score,25);assert.equal(a.measuredPairs,6);assert.ok(a.pairs.every(p=>p.score===25&&p.comparable===4));});
test('omission and uncertainty are excluded, never treated as disagreement',()=>{const a=assessment();a.claims[0].comparisons.forEach(p=>p.relation='not-comparable');assert.equal(scoreLanguageArticle(capture,a).score,0);a.claims[1].comparisons.forEach(p=>p.relation='uncertain');assert.equal(scoreLanguageArticle(capture,a).score,null);});
test('missing editions and missing assessments remain unknown',()=>{assert.equal(scoreLanguageArticle(capture,null).score,null);const c=structuredClone(capture);delete c.editions.ru;const a=assessment();a.claims.forEach(claim=>{delete claim.statements.ru;claim.comparisons=claim.comparisons.filter(p=>p.b!=='ru');});const r=scoreLanguageArticle(c,a);assert.equal(r.measuredPairs,3);assert.ok(r.pairs.filter(p=>p.b==='ru').every(p=>p.score===null));});
test('stale captures, invented quotes and unanchored pair claims fail closed',()=>{const a=assessment();assert.throws(()=>scoreLanguageArticle({...capture,hash:'new'},a),/stale/);a.claims[0].statements.fi.quote='fabricated quote';assert.throws(()=>scoreLanguageArticle(capture,a),/Unanchored/);});
