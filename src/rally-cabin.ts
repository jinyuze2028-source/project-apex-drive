import * as T from 'three';
import {bevel,part,rallyMat,rallyMetal,tube} from './rally-details.ts';
import {fitWheelEmblem} from './apex-emblem.ts';
import {wheelHardware} from './cabin-hardware.ts';
import {batchParts} from './batch.ts';
import {upholstery} from './finishes.ts';
import {buildRallyControls,engravedFace,hitArea} from './rally-controls.ts';
import {buildRallyInstruments} from './rally-instruments.ts';
import type {Switch} from './f40-cabin.ts';
import type {Vehicle} from './vehicle.ts';

function wheelSpoke(){
  const profile=new T.Shape().moveTo(.036,-.019).lineTo(.093,-.013).lineTo(.143,-.008)
    .quadraticCurveTo(.150,0,.140,.010).lineTo(.038,.021).closePath();
  const relief=new T.Path().moveTo(.064,-.007).lineTo(.118,-.004).lineTo(.115,.003).lineTo(.063,.009).closePath();
  profile.holes.push(relief);
  return new T.ExtrudeGeometry(profile,{depth:.006,bevelEnabled:true,bevelThickness:.0015,bevelSize:.0016,bevelSegments:2,curveSegments:10});
}

function paddleLever(){
  const profile=new T.Shape().moveTo(-.011,-.047).quadraticCurveTo(-.016,-.033,-.006,-.019)
    .lineTo(-.008,.040).quadraticCurveTo(.008,.060,.018,.051)
    .lineTo(.016,-.026).quadraticCurveTo(.010,-.049,-.011,-.047);
  return new T.ExtrudeGeometry(profile,{depth:.0042,bevelEnabled:true,bevelThickness:.0013,bevelSize:.0016,bevelSegments:2,curveSegments:12});
}

export function buildRallyCabin(parent:T.Group,body:T.Group,hitTargets:T.Mesh[]){
  const cage=rallyMetal(0x8d9298,.42),foot=rallyMetal(0x656a72,.54),rubber=rallyMat(0x222325,.92);
  const fastener=new T.CylinderGeometry(.0045,.0045,.004,6).rotateX(Math.PI/2);
  const bolt=rallyMetal(0xb8b8b7,.35),webbing=rallyMat(0xb63429,.93);
  for(const side of [-1,1]){
    tube(parent,[[side*.63,.30,.61],[side*.61,1.14,.56],[side*.54,1.284,.52],[side*.558,1.271,-.085],[side*.695,1.063,-.49],[side*.69,.47,-.69]],.021,cage);
    tube(parent,[[side*.57,1.18,.58],[side*.55,.96,1.00],[side*.58,.58,1.47]],.020,cage);
    tube(parent,[[side*.64,.47,-.54],[side*.62,.55,.23],[side*.60,.68,.56]],.019,cage);
    for(const [x,z] of [[side*.63,.61],[side*.64,-.56],[side*.57,1.47]]){
      part(parent,bevel(.097,.021,.11,.006),foot,x,.315,z);
      for(const dx of [-.033,.033])part(parent,fastener,bolt,x+dx,.329,z);
    }
    for(const strap of [-.077,.077]){
      const belt=part(parent,bevel(.043,.625,.014,.005),webbing,side*.371+strap,.797,.579);
      belt.rotation.x=.27;
      part(parent,bevel(.047,.034,.018,.004),bolt,side*.371+strap,.63,.53);
    }
  }
  tube(parent,[[-.54,1.14,.56],[-.43,1.303,.53],[0,1.315,.53],[.43,1.303,.53],[.54,1.14,.56]],.022,cage);
  tube(parent,[[-.60,.82,.57],[0,.82,.57],[.60,.82,.57]],.019,cage);
  tube(parent,[[-.58,.43,.59],[0,.82,1.01],[.54,1.20,1.25]],.018,cage);

  const column=new T.Group();column.name='R35 steering column';column.position.set(-.372,.894,-.156);column.rotation.x=-.23;parent.add(column);
  const steering=new T.Group();steering.name='R35 motorsport wheel';column.add(steering);
  const rim=part(steering,new T.TorusGeometry(.160,.0175,22,110),rubber);
  rim.name='R35 microsuede steering rim';
  upholstery(rim,rubber,'textile');
  rubber.normalScale.setScalar(.37);
  const alloy=rallyMetal(0x8b8d8c,.44),anodised=rallyMetal(0x282c2f,.51);
  const spoke=wheelSpoke();
  for(const angle of [.23,Math.PI-.23,-Math.PI/2]){
    const model=part(steering,spoke,alloy,0,0,-.013);
    model.rotation.z=angle;
  }
  part(steering,new T.CylinderGeometry(.046,.055,.033,32).rotateX(Math.PI/2),anodised,0,0,-.009);
  part(steering,new T.CylinderGeometry(.042,.0435,.0044,48).rotateX(Math.PI/2),anodised,0,0,.0138);
  part(steering,new T.TorusGeometry(.0437,.00125,8,48),alloy,0,0,.016);
  const centerStripe=new T.TorusGeometry(.160,.01772,20,10,.071).rotateZ(Math.PI/2-.0355);
  part(steering,centerStripe,rallyMat(0x91352f,.78));
  wheelHardware(steering);
  (steering.children.at(-1) as T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>).material.color.setHex(0x66594e);
  fitWheelEmblem(steering);
  const emblem=steering.getObjectByName('Apex wheel medallion')!;
  emblem.scale.setScalar(.85);emblem.position.z=.0178;
  (emblem.children[1] as T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>).material.color.setHex(0x34393c);
  (emblem.children[2] as T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>).material.color.setHex(0xe1dbcb);
  batchParts(steering);

  const paddleShape=paddleLever(),paddleMetal=rallyMetal(0x888889,.34);
  const paddles=[-1,1].map(side=>{
    const hinge=new T.Group();hinge.name=side===1?'R35 right paddle':'R35 left paddle';
    hinge.position.set(side*.131,.048,-.030);column.add(hinge);
    part(hinge,bevel(.031,.034,.023,.004),anodised,0,0,-.008);
    const paddle=part(hinge,paddleShape,paddleMetal,side*.009,.005,.009);
    if(side<0)paddle.rotation.y=Math.PI;
    const mark=part(hinge,new T.PlaneGeometry(.013,.010),engravedFace(side===1?'+':'−','#e3e0d7','#46494b'),side*.010,.038,.016);
    mark.castShadow=false;
    hitArea(hinge,hitTargets,side===1?'shift-up':'shift-down',[.038,.058,.030],side*.009,.036,.019);
    return hinge;
  });
  const controls=buildRallyControls(body,parent,hitTargets);
  parent.updateWorldMatrix(true,true);
  const display=buildRallyInstruments(body,parent);
  let paddleEnd=0,paddleSide=0;
  return {
    steering,column,display,
    trigger(action:Switch){
      controls.trigger(action);
      if(action==='shift-up'||action==='shift-down'){
        paddleSide=action==='shift-up'?1:-1;
        paddleEnd=performance.now()+175;
      }
    },
    sync(car:Vehicle,aux:boolean){
      display.sync(car);
      controls.sync(car,aux,display.brightness);
      const pull=Math.sin(Math.PI*T.MathUtils.clamp((paddleEnd-performance.now())/175,0,1));
      paddles.forEach((paddle,i)=>{
        const side=i===1?1:-1;
        paddle.rotation.y=side===paddleSide?side*pull*.23:0;
      });
      return {pull,side:paddleSide};
    },
  };
}
