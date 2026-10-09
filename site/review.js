'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const params = new URLSearchParams(location.search);
  const demo = params.get('demo') === '1';
  const code = (params.get('code') || '').toUpperCase();
  let business = null, rating = 0, busy = false;
  const error = message => { $('#page-error').textContent = message; $('#page-error').hidden = !message; };
  const labels = ['', 'Disappointing', 'Could be better', 'Mixed experience', 'Good experience', 'Great experience'];
  for (let n = 1; n <= 5; n++) {
    const label = document.createElement('label'); label.className = 'star-choice';
    const input = document.createElement('input'); input.type = 'radio'; input.name = 'rating'; input.value = n; input.setAttribute('aria-label', `${n} star${n === 1 ? '' : 's'}`); input.required = true;
    const star = document.createElement('span'); star.textContent = '★'; star.setAttribute('aria-hidden', 'true'); label.append(input, star); $('#star-row').append(label);
    input.addEventListener('change', () => {
      rating = n; $('#rating-caption').textContent = `${n} / 5 · ${labels[n]}`;
      document.querySelectorAll('.star-choice').forEach((x, i) => x.classList.toggle('chosen', i < n));
    });
  }
  $('#experience').addEventListener('input', () => { $('#char-count').textContent = `${$('#experience').value.length} / 1500`; });
  async function boot() {
    try {
      if (demo) { business = { name: 'The Garden Table', language: 'English' }; $('#demo-banner').hidden = false; }
      else {
        if (!/^QR\d{5,}$/.test(code)) throw new Error('Open this page by scanning an enabled business QR card.');
        const res = await fetch(`/.netlify/functions/review-business?code=${encodeURIComponent(code)}`, { cache: 'no-store' });
        business = await res.json(); if (!res.ok) throw new Error(business.error);
      }
      $('#business-name').textContent = business.name; $('#business-mark').textContent = business.name.split(/\s+/).slice(0,2).map(x => x[0]).join('').toUpperCase();
      document.title = `Share your experience · ${business.name}`;
      $('#review-language').value = business.language; $('#generate-btn').disabled = false;
      if (business.reviewUrl) for (const id of ['#direct-google', '#post-google']) { $(id).href = business.reviewUrl; $(id).hidden = id === '#post-google'; }
    } catch (e) { $('#business-name').textContent = 'Share your experience'; error(e.message || 'This page is temporarily unavailable.'); }
  }
  $('#experience-form').addEventListener('submit', async event => {
    event.preventDefault(); if (!business || busy || !rating) return;
    busy = true; error(''); $('#generate-btn').disabled = true; $('#generate-btn').textContent = 'Preparing your suggestions…';
    try {
      const text = $('#experience').value.trim(); let result;
      if (text.length < 10) throw new Error('Write at least 10 characters about your visit.');
      if (demo) result = { source: 'basic', drafts: [text, `My experience: ${text}`, `Feedback from my visit: ${text}`] };
      else {
        const res = await fetch('/.netlify/functions/review-generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, rating, text, language: $('#review-language').value }) });
        result = await res.json(); if (!res.ok) throw new Error(result.error);
      }
      $('#draft-source').textContent = result.source === 'ai' ? 'Three AI suggestions based on your notes. Pick one, then edit it.' : 'Basic suggestions using your own words. AI is not active for this preview or deployment.';
      $('#draft-options').replaceChildren();
      result.drafts.forEach((draft, i) => {
        const label = document.createElement('label'); label.className = 'draft-option';
        const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'draft'; radio.value = i; radio.checked = i === 0;
        const title = document.createElement('b'); title.textContent = `Option ${i + 1}`;
        const p = document.createElement('p'); p.textContent = draft; label.append(radio, title, p); $('#draft-options').append(label);
        radio.addEventListener('change', () => { $('#final-review').value = draft; clearCopy(); });
      });
      $('#final-review').value = result.drafts[0]; clearCopy();
      $('#experience-form').hidden = true; $('#draft-section').hidden = false; $('#step-two').classList.add('active');
    } catch (e) { error(e.message || 'Could not prepare suggestions. Please try again.'); }
    finally { busy = false; $('#generate-btn').disabled = false; $('#generate-btn').innerHTML = '<span aria-hidden="true">✦</span> Help me write my review <span aria-hidden="true">→</span>'; }
  });
  function clearCopy() { $('#copy-status').textContent = ''; $('#post-google').hidden = true; $('#post-note').hidden = true; $('#copy-btn').textContent = 'Copy my review ↗'; }
  $('#final-review').addEventListener('input', clearCopy);
  $('#back-btn').addEventListener('click', () => { $('#experience-form').hidden = false; $('#draft-section').hidden = true; $('#step-two').classList.remove('active'); error(''); });
  $('#copy-btn').addEventListener('click', async () => {
    const text = $('#final-review').value.trim(); if (!text) return error('Write a review before copying.');
    try { await navigator.clipboard.writeText(text); $('#copy-btn').textContent = 'Copied ✓'; $('#copy-status').textContent = demo ? 'Copied. This sample preview does not post to a real business.' : 'Copied. Open Google below and paste your review.'; }
    catch { $('#final-review').focus(); $('#final-review').select(); $('#copy-status').textContent = 'Clipboard access is unavailable. Select and copy the text above, then open Google.'; }
    if (business.reviewUrl) { $('#post-google').hidden = false; $('#post-note').hidden = false; }
    $('#step-three').classList.add('active');
  });
  boot();
})();
