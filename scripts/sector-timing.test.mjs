import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  LapTiming,
  SECTOR_LAYOUT_ID,
  lastLapHoldSeconds,
  sectorBoundaryIndices,
  sectorDelta,
  sectorTime,
  startDistance,
} from '../src/lap-timing.ts';
import {courseLength,sampleAt} from '../src/track.ts';

const dt=1/120;
const g7Arc=startDistance+courseLength*7/20;
const g14Arc=startDistance+courseLength*14/20;
const g19Arc=startDistance+courseLength*19/20;
const s1Len=courseLength*7/20;
const s2Len=courseLength*7/20;
const s3Len=courseLength*6/20;

function makeDriver(lap=new LapTiming(),arc=startDistance-.2){
  return {lap,arc};
}
function stepDriver(d,speed=50,lat=0,heading=1){
  const {p,forward,right}=sampleAt(d.arc);
  p.y+=.332;
  p.addScaledVector(right,lat);
  d.lap.step(p,forward.multiplyScalar(heading),speed,dt);
  d.arc+=speed*dt;
}
function driveTo(d,targetArc,speed=50){
  while(d.arc<targetArc)stepDriver(d,speed);
}
function driveSectorLap(d,lapIndex,speeds){
  const base=startDistance+lapIndex*courseLength;
  const end=base+courseLength+1;
  while(d.arc<end){
    const rel=d.arc-base;
    const v=rel<s1Len?speeds[0]:rel<s1Len+s2Len?speeds[1]:speeds[2];
    stepDriver(d,v);
  }
}

test('Sector boundaries G07, G14, G00 time accurately, stay in S3 after G19, and sum to full lap',()=>{
  assert.deepEqual([...sectorBoundaryIndices],[7,14]);
  const d=makeDriver();
  driveTo(d,startDistance+5,40);
  assert.equal(d.lap.status,'running');
  assert.equal(d.lap.currentSector,0);
  assert.ok(d.lap.currentSectorTime>0);

  // Cross G07 at 40 m/s
  driveTo(d,g7Arc,40);
  stepDriver(d,40);
  assert.equal(d.lap.currentSector,1);
  assert.ok(Math.abs(d.lap.sectors[0]-s1Len/40)<.002);
  assert.equal(d.lap.sectorRatings[0],'baseline');
  assert.equal(d.lap.sectorDeltas[0],null);

  // Cross G14 at 50 m/s (first sub-step overshoot is <0.34 m at 40 m/s -> <0.002 s)
  driveTo(d,g14Arc,50);
  stepDriver(d,50);
  assert.equal(d.lap.currentSector,2);
  assert.ok(Math.abs(d.lap.sectors[1]-s2Len/50)<.004);
  assert.equal(d.lap.sectorRatings[1],'baseline');
  assert.equal(d.lap.sectorDeltas[1],null);

  // Pass G19: must remain explicitly in Sector 3 (index 2), never wrapping to S1.
  driveTo(d,g19Arc+5,45);
  assert.equal(d.lap.currentSector,2);
  assert.equal(d.lap.sectors[2],null);
  assert.ok(d.lap.currentSectorTime>0);

  // Cross G00 to finish Lap 1
  driveTo(d,startDistance+courseLength+1,45);
  assert.equal(d.lap.count,1);
  assert.ok(d.lap.lastLapSectors!==null);
  const [t1,t2,t3]=d.lap.lastLapSectors;
  assert.ok(Math.abs(t1+t2+t3-d.lap.last)<1e-6);
  assert.ok(Math.abs(t1+t2+t3-d.lap.best)<1e-6);
  assert.deepEqual(d.lap.bestSectors,d.lap.bestLapSectors);
  assert.ok(Math.abs(d.lap.theoreticalBest-d.lap.best)<1e-6);
  // First lap has no fake delta and uses neutral baseline rating
  const hold=d.lap.sectorDisplay();
  assert.equal(hold.mode,'last-lap');
  assert.deepEqual(hold.ratings,['baseline','baseline','baseline']);
  assert.deepEqual(hold.deltas,[null,null,null]);
});

