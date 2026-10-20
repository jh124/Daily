import {createCloud} from './cloud.mjs';
import {today,dayNumber,cutoff,trend,validate,merge,toCSV,fromCSV,estimateMaintenance,weightToUnit,weightFromUnit,exportBackup,isDuplicateFood,hasNonzeroMacros,recentMacroAverages} from './core.mjs?v=49';
const $=id=>document.getElementById(id),GUEST_KEY='daily-macros-weight-v1';let KEY=GUEST_KEY;let cloud;let data={app:'daily-macros-weight',version:1,entries:[],foods:[],weights:[]},selected=today(),page='macro',view='graph',timer;
let expandedFoods=false,expandedEntriesDate=null;
let undoState=null,editingEntry=null,editingFood=null,editingWeightDate=null,foodDuplicateTimer;
const PREF_KEY=GUEST_KEY+'-preferences';let preferences={};try{preferences=JSON.parse(localStorage.getItem(PREF_KEY)||'{}')||{};}catch{}
let weightUnit=preferences.weightUnit==='kg'?'kg':'lb';
let defaultPage=preferences.defaultPage==='weight'?'weight':'macro';
const displayWeight=pounds=>weightToUnit(pounds,weightUnit),internalWeight=value=>weightFromUnit(value,weightUnit);
const weightNumber=pounds=>Number(displayWeight(pounds).toFixed(2));
function updateWeightInputs(){for(const id of ['weight-input','edit-weight-value']){$(id).max=weightUnit==='kg'?'907.18':'2000';$(id).min='0.01';}document.querySelectorAll('[data-weight-unit]').forEach(el=>el.textContent=weightUnit);$('edit-weight-label').textContent='Weight ('+weightUnit+')';$('maintenance-energy-unit').textContent=weightUnit==='kg'?'7,700 kcal per kilogram':'3,500 kcal per pound';$('weight-input').placeholder='0';}
function setWeightUnit(next){if(!['lb','kg'].includes(next)||weightUnit===next)return;weightUnit=next;updateWeightPreference();$('weight-input').value='';$('edit-weight-value').value='';updateWeightInputs();renderWeight();renderMaintenance();savePreferences();toast('Weight units: '+weightUnit);}

function savePreferences(){try{localStorage.setItem(PREF_KEY,JSON.stringify({view,chartRange:$('chart-range').value,trendRange:$('trend-range').value,theme:document.documentElement.dataset.theme==='dark'?'dark':'light',weightUnit,defaultPage}));}catch{}}

function setTheme(theme){const dark=theme==='dark';document.documentElement.dataset.theme=dark?'dark':'light';$('theme-pill').dataset.selected=dark?'second':'first';$('theme-light').setAttribute('aria-pressed',String(!dark));$('theme-dark').setAttribute('aria-pressed',String(dark));document.querySelector('meta[name="theme-color"]').content=dark?'#171e1b':'#f5f5ef';}
setTheme(preferences.theme==='dark'?'dark':'light');
for(const theme of ['light','dark'])$('theme-'+theme).onclick=()=>{setTheme(theme);savePreferences();};
function updateWeightPreference(){$('weight-unit-pill').dataset.selected=weightUnit==='kg'?'second':'first';$('weight-lb').setAttribute('aria-pressed',String(weightUnit==='lb'));$('weight-kg').setAttribute('aria-pressed',String(weightUnit==='kg'));}
updateWeightPreference();
function updateDefaultPagePreference(){$('default-page-pill').dataset.selected=defaultPage==='weight'?'second':'first';for(const option of ['macro','weight'])$('default-page-'+option).setAttribute('aria-pressed',String(defaultPage===option));}
updateDefaultPagePreference();
for(const option of ['macro','weight'])$('default-page-'+option).onclick=()=>{defaultPage=option;updateDefaultPagePreference();savePreferences();};
for(const unit of ['lb','kg'])$('weight-'+unit).onclick=()=>setWeightUnit(unit);
function toast(msg,duration){$('toast-message').textContent=msg;$('undo-button').hidden=!undoState;$('toast').classList.add('show');clearTimeout(timer);timer=setTimeout(()=>{$('toast').classList.remove('show');undoState=null;$('undo-button').hidden=true;},duration??(undoState?5000:4000));}
let loadFailed=false;try{const stored=localStorage.getItem(KEY);if(stored){const restored=validate(JSON.parse(stored));data={...restored,foods:restored.foods??restored.meals??[]};}}catch{loadFailed=true;toast('Saved data could not be read. Export or restore a backup before making changes.');}
function save(next,undoable=true){if(loadFailed){toast('Storage could not be read. Import a valid backup to restore it.');return false;}try{next=validate(next);next={...next,foods:next.foods??next.meals??[]};const before=JSON.stringify(data),after=JSON.stringify(next);localStorage.setItem(KEY,after);undoState=undoable?{before,after}:null;data=next;cloud?.changed();render();toast('Saved.');return true;}catch{toast('Could not save. Check values or export a backup and free up storage.');return false;}}
$('undo-button').onclick=()=>{if(!undoState)return;try{if(localStorage.getItem(KEY)!==undoState.after){undoState=null;toast('Data changed elsewhere; undo is no longer available.');return;}if(save(JSON.parse(undoState.before),false))toast('Undone.');}catch{toast('Could not undo. Please try again.');}};
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const formatter=new Intl.NumberFormat(undefined,{maximumFractionDigits:2}),number=n=>formatter.format(n);const dateLabel=d=>new Date(d+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});const uid=()=>crypto.randomUUID();
function empty(text){return `<div class="empty">${text}</div>`;}
function entryMenu(id,label,frequent=false){
  const action=(key,title,extra='')=>'<button type="button" data-action="'+key+'" data-id="'+escape(id)+'"'+extra+'>'+title+'</button>';
  return '<div class="entry-menu-wrap"><button type="button" class="menu-trigger" data-action="menu" aria-label="Options for '+escape(label)+'" aria-haspopup="true" aria-expanded="false"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor"><circle cx="4" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="20" cy="12" r="1.8"/></svg></button><div class="entry-menu" hidden>'+action('edit','Edit entry')+(frequent?action('frequent','Add to frequent foods'):'')+action('delete','Delete entry',' class="danger"')+'</div></div>';
}
function closeEntryMenus(){
  document.querySelectorAll('.entry-menu:not([hidden])').forEach(menu=>{
    menu.hidden=true;
    menu.previousElementSibling.setAttribute('aria-expanded','false');
  });
}
function toggleEntryMenu(button){
  const menu=button.nextElementSibling,wasOpen=!menu.hidden;
  closeEntryMenus();
  if(!wasOpen){menu.hidden=false;button.setAttribute('aria-expanded','true');}
}
document.addEventListener('click',e=>{if(!e.target.closest('.entry-menu-wrap'))closeEntryMenus();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeEntryMenus();});

