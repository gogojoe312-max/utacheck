const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {apply} = require('../recording-schedule-update.js');

const clone = value => structuredClone(value);
const expectedKeys = ['name', 'day', 'date', 'at', 'min', 'kind', 'place'];
const expected = slot => Object.fromEntries(expectedKeys.map(key => [key, slot[key]]));
const row = (id, at, extras = {}) => ({id, name:'Member ' + id, day:'2/3', date:'2031-02-03', at, min:60, kind:'member', place:'Example studio', ...extras});
const state = () => ({
  shows:[{id:'live', songs:['live-song']}], songs:[{id:'live-song', lines:[{text:'Keep'}]}],
  rsongs:[{id:'recording-song', lines:[{text:'Keep recording lyrics'}]}],
  notes:[{id:'note', text:'Keep this note'}], draws:{page:[{stroke:[1,2]}]},
  ghToken:'synthetic-token', selectedSlot:'alpha', optional:undefined,
  plan:{year:2031, timezone:'UTC', start:'10:00', startAt:123, source:'Example schedule', songIds:['recording-song'],
    slots:[row('alpha',600, {a0:602,a1:661,startAt:99,takes:[{id:'take',marks:['ok']}],secLog:{intro:12},notes:'Keep slot note',done:true}),
      row('beta',660), row('break',720,{kind:'break',min:30})]},
});
const packet = (current = state()) => ({app:'utacheck-recording-schedule-update', version:1, id:'change-example',
  year:2031, timezone:'UTC', updates:[{id:'alpha', expected:expected(current.plan.slots[0]), next:{at:480,min:75}}]});
const freeze = value => {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
};
function rejects(code, edit) {
  const current = state(), change = packet(current);
  edit(current, change);
  const before = clone(current);
  assert.throws(() => apply(current, change), error => error.code === code);
  assert.deepEqual(current, before);
}

test('only explicit planned time changes; all state, actuals, notes and order survive independently', () => {
  const current = state(), change = packet(current), before = clone(current), original = clone(change);
  const result = apply(freeze(current), freeze(change));
  assert.deepEqual(current,before);
  assert.deepEqual(change,original);
  assert.deepEqual(result.changed,['alpha']);
  assert.deepEqual(result.unchanged,[]);
  assert.deepEqual(result.skipped,[]);
  assert.deepEqual(result.unconfirmed,[]);
  const wanted = clone(before);
  Object.assign(wanted.plan.slots[0],change.updates[0].next);
  assert.deepEqual(result.state,wanted);
  assert.notEqual(result.state,current);
  assert.notEqual(result.state.plan,current.plan);
  assert.notEqual(result.state.plan.slots[0].takes,current.plan.slots[0].takes);
  assert.notEqual(result.state.rsongs[0].lines,current.rsongs[0].lines);
  assert.equal(Object.hasOwn(result.state,'optional'),true);
  assert.deepEqual(result.state.plan.slots.map(slot=>slot.id),['alpha','beta','break']);
});

test('repeated import is an exact no-op, including with unrelated pre-existing conflict', () => {
  const change = packet(), first = apply(state(),change).state;
  first.plan.slots.push(row('unrelated',480));
  const before = clone(first), again = apply(first,change);
  assert.equal(again.state,first);
  assert.deepEqual(again.unchanged,['alpha']);
  assert.deepEqual(again.changed,[]);
  assert.deepEqual(first,before);
});

test('an operation can exchange two member times without reordering or touching actuals', () => {
  const current = state(), change = packet(current);
  change.updates[0].next = {at:660,min:60};
  change.updates.push({id:'beta',expected:expected(current.plan.slots[1]),next:{at:600,min:60}});
  const result = apply(current,change);
  assert.deepEqual(result.changed,['alpha','beta']);
  assert.deepEqual(result.state.plan.slots.map(slot=>slot.id),['alpha','beta','break']);
  assert.equal(result.state.plan.slots[0].a0,602);
});

