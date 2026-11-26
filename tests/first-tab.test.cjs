const {test}=require('node:test'),assert=require('node:assert/strict'),XLSX=require('../vendor/xlsx.full.min.js'),fs=require('node:fs');
test('new imports read only the first sheet even with half-length or microphone tabs',()=>{
 const names=['ロージークロニクル','歌割 1Half','マイク番号 (1Half)'],wb=XLSX.utils.book_new();
 for(const n of names)XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([[n]]),n);
 const bytes=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
 const parsed=XLSX.read(bytes,{type:'array',sheets:0,bookFiles:true,cellStyles:true});
 const src=fs.readFileSync(__dirname+'/../app.js','utf8'),i=src.indexOf('function pickSheet(');
 const pick=Function(src.slice(i,src.indexOf('\n}',i)+2)+';return pickSheet')();
 assert.equal(pick(parsed,{},'M14_乙女の逆襲_1Half_歌割.xlsx'),names[0]);assert.deepEqual(Object.keys(parsed.Sheets),[names[0]]);
});
