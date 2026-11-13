// Directed bidirectional BFS. Forward parents follow outgoing links; backward parents follow
// incoming links, so reconstructed edges always point from the requested source to destination.
export async function boundedDirectedPath(from, to, readLayer, {
  maxDepth = 6, maxVisited = 1500, engine, scope,
} = {}) {
  if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 6) throw new Error('Path depth must be between 1 and 6.');
  const articles = new Map([[from.id, from], [to.id, to]]);
  const forward = { frontier: [from.id], depth: 0, parents: new Map([[from.id, null]]), distances: new Map([[from.id, 0]]) };
  const backward = { frontier: [to.id], depth: 0, parents: new Map([[to.id, null]]), distances: new Map([[to.id, 0]]) };
  let partial = false;
  const notices = [];
  const result = (status, route = [], complete = false) => ({
    status, articles: route.map(id => articles.get(id)),
    links: route.slice(1).map((target, index) => ({ source: route[index], target })),
    hops: route.length ? route.length - 1 : null, engine, scope,
    visited: articles.size, complete, notices: [...new Set(notices)],
  });
  const routeThrough = meeting => {
    const left = [], right = [];
    for (let id = meeting; id != null; id = forward.parents.get(id)) left.push(id);
    for (let id = backward.parents.get(meeting); id != null; id = backward.parents.get(id)) right.push(id);
    return [...left.reverse(), ...right];
  };
  if (from.id === to.id) return result('found', [from.id], true);

  while (forward.frontier.length && backward.frontier.length && forward.depth + backward.depth < maxDepth) {
    const outgoing = forward.frontier.length <= backward.frontier.length;
    const current = outgoing ? forward : backward, other = outgoing ? backward : forward;
    let layer;
    try { layer = await readLayer(current.frontier.map(id => articles.get(id)), outgoing ? 'outgoing' : 'incoming', { remainingNodes: maxVisited - articles.size }); }
    catch { notices.push('An adjacency request could not be completed. The search result is limited.'); return result('limited'); }
    if (!layer.complete) partial = true;
    if (layer.notice) notices.push(layer.notice);
    const records = new Map((layer.articles || []).map(article => [article.id, article]));
    const frontierIds = new Set(current.frontier), next = [];
    let meeting = null, bestLength = Infinity, clipped = false;
    for (const edge of layer.links || []) {
      const parent = outgoing ? edge.source : edge.target;
      const neighbour = outgoing ? edge.target : edge.source;
      if (!frontierIds.has(parent) || parent === neighbour) continue;
      if (!articles.has(neighbour)) {
        if (articles.size >= maxVisited) { clipped = true; continue; }
        const article = records.get(neighbour);
        if (!article) { partial = true; continue; }
        articles.set(neighbour, article);
      }
      if (!current.parents.has(neighbour)) {
        current.parents.set(neighbour, parent);
        current.distances.set(neighbour, current.distances.get(parent) + 1);
        next.push(neighbour);
      }
      if (other.parents.has(neighbour)) {
        const length = current.distances.get(neighbour) + other.distances.get(neighbour);
        if (length < bestLength) { meeting = neighbour; bestLength = length; }
      }
    }
    current.frontier = next;
    current.depth++;
    if (clipped) { partial = true; notices.push(`Search stopped admitting new articles at the ${maxVisited.toLocaleString('en-US')}-article limit.`); }
    if (meeting && bestLength <= maxDepth) {
      const route = routeThrough(meeting);
      // A direct link is necessarily minimal, even when other same-layer edges were capped.
      const complete = !partial || route.length <= 2;
      notices.push(complete
        ? 'This is a shortest directed route within the stated search scope.'
        : 'A directed route was found, but incomplete adjacency data means a shorter route may exist.');
      return result('found', route, complete);
    }
    if (clipped || layer.stop) { notices.push('The search reached its resource budget. No absence of a Wikipedia route is implied.'); return result('limited'); }
  }
  if (!forward.frontier.length || !backward.frontier.length) {
    if (partial) { notices.push('Some link lists were incomplete, so no route could be established within the observed data.'); return result('limited'); }
    notices.push('No directed route exists in the fully explored search scope.');
    return result('not-found', [], true);
  }
  notices.push(`No route was established within ${maxDepth} hops. Longer routes were not searched.`);
  return result('limited');
}
