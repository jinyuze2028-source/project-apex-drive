import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';

const original = 'https://6b0525470b1bdef34dace483--project-apex-drive-955.netlify.app/assets/';
const demo = 'https://project-apex-drive-955.netlify.app/assets/';
const manifest = JSON.parse(await readFile(new URL('./vehicle-assets.json', import.meta.url), 'utf8'));
const directory = new URL('../public/assets/', import.meta.url);
await mkdir(directory, {recursive: true});

const matches = (bytes, expected) => createHash('sha256').update(bytes).digest('hex') === expected;
for (const [name, expected] of Object.entries(manifest)) {
  const output = new URL(name, directory);
  const existing = await readFile(output).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (existing && matches(existing, expected)) continue;
  if (existing) throw new Error(name + ' already exists with a different hash. Back up your local version before replacing it.');

  let verified;
  for (const base of [original, demo]) {
    try {
      const response = await fetch(base + name, {signal: AbortSignal.timeout(60_000)});
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!matches(bytes, expected)) throw new Error('SHA-256 differs from the published asset manifest');
      verified = bytes;
      break;
    } catch (error) {
      console.error(name + ' from ' + base + ' — ' + error.message);
    }
  }
  if (!verified) throw new Error('Could not verify ' + name + '. See THIRD_PARTY_NOTICES.md for manual setup.');
  await writeFile(output, verified, {flag: 'wx'});
  console.log('Verified ' + name);
}
