import { ApiError, language, mapLimit, chunks, articleFromPage, plain, summarizePageviews } from './core.mjs';

const USER_AGENT = 'WikiLens/0.1 (Junction2026 knowledge explorer; https://github.com/sebastiansalin/wikilens)';
const requestCache = new Map();
const pending = new Map();
const TTL = 10 * 60_000;
export const LINK_CAP = 500;

export async function wikiRequest(lang, params, fetcher = fetch) {
  const browser = typeof window !== 'undefined' && typeof window.document !== 'undefined';
  const host = lang === 'wikidata' ? 'www.wikidata.org' : `${language(lang)}.wikipedia.org`;
  const url = new URL(`https://${host}/w/api.php`);
  url.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', ...params, ...(browser ? { origin: '*' } : {}) }).toString();
  const key = url.href;
  const cached = requestCache.get(key);
  if (cached && cached.expires > Date.now()) return structuredClone(cached.data);
  if (pending.has(key)) return pending.get(key);
  const promise = (async () => {
    let response;
    const longQuery = url.href.length > 7000;
    const requestUrl = longQuery ? new URL(url.origin + url.pathname) : url;
    try { response = await fetcher(requestUrl, {
      headers: { ...(!browser ? { 'User-Agent': USER_AGENT } : {}), Accept: 'application/json', ...(longQuery ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      ...(longQuery ? { method: 'POST', body: url.searchParams.toString() } : {}),
      signal: AbortSignal.timeout(12_000),
    }); }
    catch { throw new ApiError('Wikipedia could not be reached. Please try again in a moment.', 502); }
    if (!response.ok) throw new ApiError(response.status === 429 ? 'Wikipedia is receiving too many requests. Please wait a moment.' : 'Wikipedia is temporarily unavailable. Please try again.', response.status === 429 ? 429 : 502);
    let data;
    try { data = await response.json(); } catch { throw new ApiError('Wikipedia returned an unreadable response. Please try again.', 502); }
    if (data.error) throw new ApiError(data.error.code === 'maxlag' ? 'Wikipedia is busy. Please try again shortly.' : 'Wikipedia could not complete this request.', 502);
    if (requestCache.size > 300) requestCache.delete(requestCache.keys().next().value);
    requestCache.set(key, { data, expires: Date.now() + TTL });
    return structuredClone(data);
  })();
  pending.set(key, promise);
  try { return await promise; } finally { pending.delete(key); }
}

export async function searchTopics(q, lang, request = wikiRequest) {
  language(lang);
  const query = String(q || '').trim();
  if (query.length < 2) return { results: [] };
  if (query.length > 250) throw new ApiError('Search is limited to 250 characters.');
  const data = await request(lang, { list: 'search', srsearch: query, srnamespace: '0', srlimit: '8', srprop: 'snippet' });
  return { results: (data.query?.search || []).map(item => ({ title: item.title, description: plain(item.snippet), pageid: item.pageid })) };
}

export async function getArticle(title, lang, request = wikiRequest) {
  const data = await request(lang, { prop: 'pageprops|extracts|info|pageimages|description|pageviews', titles: title, redirects: '1', exintro: '1', explaintext: '1', exchars: '1100', inprop: 'url', piprop: 'thumbnail', pithumbsize: '600', pvipdays: '30' });
  const page = data.query?.pages?.find(item => !item.missing && !item.invalid && item.ns === 0);
  if (!page) throw new ApiError('No article was found in this language. Try another title or language.', 404);
  return articleFromPage(page, lang);
}

// Every continuation token is followed until the limit. Completeness is never inferred from the count alone.
export async function getLinks(title, lang, kind = 'outgoing', request = wikiRequest, cap = LINK_CAP) {
  const found = new Map(); let continuation; let complete = false;
  for (let batch = 0; batch < 5 && found.size < cap; batch++) {
    const remaining = Math.min(500, cap - found.size);
    const params = kind === 'incoming'
      ? { list: 'backlinks', bltitle: title, blnamespace: '0', blfilterredir: 'nonredirects', bllimit: String(remaining) }
      : { prop: 'links', titles: title, plnamespace: '0', pllimit: String(remaining) };
    const data = await request(lang, { ...params, ...continuation });
    const records = kind === 'incoming' ? (data.query?.backlinks || []) : (data.query?.pages || []).flatMap(page => page.links || []);
    for (const item of records) if (item.title && item.title !== title) found.set(item.title, item);
    continuation = data.continue;
    if (!continuation) { complete = true; break; }
  }
  return { titles: [...found.keys()].slice(0, cap), complete: complete && found.size <= cap };
}

export async function metadata(titles, lang, request = wikiRequest) {
  const results = await mapLimit(chunks([...new Set(titles)], 50), 3, async batch => {
    const data = await request(lang, { titles: batch.join('|'), prop: 'pageprops|info|description', redirects: '1', inprop: 'url' });
    const pages = (data.query?.pages || []).filter(page => !page.missing && !page.invalid && page.ns === 0).map(page => articleFromPage(page, lang));
    const aliases = new Map([...(data.query?.normalized || []), ...(data.query?.redirects || [])].map(item => [item.from, item.to]));
    const byTitle = new Map(pages.map(page => [page.title, page]));
    return batch.map(original => {
      let resolved = original; const visited = new Set();
      while (aliases.has(resolved) && !visited.has(resolved)) { visited.add(resolved); resolved = aliases.get(resolved); }
      return { original, article: byTitle.get(resolved) || null };
    });
  });
  return results.flat();
}

export async function getCrossLinks(articles, lang, request = wikiRequest) {
  if (articles.length < 2) return [];
  const titles = articles.map(article => article.title);
  const ids = new Map(articles.map(article => [article.title, article.id]));
  const links = new Map();
  // Both source and target filters are capped at 50 by MediaWiki. This keeps payload and runtime bounded.
  await mapLimit(chunks(titles, 50), 2, async sourceTitles => {
    for (const targetTitles of chunks(titles, 50)) {
      let continuation;
      for (let batch = 0; batch < 3; batch++) {
        const data = await request(lang, { titles: sourceTitles.join('|'), prop: 'links', plnamespace: '0', pltitles: targetTitles.join('|'), pllimit: '500', ...continuation });
        for (const page of data.query?.pages || []) for (const target of page.links || []) {
          const sourceId = ids.get(page.title), targetId = ids.get(target.title);
          if (sourceId && targetId && sourceId !== targetId) links.set(`${sourceId}>${targetId}`, { source: sourceId, target: targetId });
        }
        continuation = data.continue;
        if (!continuation) break;
      }
    }
  });
  return [...links.values()];
}

export async function getSitelinks(qid, request = wikiRequest) {
  if (!/^Q\d+$/.test(qid || '')) return {};
  const data = await request('wikidata', { action: 'wbgetentities', ids: qid, props: 'sitelinks' });
  return data.entities?.[qid]?.sitelinks || {};
}

// Request pageview history only for the displayed sample; querying every link's readership is expensive.
export async function getPageviews(articles, lang, request = wikiRequest) {
  const output = new Map();
  await mapLimit(chunks([...new Map(articles.map(article => [article.id, article])).values()], 20), 2, async batch => {
    let continuation;
    const counts = new Map();
    for (let page = 0; page < 3; page++) {
      const data = await request(lang, { prop: 'pageviews', titles: batch.map(article => article.title).join('|'), redirects: '1', pvipdays: '30', ...continuation });
      for (const article of data.query?.pages || []) {
        if (article.missing || article.invalid || article.ns !== 0) continue;
        const id = `${lang}:${article.pageid}`;
        counts.set(id, { ...counts.get(id), ...article.pageviews });
      }
      continuation = data.continue;
      if (!continuation) break;
    }
    for (const [id, values] of counts) output.set(id, summarizePageviews(values));
  });
  return output;
}

// One API response per article, with metadata emitted by the generator itself. A continuation
// token makes this a sampled adjacency list, never a declaration that remaining links do not exist.
export async function pathAdjacency(article, direction, request = wikiRequest) {
  const params = direction === 'outgoing'
    ? { generator: 'links', titles: article.title, gplnamespace: '0', gpllimit: '250', redirects: '1' }
    : { generator: 'backlinks', gbltitle: article.title, gblnamespace: '0', gblfilterredir: 'nonredirects', gblredirect: '1', gbllimit: '125' };
  const data = await request(article.lang, { ...params, prop: 'info|pageprops|description', inprop: 'url' });
  const articles = (data.query?.pages || []).filter(page => !page.missing && !page.invalid && !page.redirect && page.ns === 0).map(page => articleFromPage(page, article.lang));
  return { articles, links: articles.filter(other => other.id !== article.id).map(other => direction === 'outgoing'
    ? { source: article.id, target: other.id } : { source: other.id, target: article.id }), complete: !data.continue };
}
