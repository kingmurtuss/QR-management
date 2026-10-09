import { copyAndContinue } from './review-handoff.mjs';
import { experienceChoices, validateExperience, basicExperienceReview } from './review-experience.mjs';
import { createReviewHistory } from './review-history.mjs';
const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const demo = params.get('demo') === '1';
const code = (params.get('code') || '').toUpperCase();
let draftStorage;
try { draftStorage = sessionStorage; } catch { /* Private browsers can block storage. */ }
const history = createReviewHistory(draftStorage, `qr-review-history-v1:${demo ? 'sample' : code}`);
let business = null, generated = null, busy = false;
const error = message => { $('#page-error').textContent = message; $('#page-error').hidden = !message; };
const ratingLabels = ['Disappointing', 'Could be better', 'Mixed', 'Good', 'Excellent'];
$('#rating-options').innerHTML = ratingLabels.map((label, i) => `<label class="star-choice"><input type="radio" name="rating" value="${i + 1}" aria-label="${i + 1} star${i ? 's' : ''}: ${label}"><span aria-hidden="true">★</span></label>`).join('');
$('#highlight-options').innerHTML = experienceChoices.map(choice => `<label class="highlight-choice"><input type="checkbox" value="${choice.id}" data-group="${choice.group}" aria-describedby="choice-hint"><span>${choice.label}</span></label>`).join('');
function selection() {
  return { rating: Number($('input[name="rating"]:checked')?.value), highlights: Array.from(document.querySelectorAll('#highlight-options input:checked'), item => item.value), language: $('#review-language').value };
}
function syncChoices() {
  const input = selection();
  for (const radio of document.querySelectorAll('input[name="rating"]')) radio.closest('label').classList.toggle('chosen', Number(radio.value) <= input.rating);
  $('#rating-caption').textContent = input.rating ? `${input.rating} / 5 · ${ratingLabels[input.rating - 1]}` : 'Choose your rating';
  const valid = Boolean(input.rating && input.highlights.length);
  $('#generate-btn').disabled = !business || busy || !valid;
  $('#selection-status').textContent = valid ? `${input.highlights.length} detail${input.highlights.length > 1 ? 's' : ''} selected · Ready to write your review` : 'Choose a rating and at least one detail to continue.';
  for (const checkbox of document.querySelectorAll('#highlight-options input')) {
    const replacingTopic = input.highlights.some(id => experienceChoices.find(choice => choice.id === id).group === checkbox.dataset.group);
    checkbox.disabled = busy || (!checkbox.checked && input.highlights.length >= 3 && !replacingTopic);
  }
  $('#experience-controls').disabled = busy;
  $('#highlight-controls').disabled = busy;
  $('#review-language').disabled = busy;
}
function changed() { generated = null; $('#generated-section').hidden = true; error(''); syncChoices(); }
$('#rating-options').addEventListener('change', changed);
$('#highlight-options').addEventListener('change', event => {
  if (event.target.checked) for (const other of document.querySelectorAll('#highlight-options input:checked')) {
    if (other !== event.target && other.dataset.group === event.target.dataset.group) other.checked = false;
  }
  changed();
});
$('#review-language').addEventListener('change', changed);
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
    $('#review-language').value = business.language; syncChoices();
    if (business.reviewUrl) { $('#direct-google').href = business.reviewUrl; $('#direct-google').hidden = false; }
  } catch (e) { $('#business-name').textContent = 'Generate your review'; error(e.message || 'This page is temporarily unavailable.'); }
}
async function generate() {
  if (!business || busy) return;
  let input;
  try { input = validateExperience(selection()); } catch (e) { error(e.message); return; }
  busy = true; error(''); $('#generate-btn').disabled = true; $('#generate-btn').textContent = 'Generating your review…'; $('#generated-section').hidden = true;
  syncChoices();
  try {
    const previousReviews = history.recent();
    const request = demo ? Promise.resolve({ review: basicExperienceReview(input, business.name, previousReviews), source: 'basic' }) : fetch('/.netlify/functions/review-generate', {
      method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, ...input, previousReviews })
    }).then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Could not generate a review.'); return data; });
    // Start clipboard permission in the tap event, including Safari's gesture requirement.
    const supportsPromiseClipboard = Boolean(navigator.clipboard?.write && window.ClipboardItem);
    let copyAttempt = null;
    try {
      if (supportsPromiseClipboard) copyAttempt = navigator.clipboard.write([new ClipboardItem({ 'text/plain': request.then(data => new Blob([data.review], { type: 'text/plain' })) })]).then(() => true, () => false);
    } catch { /* Some browsers expose this API without supporting promised data. */ }
    generated = await request;
    if (!generated.review || typeof generated.review !== 'string') throw new Error('The review could not be generated. Please try again.');
    history.record(generated.review);
    $('#generated-review').value = generated.review;
    const url = demo ? null : generated.reviewUrl || business.reviewUrl;
    let copied;
    if (copyAttempt) { copied = await copyAttempt; if (copied && url) location.assign(url); }
    else copied = await copyAndContinue({ review: generated.review, url, clipboard: navigator.clipboard, redirect: url => location.assign(url) });
    showResult(copied, url);
  } catch (e) { error(e.message || 'Could not generate the review. Please try again.'); }
  finally { busy = false; syncChoices(); $('#generate-btn').innerHTML = '<span aria-hidden="true">✦</span> Generate Review <span aria-hidden="true">→</span>'; }
}
function showResult(copied, url) {
  $('#generated-section').hidden = false; $('#step-three').classList.add('active');
  $('#generation-status').textContent = copied ? (demo ? 'Copied ✓ Tap Generate Review again for different wording. This preview uses varied basic drafts; the live flow opens Google after copying.' : `Copied ✓ ${generated.source === 'basic' ? 'Basic draft ready. ' : ''}Opening Google. Check your review, paste it, set your rating, and submit.`) : 'Your browser needs another tap to copy. Tap below to copy the review and open Google.';
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