$('macro-date').value=selected;$('weight-date').value=today();$('macro-date').max=today();$('weight-date').max=today();
$('chart-range').innerHTML='<option value="week">1 week</option>'+Array.from({length:12},(_,i)=>`<option value="${i+1}">${i+1} month${i?'s':''}</option>`).join('')+'<option value="all">All data</option>';$('chart-range').value=['week','all',...Array.from({length:12},(_,i)=>String(i+1))].includes(preferences.chartRange)?preferences.chartRange:'1';
$('trend-range').innerHTML=Array.from({length:12},(_,i)=>`<option value="${i+1}">Last ${i+1} month${i?'s':''}</option>`).join('');
$('trend-range').value=/^(?:[1-9]|1[0-2])$/.test(preferences.trendRange)?preferences.trendRange:'1';
function switchPage(next){const pages=['macro','weight','maintenance'];page=next;$('nav-pill').style.transform=`translateX(${pages.indexOf(next)*100}%)`;for(const p of pages){$(p+'-page').hidden=p!==next;$(p+'-tab').classList.toggle('active',p===next);if(p===next)$(p+'-tab').setAttribute('aria-current','page');else $(p+'-tab').removeAttribute('aria-current');}window.scrollTo({top:0,behavior:'instant'});render();savePreferences();}
for(const p of ['macro','weight','maintenance'])$(p+'-tab').onclick=()=>switchPage(p);
function selectDay(d){if(d>today())return;if(d!==selected)expandedEntriesDate=null;selected=d;$('macro-date').value=d;render();}
$('macro-date').onchange=()=>{if($('macro-date').value)selectDay($('macro-date').value);};
function shiftDay(n){const d=new Date(selected+'T12:00:00');d.setDate(d.getDate()+n);selectDay(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);}
$('prev-day').onclick=()=>shiftDay(-1);$('next-day').onclick=()=>shiftDay(1);
$('macro-form').onsubmit=e=>{e.preventDefault();if($('entry-cal').value===''&&$('entry-protein').value===''){toast('Enter calories or protein.');return;}const entry={id:uid(),date:selected,name:$('entry-name').value.trim()||'Quick entry',calories:+$('entry-cal').value,protein:+$('entry-protein').value};if(!hasNonzeroMacros(entry)){toast('Calories or protein must be greater than 0.');return;}if(save({...data,entries:[...data.entries,entry]})){e.target.reset();toast('Macros added.');}};
function showFoodNotice(message){
  clearTimeout(foodDuplicateTimer);
  $('food-duplicate-notice').textContent=message;
  $('food-duplicate-notice').hidden=false;
  foodDuplicateTimer=setTimeout(()=>{$('food-duplicate-notice').hidden=true;},5000);
}
function openFoodDialog(food=null,entry=null){
  clearTimeout(foodDuplicateTimer);
  $('food-duplicate-notice').hidden=true;
  editingFood=food?.id??null;
  $('food-form').reset();
  $('food-dialog-title').textContent=food?'Edit frequent food':'Frequent food';
  $('food-save').textContent=food?'Save changes':'Save food';
  const source=food||entry;
  if(source){
    $('food-name').value=food?food.name:(source.name&&source.name.trim()!=='Quick entry'?source.name:'');
    $('food-cal').value=source.calories;
    $('food-protein').value=source.protein;
  }
  $('food-dialog').showModal();
  if(entry&&!$('food-name').value)$('food-name').focus();
}
$('new-food').onclick=()=>openFoodDialog();
$('close-food').onclick=()=>$('food-dialog').close();
$('food-dialog').onclose=()=>{editingFood=null;clearTimeout(foodDuplicateTimer);$('food-duplicate-notice').hidden=true;};
$('food-form').onsubmit=e=>{
  e.preventDefault();
  const name=$('food-name').value.trim();
  if(!name){toast('Give your food a name.');$('food-name').focus();return;}
  const food={id:editingFood||uid(),name,calories:+$('food-cal').value,protein:+$('food-protein').value};
  if(editingFood&&!data.foods.some(r=>r.id===editingFood)){toast('This food no longer exists.');return;}
  if(!hasNonzeroMacros(food)){showFoodNotice('Calories or protein must be greater than 0.');return;}
  if(isDuplicateFood(data.foods,food,editingFood)){showFoodNotice('Already in frequent foods');return;}
  const foods=editingFood?data.foods.map(r=>r.id===editingFood?food:r):[food,...data.foods];
  if(save({...data,foods})){
    $('food-dialog').close();
    toast(editingFood?'Frequent food updated.':'Frequent food saved.');
  }
};
$('weight-form').onsubmit=e=>{e.preventDefault();const date=$('weight-date').value,weight=internalWeight(+$('weight-input').value);if(date>today()||weight<=0||weight>2000){toast('Choose today or a past date and a positive weight.');return;}const next={...data,weights:[...data.weights.filter(r=>r.date!==date),{date,weight}]};if(save(next)){$('weight-input').value='';toast('Weigh-in saved.');}};
$('foods').onclick=e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.action==='menu'){toggleEntryMenu(b);return;}
  const food=data.foods.find(r=>r.id===b.dataset.id);if(!food)return;
  closeEntryMenus();
  if(b.dataset.action==='add'){
    const factor=Number(b.closest('.row').querySelector('.food-serving').value);
    if(![.5,1,2,3,4,5].includes(factor))return;
    const entry={...food,id:uid(),date:today(),name:factor===1?food.name:food.name+' ('+factor+'×)',calories:Math.round(food.calories*factor*100)/100,protein:Math.round(food.protein*factor*100)/100};
    entry.name=entry.name.slice(0,120);
    if(!hasNonzeroMacros(entry)){toast('Calories or protein must be greater than 0.');return;}
    if(save({...data,foods:[food,...data.foods.filter(r=>r.id!==food.id)],entries:[...data.entries,entry]}))toast(food.name+' added to today.');
  }else if(b.dataset.action==='edit'){
    openFoodDialog(food);
  }else if(b.dataset.action==='delete'){
    if(save({...data,foods:data.foods.filter(r=>r.id!==food.id)}))toast('Frequent food removed.');
  }
};
$('entries').onclick=e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.action==='menu'){toggleEntryMenu(b);return;}
  const entry=data.entries.find(r=>r.id===b.dataset.id);if(!entry)return;
  closeEntryMenus();
  if(b.dataset.action==='delete'){
    if(save({...data,entries:data.entries.filter(r=>r.id!==entry.id)}))toast('Entry deleted.');
  }else if(b.dataset.action==='edit'){
    editingEntry=entry.id;
    $('edit-entry-name').value=entry.name;
    $('edit-entry-cal').value=entry.calories;
    $('edit-entry-protein').value=entry.protein;
    $('edit-entry-date').textContent=dateLabel(entry.date);
    $('entry-dialog').showModal();
  }else if(b.dataset.action==='frequent'){
    if(!hasNonzeroMacros(entry)){toast('Calories or protein must be greater than 0.');return;}
    const name=entry.name.trim();
    if(!name||name==='Quick entry'){
      openFoodDialog(null,entry);
    }else{
      const food={id:uid(),name,calories:entry.calories,protein:entry.protein};
      if(isDuplicateFood(data.foods,food)){toast('Already in frequent foods',5000);return;}
      if(save({...data,foods:[food,...data.foods]}))toast('Added to frequent foods.');
    }
  }
};
$('close-entry').onclick=()=>$('entry-dialog').close();
$('edit-entry-form').onsubmit=e=>{e.preventDefault();const existing=data.entries.find(r=>r.id===editingEntry);if(!existing){$('entry-dialog').close();toast('This entry no longer exists.');return;}const edited={...existing,name:$('edit-entry-name').value.trim()||'Quick entry',calories:Number($('edit-entry-cal').value),protein:Number($('edit-entry-protein').value)};if(!hasNonzeroMacros(edited)){toast('Calories or protein must be greater than 0.');return;}if(save({...data,entries:data.entries.map(r=>r.id===editingEntry?edited:r)})){$('entry-dialog').close();editingEntry=null;toast('Entry updated.');}};
$('macro-history').onclick=e=>{const b=e.target.closest('button');if(b){selectDay(b.dataset.date);window.scrollTo({top:0,behavior:'smooth'});}};
$('weight-table').onclick=e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.action==='menu'){toggleEntryMenu(b);return;}
  const date=b.dataset.id,record=data.weights.find(r=>r.date===date);
  if(!record)return;
  closeEntryMenus();
  if(b.dataset.action==='delete'){
    if(save({...data,weights:data.weights.filter(r=>r.date!==date)}))toast('Weigh-in deleted.');
  }else if(b.dataset.action==='edit'){
    editingWeightDate=date;
    $('edit-weight-date').value=date;
    $('edit-weight-date').max=today();
    $('edit-weight-value').value=weightNumber(record.weight);
    $('edit-weight-dialog').showModal();
  }
};
$('close-weight-edit').onclick=()=>$('edit-weight-dialog').close();
$('edit-weight-dialog').onclose=()=>{editingWeightDate=null;};
$('edit-weight-form').onsubmit=e=>{
  e.preventDefault();
  if(!editingWeightDate||!data.weights.some(r=>r.date===editingWeightDate)){
    $('edit-weight-dialog').close();toast('This weigh-in no longer exists.');return;
  }
  const date=$('edit-weight-date').value,entered=Number($('edit-weight-value').value),existing=data.weights.find(r=>r.date===editingWeightDate);const weight=existing&&entered===weightNumber(existing.weight)?existing.weight:internalWeight(entered);
  if(!date||date>today()||!Number.isFinite(weight)||weight<=0||weight>2000){
    toast('Choose a valid date and positive weight.');return;
  }
  if(date!==editingWeightDate&&data.weights.some(r=>r.date===date)){
    toast('A weigh-in already exists for that date.');return;
  }
  const weights=[...data.weights.filter(r=>r.date!==editingWeightDate),{date,weight}];
  if(save({...data,weights})){$('edit-weight-dialog').close();toast('Weigh-in updated.');}
};
function setView(v){view=v;$('graph-panel').hidden=v!=='graph';$('weight-table').hidden=v!=='table';for(const t of ['graph','table']){$(t+'-view').classList.toggle('active',v===t);$(t+'-view').setAttribute('aria-pressed',String(v===t));}savePreferences();}
$('graph-view').onclick=()=>setView('graph');$('table-view').onclick=()=>setView('table');$('chart-range').onchange=()=>{renderWeight();savePreferences();};$('trend-range').onchange=()=>{renderWeight();savePreferences();};
function render(){renderMacros();renderWeight();renderMaintenance();}
$('foods-show-more').onclick=()=>{expandedFoods=true;renderMacros();};
$('entries-show-more').onclick=()=>{expandedEntriesDate=selected;renderMacros();};
function renderMacros(){const entries=data.entries.filter(r=>r.date===selected);$('cal-total').innerHTML=number(entries.reduce((s,r)=>s+r.calories,0))+'<span> kcal</span>';$('protein-total').innerHTML=number(entries.reduce((s,r)=>s+r.protein,0))+'<span> g</span>';$('day-label').textContent=selected===today()?'Today':dateLabel(selected);$('next-day').disabled=selected>=today();$('log-label').textContent=selected===today()?'Add to today':'Add to this day';$('entries-title').textContent=selected===today()?"Today's log":'Daily log';$('entry-count').textContent=entries.length+' entr'+(entries.length===1?'y':'ies');
const visibleFoods=data.foods.length>12&&!expandedFoods?data.foods.slice(0,10):data.foods;
$('foods-show-more').hidden=data.foods.length<=12||expandedFoods;$('foods-show-more').setAttribute('aria-expanded',String(expandedFoods));
const orderedEntries=[...entries].reverse(),entriesExpanded=expandedEntriesDate===selected;
const visibleEntries=entries.length>12&&!entriesExpanded?orderedEntries.slice(0,10):orderedEntries;
$('entries-show-more').hidden=entries.length<=12||entriesExpanded;$('entries-show-more').setAttribute('aria-expanded',String(entriesExpanded));
$('foods').innerHTML=visibleFoods.length?visibleFoods.map(r=>`<div class="row"><div><div class="row-name">${escape(r.name)}</div><div class="row-detail">${number(r.calories)} kcal · ${number(r.protein)} g protein</div></div><div class="row-actions"><select class="food-serving" aria-label="Servings of ${escape(r.name)}"><option value="0.5">½×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="3">3×</option><option value="4">4×</option><option value="5">5×</option></select><button class="text-button" data-action="add" data-id="${escape(r.id)}" aria-label="Add ${escape(r.name)} to today">Add</button>${entryMenu(r.id,r.name)}</div></div>`).join(''):empty('No saved foods.');
$('entries').innerHTML=visibleEntries.length?visibleEntries.map(r=>`<div class="row"><div class="entry-content"><span class="row-name">${escape(r.name)}</span><span class="row-detail">${number(r.calories)} kcal · ${number(r.protein)} g protein</span></div>${entryMenu(r.id,r.name,true)}</div>`).join(''):empty('No entries.');
const averages=recentMacroAverages(data.entries);
$('macro-avg-calories').innerHTML=(averages.calories===null?'—':number(Math.round(averages.calories)))+'<span> kcal</span>';
$('macro-avg-protein').innerHTML=(averages.protein===null?'—':number(Math.round(averages.protein*10)/10))+'<span> g</span>';
const averageNote=averages.loggedDays?`${averages.loggedDays} of 7 days logged`:'No logs in past 7 days';
$('macro-avg-calories-detail').textContent=averageNote;
$('macro-avg-protein-detail').textContent=averageNote;
const days=new Map();for(const r of data.entries){const sums=days.get(r.date)||{calories:0,protein:0};sums.calories+=r.calories;sums.protein+=r.protein;days.set(r.date,sums);}const sorted=[...days].sort((a,b)=>b[0].localeCompare(a[0]));$('macro-history').innerHTML=sorted.length?`<table><thead><tr><th>Date</th><th>Calories</th><th>Protein</th></tr></thead><tbody>${sorted.map(([d,r])=>`<tr><td><button data-date="${d}">${dateLabel(d)}</button></td><td>${number(r.calories)} kcal</td><td>${number(r.protein)} g</td></tr>`).join('')}</tbody></table>`:empty('No history yet.');}
function renderMaintenance(){
  const e=estimateMaintenance(data),ready=e.value!==null;
  $('maintenance-value').innerHTML=(ready?'≈ '+number(e.value):'—')+'<span> kcal / day</span>';
  $('maintenance-detail').textContent=e.detail+(ready&&e.lowDays?.length?' Check unusually low calorie logs on '+e.lowDays.slice(0,2).map(dateLabel).join(', ')+(e.lowDays.length>2?' and '+(e.lowDays.length-2)+' more day(s)':'')+'; those entries might be incomplete.':'');
  const targets=[['aggressive-cut',-500],['slow-cut',-250],['slow-bulk',250],['aggressive-bulk',500]];
  for(const [id,offset] of targets){const value=ready?e.value+offset:null;$(id+'-value').textContent=value!==null&&value>=1200?number(value)+' kcal':'—';}
  $('maintenance-target-note').textContent=ready?'Daily starting estimates: cuts subtract calories; bulks add them. Adjust to your actual trend. Targets below 1,200 kcal are not shown.':'Targets appear when your maintenance estimate is ready.';
  $('maintenance-status').textContent=ready?'Estimate available':'Gathering data';
  $('maintenance-period').textContent=e.first&&e.last?`${dateLabel(e.first)} – ${dateLabel(e.last)}`:'Your recent logging window';
  const progress=(id,value,goal)=>{$(id+'-text').textContent=`${value} / ${goal}`;$(id+'-bar').value=Math.min(value,goal);};
  progress('maintenance-logs',e.logged,21);progress('maintenance-weights',e.count,10);progress('maintenance-span',e.span,21);
  $('maintenance-coverage').textContent=e.count?`First week: ${e.early} · last week: ${e.late} weigh-ins (2 each needed).`:'Regular weigh-ins are needed at both ends of the period.';
  $('maintenance-freshness').textContent=e.last?`Latest: ${dateLabel(e.last)}${e.age>3?' · add a fresh weigh-in':''}`:'No weigh-ins in the current calorie-logging window.';
  $('maintenance-intake').textContent=ready?number(Math.round(e.intake))+' kcal / day':'—';
  $('maintenance-trend').textContent=ready?(e.weekly>0?'+':'')+number(Math.abs(displayWeight(e.weekly))<.005?0:displayWeight(e.weekly))+' '+weightUnit+' / week':'—';
  $('maintenance-adjustment').textContent=ready?(e.adjustment>=0?'+':'−')+number(Math.round(Math.abs(e.adjustment)))+' kcal / day':'—';
  $('maintenance-calculation-note').textContent=ready?(Math.abs(e.weekly)<.005?'Your weight is approximately stable, so maintenance is close to your average intake.':e.weekly>0?'Your weight trend is rising, so the estimate subtracts energy being stored.':'Your weight trend is falling, so the estimate adds energy being supplied by your body.'):'The breakdown appears once there is enough recent data.';
}

