import * as T from 'three';
import type {RoadWear} from './road-wear.ts';
import {stepTime,type Vehicle} from './vehicle.ts';

const capacity=4096;
const clamp=T.MathUtils.clamp,smooth=T.MathUtils.smoothstep;
function tread(){
  const w=64,h=64,data=new Uint8Array(w*h*4);
  let random=973;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    random=(Math.imul(random,1664525)+1013904223)>>>0;
    const u=(x+.5)/w,edge=smooth(Math.min(u,1-u),0,.14);
    const ribs=.74+.26*smooth(Math.abs(Math.sin(Math.PI*(u*5.5+.11*Math.sin(y*Math.PI/32)))),.12,.63);
    const alpha=edge*ribs*(.65+.35*random/4294967296);
    data.fill(Math.round(alpha*255),(y*w+x)*4,(y*w+x+1)*4);
  }
  const map=new T.DataTexture(data,w,h);map.wrapT=T.RepeatWrapping;map.generateMipmaps=true;map.minFilter=T.LinearMipMapLinearFilter;map.magFilter=T.LinearFilter;map.needsUpdate=true;return map;
}
function anchor(){
  return {active:false,center:new T.Vector3(),left:new T.Vector3(),right:new T.Vector3(),normal:new T.Vector3(),alpha:0,v:0};
}
export class TireMarks{
  readonly geometry=new T.BufferGeometry();
  readonly mesh:T.Mesh;
  readonly capacity=capacity;
  readonly samples=[0,0,0,0];
  total=0;
  private dirty=0;
  private readonly lastWear=Array.from({length:4},()=>new T.Vector3());
  private readonly wearActive=[false,false,false,false];
  private readonly wheels=Array.from({length:4},anchor);
  private readonly pos=new T.BufferAttribute(new Float32Array(capacity*12),3);
  private readonly normals=new T.BufferAttribute(new Float32Array(capacity*12),3);
  private readonly colors=new T.BufferAttribute(new Float32Array(capacity*16),4);
  private readonly tex=new T.BufferAttribute(new Float32Array(capacity*8),2);
  private readonly point=new T.Vector3();
  private readonly norm=new T.Vector3();
  private readonly axle=new T.Vector3();
  private readonly tangent=new T.Vector3();
  private readonly vel=new T.Vector3();
  private readonly left=new T.Vector3();
  private readonly right=new T.Vector3();
  private readonly wear?:RoadWear;
  constructor(scene:T.Scene,wear?:RoadWear){
    this.wear=wear;
    const indices=new Uint16Array(capacity*6);
    for(let i=0;i<capacity;i++){const k=i*4;indices.set([k,k+2,k+1,k+2,k+3,k+1],i*6);}
    this.geometry.setIndex(new T.BufferAttribute(indices,1));
    for(const [key,a] of [['position',this.pos],['normal',this.normals],['color',this.colors],['uv',this.tex]] as const)this.geometry.setAttribute(key,a.setUsage(T.DynamicDrawUsage));
    this.geometry.setDrawRange(0,0);
    const mat=new T.MeshStandardMaterial({color:0x434044,roughness:.94,transparent:true,vertexColors:true,depthWrite:false,alphaMap:tread(),polygonOffset:true,polygonOffsetFactor:-2,side:T.DoubleSide,forceSinglePass:true});
    mat.onBeforeCompile=shader=>{
      shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>',`
        #include <alphamap_fragment>
        diffuseColor.a*=1.-smoothstep(58.,155.,length(vViewPosition));
      `);
    };
    this.mesh=new T.Mesh(this.geometry,mat);
    this.mesh.name='Deposited tire rubber';this.mesh.frustumCulled=false;this.mesh.receiveShadow=true;
    this.mesh.renderOrder=1;scene.add(this.mesh);
  }
  disconnect(){for(const w of this.wheels)w.active=false;this.samples.fill(0);this.wearActive.fill(false);}
  clear(){this.disconnect();this.wear?.clear();this.total=this.dirty=0;this.geometry.setDrawRange(0,0);}
  update(car:Vehicle){
    if(car.speed<2){this.disconnect();return;}
    const c=car.controller;
    for(const [i,a] of this.wheels.entries()){
      let amount=0;const grip=c.wheelIsInContact(i)?c.wheelGroundObject(i)?.friction()??0:0;
      if(grip>=.80 && c.wheelContactPoint(i,this.point) && c.wheelContactNormal(i,this.norm)){
        const steer=car.wheelState[i].steer;
        this.axle.set(Math.cos(steer),0,-Math.sin(steer)).applyQuaternion(car.previous.rotation);
        this.axle.addScaledVector(this.norm,-this.axle.dot(this.norm)).normalize();
        this.tangent.crossVectors(this.norm,this.axle).normalize();
        car.body.velocityAtPoint(this.point,this.vel);
        const longitudinal=Math.abs(this.vel.dot(this.tangent)),lateral=Math.abs(this.vel.dot(this.axle));
        const load=c.wheelSuspensionForce(i)??0,mu=(i<2?car.spec.tires.frontGrip:car.spec.tires.rearGrip)*grip/.95;
        // Rapier's ray wheel rotation follows road speed even under braking. Estimate lock
        // from brake demand relative to remaining grip after the measured side impulse.
        const budget=Math.max(1,load*mu*stepTime),side=clamp(Math.abs(c.wheelSideImpulse(i)??0)/budget,0,.99);
        const demand=(c.wheelBrake(i)??0)/(budget*Math.sqrt(1-side*side));
        const lock=car.brakeLight?smooth(demand,.68,1.38):0;
        const slip=Math.atan2(lateral,Math.max(2,longitudinal));
        const scrub=smooth(slip,.075,.32)*smooth(lateral,.65,2.7);
        amount=clamp(Math.max(lock,scrub)*smooth(car.speed,2,8)*smooth(load,160,1950)*(grip<.90?.68:1),0,1);
        if(this.wear&&car.speed>3&&load>300){
          const last=this.lastWear[i];
          if(!this.wearActive[i]||last.distanceToSquared(this.point)>=1.18**2){
            const deposit=(6+12*side+15*amount)*smooth(load,200,3900);
            this.wear.stamp(this.point,deposit,i<2?.118:.160);
            last.copy(this.point);
            this.wearActive[i]=true;
          }
        }else this.wearActive[i]=false;
      }else this.wearActive[i]=false;
      this.samples[i]=amount;
      if(amount<.045){a.active=false;continue;}
      // The simulator contacts the asphalt underneath painted lines. Float the
      // thin slip ribbon above the highest paint layer while retaining depth tests.
      this.point.addScaledVector(this.norm,.024);
      const distance=a.active?a.center.distanceTo(this.point):0;
      if(a.active&&distance<.28)continue;
      const spread=(i<2?.118:.160)*(.94+.06*amount);
      this.left.copy(this.point).addScaledVector(this.axle,-spread);this.right.copy(this.point).addScaledVector(this.axle,spread);
      const alpha=.65*amount;
      if(a.active&&distance<2.4){
        const k=(this.total%capacity)*4;
        for(let j=0;j<4;j++){
          const point=j===0?a.left:j===1?a.right:j===2?this.left:this.right;
          const n=j<2?a.normal:this.norm;
          this.pos.setXYZ(k+j,point.x,point.y,point.z);this.normals.setXYZ(k+j,n.x,n.y,n.z);
          this.colors.setXYZW(k+j,1,1,1,j<2?a.alpha:alpha);this.tex.setXY(k+j,j%2,j<2?a.v:a.v+distance*1.42);
        }
        a.v=(a.v+distance*1.42)%1;this.total++;this.dirty++;
      }
      a.active=true;a.alpha=alpha;a.center.copy(this.point);a.normal.copy(this.norm);a.left.copy(this.left);a.right.copy(this.right);
    }
  }
  flush(time=0){
    this.wear?.flush(time);
    if(!this.dirty)return;
    const n=Math.min(capacity,this.dirty),start=(this.total-n)%capacity,first=Math.min(n,capacity-start);
    for(const attr of [this.pos,this.normals,this.colors,this.tex]){
      const stride=attr.itemSize*4;
      attr.addUpdateRange(start*stride,first*stride);if(first<n)attr.addUpdateRange(0,(n-first)*stride);attr.needsUpdate=true;
    }
    this.geometry.setDrawRange(0,Math.min(this.total,capacity)*6);this.dirty=0;
  }
}
