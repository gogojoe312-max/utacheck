'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'_site');fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out);
const files=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
for(const file of files){
 if(file.startsWith('.')||/^(tests|scripts|docs)\//.test(file)||file==='AGENTS.md'||file.endsWith('.md'))continue;
 const target=path.join(out,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target);
}
