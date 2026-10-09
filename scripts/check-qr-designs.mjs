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
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
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
   const decoded=jsQR(new Uint8ClampedArray(png.data),png.width,png.height,{inversionAttempts:'attemptBoth'});
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
 assert.equal(jsQR(new Uint8ClampedArray(downloaded.data),downloaded.width,downloaded.height)?.data,origin+'/qr-designs/?sample=review');
 await page.reload();await page.locator('[data-card-preview][data-ready="true"]').waitFor();
 assert.equal(await page.locator('[data-card-theme="onyx"]').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('[data-card-pattern="dots"]').getAttribute('aria-pressed'),'true');
 for(const kind of ['restaurant','review','restaurant']){
  await page.locator('[data-gallery-kind="'+kind+'"]').click();
  await page.waitForFunction(kind=>document.querySelector('.qr-design-studio').getAttribute('aria-label').startsWith(kind==='restaurant'?'Restaurant':'Google'),kind);
  await page.waitForFunction(()=>document.querySelector('.studio-status').textContent==='Ready to print or download.');
 }
 await page.screenshot({path:out+'/restaurant-bistro-glass.png',fullPage:true});
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
 assert.equal(jsQR(new Uint8ClampedArray(long.data),long.width,long.height)?.data,longURL);
 console.log('PASS: gallery selection, preference persistence, PNG/SVG downloads, mobile layout, manager integration, read-only controls and long QR destinations.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
