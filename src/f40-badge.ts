import * as T from 'three';

// Millimetre drawing of the slanted F40 lettering. The continuous cap is a
// characteristic feature of the wing mark; the requested grille mount is custom.
export function fitRearBadge(body:T.Group){
  const outline=(coords:number[][])=>{
    const path=new T.Shape();coords.forEach(([x,y],i)=>i?path.lineTo(x,y):path.moveTo(x,y));path.closePath();return path;
  };
  const f=outline([[3,60],[172,60],[170,54],[24,54],[21,40],[52,40],[50,33],[20,33],[14,7],[2,7],[12,54],[2,54]]);
  const four=outline([[42,16],[44,24],[87,51],[101,51],[95,24],[106,24],[104,16],[93,16],[91,7],[80,7],[82,16]]);
  const hole=new T.Path();hole.moveTo(58,24);hole.lineTo(84,24);hole.lineTo(88,43);hole.closePath();four.holes.push(hole);
  const zero=new T.Shape();zero.moveTo(121,51);zero.lineTo(150,51);zero.quadraticCurveTo(165,51,162,39);zero.lineTo(158,20);zero.quadraticCurveTo(156,7,145,7);zero.lineTo(114,7);zero.quadraticCurveTo(103,7,106,21);zero.lineTo(110,39);zero.quadraticCurveTo(112,51,121,51);
  const aperture=new T.Path();aperture.moveTo(124,43);aperture.quadraticCurveTo(121,43,120,38);aperture.lineTo(116,22);aperture.quadraticCurveTo(115,16,120,16);aperture.lineTo(143,16);aperture.quadraticCurveTo(147,16,148,22);aperture.lineTo(151,37);aperture.quadraticCurveTo(153,43,147,43);aperture.closePath();zero.holes.push(aperture);
  const group=new T.Group();group.name='F40 grille badge';group.position.set(0,.669,2.0315);group.rotation.x=.045;body.add(group);
  const red=new T.MeshPhysicalMaterial({color:0xd53d2c,metalness:.12,roughness:.30,clearcoat:.78,clearcoatRoughness:.23});
  const bevel=new T.MeshStandardMaterial({color:0x998f81,metalness:.85,roughness:.35});
  const geometry=new T.ExtrudeGeometry([f,four,zero],{depth:1.9,bevelEnabled:true,bevelThickness:.72,bevelSize:.72,bevelSegments:2,curveSegments:8});
  geometry.translate(-86,-33,0).scale(.00112,.00112,.001);
  const letters=new T.Mesh(geometry,[red,bevel]);letters.castShadow=letters.receiveShadow=true;group.add(letters);
  for(const x of [-.074,.063]){const pin=new T.Mesh(new T.CylinderGeometry(.0025,.0025,.013,8).rotateX(Math.PI/2),bevel);pin.position.set(x,.022,-.005);group.add(pin);}
}
