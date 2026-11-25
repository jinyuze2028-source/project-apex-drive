import * as T from 'three';
import {courseLength,nearestStation,stations} from './track.ts';

const acrossBins=128,arcBins=4096;
export const wearHalfWidth=6.4;

// One metre-scale longitudinal axis and a separate, much finer transverse axis.
// Deposits persist for the session without adding decals or growing the draw list.
export class RoadWear {
  private readonly pixels=new Uint8Array(acrossBins*arcBins*4);
  readonly texture=new T.DataTexture(this.pixels,acrossBins,arcBins);
  readonly bytes=this.pixels.byteLength;
  private readonly touched=new Set<number>();
  private uploadTime=0;
  deposits=0;

  constructor(){
    const map=this.texture;
    map.wrapT=T.RepeatWrapping;
    map.magFilter=map.minFilter=T.LinearFilter;
    map.needsUpdate=true;
  }

  stamp(point:T.Vector3,amount:number,halfTread:number){
    const s=stations[nearestStation(point.x,point.z).index];
    const dx=point.x-s.p.x,dz=point.z-s.p.z;
    const across=dx*s.right.x+dz*s.right.z;
    if(Math.abs(across)>wearHalfWidth)return;
    const arc=s.distance+(dx*s.forward.x+dz*s.forward.z)/Math.hypot(s.forward.x,s.forward.z);
    const x=arc/courseLength*arcBins-.5;
    const y=(.5+across/(2*wearHalfWidth))*acrossBins-.5;
    const radius=halfTread*acrossBins/(2*wearHalfWidth)+.42;
    for(let row=Math.max(0,Math.floor(y-radius));row<Math.min(acrossBins,Math.ceil(y+radius)+1);row++){
      const profile=Math.max(0,1-(Math.abs(row-y)/radius)**2);
      for(let col=Math.floor(x);col<=Math.floor(x)+1;col++){
        const arcRow=T.MathUtils.euclideanModulo(col,arcBins);
        const offset=arcRow*acrossBins+row;
        const gain=Math.round(amount*profile*(1-Math.abs(col-x)));
        if(gain<1)continue;
        const index=offset*4,value=this.pixels[index];
        const next=Math.min(195,value+Math.max(1,Math.round(gain*(1-value/208))));
        if(next!==value){this.pixels[index]=next;this.touched.add(arcRow);}
      }
    }
    this.deposits++;
  }

  flush(time:number){
    if(!this.touched.size||time-this.uploadTime<.12)return;
    this.uploadTime=time;
    for(const row of this.touched)this.texture.addUpdateRange(row*acrossBins*4,acrossBins*4);
    this.touched.clear();
    this.texture.needsUpdate=true;
  }

  clear(){
    this.pixels.fill(0);this.deposits=0;this.uploadTime=0;this.touched.clear();
    this.texture.clearUpdateRanges();this.texture.needsUpdate=true;
  }

  apply(material:T.MeshStandardMaterial,strength:number){
    const base=material.onBeforeCompile,texture=this.texture;
    material.onBeforeCompile=function(shader,renderer){
      base.call(this,shader,renderer);
      shader.uniforms.drivenRubber={value:texture};
      shader.vertexShader='attribute vec2 trackWearUv; varying vec2 vTrackWear;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvTrackWear=trackWearUv;');
      shader.fragmentShader='varying vec2 vTrackWear; uniform sampler2D drivenRubber;\n'+shader.fragmentShader.replace('#include <color_fragment>',`
        #include <color_fragment>
        float rubberFade=1.-smoothstep(50.,175.,length(vViewPosition));
        float rubber=texture2D(drivenRubber,vTrackWear.yx).r*rubberFade;
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*.34+vec3(.010),rubber*${strength.toFixed(2)});
      `);
    };
    const key=material.customProgramCacheKey();
    material.customProgramCacheKey=()=>key+' rubber '+strength;
  }
}
