/** Compare two genuinely independent review exports. Never manufactures labels. */
import {readFile,writeFile} from 'node:fs/promises';
export const categories=['content','cleanup','maintenance','uncertain','no-detected-episode'];
export function agreement(pairs){
 if(!pairs.length)return {n:0,agreement:null,kappa:null};
 const countsA=new Map(),countsB=new Map();let same=0;
 for(const [a,b] of pairs){if(a===b)same++;countsA.set(a,(countsA.get(a)||0)+1);countsB.set(b,(countsB.get(b)||0)+1);}
 const observed=same/pairs.length,expected=categories.reduce((s,c)=>s+(countsA.get(c)||0)*(countsB.get(c)||0)/pairs.length**2,0);
 return {n:pairs.length,agreement:observed,kappa:expected===1?null:(observed-expected)/(1-expected)};
}
export function evaluate(a,b,pack){
 if(!a.reviewer||!b.reviewer||a.reviewer===b.reviewer)throw Error('Two different independent reviewer aliases are required');
 if(a.version!==b.version||a.version!==pack.version)throw Error('Review versions differ');
 const results={version:pack.version,reviewers:[a.reviewer,b.reviewer],warning:'Stratified review sample; not a population accuracy estimate. Candidate episodes and random transitions have different units. Disagreements and uncertain consensus are excluded from binary checks, with coverage reported.',groups:{}};
 for(const split of ['development','heldout'])for(const kind of ['candidate','random-transition']){
  const sample=Object.entries(pack.predictions).filter(([,p])=>p.split===split&&p.kind===kind),pairs=[],consensus=[];
  for(const [id,p] of sample){const A=a.labels?.[id]?.category,B=b.labels?.[id]?.category;if(!A||!B)continue;if(!categories.includes(A)||!categories.includes(B))throw Error('Unknown review category');pairs.push([A,B]);if(A===B&&A!=='uncertain')consensus.push({label:A,prediction:p.category});}
  let tp=0,fp=0,tn=0,fn=0;for(const c of consensus){const yes=c.label==='content',pred=c.prediction==='content';if(yes&&pred)tp++;else if(!yes&&pred)fp++;else if(yes)fn++;else tn++;}
  results.groups[`${split}/${kind}`]={sample:sample.length,reviewedByBoth:pairs.length,consensusWithoutUncertain:consensus.length,...agreement(pairs),contentConfusion:{tp,fp,tn,fn},samplePrecision:tp+fp?tp/(tp+fp):null,sampleRecall:tp+fn?tp/(tp+fn):null};
 }
 return results;
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/evaluate-review.mjs')){
 const [first,second,out='.local/review-evaluation.json']=process.argv.slice(2);if(!first||!second)throw Error('Usage: node pipeline/evaluate-review.mjs reviewer-a.json reviewer-b.json [output.json]');
 const [a,b,pack]=await Promise.all([first,second,'docs/qa/review-predictions.json'].map(p=>readFile(p,'utf8').then(JSON.parse)));
 const result=evaluate(a,b,pack);await writeFile(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
