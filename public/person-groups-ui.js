import {loadModels,detectFaces} from './facenet.js';
import {imageFromBlob} from './recognition.js';
import {addFace,mergeGroups,moveFace,photoIds,validateFace} from './person-groups.js';
const $=id=>document.getElementById(id);
const online=window.PARTY_ADMIN_TRANSPORT;
let viewGeneration=0;
let groups=[],photos=new Map(),busy=false,stop=false,selected=new Set(),demo=false;
let localSession=null,cloudContext=null,dirty=false,canStop=false;
function cloudStatus(text){$('group-cloud-status').textContent=text;}
function changed(){if(cloudContext){dirty=true;cloudStatus('分组已修改，请保存新草稿后再发布。线上已发布版本不会随本页编辑改变。');}ready();}
async function localApi(path,payload){
  if(online)return online.request(path,payload);
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Local-Session':localSession},body:JSON.stringify(payload)});
  const body=await response.json();if(!response.ok)throw new Error(body.error||'管理请求失败，请检查 005 迁移和本地配置');return body;
}
function node(tag,text='',className=''){const n=document.createElement(tag);n.textContent=text;if(className)n.className=className;return n;}
function button(text,action){const n=node('button',text,'secondary');n.type='button';n.addEventListener('click',action);return n;}
function status(text){$('group-status').textContent=text;}
function ready(){
  if(online)online.setBusy(busy);
  $('group-start').disabled=busy||!$('group-consent').checked||!$('group-files').files.length;
  for(const id of ['group-consent','group-files','group-reset','group-demo','group-event'])$(id).disabled=busy;
  $('group-stop').disabled=!busy||stop||!canStop;
  $('group-load').disabled=busy||!(online?online.ready():localSession)||!$('group-consent').checked||!$('group-event').value.trim();
  $('group-save').disabled=busy||!$('group-consent').checked||!cloudContext||!groups.length||(!dirty&&!!cloudContext.revision);
  $('group-publish').disabled=busy||!$('group-consent').checked||!cloudContext?.revision||dirty||!groups.some(g=>g.reviewed)||(online&&!online.canPublish(cloudContext?.slug));
  $('group-merge').disabled=busy||selected.size<2;
  for(const control of $('group-grid').querySelectorAll('input,button,select'))control.disabled=busy;
}
function release(){
  viewGeneration++;
  if($('group-viewer').open)$('group-viewer').close();$('group-viewer-content').replaceChildren();
  for(const photo of photos.values())if(photo.url.startsWith('blob:'))URL.revokeObjectURL(photo.url);
  photos.clear();groups=[];selected.clear();demo=false;cloudContext=null;dirty=false;
}
function reset(){release();$('group-files').value='';$('group-consent').checked=false;$('group-log').textContent='';$('group-progress').hidden=true;render();ready();status('已清空本页照片、特征和分组。可以开始新的测试。');cloudStatus('本页已清空。Supabase 中已保存的草稿和已发布版本仍保留。');}
function edit(action){try{groups=action();selected.clear();changed();render();}catch(error){status(error.message);}}
function viewer(title){$('group-viewer-title').textContent=title;$('group-viewer-content').replaceChildren();if(!$('group-viewer').open)$('group-viewer').showModal();return $('group-viewer-content');}
function showPhoto(id){
  const photo=photos.get(id),content=viewer(photo.name),image=node('img');image.src=photo.url;image.alt=photo.name;content.append(image);
  if(photo.drive_url){try{const url=new URL(photo.drive_url);if(url.protocol==='https:'&&url.hostname==='drive.google.com'){const link=node('a','去 Google Drive 查看原图');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';content.append(node('p','这里显示活动缩略图。'),link);}}catch{}}
}
function showFace(face){
  const content=viewer('检查检测与对齐 · '+photos.get(face.photoId).name),comparison=node('div','','crop-comparison');
  for(const [label,url] of [['检测到的人脸',face.facePreview],['模型使用的对齐裁剪',face.alignedPreview]]){
    if(!url)continue;
    const figure=node('figure'),img=node('img');img.src=url;img.alt=label;figure.append(img,node('figcaption',label));comparison.append(figure);
  }
  content.append(comparison,node('p',face.alignedPreview?'检查是否截到了正确的人、是否有严重变形或黑边。裁剪正常也不保证侧脸能可靠匹配。':'已导入索引没有保存对齐裁剪；此处展示缩略图中的人脸区域，不能据此判断模型对齐质量。'),button('查看照片',()=>showPhoto(face.photoId)));
}
function groupName(group,index){return group.name||'人物小组 '+(index+1);}
function render(){
  $('group-review').hidden=!photos.size;
  const grid=$('group-grid');grid.replaceChildren();
  $('group-summary').textContent=`${demo?'示意数据 · ':''}${photos.size} 张照片 · ${groups.reduce((n,g)=>n+g.faces.length,0)} 张可用人脸 · ${groups.length} 个人物小组 · ${groups.filter(g=>g.reviewed).length} 组已人工核对`;
  $('group-merge').disabled=selected.size<2;
  groups.forEach((group,index)=>{
    const card=node('article','','person-card'),heading=node('div','','person-heading'),label=node('label'),check=node('input');check.type='checkbox';check.checked=selected.has(group.id);check.setAttribute('aria-label','选择'+groupName(group,index));
    check.addEventListener('change',()=>{check.checked?selected.add(group.id):selected.delete(group.id);$('group-merge').disabled=selected.size<2;});label.append(check);
    const name=node('input');name.type='text';name.value=groupName(group,index);name.maxLength=60;name.setAttribute('aria-label','小组备注名称');name.addEventListener('change',()=>{group.name=name.value.trim();changed();render();});
    heading.append(label,name);card.append(heading,node('p',`${group.faces.length} 张人脸 · ${photoIds(group).length} 张关联照片 · ${group.reviewed?'已人工核对':'待核对'}`,group.reviewed?'reviewed':''));
    const faces=node('div','','person-faces');
    for(const face of group.faces){
      const tile=node('div','','face-tile'),img=node('img');img.src=face.facePreview;img.alt='人脸裁剪：'+photos.get(face.photoId).name;img.loading='lazy';tile.append(img,node('small',photos.get(face.photoId).name),button('检查裁剪',()=>showFace(face)));
      tile.append(button('独立成组',()=>edit(()=>moveFace(groups,face.id))));
      const select=node('select');select.setAttribute('aria-label','移动这张人脸到其他小组');const placeholder=node('option','移动到其他组…');placeholder.value='';select.append(placeholder);
      groups.forEach((target,i)=>{if(target===group)return;const option=node('option',groupName(target,i));option.value=target.id;select.append(option);});
      select.addEventListener('change',()=>{if(select.value)edit(()=>moveFace(groups,face.id,select.value));});tile.append(select);faces.append(tile);
    }
    const actions=node('div','','group-actions');actions.append(button(group.reviewed?'撤销已核对标记':'确认这一组是同一个人',()=>{group.reviewed=!group.reviewed;changed();render();}),button('查看关联照片',()=>{
      const content=viewer(groupName(group,index)+' · 关联照片'),links=node('div','','photo-links');
      for(const id of photoIds(group))links.append(button(photos.get(id).name,()=>showPhoto(id)));content.append(links);
    }));card.append(faces,actions);grid.append(card);
  });
  const unmatched=$('group-unmatched');unmatched.replaceChildren();
  for(const photo of photos.values())if(photo.error||!photo.faceCount)unmatched.append(node('p',photo.name+'：'+(photo.error||'未检测到可用人脸，不能自动归到人物组。')),button('查看照片',()=>showPhoto(photo.id)));
  if(!unmatched.children.length)unmatched.append(node('p','本次已分析照片均检测到可用人脸。'));
  ready();
}
$('group-files').addEventListener('change',ready);$('group-consent').addEventListener('change',ready);$('group-event').addEventListener('input',ready);
$('group-reset').addEventListener('click',reset);
$('group-stop').addEventListener('click',()=>{stop=true;ready();status('将在当前照片处理完成后暂停。本轮已生成的小组会保留。');});
$('group-merge').addEventListener('click',()=>edit(()=>mergeGroups(groups,[...selected])));
$('group-viewer-close').addEventListener('click',()=>$('group-viewer').close());
$('group-viewer').addEventListener('click',event=>{if(event.target===$('group-viewer'))$('group-viewer').close();});
$('group-load').addEventListener('click',async()=>{
  if(busy||$('group-load').disabled)return;
  const slug=$('group-event').value.trim();busy=true;ready();cloudStatus('正在读取活动人脸索引与已保存分组…');
  try{
    const data=await localApi('/api/groups/load',{slug,consent:$('group-consent').checked});
    if(online&&!online.ready())throw new Error('已退出，请重新登录');
    release();const generation=viewGeneration;$('group-log').textContent='';$('group-progress').hidden=true;
    for(const photo of data.photos)photos.set(photo.id,{...photo,faceCount:0});
    const records=new Map();
    for(const face of data.faces){validateFace(face);if(!photos.has(face.photoId))throw new Error('照片与索引不完整，请重新读取');records.set(face.id,face);photos.get(face.photoId).faceCount++;}
    // Crop preview comes from existing private thumbnails; embeddings are not recomputed.
    for(const photo of photos.values()){
      if(!photo.faceCount)continue;let canvas;
      try{
        const response=await fetch(photo.url);if(!response.ok)throw new Error('缩略图加载失败');
        canvas=await imageFromBlob(await response.blob(),640);
        for(const face of records.values())if(face.photoId===photo.id){
          const crop=document.createElement('canvas');crop.width=crop.height=160;
          const b=face.box,x=Math.max(0,b.x*canvas.width),y=Math.max(0,b.y*canvas.height);
          crop.getContext('2d').drawImage(canvas,x,y,Math.max(1,Math.min(b.width*canvas.width,canvas.width-x)),Math.max(1,Math.min(b.height*canvas.height,canvas.height-y)),0,0,160,160);
          face.facePreview=crop.toDataURL('image/jpeg',.8);crop.width=crop.height=1;
        }
      }catch(error){photo.previewError=error.message;for(const face of records.values())if(face.photoId===photo.id)face.facePreview=demoImage('预览失败','#d8dec4');}
      finally{if(canvas)canvas.width=canvas.height=1;}
      await new Promise(resolve=>setTimeout(resolve,0));
      if(generation!==viewGeneration)throw new Error('本页已清空，请重新读取');
    }
    if(generation!==viewGeneration)throw new Error('本页已清空，请重新读取');
    if(data.groups.length)groups=data.groups.map(g=>({...g,faces:g.faces.map(id=>{if(!records.has(id))throw new Error('草稿已过期，请重新读取');return records.get(id);})}));
    else for(const face of records.values()){addFace(groups,face);await new Promise(resolve=>setTimeout(resolve,0));}
    if(generation!==viewGeneration)throw new Error('本页已清空，请重新读取');
    cloudContext={slug,signature:data.signature,revision:data.revision,published:data.published,baseRevision:data.base_revision??data.revision};dirty=!data.revision;
    cloudStatus(data.revision?'已恢复保存的草稿。'+(data.published===data.revision?'这个版本已发布。':'修改后需重新保存；发布草稿后才改变线上查询。'):'已生成新分组，请核对后保存草稿。');
    status('活动索引已读取。裁剪预览来自缩略图，对齐裁剪未保存在旧索引中。');
  }catch(error){cloudStatus('读取失败：'+error.message+'。请检查活动权限、006 迁移和管理服务。');}
  finally{busy=false;render();ready();}
});
$('group-save').addEventListener('click',async()=>{
  if(busy||$('group-save').disabled)return;busy=true;ready();cloudStatus('正在保存分组草稿…');
  try{
    const result=await localApi('/api/groups/save',{slug:cloudContext.slug,consent:$('group-consent').checked,signature:cloudContext.signature,base_revision:cloudContext.baseRevision,groups:groups.map(g=>({name:g.name||'',reviewed:g.reviewed,faces:g.faces.map(f=>f.id)}))});
    cloudContext.revision=result.revision;cloudContext.baseRevision=result.revision;dirty=false;cloudStatus('草稿已保存，可在重新读取活动后恢复。线上已发布版本未改变。');
  }catch(error){cloudStatus('保存失败：'+error.message+'。请检查迁移、网络，或重新读取已变化的索引。');}
  finally{busy=false;ready();}
});
$('group-publish').addEventListener('click',async()=>{
  if(busy||$('group-publish').disabled)return;busy=true;ready();cloudStatus('正在发布已保存、已核对的分组…');
  try{
    const result=await localApi('/api/groups/publish',{slug:cloudContext.slug,consent:$('group-consent').checked,revision:cloudContext.revision,base_published:cloudContext.published});cloudContext.published=result.published;
    cloudStatus('分组已发布。'+(result.active?'部署新版接口后，活动查询使用已核对小组。':'活动尚未开放，需在管理工具另行开放。')+'未核对组不会进入分组查询。');
  }catch(error){cloudStatus('发布失败：'+error.message+'。请检查 006 迁移、权限、网络和索引是否已变化。');}
  finally{busy=false;ready();}
});
$('group-start').addEventListener('click',async()=>{
  if(busy||$('group-start').disabled)return;
  const files=[...$('group-files').files];
  if(files.length>500){status('每轮最多选择 500 张照片。先用少量照片核对分组效果。');return;}
  release();render();busy=true;stop=false;canStop=true;ready();$('group-log').textContent='';
  cloudStatus('这是本机照片实验，不能直接保存到活动。要保存分组，请读取已导入的 FaceNet512 活动。');
  const progress=$('group-progress');progress.hidden=false;progress.max=files.length;progress.value=0;
  let count=0,faceCount=0;
  try{
    await loadModels(status);
    for(let i=0;i<files.length;i++){
      if(stop)break;
      const file=files[i];status(`正在分析 ${i+1}/${files.length}：${file.name}`);
      const photo={id:'photo-'+i,name:file.name,url:URL.createObjectURL(file),faceCount:0};photos.set(photo.id,photo);let canvas;
      try{
        if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024)throw new Error('请选择不超过 20 MB 的 JPG、PNG 或 WebP');
        canvas=await imageFromBlob(file,2400);
        const detected=await detectFaces(canvas,true,true);
        if(faceCount+detected.length>2000)throw new Error('超过本轮 2000 张人脸上限，请分批测试');
        // Only commit a photo after detection succeeds. Corrections happen after processing.
        for(let j=0;j<detected.length;j++){
          addFace(groups,{...detected[j],id:photo.id+'-face-'+j,photoId:photo.id});
          if(j%8===7)await new Promise(resolve=>setTimeout(resolve,0));
        }
        photo.faceCount=detected.length;faceCount+=detected.length;
        $('group-log').textContent+=`${file.name}：${detected.length} 张可用人脸\n`;
      }catch(error){photo.error=error.message;$('group-log').textContent+=`${file.name}：${error.message}\n`;}
      finally{if(canvas)canvas.width=canvas.height=1;count++;progress.value=count;}
      await new Promise(resolve=>setTimeout(resolve,0));
      if(faceCount>=2000)break;
    }
    status(`${stop?'已暂停':'分析结束'}：已分析 ${count}/${files.length} 张照片。${groups.length} 个小组待核对；结果未上传。再次分析会重新分组，替换本轮纠错。`);
  }catch(error){status('分析未完成：'+error.message+'。已完成的结果仍可检查。');}
  finally{busy=false;canStop=false;ready();render();}
});
function demoImage(text,color){return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" rx="20" fill="${color}"/><text x="80" y="80" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="24" fill="#123d31">${text}</text><text x="80" y="126" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#123d31">示意图</text></svg>`);}
$('group-demo').addEventListener('click',()=>{
  if(busy)return;release();demo=true;$('group-log').textContent='';$('group-progress').hidden=true;
  cloudStatus('示例不会写入 Supabase。保存和发布功能仅对读取的活动索引启用。');
  const records=[['a1','p1','人物 A','#b7d9be'],['a2','p2','人物 A','#a4cfb0'],['b1','p3','人物 B','#d8dec4'],['a3','p4','人物 A','#b7d9be']];
  const faces=records.map(([id,photoId,text,color])=>{const url=demoImage(text,color);photos.set(photoId,{id:photoId,name:photoId+'（示意照片）',url,faceCount:1});return {id,photoId,facePreview:url,alignedPreview:url,descriptor:[1,...new Array(511).fill(0)]};});
  groups=[{id:'demo-1',name:'人物 A · 正脸',reviewed:false,faces:[faces[0]]},{id:'demo-2',name:'人物 A · 侧脸',reviewed:false,faces:[faces[1]]},{id:'demo-3',name:'含一张误分的人脸',reviewed:false,faces:[faces[2],faces[3]]}];
  status('纠错界面示例：可合并前两个 A 组，并把第三组里的 A 移到 A 组。这里都是示意图，没有运行真人识别。');render();
});
ready();
if(online){
  window.addEventListener('party-admin-signout',()=>{release();render();ready();cloudStatus('已退出，本页数据已清空。');});
  window.addEventListener('party-admin-ready',ready);
}else fetch('/api/session').then(async response=>{if(!response.ok)throw new Error();const data=await response.json();if(data.configured){localSession=data.session;cloudStatus('本地服务已连接。须先执行 006 迁移，再读取新模型活动；本机需保留该活动访问码。');}else cloudStatus('请先配置本地 .env 和 Supabase；仍可使用纯本机实验。');ready();}).catch(()=>cloudStatus('本地管理服务未连接，仍可使用纯本机实验。'));