function renderWeight(){
  const all=[...data.weights].sort((a,b)=>a.date.localeCompare(b.date));
  const recent=all.filter(r=>r.date<=today()&&dayNumber(r.date)>=dayNumber(today())-6);
  const average=recent.length>=2?recent.reduce((sum,r)=>sum+r.weight,0)/recent.length:null;
  $('average-value').innerHTML=(average===null?'—':number(displayWeight(average)))+'<span> '+weightUnit+'</span>';
  $('average-detail').textContent=average===null?'Needs 2 weigh-ins in the past 7 days.':`${recent.length} weigh-ins · past 7 days`;
  const latest=all.at(-1);
  $('latest-value').innerHTML=(latest?number(displayWeight(latest.weight)):'—')+'<span> '+weightUnit+'</span>';
  $('latest-detail').textContent=latest?dateLabel(latest.date):'No weigh-ins yet.';
  const start=cutoff(Number($('trend-range').value)),rows=all.filter(r=>r.date>=start&&r.date<=today()),change=trend(rows);
  $('trend-value').innerHTML=(change===null?'—':(change>0?'+':'')+number(Math.abs(displayWeight(change))<.005?0:displayWeight(change)))+'<span> '+weightUnit+' / week</span>';
  $('trend-detail').textContent=change===null?'Needs 2 weigh-ins in this period.':`Based on ${rows.length} weigh-ins`;
  const highest=all.reduce((best,r)=>!best||r.weight>best.weight?r:best,null);
  const lowest=all.reduce((best,r)=>!best||r.weight<best.weight?r:best,null);
  $('highest-weight-value').innerHTML=(highest?number(displayWeight(highest.weight)):'—')+'<span> '+weightUnit+'</span>';
  $('highest-weight-detail').textContent=highest?dateLabel(highest.date):'No weigh-ins yet.';
  $('lowest-weight-value').innerHTML=(lowest?number(displayWeight(lowest.weight)):'—')+'<span> '+weightUnit+'</span>';
  $('lowest-weight-detail').textContent=lowest?dateLabel(lowest.date):'No weigh-ins yet.';
  $('weight-table').innerHTML=all.length?`<table><thead><tr><th>Date</th><th>Weight</th><th></th></tr></thead><tbody>${[...all].reverse().map(r=>`<tr><td>${dateLabel(r.date)}</td><td>${number(displayWeight(r.weight))} ${weightUnit}</td><td>${entryMenu(r.date,dateLabel(r.date)+' weigh-in')}</td></tr>`).join('')}</tbody></table>`:empty('No weigh-ins.');
  $('chart-unit').textContent=weightUnit;
  const range=$('chart-range').value;
  const min=range==='all'?'0000-00-00':range==='week'?new Date((dayNumber(today())-6)*86400000).toISOString().slice(0,10):cutoff(+range);
  drawChart(all.filter(r=>r.date>=min&&r.date<=today()),min);
}
function drawChart(rows,min){
  if(!rows.length){$('chart').innerHTML=empty('No weigh-ins in this range.');return;}
  const W=440,H=240,L=45,R=15,T=20,B=34,values=rows.map(r=>displayWeight(r.weight));
  const margin=weightUnit==='kg'?.45:1,minimumRange=weightUnit==='kg'?2:4;
  let low=Math.floor((Math.min(...values)-margin)*2)/2,high=Math.ceil((Math.max(...values)+margin)*2)/2;
  if(high-low<minimumRange){low-=minimumRange/4;high+=minimumRange/4;}
  const x0=dayNumber(min==='0000-00-00'?rows[0].date:min),x1=Math.max(dayNumber(today()),x0+1);
  const x=d=>L+(dayNumber(d)-x0)/(x1-x0)*(W-L-R),y=v=>T+(high-v)/(high-low)*(H-T-B);
  let grid='';
  for(let i=0;i<5;i++){
    const v=low+(high-low)*i/4;
    grid+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="#e7eade" stroke-dasharray="3 4"/><text x="${L-9}" y="${y(v)+4}" text-anchor="end">${number(v)}</text>`;
  }
  const pts=rows.map(r=>`${x(r.date)},${y(displayWeight(r.weight))}`).join(' ');
  const path=`M ${x(rows[0].date)},${H-B} L ${pts.replaceAll(' ',' L ')} L ${x(rows.at(-1).date)},${H-B} Z`;
  $('chart').innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight chart with ${rows.length} weigh-ins in ${weightUnit}"><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#a7c88b" stop-opacity=".35"/><stop offset="1" stop-color="#a7c88b" stop-opacity=".01"/></linearGradient></defs>${grid}<path d="${path}" fill="url(#fill)"/><polyline points="${pts}" fill="none" stroke="#719752" stroke-width="2" stroke-linejoin="round"/>${rows.map(r=>`<circle tabindex="0" role="button" aria-label="${dateLabel(r.date)}, ${number(displayWeight(r.weight))} ${weightUnit}" data-date="${r.date}" cx="${x(r.date)}" cy="${y(displayWeight(r.weight))}" r="4.5" fill="#719752" stroke="white" stroke-width="2"><title>${dateLabel(r.date)} · ${number(displayWeight(r.weight))} ${weightUnit}</title></circle>`).join('')}<text x="${L}" y="${H-6}">${new Date(x0*86400000).toLocaleDateString(undefined,{month:'short',day:'numeric',...(new Date(x0*86400000).getUTCFullYear()!==Number(today().slice(0,4))?{year:'numeric'}:{}),timeZone:'UTC'})}</text><text x="${W-R}" y="${H-6}" text-anchor="end">${dateLabel(today())}</text></svg><div class="chart-selection" id="chart-selection">${dateLabel(rows.at(-1).date)} · ${number(displayWeight(rows.at(-1).weight))} ${weightUnit}</div>`;
  const select=e=>{const d=e.target.dataset.date;if(d){const r=rows.find(r=>r.date===d);$('chart-selection').textContent=`${dateLabel(d)} · ${number(displayWeight(r.weight))} ${weightUnit}`;}};$('chart').onclick=select;$('chart').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(e);}};
}
function openMenuCategory(category){for(const name of ['account','data','preferences']){const open=name===category;$(name+'-category').setAttribute('aria-expanded',String(open));$(name+'-options').hidden=!open;}}
for(const name of ['account','data','preferences'])$(name+'-category').onclick=()=>openMenuCategory($(name+'-options').hidden?name:null);
function closeTools(){$('account-dialog').close();}
function openAccount(){closeEntryMenus();if($('storage-notice').open)$('storage-notice').close();if(!$('account-dialog').open)$('account-dialog').showModal();$('user-menu-toggle').setAttribute('aria-expanded','true');}
$('user-menu-toggle').onclick=openAccount;
$('account-dialog').onclose=()=>$('user-menu-toggle').setAttribute('aria-expanded','false');
$('account-dialog').addEventListener('click',e=>{if(e.target!==$('account-dialog'))return;const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeTools();});
function download(content,extension,mime){const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=document.createElement('a');a.href=url;a.download=`daily-backup-${today()}.${extension}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);closeTools();}
$('export-json').onclick=()=>{if(loadFailed){const raw=localStorage.getItem(KEY);if(raw)download(raw,'json','application/json');else toast('No saved data available.');return;}download(JSON.stringify({...exportBackup(data,weightUnit),exportedAt:new Date().toISOString()},null,2),'json','application/json');};$('export-csv').onclick=()=>download(toCSV(data,weightUnit),'csv','text/csv;charset=utf-8');$('import-button').onclick=()=>$('import-file').click();
$('import-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>20*1024*1024)throw Error('Backup is too large (maximum 20 MB).');const raw=await file.text(),incoming=file.name.toLowerCase().endsWith('.csv')?fromCSV(raw):validate(JSON.parse(raw));const counts=`${incoming.entries.length} macro entries, ${incoming.foods.length} foods, and ${incoming.weights.length} weigh-ins`;if(confirm(`Import ${counts}? This merges with your data. Matching IDs and weigh-in dates use the imported values.`)){const next=merge(data,incoming);if(loadFailed){localStorage.setItem(KEY,JSON.stringify(next));data=next;loadFailed=false;cloud?.changed();render();toast('Backup restored.');}else if(save(next))toast('Data imported.');closeTools();}}catch(err){toast(err.message||'Could not import this file.');}finally{e.target.value='';}};
window.addEventListener('storage',e=>{if(e.key===PREF_KEY){try{const p=JSON.parse(e.newValue||'{}');setTheme(p.theme==='dark'?'dark':'light');weightUnit=p.weightUnit==='kg'?'kg':'lb';updateWeightPreference();updateWeightInputs();renderWeight();renderMaintenance();}catch{};}if(e.key===KEY){undoState=null;$('undo-button').hidden=true;try{data=e.newValue?validate(JSON.parse(e.newValue)):{app:'daily-macros-weight',version:1,entries:[],foods:[],weights:[]};data={...data,foods:data.foods??data.meals??[]};render();}catch{toast('Data changed in another tab but could not be read.');}}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){const oldMax=$('macro-date').max;if(selected===oldMax)selected=today();$('macro-date').value=selected;$('macro-date').max=today();$('weight-date').max=today();render();}});updateWeightInputs();setView(preferences.view==='table'?'table':'graph');switchPage(defaultPage);showStorageNotice();// iOS Safari can still dispatch native pinch gestures despite viewport settings.
for(const type of ['gesturestart','gesturechange']){
  document.addEventListener(type,e=>e.preventDefault(),{passive:false});
}
if('serviceWorker' in navigator){
  let hadController=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(hadController)location.reload();
    hadController=true;
  });
  navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>{
    reg.update().catch(()=>{});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)reg.update().catch(()=>{});});
  }).catch(()=>{});
}

function showStorageNotice(){
  const noticeKey=GUEST_KEY+'-storage-notice-v2-seen';
  $('storage-notice-account').onclick=()=>{openMenuCategory('account');openAccount();if(!$('auth-form').hidden)$('account-login-email').focus();};
  $('storage-notice-close').onclick=()=>$('storage-notice').close();
  $('storage-notice').onclose=()=>{try{localStorage.setItem(noticeKey,'1');}catch{}};
  try{if(localStorage.getItem(noticeKey)==='1')return;}catch{}
  $('storage-notice').showModal();
}

cloud=createCloud({
  read:()=>data,
  activate:async user=>{
    const nextKey=user?GUEST_KEY+'-user-'+user:GUEST_KEY;
    if(nextKey===KEY)return;
    const stored=localStorage.getItem(nextKey);
    let next=stored?validate(JSON.parse(stored)):{app:'daily-macros-weight',version:1,entries:[],foods:[],weights:[]};
    if(user&&!stored&&KEY===GUEST_KEY&&(data.entries.length||data.foods.length||data.weights.length)&&confirm('Copy this device’s existing Daily data into this account? It will merge with your cloud history.'))next=structuredClone(data);
    localStorage.setItem(nextKey,JSON.stringify(next));
    KEY=nextKey;expandedFoods=false;expandedEntriesDate=null;data=next;loadFailed=false;undoState=null;render();
  },
  apply:next=>{if(loadFailed)throw Error('Restore your unreadable local data before syncing.');localStorage.setItem(KEY,JSON.stringify(next));data=next;undoState=null;render();},
  status:(message,user,configured)=>{
    $('cloud-status').textContent=message;$('account-email').textContent=user?.email||'Optional cloud backup';
    $('auth-form').hidden=!!user||!configured;$('code-form').hidden=!!user||!configured;$('account-actions').hidden=!user;
    $('cloud-unavailable').hidden=configured;
    $('storage-notice-account').textContent=user?'Open account':'Create account / sign in';
    $('storage-notice-close').textContent=user?'Continue':'Continue without an account';
  }
});
async function accountAction(action){
  const buttons=[...$('account-dialog').querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
  try{const message=await action();if(message)$('account-message').textContent=message;else $('account-message').textContent='';}
  catch(err){$('account-message').textContent=err.message;}
  finally{buttons.forEach(b=>b.disabled=false);}
}
$('account-login-email').value=cloud.pendingEmail();
$('auth-form').onsubmit=e=>{e.preventDefault();accountAction(async()=>{const message=await cloud.sendCode($('account-login-email').value.trim());$('account-code').value='';$('account-code').focus();return message;});};
$('code-form').onsubmit=e=>{e.preventDefault();if(!$('account-login-email').reportValidity())return;accountAction(async()=>{const message=await cloud.verifyCode($('account-login-email').value.trim(),$('account-code').value);$('account-code').value='';return message;});};
$('account-sync').onclick=()=>accountAction(()=>cloud.sync());
$('account-signout').onclick=()=>{if(confirm('Sign out? Unsynced changes stay on this device for this account. Your separate guest log will reopen.'))accountAction(()=>cloud.signOut());};
$('account-delete').onclick=()=>{if(confirm('Permanently delete this account and its cloud history? Export a backup first if you want to keep it.'))accountAction(()=>cloud.deleteAccount());};
window.addEventListener('storage',e=>{if(e.key===KEY)cloud.changed();if(e.key==='daily-cloud-session')location.reload();});
cloud.start();
