import {existsSync} from 'node:fs';
import {chromium} from 'playwright-core';

const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export function launchTestBrowser() {
  const executablePath = process.env.CHROME_PATH ||
    (process.platform === 'darwin' && existsSync(macChrome) ? macChrome : undefined);
  return chromium.launch({
    headless: true,
    ...(executablePath ? {executablePath} : {channel: 'chromium'}),
    args: process.platform === 'darwin' ? ['--use-angle=metal'] : [],
  });
}
