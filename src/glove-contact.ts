import * as T from 'three';

export const releaseOutward=.029, releaseTowardSeat=.058;
const rimRadius=.160, leatherRadius=.0175;

// The angle around the wheel's leather section must be continuous over each
// finger, including duplicated UV seam vertices. This makes a fingertip that
// wraps behind the wheel unwind around it instead of taking a shortcut through it.
function unwrapGrip(mesh:T.BufferGeometry,positions:Float32Array){
  const count=positions.length/3,adjacent:Array<number[]>=Array.from({length:count},()=>[]);
  const seam=new Map<string,number>(),bind=mesh.attributes.position;
  for(let i=0;i<count;i++){
    const key=[bind.getX(i),bind.getY(i),bind.getZ(i)].map(v=>Math.round(v*1e6)).join(',');
    const other=seam.get(key);if(other===undefined)seam.set(key,i);
    else{adjacent[i].push(other);adjacent[other].push(i);}
  }
  const index=mesh.index!.array;
  for(let t=0;t<index.length;t+=3){
    const a=index[t],b=index[t+1],c=index[t+2];adjacent[a].push(b,c);adjacent[b].push(a,c);adjacent[c].push(a,b);
  }
  const phases=new Float64Array(count),known=new Uint8Array(count),queue:number[]=[];
  for(let i=0;i<count;i++){
    const j=i*3;phases[i]=Math.atan2(positions[j+2],Math.hypot(positions[j],positions[j+1])-rimRadius);
  }
  // Start each component on the driver-facing surface.
  const order=Array.from({length:count},(_,i)=>i).sort((a,b)=>positions[b*3+2]-positions[a*3+2]);
  for(const root of order){
    if(known[root])continue;known[root]=1;queue.length=0;queue.push(root);
    for(let k=0;k<queue.length;k++){
      const a=queue[k];
      for(const b of adjacent[a]){
        if(known[b])continue;const delta=phases[b]-phases[a];
        phases[b]=phases[a]+Math.atan2(Math.sin(delta),Math.cos(delta));known[b]=1;queue.push(b);
      }
    }
  }
  return phases;
}

// Axial symmetry lets the same contact solve serve either steering direction.
// Precompute in skin bind space so rendering and shadow passes use the same mesh.
export function fitReleasingGlove(scene:T.Group,hand:T.SkinnedMesh,side:number,poseFingers:(release:number)=>void){
  const mesh=hand.geometry,position=mesh.attributes.position,weights=mesh.attributes.skinWeight,joints=mesh.attributes.skinIndex;
  const neutral=new Float32Array(position.count*3),v=new T.Vector3();
  for(let i=0;i<position.count;i++)v.fromBufferAttribute(position,i).toArray(neutral,i*3);
  const bones=hand.skeleton.bones.map(()=>new T.Matrix4()),skin=new T.Matrix4();
  function prepare(release:number){
    poseFingers(release);scene.updateMatrixWorld(true);
    hand.skeleton.bones.forEach((b,j)=>bones[j].multiplyMatrices(b.matrixWorld,hand.skeleton.boneInverses[j]));
  }
  function vertex(i:number,release:number){
    skin.elements.fill(0);
    for(let n=0;n<4;n++){
      const w=weights.getComponent(i,n);if(!w)continue;
      const m=bones[joints.getComponent(i,n)].elements;
      for(let j=0;j<16;j++)skin.elements[j]+=w*m[j];
    }
    skin.premultiply(hand.bindMatrixInverse).multiply(hand.bindMatrix).premultiply(hand.matrixWorld);
    v.fromArray(neutral,i*3).applyMatrix4(skin);v.x+=side*releaseOutward*release;v.z+=releaseTowardSeat*release;
  }
  const endpoints=[0,1].map(f=>{
    prepare(f);const points=new Float32Array(neutral.length),radii=new Float32Array(position.count);
    for(let i=0;i<position.count;i++){
      vertex(i,f);v.toArray(points,i*3);radii[i]=Math.hypot(Math.hypot(v.x,v.y)-rimRadius,v.z);
    }
    return {phase:unwrapGrip(mesh,points),radii};
  });
  const [closed,open]=endpoints,samples:Float32Array[]=[],surfaceNormals:Float32Array[]=[],steps=32;
  const trial=new T.BufferGeometry();trial.setIndex(mesh.index);
  const normal=mesh.attributes.normal;
  for(let k=0;k<=steps;k++){
    const f=k/steps;prepare(f);
    const pose=neutral.slice();
    for(let i=0;i<position.count;i++){
      vertex(i,f);
      const ring=Math.hypot(v.x,v.y);
      const phase=T.MathUtils.lerp(closed.phase[i],open.phase[i],f);
      const radius=T.MathUtils.lerp(Math.max(leatherRadius+.0014,closed.radii[i]),Math.max(leatherRadius+.0014,open.radii[i]),f);
      const scale=(rimRadius+radius*Math.cos(phase))/ring;
      v.set(v.x*scale-side*releaseOutward*f,v.y*scale,radius*Math.sin(phase)-releaseTowardSeat*f);
      v.applyMatrix4(skin.invert()).toArray(pose,3*i);
    }
    samples.push(pose);
    trial.setAttribute('position',new T.BufferAttribute(pose,3));trial.computeVertexNormals();
    surfaceNormals.push(new Float32Array(trial.attributes.normal.array));

  }
  trial.dispose();
  if(normal instanceof T.BufferAttribute)normal.setUsage(T.DynamicDrawUsage);
  if(position instanceof T.BufferAttribute)position.setUsage(T.DynamicDrawUsage);
  let previous=-1;
  return (release:number)=>{
    if(Math.abs(previous-release)<.00001)return;previous=release;
    poseFingers(release);
    const t=release*steps,a=Math.floor(t),b=Math.min(a+1,steps),v=t-a;
    const left=samples[a],right=samples[b],n0=surfaceNormals[a],n1=surfaceNormals[b];
    for(let i=0;i<position.count;i++){
      const j=i*3;position.setXYZ(i,T.MathUtils.lerp(left[j],right[j],v),T.MathUtils.lerp(left[j+1],right[j+1],v),T.MathUtils.lerp(left[j+2],right[j+2],v));
      normal.setXYZ(i,T.MathUtils.lerp(n0[j],n1[j],v),T.MathUtils.lerp(n0[j+1],n1[j+1],v),T.MathUtils.lerp(n0[j+2],n1[j+2],v));
    }
    position.needsUpdate=normal.needsUpdate=true;
  };
}
