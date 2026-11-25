import RAPIER from '@dimforge/rapier3d-compat';
import {Vector3} from 'three';
import {interpolate,rally} from '../src/vehicle-spec.ts';
import {Vehicle, noInput, sport, stepTime} from '../src/vehicle.ts';

const toDeg = radians => radians * 180 / Math.PI;
const toRad = degrees => degrees * Math.PI / 180;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const ticksPerSecond = Math.round(1 / stepTime);
const turnSeconds = 24;
const sampleSeconds = 8;
const point = new Vector3(), normal = new Vector3(), velocity = new Vector3();
const axle = new Vector3(), tangent = new Vector3();
const spec = process.argv.includes('--r35') ? rally : sport;

await RAPIER.init();

function wheelSlips(car) {
  return car.wheelState.map((wheel, i) => {
    const controller = car.controller;
    if (!controller.wheelIsInContact(i)) return null;
    controller.wheelContactPoint(i, point);
    controller.wheelContactNormal(i, normal);
    axle.set(Math.cos(wheel.steer), 0, -Math.sin(wheel.steer)).applyQuaternion(car.previous.rotation);
    axle.addScaledVector(normal, -axle.dot(normal)).normalize();
    tangent.crossVectors(normal, axle);
    car.body.velocityAtPoint(point, velocity);
    return toDeg(Math.atan2(Math.abs(velocity.dot(axle)), Math.abs(velocity.dot(tangent))));
  });
}

function skidpad(targetKmh, input, assist) {
  const world = new RAPIER.World({x:0, y:-9.81, z:0});
  world.createCollider(RAPIER.ColliderDesc.cuboid(2000,.5,2000).setTranslation(0,1.1,0).setFriction(.95));
  const car = new Vehicle(world,spec);
  try {
    for (let tick = 0; tick < 120; tick++) car.update(noInput);
    car.setIgnition();
    for (let tick = 0; tick < 150; tick++) car.update(noInput);
    const target = targetKmh / 3.6;
    const assistImpulse = new Vector3();
    let integral = 0;
    const step = steer => {
      const error = target - car.speed;
      integral = clamp(integral + .16 * error * stepTime, -.4, assist && steer ? 3 : 1);
      const demand = .32 * error + integral;
      // Optional skidpad assist when the normal drivetrain runs out of pedal.
      // Apply longitudinal force at the COM. No lateral force or yaw torque.
      const force = assist && steer ? clamp((demand - 1) * 2000,0,4000) : 0;
      if (force > 0 && car.speed > 1) {
        assistImpulse.set(car.velocity.x,0,car.velocity.z).multiplyScalar(force * stepTime / car.speed);
        car.body.applyImpulse(assistImpulse,true);
      }
      car.update({...noInput, steer, throttle:clamp(demand,0,1), brake:clamp(-demand,0,.8)});
      return force;
    };
    for (let tick = 0; tick < 12 * ticksPerSecond; tick++) step(0);
    const entryKmh = car.speed * 3.6;
    const targetAngle = interpolate(spec.steering.lock, targetKmh) * Math.abs(input);
    let rise90 = null, path = 0, pathYaw = 0, previousHeading = 0, rollMax = 0, assistTotal = 0;
    const speeds = [], rack = [], inner = [], outer = [], yaw = [], slipFront = [], slipRear = [];
    const directionalSlip = [];
    let contactsMin = 4;
    const sampleStart = (turnSeconds - sampleSeconds) * ticksPerSecond;
    for (let tick = 0; tick < turnSeconds * ticksPerSecond; tick++) {
      const assistNewtons = step(input);
      const roadAngle = Math.abs(toDeg(car.steer));
      if (rise90 === null && roadAngle >= targetAngle * .9) rise90 = (tick + 1) * stepTime;
      if (tick < sampleStart - 1) continue;
      const heading = Math.atan2(-car.velocity.x, -car.velocity.z);
      if (tick >= sampleStart) {
        assistTotal += assistNewtons;
        path += car.speed * stepTime;
        pathYaw += wrap(heading - previousHeading);
        speeds.push(car.speed);
        rack.push(roadAngle);
        const fronts = car.wheelState.slice(0,2).map(wheel => Math.abs(toDeg(wheel.steer)));
        inner.push(Math.max(...fronts));
        outer.push(Math.min(...fronts));
        yaw.push(car.body.angvel().y);
        contactsMin = Math.min(contactsMin, car.contacts);
        const slips = wheelSlips(car);
        slipFront.push(...slips.slice(0,2).filter(slip => slip !== null));
        slipRear.push(...slips.slice(2).filter(slip => slip !== null));
        directionalSlip.push(Math.abs(toDeg(wrap(heading - Math.atan2(-car.direction.x,-car.direction.z)))));
        const q = car.current.rotation;
        rollMax = Math.max(rollMax, Math.abs(toDeg(Math.asin(clamp(2 * (q.x*q.y + q.w*q.z), -1, 1)))));
      }
      previousHeading = heading;
    }
    const speed = mean(speeds);
    const yawRate = Math.abs(mean(yaw));
    const radiusByYaw = yawRate >= .02 ? speed / yawRate : null;
    const radiusByPath = Math.abs(pathYaw) >= .16 ? path / Math.abs(pathYaw) : null;
    const wheelbase = Math.abs(spec.wheels[0].z - spec.wheels[2].z);
    const geometric = Math.hypot(wheelbase / Math.tan(toRad(mean(rack))), spec.wheels[2].z - spec.centerOfMass.z);
    const speedKmhRange = [Math.min(...speeds) * 3.6, Math.max(...speeds) * 3.6];
    const stable = radiusByPath !== null && radiusByYaw !== null
      && Math.abs(radiusByPath / radiusByYaw - 1) < .04
      && speedKmhRange.every(kmh => Math.abs(kmh - targetKmh) < 1)
      && yaw.every(value => Math.abs(Math.abs(value) / yawRate - 1) < .12);
    const frontSlipDeg = slipFront.length ? mean(slipFront) : null;
    const rearSlipDeg = slipRear.length ? mean(slipRear) : null;
    return {
      targetKmh, input, entryKmh, speedKmh: speed*3.6, speedKmhRange, rise90Seconds:rise90,
      equivalentDeg:mean(rack), innerDeg:mean(inner), outerDeg:mean(outer),
      yawDegPerSecond:toDeg(yawRate), radiusByYaw, radiusByPath, geometricRadius:geometric, stable,
      frontSlipDeg, rearSlipDeg, bodySlipDeg:mean(directionalSlip), lateralG:speed*yawRate/9.81,
      peakRollDeg:rollMax, contactsMin, meanAssistNewtons:assistTotal/speeds.length,
    };
  } finally {
    world.free();
  }
}

const [curve] = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
if (curve) spec.steering.lock = JSON.parse(curve);
const assist = process.argv.includes('--assist');
const scenarios = [10,15,20,25,30,50,80,110].map(kmh => [kmh,1]);
scenarios.push([110,.3]);
const results = scenarios.flatMap(([kmh, magnitude]) => [-magnitude,magnitude].map(input => skidpad(kmh,input,assist)));
console.log(JSON.stringify({turnSeconds, sampleSeconds, assist, steering:spec.steering, tires:spec.tires, results}, null, 2));