test('Purple, green, yellow, equal ratings, pre-commit reference snapshots, and independent bestSectors vs bestLapSectors',()=>{
  const d=makeDriver();
  // Lap 1 (baseline): S1=40, S2=40, S3=40 m/s -> establishes initial best lap and best sectors
  driveSectorLap(d,0,[40,40,40]);
  const lap1Best=d.lap.best;
  const lap1Sectors=[...d.lap.bestLapSectors];

  // Lap 2: faster S1 (55 m/s -> purple), much slower S2 (25 m/s -> yellow), equal S3 (40 m/s -> equal)
  // Overall lap is slower than Lap 1 -> bestLapSectors stays Lap 1, bestSectors[0] updates to Lap 2!
  const base2=startDistance+courseLength;
  driveTo(d,base2+s1Len,55);
  stepDriver(d,55);
  assert.equal(d.lap.sectorRatings[0],'purple');
  assert.ok(d.lap.sectorDeltas[0]<0);
  // Provisional: permanent bestSectors[0] MUST NOT update mid-lap before finish!
  assert.equal(d.lap.bestSectors[0],lap1Sectors[0]);

  driveTo(d,base2+s1Len+s2Len,25);
  stepDriver(d,25);
  assert.equal(d.lap.sectorRatings[1],'yellow');
  assert.ok(d.lap.sectorDeltas[1]>0);

  // Align S3 speed cleanly from G14 so S3 ties Lap 1's S3 within <0.5 ms -> 'equal'
  const s2Overshoot=d.arc-(base2+s1Len+s2Len);
  d.arc=base2+s1Len+s2Len+s2Overshoot;
  driveTo(d,base2+courseLength+1,40);
  // Also test exact-equal rating directly via matching constant-speed lap
  assert.equal(d.lap.count,2);
  assert.equal(d.lap.best,lap1Best); // Lap 2 overall slower
  assert.deepEqual(d.lap.bestLapSectors,lap1Sectors); // Best lap sectors unchanged
  assert.ok(d.lap.bestSectors[0]<d.lap.bestLapSectors[0]); // Independent S1 faster than best lap's S1
  assert.ok(d.lap.theoreticalBest<d.lap.best); // Theoretical best beats overall best lap!
  const hold2=d.lap.sectorDisplay();
  assert.equal(hold2.ratings[0],'purple');
  assert.equal(hold2.ratings[1],'yellow');

  // Verify exact equal rating (0.000) when repeating an identical-speed lap
  const eq=makeDriver();
  driveSectorLap(eq,0,[40,40,40]);
  driveSectorLap(eq,1,[40,40,40]);
  const eqHold=eq.lap.sectorDisplay();
  assert.deepEqual(eqHold.ratings,['equal','equal','equal']);
  assert.deepEqual(eqHold.deltas,[0,0,0]);

  // Lap 3: S1 at 48 m/s (faster than bestLapSectors[0] @40, slower than bestSectors[0] @55 -> GREEN!)
  // S2 at 50 m/s (new best -> PURPLE), S3 at 50 m/s (new best -> PURPLE)
  const base3=startDistance+2*courseLength;
  driveTo(d,base3+s1Len+2,48);
  assert.equal(d.lap.sectorRatings[0],'green');
  assert.ok(d.lap.sectorDeltas[0]<0);
  driveTo(d,base3+s1Len+s2Len+2,50);
  assert.equal(d.lap.sectorRatings[1],'purple');
  driveTo(d,base3+courseLength+2,50);
  // Pre-commit S3 rating must be purple against old best, not equal against itself!
  const hold3=d.lap.sectorDisplay();
  assert.equal(hold3.ratings[0],'green');
  assert.equal(hold3.ratings[1],'purple');
  assert.equal(hold3.ratings[2],'purple');
  assert.ok(hold3.deltas[2]<0);
  // Overall best lap now updated to Lap 3, while bestSectors[0] still comes from Lap 2!
  assert.ok(d.lap.best<lap1Best);
  assert.ok(d.lap.bestSectors[0]<d.lap.bestLapSectors[0]);
  assert.ok(d.lap.theoreticalBest<d.lap.best);
});

