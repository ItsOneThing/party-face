// Same-origin online importer is attached only after administrator login.
const $=id=>document.getElementById(id);
const tabs=[$('admin-import-tab'),$('admin-review-tab')];
const panels=[$('admin-import-panel'),$('admin-review-panel')];
let attached=false;
function select(index){
  if(!window.PARTY_ADMIN_TRANSPORT?.ready())return;
  tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;tab.className=i===index?'primary':'secondary';panels[i].hidden=i!==index;});
  if(index===0&&!attached){attached=true;$('admin-import-frame').src='cloud-import.html';$('admin-import-frame').hidden=false;}
}
tabs.forEach((tab,index)=>{
  tab.addEventListener('click',()=>select(index));
  tab.addEventListener('keydown',event=>{let next;
    if(['ArrowLeft','ArrowRight'].includes(event.key))next=1-index;
    else if(event.key==='Home')next=0;else if(event.key==='End')next=1;
    if(next!==undefined){event.preventDefault();select(next);tabs[next].focus();}
  });
});
window.addEventListener('party-admin-ready',()=>{$('admin-tools').hidden=false;select(0);});
window.addEventListener('party-admin-signout',()=>{
  $('admin-tools').hidden=true;attached=false;
  const frame=$('admin-import-frame');frame.removeAttribute('src');frame.hidden=true;
});
