# Contributing to Project Apex Drive

1. Fork the project, clone your fork and add the original repository as `upstream`.
2. Fetch the integration branch and start a focused feature or fix branch.
3. Install dependencies and fetch the licensed car assets, then start the game.
4. Make and test your change. Commit it, push to your fork and open a pull request against `develop`.

```sh
git clone https://github.com/YOUR-LOGIN/project-apex-drive.git
cd project-apex-drive
git remote add upstream https://github.com/jinyuze2028-source/project-apex-drive.git
git fetch upstream
git switch -c feature/cockpit-improvement upstream/develop
npm ci
npm run assets:fetch
npm run dev
```

Run `npm run build` and `npm test` before pushing. Check both vehicles when touching shared systems. Use headless browser checks for vehicle, input and rendering changes. Include actual before and after screenshots for visual work and record performance measurements for rendering changes.

Use a clear commit message and push with `git push -u origin feature/cockpit-improvement`. Open GitHub's pull request form with this repository's `develop` as the base. Fill in the testing, cross-vehicle, performance, licensing and limitation fields. The project owner reviews integration into `main` through a pull request after the **Build and test** check passes.

Use the Bug report template with reproducible inputs, vehicle, browser, commit and expected and actual behavior. Use the Feature request template for proposals and discuss major features before implementing them. Keep each change focused, preserve working controls and both car profiles, and add only assets with documented redistribution rights. Preserve the existing production deployment, and keep credentials and private files out of commits.
