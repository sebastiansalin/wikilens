export interface MetricInputNode { id: string; root?: boolean; pageviews?: number | null; [key: string]: unknown }
export interface MetricInputLink { source: string; target: string }
export interface MeasuredFields {
  radius: number; degree: number; incomingDegree: number; outgoingDegree: number;
  affinity: number; hopDistance: number | null; popularity: number; popularitySource: 'pageviews' | 'map-links';
}
export interface MeasuredLink extends MetricInputLink { strength: number; distance: number }
export interface MeasurementMethod {
  depth: number; sizeBy: 'links' | 'views'; measuredViews: number; nodeCount: number;
  sizeDescription: string; affinityDescription: string;
}
export function measureGraph<T extends { id: string; root?: boolean; pageviews?: number | null }>(graph: { root?: {id:string}; nodes: T[]; links: MetricInputLink[] }, options?: { depth?: number; sizeBy?: 'links' | 'views'; minRadius?: number; maxRadius?: number }): { nodes: (T & MeasuredFields)[]; links: MeasuredLink[]; method: MeasurementMethod };
