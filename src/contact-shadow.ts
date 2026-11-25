import * as T from 'three';
import {Vehicle} from './vehicle.ts';

// Low-frequency occlusion under the chassis and four tire contact patches.
// The receiver follows the plane sampled by the four suspension rays, including slopes.
export function groundShadow(scene:T.Scene, car:Vehicle){
  const tex=document.createElement('canvas');tex.width=192;tex.height=320;
  const ctx=tex.getContext('2d')!;
  const stamp=(x:number,y:number,rx:number,ry:number,opacity:number)=>{
    ctx.save();ctx.translate(x,y);ctx.scale(rx,ry);
    const g=ctx.createRadialGradient(0,0,0,0,0,1);
    g.addColorStop(0,`rgba(18,19,21,${opacity})`);g.addColorStop(.49,`rgba(18,19,21,${opacity*.72})`);g.addColorStop(1,'rgba(18,19,21,0)');
    ctx.fillStyle=g;ctx.fillRect(-1,-1,2,2);ctx.restore();
  };
  stamp(96,162,91,147,.49);
  const width=3.15,length=5.75,mid=-.18;
  for(const w of car.spec.wheels)stamp((w.x/width+.5)*192,((w.z-mid)/length+.5)*320,19,31,.79);
  const texture=new T.CanvasTexture(tex);texture.colorSpace=T.SRGBColorSpace;
  const geo=new T.PlaneGeometry(width,length).rotateX(-Math.PI/2).translate(0,0,mid);
  const mesh=new T.Mesh(geo,new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
  mesh.renderOrder=1;mesh.frustumCulled=false;scene.add(mesh);
  const local=geo.attributes.position.clone(),positions=geo.attributes.position;
  const ax=new T.Vector3(),az=new T.Vector3(),front=new T.Vector3(),rear=new T.Vector3(),point=new T.Vector3();
  const hubs=car.spec.wheels.map(()=>new T.Vector3());
  const update = (body:T.Group,alpha:number)=>{
    mesh.visible=car.contacts>=3;if(!mesh.visible)return;
    car.spec.wheels.forEach((w,i)=>{
      const state=car.wheelState[i];
      hubs[i].set(w.x,car.spec.mountHeight-T.MathUtils.lerp(state.previousLength,state.length,alpha)-car.spec.radius,w.z)
        .applyQuaternion(body.quaternion).add(body.position);
    });
    front.addVectors(hubs[0],hubs[1]).multiplyScalar(.5);rear.addVectors(hubs[2],hubs[3]).multiplyScalar(.5);
    az.subVectors(rear,front).divideScalar(car.spec.wheels[2].z-car.spec.wheels[0].z);
    ax.subVectors(hubs[1],hubs[0]).divideScalar(car.spec.wheels[1].x-car.spec.wheels[0].x);
    for(let i=0;i<4;i++){
      point.copy(front).addScaledVector(ax,local.getX(i)).addScaledVector(az,local.getZ(i)-car.spec.wheels[0].z);
      positions.setXYZ(i,point.x,point.y+.008,point.z);
    }
    positions.needsUpdate=true;
  };
  return {update,dispose:()=>{mesh.removeFromParent();geo.dispose();mesh.material.dispose();texture.dispose();}};
}
