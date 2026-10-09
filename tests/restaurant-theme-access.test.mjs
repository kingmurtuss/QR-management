import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {guestThemeAccess,publishedGuestTheme,GUEST_THEMES} from '../netlify/functions/lib/restaurant-theme-access.mjs';
import api from '../netlify/functions/restaurant-api.mjs';
const require=createRequire(import.meta.url);
const guest=require('../site/restaurants/menu-themes.js');
const venue='11111111-1111-4111-8111-111111111111';
const approved={venue_id:venue,kind:'addon',status:'completed',service_name:'guest-theme:garden'};

test('one default design is free and five premium guest designs are add-ons',()=>{
 assert.deepEqual(guest.themes.map(t=>t.id),GUEST_THEMES);
 assert.equal(guest.themes.filter(t=>!t.premium).length,1);
 assert.equal(guest.themes.filter(t=>t.premium).length,5);
 assert.deepEqual(guestThemeAccess([],venue),['glass-bistro']);
});
test('only a completed, correctly scoped theme add-on unlocks a design',()=>{
 for(const changed of [{venue_id:'another-restaurant'},{kind:'ticket'},{status:'open'},{status:'quoted'},{status:'closed'},{service_name:'photography'},{service_name:'guest-theme:unknown'}]){
  assert.deepEqual(guestThemeAccess([{...approved,...changed}],venue),['glass-bistro']);
  assert.deepEqual(guest.access([{...approved,...changed}],venue),['glass-bistro']);
 }
 assert.deepEqual(guestThemeAccess([approved],venue),['glass-bistro','garden']);
 assert.deepEqual(guest.access([approved],venue),['glass-bistro','garden']);
});
test('writing a premium theme ID without admin approval cannot publish that guest design',()=>{
 assert.equal(publishedGuestTheme('garden',['glass-bistro']),'glass-bistro');
 assert.equal(publishedGuestTheme('garden',guestThemeAccess([approved],venue)),'garden');
 assert.equal(publishedGuestTheme('garden',guestThemeAccess([{...approved,status:'closed'}],venue)),'glass-bistro');
 assert.equal(publishedGuestTheme('unknown',['unknown']),'glass-bistro');
});
test('previews escape restaurant content and do not execute injected links or markup',()=>{
 const v={name:'<script>alert(1)</script>',tagline:'A&B',menu:[{name:'<img onerror="oops">',category:'Meals',description:'Tasty',price:20,image:'javascript:alert(1)'}],google_url:'javascript:alert(1)'};
 const html=guest.previewDocument(v,'garden');
 assert.ok(html.includes('data-guest-theme="garden"'));assert.ok(html.includes('&lt;script&gt;'));
 assert.ok(!html.includes('<script>'));assert.ok(!html.includes('javascript:'));
 assert.ok(html.includes('A&amp;B'));assert.ok(html.includes('Preview only'));
});
test('guest menu retains diet, availability, allergens, prices and honest Google review access',()=>{
 const v={name:'The Table',menu:[{name:'Pasta',category:'Mains',description:'Fresh',price:420,diet:'Vegetarian',allergens:'Milk',available:false}],google_url:'https://example.com/google-review',wifi_enabled:true,loyalty_enabled:true};
 const row=guest.row(v.menu[0],'INR'),home=guest.home(v);
 assert.ok(row.includes('Sold out today'));assert.ok(row.includes('Allergens: Milk'));assert.ok(row.includes('Vegetarian'));
 assert.ok(home.includes('Google review ↗'));assert.ok(home.includes('data-guest="wifi"'));assert.ok(home.includes('data-guest="loyalty"'));
});
test('public restaurant API ignores a tampered paid theme until its add-on is approved',async()=>{
 const oldFetch=globalThis.fetch,oldURL=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.SUPABASE_URL='https://database.example.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_test';
 let rows=[],themeDown=false;
 globalThis.fetch=async(url,options)=>{
  if(String(url).includes('restaurant_venues?'))return Response.json([{id:venue,slug:'the-table',published:true,theme:'garden',name:'The Table',menu:[],wifi_enabled:false,owner_id:'private-owner',created_by:'private-agent'}]);
  if(String(url).includes('restaurant_requests?'))return themeDown?new Response('Unavailable',{status:503}):Response.json(rows);
  if(String(url).includes('restaurant_events')&&options.method==='POST')return Response.json([]);
  throw Error('Unexpected request '+url);
 };
 try{
  const call=()=>api(new Request('https://site.example/api/restaurant',{method:'POST',body:JSON.stringify({action:'venue',slug:'the-table'})}));
  let response=await call();assert.equal(response.status,200);let body=await response.json();
  assert.equal(body.venue.theme,'glass-bistro');assert.equal(body.venue.owner_id,undefined);
  rows=[approved];response=await call();body=await response.json();assert.equal(body.venue.theme,'garden');
  rows=[{...approved,status:'closed'}];response=await call();body=await response.json();assert.equal(body.venue.theme,'glass-bistro');
  themeDown=true;response=await call();body=await response.json();assert.equal(response.status,200);assert.equal(body.venue.theme,'glass-bistro');
 }finally{
  globalThis.fetch=oldFetch;
  if(oldURL===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldURL;
  if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;
 }
});

test('each premium layout requires its own restaurant-scoped approval',()=>{
 for(const theme of guest.themes.filter(t=>t.premium)){
  const row={...approved,service_name:'guest-theme:'+theme.id};
  assert.deepEqual(guestThemeAccess([row],venue),['glass-bistro',theme.id]);
  assert.equal(publishedGuestTheme(theme.id,guest.access([],venue)),'glass-bistro');
  assert.equal(publishedGuestTheme(theme.id,guest.access([row],venue)),theme.id);
 }
});
test('premium experiences use original branding and retain uploaded dish photography',()=>{
 const v={name:'Our Restaurant',theme:'heritage',menu:[{name:'Pasta',category:'Mains',price:490,image:'https://example.com/pasta.webp'}]};
 for(const t of guest.themes){
  const html=guest.previewDocument(v,t.id);
  assert.ok(html.includes('https://example.com/pasta.webp'));
  assert.ok(html.includes('YAM IT SERVICES'));
  assert.ok(html.includes(t.headline));
  assert.ok(!/Swiggy|Zepto|Zomato/.test(html));
 }
});
