'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../app.js','utf8');
const read=name=>{const i=source.indexOf('function '+name+'(');assert(i>=0,name);return source.slice(i,source.indexOf('\n}',i)+2);};
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const S={groups:[],plan:{slots:[]},rsongs:[]},c=vm.createContext({Date,S});
 for(const name of ['recordingClassification','recordingBrowseDate','recordingBrowseDateCompare','recordingBrowseLabelDates','recordingBrowseDates','recordingBrowseEntries','recordingBrowseDateGroups'])vm.runInContext(read(name),c);
 return {S,c,dates:song=>clone(c.recordingBrowseDates(song)),keys:label=>clone(c.recordingBrowseLabelDates(label)).map(date=>date.key)};
}
test('complete ISO dates and shorthand lists retain every explicit day without inventing intermediate days',()=>{
 const f=fixture();
 assert.deepEqual(f.keys('2026-10-19・2026-10-20'),['2026-10-20','2026-10-19']);
 assert.deepEqual(f.keys('2026/10/8・10'),['2026-10-10','2026-10-08']);
 assert.deepEqual(f.keys('2026/10/8.09'),['2026-10-09','2026-10-08']);
 assert.deepEqual(f.keys('REC ２０２６年１０月１９日（月）・２０日（火）'),['2026-10-20','2026-10-19']);
 assert.deepEqual(f.keys('261019 REC'),['2026-10-19']);
 assert.deepEqual(f.keys('2026/10/8・8・10'),['2026-10-10','2026-10-08']);
});
test('explicit valid ranges expand across days and months without guessing an unstated rollover',()=>{
 const f=fixture();
 for(const separator of ['〜','～','~','–','—','-'])assert.deepEqual(f.keys('2026/10/8'+separator+'10'),['2026-10-10','2026-10-09','2026-10-08']);
 assert.deepEqual(f.keys('2026/10/30〜11/2'),['2026-11-02','2026-11-01','2026-10-31','2026-10-30']);
 assert.deepEqual(f.keys('2026/12/31〜2027/1/2'),['2027-01-02','2027-01-01','2026-12-31']);
 assert.deepEqual(f.keys('10/8〜10'),['--10-10','--10-09','--10-08']);
 for(const label of ['2026/10/31〜2','2026/12/31〜1/2','12/31〜1/2','2026/10/19〜18','2026/10/19〜','2026/10/19〜翌日'])assert.deepEqual(f.keys(label),[],label);
});
test('invalid dates and malformed compound expressions do not produce partial dates',()=>{
 const f=fixture();
 for(const label of ['1999/10/19','2100/10/19','2026/2/29','2026/2/30','2026/13/1','2026/0/1','2026/10/0','2026/10/19・32','2026/10/19・2026/2/30','2026/10/19・','2026/10/19/','2026/10/199','2026/10/19 2026/10/20'])assert.deepEqual(f.keys(label),[],label);
 assert.deepEqual(f.keys('2028/2/28〜3/1'),['2028-03-01','2028-02-29','2028-02-28']);
});
test('editing the real session date takes precedence over linked schedule and saved folder metadata',()=>{
 const f=fixture(),song={id:'song',recSession:{label:'2026/11/2・3',displayLabel:'2028/12/31',folderDate:'2029/1/1',folderless:true}};
 f.S.plan.slots=[{songId:'song',date:'2026-10-19',day:'10/19'}];
 assert.deepEqual(f.dates(song).map(x=>x.key),['2026-11-03','2026-11-02']);
 song.recSession.label='2026/11/4';assert.deepEqual(f.dates(song).map(x=>x.key),['2026-11-04']);
});
test('schedule fallback links exact song IDs, deduplicates members and only uses a validated explicit year',()=>{
 const f=fixture(),song={id:'song',recSession:{label:'10/1'}};
 f.S.plan={year:2026,songIds:['song'],slots:[{songId:'song',date:'2026-10-19',day:'10/19'},{songId:'song',date:'2026-10-19',day:'10/19'},
  {songId:'song',day:'10/20'},{songId:'other',date:'2028-12-31'},{date:'2029-12-31'},
  {songId:'song',date:'2026-02-30',day:'10/21'},{songId:'song',date:'bad',day:'10/22'},{songId:'song',day:'2/30'}]};
 assert.deepEqual(f.dates(song).map(x=>x.key),['2026-10-20','2026-10-19']);
 f.S.plan.slots=[{songId:'song',day:'10/20'}];delete f.S.plan.year;
 assert.deepEqual(f.dates(song),[{key:'--10-01',label:'10/01（年未設定）',date:{year:null,month:10,day:1}}]);
});
test('legacy classification supplies dates while arbitrary display folders and creation times do not',()=>{
 const f=fixture();f.S.groups=[{id:'g',name:'Artist（2026/10/8・9 REC）'}];
 assert.deepEqual(f.dates({id:'legacy',groupId:'g'}).map(x=>x.key),['2026-10-09','2026-10-08']);
 assert.deepEqual(f.dates({id:'folder',folder:'Artist 2026/10/12'}).map(x=>x.key),['2026-10-12']);
 assert.deepEqual(f.dates({id:'unknown',at:Date.now(),recSession:{displayLabel:'2026/10/19',folderDate:'2026/10/20'}}),[{key:'undated',label:'日付未設定',date:null}]);
});
test('song entries sort latest known date first, then timestamp and original later position without mutating input',()=>{
 const f=fixture(),song=(id,label,fields={})=>({id,recSession:{label},...fields});
 const list=[song('older','2025/12/31'),song('yearless','12/31'),song('same-a','2026/1/1'),song('same-b','2026/1/1'),song('import','2026/1/1',{at:100,impAt:300}),song('created','2026/1/1',{at:200}),song('unknown','日付未設定',{at:999999}),song('multi','2026/10/19・20')];
 const before=JSON.stringify(list),state=JSON.stringify(f.S),entries=f.c.recordingBrowseEntries(list);
 assert.deepEqual(clone(entries).map(x=>x.song.id),['multi','import','created','same-b','same-a','older','yearless','unknown']);
 assert.equal(entries[0].song,list[7]);assert.equal(JSON.stringify(list),before);assert.equal(JSON.stringify(f.S),state);
});
test('day groups display one song reference on each confirmed day without duplicating songs for multiple members',()=>{
 const f=fixture(),song={id:'multi',title:'Synthetic',recSession:{label:'2026-10-19・2026-10-20'}},other={id:'other',recSession:{label:'2026/10/19'}};
 f.S.plan.slots=Array.from({length:9},(_,i)=>({songId:'multi',date:i<4?'2026-10-19':'2026-10-20'}));
 const list=[song,other,song],before=JSON.stringify({list,S:f.S}),groups=f.c.recordingBrowseDateGroups(list);
 assert.deepEqual(clone(groups).map(g=>({key:g.key,ids:g.songs.map(x=>x.id)})),[{key:'2026-10-20',ids:['multi']},{key:'2026-10-19',ids:['multi','other']}]);
 assert.equal(groups[0].songs[0],song);assert.equal(JSON.stringify({list,S:f.S}),before);
});
