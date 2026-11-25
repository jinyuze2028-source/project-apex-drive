import {launchTestBrowser} from './test-browser.mjs';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const output=resolve(process.argv[2]??'verification/round6');
mkdirSync(output,{recursive:true});
const browser=await launchTestBrowser();
const errors=[],results={};
try{
  const page=await browser.newPage({viewport:{width:1966,height:1206}});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:4177/?diagnostics');
  await page.waitForFunction(()=>window.apexDiagnostics||document.querySelector('#loading.error'),undefined,{timeout:100000});
  assert.equal(await page.locator('#stage').getAttribute('data-ready'),'true',await page.locator('#loading').innerText());
  await page.keyboard.press('i');await page.waitForTimeout(1250);
  await page.screenshot({path:output+'/cockpit.jpg',quality:94});
  const motor=()=>page.evaluate(()=>window.apexDiagnostics.inspect.car.wiper.mode);
  await page.locator('#settings').click();await page.locator('#wiper-key').selectOption('KeyJ');
  await page.locator('#show-timing').uncheck();assert.ok(await page.locator('#lap-panel').isHidden());
  await page.locator('#show-timing').check();await page.getByRole('button',{name:'Close settings'}).click();
  await page.keyboard.press('b');assert.equal(await motor(),'OFF');
  const button=await page.evaluate(()=>window.apexDiagnostics.controlPoint('wiper'));
  await page.mouse.click(button.x,button.y);assert.equal(await motor(),'LOW');
  await page.keyboard.press('j');assert.equal(await motor(),'HIGH');await page.keyboard.press('j');
  await page.waitForFunction(()=>{const m=window.apexDiagnostics.inspect.car.wiper;return m.mode==='OFF'&&m.phase===0;});
  results.wiperInput={click:true,reboundKey:'J',parked:true};
  results.driver=await page.evaluate(()=>{
    const {visual,T}=window.apexDiagnostics.inspect;
    const samples=[],column=visual.steering.parent,hands=['Left glove','Right glove'].map(k=>column.getObjectByName(k));
    const wrist=new T.Vector3(),vertex=new T.Vector3();
    for(const angle of [-.65,0,.65]){
      visual.driver.pose(angle);column.updateWorldMatrix(true,false);column.updateMatrixWorld(true);
      samples.push(hands.map(h=>{
        let skin;h.traverse(n=>{if(n.isSkinnedMesh)skin=n;});skin.skeleton.update();
        let near=0,minClearance=Infinity;
        for(let i=0;i<skin.geometry.attributes.position.count;i++){
          skin.getVertexPosition(i,vertex);column.worldToLocal(skin.localToWorld(vertex));
          const dist=Math.hypot(Math.hypot(vertex.x,vertex.y)-.16,vertex.z)-.0175;
          if(Math.abs(dist)<.008)near++;minClearance=Math.min(minClearance,dist);
        }
        return {bones:skin.skeleton.bones.length,nearRimVertices:near,minimumClearanceMm:minClearance*1000,wrist:column.worldToLocal(skin.skeleton.bones.find(b=>b.name==='wrist').getWorldPosition(wrist)).toArray()};
      }));
    }
    visual.driver.pose(visual.steering.rotation.z);return samples;
  });
  assert.ok(results.driver.flat().every(h=>h.bones===25&&h.nearRimVertices>10&&h.minimumClearanceMm>-.42));
  await page.keyboard.press('j');await page.keyboard.press('Escape');
  // Freeze the physics clock; photograph one cycle from the same actual driver's eye.
  const frames=await page.evaluate(()=>{
    const d=window.apexDiagnostics,{car,visual,renderer,camera,scene}=d.inspect,photos=[];
    const start=car.wiper.phase;
    for(let i=0;i<25;i++){
      const target=i/24;let phase=(car.wiper.phase-start+1)%1;
      if(i)for(let j=0;j<(i===24?7:12);j++){d.advance(1,{throttle:0,brake:0,steer:0,handbrake:false});phase=(car.wiper.phase-start+1)%1;if(phase>=target)break;}
      visual.sync(car,1);renderer.render(scene,camera);photos.push(renderer.domElement.toDataURL('image/jpeg',.85).split(',')[1]);
    }
    return photos;
  });
  results.wiperFrameCount=frames.length;
  mkdirSync(output+'/wiper-frames',{recursive:true});
  frames.forEach((b,i)=>writeFileSync(output+'/wiper-frames/'+String(i).padStart(2,'0')+'.jpg',Buffer.from(b,'base64')));
  // Render from actual simulated positions. The elevated observer is used only for the rubber photographs.
  const snap=async(name,look)=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const bytes=await page.evaluate(look=>{
    const {car,visual,renderer,camera,scene,T,marks}=window.apexDiagnostics.inspect;visual.sync(car,1);marks.flush();let cam=camera;
    if(look){cam=camera.clone();cam.layers.enableAll();const pos=car.current.position;
      const off=new T.Vector3(...look.offset).applyQuaternion(car.current.rotation);
      const target=new T.Vector3(...look.target).applyQuaternion(car.current.rotation).add(pos);
      cam.position.copy(pos).add(off);cam.lookAt(target);cam.fov=look.fov??50;cam.updateProjectionMatrix();}
    renderer.render(scene,cam);return renderer.domElement.toDataURL('image/jpeg',.94).split(',')[1];
  },look);writeFileSync(output+'/'+name+'.jpg',Buffer.from(bytes,'base64'));};
  const go=(steps,throttle,brake,steer=0,handbrake=false)=>page.evaluate(([n,throttle,brake,steer,handbrake])=>window.apexDiagnostics.advance(n,{throttle,brake,steer,handbrake}),[steps,throttle,brake,steer,handbrake]);
  const stats=()=>page.evaluate(()=>{const {marks,laps,car}=window.apexDiagnostics.inspect;return {marks:marks.total,wheels:[...marks.samples],speed:car.speed*3.6,count:laps.count,current:laps.current,last:laps.last,best:laps.best,status:laps.status,history:laps.history};});
  await go(600,1,0);results.acceleration=await stats();assert.equal(results.acceleration.marks,0);assert.ok(results.acceleration.current>0);
  const timer=(await stats()).current;await page.waitForTimeout(520);assert.equal((await stats()).current,timer);results.pauseFrozen=true;
  await go(122,0,1);results.braking=await stats();assert.ok(results.braking.marks>100);
  await go(82,0,1,.12,true);await snap('braking',{offset:[-4,3.4,15],target:[0,-.3,6],fov:46});
  const resetCar=async()=>{await page.keyboard.press('Escape');await page.keyboard.press('r');await page.keyboard.press('Escape');await go(120,0,0);};
  await resetCar();
  const close=await page.evaluate(()=>{
    const {visual,renderer,scene,camera,T}=window.apexDiagnostics.inspect,c=camera.clone(),wheel=visual.steering.getWorldPosition(new T.Vector3());
    const panel=visual.group.getObjectByName('Instrument binnacle').getWorldPosition(new T.Vector3());
    c.position.copy(visual.group.localToWorld(visual.eye.clone()));c.lookAt(wheel.lerp(panel,.48));c.fov=35;c.updateProjectionMatrix();
    renderer.render(scene,c);return renderer.domElement.toDataURL('image/jpeg',.96).split(',')[1];
  });writeFileSync(output+'/hardware.jpg',Buffer.from(close,'base64'));
  await go(470,1,0);await go(42,.25,0,.70,true);
  results.slide=await stats();await snap('steering',null);
  await go(45,0,0,.46,true);await snap('slide',{offset:[-5.3,4.9,12.5],target:[0,-.2,5]});
  // Isolate a slope and unpaved ground using controlled starting positions. Only the
  // setup moves the chassis; rendering, wheels, contact points and deposits use the game solver.
  await page.evaluate(()=>{
    const {car,marks,T}=window.apexDiagnostics.inspect,station=window.apexDiagnostics.stations[260],next=window.apexDiagnostics.stations[261];
    const forward=new T.Vector3(...next.p).sub(new T.Vector3(...station.p)).normalize();
    const right=new T.Vector3(...station.right).normalize(),up=right.clone().cross(forward).normalize();
    right.crossVectors(forward,up).normalize();const q=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(right,up,forward.clone().negate()));
    car.reset();car.body.setTranslation({x:station.p[0],y:station.p[1]+.385,z:station.p[2]},true);car.body.setRotation(q,true);
    car.body.setLinvel(forward.multiplyScalar(22),true);marks.disconnect();
  });
  await go(14,0,0);const slopeStart=await stats();await go(135,0,1,-.14);
  results.slope=await page.evaluate(()=>{const c=window.apexDiagnostics.inspect.car.controller,n=c.wheelContactNormal(0);return {gradeNormal:n,friction:c.wheelGroundObject(0)?.friction()};});
  results.slope.segments=(await stats()).marks-slopeStart.marks;assert.ok(results.slope.segments>10);
  await snap('slope',{offset:[-4,3.2,13],target:[0,-.3,4.8],fov:48});
  const ground=await page.evaluate(async()=>{
    const d=window.apexDiagnostics,{marks,car}=d.inspect;
    const {terrainY}=await import('/src/track.ts');
    const x=-143,z=230;car.reset();car.body.setTranslation({x,y:terrainY(x,z)+.55,z},true);marks.disconnect();
    const baseline=marks.total;let onGrass=false;
    for(let i=0;i<120;i++){d.advance(1,{throttle:0,brake:0,steer:0,handbrake:false});if(i===85)car.body.setLinvel({x:0,y:0,z:-13},true);}
    for(let i=0;i<60;i++){d.advance(1,{throttle:0,brake:1,steer:.2,handbrake:true});onGrass ||=car.controller.wheelGroundObject(0)?.friction()<.5;}
    return {onGrass,segments:marks.total-baseline};
  });results.grass=ground;assert.deepEqual(ground,{onGrass:true,segments:0});
  await resetCar();
  // Drive two complete laps through the production Rapier and timing path at fixed steps.
  results.laps=await page.evaluate(()=>{
    const d=window.apexDiagnostics,{car,laps,marks}=d.inspect,nodes=d.stations,n=nodes.length-1,step=nodes[1].d;
    laps.reset();let idx=38,ticks=0;
    const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),point=i=>nodes[((i%n)+n)%n].p;
    while(laps.count<2&&ticks<65000){
      const p=car.current.position,f=car.direction,v=car.speed;let best=Infinity,found=idx;
      for(let j=idx-10;j<=idx+10;j++){const a=point(j),r=(a[0]-p.x)**2+(a[2]-p.z)**2;if(r<best){best=r;found=j;}}
      idx=found;const off=Math.max(4,Math.round((5+v*.52)/step));
      const a=point(idx+Math.max(1,off-3)),at=point(idx+off),b=point(idx+off+5);
      const dx=at[0]-p.x,dz=at[2]-p.z,yaw=Math.atan2(-f.z*dx+f.x*dz,f.x*dx+f.z*dz);
      const ax=at[0]-a[0],az=at[2]-a[2],bx=b[0]-at[0],bz=b[2]-at[2];
      const bend=Math.abs(Math.atan2(ax*bz-az*bx,ax*bx+az*bz));
      const target=p.x< -104&&p.z>-35&&p.z<290&&f.z<-.97?34:clamp(24-bend*30-Math.abs(yaw)*10,6,23.8);
      d.advance(5,{throttle:clamp((target-v)*.38+.14,0,.95),brake:clamp((v-target-.4)*.25,0,.75),steer:clamp(yaw*(1.8+v*.048),-1,1),handbrake:false});ticks+=5;
    }
    return {count:laps.count,history:laps.history.map(e=>({...e})),best:laps.best,ticks,marks:marks.total,reason:laps.reason};
  });assert.equal(results.laps.count,2,JSON.stringify(results.laps));
  await resetCar();const retained=await stats();assert.equal(retained.count,2);assert.deepEqual(retained.history,results.laps.history);
  await page.keyboard.press('Escape');await page.locator('#lap-summary').click();await page.waitForTimeout(200);
  await page.screenshot({path:output+'/timing.jpg',quality:93});
  await page.locator('#reset-timer').click();assert.equal((await stats()).count,0);assert.equal((await stats()).best,null);assert.equal((await stats()).last,null);
  results.resetCarRetainsHistory=true;results.resetTimerClearsHistory=true;
  results.errors=errors;assert.equal(errors.length,0);
  writeFileSync(output+'/interaction.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}
