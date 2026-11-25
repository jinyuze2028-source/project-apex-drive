import * as T from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import type {VehicleVisual} from './vehicle-visual.ts';
import type {Vehicle} from './vehicle.ts';

const keyLight=(color:number,intensity:number,x:number,y:number,z:number)=>{
  const light=new T.DirectionalLight(color,intensity);light.position.set(x,y,z);return light;
};

export class Showroom {
  readonly scene=new T.Scene();
  private readonly camera=new T.PerspectiveCamera(36,1,.045,60);
  private readonly focus=new T.Vector3();
  private readonly ambient=new T.HemisphereLight(0xe9f1ff,0x646976,1.81);
  private readonly key=keyLight(0xffe9d4,2.85,-4,6,-5);
  private readonly fill=keyLight(0xaed7ff,2.55,4,4,3);
  private readonly rim=keyLight(0xfaf5eb,1.3,3,2,-4);
  private readonly deck:T.Mesh<T.CircleGeometry,T.MeshStandardMaterial>;
  private readonly tyreContacts:T.Mesh[]=[];
  private studioMap?:T.WebGLRenderTarget;
  private refined=false;
  private wheel=false;
  private yaw=-.71;
  private pitch=.22;
  private distance=8.15;
  cockpit=false;
  guideTarget:T.Vector3|null=null;
  guideFree=false;
  get guideView(){return this.camera;}
  guideLook(x:number,y:number){this.guideTarget=null;this.guideFree=true;this.camera.rotation.y-=x*.003;this.camera.rotation.x=T.MathUtils.clamp(this.camera.rotation.x-y*.003,-1.2,.4);}

  constructor(private readonly environment:T.Texture|null){
    const scene=this.scene;
    scene.background=new T.Color(0x171d24);
    scene.fog=new T.Fog(0x171d24,13,41);
    scene.environment=environment;
    scene.environmentIntensity=.88;
    scene.add(this.ambient,this.key,this.fill,this.rim);
    Object.assign(this.key.shadow.camera,{left:-3.3,right:3.3,top:3.3,bottom:-3.3,near:.5,far:17});
    this.key.shadow.camera.updateProjectionMatrix();
    this.key.shadow.camera.layers.enable(1);
    this.key.shadow.camera.layers.enable(3);
    this.key.shadow.mapSize.set(1024,1024);
    this.key.shadow.normalBias=.011;
    this.key.shadow.bias=-.00035;
    this.key.shadow.autoUpdate=false;
    this.deck=new T.Mesh(new T.CircleGeometry(4.05,108).rotateX(-Math.PI/2),
      new T.MeshStandardMaterial({color:0x343b46,roughness:.67,metalness:.19}));
    this.deck.position.y=-.008;scene.add(this.deck);
    const border=new T.Mesh(new T.RingGeometry(3.95,3.98,108).rotateX(-Math.PI/2),
      new T.MeshBasicMaterial({color:0x6e7783}));
    border.position.y=-.006;scene.add(border);
    const floor=new T.Mesh(new T.PlaneGeometry(100,100).rotateX(-Math.PI/2),
      new T.MeshStandardMaterial({color:0x242a31,roughness:.91}));
    floor.position.y=-.023;scene.add(floor);
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
    const ctx=canvas.getContext('2d')!,fade=ctx.createRadialGradient(64,64,8,64,64,64);
    fade.addColorStop(0,'#07090b');fade.addColorStop(.52,'#0d1016aa');fade.addColorStop(1,'#0d121700');
    ctx.fillStyle=fade;ctx.fillRect(0,0,128,128);
    const map=new T.CanvasTexture(canvas);
    const contact=new T.Mesh(new T.PlaneGeometry(3.35,5.85).rotateX(-Math.PI/2),
      new T.MeshBasicMaterial({map,transparent:true,depthWrite:false}));
    contact.position.y=.002;scene.add(contact);
    const patchGeometry=new T.PlaneGeometry(.42,.52).rotateX(-Math.PI/2);
    const patchMaterial=new T.MeshBasicMaterial({map,transparent:true,opacity:.84,depthWrite:false});
    for(let i=0;i<4;i++){
      const patch=new T.Mesh(patchGeometry,patchMaterial);
      patch.visible=false;patch.position.y=.004;patch.renderOrder=1;
      this.tyreContacts.push(patch);scene.add(patch);
    }
  }

