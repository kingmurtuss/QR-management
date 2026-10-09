import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInput, basicDrafts, safeReviewUrl, generateDrafts } from '../netlify/lib/review-assistant.mjs';
import generate from '../netlify/functions/review-generate.mjs';
import reply from '../netlify/functions/review-reply.mjs';
import redirect from '../netlify/functions/qr-redirect.mjs';
const env = { SUPABASE_URL: 'https://database.example', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' };
function mockEnv(t, name, value) {
  const old = process.env[name]; process.env[name] = value;
  t.after(() => { if (old === undefined) delete process.env[name]; else process.env[name] = old; });
}
function setup(t, handler) {
  t.mock.method(globalThis, 'fetch', handler);
  for (const [k,v] of Object.entries(env)) mockEnv(t, k, v);
  mockEnv(t, 'OPENAI_API_KEY', '');
}
const body = { code: 'QR00001', text: 'The food was cold and service was slow.', rating: 1, language: 'English' };
const req = (data, auth) => new Request('https://site.example/.netlify/functions/review-generate', { method: 'POST', headers: { 'content-type':'application/json', ...(auth ? { authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify(data) });
test('all honest ratings accepted; rating is never upgraded', () => {
  for (let rating = 1; rating <= 5; rating++) assert.equal(validateInput({ ...body, rating }).rating, rating);
  for (const rating of [0, 6, 2.5, 'wrong']) assert.throws(() => validateInput({ ...body, rating }));
  assert.throws(() => validateInput({ ...body, text: 'great' }));
});
test('basic fallback preserves criticism without inventing experience', () => {
  const drafts = basicDrafts(body, 'review');
  assert.equal(drafts.length, 3); assert.equal(drafts[0], body.text);
  assert.ok(drafts.every(x => x.includes(body.text)));
});
test('rejects script and data review destinations', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'invalid']) assert.throws(() => safeReviewUrl(url));
  assert.equal(safeReviewUrl('https://g.page/r/test/review'), 'https://g.page/r/test/review');
});
test('missing AI credentials returns explicitly identified basic drafts', async t => {
  mockEnv(t, 'OPENAI_API_KEY',''); const result = await generateDrafts(body, 'Restaurant');
  assert.equal(result.source,'basic'); assert.equal(result.drafts[0], body.text);
});
test('public generation rejects disabled QR assistant before model call', async t => {
  setup(t, async url => Response.json(String(url).includes('qr_codes?') ? [{ business_id: 'b1' }] : String(url).includes('businesses?') ? [{ id:'b1', name:'Business', google_review_url:'https://g.page/r/test/review' }] : [{enabled:false}]));
  assert.equal((await generate(req(body))).status,404);
});
test('enabled QR accepts a negative experience and returns safe basic output', async t => {
  setup(t, async url => Response.json(String(url).includes('qr_codes?') ? [{business_id:'b1'}] : String(url).includes('businesses?') ? [{id:'b1', name:'Business', google_review_url:'https://g.page/r/test/review'}] : [{enabled:true}]));
  const response = await generate(req(body)); assert.equal(response.status,200);
  const result = await response.json(); assert.equal(result.source,'basic'); assert.equal(result.drafts[0],body.text);
});
test('reply generation rejects unauthenticated access', async t => {
  setup(t, async () => { throw new Error('Must not touch database without authentication'); });
  assert.equal((await reply(req({...body, businessId:'00000000-0000-0000-0000-000000000001'}))).status,403);
});
test('reply rejects authenticated account with no business ownership', async t => {
  setup(t, async (url, options) => {
    assert.equal(options.headers.Authorization,'Bearer worker-token');
    if(String(url).includes('/auth/v1/user')) return Response.json({id:'worker'});
    return Response.json(String(url).includes('profiles?') ? [{id:'worker',active:true}] : []);
  });
  assert.equal((await reply(req({...body,businessId:'00000000-0000-0000-0000-000000000001'},'worker-token'))).status,403);
});
test('assigned worker reply saves only through their JWT', async t => {
  let saved = false;
  setup(t, async (url, options) => {
    assert.equal(options.headers.Authorization,'Bearer worker-token');
    if(String(url).includes('/auth/v1/user')) return Response.json({id:'worker'});
    if(String(url).includes('profiles?')) return Response.json([{id:'worker',active:true}]);
    if(String(url).includes('businesses?')) return Response.json([{id:'00000000-0000-0000-0000-000000000001',name:'Business'}]);
    assert.equal(options.method,'POST'); const row=JSON.parse(options.body); assert.equal(row.created_by,'worker'); assert.equal(row.rating,1); saved=true; return new Response(null,{status:204});
  });
  assert.equal((await reply(req({...body,businessId:'00000000-0000-0000-0000-000000000001'},'worker-token'))).status,200); assert.ok(saved);
});
test('existing printed QR switches to assistant while recording one scan', async t => {
  let scans=0;
  setup(t, async url => {
    if(String(url).includes('/rpc/resolve_qr_scan')) { scans++; return Response.json({review_url:'https://g.page/r/test/review'}); }
    if(String(url).includes('qr_codes?')) return Response.json([{business_id:'b1'}]);
    if(String(url).includes('businesses?')) return Response.json([{id:'b1',name:'Business',google_review_url:'https://g.page/r/test/review'}]);
    return Response.json([{enabled:true}]);
  });
  const response=await redirect(new Request('https://site.example/qr/QR00001'),{params:{code:'QR00001'}});
  assert.equal(response.status,302); assert.equal(response.headers.get('location'),'https://site.example/review.html?code=QR00001'); assert.equal(scans,1);
});
test('add-on lookup failure preserves existing direct Google redirect', async t => {
  setup(t, async url => String(url).includes('/rpc/resolve_qr_scan') ? Response.json({review_url:'https://g.page/r/test/review'}) : new Response(null,{status:500}));
  const response=await redirect(new Request('https://site.example/qr/QR00001'),{params:{code:'QR00001'}});
  assert.equal(response.status,302); assert.equal(response.headers.get('location'),'https://g.page/r/test/review');
});
test('oversized public requests are rejected', async () => {
  assert.equal((await generate(req({...body,text:'a'.repeat(8500)}))).status,400);
});
test('AI drafts use supplied facts, rating and language through server SDK', async t => {
  mockEnv(t,'OPENAI_API_KEY','test-server-key'); mockEnv(t,'OPENAI_BASE_URL','https://ai.example/v1');
  t.mock.method(globalThis,'fetch',async (url,options) => {
    assert.equal(String(url),'https://ai.example/v1/chat/completions');
    const payload=JSON.parse(options.body); assert.equal(payload.response_format.type,'json_object');
    const facts=JSON.parse(payload.messages[1].content); assert.equal(facts.rating,1); assert.equal(facts.experience,body.text);
    assert.match(payload.messages[0].content,/Hindi/); assert.ok(payload.max_tokens<=650);
    return Response.json({id:'test',object:'chat.completion',created:1,model:'gpt-4.1-mini',choices:[{index:0,message:{role:'assistant',content:JSON.stringify({drafts:['मेरा अनुभव अच्छा नहीं था।','सेवा धीमी थी।','खाना ठंडा था।']})},finish_reason:'stop'}]});
  });
  const result=await generateDrafts({...body,language:'Hindi'},'Business'); assert.equal(result.source,'ai'); assert.equal(result.language,'Hindi'); assert.equal(result.drafts.length,3);
});
