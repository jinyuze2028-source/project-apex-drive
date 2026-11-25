import assert from 'node:assert/strict';
import test from 'node:test';
import {StartSignal} from '../src/start-gantry.ts';
import {RoadWear} from '../src/road-wear.ts';
import {sampleAt,courseLength} from '../src/track.ts';

test('five red groups light in order with a variable hold and go dark together',()=>{
  const run=sample=>{
    const start=new StartSignal(),counts=[];
    assert.equal(start.begin(()=>sample),true);
    assert.equal(start.begin(),false);
    let time=0,allRed=0,extinguished=0,last=0;
    while(start.phase==='countdown'){
      start.step(1/120);time+=1/120;
      if(start.count!==last){
        if(start.count===5)allRed=time;
        counts.push(start.count);last=start.count;
      }
      if(start.phase==='go')extinguished=time;
    }
    assert.deepEqual(counts,[1,2,3,4,5,0]);
    start.step(2.01);assert.equal(start.phase,'idle');
    return extinguished-allRed;
  };
  assert.ok(Math.abs(run(0)-.35)<.02);
  assert.ok(Math.abs(run(.9)-1.52)<.02);
});

test('rubber accumulates per contact strip with fixed allocation and resets',()=>{
  const wear=new RoadWear(),arc=courseLength*.18;
  const {p,right}=sampleAt(arc);
  const stamp=p.clone().addScaledVector(right,-4.02);
  const data=wear.texture.image.data;
  wear.stamp(stamp,8,.155);
  const first=data.reduce((sum,value)=>sum+value,0);
  assert.ok(first>0);
  for(let i=0;i<8;i++)wear.stamp(stamp,8,.155);
  const repeat=data.reduce((sum,value)=>sum+value,0);
  assert.ok(repeat>first*5);
  const n=wear.deposits;
  wear.stamp(p.clone().addScaledVector(right,7),20,.155);
  assert.equal(wear.deposits,n);
  wear.flush(1);
  assert.ok(wear.texture.updateRanges.length<=2);
  wear.clear();
  assert.equal(wear.bytes,2097152);
  assert.equal(wear.texture.image.data,data);
  assert.equal(wear.deposits,0);
  assert.equal(data.some(n=>n!==0),false);
});