  reset(){this.yaw=-.71;this.pitch=.22;this.distance=8.15;this.cockpit=false;this.wheel=false;}
  orbit(x:number,y:number){if(this.cockpit)return;this.yaw-=x*.008;this.pitch=T.MathUtils.clamp(this.pitch+y*.006,this.wheel?.01:.06,1.16);}
  zoom(delta:number){
    if(this.cockpit)return;
    this.distance=T.MathUtils.clamp(this.distance*Math.exp(delta*.0014),this.wheel?.93:4.7,this.wheel?2.6:13);
  }
  preset(angle:number){
    if(this.wheel){this.distance=8.15;this.pitch=.22;}
    this.wheel=false;this.yaw=angle;this.cockpit=false;
  }
  focusWheel(){this.wheel=true;this.yaw=-1.09;this.pitch=.27;this.distance=1.49;this.cockpit=false;}

  private lighting(renderer:T.WebGLRenderer,car:Vehicle,refined:boolean){
    if(this.refined===refined)return;
    this.refined=refined;
    if(refined&&!this.studioMap){
      const room=new RoomEnvironment(),filter=new T.PMREMGenerator(renderer);
      this.studioMap=filter.fromScene(room,.055);
      filter.dispose();room.dispose();
    }
    this.scene.environment=refined?this.studioMap!.texture:this.environment;
    this.scene.environmentIntensity=refined?.72:.88;
    this.ambient.intensity=refined?.87:1.81;
    this.key.intensity=refined?1.78:2.85;
    this.fill.intensity=refined?.73:2.55;
    this.rim.intensity=refined?1.05:1.3;
    this.deck.material.color.set(refined?0x2d333c:0x343b46);
    this.deck.receiveShadow=refined;
    this.key.castShadow=refined;
    if(refined){
      this.key.shadow.needsUpdate=true;
      renderer.shadowMap.needsUpdate=true;
    }
    this.tyreContacts.forEach((patch,i)=>{
      patch.visible=refined;patch.position.x=car.spec.wheels[i].x;patch.position.z=car.spec.wheels[i].z;
    });
  }

  render(renderer:T.WebGLRenderer,visual:VehicleVisual,car:Vehicle,width:number,height:number){
    visual.group.position.set(0,car.spec.radius+car.wheelState.reduce((sum,w)=>sum+w.length,0)/4-car.spec.mountHeight,0);
    visual.group.quaternion.identity();
    this.lighting(renderer,car,visual.studioLighting===true);
    const {camera}=this;
    camera.clearViewOffset();
    camera.aspect=width/height;
    camera.fov=this.cockpit?66:36;
    if(this.cockpit){
      camera.position.copy(visual.eye).add(visual.group.position);
      if(this.guideTarget)camera.lookAt(this.guideTarget);
      else if(!this.guideFree)camera.rotation.set(-.20,0,0);camera.layers.disable(1);
    }else{
      const mobile=width<800;
      const planar=this.distance*Math.cos(this.pitch);
      const stretch=Math.max(1,1.52/camera.aspect);
      this.focus.set(this.wheel?car.spec.wheels[0].x:0,this.wheel?car.spec.radius+.018:.61,this.wheel?car.spec.wheels[0].z:0);
      camera.position.set(Math.sin(this.yaw)*planar*stretch,this.distance*Math.sin(this.pitch)*stretch-.05,-Math.cos(this.yaw)*planar*stretch);
      camera.position.add(this.focus);camera.lookAt(this.focus);camera.layers.enable(1);
      if(!mobile)camera.setViewOffset(width,height,-width*.143,0,width,height);
      else camera.setViewOffset(width,height,0,height*.148,width,height);
    }
    camera.updateProjectionMatrix();
    if(this.cockpit)visual.mirrors.update(renderer,this.scene,visual.group,performance.now());
    renderer.render(this.scene,camera);
  }
}
