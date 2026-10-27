'use strict';
const {createHash}=require('node:crypto');
const U=require('../recording-preparation-update.js');
const clone=v=>JSON.parse(JSON.stringify(v)),digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function fixture(){
 const line=(id,t,parts=['p1'])=>({id,t,parts,main:parts,extra:[],sec:'1A',bars:1});
 const song={id:'dot-song',groupId:'dot-group',title:'合成REC曲',recArtist:'合成歌手',roster:['p1','p2'],blocks:{A:['p1'],B:['p2']},lines:[line('row-a','合成の歌詞😀'),line('row-b','残す指摘'),line('row-c','合成の最後')]};
 const slot=(id,name,at,day='10/27',date='2026-10-27')=>({id,name,at,min:60,date,day,place:'合成会場',kind:'member',songId:song.id,memberId:id==='slot-1'?'p1':'p2'});
 const slots=[slot('slot-1','甲',600),{id:'break-1',name:'休憩',at:660,min:30,date:'2026-10-27',day:'10/27',place:'合成会場',kind:'break'},slot('slot-2','乙',690)];
 const packet={app:'utacheck-recording-addition',version:1,group:{id:'dot-group',name:'合成REC',nopub:true},members:[{id:'p1',name:'甲'},{id:'p2',name:'乙'}],roster:['甲','乙'],songs:[song],plan:{year:2026,timezone:'Asia/Tokyo',slots}};
 const anchor={id:'dot-addition',type:'recording-addition',packet,sha256:digest(packet)};
 const before=U.snapshot(anchor),after=clone(before);
 after.songs[0].lines[0].t='差し替えた歌詞😀';after.songs[0].lines[2].parts=['p2'];after.songs[0].lines[2].main=['p2'];
 after.slots=[{...after.slots[2],at:720,min:90,date:'2026-10-28',day:'10/28'},{...after.slots[1],id:'break-2',songId:song.id,at:810,min:60,date:'2026-10-28',day:'10/28'}, {...after.slots[0],at:870,min:45,date:'2026-10-28',day:'10/28'}];
 const update={app:'utacheck-recording-update',version:1,sessionId:'dot-session',revision:1,groupId:'dot-group',timezone:'Asia/Tokyo',anchor:{id:anchor.id,sha256:anchor.sha256},previous:{id:anchor.id,sha256:anchor.sha256},before,after,source:{revision:'dot-source-2',files:[{name:'synthetic.xlsx',sha256:'a'.repeat(64)}]}};
 const operation={id:'dot-update-1',type:'recording-update',packet:update,sha256:digest(update)};
 const state={groups:[packet.group,{id:'live-group',name:'公開',gistId:'keep-gist',key:'keep-key'}],shows:[{id:'live-show',groupId:'live-group',name:'合成LIVE公演'}],songs:[{id:'live-song',showId:'live-show',title:'合成LIVE',lines:[line('live-row','LIVE保持')]}],members:clone(packet.members),rsongs:[clone(song)],plan:clone(packet.plan),privatePreparations:{[anchor.id]:{type:anchor.type,sha256:anchor.sha256,at:1}},notes:[{id:'note',showId:'live-show',tags:[],memberIds:['p1'],songId:song.id,lineIdx:1,lineEnd:null,from:0,to:1,memo:'指摘を保持',audio:'clip'}],pubNotes:[],draws:{},recs:{clip:{id:'keep-original-audio'}},autoPub:true,ghToken:'qa-never-transmit',bkGistId:'keep-backup',unrelated:{keep:true}};
 state.plan.slots[0].a0=601;state.plan.slots[0].a1=659;state.plan.slots[0].takes={'1A':3};state.plan.slots[0].secLog={'1A':{done:true}};state.rsongs[0].lines[1].lyricBreaks=[2];state.rsongs[0].lines[1].recBarOverrides=[{at:2,bars:3,sec:'Rap'}];state.rsongs[0].intro=3;
 const manifest={app:'utacheck-private-preparation',version:1,owner:'gogojoe312-max',revision:'qa-dot-2',createdAt:'2026-10-27T00:00:00Z',operations:[anchor,operation]};
 return {state,anchor,operation,manifest,update};
}
module.exports={fixture,clone,digest};
