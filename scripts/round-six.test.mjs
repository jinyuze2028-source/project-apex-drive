import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {LapTiming,checkpointGates,lapTime,startDistance} from '../src/lap-timing.ts';
import {placeCheckpointMarkers} from '../src/checkpoint-markers.ts';
import {courseLength,railOffset,sampleAt} from '../src/track.ts';
import {WiperMotor,buildWiper} from '../src/wiper.ts';

const dt=1/120;
function clock(){return {lap:new LapTiming(),arc:startDistance-.13};}
function tick(s,speed=50,lat=0,heading=1){
  const {p,forward,right}=sampleAt(s.arc);
  p.y+=.332;p.addScaledVector(right,lat);
  s.lap.step(p,forward.multiplyScalar(heading),speed,dt);s.arc+=speed*dt;
}
function until(s,end,speed=50){while(s.arc<end)tick(s,speed);}
test('Two legal laps record interpolated crossings, ordered history and fastest time',()=>{
  const s=clock();until(s,startDistance+courseLength+6,45);
  assert.equal(s.lap.count,1);assert.ok(Math.abs(s.lap.last-courseLength/45)<.001);
  until(s,startDistance+courseLength*2+2,55);
  assert.equal(s.lap.count,2);assert.deepEqual(s.lap.history.map(e=>e.lap),[2,1]);assert.equal(s.lap.best,s.lap.last);
  assert.match(lapTime(s.lap.best),/^\d\d:\d\d\.\d\d\d$/);
  const stats=s.lap.history.slice();s.lap.cancel();assert.equal(s.lap.current,null);assert.deepEqual(s.lap.history,stats);
  s.lap.reset();assert.deepEqual([s.lap.current,s.lap.last,s.lap.best,s.lap.count,s.lap.history.length],[null,null,null,0,0]);
});
test('Rocking across the line cannot complete a lap, including backing across in reverse gear',()=>{
  const s=clock();until(s,startDistance+3);for(let i=0;i<5;i++){
    for(let j=0;j<50;j++)tick(s,-16);for(let j=0;j<50;j++)tick(s,16);
  }
  assert.equal(s.lap.count,0);
  const wrong=clock();for(let j=0;j<30;j++)tick(wrong,30,0,-1);assert.equal(wrong.lap.status,'waiting');
});
test('Track cuts, missed checkpoint, large position jumps and sustained reversing invalidate attempts',()=>{
  for(const scenario of ['limits','jump','opposite']){
    const s=clock();until(s,startDistance+40);assert.equal(s.lap.status,'running');
    if(scenario==='limits'){for(let j=0;j<80;j++)tick(s,30,j*.1);for(let j=0;j<80;j++)tick(s,30,8-j*.1);}
    if(scenario==='jump'){s.arc+=courseLength*.33;tick(s);}
    if(scenario==='opposite'){for(let j=0;j<30;j++)tick(s,-20);}
    assert.equal(s.lap.status,'invalid');until(s,startDistance+courseLength+1);assert.equal(s.lap.count,0);
  }
  const s=clock();until(s,startDistance+courseLength/20-12);
  // Stay within track limits but cross outside the checkpoint's stricter capture width.
  for(let i=0;i<80;i++)tick(s,30,Math.min(6.09,i*.18));
  for(let i=0;i<35;i++)tick(s,30,Math.max(0,6.09-i*.18));
  until(s,startDistance+courseLength+2);assert.equal(s.lap.count,0);
});
test('Checkpoint markers align with the 19 intermediate timing gates and stay clear of the rails',()=>{
  assert.equal(checkpointGates.length,19);
  const scene=new T.Scene();
  const group=placeCheckpointMarkers(scene);
  const markers=group.userData.markers;
  assert.equal(markers.length,19);
  markers.forEach((m,i)=>{
    const expected=sampleAt(startDistance+courseLength*(i+1)/20);
    assert.ok(Math.abs(m.distance-expected.distance)<1e-6);
    assert.ok(m.lateralOffset>railOffset+.10&&m.lateralOffset<7.55);
  });
  const loops=group.getObjectByName('Checkpoint timing loops');
  const ticks=group.getObjectByName('Checkpoint edge ticks');
  assert.ok(loops instanceof T.Mesh&&loops.geometry.attributes.position.count===19*9*4);
  assert.ok(ticks instanceof T.Mesh&&ticks.geometry.attributes.position.count===(17*2+2*4)*4);
  assert.deepEqual(markers.filter(m=>m.sectorEnd!==null).map(m=>[m.index,m.sectorEnd]),[[7,1],[14,2]]);
});
test('Wiper speed, continuous OFF parking and phase interpolation across wrap',()=>{
  const m=new WiperMotor();m.cycle();for(let i=0;i<60;i++)m.tick(dt);
  assert.ok(Math.abs(m.phase-.34)<1e-6);m.cycle();for(let i=0;i<30;i++)m.tick(dt);
  assert.ok(Math.abs(m.phase-.625)<1e-6);m.cycle();assert.ok(m.travel(1)>.6);
  for(let i=0;i<60;i++)m.tick(dt);assert.deepEqual([m.mode,m.phase,m.travel(1)],['OFF',0,0]);
});
test('Blade contact strip follows the original glazing across the sweep',async()=>{
  const bytes=readFileSync(new URL('../public/assets/f40-road.glb',import.meta.url));
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const pose=buildWiper(scene),glass=scene.getObjectByName('windscreen'),strip=scene.getObjectByName('wiperRubber');
  glass.material=new T.MeshBasicMaterial({side:T.DoubleSide});scene.updateMatrixWorld(true);
  const n=new T.Vector3(0,Math.sqrt(1-.416**2),-.416),ray=new T.Raycaster(),p=new T.Vector3();
  let min=Infinity,max=-Infinity,hits=0,tested=0;
  for(let step=0;step<=40;step++){
    pose(step/40);
    for(let i=0;i<strip.geometry.attributes.position.count;i++){
      p.fromBufferAttribute(strip.geometry.attributes.position,i);ray.ray.origin.copy(p).addScaledVector(n,.15);ray.ray.direction.copy(n).negate();
      const hit=ray.intersectObject(glass,false)[0];tested++;
      if(hit){hits++;min=Math.min(min,hit.distance-.15);max=Math.max(max,hit.distance-.15);}
    }
  }
  console.log('Rubber vertices against windscreen',{minMetres:min,maxMetres:max,hits,tested});assert.ok(hits>tested*.89&&min>-.0004&&max<.022);
  for(const name of ['wiperRubber','wiperFrame','wiperArm']){
    const geo=scene.getObjectByName(name).geometry,indices=geo.index,pos=geo.attributes.position,corner=new T.Vector3();
    let worst=Infinity,count=0;
    for(let step=0;step<=40;step++){
      pose(step/40);
      for(let i=0;i<indices.count;i+=3){
        p.set(0,0,0);
        for(let j=0;j<3;j++)p.add(corner.fromBufferAttribute(pos,indices.getX(i+j)));p.divideScalar(3);
        ray.ray.origin.copy(p).addScaledVector(n,.15);ray.ray.direction.copy(n).negate();
        const hit=ray.intersectObject(glass,false)[0];if(hit){count++;worst=Math.min(worst,hit.distance-.15);}
      }
    }
    console.log(name,'triangle centroids over glass',{count,minimumClearanceMm:worst*1000});
    assert.ok(count>0&&worst>=0);
    if(name==='wiperRubber'){
      let lowest=Infinity,comparisons=0;const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
      for(let k=0;k<=80;k++){
        pose(k/80);
        for(let i=0;i<indices.count;i+=3){
          a.fromBufferAttribute(pos,indices.getX(i));b.fromBufferAttribute(pos,indices.getX(i+1));c.fromBufferAttribute(pos,indices.getX(i+2));
          for(let u=0;u<=4;u++)for(let v=0;v<=4-u;v++){
            p.copy(a).multiplyScalar((4-u-v)/4).addScaledVector(b,u/4).addScaledVector(c,v/4);
            ray.ray.origin.copy(p).addScaledVector(n,.15);ray.ray.direction.copy(n).negate();
            const hit=ray.intersectObject(glass,false)[0];if(hit){comparisons++;lowest=Math.min(lowest,hit.distance-.15);}
          }
        }
      }
      console.log('Blade surface across 81 poses',{comparisons,minimumClearanceMm:lowest*1000});
      assert.ok(lowest>=0);
    }
  }

});

