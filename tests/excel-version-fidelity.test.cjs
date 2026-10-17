'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const XLSX=require('../vendor/xlsx.full.min.js');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function context(){
 const c=vm.createContext({XLSX,Uint8Array,Uint32Array,DataView,TextEncoder,TextDecoder,Response});
 const start=source.indexOf('const CRCT ='),end=source.indexOf('\n}',source.indexOf('  return { data: await zip(files, names), changed };'))+2;
 vm.runInContext(source.slice(start,end),c);return c;
}
const text=bytes=>new TextDecoder().decode(bytes),bytes=value=>new TextEncoder().encode(value);
const xml=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const quote=name=>"'"+name.replace(/'/g,"''")+"'";
const SOURCE="歌割 & O'Brien",TAB="欠席 & O'Brien";
const rels=(items)=>'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+items.join('')+'</Relationships>';
const rel=(id,type,target,external=false)=>'<Relationship Id="'+id+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/'+type+'" Target="'+xml(target)+'"'+(external?' TargetMode="External"':'')+'/>';
const tags=xml=>[...xml.matchAll(/<Relationship\b[^>]*>/g)].map(m=>Object.fromEntries([...m[0].matchAll(/\b(Id|Type|Target|TargetMode)="([^"]*)"/g)].map(a=>[a[1],a[2].replace(/&amp;/g,'&')])));
const resolve=(part,target)=>path.posix.normalize(target.startsWith('/')?target.slice(1):path.posix.join(path.posix.dirname(part),decodeURIComponent(target)));
const relPath=part=>path.posix.join(path.posix.dirname(part),'_rels',path.posix.basename(part)+'.rels');
async function fixture(c){
 const wb=XLSX.utils.book_new();
 for(const name of ['Cover',SOURCE,'Other'])XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Original','Lyric'],['Second','Line'],['Merged']]),name);
 const sh=wb.Sheets[SOURCE];sh.A1.c=[{a:'Synthetic author',t:'Preserve original comment'}];
 sh['!merges']=[XLSX.utils.decode_range('A3:B3')];sh['!cols']=[{wch:18},{wch:42}];sh['!rows']=[{hpt:36}];
 wb.Workbook={Names:[
  {Name:'_xlnm.Print_Area',Ref:quote(SOURCE)+'!$A$1:$B$3,'+quote(SOURCE)+'!$D$1:$E$2',Sheet:1},
  {Name:'_xlnm.Print_Titles',Ref:quote(SOURCE)+'!$1:$2,'+quote(SOURCE)+'!$A:$A',Sheet:1},
  {Name:'ScopedName',Ref:quote(SOURCE)+'!$A$1+Other!$A$1+N("'+quote(SOURCE)+'!$A$1")',Sheet:1},
  {Name:'CoverName',Ref:'Cover!$A$1',Sheet:0},{Name:'OtherName',Ref:'Other!$A$1',Sheet:2},
  {Name:'GlobalName',Ref:quote(SOURCE)+'!$A$1'}
 ]};
 const archive=await c.unzip(XLSX.write(wb,{type:'buffer',bookType:'xlsx',compression:true}));
 const files=archive.files,put=(name,value)=>{files[name]=typeof value==='string'?bytes(value):value;};
 const sheet='xl/worksheets/sheet2.xml',sr=relPath(sheet);
 put(sheet,text(files[sheet]).replace('</worksheet>',
  '<pageMargins left="0.2" right="0.3" top="0.4" bottom="0.5" header="0.1" footer="0.1"/>'+
  '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0" r:id="rId11"/>'+
  '<drawing r:id="rId10"/></worksheet>'));
 put(sr,text(files[sr]).replace('</Relationships>',rel('rId10','drawing','../drawings/drawing1.xml')+
  rel('rId11','printerSettings','../printerSettings/printerSettings1.bin')+rel('rId12','hyperlink','https://example.invalid/?a=1&b=2',true)+'</Relationships>'));
 put('xl/drawings/drawing1.xml','<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:absoluteAnchor><xdr:pos x="0" y="0"/><xdr:ext cx="1" cy="1"/><xdr:sp><xdr:nvSpPr><xdr:cNvPr id="1" name="Synthetic shape"/><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr/><xdr:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Preserve shape text</a:t></a:r></a:p></xdr:txBody></xdr:sp><xdr:clientData/></xdr:absoluteAnchor></xdr:wsDr>');
 put('xl/drawings/_rels/drawing1.xml.rels',rels([rel('rId1','image','../media/image1.png'),rel('rId2','hyperlink','https://example.invalid/drawing',true)]));
 put('xl/drawings/_rels/vmlDrawing2.vml.rels',rels([rel('rId1','image','../media/image1.png')]));
 put('xl/media/image1.png',Uint8Array.from([137,80,78,71,13,10,26,10]));
 put('xl/printerSettings/printerSettings1.bin',Uint8Array.from([1,3,5,7]));
 put('[Content_Types].xml',text(files['[Content_Types].xml']).replace('</Types>',
  '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'+
  '<Override PartName="/xl/printerSettings/printerSettings1.bin" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.printerSettings"/></Types>'));
 return {data:await c.zip(files,null,false),files,sheet};
}
test('version sheet keeps drawing, comment, printer and nested relationships without modifying any original part',async()=>{
 const c=context(),original=await fixture(c),result=await c.addVersionTab(original.data,TAB,{A1:'Replacement'},SOURCE);
 const output=await c.unzip(result.data),files=output.files,newSheet='xl/worksheets/sheet4.xml';
 const mutable=new Set(['xl/workbook.xml','xl/_rels/workbook.xml.rels','[Content_Types].xml','xl/styles.xml','xl/sharedStrings.xml']);
 for(const [name,value]of Object.entries(original.files))if(!mutable.has(name))assert.deepEqual(Buffer.from(files[name]),Buffer.from(value),name);
 const originalSheet=text(original.files[original.sheet]),copy=text(files[newSheet]);
 for(const name of ['mergeCells','cols','pageMargins','pageSetup']){
  const element=new RegExp('<'+name+'\\b[^>]*(?:/>|>[\\s\\S]*?</'+name+'>)').exec(originalSheet)?.[0];assert(element,name);assert(copy.includes(element),name);
 }
 assert.match(copy,/<drawing r:id="rId10"\/>/);assert.match(copy,/<legacyDrawing r:id="rId1"\/>/);
 const sourceRelations=tags(text(original.files[relPath(original.sheet)])),newRelations=tags(text(files[relPath(newSheet)]));
 for(const sourceRel of sourceRelations){
  const next=newRelations.find(r=>r.Id===sourceRel.Id);assert(next,sourceRel.Id);
  if(sourceRel.TargetMode==='External'){assert.deepEqual(next,sourceRel);continue;}
  const oldPart=resolve(original.sheet,sourceRel.Target),newPart=resolve(newSheet,next.Target);assert.notEqual(newPart,oldPart);
  assert.deepEqual(Buffer.from(files[newPart]),Buffer.from(original.files[oldPart]),sourceRel.Type);
  if(files[relPath(oldPart)])for(const dependency of tags(text(files[relPath(newPart)]))){
   const old=tags(text(original.files[relPath(oldPart)])).find(r=>r.Id===dependency.Id);
   if(old.TargetMode==='External'){assert.deepEqual(dependency,old);continue;}
   const oldChild=resolve(oldPart,old.Target),newChild=resolve(newPart,dependency.Target);assert.notEqual(newChild,oldChild);assert.deepEqual(Buffer.from(files[newChild]),Buffer.from(original.files[oldChild]));
  }
  const oldType=(text(original.files['[Content_Types].xml']).match(/<Override\b[^>]*>/g)||[]).find(t=>t.includes('PartName="/'+oldPart+'"'));
  if(oldType)assert(text(files['[Content_Types].xml']).includes(oldType.replace('/'+oldPart,'/'+newPart)),newPart+' content type');
 }
 const read=XLSX.read(result.data,{type:'array'});assert.equal(read.Sheets[TAB].A1.v,'Replacement');assert.equal(read.Sheets[SOURCE].A1.v,'Original');
 assert.equal(read.Sheets[TAB].A1.c[0].t,'Preserve original comment');assert.deepEqual(read.Sheets[TAB]['!merges'],read.Sheets[SOURCE]['!merges']);
});
test('print and local names retain their owners through two front insertions and safely quote the new sheet names',async()=>{
 const c=context(),original=await fixture(c);let data=original.data;
 for(let iteration=1;iteration<=2;iteration++){
  data=(await c.addVersionTab(data,TAB,{A1:'Replacement '+iteration},SOURCE)).data;
  const wb=XLSX.read(data,{type:'array'}),names=wb.Workbook.Names;
  assert.equal(wb.SheetNames[0],iteration===1?TAB:TAB+' (2)');
  for(const [owner,label,formula]of [['Cover','CoverName','Cover!$A$1'],['Other','OtherName','Other!$A$1']]){
   const name=names.find(n=>n.Name===label);assert.equal(name.Sheet,wb.SheetNames.indexOf(owner));assert.equal(name.Ref,formula);
  }
  assert.equal(names.find(n=>n.Name==='GlobalName').Ref,quote(SOURCE)+'!$A$1');assert.equal(names.find(n=>n.Name==='GlobalName').Sheet,undefined);
  for(const owner of wb.SheetNames.filter(n=>n===SOURCE||n.startsWith(TAB))){
   const scoped=names.filter(n=>n.Sheet===wb.SheetNames.indexOf(owner));
   assert.equal(scoped.find(n=>n.Name==='_xlnm.Print_Area').Ref,quote(owner)+'!$A$1:$B$3,'+quote(owner)+'!$D$1:$E$2');
   assert.equal(scoped.find(n=>n.Name==='_xlnm.Print_Titles').Ref,quote(owner)+'!$1:$2,'+quote(owner)+'!$A:$A');
   assert.equal(scoped.find(n=>n.Name==='ScopedName').Ref,quote(owner)+'!$A$1+Other!$A$1+N("'+quote(SOURCE)+'!$A$1")');
  }
 }
});