test('Post-finish 3-second LAST LAP hold runs new lap in background and clears on timeout, invalidation, or reset',()=>{
  const d=makeDriver();
  driveSectorLap(d,0,[45,45,45]);
  // Immediately after finish: new lap is already running in background!
  assert.equal(d.lap.status,'running');
  assert.equal(d.lap.currentSector,0);
  assert.ok(d.lap.current>0);
  assert.equal(d.lap.showingLastLap,true);
  assert.equal(d.lap.sectorDisplay().mode,'last-lap');
  assert.equal(d.lap.sectorDisplay().lap,1);

  // Advance 2.0 s (< 3 s): still showing LAST LAP, while current lap clock advances
  const tBefore=d.lap.current;
  for(let i=0;i<240;i++)stepDriver(d,30);
  assert.ok(d.lap.current>tBefore+1.9);
  assert.equal(d.lap.showingLastLap,true);

  // Advance another 1.2 s (total > 3 s): automatically transitions to current lap display
  for(let i=0;i<144;i++)stepDriver(d,30);
  assert.equal(d.lap.showingLastLap,false);
  const live=d.lap.sectorDisplay();
  assert.equal(live.mode,'current');
  assert.equal(live.activeSector,0);
  assert.ok(live.currentSectorTime>lastLapHoldSeconds);

  // Finish Lap 2, then trigger Track limits within 3 s -> must immediately drop LAST LAP hold
  driveTo(d,startDistance+courseLength+s1Len+2,45);
  driveTo(d,startDistance+courseLength+s1Len+s2Len+2,45);
  driveTo(d,startDistance+2*courseLength+2,45);
  assert.equal(d.lap.showingLastLap,true);
  for(let i=0;i<30;i++)stepDriver(d,25,6.8); // off-track -> Track limits
  assert.equal(d.lap.status,'invalid');
  assert.equal(d.lap.showingLastLap,false);
  assert.equal(d.lap.sectorDisplay().mode,'invalid');

  // Finish Lap 3 cleanly, then cancel() (car reset / garage) within 3 s -> must immediately drop hold
  const d2=makeDriver();
  driveSectorLap(d2,0,[45,45,45]);
  assert.equal(d2.lap.showingLastLap,true);
  d2.lap.cancel();
  assert.equal(d2.lap.showingLastLap,false);
  assert.equal(d2.lap.sectorDisplay().mode,'waiting');
  assert.equal(d2.lap.count,1); // historical records preserved!
  assert.ok(d2.lap.bestSectors[0]!==null);
});

test('Invalid laps (track limits, missed checkpoint, wrong direction, jump, reset) never commit provisional purple sectors',()=>{
  const scenarios=['limits','missed','reverse','jump','cancel'];
  for(const scenario of scenarios){
    const d=makeDriver();
    // Establish baseline on Lap 1 at 35 m/s
    driveSectorLap(d,0,[35,35,35]);
    const savedBest=d.lap.best;
    const savedBestSectors=[...d.lap.bestSectors];
    const savedBestLapSectors=[...d.lap.bestLapSectors];
    const savedTheo=d.lap.theoreticalBest;

    // On Lap 2, crush S1 at 65 m/s (provisional purple!)
    const base2=startDistance+courseLength;
    driveTo(d,base2+s1Len+2,65);
    assert.equal(d.lap.sectorRatings[0],'purple');
    assert.ok(d.lap.sectors[0]<savedBestSectors[0]);

    if(scenario==='limits'){
      for(let i=0;i<30;i++)stepDriver(d,30,7.0);
    }else if(scenario==='missed'){
      // Cross G08 wide outside ±5.90 m capture width, staying within ±6.20 m track limits
      driveTo(d,base2+courseLength*8/20-8,30);
      for(let i=0;i<70;i++)stepDriver(d,30,6.05);
      driveTo(d,base2+courseLength*9/20+5,30);
    }else if(scenario==='reverse'){
      for(let i=0;i<40;i++)stepDriver(d,-20);
    }else if(scenario==='jump'){
      d.arc+=500;stepDriver(d,30);
    }else if(scenario==='cancel'){
      d.lap.cancel();
    }

    if(scenario!=='cancel'){
      assert.equal(d.lap.status,'invalid',scenario);
      const disp=d.lap.sectorDisplay();
      assert.equal(disp.mode,'invalid');
      assert.deepEqual(disp.ratings,['invalid','invalid','invalid']);
      assert.ok(disp.sectors[0]!==null); // provisional S1 kept visible as invalid
      // Even finishing the lap must NOT commit!
      driveTo(d,base2+courseLength+2,45);
    }
    assert.equal(d.lap.count,1,scenario);
    assert.equal(d.lap.best,savedBest,scenario);
    assert.deepEqual(d.lap.bestSectors,savedBestSectors,scenario);
    assert.deepEqual(d.lap.bestLapSectors,savedBestLapSectors,scenario);
    assert.equal(d.lap.theoreticalBest,savedTheo,scenario);
  }
});

