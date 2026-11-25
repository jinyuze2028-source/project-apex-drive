import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
// Batch authored static parts within their actual moving parent. Each retained mesh has one material.
export function batchParts(group:T.Group) {
  const groups = new Map<T.Material,T.Mesh[]>();
  for(const obj of [...group.children]){
    if(!(obj instanceof T.Mesh)||Array.isArray(obj.material)||obj.userData.action)continue;
    const items=groups.get(obj.material)??[];items.push(obj);groups.set(obj.material,items);
  }
  for(const [material,items] of groups){
    if(items.length<2)continue;
    const sources=items.map(m=>{
      m.updateMatrix();
      const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();
      g.applyMatrix4(m.matrix);g.deleteAttribute('uv1');g.deleteAttribute('tangent');
      return g;
    });
    const joined=mergeGeometries(sources);
    if(joined){
      items.forEach(m=>m.removeFromParent());const mesh=new T.Mesh(joined,material);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
    }
    sources.forEach(g=>g.dispose());
  }
}
