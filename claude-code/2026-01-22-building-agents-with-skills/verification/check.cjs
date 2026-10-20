const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../../..');
const lesson=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../lesson.json'),'utf8'));
const fileURL=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const css=(page,selector,key)=>page.locator(selector).first().evaluate((node,k)=>getComputedStyle(node)[k],key);
const noOverflow=page=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
(async()=>{
 const engine=process.env.BROWSER==='webkit'?'webkit':'chromium';
 const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
 const errors=[];
 const observe=page=>page.on('pageerror',error=>errors.push(error.message));
 const context=await browser.newContext({viewport:{width:1200,height:1000},reducedMotion:'reduce'});
 const page=await context.newPage();observe(page);await page.goto(fileURL);
 assert.match(await page.locator('#lesson-label').textContent(),/第 02 篇/);
 assert.equal(await page.locator('#article-title').textContent(),lesson.article.title);
 assert.equal(await page.locator('#article-subtitle').textContent(),lesson.article.subtitle);
 assert.equal(await page.locator('body').getAttribute('data-layout'),'reading');
 assert.equal(await page.locator('#questions-section').isVisible(),false);
 assert.equal(await page.locator('#reading-aid-controls,.word-cue,.gradient-word').count(),0);
 assert.equal(await page.locator('#reader h3').count(),(lesson.article.body.match(/^### /gm)||[]).length);
 assert.equal(await page.locator('#reader h4').count(),(lesson.article.body.match(/^#### /gm)||[]).length);
 assert.equal(await page.locator('#reader pre').count(),4);
 assert.equal(await page.locator('#reader ol > li').count(),4);
 assert.equal(await page.locator('#reader ul > li').count(),21);
 assert.ok((await page.locator('#reader pre').nth(2).textContent()).includes('print("USAGE: apply_template.py <pptx>")'));
 assert.equal(await page.locator('#reader pptx').count(),0);
 assert.equal(await page.locator('#reader').getByText('Copy',{exact:true}).count(),0);
 assert.match(await page.locator('#reader p').last().textContent(),/Barry Zhang, Mahesh Murag, Keith Lazuka, Ryan Whitehead/);
 const original=await page.locator('#reader').textContent();
 const unresolved=await page.evaluate(questions=>{
  const nodes=[...document.querySelectorAll('#reader p,#reader li,#reader pre')];
  return questions.filter(q=>!nodes.some(node=>node.textContent.toLowerCase().includes(q.needle.toLowerCase()))).map(q=>q.stem);
 },lesson.questions);
 assert.deepEqual(unresolved,[],'Every question needs an existing evidence passage');
 assert.equal(await css(page,'#reader p','fontSize'),'19px');
 assert.equal(await css(page,'#reader li','fontSize'),'19px');
 await page.screenshot({path:path.join(__dirname,'desktop-reading-'+engine+'.png')});
 await page.locator('#reader pre').nth(2).scrollIntoViewIfNeeded();
 await page.screenshot({path:path.join(__dirname,'desktop-code-'+engine+'.png')});
 await page.locator('#open-questions').click();
 assert.equal(await page.locator('.question').count(),24);
 assert.match(await page.locator('#question-23 .stem').textContent(),/^170\./);
 assert.equal(await page.locator('.analysis').count(),0);
 for(let i=0;i<lesson.questions.length;i++)await page.locator(`input[name="q${i}"][value="${lesson.questions[i].answer}"]`).locator('..').click();
 await page.locator('#flag-current').click();
 await page.reload();
 assert.equal(await page.locator('#progress-label').textContent(),'已答 24 / 24');
 assert.equal(await page.locator('#flag-current').getAttribute('aria-pressed'),'true');
 await page.locator('#submit').click();
 assert.match(await page.locator('#result').textContent(),/24 \/ 24/);
 assert.equal(await page.locator('.analysis').count(),24);
 // Test every evidence link, including ordered-list and industry-list entries.
 for(let i=0;i<lesson.questions.length;i++){
  await page.locator('#question-'+i).getByRole('button',{name:'返回原文依据'}).click();
  assert.ok((await page.locator('#reader .evidence-highlight').textContent()).toLowerCase().includes(lesson.questions[i].needle.toLowerCase()));
 }
 await page.locator('#wrong-only').check();assert.equal(await page.locator('#empty-filter').isVisible(),true);
 await page.locator('#show-all').click();
 // The other lesson retains its own independent answers.
 const firstURL=pathToFileURL(path.join(root,'claude-code/2026-01-21-eight-trends/index.html')).href;
 await page.goto(firstURL);await page.locator('#open-questions').click();
 assert.equal(await page.locator('#progress-label').textContent(),'已答 0 / 10');
 await page.locator('input[name="q0"][value="2"]').locator('..').click();
 await page.goto(fileURL);assert.equal(await page.locator('#progress-label').textContent(),'已答 24 / 24');
 const exports={};
 for(const layout of ['reading','exam']){
  await page.locator('#'+layout+'-layout').click();
  assert.equal(await page.locator('#reader').textContent(),original);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#download-paper').click()]);
  const exported=path.join(__dirname,'export-'+layout+'-'+engine+'.html');await download.saveAs(exported);exports[layout]=exported;
  for(const width of [320,375,390,430]){
   const mobileContext=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
   let requests=0;await mobileContext.route(/^https?:/,route=>{requests++;route.abort();});
   const mobile=await mobileContext.newPage();observe(mobile);await mobile.goto(pathToFileURL(exported).href);
   assert.equal(await mobile.locator('body').getAttribute('data-layout'),layout);
   assert.equal(await mobile.locator('#reader').textContent(),original);
   assert.equal(await mobile.locator('.analysis').count(),0);
   assert.equal(await mobile.locator('#progress-label').textContent(),'已答 0 / 24');
   assert.equal(await noOverflow(mobile),true,`${layout}, ${width}px: no page overflow`);
   const codeWidths=await mobile.locator('#reader pre').evaluateAll(nodes=>nodes.map(node=>({left:node.getBoundingClientRect().left,right:node.getBoundingClientRect().right})));
   assert.ok(codeWidths.every(rect=>rect.left>=0&&rect.right<=width),`${layout}, ${width}px: bounded code blocks`);
   if(width===390){
    await mobile.screenshot({path:path.join(__dirname,'mobile-'+layout+'-'+engine+'.png')});
    await mobile.locator('#reader pre').nth(2).scrollIntoViewIfNeeded();await mobile.screenshot({path:path.join(__dirname,'mobile-code-'+layout+'-'+engine+'.png')});
   }
   if(layout==='reading')await mobile.locator('#open-questions').tap();
   assert.equal(await mobile.locator('#question-container').evaluate(node=>getComputedStyle(node).columnCount),'1');
   const controls=await mobile.locator('#reading-layout,#exam-layout,#answer-mode,#review-mode,#question-nav button').evaluateAll(nodes=>nodes.map(node=>({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height})));
   assert.ok(controls.every(rect=>rect.width>=44&&rect.height>=44));
   await mobile.locator('input[name="q0"][value="2"]').locator('..').tap();
   await mobile.locator('input[name="q23"][value="0"]').locator('..').tap();
   await mobile.locator('#review-mode').tap();assert.match(await mobile.locator('#result').textContent(),/1 \/ 24/);
   await mobile.locator('#question-18').getByRole('button',{name:'返回原文依据'}).tap();
   assert.match(await mobile.locator('.evidence-highlight').textContent(),/Agent loop/);
   await mobile.locator('#question-21').getByRole('button',{name:'返回原文依据'}).tap();
   assert.match(await mobile.locator('.evidence-highlight').textContent(),/Prior authorization review/);
   await mobile.locator('#wrong-only').check();assert.equal(await mobile.locator('.question').count(),23);
   assert.equal(await noOverflow(mobile),true);
   await mobile.locator('#'+(layout==='reading'?'exam':'reading')+'-layout').tap();
   assert.match(await mobile.locator('#result').textContent(),/1 \/ 24/);
   assert.equal(await noOverflow(mobile),true);
   assert.equal(requests,0);await mobileContext.close();
  }
  await page.emulateMedia({media:'print'});
  assert.equal(await css(page,'#reader pre','whiteSpace'),'pre-wrap');
  assert.equal(await page.locator('.intro').isVisible(),false);
  await page.emulateMedia({media:'screen'});
 }
 // Offline use also works when storage is unavailable.
 const blockedContext=await browser.newContext();await blockedContext.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw Error('blocked');}}));
 const blocked=await blockedContext.newPage();observe(blocked);await blocked.goto(pathToFileURL(exports.reading).href);
 await blocked.locator('#open-questions').click();await blocked.locator('input[name="q0"][value="2"]').locator('..').click();
 await blocked.locator('#review-mode').click();assert.match(await blocked.locator('#result').textContent(),/1 \/ 24/);await blockedContext.close();
 // A small synthetic article verifies inline code and escaped code text independently of this lesson.
 const fixtureDir=path.join(__dirname,'fixture-'+engine);fs.mkdirSync(fixtureDir,{recursive:true});
 const fixture={...lesson,id:'article-format-fixture',storageKey:'article-format-fixture',article:{...lesson.article,title:'Format fixture',body:'### Heading\n\nA `literal <tag>` and **bold text** with [a link](https://example.com).\n\n```python\nif ready:\n    print("<img src=x onerror=alert(1)>")\n\n# Preserve the empty line above.\n```\n\n2. First listed step\n3. Next listed step\n\n#### Subheading\n\n- A bullet\n- Another bullet'},questions:lesson.questions.slice(0,1)};
 fs.writeFileSync(path.join(fixtureDir,'lesson.json'),JSON.stringify(fixture));cp.execFileSync('python3',[path.join(root,'build.py'),path.join(fixtureDir,'lesson.json')]);
 const synthetic=await context.newPage();observe(synthetic);await synthetic.goto(pathToFileURL(path.join(fixtureDir,'index.html')).href);
 assert.equal(await synthetic.locator('#reader p code').textContent(),'literal <tag>');
 assert.equal(await synthetic.locator('#reader img,#reader tag').count(),0);
 assert.equal(await synthetic.locator('#reader pre code').textContent(),'if ready:\n    print("<img src=x onerror=alert(1)>")\n\n# Preserve the empty line above.');
 assert.equal(await synthetic.locator('#reader ol').getAttribute('start'),'2');
 assert.equal(await synthetic.locator('#reader h4').textContent(),'Subheading');
 await synthetic.close();fs.rmSync(fixtureDir,{recursive:true});
 Object.values(exports).forEach(file=>fs.unlinkSync(file));assert.deepEqual(errors,[]);await browser.close();
 console.log('PASS '+engine+': full supplied article, headings/lists/escaped code, 24 questions and all evidence links, scoring/flags/persistence, per-lesson progress, both offline exports, 320–430px touch layouts, print, unavailable storage, safe reusable renderer; zero runtime errors.');
})().catch(error=>{console.error(error);process.exit(1);});
