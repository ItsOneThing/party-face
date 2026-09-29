import assert from 'node:assert/strict';
import {TEMPLATE,similarityTransform,prewhiten,normalizeEmbedding,faceDistance} from '../public/facenet-math.js';
const identity=similarityTransform(TEMPLATE);
for(let i=0;i<6;i++)assert.ok(Math.abs(identity[i]-[1,0,0,1,0,0][i])<1e-8);
const theta=.4, scale=1.6, x=21,y=-8;
const transformed=TEMPLATE.map(([u,v])=>[scale*(Math.cos(theta)*u-Math.sin(theta)*v)+x,scale*(Math.sin(theta)*u+Math.cos(theta)*v)+y]);
const [a,b,c,d,tx,ty]=similarityTransform(transformed);
for(let i=0;i<5;i++){const [u,v]=transformed[i];assert.ok(Math.hypot(a*u+c*v+tx-TEMPLATE[i][0],b*u+d*v+ty-TEMPLATE[i][1])<1e-6);}
assert.throws(()=>similarityTransform(Array(5).fill([0,0])));
const pixels=Uint8ClampedArray.from([1,2,3,255,4,5,6,255]), tensor=prewhiten(pixels);
assert.equal(tensor.length,6);assert.ok(Math.abs(Array.from(tensor).reduce((s,v)=>s+v,0))<1e-6);
assert.ok(Math.abs(Array.from(tensor).reduce((s,v)=>s+v*v,0)/6-1)<1e-6);
assert.deepEqual(Array.from(prewhiten(new Uint8ClampedArray(16))),Array(12).fill(0));
const vector=normalizeEmbedding(Array(512).fill(2));assert.ok(Math.abs(vector.reduce((s,v)=>s+v*v,0)-1)<1e-6);
assert.equal(faceDistance(vector,vector),0);assert.throws(()=>normalizeEmbedding(Array(512).fill(0)));
console.log('FaceNet pipeline math passed: alignment with rotation/scale/translation, RGB standardization and unit embeddings.');
