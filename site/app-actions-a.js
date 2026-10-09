'use strict';
async function logActivity(action, entityType=null, entityId=null, details=null) {
  if (!sb || !profile) return;
  const { error } = await sb.from('activity_logs').insert({user_id:profile.id, action, entity_type:entityType, entity_id:entityId, details});
  if (error) console.warn('Activity log failed:', error.message);
}

async function generateQrs(e) {
  e.preventDefault();
  const count = Math.min(1000, Math.max(1, Number($('#generate-count').value || 0)));
  const { data, error } = await sb.rpc('generate_qr_codes', {p_count:count});
  if (error) return toast(error.message,'error');
  await logActivity(`Generated ${data} QR codes`,'qr_codes');
  await refreshAll(false); renderPage(); toast(`${data} QR codes generated`,'success');
}

async function assignQrs(e) {
  e.preventDefault();
  const workerId = $('#assign-worker').value;
  const count = Math.min(1000, Math.max(1, Number($('#assign-count').value || 0)));
  if (!workerId) return toast('Select a worker','error');
  const { data, error } = await sb.rpc('assign_qrs_to_worker', {p_worker_id:workerId,p_count:count});
  if (error) return toast(error.message,'error');
  await logActivity(`Assigned ${data} QR codes to ${workerName(workerId)}`,'qr_codes',null,{worker_id:workerId,count:data});
  await refreshAll(false); renderPage(); toast(`${data} QR codes assigned`,'success');
}

async function deleteQr(id) {
  const q = cache.qrs.find(x=>x.id===id); if (!q) return;
  if (!confirm(`Delete unused ${q.code}? This is only allowed because it has never been assigned or used. The number will never be reused.`)) return;
  const { error } = await sb.from('qr_codes').delete().eq('id',id);
  if (error) return toast(error.message,'error');
  await logActivity(`Deleted unused QR ${q.code}`,'qr_codes',id);
  await refreshAll(false); renderPage(); toast(`${q.code} deleted`,'success');
}

function syncQrDeleteSelection() {
  const boxes = $$('.qr-delete-check');
  const selected = boxes.filter(box => box.checked);
  const button = $('#delete-selected-unused');
  const all = $('#select-all-unused');
  if (button) {
    button.disabled = selected.length === 0;
    button.textContent = `Delete selected (${selected.length})`;
  }
  if (all) {
    all.checked = boxes.length > 0 && selected.length === boxes.length;
    all.indeterminate = selected.length > 0 && selected.length < boxes.length;
  }
}

async function deleteSelectedUnusedQrs() {
  if (!isAdmin()) return;
  const ids = $$('.qr-delete-check').filter(box => box.checked).map(box => box.value);
  if (!ids.length) return toast('Select at least one unused QR code','error');
  const selected = cache.qrs.filter(q => ids.includes(q.id));
  if (selected.some(q => !isDeletableQr(q))) return toast('One selected QR is no longer safe to delete. Refresh and try again.','error');
  const sample = selected.slice(0, 6).map(q => q.code).join(', ');
  const extra = selected.length > 6 ? ` and ${selected.length - 6} more` : '';
  if (!confirm(`Delete ${selected.length} unused QR code${selected.length===1?'':'s'}?\n\n${sample}${extra}\n\nThese QR numbers will never be reused.`)) return;
  const { error } = await sb.from('qr_codes').delete().in('id', ids);
  if (error) return toast(error.message,'error');
  await logActivity(`Deleted ${selected.length} unused QR codes`,'qr_codes',null,{codes:selected.map(q=>q.code)});
  await refreshAll(false);
  renderPage();
  toast(`${selected.length} unused QR code${selected.length===1?'':'s'} deleted`,'success');
}

let reviewQRStudio = null;
function previewQr(id) {
 const q=cache.qrs.find(x=>x.id===id);if(!q)return;
 const url=qrUrl(q.code),business=q.business_id?cache.businesses.find(b=>b.id===q.business_id):null;
 $('#modal-content').innerHTML='<div class="qr-card-dialog-head"><h2>'+esc(q.code)+' · Review card designer</h2><p class="muted small">Choose a professional printed card. The QR destination stays unchanged.</p></div><div id="review-qr-designer"></div><p class="qr-card-destination">QR destination: '+esc(url)+'<br><a href="/qr-designs/" target="_blank" rel="noopener">Compare the QR design gallery ↗</a></p>';
 $('#modal').showModal();
 reviewQRStudio=window.QRDesigns.mount($('#review-qr-designer'),{kind:'review',id:q.code,url,name:business?.name||settings?.company_name||'Your business',company:settings?.company_name&&settings.company_name!=='QR Field Ops'?settings.company_name:'YAM IT SERVICES'});
}
