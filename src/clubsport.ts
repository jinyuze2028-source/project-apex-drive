import * as T from 'three';
import { batchParts } from './batch.ts';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

type Point = [number,number];
const alloy = new T.MeshStandardMaterial({color:0x69717b,metalness:.76,roughness:.33});
const graphite = new T.MeshStandardMaterial({color:0x22272b,metalness:.28,roughness:.55});
const rubber = new T.MeshStandardMaterial({color:0x25272a,roughness:.94});
const satin = new T.MeshPhysicalMaterial({color:0x24282b,metalness:.40,roughness:.45,clearcoat:.35});
function interiorGrain(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=96;
  const ctx=canvas.getContext('2d')!, pixels=ctx.createImageData(96,96);
  let seed=17;
  for(let i=0;i<96*96;i++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const v=138+(seed>>>25);
    for(let c=0;c<3;c++)pixels.data[i*4+c]=v;
    pixels.data[i*4+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  const map=new T.CanvasTexture(canvas);map.wrapS=map.wrapT=T.RepeatWrapping;
  map.repeat.set(52,52);map.anisotropy=4;return map;
}
const orange = new T.MeshStandardMaterial({color:0xf57632,roughness:.55});
const ivory = new T.MeshStandardMaterial({color:0xf0ebe1,metalness:.25,roughness:.36});

function piece(parent:T.Object3D, geo:T.BufferGeometry, mat:T.Material, x=0,y=0,z=0) {
  const m=new T.Mesh(geo,mat);
  m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;parent.add(m);
  return m;
}
function plate(outline:Point[], depth:number, bevel:number, holes:Point[][]=[]) {
  const shape=new T.Shape(outline.map(([x,y])=>new T.Vector2(x,y)));
  for(const points of holes)shape.holes.push(new T.Path(points.map(([x,y])=>new T.Vector2(x,y))));
  return new T.ExtrudeGeometry(shape,{depth,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:2,curveSegments:6});
}
function cap(parent:T.Object3D,x:number,y:number,z:number,r:number,depth:number,mat:T.Material, segments=16) {
  const m=piece(parent,new T.CylinderGeometry(r,r*1.04,depth,segments).rotateX(Math.PI/2),mat,x,y,z);
  return m;
}
function tube(parent:T.Object3D,points:number[][],radius:number,mat:T.Material,closed=false,segments=28) {
  const path=new T.CatmullRomCurve3(points.map(([x,y,z])=>new T.Vector3(x,y,z)),closed);
  return piece(parent,new T.TubeGeometry(path,segments,radius,8,closed),mat);
}
function badge(parent:T.Object3D,size:number,x:number,y:number,z:number) {
  // Two machined chevrons form the original split Apex insignia.
  const emblem=new T.Group();emblem.position.set(x,y,z);emblem.scale.setScalar(size);parent.add(emblem);
  piece(emblem,plate([[-.98,-.56],[-.42,-.56],[.20,.56],[-.34,.56]],.08,.018),ivory);
  piece(emblem,plate([[.05,-.56],[.98,-.56],[.50,.32],[.23,-.12],[.47,-.56]],.08,.015),orange);
  batchParts(emblem);
}
export function buildSteering(root:T.Group,base:number,hitTargets:T.Mesh[]) {
  const column=new T.Group();
  column.position.set(0,.683-base,-.855);column.rotation.x=-.31;root.add(column);
  cap(column,0,0,-.08,.045,.13,graphite,32);
  cap(column,0,0,-.044,.050,.018,alloy,32);
  const wheel=new T.Group();column.add(wheel);
  for(const sign of [-1,1]){
    const paddle=piece(wheel,plate([[-.019,-.060],[.013,-.067],[.029,-.024],[.022,.057],[-.01,.060],[-.022,.02]],.004,.002),alloy,sign*.115,.013,-.027);
    paddle.rotation.z=-sign*.15;
  }
  const face:Point[]=[[-.148,.065],[-.114,.099],[-.076,.096],[-.049,.071],[.049,.071],[.076,.096],[.114,.099],[.148,.065],[.137,-.040],[.082,-.073],[.053,-.102],[-.053,-.102],[-.082,-.073],[-.137,-.040]];
  piece(wheel,plate(face,.009,.004,[
    [[-.107,.055],[-.073,.057],[-.069,.036],[-.105,.026]],
    [[.107,.055],[.105,.026],[.069,.036],[.073,.057]],
    [[-.051,-.060],[0,-.078],[.051,-.060],[.042,-.048],[-.042,-.048]],
  ]),satin);
  // Swept grips with a thumb recess and a flared palm swell.
  for(const side of [-1,1]){
    const path=new T.CatmullRomCurve3([[.100,.086,0],[.143,.083,.003],[.153,.051,.012],[.151,.016,.018],[.145,-.025,.018],[.130,-.063,.010],[.113,-.077,0]].map(([x,y,z])=>new T.Vector3(x*side,y,z)));
    const verts:number[]=[],indices:number[]=[];
    const rings=32,sides=14;
    for(let i=0;i<=rings;i++){
      const u=i/rings,p=path.getPointAt(u),t=path.getTangentAt(u),sideAxis=new T.Vector3(-t.y,t.x,0).normalize(),depth=t.clone().cross(sideAxis);
      const radius=.014+.008*Math.sin(Math.PI*u)**.7+.003*Math.sin(3*Math.PI*u);
      for(let j=0;j<=sides;j++){
        const a=j/sides*2*Math.PI,pt=p.clone().addScaledVector(sideAxis,radius*Math.cos(a)).addScaledVector(depth,radius*1.12*Math.sin(a));verts.push(...pt.toArray());
        if(i<rings&&j<sides){const k=i*(sides+1)+j;indices.push(k,k+1,k+sides+1,k+1,k+sides+2,k+sides+1)}
      }
    }
    const grip=new T.BufferGeometry();grip.setAttribute('position',new T.Float32BufferAttribute(verts,3));grip.setIndex(indices);grip.computeVertexNormals();grip.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(verts.length/3*2),2));piece(wheel,grip,rubber);
    const seam=Array.from({length:12},(_,i)=>{const p=path.getPointAt((i+1)/13);return [p.x,p.y,p.z+.022]});
    tube(wheel,seam,.00085,graphite);
    for(const [j,y] of [.027,-.007].entries()){
      cap(wheel,side*.095,y,.013,.012,.008,graphite);
      const button=cap(wheel,side*.095,y,.020,.008,.007,j?alloy:side<0?orange:ivory);
      button.userData.action=j?(side<0?'light':'hazard'):(side<0?'left':'right');
      hitTargets.push(button);
    }
    const dial=cap(wheel,side*.066,-.033,.018,.014,.014,graphite,18);
    dial.userData.action=side<0?'traction':'parking';
    hitTargets.push(dial);
    const pointer=piece(wheel,new RoundedBoxGeometry(.0035,.012,.003,1,.001),orange,dial.position.x,dial.position.y+.002,.027);
    pointer.rotation.z=side*.45;
  }
  cap(wheel,0,.014,.013,.036,.010,graphite,36);badge(wheel,.025,0,.016,.020);
  for(const x of [-.042,.042])for(const y of [-.016,.047])cap(wheel,x,y,.014,.0034,.003,alloy,6);
  // Screen-print switch legends on the solid carbon plate.
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
  const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#e9ebdc';ctx.font='bold 23px sans-serif';ctx.textAlign='center';
  for(const [word,x,y] of [['L',228,182],['R',796,182],['LAMP',223,272],['HAZ',803,272],['TC',328,378],['P',701,378]] as const)ctx.fillText(word,x,y);
  const print=new T.CanvasTexture(canvas);print.colorSpace=T.SRGBColorSpace;
  const legend=new T.Mesh(new T.PlaneGeometry(.29,.18),new T.MeshBasicMaterial({map:print,transparent:true,depthWrite:false,toneMapped:false}));
  legend.position.z=.016;wheel.add(legend);
  batchParts(wheel);return wheel;
}

