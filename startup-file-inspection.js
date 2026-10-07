/* One local file candidate. No storage, network, shared app state or restoration. */
(function(root){
  'use strict';
  const MAX_FILE=32*1024*1024;
  const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
  const codes=['cancelled','file-limit','file-read-failed','backup-format','backup-limit','decrypt-failed',
    'saved-key-missing','compression-unavailable','state-format','password-format'];
  const fail=code=>{const error=new Error(code);error.inspectionCode=code;throw error;};
  const safe=error=>codes.includes(error?.inspectionCode)?error.inspectionCode:'backup-format';
  function create(options){
    let selected=null,busy=false,epoch=0,controller=null;
    const visible=()=>options.isActive();
    function cancel(){epoch++;controller?.abort();selected=null;}
    function select(file){
      cancel();
      if(!visible())return null;
      if(!file||!Number.isSafeInteger(file.size)||file.size<=0||file.size>MAX_FILE){const value={status:'file-limit'};options.onUpdate(value);return value;}
      selected=file;const value={status:'selected',bytes:file.size};options.onUpdate(value);return value;
    }
    async function check(password){
      if(busy||!selected||!visible())return null;
      const file=selected,turn=++epoch;controller=new AbortController();const signal=controller.signal;busy=true;
      const active=()=>turn===epoch&&visible()&&!signal.aborted;
      const assert=()=>{if(!active())fail('cancelled');};
      const emit=value=>{if(active())options.onUpdate(JSON.parse(JSON.stringify(value)));};
      const result={status:'checking',bytes:file.size,at:null,counts:null,backupIdPresent:false,ancillary:null};
      try{
        emit(result);
        if(typeof password!=='string'||password.length>4096)fail('password-format');
        let source;try{source=await options.readFile(file,signal);}catch(_){assert();fail('file-read-failed');}assert();
        const bytes=ArrayBuffer.isView(source)?new Uint8Array(source.buffer,source.byteOffset,source.byteLength)
          :source instanceof ArrayBuffer?new Uint8Array(source):null;
        if(!bytes||bytes.byteLength!==file.size)fail('file-read-failed');
        if(bytes.byteLength>MAX_FILE)fail('file-limit');
        let raw;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch(_){fail('backup-format');}
        if(!object(raw)||(raw.enc!==undefined&&raw.enc!==1)||(!raw.enc&&(raw.bk!==1||typeof raw.data!=='string')))fail('backup-format');
        if(raw.enc){
          const base64=value=>typeof value==='string'&&/^[A-Za-z0-9_+/-]+={0,2}$/.test(value)
            &&value.replace(/=+$/,'').length%4!==1&&(!value.includes('=')||value.length%4===0);
          if(['salt','iv','data'].some(key=>!base64(raw[key]))||raw.salt.length>64||raw.iv.length>64)fail('backup-format');
          try{if(atob(raw.salt.replace(/-/g,'+').replace(/_/g,'/')).length!==16
              ||atob(raw.iv.replace(/-/g,'+').replace(/_/g,'/')).length!==12
              ||Math.floor(raw.data.replace(/=+$/,'').length*3/4)<16)fail('backup-format');}
          catch(_){fail('backup-format');}
        }
        if(raw.enc&&!password)fail('saved-key-missing');
        let packet;
        try{packet=await options.decodeBackup(raw,password,{signal,isActive:active});}
        catch(error){if(error?.inspectionCode)throw error;fail('decrypt-failed');}
        password='';assert();
        if(!object(packet)||packet.app!=='utacheck'||!Number.isSafeInteger(packet.at)||packet.at<=0||packet.at>8640000000000000||!object(packet.state))fail('backup-format');
        result.counts=options.counts(packet.state);result.at=packet.at;
        result.backupIdPresent=typeof packet.state.bkGistId==='string'&&/^[a-f0-9]{5,40}$/i.test(packet.state.bkGistId);
        if(options.readAncillary){
          let value;try{value=await options.readAncillary(Object.keys(packet.state.recs||{}),{signal,isActive:active});}catch(_){value=null;}
          assert();result.ancillary={};
          for(const key of ['total','audio','workbooks','other','unclassified','bytes','matchedRecordings'])
            result.ancillary[key]=Number.isSafeInteger(value?.[key])&&value[key]>=0?value[key]:null;
        }
        assert();result.status='checked';selected=null;emit(result);return JSON.parse(JSON.stringify(result));
      }catch(error){password='';result.status=safe(error);result.counts=null;result.at=null;result.backupIdPresent=false;result.ancillary=null;
        if(turn===epoch&&visible())options.onUpdate(JSON.parse(JSON.stringify(result)));return {status:result.status};}
      finally{password='';busy=false;if(turn===epoch)controller=null;}
    }
    return Object.freeze({select,check,cancel,get busy(){return busy;}});
  }
  const api=Object.freeze({create});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StartupFileInspection=api;
})(typeof globalThis!=='undefined'?globalThis:this);
