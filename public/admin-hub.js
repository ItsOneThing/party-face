// Online pages never fetch loopback. The importer iframe is loaded only on the exact local server origin.
const $=id=>document.getElementById(id);
const tabs=[$('admin-import-tab'),$('admin-review-tab')];
const panels=[$('admin-import-panel'),$('admin-review-panel')];
let attached=false;
const local=['http://127.0.0.1:8765','http://localhost:8765'].includes(location.origin);
function select(index){
  tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;tab.className=i===index?'primary':'secondary';panels[i].hidden=i!==index;});
  if(index===0&&local&&!attached){attached=true;$('admin-import-frame').src='import.html';$('admin-import-frame').hidden=false;$('admin-import-help').hidden=true;}
}
tabs.forEach((tab,index)=>{
  tab.addEventListener('click',()=>select(index));
  tab.addEventListener('keydown',event=>{let next;
    if(['ArrowLeft','ArrowRight'].includes(event.key))next=1-index;
    else if(event.key==='Home')next=0;else if(event.key==='End')next=1;
    if(next!==undefined){event.preventDefault();select(next);tabs[next].focus();}
  });
});
$('admin-import-status').textContent=local?'本地工具已打开。选择导入照片即可扫描、导入和生成活动链接。':'照片导入在组织者电脑运行。启动本地服务后，从这里打开本地后台。';
if(local&&location.pathname.endsWith('/admin.html'))select(0);
