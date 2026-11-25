import * as T from 'three';

export function makeAsphalt(color:T.Texture,normal:T.Texture,rough:T.Texture){
  const road=new T.MeshStandardMaterial({map:color,normalMap:normal,roughnessMap:rough,vertexColors:true,
    color:0xaeb0b1,roughness:.98,envMapIntensity:.34,normalScale:new T.Vector2(.89,.89)});
  road.customProgramCacheKey=()=> 'track-asphalt-v2';
  road.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      vec2 wideUv=vMapUv*.36;
      vec3 asphaltBase=texture2D(map,vMapUv).rgb;
      float age=.90+.09*sin(wideUv.x+sin(wideUv.y*.53))+.074*cos(wideUv.y+wideUv.x*.63);
      float freckle=sin(vMapUv.x*537.)*sin(vMapUv.y*477.+vMapUv.x*103.);
      float fine=1.-smoothstep(.50,2.1,length(fwidth(vMapUv*85.)));
      diffuseColor.rgb*=asphaltBase*age*(1.+freckle*fine*.078);
    `).replace('#include <roughnessmap_fragment>',`
      #include <roughnessmap_fragment>
      roughnessFactor=clamp(roughnessFactor*.40+.59,.83,.99);
    `);
  };
  return road;
}