test('Rapier wheel contact regression: coasting, lateral slip, grass, finite pool reuse and reset',async()=>{
  const {default:R}=await import('@dimforge/rapier3d-compat');
  const {Vehicle,noInput}=await import('../src/vehicle.ts');
  const {TireMarks}=await import('../src/tire-marks.ts');
  await R.init();
  const world=new R.World({x:0,y:-9.81,z:0});
  try{
    const floor=world.createCollider(R.ColliderDesc.cuboid(1000,.2,1000).setTranslation(0,1.4,0).setFriction(.95));
    const car=new Vehicle(world),marks=new TireMarks(new T.Scene()),storage=marks.geometry.attributes.position.array;
    const drive=(n,input)=>{for(let j=0;j<n;j++){car.update(input);marks.update(car);}marks.flush();};
    const settle=()=>{car.reset();marks.disconnect();drive(70,noInput);};
    settle();car.body.setLinvel({x:0,y:0,z:-23},true);drive(60,noInput);assert.equal(marks.total,0);
    car.body.setLinvel({x:13,y:0,z:-24},true);drive(30,noInput);const scrub=marks.total;assert.ok(scrub>5);
    floor.setFriction(.45);car.body.setLinvel({x:12,y:0,z:-23},true);drive(60,{...noInput,brake:1});assert.equal(marks.total,scrub);
    floor.setFriction(.95);
    const beforeJump=marks.total;car.body.setTranslation({x:0,y:24,z:0},true);drive(10,{...noInput,brake:1});assert.equal(marks.total,beforeJump);
    for(let trial=0;trial<24&&marks.total<=marks.capacity+100;trial++){
      settle();car.body.setLinvel({x:0,y:0,z:-30},true);drive(210,{...noInput,brake:1});
    }
    assert.ok(marks.total>marks.capacity);assert.equal(marks.geometry.drawRange.count,marks.capacity*6);
    assert.strictEqual(marks.geometry.attributes.position.array,storage);
    console.log('Fixed rubber pool',{written:marks.total,capacity:marks.capacity,noBrakeScrub:scrub,bufferBytes:Object.values(marks.geometry.attributes).reduce((v,a)=>v+a.array.byteLength,marks.geometry.index.array.byteLength)});
    marks.clear();assert.equal(marks.total,0);assert.equal(marks.geometry.drawRange.count,0);
  }finally{world.free();}
});
