import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';import vm from 'node:vm';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';
const code=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/admin-import/index.ts',import.meta.url),'utf8'),{mode:'transform'});
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',model='facenet512-onnx-ssd68-align5-prewhiten-l2-v1';
function setup({auth=200,role='owner',drive=200,driveKey='PRIVATE_DRIVE_KEY',legacy=false,exists=true,creator=false,large=false,previewUrl='https://lh3.googleusercontent.com/preview=s220'}={}){
 let handler;const calls=[];const event={id:'event-id',drive_folder_id:'folder123456789',model_version:legacy?'legacy':model,active:false};
 const fetch=async(url,options={})=>{
  url=String(url);
  calls.push({url,options});
  if(url.endsWith('/auth/v1/user'))return Response.json({id:actor,email_confirmed_at:'confirmed'},{status:auth});
  if(url.includes('/rest/v1/event_admins'))return options.method==='POST'?Response.json([]):Response.json(role?[{role}]:[]);
  if(url.includes('/rest/v1/events?'))return options.method==='PATCH'?new Response(null,{status:204}):Response.json(exists?[event]:[]);
  if(url.endsWith('/rest/v1/events'))return Response.json([event]);
  if(url.includes('/rest/v1/photos?'))return Response.json(url.includes('limit=1')&&!url.includes('limit=1000')?[{id:'saved'}]:[]);
  if(url.includes('/rpc/import_photo')||url.includes('/storage/v1/object/'))return Response.json([]);
  if(url.includes('googleusercontent.com'))return new Response(new Uint8Array([255,216,255]),{headers:{'content-type':'image/jpeg'}});
  if(url.includes('googleapis.com')){
   if(drive!==200)return Response.json({error:'private upstream message'},{status:drive});
   if(url.includes('alt=media'))return new Response(new Uint8Array([255,216,255]),{headers:{'content-type':'image/jpeg'}});
   if(url.includes('/files?'))return Response.json({files:[{id:'childfolder1234',name:'Child',mimeType:'application/vnd.google-apps.folder'},{id:'photo123456789',name:'Test.JPG',mimeType:'image/jpeg',md5Checksum:'md5',modifiedTime:'now',size:large?String(40*1024*1024):'100'}]});
   if(url.includes('thumbnailLink'))return Response.json({thumbnailLink:previewUrl});
   return Response.json({mimeType:'application/vnd.google-apps.folder',parents:[]});
  }throw new Error('unexpected request');
 };
 vm.runInNewContext(code,{Deno:{env:{get:n=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_PRIVATE_SERVICE',GOOGLE_DRIVE_API_KEY:driveKey,ALLOWED_ORIGINS:'https://example.github.io',IMPORT_ADMIN_IDS:creator?actor:''})[n]},serve:fn=>handler=fn},fetch,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,Request,Response,URL,Blob,atob,console});
 return {handler,calls};
}
async function invoke(test,input,headers={}){
 const res=await test.handler(new Request('https://test.supabase.co/functions/v1/admin-import',{method:'POST',headers:{origin:'https://example.github.io',authorization:'Bearer '+'x'.repeat(40),'content-type':'application/json',...headers},body:typeof input==='string'?input:JSON.stringify(input)}));
 return {status:res.status,body:res.headers.get('content-type')==='application/json'?await res.json():Array.from(new Uint8Array(await res.arrayBuffer())),headers:res.headers};
}
assert.equal((await invoke(setup({auth:401}),{action:'config'})).status,401);
assert.equal((await invoke(setup(),{action:'config'},{origin:'https://evil.invalid'})).status,403);
assert.equal((await invoke(setup(),{action:'config'},{authorization:''})).status,401);
assert.equal((await invoke(setup(),{action:'config'})).body.configured,true);
assert.equal((await invoke(setup({driveKey:''}),{action:'config'})).body.configured,false);
const input={action:'list',slug:'test-event',parent:'folder123456789',actor:'forged',role:'owner'};
for(const role of ['editor',null])assert.equal((await invoke(setup({role}),input)).status,403);
assert.equal((await invoke(setup({legacy:true}),input)).status,409);
assert.equal((await invoke(setup(),{...input,parent:'anotherfolder123'})).status,403);
const test=setup();let r=await invoke(test,input);assert.equal(r.status,200);assert.equal(r.body.photos.length,1);
assert.ok(test.calls.some(c=>c.url.includes('user_id=eq.'+actor)),'permission uses verified actor');
assert.ok(!JSON.stringify(r.body).includes('PRIVATE_'),'keys never returned');
const photo=r.body.photos[0];assert.equal(photo.ticket.value.includes('event-id'),true);
r=await invoke(test,{action:'image',slug:'test-event',ticket:photo.ticket});assert.equal(r.status,200);assert.deepEqual(r.body,[255,216,255]);
assert.equal((await invoke(test,{action:'image',slug:'test-event',ticket:{...photo.ticket,signature:'forged'}})).status,400);
const face={descriptor:[1,...Array(511).fill(0)],box:{x:0,y:0,width:.5,height:.5}};
const save={action:'save',slug:'test-event',ticket:photo.ticket,faces:[face],indexed:true,consent:true,thumbnail:'/9j/AA=='};
assert.equal((await invoke(test,{...save,consent:false})).status,400);
assert.equal((await invoke(test,{...save,faces:[{...face,descriptor:[1]}]})).status,400);
assert.equal((await invoke(test,{...save,thumbnail:btoa('invalid')})).status,400);
assert.equal((await invoke(test,save)).status,200);
const rpc=test.calls.find(c=>c.url.includes('/rpc/import_photo'));assert.equal(JSON.parse(rpc.options.body).p_model,model);assert.equal(JSON.parse(rpc.options.body).p_file,'photo123456789');
assert.equal((await invoke(test,{...save,indexed:false,faces:[],consent:false})).status,200,'browse-only saves no biometric data');
const prepare={action:'prepare',slug:'test-event',folder:'https://drive.google.com/drive/folders/folder123456789',title:'Test'};
assert.equal((await invoke(setup({exists:false}),prepare)).status,403,'creation needs explicit creator assignment');
assert.equal((await invoke(setup({exists:false,creator:true}),prepare)).status,200);
assert.equal((await invoke(setup(),prepare)).status,200);
r=await invoke(setup({drive:403}),input);assert.equal(r.status,403);assert.ok(!JSON.stringify(r.body).includes('private upstream'));
r=await invoke(test,{action:'open',slug:'test-event',active:true});assert.equal(r.status,200);assert.equal(r.body.key.length,64);
assert.equal((await invoke(setup({role:'editor'}),{action:'open',slug:'test-event',active:true})).status,403);
assert.equal((await invoke(test,'x'.repeat(4*1024*1024+1))).status,413);
console.log('Online importer Edge passed: verified auth/owner, creator allowlist, folder scope, signed tickets, model/consent/thumbnail validation, private keys, browse-only import, publishing and bounded bodies.');

// Folder proofs are issued only from an authorized listing.
const scopeTest=setup();const rootListing=await invoke(scopeTest,input);
const child=rootListing.body.folders[0];
assert.ok(child.ticket);
const childInput={...input,parent:child.id,folder_ticket:child.ticket};
assert.equal((await invoke(scopeTest,childInput)).status,200,'public child with absent parents can be listed using its signed proof');
assert.equal((await invoke(scopeTest,{...childInput,parent:'outsidefolder123'})).status,403,'proof cannot be reused for a different folder');
assert.equal((await invoke(scopeTest,{...childInput,folder_ticket:{...child.ticket,signature:'forged'}})).status,403);
assert.equal((await invoke(scopeTest,{...childInput,folder_ticket:null})).status,403);
assert.equal((await invoke(scopeTest,{action:'image',slug:'test-event',ticket:child.ticket})).status,400,'folder proof cannot be used as an image ticket');
assert.equal(scopeTest.calls.some(c=>c.url.includes('parents,mimeType')),false,'no dependency on unavailable Drive parent metadata');
console.log('Nested folders passed: signed child discovery, missing parents, outside-folder/forged proof rejection and image separation.');

const largeTest=setup({large:true});const largeListing=await invoke(largeTest,input);
assert.equal(largeListing.body.photos.length,1,'large originals remain in scan');
assert.equal(largeListing.body.photos[0].preview,true);
assert.equal(largeListing.body.warnings.length,0);
const largePhoto=largeListing.body.photos[0];
assert.equal((await invoke(largeTest,{action:'image',slug:'test-event',ticket:largePhoto.ticket})).status,200);
assert.ok(largeTest.calls.some(c=>c.url==='https://lh3.googleusercontent.com/preview=s2400'&&c.options.redirect==='error'));
assert.equal(largeTest.calls.some(c=>c.url.includes('alt=media')),false,'large original is not buffered');
for(const previewUrl of ['', 'http://lh3.googleusercontent.com/preview=s220', 'https://evil.invalid/preview', 'https://googleusercontent.com.evil.invalid/a']){
 const t=setup({large:true,previewUrl});const listing=await invoke(t,input);
 assert.equal((await invoke(t,{action:'image',slug:'test-event',ticket:listing.body.photos[0].ticket})).status,400);
 assert.equal(t.calls.some(c=>c.url.startsWith('http://')||c.url.includes('evil.invalid')),false);
}
console.log('Large image import passed: included in scan, fresh Google preview, 2400px request, bounded buffering, no original download and untrusted URL rejection.');
