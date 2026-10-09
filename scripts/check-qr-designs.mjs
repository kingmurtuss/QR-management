import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import jsQR from 'jsqr';

const out=resolve('artifacts/qr-designs');await mkdir(out,{recursive:true});
const root=resolve('site');
const server=createServer(async(req,res)=>{
 try{
  let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(path.endsWith('/'))path+='index.html';
  const file=resolve(root,'.'+path);
  if(!file.startsWith(root+'/'))throw Error('Path blocked');
  const data=await readFile(file);
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'})[extname(file)]||'application/octet-stream');res.end(data);
 }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
function decodeCard(png,kind){
 let result=jsQR(new Uint8ClampedArray(png.data),png.width,png.height,{inversionAttempts:'attemptBoth'});
 if(result)return result;
 // Camera scanners focus on the printed QR panel; retain all of its quiet zone.
 const scale=png.width/900,x=Math.round(140*scale),y=Math.round((kind==='restaurant'?490:620)*scale),size=Math.round(620*scale);
 const panel=new Uint8ClampedArray(size*size*4);
 for(let row=0;row<size;row++)panel.set(png.data.subarray(((y+row)*png.width+x)*4,((y+row)*png.width+x+size)*4),row*size*4);
 return jsQR(panel,size,size,{inversionAttempts:'attemptBoth'});
}
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
 await page.context().addInitScript(()=>{window.print=()=>{window.printInvoked=true;};});
 const styling=await readFile('node_modules/qr-code-styling/lib/qr-code-styling.js','utf8');
 const legacy=await readFile('node_modules/qrcodejs/qrcode.min.js','utf8');
 await page.route('https://cdn.jsdelivr.net/npm/qr-code-styling@*/**',r=>r.fulfill({contentType:'text/javascript',body:styling}));
 await page.route('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/**',r=>r.fulfill({contentType:'text/javascript',body:legacy}));
 await page.route('https://cdn.jsdelivr.net/npm/@supabase/**',r=>r.fulfill({contentType:'text/javascript',body:'window.supabase={};'}));
 await page.goto(origin+'/qr-designs/');
 await page.locator('[data-card-preview][data-ready="true"]').waitFor();
 assert.equal(await page.locator('[data-card-theme]').count(),6);
 assert.equal(await page.locator('[data-card-pattern]').count(),4);
 await page.screenshot({path:out+'/google-review-blue-glass.png',fullPage:true});
 console.log('QR_VISUAL_REVIEW:'+ (await page.screenshot({type:'jpeg',quality:55,fullPage:true})).toString('base64'));
 const kinds=await page.evaluate(()=>['review','restaurant'].map(kind=>({kind,themes:QRDesigns.themes(kind).map(t=>t.id),patterns:QRDesigns.patterns.map(p=>p.id)})));
 let count=0;
 for(const {kind,themes,patterns} of kinds){
  const url=kind==='review'?'https://example.com/qr/QR00042?source=table':'https://example.com/restaurants/?venue=olive-table';
  for(const theme of themes)for(const pattern of patterns){
   const bytes=await page.evaluate(async({kind,theme,pattern,url})=>{
    const id=kind+'-'+theme+'-'+pattern;
    localStorage.setItem('qr-card-design:v1:'+kind+':'+id,JSON.stringify({theme,pattern}));
    window.testStudio=QRDesigns.mount(document.querySelector('#design-gallery-host'),{kind,id,url,name:kind==='review'?'Your business name':'The Olive Table',features:['Menu','Guest Wi-Fi','Rewards','Google review']});
    await testStudio.ready;
    const blob=await QRDesigns.pngBlob(testStudio.svg,900);
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
   },{kind,theme,pattern,url});
   const png=PNG.sync.read(Buffer.from(bytes));
   const decoded=decodeCard(png,kind);
   assert.equal(decoded?.data,url,'QR did not decode: '+kind+' / '+theme+' / '+pattern);
   if(pattern==='original'||(kind==='restaurant'&&pattern==='rounded')){
    await writeFile(out+'/'+kind+'-'+theme+'.png',Buffer.from(bytes));
   }
   count++;
  }
 }
 console.log('PASS: all '+count+' printed card / QR pattern combinations decode to the unchanged destination.');

 // Real gallery buttons, switching, preferences and exports.
 await page.goto(origin+'/qr-designs/');
 await page.locator('[data-card-preview][data-ready="true"]').waitFor();
 await page.locator('[data-card-theme="onyx"]').click();
 await page.waitForFunction(()=>document.querySelector('[data-card-preview] svg title')?.textContent.includes('Onyx'));
 await page.locator('[data-card-pattern="dots"]').click();
 await page.waitForFunction(()=>document.querySelector('.studio-status').textContent==='Ready to print or download.');
 let downloadPromise=page.waitForEvent('download');
 await page.locator('[data-card-export="svg"]').click();
 let download=await downloadPromise;assert.ok(download.suggestedFilename().includes('onyx-dots.svg'));
 await download.saveAs(out+'/downloaded-review-card.svg');
 downloadPromise=page.waitForEvent('download');
 await page.locator('[data-card-export="png"]').click();download=await downloadPromise;
 await download.saveAs(out+'/downloaded-review-card.png');
 const downloaded=PNG.sync.read(await readFile(out+'/downloaded-review-card.png'));
 assert.equal(downloaded.width,1800);
 assert.equal(decodeCard(downloaded,'review')?.data,origin+'/qr-designs/?sample=review');
 downloadPromise=page.waitForEvent('download');
 await page.locator('[data-card-export="qr"]').click();download=await downloadPromise;
 await download.saveAs(out+'/downloaded-qr-only.png');
 const qrOnly=PNG.sync.read(await readFile(out+'/downloaded-qr-only.png'));
 assert.equal(qrOnly.width,1520);
 assert.equal(jsQR(new Uint8ClampedArray(qrOnly.data),qrOnly.width,qrOnly.height)?.data,origin+'/qr-designs/?sample=review');
 const popupPromise=page.waitForEvent('popup');
 await page.locator('[data-card-export="print"]').click();
 const popup=await popupPromise;await popup.locator('svg').waitFor();
 assert.ok((await popup.locator('style').innerText()).includes('@page{size:54mm 85.6mm;margin:0}'));
 await popup.close();
 await page.reload();await page.locator('[data-card-preview][data-ready="true"]').waitFor();
 assert.equal(await page.locator('[data-card-theme="onyx"]').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('[data-card-pattern="dots"]').getAttribute('aria-pressed'),'true');
 for(const kind of ['restaurant','review','restaurant']){
  await page.locator('[data-gallery-kind="'+kind+'"]').click();
  await page.waitForFunction(kind=>document.querySelector('.qr-design-studio').getAttribute('aria-label').startsWith(kind==='restaurant'?'Restaurant':'Google'),kind);
  await page.waitForFunction(()=>document.querySelector('.studio-status').textContent==='Ready to print or download.');
 }
 await page.screenshot({path:out+'/restaurant-bistro-glass.png',fullPage:true});
 console.log('QR_VISUAL_RESTAURANT:'+ (await page.screenshot({type:'jpeg',quality:55,fullPage:true})).toString('base64'));
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:out+'/restaurant-mobile.png',fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile designer overflows the screen.');
 await page.setViewportSize({width:1440,height:1100});

 // Manager QR tab uses the same designer without changing guest menu features.
 await page.goto(origin+'/restaurants/?manager-demo=1');
 await page.locator('[data-nav="menu"]').click();
 await page.locator('[data-tab="qr"]').click();
 await page.locator('[data-card-preview][data-ready="true"]').waitFor();
 assert.equal(await page.locator('[data-card-theme]').count(),6);
 assert.equal(await page.locator('[data-card-theme="garden"]').isEnabled(),true);
 await page.screenshot({path:out+'/manager-qr-designer.png',fullPage:true});
 const target=await page.locator('.print-note .sub').innerText();
 assert.ok(target.includes('/restaurants/?venue=demo&preview=11111111-1111-4111-8111-111111111111'));

 // A read-only manager preview cannot change presentation choices.
 await page.evaluate(async()=>{
  window.testStudio=QRDesigns.mount(document.querySelector('#restaurant-qr-designer'),{kind:'restaurant',id:'locked-venue',url:location.origin+'/restaurants/?venue=demo',name:'Read-only restaurant',readOnly:true});
  await testStudio.ready;
 });
 assert.equal(await page.locator('[data-card-theme="garden"]').isDisabled(),true);
 assert.equal(await page.locator('[data-card-pattern="dots"]').isDisabled(),true);
 assert.equal(await page.locator('[data-card-export="png"]').isEnabled(),true);

 // A long destination still scans; quiet zone is preserved at higher QR versions.
 const longURL='https://example.com/restaurants/?venue=olive-table&ref='+('reference-'.repeat(25));
 const longBytes=await page.evaluate(async url=>{
  const c=QRDesigns.mount(document.querySelector('#restaurant-qr-designer'),{kind:'restaurant',id:'long-target',url,name:'A restaurant with a longer destination'});
  await c.ready;return Array.from(new Uint8Array(await (await QRDesigns.pngBlob(c.svg,1800)).arrayBuffer()));
 },longURL);
 const long=PNG.sync.read(Buffer.from(longBytes));
 assert.equal(decodeCard(long,'restaurant')?.data,longURL);
 // Premium preview and access control.
 await page.evaluate(()=>localStorage.removeItem('yam-demo-theme-requests:v1'));
 await page.goto(origin+'/restaurants/?manager-demo=1');
 await page.locator('[data-nav="themes"]').click();
 assert.equal(await page.locator('[data-theme-preview]').count(),4);
 assert.equal(await page.locator('[data-theme-choice="garden"]').count(),0);
 assert.equal(await page.locator('[data-theme-request]').count(),3);
 await page.locator('[data-theme-preview="garden"]').click();
 await page.frameLocator('#dialog iframe').locator('body[data-guest-theme="garden"]').waitFor();
 assert.equal(await page.evaluate(()=>selected.theme),'glass-bistro');
 await page.screenshot({path:out+'/locked-theme-preview.png',fullPage:true});
 await page.locator('#dialog .close').click();
 await page.locator('[data-theme-request="garden"]').click();
 await page.waitForFunction(()=>requests.some(r=>r.service_name==='guest-theme:garden'&&r.status==='open'));
 assert.equal(await page.locator('[data-theme-choice="garden"]').count(),0);
 await page.goto(origin+'/restaurants/?admin-demo=1');
 await page.locator('[data-nav="venues"]').click();await page.locator('[data-edit]').first().click();await page.locator('[data-tab="themes"]').click();
 await page.locator('[data-theme-access="garden"][data-enabled="true"]').click();
 await page.locator('[data-theme-access="garden"][data-enabled="false"]').waitFor();
 assert.equal(await page.locator('[data-theme-access="cafe"]').getAttribute('data-enabled'),'true');
 await page.screenshot({path:out+'/admin-theme-access.png',fullPage:true});
 await page.goto(origin+'/restaurants/?manager-demo=1');await page.locator('[data-nav="themes"]').click();
 await page.locator('[data-theme-choice="garden"]').click();await page.waitForFunction(()=>selected.theme==='garden');
 assert.equal(await page.locator('[data-theme-choice="cafe"]').count(),0);
 await page.goto(origin+'/restaurants/?admin-demo=1');
 await page.locator('[data-nav="venues"]').click();await page.locator('[data-edit]').first().click();await page.locator('[data-tab="themes"]').click();
 await page.locator('[data-theme-access="garden"][data-enabled="false"]').click();await page.locator('[data-theme-access="garden"][data-enabled="true"]').waitFor();
 await page.goto(origin+'/restaurants/?manager-demo=1');await page.locator('[data-nav="themes"]').click();
 assert.equal(await page.locator('[data-theme-choice="garden"]').count(),0);assert.equal(await page.locator('[data-theme-choice="glass-bistro"]').count(),1);
 for(const theme of ['glass-bistro','garden','midnight','cafe']){
  await page.goto(origin+'/restaurants/?venue=demo&theme='+theme);await page.locator('body[data-guest-theme="'+theme+'"]').waitFor();
  await page.locator('.menu-category-card').first().waitFor();assert.equal(await page.locator('.menu-category-card').count(),3);
  await page.locator('#category-search').fill('cappuccino');assert.equal(await page.locator('.menu-category-card:visible').count(),1);await page.locator('#category-search').fill('');
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Guest layout overflows: '+theme);
  await page.screenshot({path:out+'/guest-'+theme+'-mobile.png',fullPage:true});
  await page.locator('[data-category="Mains"]').click();assert.equal(await page.locator('.menu-item').count(),2);assert.ok((await page.locator('#menu-items').innerText()).includes('490'));
  await page.locator('#menu-search').fill('pasta');assert.equal(await page.locator('.menu-item:visible').count(),1);await page.locator('#menu-search').fill('');
  await page.screenshot({path:out+'/menu-'+theme+'-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1100});
 }
 console.log('PASS: four guest layouts, locked previews, add-on requests, admin activation/revocation, manager selection, category navigation, search and mobile layouts.');
 // Existing Google review modal integrates the designer with an assigned business.
 await page.goto(origin+'/');
 await page.waitForFunction(()=>typeof previewQr==='function');
 await page.evaluate(async()=>{
  settings={company_name:'Field Ops',qr_base_url:location.origin+'/qr/'};
  cache.qrs=[{id:'fixture-qr',code:'QR00042',business_id:'fixture-business'}];
  cache.businesses=[{id:'fixture-business',name:'A Professional Business'}];
  previewQr('fixture-qr');await reviewQRStudio.ready;
 });
 assert.equal(await page.locator('#review-qr-designer [data-card-theme]').count(),6);
 assert.ok((await page.locator('#modal-content').innerText()).includes('QR destination: '+origin+'/qr/QR00042'));
 await page.locator('#review-qr-designer [data-card-theme="ivory"]').click();
 await page.waitForFunction(()=>document.querySelector('#review-qr-designer svg title')?.textContent.includes('Ivory'));
 assert.equal(await page.locator('#modal').evaluate(el=>el.open),true,'Theme selection must not close the review modal.');
 await page.screenshot({path:out+'/review-dashboard-modal.png',fullPage:true});
 console.log('PASS: gallery selection, preference persistence, PNG/SVG downloads, mobile layout, manager integration, read-only controls and long QR destinations.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
