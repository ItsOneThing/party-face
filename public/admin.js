import { loadModels, detectFaces, MODEL_VERSION } from './facenet.js';
import { imageFromBlob } from './recognition.js';
const $ = id => document.getElementById(id);
const parentTransport=window.parent!==window ? window.parent.PARTY_ADMIN_TRANSPORT : null;
if(!parentTransport?.ready()){window.location.replace('admin.html');throw new Error('请先登录管理后台');}
async function authHeaders(){return {Authorization:'Bearer '+await parentTransport.token()};}
let session, pending = [], busy = false, stop = false, index = 0;
let totalPhotos = 0, savedCount = 0, failedCount = 0;
function log(text) { $('log').textContent += text + '\n'; $('log').scrollTop = $('log').scrollHeight; }
function updateSummary(completed = index) {
  $('summary').textContent = `${totalPhotos} 张照片 · ${savedCount} 张已完成 · ${Math.max(0, pending.length - completed)} 张待处理${failedCount ? ` · ${failedCount} 张失败待重试` : ''}`;
}
async function api(path, payload) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Local-Session': session, ...await authHeaders() }, body: JSON.stringify(payload) });
  const body = await response.json(); if (!response.ok) throw new Error(body.error || '导入失败'); return body;
}
function setBusy(value) {
  busy = value;
  for (const id of ['scan', 'title', 'title-it', 'slug', 'folder', 'face-enabled', 'import', 'publish', 'close']) $(id).disabled = value;
  $('stop').disabled = !value;
}
try {
  const response = await fetch('/api/session',{headers:await authHeaders()}); if (!response.ok) throw new Error((await response.json()).error||'无法连接导入服务');
  const data = await response.json(); session = data.session;
  $('admin-status').textContent = data.configured ? '本地配置已就绪。扫描前请确认参与者已获知活动照片的人脸检索用途。' : '请先按照 README 配置 .env 和 Supabase，再重启本地工具。密钥只填本地文件，不要发到聊天或 GitHub。';
  $('scan').disabled = !data.configured;
} catch(error) { $('admin-status').textContent = error.message; }
$('scan').addEventListener('click', async () => {
  if (busy) return; setBusy(true); $('share').hidden = true; $('import-panel').hidden = true;
  $('admin-status').textContent = '正在递归扫描文件夹，较大的相册可能需要等待…';
  try {
    const data = await api('/api/scan', { title: $('title').value, title_it: $('title-it').value, slug: $('slug').value, folder: $('folder').value, recognize: $('face-enabled').checked, model: MODEL_VERSION });
    pending = data.pending; index = 0; $('log').textContent = '';
    totalPhotos = data.total; savedCount = data.skipped; failedCount = 0; updateSummary();
    $('progress').max = Math.max(pending.length, 1); $('progress').value = 0; $('import-panel').hidden = false;
    for (const warning of data.warnings) log(warning);
    $('admin-status').textContent = '扫描完成。活动公开前，请检查样本识别效果和 Drive 下载权限。';
    $('close').dataset.available = data.active ? 'yes' : 'no';
    $('publish').dataset.available = data.skipped ? 'yes' : 'no';
  } catch (error) { $('admin-status').textContent = error.message; }
  finally { setBusy(false); $('import').disabled = pending.length === 0; $('publish').disabled = $('publish').dataset.available !== 'yes'; $('close').disabled = $('close').dataset.available !== 'yes'; }
});
$('stop').addEventListener('click', () => { stop = true; $('stop').disabled = true; log('将在当前照片处理完成后暂停。'); });
$('import').addEventListener('click', async () => {
  if (busy) return; setBusy(true); stop = false; let successful = 0;
  try {
    let recognize = $('face-enabled').checked;
    if (recognize) {
      try { await loadModels(log); }
      catch (error) { recognize = false; log(`识别模型加载失败：${error.message}。继续导入浏览相册，之后可重新扫描补建索引。`); }
    }
    for (; index < pending.length; index++) {
      if (stop) break;
      const photo = pending[index]; let url;
      log(`[${index + 1}/${pending.length}] ${photo.name}`);
      try {
        const response = await fetch('/api/image?id=' + encodeURIComponent(photo.id), { headers: { 'X-Local-Session': session, ...await authHeaders() } });
        if (!response.ok) throw new Error((await response.json()).error);
        const blob = await response.blob(); url = URL.createObjectURL(blob); $('import-preview').src = url; $('import-preview').hidden = false;
        let faces = [], indexed = false;
        if (recognize) {
          let canvas;
          try { canvas = await imageFromBlob(blob, 2400); faces = await detectFaces(canvas, true); indexed = true; }
          catch (error) { log(`本张识别失败：${error.message}。保留照片供浏览，后续扫描可重试。`); }
          finally { if (canvas) canvas.width = canvas.height = 1; }
        }
        await api('/api/save', { id: photo.id, model: MODEL_VERSION, faces, indexed }); successful++; savedCount++;
        $('publish').dataset.available = 'yes'; log(indexed ? `✓ 缩略图已上传，已保存 ${faces.length} 个人脸记录${faces.length ? '' : '（照片仍可浏览，请检查是否漏检）'}` : '✓ 缩略图已上传，人脸索引待补建。');
      } catch (error) { failedCount++; log(`✗ ${error.message}；重新扫描可重试。`); }
      finally { if (url) URL.revokeObjectURL(url); $('import-preview').hidden = true; $('progress').value = index + 1; updateSummary(index + 1); }
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    log(stop ? '已暂停，可以继续导入。' : `本轮结束，成功保存 ${successful} 张。失败项请重新扫描重试。`);
  } catch (error) { log(error.message); }
  finally { setBusy(false); $('import').disabled = index >= pending.length; $('publish').disabled = $('publish').dataset.available !== 'yes'; }
});
for (const [id, active] of [['publish', true], ['close', false]]) $(id).addEventListener('click', async () => {
  if (busy) return; setBusy(true);
  try {
    const data = await api('/api/publish', { active }); $('share').hidden = !active;
    $('share-link').href = data.link; $('share-link').textContent = data.link;
    log(active ? '活动已开放。请先自己打开链接测试，再发到群里。' : '活动查询已关闭。Drive 分享没有改变。');
  } catch (error) { log(error.message); } finally { setBusy(false); }
});
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('share-link').href); log('链接已复制。'); }
  catch { log('无法自动复制，请选中上方链接手动复制。'); }
});
