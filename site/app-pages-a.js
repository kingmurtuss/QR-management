'use strict';
function stat(label,value,note='') { return `<div class="card stat"><div class="stat-label">${esc(label)}</div><div class="stat-value">${esc(value)}</div><div class="stat-note">${esc(note)}</div></div>`; }

function renderDashboard() {
  const activeQrs = cache.qrs.filter(q=>q.status==='active').length;
  const assignedQrs = cache.qrs.filter(q=>q.status==='assigned').length;
  const scanCount = cache.qrs.reduce((a,q)=>a+Number(q.scan_count||0),0);
  const rate = Number(settings?.commission_rate || 0);
  if (isAdmin()) {
    const workers = cache.profiles.filter(p=>p.role==='worker');
    const today = new Date().toDateString();
    const todayBusinesses = cache.businesses.filter(b=>new Date(b.created_at).toDateString()===today).length;
    const workerRows = workers.map(w=>{
      const bs = cache.businesses.filter(b=>b.worker_id===w.id).length;
      const q = cache.qrs.filter(x=>x.worker_id===w.id);
      return `<tr><td><b>${esc(w.name)}</b><div class="tiny muted">${esc(w.email||'')}</div></td><td>${bs}</td><td>${q.filter(x=>x.status==='active').length}</td><td>${q.filter(x=>x.status==='assigned').length}</td><td>${money(bs*rate)}</td><td>${w.active?statusBadge('active'):statusBadge('disabled')}</td></tr>`;
    }).join('');
    return `<div class="grid stats-grid">
      ${stat('Workers', workers.length, `${workers.filter(w=>w.active).length} active`)}
      ${stat('Businesses', cache.businesses.length, `${todayBusinesses} onboarded today`)}
      ${stat('Active QR Cards', activeQrs, `${assignedQrs} assigned, unused`)}
      ${stat('Recorded Scans', scanCount, 'Redirects through your QR system')}
    </div>
    <div class="grid two-grid" style="margin-top:18px">
      <section class="card"><div class="card-head"><div><h2>Worker performance</h2><p>Businesses, QR inventory and gross commission.</p></div></div>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>Worker</th><th>Businesses</th><th>Used QR</th><th>Available</th><th>Gross</th><th>Status</th></tr></thead><tbody>${workerRows || `<tr><td colspan="6" class="empty">No workers yet.</td></tr>`}</tbody></table></div>
      </section>
      <section class="card"><div class="card-head"><div><h2>Recent onboarding</h2><p>Latest businesses added to the system.</p></div></div>${renderRecentBusinesses(7)}</section>
    </div>`;
  }

  const earned = cache.businesses.length * rate;
  const paid = cache.withdrawals.filter(x=>x.status==='paid').reduce((a,x)=>a+Number(x.amount||0),0);
  const pending = cache.withdrawals.filter(x=>x.status==='pending').reduce((a,x)=>a+Number(x.amount||0),0);
  const available = Math.max(0, earned-paid-pending);
  return `<div class="grid stats-grid">
    ${stat('My Businesses', cache.businesses.length, 'Successful onboardings')}
    ${stat('QR Ready', assignedQrs, 'Assigned cards still available')}
    ${stat('QR Active', activeQrs, 'Cards connected to businesses')}
    ${stat('Available Earnings', money(available), `${money(pending)} pending withdrawal`)}
  </div>
  <div class="grid two-grid" style="margin-top:18px">
    <section class="card"><div class="card-head"><div><h2>Recent businesses</h2><p>Your latest onboardings.</p></div><button class="primary-btn" data-go="onboard">Add Business</button></div>${renderRecentBusinesses(7)}</section>
    <section class="card"><div class="card-head"><div><h2>QR summary</h2><p>Your physical card inventory.</p></div></div>
      <div class="kpi-line"><span>Assigned and ready</span><strong>${assignedQrs}</strong></div>
      <div class="kpi-line"><span>Active / used</span><strong>${activeQrs}</strong></div>
      <div class="kpi-line"><span>Total scans</span><strong>${scanCount}</strong></div>
      <div class="kpi-line"><span>Commission per onboarding</span><strong>${money(rate)}</strong></div>
    </section>
  </div>`;
}

function renderRecentBusinesses(limit=7) {
  const rows = cache.businesses.slice(0,limit);
  if (!rows.length) return `<div class="empty"><strong>No businesses yet</strong>Onboard your first client to see it here.</div>`;
  return rows.map(b=>`<div class="kpi-line"><div><strong>${esc(b.name)}</strong><div class="tiny muted">${esc(b.area||b.city||'No area')} • ${esc(cache.qrs.find(q=>q.id===b.qr_id)?.code||'QR')}</div></div><span>${d(b.created_at)}</span></div>`).join('');
}

