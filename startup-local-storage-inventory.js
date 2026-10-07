/* Read-only inventory of this app's existing local recovery sources.
 * Only summary is suitable for display. The other fields are private candidates.
 * Never opens databases/caches, changes a value, or performs a network request. */
(function(root){
  'use strict';
  const MAX_BODY=20*1024*1024,MAX_TOTAL=64*1024*1024,MAX_STATE=512,MAX_CLIPS=1024,MAX_KEYS=4096;
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
  const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
  const clone=value=>JSON.parse(JSON.stringify(value));
  const stop=code=>Object.assign(new Error(code),{inventoryCode:code});
  const safeInteger=value=>Number.isSafeInteger(value)&&value>=0;
  function endpoint(source){
    // Match the original string, so explicit ports and URL normalization cannot
    // turn a rejected credential/query/path into an accepted endpoint.
    if(typeof source!=='string')return null;
    const m=/^https:\/\/gist\.githubusercontent\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([a-fA-F0-9]{5,40})\/raw(?:\/([a-fA-F0-9]{40}))?\/utacheck\.json$/.exec(source);
    if(!m)return null;
    const base='https://gist.githubusercontent.com/'+m[1]+'/'+m[2]+'/raw';
    return {id:m[2],url:base+'/utacheck.json',...(m[3]?{pinnedUrl:base+'/'+m[3]+'/utacheck.json'}:{})};
  }
  function directState(value){
    return object(value)&&['groups','songs','shows'].every(key=>own(value,key)&&Array.isArray(value[key]));
  }
  function publication(value){
    return object(value)&&['lib','songs','shows'].every(key=>own(value,key)&&Array.isArray(value[key]));
  }
  function defaultValidate(value){
    if(!object(value))throw stop('state-format');
    for(const key of ['groups','songs','shows','members','rsongs','notes','pubNotes','trash'])
      if(value[key]!==undefined&&(!Array.isArray(value[key])||value[key].some(row=>!object(row))))throw stop('state-format');
    for(const key of ['memos','staffMemos','draws','recs','folders','rfolders','subs','subsMan','subLib','gsubs','rosters','plan'])
      if(value[key]!==undefined&&!object(value[key]))throw stop('state-format');
    if(value.songLib!==undefined&&(!Array.isArray(value.songLib)||value.songLib.some(rows=>!Array.isArray(rows)||rows.some(row=>!object(row)))))throw stop('state-format');
    if(value.plan?.slots!==undefined&&(!Array.isArray(value.plan.slots)||value.plan.slots.some(row=>!object(row))))throw stop('state-format');
    for(const [songs,packed] of [[value.songs||[],true],[value.rsongs||[],false]])for(const song of songs){
      const lines=packed&&song.L!=null?value.songLib?.[song.L]:song.lines;
      if(packed&&song.L!=null&&(!safeInteger(song.L)))throw stop('state-format');
      if(!Array.isArray(lines)||lines.some(row=>!object(row)))throw stop('state-format');
    }
  }
  function hasWork(state){
    return ['songs','rsongs','notes','pubNotes','trash'].some(key=>state[key]?.length)
      ||!!state.plan?.slots?.length||['memos','staffMemos','draws','recs'].some(key=>Object.keys(state[key]||{}).length);
  }
  function binary(value){
    if(typeof Blob!=='undefined'&&value instanceof Blob)return {bytes:value.size,mime:value.type||'',blob:true};
    if(value instanceof ArrayBuffer||ArrayBuffer.isView(value))return {bytes:value.byteLength,mime:'',blob:false};
    return null;
  }
  function view(value){
    return value instanceof ArrayBuffer?new Uint8Array(value):new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
  }
  function classify(header,key,mime){
    const starts=bytes=>bytes.every((byte,index)=>header[index]===byte);
    const ascii=(offset,text)=>[...text].every((char,index)=>header[offset+index]===char.charCodeAt(0));
    const zip=starts([0x50,0x4b,3,4])||starts([0x50,0x4b,5,6])||starts([0x50,0x4b,7,8]);
    const ole=starts([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]);
    const excel=/^(?:application\/(?:vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet))(?:;|$)/i.test(mime);
    if((zip||ole)&&((typeof key==='string'&&/^xls:.+/.test(key))||excel))return 'workbook';
    const audio=(ascii(0,'RIFF')&&ascii(8,'WAVE'))||ascii(0,'OggS')||ascii(0,'fLaC')||ascii(0,'ID3')
      ||(header.length>=2&&header[0]===0xff&&(header[1]&0xe0)===0xe0)||ascii(4,'ftyp')||starts([0x1a,0x45,0xdf,0xa3]);
    if(audio||/^audio\/(?:mpeg|mp3|mp4|x-m4a|webm|wav|x-wav|wave|ogg|flac|aac)(?:;|$)/i.test(mime))return 'audio';
    let index=0;if(starts([0xef,0xbb,0xbf]))index=3;
    while(index<header.length&&[9,10,13,32].includes(header[index]))index++;
    if(header[index]===0x7b||header[index]===0x5b)return 'json';
    return header.length?'other':'unclassified';
  }
  async function inspect(options={}){
    const summary={status:'checking',partial:false,stateStatus:'unavailable',clipsStatus:'unavailable',localStorageStatus:'unavailable',
      databaseEnumerationStatus:'unavailable',cacheEnumeration:'unavailable',cacheLookupStatus:'unavailable',
      stateKeys:0,records:0,fullWorkCandidates:0,lastKeyCopies:0,songLibEntries:0,members:0,groups:0,
      memberRecords:0,viewerSelections:0,endpoints:0,invalidEndpointKeys:0,localStorageKeys:0,databases:0,
      cacheNames:0,cachedResponses:0,publications:0,invalidJSON:0,invalidState:0,unsupportedValues:0,
      readFailures:0,limitHits:0,clipsTotal:0,clipBytes:0,audioClips:0,workbookClips:0,jsonClips:0,otherClips:0,unclassifiedClips:0};
    const records=[],endpoints=[],clips=[],publications=[],endpointKeys=new Set();
    let total=0,ordinal=0,cancelled=false;const deadline=Date.now()+20000;
    const active=()=>!options.signal?.aborted&&(typeof options.isActive!=='function'||options.isActive());
    const assert=()=>{if(!active())throw stop('cancelled');if(Date.now()>=deadline)throw stop('timeout');};
    const failed=()=>{summary.partial=true;summary.readFailures++;};
    const limited=()=>{summary.partial=true;summary.limitHits++;};
    function wait(promise,onStop){
      return new Promise((resolve,reject)=>{
        let settled=false,timer;
        const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);options.signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);};
        const abort=()=>{try{onStop?.();}catch(_){}finish(stop('cancelled'));};
        const check=()=>{if(settled)return;let error;try{assert();}catch(value){error=value;}
          if(error){try{onStop?.();}catch(_){}finish(error);}else timer=setTimeout(check,Math.min(50,Math.max(1,deadline-Date.now())));};
        options.signal?.addEventListener('abort',abort,{once:true});check();
        Promise.resolve(promise).then(value=>finish(null,value),error=>finish(error));
      });
    }
    function budget(text){
      if(typeof text!=='string')return false;
      // UTF-8 never needs fewer bytes than UTF-16 code units for JSON input.
      if(text.length>MAX_BODY){limited();return false;}
      const size=new TextEncoder().encode(text).byteLength;
      if(size>MAX_BODY||total+size>MAX_TOTAL){limited();return false;}total+=size;return true;
    }
    function parse(text){
      if(!budget(text))return undefined;
      try{return JSON.parse(text.charCodeAt(0)===0xfeff?text.slice(1):text);}catch(_){summary.invalidJSON++;return undefined;}
    }
    function addEndpoint(source){
      const value=endpoint(source);if(!value){summary.invalidEndpointKeys++;return;}
      const key=value.pinnedUrl||value.url;if(endpointKeys.has(key))return;
      endpointKeys.add(key);endpoints.push(value);summary.endpoints=endpoints.length;
    }
    function candidate(value,seq,seqKnown){
      let state,libraryEntries=0;
      try{
        // Validation and unpacking callbacks receive independent deep copies.
        // Neither callback can change IDB objects or their nested arrays.
        state=clone(value);defaultValidate(state);
        const validate=options.validateState;if(typeof validate==='function'){
          const checked=validate(clone(state));if(checked===false||checked?.then)throw stop('state-format');
        }
        libraryEntries=Array.isArray(state.songLib)?state.songLib.length:0;
        if(typeof options.unpackState==='function')state=options.unpackState(clone(state));
        state=clone(state);if(!directState(state))throw stop('state-format');defaultValidate(state);
      }catch(_){summary.invalidState++;return;}
      summary.songLibEntries+=libraryEntries;
      records.push({state,seq,ordinal:ordinal++,seqKnown});summary.records=records.length;
      if(hasWork(state))summary.fullWorkCandidates++;
      summary.groups+=(state.groups||[]).length;summary.members+=(state.members||[]).length;
      for(const group of state.groups||[])if(typeof group.lastKey==='string'&&group.lastKey.length)summary.lastKeyCopies++;
    }
    function unwrap(value,depth=0,seq=0,seqKnown=false,locator=null){
      assert();if(value===undefined)return;
      if(typeof value==='string'){value=parse(value);if(value===undefined)return;}
      if(directState(value)){candidate(value,seq,seqKnown);return;}
      if(publication(value)){try{publications.push({data:clone(value),ordinal:ordinal++,...(locator?.id?{id:locator.id}:{})});summary.publications=publications.length;}catch(_){summary.invalidJSON++;}return;}
      if(depth>=2){summary.unsupportedValues++;return;}
      if(object(value)&&own(value,'txt')){
        if(typeof value.txt!=='string'||(own(value,'seq')&&!safeInteger(value.seq))){summary.invalidState++;return;}
        unwrap(value.txt,depth+1,own(value,'seq')?value.seq:seq,own(value,'seq')||seqKnown,locator);return;
      }
      if(object(value)&&own(value,'slots')&&Array.isArray(value.slots)&&value.slots.length<=2&&own(value,'legacy')){
        for(const slot of value.slots){
          if(!object(slot)||typeof slot.present!=='boolean'||(slot.present&&!own(slot,'value'))){summary.invalidState++;continue;}
          if(slot.present)unwrap(slot.value,depth+1,seq,seqKnown,locator);
        }
        if(value.legacy!==null&&value.legacy!==undefined)unwrap(value.legacy,depth+1,seq,seqKnown,locator);return;
      }
      if(object(value)&&value.app==='utacheck'&&own(value,'state')){
        // The app envelope itself supplies no generation number.
        if(!object(value.state)){summary.invalidState++;return;}
        unwrap(value.state,depth+1,seq,seqKnown,locator);return;
      }
      summary.unsupportedValues++;
    }
    function consume(value,locator=null){
      assert();if(typeof value==='string'){
        if(!locator?.api){unwrap(value,0,0,false,locator);return;}
        value=parse(value);if(value===undefined)return;
      }
      if(!object(value)){summary.unsupportedValues++;return;}
      if(locator?.api){
        // A Gist API response can supply file content, never a new locator.
        // Read only the two established filenames from this already-known id.
        if(!own(value,'id')||typeof value.id!=='string'||value.id.toLowerCase()!==locator.id.toLowerCase()||!own(value,'files')||!object(value.files)){
          summary.invalidState++;return;
        }
        let found=false;
        for(const name of ['utacheck.json','utacheck-backup.json']){
          if(!own(value.files,name))continue;const file=value.files[name];found=true;
          if(!object(file)||!own(file,'truncated')||file.truncated!==false||!own(file,'content')||typeof file.content!=='string'){summary.invalidState++;continue;}
          unwrap(file.content,0,0,false,locator);
        }
        if(!found)summary.unsupportedValues++;return;
      }
      let text;try{text=JSON.stringify(value);}catch(_){summary.invalidJSON++;return;}
      if(!budget(text))return;unwrap(value,0,0,false,locator);
    }
    async function cursor(database,name,max){
      let tx;const rows=[];let status='read';
      const promise=new Promise(resolve=>{
        let done=false;
        const finish=()=>{if(done)return;done=true;resolve({rows,status});};
        const abort=()=>{try{tx?.abort();}catch(_){}finish();};
        try{
          tx=database.transaction(name,'readonly');const request=tx.objectStore(name).openCursor();
          tx.oncomplete=finish;tx.onerror=tx.onabort=()=>{if(status==='read')status='failed';finish();};
          request.onerror=()=>{status='failed';abort();};
          request.onsuccess=()=>{
            try{assert();const row=request.result;if(!row)return;
              if(rows.length>=max){status='limited';abort();return;}
              rows.push({key:row.key,value:row.value});row.continue();
            }catch(error){status=error?.inventoryCode==='cancelled'?'cancelled':error?.inventoryCode==='timeout'?'limited':'failed';abort();}
          };
        }catch(_){status='failed';finish();}
      });
      return wait(promise,()=>{try{tx?.abort();}catch(_){}});
    }
    async function inspectClip(row){
      assert();const info=binary(row.value);let kind='unclassified';
      if(info){
        try{
          const header=info.blob?new Uint8Array(await wait(row.value.slice(0,512).arrayBuffer())):view(row.value).subarray(0,512);
          assert();kind=classify(header,row.key,info.mime);
          if(kind==='json'){
            if(info.bytes>MAX_BODY||total+info.bytes>MAX_TOTAL)limited();
            else{
              const bytes=info.blob?new Uint8Array(await wait(row.value.arrayBuffer())):view(row.value);assert();
              try{consume(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch(error){if(error?.inventoryCode)throw error;summary.invalidJSON++;}
            }
          }
        }catch(error){if(error?.inventoryCode)throw error;failed();kind='unclassified';}
      }
      const bytes=info&&safeInteger(info.bytes)?info.bytes:null,mime=info?.mime||'';
      clips.push({key:row.key,kind,bytes,mime,value:row.value});summary.clipsTotal=clips.length;
      if(bytes!==null&&safeInteger(summary.clipBytes+bytes))summary.clipBytes+=bytes;
      else if(bytes!==null)limited();
      const field={audio:'audioClips',workbook:'workbookClips',json:'jsonClips',other:'otherClips',unclassified:'unclassifiedClips'}[kind];summary[field]++;
    }
    async function responseJSON(response,locator){
      // Read the cloned stream with a real byte cap. Content-Length alone is
      // untrusted and Response.text() would allocate an unbounded body.
      let stream;
      try{const copy=response.clone();stream=copy.body?.getReader?.();}catch(_){failed();return;}
      if(!stream){failed();return;}
      const chunks=[];let size=0;
      try{
        while(true){assert();const part=await wait(stream.read(),()=>{try{Promise.resolve(stream.cancel()).catch(()=>{});}catch(_){}});
          assert();if(part.done)break;
          if(!(part.value instanceof Uint8Array)){failed();return;}
          size+=part.value.byteLength;if(size>MAX_BODY||total+size>MAX_TOTAL){limited();return;}chunks.push(part.value);
        }
        const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
        let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch(_){summary.invalidJSON++;return;}consume(text,locator);
      }finally{try{Promise.resolve(stream.cancel()).catch(()=>{});}catch(_){}try{stream.releaseLock();}catch(_){} }
    }
    try{
      assert();
      const database=options.database;
      if(database&&(!database.name||database.name==='utacheck')){
        for(const [name,max] of [['state',MAX_STATE],['clips',MAX_CLIPS]]){
          const field=name==='state'?'stateStatus':'clipsStatus';
          try{
            if(!database.objectStoreNames.contains(name)){summary[field]='unavailable';summary.partial=true;continue;}
            const read=await cursor(database,name,max);assert();summary[field]=read.status;
            if(read.status==='failed')failed();if(read.status==='limited')limited();
            if(read.status==='cancelled')throw stop('cancelled');
            if(name==='state'){summary.stateKeys=read.rows.length;for(const row of read.rows)consume(row.value);}
            else for(const row of read.rows)await inspectClip(row);
          }catch(error){if(error?.inventoryCode)throw error;summary[field]='failed';failed();}
        }
      }else summary.partial=true;
      assert();
      const storage=options.storage;
      if(storage){
        const keys=[];let complete=true;
        try{
          const length=storage.length;if(!safeInteger(length))throw stop('storage-read');
          const bound=Math.min(length,MAX_KEYS);if(length>MAX_KEYS){limited();complete=false;}
          for(let i=0;i<bound;i++){assert();const key=storage.key(i);if(typeof key!=='string'){complete=false;failed();continue;}keys.push(key);}
          if(storage.length!==length){complete=false;failed();}
        }catch(error){if(error?.inventoryCode==='cancelled'||error?.inventoryCode==='timeout')throw error;complete=false;failed();}
        summary.localStorageKeys=keys.length;summary.localStorageStatus=complete?'read':'partial';
        let bodies=0;
        for(const key of keys){
          assert();let prefix;
          if(key.startsWith('utacheck.member:')){summary.memberRecords++;prefix='utacheck.member:';}
          else if(key.startsWith('utacheck.selection:viewer:')){summary.viewerSelections++;prefix='utacheck.selection:viewer:';}
          if(prefix){addEndpoint(key.slice(prefix.length));continue;}
          if(key!=='utacheck.v1'&&!key.startsWith('utacheck.v1:broken:'))continue;
          if(bodies++>=MAX_STATE){limited();summary.localStorageStatus='partial';break;}
          try{const value=storage.getItem(key);if(value===null){failed();summary.localStorageStatus='partial';}else consume(value);}
          catch(error){if(error?.inventoryCode)throw error;failed();summary.localStorageStatus='partial';}
        }
      }else summary.partial=true;
      assert();
      if(typeof options.indexedDB?.databases==='function'){
        try{const names=await wait(options.indexedDB.databases());assert();if(!Array.isArray(names))throw stop('storage-read');
          summary.databases=Math.min(names.length,MAX_KEYS);summary.databaseEnumerationStatus=names.length>MAX_KEYS?'partial':'read';if(names.length>MAX_KEYS)limited();
        }catch(error){if(error?.inventoryCode==='cancelled'||error?.inventoryCode==='timeout')throw error;summary.databaseEnumerationStatus='failed';failed();}
      }
      assert();
      const cache=options.cacheStorage;
      if(cache&&typeof cache.keys==='function'&&typeof cache.match==='function'){
        let names;
        try{names=await wait(cache.keys());assert();if(!Array.isArray(names))throw stop('storage-read');}
        catch(error){if(error?.inventoryCode==='cancelled'||error?.inventoryCode==='timeout')throw error;summary.cacheEnumeration='failed';summary.cacheLookupStatus='failed';failed();}
        if(names){
          const eligible=names.filter(name=>typeof name==='string'&&name.startsWith('utacheck-'));
          summary.cacheNames=Math.min(eligible.length,MAX_STATE);summary.cacheEnumeration='partial';summary.cacheLookupStatus='read';
          if(eligible.length>MAX_STATE)limited();
          // Fixed current-scope assets and validated endpoints are the only
          // permitted lookups. No cache opening or unknown-entry enumeration.
          const lookupsByURL=new Map([['./index.html',null],['./setlist.json',null]]);
          for(const value of endpoints){
            lookupsByURL.set(value.pinnedUrl||value.url,{id:value.id});
            lookupsByURL.set('https://api.github.com/gists/'+value.id,{id:value.id,api:true});
          }
          let lookups=0;
          outer:for(const name of eligible.slice(0,MAX_STATE))for(const [url,locator] of lookupsByURL){
            assert();if(lookups++>=MAX_CLIPS){limited();summary.cacheLookupStatus='partial';break outer;}
            try{const response=await wait(cache.match(url,{cacheName:name,ignoreSearch:true}));assert();if(!response)continue;
              summary.cachedResponses++;if(url==='./index.html')continue;await responseJSON(response,locator);
            }catch(error){if(error?.inventoryCode==='cancelled'||error?.inventoryCode==='timeout')throw error;summary.cacheLookupStatus='partial';failed();}
          }
        }
      }
      assert();summary.status=summary.partial?'partial':'checked';
    }catch(error){
      if(error?.inventoryCode==='cancelled'){cancelled=true;summary.status='cancelled';summary.partial=true;}
      else{if(error?.inventoryCode==='timeout')limited();else failed();summary.status='partial';}
    }
    if(cancelled){records.length=endpoints.length=clips.length=publications.length=0;summary.records=summary.endpoints=summary.publications=0;}
    return {records,summary,endpoints,clips,publications};
  }
  const api=Object.freeze({inspect});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StartupLocalStorageInventory=api;
})(typeof globalThis!=='undefined'?globalThis:this);
