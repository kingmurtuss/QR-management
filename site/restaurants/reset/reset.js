import {beginRecovery,finishRecovery} from './recovery.mjs';
const status=document.getElementById('reset-status'),form=document.getElementById('reset-form');
const hash=location.hash;
// Remove credentials from address/history before fetching configuration or verifying.
history.replaceState(null,'',location.pathname);
let client;
try{
 const response=await fetch('/.netlify/functions/public-config');
 const config=await response.json();if(!response.ok)throw Error('The account service is unavailable. Please try again.');
 client=supabase.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const user=await beginRecovery({hash,clearHash:()=>{},client});
 if(user?.app_metadata?.account_type!=='restaurant_manager'){await client.auth.signOut();throw Error('Use a restaurant manager reset link.');}
 status.textContent='Choose a new password for your restaurant manager account.';form.hidden=false;
}catch(error){status.textContent=error.message;status.classList.add('error');}
form.addEventListener('submit',async event=>{
 event.preventDefault();const button=form.querySelector('button');button.disabled=true;
 try{
  const result=await finishRecovery({client,password:form.password.value,confirm:form.confirm.value});
  form.reset();form.hidden=true;status.classList.remove('error');
  status.textContent=result.signedOut?'Password updated. Sign in to your restaurant with your new password.':'Password updated. Sign in with the new password; older sessions may remain active until they expire.';
 }catch(error){status.textContent=error.message;status.classList.add('error');}finally{button.disabled=false;}
});
