const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const response=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export default async function handler(req){
 try{
  if(req.method!=='POST')return response({error:'Use POST'},405);
  if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return response({error:'Invalid origin'},403);
  const raw=await req.text();if(raw.length>10000)return response({error:'Request too large'},413);
  let body;try{body=JSON.parse(raw);}catch{throw fail('Invalid request');}
  if(!body||Array.isArray(body)||!uuid.test(body.venue_id||''))throw fail('Invalid restaurant');
  const env=k=>typeof Netlify!=='undefined'?Netlify.env.get(k):process.env[k];
  const url=env('SUPABASE_URL'),key=env('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)throw fail('Restaurant service is unavailable',503);
  const bearer=req.headers.get('authorization');if(!/^Bearer \S+$/.test(bearer||''))throw fail('Please sign in',401);
  const authHeaders={apikey:key,Authorization:bearer};
  const auth=await fetch(`${url}/auth/v1/user`,{headers:authHeaders,signal:AbortSignal.timeout(10000)});
  if(!auth.ok)throw fail('Please sign in again',401);const actor=await auth.json();
  if(!uuid.test(actor.id||''))throw fail('Invalid session',401);
  const headers={apikey:key,'content-type':'application/json',Prefer:'return=representation'};
  if(!key.startsWith('sb_secret_'))headers.Authorization=`Bearer ${key}`;
  async function call(path,method='GET',data,upsert=false){
   const r=await fetch(`${url}${path}`,{method,headers:upsert?{...headers,Prefer:'return=representation,resolution=merge-duplicates'}:headers,body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(10000)});
   if(!r.ok){if(path.includes('/auth/v1/admin/users')&&r.status===422)throw fail('This email already has an account. Ask your administrator to link an existing restaurant manager.',409);throw fail('Unable to save. Please try again.',502);}
   return r.status===204?null:r.json();
  }
  const [profiles,venues]=await Promise.all([call(`/rest/v1/profiles?id=eq.${actor.id}&select=id,role,active`),call(`/rest/v1/restaurant_venues?id=eq.${body.venue_id}&limit=1`)]);
  const profile=profiles[0],v=venues[0];if(!v)throw fail('Restaurant not found',404);
  const admin=profile?.active===true&&profile.role==='admin';
  const agent=profile?.active===true&&profile.role==='worker'&&v.owner_id===actor.id&&v.agent_support&&!v.suspended;
  const access=await call(`/rest/v1/restaurant_manager_access?venue_id=eq.${v.id}`);
  const manager=access.some(a=>a.user_id===actor.id&&a.active)&&!v.suspended;
  if(!admin&&!agent&&!manager)throw fail('You cannot manage this restaurant',403);
  if(body.action==='edit-manager'||body.action==='reset-manager'){
   if(!admin)throw fail('Only administrators can edit or reset manager accounts',403);
   if(!uuid.test(body.user_id||''))throw fail('Invalid manager account');
   const assignment=access.find(a=>a.user_id===body.user_id);
   if(!assignment)throw fail('This manager is not assigned to this restaurant',403);
   const account=await call(`/auth/v1/admin/users/${body.user_id}`);
   const target=account.user||account;
   if(target.id!==body.user_id||target.app_metadata?.account_type!=='restaurant_manager')throw fail('Choose a restaurant manager account');
   if(body.action==='edit-manager'){
    const name=String(body.name||'').trim(),email=String(body.email||'').trim().toLowerCase();
    if(!name||name.length>100||!/^\S+@\S+\.\S+$/.test(email)||email.length>254)throw fail('Enter a manager name and valid email');
    await call(`/auth/v1/admin/users/${target.id}`,'PUT',{email,email_confirm:true,user_metadata:{...target.user_metadata,name}});
    await call(`/rest/v1/restaurant_manager_access?user_id=eq.${target.id}`,'PATCH',{name,email});
    await call(`/rest/v1/profiles?id=eq.${target.id}`,'PATCH',{name,email});
    return response({ok:true});
   }
   if(!assignment.active)throw fail('Restore this manager’s access before creating a reset link');
   const generated=await call('/auth/v1/admin/generate_link','POST',{type:'recovery',email:target.email});
   const token=generated.properties?.hashed_token||generated.hashed_token;
   if((generated.user?.id||generated.id)!==target.id||! /^[a-zA-Z0-9_-]{32,256}$/.test(token||''))throw fail('Unable to create a reset link',502);
   // Keep the secret in the fragment: it is never sent to site logs or referrers.
   const resetURL=new URL('/restaurants/reset/',req.url);resetURL.hash=new URLSearchParams({token_hash:token,type:'recovery'}).toString();
   return response({reset_url:resetURL.href});
  }
  if(body.action==='create-manager'){
   if(!admin&&!agent)throw fail('Only your agent or administrator can create manager access',403);
   if(access.some(a=>a.active))throw fail('This restaurant already has an active manager',409);
   const name=String(body.name||'').trim(),email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'');
   if(!name||name.length>100||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||password.length<12||password.length>128)throw fail('Enter a name, valid email and a password of at least 12 characters');
   const created=await call('/auth/v1/admin/users','POST',{email,password,email_confirm:true,user_metadata:{name},app_metadata:{account_type:'restaurant_manager'}});
   const account=created.user||created;
   if(!uuid.test(account.id||''))throw fail('Unable to create manager account',502);
   // The database profile trigger also enforces inactive field-worker access.
   await call(`/rest/v1/profiles?id=eq.${account.id}`,'PATCH',{active:false});
   const rows=await call('/rest/v1/restaurant_manager_access','POST',{venue_id:v.id,user_id:account.id,name,email,active:true});
   return response({manager:rows[0],login_url:new URL('/restaurants/?manager=1',req.url).href});
  }
  if(body.action==='link-manager'){
   if(!admin)throw fail('Only administrators can link an existing account',403);
   if(!uuid.test(body.user_id||''))throw fail('Invalid manager account');
   const account=await call(`/auth/v1/admin/users/${body.user_id}`);
   const target=account.user||account;
   if(target.app_metadata?.account_type!=='restaurant_manager')throw fail('Choose a restaurant manager account');
   await call('/rest/v1/restaurant_manager_access?on_conflict=venue_id,user_id','POST',{venue_id:v.id,user_id:target.id,name:target.user_metadata?.name||'Manager',email:target.email,active:true},true);
   return response({ok:true});
  }
  if(body.action==='handover'){
   if(!access.some(a=>a.active))throw fail('Create an active manager account first');
   if(!v.published||!v.menu?.length)throw fail('Add a menu and publish the restaurant first');
   await call(`/rest/v1/restaurant_venues?id=eq.${v.id}`,'PATCH',{agent_support:false});return response({ok:true});
  }
  if(!admin)throw fail('Only administrators can change this control',403);
  if(body.action==='suspend'||body.action==='support'){
   if(typeof body.enabled!=='boolean')throw fail('Invalid control value');
   await call(`/rest/v1/restaurant_venues?id=eq.${v.id}`,'PATCH',{[body.action==='suspend'?'suspended':'agent_support']:body.enabled});return response({ok:true});
  }
  if(body.action==='manager-active'){
   if(!uuid.test(body.user_id||'')||typeof body.active!=='boolean')throw fail('Invalid manager');
   await call(`/rest/v1/restaurant_manager_access?venue_id=eq.${v.id}&user_id=eq.${body.user_id}`,'PATCH',{active:body.active});return response({ok:true});
  }
  if(body.action==='assign-agent'){
   if(!uuid.test(body.user_id||''))throw fail('Choose an agent');
   const target=await call(`/rest/v1/profiles?id=eq.${body.user_id}&role=eq.worker&active=eq.true`);
   if(!target.length)throw fail('Choose an active field agent');
   await call(`/rest/v1/restaurant_venues?id=eq.${v.id}`,'PATCH',{owner_id:body.user_id,agent_support:true});return response({ok:true});
  }
  throw fail('Unknown action');
 }catch(error){if(!error.status)console.error('Restaurant management failed');return response({error:error.status?error.message:'Unable to complete this request'},error.status||500);}
}
export const config={path:'/api/restaurant-manage',method:'POST',rateLimit:{action:'rate_limit',aggregateBy:['ip','domain'],windowSize:60,windowLimit:20}};
