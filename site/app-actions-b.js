'use strict';
async function changeWorkerRole(id,currentRole) {
  if (id===profile.id) return toast('You cannot change your own role here.','error');
  const role = currentRole==='admin'?'worker':'admin';
  if (!confirm(`Change this account to ${role}?`)) return;
  const { error } = await sb.from('profiles').update({role}).eq('id',id);
  if (error) return toast(error.message,'error');
  await logActivity(`Changed ${workerName(id)} role to ${role}`,'profiles',id,{role});
  await refreshAll(false); renderPage(); toast('Role updated','success');
}
async function toggleWorker(id,isActive) {
  if (id===profile.id) return toast('You cannot disable your own account.','error');
  const { error } = await sb.from('profiles').update({active:!isActive}).eq('id',id);
  if (error) return toast(error.message,'error');
  await logActivity(`${!isActive?'Enabled':'Disabled'} ${workerName(id)}`,'profiles',id);
  await refreshAll(false); renderPage(); toast('Account updated','success');
}

function captureLocation() {
  if (!navigator.geolocation) return toast('This browser does not support location','error');
  $('#location-text').textContent = 'Getting location…';
  navigator.geolocation.getCurrentPosition(pos=>{
    pendingLocation = {latitude:pos.coords.latitude,longitude:pos.coords.longitude};
    $('#location-text').textContent = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
    toast('Location captured','success');
  }, err=>{
    $('#location-text').textContent = 'Location not captured';
    toast(err.message || 'Location permission denied','error');
  }, {enableHighAccuracy:true,timeout:12000,maximumAge:30000});
}

async function onboardBusiness(e) {
  e.preventDefault();
  const review = $('#b-review').value.trim();
  try { const u = new URL(review); if (!/^https?:$/.test(u.protocol)) throw 0; } catch { return toast('Enter a valid http/https Google Review URL','error'); }
  const payload = {
    p_qr_id: $('#b-qr').value,
    p_name: $('#b-name').value.trim(),
    p_owner_name: $('#b-owner').value.trim() || null,
    p_phone: $('#b-phone').value.trim() || null,
    p_category: $('#b-category').value.trim() || null,
    p_address: $('#b-address').value.trim() || null,
    p_area: $('#b-area').value.trim() || null,
    p_city: $('#b-city').value.trim() || null,
    p_google_review_url: review,
    p_latitude: pendingLocation.latitude,
    p_longitude: pendingLocation.longitude
  };
  const btn = e.submitter; btn.disabled=true; btn.textContent='Saving…';
  const { data, error } = await sb.rpc('onboard_business', payload);
  btn.disabled=false; btn.textContent='Save Business & Activate QR';
  if (error) return toast(error.message,'error');
  await logActivity(`Onboarded ${payload.p_name}`,'businesses',data,{qr_id:payload.p_qr_id});
  pendingLocation={latitude:null,longitude:null};
  await refreshAll(false); toast('Business onboarded and QR activated','success'); navigate('businesses');
}

function showReviewUrl(id) {
  const b=cache.businesses.find(x=>x.id===id); if(!b)return;
  $('#modal-content').innerHTML=`<h2>${esc(b.name)}</h2><p class="muted">Google Review destination</p><div class="location-box"><code>${esc(b.google_review_url)}</code></div><div class="form-actions"><a class="primary-btn" style="text-decoration:none" href="${esc(b.google_review_url)}" target="_blank" rel="noopener">Open Review Page</a></div>`;
  $('#modal').showModal();
}

function editBusiness(id) {
  const b=cache.businesses.find(x=>x.id===id); if(!b)return;
  $('#modal-content').innerHTML=`<h2>Edit ${esc(b.name)}</h2><form id="edit-business-form" class="stack"><label><span>Business name</span><input id="edit-b-name" value="${esc(b.name)}" required></label><label><span>Phone</span><input id="edit-b-phone" value="${esc(b.phone||'')}"></label><label><span>Google Review URL</span><input id="edit-b-review" type="url" value="${esc(b.google_review_url)}" required></label><button class="primary-btn" type="submit">Save Changes</button></form>`;
  $('#modal').showModal();
  $('#edit-business-form').addEventListener('submit',async e=>{e.preventDefault();const update={name:$('#edit-b-name').value.trim(),phone:$('#edit-b-phone').value.trim()||null,google_review_url:$('#edit-b-review').value.trim(),updated_at:new Date().toISOString()};const {error}=await sb.from('businesses').update(update).eq('id',id);if(error)return toast(error.message,'error');await logActivity(`Edited ${update.name}`,'businesses',id);$('#modal').close();await refreshAll(false);renderPage();toast('Business updated','success')});
}

