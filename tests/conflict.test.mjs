import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreArticle, wikiLinks, qualifyEpisodes } from '../pipeline/score.mjs';
function history(states, users = []) {
  return states.map((sha1,i)=>({page_id:42,title:'Example',rev_id:i+1,parent_id:i,timestamp:new Date(Date.UTC(2020,0,1,i)).toISOString(),user:users[i]||`editor-${i}`,sha1,text:`This is a sufficiently long paragraph about a historical topic with enough context for the paragraph detector. ${sha1}`,comment:''}));
}
const padding = Array.from({length:20},(_,i)=>`unique-${i}`);
test('a busy article with only constructive edits has zero observed conflict',()=>{
  const result=scoreArticle(history(padding));assert.equal(result.score,0);assert.equal(result.disputedRevisions,0);
});
test('repeated reciprocal restores qualify; one cleanup does not',()=>{
  const rows=history([...padding,'A','B','A','B','A'],[...padding.map(()=> 'builder'),'alice','bob','alice','bob','alice']);
  const result=scoreArticle(rows);assert.ok(result.score>0);assert.equal(result.disputedRevisions,3);
  const one=scoreArticle(history([...padding,'A','B','A']));assert.equal(one.score,0);
});
test('noops, self-reverts and duplicate imports do not inflate disputes',()=>{
  const rows=history([...padding,'A','B','A','A','B','A'],Array(26).fill('alice'));
  const result=scoreArticle([...rows,rows[4]]);assert.equal(result.score,0);assert.equal(result.coverage.duplicates,1);assert.equal(result.coverage.noops,1);
});
test('missing hashes, identities and tiny histories are unknown, not peaceful',()=>{
  assert.equal(scoreArticle([]).score,null);
  assert.equal(scoreArticle(history(['a','b','a'])).score,null);
  assert.equal(scoreArticle(history(padding).map(r=>({...r,sha1:null}))).score,null);
  assert.equal(scoreArticle(history(padding).map(r=>({...r,user:null}))).score,null);
});
test('parent gaps stop restores from crossing unobserved history',()=>{
  const rows=history([...padding,'A','B','A','B','A'],[...padding,'alice','bob','alice','bob','alice']);
  rows[22].parent_id=999;rows[24].parent_id=998;
  const result=scoreArticle(rows);assert.equal(result.score,0);assert.equal(result.coverage.parentGaps,2);
});
test('years-apart mutual reverts do not become an episode',()=>{
  const events=[0,1,2].map((i)=>({revision:i,actor:i%2?'b':'a',target:i%2?'a':'b',time:i*365*86400000}));
  assert.equal(qualifyEpisodes(events).qualified.size,0);
});
test('one mass revert targeting many authors still counts as one revision',()=>{
  const events=[{revision:1,actor:'a',target:'b',time:1},{revision:1,actor:'a',target:'b',time:1},{revision:2,actor:'b',target:'a',time:2}];
  assert.equal(qualifyEpisodes(events).qualified.size,0);
});
test('conflicting duplicate IDs fail instead of silently changing results',()=>{
  const rows=history(padding);assert.throws(()=>scoreArticle([...rows,{...rows[0],sha1:'changed'}]),/Conflicting duplicate/);
});
test('cleanup comment discounts evidence without treating anonymous users as vandals',()=>{
  const rows=history([...padding,'A','B','A','B','A'],[...padding,'alice','bob','alice','bob','alice']);
  const normal=scoreArticle(rows);const discounted=scoreArticle(rows.map(r=>({...r,comment:'vandalism reverted'})));
  assert.ok(discounted.score<normal.score);
  assert.equal(scoreArticle(rows.map(r=>({...r,anonymous:true}))).score,normal.score);
});
test('passage returns require repeated removal and restoration, with source revisions',()=>{
  const p='A sufficiently long historical passage that is removed and later restored by another contributor several times.';
  const rows=history(padding);rows.forEach((r,i)=>{r.text=i>=15 && i%2?p:'Another equally long passage which describes a different detail and remains independently verifiable in history.';r.user=i%2?'a':'b';});
  const result=scoreArticle(rows);assert.ok(result.passages.some(x=>x.text===p&&x.returns>=2));assert.ok(result.passages[0].evidence[0].removedRevision);
});
test('links normalize spaces and anchors, omit non-article and hidden markup',()=>{
  assert.deepEqual(wikiLinks('[[talvi_sota#A|name]] [[Talvi sota]] [[Luokka:History]] <!-- [[Fake]] --> <nowiki>[[Hidden]]</nowiki>'),['Talvi sota']);
});
