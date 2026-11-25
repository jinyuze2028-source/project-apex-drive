import * as T from 'three';

export function alpineGround(load:(path:string,srgb:boolean)=>T.Texture,panorama:Promise<T.Texture>){
  const backdrop={value:null as T.Texture|null};void panorama.then(texture=>{backdrop.value=texture;});
  const meadow=load('leafy_grass-diffuse.jpg',true),grassN=load('leafy_grass-nor_gl.jpg',false),grassR=load('leafy_grass-rough.jpg',false);
  const soil=load('brown-mud.jpg',true),dry=load('grass.jpg',true),rock=load('lichen_rock-diffuse.jpg',true),rockN=load('lichen_rock-nor_gl.jpg',false);
  const gravel=load('gravel-color.jpg',true),gravelN=load('gravel-normal.jpg',false),gravelR=load('gravel-roughness.jpg',false);
  const shoulder=new T.MeshStandardMaterial({map:gravel,normalMap:gravelN,roughnessMap:gravelR,normalScale:new T.Vector2(.75,.75),roughness:.95,color:0xb9b5a6});
  function ground(verge:boolean){
    const mat=new T.MeshPhysicalMaterial({specularIntensity:.16,map:meadow,normalMap:grassN,roughnessMap:grassR,vertexColors:!verge,color:0xd2dec7,roughness:.95});
    mat.onBeforeCompile=s=>{
      Object.assign(s.uniforms,{horizonPhoto:backdrop,dirtMap:{value:soil},dryMap:{value:dry},rockMap:{value:rock},screeMap:{value:gravel},screeNormal:{value:gravelN},bedrockNormal:{value:rockN},screeRough:{value:gravelR}});
      s.vertexShader='varying vec3 alpinePos;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n alpinePos=position;');
      s.fragmentShader=`varying vec3 alpinePos;
        uniform sampler2D dirtMap,dryMap,rockMap,screeMap,screeNormal,bedrockNormal,screeRough,horizonPhoto;
        float hashAlp(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
        float fieldAlp(vec2 p){vec2 a=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hashAlp(a),hashAlp(a+vec2(1,0)),f.x),mix(hashAlp(a+vec2(0,1)),hashAlp(a+1.),f.x),f.y);}
        `+s.fragmentShader.replace('#include <map_fragment>',`
        vec2 groundUV=alpinePos.xz*.59;
        float broad=fieldAlp(alpinePos.xz*.022),coverNoise=fieldAlp(alpinePos.xz*.16);
        vec3 surfaceN=normalize(cross(dFdx(alpinePos),dFdy(alpinePos)));
        float slope=1.-abs(surfaceN.y);
        float stones=smoothstep(.41,.81,.54*coverNoise+.26*broad+slope*1.7+${verge?'.17':'.0'});
        float cliff=smoothstep(.10,.42,slope+coverNoise*.105);
        float soilw=smoothstep(.48,.84,coverNoise*.54+broad*.41+slope*.52);
        vec3 fresh=texture2D(map,groundUV).rgb;
        vec3 other=texture2D(map,mat2(.80,-.60,.60,.80)*groundUV*.74+vec2(4.21,2.71)).rgb;
        vec3 field=mix(fresh,other,smoothstep(.31,.73,coverNoise)*.63)*vec3(.71,.89,.70);
        field=mix(field,texture2D(dryMap,groundUV*.48).rgb,smoothstep(.37,.85,broad)*.40);
        field=mix(field,texture2D(dirtMap,groundUV*.76).rgb,soilw*.86);
        field=mix(field,texture2D(screeMap,alpinePos.xz/2.3).rgb*vec3(.80,.78,.71),stones*.85);
        vec2 faceUV=mix(alpinePos.xz,vec2(alpinePos.x+alpinePos.z*.41,alpinePos.y),cliff)*.43;
        field=mix(field,texture2D(rockMap,faceUV).rgb,cliff);
        // Large vegetation patches stay visible beyond the range of individual blades.
        vec3 canopyTint=mix(vec3(.40,.56,.46),vec3(.94,.88,.69),smoothstep(.23,.80,broad+.16*(coverNoise-.5)));
        diffuseColor.rgb*=field*canopyTint*(.65+.44*coverNoise);
        `).replace('#include <roughnessmap_fragment>',`
          float roughnessFactor=roughness*mix(texture2D(roughnessMap,groundUV).g,texture2D(screeRough,alpinePos.xz/2.3).g,stones);
          roughnessFactor=clamp(roughnessFactor+.12*soilw,.82,1.);
        `).replace('#include <normal_fragment_maps>',`
          vec3 groundN=texture2D(normalMap,groundUV).xyz*2.-1.;
          groundN=mix(groundN,texture2D(screeNormal,alpinePos.xz/2.3).xyz*2.-1.,stones);
          groundN=mix(groundN,texture2D(bedrockNormal,faceUV).xyz*2.-1.,cliff);
          groundN.xy*=.74;normal=normalize(tbn*groundN);
        `);
      if(!verge)s.fragmentShader=s.fragmentShader.replace('#include <fog_fragment>',`
        #include <fog_fragment>
        float boundary=max(abs(alpinePos.x+12.)/1000.,abs(alpinePos.z+105.)/995.);
        if(boundary>.66){
          vec3 ray=normalize(alpinePos-cameraPosition);
          const float phi=3.14159265-.47;
          vec2 plane=mat2(cos(phi),sin(phi),-sin(phi),cos(phi))*ray.xz;
          vec2 skyUv=vec2(fract(atan(plane.y,plane.x)/6.28318531),asin(clamp(ray.y,-1.,1.))/3.14159265+.5);
          vec3 horizon=linearToOutputTexel(texture2D(horizonPhoto,skyUv)).rgb;
          gl_FragColor.rgb=mix(gl_FragColor.rgb,horizon,smoothstep(.66,.98,boundary));
        }
      `);
    };
    mat.customProgramCacheKey=()=>verge?'alpine-bank':'alpine-meadow';return mat;
  }
  return {terrain:ground(false),verge:ground(true),shoulder,rock,rockN};
}
