import { loadModels as loadDetector } from './recognition.js';
import { t } from './i18n.js';
import { FACENET_MODEL, similarityTransform, prewhiten, normalizeEmbedding } from './facenet-math.js';
export { FACENET_MODEL as MODEL_VERSION };
let loading, session;
export async function runtimeSmokeTest(onStatus=()=>{}){
  await loadModels(onStatus);
  const input=new ort.Tensor('float32',new Float32Array(160*160*3),[1,160,160,3]);let output;
  try{
    const start=performance.now();output=await session.run({[session.inputNames[0]]:input});
    const vector=normalizeEmbedding(output[session.outputNames[0]].data);
    return {dimension:vector.length,norm:Math.sqrt(vector.reduce((s,v)=>s+v*v,0)),seconds:(performance.now()-start)/1000};
  }finally{input.dispose();if(output)for(const value of Object.values(output))value.dispose();}
}
export async function loadModels(onStatus=()=>{}){
  if(!loading)loading=(async()=>{
    onStatus('FaceNet512 · '+t('loadingModel'));
    await loadDetector(onStatus);
    if(!window.ort) await new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='./vendor/ort/ort.wasm.min.js';
      script.onload=resolve;script.onerror=()=>reject(new Error(t('modelFailed')));document.head.append(script);
    });
    ort.env.wasm.numThreads=1; // Works on GitHub Pages without cross-origin isolation.
    ort.env.wasm.wasmPaths=new URL('./vendor/ort/',location.href).href;
    session=await ort.InferenceSession.create('./models/facenet512.onnx',{executionProviders:['wasm'],graphOptimizationLevel:'all'});
  })().catch(error=>{loading=null;throw error;});
  await loading;
}
function fivePoints(landmarks){
  const center=points=>[points.reduce((s,p)=>s+p.x,0)/points.length,points.reduce((s,p)=>s+p.y,0)/points.length];
  const eyes=[center(landmarks.getLeftEye()),center(landmarks.getRightEye())].sort((a,b)=>a[0]-b[0]);
  const positions=landmarks.positions, mouth=[positions[48],positions[54]].sort((a,b)=>a.x-b.x);
  return [...eyes,[positions[30].x,positions[30].y],...mouth.map(p=>[p.x,p.y])];
}
export async function detectFaces(canvas, importer=false){
  await loadModels();
  const detections=await faceapi.detectAllFaces(canvas,new faceapi.SsdMobilenetv1Options({minConfidence:importer?.7:.8,maxResults:importer?300:10})).withFaceLandmarks();
  const faces=[];
  for(const detection of detections){
    const box=detection.detection.box;
    if(Math.min(box.width,box.height)<(importer?32:96))continue;
    const points=fivePoints(detection.landmarks);
    if(Math.hypot(points[0][0]-points[1][0],points[0][1]-points[1][1])<8)continue;
    const crop=document.createElement('canvas');crop.width=crop.height=160;
    const context=crop.getContext('2d',{willReadFrequently:true});context.fillStyle='#000';context.fillRect(0,0,160,160);
    try{
      context.setTransform(...similarityTransform(points));context.drawImage(canvas,0,0);context.resetTransform();
      const tensor=new ort.Tensor('float32',prewhiten(context.getImageData(0,0,160,160).data),[1,160,160,3]);
      let output;
      try{
        output=await session.run({[session.inputNames[0]]:tensor});
        const descriptor=normalizeEmbedding(output[session.outputNames[0]].data);
        faces.push({descriptor,score:detection.detection.score,box:{x:Math.max(0,box.x/canvas.width),y:Math.max(0,box.y/canvas.height),width:Math.min(1,box.width/canvas.width),height:Math.min(1,box.height/canvas.height)}});
      }finally{tensor.dispose();if(output)for(const value of Object.values(output))value.dispose();}
    }finally{crop.width=crop.height=1;}
  }
  return faces;
}
