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
