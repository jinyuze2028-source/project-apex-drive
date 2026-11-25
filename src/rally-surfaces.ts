import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {bevel,part,rallyLit,rallyMat,rallyMetal} from './rally-details.ts';

function materialTexture(data:Uint8Array,size:number,color=false){
  const texture=new T.DataTexture(data,size,size);
  if(color)texture.colorSpace=T.SRGBColorSpace;
  texture.wrapS=texture.wrapT=T.RepeatWrapping;
  texture.generateMipmaps=true;texture.minFilter=T.LinearMipmapLinearFilter;
  texture.magFilter=T.LinearFilter;texture.anisotropy=8;texture.needsUpdate=true;
  return texture;
}

export function rallySurfaces(){
  const n=128,color=new Uint8Array(n*n*4),relief=new Uint8Array(color.length),coat=new Uint8Array(color.length);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const p=4*(j*n+i),x=i/16,y=j/16,onWarp=(Math.floor(x)+Math.floor(y))%4<2;
    const grain=(i*741+j*971+i*j*31)%103/103-.5;
    const yarn=onWarp?x:y;
    const ridge=.5-.5*Math.cos(2*Math.PI*yarn);
    const filaments=Math.sin(yarn*2*Math.PI*6);
    const c=35+ridge*9+filaments*1.5+grain*4;
    color.set([c,c+1,c+2,255],p);
    const bend=onWarp?(x*2*Math.PI):(y*2*Math.PI);
    relief.set([128+(onWarp?Math.sin(bend)*17:grain*5),
      128+(onWarp?grain*5:Math.sin(bend)*17),251,255],p);
    coat.set([128+grain*14,128+(((i*317+j*17+i*j*9)%97)/97-.5)*14,254,255],p);
  }
  const weave=materialTexture(relief,n),finish=materialTexture(coat,n);
  const carbon=new T.MeshPhysicalMaterial({color:0xaeb0b2,map:materialTexture(color,n,true),normalMap:weave,
    normalScale:new T.Vector2(.43,.43),metalness:.31,roughness:.48,clearcoat:.49,clearcoatRoughness:.28});
  finish.repeat.set(6,6);
  const paint=new T.MeshPhysicalMaterial({color:0xd9dce0,roughness:.32,metalness:.20,vertexColors:true,
    clearcoat:.89,clearcoatRoughness:.205,clearcoatNormalMap:finish,clearcoatNormalScale:new T.Vector2(.18,.18)});
  const windowGlass=new T.MeshPhysicalMaterial({color:0xa9c4c8,roughness:.099,metalness:.02,
    transparent:true,opacity:.105,depthWrite:false,side:T.DoubleSide,forceSinglePass:true,clearcoat:.71,
    clearcoatRoughness:.09,specularIntensity:.78});
  const lens=new T.MeshPhysicalMaterial({color:0xcddbdc,roughness:.13,transparent:true,opacity:.19,
    depthWrite:false,clearcoat:.89,clearcoatRoughness:.075,specularIntensity:1});
  const rearLens=lens.clone();rearLens.color.set(0xbe3d37);rearLens.opacity=.29;
  return {paint,carbon,windowGlass,lens,rearLens};
}

export function carbonUV(geometry:T.BufferGeometry,matrix?:T.Matrix4){
  const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal');
  const normalMatrix=matrix?new T.Matrix3().getNormalMatrix(matrix):null;
  const uv=new Float32Array(p.count*2),point=new T.Vector3(),norm=new T.Vector3();
  for(let i=0;i<p.count;i++){
    point.fromBufferAttribute(p,i);norm.fromBufferAttribute(n,i);
    if(matrix&&normalMatrix){point.applyMatrix4(matrix);norm.applyMatrix3(normalMatrix);}
    const x=Math.abs(norm.x),y=Math.abs(norm.y),z=Math.abs(norm.z);
    uv[i*2]=(x>y&&x>z?point.z:point.x)*32;
    uv[i*2+1]=(y>x&&y>z?point.z:point.y)*32;
  }
  geometry.setAttribute('uv',new T.BufferAttribute(uv,2));
}