export function buildDash(root:T.Group,base:number) {
  const dash=new T.Group();dash.position.y=-base;root.add(dash);
  const pad=new T.MeshStandardMaterial({color:0x33393c,roughness:.87,bumpMap:interiorGrain(),bumpScale:.0014});
  // Padded brow with a continuous crowned top and a recessed instrument opening.
  const outlines:Point[][]=[];
  const xs=[-.86,-.60,-.33,-.20,0,.20,.35,.60,.86];
  for(const x of xs){
    const crown=.073*Math.exp(-(x*x)/.063);
    outlines.push([[-1.48,.782+crown],[-1.36,.827+crown],[-1.20,.826+crown],[-1.136,.800+crown],[-1.155,.744+crown],[-1.34,.691],[-1.51,.725]]);
  }
  const brow=loft(xs,outlines),v=brow.attributes.position,uv=brow.attributes.uv;
  for(let i=0;i<v.count;i++)uv.setXY(i,v.getX(i),v.getY(i)+v.getZ(i));
  piece(dash,brow,pad);
  const piping=xs.map((x,i)=>[x,outlines[i][3][1]-.008,outlines[i][3][0]+.001]);
  tube(dash,piping,.0027,rubber,false,60);
  for(const s of [-1,1]){
    const vent=new T.Group();vent.position.set(s*.49,.775,-1.145);vent.rotation.y=-s*.20;dash.add(vent);
    piece(vent,new RoundedBoxGeometry(.172,.072,.035,3,.011),alloy);
    piece(vent,new RoundedBoxGeometry(.163,.063,.018,3,.009),rubber,0,0,.018);
    for(let i=-2;i<=2;i++)piece(vent,new RoundedBoxGeometry(.148,.004,.012,1,.001),graphite,0,i*.010,.031).rotation.x=.27;
    piece(vent,new RoundedBoxGeometry(.008,.045,.014,1,.002),alloy,0,0,.034);
    batchParts(vent);
  }
  batchParts(dash);
}
function loft(xs:number[], sections:Point[][]) {
  const points:number[]=[],indices:number[]=[];
  const n=sections[0].length;
  for(let i=0;i<xs.length;i++)for(let j=0;j<n;j++){
    const [z,y]=sections[i][j];points.push(xs[i],y,z);
    if(i<xs.length-1){const a=i*n+j,b=i*n+(j+1)%n;indices.push(a,b,a+n,b,b+n,a+n)}
  }
  for(let k=1;k<n-1;k++)indices.push(0,k+1,k,(xs.length-1)*n,(xs.length-1)*n+k,(xs.length-1)*n+k+1);
  // Pick outward winding by signed volume for either order of the authored section.
  const V=(i:number)=>new T.Vector3().fromArray(points,3*i);
  let volume=0;
  for(let k=0;k<indices.length;k+=3)volume+=V(indices[k]).dot(V(indices[k+1]).cross(V(indices[k+2])));
  if(volume<0)for(let k=0;k<indices.length;k+=3)[indices[k+1],indices[k+2]]=[indices[k+2],indices[k+1]];
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points,3));g.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(points.length/3*2),2));g.setIndex(indices);g.computeVertexNormals();return g;
}

