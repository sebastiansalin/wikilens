import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { conflictColor } from '../pilot';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { Maximize2, Minus, Pin, PinOff, Plus } from 'lucide-react';
import { createSimulation } from '../physics.mjs';
import type { Simulation } from '../physics.mjs';
import type { MeasuredFields, MeasuredLink } from '../graph-metrics.mjs';
import type { GraphNode, Theme } from '../types';

export type MapNode = GraphNode & MeasuredFields & { articleRadius?: number };
type MapLink = MeasuredLink & { articleWidth?: number };

interface Props {
  nodes: MapNode[];
  links: MapLink[];
  rootId: string;
  selectedId?: string;
  theme: Theme;
  motion: boolean;
  onSelect: (node: GraphNode) => void;
  onExplore: (title: string) => void;
  pathIds?: string[];
  scores?: ReadonlyMap<string, number | null>;
}

type View = { x: number; y: number; k: number };
type LabelBox = { left: number; top: number; right: number; bottom: number };
type LabelMetrics = { key: string; width: number; height: number; baselineOffset: number };
type Gesture = {
  kind: 'pan' | 'node'; id?: string; pointerId: number;
  startX: number; startY: number; originX: number; originY: number;
  offsetX: number; offsetY: number; moved: boolean; capture: Element;
};

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const edgeKey = (source: string, target: string) => JSON.stringify([source, target]);
const unorderedKey = (source: string, target: string) => JSON.stringify([source, target].sort());
const starRadius = (node: MapNode, rootId: string) => node.articleRadius ?? Math.max(3.5, node.radius * (node.id === rootId ? 0.34 : 0.24));
const label = (title: string) => title.length > 34 ? `${title.slice(0, 31).trimEnd()}…` : title;

