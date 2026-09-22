const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const c=vm.createContext({});
vm.runInContext(src.slice(0,src.indexOf('function renderQuickMenu')),c);
const expand=value=>{c.value=value;return vm.runInContext('expandNoteMemo(value)',c);};
test('flick input, IME kanji and katakana produce the same correction',()=>{
 for(const word of ['たかい','高い','タカイ','ﾀｶｲ',' たかい '])assert.equal(expand(word),'音程高い');
 for(const word of ['はやい','早い','速い','ハヤイ'])assert.equal(expand(word),'リズム速い');
 assert.equal(expand('低い'),'音程低い');assert.equal(expand('リズム早い'),'リズム速い');
 assert.equal(expand('音程たかい'),'音程高い');assert.equal(expand('りずむ'),'リズム');
});
test('clear lyric locations and degrees expand without duplicated categories',()=>{
 for(const [input,output] of [['語尾たかい','語尾 音程高い'],['ごびひくい','語尾 音程低い'],['少し低い','少し音程低い'],['頭がちょっとはやい','頭 ちょっとリズム速い'],['たかい語尾','語尾 音程高い'],['サビ不安定','サビ 音程不安定'],['Aメロ低い','Aメロ 音程低い']])assert.equal(expand(input),output,input);
});
test('multiple recognized shorthand terms combine without swallowing unknown text',()=>{
 assert.equal(expand('たかい、はやい'),'音程高い / リズム速い');
 assert.equal(expand('ひくい おそい'),'音程低い / リズム遅い');
 assert.equal(expand('たかい / 長い'),'音程高い / 長い');
 assert.equal(expand('たかい 語尾を丸く'),'たかい 語尾を丸く');
});
test('free prose, negative instructions and already written corrections keep their meaning',()=>{
 for(const input of ['あたたかい','あたたかい声','もっとあたたかい','たかい声で','高くしない','語尾は高くしない','音程は高くない','歌詞「たかい」','声が高い','音程高い','リズム速い','語尾を やわらかく\n最後まで','<b>たかい</b>'])assert.equal(expand(input),input,input);
 assert.equal(expand(''),'');assert.equal(expand(null),'');
});
test('an explicitly empty input never falls back to the previous draft',()=>{
 const state=vm.createContext({document:{getElementById:()=>({value:''})},U:{sheet:{memo:'古い指摘',seq:[]}}});
 vm.runInContext(src.slice(src.indexOf('function sheetHasInput()'),src.indexOf('// タグを押したらその場で確定')),state);
 assert.equal(vm.runInContext('sheetHasInput()',state),false);
});
