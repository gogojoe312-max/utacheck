/* Manual, read-only inspection. This module never adopts or stores a candidate. */
(function(root) {
  'use strict';
  const ID = /^[a-f0-9]{5,40}$/i, REV = /^[a-f0-9]{40}$/i;
  const PART = /^utacheck-backup-part-[a-f0-9]{32}-\d{4}\.txt$/;
  const MAX_BYTES = 32 * 1024 * 1024, MAX_TEXT = 20 * 1024 * 1024;
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const fail = code => { const error = new Error(code); error.inspectionCode = code; throw error; };
  const codes = ['cancelled','storage-changed','connection-invalid','connection-unconfirmed','http-401','http-403','http-404','http-429',
    'http-error','network-failed','response-format','response-limit','backup-missing','backup-format',
    'backup-limit','part-missing','part-url','part-integrity','decrypt-failed','saved-key-missing','network-timeout','compression-unavailable','state-format'];
  const safeCode = error => codes.includes(error?.inspectionCode) ? error.inspectionCode : error?.badKey ? 'decrypt-failed' : 'network-failed';
  function counts(state) {
    if (!object(state)) fail('state-format');
    const result = {};
    for (const key of ['shows','songs','rsongs','notes','pubNotes','trash']) {
      if (state[key] !== undefined && !Array.isArray(state[key])) fail('state-format');
      if (state[key]?.some(item=>!object(item))) fail('state-format');
      result[key] = state[key]?.length || 0;
    }
    for(const key of ['songs','rsongs'])for(const song of state[key]||[]){
      if(key==='songs'&&song.L!=null&&(!Number.isSafeInteger(song.L)||song.L<0||!Array.isArray(state.songLib?.[song.L])))fail('state-format');
      const lines=key==='songs'&&song.L!=null?state.songLib[song.L]:song.lines;
      if(!Array.isArray(lines)||lines.some(line=>!object(line)))fail('state-format');
    }
    for (const key of ['memos','staffMemos','draws','recs']) {
      if (state[key] !== undefined && !object(state[key])) fail('state-format');
      result[key] = Object.keys(state[key] || {}).length;
    }
    if(state.plan!==undefined&&!object(state.plan))fail('state-format');
    if (state.plan?.slots !== undefined && (!Array.isArray(state.plan.slots)||state.plan.slots.some(item=>!object(item)))) fail('state-format');
    result.planSlots = state.plan?.slots?.length || 0;
    return result;
  }
  async function decodeBackup(raw,key,context) {
    const limit=MAX_TEXT,check=()=>{if(context.signal?.aborted||!context.isActive())fail('cancelled');};
    check();let body=raw;
    if(raw?.enc){try{body=await context.openJSON(raw,key);}catch(_){check();fail('decrypt-failed');}}
    check();
    if(!object(body)||!body.bk||typeof body.data!=='string')fail('backup-format');
    let bytes;try{bytes=context.base64Decode(body.data);}catch(_){fail('backup-format');}
    if(!ArrayBuffer.isView(bytes)||bytes.BYTES_PER_ELEMENT!==1)fail('backup-format');
    if(bytes.byteLength>limit)fail('backup-limit');
    if(body.z){
      if(typeof DecompressionStream==='undefined')fail('compression-unavailable');
      let reader;
      // Small input chunks also bound a decompressor's output burst before the
      // consumer can enforce its cumulative limit or observe cancellation.
      let compressedOffset=0;
      try{
        const compressed=new ReadableStream({pull(target){check();if(compressedOffset>=bytes.byteLength){target.close();return;}
          const end=Math.min(compressedOffset+1024,bytes.byteLength);target.enqueue(bytes.subarray(compressedOffset,end));compressedOffset=end;},
          cancel(){compressedOffset=bytes.byteLength;}});
        reader=compressed.pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      }
      catch(_){fail('compression-unavailable');}
      const abort=()=>{void reader.cancel().catch(()=>{});};
      context.signal?.addEventListener('abort',abort,{once:true});
      const chunks=[];let total=0;
      try{
        while(true){check();const next=await reader.read();check();if(next.done)break;
          total+=next.value.byteLength;if(total>limit)fail('backup-limit');chunks.push(next.value);}
        bytes=new Uint8Array(total);let offset=0;
        for(const chunk of chunks){check();bytes.set(chunk,offset);offset+=chunk.byteLength;}
      }catch(error){if(error?.inspectionCode)throw error;check();fail('backup-format');}
      finally{context.signal?.removeEventListener('abort',abort);try{await reader.cancel();}catch(_){}try{reader.releaseLock();}catch(_){}}
    }
    check();
    try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch(_){fail('backup-format');}
  }
  function create(options) {
    let busy = false, epoch = 0, controller = null;
    const active = turn => turn === epoch && options.isActive() && !controller?.signal.aborted;
    const assertActive = turn => { if (!active(turn)) fail('cancelled'); };
    function cancel() { epoch++; controller?.abort(); }
    async function run() {
      if (busy || !options.isActive()) return null;
      busy = true; const turn = ++epoch; controller = new AbortController();
      const result = {status:'checking',local:[],ancillary:null,connections:0,candidates:[],limited:false};
      const emit = () => { if (active(turn)) options.onUpdate(JSON.parse(JSON.stringify(result))); };
      let originals = null, timedOut = false;
      try {
        emit();
        const slots = await options.readSlots(); assertActive(turn);
        if(!Array.isArray(slots)||slots.length!==2)fail('connection-unconfirmed');
        originals = slots.map(read => read.status === 'fulfilled' ? JSON.stringify(read.value) : null);
        const connections = [];
        slots.forEach((read,index) => {
          if (read.status !== 'fulfilled') { result.local.push({generation:index,status:'read-failed'}); return; }
          if (read.value === undefined) { result.local.push({generation:index,status:'absent'}); return; }
          try {
            const state = JSON.parse(read.value.txt);
            const local = {generation:index,status:'read',counts:counts(state)};
            result.local.push(local);
            if (state.bkGistId === undefined || state.bkGistId === null || state.bkGistId === '') return;
            const id = state.bkGistId, token = state.ghToken === undefined || state.ghToken === null ? '' : state.ghToken,
              key = state.bkKey === undefined || state.bkKey === null ? '' : state.bkKey;
            if (typeof id !== 'string' || !ID.test(id) || typeof token !== 'string' || token.length > 512
                || /[\r\n]/.test(token) || typeof key !== 'string' || key.length > 4096) { local.connection='invalid'; return; }
            local.connection='present';
            const connection = {id:id.toLowerCase(),token,key};
            if (!connections.some(c => c.id === connection.id && c.token === token && c.key === key)) connections.push(connection);
          } catch (_) { if (!result.local.some(item=>item.generation===index)) result.local.push({generation:index,status:'format-failed'}); }
        });
        result.connections = connections.length;
        if (options.readAncillary) {
          try {
            const value = await options.readAncillary();
            result.ancillary={status:value?.status==='read'?'read':'read-failed'};
            for(const key of ['clips','preserved'])result.ancillary[key]=Number.isSafeInteger(value?.[key])&&value[key]>=0?value[key]:null;
          } catch (_) { result.ancillary={status:'read-failed',clips:null,preserved:null}; }
          assertActive(turn);
        }
        if (!connections.length) result.status = result.local.some(item=>item.connection==='invalid')?'connection-invalid'
          :result.local.some(item=>['read-failed','format-failed'].includes(item.status))?'connection-unconfirmed':'no-existing-connection';
        emit();
        let requestCount = 0;
        async function request(url, token = '') {
          assertActive(turn); if (++requestCount > 80) { result.limited=true; fail('backup-limit'); }
          const timeout = setTimeout(()=>{timedOut=true;controller.abort();},30000);
          try {
            const headers = {Accept:'application/vnd.github+json'};
            if (token) headers.Authorization = 'Bearer ' + token;
            const response = await options.fetch(url,{method:'GET',headers,credentials:'omit',referrerPolicy:'no-referrer',
              cache:'no-store',redirect:'error',signal:controller.signal});
            assertActive(turn);
            if (!response.ok) fail([401,403,404,429].includes(response.status)?'http-'+response.status:'http-error');
            const length = Number(response.headers?.get?.('content-length'));
            if (length > MAX_BYTES) fail('response-limit');
            let text;
            if (response.body?.getReader) {
              const reader = response.body.getReader(), chunks = []; let total = 0;
              try {
                while (true) { const next=await reader.read(); assertActive(turn); if(next.done)break;
                  total+=next.value.byteLength;if(total>MAX_BYTES)fail('response-limit');chunks.push(next.value); }
                const bytes = new Uint8Array(total); let offset=0;
                for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
                text = new TextDecoder().decode(bytes);
              } finally { try { await reader.cancel(); } catch (_) {} }
            } else { text = await response.text(); if(new TextEncoder().encode(text).length>MAX_BYTES)fail('response-limit'); }
            assertActive(turn); return text;
          } catch (error) { if(error?.inspectionCode)throw error; fail(controller.signal.aborted?'cancelled':'network-failed'); }
          finally { clearTimeout(timeout); }
        }
        async function gist(connection,revision) {
          if (!ID.test(connection.id) || (revision && !REV.test(revision))) fail('connection-invalid');
          let value;
          try { value=JSON.parse(await request('https://api.github.com/gists/'+connection.id+(revision?'/'+revision:''),connection.token)); }
          catch(error){if(error?.inspectionCode)throw error;fail('response-format');}
          if (!object(value) || typeof value.id!=='string' || value.id.toLowerCase()!==connection.id || !object(value.files)) fail('response-format');
          return value;
        }
        async function fileText(file,name,connection,revision) {
          if (!object(file)) fail('part-missing');
          if (!file.truncated && typeof file.content==='string') { if(file.content.length>MAX_TEXT)fail('backup-limit');return file.content; }
          let url;try{url=new URL(file.raw_url);}catch(_){fail('part-url');}
          const pieces=url.pathname.split('/').filter(Boolean);
          let filename;try{filename=decodeURIComponent(pieces[4]||'');}catch(_){fail('part-url');}
          if(url.protocol!=='https:'||url.hostname!=='gist.githubusercontent.com'||url.port||url.username||url.password||url.search||url.hash
              ||pieces.length!==5||!/^[A-Za-z0-9_-]+$/.test(pieces[0])||pieces[1].toLowerCase()!==connection.id
              ||pieces[2]!=='raw'||!REV.test(pieces[3])||filename!==name)fail('part-url');
          return request(url.href); // No credential is ever sent to raw file storage.
        }
        async function inspect(connection,revision,metadata,current,ordinal) {
          const candidate={connection:ordinal,current,status:'checking',at:null,counts:null};
          try {
            const fixed=await gist(connection,revision);assertActive(turn);
            const files=fixed.files;
            const name=files['utacheck-backup.json']?'utacheck-backup.json':Object.keys(files).find(n=>/^backup.*\.json$/i.test(n)||/^utacheck.*backup.*\.json$/i.test(n));
            if(!name)fail('backup-missing');
            let text=await fileText(files[name],name,connection,revision), raw;
            try{raw=JSON.parse(text);}catch(_){fail('backup-format');}
            if(raw?.bk===2){
              if(raw.format!=='utacheck-parts'||!Array.isArray(raw.parts)||!raw.parts.length||raw.parts.length>128
                  ||raw.parts.some(p=>!object(p)||!PART.test(p.name))||new Set(raw.parts.map(p=>p.name)).size!==raw.parts.length
                  ||!Number.isSafeInteger(raw.length)||raw.length<=0||!/^[a-f0-9]{64}$/.test(raw.sha256||''))fail('part-integrity');
              if(raw.length>MAX_TEXT||raw.parts.length>24) { result.limited=true;fail('backup-limit'); }
              const chunks=[];let total=0;
              for(const part of raw.parts){const chunk=await fileText(files[part.name],part.name,connection,revision);
                if(chunk.length>900000)fail('part-integrity');total+=chunk.length;if(total>MAX_TEXT)fail('backup-limit');chunks.push(chunk);}
              text=chunks.join('');
              if(text.length!==raw.length||await options.digest(text)!==raw.sha256)fail('part-integrity');
              try{raw=JSON.parse(text);}catch(_){fail('backup-format');}
            }
            if(!object(raw)||(!raw.enc&&(!raw.bk||typeof raw.data!=='string'))
                ||(raw.enc&&['salt','iv','data'].some(key=>typeof raw[key]!=='string')))fail('backup-format');
            if(raw.enc&&!connection.key)fail('saved-key-missing');
            assertActive(turn);
            let unpacked;
            try{unpacked=await options.unpackBackup(raw,connection.key,{signal:controller.signal,isActive:()=>active(turn)});}
            catch(error){if(error?.inspectionCode)throw error;fail('decrypt-failed');}
            assertActive(turn);
            if(!object(unpacked)||unpacked.app!=='utacheck'||!Number.isSafeInteger(unpacked.at)||unpacked.at<=0)fail('backup-format');
            candidate.counts=counts(unpacked.state);candidate.at=unpacked.at;
            const n=candidate.counts;
            candidate.status=['songs','rsongs','notes','pubNotes','trash','memos','staffMemos','draws','recs','planSlots'].some(k=>n[k]>0)?'work-present':'empty';
          } catch(error){candidate.status=safeCode(error);if(['backup-limit','response-limit'].includes(candidate.status))result.limited=true;if(candidate.status==='cancelled')throw error;}
          if(candidate.at===null){const when=Date.parse(metadata);if(Number.isFinite(when)&&when>0)candidate.at=when;}
          result.candidates.push(candidate);emit();return candidate.status==='work-present';
        }
        for(let ordinal=0;ordinal<connections.length;ordinal++){
          const connection=connections[ordinal];assertActive(turn);
          let latest;
          try{latest=await gist(connection,'');}catch(error){result.candidates.push({connection:ordinal,current:true,status:safeCode(error),at:null,counts:null});emit();continue;}
          const sourceHistory=Array.isArray(latest.history)?latest.history:[];
          if(!sourceHistory.length||!REV.test(sourceHistory[0]?.version||'')){result.candidates.push({connection:ordinal,current:true,status:'response-format',at:null,counts:null});continue;}
          const history=sourceHistory.filter(h=>REV.test(h?.version||''));
          const newest=sourceHistory[0].version.toLowerCase();
          if(await inspect(connection,newest,latest.updated_at,true,ordinal))continue;
          const seen=new Set([newest]);
          const previous=history.filter(h=>{const rev=h.version.toLowerCase();if(seen.has(rev))return false;seen.add(rev);return true;}).slice(0,10);
          if(history.length>11)result.limited=true;
          for(const item of previous)await inspect(connection,item.version.toLowerCase(),item.committed_at,false,ordinal);
        }
        assertActive(turn);
        const after=await options.readSlots();assertActive(turn);
        if(originals.some((value,index)=>value!==null&&(after[index]?.status!=='fulfilled'||JSON.stringify(after[index].value)!==value)))fail('storage-changed');
        if(result.connections)result.status='checked';
        emit();return JSON.parse(JSON.stringify(result));
      }catch(error){result.status=timedOut?'network-timeout':safeCode(error);result.candidates=[];
        if(turn===epoch&&options.isActive())options.onUpdate(JSON.parse(JSON.stringify(result)));return {status:result.status};}
      finally{busy=false;controller=null;}
    }
    return Object.freeze({run,cancel,get busy(){return busy;}});
  }
  const api=Object.freeze({create,counts,decodeBackup});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StartupBackupInspection=api;
})(typeof globalThis!=='undefined'?globalThis:this);
