import {CarVisual} from './car-visual.ts';
import {rally,sport,type VehicleSpec} from './vehicle-spec.ts';
import type {VehicleVisual} from './vehicle-visual.ts';

type Entry={
  name:string; trim:string; engine:string; transmission:string; traction:string;
  description:string; credits:string; spec:VehicleSpec; build:()=>Promise<VehicleVisual>;
};
export const vehicles={
  f40:{
    name:'Ferrari F40',trim:'Road specification',engine:'2.9 L twin-turbo V8',transmission:'5-speed gated',
    traction:'Rear-wheel drive',description:'Lightweight mid-engine chassis, rear-wheel drive and a five-speed gated gearbox.',
    credits:'F40-CREDITS.txt',spec:sport,build:async()=>new CarVisual(sport),
  },
  r35:{
    name:'Nissan GT-R R35',trim:'Rally Edition',engine:'3.8 L twin-turbo V6',transmission:'6-speed DCT',
    traction:'Variable all-wheel drive',description:'Rear-biased active AWD, tarmac rally tires and long-travel suspension.',
    credits:'R35-CREDITS.txt',spec:rally,build:async()=>new (await import('./rally-visual.ts')).RallyVisual(rally),
  },
} satisfies Record<string,Entry>;
export type VehicleId=keyof typeof vehicles;
export const vehicleIds=Object.keys(vehicles) as VehicleId[];
export function isVehicleId(id:string|null):id is VehicleId{
  return id!==null&&Object.hasOwn(vehicles,id);
}
export function nominalPower(spec:VehicleSpec){
  return Math.round(Math.max(...spec.torqueCurve.map(([rpm,fraction])=>rpm*fraction*spec.peakTorque*Math.PI/30000)));
}
