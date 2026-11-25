import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {launchTestBrowser} from './test-browser.mjs';

const [port='4177',output='test-evidence/garage']=process.argv.slice(2);
mkdirSync(output,{recursive:true});
const browser=await launchTestBrowser();
const errors=[],loaded=[];
const result={errors,switches:[],performance:{},laps:{},audio:{},controls:{}};
try{
  const browserCdp=await browser.newBrowserCDPSession();
  const page=await browser.newPage({viewport:{width:1966,height:1206},deviceScaleFactor:1});
  const cdp=await page.context().newCDPSession(page);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
  page.on('response',res=>{if(res.status()>=400)errors.push(res.status()+' '+res.url());loaded.push(res.url());});
  await page.goto('http://127.0.0.1:'+port+'/?diagnostics&garage=1',{waitUntil:'domcontentloaded'});
  await page.locator('#stage[data-ready=true]').waitFor({timeout:90000});
  const read=()=>page.evaluate(()=>window.apexDiagnostics.state());
  const capture=name=>page.screenshot({path:output+'/'+name+'.jpg',quality:92});
  const toggleView=name=>page.locator('[data-camera='+name+']').click();
  const showroom=name=>page.locator('[data-showroom='+name+']').click();
  const waitVehicle=id=>page.locator('#stage[data-vehicle='+id+']').waitFor({timeout:35000});
  const memory=async()=>{
    await cdp.send('HeapProfiler.collectGarbage');
    const heap=await cdp.send('Runtime.getHeapUsage');
    const {processInfo}=await browserCdp.send('SystemInfo.getProcessInfo');
    const entries=processInfo.filter(p=>p.type==='renderer'||p.type==='GPU');
    const output=execFileSync('ps',['-o','pid=,rss=','-p',entries.map(entry=>entry.id).join(',')],{encoding:'utf8'}).trim();
    const rss=new Map(output.split('\n').map(line=>line.trim().split(/\s+/).map(Number)));
    const stats=await page.evaluate(()=>{
      const {renderer}=window.apexDiagnostics.inspect;
      return {textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries};
    });
    return {heapMiB:heap.usedSize/1048576,rendererMiB:entries.filter(x=>x.type==='renderer').reduce((s,p)=>s+(rss.get(p.id)??0)/1024,0),
      gpuMiB:entries.filter(x=>x.type==='GPU').reduce((s,p)=>s+(rss.get(p.id)??0)/1024,0),...stats};
  };
  async function swap(id){
    await page.locator('[data-vehicle='+id+']').click();
    await waitVehicle(id);
    const state=await read();
    assert.equal(state.liveRigidBodies,1);
    const counts=await page.evaluate(()=>{
      const {scene,showroom,visual}=window.apexDiagnostics.inspect;
      return {garage:showroom.scene.children.filter(n=>n===visual.group).length,track:scene.children.filter(n=>n===visual.group).length};
    });
    assert.deepEqual(counts,{garage:1,track:0});
    result.switches.push({id,bodyCount:state.liveRigidBodies,memory:await memory()});
  }
  assert.equal((await read()).inGarage,true);
  assert.ok(!loaded.some(url=>url.endsWith('r35-rally.glb')));
  await capture('f40-showroom');
  await page.locator('#garage-select').click();
  await swap('r35');
  await capture('r35-showroom');
  for(const view of ['front','side','rear']){
    await showroom(view);await capture('r35-'+view);
  }
  const canvas=await page.locator('#scene canvas').boundingBox();
  await page.mouse.move(canvas.x+canvas.width*.74,canvas.y+canvas.height*.39);
  await page.mouse.down();await page.mouse.move(canvas.x+canvas.width*.83,canvas.y+canvas.height*.32,{steps:9});await page.mouse.up();
  await page.mouse.wheel(0,-250);
  await showroom('reset');
  await page.locator('#garage-special').click();
  await page.locator('#garage-audio').click();
  await page.waitForFunction(()=>window.apexDiagnostics.inspect.car.running);
  await showroom('cockpit');await capture('r35-cockpit-preview');
  await page.locator('#garage-drive').click();
  await page.keyboard.press('i');
  await page.waitForFunction(()=>window.apexDiagnostics.inspect.car.running);
  await toggleView('cockpit');
  async function hear(id){
    await page.waitForFunction(()=>window.apexDiagnostics.inspect.audio.ready===true);
    const initial=await page.evaluate(()=>{
      const {audio}=window.apexDiagnostics.inspect;
      const analyser=audio.context.createAnalyser();
      audio.output.connect(analyser);
      window.apexAudioCheck=()=>{
        const samples=new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(samples);
        return {state:audio.context.state,rms:Math.sqrt(samples.reduce((sum,v)=>sum+v*v,0)/samples.length)};
      };
      return audio.context.state;
    });
    assert.equal(initial,'running');
    await page.waitForFunction(()=>window.apexAudioCheck().rms>.001,null,{timeout:10000});
    result.audio[id]=await page.evaluate(()=>window.apexAudioCheck());
  }
  await hear('r35');
  await capture('r35-cockpit');
  async function inspectClick(action){
    const point=await page.evaluate(action=>window.apexDiagnostics.controlPoint(action),action);
    assert.ok(point,action);
    await page.mouse.click(point.x,point.y);
  }
  await inspectClick('transmission');
  assert.equal(await page.evaluate(()=>window.apexDiagnostics.inspect.car.automatic),false);
  const waitForGear = gear => page.waitForFunction(gear => {
    const car = window.apexDiagnostics.inspect.car;
    return car.indicatedGear === gear && !car.isShifting;
  }, gear);
  await inspectClick('shift-up');
  await waitForGear(1);
  await page.keyboard.press('e');
  await waitForGear(2);
  await page.keyboard.press('q');
  await waitForGear(1);
  await inspectClick('wiper');
  await page.waitForFunction(()=>document.querySelector('#signal').textContent.includes('WIPER LOW'));
  await inspectClick('hazard');
  assert.equal((await read()).turn,2);
  await inspectClick('transmission');
  assert.equal(await page.evaluate(()=>window.apexDiagnostics.inspect.car.automatic),true);
  result.controls={paddle:true,transmission:true,wiper:true,hazards:true};

  async function runningFrames(view){
    await toggleView(view);
    const start=await read();
    await page.waitForTimeout(700);
    const before=await read();
    await page.keyboard.down('w');
    try{await page.waitForTimeout(4800);}finally{await page.keyboard.up('w');}
    const after=await read();
    assert.ok(after.travelled>13&&after.speed>4,JSON.stringify({view,before,after}));
    const samples=after.fpsSamples.slice(before.fpsSamples.length).filter(ms=>ms>0);
    const sorted=samples.toSorted((a,b)=>a-b);
    const fps=samples.length*1000/samples.reduce((sum,value)=>sum+value,0);
    const p95=sorted[Math.floor(sorted.length*.95)];
    await page.keyboard.press('r');
    return {view,fps,p95,buffer:after.buffer,draws:after.draws,triangles:after.triangles,initialSpeed:start.speed,
      peakKmh:after.speed*3.6,contactAtEnd:after.contacts};
  }
  async function timedLap(id){
    await page.keyboard.press('r');await page.keyboard.press('Escape');
    const report=await page.evaluate(async()=>{
      const d=window.apexDiagnostics,{car,marks,wear,laps,T}=d.inspect;
      const {courseLength,nearestStation,sampleAt,stations,section}=await import('/src/track.ts');
      const n=stations.length-1,spacing=courseLength/n, clamp=T.MathUtils.clamp;
      const seen=new Set(),gears=new Set(),start=car.travelled,firstMarks=marks.total,firstWear=wear.deposits;
      let node=nearestStation(car.current.position.x,car.current.position.z).index;
      let maxDeviation=0,minContacts=4,peakSpeed=0,ticks=0,maxFront=0,airborne=0,longestAir=0,airSector='';
      const limits=car.spec.steering.lock;
      function limit(kmh){
        const i=limits.findIndex(([speed])=>speed>=kmh);
        if(i<=0)return limits[i<0?limits.length-1:0][1];
        const [a,b]=[limits[i-1],limits[i]];
        return T.MathUtils.lerp(a[1],b[1],(kmh-a[0])/(b[0]-a[0]));
      }
      for(;ticks<120*390&&laps.count===0;ticks+=2){
        const p=car.current.position,f=car.direction,v=car.speed;
        let closest=Infinity,index=node;
        for(let i=node-8;i<=node+10;i++){
          const a=stations[T.MathUtils.euclideanModulo(i,n)].p,distance=(p.x-a.x)**2+(p.z-a.z)**2;
          if(distance<closest){closest=distance;index=i;}
        }
        node=index;
        const arc=node*spacing, target=sampleAt(arc+4.5+v*.52),current=sampleAt(arc);
        const dx=target.p.x-p.x,dz=target.p.z-p.z;
        const error=Math.atan2(-f.z*dx+f.x*dz,f.x*dx+f.z*dz);
        const curvature=Math.abs(current.forward.angleTo(sampleAt(arc+12+v*.54).forward));
        const desired=clamp(23.8-curvature*27-Math.abs(error)*10,7.4,24.0);
        const referenceSteer=19.8*.65;
        const gain=car.spec.awd?clamp(referenceSteer/limit(v*3.6),.62,2.12):1;
        const steer=clamp(error*(1.85+v*.048)*gain,-1,1);
        d.advance(2,{throttle:clamp((desired-v)*.36+.17,0,.93),
          brake:clamp((v-desired-.48)*.29,0,.85),steer,handbrake:false});
        minContacts=Math.min(minContacts,car.contacts);
        airborne=car.contacts===0?airborne+2/120:0;
        if(airborne>longestAir){longestAir=airborne;airSector=section(T.MathUtils.euclideanModulo(node,n));}
        maxDeviation=Math.max(maxDeviation,Math.sqrt(closest));
        peakSpeed=Math.max(peakSpeed,car.speed*3.6);
        maxFront=Math.max(maxFront,car.frontTorqueShare);
        gears.add(car.gear);
        if(ticks%60===0)seen.add(section(T.MathUtils.euclideanModulo(node,n)));
        if(closest>64||d.railContact())break;
      }
      return {count:laps.count,best:laps.best,last:laps.last,why:laps.reason,distance:car.travelled-start,
        marks:marks.total-firstMarks,wear:wear.deposits-firstWear,gears:[...gears],seen:[...seen],maxDeviation,minContacts,
        peakSpeed,maxFront,ticks,longestAir,airSector};
    });
    assert.ok(report.count===1&&report.distance>5000&&report.marks>0&&report.seen.length>=8,JSON.stringify(report));
    await page.keyboard.press('Escape');
    await page.locator('#lap-summary').click();
    await capture(id+'-completed-lap');
    await page.locator('#lap-summary').click();
    result.laps[id]=report;
  }
  result.performance.r35=[await runningFrames('cockpit'),await runningFrames('chase')];
  result.performance.r35Memory=await memory();
  await page.keyboard.press('Escape');
  for(const [name,from,towards] of [
    ['r35-wheel-detail',[-2.4,.52,-2.23],[-.78,.12,-1.33]],
    ['r35-tail-detail',[-2.1,.89,4.05],[.05,.43,2.13]],
  ]){
    const base64=await page.evaluate(({from,towards})=>{
      const {visual,scene,T,renderer,camera}=window.apexDiagnostics.inspect;
      const close=new T.PerspectiveCamera(35,camera.aspect,.03,180);
      close.layers.enable(1);
      close.position.copy(visual.group.localToWorld(new T.Vector3(...from)));
      close.lookAt(visual.group.localToWorld(new T.Vector3(...towards)));
      renderer.render(scene,close);
      return renderer.domElement.toDataURL('image/jpeg',.91).split(',')[1];
    },{from,towards});
    writeFileSync(output+'/'+name+'.jpg',Buffer.from(base64,'base64'));
  }
  await page.keyboard.press('Escape');
  await timedLap('r35');
  await page.locator('#open-garage').click();
  await swap('f40');
  await page.locator('#garage-drive').click();await page.keyboard.press('i');
  await page.waitForFunction(()=>window.apexDiagnostics.inspect.car.running);
  await hear('f40');
  result.performance.f40=[await runningFrames('cockpit'),await runningFrames('chase')];
  result.performance.f40Memory=await memory();
  await timedLap('f40');
  await page.locator('#open-garage').click();
  await swap('r35');await swap('f40');await swap('r35');
  const stored=await page.evaluate(()=>Object.entries(localStorage).filter(([key])=>key.startsWith('apex.laps.'))
    .map(([key,value])=>({key,...JSON.parse(value)})));
  assert.equal(stored.filter(l=>l.count===1).length,2);
  assert.equal(await page.evaluate(()=>localStorage.getItem('apex.vehicle')),'r35');
  result.history=stored;
  assert.deepEqual(errors,[]);
}finally{
  await browser.close();
  writeFileSync(output+'/results.json',JSON.stringify(result,null,2));
}
