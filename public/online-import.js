import {loadModels,detectFaces,MODEL_VERSION} from './facenet.js';
import {imageFromBlob} from './recognition.js';
const $=id=>document.getElementById(id);
const transport=window.parent!==window?window.parent.PARTY_ADMIN_TRANSPORT:null;
if(!transport?.ready()){location.replace('online-admin.html');throw new Error('请先登录管理后台。');}
const config=window.parent.PARTY_CONFIG, endpoint=new URL('admin-import',config.adminEndpoint).href;
let pending=[],index=0,total=0,saved=0,failed=0,busy=false,stop=false,slug='',available=false,active=false;
function log(text){$('log').textContent+=text+'\n';$('log').scrollTop=$('log').scrollHeight;}
function summary(){ $('summary').textContent=`${total} 张照片 · ${saved} 张已完成 · ${Math.max(0,pending.length-index)} 张待处理${failed?' · '+failed+' 张失败待重试':''}`;}
function setBusy(value){busy=value;transport.setBusy(value);for(const id of ['scan','title','title-it','photo-credit','photo-credit-it','contact-name','slug','folder','load-event','new-event','face-enabled','import','publish','close'])$(id).disabled=value;$('stop').disabled=!value;}
function controls(){setBusy(false);$('import').disabled=index>=pending.length;$('publish').disabled=!available;$('close').disabled=!active;}
async function api(action,payload={},binary=false){
 const generation=transport.generation(),access=await transport.token();
 if(generation!==transport.generation())throw new Error('已退出。');
 const response=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+access,apikey:config.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({action,...payload}),cache:'no-store'});
 if(generation!==transport.generation())throw new Error('已退出。');
 if(!response.ok){let data={};try{data=await response.json();}catch{}throw new Error(data.error||`在线导入失败（HTTP ${response.status}）。`);}
 return binary?response.blob():response.json();
}
$('slug').value=config.defaultEvent||'';
let loadedSlug='';
async function loadEvent(){
 const wanted=$('slug').value.trim();if(!wanted)return;
 const data=await api('details',{slug:wanted});
 $('title').value=data.title;$('title-it').value=data.title_it;
 $('photo-credit').value=data.photo_credit;$('photo-credit-it').value=data.photo_credit_it;
 $('contact-name').value=data.contact_name;
 $('folder').value='https://drive.google.com/drive/folders/'+data.folder;
 loadedSlug=wanted;$('admin-status').textContent='已载入活动资料。修改后点击扫描即可保存。';
}
$('load-event').addEventListener('click',async()=>{try{await loadEvent();}catch(error){$('admin-status').textContent=error.message;}});
$('new-event').addEventListener('click',()=>{
 for(const id of ['title','title-it','photo-credit','photo-credit-it','contact-name','slug','folder'])$(id).value='';
 loadedSlug='';$('face-enabled').checked=false;$('admin-status').textContent='填写新活动资料；人脸索引默认关闭。';$('title').focus();
});
$('slug').addEventListener('change',()=>{
 if(loadedSlug && $('slug').value.trim()!==loadedSlug){
  for(const id of ['title','title-it','photo-credit','photo-credit-it','contact-name','folder'])$(id).value='';
  loadedSlug='';$('face-enabled').checked=false;
  $('admin-status').textContent='活动编号已变化，请载入已有活动或填写新活动资料。';
 }
});
try{
 const data=await api('config');$('scan').disabled=!data.configured;
 $('admin-status').textContent=data.configured?'在线导入已就绪。请选择你负责的活动，或创建新活动。':'在线导入尚未配置 Drive API 密钥，请联系负责人。';
 if(data.configured && $('slug').value)await loadEvent();
}catch(error){$('admin-status').textContent=error.message;}
$('scan').addEventListener('click',async()=>{
 if(busy)return;setBusy(true);$('share').hidden=true;$('import-panel').hidden=true;pending=[];index=0;failed=0;saved=0;available=false;active=false;stop=false;slug=$('slug').value.trim();
 $('admin-status').textContent='正在扫描 Drive 文件夹…';$('log').textContent='';
 try{
  const data=await api('prepare',{slug,title:$('title').value.trim(),title_it:$('title-it').value.trim(),photo_credit:$('photo-credit').value.trim(),photo_credit_it:$('photo-credit-it').value.trim(),contact_name:$('contact-name').value.trim(),folder:$('folder').value});
  const checkpoints=new Map(data.checkpoints.map(p=>[p.drive_file_id,p]));active=data.active;
  const queue=[{id:data.root,album:''}],visited=new Set(),photos=new Map();
  while(queue.length){
   if(stop)throw new Error('扫描已暂停，请重新扫描。');
   const folder=queue.shift();if(visited.has(folder.id))continue;visited.add(folder.id);if(visited.size>1000)throw new Error('子文件夹过多，请拆分活动。');
   let page=null;
   do{
    const listing=await api('list',{slug,parent:folder.id,folder_ticket:folder.ticket,album:folder.album,page});
    for(const f of listing.folders)queue.push({id:f.id,ticket:f.ticket,album:folder.album?folder.album+' / '+f.name:f.name});
    for(const photo of listing.photos)photos.set(photo.id,photo);
    for(const warning of listing.warnings)log(warning);
    if(photos.size>10000)throw new Error('照片过多，请拆分活动。');page=listing.page;
    $('admin-status').textContent=`正在扫描…已找到 ${photos.size} 张照片。`;
   }while(page);
  }
  total=photos.size;
  for(const photo of photos.values()){
   const done=checkpoints.get(photo.id);
   if(done && done.fingerprint===photo.fingerprint && done.model_version===MODEL_VERSION && (!$('face-enabled').checked||done.face_indexed))saved++;
   else pending.push(photo);
  }
  if(!total)throw new Error('未找到照片，请检查 Drive 分享及文件格式。');
  available=saved>0;summary();$('progress').max=Math.max(1,pending.length);$('progress').value=0;$('import-panel').hidden=false;
  $('admin-status').textContent='扫描完成，点击开始导入。已完成且未修改的照片会自动跳过。';
  await transport.refreshActivities?.();
 }catch(error){$('admin-status').textContent=error.message;}finally{stop=false;controls();}
});
$('stop').addEventListener('click',()=>{stop=true;$('stop').disabled=true;log('当前操作完成后暂停。');});
async function thumbnail(canvas){
 const thumb=document.createElement('canvas'),scale=Math.min(1,640/Math.max(canvas.width,canvas.height));thumb.width=Math.max(1,Math.round(canvas.width*scale));thumb.height=Math.max(1,Math.round(canvas.height*scale));thumb.getContext('2d').drawImage(canvas,0,0,thumb.width,thumb.height);
 try{return thumb.toDataURL('image/jpeg',.72).split(',')[1];}finally{thumb.width=thumb.height=1;}
}
$('import').addEventListener('click',async()=>{
 if(busy)return;setBusy(true);stop=false;let successful=0,recognize=$('face-enabled').checked;
 try{
  if(recognize)try{await loadModels(log);}catch(error){recognize=false;log('模型加载失败：'+error.message+'。先导入浏览照片，之后可补建索引。');}
  for(;index<pending.length;index++){
   if(stop)break;const photo=pending[index];let canvas,url;
   log(`[${index+1}/${pending.length}] ${photo.name}${photo.preview?' · 大图使用 Drive 预览，原图保留':''}`);
   try{
    const blob=await api('image',{slug,ticket:photo.ticket},true);canvas=await imageFromBlob(blob,2400);url=URL.createObjectURL(blob);$('import-preview').src=url;$('import-preview').hidden=false;
    let faces=[],indexed=false;
    if(recognize)try{faces=await detectFaces(canvas,true);indexed=true;}catch(error){log('识别失败，保留照片供浏览：'+error.message);}
    await api('save',{slug,ticket:photo.ticket,thumbnail:await thumbnail(canvas),faces,indexed,consent:recognize});saved++;successful++;available=true;
    log(indexed?`✓ 已保存照片和 ${faces.length} 张人脸`:'✓ 已保存照片，未建立人脸索引。');
   }catch(error){failed++;log('✗ '+error.message+'；重新扫描可重试。');}
   finally{if(canvas)canvas.width=canvas.height=1;if(url)URL.revokeObjectURL(url);$('import-preview').hidden=true;$('progress').value=index+1;$('summary').textContent=`${total} 张照片 · ${saved} 张已完成 · ${Math.max(0,pending.length-index-1)} 张待处理${failed?' · '+failed+' 张失败待重试':''}`;}
   await new Promise(resolve=>setTimeout(resolve,50));
  }
  log(stop?'已暂停，可以继续导入。':`本轮完成，成功保存 ${successful} 张。失败项请重新扫描重试。`);
 }catch(error){log(error.message);}finally{controls();}
});
for(const [id,open] of [['publish',true],['close',false]])$(id).addEventListener('click',async()=>{
 if(busy)return;setBusy(true);
 try{
  const data=await api('open',{slug,active:open});active=data.active;$('share').hidden=!active;
  if(active){const link=new URL('./',window.parent.location.href);link.searchParams.set('event',slug);link.hash='key='+data.key;$('share-link').href=link.href;$('share-link').textContent=link.href;}
  log(active?'活动已开放，请先检查分享链接。旧访问码已失效。':'活动查询已关闭，照片和索引保留。');
 }catch(error){log(error.message);}finally{controls();}
});
$('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('share-link').href);log('链接已复制。');}catch{log('请手动复制上方完整链接。');}});
// Keep the form in the parent page flow instead of leaving a tall empty iframe.
if(typeof ResizeObserver!=='undefined' && window.frameElement){
 const main=document.querySelector('main');
 new ResizeObserver(()=>{window.frameElement.style.height=Math.ceil(main.getBoundingClientRect().height)+8+'px';}).observe(main);
}
