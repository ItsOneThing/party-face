import { t } from './i18n.js';
export const MODEL_VERSION = 'face-api-0.22.2-ssd-landmark68-descriptor128-v1';
let loading;
export async function loadModels(onStatus = () => {}) {
  if (!loading) loading = (async () => {
    onStatus(t('loadingModel'));
    if (!window.faceapi) await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = './vendor/face-api.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error(t('modelFailed')));
      document.head.append(script);
    });
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri('./models'),
      faceapi.nets.faceLandmark68Net.loadFromUri('./models'),
      faceapi.nets.faceRecognitionNet.loadFromUri('./models'),
    ]);
  })().catch(error => { loading = null; throw error; });
  await loading;
}
export async function imageFromBlob(blob, maxSide = 1600) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image(); img.src = url; await img.decode();
    if (img.naturalWidth * img.naturalHeight > 60000000) throw new Error(t('hugeImage'));
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } catch (error) {
    if (error.message === t('hugeImage')) throw error;
    throw new Error(t('decodeFailed'));
  } finally { URL.revokeObjectURL(url); }
}
export async function detectFaces(canvas, importer = false) {
  const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.45, maxResults: importer ? 300 : 10 });
  const detections = await faceapi.detectAllFaces(canvas, options).withFaceLandmarks().withFaceDescriptors();
  return detections.map(d => ({
    descriptor: Array.from(d.descriptor),
    box: { x: Math.max(0, d.detection.box.x / canvas.width), y: Math.max(0, d.detection.box.y / canvas.height),
      width: Math.min(1, d.detection.box.width / canvas.width), height: Math.min(1, d.detection.box.height / canvas.height) },
    score: d.detection.score,
  }));
}
