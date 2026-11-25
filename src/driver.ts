import {fitReleasingGlove,releaseOutward,releaseTowardSeat} from './glove-contact.ts';
import {Wristwatch} from './wristwatch.ts';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {asset} from './environment.ts';

const up=new T.Vector3(0,1,0),forward=new T.Vector3(0,0,1);
const restToRim=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),Math.PI/2);
const vec=(x:number,y:number,z:number)=>new T.Vector3(x,y,z);
const fingerParts=['phalanx-proximal','phalanx-intermediate','phalanx-distal','tip'];

function gloveFabric(side:number,woven:boolean){
  const material=new T.MeshStandardMaterial({color:0xd7d5ca,roughness:.89,metalness:0});
  material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 gloveRest; varying vec3 gloveNormal;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ngloveRest=position; gloveNormal=normal;');
    shader.fragmentShader='varying vec3 gloveRest; varying vec3 gloveNormal;\n'+shader.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      float dorsal=smoothstep(-.12,.58,gloveNormal.x*${side.toFixed(1)});
      vec2 g=gloveRest.zy*100.;
      vec3 ivory=diffuseColor.rgb, charcoal=vec3(.035,.043,.052);
      float cuff=smoothstep(4.45,4.65,g.y);
      float knuckle=length(vec2((g.x-.62)*.295,(g.y+3.)*1.12));
      float pad=1.-smoothstep(.82,1.,knuckle);
      float seam=1.-smoothstep(.035,.13,abs(knuckle-1.10));
      float stitch=step(.40,fract(atan((g.y+3.)*1.12,(g.x-.62)*.295)*5.8));
      float piping=1.-smoothstep(.05,.16,abs(g.y-3.98-.10*g.x));
      float fingers=1.-smoothstep(-4.7,-3.7,g.y);
      float creases=fingers*(1.-smoothstep(.04,.16,abs(fract(g.y*.41+.13*g.x)-.50)));
      float thread=sin(g.y*22.)*sin(g.x*25.);
      float softSeam=abs(abs(g.x-.38)-1.76+.22*g.y);
      float fingerPanel=(1.-smoothstep(.055,.15,softSeam))*smoothstep(-3.0,-1.4,g.y)*(1.-smoothstep(2.5,3.5,g.y));
      float dash=smoothstep(.13,.43,fract(g.y*2.4));
      float gripper=(.5+.5*cos(g.y*8.1))*(.5+.5*sin(g.x*8.6));
      float resolved=1.-smoothstep(.4,2.,fwidth(g.y*22.));
      diffuseColor.rgb=mix(charcoal,ivory,.16+.84*dorsal);
      diffuseColor.rgb=mix(diffuseColor.rgb,charcoal,max(cuff,pad*dorsal*.88));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.46,.13,.055),piping*.87);
      diffuseColor.rgb*=1.-dorsal*(.35*seam*stitch+.17*creases);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.22,.21,.19),fingerPanel*(.57+.38*dash));
      diffuseColor.rgb*=1.-(1.-dorsal)*gripper*.18;
      diffuseColor.rgb*=1.+.10*thread*resolved;
      ${woven?`float knit=sin(g.x*17.+sin(g.y*18.)*.45)*cos(g.y*24.);
      diffuseColor.rgb*=1.+.085*knit*resolved*(1.-.56*cuff);`:''}
    `);
  };
  const colorPass=material.onBeforeCompile;
  material.onBeforeCompile=(shader,renderer)=>{
    colorPass.call(material,shader,renderer);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
      #include <roughnessmap_fragment>
      float palmZone=1.-smoothstep(-.12,.58,gloveNormal.x*${side.toFixed(1)});
      float silicone=smoothstep(.18,.5,gripper)*palmZone;
      roughnessFactor=mix(.89,.46,silicone);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.022,.025,.025),.37*silicone);
    `);
  };
  material.customProgramCacheKey=()=>`racing-fabric-${side}-${woven}`;return material;
}

