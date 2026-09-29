import {readFileSync} from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const source=readFileSync(new URL('../public/admin-hub.js',import.meta.url),'utf8');
function setup(origin,path){
 const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,{hidden:true,src:'',listeners:{},attributes:{},addEventListener(n,fn){this.listeners[n]=fn;},setAttribute(n,v){this.attributes[n]=v;},focus(){this.focused=true;}});return elements.get(id);};
 vm.runInNewContext(source,{document:{getElementById:el},location:{origin,pathname:path}});return el;
}
let el=setup('https://example.github.io','/party-face/online-admin.html');el('admin-import-tab').listeners.click();assert.equal(el('admin-import-panel').hidden,false);assert.equal(el('admin-import-frame').src,'','production must not embed/fetch loopback');
el=setup('http://127.0.0.1:8765','/admin.html');assert.equal(el('admin-import-frame').src,'import.html');assert.equal(el('admin-import-panel').hidden,false);
el('admin-review-tab').listeners.click();assert.equal(el('admin-import-panel').hidden,true);assert.equal(el('admin-review-panel').hidden,false);assert.equal(el('admin-import-frame').src,'import.html','switching does not unload ongoing import');
el('admin-review-tab').listeners.keydown({key:'ArrowLeft',preventDefault(){}});assert.equal(el('admin-import-tab').focused,true);
for(const origin of ['http://127.0.0.1:8000','https://localhost:8765','https://evil.invalid']){el=setup(origin,'/admin.html');el('admin-import-tab').listeners.click();assert.equal(el('admin-import-frame').src,'');}
console.log('Admin hub passed: exact local-origin importer, no production loopback calls, preserved iframe on tab switch and keyboard tabs.');
