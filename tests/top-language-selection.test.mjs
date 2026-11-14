import test from 'node:test';
import assert from 'node:assert/strict';
import {selectTopArticles} from '../pipeline/top-language-selection.mjs';
const article=(id,content,episodes,revisions=content,eligible=true)=>({id,title:`Page ${id}`,eligible,months:[['2026-10',revisions,content,episodes,0,0,0]]});
test('top sample uses all-history score, excludes unknowns, preserves inputs and resolves ties deterministically',()=>{
 const rows=[article(9,100,10),article(2,100,10),article(3,500,25),article(4,10,20,10),article(5,100,99,100,false)];
 const before=JSON.stringify(rows),result=selectTopArticles(rows,3);
 assert.deepEqual(result.map(a=>a.id),[2,9,3]);assert.deepEqual(result.map(a=>a.rank),[1,2,3]);
 assert.equal(JSON.stringify(rows),before);assert.deepEqual(selectTopArticles([...rows].reverse(),3),result);
 assert.throws(()=>selectTopArticles(rows,4),/Not enough/);
});
test('ties follow atlas ordering: episode count, revisions, page ID',()=>{
 const rows=[article(2,20,0,40),article(1,20,0,60)];
 assert.equal(selectTopArticles(rows,1)[0].id,1);
 assert.throws(()=>selectTopArticles(rows,0));
});
