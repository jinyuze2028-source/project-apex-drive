import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

export const rallyMetal=(color:number,roughness=.39)=>new T.MeshStandardMaterial({color,roughness,metalness:.72});
export const rallyMat=(color:number,roughness=.66)=>new T.MeshStandardMaterial({color,roughness,metalness:.04});
export const rallyLit=(color:number)=>new T.MeshStandardMaterial({color,roughness:.22,metalness:.22,emissive:color,emissiveIntensity:.04});

export function part(parent:T.Object3D,geometry:T.BufferGeometry,material:T.Material,x=0,y=0,z=0){
  const mesh=new T.Mesh(geometry,material);
  mesh.position.set(x,y,z);
  mesh.castShadow=mesh.receiveShadow=true;
  parent.add(mesh);
  return mesh;
}
export const bevel=(x:number,y:number,z:number,r:number)=>new RoundedBoxGeometry(x,y,z,2,r);
export function tube(parent:T.Object3D,points:number[][],radius:number,material:T.Material,closed=false){
  const path=new T.CatmullRomCurve3(points.map(([x,y,z])=>new T.Vector3(x,y,z)),closed,'centripetal');
  return part(parent,new T.TubeGeometry(path,Math.max(12,points.length*8),radius,10,closed),material);
}
