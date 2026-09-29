function showBootError(error){document.getElementById('lab-status').textContent='测试页加载失败：'+(error.message||error);}
window.addEventListener('error',event=>showBootError(event.error||event.message));
window.addEventListener('unhandledrejection',event=>showBootError(event.reason));
import('./model-lab.js').catch(showBootError);
