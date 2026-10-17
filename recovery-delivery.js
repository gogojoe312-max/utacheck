/* Existing-destination recovery only. General recovery network hold stays enabled. */
(function(root){
  'use strict';
  const MAX=20*1024*1024;
  let session=null,turn=0,pushing=false;
  const copy=value=>JSON.parse(JSON.stringify(value));
  const fail=code=>{const e=new Error(code);e.reconnectCode=code;throw e;};
  function message(error){
    const code=error?.reconnectCode||error?.recoveryDeliveryCode||error?.inspectionCode
      ||(['state-format','lyric-format','lyric-reference'].includes(error?.message)?error.message:null);
    const messages={
      'source-changed':'配信先に新しい変更があります。上書きせず停止しました。',
      'encrypted':'既存の配信は暗号化されています。この再接続では変更していません。',
      'auth':'既存トークンの有効性・Gist権限を確認できません。新規発行はしていません。',
      'local-changed':'端末の内容が変わったため停止しました。もう一度内容を確認してください。',
      'storage':'原本保全と保存の確認ができないため、配信していません。',
      'state-format':'端末データの保存形式を確認できないため停止しました。公演照合後の形式確認で、配信・設定は変更していません。',
      'lyric-format':'端末内の歌詞行の保存形式を確認できないため停止しました。配信・設定は変更していません。',
      'lyric-reference':'端末内の歌詞の参照先を確認できないため停止しました。配信・設定は変更していません。',
      'unknown':'送信結果が未確認です。自動再送せず、結果確認を待っています。',
      'cancelled':'確認を中止しました。配信・設定は変更していません。',
      'not-ready':'録音や入力・保存を終えてから再接続してください。',
      'packet':'接続対応ファイルを選択してください。公演・指摘の救出ファイルとは別のファイルです。',
      'packet-invalid':'接続対応ファイルの種類・形式を確認できません。公演・指摘の救出ファイルとは別のファイルを選んでください。',
      'packet-version':'この接続ファイルは旧版です。最新の確認済み接続ファイルを選んでください。旧版では配信を再開しません。',
      'saved-missing':'この端末に確認できる接続情報がありません。接続ファイルを使う方法で確認してください。',
      'saved-selection':'確認する配信先を選択してください。ほかの配信先は変更しません。',
      'saved-unfinished':'送信中または保存確認中の接続です。この確認では変更していません。',
      'saved-mismatch':'端末と配信済みの内容がすべて一致していないため停止しました。上書きや接続情報の変更はしていません。',
      'source-receipt-missing':'必要な公演の救出情報が、この端末にまだありません。先に公演・指摘の救出ファイルを追加してください。',
      'source-receipt-mismatch':'対応する公演の救出情報が、この端末にないか別の版です。先に対応する公演・指摘の救出ファイルを追加してください。トークンの形式エラーではありません。',
      'group-name-mismatch':'復旧したグループ名が接続ファイルと一致しません。別グループには送信していません。',
      'source-show-set-mismatch':'端末の公演の組み合わせが接続ファイルと一致しません。送信せず、元の内容を保持しています。',
      'data-limit':'元資料も含むデータ量が確認上限を超えたため、削除・送信せず停止しました。',
      'unsafe-data':'保存データまたは接続ファイルの形式を安全に確認できません。送信・設定変更はしていません。',
      'unsafe-key':'接続ファイルに安全に扱えない項目があるため停止しました。送信・設定変更はしていません。',
      'target':'接続ファイルと元の配信先が一致しません。別の配信先には送信していません。',
      'remote':'GitHubから元の配信内容を読み取れませんでした。送信・設定変更はしていません。',
    };
    const prefix=code==='source-receipt-mismatch'&&Number.isSafeInteger(error.targetNumber)&&error.targetNumber>0&&error.targetNumber<=100?'接続対象'+error.targetNumber+'：':'';
    return prefix+(messages[code]||'元の配信先・公演の対応または形式を確認できません。配信・設定は変更していません。')+(code==='saved-mismatch'&&error.reconnectDetail?'\n\n'+error.reconnectDetail:'');
  }
  function ready(){return typeof S!=='undefined'&&startupRecoveryNetworkHold&&recordingInboxCanWrite()&&!VIEW()&&!preview&&!document.hidden;}
  function currentBinding(gid){return S.recoveryDelivery?.version===2&&Array.isArray(S.recoveryDelivery.targets)?S.recoveryDelivery.targets.find(t=>t.groupId===gid):null;}
  function singleOwner(){return typeof S.deviceId==='string'&&!!S.deviceId&&S.deliveryOwnerDeviceId===S.deviceId;}
  function canPublish(gid){const b=currentBinding(gid),g=S.groups.find(g=>g.id===gid);return ready()&&!session&&!!S.ghToken&&!!b&&b.status==='ready'&&!!g&&!g.nopub&&g.gistId===b.gistId&&g.src===b.src;}
  // Preview is a token-free read of an already bound destination, even while sending is held.
  // It never clears the recovery hold or uses the publication transport.
  async function readPreview(src){
    if(!ready()||session||pushing||publishInFlight||REC||(typeof recordingFinalizePending!=='undefined'&&recordingFinalizePending)||(typeof recordingStartPending!=='undefined'&&recordingStartPending)||(typeof pitchStartPending!=='undefined'&&pitchStartPending)||(typeof PT!=='undefined'&&PT.on)||(typeof micStream!=='undefined'&&micStream))fail('not-ready');
    const canonical=gistRawSource(src);
    const matches=(S.recoveryDelivery?.version===2?S.recoveryDelivery.targets:[]).filter(t=>t.src===src);
    if(!canonical||canonical.url!==src||matches.length!==1)fail('target');
    const target=matches[0],g=S.groups.find(g=>g.id===target.groupId);
    if(!g||g.src!==src||g.gistId!==target.gistId||canonical.id!==target.gistId)fail('target');
    const snapshot=JSON.stringify(S),viewSnapshot=JSON.stringify(U),active=()=>ready()&&!session&&!pushing&&!publishInFlight&&!REC&&!(typeof recordingFinalizePending!=='undefined'&&recordingFinalizePending)&&!(typeof recordingStartPending!=='undefined'&&recordingStartPending)&&!(typeof pitchStartPending!=='undefined'&&pitchStartPending)&&!(typeof PT!=='undefined'&&PT.on)&&!(typeof micStream!=='undefined'&&micStream)&&JSON.stringify(S)===snapshot&&JSON.stringify(U)===viewSnapshot;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
    try{
      const options={method:'GET',headers:{},cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal};
      let raw;
      try {
        const response=await fetch(src,options);
        if(!active())fail('local-changed');
        if(!response.ok)fail('remote');
        raw=await response.text();
      } catch(error) {
        // Latest raw Gist URLs can redirect. Resolve only this already-bound Gist,
        // without credentials; never follow an arbitrary redirect or retry a denial.
        if(error.reconnectCode||controller.signal.aborted)throw error;
        if(!active())fail('local-changed');
        const response=await fetch('https://api.github.com/gists/'+canonical.id,options);
        if(!active())fail('local-changed');
        if(!response.ok)fail('remote');
        const metadataRaw=await response.text();
        if(!active())fail('local-changed');
        if(new TextEncoder().encode(metadataRaw).length>MAX*2)fail('remote');
        const metadata=JSON.parse(metadataRaw),file=metadata?.files?.['utacheck.json'];
        const resolved=gistRawSource(file?.raw_url);
        if(metadata?.id!==canonical.id||!resolved||resolved.url!==canonical.url)fail('target');
        if(!file.truncated&&typeof file.content==='string')raw=file.content;
        else {
          const pinned=new URL(file.raw_url);
          if(pinned.search||pinned.hash||!/^\/[A-Za-z0-9_-]+\/[a-f0-9]{5,40}\/raw\/[a-f0-9]{40}\/utacheck\.json$/i.test(pinned.pathname))fail('target');
          const dataResponse=await fetch(pinned.href,options);
          if(!active())fail('local-changed');
          if(!dataResponse.ok)fail('remote');
          raw=await dataResponse.text();
        }
      }
      if(!active())fail('local-changed');
      if(new TextEncoder().encode(raw).length>MAX)fail('remote');
      const data=JSON.parse(raw);
      if(data?.enc)fail('encrypted');
      if(!data||data.groupName!==target.groupName||!Array.isArray(data.songs)||!data.songs.length||!Array.isArray(data.shows))fail('target');
      return data;
    }catch(e){if(e.reconnectCode)throw e;fail('remote');}
    finally{clearTimeout(timer);}
  }
  // Read-only summaries contain names, counts and categories, never source URLs or credentials.
  function heldDifferenceSummary(target,remote,local){
    const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
    const source=show=>show.recoveredSourceShowId||show.id;
    const records=(data,field,indexes)=>(data[field]||[]).filter(row=>indexes.includes(row.songIdx)).map(row=>{
      const next={...row,songIdx:indexes.indexOf(row.songIdx)};delete next.showId;return next;
    });
    const details=(data,show)=>{
      const indexes=[];data.songs.forEach((song,i)=>{if(song.showId===show.id)indexes.push(i);});
      const entries=indexes.map(i=>data.lib?.[data.songs[i].libIdx]);
      if(entries.some(entry=>!entry||!Array.isArray(entry.lines)))return null;
      return {titles:entries.map(entry=>entry.title),lyrics:entries.map(entry=>entry.lines.map(row=>row[1])),
        parts:entries.map(entry=>({groups:entry.groups||{},order:entry.order||[],sections:entry.sections||[],lyricBreaks:(entry.lyricBreaks||[]).slice().sort((a,b)=>a.lineIdx-b.lineIdx),groupRows:entry.groupRows||[],lines:entry.lines.map(row=>row.map((cell,i)=>i===1?null:cell))})),
        notes:records(data,'notes',indexes),memos:records(data,'memos',indexes),subs:records(data,'subs',indexes),gsubs:records(data,'gsubs',indexes)};
    };
    return (target.heldLocalShowIds||[]).map(id=>{
      const own=local.shows.filter(show=>show.id===id),base=S.shows.find(show=>show.id===id);
      const label=String(own[0]?.name||base?.name||'名称未確認').slice(0,160);
      if(own.length!==1||local.shows.filter(show=>source(show)===source(own[0])).length!==1)return {name:label,status:'照合できません（端末の配信対象外または公演対応未確定）'};
      const matches=remote.shows.filter(show=>source(show)===source(own[0]));
      if(matches.length!==1)return {name:label,status:'照合できません（配信済み公演の対応が一意ではありません）'};
      const left=details(local,own[0]),right=details(remote,matches[0]);
      if(!left||!right)return {name:label,status:'照合できません（曲の参照情報が不足しています）'};
      const changed=[];const sameSequence=stable(left.titles)===stable(right.titles),sameOrder=sameSequence&&new Set(left.titles).size===left.titles.length;
      if(!sameSequence)changed.push('曲数・曲順・曲名');
      if(sameOrder) {
        if(stable(left.lyrics)!==stable(right.lyrics))changed.push('歌詞');
        if(stable(left.parts)!==stable(right.parts)||stable(left.subs)!==stable(right.subs)||stable(left.gsubs)!==stable(right.gsubs))changed.push('歌割・区切り');
        if(stable(left.notes)!==stable(right.notes))changed.push('指摘');
        if(stable(left.memos)!==stable(right.memos))changed.push('総括');
      }
      const metadata=show=>({name:show.name,folder:show.folder||'',absent:show.absent||[],ts:show.ts??null});
      if(stable(metadata(own[0]))!==stable(metadata(matches[0])))changed.push('公演情報');
      return {name:label,status:changed.length?'相違：'+changed.join('・'):!sameOrder?'曲対応を一意に照合できません（同名曲を含むため個別比較は保留）':'表示対象の比較項目は一致。曲情報・引継ぎなど他の設定差分は未比較（保留は解除していません）',
        counts:'手元：'+left.titles.length+'曲・指摘'+left.notes.length+'件 ／ 配信済み：'+right.titles.length+'曲・指摘'+right.notes.length+'件',
        note:sameOrder?'':'曲対応が未確定のため、歌詞・指摘などの個別比較は保留しています。'};
    });
  }
  let differenceBusy=false;
  async function inspectHeldDifferences(gid){
    if(differenceBusy)return;
    const el=document.getElementById('rd-difference-'+gid),button=document.getElementById('rd-difference-button-'+gid);
    if(!el)return;differenceBusy=true;if(button)button.disabled=true;
    const before=JSON.stringify(S),viewBefore=JSON.stringify(U);
    const target=currentBinding(gid),g=S.groups.find(item=>item.id===gid);
    try{
      if(!target||!g||!target.heldLocalShowIds?.length)fail('target');
      el.textContent='配信済みの内容と手元を比較しています…';
      const remote=await readPreview(g.src);
      if(JSON.stringify(S)!==before||JSON.stringify(U)!==viewBefore)fail('local-changed');
      const local=payloadFor(copy(S),gid),rows=heldDifferenceSummary(target,remote,local);
      el.textContent=rows.map(row=>row.name+'\n'+row.status+(row.counts?'\n'+row.counts:'')+(row.note?'\n'+row.note:'')).join('\n\n')+'\n\n読取のみです。変更の採用・送信・保留解除はしていません。';
      return rows;
    }catch(error){el.textContent=error?.reconnectCode==='local-changed'?'確認中に手元の内容が変わりました。入力後にもう一度確認してください。':'差分を読み取れませんでした。手元の歌詞・指摘と現在の配信は変更していません。';}
    finally{differenceBusy=false;if(button)button.disabled=false;}
  }
  function pending(gid){if(!canPublish(gid))return false;const g=S.groups.find(g=>g.id===gid);try{return g.publishKeyPending||payloadKey(payloadFor(S,gid))!==g.lastKey;}catch(_){return true;}}
  function hasResumed(){return ready()&&!session&&(S.recoveryDelivery?.targets||[]).some(t=>canPublish(t.groupId));}
  function packetForBindings(gid){return {app:'utacheck-existing-delivery',version:2,targets:S.recoveryDelivery.targets.filter(t=>!gid||t.groupId===gid).map(t=>{
    const {sourceSha256,groupName,gistId,src,sourceShowIds,expectedRemoteSha256}=t;return {sourceSha256,groupName,gistId,src,sourceShowIds,expectedRemoteSha256};
  })};}
  function savedTargets(){
    const delivery=S.recoveryDelivery;
    if(delivery?.version!==2||!Array.isArray(delivery.targets)||!delivery.targets.length)fail('saved-missing');
    const groups=new Set(),gists=new Set(),sources=new Set();
    for(const t of delivery.targets){
      if(!t||typeof t.groupId!=='string'||!t.groupId||typeof t.gistId!=='string'||!t.gistId||typeof t.src!=='string'||!t.src
        ||!['ready','blocked','uncertain','sending','prepared'].includes(t.status)
        ||groups.has(t.groupId)||gists.has(t.gistId.toLowerCase())||sources.has(t.src))fail('target');
      groups.add(t.groupId);gists.add(t.gistId.toLowerCase());sources.add(t.src);
    }
    return delivery.targets.filter(t=>t.status!=='ready');
  }
  function savedTarget(gid){
    if(!gid)fail('saved-selection');
    const matches=savedTargets().filter(t=>t.groupId===gid);
    if(matches.length!==1)fail('target');
    const target=matches[0],groups=S.groups.filter(g=>g.id===gid);
    if(groups.length!==1||groups[0].name!==target.groupName||groups[0].gistId!==target.gistId||groups[0].src!==target.src)fail('target');
    if(['sending','prepared'].includes(target.status))fail('saved-unfinished');
    return target;
  }
  function verifySavedMatch(binding,target,remote,local,merged){
    const sameSet=(left,right)=>Array.isArray(left)&&Array.isArray(right)&&new Set(left).size===left.length&&new Set(right).size===right.length
      &&left.length===right.length&&left.every(value=>right.includes(value));
    const remoteById=new Map(remote.shows.map(show=>[show.id,show]));
    const equivalent=merged.equivalentRemoteShowIds;
    const sources=equivalent.map(id=>{const show=remoteById.get(id);return show&&(show.recoveredSourceShowId||show.id);});
    const remoteOnly=remote.shows.filter(show=>!equivalent.includes(show.id)).map(show=>show.id);
    // A fresh digest is acceptable only after proving every owned performance
    // already exists with identical checked content. Unknown additions, edits,
    // or removed protected performances require the explicit file workflow.
    const contentMismatch=merged.heldLocalShowIds.length||!sameSet(sources,target.sourceShowIds)||!sameSet(merged.managedLocalShowIds,target.showIds)
      ||!sameSet(merged.preservedShowIds,remoteOnly)||!Array.isArray(binding.preservedShowIds)
      ||new Set(binding.preservedShowIds).size!==binding.preservedShowIds.length||binding.preservedShowIds.some(id=>!remoteById.has(id))
      ||!sameSet(remoteOnly,binding.preservedShowIds.filter(id=>!equivalent.includes(id)));
    // Show equality does not compare the destination's formal membership.
    // Require that known roster to agree and prohibit participant expansion.
    const rosterMismatch=JSON.stringify(local.rosters)!==JSON.stringify(remote.rosters)
      ||JSON.stringify(merged.payload.rosters)!==JSON.stringify(remote.rosters)
      ||JSON.stringify(merged.payload.members)!==JSON.stringify(remote.members);
    if(contentMismatch||rosterMismatch){
      // Explain the rejected comparison without changing either copy. This is
      // owner-only text, with no lyrics, credentials or private staff memos.
      const rows=heldDifferenceSummary({heldLocalShowIds:merged.heldLocalShowIds},remote,local),details=[];
      for(let i=0;i<Math.min(rows.length,30);i++){
        const row=rows[i],localShow=local.shows.find(sw=>sw.id===merged.heldLocalShowIds[i]),source=localShow&&(localShow.recoveredSourceShowId||localShow.id);
        const remoteShow=remote.shows.find(sw=>(sw.recoveredSourceShowId||sw.id)===source);
        const folder=localShow&&remoteShow&&(localShow.folder||'')!==(remoteShow.folder||'')
          ?'\nフォルダ　手元「'+String(localShow.folder||'未分類').slice(0,160)+'」／配信済み「'+String(remoteShow.folder||'未分類').slice(0,160)+'」':'';
        details.push(row.name+'\n'+row.status+folder+(row.counts?'\n'+row.counts:''));
      }
      if(rows.length>30)details.push('ほか'+(rows.length-30)+'公演に相違があります。');
      if(contentMismatch&&!rows.length)details.push('対象公演または配信済みの保護公演の組み合わせが一致しません。');
      if(rosterMismatch)details.push('配信先の名簿または参加者の内容・並びが一致しません。');
      const error=new Error('saved-mismatch');error.reconnectCode='saved-mismatch';error.reconnectDetail=details.join('\n\n');throw error;
    }
  }
  function proposeSavedAlignment(state,binding,target,remote,local,merged){
    // Offer changes only to a previously held performance at this same bound
    // destination. Existing exact comparison remains the final acceptance test.
    if(!merged.heldLocalShowIds.length||!Array.isArray(binding.heldLocalShowIds)||typeof buildSong!=='function')return null;
    const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
    const same=(a,b)=>stable(a)===stable(b),source=show=>show.recoveredSourceShowId||show.id;
    const next=copy(state),changes=[];
    for(const id of merged.heldLocalShowIds){
      if(!binding.heldLocalShowIds.includes(id))return null;
      const own=local.shows.filter(show=>show.id===id),editor=next.shows.filter(show=>show.id===id);
      if(own.length!==1||editor.length!==1)return null;
      const others=remote.shows.filter(show=>source(show)===source(own[0]));
      if(others.length!==1||!binding.preservedShowIds?.includes(others[0].id))return null;
      const prior=others[0],localSongs=local.songs.filter(song=>song.showId===id),remoteSongs=remote.songs.filter(song=>song.showId===prior.id),
        editorSongs=next.songs.filter(song=>song.showId===id);
      if(!localSongs.length||localSongs.length!==remoteSongs.length||localSongs.length!==editorSongs.length)return null;
      const change={showId:id,name:own[0].name,fromFolder:own[0].folder||'',toFolder:prior.folder||'',rosterAdditions:[]};
      if(change.fromFolder!==change.toFolder)editor[0].folder=change.toFolder;
      for(let i=0;i<localSongs.length;i++){
        const left=local.lib[localSongs[i].libIdx],right=remote.lib[remoteSongs[i].libIdx];
        if(!left||!right)return null;
        if(same(left.order||[],right.order||[]))continue;
        if(!same({...left,order:undefined},{...right,order:undefined}))return null;
        const oldOrder=left.order||[],newOrder=right.order||[];
        if(new Set(oldOrder).size!==oldOrder.length||new Set(newOrder).size!==newOrder.length
          ||newOrder.length<=oldOrder.length||!oldOrder.every((name,index)=>newOrder[index]===name))return null;
        // Use the real reader with deterministic, isolated identity providers.
        // It must produce the same complete song, not only the same lyric text.
        const providers={addMember:name=>({id:'existing-name:'+name,name}),uid:()=> 'existing-song'};
        if(!same(buildSong(copy(left),providers),buildSong(copy(right),providers)))return null;
        const song=editorSongs[i],members=new Map(),domain=new Set([
          ...(song.roster||[]),...Object.values(song.blocks||{}).flat(),...(song.lines||[]).flatMap(line=>line.parts||[])]);
        for(const mid of domain){
          const known=next.members.filter(member=>member.id===mid);if(known.length!==1)return null;
          const name=known[0].name;if(members.has(name)&&members.get(name)!==mid)return null;members.set(name,mid);
        }
        const addedNames=newOrder.slice(oldOrder.length),addedIds=addedNames.map(name=>members.get(name));
        if(addedIds.some(mid=>!mid)||new Set(addedIds).size!==addedIds.length||addedIds.some(mid=>(song.roster||[]).includes(mid)))return null;
        song.roster=[...(song.roster||[]),...addedIds];
        change.rosterAdditions.push({songId:song.id,title:song.title,names:addedNames});
      }
      if(change.fromFolder===change.toFolder&&!change.rosterAdditions.length)return null;
      changes.push(change);
    }
    const expected=copy(state);
    for(const change of changes){
      if(change.fromFolder!==change.toFolder)expected.shows.find(show=>show.id===change.showId).folder=change.toFolder;
      for(const row of change.rosterAdditions)expected.songs.find(song=>song.id===row.songId).roster=copy(next.songs.find(song=>song.id===row.songId).roster);
    }
    const aligned=payloadFor(next,target.groupId),verified=RecoveryDeliveryScope.mergePublication(target,remote,aligned);
    // This also rejects unknown/missing remote shows, additions, changed notes,
    // lyrics, takes, ancestry, membership, and any still-held performance.
    verifySavedMatch(binding,target,remote,aligned,verified);
    if(!same(expected,next))return null;
    return {state:next,local:aligned,merged:verified,changes};
  }
  function alignmentHTML(changes){
    const rosterHTML=rows=>{
      const groups=new Map();
      for(const row of rows){
        const key=JSON.stringify([row.title,row.names]),prior=groups.get(key);
        if(prior)prior.count++;else groups.set(key,{title:row.title,names:row.names,count:1});
      }
      return [...groups.values()].map(row=>'<p class="note">'+h(row.title)+(row.count>1?'（'+row.count+'件）':'')+'：曲の表示名簿の末尾に '+row.names.map(h).join('、')+' を追加（歌詞の担当に存在する名前）</p>').join('');
    };
    return changes?.length?'<div class="card"><b>手元の表示を配信済みに合わせる確認</b><p class="note">歌詞・指摘・総括・公演と曲の対応が一致することを確認しました。次のフォルダ・曲の表示名簿だけを合わせると再開できます。変更前の端末原本は保全します。</p>'+changes.map((change,i)=>'<label class="organize-field"><span><input id="rd-alignment-'+i+'" type="checkbox"> '+h(change.name)+'：以下の表示変更を確認しました。</span></label>'+ (change.fromFolder!==change.toFolder?'<p class="note">フォルダ「'+h(change.fromFolder||'未分類')+'」→「'+h(change.toFolder||'未分類')+'」</p>':'')+rosterHTML(change.rosterAdditions)).join('')+'</div>':'';
  }
  function payloadFor(state,gid){const old=S;try{S=state;const data=copy(publicationData(gid,undefined,true));data.folderOrder=(data.folderOrder||[]).filter(name=>data.shows.some(sw=>sw.folder===name));for(const sw of data.shows)if(sw.from&&!data.shows.some(item=>item.id===sw.from))delete sw.from;if(data.alert?.to?.length)data.alert.to=[gid];return data;}finally{S=old;}}
  async function request(url,token,opts={},active=()=>true){
    if(!active())fail('cancelled');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
    try{
      const response=await fetch(url,{...opts,cache:'no-store',redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal,
        headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(token?{Authorization:'Bearer '+token}:{}),...(opts.headers||{})}});
      if(!active())fail('cancelled');
      if(!response.ok){if(response.status===401||response.status===403)fail('auth');fail('remote');}
      const text=await response.text();if(!active())fail('cancelled');if(new TextEncoder().encode(text).length>MAX*2)fail('remote');return text;
    }catch(e){if(e.reconnectCode)throw e;fail(active()?'remote':'cancelled');}
    finally{clearTimeout(timer);}
  }
  async function readTarget(target,token,active){
    const gist=JSON.parse(await request('https://api.github.com/gists/'+target.gistId,token,{},active));
    if(gist.id!==target.gistId||gist.public!==false||!gist.files?.['utacheck.json'])fail('target');
    const file=gist.files['utacheck.json'],source=gistRawSource(file.raw_url);
    if(!source||source.id!==target.gistId||source.url!==target.src)fail('target');
    let raw=file.content;
    if(file.truncated||typeof raw!=='string'){
      const url=new URL(file.raw_url),want=new URL(target.src);
      if(url.origin!==want.origin||url.username||url.password||url.port||url.search||url.hash
        ||!new RegExp('^/'+want.pathname.split('/')[1]+'/'+target.gistId+'/raw/(?:[a-f0-9]{40}/)?utacheck\\.json$','i').test(url.pathname))fail('target');
      raw=await request(url.href,'',{},active);
    }
    if(new TextEncoder().encode(raw).length>MAX)fail('remote');
    const data=JSON.parse(raw);if(data?.enc)fail('encrypted');
    const digest=await backupDigest(raw);if(!active())fail('cancelled');
    return {raw,data,digest};
  }
  function summaryHTML(plan,payloads,merges){return plan.targets.map((t,i)=>{
    const p=payloads[i],m=merges[i],managed=m.managedLocalShowIds.length;return '<div class="card"><b>'+h(t.groupName)+'</b><p class="note">既存の配信先：'+h(t.gistId)+'<br>公演'+p.shows.length+'件・曲'+p.songs.length+'件・指摘'+p.notes.length+'件</p><details><summary>対象の公演を見る（'+p.shows.length+'公演）</summary><ul style="padding-left:20px">'+p.shows.map(sw=>'<li>'+h(sw.name)+'</li>').join('')+'</ul></details><p class="note">端末の復旧対象公演の「配信しない」を解除します。スタッフ個人メモ・REC・保管資料は対象外です。</p><p class="note">確認後の新しい指摘を反映する公演：'+managed+'件。</p>'+ (m.preservedShowNames.length?'<p class="note">現配信のまま保持：'+m.preservedShowNames.map(h).join('、')+'。同じ公演の端末版差分は上書きせず保留します。</p>':'<p class="note">配信済みの内容と一致しています。確認後の新しい指摘も既存の配信先に反映します。</p>')+'</div>';
  }).join('');}
  function settingsHTML(){
    if(!startupRecoveryNetworkHold||VIEW())return '';
    const targets=S.recoveryDelivery?.targets||[],legacy=S.recoveryDelivery?.version!==2,pending=targets.some(t=>t.status!=='ready');
    return '<div class="card"><b>既存の配信先に再接続</b><p class="note">元の配信先と対象公演を確認して再開します。新しい配信先は作りません。</p>'+
      '<button class="primary" data-act="rd-open">既存の配信先に再接続</button>'+
      (targets.length?'<p class="note">'+targets.map(t=>h(t.groupName)+'：'+(legacy?'接続ファイルの更新が必要':t.status==='ready'?'既存先の配信を再開済み':t.status==='blocked'?'自動で配信先を再確認中'+(t.lastFailure?'（'+h(t.lastFailure)+'）':''):t.status==='prepared'?'接続設定の保存確認待ち':'送信結果の確認待ち')).join('<br>')+'</p>'+targets.filter(t=>t.heldLocalShowIds?.length).map(t=>'<p class="note">'+h(t.groupName)+'：'+t.heldLocalShowIds.length+'公演の端末版差分を保留中</p><button class="ghost" id="rd-difference-button-'+h(t.groupId)+'" data-act="rd-differences" data-id="'+h(t.groupId)+'">保留中の公演と差分を見る</button><p class="note" style="white-space:pre-wrap" id="rd-difference-'+h(t.groupId)+'" role="status"></p>').join(''):'')+
      (pending&&!legacy?'<button class="ghost" data-act="rd-reconcile">接続・送信結果を確認（再送しない）</button>':'')+'</div>';
  }
  function unlock(){const app=document.getElementById('app');if(app&&typeof recordingInboxCanWrite==='function')app.inert=!recordingInboxCanWrite();}
  function close(){if(session?.committing)return;turn++;if(session){session.token='';session.prepared=null;const input=session.node.querySelector('#rd-token');if(input)input.value='';session.node.remove();if(session.notice)session.notice.hidden=session.noticeHidden;session=null;}unlock();}
  function open(){
    if(!ready()||pushing||publishInFlight||saving||REC||(U.sheet&&sheetHasInput())){alert(message({reconnectCode:'not-ready'}));return;}
    close();const id=++turn,node=document.createElement('div');node.className='mask';
    let choices=[];try{choices=savedTargets();}catch(_){}
    const savedInfo=choices.length?'<p class="note">保存済みの接続情報を使います。端末と配信済みの公演がすべて一致する場合だけ、再開の確認に進みます。</p>'+
      '<label class="organize-field">確認する配信先<select id="rd-group" class="field">'+(choices.length>1?'<option value="">配信先を選択</option>':'')+choices.map(t=>'<option value="'+h(t.groupId)+'">'+h(t.groupName)+'</option>').join('')+'</select></label>'+
      '<p class="note">'+(S.ghToken?'保存済みの認証情報を使用します。':'保存済みの認証情報がありません。下の接続ファイルを使う方法で確認してください。')+'</p>'+
      '<button class="primary" data-act="rd-check-saved">保存済みの配信先を確認（ファイル不要）</button>':'';
    node.innerHTML='<div class="sheet organize-sheet" role="dialog" aria-modal="true" aria-label="既存配信の再接続"><div class="row"><b class="grow">既存配信の再接続</b><button class="chip" data-act="rd-close">閉じる</button></div>'+
      savedInfo+'<details'+(choices.length?'':' open')+'><summary>接続ファイルを使って確認</summary>'+
      '<p class="note">接続対応ファイルと既存の認証情報を使います。確認中は端末の設定を変更しません。</p>'+
      '<label class="organize-field">接続対応ファイル<input id="rd-file" class="field" type="file" accept=".json,application/json"></label>'+
      '<label class="organize-field">既存のGitHubトークン<input id="rd-token" class="field" type="password" autocomplete="off" placeholder="既存トークンをこの欄に入力"></label>'+
      '<p class="note">トークンをチャットに送らないでください。確認中はメモリだけで扱い、閉じると消します。</p>'+
      '<button class="primary" data-act="rd-check">既存の配信先を確認（送信なし）</button></details><p id="rd-status" class="note" role="status" style="white-space:pre-wrap"></p><div id="rd-preview"></div></div>';
    if(choices.length)node.querySelector('#rd-group').value=choices.length===1?choices[0].groupId:'';
    const notice=document.getElementById('recovery-network-notice');
    session={id,node,token:'',prepared:null,busy:false,committing:false,notice,noticeHidden:notice?.hidden};if(notice)notice.hidden=true;document.body.appendChild(node);document.getElementById('app').inert=true;
  }
  function status(text,atCommit=false){
    const el=session?.node.querySelector('#rd-status'),near=session?.node.querySelector('#rd-commit-status');
    if(el)el.textContent=text;if(near)near.textContent=text;
    if(atCommit)(near||el)?.scrollIntoView?.({block:'nearest'});
  }
  function controls(disabled){session?.node.querySelectorAll('[data-act="rd-check"],[data-act="rd-check-saved"],#rd-group,#rd-file,#rd-token').forEach(el=>el.disabled=disabled);}
  async function check(useSaved=false){
    const s=session;if(!s||s.busy||!ready())return;s.busy=true;s.prepared=null;controls(true);s.node.querySelector('#rd-preview').innerHTML='';
    const selectedGroup=useSaved?s.node.querySelector('#rd-group')?.value:'';
    let original,revision;
    const active=()=>session===s&&turn===s.id&&ready()&&(!useSaved||s.node.querySelector('#rd-group')?.value===selectedGroup)
      &&(original===undefined||JSON.stringify(S)===original&&stateRevision===revision);
    try{
      const file=s.node.querySelector('#rd-file').files?.[0];if(!useSaved&&(!file||file.size>128*1024))fail('packet');
      const input=s.node.querySelector('#rd-token');s.token=useSaved?(S.ghToken||''):(input.value.trim()||S.ghToken||'');input.value='';
      if(!s.token||/^github_pat_/.test(s.token))fail('auth');
      status('元の配信先を読み取っています。送信はしていません。');
      original=JSON.stringify(S);revision=stateRevision;
      let packet,binding,readOnce;
      if(useSaved){
        s.stage='scope';binding=savedTarget(selectedGroup);packet=packetForBindings(selectedGroup);
        const bound=RecoveryDeliveryScope.plan(S,packet);
        if(bound.targets.length!==1||bound.targets[0].groupId!==selectedGroup)fail('target');
        s.stage='remote';readOnce=await readTarget(bound.targets[0],s.token,active);
        // Only this in-memory proposal receives the observed digest. The
        // existing uncertain-send ledger remains intact until explicit commit.
        packet.targets[0].expectedRemoteSha256=readOnce.digest;
      }else{
        s.stage='file';const raw=await file.text();if(!active())fail('cancelled');packet=JSON.parse(raw);
      }
      s.stage='scope';
      const plan=RecoveryDeliveryScope.plan(S,packet),mergeTargets=plan.targets.map(t=>RecoveryDeliveryScope.extendForOwnedShows(plan.state,t)),
        localPayloads=plan.targets.map(t=>payloadFor(plan.state,t.groupId)),payloads=[],remotes=[],merges=[],alignments=[];
      for(let i=0;i<plan.targets.length;i++){
        s.stage='remote';const remote=useSaved?readOnce:await readTarget(plan.targets[i],s.token,active);
        if(remote.digest!==plan.targets[i].expectedRemoteSha256)fail('source-changed');
        // Keep the recovered-source receipt bounded; newly authored performances
        // extend only the checked payload, exactly as they do during later sends.
        s.stage='merge';let merged=RecoveryDeliveryScope.mergePublication(mergeTargets[i],remote.data,localPayloads[i]);
        if(useSaved)try{verifySavedMatch(binding,mergeTargets[i],remote.data,localPayloads[i],merged);}catch(error){
          if(error.reconnectCode!=='saved-mismatch')throw error;
          let proposal;try{proposal=proposeSavedAlignment(plan.state,binding,mergeTargets[i],remote.data,localPayloads[i],merged);}catch(_){}
          if(!proposal)throw error;
          plan.state=proposal.state;localPayloads[i]=proposal.local;merged=proposal.merged;alignments.push(...proposal.changes);
        }
        merges.push(merged);payloads.push(merged.payload);remotes.push(remote);
      }
      if(!active()||JSON.stringify(S)!==original||stateRevision!==revision)fail('local-changed');
      s.prepared={packet,plan,payloads,remotes,merges,original,revision,savedGroupId:useSaved?selectedGroup:null,alignments};
      const keepManual=!S.autoPub&&S.recoveryDelivery?.targets?.some(t=>!plan.targets.some(p=>p.groupId===t.groupId));
      s.node.querySelector('#rd-preview').innerHTML=alignmentHTML(alignments)+summaryHTML(plan,payloads,merges)+(keepManual?'<p class="note">ほかの配信設定を保持するため、端末全体の自動配信は停止のままです。今回確認した配信先へ送信します。</p>':'')+'<p class="note">別の端末が同時に送信すると、送信直前の確認だけでは競合を防ぎきれません。</p><label class="organize-field"><span><input id="rd-exclusive" type="checkbox"> 同じ配信先へのほかの端末・アプリの自動公開を止め、この端末だけを配信元にしました。</span></label><label class="organize-field"><span><input id="rd-approve" type="checkbox"> この既存先・対象公演を確認しました。既存トークンをこの端末に保存し、上記公演の'+(keepManual?'配信':'自動配信')+'を再開します。</span></label><button class="primary" data-act="rd-commit">この既存先だけ配信を再開</button><p id="rd-commit-status" class="note" role="status" style="white-space:pre-wrap"></p>';
      status('接続先と対象を確認できました。まだ送信・保存していません。');
    }catch(e){s.token='';s.prepared=null;if(session===s)status(({file:'ファイルの読取：',scope:'公演の対応確認：',remote:'配信先の読取：',merge:'配信内容の照合：'}[s.stage]||'')+message(e));}
    finally{if(session===s){s.busy=false;controls(false);}}
  }
  async function commit(){
    const s=session,p=s?.prepared;if(!s)return;
    if(s.busy){status('確認・保全を進めています。そのままお待ちください。',true);return;}
    if(!p){status('もう一度、上のボタンから配信先と対象公演を確認してください。まだ再開していません。',true);return;}
    if(!s.node.querySelector('#rd-approve')?.checked||!s.node.querySelector('#rd-exclusive')?.checked){status('上の2つの確認欄をチェックしてから、配信を再開してください。',true);return;}
    if(p.alignments.some((_,i)=>!s.node.querySelector('#rd-alignment-'+i)?.checked)){status('上の公演ごとの表示変更を確認してチェックしてください。まだ再開していません。',true);return;}
    s.busy=true;s.committing=true;controls(true);s.node.querySelectorAll('button').forEach(b=>b.disabled=true);
    status('再開前の確認を進めています。そのままお待ちください。',true);
    const active=()=>session===s&&turn===s.id&&ready()&&JSON.stringify(S)===p.original&&stateRevision===p.revision
      &&(!p.savedGroupId||s.node.querySelector('#rd-group')?.value===p.savedGroupId);
    let committed=false,release,sendTargets=[];
    try{
      release=recordingInboxAdmitWriter();
      if(!active())fail('local-changed');await saveNow();if(saveErr||!active())fail('storage');
      const slots=await Promise.all([idbGet('state:0'),idbGet('state:1')]),hold=await idbGet('recovery:network-hold:v1'),legacy=localStorage.getItem(KEY);
      for(let i=0;i<p.plan.targets.length;i++){
        const remote=await readTarget(p.plan.targets[i],s.token,active);if(remote.digest!==p.remotes[i].digest)fail('source-changed');
      }
      if(!active())fail('local-changed');
      const next=copy(p.plan.state);next.ghToken=s.token;
      const hasUnrelated=next.recoveryDelivery?.targets?.some(t=>!p.plan.targets.some(p=>p.groupId===t.groupId));
      if(!hasUnrelated)next.autoPub=true;
      if(hasUnrelated&&next.recoveryDelivery.version!==2)fail('packet-version');
      const reconnecting=new Map(p.plan.targets.map((t,i)=>[t.groupId,{...copy(t),preservedShowIds:copy(p.merges[i].preservedShowIds),heldLocalShowIds:copy(p.merges[i].heldLocalShowIds),managedLocalShowIds:copy(p.merges[i].managedLocalShowIds),preservedShowNames:copy(p.merges[i].preservedShowNames),status:'prepared'}]));
      const priorDelivery=next.recoveryDelivery?.version===2?next.recoveryDelivery:null;
      const priorTargets=priorDelivery?.targets||[],previousGroups=new Set(priorTargets.map(t=>t.groupId));
      if(previousGroups.size!==priorTargets.length)fail('target');
      // A one-group reconnection must not discard or resume another group's
      // saved connection, protection list, or uncertain-send ledger.
      next.recoveryDelivery={...(priorDelivery||{}),version:2,targets:[
        ...priorTargets.map(t=>reconnecting.get(t.groupId)||t),
        ...[...reconnecting.values()].filter(t=>!previousGroups.has(t.groupId))]};
      const nextRaw=JSON.stringify(packState(next));recoveryValidateCloudState(JSON.parse(nextRaw));
      status('端末原本と既存配信を保全しています。');
      const result=await RecoveryDeliveryStore.commit({database:()=>DB,hash:backupDigest,isActive:active,readLegacy:()=>localStorage.getItem(KEY),expectedLegacyRaw:legacy,
        expectedSlotsRaw:JSON.stringify(slots),expectedHoldRaw:JSON.stringify(hold),originalStateRaw:p.original,nextStateRaw:nextRaw,
        remoteCopies:p.plan.targets.map((t,i)=>({gistId:t.gistId,raw:p.remotes[i].raw}))});
      committed=result.committed===true;if(result.status!=='committed')fail('storage');
      if(!active())fail('local-changed');
      S=next;saveSeq=result.seq;stateRevision++;saveDirty=false;savePend=null;
      S.recoveryDelivery.targets.filter(t=>reconnecting.has(t.groupId)).forEach(t=>t.status='ready');await persist();
      s.token='';s.committing=false;s.busy=false;close();render();
      sendTargets=p.plan.targets.map(t=>t.groupId);
    }catch(e){
      if(committed){s.token='';s.prepared=null;startupPhase='blocked';status('再接続設定は保存されましたが、再読確認が必要です。この画面からは送信を止めています。アプリを開き直してください。',true);}
      else if(session===s){
        s.token='';s.prepared=null;status(message(e),true);s.committing=false;s.busy=false;
        s.node.querySelectorAll('button').forEach(b=>b.disabled=false);controls(false);
        const retry=s.node.querySelector('[data-act="rd-commit"]');
        if(retry){retry.dataset.act=p.savedGroupId?'rd-check-saved':'rd-check';retry.textContent='配信先をもう一度確認する';}
      }
    }finally{release?.();}
    // The stored/re-read connection is already confirmed. A later delivery
    // failure must keep its own ledger and must not masquerade as a save error.
    for(const gid of sendTargets)try{await pushOne(gid);}catch(_){
      alert('再接続設定は保存済みです。送信処理を完了できませんでした。設定の配信状況を確認してください。');render();
    }
  }
  async function persist(){save();await saveNow();if(saveErr)fail('storage');const envelope=await idbGet('state:'+(saveSeq%2));if(envelope?.txt!==JSON.stringify(packState(S)))fail('storage');}
  async function preserveRemote(target,remote,active){
    const key='preserved:delivery-remote:v1:'+target.gistId+':'+remote.digest,old=await idbGet(key);
    if(old!==undefined&&old!==remote.raw)fail('storage');if(!active())fail('cancelled');
    if(old===undefined)await idbPut(key,remote.raw);if(await idbGet(key)!==remote.raw||!active())fail('storage');
  }
  async function push(gid,force){
    if(!canPublish(gid)||pushing)return false;
    const binding=currentBinding(gid),token=S.ghToken,group=S.groups.find(g=>g.id===gid),baseline=JSON.stringify(S),contentSnapshot=JSON.stringify({...S,recoveryDelivery:undefined});
    pushing=true;
    let attempted=false,pendingDigest='',pendingKey='',previousDigest=binding.expectedRemoteSha256,release;
    const active=()=>ready()&&!session&&currentBinding(gid)===binding&&S.ghToken===token&&S.groups.find(g=>g.id===gid)===group&&!group.nopub&&group.gistId===binding.gistId&&group.src===binding.src&&JSON.stringify({...S,recoveryDelivery:undefined})===contentSnapshot;
    try{
      release=recordingInboxAdmitWriter();
      const plan=RecoveryDeliveryScope.plan(S,packetForBindings(gid)),originalTarget=plan.targets.find(t=>t.groupId===gid);if(!originalTarget)fail('target');
      const target=RecoveryDeliveryScope.extendForOwnedShows(S,originalTarget);
      const localPayload=payloadFor(S,gid),key=payloadKey(localPayload);
      if(!force&&!group.publishKeyPending&&group.lastKey===key)return 'same';
      const remote=await readTarget(target,token,active);
      if(remote.digest!==binding.expectedRemoteSha256&&!singleOwner())fail('source-changed');
      const merged=singleOwner() ? RecoveryDeliveryScope.mergeOwnerPublication(target,remote.data,localPayload)
        : RecoveryDeliveryScope.mergePublication(target,remote.data,localPayload,binding.preservedShowIds),payload=merged.payload;
      if(JSON.stringify(S)!==baseline)fail('local-changed');
      await preserveRemote(target,remote,active);
      const second=await readTarget(target,token,active);if(second.digest!==remote.digest)fail('source-changed');
      if(JSON.stringify(S)!==baseline)fail('local-changed');
      const raw=JSON.stringify(payload),digest=await backupDigest(raw);if(!active())fail('local-changed');
      previousDigest=remote.digest;
      if(singleOwner())Object.assign(binding,{preservedShowIds:merged.preservedShowIds,heldLocalShowIds:merged.heldLocalShowIds,managedLocalShowIds:merged.managedLocalShowIds,preservedShowNames:merged.preservedShowNames});
      pendingDigest=digest;pendingKey=key;binding.expectedRemoteSha256=previousDigest;binding.status='sending';binding.pendingDigest=digest;binding.pendingKey=key;
      await persist();if(!active())fail('cancelled');
      attempted=true;
      await request('https://api.github.com/gists/'+target.gistId,token,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({files:{'utacheck.json':{content:raw}}})},active);
      const confirmed=await readTarget(target,token,active);if(confirmed.digest!==digest)fail('unknown');
      binding.expectedRemoteSha256=digest;binding.status='ready';delete binding.pendingDigest;delete binding.pendingKey;
      await preserveRemote(target,confirmed,active);
      group.lastKey=key;group.publishKeyPending=false;delete binding.lastFailure;group.publishWarning=merged.heldLocalShowIds.length?'現配信の公演を保持しています。同じ公演の端末版差分は保留です。':'';await persist();return 'sent';
    }catch(e){
      if(attempted){binding.expectedRemoteSha256=previousDigest;binding.status='uncertain';binding.pendingDigest=pendingDigest;binding.pendingKey=pendingKey;try{await persist();}catch(_){};const error=new Error(message({reconnectCode:'unknown'}));error.publicationUnknown=true;throw error;}
      if(binding.status==='sending'||!['cancelled','local-changed'].includes(e.reconnectCode)){binding.status='blocked';binding.lastFailure=message(e);try{await persist();}catch(_){}}
      throw new Error(message(e));
    }finally{release?.();pushing=false;}
  }
  async function reconcile({silent=false,onlyUncertain=false,includeBlocked=false,groupId}={}){
    if(!ready()||session||pushing||publishInFlight||S.recoveryDelivery?.version!==2)return;pushing=true;let release;
    const resolvedIssues=new Set();let confirmed=0;
    try{
      release=recordingInboxAdmitWriter();
      RecoveryDeliveryScope.plan(S,packetForBindings(groupId));
      for(const target of S.recoveryDelivery?.targets||[]){
        if(groupId&&target.groupId!==groupId)continue;
        if(onlyUncertain&&!['sending','uncertain'].includes(target.status)&&!(includeBlocked&&target.status==='blocked'))continue;
        if(target.status==='ready')continue;if(target.status==='prepared')fail('storage');if(!target.pendingDigest&&target.status!=='blocked')fail('unknown');
        const token=S.ghToken,group=S.groups.find(g=>g.id===target.groupId),key=group?.key;
        const active=()=>ready()&&!session&&S.ghToken===token&&currentBinding(target.groupId)===target
          &&S.groups.find(g=>g.id===target.groupId)===group&&!group?.nopub&&group?.gistId===target.gistId&&group?.src===target.src&&group?.key===key;
        const remote=await readTarget(target,token,active);
        let rebased=false,ownerMerge=null;
        if(includeBlocked&&singleOwner()){
          const scope=RecoveryDeliveryScope.extendForOwnedShows(S,RecoveryDeliveryScope.plan(S,packetForBindings(target.groupId)).targets[0]);
          ownerMerge=RecoveryDeliveryScope.mergeOwnerPublication(scope,remote.data,payloadFor(S,target.groupId));
          await preserveRemote(scope,remote,active);rebased=true;
        }
        if(!ownerMerge&&remote.digest!==target.pendingDigest&&remote.digest!==target.expectedRemoteSha256){
          if(!includeBlocked||typeof RecoveryDeliveryScope.verifyUnchangedManaged!=='function')fail('source-changed');
          const scope=RecoveryDeliveryScope.extendForOwnedShows(S,RecoveryDeliveryScope.plan(S,packetForBindings(target.groupId)).targets[0]);
          const cached=await idbGet('preserved:delivery-remote:v1:'+target.gistId+':'+target.expectedRemoteSha256);
          let baseline;
          if(typeof cached==='string'&&await backupDigest(cached)===target.expectedRemoteSha256)baseline=JSON.parse(cached);
          else try{baseline=JSON.parse(group.lastKey);}catch(_){fail('source-changed');}
          if(!active()||!RecoveryDeliveryScope.verifyUnchangedManaged(scope,remote.data,baseline,target.preservedShowIds))fail('source-changed');
          // Validate the prospective merge as well before adopting a new digest.
          RecoveryDeliveryScope.mergePublication(scope,remote.data,payloadFor(S,target.groupId),target.preservedShowIds);
          await preserveRemote(scope,remote,active);rebased=true;
        }
        const prior=copy(target),g=S.groups.find(g=>g.id===target.groupId),priorKey=g?.lastKey,priorPending=g?.publishKeyPending;
        if(remote.digest===target.pendingDigest){target.expectedRemoteSha256=remote.digest;if(g){g.lastKey=target.pendingKey;g.publishKeyPending=false;}}
        if(rebased)target.expectedRemoteSha256=remote.digest;
        if(ownerMerge){
          Object.assign(target,{preservedShowIds:ownerMerge.preservedShowIds,heldLocalShowIds:ownerMerge.heldLocalShowIds,managedLocalShowIds:ownerMerge.managedLocalShowIds,preservedShowNames:ownerMerge.preservedShowNames});
          if(g)g.publishKeyPending=true;
        }
        target.status='ready';delete target.pendingDigest;delete target.pendingKey;delete target.lastFailure;
        try{await persist();}catch(error){Object.keys(target).forEach(k=>delete target[k]);Object.assign(target,prior);if(g){g.lastKey=priorKey;g.publishKeyPending=priorPending;}throw error;}
        confirmed++;
        const name=g?.name||target.groupName||'配信先';
        if(prior.lastFailure&&S.groups.filter(group=>(group.name||'配信先')===name).length===1)resolvedIssues.add(name+'：'+prior.lastFailure);
        if(S.groups.filter(group=>(group.name||'配信先')===name).length===1)for(const reason of ['配信結果の確認待ち','接続設定の保存確認待ち','配信保留（復旧状況を確認してください）',message({reconnectCode:'unknown'})])resolvedIssues.add(name+'：'+reason);
      }
      if(!silent)alert('既存先の送信結果を確認しました。この確認では再送していません。');render(true);
      return confirmed>0;
    }catch(e){if(!silent)alert(message(e));return confirmed>0;}finally{
      if(typeof publishIssues!=='undefined'&&resolvedIssues.size)publishIssues=publishIssues.filter(issue=>!resolvedIssues.has(issue));
      release?.();pushing=false;
      if(typeof renderPublishStatus==='function')renderPublishStatus();
    }
  }
  let lastPendingCheck=0;
  async function reconcilePending(){
    if(!ready()||session||pushing||publishInFlight||!S.ghToken||S.recoveryDelivery?.version!==2
      ||REC||saving||U.sheet||U.menu||U.busy||U.picker
      ||typeof typingNow==='function'&&typingNow()
      ||!(S.recoveryDelivery.targets||[]).some(t=>t.status==='blocked'||['sending','uncertain'].includes(t.status)&&t.pendingDigest&&t.pendingKey))return false;
    if(Date.now()-lastPendingCheck<30000)return false;
    lastPendingCheck=Date.now();
    let confirmed=false;
    for(const target of S.recoveryDelivery.targets||[]){
      if(target.status==='blocked'||['sending','uncertain'].includes(target.status)&&target.pendingDigest&&target.pendingKey)
        confirmed=await reconcile({silent:true,onlyUncertain:true,includeBlocked:true,groupId:target.groupId})||confirmed;
    }
    return confirmed;
  }
  document.addEventListener('click',e=>{
    const field=e.target,s=session;
    if(s&&(['rd-exclusive','rd-approve'].includes(field?.id)||s.prepared?.alignments.some((_,i)=>field?.id==='rd-alignment-'+i))&&s.node.querySelector('#'+field.id)===field){
      // These two native checkboxes are temporary consent, not editor data.
      // The explicit commit below owns the full original/readback transaction;
      // do not run the general pre-edit checkpoint for each checkbox click.
      e.stopImmediatePropagation();
      if(!ready()||s.busy||!s.prepared){e.preventDefault();status(s.busy?'確認・保全を進めています。そのままお待ちください。':'もう一度、配信先と対象公演を確認してください。',true);}
      return;
    }
    const b=e.target.closest?.('[data-act^="rd-"]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();
    const action=b.dataset.act;if(action==='rd-differences')void inspectHeldDifferences(b.dataset.id);if(action==='rd-open')open();if(action==='rd-close')close();if(action==='rd-check')void check();if(action==='rd-check-saved')void check(true);if(action==='rd-commit')void commit();if(action==='rd-reconcile')void reconcile();},true);
  document.addEventListener('input',e=>{if(session&&!session.busy&&['rd-file','rd-token','rd-group'].includes(e.target.id)){session.prepared=null;session.token='';session.node.querySelector('#rd-preview').innerHTML='';status('入力が変わりました。もう一度接続先を確認してください。');}},true);
  document.addEventListener('change',e=>{if(session&&!session.busy&&['rd-file','rd-group'].includes(e.target.id)){session.prepared=null;session.token='';session.node.querySelector('#rd-preview').innerHTML='';status('選択が変わりました。もう一度接続先を確認してください。');}},true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&!session?.committing)close();});
  root.RecoveryDelivery=Object.freeze({settingsHTML,open,close,canPublish,hasResumed,pending,push,reconcile,reconcilePending,readPreview,inspectHeldDifferences});
})(globalThis);

