export const LB_PER_KG=2.2046226218487757;
export const weightToUnit=(pounds,unit='lb')=>unit==='kg'?pounds/LB_PER_KG:pounds;
export const weightFromUnit=(value,unit='lb')=>unit==='kg'?value*LB_PER_KG:value;
// At least one macro must be positive when creating or editing records.
export const hasNonzeroMacros=({calories,protein})=>calories>0||protein>0;
// Duplicate frequent foods have the same name and macro values; IDs remain independent.
export function isDuplicateFood(foods,candidate,excludeId=null){
  const name=candidate.name.trim().toLocaleLowerCase();
  return foods.some(food=>food.id!==excludeId&&food.name.trim().toLocaleLowerCase()===name&&food.calories===candidate.calories&&food.protein===candidate.protein);
}

/** Average daily totals across logged dates in the 7 completed calendar days before today.
 * Days with no entries are not assumed to be zero intake. */
export function recentMacroAverages(entries,now=today()){
  const end=dayNumber(now),start=end-7,days=new Map();
  for(const r of entries){
    const day=dayNumber(r.date);
    if(day<start||day>=end)continue;
    const total=days.get(r.date)||{calories:0,protein:0};
    total.calories+=r.calories;
    total.protein+=r.protein;
    days.set(r.date,total);
  }
  const loggedDays=days.size;
  if(!loggedDays)return {calories:null,protein:null,loggedDays};
  let calories=0,protein=0;
  for(const total of days.values()){calories+=total.calories;protein+=total.protein;}
  return {calories:calories/loggedDays,protein:protein/loggedDays,loggedDays};
}