export function paintBody(mesh:T.Mesh){
  const positions=mesh.geometry.getAttribute('position'),vertex=new T.Vector3();
  const values=new Float32Array(positions.count*3);
  for(let i=0;i<positions.count;i++){
    vertex.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);
    const sill=(1-T.MathUtils.smoothstep(vertex.y,-.19,.20))*.24;
    const sides=T.MathUtils.smoothstep(Math.abs(vertex.x),.36,.86);
    const grain=Math.sin(vertex.z*37+Math.sin(vertex.y*53)*2)*.08+.92;
    const dirt=sill*grain*(.53+sides*.47);
    values.set([1-dirt*.52,1-dirt*.65,1-dirt*.77],i*3);
  }
  mesh.geometry.setAttribute('color',new T.BufferAttribute(values,3));
}

function batch(parent:T.Group,geometries:T.BufferGeometry[],material:T.Material,name:string){
  const geo=mergeGeometries(geometries)!;
  const mesh=part(parent,geo,material);mesh.name=name;
  for(const source of geometries)source.dispose();
  return mesh;
}

// Sample the factory lamp face instead of using fixed depth for curved housings.
function lampPoint(mesh:T.Mesh,x:number,y:number,direction:number){
  const ray=new T.Raycaster(new T.Vector3(x,y,3*direction),new T.Vector3(0,0,-direction));
  return ray.intersectObject(mesh,false)[0]?.point;
}

export function buildRearOptics(root:T.Group,housings:T.Mesh[]){
  const carriers=new T.Group();carriers.name='R35 rear optics';root.add(carriers);
  const dark=rallyMat(0x471110,.44);
  const running=rallyLit(0x8f120b),brake=rallyLit(0xb92216);
  const bases:T.BufferGeometry[]=[],optics:T.BufferGeometry[]=[],reflectors:T.BufferGeometry[]=[];
  for(const mesh of housings){
    const side=Math.sign(new T.Box3().setFromObject(mesh).getCenter(new T.Vector3()).x);
    for(const [x,y,r] of [[.503,.526,.057],[.704,.539,.074]]){
      const center=new T.Vector3(x*side,y,0);
      for(let i=0;i<56;i++){
        const a=i/56*Math.PI*2,direction=new T.Vector3(Math.cos(a),Math.sin(a),0);
        const p=center.clone().addScaledVector(direction,r);
        const surface=lampPoint(mesh,p.x,p.y,1);
        if(!surface)continue;
        const offset=surface.z+.0018;
        // Facets follow the curvature of the two individual stock reflectors.
        bases.push(new T.BoxGeometry(.0065,.004,.002).rotateZ(a+Math.PI/2).translate(p.x,p.y,offset));
        if(i%2===0){
          optics.push(new T.BoxGeometry(.0041,.0020,.0024).rotateZ(a+Math.PI/2).translate(p.x,p.y,offset+.0014));
        }
        const inner=center.clone().addScaledVector(direction,r*.68);
        const backing=lampPoint(mesh,inner.x,inner.y,1);
        if(backing&&i%3===0){
          reflectors.push(new T.BoxGeometry(.005,.002,.0025).rotateZ(a+Math.PI/2)
            .translate(inner.x,inner.y,backing.z+.0016));
        }
      }
    }
  }
  if(bases.length)batch(carriers,bases,dark,'Four tail reflectors');
  if(optics.length)batch(carriers,optics,running,'Tail LED guides');
  if(reflectors.length)batch(carriers,reflectors,brake,'Brake LED guides');
  carriers.traverse(node=>{if(node instanceof T.Mesh)node.castShadow=false;});
  return {running,brake};
}