test('explicit unconfirmed rows retain all old planned and actual fields, and stop blocking new times', () => {
  const current = state(), change = packet(current), before = clone(current);
  current.plan.slots[2].takes = [{id:'break-note',memo:'Keep'}];
  change.updates[0].next = {at:720,min:60};
  change.unconfirmed = [{id:'break',expected:expected(current.plan.slots[2])}];
  const result = apply(current,change);
  assert.deepEqual(result.unconfirmed,['break']);
  assert.deepEqual(result.state.plan.slots[2],{...current.plan.slots[2],scheduleTimeUnconfirmed:true});
  assert.equal(current.plan.slots[2].scheduleTimeUnconfirmed,undefined);
  assert.deepEqual(result.state.plan.slots[0].takes,before.plan.slots[0].takes);
  const again = apply(result.state,change);
  assert.equal(again.state,result.state);
  assert.deepEqual(again.unchanged,['alpha','break']);
  assert.deepEqual(again.unconfirmed,[]);
});

test('only explicit old rows receive the unconfirmed flag, including a completed member', () => {
  const current=state(), change=packet(current);
  change.updates=[];
  change.unconfirmed=[{id:'alpha',expected:expected(current.plan.slots[0])}];
  const result=apply(current,change);
  assert.deepEqual(result.changed,[]);
  assert.deepEqual(result.unconfirmed,['alpha']);
  assert.deepEqual(result.state.plan.slots[0],{...current.plan.slots[0],scheduleTimeUnconfirmed:true});
  assert.deepEqual(result.state.plan.slots.slice(1),current.plan.slots.slice(1));
});

test('unknown target is reported without substitution, and known target can be previewed separately', () => {
  const current = state(), change = packet(current);
  change.updates.push({id:'absent',expected:expected(current.plan.slots[1]),next:{at:840,min:60}});
  const result = apply(current,change);
  assert.deepEqual(result.changed,['alpha']);
  assert.deepEqual(result.skipped,[{id:'absent',reason:'TARGET_NOT_FOUND'}]);
  assert.deepEqual(result.state.plan.slots[1],current.plan.slots[1]);
});

test('only missing targets produce a no-op with a report for updates and unconfirmed', () => {
  const current = state(), change = packet(current);
  change.updates[0].id='absent';
  change.unconfirmed=[{id:'other-missing',expected:expected(current.plan.slots[2])}];
  const result=apply(current,change);
  assert.equal(result.state,current);
  assert.deepEqual(result.skipped,[{id:'absent',reason:'TARGET_NOT_FOUND'},{id:'other-missing',reason:'TARGET_NOT_FOUND'}]);
});

for (const key of ['name','day','date','kind','place','at','min']) {
  test('stale '+key+' fails atomically without an old-name fallback', () => rejects('EXPECTED_MISMATCH',(current) => {
    if (key==='at'||key==='min') current.plan.slots[0][key]+=1;
    else current.plan.slots[0][key]+=' changed';
  }));
}
test('even an already-applied time requires exact slot identity',()=>rejects('EXPECTED_MISMATCH',(current,change)=>{
  Object.assign(current.plan.slots[0],change.updates[0].next);
  current.plan.slots[0].place='Different studio';
}));
test('partially applied time pair is rejected',()=>rejects('EXPECTED_MISMATCH',(current,change)=>{
  current.plan.slots[0].at=change.updates[0].next.at;
}));
test('duplicate current target ID is ambiguous even when one row matches',()=>rejects('AMBIGUOUS_TARGET',(current)=>{
  current.plan.slots.push(row('alpha',900));
}));
test('duplicate packet IDs are rejected across operation types',()=>rejects('DUPLICATE_TARGET',(current,change)=>{
  change.unconfirmed=[{id:'alpha',expected:expected(current.plan.slots[0])}];
}));
test('duplicate update is rejected',()=>rejects('DUPLICATE_TARGET',(current,change)=>change.updates.push(clone(change.updates[0]))));
test('known overlap leaves all inputs unchanged',()=>rejects('SCHEDULE_OVERLAP',(current,change)=>change.updates[0].next={at:650,min:60}));
test('a later conflict also prevents the earlier valid change',()=>rejects('EXPECTED_MISMATCH',(current,change)=>{
  change.unconfirmed=[{id:'break',expected:expected(current.plan.slots[2])}];
  current.plan.slots[2].place='New place';
}));
test('new unconfirmed flag cannot be applied to an actually live slot',()=>rejects('LIVE_TARGET',(current,change)=>{
  current.plan.slots[2].a0=720;
  current.plan.slots[2].a1=null;
  change.unconfirmed=[{id:'break',expected:expected(current.plan.slots[2])}];
}));
test('repeated unconfirmed flag does not rewrite live actuals',()=>{
  const current=state(),change=packet(current);
  current.plan.slots[2].scheduleTimeUnconfirmed=true;
  current.plan.slots[2].a0=720;
  change.updates=[];
  change.unconfirmed=[{id:'break',expected:expected(current.plan.slots[2])}];
  assert.equal(apply(current,change).state,current);
});