async function requestWithdrawal(e) {
  e.preventDefault();
  const amount=Number($('#withdraw-amount').value||0), method=$('#withdraw-method').value, payment_details=$('#withdraw-details').value.trim();
  const rate=Number(settings.commission_rate||0), earned=cache.businesses.length*rate, paid=cache.withdrawals.filter(x=>x.status==='paid').reduce((a,x)=>a+Number(x.amount||0),0), pending=cache.withdrawals.filter(x=>x.status==='pending').reduce((a,x)=>a+Number(x.amount||0),0), available=Math.max(0,earned-paid-pending);
  if(amount<=0||amount>available)return toast('Withdrawal amount is higher than available earnings','error');
  const {error}=await sb.from('withdrawals').insert({worker_id:profile.id,amount,method,payment_details,status:'pending'});
  if(error)return toast(error.message,'error');
  await logActivity(`Requested withdrawal ${money(amount)}`,'withdrawals'); await refreshAll(false); renderPage(); toast('Withdrawal requested','success');
}
async function updatePayout(id,status) {
  const {error}=await sb.from('withdrawals').update({status,processed_at:new Date().toISOString()}).eq('id',id); if(error)return toast(error.message,'error'); await logActivity(`Payout ${status}`,'withdrawals',id,{status}); await refreshAll(false); renderPage(); toast('Payout updated','success');
}
async function createTicket(e) {
  e.preventDefault(); const subject=$('#ticket-subject').value.trim(), message=$('#ticket-message').value.trim(); const {error}=await sb.from('tickets').insert({worker_id:profile.id,subject,message,status:'open'}); if(error)return toast(error.message,'error'); await logActivity(`Created ticket: ${subject}`,'tickets'); await refreshAll(false); renderPage(); toast('Ticket sent','success');
}
function replyTicket(id) {
  const t=cache.tickets.find(x=>x.id===id); if(!t)return; $('#modal-content').innerHTML=`<h2>Reply to ticket</h2><p><b>${esc(t.subject)}</b></p><p class="muted">${esc(t.message)}</p><form id="reply-ticket-form" class="stack"><label><span>Reply</span><textarea id="ticket-reply" required></textarea></label><button class="primary-btn" type="submit">Send Reply & Resolve</button></form>`; $('#modal').showModal(); $('#reply-ticket-form').addEventListener('submit',async e=>{e.preventDefault();const reply=$('#ticket-reply').value.trim();const {error}=await sb.from('tickets').update({reply,status:'resolved',updated_at:new Date().toISOString()}).eq('id',id);if(error)return toast(error.message,'error');await logActivity('Resolved support ticket','tickets',id);$('#modal').close();await refreshAll(false);renderPage();toast('Reply saved','success')});
}
async function createAppointment(e) {
  e.preventDefault(); const preferred=$('#appt-time').value; const row={worker_id:profile.id,shop_name:$('#appt-shop').value.trim(),phone:$('#appt-phone').value.trim()||null,service:$('#appt-service').value.trim()||null,notes:$('#appt-notes').value.trim()||null,preferred_at:preferred?new Date(preferred).toISOString():null,status:'requested'}; const {error}=await sb.from('appointments').insert(row); if(error)return toast(error.message,'error'); await logActivity(`Created appointment: ${row.shop_name}`,'appointments'); await refreshAll(false); renderPage(); toast('Appointment saved','success');
}
async function updateAppointment(id,status) { const {error}=await sb.from('appointments').update({status}).eq('id',id); if(error)return toast(error.message,'error'); await logActivity(`Appointment ${status}`,'appointments',id,{status}); await refreshAll(false); renderPage(); toast('Appointment updated','success'); }
async function saveSettings(e) { e.preventDefault(); const entered=$('#set-base').value.trim(); const base=normalizeQrBase(entered); if(entered.includes('#')) toast('Old #/ QR URLs are not used for new cards. Saved as the /qr/ route instead.',''); const row={company_name:$('#set-company').value.trim(),commission_rate:Number($('#set-commission').value||0),qr_base_url:base,updated_at:new Date().toISOString()}; const {error}=await sb.from('settings').update(row).eq('id',true); if(error)return toast(error.message,'error'); await logActivity('Updated company settings','settings'); await refreshAll(false); buildShell(); renderPage(); toast('Settings saved','success'); }

function toCsv(rows) {
  if (!rows.length) return '';
  const keys=Object.keys(rows[0]); const q=v=>`"${String(v??'').replaceAll('"','""')}"`; return [keys.map(q).join(','),...rows.map(r=>keys.map(k=>q(r[k])).join(','))].join('\n');
}
function downloadCsv(name,rows){const blob=new Blob([toCsv(rows)],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function exportQrs(){downloadCsv('qr-codes.csv',cache.qrs.map(q=>({code:q.code,status:q.status,worker:workerName(q.worker_id),business:cache.businesses.find(b=>b.id===q.business_id)?.name||'',scan_count:q.scan_count||0,created_at:q.created_at,assigned_at:q.assigned_at,activated_at:q.activated_at})))}
function exportBusinesses(){downloadCsv('businesses.csv',cache.businesses.map(b=>({name:b.name,owner_name:b.owner_name,phone:b.phone,category:b.category,address:b.address,area:b.area,city:b.city,google_review_url:b.google_review_url,qr:cache.qrs.find(q=>q.id===b.qr_id)?.code||'',worker:workerName(b.worker_id),latitude:b.latitude,longitude:b.longitude,created_at:b.created_at})))}

$('#google-login-btn').addEventListener('click', signInGoogle);
$('#email-login-form').addEventListener('submit', signInEmail);
$('#logout-btn').addEventListener('click', logout);
$('#refresh-btn').addEventListener('click', async()=>{try{await refreshAll();renderPage()}catch(e){toast(e.message,'error')}});
$('#menu-btn').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))$('#modal').close()});

window.addEventListener('scroll', () => {
  if (!profile) return;
  clearTimeout(uiSaveTimer);
  uiSaveTimer = setTimeout(() => persistUiState(), 140);
}, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') rememberCurrentView();
});
window.addEventListener('pagehide', rememberCurrentView);

document.addEventListener('DOMContentLoaded', init);
