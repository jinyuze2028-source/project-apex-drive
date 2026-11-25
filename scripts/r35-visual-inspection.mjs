import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {launchTestBrowser} from './test-browser.mjs';

const [phase='after', output='test-evidence/r35-visual', port='4177']=process.argv.slice(2);
mkdirSync(output,{recursive:true});
const browser=await launchTestBrowser();
const errors=[];
try{
  const page=await browser.newPage({viewport:{width:1966,height:1206}});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('requestfailed',request=>errors.push(request.url()+' '+request.failure()?.errorText));
  await page.goto('http://127.0.0.1:'+port+'/?diagnostics&garage&vehicle=r35');
  await page.waitForFunction(()=>document.querySelector('#stage')?.dataset.ready==='true',null,{timeout:120000});
  await page.screenshot({path:output+'/showroom.jpg',type:'jpeg',quality:91});

  const studio=await page.evaluate(()=>{
    const {inspect:{T,visual,showroom,renderer}}=window.apexDiagnostics;
    const {scene}=showroom,{group}=visual;
    group.updateMatrixWorld(true);
    const [left,right]=visual.wheels.map(w=>w.pivot.getWorldPosition(new T.Vector3()));
    const go=(eye,target,fov=33)=>{
      const canvas=renderer.domElement,camera=new T.PerspectiveCamera(fov,canvas.width/canvas.height,.018,100);
      camera.position.fromArray(eye);camera.lookAt(new T.Vector3().fromArray(target));camera.layers.enable(1);
      renderer.render(scene,camera);
      return canvas.toDataURL('image/jpeg',.94).split(',')[1];
    };
    const shots={
      front:go([.06,1.58,-8.0],[0,.63,-.3]),
      side:go([-8.9,1.57,-.09],[0,.60,0],35),
      rear:go([-5.95,2.43,6.33],[0,.67,.12],36),
      tread:go([left.x-.81,left.y+.49,left.z-.91],[left.x+.025,left.y+.185,left.z-.10],31),
      sidewall:go([left.x-1.19,left.y+.195,left.z-.16],left.toArray(),34),
      brake:go([right.x+1.02,right.y+.20,right.z-.20],right.toArray(),29),
      tail:go([-1.40,1.36,5.15],[-.12,.54,2.17],34),
    };
    const pieces=group.children.filter(child=>child.visible&&child!==visual.wheels[0].pivot);
    for(const child of pieces)child.visible=false;
    try{
      shots['tread-profile']=go([left.x-.34,left.y+.12,left.z-.88],[left.x-.020,left.y+.04,left.z-.225],34);
    }finally{for(const child of pieces)child.visible=true;}
    const bounds={};
    group.traverse(node=>{
      if(node.isMesh&&/r35_(taillight|headlight|bumper|hood|door_R|fender).*(_0)$/.test(node.name)){
        const box=new T.Box3().setFromObject(node,true);
        bounds[node.name]=[box.min.sub(group.position).toArray(),box.max.sub(group.position).toArray()];
      }
    });
    const triangleCount=geometry=>(geometry.index?.count??geometry.attributes.position.count)/3;
    const wheelGeometry=new Set(),tyreTextures=new Set();
    for(const {pivot} of visual.wheels){
      pivot.traverse(node=>{
        if(!node.isMesh)return;
        wheelGeometry.add(node.geometry);
        for(const material of [node.material].flat())
          for(const texture of Object.values(material))if(texture?.isTexture)tyreTextures.add(texture);
      });
    }
    const geometryBytes=[...wheelGeometry].reduce((sum,g)=>sum+(g.index?.array.byteLength??0)+
      Object.values(g.attributes).reduce((a,b)=>a+b.array.byteLength,0),0);
    const lod=visual.wheels[0].roller.getObjectByName('R35 tyre distance LOD');
    const meshResources={geometryBytes,allocatedUniqueTriangles:[...wheelGeometry].reduce((sum,g)=>sum+triangleCount(g),0),
      tyreLevels:lod?.levels.map(level=>({distance:level.distance,
        triangles:level.object.children.reduce((sum,mesh)=>sum+triangleCount(mesh.geometry),0)})),
      textureSizes:[...tyreTextures].map(t=>[t.image.width,t.image.height]),
      tyreTextureApproxBytes:[...tyreTextures].reduce((sum,t)=>sum+t.image.width*t.image.height*4*(t.generateMipmaps?4/3:1),0)};
    return {shots,bounds,meshResources};
  });
  for(const [name,jpeg] of Object.entries(studio.shots))writeFileSync(output+'/'+name+'.jpg',Buffer.from(jpeg,'base64'));
  writeFileSync(output+'/anchors.json',JSON.stringify(studio.bounds,null,2));
  const wheel=page.locator('[data-showroom=wheel]');
  if(await wheel.isVisible()){
    await wheel.click({noWaitAfter:true});
    await page.waitForTimeout(420);
    await page.screenshot({path:output+'/showroom-wheel.jpg',type:'jpeg',quality:91});
    await page.locator('[data-showroom=reset]').evaluate(button=>button.click());
  }
  await page.locator('#garage-drive').evaluate(button=>button.click());

  const sample=async()=>{
    await page.waitForTimeout(2400);
    const start=await page.evaluate(()=>window.apexDiagnostics.state().fpsSamples.length);
    await page.waitForTimeout(5400);
    const state=await page.evaluate(()=>window.apexDiagnostics.state());
    const frames=state.fpsSamples.slice(start);
    assert.ok(frames.length>50);
    const sorted=frames.toSorted((a,b)=>a-b);
    const elapsedMs=frames.reduce((a,b)=>a+b);
    return {fps:1000*frames.length/elapsedMs,frames:frames.length,elapsedMs,
      p95Ms:sorted[Math.floor(sorted.length*.95)],longestMs:sorted.at(-1),
      framesOver100Ms:frames.filter(ms=>ms>100).length,buffer:state.buffer,draws:state.draws,triangles:state.triangles,
      speed:state.speed,contacts:state.contacts};
  };
  const chase=await sample();
  const staticContact=await page.evaluate(()=>{
    const {inspect:{visual,car,T}}=window.apexDiagnostics;
    return visual.wheels.map(({pivot},i)=>{
      const contact=car.controller.wheelContactPoint(i);
      const hub=pivot.getWorldPosition(new T.Vector3());
      return {connected:car.controller.wheelIsInContact(i),gapMm:contact?(hub.y-car.spec.radius-contact.y)*1000:null};
    });
  });
  assert.equal(staticContact.filter(w=>w.connected).length,4);
  assert.ok(staticContact.every(w=>w.gapMm!==null&&Math.abs(w.gapMm)<25),JSON.stringify(staticContact));
  await page.screenshot({path:output+'/track.jpg',type:'jpeg',quality:91});
  await page.locator('[data-camera=cockpit]').evaluate(button=>button.click());
  const cockpit=await sample();
  await page.screenshot({path:output+'/cockpit.jpg',type:'jpeg',quality:91});
  await page.locator('#ignition').evaluate(button=>button.click());
  await page.waitForFunction(()=>window.apexDiagnostics.state().running);
  await page.keyboard.down('w');
  await page.waitForTimeout(2500);
  await page.keyboard.up('w');
  await page.keyboard.down('a');
  await page.waitForTimeout(400);
  const driving=await page.evaluate(()=>{
    const {inspect:{visual,car,T},state}=window.apexDiagnostics;
    const snapshot=state(),motion=visual.wheels.map(({pivot,roller},i)=>{
      const wheel=car.wheelState[i],low=Math.min(wheel.spin,wheel.previousSpin),high=Math.max(wheel.spin,wheel.previousSpin);
      return {steer:pivot.rotation.y,spin:roller.rotation.x,
        steerError:Math.abs(pivot.rotation.y-T.MathUtils.clamp(pivot.rotation.y,
          Math.min(wheel.steer,wheel.previousSteer),Math.max(wheel.steer,wheel.previousSteer))),
        spinError:Math.max(0,low+roller.rotation.x,-roller.rotation.x-high),
        suspensionError:Math.abs(pivot.position.y-(car.spec.mountHeight-T.MathUtils.clamp(car.spec.mountHeight-pivot.position.y,
          Math.min(wheel.length,wheel.previousLength),Math.max(wheel.length,wheel.previousLength))))};
    });
    return {speedKmh:snapshot.speed*3.6,contacts:snapshot.contacts,motion};
  });
  await page.keyboard.up('a');
  assert.ok(driving.speedKmh>40,JSON.stringify(driving));
  assert.ok(driving.contacts>=3);
  assert.ok(driving.motion.every(w=>w.steerError<1e-7&&w.spinError<1e-7&&w.suspensionError<1e-7));

  await page.locator('[data-camera=chase]').evaluate(button=>button.click());
  const lampLevels=()=>page.evaluate(()=>{
    const {inspect:{visual,car}}=window.apexDiagnostics;
    return {headlights:car.lights,braking:car.brakeLight,
      tail:visual.group.getObjectByName('Tail LED guides')?.material.emissiveIntensity??null,
      stop:visual.group.getObjectByName('Brake LED guides')?.material.emissiveIntensity??null,
      head:visual.group.getObjectByName('Front LED track')?.material.emissiveIntensity??null};
  });
  const off=await lampLevels();
  await page.keyboard.press('l');
  await page.waitForFunction(()=>window.apexDiagnostics.state().lights);
  const running=await lampLevels();
  await page.keyboard.down('s');
  try{
    await page.waitForFunction(()=>window.apexDiagnostics.inspect.car.brakeLight,null,{timeout:4000});
    const brake=await lampLevels();
    if(off.tail!==null){
      assert.ok(running.head>off.head&&running.tail>off.tail,JSON.stringify({off,running}));
      assert.ok(brake.stop>running.stop&&brake.tail>running.tail,JSON.stringify({running,brake}));
    }
    const result={phase,chase,cockpit,staticContact,driving,lights:{off,running,brake},
      meshResources:studio.meshResources,errors};
    writeFileSync(output+'/results.json',JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
    assert.deepEqual(errors,[]);
  }finally{await page.keyboard.up('s');}
}finally{
  await browser.close();
}
