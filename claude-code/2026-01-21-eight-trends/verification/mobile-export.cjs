const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');const fs=require('node:fs');const {pathToFileURL}=require('node:url');
const folder=path.join(__dirname,'mobile-export');
const overflow=()=>[...document.querySelectorAll('h1,h2,h3,p,label,button,.switches,.intro,.evidence,.actions,.question-nav')].filter(e=>e.getClientRects().length).map(e=>({tag:e.tagName,text:e.textContent.slice(0,50),left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})).filter(e=>e.left<-.5||e.right>innerWidth+.5);
(async()=>{
 fs.mkdirSync(folder,{recursive:true});const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL,headless:true});
 const origin=await browser.newPage();await origin.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
 const report=[];
 for(const layout of ['reading','exam']){
  await origin.locator('#'+layout+'-layout').click();
  const [download]=await Promise.all([origin.waitForEvent('download'),origin.locator('#download-paper').click()]);
  const file=path.join(folder,'export-'+layout+'.html');await download.saveAs(file);
  for(const width of [320,375,390,430]){
   const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
   let requests=0;await context.route(/^https?:/,r=>{requests++;r.abort();});
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(pathToFileURL(file).href);
   assert.equal(await page.evaluate(()=>innerWidth),width,'device viewport must match CSS width');
   assert.equal(await page.locator('body').getAttribute('data-layout'),layout);
   assert.deepEqual(await page.evaluate(overflow),[],`${layout} ${width} initial overflow`);
   if(width===390)await page.screenshot({path:path.join(folder,layout+'-top.png')});
   if(layout==='reading')await page.locator('#open-questions').tap();
   await page.locator('input[name="q0"][value="2"]').locator('..').tap();
   assert.equal(await page.locator('input[name="q0"][value="2"]').isChecked(),true);
   assert.equal(await page.locator('#question-container').evaluate(e=>getComputedStyle(e).columnCount),'1');
   assert.deepEqual(await page.evaluate(overflow),[],`${layout} ${width} question overflow`);
   if(width===390){await page.locator('#question-0').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(folder,layout+'-question.png')});}
   await page.locator('#review-mode').tap();
   assert.deepEqual(await page.evaluate(overflow),[],`${layout} ${width} review overflow`);
   if(width===390){await page.locator('#question-0 .analysis').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(folder,layout+'-analysis.png')});}
   await page.locator('#question-6').getByRole('button',{name:'返回原文依据'}).tap();
   assert.match(await page.locator('.evidence-highlight').innerText(),/human oversight/);
   await page.locator('#wrong-only').check();assert.equal(await page.locator('.question').count(),9);
   const font=await page.locator('#reader p').first().evaluate(e=>getComputedStyle(e).fontSize);
   const controls=await page.locator('#reading-layout,#exam-layout,#answer-mode,#review-mode,#question-nav button').evaluateAll(list=>list.map(e=>({text:e.textContent,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})));
   const smallControls=controls.filter(c=>c.width<44||c.height<44);
   assert.deepEqual(smallControls,[],`${layout} ${width}: touch controls should be at least 44px`);
   report.push({layout,width,articleFont:font,smallControls});
   assert.equal(requests,0);assert.deepEqual(errors,[]);await context.close();
  }
 }
 fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));
 await browser.close();console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exit(1);});
