// Local review only: never infer a person's identity or a name from their face.
export function validateFace(face){
  if(!face.id||!face.photoId||!Array.isArray(face.descriptor)||face.descriptor.length!==512||face.descriptor.some(v=>!Number.isFinite(v)))throw new Error('Invalid face record');
  const norm=Math.sqrt(face.descriptor.reduce((s,v)=>s+v*v,0));
  if(Math.abs(norm-1)>.01)throw new Error('Feature must be normalized');
}
function distanceBelow(a,b,limit){
  let sum=0;for(let i=0;i<a.length;i++){sum+=(a[i]-b[i])**2;if(sum>limit*limit)return Infinity;}return Math.sqrt(sum);
}
export function addFace(groups,face,{threshold=.65,margin=.08}={}){
  validateFace(face);
  if(!Number.isFinite(threshold)||threshold<.35||threshold>.9||!Number.isFinite(margin)||margin<0)throw new Error('Invalid clustering settings');
  if(groups.some(g=>g.faces.some(f=>f.id===face.id)))throw new Error('Duplicate face');
  const candidates=[];
  for(const group of groups){
    if(group.faces.some(f=>f.photoId===face.photoId))continue;
    let score=0;
    for(const member of group.faces){score=Math.max(score,distanceBelow(face.descriptor,member.descriptor,threshold));if(score>threshold)break;}
    if(score<=threshold)candidates.push({group,score});
  }
  candidates.sort((a,b)=>a.score-b.score);
  // All members must agree; do not grow clusters through chains of weak matches.
  if(candidates.length&&(!candidates[1]||candidates[1].score-candidates[0].score>=margin)){
    candidates[0].group.faces.push(face);candidates[0].group.reviewed=false;return candidates[0].group;
  }
  const group={id:'group-'+face.id,name:'',reviewed:false,faces:[face]};groups.push(group);return group;
}
export function photoIds(group){return [...new Set(group.faces.map(f=>f.photoId))];}
export function mergeGroups(groups,ids){
  const selected=groups.filter(g=>ids.includes(g.id));
  if(selected.length<2||selected.length!==new Set(ids).size)throw new Error('请选择至少两个有效的小组');
  const photos=selected.flatMap(g=>photoIds(g));
  if(new Set(photos).size!==photos.length)throw new Error('同一照片中有不同人脸，不能直接合并这些小组；请先检查是否误分组。');
  const first=selected[0];first.faces=selected.flatMap(g=>g.faces);first.reviewed=false;
  return groups.filter(g=>g===first||!selected.includes(g));
}
export function moveFace(groups,faceId,targetId=null){
  const source=groups.find(g=>g.faces.some(f=>f.id===faceId));
  if(!source)throw new Error('未找到这张人脸');
  const face=source.faces.find(f=>f.id===faceId),target=targetId?groups.find(g=>g.id===targetId):null;
  if(targetId&&!target)throw new Error('目标小组不存在');
  if(target===source)return groups;
  if(target&&target.faces.some(f=>f.photoId===face.photoId))throw new Error('目标小组已有同一照片里的另一张脸，请先检查。');
  if(!target&&source.faces.length===1)return groups;
  source.faces=source.faces.filter(f=>f!==face);source.reviewed=false;
  if(target){target.faces.push(face);target.reviewed=false;}
  else groups.push({id:'group-'+face.id,name:'',reviewed:false,faces:[face]});
  return groups.filter(g=>g.faces.length);
}
