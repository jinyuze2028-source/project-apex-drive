// Original four-cycle, two-bank engine model. Order 4 is the combined exhaust
// firing frequency; vibration and alternating bank amplitudes add lower orders.
const TAU=2*Math.PI;
const size=2048,mask=size-1;
const sine=Float32Array.from({length:size},(_,i)=>Math.sin(TAU*i/size));
const osc=(cycle)=>sine[(cycle*size)&mask];
const ease=(a,b,value)=>{
  const t=Math.max(0,Math.min(1,(value-a)/(b-a)));
  return t*t*(3-2*t);
};
class F40Drive extends AudioWorkletProcessor{
  static get parameterDescriptors(){
    return [
      {name:'rpm',defaultValue:0,maxValue:8200},
      {name:'load',defaultValue:0,maxValue:1},
      {name:'boost',defaultValue:0,maxValue:1.4},
      {name:'running',defaultValue:0,maxValue:1},
      {name:'starter',defaultValue:0,maxValue:1},
      {name:'warm',defaultValue:0,maxValue:1},
      {name:'cut',defaultValue:0,maxValue:1},
      {name:'speed',defaultValue:0,maxValue:100},
    ].map(p=>({...p,minValue:0,automationRate:'k-rate'}));
  }
  constructor(){
    super();
    this.crank=0;this.turbine=0;this.motor=0;this.shaft=0;this.t=0;
    this.seed=92617;this.brown=0;this.hiss=0;
  }
  process(_inputs,outputs,p){
    const [exhaust,block,turbo]=outputs.map(bus=>bus[0]);
    const rpm=p.rpm[0],boost=p.boost[0],load=p.load[0],run=p.running[0],start=p.starter[0],warm=p.warm[0],cut=p.cut[0],speed=p.speed[0];
    const low=ease(1050,2700,rpm)*(1-ease(3700,5700,rpm));
    const mid=ease(2000,3800,rpm)*(1-ease(4950,7300,rpm));
    const high=ease(4300,7650,rpm);
    const overrun=(1-ease(.025,.32,load))*ease(1350,4300,rpm);
    const combustion=run*(1-.77*cut);
    for(let i=0;i<exhaust.length;i++){
      this.t+=1/sampleRate;
      this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;
      const n=this.seed/2147483648-1;
      this.brown+=(n-this.brown)*.145;
      this.hiss+=(n-this.hiss)*.42;
      const idle=(1-ease(950,1750,rpm))*(1-.55*warm);
      this.crank=(this.crank+Math.max(3,rpm/60)*(1+.018*idle*osc(this.t*7.6))/sampleRate)%2;
      const x=this.crank,bank=.48*osc(4*x)+.19*osc(8*x+.13)+.089*osc(12*x+.27);
      const resonant=(.048+.068*low)*osc(2*x+.18)+(.047+.09*mid)*osc(6*x+.29);
      const bark=load*(.09+.15*high)*(osc(16*x+.12)+.29*osc(20*x+.23));
      const exhaustFuzz=this.brown*(.032+.13*load+.027*high)*(1+.77*osc(4*x));
      const flutter=overrun*.13*(osc(2*x)*osc(12*x)+this.brown*osc(4*x));
      exhaust[i]=combustion*((bank+resonant+bark)*(.27+.31*load+.104*low)+exhaustFuzz+flutter);
      this.motor=(this.motor+(102+9*osc(2*x))/sampleRate)%1;
      this.shaft=(this.shaft+Math.max(18,speed*13.4)/sampleRate)%1;
      const crankStarter=start*(.19*osc(this.motor)+.11*osc(3*this.motor)+.095*osc(7*this.motor)+.066*this.brown)*(1+.46*osc(4*x));
      block[i]=crankStarter+run*(.066*osc(4*x+.26)+(.027+.029*high)*osc(14*x)+.076*osc(8*x+.29)
        +.075*this.brown*(.35+.65*load)+.028*ease(2,22,speed)*osc(this.shaft)*(.2+.8*load));
      this.turbine=(this.turbine+(840+2100*boost+.092*rpm)/sampleRate)%1;
      turbo[i]=run*((.018+.017*load)*osc(this.turbine)*boost+(.015*osc(this.turbine*2)+.16*this.hiss)*boost*load);
    }
    return true;
  }
}
registerProcessor('apex-f40-drive',F40Drive);
