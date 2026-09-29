import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../public/online-admin.js',import.meta.url),'utf8').replace("import './admin-hub.js';",'').replace("await import('./person-groups-ui.js');",'');
const config={supabaseUrl:'https://test.supabase.co',adminEndpoint:'https://test.supabase.co/functions/v1/admin-groups',supabasePublishableKey:'sb_publishable_TEST'};
async function setup(key=config.supabasePublishableKey,origin='https://itsonething.github.io'){
  const elements=new Map(),calls=[],events=[],timers=new Map();let timer=0,now=1000,refreshCount=0,fail=null,hold=null;
  const el=id=>{if(!elements.has(id))elements.set(id,{value:'',hidden:false,disabled:false,textContent:'',listeners:{},options:[],addEventListener(name,fn){this.listeners[name]=fn;},replaceChildren(...items){this.options=items;},append(item){this.options.push(item);}});return elements.get(id);};
  const fetch=async(url,options)=>{
    calls.push({url,options});
    if(url.includes('grant_type=password'))return Response.json({access_token:'access1',refresh_token:'refresh1',expires_in:120});
    if(url.includes('grant_type=refresh_token')){refreshCount++;return Response.json({access_token:'access2',refresh_token:'refresh2',expires_in:120});}
    if(url.includes('/logout'))return new Response(null,{status:204});
    const body=JSON.parse(options.body);if(body.action==='events')return Response.json([{slug:'event-a',title:'A',role:'editor'},{slug:'event-b',title:'B',role:'owner'}]);
    if(hold)await hold;if(fail)return Response.json({error:'conflict'},{status:fail});return Response.json({revision:'draft'});
  };
  const listeners={},popup={messages:[],postMessage(data,target){this.messages.push({data,target});}},opener={messages:[],postMessage(data,target){this.messages.push({data,target});}};
  const window={opener,open:()=>popup,addEventListener:(name,fn)=>listeners[name]=fn,PARTY_CONFIG:{...config,supabasePublishableKey:key},dispatchEvent:e=>events.push(e.type)};
  await vm.runInNewContext('(async()=>{'+source+'})()',{
    window,location:{origin},document:{getElementById:el},URL,atob,fetch,Event,Option:function(text,value){this.text=text;this.value=value;},
    Date:{now:()=>now},setTimeout:(fn,delay)=>{timers.set(++timer,{fn,delay});return timer;},clearTimeout:id=>timers.delete(id)
  });
  return {el,window,calls,events,timers,listeners,popup,opener,advance:ms=>now+=ms,refreshes:()=>refreshCount,setFail:code=>fail=code,setHold:promise=>hold=promise};
}
for(const key of ['', 'sb_secret_FORBIDDEN', 'eyJ.'+btoa(JSON.stringify({role:'service_role'}))+'.fake']){
  const t=await setup(key);assert.equal(t.el('admin-submit').disabled,true);assert.equal(t.calls.length,0);
}
const t=await setup();assert.equal(t.el('admin-submit').disabled,false);
t.el('admin-email').value='admin@example.invalid';t.el('admin-password').value='TEST_PASSWORD';
await t.el('admin-login-form').listeners.submit({preventDefault(){}});
assert.equal(t.el('admin-password').value,'');assert.equal(t.el('admin-workspace').hidden,false);
assert.equal(t.window.PARTY_ADMIN_TRANSPORT.canPublish('event-a'),false);assert.equal(t.window.PARTY_ADMIN_TRANSPORT.canPublish('event-b'),true);
assert.equal(t.el('group-event').options.length,3);
t.advance(61000);await Promise.all([t.window.PARTY_ADMIN_TRANSPORT.request('/api/groups/load',{slug:'event-a'}),t.window.PARTY_ADMIN_TRANSPORT.request('/api/groups/load',{slug:'event-a'})]);
assert.equal(t.refreshes(),1,'concurrent operations share one rotating refresh request');
assert.equal(t.calls.at(-1).options.headers.Authorization,'Bearer access2');
t.setFail(409);await assert.rejects(()=>t.window.PARTY_ADMIN_TRANSPORT.request('/api/groups/save',{}),/conflict/);assert.equal(t.window.PARTY_ADMIN_TRANSPORT.ready(),true,'conflict does not remove local session/editing state');
t.setFail(null);let resume;t.setHold(new Promise(resolve=>resume=resolve));
const pending=t.window.PARTY_ADMIN_TRANSPORT.request('/api/groups/load',{});await new Promise(resolve=>setImmediate(resolve));
await t.el('admin-signout').listeners.click();resume();await assert.rejects(()=>pending,/已退出/);
assert.equal(t.window.PARTY_ADMIN_TRANSPORT.ready(),false);assert.equal(t.el('admin-workspace').hidden,true);
assert.ok(t.events.includes('party-admin-signout'));
assert.equal(t.timers.size,0);
console.log('Admin auth passed: public-key checks, password clearing, role UI, memory session, single refresh, conflict retention and sign-out invalidation of in-flight results.');

