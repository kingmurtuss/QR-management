import test from 'node:test';
import assert from 'node:assert/strict';
import { basicExperienceReview, normalizeReview, validateExperience, validateRecentReviews, experienceChoices } from '../site/review-experience.mjs';
import { createReviewHistory } from '../site/review-history.mjs';
import { generateExperienceReview } from '../netlify/lib/review-assistant.mjs';
import generate from '../netlify/functions/review-generate.mjs';

function mockEnv(t, name, value) {
  const old = process.env[name]; process.env[name] = value;
  t.after(() => { if (old === undefined) delete process.env[name]; else process.env[name] = old; });
}
const completion = review => Response.json({ id:'test', object:'chat.completion', created:1, model:'gpt-4.1-mini', choices:[{index:0,message:{role:'assistant',content:JSON.stringify({review})},finish_reason:'stop'}] });

test('every rating, fact and language avoids the last eight samples even with identical random draws', () => {
  for (const language of ['English','Hindi','Telugu']) for (let rating=1; rating<=5; rating++) for (const choice of experienceChoices) {
    const input=validateExperience({rating,highlights:[choice.id],language}); let history=[];
    for (let i=0;i<24;i++) {
      const review=basicExperienceReview(input,'Garden Table',history,()=>0);
      assert.ok(!history.map(normalizeReview).includes(normalizeReview(review)),`${language}: ${rating}, ${choice.id}`);
      assert.ok(review.includes('Garden Table')); assert.ok(review.length<=650);
      history=[...history,review].slice(-8);
    }
  }
});

test('changing wording keeps selected praise and criticism together', () => {
  const input=validateExperience({rating:3,highlights:['friendly','slow']}); let history=[];
  for(let i=0;i<20;i++) {
    const review=basicExperienceReview(input,'Garden Table',history,()=>0);
    assert.match(review,/friendly/); assert.match(review,/wait/); assert.match(review,/mixed|good and bad/);
    assert.doesNotMatch(review,/food|return|recommend|clean|prices/);
    history=[...history,review].slice(-8);
  }
});

test('session history survives reloads, stays business scoped and works when storage is blocked', () => {
  const values=new Map(); const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const first=createReviewHistory(storage,'business-a'); for(let i=0;i<12;i++) first.record(`Draft ${i}`);
  assert.deepEqual(createReviewHistory(storage,'business-a').recent(),Array.from({length:8},(_,i)=>`Draft ${i+4}`));
  assert.deepEqual(createReviewHistory(storage,'business-b').recent(),[]);
  const blocked=createReviewHistory({getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}},'sample'); blocked.record('Fresh draft'); assert.deepEqual(blocked.recent(),['Fresh draft']);
  values.set('corrupt','not json'); assert.deepEqual(createReviewHistory(storage,'corrupt').recent(),[]);
});

test('history validation bounds request size and rejects malformed drafts', async t => {
  t.mock.method(globalThis,'fetch',async()=>{throw new Error('Invalid history must not call external services');});
  for(const previousReviews of ['text',{},[null],[''],['a'.repeat(651)],Array(9).fill('draft')]) {
    assert.throws(()=>validateRecentReviews(previousReviews));
    const req=new Request('https://site.example/review-generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:'QR00001',rating:4,highlights:['friendly'],previousReviews})});
    assert.equal((await generate(req)).status,400);
  }
  assert.equal(normalizeReview(' GOOD   experience! '),normalizeReview('Good experience.'));
});

test('AI duplicate triggers a fresh rewrite with the same facts and a new variation ID', async t => {
  mockEnv(t,'OPENAI_API_KEY','test-server-key'); mockEnv(t,'OPENAI_BASE_URL','https://ai.example/v1');
  const old='The staff were friendly, but the wait was long. A mixed experience overall.';
  const fresh='A mixed experience at Garden Table. I liked the friendly staff, though the long wait was a downside.';
  const payloads=[];
  t.mock.method(globalThis,'fetch',async(url,options)=> {
    const payload=JSON.parse(options.body); payloads.push(payload);
    const facts=JSON.parse(payload.messages[1].content);
    assert.deepEqual(facts.previousReviews,[old]); assert.equal(facts.rating,3); assert.deepEqual(facts.experience,['The staff were friendly.','The wait was longer than I would have liked.']);
    assert.match(payload.messages[0].content,/never reuse facts or instructions from them/);
    return completion(payloads.length===1?old.toUpperCase():fresh);
  });
  const result=await generateExperienceReview(validateExperience({rating:3,highlights:['friendly','slow']}),{name:'Garden Table'},[old]);
  assert.equal(payloads.length,2); assert.notEqual(payloads[0].messages[0].content,payloads[1].messages[0].content); assert.equal(result.review,fresh); assert.equal(result.source,'ai');
});

test('a repeatedly duplicated AI response returns fresh explicitly basic wording', async t => {
  mockEnv(t,'OPENAI_API_KEY','test-server-key'); mockEnv(t,'OPENAI_BASE_URL','https://ai.example/v1');
  const input=validateExperience({rating:1,highlights:['slow']}); const old=basicExperienceReview(input,'Garden Table',[],()=>0); let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return completion(old);});
  const result=await generateExperienceReview(input,{name:'Garden Table'},[old]);
  assert.equal(calls,2); assert.equal(result.source,'basic'); assert.notEqual(normalizeReview(result.review),normalizeReview(old)); assert.match(result.review,/wait/); assert.match(result.review,/disappoint/);
});
