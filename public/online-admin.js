import './admin-hub.js';
// Session is kept in memory only. Reload/sign-out removes it; refresh rotates the token while this page stays open.
const $=id=>document.getElementById(id), config=window.PARTY_CONFIG || {};
let session=null, epoch=0, refreshPromise=null, expiryTimer=null;
const activities=new Map();
const authStatus=text=>{$('admin-auth-status').textContent=text;};
function configure(){
  const base=new URL(config.supabaseUrl), endpoint=new URL(config.adminEndpoint);
  if (base.protocol!=='https:' || !base.hostname.endsWith('.supabase.co') || endpoint.origin!==base.origin || endpoint.pathname!=='/functions/v1/admin-groups') throw new Error('管理接口配置无效。');
  const key=config.supabasePublishableKey;
  if(typeof key!=='string' || (!key.startsWith('sb_publishable_') && !key.startsWith('eyJ')) || key.startsWith('sb_secret_')) throw new Error('请在 config.js 填写 Supabase 的公开 Publishable / anon key，不能填写 Secret / service_role key。');
  if(key.startsWith('eyJ')){try{const claims=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(claims.role!=='anon')throw new Error();}catch{throw new Error('这里只能使用公开 anon key。');}}
}
function clearSession(message='已退出，本页活动数据已清空。'){
  epoch++;session=null;refreshPromise=null;clearTimeout(expiryTimer);activities.clear();
  $('admin-workspace').hidden=true;$('admin-login').hidden=false;$('admin-signout').hidden=true;
  $('admin-password').value='';$('group-event').replaceChildren();
  window.dispatchEvent(new Event('party-admin-signout'));authStatus(message);
}
function installSession(data){
  if(!data.access_token || !data.refresh_token || !data.expires_in)throw new Error('登录响应无效。');
  session={...data,expiresAt:Date.now()+data.expires_in*1000};
  clearTimeout(expiryTimer);expiryTimer=setTimeout(()=>clearSession('登录已过期，请重新登录。'),data.expires_in*1000);
}
async function authRequest(path,body){
  const response=await fetch(config.supabaseUrl+path,{method:'POST',headers:{apikey:config.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
  if(!response.ok)throw new Error(response.status===429?'登录请求过多，请稍后再试。':'登录失败，请检查邮箱、密码和 Supabase Auth 配置。');return response.json();
}
async function token(){
  if(!session)throw new Error('请重新登录。');
  if(Date.now()>session.expiresAt-60000){
    if(!refreshPromise){const generation=epoch;refreshPromise=authRequest('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token}).then(data=>{if(generation!==epoch)throw new Error('已退出。');installSession(data);}).catch(error=>{if(generation===epoch)clearSession('登录已失效，请重新登录。');throw error;}).finally(()=>{if(generation===epoch)refreshPromise=null;});}
    await refreshPromise;
  }
  return session.access_token;
}
async function request(action,payload={}){
  const generation=epoch, access=await token();if(generation!==epoch)throw new Error('已退出。');
  const response=await fetch(config.adminEndpoint,{method:'POST',headers:{Authorization:'Bearer '+access,apikey:config.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({...payload,action}),cache:'no-store'});
  if(generation!==epoch)throw new Error('已退出。');
  const data=await response.json();
  if(response.status===401){clearSession('登录已失效，请重新登录。');throw new Error('请重新登录。');}
  if(!response.ok)throw new Error(data.error||'管理请求失败。');return data;
}
window.PARTY_ADMIN_TRANSPORT={
  request:(path,payload)=>request(path.split('/').pop(),payload),
  ready:()=>!!session,
  canPublish:slug=>activities.get(slug)?.role==='owner',
  generation:()=>epoch,
  setBusy:busy=>{$('admin-signout').disabled=busy;}
};
await import('./person-groups-ui.js');
$('admin-signout').addEventListener('click',async()=>{
  const access=session?.access_token;clearSession();
  if(access)try{await fetch(config.supabaseUrl+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:config.supabasePublishableKey,Authorization:'Bearer '+access}});}catch{/* Local state is already removed; server tokens expire. */}
});
$('admin-login-form').addEventListener('submit',async event=>{
  event.preventDefault();$('admin-submit').disabled=true;authStatus('正在登录…');
  try{
    configure();const password=$('admin-password').value;$('admin-password').value='';
    const data=await authRequest('/auth/v1/token?grant_type=password',{email:$('admin-email').value.trim(),password});
    epoch++;installSession(data);
    const events=await request('events');activities.clear();$('group-event').replaceChildren(new Option('选择活动',''));
    for(const activity of events){activities.set(activity.slug,activity);$('group-event').append(new Option(activity.title+' · '+(activity.role==='owner'?'负责人':'编辑者'),activity.slug));}
    $('admin-workspace').hidden=false;$('admin-login').hidden=true;$('admin-signout').hidden=false;
    authStatus(events.length?'已登录。选择活动后可以读取共享草稿。':'已登录，但没有可管理的 FaceNet512 活动，请让负责人分配权限。');
    window.dispatchEvent(new Event('party-admin-ready'));
  }catch(error){clearSession(error.message);}finally{$('admin-submit').disabled=false;}
});
try{configure();authStatus('使用负责人为你创建的管理员账号登录。');}catch(error){authStatus(error.message);$('admin-submit').disabled=true;}
