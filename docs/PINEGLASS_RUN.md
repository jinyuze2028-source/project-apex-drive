# Pineglass Run 2.0

Pineglass Run 2.0 is a 6.554 km point-to-point gravel stage. It runs through the Quarry Hook hairpin, across the Glass Gorge viaduct and down into the valley. Both the Ferrari F40 and the Nissan GT-R R35 Rally Edition can run the stage in the offline edition.

## Driving and timing

Choose **Pineglass Run 2.0** in the garage, select **Drive** and start the engine. The stage has three sectors, ordered timing gates and a flying finish. Press **R** to restart from the grid. If the car gets stranded, stage recovery returns it to a safe point on the route and invalidates the current run. Stage records are stored per vehicle and route revision.

## Local verification

Install the pinned dependencies with `npm ci`, run `npm run assets:fetch`, and then start the frontend with `npm run dev -- --port 4181`.

```sh
npm run build
npm test
node scripts/pineglass-drive.mjs both
node scripts/pineglass-browser.mjs http://127.0.0.1:4181/ test-evidence/pineglass play
node scripts/pineglass-browser.mjs http://127.0.0.1:4181/ test-evidence/pineglass performance
```
