/* Horizontal touch navigation. Text ranges remain selectable inside the note sheet. */
(() => {
 let start=null, touches=new Set(), suppressUntil=0;
 const controls='#app>.bottom,#app>.lf-dock,#app>.aubar';
 const allowed=()=>U.view==='live'&&!S.recMode&&!U.overview&&!U.draw&&!U.sheet&&!U.menu&&!U.picker&&!REC;
 document.addEventListener('pointerdown',e=>{
  if(e.pointerType!=='touch')return;
  touches.add(e.pointerId);
  if(touches.size>1){start=null;org=null;clearHold();clearHl();return;}
  if(!allowed()||e.clientX<24||e.clientX>innerWidth-24)return;
  if(VIEW()){
   if(!e.target.closest('#app>.scroll')||e.target.closest('button,input,textarea,select,.pull'))return;
  }else if(!e.target.closest(controls)||e.target.closest('input,textarea,select'))return;
  start={id:e.pointerId,x:e.clientX,y:e.clientY,time:performance.now(),horizontal:false};
 },true);
 document.addEventListener('pointermove',e=>{
  if(!start||e.pointerId!==start.id)return;
  const dx=e.clientX-start.x,dy=e.clientY-start.y;
  if(!start.horizontal&&Math.abs(dy)>12&&Math.abs(dy)>=Math.abs(dx)){start=null;return;}
  if(Math.abs(dx)>14&&Math.abs(dx)>Math.abs(dy)*1.7)start.horizontal=true;
  if(start.horizontal){org=null;dragOn=false;clearHold();clearHl();e.preventDefault();e.stopImmediatePropagation();}
 },{capture:true,passive:false});
 document.addEventListener('pointerup',e=>{
  touches.delete(e.pointerId);
  if(!start||e.pointerId!==start.id)return;
  const s=start;start=null;
  if(!s.horizontal)return;
  org=null;dragOn=false;clearHold();clearHl();suppressUntil=Date.now()+400;e.preventDefault();e.stopImmediatePropagation();
  const dx=e.clientX-s.x,dy=e.clientY-s.y;
  if(!allowed()||Math.abs(dx)<65||Math.abs(dx)<Math.abs(dy)*1.7||performance.now()-s.time>1000)return;
  const button=app.querySelector(`[data-act="${dx<0?'next':'prev'}"]`);
  if(button&&!button.classList.contains('off'))button.click();
 },{capture:true,passive:false});
 document.addEventListener('pointercancel',e=>{touches.delete(e.pointerId);start=null;},true);
 document.addEventListener('click',e=>{if(U.view==='live'&&e.isTrusted&&Date.now()<suppressUntil&&(e.target.closest('#app>.scroll')||e.target.closest(controls))){e.preventDefault();e.stopImmediatePropagation();}},true);
})();
function memberHelpHTML(){return `<details class="member-help"><summary>使い方</summary>
<div><h3>歌詞と指摘を確認する</h3><ol>
<li><b>曲を選ぶ</b><br>上の曲名を押すと曲を選べます。歌詞を左へスワイプすると次の曲、右へスワイプすると前の曲に移動します。下の矢印でも移動できます。</li>
<li><b>自分の指摘を見る</b><br>歌詞についた色や印と、その下の指摘・メモを確認できます。</li>
<li><b>文字を大きくする</b><br>歌詞を2本指で広げると拡大、狭めると縮小できます。上下のスクロールで歌詞の続きを読めます。</li>
<li><b>内容を読む</b><br>歌詞の下に指摘とメモを表示します。「前回」は以前の公演の指摘です。分からない内容は担当者に確認してください。</li>
<li><b>更新を受け取る</b><br>通信できる状態で共有されたURLを開いてください。古い表示のままの場合は再読み込みしてください。名前の絞り込みは閲覧用で、共有された記録を書き換えません。</li>
</ol><p>画面の左右端はブラウザーの操作に使われるため、スワイプは中央付近から始めてください。録音中・手書き中・指摘画面では曲移動のスワイプは無効です。</p></div></details>`;}