export function finishNose(root:T.Group,heads:T.Mesh[],lampGlass:T.Material){
  const LED=rallyLit(0xcde3f0),bright=rallyMetal(0xadbabb,.27);
  const headDetails=new T.Group();headDetails.name='R35 headlamp guides';root.add(headDetails);
  const guide:T.BufferGeometry[]=[],bezels:T.BufferGeometry[]=[];
  for(const mesh of heads){
    const side=Math.sign(new T.Box3().setFromObject(mesh).getCenter(new T.Vector3()).x);
    for(let i=0;i<18;i++){
      const t=i/17,x=(.676+.140*t)*side,y=.315+.132*t;
      const point=lampPoint(mesh,x,y,-1);
      if(!point)continue;
      guide.push(new T.BoxGeometry(.007,.0035,.003).rotateZ(.52*side)
        .translate(point.x,point.y,point.z-.0014));
      bezels.push(new T.BoxGeometry(.008,.006,.002).rotateZ(.52*side)
        .translate(point.x,point.y,point.z-.0007));
    }
  }
  if(guide.length)batch(headDetails,guide,LED,'Front LED track');
  if(bezels.length)batch(headDetails,bezels,bright,'Front LED track backing');
  headDetails.traverse(node=>{if(node instanceof T.Mesh)node.castShadow=false;});

  const glass=lampGlass.clone() as T.MeshPhysicalMaterial;
  glass.opacity=.25;glass.roughness=.13;
  const black=rallyMat(0x17191a,.58),silver=rallyMetal(0x9ca3a6,.24);
  silver.side=T.DoubleSide;
  const core=rallyLit(0xc9dfeb);core.color.set(0xaab4bb);
  const pods=new T.Group();pods.name='R35 auxiliary lamp assemblies';root.add(pods);
  const frontZ=-2.342;
  const barrel:T.BufferGeometry[]=[],mirrors:T.BufferGeometry[]=[],emitters:T.BufferGeometry[]=[],lenses:T.BufferGeometry[]=[];
  for(const x of [-.278,-.093,.093,.278]){
    barrel.push(new T.CylinderGeometry(.073,.065,.094,32,1,true).rotateX(Math.PI/2).translate(x,.552,frontZ+.033),
      new T.TorusGeometry(.063,.004,8,48).translate(x,.552,frontZ-.004));
    const points=[[.013,.040],[.023,.035],[.039,.024],[.054,.004],[.061,-.002]];
    const bowl=new T.LatheGeometry(points.map(([r,z])=>new T.Vector2(r,z)),48).rotateX(Math.PI/2);
    mirrors.push(bowl.translate(x,.552,frontZ));
    emitters.push(new T.SphereGeometry(.018,20,10).scale(1,1,.53).translate(x,.552,frontZ+.015));
    lenses.push(new T.SphereGeometry(.061,32,12).scale(1,1,.14).translate(x,.552,frontZ-.006));
  }
  batch(pods,barrel,black,'Auxiliary barrel and seals');
  batch(pods,mirrors,silver,'Auxiliary reflector bowls');
  batch(pods,emitters,core,'Auxiliary LED cores');
  const face=batch(pods,lenses,glass,'Clear auxiliary covers');face.renderOrder=3;face.castShadow=false;
  const backing=rallyMat(0x0c0d0e,.76),fins=rallyMetal(0x424346,.67);
  const radiator:T.BufferGeometry[]=[];
  for(let i=0;i<17;i++){
    for(let j=0;j<4;j++){
      const x=(i-8)*.052+.024*(j%2),y=.257+j*.027;
      const cell=new T.TorusGeometry(.026,.0014,4,6).scale(1,.56,1).translate(x,y,-2.18);
      radiator.push(cell);
    }
  }
  batch(root,radiator,fins,'Recessed grille lattice');
  part(root,new T.BoxGeometry(.94,.131,.026),backing,0,.297,-2.153);
  return {LED,core};
}

export function exhaustTips(parent:T.Group){
  const brushed=rallyMetal(0xa5a2a0,.35),heat=rallyMetal(0x675144,.50),soot=rallyMetal(0x343031,.77);
  soot.side=heat.side=T.DoubleSide;
  const skins:T.BufferGeometry[]=[],returns:T.BufferGeometry[]=[],liners:T.BufferGeometry[]=[];
  for(const side of [-1,1])for(const x of [.620,.735]){
    const end=2.348;
    const cross=(points:number[][])=>new T.LatheGeometry(points.map(([r,z])=>new T.Vector2(r,z)),48)
      .rotateX(Math.PI/2).translate(side*x,.318,end);
    skins.push(cross([[.046,-.122],[.051,-.071],[.052,-.015],[.051,.003],[.049,.006],[.046,.006],[.043,.002]]));
    returns.push(cross([[.043,-.063],[.043,-.010],[.046,.005]]));
    liners.push(cross([[.003,-.116],[.029,-.116],[.042,-.080],[.043,-.055]]));
  }
  batch(parent,skins,brushed,'Rolled titanium exhaust lips');
  batch(parent,returns,heat,'Heat-tinted exhaust returns');
  batch(parent,liners,soot,'Recessed exhaust liners');
}

