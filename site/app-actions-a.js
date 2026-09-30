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

function modernQrOptions(url, size = 196) {
  return {
    width: size,
    height: size,
    type: 'svg',
    data: url,
    margin: 7,
    qrOptions: { errorCorrectionLevel: 'H' },
    dotsOptions: {
      type: 'extra-rounded',
      gradient: {
        type: 'linear',
        rotation: Math.PI / 4,
        colorStops: [
          { offset: 0, color: '#07111f' },
          { offset: 0.55, color: '#173b70' },
          { offset: 1, color: '#0f5a67' }
        ]
      }
    },
    cornersSquareOptions: {
      type: 'extra-rounded',
      color: '#2563eb'
    },
    cornersDotOptions: {
      type: 'dot',
      color: '#07111f'
    },
    backgroundOptions: { color: '#ffffff' }
  };
}

function renderModernQr(el, url, size = 196) {
  if (!el) return null;
  el.innerHTML = '';

  if (window.QRCodeStyling) {
    const styled = new QRCodeStyling(modernQrOptions(url, size));
    styled.append(el);
    return styled;
  }

  if (window.QRCode) {
    new QRCode(el, {
      text: url,
      width: size,
      height: size,
      colorDark: '#07111f',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
  }
  return null;
}

function reviewCardMarkup(code, company, businessName = '') {
  const businessTag = businessName
    ? `<div class="review-business-tag"><span></span>${esc(businessName)}</div>`
    : '';

  return `<div class="review-card premium-review-card">
    <div class="review-orb orb-one"></div>
    <div class="review-orb orb-two"></div>
    <div class="review-grid-glow"></div>

    <div class="review-topline">
      <span class="google-review-badge"><span class="g">G</span><span>Google Review</span></span>
      <span class="review-speed"><i></i> LIVE</span>
    </div>

    <div class="review-eyebrow">A SMALL TAP • A BIG IMPACT</div>
    <h2>Loved the visit?<br><span>Make it count.</span></h2>
    <p>Point your camera at the code and share your experience on Google.</p>
    ${businessTag}

    <div class="star-row" aria-label="Five stars">
      <span>★</span><span>★</span><span>★</span><span>★</span><span>★</span>
    </div>

    <div class="qr-portal">
      <div class="qr-portal-glow"></div>
      <div class="qr-window">
        <span class="qr-corner qr-corner-tl"></span>
        <span class="qr-corner qr-corner-tr"></span>
        <span class="qr-corner qr-corner-bl"></span>
        <span class="qr-corner qr-corner-br"></span>
        <div class="qr-box premium-qr-box" id="modal-qr"></div>
        <div class="qr-scan-label"><span class="scan-pulse"></span> POINT CAMERA HERE <b>↗</b></div>
      </div>
    </div>

    <div class="review-meta">
      <span>${esc(code)}</span>
      <span>Smart review link</span>
    </div>
    <div class="review-footer">Powered by ${esc(company)}</div>
  </div>`;
}

function previewQr(id) {
  const q = cache.qrs.find(x => x.id === id);
  if (!q) return;

  const url = qrUrl(q.code);
  const business = q.business_id ? cache.businesses.find(b => b.id === q.business_id) : null;
  const modal = $('#modal');

  $('#modal-content').innerHTML = `<div class="card-preview-head">
    <div>
      <h2>${esc(q.code)} — Signature Review Card</h2>
      <p class="muted small">Modern rounded QR modules, integrated scan lens, portrait PVC format.</p>
    </div>
    <span class="status active">SIGNATURE</span>
  </div>
  <div class="review-card-preview premium-preview">
    ${reviewCardMarkup(q.code, settings.company_name || 'QR Field Ops', business?.name || '')}
  </div>
  <div class="form-actions">
    <button type="button" class="primary-btn" id="print-card-btn">Print Signature PVC Card</button>
  </div>
  <p class="tiny muted">QR destination: ${esc(url)}</p>`;

  modal.showModal();
  renderModernQr($('#modal-qr'), url, 188);
  $('#print-card-btn').addEventListener('click', () => printQrCard(q.code, url, business?.name || ''));
}

function printQrCard(code, url, businessName = '') {
  const w = window.open('', '_blank', 'width=620,height=900');
  if (!w) return toast('Allow pop-ups to print the QR card', 'error');

  const company = esc(settings.company_name || 'QR Field Ops');
  const business = businessName ? `<div class="business"><span></span>${esc(businessName)}</div>` : '';

  w.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(code)}</title>
<style>
*{box-sizing:border-box}
html,body{margin:0;background:#e9eef6;font-family:Inter,Arial,sans-serif}
body{min-height:100vh;display:grid;place-items:center;padding:24px}
.card{width:54mm;height:85.6mm;position:relative;overflow:hidden;border-radius:5.8mm;padding:5.1mm 4.5mm 3.8mm;color:#fff;text-align:center;background:
radial-gradient(circle at 14% 8%,rgba(59,130,246,.48),transparent 28%),
radial-gradient(circle at 92% 18%,rgba(236,72,153,.20),transparent 25%),
radial-gradient(circle at 76% 92%,rgba(16,185,129,.20),transparent 28%),
linear-gradient(160deg,#06101e 0%,#0b1830 55%,#122243 100%);
box-shadow:0 18px 55px rgba(2,6,23,.30);border:.25mm solid rgba(255,255,255,.14)}
.card:before{content:"";position:absolute;inset:0;background:
linear-gradient(115deg,rgba(255,255,255,.10),transparent 30%,transparent 70%,rgba(255,255,255,.04)),
repeating-linear-gradient(90deg,transparent 0 6mm,rgba(255,255,255,.018) 6mm 6.2mm);
pointer-events:none}
.orb{position:absolute;border-radius:50%;filter:blur(.8mm);opacity:.72}
.o1{width:32mm;height:32mm;left:-17mm;top:28mm;background:radial-gradient(circle,rgba(37,99,235,.40),transparent 68%)}
.o2{width:27mm;height:27mm;right:-14mm;bottom:8mm;background:radial-gradient(circle,rgba(16,185,129,.22),transparent 68%)}
.top{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between}
.google{display:flex;align-items:center;gap:1.6mm;background:rgba(255,255,255,.96);color:#101828;border-radius:999px;padding:1.2mm 2.3mm 1.2mm 1.4mm;font-size:2.5mm;font-weight:900;box-shadow:0 1mm 3mm rgba(0,0,0,.14)}
.g{width:5.5mm;height:5.5mm;border-radius:50%;display:grid;place-items:center;background:#fff;border:.2mm solid #e5e7eb;color:#4285f4;font-size:3.8mm;font-weight:1000}
.live{display:inline-flex;align-items:center;gap:1.2mm;padding:1.3mm 2mm;border:.22mm solid rgba(191,219,254,.30);background:rgba(255,255,255,.06);border-radius:999px;color:#dbeafe;font-size:2mm;font-weight:950;letter-spacing:.14em}
.live i{width:1.4mm;height:1.4mm;border-radius:50%;background:#34d399;box-shadow:0 0 0 .9mm rgba(52,211,153,.12)}
.eyebrow{position:relative;z-index:2;margin-top:3.4mm;font-size:1.9mm;letter-spacing:.18em;color:#93c5fd;font-weight:950}
.card h1{position:relative;z-index:2;font-size:6.3mm;line-height:.98;margin:1.7mm 0 1.5mm;letter-spacing:-.24mm}
.card h1 span{background:linear-gradient(90deg,#93c5fd,#fbcfe8,#fde68a);-webkit-background-clip:text;color:transparent}
.copy{position:relative;z-index:2;font-size:2.25mm;line-height:1.42;color:#d3deef;max-width:43mm;margin:0 auto 1.3mm}
.business{position:relative;z-index:2;display:inline-flex;align-items:center;gap:1.4mm;max-width:43mm;padding:1.2mm 2.1mm;border-radius:999px;background:rgba(255,255,255,.07);border:.2mm solid rgba(255,255,255,.10);color:#dbeafe;font-size:2mm;font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.business span{width:1.4mm;height:1.4mm;border-radius:50%;background:#60a5fa;flex:0 0 auto}
.stars{position:relative;z-index:2;display:flex;justify-content:center;gap:.8mm;margin:1.5mm 0 1.7mm}
.stars span{width:5mm;height:5mm;display:grid;place-items:center;border-radius:1.6mm;background:linear-gradient(180deg,#fff8ca,#fbbc05);color:#704600;font-size:3.2mm;box-shadow:0 .6mm 1.6mm rgba(251,188,5,.20)}
.portal{position:relative;width:41.5mm;height:41.5mm;margin:0 auto 1.8mm}
.portalglow{position:absolute;inset:-2.2mm;border-radius:8mm;background:conic-gradient(from 210deg,#2563eb,#06b6d4,#10b981,#f59e0b,#ec4899,#2563eb);filter:blur(3.1mm);opacity:.40}
.window{position:relative;z-index:2;width:100%;height:100%;padding:2.2mm 2.2mm 6.1mm;border-radius:6.2mm;background:linear-gradient(145deg,rgba(255,255,.99),rgba(244,248,255,.98));border:.25mm solid rgba(255,255,255,.82);box-shadow:0 2mm 7mm rgba(0,0,0,.28),inset 0 .3mm 0 rgba(255,255,255,.9);display:grid;place-items:center}
.qr{width:32.8mm;height:32.8mm;display:grid;place-items:center}
.qr svg,.qr canvas,.qr img{display:block;max-width:100%;max-height:100%}
.scan{position:absolute;left:50%;bottom:1.25mm;transform:translateX(-50%);display:flex;align-items:center;gap:1.2mm;color:#0f172a;font-size:1.8mm;font-weight:1000;letter-spacing:.07em;white-space:nowrap}
.scan i{width:1.45mm;height:1.45mm;border-radius:50%;background:#22c55e;box-shadow:0 0 0 .8mm rgba(34,197,94,.14)}
.corner{position:absolute;width:4mm;height:4mm;z-index:3;opacity:.85}
.tl{left:1.5mm;top:1.5mm;border-left:.45mm solid #2563eb;border-top:.45mm solid #2563eb;border-radius:1.1mm 0 0 0}
.tr{right:1.5mm;top:1.5mm;border-right:.45mm solid #ec4899;border-top:.45mm solid #ec4899;border-radius:0 1.1mm 0 0}
.bl{left:1.5mm;bottom:5.3mm;border-left:.45mm solid #10b981;border-bottom:.45mm solid #10b981;border-radius:0 0 0 1.1mm}
.br{right:1.5mm;bottom:5.3mm;border-right:.45mm solid #f59e0b;border-bottom:.45mm solid #f59e0b;border-radius:0 0 1.1mm 0}
.meta{position:relative;z-index:2;display:flex;justify-content:space-between;gap:2mm;border-top:.22mm solid rgba(255,255,255,.10);padding-top:1.8mm;color:#aab9d0;font-size:1.9mm;font-weight:850;letter-spacing:.05em}
.meta .code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#fff}
.foot{position:relative;z-index:2;margin-top:.9mm;color:#73829a;font-size:1.7mm}
@page{size:54mm 85.6mm;margin:0}
@media print{html,body{width:54mm;height:85.6mm;background:#fff}body{padding:0}.card{box-shadow:none;border-radius:0}}
</style>
</head>
<body>
<div class="card">
  <div class="orb o1"></div><div class="orb o2"></div>
  <div class="top"><div class="google"><span class="g">G</span><span>Google Review</span></div><div class="live"><i></i>LIVE</div></div>
  <div class="eyebrow">A SMALL TAP • A BIG IMPACT</div>
  <h1>Loved the visit?<br><span>Make it count.</span></h1>
  <div class="copy">Point your camera at the code and share your experience on Google.</div>
  ${business}
  <div class="stars"><span>★</span><span>★</span><span>★</span><span>★</span><span>★</span></div>
  <div class="portal">
    <div class="portalglow"></div>
    <div class="window">
      <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
      <div class="qr" id="qr"></div>
      <div class="scan"><i></i>POINT CAMERA HERE <b>↗</b></div>
    </div>
  </div>
  <div class="meta"><span class="code">${esc(code)}</span><span>Smart review link</span></div>
  <div class="foot">Powered by ${company}</div>
</div>

<script src="https://cdn.jsdelivr.net/npm/qr-code-styling@1.9.2/lib/qr-code-styling.js"><\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
<script>
window.onload=function(){
  var el=document.getElementById('qr');
  if(window.QRCodeStyling){
    var qr=new QRCodeStyling({
      width:124,height:124,type:'svg',data:${JSON.stringify(url)},margin:5,
      qrOptions:{errorCorrectionLevel:'H'},
      dotsOptions:{
        type:'extra-rounded',
        gradient:{type:'linear',rotation:0.7853981634,colorStops:[
          {offset:0,color:'#07111f'},
          {offset:0.55,color:'#173b70'},
          {offset:1,color:'#0f5a67'}
        ]}
      },
      cornersSquareOptions:{type:'extra-rounded',color:'#2563eb'},
      cornersDotOptions:{type:'dot',color:'#07111f'},
      backgroundOptions:{color:'#ffffff'}
    });
    qr.append(el);
  }else{
    new QRCode(el,{text:${JSON.stringify(url)},width:124,height:124,colorDark:'#07111f',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.H});
  }
  setTimeout(function(){window.print()},650);
};
<\/script>
</body>
</html>`);
  w.document.close();
}
