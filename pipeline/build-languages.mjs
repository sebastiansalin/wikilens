import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {LANGUAGE_METHOD,scoreLanguageArticle} from './language-model.mjs';
import {assessments} from './language-demo-labels.mjs';

export function buildLanguages(capture) {
 const annotated=new Map(assessments.map(a=>[a.id,a]));
 const articles=capture.articles.map(article=>{
  const {hash,...body}=article;
  if(createHash('sha256').update(JSON.stringify(body)).digest('hex')!==hash)throw Error(`Capture integrity failure: ${article.title}`);
  const result=scoreLanguageArticle(article,annotated.get(article.id));
  // Raw introductions are downloadable separately; the UI needs anchored excerpts.
  result.editions=Object.fromEntries(Object.entries(result.editions).map(([lang,{paragraphs,...metadata}])=>[lang,metadata]));
  return result;
 });
 return {...capture,method:LANGUAGE_METHOD,articles,assessmentType:'AI-assisted annotations of selected introduction claims; no independent validation',formula:'Pair: 100 × (framing differences + conflicting claims) / comparable axes. Minimum 3 axes per pair. Overall: equal mean of at least 3 measured pairs. Omissions and uncertainty excluded.'};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const capture=JSON.parse(await fs.readFile('public/data/languages/capture.json','utf8'));
 const result=buildLanguages(capture);
 await fs.writeFile('public/data/languages/index.json',JSON.stringify(result));
 console.log(JSON.stringify(result.articles.map(a=>({title:a.title,score:a.score,pairs:a.measuredPairs,axes:a.claims.length})),null,2));
}