export function fitFuelDoor(root:T.Group,panels:T.Mesh[]){
  const drawing=new T.Raycaster(),origin=new T.Vector3();
  drawing.ray.direction.set(-1,0,0);
  const vertices:T.Vector3[]=[];
  for(let i=0;i<52;i++){
    const a=i/52*Math.PI*2;
    const rounded=(value:number)=>Math.sign(value)*Math.abs(value)**.69;
    origin.set(1.5,.528+.051*rounded(Math.cos(a)),1.407+.064*rounded(Math.sin(a)));
    drawing.ray.origin.copy(origin);
    const hit=drawing.intersectObjects(panels,false)[0];
    if(!hit||hit.point.x<.82)return;
    hit.point.x+=.0018;vertices.push(hit.point);
  }
  const outline=new T.CatmullRomCurve3(vertices,true,'centripetal');
  const seam=part(root,new T.TubeGeometry(outline,80,.00089,5,true),rallyMat(0x242526,.76));
  seam.name='Right rear fuel flap seam';seam.castShadow=false;
}

export function fitRearBadges(root:T.Group,panels:T.Mesh[]){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
  const ctx=canvas.getContext('2d')!;
  const y=78;
  const metal=ctx.createLinearGradient(0,42,0,105);
  for(const [stop,color] of [[0,'#d9d9d6'],[.45,'#a7a6a0'],[.54,'#575657'],[1,'#dddcd6']] as const)metal.addColorStop(stop,color);
  ctx.textAlign='center';ctx.font='900 italic 66px system-ui';ctx.fillStyle=metal;ctx.fillText('GT',194,y);
  ctx.fillStyle='#a62220';ctx.fillText('R',271,y);
  ctx.font='800 40px system-ui';ctx.fillStyle=metal;ctx.fillText('NISSAN',256,202);
  const paint=new T.CanvasTexture(canvas);paint.colorSpace=T.SRGBColorSpace;paint.anisotropy=8;
  for(const [x,yy,w,h,upper] of [[.252,.536,.126,.040,1],[0,.571,.108,.020,0]]){
    const hit=panels.map(mesh=>lampPoint(mesh,x,yy,1)).filter(p=>p!==undefined).sort((a,b)=>b.z-a.z)[0];
    if(!hit)continue;
    const geometry=new T.PlaneGeometry(w,h);
    const uv=geometry.getAttribute('uv');
    for(let i=0;i<uv.count;i++){
      uv.setX(i,.15+uv.getX(i)*.65);
      uv.setY(i,(upper?.54:.12)+uv.getY(i)*(upper?.37:.29));
    }
    const name=part(root,geometry,new T.MeshPhysicalMaterial({map:paint,alphaTest:.25,transparent:true,
      depthWrite:false,roughness:.33,metalness:.54,clearcoat:.58,polygonOffset:true,polygonOffsetFactor:-1}),
      hit.x,hit.y,hit.z+.004);
    name.renderOrder=2;name.castShadow=false;
  }
  const recess=panels.map(mesh=>lampPoint(mesh,0,.337,1)).filter(p=>p!==undefined).sort((a,b)=>b.z-a.z)[0];
  if(recess){
    const plate=document.createElement('canvas');plate.width=384;plate.height=112;
    const label=plate.getContext('2d')!;
    label.fillStyle='#33383c';label.fillRect(0,0,384,112);
    label.strokeStyle='#5f666a';label.lineWidth=2;label.strokeRect(6,6,372,100);
    label.font='700 53px system-ui';label.textAlign='center';label.textBaseline='middle';
    label.fillStyle='#d8d6cc';label.fillText('APEX 035',192,59);
    for(const x of [16,368]){label.beginPath();label.arc(x,17,3,0,Math.PI*2);label.fill();}
    const map=new T.CanvasTexture(plate);map.colorSpace=T.SRGBColorSpace;map.anisotropy=8;
    const mounting=part(root,new T.PlaneGeometry(.265,.077),new T.MeshStandardMaterial({map,roughness:.61}),
      recess.x,recess.y,recess.z+.007);
    mounting.rotation.x=-.13;mounting.castShadow=false;
  }

}

