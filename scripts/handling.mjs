import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {Vehicle, noInput, stepTime} from '../src/vehicle.ts';
await RAPIER.init();
function rig() {
  const world=new RAPIER.World({x:0,y:-9.81,z:0});
  world.createCollider(RAPIER.ColliderDesc.cuboid(1500,.5,1500).setTranslation(0,1.1,0).setFriction(.95));
  const car=new Vehicle(world);
  const step=(input={})=>car.update({...noInput,...input});
  for(let i=0;i<120;i++) step();
  car.setIgnition();
  for(let i=0;i<150;i++)step();
  return {world,car,step};
}
const round=n=>Math.round(n*100)/100;
const {world,car,step}=rig();
let ticks=0;
while(car.speed<100/3.6 && ticks++<2400) step({throttle:1});
assert.ok(ticks<2400 && car.contacts===4);
const launch=ticks*stepTime, gear100=car.gear, before=car.travelled;
ticks=0;
while(car.speed>.1 && ticks++<1500) step({brake:1});
assert.ok(ticks<1500 && car.gear>0);
const stop=car.travelled-before;
for(let i=0;i<200;i++) step({brake:1});
assert.ok(car.signedSpeed < -1 && car.gear===-1);
world.free();
function corner(speedKmh,steer) {
  const {world,car,step}=rig();
  for(let i=0;car.speed<speedKmh/3.6 && i<2400;i++) step({throttle:1});
  const initial=car.direction.clone();
  let minContact=4, angle150=0, previousRack=0;
  for(let i=0;i<120;i++){
    previousRack=car.steer;
    step({steer,throttle:.19});
    minContact=Math.min(minContact,car.contacts);
    if(i===17)angle150=car.steer*180/Math.PI;
  }
  const heading=initial.angleTo(car.direction)*180/Math.PI;
  const yaw=car.body.angvel().y, speed=car.speed, rack=car.steer;
  const {ratio,columnRateDeg,columnAccelDeg}=car.spec.steering;
  const columnScale=180/Math.PI*ratio;
  const columnDegrees=Math.abs(rack)*columnScale;
  // A release while the column is still winding on needs time to reverse and
  // recover its extra sweep. Preserve the 300 ms check for a stationary column.
  const awaySpeed=Math.max(0,Math.sign(rack)*(rack-previousRack)*columnScale/stepTime);
  const reversal=awaySpeed/columnAccelDeg;
  const extraSweep=.5*awaySpeed*reversal;
  const reversalAllowance=reversal+extraSweep/columnRateDeg;
  const earlyTicks=Math.ceil((.3+reversalAllowance)/stepTime);
  const returnSeconds=Math.max(.3,columnDegrees/columnRateDeg+.12)+reversalAllowance;
  let at300ms=1,earlyResidual=1;
  for(let i=0;i<Math.ceil(returnSeconds/stepTime);i++){
    step();
    if(i===35)at300ms=Math.abs(car.steer/rack);
    if(i===earlyTicks-1)earlyResidual=Math.abs(car.steer/rack);
  }
  const residual=Math.abs(car.steer/rack);
  const metric={speedKmh,steer,wheelAt150msDeg:round(Math.abs(angle150)),angleAfter1s:round(heading),radiusM:round(speed/Math.abs(yaw)),at300ms:round(at300ms),earlyResidual:round(earlyResidual),returnSeconds:round(returnSeconds),returnResidual:round(residual),minContact};
  assert.ok(heading>2 && earlyResidual<.85 && residual<.2 && minContact>=3,JSON.stringify(metric));
  world.free();return metric;
}
console.log(JSON.stringify({zeroTo100s:round(launch),gear100,stoppingMetres:round(stop),corners:[corner(15,1),corner(60,.46),corner(110,.28)]},null,2));
