import {readFileSync} from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const source=readFileSync(new URL('../public/online-import.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'');
const elMap=new Map(),requests=[];let generation=1,configured=true,failImage=true;
const el=id=>{if(!elMap.has(id))elMap.set(id,{value:'',checked:false,disabled:false,hidden:true,textContent:'',listeners:{},addEventListener(n,f){this.listeners[n]=f;}});return elMap.get(id);};
const checkpoint={drive_file_id:'done',fingerprint:'same',model_version:'new-model',face_indexed:false};
const transport={ready:()=>true,generation:()=>generation,token:async()=>'verified-token',setBusy(){},refreshActivities:async()=>{}};
const fetch=async(url,options)=>{
 const body=JSON.parse(options.body);requests.push(body);
 if(body.action==='config')return Response.json({configured});
 if(body.action==='prepare')return Response.json({root:'root',active:false,checkpoints:[checkpoint]});
 if(body.action==='list'&&body.parent==='childfolder'){assert.deepEqual(body.folder_ticket,{value:'signed-child',signature:'proof'});return Response.json({folders:[{id:'childfolder',name:'Child',ticket:{value:'signed-child',signature:'proof'}}],photos:[],warnings:[],page:null});}
 if(body.action==='list')return Response.json({folders:[{id:'childfolder',name:'Child',ticket:{value:'signed-child',signature:'proof'}}],photos:[{id:'done',name:'Done',fingerprint:'same',ticket:{}},{id:'retry',name:'Retry',fingerprint:'new',ticket:{}}],warnings:[],page:null});
 if(body.action==='image')return failImage?Response.json({error:'Drive permission failure'},{status:403}):new Response(new Blob(['image']));
 if(body.action==='save')return Response.json({faces:0});
 if(body.action==='open')return Response.json({active:body.active,key:'new-key'});
 throw new Error('unexpected request');
};
const canvas={width:100,height:100,getContext:()=>({drawImage(){}}),toDataURL:()=>'/ignored,/9j/AA=='};
const context={document:{getElementById:el,createElement:()=>({...canvas})},window:{parent:{PARTY_ADMIN_TRANSPORT:transport,PARTY_CONFIG:{adminEndpoint:'https://test.supabase.co/functions/v1/admin-groups',supabasePublishableKey:'public',defaultEvent:'event-a',defaultTitle:'A',defaultDriveFolder:'folder'},location:{href:'https://example.github.io/party-face/online-admin.html'}}},location:{replace(){throw new Error('redirect');}},fetch,Response,Blob,URL,MODEL_VERSION:'new-model',imageFromBlob:async()=>({...canvas}),loadModels:async()=>{},detectFaces:async()=>[],navigator:{clipboard:{writeText:async()=>{}}},setTimeout:fn=>fn()};
await vm.runInNewContext('(async()=>{'+source+'})()',context);
assert.equal(el('scan').disabled,false);await el('scan').listeners.click();assert.equal(el('import-panel').hidden,false);assert.match(el('summary').textContent,/1 张已完成/);
await el('import').listeners.click();assert.match(el('log').textContent,/Drive permission failure/);assert.equal(el('import').disabled,true);
failImage=false;await el('scan').listeners.click();await el('import').listeners.click();
const save=requests.find(r=>r.action==='save');assert.deepEqual(save.faces,[]);assert.equal(save.indexed,false,'default import never creates biometric data');assert.equal(save.consent,false);
assert.equal(requests.filter(r=>r.action==='image').length,2,'checkpoints are skipped on initial scan and retry');
await el('publish').listeners.click();assert.equal(el('share-link').href,'https://example.github.io/party-face/?event=event-a#key=new-key');
assert.ok(!requests.some(r=>'actor' in r||'role' in r));
console.log('Online importer UI passed: configured login transport, checkpoint skipping, failed-photo rescan, browse-only default and share link routing.');