export function buildRallyTrim(parent:T.Group,carbon:T.Material){
  const strap=rallyMat(0x262626,.87);
  const red=rallyMetal(0xad241e,.38),alloy=rallyMetal(0xa1a3a6,.37),black=rallyMat(0x14171b,.56);
  const skid=bevel(1.17,.031,.49,.012);carbonUV(skid);
  part(parent,skid,carbon,0,.175,-2.049).rotation.x=-.13;
  const wingSection=new T.Shape().moveTo(-.152,.005).bezierCurveTo(-.106,.047,.031,.036,.158,.012)
    .bezierCurveTo(.061,.005,-.051,-.034,-.152,.005);
  const wing=new T.ExtrudeGeometry(wingSection,{depth:1.53,bevelEnabled:false,curveSegments:24})
    .translate(0,0,-.765).rotateY(Math.PI/2);
  carbonUV(wing);part(parent,wing,carbon,0,1.081,1.951);
  for(const side of [-1,1]){
    const endPlate=bevel(.015,.126,.349,.009);carbonUV(endPlate);
    part(parent,endPlate,carbon,side*.758,1.084,1.951).rotation.x=.1;
    const stand=part(parent,bevel(.028,.234,.086,.009),black,side*.52,.971,1.913);
    stand.rotation.x=-.34;
    part(parent,bevel(.098,.022,.122,.007),alloy,side*.52,.871,1.885);
    for(const z of [1.848,1.922]){
      part(parent,new T.CylinderGeometry(.006,.006,.004,6),black,side*.52,.883,z);
      part(parent,new T.CylinderGeometry(.005,.005,.004,6).rotateZ(Math.PI/2),alloy,side*.536,1.049,z+.055);
    }
    for(const z of [-.995,1.795]){
      part(parent,bevel(.315,.257,.028,.013),strap,.861*side,.27,z).rotation.x=.093;
      part(parent,bevel(.22,.039,.032,.008),alloy,.861*side,.377,z+.008);
    }
  }
  exhaustTips(parent);
  const diffuser=bevel(.655,.018,.184,.008);carbonUV(diffuser);
  part(parent,diffuser,carbon,0,.264,2.223);
  for(const x of [-.275,-.139,0,.139,.275]){
    const profile=new T.Shape().moveTo(-.089,0).lineTo(.084,0)
      .lineTo(.082,-.032).quadraticCurveTo(.016,-.049,-.089,-.011).closePath();
    const strake=new T.ExtrudeGeometry(profile,{depth:.009,bevelEnabled:false,curveSegments:5}).rotateY(-Math.PI/2);
    carbonUV(strake);part(parent,strake,carbon,x,.263,2.228);
  }
  for(const [x,y,z,rotation] of [[-.42,.326,-2.326,0],[.37,.318,2.365,Math.PI]]){
    const ring=part(parent,new T.TorusGeometry(.047,.010,10,28),red,x,y,z);
    ring.rotation.set(.30,rotation,.17);ring.scale.y=.76;
  }
  const signals=[rallyLit(0x9d480e),rallyLit(0x9d480e)];
  part(parent,bevel(.748,.093,.098,.014),black,0,.535,-2.272);
  for(const [i,side] of [-1,1].entries()){
    part(parent,bevel(.128,.027,.021,.006),signals[i],side*.727,.50,-2.238);
    part(parent,bevel(.099,.024,.022,.005),signals[i],side*.758,.604,2.219);
  }
  const marking=(text:string,width:number,height:number,x:number,y:number,z:number,rear:boolean)=>{
    const canvas=document.createElement('canvas');canvas.width=384;canvas.height=128;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#182028';ctx.fillRect(0,0,384,128);
    ctx.font='italic 900 91px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle='#ece6df';ctx.fillText(text,192,69,336);
    if(text==='GT-R'){ctx.fillStyle='#c6332a';ctx.fillText('R',294,69,81);}
    const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=6;
    part(parent,bevel(width,height,.009,.004),black,x,y,z);
    const face=part(parent,new T.PlaneGeometry(width*.96,height*.91),new T.MeshStandardMaterial({map,roughness:.38}),
      x,y,z+(rear?.0048:-.0048));
    face.rotation.y=rear?0:Math.PI;
  };
  marking('GT-R',.104,.042,0,.457,-2.309,false);
  return {signals};
}
