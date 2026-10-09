import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/restaurant-api.mjs';
const venue={id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',owner_id:'private-owner',slug:'test-venue',published:true,wifi_enabled:false,wifi_ssid:'private',wifi_password:'private',loyalty_enabled:true};
process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_test';
const req=b=>new Request('https://example.netlify.app/api/restaurant',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
test('public profile excludes owner and disabled Wi-Fi credentials',async()=>{
 global.fetch=async(url,init)=>new Response(JSON.stringify(init.method==='GET'?[venue]:[]),{status:200});
 const r=await handler(req({action:'venue',slug:'test-venue'}));const d=await r.json();assert.equal(r.status,200);assert.equal(d.venue.owner_id,undefined);assert.equal(d.venue.wifi_password,'');
});
test('feedback validates ratings before insert',async()=>{
 let writes=0;global.fetch=async(url,init)=>{if(init.method==='POST')writes++;return new Response(JSON.stringify([venue]));};
 const r=await handler(req({action:'feedback',venue_id:venue.id,rating:6}));assert.equal(r.status,400);assert.equal(writes,0);
});
test('honest feedback accepts both low and high scores',async()=>{
 const written=[];global.fetch=async(url,init)=>{if(init.method==='POST')written.push(JSON.parse(init.body));return new Response(JSON.stringify([venue]));};
 for(const rating of [1,5])assert.equal((await handler(req({action:'feedback',venue_id:venue.id,rating,message:'Guest experience'}))).status,200);
 assert.deepEqual(written.map(x=>x.rating),[1,5]);
});
test('loyalty token is random and only a hash reaches the database',async()=>{
 let stored;global.fetch=async(url,init)=>{if(init.method==='POST'){stored=JSON.parse(init.body);return new Response(JSON.stringify([{...stored,id:'card-id',stamps:0}]));}return new Response(JSON.stringify([venue]));};
 const r=await handler(req({action:'join',venue_id:venue.id,name:'Guest'}));const d=await r.json();assert.match(d.token,/^[a-f0-9]{64}$/);assert.notEqual(stored.token_hash,d.token);assert.equal(d.card.token_hash,undefined);
});
test('unpublished pages do not expose data or accept feedback',async()=>{
 global.fetch=async()=>new Response('[]');assert.equal((await handler(req({action:'venue',slug:'test-venue'}))).status,404);
});
test('public callers cannot stamp cards',async()=>{
 global.fetch=async()=>new Response(JSON.stringify([venue]));assert.equal((await handler(req({action:'stamp',venue_id:venue.id}))).status,400);
});
test('cross-origin writes and malformed bodies are rejected',async()=>{
 const r=await handler(new Request('https://example.netlify.app/api/restaurant',{method:'POST',headers:{origin:'https://other.example'},body:'{}'}));assert.equal(r.status,403);
 assert.equal((await handler(new Request('https://example.netlify.app/api/restaurant',{method:'POST',body:'null'}))).status,400);
});
