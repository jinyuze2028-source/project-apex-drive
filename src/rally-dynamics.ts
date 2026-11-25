import {Vector3} from 'three';
import type {Vehicle} from './vehicle.ts';

export const surfaces={
  asphalt:{grip:1},paint:{grip:.84},gravel:{grip:.70},dirt:{grip:.61},grass:{grip:.57},curb:{grip:.89},
};
export type SurfaceName=keyof typeof surfaces;
export function surfaceFor(friction:number):SurfaceName{
  if(friction>=.90)return 'asphalt';
  if(friction>=.80)return 'curb';
  if(friction>=.76)return 'paint';
  if(friction>=.68)return 'gravel';
  if(friction>=.50)return 'dirt';
  return 'grass';
}
const point=new Vector3(),velocity=new Vector3(),axle=new Vector3(),tangent=new Vector3(),normal=new Vector3();
export function wheelTelemetry(car:Vehicle,i:number){
  const c=car.controller,contact=c.wheelIsInContact(i);
  const ground=c.wheelGroundObject(i),surface=surfaceFor(ground?.friction()??.95);
  let slipAngle=0;
  if(contact){
    c.wheelContactPoint(i,point);c.wheelContactNormal(i,normal);
    car.body.velocityAtPoint(point,velocity);
    const steer=c.wheelSteering(i)??0;
    axle.set(Math.cos(steer),0,-Math.sin(steer)).applyQuaternion(car.current.rotation);
    axle.addScaledVector(normal,-axle.dot(normal)).normalize();tangent.crossVectors(normal,axle);
    slipAngle=Math.atan2(Math.abs(velocity.dot(axle)),Math.max(.7,Math.abs(velocity.dot(tangent))));
  }
  const load=c.wheelSuspensionForce(i)??0;
  const use=Math.hypot(c.wheelSideImpulse(i)??0,c.wheelForwardImpulse(i)??0)/Math.max(1,load/120);
  return {contact,surface,slipAngle,load,use};
}
export const rallyModes={
  assisted:{name:'Grip',peak:1,slide:.87,transfer:1},
  sport:{name:'Rally',peak:1,slide:.78,transfer:.82},
  simulation:{name:'Simulation',peak:1,slide:.76,transfer:.72},
};
