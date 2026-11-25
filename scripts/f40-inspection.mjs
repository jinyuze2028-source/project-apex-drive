import {launchTestBrowser} from './test-browser.mjs';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='verification/f40';mkdirSync(out,{recursive:true});
const browser=await launchTestBrowser();
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1966,height:1206},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:4177/?diagnostics');
 await page.waitForFunction(()=>document.querySelector('#stage').dataset.ready==='true'||document.querySelector('#loading').classList.contains('error'),null,{timeout:90000});
 assert.equal(await page.locator('#stage').getAttribute('data-ready'),'true',await page.locator('#loading').innerText());
 await page.waitForTimeout(600);
 async function photo(name,offset,aim,fov=42,world=false){
   const b64=await page.evaluate(({offset,aim,fov,world})=>{
     const {visual,camera,scene,renderer,T,car,sun,skydome,updateVegetation}=window.apexDiagnostics.inspect,c=camera.clone();c.layers.enable(1);
     const pos=world?new T.Vector3():visual.group.position.clone().add(new T.Vector3(0,-car.spec.bodyOrigin,0));
     c.position.copy(pos).add(new T.Vector3(...offset));c.lookAt(pos.clone().add(new T.Vector3(...aim)));c.fov=fov;c.updateProjectionMatrix();
     const fog=scene.fog;if(world && c.position.y>600)scene.fog=null;
     const sky=skydome.position.clone(),sunPos=sun.position.clone(),sunTarget=sun.target.position.clone(),shadows=renderer.shadowMap.autoUpdate;
     skydome.position.copy(c.position);sun.target.position.copy(pos).add(new T.Vector3(...aim));sun.position.copy(sun.target.position).add(new T.Vector3(-66,94,-40));updateVegetation(c.position);renderer.shadowMap.autoUpdate=true;
     renderer.render(scene,c);const data=renderer.domElement.toDataURL('image/jpeg',.93).split(',')[1];scene.fog=fog;skydome.position.copy(sky);sun.position.copy(sunPos);sun.target.position.copy(sunTarget);updateVegetation(camera.position);renderer.render(scene,camera);renderer.shadowMap.autoUpdate=shadows;return data;
   },{offset,aim,fov,world});writeFileSync(out+'/'+name+'.jpg',Buffer.from(b64,'base64'));
 }
 await photo('front',[-.17,1.12,-5.6],[0,.50,0],36);await photo('side',[-6.0,.97,0],[0,.53,0],36);
 await photo('rear',[.12,1.05,5.45],[0,.52,0],35);await photo('quarter',[-3.12,1.65,4.40],[0,.54,0],39);
 await photo('wheel',[-2.17,.52,-1.62],[-.80,.34,-1.24],36);
 await photo('exhaust',[.11,.305,2.68],[0,.257,2.04],38);
 await photo('lamps',[-.72,.73,2.87],[-.62,.66,2.05],31);
 await photo('tail',[.32,.75,3.8],[.18,.50,1.96],41);
 await page.locator('[data-camera=cockpit]').click();
 const state=()=>page.evaluate(()=>{const{car}=window.apexDiagnostics.inspect;return {key:car.ignition,running:car.running,rpm:car.rpm,gear:car.gear,oil:car.oilPressure}});
 const clickKey=async()=>{const p=await page.evaluate(()=>window.apexDiagnostics.controlPoint('key'));await page.mouse.click(p.x,p.y);};
 const operate=async(back=false)=>{
   if(back)await page.keyboard.down('Shift');
   await clickKey();if(back)await page.keyboard.up('Shift');
   return state();
 };
 await page.waitForTimeout(250);
 const sequence=[await state()];
 for(const key of ['OFF','ACC','ON','START']){const s=await operate();sequence.push(s);assert.equal(s.key,key);}
 await page.waitForTimeout(1250);sequence.push(await state());assert.ok(sequence.at(-1).running);
 await page.screenshot({path:out+'/cockpit.jpg',type:'jpeg',quality:94});
 await photo('cockpit-wide',[-.333,.99,.061],[-.17,.68,-.64],86);
 await photo('instruments',[-.333,.847,-.34],[-.333,.804,-.602],49);
 await photo('key',[-.575,.748,-.354],[-.545,.711,-.565],30);
 await photo('gate',[.125,.753,-.025],[-.018,.48,-.283],39);
 // Test the driver's manual controls against the actual gate position and both primary needles.
 await page.keyboard.press('t');const gears=[];
 for(const g of [1,2,3,4,5,4,3,2,1,0,-1]){
   await page.keyboard.press(gears.length<5?'e':'q');await page.waitForTimeout(330);
   const state=await page.evaluate(()=>{
     const {car,visual}=window.apexDiagnostics.inspect,lever=visual.group.getObjectByName('Gear lever');
     return {gear:car.gear,pitch:lever.rotation.x,roll:lever.rotation.z,automatic:car.automatic};
   });assert.equal(state.gear,g);assert.equal(state.automatic,false);
   const lane=g===0?0:g<2?-1:g<4?0:1,row=g===0?0:g===-1||g%2===0?-1:1;
   assert.ok(Math.abs(state.pitch-.46*row)<.005 && Math.abs(state.roll+.34*lane)<.005,JSON.stringify(state));gears.push(state);
 }
 const sync=await page.evaluate(()=>{
   const {car,visual}=window.apexDiagnostics.inspect,needle=(s)=>visual.group.getObjectByName(s+' needle').rotation.z;
   const expected=v=>(.5-Math.min(1,Math.max(0,v)))*Math.PI*1.48;
   return {rpmError:Math.abs(needle('RPM × 1000')-expected(car.rpm/8000)),speedError:Math.abs(needle('km/h')-expected(car.speed*3.6/320))};
 });
 assert.ok(sync.rpmError<.002 && sync.speedError<.002);
 await page.keyboard.press('l');await page.keyboard.press('h');
 await page.waitForFunction(()=>window.apexDiagnostics.inspect.visual.head.emissiveIntensity>1);
 const lights=await page.evaluate(()=>{const {car,visual}=window.apexDiagnostics.inspect;return {headlights:car.lights,hazards:car.turn,headIntensity:visual.head.emissiveIntensity};});
 assert.ok(lights.headlights && lights.hazards===2 && lights.headIntensity>1);
 await page.keyboard.down('Space');await page.waitForFunction(()=>window.apexDiagnostics.inspect.visual.brake.emissiveIntensity>2);await page.keyboard.up('Space');
 for(const key of ['ON','ACC','OFF','OUT']){const s=await operate(true);sequence.push(s);assert.equal(s.key,key);}
 await photo('paddock',[-113,4.2,216],[-129,4.2,203],53,true);
 await photo('viaduct',[235,8,-24],[215,14,15],57,true);
 await photo('overhead',[1,979,2],[1,0,1],50,true);
 const scenery=await page.evaluate(()=>{
   const {scene,T}=window.apexDiagnostics.inspect;
   let rockSpot,nearTree;
   for(const o of scene.children){
     if(!o.isInstancedMesh||!o.count)continue;
     const pos=new T.Vector3(),matrix=new T.Matrix4();
     for(let i=0;i<o.count;i++){
       o.getMatrixAt(i,matrix);pos.setFromMatrixPosition(matrix);
       if(!rockSpot && o.geometry.type==='IcosahedronGeometry' && pos.y>5&&pos.y<15)rockSpot=pos.toArray();
       if(!nearTree && o.name==='Silver birch'&&pos.y>2&&pos.y<12)nearTree=pos.toArray();
     }
   }return {rockSpot,nearTree};
 });
 const [x,y,z]=scenery.rockSpot;await photo('verge',[x+3.3,y+1.30,z+2.1],[x,y+.15,z],55,true);
 const [tx,ty,tz]=scenery.nearTree;await photo('trees',[tx+12,ty+3,tz+12],[tx,ty+4,tz],48,true);
 await page.keyboard.press('Escape');
 const physics=await page.evaluate(async()=>{
   const {car,T}=window.apexDiagnostics.inspect;
   const {stations,roadHalfWidth,nearestStation,sampleAt}=await import('/src/track.ts');
   const none={throttle:0,brake:0,steer:0,handbrake:false};
   function pass(name,index,offset,metres){
     car.reset(true);const first=stations[index],origin=first.p.clone().addScaledVector(first.right,offset);
     origin.y+=car.spec.bodyOrigin+.07;car.body.setTranslation(origin,true);
     const heading=Math.atan2(-first.forward.x,-first.forward.z);
     car.body.setRotation(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),heading),true);
     car.setIgnition();for(let j=0;j<170;j++)car.update(none);
     car.body.setLinvel(first.forward.clone().multiplyScalar(11),true);
     let min=Infinity,max=-Infinity,minLoad=Infinity,maxLoad=-Infinity,curb=0,all=0,endHeight=0,peakPitch=0;
     const start=car.travelled,startHeight=car.current.position.y;
     for(let step=0;step<1500&&car.travelled-start<metres;step++){
       const p=car.current.position,f=car.direction,near=nearestStation(p.x,p.z);
       const s=sampleAt(stations[near.index].distance+6),aim=s.p.clone().addScaledVector(s.right,offset).sub(p);
       const angle=Math.atan2(-f.z*aim.x+f.x*aim.z,f.x*aim.x+f.z*aim.z);
       car.update({...none,steer:T.MathUtils.clamp(2.7*angle,-1,1),throttle:T.MathUtils.clamp((11-car.speed)*.28+.16,0,.75)});
       if(step<15)continue;
       for(let k=0;k<4;k++){
         const grip=car.controller.wheelGroundObject(k)?.friction();
         if(Math.abs(grip-.83)<.001)curb++;
         const len=car.wheelState[k].length,load=car.controller.wheelSuspensionForce(k);
         min=Math.min(min,len);max=Math.max(max,len);minLoad=Math.min(minLoad,load);maxLoad=Math.max(maxLoad,load);
       }
       all+=Number(car.contacts===4);peakPitch=Math.max(peakPitch,Math.abs(Math.asin(car.direction.y)*180/Math.PI));endHeight=p.y;
     }
     return {name,metres:car.travelled-start,heightGain:endHeight-startHeight,springMinMm:min*1000,springMaxMm:max*1000,loadRangeN:[minLoad,maxLoad],curbWheelSamples:curb,allWheelSteps:all,peakPitchDeg:peakPitch};
   }
   // Identical segment and 11 m/s initial speed; the outboard pair runs onto the curb in the second pass.
   const starts=266;
   return [pass('asphalt',starts,0,45),pass('kerb',starts,roadHalfWidth-.50,45),pass('ascent',308,0,70),pass('viaduct',1040,0,45)];
 });
 writeFileSync(out+'/suspension.json',JSON.stringify(physics,null,2));
 assert.ok(physics[0].curbWheelSamples===0 && physics[1].curbWheelSamples>10,JSON.stringify(physics));
 assert.ok(physics[2].heightGain>3 && physics.every(r=>r.allWheelSteps>120),JSON.stringify(physics));

 const result={sequence,gears,sync,lights,errors};writeFileSync(out+'/inspection.json',JSON.stringify(result,null,2));assert.deepEqual(errors,[]);console.log(JSON.stringify(result));
}finally{await browser.close();}
