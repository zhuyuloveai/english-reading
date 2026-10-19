const {chromium, webkit} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {pathToFileURL} = require('node:url');
const css = (page, selector, property) => page.locator(selector).first().evaluate((node, key) => getComputedStyle(node)[key], property);
const settled = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
(async () => {
  const engine = process.env.BROWSER === 'webkit' ? 'webkit' : 'chromium';
  const browser = await (engine === 'webkit' ? webkit : chromium).launch({headless:true, ...(engine === 'chromium' ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {})});
  const errors = [];
  const observe = page => page.on('pageerror', e => errors.push(e.message));
  const page = await browser.newPage({viewport:{width:1100,height:1000}}); observe(page);
  await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
  const original = await page.locator('#reader').textContent();
  const subtitle = await page.locator('#article-subtitle').textContent();
  const links = await page.locator('#reader a').evaluateAll(nodes => nodes.map(n => [n.textContent,n.href]));
  const bold = await page.locator('#reader strong').allTextContents();
  assert.equal(await css(page, '#reader p', 'fontSize'), '19px');
  await page.locator('#gradient-on').click();
  await page.locator('#size-xlarge').click();
  await page.locator('#focus-on').click(); await settled(page);
  assert.equal(await css(page, '#reader p', 'fontSize'), '23px');
  const firstPaint = await css(page, '.gradient-word', 'backgroundImage');
  assert.match(firstPaint, /linear-gradient/);
  assert.notEqual(firstPaint, await css(page, '#reader p .gradient-word:last-child', 'backgroundImage'));
  assert.equal(await css(page, '#reader p:first-child', 'opacity'), '1');
  assert.equal(await css(page, '#reader p:nth-child(2)', 'opacity'), '0.42');
  await page.locator('#focus-next').click();
  assert.equal(await page.locator('#focus-position').textContent(), '2 / 14 段');
  await page.locator('#reader p').nth(3).click();
  assert.equal(await page.locator('#focus-position').textContent(), '4 / 14 段');
  await page.locator('#reader p').nth(3).focus();
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator('#focus-position').textContent(), '5 / 14 段');
  assert.equal(await page.locator('#reader p').nth(4).evaluate(e=>e===document.activeElement), true);
  await page.keyboard.press('ArrowUp');
  assert.equal(await page.locator('#focus-position').textContent(), '4 / 14 段');
  // Changing emphasis repeatedly must preserve exact content and valid link/bold markup.
  for (const level of ['off','soft','strong','off','strong']) {
    await page.locator('#aid-'+level).click(); await settled(page);
    assert.equal(await page.locator('#reader').textContent(), original);
    assert.equal(await page.locator('#article-subtitle').textContent(), subtitle);
    assert.equal(await page.locator('.gradient-word .gradient-word').count(), 0);
    assert.equal(await page.locator('.word-cue .word-cue').count(), 0);
    assert.match(await css(page,'.gradient-word','backgroundImage'), /linear-gradient/);
  }
  assert.deepEqual(await page.locator('#reader a').evaluateAll(nodes=>nodes.map(n=>[n.textContent,n.href])),links);
  assert.deepEqual(await page.locator('#reader strong').allTextContents(),bold);
  await page.reload(); await settled(page);
  for (const id of ['gradient-on','size-xlarge','focus-on']) assert.equal(await page.locator('#'+id).getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#focus-position').textContent(),'4 / 14 段');
  await page.locator('#restart').click(); await page.locator('#confirm-reset').click();
  for (const id of ['gradient-on','size-xlarge','focus-on']) assert.equal(await page.locator('#'+id).getAttribute('aria-pressed'),'true');
  // Exam and print restore fully visible, uncolored text.
  await page.locator('#exam-layout').click();
  assert.equal(await css(page,'#reader p','fontSize'),'16px');
  assert.equal(await css(page,'#reader p:nth-child(2)','opacity'),'1');
  assert.equal(await css(page,'.gradient-word','backgroundImage'),'none');
  assert.equal(await page.locator('#focus-navigation').isVisible(),false);
  await page.locator('#reading-layout').click(); await page.emulateMedia({media:'print'});
  assert.equal(await css(page,'#reader p:nth-child(2)','opacity'),'1');
  assert.equal(await css(page,'.gradient-word','backgroundImage'),'none');
  assert.equal(await page.locator('#focus-navigation').isVisible(),false);
  await page.emulateMedia({media:'screen'});
  const [download] = await Promise.all([page.waitForEvent('download'),page.locator('#download-paper').click()]);
  const exported = path.join(__dirname,'preferences-export-'+engine+'.html'); await download.saveAs(exported);
  // Both export layouts keep their preferences when opened with no previous storage.
  await page.locator('#exam-layout').click();
  const [examDownload] = await Promise.all([page.waitForEvent('download'),page.locator('#download-paper').click()]);
  const examExported = path.join(__dirname,'preferences-exam-export-'+engine+'.html'); await examDownload.saveAs(examExported);
  const examContext = await browser.newContext(); const examPage = await examContext.newPage(); observe(examPage);
  await examPage.goto(pathToFileURL(examExported).href);
  assert.equal(await examPage.locator('body').getAttribute('data-layout'),'exam');
  await examPage.locator('#reading-layout').click(); await settled(examPage);
  assert.match(await css(examPage,'.gradient-word','backgroundImage'),/linear-gradient/);
  assert.equal(await examPage.locator('#focus-navigation').isVisible(),true);
  assert.equal(await css(examPage,'#reader p','fontSize'),'23px'); await examContext.close();
  for (const width of [320,375,390,430]) {
    const context = await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true});
    let requests = 0; await context.route(/^https?:/, route=>{requests++;route.abort();});
    const mobile = await context.newPage(); observe(mobile); await mobile.goto(pathToFileURL(exported).href); await settled(mobile);
    assert.equal(await mobile.locator('#focus-position').textContent(),'1 / 14 段');
    assert.equal(await mobile.locator('.analysis').count(),0);
    for (const [size,px] of [['standard','18px'],['large','20px'],['xlarge','22px']]) {
      await mobile.locator('#size-'+size).tap(); await settled(mobile);
      assert.equal(await css(mobile,'#reader p','fontSize'),px);
      assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.match(await css(mobile,'.gradient-word','backgroundImage'),/linear-gradient/);
    }
    const beforeResize = await mobile.locator('#reader .gradient-word').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).backgroundImage));
    await mobile.setViewportSize({width:width+60,height:844}); await settled(mobile);
    const afterResize = await mobile.locator('#reader .gradient-word').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).backgroundImage));
    assert.notDeepEqual(beforeResize,afterResize,'gradient should follow actual line widths');
    await mobile.setViewportSize({width,height:844}); await settled(mobile);
    const targets = await mobile.locator('#reading-aid-controls button').evaluateAll(nodes=>nodes.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})));
    assert.ok(targets.every(rect=>rect.w>=44&&rect.h>=44));
    if(width===390) {
      await mobile.screenshot({path:path.join(__dirname,'preferences-mobile-'+engine+'.png')});
      await mobile.locator('#reader p').nth(2).tap(); await mobile.locator('#focus-next').tap();
      await mobile.screenshot({path:path.join(__dirname,'preferences-focus-'+engine+'.png')});
    }
    await mobile.locator('#focus-next').tap();
    assert.equal(await css(mobile,'#reader p.focus-current','opacity'),'1');
    await mobile.locator('#open-questions').tap(); await mobile.locator('input[name="q0"][value="2"]').locator('..').tap();
    await mobile.locator('#review-mode').tap(); await mobile.locator('#question-6').getByRole('button',{name:'返回原文依据'}).tap();
    assert.match(await mobile.locator('.evidence-highlight.focus-current').textContent(),/human oversight/);
    assert.equal(await mobile.locator('#reader').textContent(), original);
    await mobile.locator('#focus-off').tap(); assert.equal(await css(mobile,'#reader p:nth-child(2)','opacity'),'1');
    await mobile.locator('#gradient-off').tap(); assert.equal(await mobile.locator('.gradient-word').count(),0);
    assert.equal(requests,0); await context.close();
  }
  const blockedContext = await browser.newContext();
  await blockedContext.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw Error('blocked');}}));
  const blocked = await blockedContext.newPage(); observe(blocked); await blocked.goto(pathToFileURL(exported).href); await settled(blocked);
  assert.equal(await blocked.locator('#focus-on').getAttribute('aria-pressed'),'true');
  await blocked.locator('#focus-next').click(); await blocked.locator('#gradient-off').click();
  assert.equal(await blocked.locator('.gradient-word').count(),0); await blockedContext.close();
  fs.unlinkSync(exported); fs.unlinkSync(examExported); assert.deepEqual(errors,[]); await browser.close();
  console.log('PASS '+engine+': independent gradient/size/focus controls, actual line reflow, text/link/bold integrity, keyboard and evidence focus, persistence/reset, exam/print, both export layouts, offline mobile touch at 320–430px, blocked storage, zero runtime errors.');
})().catch(error=>{console.error(error);process.exit(1);});