test('adjacent boundary is allowed and no inferred gap or break is inserted',()=>{
  const current=state(),change=packet(current);
  change.updates[0].next={at:555,min:105};
  const result=apply(current,change);
  assert.equal(result.state.plan.slots.length,3);
  assert.deepEqual(result.state.plan.slots.slice(1),current.plan.slots.slice(1));
});
test('different exact date does not collide at the same time',()=>{
  const current=state(),change=packet(current);
  current.plan.slots[1].date='2032-02-03';
  change.updates[0].next={at:660,min:60};
  assert.deepEqual(apply(current,change).changed,['alpha']);
});
test('legacy day-only row is included in the same-day overlap check',()=>rejects('SCHEDULE_OVERLAP',(current,change)=>{
  delete current.plan.slots[1].date;
  change.updates[0].next={at:660,min:60};
}));
test('same-day missing time is not inferred from preceding slots',()=>rejects('UNKNOWN_SCHEDULE_TIME',(current)=>{
  current.plan.slots[2].at=null;
}));
test('unrelated row with unknown date stays unchanged and is explicitly reported',()=>{
  const current=state(),change=packet(current);
  delete current.plan.slots[2].date;
  delete current.plan.slots[2].day;
  const result=apply(current,change);
  assert.deepEqual(result.skipped,[{id:'break',reason:'SCHEDULE_DATE_UNKNOWN'}]);
  assert.deepEqual(result.state.plan.slots[2],current.plan.slots[2]);
});
test('existing archived or unconfirmed rows are preserved and cannot block a revised plan',()=>{
  for(const flag of ['scheduleArchived','scheduleTimeUnconfirmed']){
    const current=state(),change=packet(current);
    current.plan.slots[1][flag]=true;
    change.updates[0].next={at:660,min:60};
    const result=apply(current,change);
    assert.deepEqual(result.state.plan.slots[1],current.plan.slots[1]);
  }
});
test('an existing unconfirmed flag is never silently cleared by a time update',()=>{
  const current=state(),change=packet(current);
  current.plan.slots[0].scheduleTimeUnconfirmed=true;
  assert.equal(apply(current,change).state.plan.slots[0].scheduleTimeUnconfirmed,true);
});

for(const [name,edit,code='INVALID_PACKET'] of [
  ['wrong app',(s,p)=>p.app='utacheck'],
  ['wrong version',(s,p)=>p.version=2],
  ['empty operation ID',(s,p)=>p.id=''],
  ['control character ID',(s,p)=>p.id='example\n'],
  ['oversized ID',(s,p)=>p.updates[0].id='x'.repeat(201)],
  ['unknown top-level field',(s,p)=>p.source='unspecified'],
  ['archive operation',(s,p)=>p.archive=[]],
  ['empty operations',(s,p)=>p.updates=[]],
  ['missing expected field',(s,p)=>delete p.updates[0].expected.place],
  ['extra expected field',(s,p)=>p.updates[0].expected.takes=[]],
  ['extra next field',(s,p)=>p.updates[0].next.a0=600],
  ['extra target field',(s,p)=>p.updates[0].other=true],
  ['break time update',(s,p)=>p.updates[0].expected.kind='break'],
  ['bad date',(s,p)=>p.updates[0].expected.date='2031-02-29'],
  ['date/day mismatch',(s,p)=>p.updates[0].expected.day='2/4'],
  ['noninteger time',(s,p)=>p.updates[0].next.at=480.5],
  ['negative time',(s,p)=>p.updates[0].next.at=-1],
  ['non-number time',(s,p)=>p.updates[0].next.at='480'],
  ['NaN time',(s,p)=>p.updates[0].next.at=NaN],
  ['infinite time',(s,p)=>p.updates[0].next.at=Infinity],
  ['zero duration',(s,p)=>p.updates[0].next.min=0],
  ['oversized duration',(s,p)=>p.updates[0].next.min=1441],
  ['out-of-range end',(s,p)=>p.updates[0].next={at:2870,min:60}],
  ['too many operations',(s,p)=>p.updates=Array(501).fill(p.updates[0])],
  ['array extra key',(s,p)=>p.updates.sideEffect=true],
  ['array hole',(s,p)=>p.updates.length=2],
  ['invalid timezone',(s,p)=>p.timezone='Invalid/Zone'],
  ['wrong year',(s,p)=>s.plan.year=2032,'YEAR_MISMATCH'],
  ['wrong timezone',(s,p)=>s.plan.timezone='Etc/UTC','TIMEZONE_MISMATCH'],
  ['packet/date year conflict',(s,p)=>p.year=2032,'YEAR_MISMATCH'],
]) test('rejects '+name,()=>rejects(code,edit));

