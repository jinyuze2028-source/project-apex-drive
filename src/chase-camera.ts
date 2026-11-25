import {Euler,MathUtils,PerspectiveCamera,Quaternion,Vector3} from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type {Vehicle} from './vehicle.ts';

export const chasePresets = {
  close: {distance:5.75,height:1.49,fov:38.5,pitch:8.2,followSpeed:13,rotationFollowSpeed:30,lookAhead:.080},
  standard: {distance:6.37,height:1.63,fov:41,pitch:8.6,followSpeed:13,rotationFollowSpeed:30,lookAhead:.096},
} as const;
export type ChasePreset=keyof typeof chasePresets;

const wrapAngle=(angle:number)=>Math.atan2(Math.sin(angle),Math.cos(angle));

export class ChaseCamera {
  private readonly forward=new Vector3();
  private readonly eye=new Vector3();
  private readonly sight=new Vector3();
  private readonly direction=new Vector3();
  private readonly rearCorner=new Vector3();
  private readonly aim=new Euler(0,0,0,'YXZ');
  private readonly ray=new RAPIER.Ray(this.sight,this.direction);
  private yaw=0;
  private pitch=0;
  private height=0;
  private lookOffset=0;
  private boom=1;

  update(camera:PerspectiveCamera,position:Vector3,rotation:Quaternion,car:Vehicle,dt:number,preset:ChasePreset,snap:boolean){
    const settings=chasePresets[preset];
    const forward=this.forward.set(0,0,-1).applyQuaternion(rotation);
    const heading=Math.atan2(-forward.x,-forward.z);
    const travelling=car.velocity.x*forward.x+car.velocity.z*forward.z;
    const speedWeight=MathUtils.smoothstep(travelling,2,14);
    const slip=wrapAngle(Math.atan2(-car.velocity.x,-car.velocity.z)-heading);
    const followYaw=heading+MathUtils.clamp(slip,-.40,.40)*.10*speedWeight;
    const lookAhead=MathUtils.clamp(car.body.angvel().y*settings.lookAhead*speedWeight,-.060,.060);
    const grade=MathUtils.clamp(Math.asin(MathUtils.clamp(forward.y,-1,1)),-.17,.17)*.66;
    const y=position.y+settings.height;

    if(snap){
      this.yaw=followYaw;this.height=y;this.pitch=grade;this.lookOffset=lookAhead;this.boom=1;
    }else{
      const turn=1-Math.exp(-settings.rotationFollowSpeed*dt);
      this.yaw+=wrapAngle(followYaw-this.yaw)*turn;
      this.height=MathUtils.damp(this.height,y,settings.followSpeed,dt);
      this.pitch=MathUtils.damp(this.pitch,grade,9,dt);
      this.lookOffset=MathUtils.damp(this.lookOffset,lookAhead,14,dt);
    }

    // Anchor position directly to the interpolated car. Damping the world-space
    // eye here would add another metre or more of trailing distance at speed.
    this.eye.set(position.x+Math.sin(this.yaw)*settings.distance,this.height,position.z+Math.cos(this.yaw)*settings.distance);
    this.sight.copy(position);this.sight.y+=.91;
    this.direction.subVectors(this.eye,this.sight);
    const length=this.direction.length();
    this.direction.divideScalar(length);
    const obstacle=car.world.castRay(this.ray,length,true,RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC|RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,undefined,car.body);
    const clear=obstacle?MathUtils.clamp((obstacle.timeOfImpact-.26)/length,0,1):1;
    this.boom=clear<this.boom?clear:MathUtils.damp(this.boom,clear,9,dt);
    camera.position.copy(this.sight).addScaledVector(this.direction,length*this.boom);

    // Retain horizontal visibility on a narrow window while keeping the 16:9
    // lens settings in the normal desktop range.
    const aspectScale=Math.max(1,1.50/camera.aspect);
    const fit=2*Math.atan(Math.tan(MathUtils.degToRad(settings.fov*.5))*aspectScale);
    const fov=Math.min(68,MathUtils.radToDeg(fit));
    const aimYaw=this.yaw+this.lookOffset;
    const obstructionTilt=MathUtils.smoothstep(1-this.boom,.2,.9)*.30;
    let aimPitch=-MathUtils.degToRad(settings.pitch)+this.pitch-obstructionTilt;
    // Uphill, keep the lower rear corners within the screen while the lens
    // otherwise follows the road grade. Heading and field of view stay intact.
    const lowerFrameAngle=Math.atan(.86*Math.tan(MathUtils.degToRad(fov*.5)));
    for(const lateral of [-.95,.95]){
      this.rearCorner.set(lateral,-.065,1.99).applyQuaternion(rotation).add(position).sub(camera.position);
      const depth=-this.rearCorner.x*Math.sin(aimYaw)-this.rearCorner.z*Math.cos(aimYaw);
      if(depth>.24)aimPitch=Math.min(aimPitch,Math.atan2(this.rearCorner.y,depth)+lowerFrameAngle);
    }
    this.aim.set(aimPitch,aimYaw,0);
    camera.quaternion.setFromEuler(this.aim);
    if(Math.abs(camera.fov-fov)>.005){
      camera.fov=fov;
      camera.updateProjectionMatrix();
    }
  }
}