export function buildAero(root:T.Group,base:number) {
  const kit=new T.Group();kit.position.y=-base;root.add(kit);
  // Closed cambered foil, swept tips and a pair of cut-through aluminium uprights.
  const span=[-1.05,-.92,-.52,0,.52,.92,1.05];
  const foil=span.map(x=>{
    const pts:Point[]=[];const c=.28-.046*Math.abs(x),z=1.62+.065*x*x,y=1.14+.027*x*x;
    for(let k=0;k<32;k++){
      const a=2*Math.PI*k/32,u=(1-Math.cos(a))/2;
      const t=.036*Math.sin(a)*(1-.56*u);
      pts.push([z+c*u,y+.04*u+.016*Math.sin(Math.PI*u)+t]);
    }
    return pts;
  });
  piece(kit,loft(span,foil),satin);
  for(const s of [-1,1]){
    const mount=plate([[1.52,.89],[1.62,.89],[1.82,1.16],[1.70,1.15]],.020,.004,[[[1.59,.929],[1.63,.955],[1.725,1.108],[1.718,1.108]]]);
    mount.rotateY(-Math.PI/2);piece(kit,mount,graphite,s*.52);
    const end=plate([[1.64,1.155],[1.73,1.225],[1.99,1.235],[1.962,1.116],[1.76,1.102]],.011,.004);
    end.rotateY(-Math.PI/2);piece(kit,end,satin,s*1.047);
  }
  for(const x of [-.65,-.36,0,.36,.65]){
    const fin=plate([[1.30,.24],[1.57,.285],[1.90,.405],[1.93,.322],[1.56,.195],[1.32,.185]],.014,.003);
    fin.rotateY(-Math.PI/2);piece(kit,fin,graphite,x);
  }
  const xs=[-.93,-.74,-.40,0,.4,.74,.93];
  piece(kit,loft(xs,xs.map(x=>[[1.38,.245],[1.91-.10*x*x,.40],[1.91-.10*x*x,.373],[1.37,.215]])),satin);
  const lip=[-1.06,-.96,-.80,-.44,0,.44,.80,.96,1.06];
  piece(kit,loft(lip,lip.map(x=>{const nose=-2.49+.28*x*x;return [[nose+.23,.237],[nose,.244],[nose-.012,.216],[nose+.245,.207]]})),satin);
  batchParts(kit);
}

