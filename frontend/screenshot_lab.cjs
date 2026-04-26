const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    defaultViewport: { width: 1440, height: 900 }
  });
  const page = await browser.newPage();
  
  console.log('Navigating to Stellar Lab...');
  await page.goto('https://lab.stellar.org/r/testnet/contract/CCSUHUIWD7KLPACAVPROOFMUD6D3GPMEXJVXSRFB52BCVQHREKEH2YCV', { waitUntil: 'networkidle2' });
  
  // Wait a few seconds to let any React animations or data fetching finish
  await new Promise(r => setTimeout(r, 5000));
  
  console.log('Taking screenshot...');
  await page.screenshot({ path: '../stellar_lab_screenshot.png', fullPage: true });

  await browser.close();
  console.log('Done.');
})();
