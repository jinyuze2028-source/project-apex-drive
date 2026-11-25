import * as T from 'three';

// Motor phase is independent of the render loop. Cutting the switch keeps the park circuit live.
export class WiperMotor {
  mode: 'OFF'|'LOW'|'HIGH' = 'OFF';
  phase=0;
  previous=0;
  private frequency=0;
  cycle(){
    this.mode=this.mode==='OFF'?'LOW':this.mode==='LOW'?'HIGH':'OFF';
    if(this.mode!=='OFF')this.frequency=this.mode==='LOW'?.68:1.14;
  }
  tick(dt:number){
    this.previous=this.phase;
    if(!this.frequency)return;
    this.phase+=dt*this.frequency;
    if(this.phase>=1){
      if(this.mode==='OFF'){this.frequency=0;this.phase=0;}else this.phase%=1;
    }
  }
  travel(alpha:number){
    const end=this.phase<this.previous?this.phase+1:this.phase;
    return .5-.5*Math.cos(T.MathUtils.lerp(this.previous,end,alpha)*Math.PI*2);
  }
  reset(){this.mode='OFF';this.frequency=this.phase=this.previous=0;}
}

// Work in the inclined plane through the original spindle. Bake blade flex against
// the actual outer glass triangles once, then blend adjacent poses during a sweep.
const py=.773,pz=-1.079,vy=.416,vz=Math.sqrt(1-vy*vy);
function chart(x:number,y:number,z:number){
  return new T.Vector3(x,(y-py)*vy+(z-pz)*vz,(y-py)*vz-(z-pz)*vy);
}
function glassProfile(glass:T.BufferGeometry){
  const pos=glass.getAttribute('position'),idx=glass.getIndex()!;
  const vertices=Array.from({length:pos.count},(_,i)=>chart(pos.getX(i),pos.getY(i),pos.getZ(i)));
  const triangles:Array<{a:T.Vector3;bx:number;by:number;cx:number;cy:number;bz:number;cz:number;det:number}>=[];
  for(let k=0;k<idx.count;k+=3){
    const a=vertices[idx.getX(k)],b=vertices[idx.getX(k+1)],c=vertices[idx.getX(k+2)];
    const bx=b.x-a.x,by=b.y-a.y,cx=c.x-a.x,cy=c.y-a.y,det=bx*cy-by*cx;
    if(Math.abs(det)>1e-9)triangles.push({a,bx,by,cx,cy,bz:b.z-a.z,cz:c.z-a.z,det});
  }
  const surface=(x:number,v:number)=>{
    let best=-Infinity,nearest=Infinity,out=0;
    for(const {a,bx,by,cx,cy,bz,cz,det} of triangles){
      const u=((x-a.x)*cy-(v-a.y)*cx)/det,w=(bx*(v-a.y)-by*(x-a.x))/det;
      const h=a.z+u*bz+w*cz;
      if(u>=-1e-5 && w>=-1e-5 && u+w<=1.00001)best=Math.max(best,h);
      else if(best===-Infinity){
        const distance=Math.max(0,-u,-w,u+w-1);
        if(distance<nearest){nearest=distance;out=h;}
      }
    }
    return best===-Infinity?out:best;
  };
  // Cache the smooth windscreen profile on a centimetre grid. Optical seams in
  // the source GLB retain their original normals and topology.
  const w=91,h=87,dx=.016;
  const field=new Float32Array(w*h);
  for(let j=0;j<h;j++)for(let i=0;i<w;i++)field[j*w+i]=surface((i-(w-1)/2)*dx,j*dx-.04);
  return (x:number,v:number)=>{
    const u=T.MathUtils.clamp(x/dx+(w-1)/2,0,w-1.001),s=T.MathUtils.clamp((v+.04)/dx,0,h-1.001);
    const off=Math.floor(s)*w+Math.floor(u),f=u%1,g=s%1;
    return (1-g)*T.MathUtils.lerp(field[off],field[off+1],f)+g*T.MathUtils.lerp(field[off+w],field[off+w+1],f);
  };
}
// The imported strip has long, thin faces. Split the longest edges before bending
// so the contact surface can follow the glass between the original endpoints.
function flexibleStrip(source:T.BufferGeometry){
  const pos=source.attributes.position,indices=source.index!;
  const vertices=Array.from({length:pos.count},(_,i)=>new T.Vector3().fromBufferAttribute(pos,i));
  const out:number[]=[],midpoints=new Map<string,number>();
  function split(a:number,b:number,c:number){
    const ab=vertices[a].distanceToSquared(vertices[b]),bc=vertices[b].distanceToSquared(vertices[c]),ca=vertices[c].distanceToSquared(vertices[a]);
    if(Math.max(ab,bc,ca)<.036**2){out.push(a,b,c);return;}
    if(bc>ab&&bc>=ca){[a,b,c]=[b,c,a];}else if(ca>ab&&ca>bc){[a,b,c]=[c,a,b];}
    const key=Math.min(a,b)+'/'+Math.max(a,b);let mid=midpoints.get(key);
    if(mid===undefined){mid=vertices.length;midpoints.set(key,mid);vertices.push(vertices[a].clone().lerp(vertices[b],.5));}
    split(a,mid,c);split(mid,b,c);
  }
  for(let i=0;i<indices.count;i+=3)split(indices.getX(i),indices.getX(i+1),indices.getX(i+2));
  const geometry=new T.BufferGeometry().setFromPoints(vertices);geometry.setIndex(out);geometry.computeVertexNormals();return geometry;
}
export function buildWiper(body:T.Object3D){
  const glass=body.getObjectByName('windscreen') as T.Mesh;
  const surface=glassProfile(glass.geometry),steps=42;
  const blades=['wiperArm','wiperFrame','wiperRubber'].map((name,part)=>{
    const mesh=body.getObjectByName(name) as T.Mesh;
    if(part===2){const original=mesh.geometry;mesh.geometry=flexibleStrip(original);original.dispose();}
    const geo=mesh.geometry;
    mesh.material=new T.MeshStandardMaterial({color:[0x414448,0x343637,0x262627][part],metalness:part===2?0:.64,roughness:part===2?.88:.44});
    const p=geo.getAttribute('position') as T.BufferAttribute;
    const originals=Array.from({length:p.count},(_,i)=>chart(p.getX(i),p.getY(i),p.getZ(i)));
    // The strip cross section is preserved while its contact lip follows the glazing.
    const bins=Array.from({length:34},()=>Infinity);
    const station=(v:T.Vector3)=>Math.min(33,Math.floor(Math.hypot(v.x,v.y)*45));
    if(part===2)for(const v of originals)bins[station(v)]=Math.min(bins[station(v)],v.z-surface(v.x,v.y));
    const frames=Array.from({length:steps+1},(_,i)=>{
      const a=i/steps*2.29,c=Math.cos(a),s=Math.sin(a),frame=new Float32Array(p.count*3);
      originals.forEach((v,k)=>{
        const x=c*v.x-s*v.y,y=s*v.x+c*v.y,rest=surface(v.x,v.y);
        const flex=T.MathUtils.smoothstep(Math.hypot(v.x,v.y),.022,.14);
        const clearance=part===2?.00125+Math.max(0,v.z-rest-bins[station(v)]):Math.max(part===0?.007:.0038,v.z-rest);
        const n=T.MathUtils.lerp(v.z,surface(x,y)+clearance,flex);
        frame.set([x,py+y*vy+n*vz,pz+y*vz-n*vy],k*3);
      });return frame;
    });
    p.setUsage(T.DynamicDrawUsage);mesh.frustumCulled=false;
    return {p,frames,geo};
  });
  let previous=-1;
  return (travel:number)=>{
    if(Math.abs(travel-previous)<.00004)return;previous=travel;
    const t=travel*steps,k=Math.min(steps-1,Math.floor(t)),mix=t-k;
    for(const {p,frames,geo} of blades){
      const a=frames[k],b=frames[k+1];
      for(let j=0;j<a.length;j++)p.array[j]=a[j]+(b[j]-a[j])*mix;
      p.needsUpdate=true;geo.computeVertexNormals();
    }
  };
}
