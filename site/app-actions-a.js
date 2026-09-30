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

function reviewCardMarkup(code, company, businessName = '') {
  const title = businessName ? esc(businessName) : 'Your experience matters';
  return `<div class="review-card premium-review-card">
    <div class="review-orb orb-one"></div><div class="review-orb orb-two"></div>
    <div class="review-topline">
      <span class="google-review-badge"><span class="g">G</span><span>Google Review</span></span>
      <span class="review-speed">10 SEC</span>
    </div>
    <div class="review-eyebrow">YOUR VOICE • REAL IMPACT</div>
    <h2>${title}<br><span>Share the moment.</span></h2>
    <p>One quick scan. One honest review. Help a local business get discovered by the people who need it.</p>
    <div class="star-row" aria-label="Five stars"><span>★</span><span>★</span><span>★</span><span>★</span><span>★</span></div>
    <div class="qr-stage"><div class="qr-glow"></div><div class="qr-box premium-qr-box" id="modal-qr"></div></div>
    <div class="scan-cta"><span class="scan-pulse"></span><span>SCAN • RATE • DONE</span><b>→</b></div>
    <div class="review-meta"><span>${esc(code)}</span><span>Dynamic review card</span></div>
    <div class="review-footer">Powered by ${esc(company)}</div>
  </div>`;
}

function previewQr(id) {
  const q = cache.qrs.find(x=>x.id===id); if (!q) return;
  const url = qrUrl(q.code);
  const business = q.business_id ? cache.businesses.find(b=>b.id===q.business_id) : null;
  const modal = $('#modal');
  $('#modal-content').innerHTML = `<div class="card-preview-head"><div><h2>${esc(q.code)} — Premium Review Card</h2><p class="muted small">Designed for portrait PVC printing (54 × 85.6 mm).</p></div><span class="status active">PREMIUM</span></div><div class="review-card-preview premium-preview">${reviewCardMarkup(q.code, settings.company_name||'QR Field Ops', business?.name||'')}</div><div class="form-actions"><button type="button" class="primary-btn" id="print-card-btn">Print Premium PVC Card</button></div><p class="tiny muted">QR destination: ${esc(url)}</p>`;
  modal.showModal();
  new QRCode($('#modal-qr'), {text:url,width:206,height:206,colorDark:'#07111f',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.H});
  $('#print-card-btn').addEventListener('click',()=>printQrCard(q.code,url,business?.name||''));
}

