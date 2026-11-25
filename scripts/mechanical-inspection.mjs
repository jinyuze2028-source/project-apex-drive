import {launchTestBrowser} from './test-browser.mjs';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const [port='4177',output='verification/round8']=process.argv.slice(2);
const out=resolve(output);
mkdirSync(out,{recursive:true});
const browser=await launchTestBrowser();
const errors=[];
try{
  const page=await browser.newPage({viewport:{width:1966,height:1206},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400)errors.push(r.url());});
  await page.goto('http://127.0.0.1:'+port+'/?diagnostics');
  await page.waitForFunction(()=>document.querySelector('#stage').dataset.ready==='true'||document.querySelector('#loading.error'),{},{timeout:100000});
  assert.equal(await page.locator('#stage').getAttribute('data-ready'),'true',await page.locator('#loading').innerText());
  const state=()=>page.evaluate(()=>window.apexDiagnostics.state());
  const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const screen=async(name)=>{await frames();await page.screenshot({path:out+'/'+name+'.jpg',quality:93});};
  const save=(name,base64)=>writeFileSync(out+'/'+name,Buffer.from(base64,'base64'));
  async function clickControl(name){
    await frames();
    const point=await page.evaluate(name=>window.apexDiagnostics.controlPoint(name),name);
    await page.mouse.click(point.x,point.y);
  }

  await page.keyboard.press('i');
  await page.waitForFunction(()=>window.apexDiagnostics.inspect.audio.ready&&window.apexDiagnostics.inspect.car.running,{},{timeout:25000});
  await screen('cockpit');
  const sound=await page.evaluate(async()=>{
    const {audio,car}=window.apexDiagnostics.inspect,context=audio.context;
    const destination=context.createMediaStreamDestination(),meter=context.createAnalyser();
    meter.fftSize=4096;
    audio.output.connect(destination);audio.output.connect(meter);
    const buffer=new Float32Array(meter.fftSize),spectrum=new Float32Array(meter.frequencyBinCount);
    const parts=[],recorder=new MediaRecorder(destination.stream,{mimeType:'audio/webm;codecs=opus'});
    recorder.ondataavailable=e=>parts.push(e.data);
    const done=new Promise(r=>{recorder.onstop=async()=>{
      const blob=new Blob(parts,{type:recorder.mimeType});
      const reader=new FileReader();reader.onload=()=>r(reader.result.split(',')[1]);reader.readAsDataURL(blob);
    };});
    recorder.start();
    window.apexAudioQA={
      meter(){
        meter.getFloatTimeDomainData(buffer);meter.getFloatFrequencyData(spectrum);
        const band=(low,high)=>spectrum.slice(Math.ceil(low*buffer.length/context.sampleRate),Math.floor(high*buffer.length/context.sampleRate))
          .reduce((sum,db)=>sum+(Number.isFinite(db)?10**(db/10):0),0);
        return {rpm:car.rpm,load:car.throttleLoad,boost:car.boostBar,speed:car.speed,view:document.querySelector('#stage').dataset.view,
          rms:Math.sqrt(buffer.reduce((sum,s)=>sum+s*s,0)/buffer.length),bass:band(60,500),presence:band(500,2800)};
      },
      async stop(){recorder.stop();const file=await done;audio.output.disconnect(destination);audio.output.disconnect(meter);return file;},
    };
    return {state:context.state,sampleRate:context.sampleRate};
  });
  const audioMeter=()=>page.evaluate(()=>window.apexAudioQA.meter());
  sound.idle=await audioMeter();
  await page.keyboard.down('w');
  await page.waitForFunction(()=>window.apexDiagnostics.inspect.car.rpm>4700&&window.apexDiagnostics.inspect.car.throttleLoad>.93,null,{timeout:12000});
  sound.load=await audioMeter();
  await page.keyboard.press('c');await page.waitForTimeout(370);
  sound.chase=await audioMeter();
  await page.keyboard.up('w');
  await page.waitForTimeout(550);sound.lift=await audioMeter();
  save('engine-audio.webm',await page.evaluate(()=>window.apexAudioQA.stop()));
  assert.ok(sound.idle.rms>.003&&sound.load.rms>.025&&sound.load.rpm>sound.idle.rpm&&sound.lift.load<.1);
  assert.equal(sound.chase.view,'chase');

  await page.keyboard.press('r');
  await page.locator('[data-camera=cockpit]').click();
  await page.keyboard.press('t');
  await page.keyboard.press('g');await screen('shifter');
  const gearBefore=await state();
  await clickControl('shift');
  await page.waitForFunction(gear=>window.apexDiagnostics.inspect.car.gear>gear,gearBefore.gear);
  await page.waitForTimeout(325);
  const gearAfter=(await state()).gear;
  const actualLever=await page.evaluate(()=>window.apexDiagnostics.inspect.visual.group.getObjectByName('Gear lever').quaternion.toArray());
  assert.ok(actualLever.some((value,i)=>i<3&&Math.abs(value)>.07));
  await page.keyboard.press('v');
  const inspectDials=()=>page.evaluate(()=>{
    const {visual}=window.apexDiagnostics.inspect;
    return ['OIL bar','OIL °C','H₂O °C'].map(name=>{
      const gauge=visual.group.getObjectByName(name+' gauge');
      const material=gauge.children.find(o=>o.material?.uniforms?.dial).material;
      return {name,width:material.uniforms.dial.value.image.width,backlight:material.uniforms.backlight.value};
    });
  });
  const dim=await inspectDials();
  await page.locator('#settings').click();
  await page.locator('#dial-lighting').fill('1');
  await page.getByRole('button',{name:'Close settings'}).click();
  await frames();
  const bright=await inspectDials();
  assert.ok(dim.every(g=>g.width===1024)&&bright.every(g=>g.backlight===1));
  const detail=await page.evaluate(()=>{
    const {T,visual,camera,scene,renderer}=window.apexDiagnostics.inspect;
    const c=camera.clone(),point=visual.group.getObjectByName('Auxiliary instruments').getWorldPosition(new T.Vector3());
    c.lookAt(point);c.fov=25;c.updateProjectionMatrix();renderer.render(scene,c);
    return renderer.domElement.toDataURL('image/jpeg',.95).split(',')[1];
  });
  save('auxiliary-gauges.jpg',detail);

  const popup=()=>page.evaluate(()=>{
    const {visual}=window.apexDiagnostics.inspect,p=visual.popups;
    return {angle:[...p.units].map(t=>t.pivot.rotation.x),beam:[...p.units].map(t=>t.beam.intensity),position:p.extension};
  });
  await clickControl('popup');
  await page.waitForFunction(()=>window.apexDiagnostics.inspect.visual.popups.extension===1,null,{timeout:5000});await frames();
  await page.keyboard.press('o');await screen('headlights-raised');const open=await popup();
  assert.ok(open.beam.every(n=>n>275)&&open.angle.every(n=>Math.abs(n-.80)<.001));
  await page.keyboard.press('p');
  await page.waitForFunction(()=>window.apexDiagnostics.inspect.visual.popups.extension===0,null,{timeout:5000});await frames();
  const closed=await popup();
  assert.ok(closed.beam.every(n=>n===0)&&closed.angle.every(n=>Math.abs(n)<.0001));
  await screen('headlights-closed');
  const canvas=await page.locator('#scene canvas').boundingBox();
  const beforeOrbit=await page.evaluate(()=>window.apexDiagnostics.inspect.camera.position.toArray());
  await page.mouse.move(canvas.x+canvas.width*.58,canvas.y+canvas.height*.57);
  await page.mouse.down();await page.mouse.move(canvas.x+canvas.width*.33,canvas.y+canvas.height*.57,{steps:10});await page.mouse.up();
  await page.mouse.wheel(0,-155);await screen('orbit-side');
  const afterOrbit=await page.evaluate(()=>window.apexDiagnostics.inspect.camera.position.toArray());
  assert.ok(Math.hypot(...beforeOrbit.map((x,i)=>x-afterOrbit[i]))>2);
  await page.locator('[data-camera=chase]').click();
  const lightTrace=await page.evaluate(()=>{
    const {T,gantry,camera,renderer,scene}=window.apexDiagnostics.inspect;
    const tower=scene.getObjectByName('Apex start gantry');
    const c=camera.clone(),p=tower.position;
    c.position.set(p.x-2.4,p.y+3.65,p.z+17);c.lookAt(p.x,p.y+4.9,p.z);c.fov=37;c.updateProjectionMatrix();
    return new Promise((resolve,reject)=>{
      const transitions=[],t0=performance.now();let atFive='',out='';
      function step(now){
        const signal=gantry.signal;
        const actual=tower.children.filter(o=>o.name.startsWith('Start red ')&&o.material.emissiveIntensity>1).length/2;
        const id=signal.phase+':'+signal.count;
        if(signal.phase!=='idle'&&transitions.at(-1)?.id!==id)transitions.push({id,actual,time:now-t0});
        if(signal.count===5&&!atFive){
          renderer.render(scene,c);atFive=renderer.domElement.toDataURL('image/jpeg',.94).split(',')[1];
        }
        if(signal.phase==='go'){
          renderer.render(scene,c);out=renderer.domElement.toDataURL('image/jpeg',.94).split(',')[1];
          resolve({transitions,atFive,out});return;
        }
        if(now-t0>13000){reject(Error('Start light test timed out'));return;}
        requestAnimationFrame(step);
      }
      document.querySelector('#test-start-lights').click();requestAnimationFrame(step);
    });
  });
  assert.deepEqual(lightTrace.transitions.filter(t=>t.id!=='countdown:0').map(t=>t.id),['countdown:1','countdown:2','countdown:3','countdown:4','countdown:5','go:0']);
  assert.equal(lightTrace.transitions.at(-1).actual,0);
  save('five-reds.jpg',lightTrace.atFive);save('lights-out.jpg',lightTrace.out);

  await page.keyboard.press('Escape');
  const surface=await page.evaluate(async()=>{
    const d=window.apexDiagnostics,{T,marks,wear,car,camera,renderer,scene}=d.inspect;
    const {sampleAt,lineDistance}=await import('/src/track.ts');
    const straight=sampleAt(lineDistance+116),p=straight.p;
    const throttle={throttle:0,brake:0,steer:0,handbrake:false};
    function prepare(offset){
      car.reset();marks.disconnect();car.body.setTranslation({x:p.x+offset,y:p.y+.39,z:p.z},true);
      car.body.setRotation({x:0,y:0,z:0,w:1},true);
      d.advance(65,throttle);
    }
    marks.clear();
    prepare(.22);car.body.setLinvel({x:0,y:0,z:-19},true);d.advance(122,throttle);
    const max=()=>wear.texture.image.data.reduce((value,current)=>Math.max(value,current),0);
    const first={normal:wear.deposits,skid:marks.total,max:max()};
    prepare(.22);car.body.setLinvel({x:0,y:0,z:-19},true);d.advance(122,throttle);
    const second={normal:wear.deposits,skid:marks.total,max:max()};
    prepare(-2.62);
    car.body.setLinvel({x:-11,y:0,z:-26},true);
    for(let i=0;i<60;i++)d.advance(1,{...throttle,brake:.1});
    marks.flush(performance.now()/1000+1);
    const amount=marks.geometry.drawRange.count/6,lines=[p.x-4.02,p.x-5.38];
    const coord=marks.geometry.attributes.position;
    const joins=lines.map(x=>Array.from({length:amount},(_,j)=>j).filter(j=>{
      const left=(coord.getX(j*4)+coord.getX(j*4+1))*.5,right=(coord.getX(j*4+2)+coord.getX(j*4+3))*.5;
      return (left-x)*(right-x)<=0;
    }).length);
    const c=camera.clone();
    c.position.set(p.x-6.0,p.y+5.9,p.z-6);c.lookAt(p.x-3.3,p.y,p.z-3.0);c.fov=47;c.updateProjectionMatrix();
    renderer.render(scene,c);
    const photo=renderer.domElement.toDataURL('image/jpeg',.96).split(',')[1];
    marks.mesh.visible=false;renderer.render(scene,c);marks.mesh.visible=true;
    const comparison=renderer.domElement.toDataURL('image/jpeg',.96).split(',')[1];
    return {first,second,lines,joins,amount,photo,comparison,gl:renderer.getContext().getError()};
  });
  save('surface-and-rubber.jpg',surface.photo);save('surface-without-slip.jpg',surface.comparison);
  delete surface.photo;delete surface.comparison;
  const result={gearBefore:gearBefore.gear,gearAfter,actualLever,dim,bright,open,closed,sound,
    lightTrace:lightTrace.transitions,surface,errors};
  writeFileSync(out+'/inspection.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
  assert.ok(surface.first.normal>20&&surface.first.skid===0&&surface.second.max>surface.first.max);
  assert.ok(surface.joins.every(n=>n>0)&&surface.gl===0,JSON.stringify(surface));
  assert.deepEqual(errors,[]);
}finally{
  await browser.close();
}
