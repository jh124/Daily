import {exportBackup,validate} from '../core.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyData,reconcile} from '../sync-core.mjs';
const entry=(id,calories=100)=>({id,date:'2026-10-01',name:'Meal',calories,protein:10});
const doc=(entries=[],weights=[],foods=[])=>({...emptyData(),entries,weights,foods});
test('independent additions from two devices survive',()=>assert.deepEqual(new Set(reconcile(doc(),doc([entry('a')]),doc([entry('b')])).entries.map(r=>r.id)),new Set(['a','b'])));
test('unchanged offline device does not resurrect remote deletion',()=>assert.deepEqual(reconcile(doc([entry('a')]),doc([entry('a')]),doc()).entries,[]));
test('local deletion wins over unchanged remote',()=>assert.deepEqual(reconcile(doc([entry('a')]),doc(),doc([entry('a')])).entries,[]));
test('remote edit is adopted by unchanged device',()=>assert.equal(reconcile(doc([entry('a')]),doc([entry('a')]),doc([entry('a',200)])).entries[0].calories,200));
test('same-record conflict uses changed local version',()=>assert.equal(reconcile(doc([entry('a')]),doc([entry('a',300)]),doc([entry('a',200)])).entries[0].calories,300));
test('edits made during upload survive applying server response',()=>assert.deepEqual(reconcile(doc([entry('a')]),doc([entry('a'),entry('c')]),doc([entry('a'),entry('b')])).entries.map(r=>r.id).sort(),['a','b','c']));
test('weigh-in edits use date identity',()=>assert.equal(reconcile(doc([],[{date:'2026-10-01',weight:160}]),doc([],[{date:'2026-10-01',weight:161}]),doc([],[{date:'2026-10-01',weight:162}])).weights[0].weight,161));
test('meal deletion propagates',()=>assert.deepEqual(reconcile(doc([],[],[entry('m')]),doc([],[],[entry('m')]),doc()).foods,[]));
test('legacy cloud meals normalize to frequent foods',()=>{
  const legacy={app:'daily-macros-weight',version:1,entries:[],meals:[entry('legacy')],weights:[]};
  assert.equal(reconcile(emptyData(),emptyData(),legacy).foods[0].id,'legacy');
});
test('cloud merge keeps canonical pounds and kg export remains correct',()=>{
  const result=reconcile(emptyData(),doc([],[{date:'2026-10-01',weight:160}]),emptyData());
  assert.equal(result.weights[0].weight,160);
  const backup=exportBackup(result,'kg');
  assert.ok(Math.abs(backup.weights[0].weight-72.5747792)<.00001);
  assert.ok(Math.abs(validate(backup).weights[0].weight-160)<.00001);
});

const food=id=>({id,name:id,calories:100,protein:10});
const order=data=>data.foods.map(r=>r.id);
test('using a frequent food keeps its move to the top through cloud sync',()=>{
  const base=doc([],[],['a','b','c'].map(food));
  const local=doc([entry('logged-c')],[],[base.foods[2],...base.foods.slice(0,2)]);
  const synced=reconcile(base,local,base);
  assert.deepEqual(order(synced),['c','a','b']);
  assert.deepEqual(order(reconcile(local,local,synced)),['c','a','b']);
  assert.equal(synced.entries.length,1);
});
test('unchanged device follows another device frequent-food reorder',()=>{
  const base=doc([],[],['a','b','c'].map(food));
  const remote=doc([],[],[base.foods[2],...base.foods.slice(0,2)]);
  assert.deepEqual(order(reconcile(base,base,remote)),['c','a','b']);
});
test('new frequent foods stay at top and first sync preserves existing order',()=>{
  const base=doc([],[],['a','b'].map(food)),local=doc([],[],[food('new'),...base.foods]);
  assert.deepEqual(order(reconcile(base,local,base)),['new','a','b']);
  assert.deepEqual(order(reconcile(emptyData(),emptyData(),local)),['new','a','b']);
});
test('food reorder while an upload is in flight survives the response',()=>{
  const snapshot=doc([],[],['a','b','c'].map(food));
  const local=doc([],[],[snapshot.foods[1],snapshot.foods[0],snapshot.foods[2]]);
  const remote=doc([entry('remote-log')],[],snapshot.foods);
  const result=reconcile(snapshot,local,remote);
  assert.deepEqual(order(result),['b','a','c']);assert.equal(result.entries[0].id,'remote-log');
});
test('local reorder preserves remote food edits and deletions',()=>{
  const base=doc([],[],['a','b','c'].map(food));
  const local=doc([],[],[base.foods[2],base.foods[0],base.foods[1]]);
  const remote=doc([],[],[base.foods[0],{...base.foods[2],calories:300}]);
  const result=reconcile(base,local,remote);
  assert.deepEqual(order(result),['c','a']);assert.equal(result.foods[0].calories,300);
});
test('local food deletion does not erase a remote reorder of surviving foods',()=>{
  const base=doc([],[],['a','b','c'].map(food));
  assert.deepEqual(order(reconcile(base,doc([],[],[base.foods[0],base.foods[2]]),doc([],[],[base.foods[2],base.foods[0],base.foods[1]]))),['c','a']);
});
