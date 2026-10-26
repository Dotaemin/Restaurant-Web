import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getRequest(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

function putRequest(url) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'PUT' }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function audit() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = 'C:\\Users\\LENOVO\\AppData\\Local\\Temp\\chrome_audit_user';
  if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

  console.log('Spawning headless Chrome...');
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--no-sandbox',
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--window-size=1280,900'
  ], { stdio: 'ignore' });

  // Wait for remote debugging to be ready
  let ready = false;
  for (let i = 0; i < 20; i++) {
    try {
      await getRequest('http://localhost:9222/json/version');
      ready = true;
      break;
    } catch (e) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  if (!ready) {
    chrome.kill();
    throw new Error('Chrome remote debugging port not available.');
  }

  try {
    console.log('Connecting to Chrome DevTools Protocol at http://localhost:9222 ...');
    
    // 1. Create a new target page for /admin/dishes
    const target = await putRequest('http://localhost:9222/json/new?http://localhost:5173/admin/dishes');
    console.log('Created target page ID:', target.id);
    console.log('WebSocket Debugger URL:', target.webSocketDebuggerUrl);
    
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let id = 1;
    const pending = new Map();

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const msgId = id++;
        pending.set(msgId, { resolve, reject });
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };

    await new Promise((resolve) => ws.onopen = resolve);
    console.log('Connected to WebSocket!');

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    // Wait 4 seconds for React hydration, font loading, and data fetching
    console.log('Waiting for page render and font loading...');
    await new Promise(r => setTimeout(r, 4000));

    // Evaluate Layout and Font Metrics
    const evalResult = await send('Runtime.evaluate', {
      expression: `(() => {
        // 1. Font check
        const fontAleoLoaded = document.fonts.check('16px Aleo');
        const bodyComputedFont = window.getComputedStyle(document.body).fontFamily;

        // 2. Navigation Bar
        const nav = document.querySelector('header nav');
        const navLinks = nav ? Array.from(nav.querySelectorAll('a')) : [];
        const navTops = navLinks.map(a => a.getBoundingClientRect().top);
        const isNavSingleLine = navTops.length > 0 && navTops.every(t => Math.abs(t - navTops[0]) < 4);

        // 3. Dishes Table
        const table = document.querySelector('table');
        const headers = table ? Array.from(table.querySelectorAll('th')).map(th => ({
          text: th.innerText.trim(),
          width: Math.round(th.getBoundingClientRect().width),
          height: Math.round(th.getBoundingClientRect().height)
        })) : [];

        const rows = table ? Array.from(table.querySelectorAll('tbody tr')).slice(0, 5).map(tr => ({
          height: Math.round(tr.getBoundingClientRect().height),
          priceCell: tr.children[2]?.innerText.trim(),
          priceFont: tr.children[2] ? window.getComputedStyle(tr.children[2]).fontFamily : null,
          priceTabular: tr.children[2] ? window.getComputedStyle(tr.children[2]).fontVariantNumeric : null
        })) : [];

        // 4. Buttons with Icons
        const buttons = Array.from(document.querySelectorAll('button')).slice(0, 10).map(btn => {
          const icon = btn.querySelector('svg');
          const textSpan = btn.querySelector('span');
          if (!icon || !textSpan) return null;
          const iconRect = icon.getBoundingClientRect();
          const textRect = textSpan.getBoundingClientRect();
          const iconCenterY = iconRect.top + iconRect.height / 2;
          const textCenterY = textRect.top + textRect.height / 2;
          return {
            text: textSpan.innerText.trim(),
            centerYDiff: Math.round(Math.abs(iconCenterY - textCenterY) * 10) / 10
          };
        }).filter(Boolean);

        return {
          fontAleoLoaded,
          bodyComputedFont,
          isNavSingleLine,
          navLinksCount: navLinks.length,
          headers,
          rows,
          buttons
        };
      })()`,
      returnByValue: true
    });

    const auditData = evalResult.result ? evalResult.result.value : evalResult.value;
    console.log('\n========================================');
    console.log('AUDIT RESULTS FOR /admin/dishes');
    console.log('========================================');
    console.log('Aleo Font Loaded in document.fonts:', auditData.fontAleoLoaded ? 'YES ✅' : 'NO ❌');
    console.log('Body Computed Font Family:', auditData.bodyComputedFont);
    console.log('Navigation Bar Single Line:', auditData.isNavSingleLine ? 'YES ✅' : 'NO ❌', '(' + auditData.navLinksCount + ' items)');
    console.log('Table Column Headers:', JSON.stringify(auditData.headers, null, 2));
    console.log('Sample Row Heights & Tabular Nums:', JSON.stringify(auditData.rows, null, 2));
    console.log('Button Icon/Text Alignment:', JSON.stringify(auditData.buttons, null, 2));

    // Capture screenshot
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    const outDir = path.join(__dirname, '../audit');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'admin-dishes.png'), Buffer.from(screenshot.data, 'base64'));
    console.log('📸 Screenshot saved to audit/admin-dishes.png');

    // Close page
    await getRequest(`http://localhost:9222/json/close/${target.id}`);
    ws.close();

    // Test Customer /dishes page as well
    const customerTarget = await putRequest('http://localhost:9222/json/new?http://localhost:5173/dishes');
    const wsCust = new WebSocket(customerTarget.webSocketDebuggerUrl);
    let idCust = 1;
    const pendingCust = new Map();

    function sendCust(method, params = {}) {
      return new Promise((resolve, reject) => {
        const msgId = idCust++;
        pendingCust.set(msgId, { resolve, reject });
        wsCust.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    wsCust.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pendingCust.has(msg.id)) {
        const { resolve, reject } = pendingCust.get(msg.id);
        pendingCust.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };

    await new Promise((resolve) => wsCust.onopen = resolve);
    await sendCust('Page.enable');
    await sendCust('Runtime.enable');
    await sendCust('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    await new Promise(r => setTimeout(r, 4000));

    // Evaluate customer page nav and buttons
    const custEval = await sendCust('Runtime.evaluate', {
      expression: `(() => {
        const nav = document.querySelector('header nav');
        const navLinks = nav ? Array.from(nav.querySelectorAll('a')) : [];
        const navTops = navLinks.map(a => a.getBoundingClientRect().top);
        const isNavSingleLine = navTops.length > 0 && navTops.every(t => Math.abs(t - navTops[0]) < 4);

        const cards = Array.from(document.querySelectorAll('.dish-card-button, [class*="group hover:shadow"]')).slice(0, 3).map(card => {
          const price = card.querySelector('[class*="tabular-nums"], [class*="font-extrabold text-[#ba1414]"]');
          return {
            height: Math.round(card.getBoundingClientRect().height),
            price: price ? price.innerText.trim() : null,
            priceFont: price ? window.getComputedStyle(price).fontFamily : null,
            priceTabular: price ? window.getComputedStyle(price).fontVariantNumeric : null
          };
        });

        return { isNavSingleLine, navLinksCount: navLinks.length, cards };
      })()`,
      returnByValue: true
    });

    const custData = custEval.result ? custEval.result.value : custEval.value;
    console.log('\n========================================');
    console.log('AUDIT RESULTS FOR /dishes');
    console.log('========================================');
    console.log('Customer Nav Single Line:', custData.isNavSingleLine ? 'YES ✅' : 'NO ❌');
    console.log('Sample Customer Dish Cards:', JSON.stringify(custData.cards, null, 2));

    const custScreenshot = await sendCust('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(outDir, 'customer-dishes.png'), Buffer.from(custScreenshot.data, 'base64'));
    console.log('📸 Screenshot saved to audit/customer-dishes.png');

    await getRequest(`http://localhost:9222/json/close/${customerTarget.id}`);
    wsCust.close();
  } finally {
    chrome.kill();
  }
}

audit().catch(console.error);
