import {loadModels,detectFaces,runtimeSmokeTest} from './facenet.js';
import {imageFromBlob} from './recognition.js';
import {faceDistance} from './facenet-math.js';
const $=id=>document.getElementById(id);let busy=false;
$('lab-smoke').addEventListener('click',async()=>{
  if(busy)return;busy=true;ready();$('lab-smoke').disabled=true;
  try{
    const result=await runtimeSmokeTest(text=>{$('lab-status').textContent=text;});
    $('lab-status').textContent=`合成输入验证通过：${result.dimension} 维，单位范数 ${result.norm.toFixed(4)}，推理 ${result.seconds.toFixed(2)} 秒。没有使用真实照片。`;
  }catch(error){$('lab-status').textContent='运行验证失败：'+error.message;}
  finally{busy=false;ready();$('lab-smoke').disabled=false;}
});
function ready(){$('lab-run').disabled=busy||!$('lab-consent').checked||!$('lab-selfie').files.length||!$('lab-photos').files.length;}
for(const id of ['lab-consent','lab-selfie','lab-photos'])$(id).addEventListener('change',ready);
async function faces(file,importer){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024)throw new Error('请选择不超过 20 MB 的 JPG、PNG 或 WebP');
  let canvas;try{canvas=await imageFromBlob(file,2400);return await detectFaces(canvas,importer);}finally{if(canvas)canvas.width=canvas.height=1;}
}
$('lab-run').addEventListener('click',async()=>{
  if(busy||$('lab-run').disabled)return;
  busy=true;ready();for(const id of ['lab-consent','lab-selfie','lab-photos'])$(id).disabled=true;
  $('lab-smoke').disabled=true;
  $('lab-results').textContent='';const setStatus=text=>{$('lab-status').textContent=text;};
  try{
    await loadModels(setStatus);setStatus('正在分析参考自拍…');
    const reference=await faces($('lab-selfie').files[0],false);
    if(reference.length!==1)throw new Error('参考自拍需要恰好一张清晰且足够大的人脸，请裁剪后重试。');
    for(const file of $('lab-photos').files){
      setStatus('正在分析：'+file.name);
      try{
        const start=performance.now(), candidates=await faces(file,true);
        const distance=candidates.length?Math.min(...candidates.map(face=>faceDistance(reference[0].descriptor,face.descriptor))):null;
        const result=distance===null?'未检测到可用人脸':`最近距离 ${distance.toFixed(4)} · ${distance<=.75?'候选匹配':'未达到起始阈值'}`;
        $('lab-results').textContent+=`${file.name}：${candidates.length} 张可用人脸 · ${result} · ${((performance.now()-start)/1000).toFixed(1)} 秒\n`;
      }catch(error){$('lab-results').textContent+=`${file.name}：${error.message}\n`;}
    }
    setStatus('测试完成。请核对正确和错误照片；本页没有上传人脸特征。');
  }catch(error){setStatus('测试未完成：'+error.message+'。模型资源缺失时先运行 tools/download_facenet.py。');}
  finally{busy=false;for(const id of ['lab-consent','lab-selfie','lab-photos'])$(id).disabled=false;$('lab-smoke').disabled=false;ready();}
});
