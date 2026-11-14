export interface ClassicInput {id:string;articleRadius?:number;r?:number;}
export type ClassicNode<T extends ClassicInput>=T&{r:number;x:number;y:number;previousX:number;previousY:number;vx:number;vy:number};
export interface ClassicSimulation<T extends ClassicInput>{readonly nodes:ClassicNode<T>[];readonly links:{source:ClassicNode<T>;target:ClassicNode<T>;width:number}[];readonly interpolation:number;update(nodes:T[],links:{source:string;target:string}[]):void;tick(delta?:number):boolean;wake():void;isActive():boolean;startDrag(id:string,x:number,y:number):void;dragTo(id:string,x:number,y:number):void;endDrag():void;isPinned(id:string):boolean;pin(id:string):boolean;}
export function createClassicSimulation<T extends ClassicInput>(nodes:T[],links:{source:string;target:string}[]):ClassicSimulation<T>;

