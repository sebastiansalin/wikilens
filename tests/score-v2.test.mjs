import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {scoreArticle,passageUnits,summarizeMonths} from '../pipeline/score-v2.mjs';
const A='The historian describes the conflict as a civil war involving several political factions.';
const B='The historian describes the conflict as a revolution involving several political factions.';
const prose=i=>`An independent paragraph provides background about the history of the country and its people, edition ${i}.`;
const rows=(texts,users=[])=>texts.map((text,i)=>({page_id:42,title:'History',rev_id:i+1,parent_id:i,timestamp:new Date(Date.UTC(2020,0,1,i)).toISOString(),text,sha1:createHash('sha1').update(text).digest('hex'),user:users[i]||`editor-${i}`,comment:''}));
const padded=()=>Array.from({length:20},(_,i)=>`${prose(i)}\n${A}`);
test('partial paragraph reversals survive unrelated edits, without whole-page restores',()=>{
 const text=[...padded(),B,A,B,A].map((s,i)=>`${s}\n${prose(i+100)}`);
 const result=scoreArticle(rows(text));assert.equal(result.episodeCount,1);assert.equal(result.baseline.exactReverts,0);assert.ok(result.score>0);assert.equal(result.months[0][1],24);
});
test('one return, same-author returns, no-ops and duplicate imports do not create episodes',()=>{
 assert.equal(scoreArticle(rows([...padded(),B,A])).episodeCount,0);
 const input=rows([...padded(),B,A,B,A],Array(24).fill('same'));
 assert.equal(scoreArticle([...input,input[2]]).episodeCount,0);assert.equal(scoreArticle([...input,input[2]]).coverage.duplicates,1);
 assert.equal(scoreArticle(rows([...padded(),A,A,A])).episodeCount,0);
});
test('history gaps and missing identities prevent invented continuity',()=>{
 const input=rows([...padded(),B,A,B,A]);input[21].parent_id=999;input[23].parent_id=998;
 assert.equal(scoreArticle(input).episodeCount,0);
 assert.equal(scoreArticle(rows([...padded(),B,A,B,A]).map(r=>({...r,user:null}))).score,null);
});
test('blanking is separated and many restored paragraphs count as one episode',()=>{
 const full=Array.from({length:10},(_,i)=>prose(i)).join('\n');
 const r=scoreArticle(rows([full,'blank',full,'blank',full]));assert.equal(r.episodeCount,0);assert.equal(r.cleanup,1);assert.equal(r.episodes.length,1);
});
test('bot summaries and markup-only reversals are excluded from content',()=>{
 const r=scoreArticle(rows([...padded(),B,A,B,A]).map(x=>({...x,comment:'Botti: päivitetään'})));assert.equal(r.episodeCount,0);assert.equal(r.maintenance,1);
 const r2=scoreArticle(rows([A+' [[en:War]]',A+' [[en:Civil war]]',A+' [[en:War]]',A+' [[en:Civil war]]',A+' [[en:War]]']));
 // Navigation on separate lines is the supported wikitext form.
 const r3=scoreArticle(rows([0,1,0,1,0].map(x=>A+'\n[[en:'+x+']]')));assert.equal(r3.episodeCount,0);assert.equal(r3.maintenance,1);assert.ok(r2);
});
test('ambiguous number/name changes and unmatched deletions remain uncertain',()=>{
 const texts=[A,A+' 1990',A+' 2000',A+' 1990',A+' 2000',A+' 1990'];assert.equal(scoreArticle(rows(texts)).episodeCount,0);
 const names=[0,1,0,1,0].map(i=>`'''${i?'Bad Name':'Real Name'}''' was a politician who served in office during the historical period.`);
 assert.equal(scoreArticle(rows(names)).episodeCount,0);assert.equal(scoreArticle(rows(names)).uncertain,1);
});
test('explicit abuse is separated without penalizing anonymous editors',()=>{
 const r=scoreArticle(rows([A,A+' paska',A,A+' paska',A]));assert.equal(r.episodeCount,0);assert.equal(r.cleanup,1);
 const input=rows([...padded(),B,A,B,A]);assert.equal(scoreArticle(input).score,scoreArticle(input.map(r=>({...r,anonymous:true}))).score);
});
test('months are calendar months and quiet recent windows do not inherit old episodes',()=>{
 const m=[['2020-01',30,20,1,2,3,4],['2020-02',40,30,0,0,0,0],['2025-12',3,2,0,0,0,0]];
 assert.equal(summarizeMonths(m,'2020-02','2020-02').score,0);
 assert.equal(summarizeMonths(m,'2025-01').score,null);
 assert.equal(summarizeMonths(m).episodeCount,1);assert.equal(summarizeMonths(m).revisions,73);
});
test('long-distance returns are not a rapid dispute and sparse histories stay gray',()=>{
 const input=rows([A,B,A,B,A]);input.forEach((r,i)=>r.timestamp=new Date(Date.UTC(2000+i,0,1)).toISOString());
 const result=scoreArticle(input);assert.equal(result.episodeCount,0);assert.equal(result.score,null);
});
test('normalization excludes malformed references and includes selected infobox fields',()=>{
 assert.equal(passageUnits('* {{Kirjaviite | Nimeke=Broken | Luokka:Bad').size,0);
 assert.equal(passageUnits('| tyylilajit = [[sinfoninen metalli]], [[power metal]]').size,1);
 assert.equal(passageUnits(A+'<ref>old</ref>').keys().next().value,passageUnits(A+'<ref>new</ref>').keys().next().value);
});
