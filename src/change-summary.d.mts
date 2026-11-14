import type {MonthRow} from './atlas-model.mjs';
import type {Episode} from './atlas-data';
export function compareWording(first?:string,second?:string,limit?:number):{same:boolean;context:string;first:string;second:string};
export function summarizeChanges(months:MonthRow[],episodes:Episode[],from?:string,to?:string):{edits:number;peak:{month:string;edits:number}|null;contentCount:number;otherCount:number;topics:[string,number][];latest:Episode|null;highlights:Episode[]};
