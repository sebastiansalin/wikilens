/** Deterministic damped graph forces. Integrate at 120 Hz, independently of rendering. */
const FRAME = 1000 / 60;
const STEP_MS = FRAME / 2;
const STEP = 0.5;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

function hash(text) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index++) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  return value >>> 0;
}

function separation(a, b) {
  let dx = b.x - a.x, dy = b.y - a.y;
  let distance = Math.hypot(dx, dy);
  if (distance < 0.001) {
    const angle = (hash(a.id + '/' + b.id) / 4294967296) * Math.PI * 2;
    dx = Math.cos(angle) * 0.01; dy = Math.sin(angle) * 0.01; distance = 0.01;
  }
  return { distance, nx: dx / distance, ny: dy / distance };
}

export function createSimulation(initialNodes = [], initialLinks = [], options = {}) {
  let width = Math.max(1, finite(options.width, 1000));
  let height = Math.max(1, finite(options.height, 700));
  let nodes = [], links = [], byId = new Map(), adjacency = new Map();
  let alpha = 1, active = true, destroyed = false, dragging = null, accumulator = 0;
  let repulsion = 3500, damping = 0.8, collisionPadding = 7, centerForce = 0.00012, linkForce = 1;
  const pinned = new Set(), warmth = new Map();
  const frozen = node => pinned.has(node.id) || dragging === node.id;

  function configure(next) {
    if (Number.isFinite(next.repulsion)) repulsion = clamp(next.repulsion, 0, 20000);
    if (Number.isFinite(next.damping)) damping = clamp(next.damping, 0.1, 0.98);
    if (Number.isFinite(next.collisionPadding)) collisionPadding = clamp(next.collisionPadding, 0, 40);
    if (Number.isFinite(next.centerForce)) centerForce = clamp(next.centerForce, 0, 0.01);
    if (Number.isFinite(next.linkForce)) linkForce = clamp(next.linkForce, 0, 4);
  }
  configure(options);

  function reheat(amount = 0.18) {
    if (destroyed) return;
    alpha = Math.max(alpha, clamp(finite(amount, 0.18), 0.015, 1));
    active = true;
  }

  function warmNeighbours(id) {
    warmth.clear();
    warmth.set(id, 1);
    for (const neighbour of adjacency.get(id) || []) {
      warmth.set(neighbour, Math.max(warmth.get(neighbour) || 0, 0.6));
      for (const second of adjacency.get(neighbour) || []) if (!warmth.has(second)) warmth.set(second, 0.18);
    }
  }

  function update(inputNodes, inputLinks, nextOptions = {}) {
    if (destroyed) return;
    configure(nextOptions);
    if (Number.isFinite(nextOptions.width)) width = Math.max(1, nextOptions.width);
    if (Number.isFinite(nextOptions.height)) height = Math.max(1, nextOptions.height);
    const old = byId;
    const oldSprings = new Map(links.map(spring => [JSON.stringify([spring.source.id, spring.target.id].sort()), spring]));
    const unique = new Map();
    for (const node of inputNodes || []) if (node?.id && !unique.has(node.id)) unique.set(node.id, node);
    const input = [...unique.values()].slice(0, 160);
    let topologyChanged = input.length !== old.size;
    let geometryChanged = false;
    nodes = input.map((node, index) => {
      const prior = old.get(node.id);
      const radius = clamp(finite(node.radius, 28), 4, 120);
      const collisionRadius = clamp(finite(node.collisionRadius, radius), 3, 120);
      if (prior) {
        if (prior.radius !== radius || prior.collisionRadius !== collisionRadius) geometryChanged = true;
        return Object.assign(prior, node, { radius, collisionRadius, x: prior.x, y: prior.y, vx: prior.vx, vy: prior.vy });
      }
      topologyChanged = true;
      const angle = index * 2.399963229728653 + (hash(node.id) % 360) * 0.001;
      const spread = node.root ? 0 : Math.sqrt(index + 1) * 64;
      const neighbours = (inputLinks || []).filter(edge => edge.source === node.id || edge.target === node.id)
        .map(edge => old.get(edge.source === node.id ? edge.target : edge.source)).filter(Boolean);
      const x = neighbours.length ? neighbours.reduce((sum, other) => sum + other.x, 0) / neighbours.length + Math.cos(angle) * 90 : width / 2 + Math.cos(angle) * spread;
      const y = neighbours.length ? neighbours.reduce((sum, other) => sum + other.y, 0) / neighbours.length + Math.sin(angle) * 90 : height / 2 + Math.sin(angle) * spread;
      return { ...node, radius, collisionRadius, x: finite(node.x, x), y: finite(node.y, y), vx: 0, vy: 0, fx: null, fy: null };
    });
    byId = new Map(nodes.map(node => [node.id, node]));
    for (const id of pinned) if (!byId.has(id)) pinned.delete(id);
    if (dragging && !byId.has(dragging)) dragging = null;
    adjacency = new Map(nodes.map(node => [node.id, new Set()]));
    const uniqueSprings = new Map();
    for (const edge of inputLinks || []) {
      const source = byId.get(edge.source), target = byId.get(edge.target);
      if (!source || !target || source === target) continue;
      const key = JSON.stringify([source.id, target.id].sort());
      const targetDistance = clamp(finite(edge.distance, source.radius + target.radius + 100), source.collisionRadius + target.collisionRadius + collisionPadding + 20, 2000);
      const strength = clamp(finite(edge.strength, 0.5), 0.05, 1);
      const prior = oldSprings.get(key);
      const spring = { source, target, strength, targetDistance, distance: prior?.distance ?? targetDistance, normalization: 1 };
      const previous = uniqueSprings.get(key);
      if (!previous || previous.strength < strength) uniqueSprings.set(key, spring);
      if (!prior) topologyChanged = true;
      else if (prior.targetDistance !== targetDistance || prior.strength !== strength) geometryChanged = true;
    }
    links = [...uniqueSprings.values()];
    if (links.length !== oldSprings.size) topologyChanged = true;
    for (const spring of links) {
      adjacency.get(spring.source.id).add(spring.target.id);
      adjacency.get(spring.target.id).add(spring.source.id);
    }
    // Normalize aggregate pull. A hub with many links must not crush its neighbours.
    for (const spring of links) spring.normalization = 1 / Math.sqrt(Math.max(1, adjacency.get(spring.source.id).size * adjacency.get(spring.target.id).size));
    if (dragging) warmNeighbours(dragging);
    if (!old.size) reheat(1);
    else if (topologyChanged) reheat(0.25);
    else if (geometryChanged) reheat(0.12);
  }

  function step() {
    let maximumWarmth = 0;
    if (!dragging) for (const [id, value] of warmth) {
      const next = value * Math.pow(0.96, STEP);
      if (next < 0.004) warmth.delete(id); else warmth.set(id, next);
    }
    for (const value of warmth.values()) maximumWarmth = Math.max(maximumWarmth, value);
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const { distance, nx, ny } = separation(a, b);
      const localHeat = Math.max(warmth.get(a.id) || 0, warmth.get(b.id) || 0);
      const heat = Math.max(alpha, localHeat * 0.12);
      const repel = Math.min(3, repulsion / (distance * distance + 160)) * heat;
      const overlap = a.collisionRadius + b.collisionRadius + collisionPadding - distance;
      // Soft pressure changes velocity only. No repeated position corrections or collision kicks.
      const collision = overlap > 0.15 ? Math.min(5, overlap * 0.075) : 0;
      const force = (repel + collision) * STEP;
      const movableA = !frozen(a), movableB = !frozen(b);
      const aWeight = movableA ? (movableB ? 0.5 : 1) : 0;
      const bWeight = movableB ? (movableA ? 0.5 : 1) : 0;
      if (aWeight) { a.vx -= nx * force * aWeight; a.vy -= ny * force * aWeight; }
      if (bWeight) { b.vx += nx * force * bWeight; b.vy += ny * force * bWeight; }
    }
    let unsettledLengths = false;
    for (const spring of links) {
      spring.distance += (spring.targetDistance - spring.distance) * 0.04;
      if (Math.abs(spring.targetDistance - spring.distance) > 0.05) unsettledLengths = true;
      const a = spring.source, b = spring.target;
      const { distance, nx, ny } = separation(a, b);
      const localHeat = Math.max(warmth.get(a.id) || 0, warmth.get(b.id) || 0);
      const heat = Math.max(alpha, localHeat * 0.7);
      const force = clamp((distance - spring.distance) * (0.012 + 0.016 * spring.strength) * spring.normalization * linkForce * heat * STEP, -3, 3);
      if (!frozen(a)) { a.vx += nx * force; a.vy += ny * force; }
      if (!frozen(b)) { b.vx -= nx * force; b.vy -= ny * force; }
    }
    const decay = Math.pow(damping, STEP);
    for (const node of nodes) {
      if (frozen(node)) {
        node.x = finite(node.fx, node.x); node.y = finite(node.fy, node.y);
        node.vx *= decay; node.vy *= decay; continue;
      }
      node.vx = clamp((finite(node.vx) + (width / 2 - node.x) * centerForce * alpha * STEP) * decay, -7, 7);
      node.vy = clamp((finite(node.vy) + (height / 2 - node.y) * centerForce * alpha * STEP) * decay, -7, 7);
      node.x = clamp(finite(node.x + node.vx * STEP, width / 2), -width * 2 - 500, width * 3 + 500);
      node.y = clamp(finite(node.y + node.vy * STEP, height / 2), -height * 2 - 500, height * 3 + 500);
    }
    alpha *= Math.pow(0.984, STEP);
    const energy = nodes.reduce((sum, node) => sum + (frozen(node) ? 0 : node.vx * node.vx + node.vy * node.vy), 0) / Math.max(1, nodes.length);
    active = Boolean(dragging) || alpha > 0.004 || maximumWarmth > 0.006 || energy > 0.0004 || unsettledLengths;
    if (!active) for (const node of nodes) { node.vx = 0; node.vy = 0; }
  }

  function tick(deltaMs = FRAME) {
    if (destroyed || !active) return false;
    accumulator += clamp(finite(deltaMs, FRAME), 0, FRAME * 6);
    let iterations = 0;
    while (accumulator + 1e-8 >= STEP_MS && iterations < 12 && active) {
      step(); accumulator = Math.max(0, accumulator - STEP_MS); iterations++;
    }
    if (!active) accumulator = 0;
    return active;
  }

  function startDrag(id, x, y) {
    const node = byId.get(id);
    if (!node || destroyed) return;
    if (dragging && dragging !== id) endDrag(dragging);
    dragging = id;
    node.fx = clamp(finite(x, node.x), -width * 2 - 500, width * 3 + 500);
    node.fy = clamp(finite(y, node.y), -height * 2 - 500, height * 3 + 500);
    node.x = node.fx; node.y = node.fy; node.vx = 0; node.vy = 0;
    warmNeighbours(id); reheat(0.055);
  }
  function dragTo(id, x, y) {
    const node = byId.get(id);
    if (!node || dragging !== id || destroyed) return;
    const nextX = clamp(finite(x, node.x), -width * 2 - 500, width * 3 + 500);
    const nextY = clamp(finite(y, node.y), -height * 2 - 500, height * 3 + 500);
    node.vx = clamp((nextX - node.x) * 0.12, -3, 3); node.vy = clamp((nextY - node.y) * 0.12, -3, 3);
    node.fx = nextX; node.fy = nextY; node.x = nextX; node.y = nextY;
    reheat(0.045);
  }
  function endDrag(id = dragging) {
    if (!id || dragging !== id) return;
    const node = byId.get(id); dragging = null;
    if (node && !pinned.has(id)) { node.fx = null; node.fy = null; }
    reheat(0.075);
  }
  function pin(id, value = !pinned.has(id)) {
    const node = byId.get(id);
    if (!node || destroyed) return false;
    if (value) { pinned.add(id); node.fx = node.x; node.fy = node.y; node.vx = 0; node.vy = 0; }
    else { pinned.delete(id); if (dragging !== id) { node.fx = null; node.fy = null; } }
    reheat(0.05); return pinned.has(id);
  }
  update(initialNodes, initialLinks, options);
  return {
    get nodes() { return nodes; },
    tick, reheat, update, startDrag, dragTo, endDrag, pin,
    isPinned: id => pinned.has(id),
    setSize(nextWidth, nextHeight) { width = Math.max(1, finite(nextWidth, width)); height = Math.max(1, finite(nextHeight, height)); reheat(0.07); },
    isActive: () => active && !destroyed,
    destroy() { destroyed = true; active = false; dragging = null; warmth.clear(); },
  };
}
