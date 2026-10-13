import test from 'node:test';
import assert from 'node:assert/strict';
import {cutoff,validDate,trend,validate,merge,toCSV,fromCSV,estimateMaintenance} from '../core.mjs';
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
