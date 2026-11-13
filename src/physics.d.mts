export interface PhysicsInputNode { id: string; radius?: number; collisionRadius?: number; root?: boolean; x?: number; y?: number }
export interface PhysicsInputLink { source: string; target: string; strength?: number; distance?: number }
export interface PhysicsOptions { width?: number; height?: number; repulsion?: number; damping?: number; collisionPadding?: number; centerForce?: number; linkForce?: number }
export type PhysicsNode<T extends PhysicsInputNode = PhysicsInputNode> = T & {radius: number; collisionRadius: number; x: number; y: number; vx: number; vy: number; fx: number | null; fy: number | null};
export interface Simulation<T extends PhysicsInputNode = PhysicsInputNode> {
  readonly nodes: PhysicsNode<T>[];
  tick(deltaMs?: number): boolean;
  reheat(amount?: number): void;
  update(nodes: T[], links: PhysicsInputLink[], options?: PhysicsOptions): void;
  setSize(width: number, height: number): void;
  startDrag(id: string, x: number, y: number): void;
  dragTo(id: string, x: number, y: number): void;
  endDrag(id?: string): void;
  pin(id: string, value?: boolean): boolean;
  isPinned(id: string): boolean;
  isActive(): boolean;
  destroy(): void;
}
export function createSimulation<T extends PhysicsInputNode>(nodes: T[], links: PhysicsInputLink[], options?: PhysicsOptions): Simulation<T>;
