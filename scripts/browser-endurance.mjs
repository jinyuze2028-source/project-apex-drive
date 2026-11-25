import {launchTestBrowser} from './test-browser.mjs';
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,sep} from 'node:path';
const [port='4177', output='test-evidence',seconds='325']=process.argv.slice(2);
const dir=resolve(output)+sep;
mkdirSync(dir,{recursive:true});
const browser=await launchTestBrowser();
const errors=[];
const resident=[];const resourceSamples=[];
async function sampleMemory(system){
 const {processInfo}=await system.send('SystemInfo.getProcessInfo');
 const entries=processInfo.filter(p=>p.type==='renderer'||p.type==='GPU');
 if(!entries.length)return;
 const ps=execFileSync('ps',['-o','pid=,rss=','-p',entries.map(p=>p.id).join(',')],{encoding:'utf8'}).trim();
 const rss=new Map(ps.split('\n').map(line=>line.trim().split(/\s+/).map(Number)));
 resident.push(Object.fromEntries(['renderer','GPU'].map(type=>[type,entries.filter(p=>p.type===type).reduce((sum,p)=>sum+(rss.get(p.id)??0),0)/1024])));
}
try{
  const system=await browser.newBrowserCDPSession();
 const page=await browser.newPage({viewport:{width:1966,height:1206},deviceScaleFactor:1});
 const preset=process.env.APEX_QUALITY??'balanced';
 assert.ok(['balanced','performance','high'].includes(preset));
 await page.addInitScript(quality=>localStorage.setItem('apex.drive.settings',JSON.stringify({quality,sensitivity:1})),preset);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))errors.push(r.url())});
 await page.goto('http://127.0.0.1:'+port+'/?diagnostics');await page.waitForFunction(()=>document.querySelector('#stage').dataset.ready==='true'||document.querySelector('#loading').classList.contains('error'),{},{timeout:100000});
 assert.equal(await page.locator('#stage').getAttribute('data-ready'),'true',await page.locator('#loading').innerText());
 await page.waitForTimeout(500);
 await page.screenshot({path:dir+'on-grid.jpg',type:'jpeg',quality:89});
 await page.keyboard.press('Escape');await page.waitForTimeout(350);
 for(const [name,offset] of Object.entries({front:[0,.76,-5.3],rear:[0,.64,5.15],left:[-5.55,.74,0],right:[5.55,.74,0],quarter:[-3.55,1.04,4.45]})){
  const photo=await page.evaluate(offset=>{const {visual,camera,scene,renderer,T}=window.apexDiagnostics.inspect;const c=camera.clone();const pos=visual.group.position;c.position.copy(pos).add(new T.Vector3(...offset));c.lookAt(pos.x,pos.y+.15,pos.z);c.fov=41;c.updateProjectionMatrix();renderer.render(scene,c);return renderer.domElement.toDataURL('image/jpeg',.94).split(',')[1]},offset);
  writeFileSync(dir+name+'.jpg',Buffer.from(photo,'base64'));
 }
 await page.keyboard.press('Escape');await page.keyboard.press('i');
 await page.waitForFunction(()=>window.apexDiagnostics.inspect.audio?.ready===true);
 await page.evaluate(()=>{
   const {audio}=window.apexDiagnostics.inspect,context=audio.context;
   const analyser=context.createAnalyser();analyser.fftSize=1024;audio.output.connect(analyser);
   const buffer=new Float32Array(analyser.fftSize);
   window.apexMeasureAudio=()=>{
     analyser.getFloatTimeDomainData(buffer);
     return {state:context.state,rms:Math.sqrt(buffer.reduce((a,s)=>a+s*s,0)/buffer.length)};
   };
 });
 await page.waitForTimeout(1250);await page.screenshot({path:dir+'cockpit.jpg',type:'jpeg',quality:89});
 const geometry=await page.evaluate(()=>{const{visual,car,T}=window.apexDiagnostics.inspect;return visual.wheels.map(({pivot,roller},i)=>{const b=new T.Box3().setFromObject(pivot,true).getSize(new T.Vector3());const contact=car.controller.wheelContactPoint(i);const h=pivot.getWorldPosition(new T.Vector3());return {size:b.toArray(),hubGround:h.y-contact.y,hubX:pivot.position.x,hubZ:pivot.position.z,rolling:roller.children.length,fixed:pivot.children.length-1}})});
 for(const w of geometry)assert.ok(w.rolling>=3 && w.fixed>=1 && Math.abs(w.hubGround-.330)<.015 && Math.min(w.size[1],w.size[2])>.62,JSON.stringify(w));
 const read=()=>page.evaluate(()=>window.apexDiagnostics.state());
 const box=await page.locator('#scene canvas').boundingBox();
 for(const side of [-1,1]){
  await page.mouse.move(box.x+box.width*.53,box.y+box.height*.42);await page.mouse.down({button:'right'});
  await page.mouse.move(box.x+box.width*(.53+.135*side),box.y+box.height*.43,{steps:5});await page.mouse.up({button:'right'});assert.ok(Math.abs((await read()).lookYaw)>.25);
  await page.keyboard.press('v');assert.equal((await read()).lookYaw,0);
 }
 await page.evaluate(()=>{
  const {car,visual,camera,T,renderer}=window.apexDiagnostics.inspect,d=window.apexDiagnostics, nodes=d.stations,n=nodes.length-1;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), station=i=>nodes[(i%n+n)%n].p;
  let idx=0,first=true,startIndex=0,prev=0,lastSample=performance.now(),count=0,lastInput;
  const off=()=>document.querySelector('#stage').dataset.view;
  window.results={ms:[],maxEye:0,minDot:1,minContacts:4,suspMin:[9,9,9,9],suspMax:[0,0,0,0],wheelMaxError:0,maxDeviation:0,maxSpeed:0,frames:0,cockpitFrames:0,centerlineProgress:0,sections:{},distance:0,buffer:renderer.getDrawingBufferSize(new T.Vector2()).toArray()};
  const result=window.results; const begin=car.travelled, beginTime=car.time;
  const gl=renderer.getContext();result.gpu=gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
  // Observe after rendering so camera and body measurements come from the same frame.

  const localForward=new T.Vector3(),worldForward=new T.Vector3();
  const bodyMovement=new T.Vector3(),renderMovement=new T.Vector3();
  const speedNeedle=visual.group.getObjectByName('km/h needle'),rpmNeedle=visual.group.getObjectByName('RPM × 1000 needle');
  result.maxSpeedNeedleErrorRad=0;result.maxRpmNeedleErrorRad=0;
  result.maxSpinPoseError=0;result.maxTravelPoseError=0;result.maxSteerPoseError=0;result.maxRackError=0;
  result.maxBrakePitchDeg=0;result.maxRollDeg=0;result.minimumFuel=car.fuelLitres;
  const oldRender=renderer.render.bind(renderer);
  renderer.render=(scene,cam)=>{
    oldRender(scene,cam);if(cam!==camera)return;const now=performance.now();const elapsed=now-lastSample;lastSample=now;
    if(result.frames++>2)result.ms.push(elapsed);
    if(off()==='cockpit'){
      result.cockpitFrames++;
      result.maxEye=Math.max(result.maxEye,camera.position.distanceTo(visual.group.localToWorld(visual.eye.clone())));
      result.minDot=Math.min(result.minDot,camera.getWorldDirection(worldForward).dot(localForward.set(0,0,-1).applyQuaternion(visual.group.quaternion)));
    }
    bodyMovement.subVectors(car.current.position,car.previous.position);
    const alpha=bodyMovement.lengthSq()>1e-10 ? renderMovement.subVectors(visual.group.position,car.previous.position).dot(bodyMovement)/bodyMovement.lengthSq() : undefined;
    visual.wheels.forEach(({pivot,roller},i)=>{
      const w=car.wheelState[i];
      result.wheelMaxError=Math.max(result.wheelMaxError,Math.abs(pivot.position.x-car.spec.wheels[i].x),Math.abs(pivot.position.z-car.spec.wheels[i].z));
      if(alpha!==undefined){
        result.maxTravelPoseError=Math.max(result.maxTravelPoseError,Math.abs(pivot.position.y-car.spec.mountHeight+T.MathUtils.lerp(w.previousLength,w.length,alpha)));
        result.maxSpinPoseError=Math.max(result.maxSpinPoseError,Math.abs(roller.rotation.x+T.MathUtils.lerp(w.previousSpin,w.spin,alpha)));
        result.maxSteerPoseError=Math.max(result.maxSteerPoseError,Math.abs(pivot.rotation.y-T.MathUtils.lerp(w.previousSteer,w.steer,alpha)));
      }
    });
    const steering=(visual.wheels[0].pivot.rotation.y+visual.wheels[1].pivot.rotation.y)*.5*car.spec.steering.ratio;
    result.maxRackError=Math.max(result.maxRackError,Math.abs(visual.steering.rotation.z-steering));
    const expected=v=>(.5-clamp(v,0,1))*1.48*Math.PI;
    result.maxSpeedNeedleErrorRad=Math.max(result.maxSpeedNeedleErrorRad,Math.abs(speedNeedle.rotation.z-expected(car.speed*3.6/320)));
    result.maxRpmNeedleErrorRad=Math.max(result.maxRpmNeedleErrorRad,Math.abs(rpmNeedle.rotation.z-expected(car.rpm/8000)));
    result.minContacts=Math.min(result.minContacts,car.contacts);
    car.wheelState.forEach((w,i)=>{result.suspMin[i]=Math.min(result.suspMin[i],w.length);result.suspMax[i]=Math.max(result.suspMax[i],w.length);});
    result.minimumFuel=Math.min(result.minimumFuel,car.fuelLitres);
    result.maxRollDeg=Math.max(result.maxRollDeg,Math.abs(Math.asin(localForward.set(1,0,0).applyQuaternion(visual.group.quaternion).y))*180/Math.PI);
    if(car.brakeLight&&car.current.position.x<-104)result.maxBrakePitchDeg=Math.max(result.maxBrakePitchDeg,Math.abs(Math.asin(car.direction.y))*180/Math.PI);
  };
  d.setTestDriver(()=>{
   if(count++%3 && lastInput)return lastInput;
   const p=car.current.position,f=car.direction,v=car.speed;let best=Infinity,nearest=idx;
   let range=first?n:12;
   for(let j=idx-range;j<=idx+range;j++){const a=station(j),dist=Math.hypot(a[0]-p.x,a[2]-p.z);if(dist<best){best=dist;nearest=j}}
   idx=nearest;if(first){startIndex=idx;first=false;}
   const off=Math.max(4,Math.round((5+v*.52)/(nodes[1].d-nodes[0].d))),at=station(idx+off),a=station(idx+Math.max(1,off-3)),b=station(idx+off+5);
   const dx=at[0]-p.x,dz=at[2]-p.z;
   const angle=Math.atan2(-f.z*dx+f.x*dz,f.x*dx+f.z*dz);
   const ax=at[0]-a[0],az=at[2]-a[2],bx=b[0]-at[0],bz=b[2]-at[2];
   const curvature=Math.abs(Math.atan2(ax*bz-az*bx,ax*bx+az*bz));
   const straight=p.x< -104 && p.z> -108 && p.z<400 && f.z<-.97;
   const target=straight?34.3:clamp(24-curvature*30-Math.abs(angle)*10,6.0,23.8);
   result.maxDeviation=Math.max(result.maxDeviation,best);result.maxSpeed=Math.max(result.maxSpeed,v*3.6);
   result.distance=car.travelled-begin;result.simSeconds=car.time-beginTime;result.centerlineProgress=(idx-startIndex)/n;
   const sector=document.querySelector('#sector').textContent;
   const seg=result.sections[sector]??={min:Infinity,max:0,underPowerInBend:false,braking:false};
   seg.min=Math.min(seg.min,v*3.6);seg.max=Math.max(seg.max,v*3.6);
   const throttle=clamp((target-v)*.38+.14,0,.95),brake=clamp((v-target-.4)*.25,0,.75);
   seg.underPowerInBend ||= Math.abs(angle)>.065 && throttle>.22;seg.braking ||= brake>.15;
   return lastInput={throttle,brake,steer:clamp(angle*(1.8+v*.048),-1,1),handbrake:false};
  });
 });
 const t0=Date.now();let changes=0;
 const duration=Number(seconds),requiredLaps=duration>=350?2:duration>=160?1:0;
 while(true){
   await page.waitForTimeout(7000);
   await sampleMemory(system);
   const status=await page.evaluate(()=>({sim:window.results.simSeconds,progress:window.results.centerlineProgress,dev:window.results.maxDeviation,eye:window.results.maxEye}));
   const t=(Date.now()-t0)/1000;
   resourceSamples.push(await page.evaluate(t=>{const {laps,marks,wear,renderer}=window.apexDiagnostics.inspect;return {wall:t,wear:wear.deposits,audio:window.apexMeasureAudio(),heapMiB:performance.memory?.usedJSHeapSize/1048576,marks:marks.total,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,lapCount:laps.count,status:laps.status,reason:laps.reason};},t));
   if(resourceSamples.length===3||resourceSamples.length===6||resourceSamples.length===9)await page.keyboard.press('b');
   if(t>=(changes+1)*27){for(let i=0;i<3;i++){await page.keyboard.press('c');await page.waitForTimeout(350);}changes++;}
   if(resourceSamples.length%5===0) console.error(Math.round(t)+' s · '+resourceSamples.at(-1).lapCount+' laps · '+Math.round(status.progress*100)+'% distance');
   if(t>=duration && status.sim>=duration && resourceSamples.at(-1).lapCount>=requiredLaps)break;
   if(status.dev>8||t>duration+300)throw Error(JSON.stringify(status));
 }
 const report=await page.evaluate(()=>{window.apexDiagnostics.setTestDriver(undefined);const {ms,...r}=window.results;const sort=[...ms].sort((a,b)=>a-b);
 return {...r,fps:1000*ms.length/ms.reduce((s,v)=>s+v,0),p95ms:sort[Math.floor(ms.length*.95)],p99ms:sort[Math.floor(ms.length*.99)],slowFrames:ms.filter(v=>v>32).length}});
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');const perf=await cdp.send('Performance.getMetrics');
 const resources=await page.evaluate(()=>{const {renderer}=window.apexDiagnostics.inspect;return {geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles};});
 const memory=await cdp.send('Runtime.getHeapUsage');
 const session=await page.evaluate(()=>{const {laps,marks,wear}=window.apexDiagnostics.inspect;return {wearDeposits:wear.deposits,wearBytes:wear.bytes,count:laps.count,last:laps.last,best:laps.best,history:laps.history,status:laps.status,reason:laps.reason,progress:laps.progress,marksWritten:marks.total,marksCapacity:marks.capacity};});
 await page.locator('#lap-summary').click();await page.waitForTimeout(220);
 await page.screenshot({path:dir+'lap-history.jpg',type:'jpeg',quality:93});
 Object.assign(report,{session,resourceSamples,quality:preset,rssSamplesMiB:resident,memory,resources,jsHeapUsedBytes:perf.metrics.find(m=>m.name==='JSHeapUsedSize')?.value,wallSeconds:(Date.now()-t0)/1000,switches:changes*3,geometry,errors});
 writeFileSync(dir+'drive.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 assert.ok(report.maxEye<.00001 && report.minDot>.975 && report.maxDeviation<5.6 && !errors.length);
 assert.ok(report.maxSpeedNeedleErrorRad<.0001&&report.maxRpmNeedleErrorRad<.0001);
 assert.ok(report.maxSpinPoseError<.0001 && report.maxTravelPoseError<.0001 && report.maxSteerPoseError<.0001 && report.maxRackError<.0001);
 if(duration>=160)assert.ok(report.centerlineProgress>=1,'The driver must complete the mountain loop');
 if(duration>=350)assert.ok(session.count>=2&&session.wearDeposits>2000&&resourceSamples.some(r=>r.audio.state==='running'&&r.audio.rms>.003),JSON.stringify(session));
 if(duration>=300)assert.ok(report.switches>=12 && report.centerlineProgress>=1 && report.sections['Braking straight'].braking && report.sections['Downhill esses'].underPowerInBend);
}finally{await browser.close()}
