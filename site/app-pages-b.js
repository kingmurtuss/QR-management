'use strict';
function renderBusinesses() {
  const rows = cache.businesses.map(b=>`<tr><td><b>${esc(b.name)}</b><div class="tiny muted">${esc(b.category||'')}</div></td><td>${esc(b.owner_name||'—')}<div class="tiny muted">${esc(b.phone||'')}</div></td><td>${esc(b.area||'—')}<div class="tiny muted">${esc(b.city||'')}</div></td><td>${esc(workerName(b.worker_id))}</td><td><span class="copy-code">${esc(cache.qrs.find(q=>q.id===b.qr_id)?.code||'—')}</span></td><td>${d(b.created_at)}</td><td><div class="actions"><button class="mini-btn blue" data-open-review="${b.id}">Review URL</button>${isAdmin()?`<button class="mini-btn" data-edit-business="${b.id}">Edit</button>`:''}</div></td></tr>`).join('');
  return `<section class="card"><div class="card-head"><div><h2>${isAdmin()?'All onboarded businesses':'My onboarded businesses'}</h2><p>Every record is linked to the worker and permanent QR card used during onboarding.</p></div><div class="actions">${!isAdmin()?`<button class="primary-btn" data-go="onboard">Add Business</button>`:''}<button class="ghost-btn" id="export-businesses">Export CSV</button></div></div>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Business</th><th>Owner</th><th>Area</th><th>Worker</th><th>QR</th><th>Onboarded</th><th>Actions</th></tr></thead><tbody>${rows || `<tr><td colspan="7" class="empty">No businesses found.</td></tr>`}</tbody></table></div>
  </section>`;
}

function renderOnboard() {
  if (isAdmin()) return `<div class="alert info">Business onboarding is designed for worker accounts. Admin can manage existing business records from Businesses.</div>`;
  const ready = cache.qrs.filter(q=>q.status==='assigned' && q.worker_id===profile.id && !q.business_id);
  if (!ready.length) return `<section class="card"><div class="empty"><strong>No QR cards available</strong>Ask the admin to assign more QR cards to your account before onboarding a business.</div></section>`;
  return `<section class="card"><div class="card-head"><div><h2>New business onboarding</h2><p>Register the shop, capture location and activate one of your assigned physical QR cards.</p></div></div>
    <form id="onboard-form">
      <div class="form-grid">
        <label class="field"><span>Business name *</span><input id="b-name" required maxlength="120"></label>
        <label class="field"><span>Owner / contact name</span><input id="b-owner" maxlength="120"></label>
        <label class="field"><span>Phone</span><input id="b-phone" inputmode="tel" maxlength="30"></label>
        <label class="field"><span>Category</span><input id="b-category" placeholder="Salon, restaurant, clinic…" maxlength="80"></label>
        <label class="field full-span"><span>Address</span><input id="b-address" maxlength="250"></label>
        <label class="field"><span>Area</span><input id="b-area" maxlength="100"></label>
        <label class="field"><span>City</span><input id="b-city" maxlength="100"></label>
        <label class="field full-span"><span>Google Review URL *</span><input id="b-review" type="url" required placeholder="https://g.page/r/.../review"></label>
        <label class="field"><span>QR card *</span><select id="b-qr" required><option value="">Choose QR</option>${ready.map(q=>`<option value="${q.id}">${esc(q.code)}</option>`).join('')}</select></label>
        <div class="field"><span>Shop location</span><div class="location-box"><code id="location-text">Not captured</code><button type="button" class="mini-btn blue" id="capture-location">Capture GPS</button></div></div>
      </div>
      <div class="form-actions"><button class="primary-btn" type="submit">Save Business & Activate QR</button></div>
    </form>
  </section>`;
}

