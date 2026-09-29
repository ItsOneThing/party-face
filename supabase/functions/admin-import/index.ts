// Online importer: every operation verifies Auth and event ownership. Never log keys, tokens or face data.
const BASE=Deno.env.get('SUPABASE_URL')!, SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DRIVE=Deno.env.get('GOOGLE_DRIVE_API_KEY')||'';
const CREATORS=(Deno.env.get('IMPORT_ADMIN_IDS')||'').split(',').map(x=>x.trim());
const ORIGINS=(Deno.env.get('ALLOWED_ORIGINS')||'').split(',').map(x=>x.trim()).filter(Boolean);
const MODEL='facenet512-onnx-ssd68-align5-prewhiten-l2-v1';
const headers={apikey:SERVICE,'Content-Type':'application/json',...(!SERVICE?.startsWith('sb_secret_')?{Authorization:'Bearer '+SERVICE}:{})};
class Failure extends Error { constructor(public status:number,message:string){super(message);} }
async function cloud(path:string,method='GET',body?:unknown,extra:Record<string,string>={}){
 const res=await fetch(BASE+path,{method,headers:{...headers,...extra},body:body instanceof Uint8Array?body:body===undefined?undefined:JSON.stringify(body)});
 if(!res.ok)throw new Failure(res.status===409?409:503,res.status===409?'活动编号已存在，请重新扫描。':'云端保存失败，请检查数据库和 Storage 配置。');
 const text=await res.text();return text?JSON.parse(text):null;
}
async function drive(path:string,params:Record<string,string>={},resourceKey?:string){
 if(!DRIVE)throw new Failure(503,'请在 Supabase Edge Function Secrets 配置 GOOGLE_DRIVE_API_KEY。');
 const url=new URL('https://www.googleapis.com/drive/v3/'+path);for(const [k,v] of Object.entries({...params,key:DRIVE}))url.searchParams.set(k,v);
 const res=await fetch(url,{headers:resourceKey?{'X-Goog-Drive-Resource-Keys':path.split('/').pop()+'/'+resourceKey}:{}});
 if(!res.ok)throw new Failure(res.status===403?403:400,'Drive 无法读取此文件，请检查公开分享、Drive API 及密钥限制。');return res;
}
const enc=new TextEncoder();
async function hex(data:Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('');}
async function hmac(value:string){const key=await crypto.subtle.importKey('raw',enc.encode(SERVICE),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(value))),v=>v.toString(16).padStart(2,'0')).join('');}
async function ticket(eventId:string,file:Record<string,unknown>,album:string){
 const metadata={id:file.id,name:file.name,modifiedTime:file.modifiedTime,md5Checksum:file.md5Checksum,resourceKey:file.resourceKey,album_path:album};
 const fingerprint=await hex(enc.encode(JSON.stringify(metadata)));
 const value=JSON.stringify({event:eventId,expires:Date.now()+24*3600000,file:{...metadata,fingerprint}});
 return {id:file.id,name:file.name,fingerprint,ticket:{value,signature:await hmac(value)}};
}
async function verifyTicket(value:any,eventId:string){
 if(!value || typeof value.value!=='string' || value.value.length>8000 || typeof value.signature!=='string' || value.signature!==await hmac(value.value))throw new Failure(400,'照片凭据无效，请重新扫描。');
 const data=JSON.parse(value.value);if(data.kind || !data.file || data.event!==eventId || !Number.isFinite(data.expires) || data.expires<Date.now())throw new Failure(400,'照片凭据无效或扫描已过期，请重新扫描。');return data.file;
}
async function folderTicket(event:any,id:string){
 const value=JSON.stringify({kind:'folder',event:event.id,root:event.drive_folder_id,id,expires:Date.now()+24*3600000});
 return {value,signature:await hmac(value)};
}
async function allowedFolder(event:any,id:string,proof:any){
 if(id===event.drive_folder_id)return true;
 if(!proof||typeof proof.value!=='string'||proof.value.length>1000||typeof proof.signature!=='string'||proof.signature!==await hmac(proof.value))return false;
 try{const data=JSON.parse(proof.value);return data.kind==='folder'&&data.event===event.id&&data.root===event.drive_folder_id&&data.id===id&&Number.isFinite(data.expires)&&data.expires>Date.now();}catch{return false;}
}
async function owned(slug:string,actor:string){
 const rows=await cloud('/rest/v1/events?slug=eq.'+slug+'&select=*');if(!rows.length)throw new Failure(404,'活动尚未创建。');const event=rows[0];
 const grants=await cloud('/rest/v1/event_admins?event_id=eq.'+event.id+'&user_id=eq.'+actor+'&select=role');
 if(!grants.some((g:any)=>g.role==='owner'))throw new Failure(403,'只有该活动的负责人可以导入照片或开放活动。');
 if(event.model_version!==MODEL)throw new Failure(409,'旧活动需要先清除旧索引并重建，不能混用识别模型。');return event;
}
async function readBody(req:Request){
 const reader=req.body?.getReader();if(!reader)throw new Failure(400,'请求为空。');let size=0;const chunks=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4*1024*1024){await reader.cancel();throw new Failure(413,'请求过大，请减少本张照片的人脸数量。');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new Failure(400,'请求格式错误。');}
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'',allowed=ORIGINS.includes(origin);
 const cors={'Vary':'Origin','Cache-Control':'no-store',...(allowed?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST, OPTIONS'}:{})};
 const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
 if(origin&&!allowed)return reply(403,{error:'网站地址未获允许。'});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return reply(405,{error:'请使用 POST。'});
 try{
  if(!BASE||!SERVICE||!ORIGINS.length)throw new Failure(503,'导入接口尚未配置。');
  const authorization=req.headers.get('authorization')||'';
  if(!/^Bearer [A-Za-z0-9_.-]{20,8192}$/.test(authorization))throw new Failure(401,'请先登录管理账号。');
  const auth=await fetch(BASE+'/auth/v1/user',{headers:{apikey:SERVICE,Authorization:authorization}});
  if(!auth.ok)throw new Failure(401,'登录已失效，请重新登录。');const user=await auth.json();
  if(!user.id||user.is_anonymous||!user.email_confirmed_at)throw new Failure(401,'请使用已确认邮箱的管理员账号。');
  if(!req.headers.get('content-type')?.includes('application/json'))throw new Failure(415,'请求格式错误。');
  const input=await readBody(req);
  if(!input||!['config','prepare','list','image','save','open'].includes(input.action))throw new Failure(400,'导入操作无效。');
  if(input.action==='config')return reply(200,{configured:!!DRIVE,canCreate:CREATORS.includes(user.id)});
  if(typeof input.slug!=='string'||!/^[a-z0-9][a-z0-9-]{1,63}$/.test(input.slug))throw new Failure(400,'活动编号无效。');
  if(input.action==='prepare'){
   const folder=String(input.folder||'').match(/(?:\/folders\/)?([A-Za-z0-9_-]{10,100})(?:[?/#]|$)/)?.[1];
   if(!folder||typeof input.title!=='string'||!input.title.trim()||input.title.length>100||typeof(input.title_it||'')!=='string'||(input.title_it||'').length>100)throw new Failure(400,'请填写有效活动名称和 Drive 文件夹。');
   const existing=await cloud('/rest/v1/events?slug=eq.'+input.slug+'&select=id');
   let event;
   if(existing.length){event=await owned(input.slug,user.id);if(event.drive_folder_id!==folder)throw new Failure(409,'活动已使用其他文件夹，请用新的活动编号。');}
   else{
    if(!CREATORS.includes(user.id))throw new Failure(403,'你可导入已有的负责人活动；创建新活动需配置 Supabase 的 IMPORT_ADMIN_IDS。');
    const root=await(await drive('files/'+folder,{fields:'mimeType'})).json();if(root.mimeType!=='application/vnd.google-apps.folder')throw new Failure(400,'请选择 Drive 文件夹。');
    event=(await cloud('/rest/v1/events','POST',{slug:input.slug,title:input.title.trim(),title_it:input.title_it||null,drive_folder_id:folder,model_version:MODEL,threshold:.75,token_hash:await hex(crypto.getRandomValues(new Uint8Array(32)))},{Prefer:'return=representation'}))[0];
    try{await cloud('/rest/v1/event_admins','POST',{event_id:event.id,user_id:user.id,role:'owner'});}catch(error){await cloud('/rest/v1/events?id=eq.'+event.id,'DELETE');throw error;}
   }
   await cloud('/rest/v1/events?id=eq.'+event.id,'PATCH',{title:input.title.trim(),title_it:input.title_it||null});
   const checkpoints=[];let offset=0;
   while(true){const page=await cloud('/rest/v1/photos?event_id=eq.'+event.id+'&select=drive_file_id,fingerprint,model_version,face_indexed&order=id&limit=1000&offset='+offset);checkpoints.push(...page);if(page.length<1000)break;offset+=1000;if(offset>10000)throw new Failure(400,'活动照片过多，请拆分活动。');}
   return reply(200,{root:folder,checkpoints,active:event.active});
  }
  const event=await owned(input.slug,user.id);
  if(input.action==='list'){
   // Public Drive reads can omit parents. Trust only children returned by a verified listing,
   // with signed event/root-scoped credentials, rather than inferring ancestry from metadata.
   if(typeof input.parent!=='string'||!/^[A-Za-z0-9_-]{10,100}$/.test(input.parent)||!await allowedFolder(event,input.parent,input.folder_ticket))throw new Failure(403,'文件夹扫描凭据无效或已过期，请重新扫描活动。');
   const album=String(input.album||'');if(album.length>1000||String(input.page||'').length>2000)throw new Failure(400,'相册参数无效。');
   const data=await(await drive('files',{q:"'"+input.parent+"' in parents and trashed = false",pageSize:'100',fields:'nextPageToken,files(id,name,mimeType,modifiedTime,md5Checksum,resourceKey,size)',orderBy:'name',...(input.page?{pageToken:input.page}:{})})).json();
   const folders=[],photos=[],warnings=[];
   for(const file of data.files||[]){
    if(file.mimeType==='application/vnd.google-apps.folder')folders.push({id:file.id,name:file.name,ticket:await folderTicket(event,file.id)});
    else if(['image/jpeg','image/png','image/webp'].includes(file.mimeType)){
     if(Number(file.size||0)>25*1024*1024)warnings.push(file.name+' 超过在线导入 25 MB 上限，请缩小后重试。');else photos.push(await ticket(event.id,file,album));
    }else warnings.push(file.name+' 不是支持的图片格式，已跳过。');
   }return reply(200,{folders,photos,warnings,page:data.nextPageToken||null});
  }
  if(input.action==='open'){
   if(typeof input.active!=='boolean')throw new Failure(400,'活动状态无效。');
   if(!input.active){await cloud('/rest/v1/events?id=eq.'+event.id,'PATCH',{active:false});return reply(200,{active:false});}
   const photos=await cloud('/rest/v1/photos?event_id=eq.'+event.id+'&select=id&limit=1');if(!photos.length)throw new Failure(400,'请先成功导入照片。');
   const key=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
   await cloud('/rest/v1/events?id=eq.'+event.id,'PATCH',{active:true,token_hash:await hex(enc.encode(key))});
   return reply(200,{active:true,key});
  }
  const file=await verifyTicket(input.ticket,event.id);
  if(input.action==='image'){
   const res=await drive('files/'+file.id,{alt:'media'},file.resourceKey);const reader=res.body!.getReader(),chunks=[];let size=0;
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>25*1024*1024){await reader.cancel();throw new Failure(413,'图片超过在线导入 25 MB 上限。');}chunks.push(value);}
   return new Response(new Blob(chunks),{headers:{...cors,'Content-Type':res.headers.get('content-type')||'image/jpeg'}});
  }
  if(input.action==='save'){
   if(typeof input.indexed!=='boolean'||!Array.isArray(input.faces)||input.faces.length>300||(!input.indexed&&input.faces.length)|| (input.indexed&&input.consent!==true))throw new Failure(400,'人脸索引参数或授权确认无效。');
   for(const face of input.faces){
    if(!Array.isArray(face.descriptor)||face.descriptor.length!==512||face.descriptor.some((v:any)=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>2)||Math.abs(Math.sqrt(face.descriptor.reduce((s:number,v:number)=>s+v*v,0))-1)>.01||!['x','y','width','height'].every(k=>typeof face.box?.[k]==='number'&&Number.isFinite(face.box[k])&&face.box[k]>=0&&face.box[k]<=1.1))throw new Failure(400,'人脸特征或坐标无效。');
   }
   if(typeof input.thumbnail!=='string'||input.thumbnail.length>400000||!/^[A-Za-z0-9+/]+={0,2}$/.test(input.thumbnail))throw new Failure(400,'缩略图无效。');
   const thumb=Uint8Array.from(atob(input.thumbnail),v=>v.charCodeAt(0));if(thumb.length>300000||thumb[0]!==255||thumb[1]!==216||thumb[2]!==255)throw new Failure(400,'缩略图必须是小于 300 KB 的 JPEG。');
   const path=event.id+'/'+file.id+'.jpg';
   await cloud('/storage/v1/object/event-thumbnails/'+path,'POST',thumb,{'Content-Type':'image/jpeg','x-upsert':'true'});
   const url='https://drive.google.com/file/d/'+file.id+'/view'+(file.resourceKey?'?resourcekey='+encodeURIComponent(file.resourceKey):'');
   await cloud('/rest/v1/rpc/import_photo','POST',{p_event:event.id,p_file:file.id,p_name:file.name,p_url:url,p_thumbnail:path,p_fingerprint:file.fingerprint,p_model:MODEL,p_faces:input.faces,p_album:file.album_path||'',p_indexed:input.indexed});
   return reply(200,{faces:input.faces.length});
  }
  throw new Failure(400,'导入操作无效。');
 }catch(error){return reply(error instanceof Failure?error.status:503,{error:error instanceof Failure?error.message:'在线导入暂时不可用，请稍后重试。'});}
});
