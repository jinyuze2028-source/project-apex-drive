import assert from 'node:assert/strict';
import {test} from 'node:test';
import RAPIER from '@dimforge/rapier3d-compat';
import {LapTiming} from '../src/lap-timing.ts';
import {rally,sport} from '../src/vehicle-spec.ts';
import {Vehicle,noInput,stepTime} from '../src/vehicle.ts';

await RAPIER.init();

function pad(spec,friction=.95) {
  const world=new RAPIER.World({x:0,y:-9.81,z:0});
  world.createCollider(RAPIER.ColliderDesc.cuboid(1500,.5,1500).setTranslation(0,1.1,0).setFriction(friction));
  const car=new Vehicle(world,spec);
  const drive=(input={},ticks=1)=>{for(let i=0;i<ticks;i++)car.update({...noInput,...input});};
  drive({},120);car.setIgnition();drive({},150);
  return {world,car,drive};
}

test('R35 powers both axles and requests more front torque on loose ground; F40 remains RWD',()=>{
  const rigs=[pad(sport),pad(rally),pad(rally,.4)];
  try{
    const measurements=rigs.map(({car,drive})=>{
      for(let i=0;i<145;i++)drive({throttle:1});
      return {force:car.spec.wheels.map((_,i)=>car.controller.wheelEngineForce(i)),
        front:car.frontTorqueShare,contacts:car.contacts,speed:car.speed};
    });
    const [road,awd,loose]=measurements;
    assert.deepEqual(road.force.slice(0,2),[0,0]);
    assert.ok(road.force.slice(2).every(force=>force>0));
    assert.ok(awd.force.every(force=>force>100)&&loose.force.every(force=>force>100));
    assert.ok(awd.front>=.18&&loose.front>awd.front+.1&&loose.front<=.5);
    assert.ok(measurements.every(x=>x.contacts===4));
    assert.ok(loose.speed<awd.speed);
    console.log('Drivetrain launch samples',measurements);
  }finally{rigs.forEach(({world})=>world.free());}
});

test('R35 automatic accelerates through gear changes, manual supports N/R and all six gears',()=>{
  const {world,car,drive}=pad(rally);
  try{
    car.toggleTransmission();
    assert.equal(car.gear,0);
    car.shift(-1);assert.equal(car.gear,-1);
    car.shift(1);assert.equal(car.gear,0);
    for(let gear=1;gear<=6;gear++){car.shift(1);assert.equal(car.gear,gear);}
    car.shift(1);assert.equal(car.gear,6);
    assert.equal(car.shiftProgress,0);
    drive({},24);assert.ok(car.shiftProgress>.95);
    for(let gear=5;gear>=0;gear--){car.shift(-1);assert.equal(car.gear,gear);}
    car.toggleTransmission();
    let ticks=0,highest=car.gear;
    while(car.speed<100/3.6&&ticks<1200){drive({throttle:1});ticks++;highest=Math.max(highest,car.gear);}
    assert.ok(car.speed>=100/3.6&&highest>=2);
    car.automatic=false;
    const gear=car.gear;
    car.shift(-1);assert.equal(car.gear,gear,'over-rev downshift was rejected');
    console.log('R35 0–100 km/h',ticks*stepTime,'s; highest gear',highest);
  }finally{world.free();}
});

test('R35 assist and lifecycle keep the same physics world with one car',()=>{
  const {world,car,drive}=pad(rally);
  try{
    car.setAssist('simulation');assert.equal(car.tractionControl,false);
    drive({throttle:1},200);drive({brake:1},60);assert.equal(car.absActive,false);
    car.setAssist('assisted');assert.equal(car.tractionControl,true);
    assert.equal(world.bodies.len(),1);
    car.dispose();
    assert.equal(world.bodies.len(),0);
    const next=new Vehicle(world,sport);assert.equal(world.bodies.len(),1);next.dispose();
  }finally{world.free();}
});

test('R35 manual shift at road speed interrupts drive and changes shaft-equivalent RPM',()=>{
  const {world,car,drive}=pad(rally);
  try{
    car.toggleTransmission();car.shift(1);
    for(let i=0;i<600&&car.speed*3.6<55;i++)drive({throttle:1});
    assert.ok(car.speed*3.6>=55&&car.rpm>5000);
    const before=car.rpm;
    car.shift(1);drive({throttle:.15});
    assert.ok(car.spec.wheels.every((_,index)=>car.controller.wheelEngineForce(index)===0));
    drive({throttle:.15},45);
    assert.equal(car.gear,2);
    assert.ok(car.rpm<before*.77 && car.rpm>2200);
    console.log('R35 1→2 manual RPM',Math.round(before),'→',Math.round(car.rpm));
  }finally{world.free();}
});

test('stored lap summaries restore independently with recent history',()=>{
  const f40=new LapTiming(),r35=new LapTiming();
  f40.restore({count:3,best:228.2,history:[{lap:3,seconds:230.2}]});
  r35.restore({count:1,best:231.4,history:[{lap:1,seconds:231.4}]});
  f40.cancel();
  assert.equal(f40.best,228.2);
  assert.equal(f40.last,230.2);
  assert.equal(r35.best,231.4);
  assert.notEqual(f40.records().history,r35.records().history);
});
