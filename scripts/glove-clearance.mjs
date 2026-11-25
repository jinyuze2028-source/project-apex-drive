import {launchTestBrowser} from './test-browser.mjs';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const vehicle=process.argv[3]??'f40';assert.ok(['f40','r35'].includes(vehicle));
const browser=await launchTestBrowser();
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 await page.goto('http://127.0.0.1:4177/?diagnostics&vehicle='+vehicle);await page.waitForFunction(()=>window.apexDiagnostics,null,{timeout:90000});
 await page.keyboard.press('i');await page.waitForTimeout(1200);await page.keyboard.press('Escape');
 const metrics=await page.evaluate(()=>{
   window.apexDiagnostics.inspect.visual.driver.visible=true;
   const {advance,inspect:{car,visual,T}}=window.apexDiagnostics,column=visual.steering.parent;
   const fullLock = Math.max(...[-1,1].map(steer=>{
     advance(300,{throttle:0,brake:1,steer,handbrake:true});
     visual.sync(car,1);
     return Math.abs(T.MathUtils.radToDeg(visual.steering.rotation.z));
   }));
   const sweepLimit = Math.max(510,Math.ceil(fullLock/2)*2);
   const skins=['Left glove','Right glove'].map(name=>{let mesh;column.getObjectByName(name).traverse(n=>{if(n.isSkinnedMesh)mesh=n;});return mesh;});
   let minBoxGap=1,overlaps=0,minRim=1,poses=0,vertices=0,worstAngle=0;
   const points=skins.map(m=>new Float32Array(m.geometry.attributes.position.count*3));
   const previous=points.map(a=>new Float32Array(a.length)),p=new T.Vector3();
   let minFace=1,maxStep=0,triangles=0,neutralFace=1,worstTri;
   const b=[new T.Box3(),new T.Box3()],v=new T.Vector3(),local=new T.Matrix4();
   for(let degrees=-sweepLimit;degrees<=sweepLimit;degrees+=2){
     visual.driver.pose(degrees*Math.PI/180);column.updateWorldMatrix(true,false);column.updateMatrixWorld(true);
     for(let j=0;j<2;j++){
       const m=skins[j];m.skeleton.update();local.copy(column.matrixWorld).invert().multiply(m.matrixWorld);b[j].makeEmpty();
       for(let i=0;i<m.geometry.attributes.position.count;i++){
         m.getVertexPosition(i,v).applyMatrix4(local);vertices++;b[j].expandByPoint(v);
         if(poses)maxStep=Math.max(maxStep,p.fromArray(previous[j],3*i).distanceTo(v));v.toArray(points[j],3*i);
         const rim=Math.hypot(Math.hypot(v.x,v.y)-.16,v.z)-.0175;
         if(rim<minRim){minRim=rim;worstAngle=degrees;}
       }
       previous[j].set(points[j]);
       const index=m.geometry.index.array,values=points[j];
       for(let t=0;t<index.length;t+=3){
         const a=3*index[t],b=3*index[t+1],c=3*index[t+2];
         const x=(values[a]+values[b]+values[c])/3,y=(values[a+1]+values[b+1]+values[c+1])/3,z=(values[a+2]+values[b+2]+values[c+2])/3;
         const dist=Math.hypot(Math.hypot(x,y)-.16,z)-.0175;
         if(dist<minFace){minFace=dist;worstTri={degrees,j,t,ids:[a,b,c].map(n=>n/3),verts:[a,b,c].map(n=>Array.from(values.slice(n,n+3)))};}
         if(degrees===0)neutralFace=Math.min(neutralFace,dist);triangles++;
       }
     }
     const comps=['x','y','z'].map(axis=>Math.max(0,b[0].min[axis]-b[1].max[axis],b[1].min[axis]-b[0].max[axis]));
     minBoxGap=Math.min(minBoxGap,Math.hypot(...comps));if(b[0].intersectsBox(b[1]))overlaps++;poses++;
   }
   return {fullLock,sweepLimit,poses,vertices,triangles,neutralFaceMm:neutralFace*1000,worstTri,maxVertexMovementPer2DegMm:maxStep*1000,minTriangleCentroidMm:minFace*1000,worstAngle,minimumGloveToRimMm:minRim*1000,minimumGloveBoxGapMm:minBoxGap*1000,overlappingGloveBoxPoses:overlaps};
 });
 const out=process.argv[2]??'verification/round7';mkdirSync(out,{recursive:true});
 console.log(metrics);writeFileSync(out+'/glove-surfaces.json',JSON.stringify(metrics,null,2));
 assert.ok(metrics.minimumGloveToRimMm>-.5&&metrics.minTriangleCentroidMm>-.5);
 assert.equal(metrics.overlappingGloveBoxPoses,0);
}finally{await browser.close();}
