const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');const fs=require('node:fs');const {pathToFileURL}=require('node:url');
(async()=>{
 const engine=process.env.BROWSER==='webkit'?'webkit':'chromium';
 const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
 const url=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
 const page=await browser.newPage({viewport:{width:1100,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);assert.equal(await page.locator('body').getAttribute('data-reading-aid'),'soft');
 const text=await page.locator('#reader').textContent(),subtitle=await page.locator('#article-subtitle').textContent();
 const count=await page.locator('#reader .word-cue').count();assert.ok(count>150);
 assert.equal(await page.locator('#reader strong .word-cue').count(),0);
 assert.equal(await page.locator('#reader h3 .word-cue').count(),0);
 const soft=await page.locator('#reader .word-cue-lead').first().textContent();
 await page.locator('#aid-strong').click();const strong=await page.locator('#reader .word-cue-lead').first().textContent();assert.ok(strong.length>soft.length);
 for(let i=0;i<3;i++)for(const level of ['off','soft','strong']){
  await page.locator('#aid-'+level).click();
  assert.equal(await page.locator('#reader').textContent(),text);
  assert.equal(await page.locator('#article-subtitle').textContent(),subtitle);
  assert.equal(await page.locator('#reader .word-cue').count(),level==='off'?0:count);
  assert.equal(await page.locator('.word-cue .word-cue').count(),0);
 }
 await page.screenshot({path:path.join(__dirname,'reading-aid-'+engine+'.png'),fullPage:true});
 await page.reload();assert.equal(await page.locator('#aid-strong').getAttribute('aria-pressed'),'true');
 await page.locator('#exam-layout').click();assert.equal(await page.locator('#reading-aid-controls').isVisible(),false);
 const weights=await page.locator('#reader .word-cue-lead').first().evaluate(e=>[getComputedStyle(e).fontWeight,getComputedStyle(e.parentElement).fontWeight]);assert.equal(weights[0],weights[1]);
 assert.equal(await page.locator('#question-container .word-cue').count(),0);
 await page.locator('#reading-layout').click();
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#download-paper').click()]);
 const exported=path.join(__dirname,'aid-export-'+engine+'.html');await download.saveAs(exported);
 for(const width of [320,375,390,430]){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true});
  await context.route(/^https?:/,r=>r.abort());const mobile=await context.newPage();await mobile.goto(pathToFileURL(exported).href);
  assert.equal(await mobile.locator('body').getAttribute('data-reading-aid'),'strong');
  assert.equal(await mobile.locator('#reader').textContent(),text);
  for(const level of ['off','soft','strong']){
   await mobile.locator('#aid-'+level).tap();
   assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.equal(await mobile.locator('#reader').textContent(),text);
  }
  const sizes=await mobile.locator('#aid-off,#aid-soft,#aid-strong').evaluateAll(nodes=>nodes.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})));assert.ok(sizes.every(s=>s.w>=44&&s.h>=44));
  if(width===390)await mobile.screenshot({path:path.join(__dirname,'reading-aid-mobile-'+engine+'.png')});
  await mobile.locator('#open-questions').tap();await mobile.locator('input[name="q0"][value="2"]').locator('..').tap();
  await mobile.locator('#review-mode').tap();await mobile.locator('#question-6').getByRole('button',{name:'返回原文依据'}).tap();
  assert.match(await mobile.locator('.evidence-highlight').innerText(),/human oversight/);
  await context.close();
 }
 fs.unlinkSync(exported);assert.deepEqual(errors,[]);await browser.close();
 console.log('PASS '+engine+': adjustable word emphasis, exact original text, no nested spans, original bold/link preservation, unchanged exam weights, persistence, offline export, mobile touch and evidence matching.');
})().catch(e=>{console.error(e);process.exit(1)});
