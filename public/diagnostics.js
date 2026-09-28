import { loadModels, detectFaces, MODEL_VERSION } from './recognition.js';
document.getElementById('check').addEventListener('click', async () => {
  const button = document.getElementById('check'); const output = document.getElementById('output'); button.disabled = true;
  const log = text => { output.textContent += text + '\n'; };
  output.textContent = ''; const start = performance.now();
  try {
    await loadModels(log); log('模型加载成功：' + MODEL_VERSION);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 640;
    canvas.getContext('2d').fillStyle = '#f5f5ed'; canvas.getContext('2d').fillRect(0, 0, 640, 640);
    const faces = await detectFaces(canvas);
    if (faces.length !== 0) throw new Error('空白图片异常检测到人脸');
    log('空白图片推理通过：0 张人脸。');
    log('加载与推理总耗时：' + ((performance.now() - start) / 1000).toFixed(2) + ' 秒（不代表实际自拍检索速度）。');
  } catch (error) { log('检查失败：' + error.message); }
  finally { button.disabled = false; }
});
