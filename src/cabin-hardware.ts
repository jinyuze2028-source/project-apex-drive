import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {batchParts} from './batch.ts';

const phosphate=new T.MeshStandardMaterial({color:0x555657,metalness:.78,roughness:.46});
const steel=new T.MeshStandardMaterial({color:0xaaa59d,metalness:.86,roughness:.33});
const gasket=new T.MeshStandardMaterial({color:0x232325,metalness:0,roughness:.91});
const recess=new T.MeshStandardMaterial({color:0x242527,roughness:.71,metalness:.31});
const crystal=new T.MeshPhysicalMaterial({color:0xbfd3dc,metalness:.17,roughness:.12,clearcoat:1,transparent:true,opacity:.041,depthWrite:false,forceSinglePass:true});
export function gaugeCrystal(bezel:T.Object3D,r:number){
  const ring=new T.Mesh(new T.TorusGeometry(r*.936,.0015,6,64),phosphate);
  ring.userData.fixedTrim=true;ring.position.z=.017;bezel.add(ring);
  const lens=new T.Mesh(new T.LatheGeometry([new T.Vector2(0,.003),new T.Vector2(r*.57,.0021),new T.Vector2(r*.91,0),new T.Vector2(r*.932,-.0012)],48).rotateX(Math.PI/2),crystal);
  lens.userData.fixedTrim=true;lens.position.z=.0195;lens.renderOrder=3;bezel.add(lens);
}
function bolt(group:T.Group,x:number,y:number,z:number,r:number,hex=false){
  const face=new T.Shape();face.absarc(0,0,r,0,2*Math.PI,false);
  const socket=new T.Path();
  if(hex){
    for(let i=0;i<6;i++){const a=-Math.PI*i/3,dx=r*.48*Math.cos(a),dy=r*.48*Math.sin(a);if(i)socket.lineTo(dx,dy);else socket.moveTo(dx,dy);}
  }else{
    for(const [i,[dx,dy]] of [[-.73,-.12],[-.73,.12],[-.13,.12],[-.13,.70],[.13,.70],[.13,.12],[.73,.12],[.73,-.12],[.13,-.12],[.13,-.70],[-.13,-.70],[-.13,-.12]].entries())if(i)socket.lineTo(dx*r,dy*r);else socket.moveTo(dx*r,dy*r);
  }
  socket.closePath();face.holes.push(socket);
  for(const [geo,mat,depth] of [
    [new T.CylinderGeometry(r*1.25,r*1.25,r*.15,16).rotateX(Math.PI/2),phosphate,-.0005],
    [new T.CircleGeometry(r*.86,16),recess,.0001],
    [new T.ExtrudeGeometry(face,{depth:r*.30,bevelEnabled:false,curveSegments:8}),hex?steel:phosphate,.0002],
  ] as const){
    const mesh=new T.Mesh(geo,mat);mesh.position.set(x,y,z+depth);mesh.rotation.z=x*117+y*38;group.add(mesh);
  }
}
export function wheelHardware(wheel:T.Group){
  for(let i=0;i<6;i++)bolt(wheel,.032*Math.cos(i*Math.PI/3),.032*Math.sin(i*Math.PI/3),.0165,.0035,true);
  // A single batched seam follows the hand-stitched join on the inner leather lip.
  const vertices:T.BufferGeometry[]=[];
  const a=new T.Vector3(),b=new T.Vector3(),along=new T.Vector3(),up=new T.Vector3(0,1,0);
  for(let i=0;i<128;i++){
    const t=i*Math.PI/64;
    for(const direction of [-1,1]){
      a.set(.150*Math.cos(t),.150*Math.sin(t),.0147);
      b.set(.1547*Math.cos(t+.017*direction),.1547*Math.sin(t+.017*direction),.0171);
      along.subVectors(b,a);
      const g=new T.CylinderGeometry(.00064,.00060,along.length(),4,1,true);
      g.applyQuaternion(new T.Quaternion().setFromUnitVectors(up,along.normalize()));a.add(b).multiplyScalar(.5);g.translate(a.x,a.y,a.z);vertices.push(g);
      a.set(.150*Math.cos(t),.150*Math.sin(t),.0147);
    }
  }
  const seam=new T.Mesh(mergeGeometries(vertices),new T.MeshStandardMaterial({color:0x8a7567,roughness:.94}));vertices.forEach(g=>g.dispose());wheel.add(seam);
}
export function panelHardware(panel:T.Group,aux:T.Group,body:T.Group){
  for(const [owner,x,y,z] of [[panel,.155,.052,-.009],[aux,.126,.072,-.001]] as const){
    const mounts=new T.Group();owner.add(mounts);
    for(const side of [-1,1]){
      for(const row of [-1,1])bolt(mounts,side*x,row*y+(owner===aux?-.022:0),z,.0041);
      const angle=new T.Mesh(new T.BoxGeometry(.013,.024,.029),phosphate);
      angle.position.set(side*(x+.002),-y-.008,z-.012);mounts.add(angle);
    }
    for(const piece of mounts.children)piece.userData.fixedTrim=true;
  }
  const trim=body.getObjectByName('part13') as T.Mesh;
  body.updateWorldMatrix(true,true);
  for(const side of [-1,1]){
    const group=new T.Group();body.add(group);
    const ray=new T.Raycaster();
    for(const [z,y] of [[-.47,.565],[.13,.57],[-.37,.37],[.13,.37]]){
      const origin=body.localToWorld(new T.Vector3(0,y,z));ray.set(origin,new T.Vector3(side,0,0));
      const hit=ray.intersectObject(trim,false)[0];if(!hit)continue;
      const p=body.worldToLocal(hit.point);const mount=new T.Group();mount.position.copy(p);mount.position.x-=side*.001;mount.rotation.y=-side*Math.PI/2;group.add(mount);
      bolt(mount,0,0,0,.0045);mount.updateMatrix();
      for(const child of [...mount.children]){child.applyMatrix4(mount.matrix);group.add(child);}group.remove(mount);
    }
    for(const piece of group.children)piece.userData.fixedTrim=true;
  }
  // Weld only for boundary detection; follow the actual 46 windscreen border edges.
  const glass=(body.getObjectByName('windscreen') as T.Mesh).geometry,pos=glass.attributes.position,idx=glass.index!;
  const points:T.Vector3[]=[],ids=new Map<string,number>(),map:number[]=[];
  for(let i=0;i<pos.count;i++){const p=new T.Vector3().fromBufferAttribute(pos,i),key=p.toArray().map(v=>Math.round(v*1e5)).join('/');if(!ids.has(key)){ids.set(key,points.length);points.push(p);}map.push(ids.get(key)!);}
  const edges=new Map<string,{a:number;b:number;count:number}>();
  for(let i=0;i<idx.count;i+=3)for(let j=0;j<3;j++){
    const a=map[idx.getX(i+j)],b=map[idx.getX(i+(j+1)%3)],key=Math.min(a,b)+'/'+Math.max(a,b);
    const e=edges.get(key);if(e)e.count++;else edges.set(key,{a,b,count:1});
  }
  const neighbors=new Map<number,number[]>();
  for(const {a,b,count} of edges.values())if(count===1){neighbors.set(a,[...(neighbors.get(a)??[]),b]);neighbors.set(b,[...(neighbors.get(b)??[]),a]);}
  const start=neighbors.keys().next().value;if(start===undefined)return;
  const outline=[points[start]];let prev=-1,current=start;
  do{const next=neighbors.get(current)?.find(n=>n!==prev);if(next===undefined||next===start)break;outline.push(points[next]);prev=current;current=next;}while(outline.length<neighbors.size);
  if(outline.length>3){const seal=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(outline,true),100,.0065,7,true),gasket);seal.name='Windscreen seal';body.add(seal);}
}

// Fasteners, bezels and crystals stay fixed to the shell even while the needles move.
export function batchFixedTrim(body:T.Group){
  body.updateWorldMatrix(true,true);
  const fixed:T.Mesh[]=[];body.traverse(o=>{if(o instanceof T.Mesh&&o.userData.fixedTrim)fixed.push(o);});
  const assembly=new T.Group();assembly.name='Cabin fasteners and gauge crystals';body.add(assembly);
  for(const mesh of fixed)assembly.attach(mesh);
  batchParts(assembly);
  for(const piece of assembly.children)if(piece instanceof T.Mesh&&piece.material===crystal){
    piece.castShadow=false;piece.renderOrder=3;
  }
}
