# Browser automation

- Run all automated browser checks in headless mode. Use `headless: true` with Playwright, Puppeteer, and any equivalent tool. In this project, import `launchTestBrowser` from `scripts/test-browser.mjs` for Playwright tests.
- Launch a separate browser instance with an isolated profile. Keep the user's browser windows, tabs, profiles, foreground application, and desktop untouched. Avoid focus commands such as `bringToFront()`.
- Use headless screenshots for visual review. Continue testing keyboard and mouse input, JavaScript, WebGL rendering, gameplay, and published URLs as part of authorized work.
- Close each test-owned browser in a `finally` block, including on assertion or setup failures. Close only the browser instance that the current test launched.
- Apply the same rules to browser MCP servers. Verify headless launch and isolation before use. If the server cannot satisfy either requirement, use the project's standalone runner.
- If a necessary check remains blocked after reasonable headless troubleshooting, ask for explicit permission before opening a visible browser. Wait for approval. Use a separate test instance if approved.

# Project Apex Drive

- Use the existing Three.js and TypeScript architecture, Rapier for vehicle dynamics, and Vite for the web build.
- Keep changes focused. Check both vehicles when editing shared systems. Verify driving behavior and rendering with real measurements.
- Run `npm run assets:fetch`, `npm run build` and `npm test` before requesting review.
- Track third-party licenses and keep vehicle GLBs, login data and local evidence outside Git.
- Make changes on a topic branch and open a pull request. Production publication belongs to the maintainer and targets the existing site.