function printQrCard(code,url,businessName='') {
  const w = window.open('', '_blank', 'width=620,height=900');
  if (!w) return toast('Allow pop-ups to print the QR card','error');
  const company = esc(settings.company_name||'QR Field Ops');
  const title = businessName ? esc(businessName) : 'Your experience matters';
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(code)}</title><style>
  *{box-sizing:border-box}html,body{margin:0;background:#eef2f7;font-family:Inter,Arial,sans-serif}body{min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:54mm;height:85.6mm;position:relative;overflow:hidden;border-radius:5.6mm;padding:5.5mm 4.8mm 4.4mm;background:radial-gradient(circle at 18% 10%,rgba(66,133,244,.42),transparent 29%),radial-gradient(circle at 88% 28%,rgba(234,67,53,.24),transparent 27%),radial-gradient(circle at 70% 92%,rgba(52,168,83,.22),transparent 28%),linear-gradient(160deg,#07111f 0%,#0b1730 54%,#111d3d 100%);color:#fff;text-align:center;box-shadow:0 18px 55px rgba(2,6,23,.28);border:.3mm solid rgba(255,255,255,.16)}.card:before{content:"";position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,255,255,.10),transparent 28%,transparent 68%,rgba(255,255,255,.05));pointer-events:none}.orb{position:absolute;border-radius:50%;filter:blur(1px);opacity:.7}.o1{width:30mm;height:30mm;left:-15mm;top:27mm;background:radial-gradient(circle,rgba(66,133,244,.35),transparent 68%)}.o2{width:27mm;height:27mm;right:-14mm;bottom:12mm;background:radial-gradient(circle,rgba(251,188,5,.20),transparent 68%)}.top{display:flex;align-items:center;justify-content:space-between;position:relative;z-index:2}.google{display:flex;align-items:center;gap:1.7mm;background:rgba(255,255,255,.95);color:#111827;border-radius:999px;padding:1.3mm 2.5mm 1.3mm 1.6mm;font-size:2.6mm;font-weight:900;box-shadow:0 1mm 3mm rgba(0,0,0,.14)}.g{width:5.8mm;height:5.8mm;border-radius:50%;display:grid;place-items:center;background:#fff;font-size:4mm;font-weight:1000;color:#4285f4;border:.25mm solid #e5e7eb}.speed{font-size:2.1mm;font-weight:900;letter-spacing:.18em;color:#c7d2fe;border:.25mm solid rgba(199,210,254,.28);border-radius:999px;padding:1.3mm 2mm;background:rgba(255,255,255,.06)}.eyebrow{margin-top:4mm;font-size:2.1mm;letter-spacing:.18em;color:#93c5fd;font-weight:900}.card h1{font-size:6.6mm;line-height:.98;margin:2.2mm 0 2mm;letter-spacing:-.25mm}.card h1 span{background:linear-gradient(90deg,#93c5fd,#fbcfe8,#fde68a);-webkit-background-clip:text;color:transparent}.copy{font-size:2.55mm;line-height:1.45;color:#d5deee;margin:0 auto 2.3mm;max-width:43mm}.stars{display:flex;justify-content:center;gap:1mm;margin-bottom:2.6mm}.stars span{width:5.7mm;height:5.7mm;display:grid;place-items:center;border-radius:1.8mm;background:linear-gradient(180deg,#fff7c2,#fbbc05);color:#714700;font-size:3.6mm;box-shadow:0 .7mm 2mm rgba(251,188,5,.22)}.qrstage{position:relative;width:38mm;height:38mm;margin:0 auto 2.7mm}.halo{position:absolute;inset:-2.4mm;border-radius:5mm;background:conic-gradient(from 180deg,#4285f4,#ea4335,#fbbc05,#34a853,#4285f4);filter:blur(3mm);opacity:.42}.qr{position:relative;z-index:2;width:38mm;height:38mm;background:#fff;border-radius:4.2mm;border:2.1mm solid #fff;display:grid;place-items:center;box-shadow:0 2mm 6mm rgba(0,0,0,.30)}.cta{position:relative;z-index:2;display:flex;align-items:center;justify-content:center;gap:1.7mm;width:max-content;margin:0 auto 2.6mm;border-radius:999px;padding:1.8mm 3.4mm;background:linear-gradient(90deg,#fff,#f8fbff);color:#0f172a;font-size:2.35mm;font-weight:1000;letter-spacing:.08em;box-shadow:0 1.2mm 3mm rgba(0,0,0,.20)}.dot{width:2.1mm;height:2.1mm;border-radius:50%;background:#34a853;box-shadow:0 0 0 1.2mm rgba(52,168,83,.16)}.meta{display:flex;justify-content:space-between;gap:2mm;color:#aebbd0;font-size:2mm;font-weight:800;letter-spacing:.05em;border-top:.25mm solid rgba(255,255,255,.10);padding-top:2.2mm}.foot{margin-top:1.2mm;font-size:1.9mm;color:#7f8da5}.code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#fff}@page{size:54mm 85.6mm;margin:0}@media print{html,body{width:54mm;height:85.6mm;background:#fff}body{padding:0}.card{box-shadow:none;border-radius:0}}
  </style></head><body><div class="card"><div class="orb o1"></div><div class="orb o2"></div><div class="top"><div class="google"><span class="g">G</span><span>Google Review</span></div><span class="speed">10 SEC</span></div><div class="eyebrow">YOUR VOICE • REAL IMPACT</div><h1>${title}<br><span>Share the moment.</span></h1><div class="copy">One quick scan. One honest review. Help a local business get discovered.</div><div class="stars"><span>★</span><span>★</span><span>★</span><span>★</span><span>★</span></div><div class="qrstage"><div class="halo"></div><div class="qr" id="qr"></div></div><div class="cta"><span class="dot"></span><span>SCAN • RATE • DONE</span><b>→</b></div><div class="meta"><span class="code">${esc(code)}</span><span>Dynamic review card</span></div><div class="foot">Powered by ${company}</div></div><script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script><script>window.onload=function(){new QRCode(document.getElementById('qr'),{text:${JSON.stringify(url)},width:132,height:132,colorDark:'#07111f',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.H});setTimeout(()=>window.print(),450)}<\/script></body></html>`);
  w.document.close();
}
