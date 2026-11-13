export const LANGUAGES = ['en', 'fi', 'ru', 'uk', 'de', 'fr', 'es', 'ja'];
export class ApiError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function language(value = 'en') {
  if (!LANGUAGES.includes(value)) throw new ApiError('Choose a supported Wikipedia language.');
  return value;
}
export function parseTopic(value, lang = 'en') {
  lang = language(lang);
  let title = String(value || '').trim();
  if (/^https?:\/\//i.test(title)) {
    let url;
    try { url = new URL(title); } catch { throw new ApiError('That Wikipedia link is not valid.'); }
    const match = url.hostname.match(/^([a-z]+)(?:\.m)?\.wikipedia\.org$/);
    if (!match || url.username || url.password || url.port) throw new ApiError('Paste a Wikipedia article link or enter a topic.');
    lang = language(match[1]);
    try { title = url.pathname.startsWith('/wiki/') ? decodeURIComponent(url.pathname.slice(6)) : (url.pathname === '/w/index.php' ? url.searchParams.get('title') || '' : ''); }
    catch { throw new ApiError('That Wikipedia link contains an invalid article title.'); }
  }
  title = title.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  if (!title || title.length > 250 || /[|\u0000-\u001f]/.test(title)) throw new ApiError('Enter an article title between 1 and 250 characters.');
  return { title, lang };
}
export function compareSets(a, b) {
  const left = new Set(a), right = new Set(b);
  const shared = [...left].filter(id => right.has(id)).length;
  const union = left.size + right.size - shared;
  return { score: union ? Math.round(1000 * shared / union) / 10 : null, shared, union, uniqueA: left.size - shared, uniqueB: right.size - shared };
}
export function sample(items, count) {
  if (items.length <= count) return [...items];
  return Array.from({ length: count }, (_, i) => items[Math.floor(i * items.length / count)]);
}
export async function mapLimit(items, limit, fn) {
  const output = new Array(items.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; output[index] = await fn(items[index], index); }
  }));
  return output;
}
export function chunks(items, size) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}
export function plain(value = '') { return String(value).replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'); }
export function summarizePageviews(values) {
  const days = Object.entries(values || {}).filter(([date, count]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && typeof count === 'number' && Number.isFinite(count) && count >= 0).sort(([a], [b]) => a.localeCompare(b));
  return { pageviews: days.length ? days.reduce((sum, [, count]) => sum + count, 0) : null,
    pageviewDays: days.length, pageviewStart: days[0]?.[0] || null, pageviewEnd: days.at(-1)?.[0] || null };
}
export function articleFromPage(page, lang) {
  return { id: `${lang}:${page.pageid}`, title: page.title, lang, qid: page.pageprops?.wikibase_item || null,
    description: plain(page.description || ''), extract: plain(page.extract || ''),
    url: page.fullurl || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    ...(page.thumbnail?.source ? { thumbnail: page.thumbnail.source } : {}), length: Number(page.length || 0),
    ...(page.touched ? { touched: page.touched } : {}), ...summarizePageviews(page.pageviews) };
}
