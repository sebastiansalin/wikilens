import test from 'node:test';
import assert from 'node:assert/strict';
import {compareWording,summarizeChanges} from '../src/change-summary.mjs';
test('wording comparison isolates Finnish substitutions and insertions without calling either current',()=>{
 assert.deepEqual(compareWording('Suomen senaatti johti joukkoja.','Suomen virallinen senaatti johti joukkoja.'),{same:false,context:'Suomen',first:'',second:'virallinen'});
 assert.equal(compareWording('vapaussota alkoi 1918','sisällissota alkoi 1918').first,'vapaussota');
 assert.equal(compareWording('a a','a').first,'a');
 assert.equal(compareWording('same text','same text').same,true);
 assert.equal(compareWording('','').same,true);
 assert.equal(compareWording('a','x'.repeat(200)).second.length,181);
});
test('summary respects qualification month, separates uncertain patterns and does not mutate input',()=>{
 const episode=(id,date,category='content',section='Introduction')=>({id,qualifiedAt:date,category,section});
 const episodes=[episode('old','2019-12-01'),episode('later','2020-02-02'),episode('first','2020-01-01'),episode('unclear','2020-02-03','uncertain'),episode('future','2021-01-01')];
 const result=summarizeChanges([['2020-01',4],['2020-02',9],['2021-01',30]],episodes,'2020-01','2020-12');
 assert.equal(result.edits,13);assert.deepEqual(result.peak,{month:'2020-02',edits:9});assert.equal(result.contentCount,2);assert.equal(result.otherCount,1);
 assert.deepEqual(result.topics,[['Introduction',2]]);assert.equal(result.latest.id,'later');assert.deepEqual(result.highlights.map(e=>e.id),['later','first']);assert.equal(episodes[0].id,'old');
 const empty=summarizeChanges([],episodes,'2025-01','2025-12');assert.equal(empty.peak,null);assert.equal(empty.latest,null);assert.equal(empty.contentCount,0);
});