export default function ForceGraph({ nodes, links, rootId, selectedId, theme, motion, onSelect, onExplore, pathIds = [], scores }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const world = useRef<SVGGElement>(null);
  const nodeElements = useRef(new Map<string, SVGGElement>());
  const edgeElements = useRef(new Map<string, SVGLineElement>());
  const labelElements = useRef(new Map<string, SVGTextElement>());
  const labelMetrics = useRef(new Map<string, LabelMetrics>());
  const simulation = useRef<Simulation<MapNode> | null>(null);
  const simulationRoot = useRef<string | null>(null);
  const positionCache = useRef(new Map<string, { x: number; y: number; pinned: boolean }>());
  const frame = useRef<number | null>(null);
  const lastFrame = useRef(0);
  const size = useRef({ width: 1000, height: 700 });
  const view = useRef<View>({ x: 0, y: 0, k: 1 });
  const gesture = useRef<Gesture | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [hovered, setHovered] = useState<string | null>(null);
  const [, refreshPins] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const shouldAnimate = useRef(motion && !reducedMotion);
  shouldAnimate.current = motion && !reducedMotion;
  const paintNodes = useRef(new Map<string, Simulation<MapNode>['nodes'][number]>());
  const paintEdges = useRef<{element: SVGLineElement; source: Simulation<MapNode>['nodes'][number]; target: Simulation<MapNode>['nodes'][number]; sourceRadius:number; targetRadius:number}[]>([]);

  const visibleNodes = useMemo(() => nodes.slice(0, 160), [nodes]);
  const visibleLinks = useMemo(() => {
    const ids = new Set(visibleNodes.map(node => node.id));
    const unique = new Map<string, MapLink>();
    for (const edge of links) if (ids.has(edge.source) && ids.has(edge.target) && edge.source !== edge.target) unique.set(unorderedKey(edge.source, edge.target), edge);
    return [...unique.values()];
  }, [links, visibleNodes]);
  const latest = useRef({ links: visibleLinks, rootId });
  latest.current = { links: visibleLinks, rootId };
  const path = useMemo(() => new Set(pathIds), [pathIds]);
  const pathEdges = useMemo(() => new Set(pathIds.slice(1).map((id, index) => unorderedKey(pathIds[index], id))), [pathIds]);
  const focus = hovered || selectedId;
  const neighbours = useMemo(() => {
    const result = new Set<string>();
    if (focus) result.add(focus);
    for (const edge of visibleLinks) {
      if (edge.source === focus) result.add(edge.target);
      if (edge.target === focus) result.add(edge.source);
    }
    return result;
  }, [focus, visibleLinks]);
  const labelled = useMemo(() => {
    const count = zoomLevel > 1.65 ? visibleNodes.length : zoomLevel > 1.15 ? 20 : zoomLevel < 0.62 ? 3 : 8;
    return new Set([...visibleNodes].sort((a, b) => b.degree - a.degree || a.title.localeCompare(b.title)).slice(0, count).map(node => node.id));
  }, [visibleNodes, zoomLevel]);
  const labelCandidates = useRef<{ id: string; priority: number; degree: number }[]>([]);
  labelCandidates.current = visibleNodes.map(node => ({
    id: node.id,
    priority: node.id === selectedId ? 5 : node.id === hovered ? 4 : node.id === rootId ? 3 : path.has(node.id) ? 2 : labelled.has(node.id) ? 1 : 0,
    degree: node.degree,
  })).filter(node => node.priority > 0).sort((a, b) => b.priority - a.priority || b.degree - a.degree || a.id.localeCompare(b.id));

  // Bind DOM elements to mutable physics nodes once per render, not on every frame.
  const cacheGeometry = useCallback(() => {
    const byId = new Map(simulation.current?.nodes.map(node => [node.id, node]) || []);
    paintNodes.current = byId;
    paintEdges.current = latest.current.links.flatMap(edge => {
      const element=edgeElements.current.get(edgeKey(edge.source,edge.target)),source=byId.get(edge.source),target=byId.get(edge.target);
      return element&&source&&target?[{element,source,target,sourceRadius:starRadius(source,latest.current.rootId),targetRadius:starRadius(target,latest.current.rootId)}]:[];
    });
  }, []);

  const paint = useCallback(() => {
    const current = simulation.current;
    if (!current) return;
    const byId = paintNodes.current;
    for (const node of current.nodes) nodeElements.current.get(node.id)?.setAttribute('transform', `translate(${node.x.toFixed(2)} ${node.y.toFixed(2)})`);
    for (const {element,source,target,sourceRadius,targetRadius} of paintEdges.current) {
      const dx = target.x - source.x, dy = target.y - source.y;
      const distance = Math.max(0.01, Math.hypot(dx, dy));
      element.setAttribute('x1', String(source.x + dx / distance * sourceRadius));
      element.setAttribute('y1', String(source.y + dy / distance * sourceRadius));
      element.setAttribute('x2', String(target.x - dx / distance * targetRadius));
      element.setAttribute('y2', String(target.y - dy / distance * targetRadius));
    }
    // Cache text measurements; moving particles only need inexpensive screen-space boxes.
    // Measure every cache miss before writing label positions, avoiding per-label layout flushes.
    for (const candidate of labelCandidates.current) {
      const element = labelElements.current.get(candidate.id);
      if (!element) continue;
      const key = `${element.textContent}|${element.getAttribute('font-size')}|${element.getAttribute('font-weight')}`;
      if (labelMetrics.current.get(candidate.id)?.key === key) continue;
      const box = element.getBBox();
      const fontSize = Number(element.getAttribute('font-size')) || 11;
      labelMetrics.current.set(candidate.id, {
        key,
        width: box.width || (element.textContent?.length || 1) * fontSize * 0.56,
        height: box.height || fontSize,
        baselineOffset: box.height ? box.y - Number(element.getAttribute('y') || 0) : -fontSize * 0.8,
      });
    }
    const occupied: LabelBox[] = [];
    const shown = new Set<string>();
    const currentView = view.current;
    for (const candidate of labelCandidates.current) {
      const element = labelElements.current.get(candidate.id), node = byId.get(candidate.id), metrics = labelMetrics.current.get(candidate.id);
      if (!element || !node || !metrics) continue;
      const radius = starRadius(node, latest.current.rootId);
      const screenX = currentView.x + node.x * currentView.k, screenY = currentView.y + node.y * currentView.k;
      const width = metrics.width * currentView.k, height = metrics.height * currentView.k;
      const placements: { x: number; y: number; anchor: 'middle' | 'start' | 'end' }[] = [{ x: 0, y: radius + 19, anchor: 'middle' }];
      if (candidate.priority > 1) placements.push(
        { x: 0, y: -radius - 10, anchor: 'middle' },
        { x: radius + 12, y: 4, anchor: 'start' },
        { x: -radius - 12, y: 4, anchor: 'end' },
      );
      for (const placement of placements) {
        const left = screenX + placement.x * currentView.k - (placement.anchor === 'middle' ? width / 2 : placement.anchor === 'end' ? width : 0);
        const top = screenY + (placement.y + metrics.baselineOffset) * currentView.k;
        // Screen-pixel padding stays readable at every zoom level, including when motion is paused.
        const box = { left: left - 5, top: top - 3, right: left + width + 5, bottom: top + height + 3 };
        if (box.left < 3 || box.top < 3 || box.right > size.current.width - 3 || box.bottom > size.current.height - 3) continue;
        if (occupied.some(other => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top)) continue;
        occupied.push(box); shown.add(candidate.id);
        element.setAttribute('x', String(placement.x));
        element.setAttribute('y', String(placement.y));
        element.setAttribute('text-anchor', placement.anchor);
        break;
      }
    }
    for (const [id, element] of labelElements.current) {
      const opacity = shown.has(id) ? '1' : '0';
      if (element.getAttribute('opacity') !== opacity) element.setAttribute('opacity', opacity);
    }
    world.current?.setAttribute('transform', `translate(${view.current.x} ${view.current.y}) scale(${view.current.k})`);
    host.current?.setAttribute('data-physics-running', String(shouldAnimate.current && current.isActive()));
  }, []);

  const wake = useCallback(() => {
    if (frame.current !== null) return;
    if (!shouldAnimate.current) { paint(); return; }
    lastFrame.current = 0;
    const animate = (time: number) => {
      frame.current = null;
      const current = simulation.current;
      if (!current) return;
      const delta = lastFrame.current ? time - lastFrame.current : 1000 / 60;
      lastFrame.current = time;
      const active = shouldAnimate.current && current.tick(delta);
      paint();
      if (active) frame.current = requestAnimationFrame(animate);
    };
    frame.current = requestAnimationFrame(animate);
  }, [paint]);

  const applyView = useCallback((next: View) => {
    const changedZoom = Math.abs(next.k - view.current.k) > 0.001;
    view.current = next;
    world.current?.setAttribute('transform', `translate(${next.x} ${next.y}) scale(${next.k})`);
    if (changedZoom) setZoomLevel(next.k);
    paint();
  }, [paint]);

  const fit = useCallback(() => {
    const current = simulation.current?.nodes;
    if (!current?.length) return;
    const left = Math.min(...current.map(node => node.x - starRadius(node, latest.current.rootId))) - 58;
    const right = Math.max(...current.map(node => node.x + starRadius(node, latest.current.rootId))) + 58;
    const top = Math.min(...current.map(node => node.y - starRadius(node, latest.current.rootId))) - 42;
    const bottom = Math.max(...current.map(node => node.y + starRadius(node, latest.current.rootId))) + 58;
    const k = clamp(Math.min((size.current.width - 32) / Math.max(1, right - left), (size.current.height - 48) / Math.max(1, bottom - top)), 0.15, 1.8);
    applyView({ k, x: size.current.width / 2 - (left + right) / 2 * k, y: size.current.height / 2 - (top + bottom) / 2 * k });
    paint();
  }, [applyView, paint]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setReducedMotion(media.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);

  useEffect(() => {
    let mounted = true;
    const remeasure = () => { if (mounted) { labelMetrics.current.clear(); paint(); } };
    void document.fonts.ready.then(remeasure);
    document.fonts.addEventListener('loadingdone', remeasure);
    return () => { mounted = false; document.fonts.removeEventListener('loadingdone', remeasure); };
  }, [paint]);

  useLayoutEffect(() => { labelMetrics.current.clear(); paint(); }, [theme, paint]);

  useLayoutEffect(() => {
    const bounds = host.current?.getBoundingClientRect();
    if (bounds?.width && bounds.height) size.current = { width: bounds.width, height: bounds.height };
    const changedRoot = simulationRoot.current !== rootId;
    if (changedRoot) {
      simulation.current?.destroy();
      simulation.current = null;
      positionCache.current.clear();
      labelMetrics.current.clear();
      simulationRoot.current = rootId;
      gesture.current = null;
      setHovered(null);
      setAnnouncement('');
    }
    const previous = simulation.current;
    if (previous) for (const node of previous.nodes) positionCache.current.set(node.id, { x: node.x, y: node.y, pinned: previous.isPinned(node.id) });
    const input = visibleNodes.map(node => {
      const position = positionCache.current.get(node.id);
      const collisionRadius = Math.max(10, starRadius(node, rootId) + 5);
      return position ? { ...node, collisionRadius, x: position.x, y: position.y } : { ...node, collisionRadius };
    });
    if (!previous) simulation.current = createSimulation(input, visibleLinks, size.current);
    else previous.update(input, visibleLinks, size.current);
    const current = simulation.current!;
    for (const node of current.nodes) if (positionCache.current.get(node.id)?.pinned && !current.isPinned(node.id)) current.pin(node.id, true);
    if (changedRoot || !shouldAnimate.current) {
      for (let index = 0; index < (shouldAnimate.current ? 160 : 360); index++) current.tick();
    }
    cacheGeometry();
    if (changedRoot) fit();
    paint();
    refreshPins(version => version + 1);
    wake();
  }, [visibleNodes, visibleLinks, rootId, fit, paint, wake, cacheGeometry]);

  useLayoutEffect(() => { cacheGeometry(); paint(); });

  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width <= 0 || height <= 0 || (width === size.current.width && height === size.current.height)) return;
      const old = size.current;
      size.current = { width, height };
      labelMetrics.current.clear();
      simulation.current?.setSize(width, height);
      applyView({ ...view.current, x: view.current.x + (width - old.width) / 2, y: view.current.y + (height - old.height) / 2 });
      if (!shouldAnimate.current) {
        for (let index = 0; index < 100; index++) simulation.current?.tick();
        fit();
      }
      paint(); wake();
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [applyView, fit, paint, wake]);

  useEffect(() => {
    if (motion && !reducedMotion) { simulation.current?.reheat(0.1); wake(); }
    else {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      paint();
    }
  }, [motion, reducedMotion, paint, wake]);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    simulation.current?.destroy();
    frame.current = null;
  }, []);

  const zoomAt = useCallback((factor: number, x: number, y: number) => {
    const current = view.current;
    const k = clamp(current.k * factor, 0.15, 5);
    applyView({ k, x: x - (x - current.x) * k / current.k, y: y - (y - current.y) * k / current.k });
  }, [applyView]);

  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX - bounds.left, event.clientY - bounds.top);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [zoomAt]);

  const toWorld = (clientX: number, clientY: number) => {
    const bounds = svg.current?.getBoundingClientRect();
    return { x: (clientX - (bounds?.left || 0) - view.current.x) / view.current.k, y: (clientY - (bounds?.top || 0) - view.current.y) / view.current.k };
  };
  const start = (event: ReactPointerEvent<SVGElement>, id?: string) => {
    if (event.button !== 0 || gesture.current) return;
    event.preventDefault(); event.stopPropagation();
    const position = toWorld(event.clientX, event.clientY);
    const node = id ? simulation.current?.nodes.find(item => item.id === id) : undefined;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      kind: node ? 'node' : 'pan', id: node?.id, pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY, originX: view.current.x, originY: view.current.y,
      offsetX: node ? node.x - position.x : 0, offsetY: node ? node.y - position.y : 0,
      moved: false, capture: event.currentTarget,
    };
    if (node) { simulation.current?.startDrag(node.id, node.x, node.y); wake(); }
  };
  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.startX, dy = event.clientY - current.startY;
    if (Math.hypot(dx, dy) > 4) current.moved = true;
    if (current.kind === 'pan') applyView({ ...view.current, x: current.originX + dx, y: current.originY + dy });
    else if (current.id && current.moved) {
      const point = toWorld(event.clientX, event.clientY);
      simulation.current?.dragTo(current.id, point.x + current.offsetX, point.y + current.offsetY);
      if (!shouldAnimate.current) paint();
      wake();
    }
  };
  const end = (event: ReactPointerEvent<SVGSVGElement>, cancelled = false) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (current.capture.hasPointerCapture(current.pointerId)) current.capture.releasePointerCapture(current.pointerId);
    if (current.id) {
      simulation.current?.endDrag(current.id);
      const node = simulation.current?.nodes.find(item => item.id === current.id);
      if (node && !current.moved && !cancelled) onSelect(node);
      wake();
    }
  };
  const togglePin = () => {
    if (!selectedId || !simulation.current) return;
    const pinned = simulation.current.pin(selectedId);
    const node = simulation.current.nodes.find(item => item.id === selectedId);
    if (node) positionCache.current.set(node.id, { x: node.x, y: node.y, pinned });
    setAnnouncement(`${node?.title || 'Article'} ${pinned ? 'pinned' : 'unpinned'}.`);
    refreshPins(version => version + 1);
    wake();
  };
  const selectedNode = visibleNodes.find(node => node.id === selectedId);
  const selectedPinned = selectedId ? simulation.current?.isPinned(selectedId) : false;

  return <div ref={host} className={`force-map force-map-${theme}`} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', isolation: 'isolate' }}>
    <svg ref={svg} width="100%" height="100%" role="group" aria-label="Wikipedia connection map. Drag a star to move its neighbours, scroll to zoom, or select an article to inspect it." style={{ display: 'block', overflow: 'hidden', touchAction: 'none', userSelect: 'none' }} onPointerDown={event => start(event)} onPointerMove={move} onPointerUp={event => end(event)} onPointerCancel={event => end(event, true)} onLostPointerCapture={event => end(event, true)}>
      <g ref={world}>
        <g aria-hidden="true" pointerEvents="none">
          {visibleLinks.map(edge => {
            const inPath = pathEdges.has(unorderedKey(edge.source, edge.target));
            const active = Boolean(focus && (edge.source === focus || edge.target === focus));
            const rootEdge = edge.source === rootId || edge.target === rootId;
            return <line key={edgeKey(edge.source, edge.target)} ref={element => { if (element) edgeElements.current.set(edgeKey(edge.source, edge.target), element); else edgeElements.current.delete(edgeKey(edge.source, edge.target)); }} className={`force-edge${inPath ? ' is-path' : ''}${active ? ' is-active' : ''}`} data-source={edge.source} data-target={edge.target} stroke={inPath ? '#e3c37d' : 'var(--map-edge, #799792)'} strokeWidth={edge.articleWidth ?? (inPath ? 1.8 : active ? 1.1 : 0.65)} vectorEffect="non-scaling-stroke" style={{ opacity: inPath ? 0.85 : focus ? active ? 0.55 : 0.045 : rootEdge ? 0.18 : 0.09 }} />;
          })}
        </g>
        {visibleNodes.map(node => {
          const root = node.id === rootId, selected = node.id === selectedId, inPath = path.has(node.id), hoveredNode = node.id === hovered;
          const pinned = simulation.current?.isPinned(node.id) || false;
          const radius = starRadius(node, rootId);
          const score = scores?.get(node.id);
          const color = scores?.has(node.id) ? conflictColor(score ?? null) : 'disagreementScore' in node ? conflictColor(node.disagreementScore) : node.conflict ? conflictColor(node.conflict.score) : inPath ? '#e3c37d' : selected ? theme === 'paper' ? '#72479b' : '#c1b4ff' : root ? theme === 'paper' ? '#285f56' : '#74e6ce' : theme === 'paper' ? '#557b71' : '#a6cfc5';
          return <g key={node.id} ref={element => { if (element) nodeElements.current.set(node.id, element); else nodeElements.current.delete(node.id); }} className={`force-node${root ? ' is-root' : ''}${selected ? ' is-selected' : ''}${inPath ? ' is-path' : ''}${pinned ? ' is-pinned' : ''}`} data-node-id={node.id} role="button" tabIndex={0} aria-label={`${node.title}${root ? ', current topic' : ''}${pinned ? ', pinned' : ''}. ${node.degree} connections in this map.`} aria-pressed={selected} style={{ color, cursor: 'grab', outline: 'none', opacity: focus && !neighbours.has(node.id) && !inPath && !root ? 0.4 : 1 } as CSSProperties} onPointerDown={event => start(event, node.id)} onDoubleClick={() => onExplore(node.title)} onMouseEnter={() => setHovered(node.id)} onMouseLeave={() => setHovered(current => current === node.id ? null : current)} onFocus={() => setHovered(node.id)} onBlur={() => setHovered(current => current === node.id ? null : current)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(node); } else if (event.key.toLowerCase() === 'e') { event.preventDefault(); onExplore(node.title); } }}>
            <title>{node.title}{scores?.has(node.id) ? ` · Disagreement index: ${score ?? 'insufficient data'}` : 'disagreementScore' in node ? ` · Disagreement index: ${node.disagreementScore ?? 'insufficient data'}` : node.conflict ? ` · Conflict: ${node.conflict.score ?? 'insufficient data'}` : ''}</title>
            <circle r={Math.max(15 / zoomLevel, radius + 7)} fill="transparent" className="force-hit-area" />
            {theme !== 'paper' && <circle r={radius * 1.4} fill="currentColor" opacity={root || selected ? 0.10 : 0.035} pointerEvents="none" />}
            {(root || selected || inPath || hoveredNode) && <circle r={radius + 7} fill="none" stroke="currentColor" strokeWidth="0.7" opacity={selected || hoveredNode ? 0.75 : 0.3} pointerEvents="none" />}
            <circle className="force-circle" r={radius} fill="currentColor" opacity={root || selected ? 1 : 0.88} pointerEvents="none" />
            {theme !== 'paper' && <circle r={radius * 0.4} fill="#f6fffb" opacity={root ? 0.9 : 0.65} pointerEvents="none" />}
            {pinned && <circle cx={radius + 4} cy={-radius - 4} r="2.5" fill="currentColor" pointerEvents="none" />}
            <text ref={element => { if (element) labelElements.current.set(node.id, element); else labelElements.current.delete(node.id); }} className="force-label" textAnchor="middle" x="0" y={radius + 19} fill={theme === 'paper' ? '#354940' : '#c5d8d1'} fontSize={root || selected ? 12 : 10.5} fontWeight={root || selected ? 550 : 400} opacity={0} pointerEvents="none" style={{ paintOrder: 'stroke', stroke: theme === 'paper' ? 'var(--bg, #f7f7f2)' : 'var(--bg, #101815)', strokeWidth: 3, strokeLinejoin: 'round' }}>{label(node.title)}</text>
          </g>;
        })}
      </g>
    </svg>
    <div className="map-navigation" role="group" aria-label="Map controls" style={{ position: 'absolute', right: 18, bottom: 18, display: 'flex', gap: 3 }}>
      <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoomAt(1.25, size.current.width / 2, size.current.height / 2)}><Plus size={17} /></button>
      <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoomAt(0.8, size.current.width / 2, size.current.height / 2)}><Minus size={17} /></button>
      <button type="button" aria-label="Fit map" title="Fit map" onClick={fit}><Maximize2 size={16} /></button>
      {selectedNode && <button type="button" aria-label={selectedPinned ? 'Unpin article' : 'Pin article'} title={selectedPinned ? 'Unpin article' : 'Pin article'} aria-pressed={selectedPinned} onClick={togglePin}>{selectedPinned ? <PinOff size={16} /> : <Pin size={16} />}</button>}
    </div>
    <span className="sr-only" role="status">{announcement}</span>
  </div>;
}
