import {launchTestBrowser} from './test-browser.mjs';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const browser=await launchTestBrowser();
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:4177/?diagnostics');
 await page.waitForFunction(()=>window.apexDiagnostics,null,{timeout:100000});await page.keyboard.press('Escape');
 const result=await page.evaluate(async()=>{
   const {car,scene,T}=window.apexDiagnostics.inspect;
   const {stations,onBridge,roadHalfWidth}=await import('/src/track.ts');
   const mesh=scene.children.find(m=>m.isMesh && m.geometry?.attributes.position.count===stations.length*32);
   const position=mesh.geometry.attributes.position,index=mesh.geometry.index;
   const down=new T.Vector3(0,-1,0);
   let samples=0,missed=0,maxErrorMm=0,maxStraightMicroMm=-Infinity,minStraightMicroMm=Infinity;
   for(let i=2;i<index.count/3;i+=89){
     const p=new T.Vector3();let smoothHeight=0;
     for(let j=0;j<3;j++){
       const vertex=index.getX(i*3+j),inStrip=vertex%(stations.length*2);
       p.add(new T.Vector3().fromBufferAttribute(position,vertex));
       const station=stations[Math.floor(inStrip/2)],band=Math.floor(vertex/(stations.length*2));
       const offset=-roadHalfWidth+(band+inStrip%2)*roadHalfWidth/8;
       smoothHeight+=(station.p.y+station.right.y*offset+.012)/3;
     }
     p.divideScalar(3);const ray={origin:{x:p.x,y:p.y+1,z:p.z},dir:down};
     const hit=car.world.castRay(ray,2,true,undefined,undefined,undefined,car.body,c=>Math.abs(c.friction()-.95)<.001);
     samples++;if(!hit){missed++;continue;}
     maxErrorMm=Math.max(maxErrorMm,Math.abs(hit.timeOfImpact-1)*1000);
     if(p.z>120&&p.z<260&&Math.abs(p.x+110)<5){
       const delta=(p.y+1-hit.timeOfImpact-smoothHeight)*1000;
       maxStraightMicroMm=Math.max(maxStraightMicroMm,delta);minStraightMicroMm=Math.min(minStraightMicroMm,delta);
     }
   }
   const bridge=stations.filter(onBridge);const mid=bridge[Math.floor(bridge.length/2)].p;
   const structure=car.world.castRay({origin:{x:mid.x,y:mid.y-.08,z:mid.z},dir:down},2,true,undefined,undefined,undefined,car.body,c=>Math.abs(c.friction()-.65)<.001);
   return {samples,missed,maxErrorMm,straightHeightResidualMm:[minStraightMicroMm,maxStraightMicroMm],bridgeStructureBelowDeckMetres:structure?.timeOfImpact+.08};
 });
 writeFileSync(new URL('../verification/f40/surface-check.json',import.meta.url),JSON.stringify(result,null,2));console.log(result);
 assert.equal(result.missed,0);assert.ok(result.maxErrorMm<.8&&result.bridgeStructureBelowDeckMetres<.4);
}finally{await browser.close();}