test('Persistence round-trip, vehicle isolation, legacy compatibility, layout version change, and corrupted data safety',()=>{
  // 1. Round-trip & vehicle isolation (F40 vs R35 separate records)
  const f40=makeDriver(),r35=makeDriver();
  driveSectorLap(f40,0,[48,48,48]);
  driveSectorLap(r35,0,[42,42,42]);
  const f40Json=JSON.stringify(f40.lap.records());
  const r35Json=JSON.stringify(r35.lap.records());

  const f40Restored=new LapTiming(),r35Restored=new LapTiming();
  f40Restored.restore(JSON.parse(f40Json));
  r35Restored.restore(JSON.parse(r35Json));
  assert.equal(f40Restored.best,f40.lap.best);
  assert.deepEqual(f40Restored.bestSectors,f40.lap.bestSectors);
  assert.deepEqual(f40Restored.bestLapSectors,f40.lap.bestLapSectors);
  assert.ok(f40Restored.best<r35Restored.best);
  assert.notDeepEqual(f40Restored.bestSectors,r35Restored.bestSectors);

  // 2. Legacy data without sectorLayout / bestSectors: keep old lap best, do not fabricate sectors
  const legacy=new LapTiming();
  legacy.restore({count:3,best:95.0,history:[{lap:3,seconds:95.0},{lap:2,seconds:102.0}]});
  assert.equal(legacy.count,3);
  assert.equal(legacy.best,95.0);
  assert.equal(legacy.last,95.0);
  assert.deepEqual(legacy.bestSectors,[null,null,null]);
  assert.equal(legacy.bestLapSectors,null);
  assert.equal(legacy.theoreticalBest,null);

  // Run one slower valid lap on top of legacy best -> populates bestSectors, keeps legacy best & null bestLapSectors
  const ld=makeDriver(legacy);
  driveSectorLap(ld,0,[40,40,40]);
  assert.equal(legacy.count,4);
  assert.equal(legacy.best,95.0); // legacy best preserved
  assert.equal(legacy.bestLapSectors,null); // not fabricated
  assert.ok(legacy.bestSectors.every(v=>v!==null));
  // Next lap uses bestSector reference explicitly (refKind === 'bestSector')
  const baseLegacy2=startDistance+courseLength;
  driveTo(ld,baseLegacy2+s1Len+2,45);
  assert.equal(legacy.sectorRatings[0],'purple');
  assert.equal(legacy.sectorRefKinds[0],'bestSector');

  // 3. Layout version mismatch: preserve whole-lap records, isolate incompatible sector data
  const outdated=new LapTiming();
  outdated.restore({
    count:2,best:110.5,history:[{lap:2,seconds:110.5,sectors:[35,40,35.5]}],
    sectorLayout:'legacy-g6-g13-v0',bestSectors:[35,40,35.5],bestLapSectors:[35,40,35.5],
  });
  assert.equal(outdated.count,2);
  assert.equal(outdated.best,110.5);
  assert.deepEqual(outdated.bestSectors,[null,null,null]);
  assert.equal(outdated.bestLapSectors,null);
  assert.equal(outdated.history[0].sectors,undefined);

  // 4. Corrupted / malformed data never throws and safely falls back
  for(const bad of [null,undefined,'bad',42,{},{count:-1,best:NaN,history:'x'},{count:2,best:100,history:[],sectorLayout:SECTOR_LAYOUT_ID,bestSectors:[10,-5,Infinity],bestLapSectors:[10,20,30]}]){
    const safe=new LapTiming();
    assert.doesNotThrow(()=>safe.restore(bad));
    if(bad&&typeof bad==='object'&&bad.count===2){
      assert.equal(safe.best,100);
      assert.deepEqual(safe.bestSectors,[null,null,null]);
      assert.equal(safe.bestLapSectors,null);
    }
  }

  // 5. Formatting helpers handle rounding rollovers and zero delta cleanly
  assert.equal(sectorTime(null),'—');
  assert.equal(sectorTime(34.8124),'34.812');
  assert.equal(sectorTime(59.9996),'1:00.000');
  assert.equal(sectorTime(65.05),'1:05.050');
  assert.equal(sectorDelta(null),'');
  assert.equal(sectorDelta(0),'0.000');
  assert.equal(sectorDelta(-0.0002),'0.000');
  assert.equal(sectorDelta(-0.214),'-0.214');
  assert.equal(sectorDelta(0.38),'+0.380');
});
