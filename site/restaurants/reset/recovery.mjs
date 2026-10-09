export async function beginRecovery({hash,clearHash,client}){
 const params=new URLSearchParams(hash.replace(/^#/,'')),token=params.get('token_hash');
 clearHash();
 if(params.get('type')!=='recovery'||! /^[a-zA-Z0-9_-]{32,256}$/.test(token||''))throw Error('Open the private reset link provided by your administrator.');
 const result=await client.auth.verifyOtp({token_hash:token,type:'recovery'});
 if(result.error||!result.data?.session)throw Error('This reset link has expired or was already used. Ask your administrator for a new link.');
 return result.data.user;
}
export async function finishRecovery({client,password,confirm}){
 if(password.length<12||password.length>128)throw Error('Use a password between 12 and 128 characters.');
 if(password!==confirm)throw Error('The passwords do not match.');
 const result=await client.auth.updateUser({password});
 if(result.error)throw result.error;
 const signedOut=await client.auth.signOut({scope:'global'});
 return {signedOut:!signedOut.error};
}
