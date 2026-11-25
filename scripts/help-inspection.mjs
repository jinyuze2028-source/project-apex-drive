import {launchTestBrowser} from './test-browser.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const [port='4177',output='test-evidence/help',baseline='false']=process.argv.slice(2);
mkdirSync(output,{recursive:true});
const browser=await launchTestBrowser();
const results={errors:[],vehicles:{}};
try{
 for(const vehicle of baseline==='true'?['r35']:['r35','f40']){
  const page=await browser.newPage({viewport:{width:1680,height:1050}});
  page.on('pageerror',e=>results.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')results.errors.push(m.text());});
  await page.goto('http://127.0.0.1:'+port+'/?diagnostics&vehicle='+vehicle);
  await page.waitForFunction(()=>document.querySelector('#stage')?.dataset.ready==='true'&&window.apexDiagnostics,null,{timeout:120000});
  await page.locator('#pause').click();
  if(vehicle==='r35'){
   for(const state of ['off','brake','release','lights','lights-brake']){
    const snapshot=await page.evaluate(state=>{
     const d=window.apexDiagnostics,{visual,car,renderer,T,scene}=d.inspect;
     car.lights=state.startsWith('lights');car.brakeLight=state==='brake'||state==='lights-brake';
     visual.sync(car,1);scene.updateMatrixWorld(true);
     const camera=new T.PerspectiveCamera(37,renderer.domElement.width/renderer.domElement.height,.03,70);
     const center=visual.group.position.clone();camera.position.copy(center).add(new T.Vector3(-2.6,1.5,5.8));camera.lookAt(center.clone().add(new T.Vector3(0,.3,1)));camera.layers.enable(1);
     renderer.render(scene,camera);
     const emitters=[];visual.group.traverse(mesh=>{
      if(mesh.isMesh&&mesh.material.emissiveIntensity>.1&&mesh.material.emissive.getHex()!==0)
       emitters.push({name:mesh.name,material:mesh.material.name,intensity:mesh.material.emissiveIntensity});
     });
     return {image:renderer.domElement.toDataURL('image/jpeg',.92).split(',')[1],emitters};
    },state);
    writeFileSync(output+'/'+state+'.jpg',Buffer.from(snapshot.image,'base64'));
    results[state]=snapshot.emitters;
   }
   if(baseline!=='true')assert.ok(!results.brake.some(m=>m.material.includes('signal_R_2017')));
  }
  if(baseline!=='true'){
   await page.locator('[data-open-help]').first().click();
   await page.waitForSelector('#apex-help:not([hidden])');
   const at=await page.evaluate(()=>window.apexDiagnostics.state().position);
   await page.waitForTimeout(350);await page.screenshot({path:output+'/'+vehicle+'-guide.jpg'});
   let count=Number((await page.locator('#help-count').textContent()).split('/')[1]);
   for(let i=0;i<count;i++){await page.locator('#help-next').click();await page.waitForTimeout(40);}
   assert.deepEqual(await page.evaluate(()=>window.apexDiagnostics.state().position),at);
   await page.locator('[data-help-tab=settings]').click();
   assert.equal(await page.locator('#help-copy article').count(),vehicle==='r35'?15:13);
   await page.locator('#help-language').click();
   await page.screenshot({path:output+'/'+vehicle+'-settings.jpg'});
   await page.locator('[data-help-tab=controls]').evaluate(b=>b.click());
   assert.ok((await page.locator('#help-copy').textContent()).includes('Space'),await page.locator('#help-copy').textContent());
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('#apex-help').isHidden(),true);
   assert.equal(await page.evaluate(()=>window.apexDiagnostics.state().paused),true);
   await page.locator('#resume').click();
   await page.waitForTimeout(1200);
   results.vehicles[vehicle]={guideSteps:count,stateRestored:true};
   await page.locator('#open-garage').evaluate(b=>b.click());
   await page.locator('[data-open-help]').first().click();
   await page.waitForTimeout(250);
   await page.screenshot({path:output+'/'+vehicle+'-garage-guide.jpg'});
   await page.locator('#help-next').click();await page.locator('#help-close').click();
  }
  results.memory=await page.evaluate(()=>performance.memory?{usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize}:null);
  await page.close();
 }
 assert.deepEqual(results.errors,[]);
}finally{await browser.close();writeFileSync(output+'/results.json',JSON.stringify(results,null,2));}
console.log(JSON.stringify(results,null,2));
