import * as T from 'three';
import {gaugeCrystal} from './cabin-hardware.ts';
import type {Vehicle} from './vehicle.ts';

const sweep=1.48*Math.PI;
const faceInk=1024;
const bezelMaterial=new T.MeshStandardMaterial({color:0x232729,metalness:.44,roughness:.47});
const pivotMaterial=new T.MeshStandardMaterial({color:0x3a3b37,metalness:.71,roughness:.34});

export class CockpitInstruments {
  private readonly levels: Array<{face:T.ShaderMaterial;pointer:T.MeshBasicMaterial}>=[];
  private readonly needles:Array<(car:Vehicle)=>void>=[];
  brightness=.35;

  add(panel:T.Group,x:number,y:number,r:number,title:string,values:string[],read:(car:Vehicle)=>number,redFrom=2){
    const bezel=new T.Mesh(new T.CylinderGeometry(r,r,.018,64).rotateX(Math.PI/2),bezelMaterial);
    bezel.name=title+' gauge';bezel.position.set(x,y,-.002);panel.add(bezel);
    const canvas=document.createElement('canvas');
    canvas.width=canvas.height=faceInk;
    const ctx=canvas.getContext('2d')!;
    ctx.scale(faceInk/768,faceInk/768);
    ctx.fillStyle='#111314';ctx.fillRect(0,0,768,768);
    ctx.textAlign='center';ctx.textBaseline='middle';
    const majorSteps=values.length-1,division=majorSteps>4?4:5;
    for(let i=0;i<=majorSteps*division;i++){
      const fraction=i/(majorSteps*division),angle=(fraction-.5)*sweep;
      const x=Math.sin(angle),y=-Math.cos(angle),major=i%division===0;
      ctx.strokeStyle=fraction>=redFrom?'#e76b4a':'#f8f3d9';
      ctx.lineWidth=major?13:values.length<5?7:5.5;
      ctx.beginPath();ctx.moveTo(384+x*338,384+y*338);
      ctx.lineTo(384+x*(major?286:310),384+y*(major?286:310));ctx.stroke();
      if(major){
        ctx.fillStyle=ctx.strokeStyle;
        ctx.font='bold '+(values.length>7?73:110)+'px Arial, sans-serif';
        ctx.fillText(values[i/division],384+x*227,384+y*227,146);
      }
    }
    ctx.fillStyle='#e8dfc1';
    if(title==='RPM × 1000'){
      ctx.font='bold 43px Arial, sans-serif';ctx.fillText('RPM',384,557,196);
      ctx.font='bold 35px Arial, sans-serif';ctx.fillText('×1000',384,611,192);
    }else{
      ctx.font='bold '+(values.length>7?52:65)+'px Arial, sans-serif';
      ctx.fillText(title,384,575,305);
    }
    const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=12;
    const face=new T.ShaderMaterial({
      uniforms:{dial:{value:map},backlight:{value:0}},
      vertexShader:'varying vec2 decal; void main(){decal=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec2 decal; uniform sampler2D dial; uniform float backlight;
        void main(){
          vec3 ink=texture2D(dial,decal).rgb;
          float tick=smoothstep(.035,.65,max(ink.r,max(ink.g,ink.b)));
          vec3 lit=ink*.79+vec3(.24,.19,.105)*tick*backlight;
          gl_FragColor=vec4(lit,1.);
          #include <colorspace_fragment>
        }`,
    });
    const dial=new T.Mesh(new T.CircleGeometry(r*.925,64),face);dial.position.z=.010;bezel.add(dial);
    const needle=new T.Group();needle.name=title+' needle';needle.position.z=.0125;bezel.add(needle);
    const profile=new T.Shape();profile.moveTo(-r*.058,-r*.16);profile.lineTo(-r*.034,r*.66);
    profile.lineTo(0,r*.855);profile.lineTo(r*.034,r*.66);profile.lineTo(r*.058,-r*.16);profile.closePath();
    const pointer=new T.MeshBasicMaterial({color:0xee792e,toneMapped:false});
    needle.add(new T.Mesh(new T.ExtrudeGeometry(profile,{depth:.0011,bevelEnabled:false}),pointer));
    const pin=new T.Mesh(new T.CylinderGeometry(r*.105,r*.105,.004,20).rotateX(Math.PI/2),pivotMaterial);
    pin.position.z=.016;bezel.add(pin);
    gaugeCrystal(bezel,r);
    this.levels.push({face,pointer});
    this.needles.push(car=>{needle.rotation.z=(.5-T.MathUtils.clamp(read(car),0,1))*sweep;});
  }

  sync(car:Vehicle){
    const level=car.ignition==='OUT'||car.ignition==='OFF'?0:this.brightness;
    for(const {face,pointer} of this.levels){
      face.uniforms.backlight.value=level;
      pointer.color.setRGB(.72+.22*level,.18+.19*level,.028+.07*level);
    }
    for(const read of this.needles)read(car);
  }
}
