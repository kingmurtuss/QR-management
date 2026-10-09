'use strict';
let reviewSettings = [];
let replyHistory = [];
let reviewLoadRun = 0;
function renderReviewAssistant() {
  return `<section class="review-addon-hero"><div><div class="addon-eyebrow">OPTIONAL BUSINESS ADD-ON</div><h2>Great feedback starts<br>with the right words.</h2><p>Help visitors write an honest review. Help your team write a thoughtful reply.</p><div class="actions"><a class="primary-btn" href="/review.html?demo=1" target="_blank" rel="noopener">Try customer preview ↗</a><button class="ghost-btn" id="review-refresh">Refresh add-on</button></div></div><div class="addon-illustration" aria-hidden="true"><div class="addon-spark">✦</div><span>YOUR EXPERIENCE</span><div class="addon-line"></div><div class="addon-line short"></div><b>★ ★ ★ ★ ★</b><small>Choose · Edit · Share</small></div></section>
    ${!reviewAiConfigured ? '<div class="alert info">AI is awaiting activation. Visitors can use basic suggestions, and your team can use basic reply drafts until AI is connected.</div>' : ''}
    <div class="alert info">Customers choose their own rating and edit their draft before posting on Google. All ratings can open Google directly. Replies are drafts you copy into Google Business Profile.</div>
    <div id="addon-status" role="status" class="muted tiny">Loading your businesses…</div>
    <section class="card"><div class="card-head"><div><h2>Business add-ons</h2><p>Turn on the assistant for each business. Existing printed QR cards work automatically.</p></div></div><div id="addon-businesses"></div></section>
    <section class="card"><div class="card-head"><div><h2>Reply assistant</h2><p>Paste a real Google review to prepare three editable replies.</p></div></div>
      <form id="review-reply-form"><div class="form-grid"><label class="field"><span>Business</span><select id="reply-business" required><option value="">Choose a business</option>${cache.businesses.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></label><label class="field"><span>Customer rating</span><select id="reply-rating" required><option value="">Choose rating</option>${[1,2,3,4,5].map(n=>`<option value="${n}">${n} star${n===1?'':'s'}</option>`).join('')}</select></label><label class="field"><span>Reply language</span><select id="reply-language"><option>English</option><option>Hindi</option><option>Telugu</option></select></label><label class="field full-span"><span>Customer's actual review</span><textarea id="reply-text" minlength="10" maxlength="1500" required placeholder="Paste the review text here. Avoid including private contact details."></textarea></label></div><div class="form-actions"><button class="primary-btn" id="reply-generate" type="submit">✦ Generate reply options</button></div></form><div id="reply-results" class="addon-replies" aria-live="polite"></div></section>
    <section class="card"><div class="card-head"><div><h2>Saved reply drafts</h2><p>Previous suggestions for the businesses you can access. These have not been posted to Google.</p></div></div><div id="reply-history"></div></section>`;
}
function wireReviewAssistant() {
  $('#review-refresh').addEventListener('click', loadReviewAddon);
  $('#review-reply-form').addEventListener('submit', generateReviewReplies);
  loadReviewAddon();
}
async function loadReviewAddon() {
  const run = ++reviewLoadRun;
  try {
    const [prefs, history] = await Promise.all([
      sb.from('business_review_settings').select('*'),
      sb.from('review_reply_drafts').select('*').order('created_at', { ascending: false }).limit(25)
    ]);
    if (prefs.error) throw prefs.error; if (history.error) throw history.error;
    if (run !== reviewLoadRun || currentPage !== 'reviews') return;
    reviewSettings = prefs.data || []; replyHistory = history.data || [];
    $('#addon-status').textContent = `${reviewSettings.filter(x => x.enabled).length} business add-on(s) enabled · Reply drafts visible only to assigned accounts`;
    $('#addon-businesses').innerHTML = cache.businesses.map(b => {
      const pref = reviewSettings.find(x => x.business_id === b.id);
      const qr = cache.qrs.find(x => x.business_id === b.id);
      return `<div class="addon-business"><div class="addon-business-icon">${esc(initials(b.name))}</div><div class="addon-business-copy"><h3>${esc(b.name)}</h3><p>${esc(qr?.code || 'No QR linked')} · ${pref?.enabled ? 'Review assistant enabled' : 'Direct Google review'}</p></div><div class="actions">${pref?.enabled && qr?.status==='active' ? `<a class="mini-btn blue" href="/review.html?code=${encodeURIComponent(qr.code)}" target="_blank" rel="noopener">Open customer page ↗</a>` : ''}${isAdmin() ? `<label class="tiny muted">Language <select data-addon-language="${b.id}">${['English','Hindi','Telugu'].map(lang=>`<option ${pref?.default_language===lang?'selected':''}>${lang}</option>`).join('')}</select></label><label class="addon-toggle"><input type="checkbox" data-addon-toggle="${b.id}" ${pref?.enabled?'checked':''}><span>${pref?.enabled?'On':'Off'}</span></label>` : `<span class="status ${pref?.enabled?'active':'disabled'}">${pref?.enabled?'Enabled':'Off'}</span>`}</div></div>`;
    }).join('') || '<div class="empty">Onboard a business to use the review add-on.</div>';
    $$('[data-addon-toggle]').forEach(el => el.addEventListener('change', () => saveReviewPreference(el.dataset.addonToggle)));
    $$('[data-addon-language]').forEach(el => el.addEventListener('change', () => saveReviewPreference(el.dataset.addonLanguage)));
    renderReplyHistory();
  } catch (e) {
    if (currentPage !== 'reviews' || run !== reviewLoadRun) return;
    $('#addon-status').textContent = `Add-on could not load: ${e.message}`;
    $('#addon-businesses').innerHTML = '<div class="alert error">The add-on database must be available before settings can be changed. Retry after setup.</div>';
  }
}
async function saveReviewPreference(businessId) {
  if (!isAdmin()) return;
  const toggle = $(`[data-addon-toggle="${businessId}"]`);
  const language = $(`[data-addon-language="${businessId}"]`);
  const previous = reviewSettings.find(x => x.business_id === businessId);
  const enabled = toggle.checked; toggle.disabled = true; language.disabled = true;
  try {
    const { error } = await sb.from('business_review_settings').upsert({ business_id: businessId, enabled, default_language: language.value, updated_at: new Date().toISOString() }, { onConflict: 'business_id' });
    if (error) throw error;
    await logActivity(`${enabled ? 'Enabled' : 'Disabled'} review assistant`, 'businesses', businessId);
    toast('Review add-on saved. Existing QR cards use the selected mode.', 'success');
    await loadReviewAddon();
  } catch (e) { toggle.checked = previous?.enabled === true; language.value = previous?.default_language || 'English'; toast(e.message, 'error'); }
  finally { toggle.disabled = false; language.disabled = false; }
}
async function generateReviewReplies(event) {
  event.preventDefault();
  const btn = $('#reply-generate'); const results = $('#reply-results'); btn.disabled = true; btn.textContent = 'Preparing replies…'; results.replaceChildren();
  try {
    const { data: auth, error: authError } = await sb.auth.getSession(); if (authError) throw authError;
    const response = await fetch('/.netlify/functions/review-reply', {
      method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${auth.session?.access_token || ''}` },
      body: JSON.stringify({ businessId: $('#reply-business').value, rating: Number($('#reply-rating').value), language: $('#reply-language').value, text: $('#reply-text').value.trim() })
    });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not generate replies.');
    if (currentPage !== 'reviews') return;
    results.innerHTML = `<p class="tiny muted">${data.source==='ai'?'AI-generated reply drafts':'Basic English reply drafts · AI is not configured'} · Edit before posting on Google.</p>${data.drafts.map((draft, i)=>`<label class="field"><span>Reply option ${i+1}</span><textarea id="reply-result-${i}" maxlength="3000">${esc(draft)}</textarea><button class="mini-btn blue" type="button" data-copy-reply="${i}">Copy reply</button></label>`).join('')}`;
    $$('[data-copy-reply]').forEach(el => el.addEventListener('click', () => copyReply(el.dataset.copyReply)));
    await loadReviewAddon();
  } catch (e) { toast(e.message || 'Could not generate replies.', 'error'); }
  finally { btn.disabled = false; btn.textContent = '✦ Generate reply options'; }
}
async function copyReply(index) {
  const field = $(`#reply-result-${index}`);
  try { await navigator.clipboard.writeText(field.value); toast('Copied. Paste and publish from your Google Business Profile.', 'success'); }
  catch { field.focus(); field.select(); toast('Select and copy this reply manually.'); }
}
function renderReplyHistory() {
  $('#reply-history').innerHTML = replyHistory.map(row=>`<details class="addon-history"><summary><b>${esc(cache.businesses.find(b=>b.id===row.business_id)?.name || 'Business')}</b><span>${row.rating} stars · ${dt(row.created_at)} · ${esc(row.source)}</span></summary><p class="muted">${esc(row.review_text)}</p>${row.drafts.map(draft=>`<p>${esc(draft)}</p>`).join('')}</details>`).join('') || '<div class="empty">Your generated reply drafts will appear here.</div>';
}