export const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
export const dayNumber=d=>Date.UTC(...d.split('-').map((v,i)=>i===1?+v-1:+v))/86400000;
export const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&new Date(dayNumber(d)*86400000).toISOString().slice(0,10)===d;
export function cutoff(months,now=today(),calendar=false){const [y,m,d]=now.split('-').map(Number);const start=new Date(y,m-1-months+(calendar?1:0),1);if(!calendar)start.setDate(Math.min(d,new Date(start.getFullYear(),start.getMonth()+1,0).getDate()));return `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`;}
export function trend(rows){if(rows.length<2)return null;const x=rows.map(r=>dayNumber(r.date)),y=rows.map(r=>r.weight),mx=x.reduce((a,b)=>a+b)/x.length,my=y.reduce((a,b)=>a+b)/y.length;const den=x.reduce((s,v)=>s+(v-mx)**2,0);return den?7*x.reduce((s,v,i)=>s+(v-mx)*(y[i]-my),0)/den:null;}
// Local storage always uses pounds. An exported backup may specify kg or lb;
// legacy backups without a weightUnit are pounds. Normalize at the import boundary.
export function validate(data){
  if(!data||data.app!=='daily-macros-weight'||data.version!==1)throw Error('Choose a backup exported from this app.');
  const foods=data.foods??data.meals,unit=data.weightUnit??'lb';
  if(!['lb','kg'].includes(unit))throw Error('Unknown weight unit in backup.');
  for(const [key,value] of [['entries',data.entries],['foods',foods],['weights',data.weights]])
    if(!Array.isArray(value))throw Error('Backup is missing '+key+'.');
  const numeric=(n,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=max;
  const ids=new Set();
  for(const r of [...data.entries,...foods]){
    if(typeof r.id!=='string'||!r.id||r.id.length>200||ids.has(r.id))throw Error('Invalid or duplicate record ID.');
    ids.add(r.id);
    if(typeof r.name!=='string'||r.name.length>120||!numeric(r.calories,100000)||!numeric(r.protein,10000))
      throw Error('Invalid food or macro record.');
  }
  for(const r of data.entries)if(!validDate(r.date)||r.date>today())throw Error('Invalid entry date.');
  const dates=new Set(),weights=[];
  for(const r of data.weights){
    const pounds=weightFromUnit(r.weight,unit);
    if(!validDate(r.date)||r.date>today()||!numeric(pounds,2000)||pounds===0||dates.has(r.date))
      throw Error('Invalid or duplicate weigh-in date.');
    dates.add(r.date);
    weights.push({...r,weight:pounds});
  }
  const {meals,weightUnit,...rest}=data;
  return {...rest,foods,weights};
}
export function exportBackup(data,unit='lb'){
  if(!['lb','kg'].includes(unit))throw Error('Invalid export unit.');
  const canonical=validate(data);
  return {...canonical,weightUnit:unit,weights:canonical.weights.map(r=>({...r,weight:+weightToUnit(r.weight,unit).toFixed(8)}))};
}
// Short-window energy-balance estimate, not a physiological or long-term prediction.
// Morning weigh-ins bracket completed calorie days; the last morning's food is excluded.
export function estimateMaintenance(records, now=today()) {
  const end=dayNumber(now), date=n=>new Date(n*86400000).toISOString().slice(0,10),totals=new Map();
  for(const row of records.entries) totals.set(row.date,(totals.get(row.date)||0)+row.calories);
  let logged=0;
  while(logged<28&&(totals.get(date(end-logged-1))||0)>0) logged++;
  const weights=records.weights.filter(r=>r.date>=date(end-logged)&&r.date<=now).sort((a,b)=>a.date.localeCompare(b.date));
  const first=weights.length?dayNumber(weights[0].date):null,last=weights.length?dayNumber(weights.at(-1).date):null;
  const span=weights.length?last-first:0,early=weights.filter(r=>dayNumber(r.date)<first+7).length,late=weights.filter(r=>dayNumber(r.date)>last-7).length;
  const result={value:null,logged,count:weights.length,span,early,late,first:first===null?null:date(first),last:last===null?null:date(last),age:last===null?null:end-last};
  const pending=detail=>({...result,detail});
  if(logged<21) return pending(`Log ${21-logged} more consecutive calorie day${21-logged===1?'':'s'} to reach 21.`);
  if(weights.length<10) return pending(`Add ${10-weights.length} more weigh-in${10-weights.length===1?'':'s'} within your logging window.`);
  if(end-last>3) return pending('Add a recent weigh-in to update your estimate.');
  if(span<21) return pending(`Keep weighing in: your weights need to span ${21-span} more day${21-span===1?'':'s'}.`);
  if(early<2||late<2) return pending('Needs at least 2 weigh-ins in both the first and last week.');
  const weekly=trend(weights),meanWeight=weights.reduce((s,r)=>s+r.weight,0)/weights.length;
  if(weekly===null||Math.abs(weekly)>meanWeight*.01) return pending('Weight is changing too quickly for a useful estimate. Keep logging.');
  let calories=0;
  for(let day=first;day<last;day++) calories+=totals.get(date(day));
  const intake=calories/span,estimate=intake-weekly*3500/7;
  if(!Number.isFinite(estimate)||estimate<50) return pending('Check your calorie logs and weights before estimating.');
  // A very low daily total might mean a partial log. Flag it; intentional fasting is valid.
    const daily=Array.from({length:span},(_,i)=>({date:date(first+i),calories:totals.get(date(first+i))}));
    const sorted=daily.map(r=>r.calories).sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);
    const median=sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
    const lowDays=daily.filter(r=>r.calories<median*.4).map(r=>r.date);
    return {...result,value:Math.round(estimate/50)*50,intake,weekly,adjustment:-weekly*3500/7,lowDays,detail:`Based on ${span} days of calories and ${weights.length} weigh-ins.`};
}
export function merge(current,incoming){current=validate(current);incoming=validate(incoming);const by=(a,b,k)=>[...new Map([...a,...b].map(r=>[r[k],r])).values()];return {...current,entries:by(current.entries,incoming.entries,'id'),foods:by(current.foods,incoming.foods,'id'),weights:by(current.weights,incoming.weights,'date')};}
export function toCSV(data,unit='lb'){
  const output=exportBackup(data,unit);
  const rows=[['type','id','date','name','calories','protein','weight','weight_unit']];
  output.entries.forEach(r=>rows.push(['entry',r.id,r.date,r.name,r.calories,r.protein,'',unit]));
  output.foods.forEach(r=>rows.push(['food',r.id,'',r.name,r.calories,r.protein,'',unit]));
  output.weights.forEach(r=>rows.push(['weight','',r.date,'','','',r.weight,unit]));
  return rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');
}
export function fromCSV(text){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(quoted)throw Error('Incomplete CSV file.');
  if(cell||row.length){row.push(cell);rows.push(row);}
  if(rows[0]?.length)rows[0][0]=rows[0][0].replace(/^\uFEFF/,'');
  const header=rows.shift()?.join(','),legacy=header==='type,id,date,name,calories,protein,weight';
  if(!legacy&&header!=='type,id,date,name,calories,protein,weight,weight_unit')throw Error('Choose a CSV exported from this app.');
  const out={app:'daily-macros-weight',version:1,entries:[],foods:[],weights:[]};
  for(const r of rows){
    if(r.length===1&&r[0]==='')continue;
    if(r.length!==(legacy?7:8))throw Error('Invalid CSV row.');
    const [type,id,date,name,calories,protein,weight,unit]=r;
    if(!legacy&&!['lb','kg'].includes(unit))throw Error('Unknown weight unit in CSV.');
    if(type==='entry')out.entries.push({id,date,name,calories:+calories,protein:+protein});
    else if(type==='food'||type==='meal')out.foods.push({id,name,calories:+calories,protein:+protein});
    else if(type==='weight')out.weights.push({date,weight:weightFromUnit(+weight,legacy?'lb':unit)});
    else throw Error('Unknown CSV record.');
  }
  return validate(out);
}
