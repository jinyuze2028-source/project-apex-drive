import assert from 'node:assert/strict';
import {launchTestBrowser} from './test-browser.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const [port='4177',output='verification/chase',version='after']=process.argv.slice(2);
const dir=resolve(output);
mkdirSync(dir,{recursive:true});
const browser=await launchTestBrowser();
const errors=[];
try {
  const page=await browser.newPage({viewport:{width:1966,height:1206},deviceScaleFactor:1});
  page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+port+'/?diagnostics');
  await page.waitForFunction(()=>document.querySelector('#stage')?.dataset.ready==='true',null,{timeout:100000});
  await page.keyboard.press('Escape');
  await page.evaluate(async()=>{
    const d=window.apexDiagnostics,{car,T,visual,camera,scene,renderer}=d.inspect;
    const {sampleAt,surveyMeters,stations,courseLength,lineDistance,nearestStation}=await import('/src/track.ts');
    const input={throttle:0,brake:0,steer:0,handbrake:false};
    const forward=new T.Vector3(),right=new T.Vector3(),up=new T.Vector3(),matrix=new T.Matrix4(),rotation=new T.Quaternion();
    function place(arc,speed,offset=0){
      const station=sampleAt(arc);
      forward.copy(station.forward);right.copy(station.right);
      up.crossVectors(right,forward).normalize();right.crossVectors(forward,up).normalize();
      rotation.setFromRotationMatrix(matrix.makeBasis(right,up,forward.clone().negate()));
      car.reset(true);
      const p=station.p.clone().addScaledVector(station.right,offset).addScaledVector(up,car.spec.bodyOrigin+.032);
      car.body.setTranslation(p,true);car.body.setRotation(rotation,true);
      car.setIgnition();
      d.advance(150,input);
      car.body.setLinvel(forward.clone().multiplyScalar(speed),true);
      d.advance(1,input);
    }
    const pairs=(arc,speed,trace)=>{
      place(arc,speed);
      const samples=[];
      for(const [frames,steer] of trace)for(let tick=0;tick<frames;tick++){
        d.advance(1,{...input,steer,throttle:.18});
        samples.push([...car.current.position,car.speed,car.wheelState[0].steer,car.wheelState[1].steer,
          car.body.angvel().y,car.contacts]);
      }
      return samples;
    };
    const limit=()=>T.MathUtils.degToRad(car.spec.steering.lock.reduce((result,[speed,deg],i,table)=>{
      if(i===0)return deg;
      const [start,prev]=table[i-1],kph=car.speed*3.6;
      return kph>=start?T.MathUtils.lerp(prev,deg,Math.min(1, (kph-start)/(speed-start))):result;
    },0));
    function follow(initial,speed,keyboard=true){
      const n=stations.length-1;
      let index=nearestStation(sampleAt(initial).p.x,sampleAt(initial).p.z).index;
      return ()=>{
        const p=car.current.position,f=car.direction,v=car.speed;
        let best=Infinity,bestIndex=index;
        for(let search=index-12;search<=index+12;search++){
          const s=stations[T.MathUtils.euclideanModulo(search,n)];
          const dx=s.p.x-p.x,dz=s.p.z-p.z;
          if(dx*dx+dz*dz<best){best=dx*dx+dz*dz;bestIndex=search;}
        }
        index=bestIndex;
        const arc=index*courseLength/n;
        const target=sampleAt(arc+4.8+v*.48).p;
        const dx=target.x-p.x,dz=target.z-p.z;
        const angle=Math.atan2(-f.z*dx+f.x*dz,f.x*dx+f.z*dz);
        const desired=T.MathUtils.clamp(angle*(1.9+v*.058),-1,1);
        const error=desired+car.steer/limit();
        const steer=keyboard?(Math.abs(error)>.065?Math.sign(error):0):desired;
        return {data:{throttle:T.MathUtils.clamp((speed-v)*.38+.15,0,.92),
                      brake:T.MathUtils.clamp((v-speed-.48)*.33,0,.8),steer,handbrake:false},
          index,arc,offset:Math.sqrt(best)};
      };
    }
    function drive(start,end,speed){
      place(start,speed);
      const ctl=follow(start,speed),heading=car.direction.clone();
      let elapsed=0,distance=start,maxOffset=0,observedFirst=false,observedSecond=false;
      let minSpeed=99,maxSpeed=0,yaw=0,minContacts=4,hit=false,headingChange=0,grade=0,peakSteer=0;
      const previous=heading.clone();
      const path=[];
      for(;elapsed<Math.ceil((end-start)/speed*1.7*120);elapsed++){
        const frame=ctl();
        if(frame.arc>=end){distance=frame.arc;break;}
        d.advance(1,frame.data);
        if(elapsed%36===0)path.push([car.current.position.x,car.current.position.z,frame.data.steer]);
        const h=car.direction;
        headingChange+=Math.atan2(-previous.z*h.x+previous.x*h.z,previous.x*h.x+previous.z*h.z);
        previous.copy(h);
        if(elapsed%12===0){hit||=d.railContact();maxOffset=Math.max(maxOffset,frame.offset);}
        observedFirst||=car.steer>.022;observedSecond||=car.steer<-.022;
        minContacts=Math.min(minContacts,car.contacts);
        minSpeed=Math.min(minSpeed,car.speed);maxSpeed=Math.max(maxSpeed,car.speed);
        yaw=Math.max(yaw,Math.abs(car.body.angvel().y));grade=Math.min(grade,sampleAt(frame.arc).forward.y);
        peakSteer=Math.max(peakSteer,...car.wheelState.slice(0,2).map(w=>Math.abs(w.steer)));
        distance=frame.arc;
      }
      return {completed:distance>=end,metres:distance-start,seconds:elapsed/120,maxOffset,minContacts,hit,
        speedKmh:[minSpeed*3.6,maxSpeed*3.6],headingChange:T.MathUtils.radToDeg(headingChange),bothSteeringDirections:observedFirst&&observedSecond,
        peakYaw:T.MathUtils.radToDeg(yaw),peakFrontWheel:T.MathUtils.radToDeg(peakSteer),lowestGrade:grade,path};
    }
    const j={square:[surveyMeters[5]-20,surveyMeters[8]+5,7.5],hairpin:[surveyMeters[21]-15,surveyMeters[26]+10,7.0],
      esses:[surveyMeters[27]-7,surveyMeters[34]-8,16.5],sweeper:[surveyMeters[38]+8,surveyMeters[43],26]};
    function measure(){
      const body=visual.group;
      const f=new T.Vector3(0,0,-1).applyQuaternion(body.quaternion);
      const chassisYaw=Math.atan2(-f.x,-f.z),view=camera.getWorldDirection(new T.Vector3());
      const viewYaw=Math.atan2(-view.x,-view.z);
      const edge=[-.95,.95].map(x=>body.localToWorld(new T.Vector3(x,.338,1.98)).project(camera).x);
      const obj=[-.065,.39,.775].map(y=>body.localToWorld(new T.Vector3(0,y,1.99)).project(camera).y);
      const displacement=camera.position.clone().sub(body.position);
      const rightY=new T.Vector3(1,0,0).applyQuaternion(camera.quaternion).y;
      const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
      const aimError=wrap(viewYaw-chassisYaw);
      const chaseHeading=Math.atan2(displacement.x,displacement.z);
      const yawRate=car.body.angvel().y,vel=car.velocity;
      const sideslip=Math.atan2(-f.z*vel.x+f.x*vel.z,vel.x*f.x+vel.z*f.z);
      return {width:Math.abs(edge[1]-edge[0])/2,centerX:(edge[0]+edge[1]+2)/4,centerY:(1-obj[1])*.5,
        bumperBottom:(1-obj[0])*.5,wingTop:(1-obj[2])*.5,distance:Math.hypot(displacement.x,displacement.z),
        height:displacement.y,fov:camera.fov,viewYaw,aimError,rigError:wrap(chaseHeading-chassisYaw),roll:Math.asin(rightY),yawRate,
        speed:car.speed,sideslip,aspect:camera.aspect,worldHeight:camera.position.y};
    }
    window.chaseQA={place,pairs,drive,follow,j,measure,lineDistance};
  });

  const view=async name=>page.evaluate(name=>document.querySelector('[data-camera='+name+']').click(),name);
  const trace=[[18,0],[76,1],[58,0],[78,-1],[86,0]];
  const replay=async name=>{
    await view(name);
    return page.evaluate(trace=>{
      const qa=window.chaseQA;
      return [5.5,15,27].map(speed=>qa.pairs(qa.lineDistance-15,speed,trace));
    },trace);
  };
  const cabin=await replay('cockpit'),chase=await replay('chase');
  const differences=cabin.map((samples,j)=>samples.reduce((d,values,i)=>{
    for(let k=0;k<values.length;k++)d[k]=Math.max(d[k],Math.abs(values[k]-chase[j][i][k]));
    return d;
  },Array(8).fill(0)));
  const handling=await page.evaluate(()=>Object.fromEntries(Object.entries(window.chaseQA.j).map(([key,args])=>[key,window.chaseQA.drive(...args)])));
  console.log('Identical input comparison',JSON.stringify(differences));
  console.log('Track runs',JSON.stringify(Object.fromEntries(Object.entries(handling).map(([k,{path,...v}])=>[k,v]))));

  // At rest the view can be captured after the normal reset transition.
  await page.keyboard.press('Escape');
  await page.keyboard.press('r');
  await page.waitForTimeout(550);
  await page.screenshot({path:dir+'/grid.jpg',quality:93});
  const grid=await page.evaluate(()=>window.chaseQA.measure());

  async function play(name,start,speed,seconds,distanceLimit=null){
    await page.keyboard.press('Escape');
    await page.evaluate(({start,speed,distanceLimit})=>{
      const qa=window.chaseQA,d=window.apexDiagnostics,{renderer,camera,scene}=d.inspect;
      const ctl=qa.follow(start,speed),record=[];
      qa.place(start,speed);
      qa.samples=record;qa.bestImage='';qa.bestScore=Infinity;qa.traceArc=start;
      const old=renderer.render.bind(renderer);
      qa.restore=()=>{renderer.render=old;d.setTestDriver(undefined);};
      d.setTestDriver(()=>{const frame=ctl();qa.traceArc=frame.arc;return frame.data;});
      renderer.render=(s,c)=>{
        old(s,c);
        if(s!==scene||c!==camera)return;
        const sample={...qa.measure(),time:performance.now(),arc:qa.traceArc};
        record.push(sample);
        const score=distanceLimit===null?Math.abs(sample.speed-speed):Math.abs(qa.traceArc-start-distanceLimit);
        if(record.length>12&&score<qa.bestScore&&(record.length%8===0)){
          qa.bestScore=score;qa.bestImage=renderer.domElement.toDataURL('image/jpeg',.93).split(',')[1];
        }
      };
    },{start,speed,distanceLimit});
    await page.keyboard.press('Escape');
    await page.waitForTimeout(seconds*1000);
    const result=await page.evaluate(()=>{
      const qa=window.chaseQA;qa.restore();
      return {samples:qa.samples.slice(10),image:qa.bestImage};
    });
    if(result.image)writeFileSync(dir+'/'+name+'.jpg',Buffer.from(result.image,'base64'));
    return result.samples;
  }
  const {line,regions}=await page.evaluate(()=>({line:window.chaseQA.lineDistance,regions:window.chaseQA.j}));
  const clips={
    straight:await play('straight',line-16,20,7),
    bend:await play('bend',regions.square[0]+95,8.2,11,46),
    hairpin:await play('hairpin',regions.hairpin[0]+77,8.9,14,75),
    esses:await play('esses',regions.esses[0]+74,16.5,18,140),
  };
  let options,keyboard;
  if(version==='after'){
    await page.keyboard.press('r');
    await page.locator('#settings').click();
    await page.locator('#chase-camera').selectOption('standard');
    await page.getByRole('button',{name:'Close settings'}).click();
    await page.waitForTimeout(480);
    const standard=await page.evaluate(()=>window.chaseQA.measure());
    await page.screenshot({path:dir+'/standard.jpg',quality:93});
    await page.locator('#settings').click();
    await page.locator('#chase-camera').selectOption('close');
    await page.getByRole('button',{name:'Close settings'}).click();
    const saved=await page.evaluate(()=>localStorage.getItem('apex.chase-camera'));
    options={standard,saved};
    assert.equal(saved,'close');
    assert.ok(standard.fov===41&&standard.width<grid.width);

    await page.keyboard.press('Escape');
    await page.evaluate(()=>window.chaseQA.place(window.chaseQA.lineDistance-48,6.3));
    await page.keyboard.press('Escape');
    await page.keyboard.down('ArrowRight');
    await page.waitForFunction(()=>window.apexDiagnostics.state().steer<-.045);
    const chase=await page.evaluate(()=>window.apexDiagnostics.state().steer);
    await view('cockpit');
    await page.waitForFunction(()=>window.apexDiagnostics.state().steer<-.11);
    const cockpit=await page.evaluate(()=>window.apexDiagnostics.state().steer);
    await page.keyboard.up('ArrowRight');
    await page.waitForFunction(()=>Math.abs(window.apexDiagnostics.state().steer)<.008);
    const settled=await page.evaluate(()=>window.apexDiagnostics.state());
    keyboard={chase,cockpit,returned:settled.steer,cockpitEyeError:settled.eyeError};
    assert.ok(settled.eyeError<.00001);
    assert.ok(Object.values(handling).every(h=>h.completed&&!h.hit&&h.minContacts===4&&h.maxOffset<2.1));
    assert.ok(handling.esses.bothSteeringDirections);
  }
  const result={version,grid,viewComparison:differences,handling,clips,options,keyboard,errors};
  writeFileSync(dir+'/measurements.json',JSON.stringify(result));
  assert.equal(errors.length,0,errors.join('\n'));
  if(version==='after'){
    for(const [name,record] of Object.entries(clips)){
      const steady=record.filter(p=>p.time-record[0].time>=1200);
      assert.ok(steady.length>40,name+': insufficient moving frames');
      assert.ok(steady.every(p=>p.width>=.345&&p.width<=.455&&p.bumperBottom<.956),name+': car framing');
      assert.ok(steady.every(p=>Math.abs(p.roll)<.001&&Math.abs(p.rigError)<.09),name+': horizon or chase tracking');
    }
  }
  assert.ok(differences.flat().every(v=>v<.0001),JSON.stringify(differences));
}finally{
  await browser.close();
}
