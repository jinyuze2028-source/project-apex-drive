import * as T from 'three';
import {part,rallyMat,rallyMetal} from './rally-details.ts';
import type {Vehicle} from './vehicle.ts';

const tilt=-.334, upY=Math.cos(tilt), upZ=Math.sin(tilt);
const planeY=({y,z}:T.Vector3)=>y*upY+z*upZ;
const gaugeStart=T.MathUtils.degToRad(133),gaugeEnd=-gaugeStart;

type Dial={name:string;axis:[number,number,number];radius:number;scale:number;steps:number;major:number;unit:string;redFrom?:number;ends?:[string,string]};
const dials:Dial[]=[
  {name:'Speedometer',axis:[-.4626,.9020,-.4178],radius:.0399,scale:340,steps:34,major:4,unit:'km/h'},
  {name:'Tachometer',axis:[-.3696,.9037,-.4154],radius:.0497,scale:9,steps:36,major:4,unit:'×1000 r/min',redFrom:7},
  {name:'Fuel',axis:[-.2937,.8752,-.4094],radius:.0168,scale:1,steps:4,major:4,unit:'FUEL',ends:['E','F']},
  {name:'Coolant',axis:[-.2545,.9029,-.4193],radius:.0168,scale:1,steps:4,major:4,unit:'TEMP',ends:['C','H']},
];
export const rallyDialAngle=(fraction:number)=>T.MathUtils.lerp(gaugeStart,gaugeEnd,T.MathUtils.clamp(fraction,0,1));

function canvasMap(width:number,height:number){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d')!;
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=8;
  return {canvas,context,map};
}

function stockMesh(body:T.Group,name:string){
  const node=body.getObjectByName(name);
  if(!(node instanceof T.Mesh))throw Error('Missing R35 cockpit surface: '+name);
  return node as T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>;
}

function buildFaces(body:T.Group,root:T.Group){
  const stock=stockMesh(body,'r35_gauges_r35_gauges_0');
  const {canvas,context:c,map}=canvasMap(1536,640);
  const ppm=5400,left=-.511,top=1.043;
  c.fillStyle='#15171a';c.fillRect(0,0,canvas.width,canvas.height);
  const pos=stock.geometry.getAttribute('position'),uv=new Float32Array(2*pos.count);
  const toCabin=root.matrixWorld.clone().invert().multiply(stock.matrixWorld),p=new T.Vector3();
  for(let i=0;i<pos.count;i++){
    p.fromBufferAttribute(pos,i).applyMatrix4(toCabin);
    uv[2*i]=(p.x-left)*ppm/canvas.width;
    uv[2*i+1]=1-(top-planeY(p))*ppm/canvas.height;
  }
  stock.geometry.setAttribute('uv',new T.BufferAttribute(uv,2));
  const face=stock.material=new T.MeshStandardMaterial({
    map,emissiveMap:map,emissive:0xf9eee2,emissiveIntensity:.1,roughness:.64,metalness:.06,side:T.DoubleSide,
  });
  const needleMaterial=new T.MeshStandardMaterial({color:0xb84632,emissive:0xe45d41,emissiveIntensity:.16,roughness:.55});
  const pivotCap=rallyMetal(0x242528,.52),rim=rallyMetal(0x626569,.43);
  const glass=new T.MeshPhysicalMaterial({color:0xc2cbca,roughness:.12,metalness:0,
    transparent:true,opacity:.073,depthWrite:false,clearcoat:.72,clearcoatRoughness:.13});
  const needles=dials.map(dial=>{
    const axis=new T.Vector3(...dial.axis);
    const px=(axis.x-left)*ppm,py=(top-planeY(axis))*ppm,r=dial.radius*ppm;
    c.save();c.translate(px,py);
    const gradient=c.createRadialGradient(0,0,0,0,0,r);
    gradient.addColorStop(0,'#181a1e');gradient.addColorStop(.9,'#232529');gradient.addColorStop(1,'#101216');
    c.fillStyle=gradient;c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill();
    c.strokeStyle='#8a8c8b';c.lineWidth=Math.max(2,r*.013);c.beginPath();c.arc(0,0,r*.93,0,Math.PI*2);c.stroke();
    if(dial.redFrom!==undefined){
      const a=rallyDialAngle(dial.redFrom/dial.scale);
      c.strokeStyle='#913a31';c.lineWidth=r*.125;
      c.beginPath();c.arc(0,0,r*.82,-a-Math.PI/2,-gaugeEnd-Math.PI/2);c.stroke();
    }
    for(let i=0;i<=dial.steps;i++){
      const fraction=i/dial.steps,a=-rallyDialAngle(fraction)-Math.PI/2;
      const major=i%dial.major===0||i===dial.steps;
      const sin=Math.sin(a),cos=Math.cos(a),outer=r*.89,inner=r*(major?.77:.837);
      c.strokeStyle=major?'#e5e0d5':'#b4b6b4';c.lineWidth=major?r*.021:r*.012;
      c.beginPath();c.moveTo(inner*cos,inner*sin);c.lineTo(outer*cos,outer*sin);c.stroke();
      if(dial.ends?(i===0||i===dial.steps):i%dial.major===0){
        const value=dial.ends?dial.ends[i===0?0:1]:String(Math.round(fraction*dial.scale));
        c.fillStyle='#efebe1';c.font='600 '+Math.round(r*(dial.ends?.28:.19))+'px Arial';
        c.textAlign='center';c.textBaseline='middle';c.fillText(value,r*.63*cos,r*.63*sin);
      }
    }
    c.font='600 '+Math.round(r*(dial.ends?.17:.115))+'px Arial';c.fillStyle='#acafaa';c.textAlign='center';c.textBaseline='middle';
    c.fillText(dial.unit,0,r*.44);c.restore();

    const mount=new T.Group();mount.name='R35 '+dial.name+' spindle';mount.position.copy(axis);mount.rotation.x=tilt;root.add(mount);
    part(mount,new T.TorusGeometry(dial.radius*.975,.00072,7,64),rim,0,0,-.0002).castShadow=false;
    const needle=new T.Group();needle.name='R35 '+dial.name+' needle';mount.add(needle);
    const length=dial.radius*.81;
    const blade=new T.Shape().moveTo(-.00115,-.0047).lineTo(.00115,-.0047).lineTo(.00049,length)
      .lineTo(-.00049,length).closePath();
    part(needle,new T.ExtrudeGeometry(blade,{depth:.00105,bevelEnabled:false}),needleMaterial,0,0,.0019).castShadow=false;
    part(mount,new T.CylinderGeometry(dial.radius*.108,dial.radius*.125,.0033,22).rotateX(Math.PI/2),pivotCap,0,0,.0035).castShadow=false;
    const lens=part(mount,new T.SphereGeometry(dial.radius*.951,36,12,0,Math.PI*2,0,Math.PI/2)
      .rotateX(Math.PI/2).scale(1,1,.046),glass,0,0,.0047);
    lens.name='R35 '+dial.name+' instrument lens';lens.castShadow=false;lens.renderOrder=2;
    return needle;
  });
  map.needsUpdate=true;
  return {face,needleMaterial,needles};
}

