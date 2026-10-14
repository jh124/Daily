import test from 'node:test';
import assert from 'node:assert/strict';
import {cutoff,validDate,trend,validate,merge,toCSV,fromCSV,estimateMaintenance,weightToUnit,weightFromUnit,exportBackup,LB_PER_KG,isDuplicateFood} from '../core.mjs';
const day=n=>new Date(Date.UTC(2026,8,15+n)).toISOString().slice(0,10);
const now=day(28);
const records=(weekly=0)=>({
  app:'daily-macros-weight',version:1,foods:[],
  entries:Array.from({length:28},(_,i)=>({id:'entry-'+i,date:day(i),name:'Day '+i,calories:3000,protein:140})),
  weights:[0,2,6,8,12,16,20,24,26,28].map(i=>({date:day(i),weight:170+weekly*i/7}))
});
test('steady weight and complete logs produce stable maintenance',()=>{
  const r=estimateMaintenance(records(),now);
  assert.equal(r.value,3000);assert.equal(r.logged,28);assert.equal(r.span,28);
  assert.deepEqual(r.lowDays,[]);
});
test('half-pound weekly gain subtracts 250 kcal from maintenance',()=>{
  assert.equal(estimateMaintenance(records(.5),now).value,2750);
});
test("today's calories do not enter maintenance",()=>{
  const d=records();d.entries.push({id:'today',date:now,name:'Snack',calories:10000,protein:50});
  assert.equal(estimateMaintenance(d,now).value,3000);
});
test('missing day interrupts the consecutive calorie log',()=>{
  const d=records();d.entries.pop();
  const r=estimateMaintenance(d,now);
  assert.equal(r.value,null);assert.equal(r.logged,0);
});
test('rapid weekly change pauses maintenance',()=>{
  assert.equal(estimateMaintenance(records(2),now).value,null);
});
test('low calorie day warns without suppressing a valid estimate',()=>{
  const d=records();d.entries[12].calories=500;
  const r=estimateMaintenance(d,now);
  assert.notEqual(r.value,null);assert.deepEqual(r.lowDays,[day(12)]);
});
test('weight freshness matters even with enough weight measurements',()=>{
  const d=records();
  d.weights=d.weights.filter(r=>r.date!==day(26)&&r.date!==day(28));
  d.weights.push({date:day(10),weight:170},{date:day(18),weight:170});
  const r=estimateMaintenance(d,now);
  assert.equal(r.count,10);assert.equal(r.age,4);assert.equal(r.value,null);
});
test('calendar boundary and invalid dates',()=>{
  assert.equal(validDate('2026-02-30'),false);assert.equal(cutoff(1,'2026-03-31'),'2026-02-28');
});
test('weight trend uses linear regression',()=>{
  assert.ok(Math.abs(trend(records(.5).weights)-.5)<1e-9);
});
test('old JSON backups using meals still validate',()=>{
  const d=records();d.meals=[{id:'legacy',name:'Breakfast',calories:400,protein:20}];delete d.foods;
  assert.equal(validate(d).foods[0].name,'Breakfast');
});
test('CSV exports round-trip commas, quotes and newlines',()=>{
  const d=records();d.foods=[{id:'food',name:'Milk, "choccy"\nlarge',calories:500,protein:20}];
  const restored=fromCSV(toCSV(d));
  assert.equal(restored.foods[0].name,d.foods[0].name);
  assert.equal(restored.weights.length,d.weights.length);
  assert.equal(restored.entries.length,d.entries.length);
});
test('CSV with a UTF-8 BOM can be imported',()=>{
  assert.equal(fromCSV('\uFEFF'+toCSV(records())).entries.length,28);
});
test('import replaces matching weigh-in date, not duplicates it',()=>{
  const a=records(),b=records();b.weights[0]={date:day(0),weight:175};
  const result=merge(a,b);
  assert.equal(result.weights.length,a.weights.length);
  assert.equal(result.weights.find(r=>r.date===day(0)).weight,175);
});

test('unit conversion round-trips without changing the source weight',()=>{
  assert.ok(Math.abs(weightToUnit(200,'kg')-90.718474)<.000001);
  assert.ok(Math.abs(weightFromUnit(weightToUnit(170,'kg'),'kg')-170)<1e-10);
});
test('JSON kg backup carries its unit and imports as canonical pounds',()=>{
  const original=records(),exported=exportBackup(original,'kg');
  assert.equal(exported.weightUnit,'kg');
  assert.ok(Math.abs(exported.weights[0].weight-77.1107029)<1e-6);
  assert.equal(original.weights[0].weight,170);
  const restored=validate(JSON.parse(JSON.stringify(exported)));
  assert.ok(Math.abs(restored.weights[0].weight-170)<1e-6);
  assert.equal(restored.weightUnit,undefined);
  assert.equal(estimateMaintenance(restored,now).value,3000);
});
test('CSV kg backup includes unit metadata and imports all weights correctly',()=>{
  const original=records(),csv=toCSV(original,'kg');
  assert.match(csv,/weight_unit/);
  assert.match(csv,/"kg"/);
  const restored=fromCSV(csv);
  assert.equal(restored.weights.length,original.weights.length);
  for(let i=0;i<original.weights.length;i++){
    assert.ok(Math.abs(restored.weights[i].weight-original.weights[i].weight)<1e-6);
  }
});
test('old seven-column CSV backups still import as pounds',()=>{
  const oldCSV='type,id,date,name,calories,protein,weight\r\n'+
   '"entry","oldentry","2026-10-01","Breakfast","500","20",""\r\n'+
   '"meal","oldmeal","","Old food","200","10",""\r\n'+
   '"weight","","2026-10-01","","","","180"\r\n';
  const restored=fromCSV(oldCSV);
  assert.equal(restored.weights[0].weight,180);
  assert.equal(restored.foods[0].name,'Old food');
});
test('old JSON backups without weightUnit are pounds',()=>{
  const restored=validate(records());
  assert.equal(restored.weights[0].weight,170);
});
test('merged mixed-unit imports do not duplicate dates or distort maintenance',()=>{
  const lbs=records(),kg=fromCSV(toCSV(records(),'kg'));
  assert.equal(merge(lbs,kg).weights.length,lbs.weights.length);
  assert.equal(estimateMaintenance(merge(lbs,kg),now).value,3000);
});
test('unknown units are rejected rather than silently misread',()=>{
  assert.throws(()=>validate({...records(),weightUnit:'stone'}),/unit/i);
  assert.throws(()=>fromCSV(toCSV(records(),'kg').replaceAll('"kg"','"stone"')),/unit/i);
});

test('frequent foods reject matching name, calories and protein but allow variants',()=>{
  const foods=[{id:'one',name:'Chocolate Milk',calories:500,protein:20}];
  assert.equal(isDuplicateFood(foods,{name:' chocolate milk ',calories:500,protein:20}),true);
  assert.equal(isDuplicateFood(foods,{name:'Chocolate Milk',calories:501,protein:20}),false);
  assert.equal(isDuplicateFood(foods,{name:'Chocolate Milk',calories:500,protein:21}),false);
  assert.equal(isDuplicateFood(foods,{name:'Other Milk',calories:500,protein:20}),false);
  assert.equal(isDuplicateFood(foods,{name:'Chocolate Milk',calories:500,protein:20},'one'),false);
  assert.equal(isDuplicateFood([...foods,{id:'two',name:'Chocolate Milk',calories:500,protein:20}],{name:'Chocolate Milk',calories:500,protein:20},'two'),true);
});
