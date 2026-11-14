import test from 'node:test';
import assert from 'node:assert/strict';
import {atlasIndexes,eventHorizon,monthRange,windowStart,summarizeMonths} from '../src/atlas-model.mjs';
test('all articles are indexed while the horizon remains bounded and has no dangling edges',()=>{
 const articles=Array.from({length:1000},(_,i)=>({id:i+1,links:i===0?Array.from({length:999},(_,j)=>j+2):[1]})),index=atlasIndexes(articles);
 const h=eventHorizon(index,1,{limit:1000,rings:5});assert.equal(index.byId.size,1000);assert.equal(h.ids.length,160);assert.equal(h.frontier,840);assert.ok(h.links.every(e=>h.ids.includes(Number(e.source))&&h.ids.includes(Number(e.target))));
});
test('expanding crosses the horizon and follows incoming as well as outgoing edges',()=>{
 const index=atlasIndexes([{id:1,links:[2]},{id:2,links:[3]},{id:3,links:[]},{id:4,links:[1]}]);
 assert.deepEqual(eventHorizon(index,1).ids,[1,2,4]);assert.equal(eventHorizon(index,1).frontier,1);assert.equal(eventHorizon(index,1,{rings:2}).ids.length,4);
 assert.deepEqual(eventHorizon(index,999).ids,[]);
});
test('calendar windows include December/January and leap years without annual buckets',()=>{
 assert.deepEqual(monthRange('2023-12','2024-03'),['2023-12','2024-01','2024-02','2024-03']);assert.equal(windowStart('2024-02',3),'2023-12');assert.equal(windowStart('2024-02',12),'2023-03');assert.equal(windowStart('2024-02',60),'2019-03');assert.equal(windowStart('2024-02',0),'');
});
test('rate uses candidate episodes only, distinguishes insufficient from observed zero',()=>{
 assert.equal(summarizeMonths([['2024-01',100,80,0,8,9,10]]).score,0);assert.equal(summarizeMonths([['2024-01',19,18,0,0,0,0]]).score,null);assert.equal(summarizeMonths([['2024-01',100,80,2,8,9,10]]).score,50);
});
