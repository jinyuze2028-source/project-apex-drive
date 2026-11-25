import * as T from 'three';
import {batchParts} from './batch.ts';

// The watch's local Y points along the forearm; +Z faces the crystal.
export class Wristwatch{
  readonly group=new T.Group();
  private frame=new T.Matrix4();
  private boneInHolder=new T.Matrix4();
  private x=new T.Vector3();private y=new T.Vector3();private z=new T.Vector3();private p=new T.Vector3();
  private inverse=new T.Matrix4();
  constructor(bone:T.Bone,holder:T.Group){
    this.group.name='Driver chronometer';holder.updateWorldMatrix(true,true);
    this.boneInHolder.copy(holder.matrixWorld).invert().multiply(bone.matrixWorld);bone.add(this.group);
    const metal=new T.MeshStandardMaterial({color:0xadafae,metalness:.91,roughness:.32});
    const bezel=new T.MeshStandardMaterial({color:0x484b4b,roughness:.37,metalness:.82});
    const rubber=new T.MeshStandardMaterial({color:0x222323,roughness:.86});
    const ivory=new T.MeshStandardMaterial({color:0xe1ddca,roughness:.62});
    const orange=new T.MeshStandardMaterial({color:0xba632f,roughness:.52});
    const part=(g:T.BufferGeometry,m:T.Material,x=0,y=0,z=0)=>{const mesh=new T.Mesh(g,m);mesh.position.set(x,y,z);this.group.add(mesh);return mesh;};
    const disc=(r:number,h:number,n=48)=>new T.CylinderGeometry(r,r,h,n).rotateX(Math.PI/2);
    // Closed, non-uniform rubber strap with a rounded, ribbed section.
    const silhouette=[[-.0095,0],[-.0095,.0024],[-.008,.0036],[-.0068,.0038],[-.006,.0032],[.006,.0032],[.0068,.0038],[.008,.0036],[.0095,.0024],[.0095,0],[-.0095,0]];
    const band=new T.LatheGeometry(silhouette.map(([y,r])=>new T.Vector2(.0388+r,y)),64).scale(1,1,.875);
    part(band,rubber);
    for(const x of [-.0115,.0115])for(const y of [-.019,.019])part(new T.BoxGeometry(.0046,.011,.0055),metal,x,y,.037);
    part(disc(.0202,.0062),metal,0,0,.040);
    part(disc(.0191,.0026),bezel,0,0,.0433);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d')!;
    const grad=c.createRadialGradient(94,84,5,128,128,130);grad.addColorStop(0,'#364244');grad.addColorStop(1,'#111819');c.fillStyle=grad;c.fillRect(0,0,256,256);
    c.translate(128,128);c.fillStyle='#e3dfcc';
    for(let i=0;i<60;i++){c.save();c.rotate(i*Math.PI/30);c.fillRect(i%5?-1:-3,-117,i%5?2:6,i%5?5:16);c.restore();}
    c.font='bold 21px sans-serif';c.textAlign='center';c.fillText('12',0,-74);c.fillText('6',0,87);c.font='13px sans-serif';c.fillText('AUTOMATIC',0,42);
    const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;
    part(new T.CircleGeometry(.0173,48),new T.MeshStandardMaterial({map,roughness:.7}),0,0,.04475);
    const hand=(l:number,width:number,angle:number,m:T.Material,z:number)=>{const g=new T.BoxGeometry(width,l,.00045);g.translate(0,l*.39,0).rotateZ(angle);part(g,m,0,0,z);};
    hand(.011,.0015,1.11,ivory,.0451);hand(.015,.0010,-1.03,ivory,.04565);hand(.016,.00043,2.75,orange,.0461);
    part(disc(.00145,.0008,16),metal,0,0,.0464);
    part(new T.CylinderGeometry(.0025,.0025,.0033,16).rotateZ(Math.PI/2),bezel,.0213,0,.0404);
    part(new T.TorusGeometry(.0181,.0008,6,50),metal,0,0,.0456);
    const crystal=part(new T.SphereGeometry(.0176,32,12,0,Math.PI*2,0,Math.PI/2).rotateX(Math.PI/2).scale(1,1,.073),
      new T.MeshPhysicalMaterial({color:0xc6dddf,roughness:.12,clearcoat:1,transparent:true,opacity:.085,depthWrite:false}),0,0,.0465);
    crystal.renderOrder=3;batchParts(this.group);
  }
  pose(wrist:T.Vector3,elbow:T.Vector3,holder:T.Group){
    this.y.subVectors(elbow,wrist).normalize();
    this.z.set(-.48,.83,.75);
    this.z.addScaledVector(this.y,-this.z.dot(this.y)).normalize();
    this.x.crossVectors(this.y,this.z).normalize();this.z.crossVectors(this.x,this.y);
    this.p.copy(wrist).addScaledVector(this.y,.038);
    this.frame.makeBasis(this.x,this.y,this.z).setPosition(this.p);
    holder.updateMatrix();this.inverse.multiplyMatrices(holder.matrix,this.boneInHolder).invert();
    this.frame.premultiply(this.inverse).decompose(this.group.position,this.group.quaternion,this.group.scale);
  }
}
