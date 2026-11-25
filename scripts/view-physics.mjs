import {launchTestBrowser} from './test-browser.mjs';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const browser=await launchTestBrowser();
const traces=[];
try{
 for(const view of ['cockpit','chase']){
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:4177/?diagnostics&vehicle=r35');
  await page.waitForFunction(()=>window.apexDiagnostics&&document.querySelector('#stage')?.dataset.ready==='true',null,{timeout:120000});
  await page.locator('#pause').evaluate(b=>b.click());
  await page.locator('[data-camera='+view+']').evaluate(b=>b.click());
  const trace=await page.evaluate(()=>{
   const d=window.apexDiagnostics,car=d.inspect.car;
   car.reset(true);
   car.setIgnition();
   const samples=[];
   for(let i=0;i<900;i++){
    const steer=i<200?0:Math.sin((i-200)/120*1.9)*.65;
    d.advance(1,{throttle:i<200?0:.7,brake:0,steer,handbrake:false});
    if(i%20===0)samples.push({p:car.current.position.toArray(),speed:car.speed,angle:car.steer,yaw:car.body.angvel().y});
   }
   return samples;
  });
  traces.push(trace);await page.close();
 }
 assert.deepEqual(traces[0],traces[1]);
 writeFileSync('../../work/r35-guide/view-physics.json',JSON.stringify({samples:traces[0].length,identical:true,traces},null,2));
 console.log('45 matched physical samples in cockpit and chase.');
}finally{await browser.close();}
