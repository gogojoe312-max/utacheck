const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const c = vm.createContext({});
vm.runInContext(src.slice(src.indexOf('function recordingAdditionScopedMembers'), src.indexOf('function chooseRecordingAddition')), c);
const clone = x => JSON.parse(JSON.stringify(x));
const merge = (s,p) => clone(c.mergeRecordingAddition(s,p));
const scoped = (s,p,m) => clone(c.recordingAdditionScopedMembers(s,p,m));
const packet = () => ({app: 'utacheck-recording-addition', version: 1,
  group: {id: 'rec-new', name: 'Test Group', nopub: 1},
  members: [{id: 'source-a', name: 'Member'}], roster: ['Member'],
  songs: [{id: 'new-song', title: 'New Song', groupId: 'rec-new', roster: ['source-a'], blocks: {A: ['source-a']},
    lines: [{t: 'Synthetic line', parts: ['source-a'], main: ['source-a'], extra: []}, {t: 'Unassigned', parts: [], main: [], extra: []}]}],
  plan: {year: 2026, timezone: 'Asia/Tokyo', slots: [{id: 'new-slot', day: '10/8', date: '2026-10-08', at: 600, min: 90}]}});
const state = () => ({
  groups: [{id: 'target', name: 'Test Group', src: 'synthetic-existing-source', gistId: 'synthetic'}, {id: 'other', name: 'Other Group'}],
  members: [{id: 'editor-a', name: 'Member'}, {id: 'unrelated-a', name: 'Member Elsewhere'}],
  rosters: {'Test Group': ['Member'], 'Other Group': ['Member Elsewhere']},
  songs: [{id: 'live', groupId: 'target', roster: ['editor-a'], lines: [{t: 'Keep me', parts: ['editor-a']}]},
    {id: 'other-song', groupId: 'other', roster: ['unrelated-a'], lines: []}],
  rsongs: [{id: 'old-rec', title: 'Existing REC', groupId: 'target', roster: ['editor-a'], lines: []}],
  shows: [{id: 'show', name: 'Keep show'}], notes: [{id: 'note', songId: 'live', memberIds: ['editor-a'], hand: {strokes: [[1,2]]}}],
  pubNotes: [{id: 'pub-note'}], ghToken: 'synthetic-token', bkKey: 'synthetic-key', groupId: 'target',
  plan: {slots: [{id: 'existing-run', day: '10/7', at: 600, min: 90, a0: 1234, secLog: {A: 45}, secCur: 'A'}]},
});
const refusesUnchanged = (change, pattern = /曖昧/) => {
  const s = state(), p = packet(); change(s,p); const snapshot = clone(s), packetSnapshot = clone(p);
  assert.throws(() => merge(s,p), pattern); assert.deepEqual(s,snapshot); assert.deepEqual(p,packetSnapshot);
};
test('group roster and live references resolve synthetic unrelated surname ambiguity', () => {
  const s=state(), p=packet(), original=clone(s), pp=clone(p);
  const r=merge(s,p).state; assert.equal(r.rsongs[1].roster[0], 'editor-a');
  assert.deepEqual(s,original); assert.deepEqual(p,pp);
  for (const key of Object.keys(original).filter(k => !['groups','members','rsongs','rosters','plan'].includes(k))) assert.deepEqual(r[key], original[key]);
  for (const key of ['groups','members','rsongs']) assert.deepEqual(r[key].slice(0,original[key].length),original[key]);
  assert.deepEqual(r.rosters,original.rosters); assert.deepEqual(r.plan.slots[0],original.plan.slots[0]);
  assert.deepEqual(r.rsongs[1].lines[1].parts,[]); assert.equal(r.rsongs[1].lines[0].bars,undefined);
});
test('all candidate IDs within target roster and songs remain ambiguous', () => refusesUnchanged(s => {
  s.rosters['Test Group'].push('Member Elsewhere'); s.songs[0].roster.push('unrelated-a');
}));
test('same display name under different current IDs both referenced in group remains ambiguous', () => refusesUnchanged(s => {
  s.members[1].name = 'Member'; s.songs[0].roster.push('unrelated-a');
}));
test('same display name with unrelated ID only referenced outside group resolves correctly', () => {
  const s=state(); s.members[1].name='Member'; assert.equal(merge(s,packet()).state.rsongs[1].roster[0],'editor-a');
});
test('same-named groups union evidence and reject multiple eligible IDs', () => refusesUnchanged(s => {
  s.groups[1].name = 'Test Group'; s.rosters['Test Group'].push('Member Elsewhere');
}));
test('missing exact group name cannot be guessed', () => refusesUnchanged(s => {s.groups[0].name='Test Group New';}));
test('missing group roster cannot be inferred from songs', () => refusesUnchanged(s => {delete s.rosters['Test Group'];}));
test('roster alone cannot supply unreferenced ID', () => refusesUnchanged(s => {s.songs=[]; s.rsongs=[];}));
test('songs alone cannot override roster names', () => refusesUnchanged(s => {s.rosters['Test Group']=['Unknown'];}));
test('normalized duplicate roster keys remain ambiguous', () => refusesUnchanged(s => {s.rosters['TestGroup']=['Member'];}));
test('unique references from existing recording songs support resolution', () => {
  const s=state(); s.songs=[]; assert.equal(merge(s,packet()).state.rsongs[1].roster[0],'editor-a');
});
test('block/main/extra references are considered without inventing roster IDs', () => {
  const s=state(); s.rsongs=[]; s.songs[0]={id:'live',groupId:'target',blocks:{A:['editor-a']},lines:[{parts:[],main:[],extra:['editor-a']}]};
  assert.equal(merge(s,packet()).state.rsongs[0].roster[0],'editor-a');
});
test('invalid supplied preview binding is never replaced by scope fallback', () => refusesUnchanged((s,p) => {p.memberBindings={'source-a':'preview-random'};}, /確認済みメンバーID/));
test('supplied binding with mismatched name remains rejected', () => refusesUnchanged((s,p) => {p.memberBindings={'source-a':'unrelated-a'};}, /確認済みメンバーID/));
test('supplied incomplete binding remains rejected', () => refusesUnchanged((s,p) => {p.memberBindings={};}, /対応が不足/));
test('globally unique original behavior is unchanged', () => {
  const s=state(); s.members.pop(); delete s.rosters['Test Group']; s.groups[0].name='Different';
  assert.equal(merge(s,packet()).state.rsongs[1].roster[0], 'editor-a');
});
test('unknown dates and overlapping old runs remain rejected after resolution', () => {
  refusesUnchanged(s => {delete s.plan.slots[0].day;}, /日付が不明/);
  refusesUnchanged(s => {s.plan.slots[0].day='10/8';}, /重なり/);
});
test('duplicate import still stops', () => {
  const p=packet(), r=merge(state(),p).state; assert.throws(() => merge(r,p),/既にあります/);
});

