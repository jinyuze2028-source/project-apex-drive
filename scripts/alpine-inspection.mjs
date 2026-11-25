import {launchTestBrowser} from './test-browser.mjs';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const out=resolve('verification/round7');mkdirSync(out,{recursive:true});
const browser=await launchTestBrowser();
try{
 const page=await browser.newPage({viewport:{width:1966,height:1206}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:4177/?diagnostics');
 await page.waitForFunction(()=>window.apexDiagnostics||document.querySelector('#loading.error'),null,{timeout:120000});
 assert.ok(await page.evaluate(()=>!!window.apexDiagnostics),await page.locator('#loading').innerText());
 await page.keyboard.press('i');await page.waitForTimeout(1250);await page.screenshot({path:out+'/seat.jpg',quality:94});await page.keyboard.press('Escape');
 const frame=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 async function photo(name,kind,offset){
   await frame();const b=await page.evaluate(({kind,offset})=>{
     const {visual,renderer,camera,scene,T,car}=window.apexDiagnostics.inspect;
     const cam=camera.clone();cam.layers.enableAll();let point;
     if(kind==='seat'){cam.copy(camera);}
     else if(kind==='watch'){point=visual.group.getObjectByName('Driver chronometer').getWorldPosition(new T.Vector3());cam.position.copy(visual.group.localToWorld(visual.eye.clone()));const ring=visual.steering.getWorldPosition(new T.Vector3());cam.lookAt(point.lerp(ring,.15));cam.fov=26;}
     else if(kind==='rear'){point=visual.group.getObjectByName('F40 grille badge').getWorldPosition(new T.Vector3());cam.position.copy(point).add(new T.Vector3(...offset).applyQuaternion(visual.group.quaternion));cam.lookAt(point);cam.fov=36;}
     else{point=car.current.position;cam.position.copy(point).add(new T.Vector3(...offset.slice(0,3)).applyQuaternion(car.current.rotation));cam.lookAt(point.clone().add(new T.Vector3(...offset.slice(3)).applyQuaternion(car.current.rotation)));cam.fov=57;}
     cam.updateProjectionMatrix();renderer.render(scene,cam);return renderer.domElement.toDataURL('image/jpeg',.94).split(',')[1];
   },{kind,offset});writeFileSync(out+'/'+name+'.jpg',Buffer.from(b,'base64'));
 }
 await photo('rear','rear',[.28,.28,3.65]);await photo('badge','rear',[.10,.076,.9]);await photo('watch','watch');
 await page.evaluate(()=>window.apexDiagnostics.advance(42,{throttle:0,brake:0,steer:-1,handbrake:true}));await photo('cross','seat');
 const report=await page.evaluate(async()=>{
   const {visual,car,renderer,scene,T,sun}=window.apexDiagnostics.inspect;
   const track=await import('/src/track.ts'),{stations,courseLength,surveyMeters,sampleAt,roadHalfWidth,grid,startLine,onBridge,course}=track;
   const maxGrade=Math.max(...stations.map(s=>Math.abs(s.forward.y/Math.hypot(s.forward.x,s.forward.z))));
   const maxK=Math.max(...stations.map(s=>Math.abs(s.curvature)));
   const a=sampleAt(surveyMeters[21]).forward,b=sampleAt(surveyMeters[26]).forward;
   const normals={minimum:1,invertedTransforms:0,badNormals:0};visual.group.updateWorldMatrix(true,true);
   visual.group.traverse(o=>{if(!o.isMesh)return;if(o.matrixWorld.determinant()<0)normals.invertedTransforms++;
     const n=o.geometry.attributes.normal;if(n)for(let i=0;i<n.count;i++){const l=Math.hypot(n.getX(i),n.getY(i),n.getZ(i));if(!Number.isFinite(l)||l<.5)normals.badNormals++;normals.minimum=Math.min(normals.minimum,l);}
   });
   const road=scene.children.find(m=>m.isMesh&&m.geometry?.attributes.position.count===stations.length*32);
   const pos=road.geometry.attributes.position,idx=road.geometry.index,down=new T.Vector3(0,-1,0),p=new T.Vector3(),v=new T.Vector3();
   let rays=0,misses=0,worst=0,minSep=Infinity;
   for(let i=0;i<idx.count;i+=3*49){p.set(0,0,0);for(let k=0;k<3;k++)p.add(v.fromBufferAttribute(pos,idx.getX(i+k)));p.divideScalar(3);
     const hit=car.world.castRay({origin:{x:p.x,y:p.y+1,z:p.z},dir:down},2,true,undefined,undefined,undefined,car.body,c=>Math.abs(c.friction()-.95)<.001);
     rays++;if(!hit)misses++;else worst=Math.max(worst,Math.abs(hit.timeOfImpact-1)*1000);}
   for(let i=0;i<stations.length-1;i+=4)for(let j=i+4;j<stations.length-1;j+=4){const d=stations[j].distance-stations[i].distance;if(Math.min(d,courseLength-d)<125)continue;
     minSep=Math.min(minSep,Math.hypot(stations[i].p.x-stations[j].p.x,stations[i].p.z-stations[j].p.z));}
   const bridge=stations.filter(onBridge),span=bridge.at(-1).distance-bridge[0].distance,pierRay=bridge[Math.floor(bridge.length/2)].p;
   const deck=car.world.castRay({origin:{x:pierRay.x,y:pierRay.y-.06,z:pierRay.z},dir:down},2,true,undefined,undefined,undefined,car.body,c=>Math.abs(c.friction()-.65)<.001);
   const signs=scene.getObjectByName('Curve alignment signs').userData.signs;
   const watch=visual.group.getObjectByName('Driver chronometer'),body=visual.group.getObjectByName('F40 grille badge').parent;
   const badge=body.getObjectByName('F40 grille badge'),box=new T.Box3().setFromObject(badge,true);
   const mats=new Set();body.traverse(o=>{if(o.material)mats.add(o.material);});
   return {route:{metres:courseLength,closes:stations[0].p.distanceTo(stations.at(-1).p),tangentDot:course.getTangentAt(.00001).dot(course.getTangentAt(.99999)),range:Math.max(...stations.map(s=>s.p.y))-Math.min(...stations.map(s=>s.p.y)),grade:maxGrade,minRadius:1/maxK,hairpinHeadingChangeDeg:a.angleTo(b)*180/Math.PI,minHorizontalSeparation:minSep,start:startLine.p.toArray(),grid:grid.toArray(),bridgeMetres:span,deckBelow:deck?.timeOfImpact+.06,rays,misses,maxRoadErrorMm:worst,sections:[...new Set(stations.map((s,i)=>track.section(i)))],profile:stations.filter((_,i)=>i%6===0).map(s=>[s.distance,s.p.x,s.p.y,s.p.z])},
       signs,signsOutside:signs.every(s=>Math.abs(s.outside)>roadHalfWidth&&Math.sign(s.outside)!==(s.right?1:-1)),
       wrongChevrons:signs.filter(s=>s.kind==='chevron'&&((sampleAt(s.d).curvature>0)!==s.right)).length,
       watchParent:watch.parent.name,badgeMetres:box.getSize(new T.Vector3()).toArray(),normals,forest:scene.userData.forest,materials:mats.size,exposure:renderer.toneMappingExposure,shadowLayers:sun.shadow.camera.layers.mask};
 });
 async function place(k,offset=0){
   await page.evaluate(async({k,offset})=>{
     const d=window.apexDiagnostics,{car,T}=d.inspect,{sampleAt,surveyMeters}=await import('/src/track.ts'),s=sampleAt(surveyMeters[k]+offset);
     car.reset(false);const up=s.right.clone().cross(s.forward).normalize(),right=s.forward.clone().cross(up);
     const q=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(right,up,s.forward.clone().negate()));
     car.body.setTranslation({x:s.p.x,y:s.p.y+.39,z:s.p.z},true);car.body.setRotation(q,true);
     d.advance(100,{throttle:0,brake:1,steer:0,handbrake:false});
   },{k,offset});await frame();
 }
 await place(23,-68);await photo('hairpin','seat');await photo('hairpin-overview','environment',[-6,23,17,0,0,-27]);
 await place(13,-12);await photo('verge','environment',[3,1.5,6,9,.65,-19]);await photo('forest','seat');
 const landscape=async(kind)=>{const bytes=await page.evaluate(kind=>{
   const {T,scene,camera,renderer,visual,car}=window.apexDiagnostics.inspect,cam=camera.clone();
   const pos=car.current.position,forward=car.direction,candidate=new T.Vector3(),matrix=new T.Matrix4();
   let closest=Infinity,point=new T.Vector3(),height=0;
   if(kind==='turn-board'){
     const sign=scene.getObjectByName('Curve alignment signs').userData.signs.find(s=>s.kind==='hairpin advance');
     point.fromArray(sign.position);point.y+=1.55;
     cam.position.copy(point).addScaledVector(forward,-7);cam.position.y+=.18;cam.lookAt(point);cam.fov=39;
   }else if(kind==='ground-detail'){
     let pointAlong,nearest=Infinity;
     scene.traverse(mesh=>{if(!mesh.isInstancedMesh||!mesh.visible||mesh.geometry.attributes.position.count!==225)return;
       for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);candidate.setFromMatrixPosition(matrix);
         const d=candidate.distanceToSquared(pos);if(d<nearest){nearest=d;pointAlong=candidate.clone();}}
     });
     if(!pointAlong)throw Error('No visible grass clump');point.copy(pointAlong);
     cam.position.copy(point).sub(pos).setY(0).normalize().multiplyScalar(1.20).add(point);
     cam.position.y+=.61;point.y+=.10;cam.lookAt(point);cam.fov=50;
   }else{
     // Photograph actual roadside foliage from the road side of the stand.
     scene.traverse(mesh=>{if(mesh.name!=='Mature fir trunks'||!mesh.visible)return;
       for(let i=0;i<mesh.count;i++){
         mesh.getMatrixAt(i,matrix);candidate.setFromMatrixPosition(matrix);
         const d=candidate.distanceToSquared(pos);if(d<closest){closest=d;point.copy(candidate);height=new T.Vector3().setFromMatrixScale(matrix).y;}
       }
     });
     cam.position.copy(pos).sub(point).setY(0).normalize().multiplyScalar(height*1.38).add(point);
     cam.position.y+=height*.41;point.y+=height*.49;cam.lookAt(point);cam.fov=51;
   }
   cam.updateProjectionMatrix();visual.group.visible=false;renderer.render(scene,cam);visual.group.visible=true;
   return renderer.domElement.toDataURL('image/jpeg',.92).split(',')[1];
 },kind);writeFileSync(out+'/'+kind+'.jpg',Buffer.from(bytes,'base64'));};
 await landscape('trees');await landscape('ground-detail');await place(23,-87);await landscape('turn-board');
 await place(46);await photo('viaduct','environment',[28,-1,38,0,-1,-4]);
 await page.keyboard.press('Escape');const lightStates=[];
 for(const name of ['chase','cockpit','hood','chase','cockpit']){
   await page.locator('[data-camera="'+name+'"]').click();await frame();
   lightStates.push(await page.evaluate(()=>{const {scene,sun,renderer,visual}=window.apexDiagnostics.inspect;return {exposure:renderer.toneMappingExposure,environment:scene.environment.uuid,sun:sun.intensity,layers:sun.shadow.camera.layers.mask,visible:visual.group.visible};}));
 }
 await page.keyboard.press('r');await frame();const reset=await page.evaluate(()=>window.apexDiagnostics.state());
 Object.assign(report,{lightStates,resetPosition:reset.position,errors});
 writeFileSync(out+'/inspection.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,route:{...report.route,profile:undefined},signs:report.signs.length},null,2));
 assert.ok(report.route.misses===0&&report.route.maxRoadErrorMm<1&&report.route.deckBelow>0&&report.route.deckBelow<.4);
 assert.equal(report.wrongChevrons,0);assert.ok(report.signsOutside&&report.watchParent==='wrist'&&report.normals.invertedTransforms===0);
 assert.ok(lightStates.every(s=>JSON.stringify(s)===JSON.stringify(lightStates[0])));assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser.close();}
