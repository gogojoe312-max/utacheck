/* Read-only projection of the existing absence substitutions. No state writes. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AbsenceChanges = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const ids = value => [...new Set((Array.isArray(value) ? value : []).filter(id => typeof id === "string" && id))];
  const same = (a,b) => a.length === b.length && a.every(id => b.includes(id));
  function confirmed(receipt,beforeValue,afterValue,text) {
    if(!receipt||!Array.isArray(receipt.before)||!Array.isArray(receipt.after))return false;
    const before=ids(beforeValue),after=ids(afterValue);
    return !same(before,after)&&same(ids(receipt.before),before)&&same(ids(receipt.after),after)
      &&(text===undefined||receipt.text===String(text||""));
  }
  function activeAbsenceChange(beforeValue,afterValue,absentValue) {
    const before=ids(beforeValue),after=ids(afterValue),absent=ids(absentValue);
    return after.length>0 && !same(before,after) && before.some(id=>absent.includes(id))
      && !after.some(id=>absent.includes(id));
  }
  function placeholderName(value) {
    const name=String(value == null ? "" : value).normalize("NFKC").trim();
    // Explicit assignment labels only; do not guess whether a person's name is real.
    return !name || new Set(["回替わり","回替り","回代わり","回代り","回変わり","回変り","日替わり","日替り"]).has(name);
  }
  function eligibleMembers(members, options={}) {
    const blocks=new Set(options.blockLabels || []);
    return (members || []).filter(m=>m && !placeholderName(m.name) && !blocks.has(m.name));
  }
  function classify(beforeValue, afterValue, absentValue, explicit, options={}) {
    const before=ids(beforeValue), after=ids(afterValue), absent=ids(absentValue);
    if (!before.length) return null;
    const added=after.filter(id=>!before.includes(id)), removed=before.filter(id=>!after.includes(id));
    const affected=before.some(id=>absent.includes(id));
    let status="";
    if (!explicit) status=affected ? "need" : "";
    else if (after.some(id=>absent.includes(id)) || !after.length && affected) status="need";
    else if (!same(before,after)) {
      // Keep lyric emphasis quiet for group reductions, but include them in the song overview.
      if (options.includeGroupReductions || !(before.length >= 3 && after.length > 0 && !added.length && removed.length)) status="changed";
    }
    return status ? {status,before,after,added,removed,involved:ids(before.concat(after))} : null;
  }
  function line(song, index, context={}) {
    const row=(song.lines || [])[index];
    if (!row || row.gap || row.cut || /^(?:全|zenn\b)/i.test(row.labelRaw || row.label || "")) return null;
    const before=ids(row.parts), label=String(row.label || "").trim();
    if (!before.length) return null;
    const explicit=Array.isArray((context.subs || {})[index]);
    if (!explicit && Object.prototype.hasOwnProperty.call(song.blocks || {},label)) return null;
    const after=explicit ? context.subs[index] : before;
    if(context.requireConfirmed&&!confirmed(context.edits?.lines?.[index],before,after,row.t)
      &&!(context.acceptActiveAbsence&&explicit&&activeAbsenceChange(before,after,context.absent)))return null;
    const diff=classify(before,after,context.absent,explicit,context);
    if (!diff) return null;
    const beforeMain=ids(row.main || before), beforeExtra=ids(row.extra);
    const keepMain=diff.after.filter(id=>beforeMain.includes(id)), keepExtra=diff.after.filter(id=>beforeExtra.includes(id));
    const added=diff.after.filter(id=>!beforeMain.includes(id) && !beforeExtra.includes(id));
    const absent=ids(context.absent);
    const onlyExtra=beforeExtra.some(id=>absent.includes(id)) && !beforeMain.some(id=>absent.includes(id));
    return {...diff,kind:"line",songId:song.id,showId:song.showId,lineIdx:index,lineIndices:[index],
      text:String(row.t || ""),label:String(row.label || ""),beforeMain,beforeExtra,
      afterMain:beforeExtra.length ? keepMain.concat(onlyExtra ? [] : added) : diff.after,
      afterExtra:beforeExtra.length ? keepExtra.concat(onlyExtra ? added : []) : []};
  }
  function block(song, label, context={}) {
    const before=(song.blocks || {})[label];
    if (!Array.isArray(before)) return null;
    const explicit=Array.isArray((context.gsubs || {})[label]);
    const after=explicit ? context.gsubs[label] : before;
    if(context.requireConfirmed&&!confirmed(context.edits?.blocks?.[label],before,after)
      &&!(context.acceptActiveAbsence&&explicit&&activeAbsenceChange(before,after,context.absent)))return null;
    const diff=classify(before,after,context.absent,explicit,context);
    if (!diff) return null;
    const referenced=(song.lines || []).flatMap((row,index)=>!row.gap && !row.cut && String(row.label || "").trim()===label ? [index] : []);
    const lineIndices=referenced.filter(index=>!Array.isArray((context.subs || {})[index]));
    if (referenced.length && !lineIndices.length) return null;
    return {...diff,kind:"block",songId:song.id,showId:song.showId,label,lineIdx:lineIndices[0] ?? null,lineIndices,
      text:lineIndices.map(index=>String(song.lines[index].t || "")).filter(Boolean).join(" / "),
      beforeMain:diff.before,beforeExtra:[],afterMain:diff.after,afterExtra:[]};
  }
  function entries(song, context={}) {
    const blocks=Object.keys(song.blocks || {}).map(label=>block(song,label,context)).filter(Boolean);
    const rows=[];
    (song.lines || []).forEach((_,index)=>{
      const entry=line(song,index,context);
      if (!entry) return;
      const previous=rows[rows.length-1];
      const signature=value=>JSON.stringify([value.status,value.before,value.after,value.beforeMain,value.beforeExtra,value.afterMain,value.afterExtra]);
      if (previous && previous.lineIndices.at(-1)===index-1 && signature(previous)===signature(entry)) {
        previous.lineIndices.push(index);previous.text+=" / "+entry.text;
      } else rows.push(entry);
    });
    return blocks.concat(rows);
  }
  function forMember(entry, memberId) {
    // A solo harmony remains personal even when the main melody has 3+ singers.
    return [[entry.beforeMain,entry.afterMain],[entry.beforeExtra,entry.afterExtra]].some(([before,after])=>
      !same(before,after) && (before.includes(memberId) || after.includes(memberId)) && before.length < 3 && after.length < 3);
  }
  return Object.freeze({confirmed,activeAbsenceChange,placeholderName,eligibleMembers,classify,line,block,entries,forMember});
});
