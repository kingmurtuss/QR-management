import test from 'node:test';
import assert from 'node:assert/strict';
import {beginRecovery,finishRecovery} from '../site/restaurants/reset/recovery.mjs';
test('recovery clears the fragment before verification and rejects missing or wrong token types',async()=>{
 let cleared=false,verified=false;
 const client={auth:{verifyOtp:async data=>{assert.equal(cleared,true);assert.equal(data.type,'recovery');verified=true;return {data:{session:{},user:{id:'manager'}},error:null};}}};
 const user=await beginRecovery({hash:'#token_hash='+ 'a'.repeat(64)+'&type=recovery',clearHash:()=>{cleared=true;},client});assert.equal(user.id,'manager');assert.equal(verified,true);
 for(const hash of ['','#type=signup&token_hash='+ 'a'.repeat(64),'#type=recovery&token_hash=bad']){verified=false;await assert.rejects(beginRecovery({hash,clearHash:()=>{},client}));assert.equal(verified,false);}
});
test('expired recovery never returns a usable account',async()=>{
 await assert.rejects(beginRecovery({hash:'#type=recovery&token_hash='+ 'a'.repeat(64),clearHash:()=>{},client:{auth:{verifyOtp:async()=>({error:{message:'Expired'},data:{session:null}})}}}),/expired or was already used/);
});
test('matching strong password is updated before global refresh sessions are revoked',async()=>{
 const calls=[];const client={auth:{updateUser:async data=>{calls.push(data);return {error:null};},signOut:async data=>{calls.push(data);return {error:null};}}};
 for(const [password,confirm] of [['short','short'],['a-long-password','does-not-match']])await assert.rejects(finishRecovery({client,password,confirm}));assert.equal(calls.length,0);
 assert.deepEqual(await finishRecovery({client,password:'a-long-password',confirm:'a-long-password'}),{signedOut:true});assert.deepEqual(calls,[{password:'a-long-password'},{scope:'global'}]);
});
test('failed password change keeps recovery form usable and does not revoke sessions',async()=>{
 let signouts=0;const client={auth:{updateUser:async()=>({error:Error('Password rejected')}),signOut:async()=>{signouts++;}}};await assert.rejects(finishRecovery({client,password:'a-long-password',confirm:'a-long-password'}),/Password rejected/);assert.equal(signouts,0);
});
