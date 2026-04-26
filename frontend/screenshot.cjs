const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    defaultViewport: { width: 1440, height: 900 }
  });
  const page = await browser.newPage();
  
  // Navigate to home
  await page.goto('http://localhost:5173/soroban4252026/', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: '../site_home.png', fullPage: true });

  // Navigate to Stipends
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent.includes('STIPENDS'));
    if (btn) btn.click();
  });
  // Wait a bit for render
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: '../site_stipends.png', fullPage: true });

  // Navigate to History
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent.includes('HISTORY'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: '../site_history.png', fullPage: true });

  await browser.close();
})();
