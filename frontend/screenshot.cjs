const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    defaultViewport: { width: 1440, height: 1000 }
  });
  const page = await browser.newPage();
  
  // Navigate to landing
  await page.goto('http://localhost:5173/StripeSpend/', { waitUntil: 'networkidle0' });
  
  // Inject demo data for screenshots
  await page.evaluate(() => {
    localStorage.setItem('stipestream_global', JSON.stringify({ tvl: 250000, distributedCount: 1540, activeStudents: 350, donorImpact: 'Visionary' }));
    localStorage.setItem('stipestream_student_demo', JSON.stringify({ payoutAmount: 500, intervalSecs: 2592000, lastClaimTime: 0, totalBalance: 3000, isVerified: true }));
  });
  await page.reload({ waitUntil: 'networkidle0' });

  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: '../site_home.png', fullPage: true });

  // Navigate to Student
  await page.evaluate(() => {
    // Force set the wallet address to our demo user so the state loads
    localStorage.setItem('stipestream_student_G1234567890', JSON.stringify({ payoutAmount: 500, intervalSecs: 2592000, lastClaimTime: 0, totalBalance: 3000, isVerified: true }));
  });
  
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent.includes('Student'));
    if (btn) btn.click();
    
    // Also simulate wallet connect in state by clicking Connect Wallet -> Social
    const connectBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Connect Wallet'));
    if (connectBtn) connectBtn.click();
  });
  await new Promise(r => setTimeout(r, 500));
  await page.evaluate(() => {
    const socialBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Social Login'));
    if (socialBtn) socialBtn.click();
  });
  // Wait a bit for render
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: '../site_stipends.png', fullPage: true });

  // Navigate to Donor
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent.includes('Donor'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: '../site_history.png', fullPage: true });

  await browser.close();
})();
