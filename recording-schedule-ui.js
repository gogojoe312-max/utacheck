/* Explicit local schedule changes. Preserve editor originals; never publish. */
(function(root){
  'use strict';
  let applying=false;
  const fail=message=>{throw new Error(message);};
  function ready(){return startupPhase==='ready'&&startupRecoveryNetworkHold&&recordingInboxCanWrite()&&!document.hidden&&!VIEW()&&!preview&&!previewLoading&&!REC&&!recordingStartPending&&!recordingFinalizePending&&!pitchStartPending&&!PT.on&&!micStream&&!(S.plan?.slots||[]).some(s=>s.a0!=null&&s.a1==null)&&!saving&&!U.busy&&!U.sheet&&!U.menu;}
  function label(slot){return String(slot.day||slot.date||'')+' '+String(slot.name||'')+' '+min2hm(slot.at)+'〜'+min2hm(slot.at+slot.min);}
  function message(error){
    const code=error?.code;
    if(code)return '予定の対応または現在の時刻が一致しないため変更していません。既存の記録は保持しています。';
    return error?.message||'時間割を更新できませんでした。既存の記録は保持しています。';
  }
  async function applyFile(file){
    if(applying)return false;
    if(!ready()){alert('録音・開始中の枠・保存・入力が終わってから時間割を更新してください。');return false;}
    applying=true;let release,committed=false,locked=false;
    try{
      release=recordingInboxAdmitWriter();
      if(!Number.isSafeInteger(file?.size)||file.size<=0||file.size>256*1024)fail('時間割変更ファイルを選んでください。');
      const beforeRead=JSON.stringify(S),text=await file.text();
      if(!ready()||JSON.stringify(S)!==beforeRead)fail('読取中に作業内容が変わりました。変更していません。');
      const packet=JSON.parse(text),result=RecordingScheduleUpdate.apply(S,packet);
      const ids=new Set([...result.changed,...result.unconfirmed]);
      if(!ids.size){alert(result.skipped.length?'対応する枠が見つかりません。現在の時間割は変更していません。':'この時間割変更は適用済みです。');return false;}
      const changed=result.state.plan.slots.filter(s=>result.changed.includes(s.id));
      const uncertain=result.state.plan.slots.filter(s=>result.unconfirmed.includes(s.id));
      const skipped=result.skipped.map(x=>String(x.id)).join('、');
      const details=changed.map(label).join('\n')+(uncertain.length?'\n\n旧別件/休憩の時刻未確認：\n'+uncertain.map(label).join('\n')+'\n元の枠・実績を残し、自動切替の対象から外します。':'')+(skipped?'\n\n一致せず変更しない枠：'+skipped:'');
      if(!confirm(details+'\n\n枠ID・テイク・録音・指摘・完了記録を保持して、この変更を適用しますか？'))return false;
      if(!ready()||JSON.stringify(S)!==beforeRead)fail('確認中に作業内容が変わりました。変更していません。');
      const app=document.getElementById('app');if(app){app.inert=true;locked=true;}
      await saveNow();if(saveErr||!ready())fail('現在の保存を確認できません。変更していません。');
      const original=JSON.stringify(S),revision=stateRevision,view=JSON.stringify(U);
      const next=RecordingScheduleUpdate.apply(S,packet).state;
      const active=()=>ready()&&stateRevision===revision&&JSON.stringify(S)===original&&JSON.stringify(U)===view;
      const slots=await Promise.all([idbGet('state:0'),idbGet('state:1')]),hold=await idbGet('recovery:network-hold:v1'),legacy=localStorage.getItem(KEY);
      if(!active())fail('保存中に作業内容が変わりました。変更していません。');
      const nextRaw=JSON.stringify(packState(next));recoveryValidateCloudState(JSON.parse(nextRaw));
      const stored=await RecoveryDeliveryStore.commit({database:()=>DB,hash:backupDigest,isActive:active,readLegacy:()=>localStorage.getItem(KEY),expectedLegacyRaw:legacy,
        expectedSlotsRaw:JSON.stringify(slots),expectedHoldRaw:JSON.stringify(hold),originalStateRaw:original,nextStateRaw:nextRaw,remoteCopies:[]});
      committed=stored.committed===true;
      if(stored.status!=='committed'||!active())fail('保存後の再読確認が必要です。');
      S=next;saveSeq=stored.seq;stateRevision++;saveDirty=false;savePend=null;
      U.recScheduleInputUntil=Date.now()+2000;
      render();alert('時間割を更新し、端末への保存を確認しました。\n'+changed.length+'枠変更'+(uncertain.length?'・旧'+uncertain.length+'枠は時刻未確認':'')+'。録音・指摘・実績は保持しています。');return true;
    }catch(error){
      if(committed){startupPhase='blocked';alert('変更は保存されましたが再読確認が必要です。録音を始めずアプリを開き直してください。');}
      else alert(message(error));return false;
    }finally{
      applying=false;release?.();if(locked){const app=document.getElementById('app');if(app)app.inert=!recordingInboxCanWrite();}
    }
  }
  function choose(){
    if(!ready()){alert('録音・開始中の枠・保存・入力が終わってから時間割を更新してください。');return;}
    const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
    input.onchange=()=>{if(input.files?.[0])void applyFile(input.files[0]);};input.click();
  }
  document.addEventListener('click',event=>{const b=event.target.closest?.('[data-act="recording-schedule-update"]');if(!b)return;event.preventDefault();event.stopImmediatePropagation();choose();},true);
  root.RecordingScheduleUI=Object.freeze({choose,applyFile,isApplying:()=>applying});
})(globalThis);
