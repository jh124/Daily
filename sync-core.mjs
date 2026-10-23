import {validate} from './core.mjs?v=52';
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
    let order=[...b.keys(),...l.keys(),...r.keys()];
    if(kind==='foods'){
      // Row content and list order are separate changes. A move-to-front doesn't
      // edit the row, but must survive sync and in-flight uploads nonetheless.
      const previous=[...b.keys()].filter(id=>l.has(id));
      const surviving=[...l.keys()].filter(id=>b.has(id));
      const localOrderChanged=[...l.keys()].some(id=>!b.has(id))||surviving.some((id,i)=>id!==previous[i]);
      order=localOrderChanged?[...l.keys(),...r.keys(),...b.keys()]:[...r.keys(),...l.keys(),...b.keys()];
    }
    for(const id of new Set(order)){
      const value=JSON.stringify(l.get(id))===JSON.stringify(b.get(id))?r.get(id):l.get(id);
      if(value)out[kind].push(value);
    }
  }
  return validate(out);
}
