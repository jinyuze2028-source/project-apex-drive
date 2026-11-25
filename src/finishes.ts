import * as T from 'three';

function surfaceGrain(scale:number,finish:string){
  const n=128,data=new Uint8Array(n*n*4);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const k=4*(j*n+i),twist=Math.cos(i*Math.PI*.5)*Math.sin(j*Math.PI*.5);
    const grain=Math.sin(i*12.9898+j*78.233)*43758.5453;
    const speckle=(grain-Math.floor(grain)-.5)*.86;
    const weave=finish==='leather'?.2:finish==='dash'?.42:1;
    data[k]=128+(twist*weave+speckle)*scale;data[k+1]=128+(Math.cos(j*Math.PI*.5)*Math.sin(i*Math.PI*.5)*weave-speckle)*scale;data[k+2]=250;data[k+3]=255;
  }
  const map=new T.DataTexture(data,n,n,T.RGBAFormat);
  map.wrapS=map.wrapT=T.RepeatWrapping;map.generateMipmaps=true;map.minFilter=T.LinearMipmapLinearFilter;map.magFilter=T.LinearFilter;map.anisotropy=4;map.needsUpdate=true;return map;
}
const cabinMaps={
  leather:{map:surfaceGrain(26,'leather'),repeat:22,strength:.43},
  dash:{map:surfaceGrain(29,'dash'),repeat:26,strength:.38},
  textile:{map:surfaceGrain(46,'textile'),repeat:16,strength:.61},
  composite:{map:surfaceGrain(21,'composite'),repeat:15,strength:.29},
};
export const isSharedCabinTexture=(texture:T.Texture)=>Object.values(cabinMaps).some(({map})=>map===texture);
export function upholstery(mesh:T.Mesh,m:T.MeshStandardMaterial,finish:keyof typeof cabinMaps='leather'){
  const surface=cabinMaps[finish];
  const uv:number[]=[],p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i));
    const u=ax>ay&&ax>az?z:x, v=ay>az&&ay>ax?z:y;
    uv.push(u*surface.repeat,v*surface.repeat);
  }
  mesh.geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));m.normalMap=surface.map;m.normalScale.setScalar(surface.strength);
}
export function ribbedLens(material:T.MeshStandardMaterial,centerX:number){
  material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 lensPos;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nlensPos=position;');
    shader.fragmentShader='varying vec3 lensPos;\n'+shader.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      vec2 lens=vec2(abs(lensPos.x)-${centerX.toFixed(4)},lensPos.y-.667);
      float rings=length(lens)*1320.;
      float ribs=sin(rings)*.5+.5;
      float weight=1.-smoothstep(.55,2.5,fwidth(rings));
      diffuseColor.rgb*=mix(1.,.71+.46*ribs,weight);
    `);
  };
  material.customProgramCacheKey=()=>String(centerX);
}
