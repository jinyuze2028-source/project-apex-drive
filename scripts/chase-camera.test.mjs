import assert from 'node:assert/strict';
import test from 'node:test';
import {Euler,PerspectiveCamera,Quaternion,Vector3} from 'three';
import {ChaseCamera,chasePresets} from '../src/chase-camera.ts';

const flat=new Quaternion(),point=new Vector3();
const rotation=yaw=>new Quaternion().setFromEuler(new Euler(0,yaw,0));
const car={
  world:{castRay:()=>null},
  velocity:new Vector3(0,0,-12),
  body:{angvel:()=>({x:0,y:0,z:0})},
};
function settle(hz){
  const rig=new ChaseCamera(),camera=new PerspectiveCamera(55,16/9);
  rig.update(camera,point,flat,car,1/hz,'close',true);
  for(let i=0;i<hz/2;i++){
    rig.update(camera,new Vector3(12,.4,20),rotation(.40),car,1/hz,'close',false);
  }
  return camera;
}

test('chase damping gives the same pose for equal elapsed time at 30, 60 and 120 Hz',()=>{
  const a=settle(30);
  for(const hz of [60,120]){
    const b=settle(hz);
    assert.ok(a.position.distanceTo(b.position)<.000001);
    assert.ok(Math.abs(a.quaternion.dot(b.quaternion))>1-1e-9);
  }
});

test('yaw crosses ±180° on the short arc and the chase horizon stays level',()=>{
  const rig=new ChaseCamera(),camera=new PerspectiveCamera(55,16/9);
  const idle={...car,velocity:new Vector3()};
  rig.update(camera,point,rotation(Math.PI-.02),idle,1/60,'close',true);
  const before=camera.quaternion.clone(),start=camera.position.clone();
  rig.update(camera,point,rotation(-Math.PI+.02),idle,1/60,'close',false);
  assert.ok(before.angleTo(camera.quaternion)<.04);
  assert.ok(start.distanceTo(camera.position)<.13);
  const banked=new Quaternion().setFromEuler(new Euler(.10,.08,.24,'YXZ'));
  rig.update(camera,point,banked,idle,1/60,'close',true);
  assert.ok(Math.abs(new Vector3(1,0,0).applyQuaternion(camera.quaternion).y)<1e-12);
});

test('obstruction clearance retracts immediately and restores the boom progressively',()=>{
  let hit=false;
  const world={castRay:()=>hit?{timeOfImpact:3.8}:null};
  const rig=new ChaseCamera(),camera=new PerspectiveCamera(55,16/9);
  const scene={...car,world};
  rig.update(camera,point,flat,scene,1/60,'close',true);
  const desired=camera.position.z;
  assert.equal(desired,chasePresets.close.distance);
  hit=true;
  rig.update(camera,point,flat,scene,1/60,'close',false);
  const retracted=camera.position.z;
  assert.ok(retracted>3.45&&retracted<3.57);
  hit=false;
  rig.update(camera,point,flat,scene,1/60,'close',false);
  assert.ok(camera.position.z>retracted&&camera.position.z<desired);
  for(let i=0;i<90;i++)rig.update(camera,point,flat,scene,1/60,'close',false);
  assert.ok(Math.abs(camera.position.z-desired)<.00001);
});
