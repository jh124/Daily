import {validate} from './core.mjs?v=43';
export const emptyData=()=>({app:'daily-macros-weight',version:1,entries:[],foods:[],weights:[]});
// Three-way merge: unchanged local records follow the server, including deletions.
// If both devices edit the same record, the device currently syncing wins.
export function reconcile(base,local,remote){
  base=validate(base);local=validate(local);remote=validate(remote);
  const out=emptyData();
  for(const kind of ['entries','foods','weights']){
    const key=kind==='weights'?'date':'id';
    const map=rows=>new Map(rows.map(r=>[r[key],r]));
    const b=map(base[kind]),l=map(local[kind]),r=map(remote[kind]);
    for(const id of new Set([...b.keys(),...l.keys(),...r.keys()])){
      const value=JSON.stringify(l.get(id))===JSON.stringify(b.get(id))?r.get(id):l.get(id);
      if(value)out[kind].push(value);
    }
  }
  return validate(out);
}
