import { copyAndContinue } from './review-handoff.mjs';
const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const demo = params.get('demo') === '1';
const code = (params.get('code') || '').toUpperCase();
let business = null, generated = null, busy = false;
const error = message => { $('#page-error').textContent = message; $('#page-error').hidden = !message; };
async function boot() {
  try {
    if (demo) { business = { name: 'The Garden Table', language: 'English' }; $('#demo-banner').hidden = false; }
    else {
      if (!/^QR\d{5,}$/.test(code)) throw new Error('Scan a business QR card with the review add-on activated.');
      const res = await fetch(`/.netlify/functions/review-business?code=${encodeURIComponent(code)}`, { cache: 'no-store' });
      business = await res.json(); if (!res.ok) throw new Error(business.error);
    }
    $('#business-name').textContent = business.name;
    $('#business-mark').textContent = business.name.split(/\s+/).slice(0,2).map(x => x[0]).join('').toUpperCase();
    document.title = `Generate your review · ${business.name}`;
    $('#review-language').value = business.language; $('#generate-btn').disabled = false;
    if (business.reviewUrl) { $('#direct-google').href = business.reviewUrl; $('#direct-google').hidden = false; }
  } catch (e) { $('#business-name').textContent = 'Generate your review'; error(e.message || 'This page is temporarily unavailable.'); }
}
async function generate() {
  if (!business || busy) return;
  busy = true; error(''); $('#generate-btn').disabled = true; $('#generate-btn').textContent = 'Generating your review…'; $('#generated-section').hidden = true;
  try {
    const request = demo ? Promise.resolve({ review: `Sharing my feedback about ${business.name}. Thank you for the opportunity to leave a review.`, source: 'basic' }) : fetch('/.netlify/functions/review-generate', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, language: $('#review-language').value })
    }).then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Could not generate a review.'); return data; });
    // Start clipboard permission in the tap event, including Safari's gesture requirement.
    const supportsPromiseClipboard = Boolean(navigator.clipboard?.write && window.ClipboardItem);
    let copyAttempt = null;
    try {
      if (supportsPromiseClipboard) copyAttempt = navigator.clipboard.write([new ClipboardItem({ 'text/plain': request.then(data => new Blob([data.review], { type: 'text/plain' })) })]).then(() => true, () => false);
    } catch { /* Some browsers expose this API without supporting promised data. */ }
    generated = await request;
    if (!generated.review || typeof generated.review !== 'string') throw new Error('The review could not be generated. Please try again.');
    $('#generated-review').value = generated.review;
    const url = demo ? null : generated.reviewUrl || business.reviewUrl;
    let copied;
    if (copyAttempt) { copied = await copyAttempt; if (copied && url) location.assign(url); }
    else copied = await copyAndContinue({ review: generated.review, url, clipboard: navigator.clipboard, redirect: url => location.assign(url) });
    showResult(copied, url);
  } catch (e) { error(e.message || 'Could not generate the review. Please try again.'); }
  finally { busy = false; $('#generate-btn').disabled = false; $('#generate-btn').innerHTML = '<span aria-hidden="true">✦</span> Generate Review <span aria-hidden="true">→</span>'; }
}
function showResult(copied, url) {
  $('#generated-section').hidden = false; $('#step-three').classList.add('active');
  $('#generation-status').textContent = copied ? (demo ? 'Copied ✓ In the live flow, you are redirected to this business’s Google Review page now. This preview uses a sample starter.' : 'Copied ✓ Opening Google. Paste the review and submit.') : 'Your browser needs another tap to copy. Tap below to copy the review and open Google.';
  $('#copy-continue').textContent = demo ? 'Copy sample again' : 'Copy & open Google →';
  $('#manual-google').hidden = !url || copied;
  if (url) $('#manual-google').href = url;
}
$('#generate-btn').addEventListener('click', generate);
$('#copy-continue').addEventListener('click', async () => {
  if (!generated?.review) return;
  const url = demo ? null : generated.reviewUrl || business.reviewUrl;
  const copied = await copyAndContinue({ review: generated.review, url, clipboard: navigator.clipboard, redirect: target => location.assign(target) });
  showResult(copied, url);
  if (!copied) { $('#generated-review').focus(); $('#generated-review').select(); $('#generation-status').textContent = 'Copy the selected text manually, then open Google below.'; }
});
boot();
