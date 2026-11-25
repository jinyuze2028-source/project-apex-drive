import type {Switch} from './f40-cabin.ts';

export const vehicleShortcuts = {
  transmission: ['transmission-key', 'Auto / Manual', 'KeyT'],
  'shift-down': ['downshift-key', 'Shift down', 'KeyQ'],
  'shift-up': ['upshift-key', 'Shift up', 'KeyE'],
  traction: ['traction-key', 'Traction control', 'KeyM'],
  abs: ['abs-key', 'ABS', 'KeyN'],
  light: ['light-key', 'Headlights', 'KeyL'],
  wiper: ['wiper-key', 'Wipers', 'KeyB'],
  ignition: ['ignition-key', 'Ignition', 'KeyI'],
  arms: ['arms-key', 'Driver arms', 'KeyF'],
  popup: ['popup-key', 'Pop-up / auxiliary lamps', 'KeyP'],
  left: ['left-key', 'Left indicator', 'KeyZ'],
  right: ['right-key', 'Right indicator', 'KeyX'],
  hazard: ['hazard-key', 'Hazard lights', 'KeyH'],
  parking: ['parking-key', 'Parking brake', 'KeyK'],
} as const satisfies Record<string, readonly [string, string, string]>;

export type VehicleShortcut = keyof typeof vehicleShortcuts;
export type ControlAction = Switch | 'arms' | 'abs';

const actions = Object.keys(vehicleShortcuts) as VehicleShortcut[];
const fixedKeys = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'KeyR', 'KeyO', 'KeyG', 'KeyV',
  'Escape', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F2',
]);
const choices = [
  ...Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ', letter => 'Key' + letter),
  ...Array.from('0123456789', digit => 'Digit' + digit),
  'BracketLeft', 'BracketRight', 'PageUp', 'PageDown',
].filter(code => !fixedKeys.has(code));

export function keyName(code: string) {
  return ({ BracketLeft: '[', BracketRight: ']', PageUp: 'Page Up', PageDown: 'Page Down' } as Record<string, string>)[code]
    ?? code.replace(/^(Key|Digit)/, '');
}
export function shortcutLabel(action: string) {
  if (!Object.hasOwn(vehicleShortcuts, action)) return '';
  const [id, , fallback] = vehicleShortcuts[action as VehicleShortcut];
  const field = document.getElementById(id) as HTMLSelectElement | null;
  return keyName(field?.value || fallback);
}

export function installBindings(root: HTMLElement, onChange: () => void) {
  const fields = new Map<VehicleShortcut, HTMLSelectElement>();
  const claimed = new Set<string>();
  const defaults = new Map<string, VehicleShortcut>(actions.map(action => [vehicleShortcuts[action][2], action]));
  function stored(id: string) {
    try { return localStorage.getItem('apex.' + id); } catch { return null; }
  }
  function save(field: HTMLSelectElement) {
    try { localStorage.setItem('apex.' + field.id, field.value); } catch {}
  }

  // Read old saved bindings first, including the previous J option for wipers.
  for (const action of actions) {
    const [id, name, fallback] = vehicleShortcuts[action];
    const saved = stored(id);
    const field = document.createElement('select');
    field.id = id;
    for (const code of choices) field.add(new Option(keyName(code), code));
    field.value = saved && choices.includes(saved) && !claimed.has(saved) ? saved :
      !claimed.has(fallback) ? fallback :
      choices.find(code => !claimed.has(code) && !defaults.has(code))!;
    claimed.add(field.value);
    const label = document.createElement('label');
    label.append(name, field);
    root.append(label);
    fields.set(action, field);
  }

  const status = document.getElementById('bindings-status')!;
  function sync() {
    for (const [action, field] of fields) {
      const taken = new Set([...fields].filter(([other]) => other !== action).map(([, other]) => other.value));
      for (const option of field.options) option.disabled = taken.has(option.value);
      field.dataset.previous = field.value;
    }
    onChange();
  }
  for (const [action, field] of fields) {
    field.addEventListener('change', () => {
      const collision = [...fields].find(([other, existing]) => other !== action && existing.value === field.value);
      if (collision || !choices.includes(field.value)) {
        status.textContent = collision ? keyName(field.value) + ' is already assigned to ' + vehicleShortcuts[collision[0]][1] + '.' :
          'Choose an available key.';
        field.value = field.dataset.previous!;
      } else {
        save(field);
        status.textContent = '';
      }
      sync();
    });
  }

  function restore() {
    for (const [action, field] of fields) {
      field.value = vehicleShortcuts[action][2];
      save(field);
    }
    status.textContent = 'Default bindings restored.';
    sync();
  }
  document.getElementById('restore-bindings')!.addEventListener('click', restore);
  sync();
  return {
    actionFor(code: string) {
      return actions.find(action => fields.get(action)!.value === code);
    },
    restore,
  };
}
