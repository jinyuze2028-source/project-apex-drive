import * as T from 'three';

// Fold the photographed fir sprays over whorled, drooping limbs. Both the central
// ridge and the lateral shoots have depth and rotate with the branch, not the camera.
export function firBoughs(level:number){
  const vertices:number[]=[],uv:number[]=[],colors:number[]=[];
  let seed=8134471;
  const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
  const tiers=[22,15,9][level],segments=[5,3,2][level];
  for(let t=0;t<tiers;t++){
    const height=.15+t/tiers*.83,reach=.235*(1-height)**.63;
    const branches=7+Math.floor((1-height)*3);
    for(let j=0;j<branches;j++){
      const angle=t*2.399+(j+.35*random())*Math.PI*2/branches;
      const length=reach*(.81+.39*random()),drop=length*(.34+.23*random());
      for(let s=0;s<segments;s++){
        const u=(s+.10)/segments,r=length*u;
        const originY=height-drop*Math.sin(u*1.96),originX=Math.cos(angle)*r,originZ=Math.sin(angle)*r;
        for(const side of [-1,1]){
          const a=angle+side*(.79-.36*u+random()*.22);
          const l=length*(.76-.29*u),w=l*(.31+.10*random()),rise=l*(.15+.20*random());
          const position=(along:number,across:number,h:number)=>[
            originX+Math.cos(a)*along-Math.sin(a)*across,originY+h,
            originZ+Math.sin(a)*along+Math.cos(a)*across];
          const base=position(-.06*l,0,0),tip=position(l,0,rise);
          const left=position(l*.06,-w,-w*.36),right=position(l*.06,w,-w*.36);
          const endL=position(l,-w,rise-w*.58),endR=position(l,w,rise-w*.58);
          const [x0,y0,x1,y1]=random()<.45?[.307,.221,.638,.599]:[.647,.164,.965,.554];
          const xm=(x0+x1)/2,tone=(.67+.28*random())*(.82+.25*height);
          for(const [p,x,y] of [[left,x0,y0],[base,xm,y0],[tip,xm,y1],[left,x0,y0],[tip,xm,y1],[endL,x0,y1],
            [base,xm,y0],[right,x1,y0],[endR,x1,y1],[base,xm,y0],[endR,x1,y1],[tip,xm,y1]] as [number[],number,number][]){
            vertices.push(...p);uv.push(x,y);colors.push(tone*.76,tone*1.02,tone*.83);
          }
        }
      }
    }
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.computeVertexNormals();return geo;
}
