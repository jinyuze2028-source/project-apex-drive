// Original even-fire 60° V6 synthesis. Three combustion events per revolution,
// with separate exhaust banks and resonant intake, turbo and road channels.
const TAU=2*Math.PI;
const sine=Float32Array.from({length:2048},(_,i)=>Math.sin(TAU*i/2048));
const wave=x=>sine[(x*2048)&2047];
const wrap=x=>x-Math.floor(x);
class RallyDrive extends AudioWorkletProcessor {
  static get parameterDescriptors(){
    return Object.entries({rpm:7800,load:1,boost:1.4,running:1,starter:1,warm:1,cut:1,speed:110,dirt:1,scrub:1})
      .map(([name,maxValue])=>({name,maxValue,minValue:0,defaultValue:0,automationRate:'k-rate'}));
  }
  crank=0;
  compressor=0;
  starter=0;
  seed=1819309;
  rumble=0;
  envelope=0;
  process(_,out,p){
    const [exhaust,mechanics,intake]=out;
    const rpm=p.rpm[0], load=p.load[0], boost=p.boost[0], run=p.running[0], crank=p.starter[0];
    const cut=p.cut[0], speed=p.speed[0], dirt=p.dirt[0], scrub=p.scrub[0], heat=p.warm[0];
    const target=run*(1-.86*cut)*(.15+load*.53+boost*.075);
    for(let i=0;i<exhaust[0].length;i++){
      this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;
      const noise=this.seed/2147483648-1;
      this.rumble+=(noise-this.rumble)*.12;
      this.envelope+=(target-this.envelope)*.0017;
      const phase=this.crank=wrap(this.crank+Math.max(130,rpm)/(120*sampleRate));
      const bankA=wrap(phase*3),bankB=wrap(phase*3+.50);
      const pulseA=wave(bankA)*(.28+.72*(1-bankA)**4),pulseB=wave(bankB)*(.29+.71*(1-bankB)**4);
      const pulse=pulseA*(.94+.055*wave(phase))+.90*pulseB;
      const harmonics=(.39+.075*heat)*wave(phase*6+.27)+(.19+.14*load)*wave(phase*12+.075)
        +(.045+.09*load)*wave(phase*18)+.068*wave(phase*3);
      this.starter=wrap(this.starter+(78+rpm*.050)/sampleRate);
      this.compressor=wrap(this.compressor+(985+rpm*.147+boost*1180)/sampleRate);
      const chuff=this.rumble*(.11+load*.13);
      exhaust[0][i]=this.envelope*(harmonics+.37*pulse+chuff) + crank*(.032*wave(this.starter)+.026*noise);
      const rolling=Math.min(speed/24,1)*(.013+dirt*.095+scrub*.048);
      mechanics[0][i]=run*(.025*wave(phase*18)+.020*wave(phase*4))+rolling*(this.rumble+noise*(.10+dirt*.14));
      intake[0][i]=run*(boost*(.076*wave(this.compressor)+.034*noise)+load*.064*(this.rumble+wave(phase*6)));
    }
    return true;
  }
}
registerProcessor('apex-r35-drive',RallyDrive);
