/** Structural measurements of the loaded graph, never claims about all of Wikipedia. */
const finiteCount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function walkProfile(start, adjacency, depth) {
  const scores = new Map();
  let frontier = new Map([[start, 1]]);
  let weight = 1;
  for (let hop = 1; hop <= depth; hop++) {
    const next = new Map();
    for (const [id, mass] of frontier) {
      const neighbours = adjacency.get(id);
      if (!neighbours?.size) continue;
      const share = mass / neighbours.size;
      for (const neighbour of neighbours) next.set(neighbour, (next.get(neighbour) || 0) + share);
    }
    for (const [id, mass] of next) if (id !== start) scores.set(id, (scores.get(id) || 0) + mass * weight);
    frontier = next;
    weight *= 0.55;
  }
  return scores;
}

function hopDistances(start, adjacency) {
  const distances = new Map();
  if (!adjacency.has(start)) return distances;
  distances.set(start, 0);
  const queue = [start];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    for (const neighbour of adjacency.get(current)) if (!distances.has(neighbour)) {
      distances.set(neighbour, distances.get(current) + 1);
      queue.push(neighbour);
    }
  }
  return distances;
}

export function measureGraph(graph, { depth = 2, sizeBy = 'links', minRadius = 22, maxRadius = 47 } = {}) {
  const walkDepth = clamp(Number.isFinite(Number(depth)) ? Math.round(Number(depth)) : 2, 1, 3);
  const requestedSize = sizeBy === 'views' ? 'views' : 'links';
  const smallest = clamp(Number.isFinite(minRadius) ? minRadius : 22, 4, 100);
  const largest = clamp(Number.isFinite(maxRadius) ? maxRadius : 47, smallest, 120);
  const uniqueNodes = new Map();
  for (const node of graph?.nodes || []) if (typeof node.id === 'string' && node.id && !uniqueNodes.has(node.id)) uniqueNodes.set(node.id, node);
  const adjacency = new Map([...uniqueNodes.keys()].map(id => [id, new Set()]));
  const incoming = new Map([...uniqueNodes.keys()].map(id => [id, new Set()]));
  const outgoing = new Map([...uniqueNodes.keys()].map(id => [id, new Set()]));
  const uniqueLinks = new Map();
  for (const edge of graph?.links || []) {
    if (edge.source === edge.target || !uniqueNodes.has(edge.source) || !uniqueNodes.has(edge.target)) continue;
    const key = JSON.stringify([edge.source, edge.target]);
    if (uniqueLinks.has(key)) continue;
    uniqueLinks.set(key, edge);
    adjacency.get(edge.source).add(edge.target);
    adjacency.get(edge.target).add(edge.source);
    incoming.get(edge.target).add(edge.source);
    outgoing.get(edge.source).add(edge.target);
  }
  const rootId = graph?.root?.id || [...uniqueNodes.values()].find(node => node.root)?.id || uniqueNodes.keys().next().value;
  const profiles = new Map([...uniqueNodes.keys()].map(id => [id, walkProfile(id, adjacency, walkDepth)]));
  const rootProfile = profiles.get(rootId) || new Map();
  const maxAffinity = Math.max(0, ...rootProfile.values());
  const distances = hopDistances(rootId, adjacency);
  const maximumDegree = Math.max(1, ...[...adjacency.values()].map(set => set.size));
  const maximumViews = Math.max(1, ...[...uniqueNodes.values()].map(node => finiteCount(node.pageviews) ? node.pageviews : 0));
  const nodes = [...uniqueNodes.values()].map(node => {
    const degree = adjacency.get(node.id).size;
    const hasViews = requestedSize === 'views' && finiteCount(node.pageviews);
    const popularity = hasViews ? node.pageviews : degree;
    const denominator = hasViews ? maximumViews : maximumDegree;
    const scaled = Math.sqrt(Math.log1p(popularity) / Math.log1p(denominator));
    return {
      ...node,
      root: node.id === rootId,
      radius: smallest + (largest - smallest) * clamp(scaled, 0, 1),
      degree, incomingDegree: incoming.get(node.id).size, outgoingDegree: outgoing.get(node.id).size,
      affinity: node.id === rootId ? 1 : maxAffinity > 0 ? (rootProfile.get(node.id) || 0) / maxAffinity : 0,
      hopDistance: distances.get(node.id) ?? null,
      popularity, popularitySource: hasViews ? 'pageviews' : 'map-links',
    };
  });
  const measured = new Map(nodes.map(node => [node.id, node]));
  const rawWeights = [...uniqueLinks.values()].map(edge => {
    const forward = profiles.get(edge.source).get(edge.target) || 0;
    const backward = profiles.get(edge.target).get(edge.source) || 0;
    return Math.sqrt(forward * backward);
  });
  const maximumWeight = Math.max(1e-9, ...rawWeights);
  const links = [...uniqueLinks.values()].map((edge, index) => {
    const strength = clamp(rawWeights[index] / maximumWeight, 0.1, 1);
    const radii = measured.get(edge.source).radius + measured.get(edge.target).radius;
    // Spring lengths stay comfortably beyond contact; stronger relations remain nearer.
    return { ...edge, strength, distance: radii * 0.45 + 195 - 70 * strength };
  });
  return {
    nodes, links,
    method: {
      depth: walkDepth,
      sizeBy: requestedSize,
      measuredViews: nodes.filter(node => finiteCount(node.pageviews)).length,
      nodeCount: nodes.length,
      sizeDescription: requestedSize === 'views' ? 'Page views where available; otherwise connections within this loaded map.' : 'Distinct neighbours within this loaded map, not global Wikipedia popularity.',
      affinityDescription: `Degree-normalized walks of 1–${walkDepth} hops on the loaded graph, with 0.55 decay per extra hop. Link direction is ignored for layout only. This is structural proximity, not semantic agreement.`,
    },
  };
}
