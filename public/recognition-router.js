import * as legacy from './recognition.js';
import { FACENET_MODEL } from './facenet-math.js';
export const imageFromBlob=legacy.imageFromBlob;
export let MODEL_VERSION=legacy.MODEL_VERSION;
let engine=legacy;
export async function selectModel(model){
  if(model===FACENET_MODEL)engine=await import('./facenet.js');
  else if(model===legacy.MODEL_VERSION)engine=legacy;
  else throw new Error('Unknown recognition model');
  MODEL_VERSION=engine.MODEL_VERSION;
}
export const loadModels=(...args)=>engine.loadModels(...args);
export const detectFaces=(...args)=>engine.detectFaces(...args);
