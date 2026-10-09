import {createHash, randomBytes} from 'node:crypto';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
const text=(v,n=2000)=>String(v??'').trim().slice(0,n);
const hash=v=>createHash('sha256').update(v).digest('hex');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export default async function handler(req) {
 try {
  if(req.method!=='POST') return json({error:'Use POST'},405);
  const origin=req.headers.get('origin');
  if(origin && origin!==new URL(req.url).origin) return json({error:'Invalid origin'},403);
  if(Number(req.headers.get('content-length')||0)>12000) return json({error:'Request too large'},413);
  const raw=await req.text(); if(raw.length>12000) return json({error:'Request too large'},413);
  let b;try {b=JSON.parse(raw);}catch{return json({error:'Invalid request'},400);}
  if(!b || typeof b!=='object' || Array.isArray(b)) return json({error:'Invalid request'},400);
  const env=k=>typeof Netlify!=='undefined'?Netlify.env.get(k):process.env[k];
  const url=env('SUPABASE_URL'),key=env('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key) return json({error:'Restaurant service is not configured'},503);
  const headers={'apikey':key,'content-type':'application/json','Prefer':'return=representation'};
  if(!key.startsWith('sb_secret_')) headers.Authorization=`Bearer ${key}`;
  async function db(path,method='GET',body){
   const r=await fetch(`${url}/rest/v1/${path}`,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});
   if(!r.ok) throw new Error(`Database request failed (${r.status})`);
   return r.status===204?null:r.json();
  }
  let venues;
  if(b.action==='venue'){
   if(!/^[a-z0-9][a-z0-9-]{2,59}$/.test(b.slug||''))return json({error:'Invalid restaurant link'},400);
   venues=await db(`restaurant_venues?slug=eq.${encodeURIComponent(b.slug)}&published=eq.true&suspended=eq.false&limit=1`);
  }else{
   if(!uuid.test(b.venue_id||'')) return json({error:'Invalid restaurant'},400);
   venues=await db(`restaurant_venues?id=eq.${b.venue_id}&published=eq.true&suspended=eq.false&limit=1`);
  }
  const v=venues[0];if(!v||v.suspended)return json({error:'This restaurant page is not published'},404);
  if(b.action==='venue'){
   const {owner_id,created_by,agent_support,suspended,handed_over_at,handed_over_by,...venue}=v;
   if(!v.wifi_enabled){venue.wifi_ssid='';venue.wifi_password='';}
   await db('restaurant_events','POST',{venue_id:v.id,event:'scan'});
   return json({venue});
  }
  if(b.action==='feedback'){
   if(!Number.isInteger(b.rating)||b.rating<1||b.rating>5) return json({error:'Choose a rating from 1 to 5'},400);
   for(const x of ['food','service'])if(b[x]!=null&&(!Number.isInteger(b[x])||b[x]<1||b[x]>5))return json({error:'Invalid rating'},400);
   await db('restaurant_feedback','POST',{venue_id:v.id,rating:b.rating,food:b.food??null,service:b.service??null,message:text(b.message),name:text(b.name,100)});
   return json({ok:true});
  }
  if(b.action==='join'){
   if(!v.loyalty_enabled)return json({error:'Loyalty is currently unavailable'},400);
   const name=text(b.name,100);if(!name)return json({error:'Enter your first name'},400);
   const token=randomBytes(32).toString('hex');
   const rows=await db('restaurant_members','POST',{venue_id:v.id,name,token_hash:hash(token)});
   const {token_hash,...card}=rows[0];return json({card,token});
  }
  if(b.action==='card'){
   if(!/^[a-f0-9]{64}$/.test(b.token||''))return json({error:'Invalid loyalty card'},400);
   const rows=await db(`restaurant_members?venue_id=eq.${v.id}&token_hash=eq.${hash(b.token)}&select=id,name,stamps,redemptions,created_at,updated_at&limit=1`);
   if(!rows[0])return json({error:'Card not found on this device'},404);
   return json({card:rows[0]});
  }
  if(b.action==='event'){
   if(!['menu','wifi','loyalty','review'].includes(b.event))return json({error:'Invalid event'},400);
   await db('restaurant_events','POST',{venue_id:v.id,event:b.event});return json({ok:true});
  }
  return json({error:'Unknown action'},400);
 } catch(e){console.error('Restaurant API error:',e.message);return json({error:'Unable to complete this request. Please try again.'},500);}
}
export const config={path:'/api/restaurant',method:['GET','POST'],rateLimit:{action:'rate_limit',aggregateBy:['ip','domain'],windowSize:60,windowLimit:60}};