export function buildFascias(root:T.Group, shell:T.Object3D, base:number, head:T.MeshStandardMaterial, tail:T.MeshStandardMaterial) {
  root.updateMatrixWorld(true);
  const shellMeshes:T.Mesh[]=[];
  shell.traverse(o=>{if(o instanceof T.Mesh && !Array.isArray(o.material) && !o.material.transparent && /Body(Hood|RearPanels|PanelsColor)/.test(o.name)) shellMeshes.push(o)});
  const ray=new T.Raycaster(), group=new T.Group();root.add(group);
  const amber=[-1,1].map(()=>new T.MeshStandardMaterial({color:0x9b4d13,emissive:0xff780b,roughness:.28,emissiveIntensity:0}));
  function skin(x:number,h:number,end:number,depth:number){
    ray.set(new T.Vector3(x,h-base,end*3),new T.Vector3(0,0,-end));
    const hit=ray.intersectObjects(shellMeshes,false)[0];
    return [x,h-base,hit?hit.point.z+end*depth:end*(end>0?1.84:2.31)];
  }
  // Lamellae and light guides conform to the scanned surface of the actual fascia.
  for(const end of [-1,1]){
    const front=end<0;
    for(const s of [-1,1]){
      const line=Array.from({length:12},(_,j)=>{const u=j/11;return skin(s*(.29+.64*u),front?.588+.100*u:.740+.075*u,end,.011)});
      const positions=line.map(([x])=>x);
      const sockets=line.map(([,y,z],i)=>{
        const u=i/(line.length-1), r=.013+.015*Math.sin(u*Math.PI);
        return [[z-end*.013,y-r],[z+end*.022,y-r*.83],[z+end*.025,y+r*.68],[z+end*.010,y+r],[z-end*.014,y+r]] as Point[];
      });
      piece(group,loft(positions,sockets),graphite);
      const guides=line.map(([x,y,z],i)=>[x,y+.009*Math.sin(i/11*Math.PI),z+end*.027]);
      tube(group,guides,front?.0055:.008,front?head:tail,false,32);
      if(front){
        for(const j of [3,5,7]){
          const [x,y,z]=line[j];
          const optic=piece(group,new T.SphereGeometry(1,16,10),head,x,y-.007,z+end*.030);
          optic.scale.set(.018,.009,.005);
        }
      }else{
        tube(group,line.slice(2,10).map(([x,y,z])=>[x,y-.013,z+end*.024]),.004,tail,false,22);
      }
      const turn=line.slice(-4).map(([x,y,z])=>[x,y-.016,z+end*.031]);
      tube(group,turn,.006,amber[s>0?1:0],false,12);
    }
    const w=front?.66:.72, h=front?.39:.53;
    const grille=Array.from({length:21},(_,j)=>skin(w*(j/10-1),h,end,.012));
    const outline=[...grille.map(([x,y,z])=>[x,y+.051*(1-.28*(x/w)**2),z]),...grille.toReversed().map(([x,y,z])=>[x*.97,y-.054,z])];
    tube(group,outline,.010,graphite,true,64);
    const strip:number[]=[];
    for(let i=1;i<grille.length;i++){
      const a=outline[i-1],b=outline[i],c=outline[outline.length-i],d=outline[outline.length-1-i];
      strip.push(...a,...b,...c,...b,...d,...c);
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(strip,3));g.computeVertexNormals();
    const dark=new T.MeshStandardMaterial({color:0x14191b,roughness:.9,side:T.DoubleSide});piece(group,g,dark);
    for(let j=-2;j<=2;j++){
      const line=grille.map(([x,y,z])=>[x*.99,y+j*.017,z+end*.010]);
      tube(group,line,.004,graphite,false,18);
    }
  }
  const crest=skin(0,.746,1,.009);
  badge(group,.044,crest[0],crest[1],crest[2]);
  for(const s of [-1,1]){
    const exhaust=piece(group,new T.TorusGeometry(.056,.007,10,40),alloy,s*.58,.342-base,1.83);
    exhaust.scale.x=1.32;
    const throat=piece(group,new T.CylinderGeometry(.052,.051,.065,30).rotateX(Math.PI/2),rubber,s*.58,.342-base,1.80);throat.scale.x=1.33;
  }
  batchParts(group);return amber;
}
