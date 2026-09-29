export const FACENET_MODEL = 'facenet512-onnx-ssd68-align5-prewhiten-l2-v1';
export const TEMPLATE = [[38.2946,51.6963],[73.5318,51.5014],[56.0252,71.7366],[41.5493,92.3655],[70.7299,92.2041]].map(p=>p.map(v=>v*160/112));

// Least-squares orientation-preserving similarity transform: source -> canonical crop.
export function similarityTransform(source, target = TEMPLATE) {
  if (source.length !== 5 || source.some(p=>p.length!==2 || p.some(v=>!Number.isFinite(v)))) throw new Error('Invalid landmarks');
  const mean = points=>[0,1].map(i=>points.reduce((s,p)=>s+p[i],0)/points.length);
  const s=mean(source), d=mean(target); let denominator=0, real=0, imaginary=0;
  for(let i=0;i<5;i++){
    const x=source[i][0]-s[0], y=source[i][1]-s[1], u=target[i][0]-d[0], v=target[i][1]-d[1];
    denominator+=x*x+y*y; real+=x*u+y*v; imaginary+=x*v-y*u;
  }
  if(denominator<1e-6) throw new Error('Degenerate landmarks');
  const a=real/denominator,b=imaginary/denominator;
  return [a,b,-b,a,d[0]-a*s[0]+b*s[1],d[1]-b*s[0]-a*s[1]];
}
export function prewhiten(rgba) {
  const size=rgba.length/4*3, data=new Float32Array(size); let sum=0, j=0;
  for(let i=0;i<rgba.length;i+=4) for(let c=0;c<3;c++){data[j++]=rgba[i+c];sum+=rgba[i+c];}
  const mean=sum/size; let variance=0;
  for(const value of data) variance+=(value-mean)**2;
  const std=Math.max(Math.sqrt(variance/size),1e-6);
  for(let i=0;i<size;i++)data[i]=(data[i]-mean)/std;
  return data;
}
export function normalizeEmbedding(values) {
  if(values.length!==512 || Array.from(values).some(v=>!Number.isFinite(v))) throw new Error('Invalid FaceNet output');
  const norm=Math.sqrt(Array.from(values).reduce((s,v)=>s+v*v,0));
  if(norm<1e-8)throw new Error('Empty FaceNet output');
  return Array.from(values,v=>v/norm);
}
export function faceDistance(a,b){if(a.length!==b.length)throw new Error('Model mismatch');return Math.sqrt(a.reduce((sum,v,i)=>sum+(v-b[i])**2,0));}
