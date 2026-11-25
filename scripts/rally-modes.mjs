import RAPIER from '@dimforge/rapier3d-compat';
import {rally,sport} from '../src/vehicle-spec.ts';
import {Vehicle,noInput,stepTime} from '../src/vehicle.ts';
import assert from 'node:assert/strict';
await RAPIER.init();
const results=[];
for(const mode of ['assisted','sport','simulation'])for(const friction of [.95,.78,.72,.6,.45,.83]){
 const world=new RAPIER.World({x:0,y:-9.81,z:0});
 world.createCollider(RAPIER.ColliderDesc.cuboid(1500,.5,1500).setTranslation(0,1.1,0).setFriction(friction));
 const car=new Vehicle(world,rally);car.setAssist(mode);
 try{
  for(let i=0;i<120;i++)car.update(noInput);
  car.setIgnition();for(let i=0;i<150;i++)car.update(noInput);
  let maxSlip=0,maxGripStep=0,lastGrip=car.controller.wheelFrictionSlip(0),contacts=4,forceError=0;
  for(let i=0;i<1200;i++){
   const steer=i<240?0:Math.sin((i-240)*stepTime*1.7)*.95;
   car.update({...noInput,throttle:car.speed<20?.65:.17,steer});
   const grip=car.controller.wheelFrictionSlip(0);
   maxGripStep=Math.max(maxGripStep,Math.abs(grip-lastGrip));lastGrip=grip;
   maxSlip=Math.max(maxSlip,...car.tireTelemetry.map(w=>w.slipAngle));
   contacts=Math.min(contacts,car.contacts);
   const f=[0,1,2,3].map(i=>Math.abs(car.controller.wheelEngineForce(i)));
   const total=f.reduce((a,b)=>a+b,0);
   if(total>1)forceError=Math.max(forceError,Math.abs((f[0]+f[1])/total-car.deliveredFrontShare));
  }
  assert.ok(car.speed>1&&contacts>=3);
  assert.ok(forceError<1e-6&&car.frontTorqueShare<=.5);
  results.push({mode,friction,surface:car.tireTelemetry[0].surface,speedKmh:car.speed*3.6,
   maxSlipDeg:maxSlip*180/Math.PI,maxGripStep,contactsMin:contacts,frontShare:car.frontTorqueShare,forceError});
 }finally{world.free();}
}
assert.equal(sport.mass,1275);assert.equal(sport.steering.columnRateDeg,455);
console.log(JSON.stringify(results,null,2));
