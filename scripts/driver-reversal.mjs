import {launchTestBrowser} from './test-browser.mjs';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const dir=resolve(process.argv[2]??'verification/round7'),tag=process.argv[3]??'after';mkdirSync(dir,{recursive:true});
const vehicle=process.argv[4]??'f40';assert.ok(['f40','r35'].includes(vehicle));
const browser=await launchTestBrowser();
try{
 const page=await browser.newPage({viewport:{width:1966,height:1206}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:4177/?diagnostics&vehicle='+vehicle);await page.waitForFunction(()=>window.apexDiagnostics,null,{timeout:120000});
 await page.keyboard.press('i');await page.waitForTimeout(900);await page.keyboard.press('Escape');
 const data=await page.evaluate(()=>{
   window.apexDiagnostics.inspect.visual.driver.visible=true;
   const d=window.apexDiagnostics,{visual,car,T}=d.inspect,limbs=visual.driver.limbs,column=visual.steering.parent;
   let maxRackDegSec=0,maxHandStep=0,maxElbowStep=0,minWristGap=1,minSleeveGap=1,maxCross=0,maxInterpError=0;
   let maxHubAngleError=0,maxHubPositionError=0,minContacts=4,maxEquivalentSteer=0;
   const hubs=['HubFL','HubFR','HubRL','HubRR'].map(name=>visual.group.getObjectByName(name));
   const prior=limbs.map(()=>({wr:new T.Vector3(),el:new T.Vector3()})),pt=new T.Vector3(),wrists=[new T.Vector3(),new T.Vector3()],steps=[],angles=[];
   let prevAngle=0,elapsed=0;
   for(const [target,n] of [[0,4],[1,150],[-1,180],[1,72],[-1,72],[0,100],[.07,40],[-.07,40],[0,36],[1,12],[-1,12],[1,12],[-1,12],[0,100]]){
     for(let j=0;j<n;j++){
       d.advance(2,{throttle:0,brake:1,steer:target,handbrake:true});visual.sync(car,.5);column.updateWorldMatrix(true,true);
       const angle=visual.steering.rotation.z;maxRackDegSec=Math.max(maxRackDegSec,Math.abs(angle-prevAngle)*60*180/Math.PI);prevAngle=angle;
       const expected=(car.wheelState[0].previousSteer+car.wheelState[0].steer+car.wheelState[1].previousSteer+car.wheelState[1].steer)*.25*car.spec.steering.ratio;
       maxInterpError=Math.max(maxInterpError,Math.abs(expected-angle));
       minContacts=Math.min(minContacts,car.contacts);
       maxEquivalentSteer=Math.max(maxEquivalentSteer,Math.abs(T.MathUtils.radToDeg(car.steer)));
       hubs.forEach((hub,i)=>{
         const wheel=car.wheelState[i],mount=car.spec.wheels[i];
         const expectedY=car.spec.mountHeight-(wheel.previousLength+wheel.length)*.5;
         maxHubPositionError=Math.max(maxHubPositionError,Math.hypot(hub.position.x-mount.x,hub.position.y-expectedY,hub.position.z-mount.z));
         maxHubAngleError=Math.max(maxHubAngleError,Math.abs(hub.rotation.y-(wheel.previousSteer+wheel.steer)*.5));
       });
       for(let k=0;k<2;k++){
         const {holder,wrist,side,sleeve}=limbs[k],w=wrists[k].copy(wrist).applyQuaternion(holder.quaternion).add(holder.position);
         if(elapsed){const dw=w.distanceTo(prior[k].wr);maxHandStep=Math.max(maxHandStep,dw);steps.push(dw);maxElbowStep=Math.max(maxElbowStep,sleeve.elbow.distanceTo(prior[k].el));}
         maxCross=Math.max(maxCross,-side*w.x);prior[k].wr.copy(w);prior[k].el.copy(sleeve.elbow);
       }
       // Compare the two forearm centre lines between elbow and wrist.
       const left=limbs[0].sleeve.elbow,right=limbs[1].sleeve.elbow,b=new T.Vector3();
       for(let a=0;a<=8;a++)for(let i=0;i<=8;i++)minSleeveGap=Math.min(minSleeveGap,pt.lerpVectors(left,wrists[0],a/8).distanceTo(b.lerpVectors(right,wrists[1],i/8)));
       minWristGap=Math.min(minWristGap,wrists[0].distanceTo(wrists[1]));elapsed++;angles.push(angle);
     }
   }
   return {frames:elapsed,maxRackDegSec,maxHandStepMm:maxHandStep*1000,p99HandStepMm:steps.sort((a,b)=>a-b)[Math.floor(steps.length*.99)]*1000,maxElbowStepMm:maxElbowStep*1000,minWristGapMm:minWristGap*1000,minForearmCentreGapMm:minSleeveGap*1000,crossesCentreMm:maxCross*1000,maxInterpErrorRad:maxInterpError,lockDegrees:Math.max(...angles)*180/Math.PI,
     maxHubAngleError,maxHubPositionError,minContacts,maxEquivalentSteer,expectedLock:car.spec.steering.lock[0][1]};
 });
 const result={...data,errors};writeFileSync(dir+'/steering-'+tag+'.json',JSON.stringify(result,null,2));console.log(result);
 if(tag==='after'){
   assert.ok(data.maxInterpErrorRad<.00001&&data.maxHandStepMm<65&&data.minWristGapMm>90&&data.crossesCentreMm>12);
   assert.ok(data.maxHubAngleError<1e-6&&data.maxHubPositionError<1e-6&&data.minContacts===4);
   assert.ok(Math.abs(data.maxEquivalentSteer-data.expectedLock)<.1);
   assert.equal(errors.length,0);
 }
}finally{await browser.close();}