// Fit the soft contact surface once in the neutral grasp. A linear blend of bone
// matrices maps each source vertex into the column frame, so its corrected point
// can be returned to bind space without detaching any skin weights.
function fitContactPatch(hand:T.SkinnedMesh){
  const geometry=hand.geometry,p=geometry.attributes.position,joints=geometry.attributes.skinIndex,weights=geometry.attributes.skinWeight;
  const blend=new T.Matrix4(),bone=new T.Matrix4(),v=new T.Vector3(),tubeCenter=new T.Vector3();
  for(let i=0;i<p.count;i++){
    blend.elements.fill(0);
    for(let k=0;k<4;k++){
      const w=weights.getComponent(i,k);if(!w)continue;
      const j=joints.getComponent(i,k);
      bone.multiplyMatrices(hand.skeleton.bones[j].matrixWorld,hand.skeleton.boneInverses[j]);
      for(let c=0;c<16;c++)blend.elements[c]+=w*bone.elements[c];
    }
    blend.premultiply(hand.bindMatrixInverse).multiply(hand.bindMatrix).premultiply(hand.matrixWorld);
    v.fromBufferAttribute(p,i).applyMatrix4(blend);
    tubeCenter.set(v.x,v.y,0).setLength(.160);
    const distance=v.distanceTo(tubeCenter);
    if(distance>=.0171||distance<1e-8)continue;
    v.sub(tubeCenter).multiplyScalar(.0171/distance).add(tubeCenter).applyMatrix4(blend.invert());
    p.setXYZ(i,v.x,v.y,v.z);
  }
  p.needsUpdate=true;
}

/** Pose the original independently weighted WebXR joints around the rim's 35 mm section. */
function grip(scene:T.Group,side:number,woven:boolean){
  let hand!:T.SkinnedMesh;scene.traverse(o=>{if(o instanceof T.SkinnedMesh)hand=o;});
  if(!hand)throw Error('Hand asset lacks a skinned hand');
  const bones=new Map(hand.skeleton.bones.map(b=>[b.name,b]));
  const wrist=bones.get('wrist')!.position.clone(),origin=vec(side*.194,-.008,.089);
  const inRim=(v:T.Vector3)=>v.clone().sub(wrist).applyQuaternion(restToRim).add(origin);
  const originals=new Map(hand.skeleton.bones.map(b=>[b.name,b.position.clone()]));
  const rest=hand.skeleton.bones.map(b=>({b,p:b.position.clone(),q:b.quaternion.clone()}));
  function curve(names:string[],goals:T.Vector3[]){
    const roots=names.map(name=>bones.get(name)!);
    const p=inRim(originals.get(names[0])!);
    let lastRot=new T.Quaternion();
    roots.forEach((bone,i)=>{
      const src=originals.get(names[i])!;
      const position=p.clone().sub(origin).applyQuaternion(restToRim.clone().invert()).add(wrist);
      if(i<goals.length){
        const original=originals.get(names[i+1])!.clone().sub(src);
        const direction=goals[i].clone().sub(p).normalize();
        lastRot=new T.Quaternion().setFromUnitVectors(original.clone().normalize(),direction.clone().applyQuaternion(restToRim.clone().invert()));
        p.addScaledVector(direction,original.length());
      }
      bone.position.copy(position);bone.quaternion.premultiply(lastRot);
    });
  }
  for(const name of ['index','middle','ring','pinky']){
    const names=fingerParts.map(p=>name+'-finger-'+p);
    const root=inRim(originals.get(names[0])!);
    const radius=Math.sqrt(.160**2-root.y**2),y=root.y;
    curve(names,[vec(side*(radius+.003),y,-.028),vec(side*(radius-.021),y,-.015),vec(side*(radius-.024),y,.006)]);
  }
  curve(['thumb-metacarpal','thumb-phalanx-proximal','thumb-phalanx-distal','thumb-tip'],
    [vec(side*.162,.027,.037),vec(side*.144,.032,.018),vec(side*.140,.028,.005)]);
  scene.rotation.copy(new T.Euler(Math.PI/2,0,0));
  scene.position.copy(wrist).applyQuaternion(restToRim).negate().add(origin);
  // Thin protective pads follow the source knuckles and retain their original joint weights.
  const pos=hand.geometry.attributes.position,norm=hand.geometry.attributes.normal;
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),out=T.MathUtils.smoothstep(norm.getX(i)*side,.05,.80);
    let bulge=0;
    for(const finger of ['index','middle','ring','pinky']){
      const joint=originals.get(finger+'-finger-phalanx-proximal')!;
      bulge+=.0026*Math.exp(-((y-joint.y)**2/.000075+(z-joint.z)**2/.000032));
    }
    const offset=out*bulge;pos.setXYZ(i,x+norm.getX(i)*offset,y+norm.getY(i)*offset,z+norm.getZ(i)*offset);
  }
  hand.geometry.computeVertexNormals();
  scene.updateMatrixWorld(true);fitContactPatch(hand);
  hand.material=gloveFabric(side,woven);hand.castShadow=hand.receiveShadow=true;hand.frustumCulled=false;
  const fingers=rest.filter(({b})=>b.name.includes('phalanx')||b.name.endsWith('-tip')).map(k=>({...k,closed:k.b.position.clone(),rotation:k.b.quaternion.clone()}));
  const relax=fitReleasingGlove(scene,hand,side,release=>{
    for(const {b,p,q,closed,rotation} of fingers){
      b.position.lerpVectors(closed,p,release*.26);b.quaternion.slerpQuaternions(rotation,q,release*.26);
    }
  });
  relax(0);return {origin,bone:bones.get('wrist')!,relax};
}

