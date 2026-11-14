import {summarizeMonths} from '../src/atlas-model.mjs';
export const SELECTION_POLICY='Top 100 eligible M articles by all-history editing disagreement index (v2.2), descending. Ties: possible disputes, revisions, then ascending page ID. No replacement for missing language editions. Independent of the monthly slider.';
export function selectTopArticles(articles,count=100){
 if(!Number.isSafeInteger(count)||count<1)throw Error('Count must be a positive integer');
 const ranked=articles.filter(a=>a.eligible).map(a=>({article:a,summary:summarizeMonths(a.months)})).filter(a=>a.summary.score!==null).sort((a,b)=>b.summary.score-a.summary.score||b.summary.episodeCount-a.summary.episodeCount||b.summary.revisions-a.summary.revisions||a.article.id-b.article.id);
 if(ranked.length<count)throw Error('Not enough eligible articles');
 return ranked.slice(0,count).map(({article:a,summary:s},i)=>({id:a.id,title:a.title,rank:i+1,editingScore:s.score}));
}
