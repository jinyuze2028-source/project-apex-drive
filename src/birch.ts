import * as T from 'three';
// Silver birch silhouette, modelled in metres at unit height for cell instancing.
export function birchGeometry(distant:boolean){
  const bark:number[]=[],leaves:number[]=[],colors:number[]=[];
  let seed=430193;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  const append=(array:number[],...vs:T.Vector3[])=>vs.forEach(v=>array.push(v.x,v.y,v.z));
  function limb(a:T.Vector3,b:T.Vector3,r1:number,r2:number){
    const geometry=new T.CylinderGeometry(r2,r1,a.distanceTo(b),distant?4:6,1,true).toNonIndexed();
    const up=new T.Vector3(0,1,0);
    const matrix=new T.Matrix4().compose(a.clone().lerp(b,.5),new T.Quaternion().setFromUnitVectors(up,b.clone().sub(a).normalize()),new T.Vector3(1,1,1));
    geometry.applyMatrix4(matrix);bark.push(...geometry.getAttribute('position').array);geometry.dispose();
  }
  function leaf(anchor:T.Vector3,size:number){
    const a=random()*Math.PI*2,tilt=random()-.4;
    const across=new T.Vector3(Math.cos(a),tilt,Math.sin(a)).multiplyScalar(size*.39);
    const tip=new T.Vector3(-Math.sin(a)*.65,-.48+random(),Math.cos(a)*.65).normalize().multiplyScalar(size);
    const mid=anchor.clone().addScaledVector(tip,.5),left=mid.clone().sub(across),right=mid.clone().add(across);
    const end=anchor.clone().add(tip);append(leaves,anchor,left,end,end,right,anchor);
    const shade=.6+random()*.4,h=anchor.y;
    for(let k=0;k<6;k++)colors.push((.14+h*.12)*shade,(.22+h*.14)*shade,.055*shade);
  }
  const root=new T.Vector3(),top=new T.Vector3(.025,.91,-.023);limb(root,top,.018,.004);
  const count=distant?19:28;
  for(let i=0;i<count;i++){
    const t=i/count,az=i*2.399+.18*random(),radius=(.12+.16*Math.sin(t*Math.PI))*(1-.49*t);
    const from=new T.Vector3(.025*t,.24+t*.62,0);
    const branch=new T.Vector3(Math.cos(az)*radius*.64,from.y+.135,Math.sin(az)*radius*.64);
    limb(from,branch,.008*(1-.55*t),.003);
    for(let k=0;k<(distant?3:5);k++){
      const angle=az+(random()-.5)*1.8,dist=radius*(.42+random()*.45);
      const end=branch.clone().add(new T.Vector3(Math.cos(angle)*dist,.075+.05*random(),Math.sin(angle)*dist));
      limb(branch,end,.0035,.001);
      for(let j=0;j<(distant?10:24);j++){
        const loc=branch.clone().lerp(end,.4+.8*random());
        loc.x+=(random()-.5)*.073;loc.y+=(random()-.5)*.08;loc.z+=(random()-.5)*.082;
        leaf(loc,(distant?.081:.039)*(.70+random()*.60));
      }
    }
  }
  const geometry=(pos:number[],col?:number[])=>{
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
    if(col)g.setAttribute('color',new T.Float32BufferAttribute(col,3));g.computeVertexNormals();return g;
  };
  return [geometry(bark),geometry(leaves,colors)];
}
