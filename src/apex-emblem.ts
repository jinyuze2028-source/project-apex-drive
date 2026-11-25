import * as T from 'three';

export function fitWheelEmblem(wheel:T.Group){
  const ring=new T.MeshStandardMaterial({color:0xc0bbb2,metalness:.82,roughness:.33});
  const enamel=new T.MeshPhysicalMaterial({color:0xe3ad2c,roughness:.34,clearcoat:.65,clearcoatRoughness:.25});
  const graphite=new T.MeshStandardMaterial({color:0x202325,metalness:.15,roughness:.38});
  const center=new T.Group();
  center.name='Apex wheel medallion';
  center.position.z=.014;
  wheel.add(center);
  const bezel=new T.Mesh(new T.TorusGeometry(.0192,.00135,10,48),ring);
  const insert=new T.Mesh(new T.SphereGeometry(.0188,40,16,0,Math.PI*2,0,Math.PI/2).rotateX(Math.PI/2).scale(1,1,.115),enamel);
  center.add(bezel,insert);
  // Two forward-leaning strokes evoke the A and the racing line above its apex.
  const shape=new T.Shape();
  shape.moveTo(-.011,-.006);shape.lineTo(.0005,.008);shape.lineTo(.005,.008);
  shape.lineTo(.010,-.006);shape.lineTo(.0055,-.006);shape.lineTo(.002,.002);
  shape.lineTo(-.0045,-.006);shape.closePath();
  const cut=new T.Shape();
  cut.moveTo(-.001,-.006);cut.lineTo(.003,-.001);cut.lineTo(.0045,-.004);cut.lineTo(.0027,-.006);cut.closePath();
  const mark=new T.Mesh(new T.ExtrudeGeometry([shape,cut],{depth:.00048,bevelEnabled:false}),graphite);
  mark.position.z=.00205;
  center.add(mark);
}
