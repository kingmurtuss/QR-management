import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const studio=require('../site/qr-designs.js');
const url='https://example.com/qr/QR00042?source=table&lang=en';
const raw='<svg xmlns="http://www.w3.org/2000/svg" width="760" height="760"><rect data-qr-test="kept" width="760" height="760" fill="#fff"/></svg>';

test('every design retains the QR destination and a clear quiet zone',()=>{
 for(const kind of ['review','restaurant']){
  assert.equal(studio.themes(kind).length,6);
  assert.equal(new Set(studio.themes(kind).map(t=>t.id)).size,6);
  for(const theme of studio.themes(kind))for(const pattern of studio.patterns){
   const o=studio.qrOptions({kind,url},{theme:theme.id,pattern:pattern.id});
   assert.equal(o.data,url);assert.equal(o.backgroundOptions.color,'#ffffff');
   assert.equal(o.qrOptions.errorCorrectionLevel,'H');
   assert.ok(o.margin>=o.width*4/29);
  }
 }
});
test('card options are scoped to their workspace and recover from missing preferences',()=>{
 assert.deepEqual(studio.preferences({kind:'review'},{theme:'garden',pattern:'unknown'}),{theme:'blue-glass',pattern:'original'});
 assert.deepEqual(studio.preferences({kind:'restaurant',defaultTheme:'coastal'},null),{theme:'coastal',pattern:'rounded'});
 assert.equal(studio.preferences({kind:'restaurant'},{theme:'onyx'}).theme,'glass-bistro');
});
test('QR destinations reject non-web schemes and embedded credentials',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,Hello','https://name:pass@example.com/','not a URL'])
  assert.throws(()=>studio.qrOptions({url},{}));
});
test('printed cards escape business text and retain the original QR artwork',()=>{
 const config={kind:'review',url,id:'QR00042',name:'<script>alert("hello")</script> & Café',company:'A&B'};
 const svg=studio.cardSVG(config,raw,{theme:'onyx'});
 assert.ok(svg.includes('&lt;script&gt;'));assert.ok(!svg.includes('<script>'));
 assert.ok(svg.includes('A&amp;B'));assert.ok(svg.includes('data-qr-test="kept"'));
 assert.ok(svg.includes('width="900" height="1427"'));
 assert.ok(!svg.includes('★★★★★'));
 assert.ok(svg.includes('Leave your honest review on Google.'));
});
test('restaurant cards use the printable identifier and A6 proportions',()=>{
 const svg=studio.cardSVG({kind:'restaurant',id:'private-internal-uuid',code:'REST-11112222',name:'The Olive Table',features:['Menu','Rewards','Google review']},raw,{theme:'coastal'});
 assert.ok(svg.includes('REST-11112222'));assert.ok(!svg.includes('private-internal-uuid'));
 assert.ok(svg.includes('width="900" height="1269"'));assert.ok(svg.includes('Menu · Rewards · Google review'));
});
test('long names fit into limited lines without truncating the accessible title',()=>{
 const name='The extraordinary restaurant with a very long name for celebrations and family gatherings';
 const lines=studio.wrapText(name,748,58,3);assert.ok(lines.length<=3);assert.ok(lines.at(-1).endsWith('…'));
 const svg=studio.cardSVG({kind:'restaurant',name},raw,{theme:'coastal'});
 assert.ok(svg.includes('<title>'+name+' · '));
});
test('export filenames cannot create paths',()=>{
 const name=studio.filename({kind:'review',code:'../Café/<unsafe> QR'}, {theme:'minimal',pattern:'square'},'svg');
 assert.ok(!name.includes('/'));assert.ok(!name.includes('..'));assert.ok(name.endsWith('-review-minimal-square.svg'));
});
test('handed-over cards show read-only design controls and retain export actions',()=>{
 const html=studio.editorMarkup({kind:'restaurant',id:'venue',name:'Cafe',readOnly:true});
 assert.equal((html.match(/data-card-theme=/g)||[]).length,6);
 assert.ok(html.includes('Design editing belongs to the manager or administrator.'));
 assert.ok(html.includes('data-card-export="print"'));
 assert.ok(/data-card-theme="garden"[^>]*disabled/.test(html));
});