function renderWorkers() {
  if (!isAdmin()) return `<div class="alert error">Admin access required.</div>`;
  const rows = cache.profiles.map(w=>{
    const bs = cache.businesses.filter(b=>b.worker_id===w.id).length;
    const q = cache.qrs.filter(x=>x.worker_id===w.id);
    const self = w.id===profile.id;
    return `<tr><td><b>${esc(w.name)}</b><div class="tiny muted">${esc(w.email||'')}</div></td><td>${esc(w.phone||'—')}</td><td>${statusBadge(w.role)}</td><td>${bs}</td><td>${q.length}</td><td>${w.active?statusBadge('active'):statusBadge('disabled')}</td><td><div class="actions">
      ${!self?`<button class="mini-btn blue" data-worker-role="${w.id}" data-role="${w.role}">${w.role==='admin'?'Make Worker':'Make Admin'}</button>`:''}
      ${!self?`<button class="mini-btn ${w.active?'red':'green'}" data-worker-active="${w.id}" data-active="${w.active}">${w.active?'Disable':'Enable'}</button>`:''}
    </div></td></tr>`;
  }).join('');
  return `<section class="card"><div class="card-head"><div><h2>User accounts</h2><p>Google signups appear here automatically as workers. Promote only trusted managers to admin.</p></div></div>
    <div class="alert info">For security, nobody can choose “Admin” during Google signup. New accounts start as <b>worker</b>.</div>
    <div class="table-wrap" style="margin-top:14px"><table class="data-table"><thead><tr><th>User</th><th>Phone</th><th>Role</th><th>Businesses</th><th>QR</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>
  </section>`;
}

function renderQrs() {
  const qrs = cache.qrs;
  const available = qrs.filter(q=>q.status==='available').length;
  const assigned = qrs.filter(q=>q.status==='assigned').length;
  const active = qrs.filter(q=>q.status==='active').length;

  const controls = isAdmin() ? `<section class="card" style="margin-bottom:18px"><div class="card-head"><div><h2>QR inventory actions</h2><p>QR numbers come from a permanent database sequence. Deleting unused cards never reuses their numbers.</p></div></div>
    <div class="grid two-grid">
      <form id="generate-qr-form" class="card" style="box-shadow:none;background:#f8fafc"><h3>Generate QR cards</h3><div class="field"><span>Quantity</span><input id="generate-count" type="number" min="1" max="1000" value="50" required></div><div class="form-actions"><button class="primary-btn" type="submit">Generate</button></div></form>
      <form id="assign-qr-form" class="card" style="box-shadow:none;background:#f8fafc"><h3>Assign to worker</h3><div class="form-grid"><label class="field"><span>Worker</span><select id="assign-worker" required><option value="">Select worker</option>${cache.profiles.filter(p=>p.role==='worker'&&p.active).map(p=>`<option value="${p.id}">${esc(p.name)} (${esc(p.email||'')})</option>`).join('')}</select></label><label class="field"><span>Quantity</span><input id="assign-count" type="number" min="1" max="1000" value="50" required></label></div><div class="form-actions"><button class="primary-btn" type="submit">Assign oldest available</button></div></form>
    </div></section>` : '';

  const rows = qrs.map(q=>`<tr>${isAdmin()?`<td class="qr-select-cell"><input class="qr-delete-check" type="checkbox" value="${q.id}" aria-label="Select ${esc(q.code)} for deletion"></td>`:''}<td><span class="copy-code">${esc(q.code)}</span></td><td>${statusBadge(q.status)}</td><td>${esc(workerName(q.worker_id))}</td><td>${q.business_id?esc(cache.businesses.find(b=>b.id===q.business_id)?.name||'Linked'):'—'}</td><td>${Number(q.scan_count||0).toLocaleString('en-IN')}</td><td>${d(q.created_at)}</td><td><div class="actions"><button class="mini-btn blue" data-print-qr="${q.id}">Preview / Print</button>${isAdmin()?`<button class="mini-btn red" data-delete-qr="${q.id}">Delete</button>`:''}</div></td></tr>`).join('');

  const bulkTools = isAdmin() ? `<div class="qr-bulk-tools"><label class="select-unused"><input id="select-all-unused" type="checkbox" ${qrs.length?'':'disabled'}><span>Select all (${qrs.length})</span></label><button class="mini-btn red" id="delete-selected-unused" type="button" disabled>Delete selected (0)</button></div>` : '';
  const colCount = isAdmin() ? 8 : 7;
  return `<div class="grid three-grid" style="margin-bottom:18px">${stat('Available',available,'Never assigned')}${stat('Assigned',assigned,'With workers')}${stat('Active',active,'Connected to businesses')}</div>${controls}
  <section class="card"><div class="card-head"><div><h2>${isAdmin()?'All QR cards':'My QR cards'}</h2><p>${isAdmin()?'Select and delete any QR codes you no longer need. QR numbers are never reused.':'Your permanent QR card inventory.'}</p></div><div class="actions">${bulkTools}<button class="ghost-btn" id="export-qr">Export CSV</button></div></div>
    <div class="table-wrap"><table class="data-table"><thead><tr>${isAdmin()?'<th class="qr-select-cell">Select</th>':''}<th>Code</th><th>Status</th><th>Worker</th><th>Business</th><th>Scans</th><th>Created</th><th>Actions</th></tr></thead><tbody>${rows || `<tr><td colspan="${colCount}" class="empty">No QR codes found.</td></tr>`}</tbody></table></div>
  </section>`;
}
