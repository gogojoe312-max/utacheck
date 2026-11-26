const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),XLSX=require('../vendor/xlsx.full.min.js');
const src=fs.readFileSync(__dirname+'/../app.js','utf8');
const start=src.indexOf('function pickSheet(');
const pick=Function('XLSX',src.slice(start,src.indexOf('\n}',start)+2)+';return pickSheet')(XLSX);
test('a half-length mic list cannot override the lyric sheet',()=>{
 const wb=XLSX.utils.book_new();
 for(const name of ['ロージークロニクル','2026,08 9pVer','乙女の逆襲 (マイク番号) (1half)'])XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['橋田','歌詞']]),name);
 assert.equal(pick(wb,{},'M14_乙女の逆襲_1Half_歌割.xlsx'),wb.SheetNames[0]);
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['橋田','歌詞']]),'歌割 1half');
 assert.equal(pick(wb,{},'M14_乙女の逆襲_1Half_歌割.xlsx'),'歌割 1half');
});
