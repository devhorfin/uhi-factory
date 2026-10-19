// Record the floor in attract mode: 1280x720, ~34 s of webm via Playwright, then ffmpeg → a 30-second mp4 (H.264, no audio).
// node your-robot/tools/record_floor.cjs [url] [outDir]   (service must be running on :5447)
const path = require('path'); const fs = require('fs'); const { execSync } = require('child_process');
const { chromium } = require('C:/Users/User/Desktop/Claude code projects/world-of-hoodcraft/node_modules/playwright');
const URL = process.argv[2] || 'http://127.0.0.1:5447/plant.html';
const SECONDS = +(process.argv[4] || 40);
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '..', 'social'));
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-gpu-rasterization'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, recordVideo: { dir: OUT, size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  // frame the floor window: scroll so the stage fills the viewport, hide the nav and the figure strip for a clean plate
  await page.evaluate(() => { for (const sel of ['.nav', '#figs', '.fig', '#verbs']) { const el = document.querySelector(sel); if (el) el.style.display = 'none'; } const floor = document.getElementById('floor'); if (floor) { document.getElementById('stage').style.height = '640px'; window.scrollTo(0, floor.offsetTop + 60); } });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { if (window.__YR) { if (window.__YR.setView) window.__YR.setView('plant'); window.__YR.plant.resize(); window.__YR.plant.setAttract(true); } });
  await page.waitForTimeout(SECONDS * 1000 + 4000);
  const video = page.video(); await ctx.close(); const webm = await video.path(); await browser.close();
  const mp4 = path.join(OUT, `plant-${SECONDS}s.mp4`);
  try {
    const crop = URL.includes('plant.html') ? '' : 'crop=1044:636:118:0,';
    execSync(`ffmpeg -y -ss 2 -t ${SECONDS} -i "${webm}" -an -vf "${crop}scale=1280:-2:flags=lanczos,format=yuv420p" -c:v libx264 -preset slow -crf 20 -movflags +faststart "${mp4}"`, { stdio: 'inherit' });
    fs.unlinkSync(webm); console.log('wrote', mp4, fs.statSync(mp4).size, 'bytes');
  } catch (e) { console.log('ffmpeg failed or missing; webm kept at', webm, e.message); }
})();
