import {MathUtils,Vector3} from 'three';
import {courseLength,lineDistance,nearestStation,roadHalfWidth,sampleAt,stations} from './track.ts';

export const startDistance=lineDistance;
const gates=Array.from({length:20},(_,i)=>sampleAt(startDistance+courseLength*i/20));
const nodeCount=stations.length-1,spacing=courseLength/nodeCount;
export function lapTime(seconds:number|null){
  if(seconds===null)return '—';
  const ms=Math.round(seconds*1000);
  return [Math.floor(ms/60000),Math.floor(ms/1000)%60].map(n=>String(n).padStart(2,'0')).join(':')+'.'+String(ms%1000).padStart(3,'0');
}

export class LapTiming {
  count=0;
  best:number|null=null;
  last:number|null=null;
  progress=0;
  readonly history:Array<{lap:number;seconds:number}>=[];
  status:'waiting'|'running'|'invalid'='waiting';
  reason='';
  private node=-1;
  private previous=new Vector3();
  private initialized=false;
  private elapsed=0;
  private began=0;
  private nextGate=1;
  private distance=0;
  private peak=0;
  private arc=0;
  get current(){return this.status==='running'?this.elapsed-this.began:null;}
  records(){return {count:this.count,best:this.best,history:this.history.slice()};}
  restore(data:ReturnType<LapTiming['records']>){
    if(!data||!Number.isSafeInteger(data.count)||data.count<1||typeof data.best!=='number'||!(data.best>0)||!Array.isArray(data.history))return;
    const history=data.history.filter(l=>l&&Number.isSafeInteger(l.lap)&&l.lap>0&&l.lap<=data.count&&Number.isFinite(l.seconds)&&l.seconds>0).slice(0,6);
    this.count=data.count;this.best=data.best;this.last=history[0]?.seconds ?? null;
    this.history.splice(0,this.history.length,...history);
  }
  cancel(){this.status='waiting';this.reason='';this.node=-1;this.initialized=false;this.progress=0;}
  reset(){this.cancel();this.elapsed=0;this.count=0;this.best=this.last=null;this.history.length=0;}
  private invalidate(reason:string){if(this.status==='running'){this.status='invalid';this.reason=reason;}}
  private locate(p:Vector3){
    if(this.node<0)this.node=nearestStation(p.x,p.z).index;
    let best=Infinity,found=this.node;
    for(let i=-4;i<=4;i++){
      const idx=(this.node+i+nodeCount)%nodeCount,q=stations[idx].p,dist=(p.x-q.x)**2+(p.z-q.z)**2;
      if(dist<best){found=idx;best=dist;}
    }
    this.node=found;
    const {p:q,forward}=stations[found],dx=p.x-q.x,dz=p.z-q.z;
    const along=(dx*forward.x+dz*forward.z)/(forward.x**2+forward.z**2);
    const deviation=Math.hypot(dx-forward.x*along,dz-forward.z*along);
    return {arc:found*spacing+along,onRoad:deviation<roadHalfWidth+.60&&Math.abs(p.y-q.y-along*forward.y)<1.65};
  }
  step(p:Vector3,heading:Vector3,signedSpeed:number,dt:number){
    const old=this.previous;
    if(this.initialized&&old.distanceToSquared(p)>4){this.invalidate('Position jump');this.node=-1;this.initialized=false;}
    const loc=this.locate(p);
    this.elapsed+=dt;
    this.progress=MathUtils.euclideanModulo(loc.arc-startDistance,courseLength)/courseLength;
    if(this.initialized){
      let delta=loc.arc-this.arc;
      if(Math.abs(delta)>courseLength/2)delta-=Math.sign(delta)*courseLength;
      this.distance+=delta;this.peak=Math.max(this.distance,this.peak);
      if(!loc.onRoad)this.invalidate('Track limits');
      if(this.peak-this.distance>3)this.invalidate('Wrong direction');
      // Checking the local gates catches missed gates and reverse crossings as well as the finish.
      for(let i=0;i<gates.length;i++){
        const g=gates[i],x=p.x-g.p.x,z=p.z-g.p.z;
        if(Math.abs(x)>10||Math.abs(z)>10)continue;
        const a=(old.x-g.p.x)*g.forward.x+(old.z-g.p.z)*g.forward.z;
        const b=x*g.forward.x+z*g.forward.z;
        if(!(a<0&&b>=0)&&!(a>0&&b<=0))continue;
        if(!loc.onRoad||Math.abs(x*g.right.x+z*g.right.z)>roadHalfWidth+.30)continue;
        const forward=b>a&&heading.dot(g.forward)>.25&&signedSpeed>0;
        if(!forward){this.invalidate('Wrong direction');continue;}
        if(i===0){
          const when=this.elapsed-dt+dt*(-a/(b-a));
          if(this.status==='running'&&this.nextGate===gates.length&&this.distance>courseLength-5){
            const seconds=when-this.began;this.count++;this.last=seconds;this.best=this.best===null?seconds:Math.min(this.best,seconds);
            this.history.unshift({lap:this.count,seconds});if(this.history.length>6)this.history.pop();
          }
          this.began=when;this.distance=this.peak=0;this.nextGate=1;this.status='running';this.reason='';
        }else if(this.status==='running'){
          if(i===this.nextGate)this.nextGate++;else this.invalidate('Checkpoint missed');
        }
      }
    }
    this.arc=loc.arc;this.initialized=true;old.copy(p);
  }
}