const rings=23,sides=24;
export type DriverFit={shoulderX:number;shoulderY:number;shoulderZ:number;upper:number;forearm:number;woven?:boolean};
const f40Fit:DriverFit={shoulderX:.179,shoulderY:.008,shoulderZ:.590,upper:.301,forearm:.268};
class Sleeve{
  readonly mesh:T.Mesh;
  private positions=new Float32Array(rings*sides*3);
  private axis=new T.Vector3();private tangent=new T.Vector3();private across=new T.Vector3();
  private center=new T.Vector3();private point=new T.Vector3();private pole=new T.Vector3();
  private bendNormal=new T.Vector3();
  private fixedShoulder:T.Vector3;
  readonly elbow=new T.Vector3();
  readonly shoulder:T.Vector3;
  constructor(privateSide:number,private readonly fit:DriverFit){
    this.shoulder=vec(privateSide*fit.shoulderX,fit.shoulderY,fit.shoulderZ);
    this.fixedShoulder=this.shoulder.clone();
    const indices:number[]=[],pattern:number[]=[];
    for(let i=0;i<rings;i++)for(let j=0;j<sides;j++){
      const t=i/(rings-1),a=2*Math.PI*j/sides;
      pattern.push(Math.cos(a),Math.sin(a),t);
      if(i<rings-1){const v=i*sides+j,next=i*sides+(j+1)%sides;indices.push(v,next,v+sides,next,next+sides,v+sides);}
    }
    const g=new T.BufferGeometry();g.setIndex(indices);
    g.setAttribute('position',new T.BufferAttribute(this.positions,3).setUsage(T.DynamicDrawUsage));
    g.setAttribute('sleeveCoords',new T.Float32BufferAttribute(pattern,3));
    const cloth=new T.MeshStandardMaterial({color:0xffffff,roughness:.94,side:T.DoubleSide});
    cloth.onBeforeCompile=shader=>{
      shader.vertexShader='attribute vec3 sleeveCoords; varying vec3 suitPattern;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nsuitPattern=sleeveCoords;');
      shader.fragmentShader='varying vec3 suitPattern;\n'+shader.fragmentShader.replace('#include <color_fragment>',`
        #include <color_fragment>
        float t=suitPattern.z,a=atan(suitPattern.y,suitPattern.x);
        float cuff=smoothstep(.755,.767,t);
        vec3 suit=vec3(.041,.050,.057);
        float stripe=abs(suitPattern.x-.52);
        suit=mix(suit,vec3(.30,.30,.28),1.-smoothstep(.048,.063,stripe));
        vec3 webbing=mix(vec3(.54,.52,.46),vec3(.045,.049,.051),smoothstep(.848,.854,t)*(1.-smoothstep(.938,.945,t)));
        float selvage=1.-smoothstep(.002,.006,abs(t-.780));
        webbing=mix(webbing,vec3(.29,.066,.032),selvage);
        float needle=step(.42,fract(a*26.));
        float seam=(1.-smoothstep(.001,.0038,min(abs(t-.861),abs(t-.928))))*needle;
        webbing=mix(webbing,vec3(.58,.57,.52),seam);
        float warp=sin(t*1520.)*sin(a*126.);
        float resolved=1.-smoothstep(.55,2.5,fwidth(t*1520.)+fwidth(a*126.));
        diffuseColor.rgb=mix(suit,webbing,cuff)*(1.+.095*warp*resolved);
      `);
    };
    this.mesh=new T.Mesh(g,cloth);
    this.mesh.castShadow=this.mesh.receiveShadow=true;this.mesh.frustumCulled=false;
  }
  pose(wrist:T.Vector3,side:number){
    const {axis,elbow,shoulder}=this;
    const reach=T.MathUtils.smoothstep(-side*wrist.x,-.025,.14);
    shoulder.copy(this.fixedShoulder);shoulder.z-=.063*reach;shoulder.x-=side*.022*reach;
    axis.subVectors(wrist,shoulder);const distance=axis.length();axis.normalize();
    const {upper,forearm:lower}=this.fit;
    const along=Math.min(upper,(upper*upper-lower*lower+distance*distance)/(2*distance));
    const height=Math.sqrt(Math.max(0,upper*upper-along*along));
    this.pole.set(side*.30,-1,.06);this.pole.addScaledVector(axis,-this.pole.dot(axis)).normalize();
    elbow.copy(shoulder).addScaledVector(axis,along).addScaledVector(this.pole,height);
    // A continuously transported cross-section avoids the world-up singularity at a raised elbow.
    this.bendNormal.crossVectors(axis,this.pole).normalize();
    for(let i=0;i<rings;i++){
      const t=i/(rings-1),first=t<.49,local=first?t/.49:(t-.49)/.51;
      this.center.lerpVectors(first?shoulder:elbow,first?elbow:wrist,local);
      this.axis.subVectors(elbow,shoulder).normalize().lerp(this.tangent.subVectors(wrist,elbow).normalize(),T.MathUtils.smoothstep(t,.38,.60)).normalize();
      this.across.copy(this.bendNormal).multiplyScalar(-1);
      this.across.addScaledVector(this.axis,-this.across.dot(this.axis)).normalize();
      this.tangent.crossVectors(this.axis,this.across).normalize();
      const radius=t<.45?.071-.018*t/.45:.052+.005*Math.sin(Math.PI*(t-.45)/.55)-.017*(t-.45)/.55;
      for(let j=0;j<sides;j++){
        const a=j*2*Math.PI/sides;
        const flex=height/upper;
        const fold=(.0025+.005*flex*Math.exp(-((t-.49)**2)/.018))*Math.sin(t*65+Math.cos(a)*2.4)*Math.sin(Math.PI*t)+.0011*Math.cos(5*a);
        const seam=i===19||i===21?.0025:0,r=radius+fold+seam;
        this.point.copy(this.center).addScaledVector(this.across,r*Math.cos(a)).addScaledVector(this.tangent,r*.81*Math.sin(a));
        this.point.toArray(this.positions,(i*sides+j)*3);
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate=true;this.mesh.geometry.computeVertexNormals();
  }
}

export class Driver{
  private readonly models=new T.Group();
  get visible(){return this.models.visible;}
  set visible(value:boolean){
    if(value===this.models.visible)return;
    this.models.visible=value;
    this.last=Infinity;
  }
  private limbs:Array<{side:number;holder:T.Group;wrist:T.Vector3;sleeve:Sleeve;watch?:Wristwatch;relax:(f:number)=>void}>=[];
  private wrist=new T.Vector3();private last=Infinity;
  private lastPaddle=0;
  constructor(private readonly fit=f40Fit){}
  async load(column:T.Object3D){
    this.models.name='Driver arms';
    column.add(this.models);
    const scenes=await Promise.all(['left','right'].map(name=>new GLTFLoader().loadAsync(asset('driver/'+name+'.glb'))));
    scenes.forEach(({scene},i)=>{
      const side=i?1:-1,holder=new T.Group(),fitted=grip(scene,side,this.fit.woven===true),wrist=fitted.origin;
      holder.name=i?'Right glove':'Left glove';holder.add(scene);this.models.add(holder);
      const sleeve=new Sleeve(side,this.fit);this.models.add(sleeve.mesh);const watch=side<0?new Wristwatch(fitted.bone,holder):undefined;
      this.limbs.push({side,holder,wrist,sleeve,watch,relax:fitted.relax});
    });this.pose(0);
  }
  pose(angle:number,paddleSide=0,pull=0){
    if(!this.models.visible)return;
    const paddle=Math.abs(angle)<.6?paddleSide*pull:0;
    if(Math.abs(angle-this.last)<.00002&&Math.abs(paddle-this.lastPaddle)<.0001)return;
    this.last=angle;this.lastPaddle=paddle;
    for(const {side,holder,wrist,sleeve,watch,relax} of this.limbs){
      const magnitude=Math.abs(angle),sign=Math.sign(angle),stride=2.36;
      // The carrying hand crosses twelve o'clock. The other releases, travels on the
      // driver side of the rim, then closes on a new spoke. Reversing retraces this path.
      const start=side*sign>0?2.08:.90;
      const cycle=Math.max(0,magnitude-start),number=Math.floor(cycle/stride);
      const f=Math.min(1,(cycle-number*stride)/1.13),edge=.19;
      const ease=(u:number)=>(u-edge/Math.PI*Math.sin(Math.PI*u/edge))*.5/(1-edge);
      const transfer=f<edge?ease(f):f>1-edge?1-ease(1-f):(f-edge*.5)/(1-edge);
      const turn=sign*(magnitude-stride*(number+transfer));
      const release=Math.sin(Math.PI*f)**2;
      holder.rotation.z=turn;
      const tap=Math.max(0,paddle*side);
      holder.position.set(side*releaseOutward*Math.cos(turn)*release,side*releaseOutward*Math.sin(turn)*release,releaseTowardSeat*release-tap*.010);
      relax(release);
      this.wrist.copy(wrist).applyQuaternion(holder.quaternion).add(holder.position);
      sleeve.pose(this.wrist,side);watch?.pose(this.wrist,sleeve.elbow,holder);
    }
  }
}