const fixture = () => ({
  s: {groups:[{id:'g',name:'Group'},{id:'other',name:'Other'}],
    members:[{id:'a',name:'Member Full'},{id:'b',name:'Member Elsewhere'}],
    rosters:{Group:['Member Full']},songs:[{id:'old',groupId:'g',roster:['a']}],rsongs:[],plan:{slots:[]}},
  p: {app:'utacheck-recording-addition',version:1,group:{id:'new',name:'Group',nopub:1},
    members:[{id:'source',name:'Member'}],roster:['Member'],
    songs:[{id:'new-song',title:'New',groupId:'new',roster:['source'],lines:[{parts:['source'],main:[],extra:[]}]}],
    plan:{slots:[{id:'slot',date:'2026-10-08',day:'10/8',at:600,min:90}]}}
});
test('regression: overlapping packet aliases must not collapse to one current member',()=>{
  const {s,p}=fixture(); p.members.push({id:'alias',name:'Member Full'}); p.songs[0].roster.push('alias');
  assert.throws(()=>merge(s,p),/同じメンバーID|複数|曖昧/);
});
test('regression: a chosen member ID duplicated under another name must reject',()=>{
  const {s,p}=fixture(); s.members.unshift({id:'a',name:'Different Person'});
  assert.throws(()=>merge(s,p),/メンバーID|複数|曖昧/);
});
test('delivery group does not become evidence for original membership',()=>{
  const {s,p}=fixture(); s.songs[0].groupId='other'; s.songs[0].deliveryGroupId='g';
  assert.deepEqual(scoped(s,p,s.members),[]);
});
test('original group evidence remains usable after a delivery override',()=>{
  const {s,p}=fixture(); s.songs[0].deliveryGroupId='other';
  assert.deepEqual(scoped(s,p,s.members).map(m=>m.id),['a']);
});
test('stale same-name ID with no original-group references is excluded',()=>{
  const {s,p}=fixture(); s.members.push({id:'stale',name:'Member Full'});
  assert.deepEqual(scoped(s,p,s.members).map(m=>m.id),['a']);
});
test('stale and current same-name IDs both referenced remain ambiguous',()=>{
  const {s,p}=fixture(); s.members.push({id:'stale',name:'Member Full'});s.songs[0].roster.push('stale');
  assert.throws(()=>merge(s,p),/曖昧/);
});