for(const key of ['__proto__','constructor','prototype']){
  for(const path of ['root','entry','expected','next'])test('rejects unsafe key '+key+' in '+path,()=>rejects('INVALID_PACKET',(s,p)=>{
    const target=path==='root'?p:path==='entry'?p.updates[0]:p.updates[0][path];
    Object.defineProperty(target,key,{value:{polluted:true},enumerable:true});
  }));
}
test('packet accessors are rejected without executing their code',()=>{
  const current=state(),change=packet(current);
  let called=false;
  Object.defineProperty(change.updates[0].next,'min',{get(){called=true;throw new Error('executed');},enumerable:true});
  assert.throws(()=>apply(current,change),error=>error.code==='INVALID_PACKET');
  assert.equal(called,false);
});
test('symbol properties cannot invoke custom type conversion during validation',()=>{
  const current=state(),change=packet(current);
  let called=false;
  Object.defineProperty(change,Symbol.toStringTag,{get(){called=true;throw new Error('executed');}});
  assert.throws(()=>apply(current,change),error=>error.code==='INVALID_PACKET');
  assert.equal(called,false);
});
test('payload inherited properties cannot replace required fields',()=>{
  const current=state(),change=packet(current),entry=change.updates[0];
  entry.expected=Object.create(entry.expected);
  assert.throws(()=>apply(current,change),error=>error.code==='INVALID_PACKET');
});
test('optional year/timezone can be omitted without rewriting plan metadata',()=>{
  const current=state(),change=packet(current);
  delete change.year;delete change.timezone;
  const result=apply(current,change);
  assert.equal(result.state.plan.year,2031);
  assert.equal(result.state.plan.timezone,'UTC');
});
test('legacy plan without year or timezone can use exact slot dates without adding metadata',()=>{
  const current=state(),change=packet(current);
  delete current.plan.year;delete current.plan.timezone;
  const result=apply(current,change);
  assert.deepEqual(result.changed,['alpha']);
  assert.equal(Object.hasOwn(result.state.plan,'year'),false);
  assert.equal(Object.hasOwn(result.state.plan,'timezone'),false);
  assert.equal(Object.hasOwn(current.plan,'year'),false);
  assert.equal(Object.hasOwn(current.plan,'timezone'),false);
});
test('missing plan metadata cannot bypass packet date/year validation',()=>rejects('YEAR_MISMATCH',(current,change)=>{
  delete current.plan.year;delete current.plan.timezone;
  change.year=2032;
}));
test('legacy plan still validates every unconfirmed date against packet year',()=>rejects('YEAR_MISMATCH',(current,change)=>{
  delete current.plan.year;delete current.plan.timezone;
  change.unconfirmed=[{id:'break',expected:{...expected(current.plan.slots[2]),date:'2032-02-03'}}];
}));
test('browser API accepts JSON data from another realm and remains frozen',()=>{
  const context=vm.createContext({});
  vm.runInContext(fs.readFileSync(__dirname+'/../recording-schedule-update.js','utf8'),context);
  assert.equal(typeof context.RecordingScheduleUpdate.apply,'function');
  assert.equal(Object.isFrozen(context.RecordingScheduleUpdate),true);
  assert.equal(context.RecordingScheduleUpdate.apply(state(),packet()).state.plan.slots[0].at,480);
});