function renderEarnings() {
  const rate = Number(settings?.commission_rate || 0);
  const earned = cache.businesses.length * rate;
  const paid = cache.withdrawals.filter(x=>x.status==='paid').reduce((a,x)=>a+Number(x.amount||0),0);
  const pending = cache.withdrawals.filter(x=>x.status==='pending').reduce((a,x)=>a+Number(x.amount||0),0);
  const available = Math.max(0,earned-paid-pending);
  const rows = cache.withdrawals.map(x=>`<tr><td>${d(x.created_at)}</td><td>${money(x.amount)}</td><td>${esc(x.method)}</td><td>${statusBadge(x.status)}</td><td>${x.processed_at?dt(x.processed_at):'—'}</td></tr>`).join('');
  return `<div class="grid three-grid" style="margin-bottom:18px">${stat('Gross Earned',money(earned),`${cache.businesses.length} × ${money(rate)}`)}${stat('Paid',money(paid),'Completed payouts')}${stat('Available',money(available),`${money(pending)} pending`)}</div>
    <div class="grid two-grid"><section class="card"><h2>Request withdrawal</h2><p class="muted small">Pending requests are deducted from your available amount to prevent duplicate withdrawals.</p><form id="withdraw-form" class="stack"><label><span>Amount</span><input id="withdraw-amount" type="number" min="1" max="${available}" step="1" required></label><label><span>Method</span><select id="withdraw-method" required><option value="UPI">UPI</option><option value="Bank Transfer">Bank Transfer</option><option value="Cash">Cash</option></select></label><label><span>Payment details</span><input id="withdraw-details" required placeholder="UPI ID or bank reference"></label><button class="primary-btn" type="submit" ${available<=0?'disabled':''}>Request ${available>0?'Withdrawal':'Unavailable'}</button></form></section>
    <section class="card"><h2>Withdrawal history</h2><div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Status</th><th>Processed</th></tr></thead><tbody>${rows||`<tr><td colspan="5" class="empty">No withdrawals yet.</td></tr>`}</tbody></table></div></section></div>`;
}

function renderPayouts() {
  if (!isAdmin()) return renderEarnings();
  const rows = cache.withdrawals.map(x=>`<tr><td><b>${esc(workerName(x.worker_id))}</b></td><td>${money(x.amount)}</td><td>${esc(x.method)}<div class="tiny muted">${esc(x.payment_details||'')}</div></td><td>${statusBadge(x.status)}</td><td>${dt(x.created_at)}</td><td><div class="actions">${x.status==='pending'?`<button class="mini-btn green" data-payout="${x.id}" data-status="paid">Mark Paid</button><button class="mini-btn red" data-payout="${x.id}" data-status="rejected">Reject</button>`:''}</div></td></tr>`).join('');
  return `<section class="card"><div class="card-head"><div><h2>Worker payouts</h2><p>Review commission withdrawal requests.</p></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Worker</th><th>Amount</th><th>Payment</th><th>Status</th><th>Requested</th><th>Action</th></tr></thead><tbody>${rows||`<tr><td colspan="6" class="empty">No withdrawal requests.</td></tr>`}</tbody></table></div></section>`;
}

function renderTickets() {
  const rows = cache.tickets.map(t=>`<tr><td><b>${esc(t.subject)}</b><div class="tiny muted">${esc(t.message)}</div></td>${isAdmin()?`<td>${esc(workerName(t.worker_id))}</td>`:''}<td>${statusBadge(t.status)}</td><td>${dt(t.created_at)}</td><td>${t.reply?esc(t.reply):'—'}</td><td><div class="actions">${isAdmin()&&t.status==='open'?`<button class="mini-btn blue" data-reply-ticket="${t.id}">Reply</button>`:''}</div></td></tr>`).join('');
  return `${!isAdmin()?`<section class="card" style="margin-bottom:18px"><h2>Create support ticket</h2><form id="ticket-form" class="form-grid"><label class="field"><span>Subject</span><input id="ticket-subject" required maxlength="120"></label><label class="field full-span"><span>Message</span><textarea id="ticket-message" required maxlength="1000"></textarea></label><div class="form-actions full-span"><button class="primary-btn" type="submit">Send Ticket</button></div></form></section>`:''}
  <section class="card"><div class="card-head"><div><h2>${isAdmin()?'All tickets':'My tickets'}</h2><p>Questions and field support.</p></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Ticket</th>${isAdmin()?'<th>Worker</th>':''}<th>Status</th><th>Created</th><th>Reply</th><th>Action</th></tr></thead><tbody>${rows||`<tr><td colspan="${isAdmin()?6:5}" class="empty">No tickets.</td></tr>`}</tbody></table></div></section>`;
}

