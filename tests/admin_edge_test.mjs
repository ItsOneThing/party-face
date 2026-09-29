import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/admin-groups/index.ts',import.meta.url),'utf8'));
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function setup({authStatus=200,error=null,anonymous=false,confirmed=true,broken=false}={}){
  let handler;const calls=[];
  const fetch=async(url,options={})=>{
    calls.push({url,options});if(broken)throw new Error('private backend message');
    if(url.endsWith('/auth/v1/user'))return Response.json({id:actor,is_anonymous:anonymous,email_confirmed_at:confirmed?'2026-01-01':null},{status:authStatus});
    if(url.includes('/rpc/admin_groups')){
      const input=JSON.parse(options.body);
      if(error)return Response.json({code:error,message:'private database details'},{status:400});
      return Response.json(input.p_action==='events'?[{slug:'test-event',role:'editor'}]:{photos:[{id:'photo',name:'A',drive_url:'drive',thumbnail_path:'private/photo'}],faces:[{id:'1',descriptor:[1]}],groups:[]});
    }
    if(url.includes('/object/sign/'))return Response.json([{path:'private/photo',signedURL:'/object/sign/event-thumbnails/photo?token=short'}]);
    throw new Error('unexpected backend');
  };
  vm.runInNewContext(source,{Deno:{env:{get:name=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_SERVER_ONLY',ALLOWED_ORIGINS:'https://example.github.io'})[name]},serve:fn=>{handler=fn;}},fetch,Request,Response,TextDecoder,Uint8Array});
  return {handler,calls};
}
async function invoke(test,input,headers={}){
  const response=await test.handler(new Request('https://test.supabase.co/functions/v1/admin-groups',{method:'POST',headers:{origin:'https://example.github.io',authorization:'Bearer '+ 'x'.repeat(40),'content-type':'application/json',...headers},body:typeof input==='string'?input:JSON.stringify(input)}));
  return {status:response.status,body:await response.json(),headers:response.headers};
}
let test=setup();let result=await invoke(test,{action:'events',actor:'forged',role:'owner'});
assert.equal(result.status,200);
const rpc=JSON.parse(test.calls[1].options.body);assert.equal(rpc.p_actor,actor);assert.equal('role' in rpc.p_payload,false);assert.equal('actor' in rpc.p_payload,false);
assert.equal(test.calls[0].options.headers.Authorization,'Bearer '+'x'.repeat(40),'caller token is verified by Auth server');
assert.equal(test.calls[1].options.headers.apikey,'sb_secret_SERVER_ONLY');
assert.equal('Authorization' in test.calls[1].options.headers,false,'modern secret key is not treated as JWT');
assert.equal(result.headers.get('cache-control'),'no-store');
for(const opts of [{authStatus:401},{anonymous:true},{confirmed:false}]){
  test=setup(opts);assert.equal((await invoke(test,{action:'load',slug:'test-event'})).status,401);assert.equal(test.calls.length,1);
}
for(const [code,status] of [['42501',403],['40001',409],['P0429',429],['P0001',400]]){
  result=await invoke(setup({error:code}),{action:'save',slug:'test-event'});assert.equal(result.status,status);assert.equal(JSON.stringify(result.body).includes('private database'),false);
}
test=setup();assert.equal((await invoke(test,{action:'events'},{authorization:''})).status,401);assert.equal(test.calls.length,0);
test=setup();assert.equal((await invoke(test,{action:'events'},{origin:'https://evil.invalid'})).status,403);assert.equal(test.calls.length,0);
assert.equal((await invoke(setup(),'invalid JSON')).status,400);
assert.equal((await invoke(setup(),{action:'unknown'})).status,400);
assert.equal((await invoke(setup(),{action:'load',slug:'../events'})).status,400);
assert.equal((await invoke(setup(),'x'.repeat(512001))).status,413);
assert.equal((await invoke(setup({broken:true}),{action:'events'})).status,503);
result=await invoke(setup(),{action:'load',slug:'test-event',consent:true});assert.equal(result.status,200);
assert.equal(result.body.photos[0].url,'https://test.supabase.co/storage/v1/object/sign/event-thumbnails/photo?token=short');
assert.equal('thumbnail_path' in result.body.photos[0],false);
assert.equal(JSON.stringify(result.body).includes('SERVER_ONLY'),false);
console.log('Admin Edge passed: Auth verification, actor forgery, permissions, conflicts, budget, CORS, body bounds, no credential/error leakage and private signed previews.');
