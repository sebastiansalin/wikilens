export const LANGUAGE_METHOD = 'wikilens-language-claims-v1';
export const LANGUAGES = ['fi', 'en', 'uk', 'ru'];
export const PAIRS = LANGUAGES.flatMap((a, i) => LANGUAGES.slice(i + 1).map(b => [a, b]));
export const RELATIONS = ['compatible', 'different-framing', 'conflicting-claim', 'not-comparable', 'uncertain'];

// Text only: HTML never enters the UI. Extract paragraph prose outside infoboxes
// and navigation. This is a lead-only comparison, not a full-article comparison.
export function leadParagraphs(html) {
  let text = String(html || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  // Remove nested tables from the inside out.
  for (let i = 0; i < 20 && /<table\b/i.test(text); i++) {
    const next = text.replace(/<table\b[^>]*>(?:(?!<table\b)[\s\S])*?<\/table>/gi, '');
    if (next === text) break;
    text = next;
  }
  const decode = value => value.replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, '').replace(/<[^>]+>/g, '')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => {const n=code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code);return n<=0x10ffff?String.fromCodePoint(n):'';})
    .replace(/&(nbsp|amp|quot|apos|lt|gt|ndash|mdash|hellip);/g, (_, key) => ({nbsp:' ',amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',ndash:'-',mdash:'-',hellip:'.'})[key])
    .replace(/\s+/g, ' ').trim();
  return [...text.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(m => decode(m[1])).filter(p => p.length > 30);
}

export function scoreLanguageArticle(capture, assessment) {
  const available = LANGUAGES.filter(lang => capture.editions[lang]?.status === 'available');
  if (!assessment) return {...capture, status:'not-assessed', score:null, pairs:[], claims:[]};
  if (assessment.captureHash !== capture.hash) throw Error(`Assessment is stale: ${capture.title}`);
  if (new Set(assessment.claims.map(c=>c.id)).size !== assessment.claims.length) throw Error('Duplicate claim axis');
  for (const claim of assessment.claims) {
    for (const [lang, statement] of Object.entries(claim.statements)) {
      if (!LANGUAGES.includes(lang)) throw Error('Unsupported language');
      const edition=capture.editions[lang];
      if (!edition || edition.status!=='available' || !statement.quote || !edition.paragraphs.some(p=>p.includes(statement.quote))) throw Error(`Unanchored evidence: ${capture.title}/${claim.id}/${lang}`);
      if (!statement.summary?.trim()) throw Error('Statement summary is required');
    }
    const seen=new Set();
    for (const pair of claim.comparisons) {
      const key=pair.a+':'+pair.b;
      if(!PAIRS.some(([a,b])=>a===pair.a&&b===pair.b)||seen.has(key)||!RELATIONS.includes(pair.relation)||!pair.reason?.trim()) throw Error('Invalid pair annotation');
      if(!['not-comparable','uncertain'].includes(pair.relation)&&(!claim.statements[pair.a]||!claim.statements[pair.b])) throw Error('Comparable claim needs two anchored statements');
      seen.add(key);
    }
  }
  const pairs=PAIRS.map(([a,b])=>{
    const annotations=assessment.claims.map(claim=>({claimId:claim.id,...(claim.comparisons.find(p=>p.a===a&&p.b===b)||{a,b,relation:'not-comparable',reason:'No paired assessment.'})}));
    const comparable=annotations.filter(p=>['compatible','different-framing','conflicting-claim'].includes(p.relation));
    const framing=comparable.filter(p=>p.relation==='different-framing').length;
    const conflicts=comparable.filter(p=>p.relation==='conflicting-claim').length;
    const eligible=available.includes(a)&&available.includes(b)&&comparable.length>=3;
    return {a,b,score:eligible?Math.round(100*(framing+conflicts)/comparable.length):null,comparable:comparable.length,framing,conflicts,uncompared:assessment.claims.length-comparable.length,annotations};
  });
  const measured=pairs.filter(p=>p.score!==null);
  // Each language pair has equal weight. Keep partial coverage explicit.
  const score=measured.length>=3?Math.round(measured.reduce((n,p)=>n+p.score,0)/measured.length):null;
  return {...capture,status:score===null?'insufficient-comparison':'assessed',score,pairs,measuredPairs:measured.length,claims:assessment.claims,assessment:{author:assessment.author,reviewStatus:'unvalidated',scope:'captured introductions only',summary:assessment.summary}};
}