function renderAppointments() {
  const rows = cache.appointments.map(a=>`<tr><td><b>${esc(a.shop_name)}</b><div class="tiny muted">${esc(a.phone||'')}</div></td>${isAdmin()?`<td>${esc(workerName(a.worker_id))}</td>`:''}<td>${esc(a.service||'—')}</td><td>${a.preferred_at?dt(a.preferred_at):'—'}</td><td>${statusBadge(a.status)}</td><td>${esc(a.notes||'—')}</td><td>${isAdmin()?`<div class="actions"><button class="mini-btn blue" data-appt="${a.id}" data-status="confirmed">Confirm</button><button class="mini-btn green" data-appt="${a.id}" data-status="done">Done</button><button class="mini-btn red" data-appt="${a.id}" data-status="cancelled">Cancel</button></div>`:''}</td></tr>`).join('');
  return `${!isAdmin()?`<section class="card" style="margin-bottom:18px"><h2>Add follow-up / appointment</h2><form id="appointment-form" class="form-grid"><label class="field"><span>Shop name</span><input id="appt-shop" required></label><label class="field"><span>Phone</span><input id="appt-phone"></label><label class="field"><span>Service</span><input id="appt-service" placeholder="Website, SEO, ads…"></label><label class="field"><span>Preferred date/time</span><input id="appt-time" type="datetime-local"></label><label class="field full-span"><span>Notes</span><textarea id="appt-notes"></textarea></label><div class="form-actions full-span"><button class="primary-btn" type="submit">Save Appointment</button></div></form></section>`:''}
  <section class="card"><div class="card-head"><div><h2>${isAdmin()?'All appointments':'My appointments'}</h2><p>Sales and service follow-ups.</p></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Shop</th>${isAdmin()?'<th>Worker</th>':''}<th>Service</th><th>Preferred</th><th>Status</th><th>Notes</th><th>Action</th></tr></thead><tbody>${rows||`<tr><td colspan="${isAdmin()?7:6}" class="empty">No appointments.</td></tr>`}</tbody></table></div></section>`;
}

function renderSettings() {
  if (!isAdmin()) return `<div class="alert error">Admin access required.</div>`;
  return `<div class="grid two-grid"><section class="card"><div class="card-head"><div><h2>Company settings</h2><p>These values are stored centrally in Supabase.</p></div></div><form id="settings-form" class="stack"><label><span>Company name</span><input id="set-company" value="${esc(settings.company_name||'QR Field Ops')}" required></label><label><span>Commission per successful onboarding (₹)</span><input id="set-commission" type="number" min="0" step="1" value="${Number(settings.commission_rate||0)}" required></label><label><span>QR base URL</span><input id="set-base" type="url" value="${esc(qrBase())}" required></label><button class="primary-btn" type="submit">Save Settings</button></form></section>
  <section class="card"><h2>Recommended QR URL</h2><p class="muted small">Keep QR cards pointing to your own domain. If you later connect a custom domain, change this once and future printed QR cards can use the new base URL.</p><div class="location-box"><code>${esc(qrBase())}QR00001</code></div><div class="alert info">The Google Review URL is stored in the database, not inside the printed QR. This lets you change the destination without reprinting the card.</div></section></div>`;
}

function wirePage() {
  $$('[data-go]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.go)));
  $('#export-qr')?.addEventListener('click', exportQrs);
  $('#export-businesses')?.addEventListener('click', exportBusinesses);
  $('#generate-qr-form')?.addEventListener('submit', generateQrs);
  $('#assign-qr-form')?.addEventListener('submit', assignQrs);
  $$('[data-delete-qr]').forEach(b=>b.addEventListener('click',()=>deleteQr(b.dataset.deleteQr)));
  $$('.qr-delete-check').forEach(b=>b.addEventListener('change', syncQrDeleteSelection));
  $('#select-all-unused')?.addEventListener('change', e => {
    $$('.qr-delete-check').forEach(box => { box.checked = e.currentTarget.checked; });
    syncQrDeleteSelection();
  });
  $('#delete-selected-unused')?.addEventListener('click', deleteSelectedUnusedQrs);
  $$('[data-print-qr]').forEach(b=>b.addEventListener('click',()=>previewQr(b.dataset.printQr)));
  $$('[data-worker-role]').forEach(b=>b.addEventListener('click',()=>changeWorkerRole(b.dataset.workerRole,b.dataset.role)));
  $$('[data-worker-active]').forEach(b=>b.addEventListener('click',()=>toggleWorker(b.dataset.workerActive,b.dataset.active==='true')));
  $('#capture-location')?.addEventListener('click', captureLocation);
  $('#onboard-form')?.addEventListener('submit', onboardBusiness);
  $$('[data-open-review]').forEach(b=>b.addEventListener('click',()=>showReviewUrl(b.dataset.openReview)));
  $$('[data-edit-business]').forEach(b=>b.addEventListener('click',()=>editBusiness(b.dataset.editBusiness)));
  $('#withdraw-form')?.addEventListener('submit', requestWithdrawal);
  $$('[data-payout]').forEach(b=>b.addEventListener('click',()=>updatePayout(b.dataset.payout,b.dataset.status)));
  $('#ticket-form')?.addEventListener('submit', createTicket);
  $$('[data-reply-ticket]').forEach(b=>b.addEventListener('click',()=>replyTicket(b.dataset.replyTicket)));
  $('#appointment-form')?.addEventListener('submit', createAppointment);
  $$('[data-appt]').forEach(b=>b.addEventListener('click',()=>updateAppointment(b.dataset.appt,b.dataset.status)));
  $('#settings-form')?.addEventListener('submit', saveSettings);
}
