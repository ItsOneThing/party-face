import {readFileSync} from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const source=readFileSync(new URL('../public/admin-hub.js',import.meta.url),'utf8');
function setup(origin){
 const elements=new Map(),events={};let logged=false;
 const el=id=>{if(!elements.has(id))elements.set(id,{hidden:true,src:'',listeners:{},attributes:{},addEventListener(n,fn){this.listeners[n]=fn;},setAttribute(n,v){this.attributes[n]=v;},removeAttribute(n){if(n==='src')this.src='';},focus(){this.focused=true;}});return elements.get(id);};
 vm.runInNewContext(source,{document:{getElementById:el},location:{origin},window:{PARTY_ADMIN_TRANSPORT:{ready:()=>logged},addEventListener:(n,fn)=>events[n]=fn}});
 return {el,login(){logged=true;events['party-admin-ready']();},logout(){logged=false;events['party-admin-signout']();}};
}
let t=setup('http://127.0.0.1:8765');t.el('admin-import-tab').listeners.click();assert.equal(t.el('admin-import-frame').src,'','anonymous page does not attach importer');assert.equal(t.el('admin-tools').hidden,true);
t.login();assert.equal(t.el('admin-tools').hidden,false);assert.equal(t.el('admin-import-frame').src,'cloud-import.html');
t.el('admin-review-tab').listeners.click();assert.equal(t.el('admin-import-frame').src,'cloud-import.html','switching preserves importer');
t.el('admin-review-tab').listeners.keydown({key:'ArrowLeft',preventDefault(){}});assert.equal(t.el('admin-import-tab').focused,true);
t.logout();assert.equal(t.el('admin-tools').hidden,true);assert.equal(t.el('admin-import-frame').src,'','signout unloads importer');
for(const origin of ['https://example.github.io','http://127.0.0.1:8000','https://localhost:8765','https://evil.invalid']){
 t=setup(origin);t.login();t.el('admin-import-tab').listeners.click();assert.equal(t.el('admin-import-frame').src,'cloud-import.html','online pages embed the authenticated same-origin importer');
}
console.log('Admin hub passed: login gate, same-origin online importer, preserved import on switching, keyboard tabs and signout unload.');