export function buildRallyInstruments(body:T.Group,root:T.Group){
  const {face,needleMaterial,needles}=buildFaces(body,root);
  const gear=canvasMap(256,176);
  const gearFace=new T.MeshStandardMaterial({map:gear.map,emissiveMap:gear.map,emissive:0xffebc7,emissiveIntensity:.43,roughness:.49});
  const gearGlass=part(root,new T.PlaneGeometry(.028,.020),gearFace,-.2935,.9286,-.4210);
  gearGlass.name='R35 factory gear aperture';gearGlass.rotation.x=tilt;gearGlass.castShadow=false;
  const display=canvasMap(832,466);
  const screen=stockMesh(body,'r35_dash_2017_r35_screen_0');
  const screenMaterial=screen.material=new T.MeshStandardMaterial({
    color:0x565859,map:display.map,emissiveMap:display.map,emissive:0xffffff,emissiveIntensity:.52,
    roughness:.41,metalness:.04,side:T.DoubleSide,
  });
  const draw=display.context;
  const digits=gear.context;
  let lastGear='?',lastReadings='',refreshAt=0;
  let lastRequested:number|null=null;
  const dark=rallyMat(0x141517,.71);
  const hood=stockMesh(body,'r35_gauges_r35_display_0');
  hood.material=dark;
  // This stock mesh also contains warning/LCD shapes laid over the tachometer.
  // Retain the gear aperture, leaving the restored face clear of the old overlays.
  const stockIndices=hood.geometry.index!;
  const position=hood.geometry.getAttribute('position'),p=new T.Vector3();
  const toCabin=root.matrixWorld.clone().invert().multiply(hood.matrixWorld);
  const inGearAperture=(i:number)=>{
    p.fromBufferAttribute(position,i).applyMatrix4(toCabin);
    return p.x>-.314&&p.x<-.275&&p.y>.912;
  };
  const gearTrim:number[]=[];
  for(let i=0;i<stockIndices.count;i+=3){
    const a=stockIndices.getX(i),b=stockIndices.getX(i+1),c=stockIndices.getX(i+2);
    if(inGearAperture(a)&&inGearAperture(b)&&inGearAperture(c))gearTrim.push(a,b,c);
  }
  if(gearTrim.length)hood.geometry.setIndex(gearTrim);else hood.visible=false;
  return {
    brightness:.35,
    sync(car:Vehicle){
      const powered=car.ignition!=='OUT'&&car.ignition!=='OFF';
      const [speed,tach,fuel,temp]=needles;
      speed.rotation.z=rallyDialAngle(car.speed*3.6/340);
      tach.rotation.z=rallyDialAngle(car.rpm/9000);
      fuel.rotation.z=rallyDialAngle(powered?car.fuelLitres/car.spec.fuel.capacityLitres:0);
      temp.rotation.z=rallyDialAngle(powered?(car.waterTemp-35)/90:0);
      face.emissiveIntensity=powered?.21+.48*this.brightness:.06;
      needleMaterial.emissiveIntensity=powered?.24+.22*this.brightness:.05;
      gearFace.emissiveIntensity=powered?.24+.57*this.brightness:0;
      screenMaterial.emissiveIntensity=powered?.50+.57*this.brightness:.05;
      const indicatedGear=car.indicatedGear;
      const gearText=!powered?'':indicatedGear===0?'N':indicatedGear===-1?'R':String(indicatedGear);
      if(gearText!==lastGear){
        digits.fillStyle='#111519';digits.fillRect(0,0,256,176);
        digits.font='700 132px ui-monospace, monospace';digits.fillStyle='#ffd49c';
        digits.textAlign='center';digits.textBaseline='middle';digits.fillText(gearText,128,95);
        gear.map.needsUpdate=true;lastGear=gearText;
      }
      const now=performance.now();
      const request=car.pendingManualGear;
      if(now<refreshAt&&request===lastRequested)return;
      lastRequested=request;refreshAt=now+94;
      const boost=car.boostBar.toFixed(2),front=Math.round(car.deliveredFrontShare*100);
      const oil=Math.round(car.oilTemp),water=Math.round(car.waterTemp),litres=car.fuelLitres.toFixed(1);
      const tc=car.tcActive?'CUT':car.tractionControl?'ON':'OFF',abs=car.absActive?'LIMIT':car.absEnabled?'ON':'OFF';
      const requestedGear=request===-1?'R':request===0?'N':String(request);
      const mode=request===null?(car.automatic?'AUTO':'MANUAL'):'SHIFT → '+requestedGear;
      const key=[powered,boost,front,oil,water,litres,tc,abs,mode,car.assistMode].join('/');
      if(key===lastReadings)return;
      lastReadings=key;
      draw.fillStyle='#11171a';draw.fillRect(0,0,832,466);
      if(powered){
        draw.fillStyle='#283237';draw.fillRect(0,0,832,69);
        draw.font='600 34px system-ui';draw.fillStyle='#d3dedf';draw.fillText('POWERTRAIN',28,46);draw.fillText(mode,627,46);
        for(const [i,label,value,unit] of [[0,'BOOST',boost,'bar'],[1,'COOLANT',water,'°C'],[2,'OIL',oil,'°C'],[3,'FUEL',litres,'L']] as const){
          const x=28+(i%2)*410,y=i<2?113:230;
          draw.font='600 27px system-ui';draw.fillStyle='#9aaab0';draw.fillText(label,x,y);
          draw.font='600 49px ui-monospace, monospace';draw.fillStyle='#e1e5e1';draw.fillText(String(value),x,y+58);
          draw.font='25px system-ui';draw.fillStyle='#afbbbd';draw.fillText(unit,x+190,y+57);
        }
        draw.fillStyle='#29363a';draw.fillRect(28,310,776,2);
        draw.font='600 27px system-ui';draw.fillStyle='#c3d1d3';draw.fillText('AWD  /  F '+front+' · R '+(100-front)+' %',28,353);
        draw.fillStyle='#344347';draw.fillRect(28,370,776,7);
        draw.fillStyle='#96acac';draw.fillRect(28,370,776*front/100,7);
        draw.font='600 27px system-ui';draw.fillStyle='#b4c4c7';draw.fillText(car.assistMode.toUpperCase()+'  ·  TC '+tc+'  ·  ABS '+abs,28,424);
      }
      display.map.needsUpdate=true;
    },
  };
}
