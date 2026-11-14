import test from 'node:test';
import assert from 'node:assert/strict';
import {jsDistance,extractProse,conceptWeights,compareNeighborhoodArticle,selectNeighborhood,digest,METHOD} from '../pipeline/language-neighborhood.mjs';
import {buildNeighborhood} from '../pipeline/capture-neighborhood.mjs';
const map=entries=>new Map(entries);
test('distance is symmetric, bounded and invariant to total scale',()=>{
 const a=map([['Q1',1],['Q2',3]]),b=map([['Q1',2],['Q3',2]]);
 assert.equal(jsDistance(a,a),0);assert.equal(jsDistance(a,map([['Q1',2],['Q2',6]])),0);
 assert.equal(jsDistance(a,b),jsDistance(b,a));assert.equal(jsDistance(map([['Q1',1]]),map([['Q2',1]])),100);assert.equal(jsDistance(new Map(),a),null);
});
test('prose excludes infoboxes, superscripts and scripts; normalizes linked titles',()=>{
 const result=extractProse('<table><tr><td><p>Ignore this sufficiently long infobox paragraph.</p></td></tr></table><p>This paragraph mentions <a href="/wiki/Winter_War#Cause">Winter War</a> and <sup><a href="/wiki/Bad">citation</a></sup> in its discussion.</p><li id="cite_note-1"><a href="https://www.example.com/a?x=1&amp;y=2">Source</a></li><a href="https://unrelated.test">Other</a>');
 assert.equal(result.paragraphs.length,1);assert.deepEqual(result.paragraphs[0].links,['Winter War']);assert.deepEqual(result.references,[{url:'https://www.example.com/a?x=1&y=2',domain:'example.com'}]);
});
test('one concept per paragraph, aliases collapse, first three paragraphs have double weight',()=>{
 const e={paragraphs:[{text:'One',links:['A','Alias','Self']},{text:'Two',links:[]},{text:'Three',links:[]},{text:'Four',links:['A']}],identities:{A:{qid:'Q1'},Alias:{qid:'Q1'},Self:{qid:'Q0'}}};
 const result=conceptWeights(e,'Q0');assert.equal(result.weights.get('Q1'),3);assert.equal(result.weights.has('Q0'),false);assert.equal(result.evidence.get('Q1').quote,'One');
});
function fixture(){const edition={status:'available',paragraphs:[{text:'Original source words',links:['A','B','C','D','E']}],identities:Object.fromEntries(['A','B','C','D','E'].map((s,i)=>[s,{qid:'Q'+(i+1)}])),references:[],sections:[],url:'https://fi.wikipedia.org/w/index.php?oldid=1'};return {id:1,title:'Test',qid:'Q99',editions:Object.fromEntries(['fi','en','uk','ru'].map(l=>[l,structuredClone(edition)]))};}
test('six valid identical pairs score zero; missing and low-coverage editions do not become agreement',()=>{
 const a=fixture();assert.equal(compareNeighborhoodArticle(a).score,0);assert.equal(compareNeighborhoodArticle(a).measuredPairs,6);
 a.editions.ru={status:'missing'};a.editions.uk={status:'unavailable'};const result=compareNeighborhoodArticle(a);assert.equal(result.score,null);assert.equal(result.measuredPairs,1);assert.equal(result.pairs.find(p=>p.b==='ru').score,null);
 const b=fixture();for(const l of ['ru','uk','en'])b.editions[l].identities={};assert.equal(compareNeighborhoodArticle(b).measuredPairs,0);
});
test('sources stay separate from the concept score and missing sources stay null',()=>{
 const a=fixture();a.editions.fi.references=[{domain:'example.com',url:'https://example.com'}];const p=compareNeighborhoodArticle(a).pairs[0];assert.equal(p.score,0);assert.equal(p.sources.overlap,null);
 assert.deepEqual(extractProse('<li id="cite&#95;note-1"><a href="https://example.com/evidence">Source</a></li>').references,[{url:'https://example.com/evidence',domain:'example.com'}]);
});
test('neighborhood stays within M, breadth first, deterministic and connected',()=>{
 const articles=[{id:1,title:'Talvisota',links:[2,3,999]},{id:2,title:'Two',links:[4]},{id:3,title:'Three',links:[]},{id:4,title:'Four',links:[]}];
 const selected=selectNeighborhood(articles,'Talvisota',4);assert.deepEqual(selected.map(a=>a.id),[1,2,3,4]);assert.equal(selected[3].depth,2);assert.equal(selected[3].parent,2);assert.deepEqual(selectNeighborhood([...articles].reverse(),'Talvisota',4),selected);assert.throws(()=>selectNeighborhood(articles,'Talvisota',5));
});
test('builder rejects a modified capture rather than silently reusing provenance',async()=>{
 const article=fixture();article.hash=digest(article);const capture={schemaVersion:2,method:METHOD,selection:{count:1},articles:[article]};assert.equal((await buildNeighborhood(capture)).articles[0].score,0);article.title='Modified';await assert.rejects(buildNeighborhood(capture),/hash mismatch/);
});
